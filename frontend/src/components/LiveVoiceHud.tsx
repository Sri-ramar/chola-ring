import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, Volume2, Radio, AlertCircle } from 'lucide-react';
import { ShellMetalId, getShellMetalTheme } from '../utils/metalThemes';
import { NeonColorId, getNeonTheme } from '../utils/neonThemes';
import { VoiceState } from '../utils/voiceManager';

interface LiveVoiceHudProps {
  voiceState: VoiceState;
  onToggleVoice: () => void;
  shellMetal: ShellMetalId;
  neonTheme?: NeonColorId;
  audioLevel: number;
  transcript: string;
  aiResponse: string;
  errorMessage?: string;
  onSendCommand?: (command: string) => void;
}

export const LiveVoiceHud: React.FC<LiveVoiceHudProps> = ({
  voiceState,
  onToggleVoice,
  shellMetal,
  neonTheme = 'amber',
  audioLevel,
  transcript,
  aiResponse,
  errorMessage,
  onSendCommand,
}) => {
  const metalTheme = getShellMetalTheme(shellMetal);
  const neon = getNeonTheme(neonTheme);

  const isConnected = voiceState !== 'idle' && voiceState !== 'error';
  const isListening = voiceState === 'listening';
  const isSpeaking = voiceState === 'speaking';
  const isConnecting = voiceState === 'connecting';

  // Equalizer bar heights based on audio level
  const eqBars = Array.from({ length: 9 }).map((_, i) => {
    if (!isConnected) return 15;
    const offset = Math.sin(i * 0.8) * 0.3;
    const base = isSpeaking ? 0.65 : isListening ? 0.45 : 0.15;
    const dynamic = Math.min(1, Math.max(0.1, (audioLevel + base + offset) * 100));
    return Math.max(12, Math.min(100, dynamic));
  });

  return (
    <div className="w-full flex flex-col items-center select-none font-tech">
      {/* Main Tactical Voice Control Capsule */}
      <div 
        className={`relative flex items-center space-x-3 px-4 py-2.5 rounded-xl border backdrop-blur-xl shadow-2xl transition-all duration-300 ${metalTheme.panel.bgClass} ${
          isSpeaking || isListening
            ? `${metalTheme.panel.borderClass} ring-1 ring-amber-400/30`
            : metalTheme.panel.borderClass
        }`}
      >
        {/* Glowing live corner accents */}
        <div 
          className="absolute -top-1 -left-1 w-2 h-2 rounded-tl border-t-2 border-l-2" 
          style={{ borderColor: isConnected ? neon.glowColor : metalTheme.panel.cornerBracketColor }}
        />
        <div 
          className="absolute -top-1 -right-1 w-2 h-2 rounded-tr border-t-2 border-r-2" 
          style={{ borderColor: isConnected ? neon.glowColor : metalTheme.panel.cornerBracketColor }}
        />

        {/* Mic Activation Button */}
        <button
          id="btn-voice-toggle"
          onClick={onToggleVoice}
          className="relative group/mic flex items-center justify-center w-10 h-10 rounded-lg border transition-all duration-300 cursor-pointer bg-stone-900/90"
          style={{
            borderColor: isConnected ? neon.glowColor : '#44403c',
            color: isConnected ? neon.glowColor : '#d6d3d1',
            boxShadow: isConnected ? `0 0 14px ${neon.glowColor}66` : 'none',
          }}
          title={isConnected ? 'Click to deactivate Voice Link' : 'Click to activate Gemini Live Speech-to-Speech'}
        >
          {isConnecting ? (
            <Radio className="w-5 h-5 animate-pulse" style={{ color: neon.glowColor }} />
          ) : isSpeaking ? (
            <Volume2 className="w-5 h-5 animate-bounce" style={{ color: neon.glowColor }} />
          ) : isListening ? (
            <Mic className="w-5 h-5" style={{ color: neon.glowColor }} />
          ) : (
            <MicOff className="w-5 h-5 text-stone-500" />
          )}

          {/* Active indicator ring */}
          {isConnected && (
            <span
              className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border border-black animate-ping"
              style={{ backgroundColor: neon.glowColor }}
            />
          )}
        </button>

        {/* Status & Telemetry Readout */}
        <div className="flex flex-col min-w-[170px]">
          <div className="flex items-center space-x-2">
            <span className="text-[9px] uppercase tracking-widest font-tech text-stone-400 font-bold">
              GEMINI LIVE S2S:
            </span>
            <span 
              className="text-[10px] font-extrabold uppercase font-orbitron tracking-wider px-1.5 py-0.5 rounded border bg-black/60"
              style={{
                borderColor: isConnected ? `${neon.glowColor}99` : '#44403c',
                color: isConnected ? neon.glowColor : '#a8a29e',
                boxShadow: isConnected ? `0 0 8px ${neon.glowColor}44` : 'none',
              }}
            >
              {isConnecting
                ? 'LINKING...'
                : isSpeaking
                ? 'TRANSMITTING'
                : isListening
                ? 'LISTENING'
                : 'STANDBY'}
            </span>
          </div>

          {/* Voice Engine Subtitle */}
          <div className="flex items-center space-x-1.5 mt-0.5 font-tech">
            <span className="text-[8.5px] text-stone-400">
              AUDIO BUS:
            </span>
            <span className="text-[9px] font-bold font-orbitron" style={{ color: neon.glowColor }}>
              24-BIT / 48kHz
            </span>
            <span className="text-[8.5px] text-stone-500">⟷</span>
            <span className="text-[9px] font-bold font-tech text-stone-300">
              PCM LOW LATENCY
            </span>
          </div>
        </div>

        {/* Mini Realtime Audio Equalizer Bars */}
        <div className="flex items-center space-x-1 h-7 px-2 py-1 bg-black/60 rounded border border-white/5">
          {eqBars.map((heightPercent, idx) => (
            <motion.div
              key={idx}
              className="w-1 rounded-full transition-all duration-100"
              style={{
                height: `${heightPercent}%`,
                backgroundColor: isConnected ? neon.glowColor : '#57534e',
                boxShadow: isConnected ? `0 0 6px ${neon.glowColor}` : 'none',
              }}
            />
          ))}
        </div>

        {/* Quick Voice Command Chips */}
        {onSendCommand && (
          <div className="hidden sm:flex items-center space-x-1.5 pl-1 border-l border-stone-800">
            <button
              onClick={() => onSendCommand('Overclock core')}
              className="text-[8.5px] font-tech px-2 py-1 bg-stone-900/90 hover:bg-stone-800 border border-stone-700 hover:border-amber-400 text-stone-300 hover:text-amber-300 rounded transition-all cursor-pointer whitespace-nowrap"
            >
              ⚡ Overclock
            </button>
            <button
              onClick={() => onSendCommand('Switch chassis shell')}
              className="text-[8.5px] font-tech px-2 py-1 bg-stone-900/90 hover:bg-stone-800 border border-stone-700 hover:border-amber-400 text-stone-300 hover:text-amber-300 rounded transition-all cursor-pointer whitespace-nowrap"
            >
              🛡️ Shell
            </button>
          </div>
        )}
      </div>

      {/* Live Voice Dialog & Transcription Card (Appears during speech activity) */}
      <AnimatePresence>
        {(transcript || aiResponse || errorMessage) && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.96 }}
            transition={{ duration: 0.25 }}
            className={`mt-2 max-w-lg w-full px-4 py-2.5 rounded-xl border backdrop-blur-xl shadow-2xl ${metalTheme.panel.bgClass} ${metalTheme.panel.borderClass} z-30 font-tech text-xs`}
          >
            {/* Error Display */}
            {errorMessage && (
              <div className="flex items-center space-x-2 text-rose-400 mb-1">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span className="text-[11px] font-tech">{errorMessage}</span>
              </div>
            )}

            {/* User Transcript */}
            {transcript && (
              <div className="flex items-start space-x-2 text-stone-300 mb-1 font-tech">
                <span 
                  className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-stone-800 font-bold border flex-shrink-0 mt-0.5 font-orbitron"
                  style={{ color: neon.glowColor, borderColor: `${neon.glowColor}66` }}
                >
                  YOU
                </span>
                <span className="text-[11px] text-stone-200 leading-relaxed italic font-tech">
                  "{transcript}"
                </span>
              </div>
            )}

            {/* AI Response */}
            {aiResponse && (
              <div className="flex items-start space-x-2 mt-1.5 pt-1.5 border-t border-white/5 font-tech">
                <span 
                  className="text-[9px] uppercase px-1.5 py-0.5 rounded font-bold border flex-shrink-0 mt-0.5 font-orbitron"
                  style={{ 
                    borderColor: neon.glowColor, 
                    color: neon.glowColor,
                    backgroundColor: `${neon.glowColor}22` 
                  }}
                >
                  AETHER CORE
                </span>
                <span 
                  className="text-[11px] font-tech font-medium leading-relaxed text-stone-100"
                >
                  {aiResponse}
                </span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
