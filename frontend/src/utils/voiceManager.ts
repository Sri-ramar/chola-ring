import { parseVoiceCommand } from './commandParser';

export type VoiceState = 'idle' | 'connecting' | 'listening' | 'user_speaking' | 'thinking' | 'speaking' | 'interrupted' | 'error';

export interface LogEntry {
  id: string;
  time: string;
  category: 'WS' | 'MIC' | 'VAD' | 'MODEL' | 'ASR' | 'AUDIO' | 'ERR';
  level: 'info' | 'success' | 'warn' | 'error';
  message: string;
  detail?: any;
}

export interface VoiceManagerCallbacks {
  onStateChange: (state: VoiceState) => void;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onAiResponse?: (text: string) => void;
  onAudioLevel?: (level: number) => void;
  onError?: (err: string) => void;
  onCommandAction?: (action: Record<string, any>) => void;
  onSearchResults?: (results: any) => void;
  onMediaUpdate?: (media: any) => void;
  onShellOutput?: (output: any) => void;
  onBackgroundTask?: (task: any) => void;
  onVisionResult?: (result: any) => void;
  onHealthUpdate?: (health: any) => void;
  onEmotion?: (emotion: string) => void;
  onReminder?: (message: string) => void;
  onRemindersTriggered?: (payload: { count: number; triggered: any[] }) => void;
  onLog?: (log: LogEntry) => void;
}

// -------------------------------------------------------------
// Audio Resampler: Native Float32 -> 16kHz PCM16 Little-Endian
// -------------------------------------------------------------
function downsampleTo16k(input: Float32Array, inputSampleRate: number): Int16Array {
  if (inputSampleRate === 16000) {
    const pcm16 = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return pcm16;
  }

  const ratio = inputSampleRate / 16000;
  const targetLength = Math.round(input.length / ratio);
  const pcm16 = new Int16Array(targetLength);

  for (let i = 0; i < targetLength; i++) {
    const srcIndex = i * ratio;
    const i0 = Math.floor(srcIndex);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const t = srcIndex - i0;
    const sample = input[i0] * (1 - t) + input[i1] * t;
    const s = Math.max(-1, Math.min(1, sample));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  return pcm16;
}

// -------------------------------------------------------------
// PCM Player with Jitter Pre-Buffering (24kHz Gemini Live Audio)
// -------------------------------------------------------------
export class PCMPlayer {
  public context: AudioContext | null = null;
  public analyser: AnalyserNode | null = null;
  private nextTime: number = 0;
  private isBuffering: boolean = true;
  private isDoneReceived: boolean = false;
  private pendingBuffers: AudioBuffer[] = [];
  private activeSources: Set<AudioBufferSourceNode> = new Set();
  public onPlaybackEnded: (() => void) | null = null;

  constructor(public sampleRate = 24000, public bufferChunks = 2) {}

  async ensure() {
    if (!this.context || this.context.state === 'closed') {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.context = new AudioContextClass({ sampleRate: this.sampleRate });
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.25;
      this.nextTime = 0;
    }
    if (this.context.state === 'suspended') {
      try {
        await Promise.race([
          this.context.resume(),
          new Promise((resolve) => setTimeout(resolve, 500)),
        ]);
      } catch {
        // Continue without blocking audio scheduling
      }
    }
  }

  resetStream() {
    this.pendingBuffers = [];
    this.isBuffering = true;
    this.isDoneReceived = false;
    this.nextTime = 0;
  }

  async enqueue(data: ArrayBuffer | Blob) {
    await this.ensure();
    if (!this.context) return;

    let arrayBuffer: ArrayBuffer;
    if (data instanceof ArrayBuffer) {
      arrayBuffer = data;
    } else if (data instanceof Blob) {
      arrayBuffer = await data.arrayBuffer();
    } else {
      return;
    }

    const int16 = new Int16Array(arrayBuffer);
    if (!int16.length) return;

    const buffer = this.context.createBuffer(1, int16.length, this.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < int16.length; i++) {
      channel[i] = int16[i] / 32768.0;
    }

    if (this.isBuffering) {
      this.pendingBuffers.push(buffer);
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
    let startTime = Math.max(this.nextTime, this.context.currentTime + 0.02);

    while (this.pendingBuffers.length > 0) {
      const buffer = this.pendingBuffers.shift()!;
      this.playBufferAt(buffer, startTime);
      startTime += buffer.duration;
    }
    this.nextTime = startTime;
  }

  scheduleBuffer(buffer: AudioBuffer) {
    if (!this.context) return;
    const now = this.context.currentTime;
    let startTime = this.nextTime;
    if (startTime < now) {
      startTime = now + 0.005;
    }
    this.playBufferAt(buffer, startTime);
    this.nextTime = startTime + buffer.duration;
  }

  playBufferAt(buffer: AudioBuffer, startTime: number) {
    if (!this.context) return;
    const source = this.context.createBufferSource();
    source.buffer = buffer;

    source.connect(this.context.destination);
    if (this.analyser) {
      source.connect(this.analyser);
    }

    source.addEventListener('ended', () => {
      this.activeSources.delete(source);
      if (this.isDoneReceived && this.activeSources.size === 0 && this.pendingBuffers.length === 0 && this.onPlaybackEnded) {
        this.onPlaybackEnded();
      }
    });

    this.activeSources.add(source);
    source.start(startTime);
  }

  markDone() {
    this.isDoneReceived = true;
    this.flushAndFinish();
    if (this.activeSources.size === 0 && this.pendingBuffers.length === 0 && this.onPlaybackEnded) {
      this.onPlaybackEnded();
    }
  }

  flushAndFinish() {
    if (this.isBuffering && this.pendingBuffers.length > 0) {
      this.flushPendingBuffers();
    }
  }

  stop() {
    this.pendingBuffers = [];
    this.isBuffering = true;
    this.isDoneReceived = false;
    for (const source of this.activeSources) {
      try {
        source.stop();
      } catch {
        // already stopped
      }
    }
    this.activeSources.clear();
    if (this.context) {
      this.nextTime = 0;
    }
  }

  isPlaying(): boolean {
    return this.activeSources.size > 0 || this.pendingBuffers.length > 0;
  }
}

// -------------------------------------------------------------
// VoiceManager (Gemini Live Speech-to-Speech Engine)
// -------------------------------------------------------------
export class VoiceManager {
  private state: VoiceState = 'idle';
  public onStateChange?: (state: VoiceState) => void;
  public onTranscript?: (text: string, isFinal: boolean) => void;
  public onAiResponse?: (text: string) => void;
  public onAudioLevel?: (level: number) => void;
  public onError?: (err: string) => void;
  public onCommandAction?: (action: Record<string, any>) => void;
  public onSearchResults?: (results: any) => void;
  public onMediaUpdate?: (media: any) => void;
  public onShellOutput?: (output: any) => void;
  public onBackgroundTask?: (task: any) => void;
  public onVisionResult?: (result: any) => void;
  public onHealthUpdate?: (health: any) => void;
  public onEmotion?: (emotion: string) => void;
  public onReminder?: (message: string) => void;
  public onRemindersTriggered?: (payload: { count: number; triggered: any[] }) => void;
  public onLog?: (log: LogEntry) => void;

  public logs: LogEntry[] = [];
  public player: PCMPlayer;
  private ws: WebSocket | null = null;

  // Media Streams
  private voiceStream: MediaStream | null = null;
  private voiceContext: AudioContext | null = null;
  private voiceSource: MediaStreamAudioSourceNode | null = null;
  private voiceProcessor: ScriptProcessorNode | null = null;
  private voiceMute: GainNode | null = null;

  // Ambient listener (for idle visualizer)
  private ambientStream: MediaStream | null = null;
  private ambientContext: AudioContext | null = null;
  private ambientAnalyser: AnalyserNode | null = null;

  public isS2SActive: boolean = false;
  public externalBackend: boolean = false;
  public currentMicLevel: number = 0;
  public smoothLevel: number = 0;
  private externalAudioLevel: number = 0;

  // Guards the connect sequence. In the Qt shell an unanswered microphone permission
  // leaves getUserMedia() pending forever, which used to strand the HUD on
  // "CONNECTING..." with no way to tell how far it had got.
  private connectWatchdog: ReturnType<typeof setTimeout> | null = null;

  private clearConnectWatchdog(): void {
    if (this.connectWatchdog) {
      clearTimeout(this.connectWatchdog);
      this.connectWatchdog = null;
    }
  }

  private armConnectWatchdog(ms = 20000): void {
    this.clearConnectWatchdog();
    this.connectWatchdog = setTimeout(() => {
      if (this.state !== 'connecting') return;
      const message = 'Voice link stalled while connecting. The microphone or audio output is most likely blocked for this origin — allow mic access for 127.0.0.1, then retry.';
      this.log('WS', 'error', message);
      this.onError?.(message);
      this.stopSession();
      this.setState('error');
    }, ms);
  }

  /** Race a promise against a timeout so one pending step cannot hang the sequence. */
  private async withTimeout<T>(label: string, promise: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Resume an AudioContext without ever blocking. Chromium gates resume() on user
   * activation, so awaiting it after an await chain can pend indefinitely.
   */
  private async resumeBestEffort(context: AudioContext | null, label: string): Promise<void> {
    if (!context || context.state !== 'suspended') return;
    try {
      await this.withTimeout(label, context.resume(), 2000);
    } catch {
      this.log('AUDIO', 'warn', `${label} is still suspended; continuing (it resumes on the next interaction).`);
    }
  }

  public selectedVoice: string = (typeof window !== 'undefined' && localStorage.getItem('rhiona_voice')) || 'Puck';

  public async previewVoice(voiceName?: string): Promise<boolean> {
    const voice = voiceName || this.selectedVoice || 'Puck';
    this.log('MODEL', 'info', `Requesting audio preview for voice: ${voice}...`);

    try {
      const res = await fetch(`/api/voice/preview?voice=${encodeURIComponent(voice)}`);
      if (!res.ok) throw new Error(`Preview failed: ${res.statusText}`);
      const blob = await res.blob();
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);

      this.setState('speaking');
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        if (this.isS2SActive) {
          this.setState('listening');
        } else {
          this.setState('idle');
        }
      };
      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        if (this.isS2SActive) this.setState('listening');
        else this.setState('idle');
      };
      await audio.play();
      return true;
    } catch (e: any) {
      this.log('ERR', 'error', `Voice preview error: ${e.message}`);
      return false;
    }
  }

  public setVoice(voice: string) {
    const prevVoice = this.selectedVoice;
    this.selectedVoice = voice;
    if (typeof window !== 'undefined') {
      localStorage.setItem('rhiona_voice', voice);
    }
    this.log('MODEL', 'info', `Gemini Live Voice selected: ${voice}`);

    // If session is active and voice changed, reconnect to apply new voice immediately
    if (this.isS2SActive && !this.externalBackend && prevVoice !== voice) {
      this.log('WS', 'info', `Re-negotiating live session with voice: ${voice}...`);
      this.stopSession();
      setTimeout(() => {
        this.startSession(this.currentMetrics);
      }, 200);
    }
  }

  private static loadStoredNumber(key: string, defaultValue: number, minAcceptable: number, maxAcceptable: number): number {
    if (typeof window === 'undefined') return defaultValue;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return defaultValue;
      const val = parseFloat(raw);
      if (!isNaN(val) && val >= minAcceptable && val <= maxAcceptable) {
        if (key === 'rhiona_vad_threshold' && (val >= 0.040 || val <= 0.015)) {
          return defaultValue;
        }
        return val;
      }
    } catch {}
    return defaultValue;
  }

  // Calibrated VAD and Settings
  public vadThreshold: number = VoiceManager.loadStoredNumber('rhiona_vad_threshold', 0.022, 0.008, 0.080);
  public pauseMs: number = VoiceManager.loadStoredNumber('rhiona_pause_ms', 700, 300, 1500);
  public interruptLevel: number = VoiceManager.loadStoredNumber('rhiona_barge_in_threshold', 0.080, 0.030, 0.250);
  public minUtteranceMs: number = 250;

  public get bargeInThreshold(): number {
    return this.interruptLevel;
  }
  public set bargeInThreshold(val: number) {
    this.interruptLevel = val;
  }

  // Acoustic Echo Shield
  private loudFrames: number = 0;
  private lastInterruptAt: number = 0;
  private speakerBleedEma: number = 0.0;

  // Active Speech & VAD Turn Tracking
  private isUserSpeaking: boolean = false;
  private speechStartTime: number = 0;
  private lastSpeechTime: number = 0;
  private preSpeechBuffer: Int16Array[] = [];
  private thinkingWatchdogTimer: any = null;

  private animFrameId: number | null = null;
  public currentMetrics: any = null;
  private fullAiResponseText: string = '';
  private pendingTextMessages: string[] = [];

  constructor(callbacks?: VoiceManagerCallbacks) {
    this.player = new PCMPlayer(24000, 2);
    this.player.onPlaybackEnded = () => {
      this.log('AUDIO', 'info', 'Playback completed. Listening...');
      if (this.isS2SActive) {
        this.setState('listening');
      }
    };

    if (callbacks) {
      this.onStateChange = callbacks.onStateChange;
      this.onTranscript = callbacks.onTranscript;
      this.onAiResponse = callbacks.onAiResponse;
      this.onAudioLevel = callbacks.onAudioLevel;
      this.onError = callbacks.onError;
      this.onCommandAction = callbacks.onCommandAction;
      this.onLog = callbacks.onLog;
    }

    this.startLevelLoop();
  }

  public updateConfig(updates: { vad_threshold?: number; pause_ms?: number; barge_in_threshold?: number }) {
    if (updates.vad_threshold !== undefined) {
      this.vadThreshold = updates.vad_threshold;
      if (typeof window !== 'undefined') localStorage.setItem('rhiona_vad_threshold', String(updates.vad_threshold));
    }
    if (updates.pause_ms !== undefined) {
      this.pauseMs = updates.pause_ms;
      if (typeof window !== 'undefined') localStorage.setItem('rhiona_pause_ms', String(updates.pause_ms));
    }
    if (updates.barge_in_threshold !== undefined) {
      this.interruptLevel = updates.barge_in_threshold;
      if (typeof window !== 'undefined') localStorage.setItem('rhiona_barge_in_threshold', String(updates.barge_in_threshold));
    }

    this.log('VAD', 'info', `Calibrated: VAD=${this.vadThreshold.toFixed(4)}, Pause=${this.pauseMs}ms, BargeIn=${this.interruptLevel.toFixed(3)}`);
  }

  public log(category: LogEntry['category'], level: LogEntry['level'], message: string, detail?: any) {
    const entry: LogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      time: new Date().toLocaleTimeString('en-US', { hour12: false, minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 } as any),
      category,
      level,
      message,
      detail,
    };
    this.logs.unshift(entry);
    if (this.logs.length > 200) this.logs.pop();
    this.onLog?.(entry);
  }

  public getState(): VoiceState {
    return this.state;
  }

  private setState(newState: VoiceState) {
    if (this.state !== newState) {
      this.log('VAD', 'info', `State: [${this.state.toUpperCase()}] ➔ [${newState.toUpperCase()}]`);
      this.state = newState;
      this.onStateChange?.(newState);

      if (this.thinkingWatchdogTimer) {
        clearTimeout(this.thinkingWatchdogTimer);
        this.thinkingWatchdogTimer = null;
      }

      // If in thinking state, set an 11s safety fallback so UI never gets stuck
      if (newState === 'thinking') {
        this.thinkingWatchdogTimer = setTimeout(() => {
          if (this.state === 'thinking' && !this.player.isPlaying()) {
            this.log('VAD', 'warn', 'Thinking timeout (no response from model after 11s); returning to listening.');
            this.setState('listening');
          }
        }, 11000);
      }
    }
  }

  public async start(currentMetrics?: any): Promise<void> {
    return this.startSession(currentMetrics);
  }

  public stop(): void {
    if (this.externalBackend && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'backend_control', action: 'stop' }));
    }
    this.stopSession();
  }

  public disconnect(): void {
    this.stopSession();
  }

  private rmsOf(float32: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < float32.length; i += 1) {
      sum += float32[i] * float32[i];
    }
    return Math.sqrt(sum / Math.max(1, float32.length));
  }

  // -------------------------------------------------------------
  // Ambient Room Audio Listener (Idle Visualizers)
  // -------------------------------------------------------------
  public async ensureAmbientListening() {
    if (this.isS2SActive || this.externalBackend) return;
    if (this.ambientStream && this.ambientContext && this.ambientContext.state !== 'closed') {
      if (this.ambientContext.state === 'suspended') {
        await this.ambientContext.resume();
      }
      return;
    }

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;

      this.ambientStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ambientContext = new AudioContextClass();
      if (this.ambientContext.state === 'suspended') {
        await this.ambientContext.resume();
      }
      const source = this.ambientContext.createMediaStreamSource(this.ambientStream);
      this.ambientAnalyser = this.ambientContext.createAnalyser();
      this.ambientAnalyser.fftSize = 256;
      this.ambientAnalyser.smoothingTimeConstant = 0.20;
      source.connect(this.ambientAnalyser);

      this.log('MIC', 'success', 'Ambient acoustic visualizer active.');
    } catch (err: any) {
      console.warn('Ambient mic notice:', err);
    }
  }

  public async captureSystemAudio(): Promise<boolean> {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        this.log('AUDIO', 'error', 'getDisplayMedia unavailable in this browser.');
        return false;
      }
      this.log('AUDIO', 'info', 'Selecting System/Tab Audio source...');
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        this.log('AUDIO', 'warn', 'No audio track shared.');
        return false;
      }

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!this.ambientContext || this.ambientContext.state === 'closed') {
        this.ambientContext = new AudioContextClass();
      }
      if (this.ambientContext.state === 'suspended') {
        await this.ambientContext.resume();
      }

      const sysSource = this.ambientContext.createMediaStreamSource(new MediaStream([audioTracks[0]]));
      if (!this.ambientAnalyser) {
        this.ambientAnalyser = this.ambientContext.createAnalyser();
        this.ambientAnalyser.fftSize = 256;
        this.ambientAnalyser.smoothingTimeConstant = 0.20;
      }
      sysSource.connect(this.ambientAnalyser);
      this.log('AUDIO', 'success', 'Direct System Audio connected!');
      return true;
    } catch (e: any) {
      this.log('AUDIO', 'warn', `System audio capture notice: ${e?.message || e}`);
      return false;
    }
  }

  // -------------------------------------------------------------
  // 60 FPS Visualizer Animation Loop
  // -------------------------------------------------------------
  private startLevelLoop() {
    if (this.animFrameId) return;

    const updateLevel = () => {
      const isPlaying = this.player.isPlaying() || this.state === 'speaking';
      let targetLevel = 0;

      if (this.externalBackend) {
        targetLevel = this.externalAudioLevel;
        this.externalAudioLevel *= 0.92;
      } else if (isPlaying && this.player.analyser) {
        const freqData = new Uint8Array(64);
        this.player.analyser.getByteFrequencyData(freqData);
        let sum = 0;
        for (let i = 0; i < freqData.length; i++) {
          sum += freqData[i];
        }
        targetLevel = Math.min(1.0, (sum / (freqData.length * 255)) * 1.6);
      } else if (this.isS2SActive) {
        targetLevel = Math.min(1.0, this.currentMicLevel * 14.0);
      } else if (this.ambientAnalyser) {
        const freqData = new Uint8Array(64);
        this.ambientAnalyser.getByteFrequencyData(freqData);
        let bassSum = 0;
        for (let i = 0; i < 16; i++) bassSum += freqData[i];
        let midSum = 0;
        for (let i = 16; i < 40; i++) midSum += freqData[i];

        const raw = (bassSum / (16 * 255)) * 0.70 + (midSum / (24 * 255)) * 0.30;
        targetLevel = raw > 0.08 ? Math.min(1.0, (raw - 0.08) * 1.5) : 0.0;
      }

      const alpha = targetLevel > this.smoothLevel ? 0.45 : 0.18;
      this.smoothLevel += (targetLevel - this.smoothLevel) * alpha;
      this.onAudioLevel?.(Math.min(1.0, Math.max(0, this.smoothLevel)));

      this.animFrameId = requestAnimationFrame(updateLevel);
    };

    this.animFrameId = requestAnimationFrame(updateLevel);
  }

  private async handleStructuredPayload(payload: any): Promise<void> {
    if (payload.type === 'state') {
      this.setState(payload.state as VoiceState);
      if (payload.state === 'thinking') {
        this.log('MODEL', 'info', `${this.externalBackend ? 'Rhiona Agent' : 'Gemini Live'} formulating response...`);
        this.player.resetStream();
        this.fullAiResponseText = '';
      } else if (payload.state === 'interrupted') {
        this.player.stop();
      }
    } else if (payload.type === 'user_transcript') {
      if (payload.text) {
        const isFinal = payload.isFinal === true;
        if (isFinal) this.log('ASR', 'success', `You: "${payload.text}"`);
        this.onTranscript?.(payload.text, isFinal);
        if (isFinal) {
          const parsed = parseVoiceCommand(payload.text);
          if (parsed.hasAction) {
            this.onCommandAction?.({
              neonTheme: parsed.neonTheme,
              shellMetal: parsed.shellMetal,
              isOverclocked: parsed.isOverclocked,
            });
          }
        }
      }
    } else if (payload.type === 'action') {
      this.log('MODEL', 'success', `Tool action applied: ${JSON.stringify(payload.actions)}`);
      this.onCommandAction?.(payload.actions);
    } else if (payload.type === 'search_results') {
      this.log('MODEL', 'success', `Web Search: "${payload.data?.query || 'assistant query'}"`);
      this.onSearchResults?.(payload.data);
    } else if (payload.type === 'media_update') {
      this.log('MODEL', 'info', `Media: ${payload.data?.status || JSON.stringify(payload.data)}`);
      this.onMediaUpdate?.(payload.data);
    } else if (payload.type === 'shell_output') {
      this.log('MODEL', 'info', `Shell: ${payload.data?.command || 'Executed'}`);
      this.onShellOutput?.(payload.data);
    } else if (payload.type === 'background_task') {
      const detail = payload.data?.result ? ` — ${String(payload.data.result).slice(0, 160)}` : '';
      this.log('MODEL', 'info', `Task: ${payload.data?.title || payload.data?.task_id || 'Background operation'} (${payload.data?.progress || 0}%)${detail}`);
      this.onBackgroundTask?.(payload.data);
    } else if (payload.type === 'vision_result') {
      this.log('MODEL', 'success', 'Screen analysis received from Rhiona vision.');
      this.onVisionResult?.(payload.data);
    } else if (payload.type === 'health_update') {
      this.onHealthUpdate?.(payload.data);
    } else if (payload.type === 'emotion') {
      this.onEmotion?.(payload.emotion);
    } else if (payload.type === 'audio_level') {
      this.externalAudioLevel = Math.max(0, Math.min(1, Number(payload.level) || 0));
    } else if (payload.type === 'reminder') {
      this.log('MODEL', 'success', `REMINDER NOTIFICATION: ${payload.message}`);
      this.onReminder?.(payload.message);
    } else if (payload.type === 'reminders_triggered') {
      // The bridge fires scheduled autonomous missions on this event; without a
      // handler here they complete silently and the user never sees the result.
      const triggered: any[] = Array.isArray(payload.triggered) ? payload.triggered : [];
      const count = Number(payload.count) || triggered.length;
      const labels = triggered.map((t) => t?.title || t?.goal || 'mission').join(', ');
      this.log('MODEL', 'success', `AUTONOMOUS MISSION${count === 1 ? '' : 'S'} FIRED (${count}): ${labels}`);
      this.onRemindersTriggered?.({ count, triggered });
      triggered.forEach((t) => {
        const message = t?.result || t?.message || t?.title || 'Scheduled mission completed.';
        this.onReminder?.(message);
      });
    } else if (payload.type === 'text') {
      this.fullAiResponseText = payload.message;
      this.onAiResponse?.(payload.message);
    } else if (payload.type === 'done') {
      this.log('MODEL', 'info', 'Turn completed.');
      if (payload.text) this.fullAiResponseText = payload.text;
      if (!this.externalBackend) this.player.markDone();
      if (this.fullAiResponseText) this.onAiResponse?.(this.fullAiResponseText);
      if (this.externalBackend || (this.fullAiResponseText && !this.player.isPlaying())) {
        this.setState('listening');
      }
    } else if (payload.type === 'backend_status') {
      const status = payload.data?.state;
      this.log('WS', status === 'error' ? 'error' : 'info', `Agentic backend: ${status || 'unknown'}`);
      if (status === 'error') {
        const message = payload.data?.lastError || 'Agentic backend stopped with an error.';
        this.onError?.(message);
        this.setState('error');
      }
    } else if (payload.type === 'backend_log') {
      const level = payload.stream === 'stderr' ? 'warn' : 'info';
      this.log('MODEL', level, payload.message || 'Agentic runtime event');
    } else if (payload.type === 'status') {
      this.log('MODEL', 'info', `Status: ${payload.message}`);
    } else if (payload.type === 'configuration_error') {
      const message = payload.message || 'Assistant backend is not configured.';
      this.log('ERR', 'error', message);
      this.onError?.(message);
      this.setState('error');
    }
  }

  private async startExternalBackendSession(): Promise<void> {
    this.log('WS', 'info', 'Connecting Rhiona HUD to the agentic runtime...');
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/live`;
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      this.ws = socket;
      this.log('WS', 'success', 'Rhiona is connected to the agentic event stream.');
      this.setState('listening');
      socket.send(JSON.stringify({ type: 'backend_control', action: 'start' }));
      while (this.pendingTextMessages.length > 0 && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'text', text: this.pendingTextMessages.shift()! }));
      }
    };

    socket.onmessage = async (event) => {
      if (typeof event.data !== 'string') return;
      try {
        await this.handleStructuredPayload(JSON.parse(event.data));
      } catch (error) {
        console.warn('Agent event parse notice:', error);
      }
    };

    socket.onerror = () => {
      this.log('WS', 'warn', 'Agentic bridge WebSocket notice.');
    };

    socket.onclose = () => {
      this.ws = null;
      if (!this.isS2SActive) return;
      this.isS2SActive = false;
      const message = 'Connection to the agentic backend closed.';
      this.log('ERR', 'error', message);
      this.onError?.(message);
      this.setState('error');
    };
  }

  // -------------------------------------------------------------
  // Gemini Live Speech-to-Speech Session
  // -------------------------------------------------------------
  public async startSession(currentMetrics?: any) {
    if (this.isS2SActive) {
      return;
    }

    // Synchronously prime the Web Audio output within the user activation event
    void this.player.ensure();

    this.currentMetrics = currentMetrics;
    this.isS2SActive = true;
    this.setState('connecting');
    this.armConnectWatchdog();

    try {
      const response = await this.withTimeout('health probe', fetch('/api/health', { cache: 'no-store' }), 8000);
      const health = response.ok ? await response.json() : null;
      if (health?.backendMode === 'external') {
        this.externalBackend = true;
        await this.startExternalBackendSession();
        return;
      }
    } catch {
      // Continue with the direct browser-to-Gemini fallback.
    }
    this.externalBackend = false;

    // 1. Close ambient raw stream
    if (this.ambientStream) {
      this.ambientStream.getTracks().forEach((t) => t.stop());
      this.ambientStream = null;
    }
    if (this.ambientContext && this.ambientContext.state !== 'closed') {
      this.ambientContext.close();
      this.ambientContext = null;
      this.ambientAnalyser = null;
    }

    // 2. Prepare voice capture
    try {
      this.log('MIC', 'info', 'Requesting microphone access...');
      this.voiceStream = await this.withTimeout(
        'microphone permission',
        navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        }),
        15000,
      );

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.voiceContext = new AudioContextClass();
      await this.resumeBestEffort(this.voiceContext, 'capture AudioContext');

      this.voiceSource = this.voiceContext.createMediaStreamSource(this.voiceStream);
      this.voiceProcessor = this.voiceContext.createScriptProcessor(4096, 1, 1);
      this.voiceMute = this.voiceContext.createGain();
      this.voiceMute.gain.value = 0;

      this.voiceSource.connect(this.voiceProcessor);
      this.voiceProcessor.connect(this.voiceMute);
      this.voiceMute.connect(this.voiceContext.destination);

      // ensure() creates the playback context and resumes it; wrap it because the
      // internal resume() can pend under an autoplay policy that blocks us.
      try {
        await this.withTimeout('audio output init', this.player.ensure(), 3000);
      } catch {
        this.log('AUDIO', 'warn', 'Audio output is slow to start; continuing without blocking the link.');
      }
      this.player.resetStream();

      const sampleRate = this.voiceContext.sampleRate;
      this.log('MIC', 'success', `Microphone active: ${sampleRate}Hz ➔ 16kHz PCM (Gemini Live Mode)`);

      // 3. Connect to Gemini Live S2S WebSocket
      const voice = this.selectedVoice || 'Puck';
      const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/live?voice=${encodeURIComponent(voice)}`;
      this.log('WS', 'info', `Connecting to Gemini Live Gateway: ${wsUrl} (Voice: ${voice})`);

      const socket = new WebSocket(wsUrl);
      socket.binaryType = 'arraybuffer';

      socket.onopen = () => {
        this.ws = socket;
        this.clearConnectWatchdog();
        this.log('WS', 'success', 'Connected to Gemini Live WebSocket Gateway!');
        this.setState('listening');
        while (this.pendingTextMessages.length > 0 && socket.readyState === WebSocket.OPEN) {
          const text = this.pendingTextMessages.shift()!;
          socket.send(JSON.stringify({ type: 'text', text }));
        }
      };

      socket.onmessage = async (event) => {
        if (typeof event.data === 'string') {
          try {
            const payload = JSON.parse(event.data);

            await this.handleStructuredPayload(payload);
          } catch (e) {
            console.warn('JSON error:', e);
          }
          return;
        }

        // Binary 24kHz PCM16 audio token received from Gemini Live API
        this.setState('speaking');
        await this.player.enqueue(event.data);
      };

      socket.onerror = (e) => {
        this.log('WS', 'warn', 'Gemini Live WebSocket notice.');
      };

      socket.onclose = () => {
        this.log('WS', 'warn', 'Gemini Live session closed.');
        if (this.isS2SActive) {
          const wasConfigurationError = this.state === 'error';
          this.ws = null;
          this.stopSession();
          if (wasConfigurationError) {
            this.setState('error');
          } else {
            const message = 'Gemini Live connection closed unexpectedly.';
            this.onError?.(message);
            this.setState('error');
          }
        }
      };

      // 4. Microphone Audio Processing & 16kHz PCM Stream
      this.voiceProcessor.onaudioprocess = (event) => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const input = event.inputBuffer.getChannelData(0);
        const level = this.rmsOf(input);
        this.currentMicLevel = level;

        const isPlaying = this.player.isPlaying() || this.state === 'speaking';

        if (isPlaying) {
          // Acoustic Echo Shield & Barge-In
          this.isUserSpeaking = false;
          this.preSpeechBuffer = [];

          if (level > this.speakerBleedEma) {
            this.speakerBleedEma = this.speakerBleedEma * 0.7 + level * 0.3;
          } else {
            this.speakerBleedEma = this.speakerBleedEma * 0.98;
          }

          const dynamicThreshold = Math.max(this.interruptLevel, this.speakerBleedEma * 1.6 + 0.045);

          if (level >= dynamicThreshold) {
            this.loudFrames += 1;
          } else {
            this.loudFrames = 0;
          }

          if (this.loudFrames >= 5 && performance.now() - this.lastInterruptAt > 1200) {
            this.loudFrames = 0;
            this.speakerBleedEma = 0.0;
            this.player.stop();
            this.setState('interrupted');
            this.ws.send(JSON.stringify({ type: 'interrupt' }));
            this.lastInterruptAt = performance.now();
          }
          return;
        }

        this.loudFrames = 0;
        this.speakerBleedEma = 0.0;

        const now = performance.now();
        const pcm16 = downsampleTo16k(input, sampleRate);

        // Always stream uncompressed real microphone PCM to Gemini Live so speech is never muted or clipped
        this.ws.send(pcm16.buffer);

        // Client-side UI VAD state transitions:
        if (level >= this.vadThreshold) {
          this.lastSpeechTime = now;
          if (this.state === 'listening') {
            this.setState('user_speaking');
          }
        } else {
          if (this.state === 'user_speaking') {
            const silenceDuration = now - this.lastSpeechTime;
            if (silenceDuration >= this.pauseMs) {
              this.log('VAD', 'info', `Speech pause detected (${Math.round(silenceDuration)}ms). Formulating response...`);
              this.setState('thinking');
            }
          }
        }
      };
    } catch (err: any) {
      this.clearConnectWatchdog();
      const detail = err?.message || 'unknown error';
      this.log('MIC', 'error', `Microphone unavailable: ${detail}`);
      this.isS2SActive = false;
      this.onError?.(
        /timed out/i.test(detail)
          ? 'Microphone access never completed — allow mic for 127.0.0.1 and retry.'
          : err?.message || 'Microphone access was denied.',
      );
      this.setState('error');
    }
  }

  // -------------------------------------------------------------
  // Text Interaction (Speak Text via Gemini Live)
  // -------------------------------------------------------------
  public async speakText(text: string) {
    const cleanText = text.trim();
    if (!cleanText) return;
    this.log('MODEL', 'info', `Sending text: "${cleanText}"`);
    this.setState('thinking');

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'text',
        text: cleanText,
      }));
    } else {
      this.pendingTextMessages.push(cleanText);
      await this.startSession();
    }
  }

  public stopSession() {
    this.log('MIC', 'info', 'Stopping voice session.');
    this.clearConnectWatchdog();
    this.isS2SActive = false;
    this.loudFrames = 0;
    this.speakerBleedEma = 0.0;
    this.isUserSpeaking = false;
    this.preSpeechBuffer = [];
    if (this.thinkingWatchdogTimer) {
      clearTimeout(this.thinkingWatchdogTimer);
      this.thinkingWatchdogTimer = null;
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
    }
    this.ws = null;
    this.player.stop();

    if (this.voiceProcessor) this.voiceProcessor.disconnect();
    if (this.voiceSource) this.voiceSource.disconnect();
    if (this.voiceMute) this.voiceMute.disconnect();
    if (this.voiceContext && this.voiceContext.state !== 'closed') this.voiceContext.close();
    if (this.voiceStream) this.voiceStream.getTracks().forEach((track) => track.stop());

    this.voiceProcessor = null;
    this.voiceSource = null;
    this.voiceMute = null;
    this.voiceContext = null;
    this.voiceStream = null;

    this.currentMicLevel = 0;
    this.setState('idle');

    // Resume ambient listener for idle visualizer
    setTimeout(() => {
      this.ensureAmbientListening();
    }, 500);
  }
}

export const voiceManager = new VoiceManager();

if (typeof window !== 'undefined') {
  (window as any).voiceManager = voiceManager;
  const onInteraction = () => {
    voiceManager.player.ensure().catch(() => {});
    window.removeEventListener('pointerdown', onInteraction);
    window.removeEventListener('keydown', onInteraction);
  };
  window.addEventListener('pointerdown', onInteraction, { passive: true });
  window.addEventListener('keydown', onInteraction, { passive: true });
}
