import React, { useState, useEffect, useRef } from 'react';
import { HudCard } from './HudCard';
import { ShellMetalId } from '../utils/metalThemes';
import { NeonColorId, getNeonTheme } from '../utils/neonThemes';
import { soundManager } from '../utils/audio';
import { Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, Repeat, Shuffle, Upload } from 'lucide-react';

interface MediaControllerWidgetProps {
  shellMetal?: ShellMetalId;
  neonTheme?: NeonColorId;
}

interface Track {
  id: string;
  title: string;
  artist: string;
  duration: number; // seconds
  genre: string;
  src?: string;
}

const DEFAULT_TRACK_LIST: Track[] = [
  { id: '1', title: 'NEON MATRIX PULSE', artist: 'AETHER SYNTH', duration: 184, genre: 'CYBERSYNTH' },
  { id: '2', title: 'QUANTUM RESONANCE', artist: 'NULL POINTER', duration: 215, genre: 'DARK AMBIENT' },
  { id: '3', title: 'OVERCLOCK OVERDRIVE', artist: 'NEO TOKYO', duration: 168, genre: 'INDUSTRIAL' },
  { id: '4', title: 'VOIDWALKER HARMONICS', artist: 'SECTOR 7', duration: 240, genre: 'RETROWAVE' },
];

const DEFAULT_EQ_BARS = [12, 16, 14, 18, 15, 17, 22, 18, 14, 15, 12, 10];

export const MediaControllerWidget: React.FC<MediaControllerWidgetProps> = ({
  shellMetal = 'gold',
  neonTheme = 'amber',
}) => {
  const neon = getNeonTheme(neonTheme);
  const [tracks, setTracks] = useState<Track[]>(DEFAULT_TRACK_LIST);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [sourceMode, setSourceMode] = useState<'host' | 'local'>('host');
  const [isLooping, setIsLooping] = useState(false);
  const [isShuffling, setIsShuffling] = useState(false);
  const [equalizerBars, setEqualizerBars] = useState<number[]>(DEFAULT_EQ_BARS);
  const [hostMedia, setHostMedia] = useState<{
    title?: string;
    artist?: string;
    album?: string;
    status?: string;
    volume?: number;
    isMuted?: boolean;
    position?: number;
    duration?: number;
  } | null>(null);
  const [isUserDraggingVol, setIsUserDraggingVol] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const oscNodesRef = useRef<OscillatorNode[]>([]);
  const gainNodeRef = useRef<GainNode | null>(null);
  const voiceBusRef = useRef<GainNode | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const playbackOwnerRef = useRef<'user' | 'host' | 'none'>('none');

  const activeTrack = tracks[currentTrackIndex] || tracks[0];

  const hasHostMedia = Boolean(hostMedia && hostMedia.title && hostMedia.title !== 'Rhiona Aether Synth');
  const effectiveMode = (hasHostMedia && sourceMode === 'host') ? 'host' : 'local';
  const displayDuration = (effectiveMode === 'host' && hostMedia?.duration && hostMedia.duration > 0)
    ? hostMedia.duration
    : activeTrack.duration;

  // Poll real OS MPRIS and system audio state
  useEffect(() => {
    let isMounted = true;
    const fetchMediaStatus = async () => {
      try {
        const res = await fetch('/api/media/status');
        if (!res.ok) return;
        const data = await res.json();
        if (!isMounted) return;
        const info = data.media || data;
        if (info && info.title) {
          setHostMedia(info);
          if (typeof info.volume === 'number' && !isUserDraggingVol) {
            setVolume(info.volume);
          }
          if (typeof info.isMuted === 'boolean') {
            setIsMuted(info.isMuted);
          }
          if (typeof info.position === 'number' && info.position >= 0) {
            setCurrentTime(info.position);
          }
          if (playbackOwnerRef.current === 'user') {
            // keep the widget's own playback state untouched if user is playing custom file
          } else if (info.status === 'Playing') {
            playbackOwnerRef.current = 'host';
            setIsPlaying(true);
          } else {
            playbackOwnerRef.current = 'host';
            setIsPlaying(false);
          }
        }
      } catch {
        // ignore
      }
    };

    fetchMediaStatus();
    const interval = setInterval(fetchMediaStatus, 2000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isUserDraggingVol]);

  const ensureAudioContext = () => {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioCtx();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    if (!analyserRef.current) {
      analyserRef.current = ctx.createAnalyser();
      analyserRef.current.fftSize = 64;
      analyserRef.current.smoothingTimeConstant = 0.6;
    }

    if (!gainNodeRef.current) {
      gainNodeRef.current = ctx.createGain();
      // Start silent and ramp smoothly to avoid a burst/click on first play
      gainNodeRef.current.gain.setValueAtTime(0.0001, ctx.currentTime);
      gainNodeRef.current.gain.setTargetAtTime((volume / 100) * 0.15, ctx.currentTime, 0.05);
      gainNodeRef.current.connect(analyserRef.current);
      analyserRef.current.connect(ctx.destination);
    }
    return ctx;
  };

  const stopPlayback = () => {
    // Return control to the poll so a paused widget can seamlessly mirror the
    // external player again. Any user re-start will flip it back to 'user'.
    playbackOwnerRef.current = 'none';
    const ctx = audioCtxRef.current;
    const oscs = oscNodesRef.current;

    // Fade the synth voice bus out before stopping so it exits with zero
    // artifacts instead of an abrupt click/buzz. Schedules the oscillators
    // to stop just after the fade completes.
    if (ctx && voiceBusRef.current && oscs.length) {
      const now = ctx.currentTime;
      const voiceBus = voiceBusRef.current;
      voiceBus.gain.cancelScheduledValues(now);
      voiceBus.gain.setValueAtTime(Math.max(voiceBus.gain.value, 0.0001), now);
      voiceBus.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
      oscs.forEach((osc) => {
        try {
          osc.stop(now + 0.11);
        } catch {
          // ignore
        }
      });
      // Disconnect after the fade/stop window so the graph cleans up
      setTimeout(() => {
        oscs.forEach((osc) => {
          try {
            osc.disconnect();
          } catch {
            // ignore
          }
        });
        voiceBus.disconnect();
      }, 150);
      voiceBusRef.current = null;
    } else {
      oscs.forEach((osc) => {
        try {
          osc.stop();
          osc.disconnect();
        } catch {
          // ignore
        }
      });
    }
    oscNodesRef.current = [];

    if (audioElementRef.current) {
      audioElementRef.current.pause();
    }
  };

  const startPlayback = () => {
    stopPlayback();
    playbackOwnerRef.current = 'user';
    const ctx = ensureAudioContext();

    if (activeTrack.src) {
      if (!audioElementRef.current) {
        audioElementRef.current = new Audio();
        audioElementRef.current.crossOrigin = 'anonymous';
      }
      const audio = audioElementRef.current;
      audio.src = activeTrack.src;
      audio.volume = volume / 100;
      audio.currentTime = currentTime;
      audio.play().catch(console.warn);

      if (!sourceNodeRef.current && gainNodeRef.current) {
        try {
          sourceNodeRef.current = ctx.createMediaElementSource(audio);
          sourceNodeRef.current.connect(gainNodeRef.current);
        } catch {
          // ignore
        }
      }
      return;
    }

    // Real synthesized harmonic chords (soft, enveloped — no harsh buzz)
    try {
      const baseFreqs = currentTrackIndex === 0
        ? [110, 164.81, 220, 329.63]
        : currentTrackIndex === 1
        ? [82.41, 123.47, 164.81, 246.94]
        : currentTrackIndex === 2
        ? [130.81, 196.00, 261.63, 392.00]
        : [98.00, 146.83, 196.00, 293.66];

      const now = ctx.currentTime;

      // Per-playback voice bus with a soft attack so starting is click-free
      const voiceBus = ctx.createGain();
      voiceBus.gain.setValueAtTime(0.0001, now);
      voiceBus.gain.exponentialRampToValueAtTime(1, now + 0.08);
      if (gainNodeRef.current) {
        voiceBus.connect(gainNodeRef.current);
      }
      voiceBusRef.current = voiceBus;

      const oscs: OscillatorNode[] = [];
      baseFreqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(Math.min(2800, freq * 3.5 + 350), now);
        filter.Q.setValueAtTime(0.6, now);

        osc.type = idx % 2 === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, now);

        // Per-voice level control: keeps the summed chord well below the
        // clipping threshold instead of pumping 4 raw oscillators straight
        // into the shared master gain (the source of the buzzing distortion)
        const oscGain = ctx.createGain();
        oscGain.gain.setValueAtTime(0.5, now);

        osc.connect(filter);
        filter.connect(oscGain);
        oscGain.connect(voiceBus);
        osc.start(now);
        oscs.push(osc);
      });

      oscNodesRef.current = oscs;
    } catch (err) {
      console.warn('Audio synthesis note:', err);
    }
  };

  const handleTogglePlay = async () => {
    soundManager.playClick();

    if (effectiveMode === 'host') {
      const nextPlaying = !isPlaying;
      setIsPlaying(nextPlaying);
      try {
        const res = await fetch('/api/media/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'toggle' }),
        });
        if (res.ok) {
          const data = await res.json();
          const info = data.media || data;
          if (info) {
            setHostMedia(info);
            setIsPlaying(info.status === 'Playing');
            if (typeof info.position === 'number' && info.position >= 0) {
              setCurrentTime(info.position);
            }
          }
        }
      } catch (err) {
        console.warn('Media control toggle error:', err);
      }
      return;
    }

    const nextState = !isPlaying;
    setIsPlaying(nextState);
    if (nextState) {
      startPlayback();
    } else {
      stopPlayback();
      setEqualizerBars(DEFAULT_EQ_BARS);
    }
  };

  const handleNext = async (automatic = false) => {
    if (!automatic) soundManager.playClick();

    if (effectiveMode === 'host') {
      try {
        const res = await fetch('/api/media/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'next' }),
        });
        if (res.ok) {
          const data = await res.json();
          const info = data.media || data;
          if (info) {
            setHostMedia(info);
            setIsPlaying(info.status === 'Playing');
            if (typeof info.position === 'number' && info.position >= 0) {
              setCurrentTime(info.position);
            }
          }
        }
      } catch (err) {
        console.warn('Next track error:', err);
      }
      return;
    }

    const nextIdx = isShuffling
      ? Math.floor(Math.random() * tracks.length)
      : (currentTrackIndex + 1) % tracks.length;
    setCurrentTrackIndex(nextIdx);
    setCurrentTime(0);
    if (isPlaying) {
      setTimeout(() => startPlayback(), 50);
    }
  };

  const handlePrev = async () => {
    soundManager.playClick();

    if (effectiveMode === 'host') {
      try {
        const res = await fetch('/api/media/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'previous' }),
        });
        if (res.ok) {
          const data = await res.json();
          const info = data.media || data;
          if (info) {
            setHostMedia(info);
            setIsPlaying(info.status === 'Playing');
            if (typeof info.position === 'number' && info.position >= 0) {
              setCurrentTime(info.position);
            }
          }
        }
      } catch (err) {
        console.warn('Prev track error:', err);
      }
      return;
    }

    const prevIdx = (currentTrackIndex - 1 + tracks.length) % tracks.length;
    setCurrentTrackIndex(prevIdx);
    setCurrentTime(0);
    if (isPlaying) {
      setTimeout(() => startPlayback(), 50);
    }
  };

  const handleSeek = async (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, clickX / rect.width));
    const targetTime = Math.round(pct * displayDuration);
    setCurrentTime(targetTime);

    if (effectiveMode === 'host') {
      try {
        await fetch('/api/media/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: `seek:${targetTime}` }),
        });
      } catch {
        // ignore
      }
    } else if (audioElementRef.current) {
      audioElementRef.current.currentTime = targetTime;
    }
  };

  const handleToggleMute = async () => {
    soundManager.playClick();
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    try {
      const res = await fetch('/api/media/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle_mute' }),
      });
      if (res.ok) {
        const data = await res.json();
        const info = data.media || data;
        if (info && typeof info.isMuted === 'boolean') {
          setIsMuted(info.isMuted);
        }
      }
    } catch {
      // ignore
    }
  };

  const handleVolumeChange = async (newVol: number) => {
    setVolume(newVol);
    if (gainNodeRef.current && audioCtxRef.current) {
      const t = audioCtxRef.current.currentTime;
      const gain = gainNodeRef.current.gain;
      gain.cancelScheduledValues(t);
      gain.setValueAtTime(Math.max(gain.value, 0.0001), t);
      gain.setTargetAtTime((newVol / 100) * 0.15, t, 0.035);
    }
    if (audioElementRef.current) {
      audioElementRef.current.volume = newVol / 100;
    }
    try {
      await fetch('/api/media/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: `volume:${(newVol / 100).toFixed(2)}` }),
      });
    } catch {
      // ignore
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    const customTrack: Track = {
      id: `custom-${Date.now()}`,
      title: file.name.replace(/\.[^/.]+$/, '').toUpperCase(),
      artist: 'LOCAL AUDIO',
      duration: 180,
      genre: 'USER TRACK',
      src: url,
    };

    setTracks((prev) => [customTrack, ...prev]);
    setCurrentTrackIndex(0);
    setCurrentTime(0);
    setSourceMode('local');
    setIsPlaying(true);
    setTimeout(() => startPlayback(), 100);
  };

  // Real-time FFT Frequency Data Extraction for Live Equalizer
  useEffect(() => {
    let animId: number;

    const updateEq = () => {
      if (isPlaying) {
        if (analyserRef.current && !hasHostMedia) {
          const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(dataArray);

          const bars: number[] = [];
          const step = Math.floor(dataArray.length / 12);
          for (let i = 0; i < 12; i++) {
            const val = dataArray[i * step] || 0;
            const percent = Math.min(100, Math.max(12, Math.round((val / 255) * 100)));
            bars.push(percent);
          }
          setEqualizerBars(bars);
        } else {
          // Dynamic pulsing cybernetic wave equalizer for host media
          const time = Date.now() / 140;
          const simulated = DEFAULT_EQ_BARS.map((base, idx) => {
            const wave = Math.sin(time + idx * 0.7) * 32 + Math.cos(time * 0.75 + idx * 0.35) * 22;
            return Math.min(100, Math.max(14, Math.round(base + wave)));
          });
          setEqualizerBars(simulated);
        }
      } else {
        setEqualizerBars(DEFAULT_EQ_BARS);
      }
      animId = requestAnimationFrame(updateEq);
    };

    animId = requestAnimationFrame(updateEq);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, hasHostMedia]);

  // Track playback time counter
  useEffect(() => {
    let interval: any;
    if (isPlaying) {
      interval = setInterval(() => {
        if (audioElementRef.current && activeTrack.src && !hasHostMedia) {
          setCurrentTime(Math.floor(audioElementRef.current.currentTime));
          return;
        }

        setCurrentTime((prev) => {
          if (prev >= displayDuration) {
            if (isLooping) return 0;
            if (!hasHostMedia) handleNext(true);
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying, displayDuration, isLooping, hasHostMedia]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <HudCard tag="PORT_06 // MEDIA_SYNTH" dockSide="right" shellMetal={shellMetal}>
      <div className="flex flex-col h-full flex-1 select-none justify-between">
        {/* Hidden Audio File Picker */}
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={handleFileUpload}
        />

        {/* Header Bar */}
        <div className="flex items-center justify-between pb-1 border-b border-stone-800/80 gap-1">
          <div className="flex items-center space-x-1.5 min-w-0">
            <span
              className={`w-2 h-2 rounded-full flex-shrink-0 ${isPlaying ? 'animate-ping' : ''}`}
              style={{ backgroundColor: neon.glowColor, boxShadow: `0 0 8px ${neon.glowColor}` }}
            />
            <span 
              className="font-orbitron font-bold tracking-wider text-[11px] uppercase whitespace-nowrap truncate"
              style={{ color: neon.glowColor }}
            >
              MEDIA CONTROLLER
            </span>
          </div>

          <div className="flex items-center space-x-1 text-[9px] flex-shrink-0 font-tech">
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Load Local Audio File"
              className="px-1 py-0.2 border border-stone-700 bg-stone-900 text-stone-300 hover:text-white rounded flex items-center gap-0.5 cursor-pointer"
            >
              <Upload className="w-2.5 h-2.5" />
              <span>LOAD</span>
            </button>
            <button
              onClick={() => {
                soundManager.playClick();
                if (effectiveMode === 'host') {
                  setSourceMode('local');
                  if (isPlaying) {
                    fetch('/api/media/control', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'pause' }),
                    }).catch(() => {});
                    setIsPlaying(false);
                  }
                } else {
                  setSourceMode('host');
                  if (isPlaying) {
                    stopPlayback();
                    setIsPlaying(false);
                  }
                }
              }}
              title={`Source: ${effectiveMode === 'host' ? 'MPRIS (Host Audio)' : 'LOCAL (Synthesizer)'} - Click to switch`}
              className="px-1.5 py-0.2 border border-stone-700 bg-stone-900 font-bold rounded font-orbitron hover:border-stone-500 cursor-pointer transition-colors"
              style={{ color: neon.glowColor }}
            >
              {effectiveMode === 'host' ? 'MPRIS' : 'SYNTH'}
            </button>
            <span className="font-bold" style={{ color: isPlaying ? neon.glowColor : '#78716c' }}>
              {isPlaying ? 'PLAY' : 'PAUSE'}
            </span>
          </div>
        </div>

        {/* Track Title Display */}
        <div className="py-0.5 font-tech">
          <div 
            className="text-xs font-bold text-stone-100 truncate tracking-wide font-orbitron"
            title={effectiveMode === 'host' ? hostMedia?.title : activeTrack.title}
          >
            {effectiveMode === 'host' ? hostMedia?.title : activeTrack.title}
          </div>
          <div className="flex justify-between text-[9.5px] text-stone-400 font-tech">
            <span className="truncate">
              {effectiveMode === 'host'
                ? (hostMedia?.artist || hostMedia?.album || 'System Audio')
                : activeTrack.artist}
            </span>
            <span style={{ color: neon.glowColor }}>
              {effectiveMode === 'host' && hostMedia?.status
                ? `HOST [${hostMedia.status.toUpperCase()}]`
                : (isPlaying ? 'SYNTH [ACTIVE]' : 'STANDBY')}
            </span>
          </div>
        </div>

        {/* Live FFT Frequency Spectrum Equalizer */}
        <div className="h-5 w-full bg-black/80 border border-stone-800 rounded px-1.5 py-0.5 flex items-end justify-between gap-1">
          {equalizerBars.map((height, idx) => (
            <div key={idx} className="flex-1 bg-stone-900 rounded-t overflow-hidden flex flex-col justify-end h-full">
              <div
                className="w-full transition-all duration-100 rounded-t"
                style={{
                  height: `${height}%`,
                  backgroundColor: isPlaying ? neon.glowColor : '#57534e',
                  boxShadow: isPlaying ? `0 0 6px ${neon.glowColor}` : 'none',
                }}
              />
            </div>
          ))}
        </div>

        {/* Progress Seeker Bar */}
        <div className="space-y-0.5 pt-0.5 font-tech">
          <div className="flex justify-between text-[9px] text-stone-400 font-tech">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(displayDuration)}</span>
          </div>
          <div
            onClick={handleSeek}
            title="Click to seek"
            className="w-full py-1 -my-1 cursor-pointer group"
          >
            <div className="w-full bg-stone-900 h-1.5 group-hover:h-2 rounded overflow-hidden border border-stone-800 group-hover:border-stone-600 transition-all">
              <div
                className="h-full transition-all duration-200"
                style={{
                  width: `${Math.min(100, (currentTime / Math.max(1, displayDuration)) * 100)}%`,
                  backgroundColor: neon.glowColor,
                  boxShadow: `0 0 6px ${neon.glowColor}`,
                }}
              />
            </div>
          </div>
        </div>

        {/* Primary Playback Transport Controls */}
        <div className="flex items-center justify-between pt-1 border-t border-stone-800/80 font-tech">
          <div className="flex items-center space-x-1">
            <button
              onClick={() => {
                soundManager.playClick();
                setIsShuffling(!isShuffling);
              }}
              className="p-1 border rounded transition-colors cursor-pointer"
              style={{
                borderColor: isShuffling ? neon.glowColor : '#44403c',
                color: isShuffling ? neon.glowColor : '#78716c',
                backgroundColor: isShuffling ? `${neon.glowColor}25` : 'transparent',
              }}
            >
              <Shuffle className="w-3 h-3" />
            </button>
            <button
              onClick={() => {
                soundManager.playClick();
                setIsLooping(!isLooping);
              }}
              className="p-1 border rounded transition-colors cursor-pointer"
              style={{
                borderColor: isLooping ? neon.glowColor : '#44403c',
                color: isLooping ? neon.glowColor : '#78716c',
                backgroundColor: isLooping ? `${neon.glowColor}25` : 'transparent',
              }}
            >
              <Repeat className="w-3 h-3" />
            </button>
          </div>

          <div className="flex items-center space-x-1">
            <button
              onClick={handlePrev}
              className="p-1 border border-stone-700 bg-stone-900 text-stone-300 hover:text-white transition-colors cursor-pointer rounded"
            >
              <SkipBack className="w-3 h-3" />
            </button>
            <button
              onClick={handleTogglePlay}
              className="px-2.5 py-0.5 border font-bold text-[10px] transition-all cursor-pointer flex items-center space-x-1 rounded font-orbitron bg-stone-900"
              style={{
                borderColor: neon.glowColor,
                color: neon.glowColor,
                boxShadow: isPlaying ? `0 0 8px ${neon.glowColor}44` : 'none',
              }}
            >
              {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" style={{ color: neon.glowColor }} />}
              <span>{isPlaying ? 'PAUSE' : 'PLAY'}</span>
            </button>
            <button
              onClick={handleNext}
              className="p-1 border border-stone-700 bg-stone-900 text-stone-300 hover:text-white transition-colors cursor-pointer rounded"
            >
              <SkipForward className="w-3 h-3" />
            </button>
          </div>

          {/* Volume Control */}
          <div className="flex items-center space-x-1 text-stone-400">
            <button
              onClick={handleToggleMute}
              title={isMuted ? "Unmute system" : "Mute system"}
              className="p-0.5 hover:text-stone-200 cursor-pointer transition-colors"
            >
              {isMuted ? (
                <VolumeX className="w-3 h-3 text-red-400" />
              ) : (
                <Volume2 className="w-3 h-3 text-stone-400 hover:text-stone-200" />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="100"
              value={isMuted ? 0 : volume}
              title={`Volume: ${isMuted ? 'Muted' : `${volume}%`}`}
              onMouseDown={() => setIsUserDraggingVol(true)}
              onMouseUp={() => setIsUserDraggingVol(false)}
              onTouchStart={() => setIsUserDraggingVol(true)}
              onTouchEnd={() => setIsUserDraggingVol(false)}
              onChange={(e) => handleVolumeChange(Number(e.target.value))}
              className="w-12 h-1 bg-stone-800 rounded appearance-none cursor-pointer"
              style={{ accentColor: isMuted ? '#ef4444' : neon.glowColor }}
            />
            <span className="text-[8.5px] w-6 text-right font-mono text-stone-400">
              {isMuted ? 'MUTE' : `${volume}%`}
            </span>
          </div>
        </div>
      </div>
    </HudCard>
  );
};
