// Web Audio API Synthesizer & Cyberpunk 2077 Sound Effects Engine

class SoundManager {
  private ctx: AudioContext | null = null;
  public enabled: boolean = true;

  // Cyberpunk 2077 Sample Buffers
  private clickBuffer: AudioBuffer | null = null;
  private isClickLoading: boolean = false;

  private jobCompleteBuffer: AudioBuffer | null = null;
  private isJobCompleteLoading: boolean = false;

  private skillBuffer: AudioBuffer | null = null;
  private isSkillLoading: boolean = false;

  private sparkleBuffer: AudioBuffer | null = null;
  private isSparkleLoading: boolean = false;

  constructor() {
    // Try to restore saved user preference if in browser
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('rhiona_sound_enabled');
        if (saved !== null) {
          this.enabled = saved !== 'false';
        }
      } catch {
        // ignore
      }
    }
  }

  public initCtx() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.loadClickBuffer();
        this.loadSparkleBuffer();
        this.loadJobCompleteBuffer();
        this.loadSkillBuffer();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public preload() {
    this.initCtx();
    this.loadClickBuffer();
    this.loadSparkleBuffer();
    this.loadJobCompleteBuffer();
    this.loadSkillBuffer();
  }

  // Load Cyberpunk 2077 "Closing Phone Contacts.mp3" for tactile button clicks
  private async loadClickBuffer() {
    if (this.clickBuffer || this.isClickLoading || !this.ctx) return;
    this.isClickLoading = true;
    try {
      const response = await fetch('/sounds/click.mp3');
      const arrayBuffer = await response.arrayBuffer();
      this.clickBuffer = await this.ctx.decodeAudioData(arrayBuffer);
    } catch {
      // Ignore if fetch fails (falls back to synth click)
    } finally {
      this.isClickLoading = false;
    }
  }

  // Load Cyberpunk 2077 "Job Complete.mp3"
  private async loadJobCompleteBuffer() {
    if (this.jobCompleteBuffer || this.isJobCompleteLoading || !this.ctx) return;
    this.isJobCompleteLoading = true;
    try {
      const response = await fetch('/sounds/cyberpunk/Job%20Complete.mp3');
      const arrayBuffer = await response.arrayBuffer();
      this.jobCompleteBuffer = await this.ctx.decodeAudioData(arrayBuffer);
    } catch {
      // Ignore
    } finally {
      this.isJobCompleteLoading = false;
    }
  }

  // Load Cyberpunk 2077 "Skill Advancing.mp3"
  private async loadSkillBuffer() {
    if (this.skillBuffer || this.isSkillLoading || !this.ctx) return;
    this.isSkillLoading = true;
    try {
      const response = await fetch('/sounds/cyberpunk/Skill%20Advancing.mp3');
      const arrayBuffer = await response.arrayBuffer();
      this.skillBuffer = await this.ctx.decodeAudioData(arrayBuffer);
    } catch {
      // Ignore
    } finally {
      this.isSkillLoading = false;
    }
  }

  private async loadSparkleBuffer() {
    if (this.sparkleBuffer || this.isSparkleLoading || !this.ctx) return;
    this.isSparkleLoading = true;
    try {
      const response = await fetch('/sounds/sparkle_1s.mp3');
      const arrayBuffer = await response.arrayBuffer();
      this.sparkleBuffer = await this.ctx.decodeAudioData(arrayBuffer);
    } catch {
      // Ignore if fetch fails
    } finally {
      this.isSparkleLoading = false;
    }
  }

  /**
   * Primary Button Click Sound
   * Plays the official Cyberpunk 2077 "Closing Phone Contacts" sample with instantaneous zero-latency Web Audio buffer.
   */
  public playClick(volume = 0.55) {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    if (!this.clickBuffer && !this.isClickLoading) {
      this.loadClickBuffer();
    }

    if (this.clickBuffer) {
      try {
        const source = this.ctx.createBufferSource();
        source.buffer = this.clickBuffer;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(volume, this.ctx.currentTime);

        source.connect(gain);
        gain.connect(this.ctx.destination);

        source.start(0);
        return;
      } catch {
        // Fall back to synthesis
      }
    }

    // High-precision Synthesized Fallback Click
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(300, this.ctx.currentTime + 0.05);

      gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.05);
    } catch {
      // Audio context error ignore
    }
  }

  /**
   * Cyberpunk Mission / Job Complete Notification Sound
   */
  public playJobComplete(volume = 0.5) {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    if (!this.jobCompleteBuffer && !this.isJobCompleteLoading) {
      this.loadJobCompleteBuffer();
    }

    if (this.jobCompleteBuffer) {
      try {
        const source = this.ctx.createBufferSource();
        source.buffer = this.jobCompleteBuffer;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(volume, this.ctx.currentTime);

        source.connect(gain);
        gain.connect(this.ctx.destination);

        source.start(0);
        return;
      } catch {
        // Fallback to pulse
      }
    }

    this.playPulse();
  }

  /**
   * Cyberpunk Skill / Overclock / Level Advancing Sound
   */
  public playSkillAdvancing(volume = 0.5) {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    if (!this.skillBuffer && !this.isSkillLoading) {
      this.loadSkillBuffer();
    }

    if (this.skillBuffer) {
      try {
        const source = this.ctx.createBufferSource();
        source.buffer = this.skillBuffer;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(volume, this.ctx.currentTime);

        source.connect(gain);
        gain.connect(this.ctx.destination);

        source.start(0);
        return;
      } catch {
        // Fallback
      }
    }

    this.playOverclock();
  }

  public playPulse() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(120, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(280, this.ctx.currentTime + 0.2);

      gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.25);
    } catch {
      // Audio context error ignore
    }
  }

  public playOverclock() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(600, this.ctx.currentTime + 0.4);

      gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.45);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.45);
    } catch {
      // Audio context error ignore
    }
  }

  public playColorShift() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.12);

      gain.gain.setValueAtTime(0.18, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.15);
    } catch {
      // Audio context error ignore
    }
  }

  public playSteamHiss() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const duration = 2.0; // 2.0 seconds steam blow duration
      const bufferSize = Math.floor(this.ctx.sampleRate * duration);
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const whiteNoise = this.ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(3600, now);
      filter.frequency.linearRampToValueAtTime(3100, now + 1.0);
      filter.frequency.exponentialRampToValueAtTime(650, now + duration);
      filter.Q.setValueAtTime(2.6, now);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.26, now + 0.05); // high-pressure burst attack
      gain.gain.setValueAtTime(0.22, now + 1.6); // sustained high-pressure steam venting for 1.6s
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration); // smooth dissipation

      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      whiteNoise.start(now);
      whiteNoise.stop(now + duration);
    } catch {
      // Audio context error ignore
    }
  }

  public playElectricArc() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    if (!this.sparkleBuffer && !this.isSparkleLoading) {
      this.loadSparkleBuffer();
    }

    if (this.sparkleBuffer) {
      try {
        const source = this.ctx.createBufferSource();
        source.buffer = this.sparkleBuffer;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.65, this.ctx.currentTime);

        source.connect(gain);
        gain.connect(this.ctx.destination);

        source.start(0);
        return;
      } catch {
        // Fall back to synthesis if needed
      }
    }

    try {
      const now = this.ctx.currentTime;
      const duration = 1.0;

      const bufferSize = Math.floor(this.ctx.sampleRate * duration);
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        const spike = Math.random() > 0.82 ? (Math.random() > 0.5 ? 1 : -1) * (0.6 + Math.random() * 0.4) : (Math.random() * 0.15 - 0.075);
        output[i] = spike;
      }

      const noiseSource = this.ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(3200, now);
      filter.frequency.linearRampToValueAtTime(4500, now + 0.3);
      filter.frequency.linearRampToValueAtTime(2400, now + 0.7);
      filter.frequency.exponentialRampToValueAtTime(1200, now + duration);
      filter.Q.setValueAtTime(3.5, now);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.01, now);
      noiseGain.gain.linearRampToValueAtTime(0.18, now + 0.05);
      noiseGain.gain.setValueAtTime(0.16, now + 0.85);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      noiseSource.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.ctx.destination);

      const buzzOsc = this.ctx.createOscillator();
      const buzzGain = this.ctx.createGain();

      buzzOsc.type = 'sawtooth';
      buzzOsc.frequency.setValueAtTime(120, now);
      buzzOsc.frequency.linearRampToValueAtTime(130, now + 0.5);
      buzzOsc.frequency.linearRampToValueAtTime(115, now + duration);

      buzzGain.gain.setValueAtTime(0.01, now);
      buzzGain.gain.linearRampToValueAtTime(0.06, now + 0.04);
      buzzGain.gain.setValueAtTime(0.05, now + 0.88);
      buzzGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      buzzOsc.connect(buzzGain);
      buzzGain.connect(this.ctx.destination);

      noiseSource.start(now);
      noiseSource.stop(now + duration);
      buzzOsc.start(now);
      buzzOsc.stop(now + duration);
    } catch {
      // Audio context error ignore
    }
  }
}

export const soundManager = new SoundManager();

// Automatically prime AudioContext on the user's first interaction with the document
if (typeof window !== 'undefined') {
  const onUserInteraction = () => {
    soundManager.preload();
    window.removeEventListener('pointerdown', onUserInteraction);
    window.removeEventListener('keydown', onUserInteraction);
  };
  window.addEventListener('pointerdown', onUserInteraction, { passive: true });
  window.addEventListener('keydown', onUserInteraction, { passive: true });
}
