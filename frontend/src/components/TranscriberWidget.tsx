import React, { useState, useRef, useEffect } from 'react';
import { HudCard } from './HudCard';
import { ShellMetalId } from '../utils/metalThemes';
import { NeonColorId, getNeonTheme } from '../utils/neonThemes';
import { VoiceState, voiceManager } from '../utils/voiceManager';
import { Mic, MicOff, Send, Volume2, Copy, Check, Trash2, Radio, Cpu, Sparkles, Activity } from 'lucide-react';
import { soundManager } from '../utils/audio';

interface TranscriberWidgetProps {
  shellMetal?: ShellMetalId;
  neonTheme?: NeonColorId;
  voiceState?: VoiceState;
  onToggleVoice?: () => void;
  onOpenDiagnostics?: () => void;
  onSendMessage?: (msg: string) => void;
  transcript?: string;
  aiResponse?: string;
  errorMessage?: string;
  audioLevel?: number;
  lastTranscript?: string;
}

interface ConversationItem {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
}

export const TranscriberWidget: React.FC<TranscriberWidgetProps> = ({
  shellMetal = 'gold',
  neonTheme = 'amber',
  voiceState = 'idle',
  onToggleVoice,
  onOpenDiagnostics,
  onSendMessage,
  transcript,
  aiResponse,
  errorMessage,
  audioLevel = 0,
  lastTranscript,
}) => {
  const neon = getNeonTheme(neonTheme);
  const [inputText, setInputText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [history, setHistory] = useState<ConversationItem[]>([
    {
      id: 'init-1',
      sender: 'ai',
      text: 'Gemini Live Speech-to-Speech link ready. Speak into microphone.',
      timestamp: 'ONLINE',
    },
  ]);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Sync incoming user transcript
  useEffect(() => {
    const activeText = transcript || lastTranscript;
    if (activeText) {
      setHistory((prev) => {
        const lastIdx = prev.length - 1;
        const lastItem = prev[lastIdx];
        if (lastItem && lastItem.sender === 'user') {
          const updated = [...prev];
          updated[lastIdx] = {
            ...lastItem,
            text: activeText,
          };
          return updated;
        }
        return [
          ...prev,
          {
            id: `tx-${Date.now()}`,
            sender: 'user',
            text: activeText,
            timestamp: new Date().toLocaleTimeString('en-US', { hour12: false, minute: '2-digit', second: '2-digit' }),
          },
        ];
      });
    }
  }, [transcript, lastTranscript]);

  // Sync incoming AI response (streaming token updates)
  useEffect(() => {
    if (aiResponse) {
      setHistory((prev) => {
        const lastIdx = prev.length - 1;
        const lastItem = prev[lastIdx];
        if (lastItem && lastItem.sender === 'ai' && !lastItem.id.startsWith('init-')) {
          const updated = [...prev];
          updated[lastIdx] = {
            ...lastItem,
            text: aiResponse,
          };
          return updated;
        }
        return [
          ...prev,
          {
            id: `ai-${Date.now()}`,
            sender: 'ai',
            text: aiResponse,
            timestamp: new Date().toLocaleTimeString('en-US', { hour12: false, minute: '2-digit', second: '2-digit' }),
          },
        ];
      });
    }
  }, [aiResponse]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, voiceState]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    soundManager.playClick();
    const query = inputText.trim();
    setInputText('');

    setHistory((prev) => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        sender: 'user',
        text: query,
        timestamp: new Date().toLocaleTimeString('en-US', { hour12: false, minute: '2-digit', second: '2-digit' }),
      },
    ]);

    onSendMessage?.(query);
  };

  const handleCopy = (item: ConversationItem) => {
    navigator.clipboard.writeText(item.text);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const isConnected = voiceState !== 'idle' && voiceState !== 'error';

  // Rich State Visualizer Configuration
  const getStateConfig = () => {
    switch (voiceState) {
      case 'connecting':
        return {
          title: 'CONNECTING',
          subtitle: 'Opening Gemini Live conduit...',
          icon: <Radio className="w-3.5 h-3.5 text-sky-400 animate-pulse" />,
          bg: 'bg-sky-950/60 border-sky-500/60 text-sky-300',
          dot: 'bg-sky-400 shadow-[0_0_8px_#38bdf8]',
        };
      case 'listening':
        return {
          title: 'LISTENING',
          subtitle: 'Ready for voice input...',
          icon: <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />,
          bg: 'bg-emerald-950/50 border-emerald-500/50 text-emerald-300',
          dot: 'bg-emerald-400 shadow-[0_0_8px_#34d399]',
        };
      case 'user_speaking':
        return {
          title: 'HEARING YOU',
          subtitle: 'Capturing vocal waveform...',
          icon: <Activity className="w-3.5 h-3.5 text-amber-400 animate-bounce" />,
          bg: 'bg-amber-950/60 border-amber-500/60 text-amber-300',
          dot: 'bg-amber-400 shadow-[0_0_8px_#fbbf24]',
        };
      case 'thinking':
        return {
          title: 'THINKING',
          subtitle: 'LiquidAI computing response...',
          icon: <Cpu className="w-3.5 h-3.5 text-sky-400 animate-spin" />,
          bg: 'bg-sky-950/60 border-sky-500/60 text-sky-300',
          dot: 'bg-sky-400 shadow-[0_0_8px_#38bdf8]',
        };
      case 'speaking':
        return {
          title: 'SPEAKING',
          subtitle: 'Streaming vocal synthesis...',
          icon: <Volume2 className="w-3.5 h-3.5 text-indigo-400 animate-bounce" />,
          bg: 'bg-indigo-950/60 border-indigo-500/60 text-indigo-300',
          dot: 'bg-indigo-400 shadow-[0_0_8px_#818cf8]',
        };
      case 'interrupted':
        return {
          title: 'INTERRUPTED',
          subtitle: 'Barge-in detected...',
          icon: <Radio className="w-3.5 h-3.5 text-red-400 animate-pulse" />,
          bg: 'bg-red-950/60 border-red-500/60 text-red-300',
          dot: 'bg-red-400 shadow-[0_0_8px_#f87171]',
        };
      case 'error':
        return {
          title: 'LINK ERROR',
          // Show the real reason (mic denied, stale session, bad config) instead of a
          // generic "check server configuration" that sends you down the wrong path.
          subtitle: errorMessage || 'Voice link failed — click LOGS for details, then retry',
          icon: <Radio className="w-3.5 h-3.5 text-rose-400" />,
          bg: 'bg-rose-950/60 border-rose-500/60 text-rose-300',
          dot: 'bg-rose-400 shadow-[0_0_8px_#fb7185]',
        };
      default:
        return {
          title: 'STANDBY',
          subtitle: 'Click mic to activate voice link',
          icon: <MicOff className="w-3.5 h-3.5 text-stone-500" />,
          bg: 'bg-stone-900/60 border-stone-800 text-stone-400',
          dot: 'bg-stone-600',
        };
    }
  };

  const stateCfg = getStateConfig();

  return (
    <HudCard tag="PORT_01 // TRANSCRIBER" dockSide="left" shellMetal={shellMetal}>
      <div className="flex flex-col h-full flex-1 select-none justify-between">
        {/* Header Bar */}
        <div className="flex items-center justify-between pb-1 border-b border-stone-800/80 gap-1">
          <div className="flex items-center space-x-1.5 min-w-0">
            <span
              className={`w-2 h-2 rounded-full flex-shrink-0 transition-colors ${stateCfg.dot}`}
            />
            <span 
              className="font-orbitron font-bold tracking-wider text-[11px] uppercase whitespace-nowrap truncate"
              style={{ color: neon.glowColor }}
            >
              VOICE S25 _
            </span>
          </div>

          <div className="flex items-center space-x-1 flex-shrink-0 font-tech">
            <button
              onClick={async () => {
                soundManager.playClick();
                await voiceManager.captureSystemAudio();
              }}
              className="px-1.5 py-0.5 rounded border border-cyan-800 hover:border-cyan-400 text-[9px] font-bold text-cyan-400 hover:text-cyan-200 transition-all cursor-pointer bg-cyan-950/40"
              title="Capture Direct YouTube/System Audio for 100% Digital Visualizer Reaction (Great for Headphones)"
            >
              SYS AUDIO
            </button>

            {onOpenDiagnostics && (
              <button
                onClick={() => {
                  soundManager.playClick();
                  onOpenDiagnostics();
                }}
                className="px-1.5 py-0.5 rounded border border-stone-700 hover:border-amber-500/80 text-[9px] font-bold text-stone-400 hover:text-amber-300 transition-all cursor-pointer bg-stone-950"
                title="Open Live Diagnostics & Packet Logger"
              >
                LOGS
              </button>
            )}

            {onToggleVoice && (
              <button
                onClick={() => {
                  soundManager.playClick();
                  onToggleVoice();
                }}
                className="px-1.5 py-0.5 rounded border text-[9px] font-bold flex items-center space-x-1 transition-all cursor-pointer bg-stone-900/90"
                style={{
                  borderColor: isConnected ? neon.glowColor : '#44403c',
                  color: isConnected ? neon.glowColor : '#a8a29e',
                  boxShadow: isConnected ? `0 0 8px ${neon.glowColor}44` : 'none',
                }}
                title={isConnected ? 'Disconnect Live S2S' : 'Connect Live Voice Speech-to-Speech'}
              >
                {voiceState === 'speaking' ? (
                  <Volume2 className="w-3 h-3 animate-bounce" style={{ color: neon.glowColor }} />
                ) : isConnected ? (
                  <Mic className="w-3 h-3 text-emerald-400" />
                ) : (
                  <MicOff className="w-3 h-3 text-stone-500" />
                )}
                <span>{isConnected ? stateCfg.title : 'MIC OFF'}</span>
              </button>
            )}

            {history.length > 0 && (
              <button
                onClick={() => {
                  soundManager.playClick();
                  setHistory([]);
                }}
                className="text-stone-500 hover:text-white transition-colors p-0.5 cursor-pointer"
                title="Clear Transcript History"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Tactical Live State Readout Banner */}
        <div className={`flex items-center justify-between px-2 py-1 my-0.5 rounded border text-[10px] font-tech transition-all duration-300 ${stateCfg.bg}`}>
          <div className="flex items-center space-x-1.5">
            {stateCfg.icon}
            <span className="font-orbitron font-bold tracking-wider">{stateCfg.title}</span>
            <span className="text-[9px] opacity-75 hidden sm:inline">— {stateCfg.subtitle}</span>
          </div>

          {/* Equalizer Micro-Waveform */}
          {isConnected && (
            <div className="flex items-center space-x-0.5 h-3">
              <span className={`w-0.5 rounded-full ${voiceState === 'user_speaking' ? 'bg-amber-400 animate-bounce h-3' : voiceState === 'speaking' ? 'bg-indigo-400 animate-pulse h-2.5' : 'bg-emerald-400 h-1.5'}`} />
              <span className={`w-0.5 rounded-full ${voiceState === 'user_speaking' ? 'bg-amber-300 animate-pulse h-2' : voiceState === 'speaking' ? 'bg-indigo-300 animate-bounce h-3' : 'bg-emerald-500 h-2'}`} />
              <span className={`w-0.5 rounded-full ${voiceState === 'user_speaking' ? 'bg-amber-500 animate-bounce h-3.5' : voiceState === 'speaking' ? 'bg-indigo-500 animate-pulse h-2' : 'bg-emerald-400 h-1'}`} />
              <span className={`w-0.5 rounded-full ${voiceState === 'user_speaking' ? 'bg-amber-400 animate-pulse h-2' : voiceState === 'speaking' ? 'bg-indigo-400 animate-bounce h-2.5' : 'bg-emerald-500 h-1.5'}`} />
            </div>
          )}
        </div>

        {/* Live Active Speech Recognition Monitor (Shows exactly what the mic is hearing) */}
        {voiceState === 'user_speaking' && (
          <div className="flex items-center space-x-1.5 px-2 py-1 my-0.5 rounded bg-amber-950/70 border border-amber-500/70 text-amber-200 text-[10px] font-tech animate-pulse shadow-[0_0_12px_rgba(245,158,11,0.25)]">
            <Mic className="w-3 h-3 text-amber-400 animate-bounce flex-shrink-0" />
            <div className="flex-1 truncate">
              <span className="font-bold font-orbitron text-[9px] text-amber-400 mr-1">HEARING:</span>
              <span className="italic">{transcript || 'Listening to your speech...'}</span>
              <span className="animate-ping font-bold ml-0.5 text-amber-400">|</span>
            </div>
          </div>
        )}

        {/* Scrollable Conversation Matrix */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto no-scrollbar space-y-1 my-0.5 pr-0.5 min-h-[50px] max-h-[110px]"
        >
          {history.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-stone-500 text-[10px] font-tech space-y-0.5 py-1">
              <Radio className="w-3.5 h-3.5 text-stone-600 animate-pulse" />
              <span>VOCAL LINK READY // SPEAK OR TYPE</span>
            </div>
          ) : (
            history.map((item) => (
              <div
                key={item.id}
                className="p-1 rounded border transition-all bg-stone-950/85 border-stone-800 text-stone-200"
              >
                <div className="flex items-center justify-between text-[8px] font-tech text-stone-400 pb-0.5 mb-0.5 border-b border-stone-800/80">
                  <span className="font-bold font-orbitron" style={{ color: neon.glowColor }}>
                    {item.sender === 'user' ? 'YOU [USER]' : 'CHOLA_AI'}
                  </span>
                  <div className="flex items-center space-x-1">
                    <span>{item.timestamp}</span>
                    <button
                      onClick={() => handleCopy(item)}
                      className="text-stone-400 hover:text-white cursor-pointer ml-1"
                      title="Copy text"
                    >
                      {copiedId === item.id ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
                    </button>
                  </div>
                </div>
                <div className="font-tech text-[10px] leading-snug break-words font-medium text-stone-200">
                  {item.text}
                </div>
              </div>
            ))
          )}

          {/* Live In-Feed Activity Indicators */}
          {voiceState === 'user_speaking' && (
            <div className="flex items-center space-x-1.5 p-1 rounded bg-amber-950/40 border border-amber-800/50 text-amber-300 text-[9.5px] font-tech animate-pulse">
              <Activity className="w-3 h-3 text-amber-400 animate-bounce" />
              <span>Recording your speech in real time...</span>
            </div>
          )}

          {voiceState === 'thinking' && (
            <div className="flex items-center space-x-1.5 p-1 rounded bg-sky-950/40 border border-sky-800/50 text-sky-300 text-[9.5px] font-tech animate-pulse">
              <Cpu className="w-3 h-3 text-sky-400 animate-spin" />
              <span>Rhiona reasoning & computing vocal reply...</span>
            </div>
          )}
        </div>

        {/* Direct Text Input & Send Row */}
        <form onSubmit={handleSend} className="pt-1 border-t border-stone-800/80 flex items-center gap-1 font-tech">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type command or query..."
            className="flex-1 bg-stone-950/90 border border-stone-700/80 px-2 py-0.5 text-[10px] text-stone-100 placeholder-stone-500 outline-none rounded-none font-tech"
            style={{
              borderColor: inputText ? neon.glowColor : '#44403c',
            }}
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="px-2 py-0.5 disabled:opacity-30 border text-[9.5px] font-bold transition-colors cursor-pointer flex items-center space-x-1 whitespace-nowrap font-orbitron bg-stone-900 hover:bg-amber-950/50"
            style={{
              borderColor: neon.glowColor,
              color: neon.glowColor,
            }}
          >
            <Send className="w-2.5 h-2.5" style={{ color: neon.glowColor }} />
            <span>SEND</span>
          </button>
        </form>
      </div>
    </HudCard>
  );
};
