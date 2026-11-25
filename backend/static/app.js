const $ = (selector) => document.querySelector(selector);

let ttsSocket = null;
let liveSocket = null;
let micStream = null;
let micContext = null;
let micSource = null;
let micProcessor = null;
let micMute = null;

let loudFrames = 0;
let lastInterruptAt = 0;
let interruptLevel = 0.033;
let speakerBleedEma = 0.0;

let currentMicLevel = 0.0;
let smoothedLevel = 0.0;
let currentState = "idle"; // "idle" | "listening" | "user_speaking" | "thinking" | "speaking" | "interrupted"
let currentAssistantBubble = null;
let stateChangeTime = Date.now();

// -------------------------------------------------------------
// PCM Player with Jitter Pre-Buffering (Lag & Stutter Eliminator)
// -------------------------------------------------------------
class PCMPlayer {
  constructor(sampleRate = 24000, bufferChunks = 3) {
    this.sampleRate = sampleRate;
    this.bufferChunks = bufferChunks; // Accumulate 3 chunks (~240ms) before starting
    this.context = null;
    this.nextTime = 0;
    this.sources = new Set();
    this.pendingBuffers = [];
    this.isBuffering = true;
    this.onPlaybackEnded = null;
  }

  async ensure() {
    if (!this.context || this.context.state === "closed") {
      this.context = new AudioContext({ sampleRate: this.sampleRate });
      this.nextTime = 0;
    }
    if (this.context.state === "suspended") {
      await this.context.resume();
    }
  }

  resetStream() {
    this.pendingBuffers = [];
    this.isBuffering = true;
    this.nextTime = 0;
  }

  async enqueue(arrayBuffer) {
    await this.ensure();
    const int16 = new Int16Array(arrayBuffer);
    if (!int16.length) return;

    const buffer = this.context.createBuffer(1, int16.length, this.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < int16.length; i += 1) {
      channel[i] = int16[i] / 32768;
    }

    if (this.isBuffering) {
      this.pendingBuffers.push(buffer);
      // Once we have buffered enough chunks (~240ms of audio), schedule all smoothly
      if (this.pendingBuffers.length >= this.bufferChunks) {
        this.flushPendingBuffers();
      }
    } else {
      this.scheduleBuffer(buffer);
    }
  }

  flushPendingBuffers() {
    if (!this.context || this.pendingBuffers.length === 0) return;
    this.isBuffering = false;

    let startTime = Math.max(this.nextTime, this.context.currentTime + 0.05);

    while (this.pendingBuffers.length > 0) {
      const buffer = this.pendingBuffers.shift();
      this.playBufferAt(buffer, startTime);
      startTime += buffer.duration;
    }
    this.nextTime = startTime;
  }

  scheduleBuffer(buffer) {
    if (!this.context) return;
    const now = this.context.currentTime;

    // Handle underrun if nextTime fell behind
    let startTime = this.nextTime;
    if (startTime < now + 0.01) {
      startTime = now + 0.03;
    }

    this.playBufferAt(buffer, startTime);
    this.nextTime = startTime + buffer.duration;
  }

  playBufferAt(buffer, startTime) {
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);

    source.addEventListener("ended", () => {
      this.sources.delete(source);
      if (this.sources.size === 0 && this.pendingBuffers.length === 0 && this.onPlaybackEnded) {
        this.onPlaybackEnded();
      }
    });

    this.sources.add(source);
    source.start(startTime);
  }

  flushAndFinish() {
    if (this.isBuffering && this.pendingBuffers.length > 0) {
      this.flushPendingBuffers();
    }
  }

  stop() {
    this.pendingBuffers = [];
    this.isBuffering = true;
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    }
    this.sources.clear();
    if (this.context) {
      this.nextTime = 0;
    }
  }

  isPlaying() {
    return this.sources.size > 0 || this.pendingBuffers.length > 0;
  }
}

const player = new PCMPlayer(24000, 3);
player.onPlaybackEnded = () => {
  if (liveSocket && liveSocket.readyState === WebSocket.OPEN) {
    if (currentState === "speaking") {
      setState("listening");
      finalizeAssistantMessage();
      updateCaption("Listening: speak a sentence and pause naturally...");
    }
  }
};

// -------------------------------------------------------------
// UI State Management & Badges
// -------------------------------------------------------------
const STATE_CONFIG = {
  idle: {
    label: "IDLE",
    className: "tag-idle",
    caption: 'Click <strong>Start Live Session</strong> to begin real-time voice conversation.',
  },
  listening: {
    label: "LISTENING",
    className: "tag-listening",
    caption: 'Listening for speech... (speak a sentence and pause naturally)',
  },
  user_speaking: {
    label: "HEARING YOU",
    className: "tag-user_speaking",
    caption: 'Hearing your voice... pause when you finish speaking.',
  },
  thinking: {
    label: "THINKING",
    className: "tag-thinking",
    caption: 'Aria is formulating response...',
  },
  speaking: {
    label: "ARIA SPEAKING",
    className: "tag-speaking",
    caption: 'Aria is speaking. <em>Speak anytime to interrupt!</em>',
  },
  interrupted: {
    label: "INTERRUPTED",
    className: "tag-interrupted",
    caption: 'Interrupted! Listening to your new input...',
  },
};

function setState(newState) {
  if (currentState === newState && Date.now() - stateChangeTime < 100) return;
  currentState = newState;
  stateChangeTime = Date.now();

  const badge = $("#liveStateBadge");
  const label = $("#liveStateLabel");
  if (badge && label) {
    const config = STATE_CONFIG[newState] || STATE_CONFIG.idle;
    badge.className = `live-tag ${config.className}`;
    label.textContent = config.label;
  }
}

function updateCaption(html) {
  const cap = $("#recordStatus");
  if (cap) cap.innerHTML = html;
}

// -------------------------------------------------------------
// Conversation History Feed
// -------------------------------------------------------------
function addMessage(role, content, meta = "") {
  const empty = $("#chatEmpty");
  if (empty) empty.style.display = "none";

  const feed = $("#chatFeed");
  if (!feed) return null;

  const bubble = document.createElement("div");
  bubble.className = `chat-bubble bubble-${role}`;

  const avatar = document.createElement("div");
  avatar.className = "chat-bubble-avatar";
  avatar.textContent = role === "user" ? "👤" : "✨";

  const body = document.createElement("div");
  body.className = "chat-bubble-content";

  const textEl = document.createElement("div");
  textEl.className = "bubble-text";
  textEl.innerHTML = content;

  const metaEl = document.createElement("div");
  metaEl.className = "bubble-meta";
  metaEl.textContent = meta || (role === "user" ? "You" : "Aria");

  body.appendChild(textEl);
  body.appendChild(metaEl);
  bubble.appendChild(avatar);
  bubble.appendChild(body);
  feed.appendChild(bubble);

  feed.scrollTop = feed.scrollHeight;
  return bubble;
}

function startAssistantMessage() {
  currentAssistantBubble = addMessage("assistant", 'Thinking<span class="cursor-blink"></span>', "Aria (Live)");
}

function updateAssistantMessage(text) {
  if (!currentAssistantBubble) {
    startAssistantMessage();
  }
  const textEl = currentAssistantBubble.querySelector(".bubble-text");
  if (textEl) {
    textEl.innerHTML = escapeHtml(text) + '<span class="cursor-blink"></span>';
  }
  const feed = $("#chatFeed");
  if (feed) feed.scrollTop = feed.scrollHeight;
}

function finalizeAssistantMessage() {
  if (currentAssistantBubble) {
    const cursor = currentAssistantBubble.querySelector(".cursor-blink");
    if (cursor) cursor.remove();
    currentAssistantBubble = null;
  }
}

function clearChat() {
  const feed = $("#chatFeed");
  if (feed) {
    feed.innerHTML = `
      <div class="chat-empty" id="chatEmpty">
        <div class="chat-empty-icon">💬</div>
        <p>No messages yet. Start live mode and speak to start chatting with Aria.</p>
      </div>
    `;
  }
  currentAssistantBubble = null;
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// -------------------------------------------------------------
// Canvas Audio Visualizer (60 FPS Smooth Rendering)
// -------------------------------------------------------------
const canvas = $("#visualizerCanvas");
const ctx = canvas ? canvas.getContext("2d") : null;
let animFrameId = null;
let visualizerPhase = 0;

function renderVisualizer() {
  if (!ctx || !canvas) return;

  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  smoothedLevel += (currentMicLevel - smoothedLevel) * 0.25;
  visualizerPhase += 0.05;

  const centerY = height / 2;
  const centerX = width / 2;

  if (currentState === "idle") {
    // Subtle dim wave line
    ctx.strokeStyle = "rgba(100, 116, 139, 0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x < width; x += 4) {
      const y = centerY + Math.sin(x * 0.02 + visualizerPhase * 0.5) * 4;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  } else if (currentState === "listening") {
    // Calm breathing pulse wave
    const breath = 0.5 + 0.5 * Math.sin(visualizerPhase * 1.5);
    const grad = ctx.createLinearGradient(0, 0, width, 0);
    grad.addColorStop(0, "rgba(56, 189, 248, 0.1)");
    grad.addColorStop(0.5, "rgba(56, 189, 248, 0.8)");
    grad.addColorStop(1, "rgba(56, 189, 248, 0.1)");

    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let x = 0; x < width; x += 3) {
      const distFromCenter = Math.abs(x - centerX) / (width / 2);
      const envelope = Math.max(0, 1 - distFromCenter);
      const y = centerY + Math.sin(x * 0.03 + visualizerPhase * 2) * (8 + breath * 6) * envelope;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Subtle center glow ring
    ctx.beginPath();
    ctx.arc(centerX, centerY, 12 + breath * 8, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(56, 189, 248, 0.12)";
    ctx.fill();
  } else if (currentState === "user_speaking") {
    // Vibrant reactive multi-bar equalizer in emerald / cyan
    const numBars = 36;
    const barWidth = 8;
    const spacing = (width - numBars * barWidth) / (numBars + 1);
    const intensity = Math.min(1.0, smoothedLevel * 12);

    for (let i = 0; i < numBars; i++) {
      const x = spacing + i * (barWidth + spacing);
      const waveMod = Math.sin(i * 0.35 + visualizerPhase * 3);
      const barHeight = Math.max(6, (intensity * 60 + waveMod * 15 * intensity + Math.random() * 8 * intensity));
      const y = centerY - barHeight / 2;

      const grad = ctx.createLinearGradient(0, y, 0, y + barHeight);
      grad.addColorStop(0, "#38bdf8");
      grad.addColorStop(0.5, "#34d399");
      grad.addColorStop(1, "#10b981");

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, 4);
      ctx.fill();
    }
  } else if (currentState === "thinking") {
    // Luminous orbital revolving particles in golden amber
    const ringRadius = 38;
    const numDots = 8;

    for (let i = 0; i < numDots; i++) {
      const angle = (i / numDots) * Math.PI * 2 + visualizerPhase * 2.5;
      const dotX = centerX + Math.cos(angle) * ringRadius;
      const dotY = centerY + Math.sin(angle) * (ringRadius * 0.65);
      const dotSize = 4 + 3 * Math.sin(angle + visualizerPhase);

      ctx.beginPath();
      ctx.arc(dotX, dotY, Math.max(2, dotSize), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(251, 191, 36, ${0.4 + 0.6 * (i / numDots)})`;
      ctx.shadowColor = "#fbbf24";
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  } else if (currentState === "speaking") {
    // Electric blue / purple harmonic fluid audio waves
    const layers = 3;
    for (let l = 0; l < layers; l++) {
      ctx.beginPath();
      const speed = (l + 1) * 2;
      const amp = 14 + l * 8 + Math.sin(visualizerPhase * 2) * 6;
      const alpha = 0.35 + l * 0.25;

      const grad = ctx.createLinearGradient(0, 0, width, 0);
      grad.addColorStop(0, "rgba(56, 189, 248, 0)");
      grad.addColorStop(0.5, `rgba(56, 189, 248, ${alpha})`);
      grad.addColorStop(1, "rgba(129, 140, 248, 0)");

      ctx.strokeStyle = grad;
      ctx.lineWidth = 3 - l * 0.6;

      for (let x = 0; x < width; x += 3) {
        const env = Math.sin((x / width) * Math.PI);
        const y = centerY + Math.sin(x * 0.025 * (l + 1) + visualizerPhase * speed) * amp * env;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  } else if (currentState === "interrupted") {
    // Dynamic coral flash
    ctx.fillStyle = "rgba(251, 113, 133, 0.08)";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "#fb7185";
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = 0; x < width; x += 4) {
      const y = centerY + (Math.random() - 0.5) * 30;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  animFrameId = requestAnimationFrame(renderVisualizer);
}

function startVisualizer() {
  if (!animFrameId) {
    animFrameId = requestAnimationFrame(renderVisualizer);
  }
}

// -------------------------------------------------------------
// Calibration and Sliders
// -------------------------------------------------------------
function bindRange(rangeSelector, valueSelector, suffix = "") {
  const range = $(rangeSelector);
  const value = $(valueSelector);
  if (!range || !value) return;
  const update = () => {
    value.textContent = range.value + suffix;
  };
  range.addEventListener("input", update);
  update();
}

function getVadThreshold() {
  const mic = Number($("#micSense").value || 60);
  return 0.003 + 0.04 * (1 - mic / 100);
}

function getInterruptLevel() {
  const intr = Number($("#intSense").value || 50);
  return 0.008 + 0.05 * (1 - intr / 100);
}

function isSpeakerEchoShieldEnabled() {
  const mode = $("#audioMode");
  return !mode || mode.value === "speakers";
}

function updateCalibReadout() {
  const vad = getVadThreshold();
  const intr = getInterruptLevel();
  const pause = Number($("#pauseMs").value || 800);
  interruptLevel = intr;
  const readout = $("#calibReadout");
  if (readout) {
    readout.textContent = `VAD thr ${vad.toFixed(4)} | Interrupt ${intr.toFixed(4)} | Pause ${pause}ms`;
  }
}

function sendLiveConfig() {
  updateCalibReadout();
  if (liveSocket && liveSocket.readyState === WebSocket.OPEN) {
    liveSocket.send(JSON.stringify({
      type: "config",
      sample_rate: micContext ? micContext.sampleRate : 48000,
      prompt: $("#chatPrompt").value,
      max_tokens: Number($("#chatTokens").value),
      audio_temperature: Number($("#chatTemp").value),
      audio_top_k: Number($("#chatTopK").value),
      voice: $("#chatVoice").value,
      vad_threshold: getVadThreshold(),
      pause_ms: Number($("#pauseMs").value),
      min_utterance_ms: 400,
    }));
  }
}

function bindCalib() {
  bindRange("#micSense", "#micSenseValue");
  bindRange("#intSense", "#intSenseValue");
  bindRange("#pauseMs", "#pauseMsValue", " ms");
  bindRange("#chatTokens", "#chatTokensValue");
  bindRange("#chatTemp", "#chatTempValue");
  bindRange("#ttsTokens", "#ttsTokensValue");
  bindRange("#ttsTemp", "#ttsTempValue");
  bindRange("#cloneTokens", "#cloneTokensValue");
  bindRange("#cloneTemp", "#cloneTempValue");

  ["#micSense", "#intSense", "#pauseMs"].forEach((s) => {
    const el = $(s);
    if (el) {
      el.addEventListener("input", () => {
        updateCalibReadout();
        sendLiveConfig();
      });
    }
  });

  const audioModeEl = $("#audioMode");
  if (audioModeEl) {
    audioModeEl.addEventListener("change", updateCalibReadout);
  }

  ["#chatTokens", "#chatTemp", "#chatTopK", "#chatVoice", "#chatPrompt"].forEach((s) => {
    const el = $(s);
    if (el) {
      el.addEventListener("input", sendLiveConfig);
      el.addEventListener("change", sendLiveConfig);
    }
  });
  updateCalibReadout();
}

// -------------------------------------------------------------
// Model Status Polling
// -------------------------------------------------------------
function setStatus(label = "Ready", isOnline = true) {
  const statusEl = $("#modelStatus");
  if (!statusEl) return;
  const textEl = statusEl.querySelector(".status-text");
  const indicator = statusEl.querySelector(".status-indicator");
  if (textEl) textEl.textContent = label;
  if (indicator) {
    indicator.style.background = isOnline ? "var(--success)" : "var(--danger)";
    indicator.style.boxShadow = isOnline ? "0 0 8px var(--success)" : "0 0 8px var(--danger)";
  }
}

async function pollModelStatus() {
  try {
    const response = await fetch("/api/status", { cache: "no-store" });
    const status = await response.json();
    if (!ttsSocket && !liveSocket) {
      if (status.state === "ready") setStatus(`Ready (${status.device})`, true);
      else if (status.state === "warming") setStatus("Loading...", true);
      else if (status.state === "error") setStatus("Model error", false);
      else setStatus("Cold", false);
    }
  } catch {
    if (!ttsSocket && !liveSocket) setStatus("Offline", false);
  }
}

// -------------------------------------------------------------
// Tab Switching
// -------------------------------------------------------------
function switchTab(targetId) {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.panel === targetId);
  });
  document.querySelectorAll(".workspace").forEach((panel) => {
    panel.classList.toggle("active", panel.id === targetId);
  });
}

function socketUrl(path) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${path}`;
}

// -------------------------------------------------------------
// Text to Speech
// -------------------------------------------------------------
function stopTTS() {
  if (ttsSocket && ttsSocket.readyState === WebSocket.OPEN) {
    ttsSocket.send(JSON.stringify({ type: "stop" }));
    ttsSocket.close();
  }
  ttsSocket = null;
  player.stop();
  $("#speakBtn").disabled = false;
  $("#stopSpeakBtn").disabled = true;
  setStatus();
}

async function speak() {
  stopTTS();
  await player.ensure();
  player.resetStream();

  ttsSocket = new WebSocket(socketUrl("/ws/tts"));
  ttsSocket.binaryType = "arraybuffer";
  $("#ttsStatus").textContent = "Connecting...";
  $("#speakBtn").disabled = true;
  $("#stopSpeakBtn").disabled = false;
  setStatus("Speaking");

  ttsSocket.addEventListener("open", () => {
    $("#ttsStatus").textContent = "Streaming speech tokens...";
    ttsSocket.send(JSON.stringify({
      text: $("#ttsText").value,
      voice: $("#voice").value,
      max_tokens: Number($("#ttsTokens").value),
      audio_temperature: Number($("#ttsTemp").value),
      audio_top_k: Number($("#ttsTopK").value),
    }));
  });

  ttsSocket.addEventListener("message", async (event) => {
    if (typeof event.data === "string") {
      const payload = JSON.parse(event.data);
      if (payload.type === "status") $("#ttsStatus").textContent = payload.message;
      if (payload.type === "done") {
        player.flushAndFinish();
      }
      return;
    }
    $("#ttsStatus").textContent = "Playing synthesized audio.";
    await player.enqueue(event.data);
  });

  ttsSocket.addEventListener("close", () => {
    $("#speakBtn").disabled = false;
    $("#stopSpeakBtn").disabled = true;
    setStatus();
  });

  ttsSocket.addEventListener("error", () => {
    $("#ttsStatus").textContent = "Streaming failed.";
    stopTTS();
  });
}

// -------------------------------------------------------------
// Live Speech-to-Speech (Pure Liquid AI LFM)
// -------------------------------------------------------------
function rmsOf(float32) {
  let sum = 0;
  for (let i = 0; i < float32.length; i += 1) {
    sum += float32[i] * float32[i];
  }
  return Math.sqrt(sum / Math.max(1, float32.length));
}

async function startLive() {
  if (liveSocket) return;
  await player.ensure();
  player.resetStream();

  micStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  micContext = new AudioContext();
  micSource = micContext.createMediaStreamSource(micStream);
  micProcessor = micContext.createScriptProcessor(4096, 1, 1);
  micMute = micContext.createGain();
  micMute.gain.value = 0;
  micSource.connect(micProcessor);
  micProcessor.connect(micMute);
  micMute.connect(micContext.destination);

  liveSocket = new WebSocket(socketUrl("/ws/live"));
  liveSocket.binaryType = "arraybuffer";

  liveSocket.addEventListener("open", () => {
    const sr = micContext ? micContext.sampleRate : 48000;
    const stats = $("#liveStats");
    if (stats) stats.textContent = `Mic ${(sr / 1000).toFixed(0)}kHz`;

    interruptLevel = getInterruptLevel();
    sendLiveConfig();
    setState("listening");
    updateCaption("Listening: speak a sentence and pause naturally...");

    $("#liveBtn").disabled = true;
    $("#stopLiveBtn").disabled = false;
    setStatus("Live Active");
  });

  let lastUserBubble = null;

  liveSocket.addEventListener("message", async (event) => {
    if (typeof event.data === "string") {
      const payload = JSON.parse(event.data);

      if (payload.type === "state") {
        setState(payload.state);
        if (payload.state === "thinking") {
          player.resetStream();
          const durationStr = payload.duration ? ` (${payload.duration}s)` : "";
          lastUserBubble = addMessage("user", `🎙️ Voice input${durationStr}`, "You");
          startAssistantMessage();
          updateCaption(`Heard your voice${durationStr}. Aria is formulating response...`);
        } else if (payload.state === "speaking") {
          updateCaption("Aria is responding. <em>Speak anytime to interrupt!</em>");
        } else if (payload.state === "interrupted") {
          player.stop();
          updateCaption("Interrupted! Listening to your new input...");
        } else if (payload.state === "listening") {
          updateCaption("Listening for speech... (speak a sentence and pause)");
        }
      }

      if (payload.type === "user_transcript") {
        if (payload.text) {
          if (lastUserBubble) {
            const textEl = lastUserBubble.querySelector(".bubble-text");
            if (textEl) {
              textEl.textContent = `"${payload.text}"`;
            }
          }
          updateCaption(`Heard: <em>"${escapeHtml(payload.text)}"</em>. Aria is formulating response...`);
        }
      }

      if (payload.type === "text") {
        updateAssistantMessage(payload.message);
      }

      if (payload.type === "done") {
        player.flushAndFinish();
        if (!player.isPlaying()) {
          setState("listening");
          finalizeAssistantMessage();
          updateCaption("Listening: speak a sentence and pause naturally...");
        }
      }
      return;
    }

    // Binary audio chunk received
    setState("speaking");
    await player.enqueue(event.data);
  });

  liveSocket.addEventListener("close", stopLive);
  liveSocket.addEventListener("error", () => {
    updateCaption("Live connection error.");
    stopLive();
  });

  micProcessor.onaudioprocess = (event) => {
    if (!liveSocket || liveSocket.readyState !== WebSocket.OPEN) return;
    const input = event.inputBuffer.getChannelData(0);
    const chunk = new Float32Array(input);
    const level = rmsOf(chunk);
    currentMicLevel = level;

    const isPlaying = player.isPlaying();
    const vadThreshold = getVadThreshold();

    if (isPlaying) {
      // Acoustic Echo Shield: Track speaker bleed so Aria never interrupts herself
      if (isSpeakerEchoShieldEnabled()) {
        if (level > speakerBleedEma) {
          speakerBleedEma = speakerBleedEma * 0.7 + level * 0.3;
        } else {
          speakerBleedEma = speakerBleedEma * 0.98;
        }
      } else {
        speakerBleedEma = 0.0;
      }

      // Dynamic threshold: base interrupt level + dynamic headroom above speaker audio
      const dynamicThreshold = isSpeakerEchoShieldEnabled()
        ? Math.max(interruptLevel, speakerBleedEma * 1.55 + 0.035)
        : interruptLevel;

      if (level >= dynamicThreshold) {
        loudFrames += 1;
      } else {
        loudFrames = 0;
      }

      // Require 3 consecutive frames (~250ms) above dynamic threshold to trigger barge-in
      if (loudFrames >= 3 && performance.now() - lastInterruptAt > 800) {
        loudFrames = 0;
        speakerBleedEma = 0.0;
        player.stop();
        setState("interrupted");
        liveSocket.send(JSON.stringify({ type: "interrupt" }));
        lastInterruptAt = performance.now();
        // Forward speech chunk immediately so the user's interruption begins without loss
        liveSocket.send(chunk.buffer);
      }
      return;
    }

    loudFrames = 0;
    speakerBleedEma = 0.0;

    // Update state to user_speaking when above VAD threshold
    if (currentState === "listening" && level >= vadThreshold) {
      setState("user_speaking");
      updateCaption("Hearing your voice... pause when finished speaking.");
    }

    // Stream clean audio chunk to server
    liveSocket.send(chunk.buffer);
  };
}

function stopLive() {
  if (liveSocket && liveSocket.readyState === WebSocket.OPEN) {
    liveSocket.send(JSON.stringify({ type: "stop" }));
    liveSocket.close();
  }
  liveSocket = null;
  player.stop();

  if (micProcessor) micProcessor.disconnect();
  if (micSource) micSource.disconnect();
  if (micMute) micMute.disconnect();
  if (micContext && micContext.state !== "closed") micContext.close();
  if (micStream) micStream.getTracks().forEach((track) => track.stop());

  micProcessor = null;
  micSource = null;
  micMute = null;
  micContext = null;
  micStream = null;

  currentMicLevel = 0.0;
  speakerBleedEma = 0.0;
  setState("idle");
  finalizeAssistantMessage();
  updateCaption('Live mode stopped. Click <strong>Start Live Session</strong> to chat.');

  $("#liveBtn").disabled = false;
  $("#stopLiveBtn").disabled = true;
  setStatus();
}

// -------------------------------------------------------------
// Initialize App
// -------------------------------------------------------------
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => switchTab(tab.dataset.panel));
});

bindCalib();
startVisualizer();
pollModelStatus();
setInterval(pollModelStatus, 2500);

$("#speakBtn").addEventListener("click", speak);
$("#stopSpeakBtn").addEventListener("click", stopTTS);
$("#liveBtn").addEventListener("click", () => {
  startLive().catch((error) => {
    updateCaption(`Microphone access error: ${error.message}`);
    stopLive();
  });
});
$("#stopLiveBtn").addEventListener("click", stopLive);
$("#clearChatBtn").addEventListener("click", clearChat);

// -------------------------------------------------------------
// Voice Clone / Reference Audio Conditioning
// -------------------------------------------------------------
let refAudioBlob = null;
let refMediaRecorder = null;
let refAudioChunks = [];
let isRecordingRef = false;

const refFileInput = $("#refAudioFile");
if (refFileInput) {
  refFileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    refAudioBlob = file;

    const preview = $("#refAudioPreview");
    const player = $("#refAudioPlayer");
    const meta = $("#refAudioMeta");
    if (preview && player && meta) {
      player.src = URL.createObjectURL(file);
      meta.textContent = `Selected: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
      preview.style.display = "block";
    }
    const status = $("#cloneStatus");
    if (status) status.textContent = "Reference audio loaded. Click 'Synthesize in Reference Voice'.";
  });
}

const recordRefBtn = $("#recordRefBtn");
if (recordRefBtn) {
  recordRefBtn.addEventListener("click", async () => {
    if (isRecordingRef) {
      // Stop recording
      if (refMediaRecorder && refMediaRecorder.state !== "inactive") {
        refMediaRecorder.stop();
      }
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      refAudioChunks = [];
      refMediaRecorder = new MediaRecorder(stream);
      let secondsRecorded = 0;
      let recordTimer = null;

      refMediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) refAudioChunks.push(e.data);
      };

      refMediaRecorder.onstop = () => {
        isRecordingRef = false;
        if (recordTimer) clearInterval(recordTimer);
        stream.getTracks().forEach((t) => t.stop());
        const label = $("#recordRefLabel");
        if (label) label.textContent = "Record Reference (up to 30s)";
        recordRefBtn.className = "secondary";

        refAudioBlob = new Blob(refAudioChunks, { type: "audio/webm" });
        const preview = $("#refAudioPreview");
        const player = $("#refAudioPlayer");
        const meta = $("#refAudioMeta");
        if (preview && player && meta) {
          player.src = URL.createObjectURL(refAudioBlob);
          meta.textContent = `Recorded: ${secondsRecorded}s (${(refAudioBlob.size / 1024).toFixed(1)} KB)`;
          preview.style.display = "block";
        }
        const status = $("#cloneStatus");
        if (status) status.textContent = `Voice recording ready (${secondsRecorded}s). Click 'Synthesize in Reference Voice'.`;
      };

      refMediaRecorder.start();
      isRecordingRef = true;
      const label = $("#recordRefLabel");
      if (label) label.textContent = "⏹ Stop (0s / 30s)";
      recordRefBtn.className = "danger";

      recordTimer = setInterval(() => {
        secondsRecorded += 1;
        if (label && isRecordingRef) {
          label.textContent = `⏹ Stop (${secondsRecorded}s / 30s)`;
        }
        if (secondsRecorded >= 30) {
          if (refMediaRecorder && refMediaRecorder.state === "recording") {
            refMediaRecorder.stop();
          }
        }
      }, 1000);
    } catch (err) {
      alert(`Microphone access error: ${err.message}`);
    }
  });
}

const cloneBtn = $("#cloneBtn");
if (cloneBtn) {
  cloneBtn.addEventListener("click", async () => {
    if (!refAudioBlob) {
      alert("Please upload an audio file or record a reference voice first.");
      return;
    }

    const text = $("#cloneText").value.trim();
    if (!text) {
      alert("Please enter text to synthesize in the cloned voice.");
      return;
    }

    const status = $("#cloneStatus");
    const outputWrapper = $("#cloneOutputWrapper");
    const clonePlayer = $("#cloneAudioPlayer");

    if (status) status.textContent = "Synthesizing voice conditioned on reference audio...";
    cloneBtn.disabled = true;

    try {
      const formData = new FormData();
      formData.append("audio_file", refAudioBlob, "reference.webm");
      formData.append("text", text);
      formData.append("max_tokens", $("#cloneTokens").value);
      formData.append("audio_temperature", $("#cloneTemp").value);
      formData.append("audio_top_k", $("#cloneTopK").value);

      const resp = await fetch("/api/clone", {
        method: "POST",
        body: formData,
      });

      const data = await resp.json();
      if (data.audio_url) {
        if (clonePlayer) clonePlayer.src = data.audio_url;
        if (outputWrapper) outputWrapper.style.display = "block";
        if (status) status.textContent = data.status || "Voice synthesis complete!";
      } else {
        if (status) status.textContent = data.status || "Failed to generate speech.";
      }
    } catch (err) {
      if (status) status.textContent = `Generation error: ${err.message}`;
    } finally {
      cloneBtn.disabled = false;
    }
  });
}

