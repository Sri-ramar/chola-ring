import React, { useState, useEffect } from 'react';
import { HudCard } from './HudCard';
import { ShellMetalId } from '../utils/metalThemes';
import { NeonColorId, getNeonTheme } from '../utils/neonThemes';

interface HardwareTelemetryWidgetProps {
  shellMetal?: ShellMetalId;
  neonTheme?: NeonColorId;
  isOverclocked?: boolean;
  coreTemperature?: number;
  onTelemetryUpdate?: (telemetry: any) => void;
}

export const HardwareTelemetryWidget: React.FC<HardwareTelemetryWidgetProps> = ({
  shellMetal = 'gold',
  neonTheme = 'amber',
  isOverclocked = false,
  coreTemperature = 38,
  onTelemetryUpdate,
}) => {
  const neon = getNeonTheme(neonTheme);
  const [selectedSubTab, setSelectedSubTab] = useState<'cpu' | 'gpu' | 'ram' | 'fan'>('cpu');

  // Real Hardware State
  const [cpuLoad, setCpuLoad] = useState<number>(0);
  const [cpuClock, setCpuClock] = useState<number>(3.8);
  const [cpuCores, setCpuCores] = useState<number>(8);
  const [cpuTemp, setCpuTemp] = useState<number>(coreTemperature);
  const [cpuModel, setCpuModel] = useState<string>('AMD/Intel x86_64');

  const [gpuName, setGpuName] = useState<string>('NVIDIA GPU');
  const [gpuLoad, setGpuLoad] = useState<number>(0);
  const [gpuTemp, setGpuTemp] = useState<number>(0);
  const [gpuVramUsed, setGpuVramUsed] = useState<number>(0);
  const [gpuVramTotal, setGpuVramTotal] = useState<number>(4096);
  const [gpuVramPercent, setGpuVramPercent] = useState<number>(0);

  const [ramUsedGB, setRamUsedGB] = useState<number>(0);
  const [ramTotalGB, setRamTotalGB] = useState<number>(16);
  const [ramPercent, setRamPercent] = useState<number>(0);

  const [fanTelemetry, setFanTelemetry] = useState<{ available: boolean; mode: string; fan1_rpm: number; fan2_rpm: number }>({
    available: false,
    mode: 'auto',
    fan1_rpm: 0,
    fan2_rpm: 0,
  });

  const [sparklineData, setSparklineData] = useState<number[]>([15, 18, 20, 22, 25, 20, 18, 24, 28, 25, 22, 20]);

  // Fetch real telemetry from backend API
  useEffect(() => {
    let isMounted = true;

    const fetchTelemetry = async () => {
      try {
        const res = await fetch('/api/system/telemetry');
        if (!res.ok) return;
        const data = await res.json();
        if (!isMounted) return;

        onTelemetryUpdate?.(data);

        // 1. CPU
        if (data.cpu) {
          const load = Math.round(data.cpu.load || 0);
          setCpuLoad(load);
          setCpuClock(data.cpu.freq_ghz || 3.8);
          setCpuCores(data.cpu.cores || 8);
          setCpuTemp(Math.round(data.cpu.temp || 45));
          if (data.cpu.model) setCpuModel(data.cpu.model);
          setSparklineData((prev) => [...prev.slice(1), Math.max(5, load)]);
        }

        // 2. GPU
        if (data.gpu) {
          setGpuName(data.gpu.name || 'GPU');
          setGpuLoad(Math.round(data.gpu.utilization || 0));
          setGpuTemp(Math.round(data.gpu.temp || 0));
          setGpuVramUsed(data.gpu.vram_used_mb || 0);
          setGpuVramTotal(data.gpu.vram_total_mb || 4096);
          setGpuVramPercent(data.gpu.vram_percent || 0);
        }

        // 3. RAM
        if (data.ram) {
          setRamUsedGB(data.ram.used_gb || 0);
          setRamTotalGB(data.ram.total_gb || 16);
          setRamPercent(Math.round(data.ram.percent || 0));
        }

        // 4. FAN
        if (data.fan) {
          setFanTelemetry({
            available: !!data.fan.available,
            mode: data.fan.mode || 'auto',
            fan1_rpm: data.fan.fan1_rpm || 0,
            fan2_rpm: data.fan.fan2_rpm || 0,
          });
        }
      } catch (err) {
        // Fallback gracefully
      }
    };

    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [onTelemetryUpdate]);

  const displayTemp = cpuTemp;

  // SVG Sparkline path generator
  const maxVal = 100;
  const width = 220;
  const height = 22;
  const points = sparklineData
    .map((val, idx) => {
      const x = (idx / (sparklineData.length - 1)) * width;
      const y = height - (val / maxVal) * height;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <HudCard tag="PORT_04 // HARDWARE_SYS" dockSide="right" shellMetal={shellMetal}>
      <div className="flex flex-col h-full flex-1 select-none justify-between">
        {/* Header Bar with Sub-Tab Toggles */}
        <div className="flex items-center justify-between pb-1 border-b border-stone-800/80 gap-1">
          <div className="flex items-center space-x-1.5 min-w-0">
            <span
              className={`w-2 h-2 rounded-full flex-shrink-0 ${isOverclocked ? 'animate-ping' : ''}`}
              style={{ backgroundColor: neon.glowColor, boxShadow: `0 0 8px ${neon.glowColor}` }}
            />
            <span 
              className="font-orbitron font-bold tracking-wider text-[11px] uppercase whitespace-nowrap truncate"
              style={{ color: neon.glowColor }}
            >
              HARDWARE TELEMETRY
            </span>
          </div>

          <div className="flex items-center space-x-1 flex-shrink-0 font-tech">
            {(['cpu', 'gpu', 'ram', 'fan'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setSelectedSubTab(tab)}
                className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded transition-colors cursor-pointer border"
                style={{
                  backgroundColor: selectedSubTab === tab ? `${neon.glowColor}25` : 'transparent',
                  borderColor: selectedSubTab === tab ? neon.glowColor : '#44403c',
                  color: selectedSubTab === tab ? neon.glowColor : '#a8a29e',
                }}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Quick Stat Summary Strip */}
        <div className="grid grid-cols-3 gap-1 my-0.5 py-0.5 px-1 bg-stone-950/80 border border-stone-800 rounded text-center">
          <div>
            <div className="text-[8px] font-semibold text-stone-400 font-tech">CPU LOAD</div>
            <div className="text-xs font-bold font-orbitron" style={{ color: neon.glowColor }}>{cpuLoad}%</div>
          </div>
          <div>
            <div className="text-[8px] font-semibold text-stone-400 font-tech">GPU {gpuTemp ? `${gpuTemp}°C` : ''}</div>
            <div className="text-xs font-bold font-orbitron" style={{ color: neon.glowColor }}>{gpuLoad}%</div>
          </div>
          <div>
            <div className="text-[8px] font-semibold text-stone-400 font-tech">RAM USED</div>
            <div className="text-xs font-bold font-orbitron" style={{ color: neon.glowColor }}>{ramUsedGB}G</div>
          </div>
        </div>

        {/* Dynamic Detail Body */}
        <div className="flex-1 overflow-hidden space-y-1 pt-0.5 font-tech">
          {selectedSubTab === 'cpu' && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-stone-300 font-tech">
                <span>FREQ: <strong className="font-orbitron" style={{ color: neon.glowColor }}>{cpuClock}GHz</strong></span>
                <span>TEMP: <strong className="font-orbitron" style={{ color: neon.glowColor }}>{displayTemp}°C</strong></span>
                <span>CORES: <strong className="font-orbitron text-stone-200">{cpuCores}T</strong></span>
              </div>

              {/* Sparkline Graph */}
              <div className="h-6 w-full bg-black/80 border border-stone-800 rounded p-0.5 flex items-center relative overflow-hidden">
                <svg className="w-full h-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
                  <polyline
                    fill="none"
                    stroke={neon.glowColor}
                    strokeWidth="1.8"
                    points={points}
                  />
                </svg>
              </div>
            </div>
          )}

          {selectedSubTab === 'gpu' && (
            <div className="space-y-1 font-tech pt-0.5">
              <div className="flex justify-between text-[9.5px] text-stone-300 truncate">
                <span className="truncate">{gpuName}</span>
                <span className="font-bold font-orbitron flex-shrink-0" style={{ color: neon.glowColor }}>{gpuLoad}%</span>
              </div>
              <div className="flex justify-between text-[9px] text-stone-400">
                <span>VRAM: {gpuVramUsed}MB / {gpuVramTotal}MB</span>
                <span>{gpuVramPercent}%</span>
              </div>
              <div className="w-full bg-stone-900 h-1.5 rounded overflow-hidden border border-stone-800">
                <div
                  className="h-full transition-all duration-300"
                  style={{
                    width: `${gpuVramPercent}%`,
                    backgroundColor: neon.glowColor,
                    boxShadow: `0 0 8px ${neon.glowColor}`,
                  }}
                />
              </div>
            </div>
          )}

          {selectedSubTab === 'ram' && (
            <div className="space-y-1 font-tech pt-0.5">
              <div className="flex items-center justify-between text-[10px] text-stone-300">
                <span>RAM: <strong className="font-orbitron" style={{ color: neon.glowColor }}>{ramUsedGB} / {ramTotalGB} GB</strong></span>
                <span>UTILIZATION: <strong className="font-orbitron" style={{ color: neon.glowColor }}>{ramPercent}%</strong></span>
              </div>
              <div className="w-full bg-stone-900 h-1.5 rounded overflow-hidden border border-stone-800">
                <div
                  className="h-full transition-all duration-300"
                  style={{
                    width: `${ramPercent}%`,
                    backgroundColor: neon.glowColor,
                    boxShadow: `0 0 8px ${neon.glowColor}`,
                  }}
                />
              </div>
            </div>
          )}

          {selectedSubTab === 'fan' && (
            <div className="space-y-1 font-tech pt-0.5">
              <div className="flex items-center justify-between text-[10px] text-stone-300">
                <span>FAN 1: <strong className="font-orbitron" style={{ color: neon.glowColor }}>{fanTelemetry.fan1_rpm} RPM</strong></span>
                <span>FAN 2: <strong className="font-orbitron" style={{ color: neon.glowColor }}>{fanTelemetry.fan2_rpm} RPM</strong></span>
              </div>
              <div className="flex items-center justify-between text-[9px] text-stone-400">
                <span>MODE: <strong className="font-orbitron text-stone-200">{fanTelemetry.mode.toUpperCase()}</strong></span>
                <span className="text-[8.5px] font-bold" style={{ color: fanTelemetry.mode === 'max' ? neon.glowColor : '#a8a29e' }}>
                  {fanTelemetry.mode === 'max' ? '100% MAXIMUM' : 'AUTO THERMAL'}
                </span>
              </div>
              <div className="w-full bg-stone-900 h-1.5 rounded overflow-hidden border border-stone-800">
                <div
                  className="h-full transition-all duration-300"
                  style={{
                    width: fanTelemetry.mode === 'max' ? '100%' : `${Math.min(100, Math.round(((fanTelemetry.fan1_rpm || 2500) / 5500) * 100))}%`,
                    backgroundColor: neon.glowColor,
                    boxShadow: `0 0 8px ${neon.glowColor}`,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer Status */}
        <div className="pt-1 border-t border-stone-800/80 flex items-center justify-between text-[9px] text-stone-400 font-tech">
          <span className="truncate">{cpuModel.split(' ')[0]} PLATFORM</span>
          <span className="font-bold font-orbitron" style={{ color: neon.glowColor }}>
            {isOverclocked ? 'BOOST ACTIVE' : 'NOMINAL'}
          </span>
        </div>
      </div>
    </HudCard>
  );
};
