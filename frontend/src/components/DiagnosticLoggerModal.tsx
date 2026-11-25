import React, { useState, useEffect, useRef } from 'react';
import { voiceManager, LogEntry, VoiceState } from '../utils/voiceManager';
import { ShellMetalId, getShellMetalTheme } from '../utils/metalThemes';
import { NeonColorId, getNeonTheme } from '../utils/neonThemes';
import { X, Trash2, Activity, Terminal, Mic, Check, CheckCircle2, Play, Loader2 } from 'lucide-react';
import { soundManager } from '../utils/audio';
import { GEMINI_LIVE_VOICES } from './TabModal';

interface DiagnosticLoggerModalProps {
  isOpen: boolean;
  onClose: () => void;
  shellMetal?: ShellMetalId;
  neonTheme?: NeonColorId;
  voiceState?: VoiceState;
  audioLevel?: number;
}

export const DiagnosticLoggerModal: React.FC<DiagnosticLoggerModalProps> = ({
  isOpen,
  onClose,
  shellMetal = 'gold',
  neonTheme = 'amber',
  voiceState = 'idle',
  audioLevel = 0,
}) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<string>('ALL');
  const [currentRms, setCurrentRms] = useState<number>(0);
  const [threshold, setThreshold] = useState<number>(voiceManager.vadThreshold);
  const [pauseMs, setPauseMs] = useState<number>(voiceManager.pauseMs);
  const [bargeIn, setBargeIn] = useState<number>(voiceManager.bargeInThreshold);
  const [selectedVoice, setSelectedVoice] = useState<string>(voiceManager.selectedVoice || 'Puck');
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [testingVoiceId, setTestingVoiceId] = useState<string | null>(null);
  const logFeedRef = useRef<HTMLDivElement>(null);

  const shell = getShellMetalTheme(shellMetal);
  const neon = getNeonTheme(neonTheme);

  useEffect(() => {
    setLogs([...voiceManager.logs]);

    const handleLog = (entry: LogEntry) => {
      setLogs((prev) => [entry, ...prev.slice(0, 199)]);
    };

    voiceManager.onLog = handleLog;

    // Only burn an 80ms timer (and 12.5 re-renders/sec) while the modal is actually open.
    if (!isOpen) return;

    setThreshold(voiceManager.vadThreshold);
    setPauseMs(voiceManager.pauseMs);
    setBargeIn(voiceManager.bargeInThreshold);
    setSelectedVoice(voiceManager.selectedVoice || 'Puck');

    const interval = setInterval(() => {
      setCurrentRms(voiceManager.currentMicLevel);
    }, 80);

    return () => {
      clearInterval(interval);
    };
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSave = () => {
    soundManager.playClick();
    voiceManager.setVoice(selectedVoice);
    voiceManager.updateConfig({
      vad_threshold: threshold,
      pause_ms: pauseMs,
      barge_in_threshold: bargeIn,
    });
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2400);
  };

  const handleTestVoice = async () => {
    soundManager.playClick();
    setTestingVoiceId(selectedVoice);
    await voiceManager.previewVoice(selectedVoice);
    setTestingVoiceId(null);
  };

  const filteredLogs = filter === 'ALL' ? logs : logs.filter((l) => l.category === filter);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div 
        className={`relative w-full max-w-4xl max-h-[88vh] flex flex-col rounded-xl border ${shell.panel.borderClass} ${shell.panel.bgClass} text-stone-200 font-mono shadow-2xl overflow-hidden`}
        style={{
          boxShadow: `0 0 35px ${neon.glowColor}22`,
        }}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-800 bg-stone-950/80">
          <div className="flex items-center space-x-2.5">
            <Terminal className="w-4 h-4" style={{ color: neon.glowColor }} />
            <span className="font-orbitron font-bold text-sm tracking-wider uppercase" style={{ color: neon.glowColor }}>
              GEMINI LIVE S2S DIAGNOSTICS & VOICE CONFIG
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-stone-900 border border-stone-700 text-stone-400">
              gemini-3.1-flash-live
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                voiceManager.logs = [];
                setLogs([]);
              }}
              className="p-1.5 rounded hover:bg-stone-800 text-stone-400 hover:text-stone-200 transition-colors text-xs flex items-center gap-1 cursor-pointer"
              title="Clear Log History"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>CLEAR</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-stone-800 text-stone-400 hover:text-stone-200 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Live Telemetry & Calibration Dashboard Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-black/60 border-b border-stone-800 text-xs">
          {/* 1. VAD State & Live RMS */}
          <div className="flex flex-col p-2 rounded bg-stone-900/80 border border-stone-800">
            <div className="flex justify-between items-center text-[9px] text-stone-500 font-bold">
              <span>STATE // RMS</span>
              <span className="font-tech text-stone-400">{(currentRms * 1000).toFixed(1)} / {(threshold * 1000).toFixed(1)}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <span 
                className="w-2 h-2 rounded-full animate-pulse flex-shrink-0"
                style={{
                  backgroundColor: voiceState === 'speaking' ? '#38bdf8' : voiceState === 'user_speaking' ? '#22c55e' : voiceState === 'thinking' ? '#f59e0b' : '#64748b',
                }}
              />
              <span className="font-bold uppercase tracking-wider text-[10px] truncate" style={{ color: neon.glowColor }}>
                {voiceState}
              </span>
            </div>
            <div className="relative w-full h-1.5 bg-stone-950 rounded-full mt-1.5 overflow-hidden border border-stone-800">
              <div 
                className="h-full transition-all duration-75"
                style={{
                  width: `${Math.min(100, (currentRms / 0.08) * 100)}%`,
                  backgroundColor: currentRms >= threshold ? '#22c55e' : '#f59e0b',
                }}
              />
              <div 
                className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
                style={{ left: `${Math.min(100, (threshold / 0.08) * 100)}%` }}
              />
            </div>
          </div>

          {/* 2. Mic VAD Sensitivity Slider */}
          <div className="flex flex-col p-2 rounded bg-stone-900/80 border border-stone-800">
            <div className="flex justify-between items-center text-[9px] text-stone-500 font-bold">
              <span>MIC SENSITIVITY</span>
              <span className="text-amber-400 font-bold">{threshold.toFixed(3)}</span>
            </div>
            <input 
              type="range"
              min="0.008"
              max="0.060"
              step="0.001"
              value={threshold}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setThreshold(val);
                voiceManager.updateConfig({ vad_threshold: val });
              }}
              className="w-full h-1 mt-2 accent-amber-400 cursor-pointer"
            />
            <span className="text-[8px] text-stone-500 mt-1">Lower = more sensitive</span>
          </div>

          {/* 3. Turn-Taking Pause Delay */}
          <div className="flex flex-col p-2 rounded bg-stone-900/80 border border-stone-800">
            <div className="flex justify-between items-center text-[9px] text-stone-500 font-bold">
              <span>TURN-TAKING PAUSE</span>
              <span className="text-sky-400 font-bold">{pauseMs}ms</span>
            </div>
            <input 
              type="range"
              min="350"
              max="1500"
              step="50"
              value={pauseMs}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                setPauseMs(val);
                voiceManager.updateConfig({ pause_ms: val });
              }}
              className="w-full h-1 mt-2 accent-sky-400 cursor-pointer"
            />
            <span className="text-[8px] text-stone-500 mt-1">Silence before AI replies</span>
          </div>

          {/* 4. Interruption / Barge-in Sensitivity */}
          <div className="flex flex-col p-2 rounded bg-stone-900/80 border border-stone-800">
            <div className="flex justify-between items-center text-[9px] text-stone-500 font-bold">
              <span>BARGE-IN CUTOFF</span>
              <span className="text-indigo-400 font-bold">{bargeIn.toFixed(3)}</span>
            </div>
            <input 
              type="range"
              min="0.030"
              max="0.160"
              step="0.005"
              value={bargeIn}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setBargeIn(val);
                voiceManager.updateConfig({ barge_in_threshold: val });
              }}
              className="w-full h-1 mt-2 accent-indigo-400 cursor-pointer"
            />
            <span className="text-[8px] text-stone-500 mt-1">Voice volume to interrupt AI</span>
          </div>
        </div>

        {/* Gemini Live Voice Selection Row */}
        <div className="px-3 py-2.5 bg-stone-950 border-b border-stone-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center space-x-2">
            <Mic className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-bold text-[11px] text-stone-300">GEMINI LIVE VOICE:</span>
            <div className="flex flex-wrap gap-1">
              {GEMINI_LIVE_VOICES.map((v) => (
                <button
                  key={v.id}
                  onClick={() => {
                    soundManager.playClick();
                    setSelectedVoice(v.id);
                  }}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-all cursor-pointer ${
                    selectedVoice === v.id
                      ? 'bg-amber-400 text-black font-extrabold shadow-[0_0_8px_rgba(251,191,36,0.5)]'
                      : 'bg-stone-900 text-stone-400 hover:text-stone-200 border border-stone-800'
                  }`}
                  title={`${v.desc} (${v.gender})`}
                >
                  {v.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <button
              onClick={handleTestVoice}
              disabled={testingVoiceId === selectedVoice}
              className="flex-1 sm:flex-initial px-3 py-1.5 rounded font-orbitron font-bold text-[10px] uppercase tracking-wider flex items-center justify-center space-x-1.5 transition-all cursor-pointer bg-stone-900 border border-amber-500/50 text-amber-300 hover:bg-stone-800 active:scale-98"
            >
              {testingVoiceId === selectedVoice ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>TESTING...</span>
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 fill-current" />
                  <span>TEST {selectedVoice.toUpperCase()}</span>
                </>
              )}
            </button>

            <button
              onClick={handleSave}
              className="flex-1 sm:flex-initial px-3.5 py-1.5 rounded font-orbitron font-extrabold text-[11px] uppercase tracking-wider flex items-center justify-center space-x-1.5 transition-all cursor-pointer bg-gradient-to-r from-amber-500 to-orange-500 text-black shadow-md hover:brightness-110 active:scale-98"
            >
              {isSaved ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>SAVED!</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>SAVE</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Filter Categories */}
        <div className="flex items-center gap-1 px-3 py-1.5 bg-stone-950 border-b border-stone-800/80 text-[10px] overflow-x-auto">
          {['ALL', 'WS', 'MIC', 'VAD', 'MODEL', 'ASR', 'AUDIO', 'ERR'].map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`px-2 py-0.5 rounded transition-all cursor-pointer font-bold ${
                filter === cat
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-stone-900 text-stone-400 hover:text-stone-200 border border-transparent'
              }`}
            >
              {cat}
            </button>
          ))}
          <span className="ml-auto text-stone-500 text-[9px]">
            {filteredLogs.length} events logged
          </span>
        </div>

        {/* Log Stream Feed */}
        <div 
          ref={logFeedRef}
          className="flex-1 min-h-[260px] max-h-[44vh] overflow-y-auto p-3 space-y-1 bg-black/90 font-mono text-[11px] select-text"
        >
          {filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-stone-600">
              <Activity className="w-8 h-8 mb-2 animate-pulse opacity-40" />
              <span>No diagnostics captured yet. Turn on VOICE S2S to view live packet streaming.</span>
            </div>
          ) : (
            filteredLogs.map((entry) => {
              let badgeColor = 'text-stone-400 bg-stone-900 border-stone-800';
              if (entry.category === 'WS') badgeColor = 'text-sky-400 bg-sky-950/60 border-sky-800/50';
              if (entry.category === 'MIC') badgeColor = 'text-emerald-400 bg-emerald-950/60 border-emerald-800/50';
              if (entry.category === 'VAD') badgeColor = 'text-amber-400 bg-amber-950/60 border-amber-800/50';
              if (entry.category === 'MODEL') badgeColor = 'text-purple-400 bg-purple-950/60 border-purple-800/50';
              if (entry.category === 'ASR') badgeColor = 'text-green-400 bg-green-950/60 border-green-800/50';
              if (entry.category === 'AUDIO') badgeColor = 'text-cyan-400 bg-cyan-950/60 border-cyan-800/50';
              if (entry.category === 'ERR') badgeColor = 'text-red-400 bg-red-950/60 border-red-800/50';

              let textLevel = 'text-stone-300';
              if (entry.level === 'success') textLevel = 'text-emerald-300';
              if (entry.level === 'warn') textLevel = 'text-amber-300';
              if (entry.level === 'error') textLevel = 'text-red-400 font-bold';

              return (
                <div key={entry.id} className="flex items-start space-x-2 py-0.5 border-b border-stone-900/60 leading-relaxed font-tech">
                  <span className="text-stone-600 text-[10px] flex-shrink-0">{entry.time}</span>
                  <span className={`text-[9px] px-1 py-0.2 rounded border font-bold flex-shrink-0 ${badgeColor}`}>
                    {entry.category}
                  </span>
                  <span className={`flex-1 break-words ${textLevel}`}>
                    {entry.message}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-4 py-2 bg-stone-950 border-t border-stone-800 text-[10px] text-stone-500">
          <span>Gemini Live S2S Gateway • WebSocket Endpoint at /ws/live (Active: {selectedVoice})</span>
          <span>Press ESC or Click Outside to close</span>
        </div>
      </div>
    </div>
  );
};
