import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CoreMetrics, LogMessage, NavTab } from './types';
import { GoldReactorCore } from './components/GoldReactorCore';
import { CircuitTracesSVG } from './components/CircuitTracesSVG';
import { TranscriberWidget } from './components/TranscriberWidget';
import { OsControlWidget } from './components/OsControlWidget';
import { FirecrawlWidget } from './components/FirecrawlWidget';
import { HardwareTelemetryWidget } from './components/HardwareTelemetryWidget';
import { TodoListWidget } from './components/TodoListWidget';
import { MediaControllerWidget } from './components/MediaControllerWidget';
import { BottomNav } from './components/BottomNav';
import { TabModal } from './components/TabModal';
import { NeonColorSwitcher } from './components/NeonColorSwitcher';
import { ShellMetalSwitcher } from './components/ShellMetalSwitcher';
import { LiveVoiceHud } from './components/LiveVoiceHud';
import { StatorMagnetVisualizer } from './components/StatorMagnetVisualizer';
import { DiagnosticLoggerModal } from './components/DiagnosticLoggerModal';
import { soundManager } from './utils/audio';
import { NeonColorId, NEON_THEMES, getNeonTheme } from './utils/neonThemes';
import { ShellMetalId, getShellMetalTheme } from './utils/metalThemes';
import { voiceManager, VoiceState } from './utils/voiceManager';
import { parseVoiceCommand } from './utils/commandParser';

export interface ComponentMeta {
  id: string;
  label: string;
  shortLabel: string;
  category: 'windows' | 'core' | 'visualizers' | 'navigation' | 'header' | 'footer';
  baseW: number;
  baseH: number;
  defaultX: number;
  defaultY: number;
  minW?: number;
  minH?: number;
}

export const ALL_UI_COMPONENTS: Record<string, ComponentMeta> = {
  // 6 Main HUD Windows
  transcriber: {
    id: 'transcriber',
    label: 'PORT 01: Transcriber & Voice S2S',
    shortLabel: 'P01: Transcriber',
    category: 'windows',
    baseW: 278,
    baseH: 184,
    defaultX: 323,
    defaultY: 87,
    minW: 140,
    minH: 80,
  },
  osControl: {
    id: 'osControl',
    label: 'PORT 02: OS Controller & Tool Engine',
    shortLabel: 'P02: OS Control',
    category: 'windows',
    baseW: 295,
    baseH: 170,
    defaultX: 245,
    defaultY: 388,
    minW: 140,
    minH: 80,
  },
  firecrawl: {
    id: 'firecrawl',
    label: 'PORT 03: Firecrawl Search & Scraper',
    shortLabel: 'P03: Firecrawl',
    category: 'windows',
    baseW: 291,
    baseH: 157,
    defaultX: 306,
    defaultY: 656,
    minW: 140,
    minH: 80,
  },
  telemetry: {
    id: 'telemetry',
    label: 'PORT 04: Hardware Telemetry',
    shortLabel: 'P04: Telemetry',
    category: 'windows',
    baseW: 275,
    baseH: 181,
    defaultX: 1076,
    defaultY: 90,
    minW: 140,
    minH: 80,
  },
  todo: {
    id: 'todo',
    label: 'PORT 05: Task Todo Matrix',
    shortLabel: 'P05: Task Todo',
    category: 'windows',
    baseW: 300,
    baseH: 168,
    defaultX: 1133,
    defaultY: 388,
    minW: 140,
    minH: 80,
  },
  media: {
    id: 'media',
    label: 'PORT 06: Media Controller',
    shortLabel: 'P06: Media',
    category: 'windows',
    baseW: 292,
    baseH: 157,
    defaultX: 1073,
    defaultY: 657,
    minW: 140,
    minH: 80,
  },

  // Central Core Reactor
  core: {
    id: 'core',
    label: 'Central Sun Reactor Core',
    shortLabel: 'Reactor Core',
    category: 'core',
    baseW: 300,
    baseH: 300,
    defaultX: 686,
    defaultY: 320,
    minW: 80,
    minH: 80,
  },

  // Left & Right Pillar Visualizers
  leftVisualizer: {
    id: 'leftVisualizer',
    label: 'Left Pillar Stator Magnet Visualizer',
    shortLabel: 'Left Visualizer',
    category: 'visualizers',
    baseW: 34,
    baseH: 386,
    defaultX: 32,
    defaultY: 232,
    minW: 16,
    minH: 60,
  },
  rightVisualizer: {
    id: 'rightVisualizer',
    label: 'Right Pillar Stator Magnet Visualizer',
    shortLabel: 'Right Visualizer',
    category: 'visualizers',
    baseW: 33,
    baseH: 382,
    defaultX: 1607,
    defaultY: 231,
    minW: 16,
    minH: 60,
  },

  // Bottom Navigation Medallions
  bottomNav: {
    id: 'bottomNav',
    label: 'Bottom 5 Medallions Console Nav',
    shortLabel: 'Bottom Nav',
    category: 'navigation',
    baseW: 344,
    baseH: 51,
    defaultX: 664,
    defaultY: 816,
    minW: 120,
    minH: 24,
  },

  // Top Header Components
  headerTitle: {
    id: 'headerTitle',
    label: 'Top-Left Title & Crest Logo',
    shortLabel: 'Header Title',
    category: 'header',
    baseW: 360,
    baseH: 32,
    defaultX: 167,
    defaultY: 3,
    minW: 100,
    minH: 16,
  },
  headerPulse: {
    id: 'headerPulse',
    label: 'Top-Center Core Pulse ECG Oscilloscope',
    shortLabel: 'Header ECG Pulse',
    category: 'header',
    baseW: 240,
    baseH: 32,
    defaultX: 712,
    defaultY: 5,
    minW: 80,
    minH: 16,
  },
  headerStatus: {
    id: 'headerStatus',
    label: 'Top-Right Latency, Core Status & Clock',
    shortLabel: 'Header Status',
    category: 'header',
    baseW: 410,
    baseH: 32,
    defaultX: 1059,
    defaultY: 3,
    minW: 140,
    minH: 16,
  },

  // Bottom 3 Footer Slots
  bottomLeft: {
    id: 'bottomLeft',
    label: 'Bottom-Left Metallurgy & Spectrum Rack',
    shortLabel: 'Bottom-Left Rack',
    category: 'footer',
    baseW: 503,
    baseH: 27,
    defaultX: 18,
    defaultY: 900,
    minW: 120,
    minH: 16,
  },
  bottomCenter: {
    id: 'bottomCenter',
    label: 'Bottom-Center DMA System Bus Banner',
    shortLabel: 'Bottom-Center Banner',
    category: 'footer',
    baseW: 737,
    baseH: 28,
    defaultX: 570,
    defaultY: 900,
    minW: 140,
    minH: 16,
  },
  bottomRight: {
    id: 'bottomRight',
    label: 'Bottom-Right Voice S2S & Audio Synth Switches',
    shortLabel: 'Bottom-Right Switches',
    category: 'footer',
    baseW: 640,
    baseH: 33,
    defaultX: 1010,
    defaultY: 898,
    minW: 140,
    minH: 16,
  },
};

export const DEFAULT_LAYOUTS: Record<string, { x: number; y: number; w: number; h: number }> = Object.fromEntries(
  Object.entries(ALL_UI_COMPONENTS).map(([id, meta]) => [
    id,
    { x: meta.defaultX, y: meta.defaultY, w: meta.baseW, h: meta.baseH },
  ])
);

export default function App() {
  // Core Interface State
  const [metrics, setMetrics] = useState<CoreMetrics>(() => {
    let savedSound = true;
    try {
      const stored = localStorage.getItem('rhiona_sound_enabled');
      if (stored !== null) savedSound = stored !== 'false';
    } catch {
      // ignore
    }
    return {
      status: 'ONLINE',
      temperature: 36,
      powerOutput: 87,
      energyLevel: 92,
      connectionStatus: 'SECURE',
      coreSpeedRPM: 1,
      isSoundEnabled: savedSound,
      isOverclocked: false,
      neonTheme: 'amber',
      shellMetal: 'gold',
    };
  });

  const [activeTab, setActiveTab] = useState<NavTab>('home');

  // Google Live Voice States
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [transcript, setTranscript] = useState<string>('');
  const [aiResponse, setAiResponse] = useState<string>('');
  const [voiceError, setVoiceError] = useState<string>('');
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState<boolean>(false);
  const [latestSearchResult, setLatestSearchResult] = useState<any>(null);
  const [latestShellOutput, setLatestShellOutput] = useState<any>(null);
  const [latestBackgroundTask, setLatestBackgroundTask] = useState<any>(null);

  const [currentTime, setCurrentTime] = useState<string>('');
  const [realLatency, setRealLatency] = useState<number>(4);
  const [realCpuUsage, setRealCpuUsage] = useState<number>(15);
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 1024 : false
  );

  // Layout and Window Positioning State (Fixed 1672x941 stage)
  const [isEditMode, setIsEditMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('edit') === 'true' || params.get('edit') === '1';
    }
    return false;
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Emergency hidden shortcut: Ctrl+Shift+E to toggle editor if needed
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
        setIsEditMode((prev) => !prev);
        soundManager.playClick();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const [deckDock, setDeckDock] = useState<'top' | 'bottom'>('top');
  const [selectedWindowId, setSelectedWindowId] = useState<string>('transcriber');
  const [saveStatusMessage, setSaveStatusMessage] = useState<string>('');
  const [isContentScaled, setIsContentScaled] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('chola_content_scaled');
      return stored !== null ? stored === 'true' : true;
    } catch {
      return true;
    }
  });

  const [isToolbarCollapsed, setIsToolbarCollapsed] = useState<boolean>(false);
  const [scaleMode, setScaleMode] = useState<'fill' | 'fit' | '1:1'>(() => {
    try {
      return (localStorage.getItem('chola_scale_mode') as 'fill' | 'fit' | '1:1') || 'fill';
    } catch {
      return 'fill';
    }
  });

  const [windowLayouts, setWindowLayouts] = useState<Record<string, { x: number; y: number; w: number; h: number }>>(() => {
    try {
      const stored = localStorage.getItem('chola_window_layout');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') {
          return { ...DEFAULT_LAYOUTS, ...parsed };
        }
      }
    } catch {}
    return DEFAULT_LAYOUTS;
  });

  const [viewportSize, setViewportSize] = useState({
    w: typeof window !== 'undefined' ? window.innerWidth : 1672,
    h: typeof window !== 'undefined' ? window.innerHeight : 941,
  });

  useEffect(() => {
    const handleWinResize = () => {
      setViewportSize({ w: window.innerWidth, h: window.innerHeight });
    };
    window.addEventListener('resize', handleWinResize);
    return () => window.removeEventListener('resize', handleWinResize);
  }, []);

  const autoScale = Math.min(viewportSize.w / 1672, viewportSize.h / 941, 1.0);

  // Load layout from backend disk on mount if available
  useEffect(() => {
    fetch('/api/layout')
      .then((res) => res.json())
      .then((data) => {
        if (data?.success && data?.layout) {
          setWindowLayouts((prev) => ({ ...DEFAULT_LAYOUTS, ...prev, ...data.layout }));
          try {
            localStorage.setItem('chola_window_layout', JSON.stringify({ ...DEFAULT_LAYOUTS, ...data.layout }));
          } catch {}
        }
      })
      .catch(() => {});
  }, []);

  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [activeResize, setActiveResize] = useState<{ id: string; handle: string } | null>(null);

  const dragStartRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    initX: number;
    initY: number;
  } | null>(null);

  const resizeStartRef = useRef<{
    id: string;
    handle: string;
    startX: number;
    startY: number;
    initX: number;
    initY: number;
    initW: number;
    initH: number;
  } | null>(null);

  const handleStartDrag = (id: string, e: React.MouseEvent) => {
    if (!isEditMode) return;
    e.stopPropagation();
    setSelectedWindowId(id);
    setActiveDragId(id);
    const meta = ALL_UI_COMPONENTS[id] || { defaultX: 0, defaultY: 0, baseW: 300, baseH: 200 };
    const bounds = windowLayouts[id] || { x: meta.defaultX, y: meta.defaultY, w: meta.baseW, h: meta.baseH };
    dragStartRef.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      initX: bounds.x,
      initY: bounds.y,
    };
  };

  const handleStartResize = (id: string, handle: string, e: React.MouseEvent) => {
    if (!isEditMode) return;
    e.stopPropagation();
    setSelectedWindowId(id);
    setActiveResize({ id, handle });
    const meta = ALL_UI_COMPONENTS[id] || { defaultX: 0, defaultY: 0, baseW: 300, baseH: 200 };
    const bounds = windowLayouts[id] || { x: meta.defaultX, y: meta.defaultY, w: meta.baseW, h: meta.baseH };
    resizeStartRef.current = {
      id,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      initX: bounds.x,
      initY: bounds.y,
      initW: bounds.w,
      initH: bounds.h,
    };
  };

  useEffect(() => {
    if (!activeDragId && !activeResize) return;

    const handleMouseMove = (e: MouseEvent) => {
      const currentScaleX =
        scaleMode === 'fill'
          ? Math.max(0.1, viewportSize.w / 1672)
          : scaleMode === 'fit'
          ? Math.max(0.1, Math.min(viewportSize.w / 1672, viewportSize.h / 941))
          : 1.0;
      const currentScaleY =
        scaleMode === 'fill'
          ? Math.max(0.1, viewportSize.h / 941)
          : scaleMode === 'fit'
          ? Math.max(0.1, Math.min(viewportSize.w / 1672, viewportSize.h / 941))
          : 1.0;

      if (dragStartRef.current) {
        const { id, startX, startY, initX, initY } = dragStartRef.current;
        const dx = (e.clientX - startX) / currentScaleX;
        const dy = (e.clientY - startY) / currentScaleY;
        const meta = ALL_UI_COMPONENTS[id] || { defaultX: 0, defaultY: 0, baseW: 300, baseH: 200 };
        setWindowLayouts((prev) => ({
          ...prev,
          [id]: {
            ...(prev[id] || { x: meta.defaultX, y: meta.defaultY, w: meta.baseW, h: meta.baseH }),
            x: Math.round(initX + dx),
            y: Math.round(initY + dy),
          },
        }));
      } else if (resizeStartRef.current) {
        const { id, handle, startX, startY, initX, initY, initW, initH } = resizeStartRef.current;
        const dx = (e.clientX - startX) / currentScaleX;
        const dy = (e.clientY - startY) / currentScaleY;
        const meta = ALL_UI_COMPONENTS[id] || { minW: 30, minH: 16 };

        let newX = initX;
        let newY = initY;
        let newW = initW;
        let newH = initH;

        if (handle.includes('e')) {
          newW = Math.max(meta.minW, Math.round(initW + dx));
        }
        if (handle.includes('s')) {
          newH = Math.max(meta.minH, Math.round(initH + dy));
        }
        if (handle.includes('w')) {
          const proposedW = Math.max(meta.minW, Math.round(initW - dx));
          newX = Math.round(initX + (initW - proposedW));
          newW = proposedW;
        }
        if (handle.includes('n')) {
          const proposedH = Math.max(meta.minH, Math.round(initH - dy));
          newY = Math.round(initY + (initH - proposedH));
          newH = proposedH;
        }

        setWindowLayouts((prev) => ({
          ...prev,
          [id]: { x: newX, y: newY, w: newW, h: newH },
        }));
      }
    };

    const handleMouseUp = () => {
      setActiveDragId(null);
      setActiveResize(null);
      dragStartRef.current = null;
      resizeStartRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [activeDragId, activeResize, scaleMode, viewportSize]);

  const handleSaveLayout = async () => {
    try {
      localStorage.setItem('chola_window_layout', JSON.stringify(windowLayouts));
      const res = await fetch('/api/layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layout: windowLayouts }),
      });
      const data = await res.json();
      if (data?.success) {
        setSaveStatusMessage('✓ SAVED TO DISK');
        soundManager.playClick();
      } else {
        setSaveStatusMessage('✓ SAVED (LOCAL)');
      }
    } catch {
      setSaveStatusMessage('✓ SAVED (LOCAL)');
    }
    setTimeout(() => setSaveStatusMessage(''), 3500);
  };

  const handleResetToDefaultLayout = () => {
    setWindowLayouts(DEFAULT_LAYOUTS);
    try {
      localStorage.setItem('chola_window_layout', JSON.stringify(DEFAULT_LAYOUTS));
    } catch {}
    soundManager.playClick();
    setSaveStatusMessage('RESET ALL 16 TO DEFAULTS');
    setTimeout(() => setSaveStatusMessage(''), 3000);
  };

  const handleResetAllWindows = handleResetToDefaultLayout;

  const nudgeSelected = (axis: 'x' | 'y' | 'w' | 'h', delta: number) => {
    const id = selectedWindowId || 'transcriber';
    const meta = ALL_UI_COMPONENTS[id] || { minW: 30, minH: 16, defaultX: 0, defaultY: 0, baseW: 300, baseH: 200 };
    setWindowLayouts((prev) => {
      const current = prev[id] || { x: meta.defaultX, y: meta.defaultY, w: meta.baseW, h: meta.baseH };
      let val = current[axis] + delta;
      if (axis === 'w') val = Math.max(meta.minW, val);
      if (axis === 'h') val = Math.max(meta.minH, val);
      return {
        ...prev,
        [id]: {
          ...current,
          [axis]: val,
        },
      };
    });
  };

  const updateSelectedBounds = (axis: 'x' | 'y' | 'w' | 'h', value: number) => {
    const id = selectedWindowId || 'transcriber';
    const meta = ALL_UI_COMPONENTS[id] || { minW: 30, minH: 16, defaultX: 0, defaultY: 0, baseW: 300, baseH: 200 };
    setWindowLayouts((prev) => {
      const current = prev[id] || { x: meta.defaultX, y: meta.defaultY, w: meta.baseW, h: meta.baseH };
      let val = value;
      if (axis === 'w') val = Math.max(meta.minW, val);
      if (axis === 'h') val = Math.max(meta.minH, val);
      return {
        ...prev,
        [id]: {
          ...current,
          [axis]: val,
        },
      };
    });
  };

  const handleToggleContentScale = () => {
    setIsContentScaled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('chola_content_scaled', String(next));
      } catch {}
      soundManager.playClick();
      return next;
    });
  };

  const handleToggleScale = () => {
    const modes: ('fill' | 'fit' | '1:1')[] = ['fill', 'fit', '1:1'];
    const next = modes[(modes.indexOf(scaleMode) + 1) % modes.length];
    setScaleMode(next);
    try {
      localStorage.setItem('chola_scale_mode', next);
    } catch {}
    soundManager.playClick();
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(max-width: 1023px)');
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    // Brave and Chrome restrict microphone access on 0.0.0.0. Redirect to localhost to enable secure mic permission.
    if (typeof window !== 'undefined' && window.location.hostname === '0.0.0.0') {
      window.location.hostname = 'localhost';
      return;
    }

    const updateTime = () => {
      const d = new Date();
      setCurrentTime(d.toLocaleTimeString('en-US', { hour12: false }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);

    // Measure real ping latency to backend API. /api/health is answered by the Node
    // bridge alone — /api/status spawns a Python process, so pinging it cost CPU.
    const pingInterval = setInterval(async () => {
      const start = performance.now();
      try {
        await fetch('/api/health', { cache: 'no-store' });
        const latency = Math.max(1, Math.round(performance.now() - start));
        setRealLatency(latency);
      } catch {
        // ignore
      }
    }, 5000);

    return () => {
      clearInterval(interval);
      clearInterval(pingInterval);
    };
  }, []);

  const [logs, setLogs] = useState<LogMessage[]>([
    { id: '1', timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }), text: 'AETHER RUNTIME // KERNEL ONLINE', type: 'info' },
    { id: '2', timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }), text: 'RHIONA AGENTIC RUNTIME READY', type: 'success' },
    { id: '3', timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }), text: 'WEBAUDIO 24kHz DSP CONDUIT SYNCED', type: 'info' },
  ]);

  // Add Log Entry Helper
  const addLog = useCallback((text: string, type: 'info' | 'success' | 'warning' | 'alert' = 'info') => {
    const newLog: LogMessage = {
      id: Date.now().toString(),
      timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
      text,
      type
    };
    setLogs((prev) => [newLog, ...prev.slice(0, 5)]);
  }, []);

  // Update sound manager toggle state
  useEffect(() => {
    soundManager.enabled = metrics.isSoundEnabled;
  }, [metrics.isSoundEnabled]);

  // Toggle Overclock Mode
  const handleToggleOverclock = useCallback(() => {
    setMetrics((prev) => {
      const nextOverclock = !prev.isOverclocked;
      if (nextOverclock) {
        addLog('OVERCLOCKED CORE PULSE ENGAGED', 'warning');
      } else {
        addLog('CORE STABILIZED TO ONLINE', 'success');
      }
      return {
        ...prev,
        isOverclocked: nextOverclock,
        status: nextOverclock ? 'OVERCLOCKED' : 'ONLINE',
        temperature: nextOverclock ? 68 : 36,
        powerOutput: nextOverclock ? 98 : 87,
        coreSpeedRPM: nextOverclock ? 3 : 1
      };
    });
  }, [addLog]);

  // Theme Change Handler
  const handleThemeChange = useCallback((newTheme: NeonColorId) => {
    setMetrics((prev) => ({ ...prev, neonTheme: newTheme }));
    const themeObj = getNeonTheme(newTheme);
    addLog(`SPECTRUM SHIFT: ${themeObj.name.toUpperCase()}`, 'info');
  }, [addLog]);

  // Metal Shell Change Handler
  const handleMetalChange = useCallback((newMetal: ShellMetalId) => {
    setMetrics((prev) => {
      let nextNeon = prev.neonTheme;
      if (newMetal === 'gold' && (prev.neonTheme === 'emerald' || prev.neonTheme === 'crimson')) {
        nextNeon = 'amber';
      }
      return { ...prev, shellMetal: newMetal, neonTheme: nextNeon };
    });
    const metalObj = getShellMetalTheme(newMetal);
    addLog(`CHASSIS METALLURGY: ${metalObj.name.toUpperCase()} // PANELS & PCB SYNCD`, 'info');
  }, [addLog]);

  // Cycle to next neon color theme
  const handleCycleTheme = useCallback(() => {
    setMetrics((prev) => {
      const currentIndex = NEON_THEMES.findIndex((t) => t.id === prev.neonTheme);
      const nextIndex = (currentIndex + 1) % NEON_THEMES.length;
      const nextTheme = NEON_THEMES[nextIndex].id;
      const themeObj = getNeonTheme(nextTheme);
      addLog(`SPECTRUM SHIFT: ${themeObj.name.toUpperCase()}`, 'info');
      return { ...prev, neonTheme: nextTheme };
    });
  }, [addLog]);

  // Handle Intent Extraction from voice transcript strictly on intentional commands
  const handleVoiceCommand = useCallback((text: string) => {
    const parsed = parseVoiceCommand(text);
    if (!parsed.hasAction) return;

    if (parsed.neonTheme) {
      handleThemeChange(parsed.neonTheme);
    }
    if (parsed.shellMetal) {
      handleMetalChange(parsed.shellMetal);
    }
    if (typeof parsed.isOverclocked === 'boolean') {
      if (parsed.isOverclocked) {
        setMetrics((prev) => {
          if (prev.isOverclocked) return prev;
          addLog('SYSTEM WARNING: OVERCLOCK ENGAGED VIA VOICE', 'warning');
          return {
            ...prev,
            isOverclocked: true,
            status: 'OVERCLOCKED',
            powerOutput: 98,
            coreSpeedRPM: 3,
            temperature: Math.min(85, prev.temperature + 12),
          };
        });
      } else {
        setMetrics((prev) => {
          if (!prev.isOverclocked) return prev;
          addLog('SYSTEM NOMINAL: CORE STABILIZED VIA VOICE', 'info');
          return {
            ...prev,
            isOverclocked: false,
            status: 'ONLINE',
            powerOutput: 87,
            coreSpeedRPM: 1,
            temperature: 36,
          };
        });
      }
    }
    if (parsed.actionSummary) {
      addLog(`VOICE INTENT: ${parsed.actionSummary}`, 'success');
    }
  }, [handleMetalChange, handleThemeChange, addLog]);

  const handleVoiceCommandRef = useRef(handleVoiceCommand);
  handleVoiceCommandRef.current = handleVoiceCommand;

  const handleSendMessage = useCallback(async (msg: string) => {
    handleVoiceCommand(msg);
    setTranscript(msg);
    setAiResponse('');
    await voiceManager.speakText(msg);
  }, [handleVoiceCommand]);

  // Keep VoiceManager synchronized with latest live telemetry
  useEffect(() => {
    voiceManager.currentMetrics = metrics;
  }, [metrics]);

  // Setup VoiceManager Listeners
  useEffect(() => {
    voiceManager.onStateChange = (state) => {
      setVoiceState(state);
      // Recovered: drop the stale failure reason so the HUD reads clean.
      if (state === 'listening' || state === 'speaking' || state === 'thinking') {
        setVoiceError('');
        setTranscript('');
      }
      if (state === 'connecting') {
        addLog('RHIONA AGENT // CONNECTING TO MAIN BACKEND', 'info');
      } else if (state === 'listening') {
        addLog('RHIONA S2S // LISTENING ACTIVE', 'info');
      } else if (state === 'user_speaking') {
        addLog('RHIONA S2S // HEARING USER SPEECH...', 'info');
      } else if (state === 'thinking') {
        addLog('RHIONA AGENT // REASONING PIPELINE ACTIVE', 'info');
      } else if (state === 'speaking') {
        addLog('RHIONA S2S // STREAMING VOCAL SYNTHESIS', 'success');
      } else if (state === 'interrupted') {
        addLog('RHIONA S2S // BARGE-IN INTERRUPTED', 'warning');
      }
    };

    voiceManager.onAudioLevel = (level) => {
      setAudioLevel(level);
    };

    voiceManager.onTranscript = (userText, isFinal) => {
      setTranscript(userText);
      // Only execute commands on final transcript to prevent false triggers from interim syllables
      if (isFinal) {
        handleVoiceCommandRef.current(userText);
      }
    };

    voiceManager.onAiResponse = (aiText) => {
      setAiResponse(aiText);
    };

    voiceManager.onSearchResults = (results) => {
      setLatestSearchResult(results);
      if (results?.query) {
        addLog(`WEB SEARCH // INGESTED: "${results.query.toUpperCase()}"`, 'success');
      }
    };

    voiceManager.onMediaUpdate = (media) => {
      if (media?.status) {
        addLog(`MEDIA DISPATCH // ${media.status.toUpperCase()}`, 'info');
      }
    };

    voiceManager.onShellOutput = (shell) => {
      setLatestShellOutput(shell);
      if (shell?.command) {
        addLog(`SHELL EXEC // $ ${shell.command.toUpperCase()}`, 'info');
      }
    };

    voiceManager.onBackgroundTask = (task) => {
      setLatestBackgroundTask(task);
      addLog(`AGENT TASK // ${(task?.title || task?.task_id || 'BACKGROUND OPERATION').toUpperCase()} // ${task?.progress || 0}%`, task?.status === 'error' ? 'alert' : 'info');
    };

    voiceManager.onVisionResult = (result) => {
      addLog(`VISION ANALYSIS // ${(result?.analysis || 'COMPLETE').slice(0, 90).toUpperCase()}`, 'success');
    };

    voiceManager.onHealthUpdate = (health) => {
      if (health?.cpu?.load !== undefined) setRealCpuUsage(health.cpu.load);
    };

    voiceManager.onReminder = (msg) => {
      soundManager.playPulse();
      addLog(`⏰ TACTICAL REMINDER // ${msg.toUpperCase()}`, 'warning');
    };

    voiceManager.onCommandAction = (actions) => {
      if (!actions) return;
      setMetrics((prev) => {
        const next = { ...prev };
        if (actions.shellMetal && (actions.shellMetal === 'gold' || actions.shellMetal === 'black' || actions.shellMetal === 'silver')) {
          next.shellMetal = actions.shellMetal;
        }
        if (actions.neonTheme) {
          next.neonTheme = actions.neonTheme;
        }
        if (typeof actions.isOverclocked === 'boolean') {
          next.isOverclocked = actions.isOverclocked;
          next.status = actions.isOverclocked ? 'OVERCLOCKED' : 'ONLINE';
          next.powerOutput = actions.isOverclocked ? 98 : 87;
          next.coreSpeedRPM = actions.isOverclocked ? 3 : 1;
        }
        return next;
      });
    };

    voiceManager.onError = (err) => {
      setVoiceError(err);
      // No auto-clear: the reason has to stay readable for as long as the link is
      // broken. It is cleared when a new session starts or when the link recovers.
    };

    let cancelled = false;
    const handleFirstUserInteraction = () => {
      voiceManager.ensureAmbientListening();
      window.removeEventListener('click', handleFirstUserInteraction);
      window.removeEventListener('keydown', handleFirstUserInteraction);
    };
    window.addEventListener('click', handleFirstUserInteraction);
    window.addEventListener('keydown', handleFirstUserInteraction);

    // Connect to Rhiona agentic runtime
    void (async () => {
      try {
        const response = await fetch('/api/health', { cache: 'no-store' });
        const health = response.ok ? await response.json() : null;
        if (cancelled) return;
        if (health?.backendMode === 'external') {
          await voiceManager.start(metrics);
          addLog('RHIONA AGENTIC BACKEND // AUTONOMOUS RUNTIME LINKED', 'success');
        } else {
          await voiceManager.ensureAmbientListening();
        }
      } catch {
        if (!cancelled) await voiceManager.ensureAmbientListening();
      }
    })();

    return () => {
      cancelled = true;
      window.removeEventListener('click', handleFirstUserInteraction);
      window.removeEventListener('keydown', handleFirstUserInteraction);
      voiceManager.disconnect();
    };
  }, [addLog]);

  // Toggle Live Voice
  const handleToggleVoice = async () => {
    if (voiceManager.isS2SActive) {
      voiceManager.stop();
      setVoiceState('idle');
      addLog('RHIONA BACKEND // VOICE RUNTIME STOPPED', 'info');
    } else {
      setVoiceError('');
      soundManager.playClick();
      setVoiceState('connecting');
      addLog('VOICE AGENT ENGAGED // AGENTIC RUNTIME LINK', 'info');
      try {
        await voiceManager.start(metrics);
      } catch (err: any) {
        console.warn('Voice activation notice:', err);
      }
    }
  };

  // Real telemetry callback
  const handleTelemetryUpdate = useCallback((telem: any) => {
    if (telem) {
      if (telem.cpu) {
        setRealCpuUsage(telem.cpu.load || 15);
      }
      setMetrics((prev) => ({
        ...prev,
        temperature: telem.cpu?.temp || prev.temperature,
        powerOutput: Math.min(99, Math.max(40, Math.round(50 + (telem.cpu?.load || 0) * 0.45))),
      }));
    }
  }, []);

  const activeShell = getShellMetalTheme(metrics.shellMetal);
  const activeNeon = getNeonTheme(metrics.neonTheme);

  const renderEditableElement = (
    id: string,
    children: React.ReactNode,
    options?: {
      forceUniformScale?: boolean;
      customLabel?: string;
      noHeaderBar?: boolean;
      customZIndex?: number;
    }
  ) => {
    const meta = ALL_UI_COMPONENTS[id] || {
      id,
      label: id,
      shortLabel: id,
      category: 'windows' as const,
      baseW: 300,
      baseH: 200,
      defaultX: 0,
      defaultY: 0,
      minW: 40,
      minH: 16,
    };
    const bounds = windowLayouts[id] || {
      x: meta.defaultX,
      y: meta.defaultY,
      w: meta.baseW,
      h: meta.baseH,
    };
    const isSelected = selectedWindowId === id;
    const isDraggingThis = activeDragId === id;

    // Vectorial Content Scaling: scales down/up fonts, icons, buttons, SVG diagrams proportionally
    const scaleX = isContentScaled ? bounds.w / meta.baseW : 1.0;
    const scaleY = isContentScaled ? bounds.h / meta.baseH : 1.0;
    const effScaleX = options?.forceUniformScale ? Math.min(scaleX, scaleY) : scaleX;
    const effScaleY = options?.forceUniformScale ? Math.min(scaleX, scaleY) : scaleY;

    const contentBaseW = meta.baseW;
    const contentBaseH = meta.baseH;

    return (
      <div
        key={id}
        id={`ui-el-${id}`}
        style={{
          left: `${bounds.x}px`,
          top: `${bounds.y}px`,
          width: `${bounds.w}px`,
          height: `${bounds.h}px`,
          zIndex: isEditMode ? (isSelected ? 50 : 35) : (options?.customZIndex ?? (meta.category === 'windows' ? 20 : 15)),
        }}
        onClick={(e) => {
          if (isEditMode) {
            e.stopPropagation();
            setSelectedWindowId(id);
          }
        }}
        onMouseDown={(e) => {
          if (isEditMode) {
            handleStartDrag(id, e);
          }
        }}
        className={`absolute transition-shadow ${
          isEditMode
            ? isSelected
              ? 'ring-1.5 ring-amber-400 shadow-[0_0_25px_rgba(245,158,11,0.6)] cursor-grab active:cursor-grabbing'
              : 'border border-dashed border-amber-600/50 hover:border-amber-400/80 hover:shadow-[0_0_10px_rgba(245,158,11,0.25)] cursor-grab active:cursor-grabbing'
            : 'cursor-default'
        } ${isDraggingThis ? 'cursor-grabbing' : ''}`}
      >
        {/* Clean content container with dynamic vector/text scaling and zero intrusive labels */}
        <div
          className={`w-full h-full overflow-hidden ${
            isEditMode ? 'pointer-events-none' : 'pointer-events-auto'
          }`}
        >
          <div
            style={{
              width: `${contentBaseW}px`,
              height: `${contentBaseH}px`,
              transform: `scale(${effScaleX}, ${effScaleY})`,
              transformOrigin: options?.forceUniformScale ? 'center center' : 'top left',
            }}
            className="origin-top-left w-full h-full"
          >
            {children}
          </div>
        </div>

        {/* EDIT MODE: RESIZE HANDLES (CORNER & EDGES) */}
        {isEditMode && (
          <>
            {/* Bottom-Right Handle (Corner SE: Width & Height) */}
            <div
              onMouseDown={(e) => {
                e.stopPropagation();
                handleStartResize(id, 'se', e);
              }}
              className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-amber-500 hover:bg-amber-300 border border-black cursor-se-resize flex items-center justify-center text-[7px] text-black font-extrabold z-50 rounded-sm shadow-md transition-transform hover:scale-125 pointer-events-auto"
              title="Resize Width & Height"
            >
              ⤡
            </div>

            {/* Bottom-Left Handle (Corner SW: X, Width, Height) */}
            <div
              onMouseDown={(e) => {
                e.stopPropagation();
                handleStartResize(id, 'sw', e);
              }}
              className="absolute -bottom-1 -left-1 w-3 h-3 bg-amber-600/90 hover:bg-amber-400 border border-black cursor-sw-resize z-50 rounded-sm shadow-sm pointer-events-auto"
              title="Resize X & Height"
            />

            {/* Top-Right Handle (Corner NE: Y, Width, Height) */}
            <div
              onMouseDown={(e) => {
                e.stopPropagation();
                handleStartResize(id, 'ne', e);
              }}
              className="absolute -top-1 -right-1 w-3 h-3 bg-amber-600/90 hover:bg-amber-400 border border-black cursor-ne-resize z-50 rounded-sm shadow-sm pointer-events-auto"
              title="Resize Y & Width"
            />

            {/* Top-Left Handle (Corner NW: X, Y, Width, Height) */}
            <div
              onMouseDown={(e) => {
                e.stopPropagation();
                handleStartResize(id, 'nw', e);
              }}
              className="absolute -top-1 -left-1 w-3 h-3 bg-amber-600/90 hover:bg-amber-400 border border-black cursor-nw-resize z-50 rounded-sm shadow-sm pointer-events-auto"
              title="Resize X, Y, Width, Height"
            />

            {/* Right Edge (Width) */}
            <div
              onMouseDown={(e) => {
                e.stopPropagation();
                handleStartResize(id, 'e', e);
              }}
              className="absolute top-2 bottom-2 -right-1 w-1.5 hover:bg-amber-400/80 cursor-e-resize z-40 transition-colors pointer-events-auto"
              title="Resize Width"
            />

            {/* Bottom Edge (Height) */}
            <div
              onMouseDown={(e) => {
                e.stopPropagation();
                handleStartResize(id, 's', e);
              }}
              className="absolute -bottom-1 left-2 right-2 h-1.5 hover:bg-amber-400/80 cursor-s-resize z-40 transition-colors pointer-events-auto"
              title="Resize Height"
            />
          </>
        )}
      </div>
    );
  };

  const renderHudWindow = (
    id: string,
    title: string,
    port: string,
    children: React.ReactNode,
  ) => {
    return renderEditableElement(id, children, { customLabel: `${port}: ${title}` });
  };

  return (
    <div 
      className="relative h-screen w-screen max-w-full max-h-full flex flex-col justify-between items-center overflow-hidden select-none font-mono transition-colors duration-500"
      style={{ backgroundColor: activeShell.rootBg, color: activeShell.badgeText }}
    >
      {/* Dark Ambient Radial Background Vignette tailored to current Chassis Metallurgy */}
      <div 
        className="absolute inset-0 pointer-events-none transition-all duration-500" 
        style={{ background: activeShell.vignetteGradient }}
      />

      {/* TOP HEADER BAR (Mobile only fallback) */}
      <header 
        className={`lg:hidden relative z-20 w-full px-4 sm:px-6 pt-2 pb-2 border-b ${activeShell.headerBorder} ${activeShell.headerBg} backdrop-blur-md flex items-center justify-between gap-3 text-xs ${activeShell.headerText} transition-all duration-500`}
      >
        <div className="flex items-center space-x-2.5">
          <span 
            className="w-2.5 h-2.5 animate-pulse rounded-full" 
            style={{ 
              backgroundColor: activeNeon.glowColor,
              boxShadow: `0 0 10px ${activeNeon.glowColor}` 
            }} 
          />
          <span 
            className="font-orbitron font-extrabold tracking-widest uppercase text-sm sm:text-base animate-glitch"
            style={{ color: activeNeon.glowColor, textShadow: `0 0 10px ${activeNeon.glowColor}80` }}
          >
            CHOLA CORE UI
          </span>
          <span className={`text-[10px] font-tech font-bold px-2 py-0.5 border ${activeShell.badgeBorder} ${activeShell.badgeBg} ${activeShell.badgeText} clip-chamfer-sm`}>
            v2.9 // {activeShell.shortName} METALLURGY
          </span>
        </div>

        {/* Header Center Live ECG Heartbeat Oscilloscope */}
        <div className="hidden lg:flex items-center space-x-2 bg-black/70 px-2.5 py-0.5 rounded border border-stone-800/90 font-tech text-[10px]">
          <span className="text-stone-400 font-bold">CORE PULSE:</span>
          <svg className="w-18 h-3.5 overflow-hidden" viewBox="0 0 80 16">
            <path
              d="M 0 8 L 22 8 L 26 2 L 32 14 L 38 4 L 42 11 L 46 8 L 80 8"
              fill="none"
              stroke={activeNeon.glowColor}
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="animate-pulse"
              style={{ filter: `drop-shadow(0 0 3px ${activeNeon.glowColor})` }}
            />
          </svg>
          <span className="font-orbitron font-bold" style={{ color: activeNeon.glowColor }}>
            {Math.round(55 + (realCpuUsage / 100) * 65 + (metrics.isOverclocked ? 40 : 0))} BPM
          </span>
        </div>

        {/* Header Right Status Badges */}
        <div className="flex items-center space-x-2 font-tech text-[10px]">
          <button
            onClick={handleResetAllWindows}
            className="hidden xl:flex items-center space-x-1 bg-stone-900/90 hover:bg-amber-950/60 px-2 py-0.5 rounded border border-amber-600/40 text-amber-300 font-tech text-[9.5px] cursor-pointer transition-colors shadow-sm"
            title="Snap all 6 windows back to their original bronze frames"
          >
            <span>⟲ SNAP TO FRAMES</span>
          </button>

          <div className="hidden sm:flex items-center space-x-1.5 bg-black/60 px-2 py-0.5 rounded border border-stone-800">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
            <span className="text-stone-400">LATENCY:</span>
            <span className="font-bold text-stone-200">{realLatency}ms</span>
          </div>

          <div className="hidden sm:flex items-center space-x-1.5 bg-black/60 px-2 py-0.5 rounded border border-stone-800">
            <span className="text-stone-400">CORE STATUS:</span>
            <span className="font-bold font-orbitron" style={{ color: activeNeon.glowColor }}>
              {metrics.status}
            </span>
          </div>
          <div className="hidden md:flex items-center space-x-1.5 bg-black/60 px-2 py-0.5 rounded border border-stone-800">
            <span className="text-stone-400">SYS TIME:</span>
            <span className="font-bold font-orbitron text-stone-200">{currentTime}</span>
          </div>
        </div>
      </header>

      {/* MAIN UNIFIED COORDINATE CANVAS (EDGE-TO-EDGE DESKTOP VIEW) */}
      <main className="relative z-20 flex-1 w-full h-full flex items-center justify-center p-0 m-0 overflow-hidden bg-[#070503]">
        
        {/* Desktop View: Fixed 1672x941 stage with native Asset.png backdrop */}
        {!isMobile && (
        <div className="hidden lg:flex w-full h-full overflow-hidden items-center justify-center p-0 m-0">
          <div 
            className="relative shrink-0 select-none shadow-[0_0_90px_rgba(0,0,0,0.98)]"
            style={{
              width: '1672px',
              height: '941px',
              minWidth: '1672px',
              minHeight: '941px',
              backgroundImage: 'url(/Asset.png)',
              backgroundPosition: '0px 0px',
              backgroundSize: '1672px 941px',
              backgroundRepeat: 'no-repeat',
              backgroundColor: '#0a0705',
              transform:
                scaleMode === 'fill'
                  ? `scale(${viewportSize.w / 1672}, ${viewportSize.h / 941})`
                  : scaleMode === 'fit'
                  ? `scale(${Math.min(viewportSize.w / 1672, viewportSize.h / 941)})`
                  : 'none',
              transformOrigin: 'center center',
            }}
          >
            {/* FLOATING MASTER LAYOUT EDITOR DECK (ACTIVE EDIT MODE - COLLAPSED STATE) */}
            {isEditMode && isToolbarCollapsed && (
              <div className={`fixed ${deckDock === 'top' ? 'top-3' : 'bottom-3'} right-4 z-50 flex items-center space-x-2 font-tech backdrop-blur-md`}>
                <button
                  onClick={() => {
                    setIsToolbarCollapsed(false);
                    soundManager.playClick();
                  }}
                  className="flex items-center space-x-1.5 bg-amber-500 hover:bg-amber-400 text-black px-3 py-1.5 rounded-full font-bold text-xs shadow-[0_0_15px_rgba(245,158,11,0.6)] cursor-pointer active:scale-95"
                  title="Show UI Editor Controls"
                >
                  <span>⚙</span>
                  <span>SHOW CONTROLS ▾</span>
                </button>
                <button
                  onClick={handleSaveLayout}
                  className="flex items-center space-x-1 bg-emerald-950 hover:bg-emerald-900 border border-emerald-500 text-emerald-300 px-2.5 py-1.5 rounded-full text-xs font-bold shadow-md cursor-pointer active:scale-95"
                  title="Quick Save Layout"
                >
                  <span>💾</span>
                  <span>SAVE</span>
                </button>
                <button
                  onClick={() => {
                    setIsEditMode(false);
                    soundManager.playClick();
                  }}
                  className="flex items-center space-x-1 bg-stone-900 hover:bg-stone-800 border border-amber-600/60 text-amber-300 px-2.5 py-1.5 rounded-full text-xs font-bold shadow-md cursor-pointer active:scale-95"
                  title="Lock & Exit Edit Mode"
                >
                  <span>🔒</span>
                  <span>EXIT</span>
                </button>
              </div>
            )}

            {/* FLOATING MASTER LAYOUT EDITOR DECK (ACTIVE EDIT MODE - EXPANDED STATE) */}
            {isEditMode && !isToolbarCollapsed && (
              <div 
                className={`fixed ${deckDock === 'top' ? 'top-2' : 'bottom-2'} left-1/2 -translate-x-1/2 z-50 flex items-center space-x-3 bg-stone-950/95 border border-amber-500/80 px-3.5 py-1.5 rounded-lg shadow-[0_0_35px_rgba(245,158,11,0.6)] font-tech backdrop-blur-md transition-opacity duration-200 ${
                  (activeDragId || activeResize) ? 'opacity-20 pointer-events-none' : 'opacity-95'
                }`}
              >
                {/* Left: Mode Title & 16-Component Dropdown Selector */}
                <div className="flex items-center space-x-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
                  <span className="font-orbitron font-extrabold text-amber-300 text-xs tracking-wider uppercase whitespace-nowrap">
                    UI EDITOR
                  </span>
                  <span className="text-[10px] text-stone-400 border-l border-stone-700 pl-2 whitespace-nowrap">
                    TARGET:
                  </span>
                  <select
                    value={selectedWindowId}
                    onChange={(e) => setSelectedWindowId(e.target.value)}
                    className="bg-stone-900 border border-amber-600/70 text-amber-200 text-xs px-2 py-1 rounded cursor-pointer font-tech outline-none"
                  >
                    <optgroup label="HUD Windows (Ports 01-06)">
                      <option value="transcriber">PORT 01: Transcriber & Live S2S</option>
                      <option value="osControl">PORT 02: OS Controller & Engine</option>
                      <option value="firecrawl">PORT 03: Firecrawl Search & Scraper</option>
                      <option value="telemetry">PORT 04: Hardware Telemetry</option>
                      <option value="todo">PORT 05: Task Todo Matrix</option>
                      <option value="media">PORT 06: Media Controller</option>
                    </optgroup>
                    <optgroup label="Reactor Core & Stator Visualizers">
                      <option value="core">Central Sun Reactor Core</option>
                      <option value="leftVisualizer">Left Pillar Stator Magnet Visualizer</option>
                      <option value="rightVisualizer">Right Pillar Stator Magnet Visualizer</option>
                    </optgroup>
                    <optgroup label="Header Bar Elements">
                      <option value="headerTitle">Top-Left Crest & Chola Core Title</option>
                      <option value="headerPulse">Top-Center Live Core Pulse ECG</option>
                      <option value="headerStatus">Top-Right Latency, Core Status & Clock</option>
                    </optgroup>
                    <optgroup label="Navigation & Footer Slots">
                      <option value="bottomNav">Bottom 5 Medallions Console Nav</option>
                      <option value="bottomLeft">Bottom-Left Metallurgy & Spectrum Tuner</option>
                      <option value="bottomCenter">Bottom-Center DMA System Bus Banner</option>
                      <option value="bottomRight">Bottom-Right Voice S2S & Audio Synth</option>
                    </optgroup>
                  </select>
                </div>

                {/* Center: Live Pixel Nudge Controls for Selected Component */}
                <div className="flex items-center space-x-2.5 text-[10.5px]">
                  {/* X Axis */}
                  <div className="flex items-center space-x-1">
                    <span className="text-amber-400 font-bold">X:</span>
                    <button onClick={() => nudgeSelected('x', -10)} className="px-1.5 py-0.5 bg-stone-800 hover:bg-amber-950 hover:text-amber-300 text-stone-300 rounded border border-stone-700 active:scale-90">-10</button>
                    <button onClick={() => nudgeSelected('x', -1)} className="px-1.5 py-0.5 bg-stone-800 hover:bg-amber-950 hover:text-amber-300 text-stone-300 rounded border border-stone-700 active:scale-90">-1</button>
                    <input 
                      type="number"
                      value={windowLayouts[selectedWindowId]?.x ?? ALL_UI_COMPONENTS[selectedWindowId]?.defaultX ?? 0}
                      onChange={(e) => updateSelectedBounds('x', parseInt(e.target.value) || 0)}
                      className="w-14 bg-black border border-amber-600/50 text-center text-amber-300 rounded px-1 py-0.5 font-mono text-[11px]"
                    />
                    <button onClick={() => nudgeSelected('x', 1)} className="px-1.5 py-0.5 bg-stone-800 hover:bg-amber-950 hover:text-amber-300 text-stone-300 rounded border border-stone-700 active:scale-90">+1</button>
                    <button onClick={() => nudgeSelected('x', 10)} className="px-1.5 py-0.5 bg-stone-800 hover:bg-amber-950 hover:text-amber-300 text-stone-300 rounded border border-stone-700 active:scale-90">+10</button>
                  </div>

                  {/* Y Axis */}
                  <div className="flex items-center space-x-1">
                    <span className="text-amber-400 font-bold">Y:</span>
                    <button onClick={() => nudgeSelected('y', -10)} className="px-1.5 py-0.5 bg-stone-800 hover:bg-amber-950 hover:text-amber-300 text-stone-300 rounded border border-stone-700 active:scale-90">-10</button>
                    <button onClick={() => nudgeSelected('y', -1)} className="px-1.5 py-0.5 bg-stone-800 hover:bg-amber-950 hover:text-amber-300 text-stone-300 rounded border border-stone-700 active:scale-90">-1</button>
                    <input 
                      type="number"
                      value={windowLayouts[selectedWindowId]?.y ?? ALL_UI_COMPONENTS[selectedWindowId]?.defaultY ?? 0}
                      onChange={(e) => updateSelectedBounds('y', parseInt(e.target.value) || 0)}
                      className="w-14 bg-black border border-amber-600/50 text-center text-amber-300 rounded px-1 py-0.5 font-mono text-[11px]"
                    />
                    <button onClick={() => nudgeSelected('y', 1)} className="px-1.5 py-0.5 bg-stone-800 hover:bg-amber-950 hover:text-amber-300 text-stone-300 rounded border border-stone-700 active:scale-90">+1</button>
                    <button onClick={() => nudgeSelected('y', 10)} className="px-1.5 py-0.5 bg-stone-800 hover:bg-amber-950 hover:text-amber-300 text-stone-300 rounded border border-stone-700 active:scale-90">+10</button>
                  </div>

                  {/* Width */}
                  <div className="flex items-center space-x-1">
                    <span className="text-amber-400 font-bold">W:</span>
                    <button onClick={() => nudgeSelected('w', -10)} className="px-1.5 py-0.5 bg-stone-800 hover:bg-amber-950 hover:text-amber-300 text-stone-300 rounded border border-stone-700 active:scale-90">-10</button>
                    <button onClick={() => nudgeSelected('w', -1)} className="px-1.5 py-0.5 bg-stone-800 hover:bg-amber-950 hover:text-amber-300 text-stone-300 rounded border border-stone-700 active:scale-90">-1</button>
                    <input 
                      type="number"
                      value={windowLayouts[selectedWindowId]?.w ?? ALL_UI_COMPONENTS[selectedWindowId]?.baseW ?? 100}
                      onChange={(e) => updateSelectedBounds('w', Math.max(ALL_UI_COMPONENTS[selectedWindowId]?.minW || 16, parseInt(e.target.value) || 16))}
                      className="w-14 bg-black border border-amber-600/50 text-center text-amber-300 rounded px-1 py-0.5 font-mono text-[11px]"
                    />
                    <button onClick={() => nudgeSelected('w', 1)} className="px-1.5 py-0.5 bg-stone-800 hover:bg-amber-950 hover:text-amber-300 text-stone-300 rounded border border-stone-700 active:scale-90">+1</button>
                    <button onClick={() => nudgeSelected('w', 10)} className="px-1.5 py-0.5 bg-stone-800 hover:bg-amber-950 hover:text-amber-300 text-stone-300 rounded border border-stone-700 active:scale-90">+10</button>
                  </div>

                  {/* Height */}
                  <div className="flex items-center space-x-1">
                    <span className="text-amber-400 font-bold">H:</span>
                    <button onClick={() => nudgeSelected('h', -10)} className="px-1.5 py-0.5 bg-stone-800 hover:bg-amber-950 hover:text-amber-300 text-stone-300 rounded border border-stone-700 active:scale-90">-10</button>
                    <button onClick={() => nudgeSelected('h', -1)} className="px-1.5 py-0.5 bg-stone-800 hover:bg-amber-950 hover:text-amber-300 text-stone-300 rounded border border-stone-700 active:scale-90">-1</button>
                    <input 
                      type="number"
                      value={windowLayouts[selectedWindowId]?.h ?? ALL_UI_COMPONENTS[selectedWindowId]?.baseH ?? 100}
                      onChange={(e) => updateSelectedBounds('h', Math.max(ALL_UI_COMPONENTS[selectedWindowId]?.minH || 16, parseInt(e.target.value) || 16))}
                      className="w-14 bg-black border border-amber-600/50 text-center text-amber-300 rounded px-1 py-0.5 font-mono text-[11px]"
                    />
                    <button onClick={() => nudgeSelected('h', 1)} className="px-1.5 py-0.5 bg-stone-800 hover:bg-amber-950 hover:text-amber-300 text-stone-300 rounded border border-stone-700 active:scale-90">+1</button>
                    <button onClick={() => nudgeSelected('h', 10)} className="px-1.5 py-0.5 bg-stone-800 hover:bg-amber-950 hover:text-amber-300 text-stone-300 rounded border border-stone-700 active:scale-90">+10</button>
                  </div>
                </div>

                {/* Right: Text Scale Toggle & Action Buttons */}
                <div className="flex items-center space-x-2">
                  {/* DYNAMIC TEXT & CONTENT SCALE TOGGLE */}
                  <button
                    onClick={handleToggleContentScale}
                    className={`flex items-center space-x-1 px-2.5 py-1 rounded text-[10px] font-bold border transition-all cursor-pointer ${
                      isContentScaled
                        ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.3)]'
                        : 'bg-stone-900 border-stone-700 text-stone-400'
                    }`}
                    title="When enabled (AUTO), inner text, icons, buttons and SVG diagrams scale proportionally when element size changes"
                  >
                    <span>🔤 TEXT SCALE:</span>
                    <span className="font-orbitron">{isContentScaled ? 'AUTO' : 'FIXED'}</span>
                  </button>

                  {saveStatusMessage && (
                    <span className="text-emerald-400 font-bold text-[10px] animate-pulse px-1">
                      {saveStatusMessage}
                    </span>
                  )}

                  <button
                    onClick={handleSaveLayout}
                    className="flex items-center space-x-1.5 bg-emerald-950 hover:bg-emerald-900 border border-emerald-500 text-emerald-300 px-3 py-1 rounded text-xs font-bold cursor-pointer transition-all shadow-[0_0_12px_rgba(16,185,129,0.3)] active:scale-95"
                    title="Persist all 16 component coordinates and dimensions to backend disk storage & localStorage"
                  >
                    <span>💾</span>
                    <span>SAVE ALL</span>
                  </button>

                  <button
                    onClick={handleResetToDefaultLayout}
                    className="flex items-center space-x-1 bg-stone-900 hover:bg-amber-950/70 border border-amber-700/60 text-amber-300 px-2.5 py-1 rounded text-xs cursor-pointer transition-all active:scale-95"
                    title="Reset all 16 components to default coordinates"
                  >
                    <span>⟲</span>
                    <span>RESET ALL</span>
                  </button>

                  {/* DOCK TOP / BOTTOM FLIP */}
                  <button
                    onClick={() => {
                      setDeckDock((prev) => (prev === 'top' ? 'bottom' : 'top'));
                      soundManager.playClick();
                    }}
                    className="flex items-center space-x-1 bg-stone-900 hover:bg-amber-950/70 border border-amber-700/60 text-stone-300 hover:text-amber-300 px-2 py-1 rounded text-xs cursor-pointer transition-all active:scale-95"
                    title="Flip toolbar between top and bottom of screen so it never covers what you are editing"
                  >
                    <span>⬍</span>
                    <span>{deckDock === 'top' ? 'DOCK BOT' : 'DOCK TOP'}</span>
                  </button>

                  {/* HIDE / COLLAPSE TOOLBAR */}
                  <button
                    onClick={() => {
                      setIsToolbarCollapsed(true);
                      soundManager.playClick();
                    }}
                    className="flex items-center space-x-1 bg-stone-900 hover:bg-stone-800 border border-stone-700 hover:border-amber-500 text-stone-300 hover:text-amber-300 px-2 py-1 rounded text-xs cursor-pointer transition-all active:scale-95"
                    title="Minimize toolbar so all UI components behind it are completely clear"
                  >
                    <span>✕</span>
                    <span>HIDE BAR</span>
                  </button>

                  <button
                    onClick={() => {
                      setIsEditMode(false);
                      soundManager.playClick();
                    }}
                    className="flex items-center space-x-1.5 bg-amber-500 hover:bg-amber-400 text-black px-3 py-1 rounded text-xs font-bold cursor-pointer transition-all shadow-[0_0_14px_rgba(245,158,11,0.5)] active:scale-95"
                    title="Lock all positions and exit Edit Mode"
                  >
                    <span>🔒</span>
                    <span>LOCK & EXIT</span>
                  </button>
                </div>
              </div>
            )}

            {/* ========================================================= */}
            {/* 16 EDITABLE & RESIZABLE UI COMPONENTS ON FIXED STAGE     */}
            {/* ========================================================= */}

            {/* 1. TOP-LEFT: LION CREST & CHOLA CORE UI TITLE */}
            {renderEditableElement(
              'headerTitle',
              <div className="flex items-center space-x-2 h-full select-none">
                <span 
                  className="w-2.5 h-2.5 rounded-full animate-pulse shadow-[0_0_10px_#f59e0b]" 
                  style={{ backgroundColor: activeNeon.glowColor }} 
                />
                <span 
                  className="font-orbitron font-extrabold tracking-widest uppercase text-sm sm:text-base animate-glitch whitespace-nowrap"
                  style={{ color: activeNeon.glowColor, textShadow: `0 0 10px ${activeNeon.glowColor}80` }}
                >
                  CHOLA CORE UI
                </span>
                <span className="text-[9.5px] font-tech font-bold px-2 py-0.5 border border-amber-800/60 bg-black/80 text-amber-300 whitespace-nowrap">
                  v2.9 // PONNIAN METALLURGY
                </span>
              </div>
            )}

            {/* 2. TOP-CENTER: LIVE CORE PULSE ECG HEARTBEAT */}
            {renderEditableElement(
              'headerPulse',
              <div className="flex items-center space-x-2 px-3 py-1 font-tech text-[10px] bg-black/70 rounded border border-stone-800 h-full select-none">
                <span className="text-amber-400 font-bold uppercase tracking-wider whitespace-nowrap">CORE PULSE:</span>
                <svg className="w-18 h-3.5 overflow-hidden" viewBox="0 0 80 16">
                  <path
                    d="M 0 8 L 22 8 L 26 2 L 32 14 L 38 4 L 42 11 L 46 8 L 80 8"
                    fill="none"
                    stroke={activeNeon.glowColor}
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="animate-pulse"
                    style={{ filter: `drop-shadow(0 0 3px ${activeNeon.glowColor})` }}
                  />
                </svg>
                <span className="font-orbitron font-bold text-amber-300 whitespace-nowrap">
                  {Math.round(55 + (realCpuUsage / 100) * 65 + (metrics.isOverclocked ? 40 : 0))} BPM
                </span>
              </div>
            )}

            {/* 3. TOP-RIGHT: LATENCY, CORE STATUS & SYS TIME */}
            {renderEditableElement(
              'headerStatus',
              <div className="flex items-center space-x-2 font-tech text-[10px] h-full justify-end select-none">
                <div className="flex items-center space-x-1.5 bg-black/75 px-2 py-0.5 rounded border border-stone-800 whitespace-nowrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                  <span className="text-stone-400">LATENCY:</span>
                  <span className="font-bold text-stone-200">{realLatency}ms</span>
                </div>
                <div className="flex items-center space-x-1.5 bg-black/75 px-2 py-0.5 rounded border border-stone-800 whitespace-nowrap">
                  <span className="text-stone-400">CORE STATUS:</span>
                  <span className="font-bold font-orbitron text-amber-400">{metrics.status}</span>
                </div>
                <div className="flex items-center space-x-1.5 bg-black/75 px-2 py-0.5 rounded border border-stone-800 whitespace-nowrap">
                  <span className="text-stone-400">SYS TIME:</span>
                  <span className="font-bold font-orbitron text-stone-200">{currentTime}</span>
                </div>
              </div>
            )}

            {/* 4. LEFT PILLAR STATOR MAGNET VISUALIZER */}
            {renderEditableElement(
              'leftVisualizer',
              <div className="w-full h-full">
                <StatorMagnetVisualizer
                  side="left"
                  neonTheme={metrics.neonTheme}
                  shellMetal={metrics.shellMetal}
                  voiceState={voiceState}
                  audioLevel={audioLevel}
                  isOverclocked={metrics.isOverclocked}
                />
              </div>
            )}

            {/* 5. RIGHT PILLAR STATOR MAGNET VISUALIZER */}
            {renderEditableElement(
              'rightVisualizer',
              <div className="w-full h-full">
                <StatorMagnetVisualizer
                  side="right"
                  neonTheme={metrics.neonTheme}
                  shellMetal={metrics.shellMetal}
                  voiceState={voiceState}
                  audioLevel={audioLevel}
                  isOverclocked={metrics.isOverclocked}
                />
              </div>
            )}

            {/* FLOATING CENTRAL VOICE STATE CAPSULE */}
            {voiceState !== 'idle' && (
              <div 
                className="absolute left-[836px] top-[34px] -translate-x-1/2 z-35 pointer-events-none flex items-center space-x-2 px-3.5 py-1 rounded-full border backdrop-blur-md transition-all duration-300 font-tech shadow-xl"
                style={{
                  backgroundColor: voiceState === 'speaking' ? 'rgba(30, 27, 75, 0.90)' : voiceState === 'user_speaking' ? 'rgba(69, 26, 3, 0.90)' : voiceState === 'thinking' ? 'rgba(8, 47, 73, 0.90)' : 'rgba(6, 78, 59, 0.90)',
                  borderColor: voiceState === 'speaking' ? '#818cf8' : voiceState === 'user_speaking' ? '#f59e0b' : voiceState === 'thinking' ? '#38bdf8' : '#34d399',
                  boxShadow: `0 0 20px ${voiceState === 'speaking' ? '#818cf844' : voiceState === 'user_speaking' ? '#f59e0b44' : voiceState === 'thinking' ? '#38bdf844' : '#34d39944'}`
                }}
              >
                <span className={`w-2 h-2 rounded-full animate-ping ${voiceState === 'speaking' ? 'bg-indigo-400' : voiceState === 'user_speaking' ? 'bg-amber-400' : voiceState === 'thinking' || voiceState === 'connecting' ? 'bg-sky-400' : voiceState === 'error' ? 'bg-rose-400' : 'bg-emerald-400'}`} />
                <span className="font-orbitron font-bold text-xs tracking-wider uppercase text-white">
                  {voiceState === 'connecting' ? 'CONNECTING TO GEMINI LIVE...' : voiceState === 'error' ? 'VOICE LINK ERROR' : voiceState === 'user_speaking' ? 'HEARING YOUR VOICE...' : voiceState === 'thinking' ? 'GEMINI LIVE THINKING...' : voiceState === 'speaking' ? 'GEMINI LIVE SPEAKING...' : 'LISTENING — READY'}
                </span>
              </div>
            )}

            {/* 6. CENTRAL SUN REACTOR CORE (Inside circular aperture) */}
            {renderEditableElement(
              'core',
              <div className="w-full h-full flex items-center justify-center">
                <GoldReactorCore
                  isOverclocked={metrics.isOverclocked}
                  onToggleOverclock={handleToggleOverclock}
                  coreSpeedRPM={metrics.coreSpeedRPM}
                  temperature={metrics.temperature}
                  neonTheme={metrics.neonTheme}
                  shellMetal={metrics.shellMetal}
                  onCycleTheme={handleCycleTheme}
                  voiceState={voiceState}
                  voiceAudioLevel={audioLevel}
                />
              </div>,
              { forceUniformScale: true }
            )}

            {/* 7-12: 6 MOVABLE & RESIZABLE HUD WINDOWS */}
            {/* 7. TRANSCRIBER WIDGET (Top Left - Port 01) */}
            {renderHudWindow(
              'transcriber',
              'TRANSCRIBER & LIVE S2S',
              'PORT 01',
              <TranscriberWidget
                shellMetal={metrics.shellMetal}
                neonTheme={metrics.neonTheme}
                voiceState={voiceState}
                audioLevel={audioLevel}
                transcript={transcript}
                aiResponse={aiResponse}
                errorMessage={voiceError}
                onSendMessage={handleSendMessage}
                onToggleVoice={handleToggleVoice}
                onOpenDiagnostics={() => setIsDiagnosticsOpen(true)}
              />
            )}

            {/* 8. OS & TOOL CONTROLLER WIDGET (Middle Left - Port 02) */}
            {renderHudWindow(
              'osControl',
              'OS CONTROLLER & ENGINE',
              'PORT 02',
              <OsControlWidget
                shellMetal={metrics.shellMetal}
                neonTheme={metrics.neonTheme}
                isOverclocked={metrics.isOverclocked}
                onToggleOverclock={handleToggleOverclock}
                onRunDiagnostics={() => addLog('SYSTEM DIAGNOSTICS: ALL CORES & BUS PROTOCOLS SYNCD', 'success')}
                onActionTrigger={(action) => addLog(`SYSTEM ACTION: ${action.toUpperCase()} COMPLETED`, 'info')}
                externalShellOutput={latestShellOutput}
              />
            )}

            {/* 9. FIRECRAWL SEARCH & SCRAPER WIDGET (Bottom Left - Port 03) */}
            {renderHudWindow(
              'firecrawl',
              'FIRECRAWL SEARCH & SCRAPER',
              'PORT 03',
              <FirecrawlWidget
                shellMetal={metrics.shellMetal}
                neonTheme={metrics.neonTheme}
                externalResult={latestSearchResult}
              />
            )}

            {/* 10. HARDWARE TELEMETRY WIDGET (Top Right - Port 04) */}
            {renderHudWindow(
              'telemetry',
              'HARDWARE TELEMETRY',
              'PORT 04',
              <HardwareTelemetryWidget
                shellMetal={metrics.shellMetal}
                neonTheme={metrics.neonTheme}
                isOverclocked={metrics.isOverclocked}
                coreTemperature={metrics.temperature}
                onTelemetryUpdate={handleTelemetryUpdate}
              />
            )}

            {/* 11. TODO LIST VISUALIZER WIDGET (Middle Right - Port 05) */}
            {renderHudWindow(
              'todo',
              'TASK TODO ORCHESTRATOR',
              'PORT 05',
              <TodoListWidget
                shellMetal={metrics.shellMetal}
                neonTheme={metrics.neonTheme}
                externalTask={latestBackgroundTask}
              />
            )}

            {/* 12. MEDIA CONTROLLER WIDGET (Bottom Right - Port 06) */}
            {renderHudWindow(
              'media',
              'MEDIA CONTROLLER',
              'PORT 06',
              <MediaControllerWidget
                shellMetal={metrics.shellMetal}
                neonTheme={metrics.neonTheme}
              />
            )}

            {/* 13. DOCKED PRIMARY NAVIGATION CONSOLE (Inside 5 circular medallions) */}
            {renderEditableElement(
              'bottomNav',
              <div className="w-full h-full flex items-center justify-center">
                <BottomNav
                  activeTab={activeTab}
                  onTabChange={(tab) => setActiveTab(tab)}
                  shellMetal={metrics.shellMetal}
                />
              </div>
            )}

            {/* 14. BOTTOM-LEFT: METALLURGY & SPECTRUM TUNER RACK */}
            {renderEditableElement(
              'bottomLeft',
              <div className="flex items-center px-1 h-full w-full">
                <ShellMetalSwitcher
                  currentMetal={metrics.shellMetal}
                  onMetalChange={handleMetalChange}
                />
                <div className="ml-2">
                  <NeonColorSwitcher
                    currentTheme={metrics.neonTheme}
                    onThemeChange={handleThemeChange}
                    shellMetal={metrics.shellMetal}
                  />
                </div>
              </div>
            )}

            {/* 15. BOTTOM-CENTER: SYSTEM DMA BUS TELEMETRY BANNER */}
            {renderEditableElement(
              'bottomCenter',
              <div className="flex items-center justify-center text-[9px] font-mono tracking-widest text-amber-400/80 font-tech h-full w-full bg-black/40 px-2 rounded border border-stone-800/40 select-none">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mr-2" />
                <span>PONNIYIN SELVAN CORE // 256-BIT DMA SYSTEM BUS LINKED // DOCKED COCKPIT</span>
              </div>
            )}

            {/* 16. BOTTOM-RIGHT: LIVE VOICE S2S & AUDIO SYNTH TACTILE SWITCHES */}
            {renderEditableElement(
              'bottomRight',
              <div className="flex items-center justify-end space-x-2 px-1 h-full w-full">
                {/* Live Voice S2S Switch */}
                <button
                  onClick={() => {
                    handleToggleVoice();
                    soundManager.playClick();
                  }}
                  className="px-2 py-0.5 border transition-all flex items-center space-x-1.5 cursor-pointer text-[9px] clip-chamfer-sm font-tech bg-stone-950/95 hover:bg-stone-900 active:scale-95"
                  style={{
                    borderColor: voiceState !== 'idle' ? activeNeon.glowColor : '#44403c',
                    color: voiceState !== 'idle' ? activeNeon.glowColor : '#d6d3d1',
                    boxShadow: voiceState !== 'idle' ? `0 0 10px ${activeNeon.glowColor}55` : 'none',
                  }}
                  title={voiceState !== 'idle' ? 'Disconnect Voice S2S' : 'Connect Live Voice Speech-to-Speech'}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      voiceState === 'speaking'
                        ? 'animate-ping'
                        : voiceState === 'listening'
                        ? 'animate-pulse'
                        : ''
                    }`}
                    style={{
                      backgroundColor: voiceState !== 'idle' ? activeNeon.glowColor : '#57534e',
                    }}
                  />
                  <span className="font-bold font-orbitron text-stone-300">VOICE S2S</span>
                  <span 
                    className="px-1 py-0.1 rounded text-[8px] font-bold font-tech border"
                    style={{
                      backgroundColor: voiceState !== 'idle' ? `${activeNeon.glowColor}35` : '#1c1917',
                      borderColor: voiceState !== 'idle' ? activeNeon.glowColor : '#292524',
                      color: voiceState !== 'idle' ? activeNeon.glowColor : '#78716c',
                    }}
                  >
                    {voiceState === 'speaking'
                      ? 'TALKING'
                      : voiceState === 'listening'
                      ? 'LISTENING'
                      : voiceState === 'connected'
                      ? 'ONLINE'
                      : voiceState === 'connecting'
                      ? 'SYNC'
                      : 'OFF'}
                  </span>
                </button>

                {/* Audio Synthesizer Switch */}
                <button
                  onClick={() => {
                    const nextState = !metrics.isSoundEnabled;
                    setMetrics((prev) => ({ ...prev, isSoundEnabled: nextState }));
                    soundManager.enabled = nextState;
                    try {
                      localStorage.setItem('rhiona_sound_enabled', String(nextState));
                    } catch {
                      // ignore
                    }
                    if (nextState) soundManager.playClick();
                  }}
                  className="px-2 py-0.5 border transition-all flex items-center space-x-1.5 cursor-pointer text-[9px] clip-chamfer-sm font-tech bg-stone-950/95 hover:bg-stone-900 active:scale-95"
                  style={{
                    borderColor: metrics.isSoundEnabled ? activeNeon.glowColor : '#44403c',
                    color: metrics.isSoundEnabled ? activeNeon.glowColor : '#78716c',
                    boxShadow: metrics.isSoundEnabled ? `0 0 10px ${activeNeon.glowColor}55` : 'none',
                  }}
                  title="Toggle Audio Synthesizer"
                >
                  <span 
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      backgroundColor: metrics.isSoundEnabled ? activeNeon.glowColor : '#57534e',
                    }}
                  />
                  <span className="font-bold text-stone-300">AUDIO SYNTH</span>
                  <span 
                    className="px-1 py-0.1 rounded text-[8px] font-bold font-orbitron border"
                    style={{
                      backgroundColor: metrics.isSoundEnabled ? `${activeNeon.glowColor}35` : '#1c1917',
                      borderColor: metrics.isSoundEnabled ? activeNeon.glowColor : '#292524',
                      color: metrics.isSoundEnabled ? activeNeon.glowColor : '#78716c',
                    }}
                  >
                    {metrics.isSoundEnabled ? 'ON' : 'OFF'}
                  </span>
                </button>
              </div>
            )}

          </div>
        </div>
        )}

        {/* Mobile & Tablet Fallback View */}
        {isMobile && (
        <div className="w-full lg:hidden flex flex-col items-center space-y-4 my-auto max-w-lg p-4 pb-24">
          
          {/* Live Voice HUD for mobile */}
          <LiveVoiceHud
            voiceState={voiceState}
            onToggleVoice={handleToggleVoice}
            shellMetal={metrics.shellMetal}
            neonTheme={metrics.neonTheme}
            audioLevel={audioLevel}
            transcript={transcript}
            aiResponse={aiResponse}
            errorMessage={voiceError}
            onSendCommand={handleSendMessage}
          />

          <GoldReactorCore
            isOverclocked={metrics.isOverclocked}
            onToggleOverclock={handleToggleOverclock}
            coreSpeedRPM={metrics.coreSpeedRPM}
            temperature={metrics.temperature}
            neonTheme={metrics.neonTheme}
            shellMetal={metrics.shellMetal}
            onCycleTheme={handleCycleTheme}
            voiceState={voiceState}
            voiceAudioLevel={audioLevel}
          />

          {/* Bottom Nav on Mobile */}
          <BottomNav
            activeTab={activeTab}
            onTabChange={(tab) => setActiveTab(tab)}
            shellMetal={metrics.shellMetal}
          />

          {/* 6 Panels in Mobile View */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
            <TranscriberWidget
              shellMetal={metrics.shellMetal}
              neonTheme={metrics.neonTheme}
              voiceState={voiceState}
              audioLevel={audioLevel}
              transcript={transcript}
              aiResponse={aiResponse}
              errorMessage={voiceError}
              onSendMessage={handleSendMessage}
              onToggleVoice={handleToggleVoice}
            />
            <OsControlWidget
              shellMetal={metrics.shellMetal}
              neonTheme={metrics.neonTheme}
              isOverclocked={metrics.isOverclocked}
              onToggleOverclock={handleToggleOverclock}
              onRunDiagnostics={() => addLog('SYSTEM DIAGNOSTICS: ALL CORES & BUS PROTOCOLS SYNCD', 'success')}
              onActionTrigger={(action) => addLog(`SYSTEM ACTION: ${action.toUpperCase()} COMPLETED`, 'info')}
              externalShellOutput={latestShellOutput}
            />
            <FirecrawlWidget
              shellMetal={metrics.shellMetal}
              neonTheme={metrics.neonTheme}
              externalResult={latestSearchResult}
            />
            <HardwareTelemetryWidget
              shellMetal={metrics.shellMetal}
              neonTheme={metrics.neonTheme}
              isOverclocked={metrics.isOverclocked}
              coreTemperature={metrics.temperature}
              onTelemetryUpdate={handleTelemetryUpdate}
            />
            <TodoListWidget
              shellMetal={metrics.shellMetal}
              neonTheme={metrics.neonTheme}
              externalTask={latestBackgroundTask}
            />
            <MediaControllerWidget
              shellMetal={metrics.shellMetal}
              neonTheme={metrics.neonTheme}
            />
          </div>
        </div>
        )}

      </main>

      {/* UNIFIED BOTTOM CNC MACHINED COCKPIT CONSOLE DECK (Mobile only fallback) */}
      <footer 
        className={`lg:hidden relative z-30 w-full px-4 sm:px-6 py-2 border-t ${activeShell.headerBorder} ${activeShell.headerBg} backdrop-blur-md flex flex-wrap items-center justify-between gap-3 text-xs transition-all duration-500 shadow-[0_-4px_25px_rgba(0,0,0,0.9)]`}
      >
        {/* Left Section: Machined Metallurgy Selector & Spectrum Tuner Rack */}
        <div className="flex items-center space-x-2 font-tech">
          <ShellMetalSwitcher
            currentMetal={metrics.shellMetal}
            onMetalChange={handleMetalChange}
          />
          <NeonColorSwitcher
            currentTheme={metrics.neonTheme}
            onThemeChange={handleThemeChange}
            shellMetal={metrics.shellMetal}
          />
        </div>

        {/* Center Section: System DMA Bus Telemetry Banner */}
        <div className="hidden md:flex items-center space-x-2 text-[9.5px] font-mono tracking-widest text-stone-500 font-tech">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>PONNIYIN SELVAN CORE // 256-BIT DMA SYSTEM BUS LINKED // DOCKED COCKPIT</span>
        </div>

        {/* Right Section: Aviation-Grade Illuminated Tactical Rocker Switches */}
        <div className="flex items-center space-x-2.5 font-tech">
          {/* Live Voice S2S Tactile Rocker Switch */}
          <button
            onClick={() => {
              handleToggleVoice();
              soundManager.playClick();
            }}
            className="px-3 py-1.5 border transition-all flex items-center space-x-2 cursor-pointer text-[10px] clip-chamfer-sm font-tech bg-stone-950/95 hover:bg-stone-900 active:scale-95"
            style={{
              borderColor: voiceState !== 'idle' ? activeNeon.glowColor : '#44403c',
              color: voiceState !== 'idle' ? activeNeon.glowColor : '#d6d3d1',
              boxShadow: voiceState !== 'idle' ? `0 0 14px ${activeNeon.glowColor}55, inset 0 0 8px ${activeNeon.glowColor}22` : 'none',
            }}
            title={voiceState !== 'idle' ? 'Disconnect Voice S2S' : 'Connect Live Voice Speech-to-Speech'}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                voiceState === 'speaking'
                  ? 'animate-ping'
                  : voiceState === 'listening'
                  ? 'animate-pulse'
                  : ''
              }`}
              style={{
                backgroundColor: voiceState !== 'idle' ? activeNeon.glowColor : '#57534e',
                boxShadow: voiceState !== 'idle' ? `0 0 8px ${activeNeon.glowColor}` : 'none',
              }}
            />
            <span className="font-bold font-orbitron text-stone-300">VOICE S2S</span>
            <span 
              className="px-1.5 py-0.2 rounded text-[8.5px] font-bold font-tech border"
              style={{
                backgroundColor: voiceState !== 'idle' ? `${activeNeon.glowColor}35` : '#1c1917',
                borderColor: voiceState !== 'idle' ? activeNeon.glowColor : '#292524',
                color: voiceState !== 'idle' ? activeNeon.glowColor : '#78716c',
              }}
            >
              {voiceState === 'speaking'
                ? 'TALKING'
                : voiceState === 'listening'
                ? 'LISTENING'
                : voiceState === 'connected'
                ? 'ONLINE'
                : voiceState === 'connecting'
                ? 'SYNC'
                : 'OFF'}
            </span>
          </button>

          {/* Audio Synthesizer Tactile Rocker Switch */}
          <button
            onClick={() => {
              const nextState = !metrics.isSoundEnabled;
              setMetrics((prev) => ({ ...prev, isSoundEnabled: nextState }));
              soundManager.enabled = nextState;
              try {
                localStorage.setItem('rhiona_sound_enabled', String(nextState));
              } catch {
                // ignore
              }
              if (nextState) {
                soundManager.playClick();
              }
            }}
            className="px-3 py-1.5 border transition-all flex items-center space-x-2 cursor-pointer text-[10px] clip-chamfer-sm font-tech bg-stone-950/95 hover:bg-stone-900 active:scale-95"
            style={{
              borderColor: metrics.isSoundEnabled ? activeNeon.glowColor : '#44403c',
              color: metrics.isSoundEnabled ? activeNeon.glowColor : '#78716c',
              boxShadow: metrics.isSoundEnabled ? `0 0 14px ${activeNeon.glowColor}55, inset 0 0 8px ${activeNeon.glowColor}22` : 'none',
            }}
            title="Toggle Audio Synthesizer"
          >
            <span 
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor: metrics.isSoundEnabled ? activeNeon.glowColor : '#57534e',
                boxShadow: metrics.isSoundEnabled ? `0 0 8px ${activeNeon.glowColor}` : 'none'
              }}
            />
            <span className="font-bold text-stone-300">AUDIO SYNTH</span>
            <span 
              className="px-1.5 py-0.2 rounded text-[8.5px] font-bold font-orbitron border"
              style={{
                backgroundColor: metrics.isSoundEnabled ? `${activeNeon.glowColor}35` : '#1c1917',
                borderColor: metrics.isSoundEnabled ? activeNeon.glowColor : '#292524',
                color: metrics.isSoundEnabled ? activeNeon.glowColor : '#78716c',
              }}
            >
              {metrics.isSoundEnabled ? 'ON' : 'OFF'}
            </span>
          </button>
        </div>
      </footer>

      {/* Tab Overlay Modal for Diagnostics, Settings, User Profile */}
      <TabModal
        activeTab={activeTab}
        onClose={() => setActiveTab('home')}
        metrics={metrics}
        onUpdateMetrics={(updates) => setMetrics((prev) => ({ ...prev, ...updates }))}
        logs={logs}
        onAddLog={addLog}
      />

      {/* S2S Voice Diagnostics & Packet Logger Modal */}
      <DiagnosticLoggerModal
        isOpen={isDiagnosticsOpen}
        onClose={() => setIsDiagnosticsOpen(false)}
        shellMetal={metrics.shellMetal}
        neonTheme={metrics.neonTheme}
        voiceState={voiceState}
        audioLevel={audioLevel}
      />
    </div>
  );
}
