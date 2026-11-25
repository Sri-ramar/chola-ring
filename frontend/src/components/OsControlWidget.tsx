import React, { useState, useEffect, useRef } from 'react';
import { HudCard } from './HudCard';
import { ShellMetalId } from '../utils/metalThemes';
import { NeonColorId, getNeonTheme } from '../utils/neonThemes';
import { soundManager } from '../utils/audio';
import { Terminal, Cpu, Sliders, Shield, Zap, RefreshCw } from 'lucide-react';

interface OsControlWidgetProps {
  shellMetal?: ShellMetalId;
  neonTheme?: NeonColorId;
  isOverclocked?: boolean;
  onToggleOverclock?: () => void;
  onRunDiagnostics?: () => void;
  onActionTrigger?: (actionName: string) => void;
  externalShellOutput?: {
    command?: string;
    output?: string;
  } | null;
}

export const OsControlWidget: React.FC<OsControlWidgetProps> = ({
  shellMetal = 'gold',
  neonTheme = 'amber',
  isOverclocked = false,
  onToggleOverclock,
  onRunDiagnostics,
  onActionTrigger,
  externalShellOutput = null,
}) => {
  const neon = getNeonTheme(neonTheme);
  const [activeTab, setActiveTab] = useState<'tools' | 'terminal'>('tools');

  // OS Info State
  const [osInfo, setOsInfo] = useState<{
    platform: string;
    kernel: string;
    hostname: string;
    arch: string;
    uptime: string;
  }>({
    platform: 'Linux',
    kernel: '6.x',
    hostname: 'host',
    arch: 'x86_64',
    uptime: '0m',
  });

  const [containmentLock, setContainmentLock] = useState(true);
  const [fanMode, setFanMode] = useState<'max' | 'auto'>('auto');
  const [fanRpm, setFanRpm] = useState<{ fan1: number; fan2: number }>({ fan1: 0, fan2: 0 });
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pendingFanTarget, setPendingFanTarget] = useState<'max' | 'auto'>('max');
  const [sudoPassword, setSudoPassword] = useState('');
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string>('');

  // Terminal state
  const [cmdInput, setCmdInput] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [terminalHistory, setTerminalHistory] = useState<string[]>([
    'AETHER OS KERNEL // REAL-TIME CONSOLE READY',
    'Commands: status, fan (status|max|auto), top, free, gpu, df, uptime.',
  ]);
  const termEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!externalShellOutput) return;
    const command = externalShellOutput.command || 'assistant tool';
    const lines = (externalShellOutput.output || 'Command completed.').split('\n');
    setTerminalHistory((prev) => [...prev.slice(-24), `> ${command}`, ...lines]);
    setActiveTab('terminal');
  }, [externalShellOutput]);

  // Poll real system info
  const fetchOsInfo = async () => {
    try {
      const res = await fetch('/api/system/telemetry');
      if (!res.ok) return;
      const data = await res.json();
      if (data.os) {
        const hrs = Math.floor((data.os.uptime_seconds || 0) / 3600);
        const mins = Math.floor(((data.os.uptime_seconds || 0) % 3600) / 60);
        setOsInfo({
          platform: (data.os.platform || 'linux').toUpperCase(),
          kernel: data.os.kernel || '6.x',
          hostname: data.os.hostname || 'rhiona-core',
          arch: data.os.arch || 'x86_64',
          uptime: `${hrs}h ${mins}m`,
        });
      }
      if (data.fan) {
        setFanMode(data.fan.mode === 'max' ? 'max' : 'auto');
        setFanRpm({ fan1: data.fan.fan1_rpm || 0, fan2: data.fan.fan2_rpm || 0 });
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchOsInfo();
    const interval = setInterval(fetchOsInfo, 6000);
    return () => clearInterval(interval);
  }, []);

  const triggerFeedback = (msg: string) => {
    setActionFeedback(msg);
    setTimeout(() => setActionFeedback(''), 2200);
  };

  const toggleFan = async (targetMode?: 'max' | 'auto', password?: string) => {
    const nextMode = targetMode || (fanMode === 'max' ? 'auto' : 'max');
    try {
      soundManager.playClick();
      const res = await fetch('/api/system/fan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: nextMode, password }),
      });
      const data = await res.json();
      if (data.need_password) {
        setPendingFanTarget(nextMode);
        setShowPasswordModal(true);
        triggerFeedback('AUTH REQUIRED');
        return;
      }
      if (data.success) {
        setFanMode(nextMode);
        if (data.fan1_rpm) setFanRpm({ fan1: data.fan1_rpm, fan2: data.fan2_rpm });
        setShowPasswordModal(false);
        setSudoPassword('');
        triggerFeedback(nextMode === 'max' ? 'FANS 100%' : 'FANS AUTO');
        setTerminalHistory((prev) => [
          ...prev.slice(-24),
          `[FAN] Switched to ${nextMode.toUpperCase()} mode (${data.fan1_rpm || 0} / ${data.fan2_rpm || 0} RPM).`,
        ]);
      } else {
        triggerFeedback('FAN CMD FAILED');
      }
    } catch {
      triggerFeedback('NETWORK ERROR');
    }
  };

  const executeCommand = async (cmd: string) => {
    const cleanCmd = cmd.trim();
    if (!cleanCmd) return;

    soundManager.playClick();
    setCmdInput('');
    setIsExecuting(true);

    const lower = cleanCmd.toLowerCase();

    if (lower === 'clear') {
      setTerminalHistory([]);
      setIsExecuting(false);
      return;
    }

    if (lower === 'boost' || lower === 'overclock') {
      onToggleOverclock?.();
      triggerFeedback(isOverclocked ? 'BOOST OFF' : 'BOOST ENGAGED');
      setTerminalHistory((prev) => [...prev, `> ${cleanCmd}`, `Core boost toggled: ${!isOverclocked ? 'ACTIVE' : 'OFF'}`]);
      setIsExecuting(false);
      return;
    }

    setTerminalHistory((prev) => [...prev, `> ${cleanCmd}`]);

    try {
      // JSON, not a form body: a form POST is a CORS "simple request" that any web
      // page could fire at this bridge from a browser, which made /api/system/execute
      // remote code execution. JSON forces a preflight, and the bridge rejects
      // cross-origin callers outright.
      const res = await fetch('/api/system/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmd: cleanCmd }),
      });

      if (res.ok) {
        const data = await res.json();
        const lines = (data.output || 'OK').split('\n');
        setTerminalHistory((prev) => [...prev.slice(-30), ...lines]);
        triggerFeedback('EXECUTED');
      } else {
        setTerminalHistory((prev) => [...prev, 'Command execution failed.']);
      }
    } catch (err: any) {
      setTerminalHistory((prev) => [...prev, `Error: ${err?.message || 'Request failed'}`]);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleTerminalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeCommand(cmdInput);
  };

  return (
    <HudCard tag="PORT_02 // OS_TOOL_CTRL" dockSide="left" shellMetal={shellMetal}>
      <div className="flex flex-col h-full flex-1 select-none justify-between">
        {/* Top Mini Tab Selector */}
        <div className="flex items-center justify-between pb-1 border-b border-stone-800/80 gap-1">
          <div className="flex items-center space-x-1.5 min-w-0">
            <span 
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: neon.glowColor, boxShadow: `0 0 8px ${neon.glowColor}` }}
            />
            <span 
              className="font-orbitron font-bold tracking-wider text-[11px] uppercase whitespace-nowrap truncate"
              style={{ color: neon.glowColor }}
            >
              OS CONTROLLER
            </span>
          </div>

          <div className="flex items-center space-x-1 flex-shrink-0 font-tech">
            {(['tools', 'terminal'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  soundManager.playClick();
                  setActiveTab(tab);
                }}
                className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded transition-colors cursor-pointer border"
                style={{
                  backgroundColor: activeTab === tab ? `${neon.glowColor}25` : 'transparent',
                  borderColor: activeTab === tab ? neon.glowColor : '#44403c',
                  color: activeTab === tab ? neon.glowColor : '#a8a29e',
                }}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Dynamic Tab Body */}
        <div className="flex-1 my-1 overflow-hidden font-tech relative">
          {/* TAB 1: SYSTEM TOOLS */}
          {activeTab === 'tools' && (
            <div className="space-y-1.5 pt-0.5">
              {/* Quick Action Toggles: 3-column grid */}
              <div className="grid grid-cols-3 gap-1">
                {/* 1. BOOST */}
                <button
                  onClick={() => {
                    soundManager.playClick();
                    onToggleOverclock?.();
                    triggerFeedback(isOverclocked ? 'BOOST OFF' : 'BOOST ENGAGED');
                  }}
                  className="p-1 rounded border transition-all text-left flex flex-col justify-between cursor-pointer bg-stone-950/90 hover:bg-stone-900 active:scale-95"
                  style={{
                    borderColor: isOverclocked ? neon.glowColor : '#44403c',
                    boxShadow: isOverclocked ? `0 0 10px ${neon.glowColor}44` : 'none',
                  }}
                >
                  <div className="flex items-center justify-between w-full">
                    <Zap className={`w-3 h-3 ${isOverclocked ? 'animate-pulse' : ''}`} style={{ color: isOverclocked ? neon.glowColor : '#78716c' }} />
                    <span 
                      className="text-[8px] font-bold px-1 rounded font-tech border"
                      style={{
                        backgroundColor: isOverclocked ? `${neon.glowColor}40` : '#1c1917',
                        borderColor: isOverclocked ? neon.glowColor : '#292524',
                        color: isOverclocked ? neon.glowColor : '#78716c',
                      }}
                    >
                      {isOverclocked ? 'ON' : 'OFF'}
                    </span>
                  </div>
                  <span className="text-[9.5px] font-bold font-orbitron text-stone-200 mt-1">BOOST</span>
                </button>

                {/* 2. FAN MAX / AUTO */}
                <button
                  onClick={() => toggleFan()}
                  className="p-1 rounded border transition-all text-left flex flex-col justify-between cursor-pointer bg-stone-950/90 hover:bg-stone-900 active:scale-95"
                  style={{
                    borderColor: fanMode === 'max' ? neon.glowColor : '#44403c',
                    boxShadow: fanMode === 'max' ? `0 0 10px ${neon.glowColor}55` : 'none',
                  }}
                  title="Toggle Full Fan Speed (100% RPM Override)"
                >
                  <div className="flex items-center justify-between w-full">
                    <RefreshCw className={`w-3 h-3 ${fanMode === 'max' ? 'animate-spin' : ''}`} style={{ color: fanMode === 'max' ? neon.glowColor : '#78716c', animationDuration: '0.8s' }} />
                    <span 
                      className="text-[8px] font-bold px-1 rounded font-tech border"
                      style={{
                        backgroundColor: fanMode === 'max' ? `${neon.glowColor}40` : '#1c1917',
                        borderColor: fanMode === 'max' ? neon.glowColor : '#292524',
                        color: fanMode === 'max' ? neon.glowColor : '#78716c',
                      }}
                    >
                      {fanMode === 'max' ? 'MAX' : 'AUTO'}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-[9.5px] font-bold font-orbitron text-stone-200">FAN</span>
                    <span className="text-[7.5px] font-tech text-stone-400 truncate">
                      {fanRpm.fan1 ? `${Math.round(fanRpm.fan1 / 1000)}k` : 'AUTO'}
                    </span>
                  </div>
                </button>

                {/* 3. SHIELD */}
                <button
                  onClick={() => {
                    soundManager.playClick();
                    setContainmentLock(!containmentLock);
                    triggerFeedback(containmentLock ? 'RELEASED' : 'LOCKED');
                  }}
                  className="p-1 rounded border transition-all text-left flex flex-col justify-between cursor-pointer bg-stone-950/90 hover:bg-stone-900 active:scale-95"
                  style={{
                    borderColor: containmentLock ? neon.glowColor : '#44403c',
                    boxShadow: containmentLock ? `0 0 10px ${neon.glowColor}33` : 'none',
                  }}
                >
                  <div className="flex items-center justify-between w-full">
                    <Shield className="w-3 h-3" style={{ color: containmentLock ? neon.glowColor : '#78716c' }} />
                    <span 
                      className="text-[8px] font-bold px-1 rounded font-tech border"
                      style={{
                        backgroundColor: containmentLock ? `${neon.glowColor}30` : '#1c1917',
                        borderColor: containmentLock ? neon.glowColor : '#292524',
                        color: containmentLock ? neon.glowColor : '#78716c',
                      }}
                    >
                      {containmentLock ? 'ACT' : 'BYP'}
                    </span>
                  </div>
                  <span className="text-[9.5px] font-bold font-orbitron text-stone-200 mt-1">SHIELD</span>
                </button>
              </div>

              {/* Password prompt overlay when authorization is needed */}
              {showPasswordModal && (
                <div className="absolute inset-0 bg-stone-950/95 z-20 flex flex-col justify-center p-2 rounded border border-amber-500/80 font-tech">
                  <div className="text-[9px] font-bold font-orbitron text-amber-400 mb-0.5">
                    SUDO AUTH // UNLOCK FAN
                  </div>
                  <div className="text-[8px] text-stone-400 mb-1 leading-tight">
                    Root password required to unlock hardware PWM controller:
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      setIsAuthorizing(true);
                      toggleFan(pendingFanTarget, sudoPassword).finally(() => setIsAuthorizing(false));
                    }}
                    className="flex gap-1"
                  >
                    <input
                      type="password"
                      value={sudoPassword}
                      onChange={(e) => setSudoPassword(e.target.value)}
                      placeholder="Password..."
                      autoFocus
                      disabled={isAuthorizing}
                      className="flex-1 bg-black border border-stone-700 px-1.5 py-0.5 text-[9px] text-stone-100 font-mono outline-none"
                    />
                    <button
                      type="submit"
                      disabled={isAuthorizing || !sudoPassword}
                      className="px-2 py-0.5 text-[8.5px] font-bold font-orbitron rounded border border-amber-500 bg-amber-500/20 text-amber-300 hover:bg-amber-500/40"
                    >
                      {isAuthorizing ? '...' : 'OK'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPasswordModal(false)}
                      className="px-1.5 py-0.5 text-[8.5px] font-tech rounded border border-stone-700 bg-stone-900 text-stone-400 hover:text-stone-200"
                    >
                      X
                    </button>
                  </form>
                </div>
              )}

              {/* Real Host Platform Metadata Panel */}
              <div className="space-y-0.5 bg-stone-950/90 p-1.5 border border-stone-800 rounded font-tech text-[9px] text-stone-300">
                <div className="flex justify-between">
                  <span className="text-stone-400">HOST:</span>
                  <span className="font-bold text-stone-200 font-orbitron truncate">{osInfo.hostname}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-400">KERNEL:</span>
                  <span className="text-stone-200 truncate">{osInfo.platform} {osInfo.kernel.slice(0, 14)} ({osInfo.arch})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-400">UPTIME:</span>
                  <span className="font-bold font-orbitron" style={{ color: neon.glowColor }}>{osInfo.uptime}</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CLI TERMINAL */}
          {activeTab === 'terminal' && (
            <div className="flex flex-col h-full justify-between font-tech">
              <div 
                className="flex-1 overflow-y-auto no-scrollbar bg-black/90 border border-stone-800 rounded p-1 text-[9px] font-tech space-y-0.5 max-h-[78px]"
                style={{ color: neon.glowColor }}
              >
                {terminalHistory.map((line, i) => (
                  <div key={i} className="leading-tight whitespace-pre-wrap">{line}</div>
                ))}
                <div ref={termEndRef} />
              </div>
              <form onSubmit={handleTerminalSubmit} className="pt-1 flex items-center gap-1 font-tech">
                <span className="text-[10px] font-bold" style={{ color: neon.glowColor }}>&gt;</span>
                <input
                  type="text"
                  value={cmdInput}
                  disabled={isExecuting}
                  onChange={(e) => setCmdInput(e.target.value)}
                  placeholder="fan (status|max|auto), top, free, gpu, status, df..."
                  className="flex-1 bg-stone-950/90 border border-stone-700/80 px-1.5 py-0.5 text-[9.5px] text-stone-100 outline-none font-tech"
                  style={{ borderColor: cmdInput ? neon.glowColor : '#44403c' }}
                />
              </form>
            </div>
          )}
        </div>

        {/* Action Status Feedback */}
        <div className="pt-1 border-t border-stone-800/80 flex items-center justify-between text-[9px] text-stone-400 font-tech">
          <span>{osInfo.hostname} // LINUX KERNEL</span>
          <span className="font-bold font-orbitron" style={{ color: neon.glowColor }}>
            {actionFeedback || 'ONLINE'}
          </span>
        </div>
      </div>
    </HudCard>
  );
};
