import React, { useState } from 'react';
import { NavTab, CoreMetrics, LogMessage } from '../types';
import { X, Volume2, VolumeX, Zap, RefreshCw, Sliders, Sparkles, Shield, Mic, Check, CheckCircle2, Play, Loader2 } from 'lucide-react';
import { soundManager } from '../utils/audio';
import { NEON_THEMES } from '../utils/neonThemes';
import { SHELL_METAL_THEMES, getShellMetalTheme } from '../utils/metalThemes';
import { voiceManager } from '../utils/voiceManager';

export const GEMINI_LIVE_VOICES = [
  { id: 'Puck', name: 'Puck', desc: 'Playful & Expressive', gender: 'Dynamic / Neutral' },
  { id: 'Charon', name: 'Charon', desc: 'Deep & Authoritative', gender: 'Masculine' },
  { id: 'Kore', name: 'Kore', desc: 'Calm & Soothing', gender: 'Feminine' },
  { id: 'Fenrir', name: 'Fenrir', desc: 'Bold & Crisp', gender: 'Masculine' },
  { id: 'Aoede', name: 'Aoede', desc: 'Warm & Melodic', gender: 'Feminine' },
  { id: 'Zephyr', name: 'Zephyr', desc: 'Gentle & Clear', gender: 'Feminine' },
  { id: 'Leda', name: 'Leda', desc: 'Confident & Articulate', gender: 'Feminine' },
  { id: 'Orus', name: 'Orus', desc: 'Direct & Tactical', gender: 'Masculine' },
  { id: 'Arcas', name: 'Arcas', desc: 'Technical & Modern', gender: 'Masculine' },
  { id: 'Vega', name: 'Vega', desc: 'Bright & Engaging', gender: 'Feminine' },
];

interface TabModalProps {
  activeTab: NavTab;
  onClose: () => void;
  metrics: CoreMetrics;
  onUpdateMetrics: (updates: Partial<CoreMetrics>) => void;
  logs: LogMessage[];
  onAddLog: (text: string, type?: 'info' | 'success' | 'warning' | 'alert') => void;
}

export const TabModal: React.FC<TabModalProps> = ({
  activeTab,
  onClose,
  metrics,
  onUpdateMetrics,
  onAddLog
}) => {
  if (activeTab === 'home') return null;

  const metal = getShellMetalTheme(metrics.shellMetal);
  const [selectedVoice, setSelectedVoice] = useState<string>(voiceManager.selectedVoice || 'Puck');
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [testingVoiceId, setTestingVoiceId] = useState<string | null>(null);

  const handleSaveSettings = () => {
    soundManager.playClick();
    voiceManager.setVoice(selectedVoice);
    setIsSaved(true);
    onAddLog(`CONFIGURATION SAVED: Gemini Live Voice set to ${selectedVoice.toUpperCase()}`, 'success');
    setTimeout(() => setIsSaved(false), 2400);
  };

  const handleTestVoice = async (voiceId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    soundManager.playClick();
    setTestingVoiceId(voiceId);
    onAddLog(`SYNTHESIZING PREVIEW: Voice ${voiceId.toUpperCase()}...`, 'info');
    await voiceManager.previewVoice(voiceId);
    setTestingVoiceId(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div 
        className={`${metal.panel.bgClass} w-full max-w-2xl border ${metal.panel.borderClass} p-6 relative ${metal.panel.bodyTextClass} font-mono shadow-[0_0_40px_rgba(0,0,0,0.8)] clip-chamfer-corner`}
      >
        {/* Top-Left Tech Corner Bracket */}
        <div className="absolute top-0 left-0 w-4 h-4 pointer-events-none">
          <div className="absolute top-0 left-0 w-full h-[2px]" style={{ backgroundColor: metal.panel.cornerBracketColor }} />
          <div className="absolute top-0 left-0 w-[2px] h-full" style={{ backgroundColor: metal.panel.cornerBracketColor }} />
        </div>

        {/* Bottom-Right Tech Corner Bracket */}
        <div className="absolute bottom-0 right-0 w-4 h-4 pointer-events-none">
          <div className="absolute bottom-0 right-0 w-full h-[2px]" style={{ backgroundColor: metal.panel.cornerBracketColor }} />
          <div className="absolute bottom-0 right-0 w-[2px] h-full" style={{ backgroundColor: metal.panel.cornerBracketColor }} />
        </div>

        {/* Header Bar */}
        <div className={`flex items-center justify-between pb-3 mb-4 border-b ${metal.panel.headerBorderClass}`}>
          <div className="flex items-center space-x-2">
            <span className={`w-2 h-2 ${metal.panel.titleDotClass} animate-pulse`} />
            <h2 className={`text-base sm:text-lg font-extrabold uppercase tracking-widest ${metal.panel.titleColorClass} ${metal.panel.valueGlowClass}`}>
              {activeTab === 'pulse' && 'SYSTEM DIAGNOSTICS'}
              {activeTab === 'grid' && 'MATRIX & POWER DISTRIBUTION'}
              {activeTab === 'settings' && 'INTERFACE CONFIGURATION & VOICES'}
              {activeTab === 'user' && 'OPERATOR AUTHORIZATION'}
            </h2>
          </div>
          <button
            onClick={() => {
              soundManager.playClick();
              onClose();
            }}
            className={`p-1.5 border ${metal.panel.buttonClass} transition-colors cursor-pointer clip-chamfer-sm`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* TAB 1: DIAGNOSTICS */}
        {activeTab === 'pulse' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className={`bg-black/70 p-3 border ${metal.panel.borderClass} clip-chamfer-sm`}>
                <div className={`${metal.panel.tagTextClass} text-[10px] uppercase tracking-wider font-bold`}>Core Frequency</div>
                <div className={`text-xl font-bold ${metal.panel.titleColorClass} mt-1 font-mono`}>432.85 MHz</div>
              </div>
              <div className={`bg-black/70 p-3 border ${metal.panel.borderClass} clip-chamfer-sm`}>
                <div className={`${metal.panel.tagTextClass} text-[10px] uppercase tracking-wider font-bold`}>Thermal Equilibrium</div>
                <div className={`text-xl font-bold ${metal.panel.titleColorClass} mt-1 font-mono`}>{Math.round(metrics.temperature)}°C</div>
              </div>
              <div className={`bg-black/70 p-3 border ${metal.panel.borderClass} clip-chamfer-sm`}>
                <div className={`${metal.panel.tagTextClass} text-[10px] uppercase tracking-wider font-bold`}>Harmonic Distortion</div>
                <div className={`text-xl font-bold ${metal.panel.titleColorClass} mt-1 font-mono`}>0.042%</div>
              </div>
              <div className={`bg-black/70 p-3 border ${metal.panel.borderClass} clip-chamfer-sm`}>
                <div className={`${metal.panel.tagTextClass} text-[10px] uppercase tracking-wider font-bold`}>Gemini Live Conduit</div>
                <div className={`text-xl font-bold ${metal.panel.titleColorClass} mt-1 font-mono`}>ONLINE</div>
              </div>
            </div>

            <div className="pt-2">
              <span className={`text-xs font-bold ${metal.panel.titleColorClass} uppercase tracking-widest`}>Diagnostic Test Suite</span>
              <div className="flex space-x-2 mt-2">
                <button
                  onClick={() => {
                    soundManager.playPulse();
                    onAddLog('THERMAL PURGE COMPLETED', 'success');
                    onUpdateMetrics({ temperature: 32 });
                  }}
                  className={`flex-1 py-2 px-3 border ${metal.panel.buttonClass} text-xs font-bold flex items-center justify-center space-x-1.5 transition-colors cursor-pointer clip-chamfer-sm`}
                >
                  <RefreshCw className="w-3.5 h-3.5" style={{ color: metal.panel.cornerBracketColor }} />
                  <span>RUN PURGE</span>
                </button>
                <button
                  onClick={() => {
                    soundManager.playOverclock();
                    onAddLog('OVERCLOCK CALIBRATION INITIATED', 'warning');
                    onUpdateMetrics({ isOverclocked: !metrics.isOverclocked, status: metrics.isOverclocked ? 'ONLINE' : 'OVERCLOCKED' });
                  }}
                  className={`flex-1 py-2 px-3 border ${metal.panel.buttonClass} text-xs font-bold flex items-center justify-center space-x-1.5 transition-colors cursor-pointer clip-chamfer-sm`}
                >
                  <Zap className="w-3.5 h-3.5" style={{ color: metal.panel.cornerBracketColor }} />
                  <span>{metrics.isOverclocked ? 'DISABLE OVERCLOCK' : 'MAX OVERCLOCK'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: MATRIX */}
        {activeTab === 'grid' && (
          <div className="space-y-4">
            <p className={`text-xs ${metal.panel.tagTextClass}`}>
              Live power grid routing for satellite telemetry modules and containment field emitters.
            </p>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className={metal.panel.titleColorClass}>Containment Field Stabilizers</span>
                  <span style={{ color: metal.panel.cornerBracketColor }}>98.4%</span>
                </div>
                <div className={`h-2.5 bg-black border ${metal.panel.borderClass} p-[1px] clip-chamfer-sm`}>
                  <div 
                    className="h-full" 
                    style={{ 
                      width: '98.4%',
                      backgroundColor: metal.panel.cornerBracketColor,
                      boxShadow: metal.nav.trackShadow
                    }} 
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className={metal.panel.titleColorClass}>Magnetic Confinement Array</span>
                  <span style={{ color: metal.panel.cornerBracketColor }}>{metrics.powerOutput}%</span>
                </div>
                <div className={`h-2.5 bg-black border ${metal.panel.borderClass} p-[1px] clip-chamfer-sm`}>
                  <div 
                    className="h-full" 
                    style={{ 
                      width: `${metrics.powerOutput}%`,
                      backgroundColor: metal.panel.cornerBracketColor,
                      boxShadow: metal.nav.trackShadow
                    }} 
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className={metal.panel.titleColorClass}>Auxiliary Energy Storage</span>
                  <span style={{ color: metal.panel.cornerBracketColor }}>{metrics.energyLevel}%</span>
                </div>
                <div className={`h-2.5 bg-black border ${metal.panel.borderClass} p-[1px] clip-chamfer-sm`}>
                  <div 
                    className="h-full" 
                    style={{ 
                      width: `${metrics.energyLevel}%`,
                      backgroundColor: metal.panel.cornerBracketColor,
                      boxShadow: metal.nav.trackShadow
                    }} 
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: SETTINGS & VOICES */}
        {activeTab === 'settings' && (
          <div className="space-y-3.5 max-h-[62vh] overflow-y-auto pr-1">
            {/* 1. Gemini Live Voice Selector */}
            <div className={`p-3 bg-black/70 border ${metal.panel.borderClass} space-y-2 clip-chamfer-sm`}>
              <div className="flex items-center justify-between">
                <div className={`text-xs font-bold ${metal.panel.titleColorClass} flex items-center space-x-1.5`}>
                  <Mic className="w-4 h-4" style={{ color: metal.panel.cornerBracketColor }} />
                  <span>Gemini Live AI Voice Persona</span>
                </div>
                <span className={`text-[9px] uppercase font-mono px-2 py-0.5 bg-black border ${metal.panel.borderClass} ${metal.badgeText} clip-chamfer-sm`}>
                  ACTIVE: {selectedVoice.toUpperCase()}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
                {GEMINI_LIVE_VOICES.map((v) => {
                  const isSelected = selectedVoice === v.id;
                  const isTesting = testingVoiceId === v.id;

                  return (
                    <div
                      key={v.id}
                      onClick={() => {
                        soundManager.playClick();
                        setSelectedVoice(v.id);
                      }}
                      className={`flex flex-col p-2 border transition-all cursor-pointer clip-chamfer-sm text-left relative group ${
                        isSelected
                          ? `bg-white/15 border-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.3)]`
                          : 'bg-black/50 border-stone-800 hover:border-stone-600 hover:bg-white/5 opacity-80 hover:opacity-100'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-extrabold uppercase font-orbitron ${isSelected ? 'text-amber-300' : 'text-stone-200'}`}>
                          {v.name}
                        </span>
                        {isSelected && <Check className="w-3 h-3 text-amber-300" />}
                      </div>
                      <span className="text-[9px] text-stone-400 mt-0.5 leading-tight">{v.desc}</span>
                      <span className="text-[8px] text-stone-500 mt-0.5 mb-1.5">{v.gender}</span>

                      {/* Test Voice Audio Button */}
                      <button
                        onClick={(e) => handleTestVoice(v.id, e)}
                        disabled={isTesting}
                        className={`mt-auto py-1 px-1.5 rounded text-[9px] font-bold uppercase flex items-center justify-center space-x-1 transition-colors cursor-pointer border ${
                          isSelected
                            ? 'bg-amber-400/20 border-amber-400/60 text-amber-300 hover:bg-amber-400/30'
                            : 'bg-stone-900 border-stone-700 text-stone-300 hover:border-stone-500 hover:bg-stone-800'
                        }`}
                        title={`Listen to a live preview of ${v.name}`}
                      >
                        {isTesting ? (
                          <>
                            <Loader2 className="w-2.5 h-2.5 animate-spin" />
                            <span>PLAYING...</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-2.5 h-2.5 fill-current" />
                            <span>TEST VOICE</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 2. Chassis Shell Metallurgy */}
            <div className={`p-3 bg-black/70 border ${metal.panel.borderClass} space-y-2 clip-chamfer-sm`}>
              <div className="flex items-center justify-between">
                <div className={`text-xs font-bold ${metal.panel.titleColorClass} flex items-center space-x-1.5`}>
                  <Shield className="w-4 h-4" style={{ color: metal.panel.cornerBracketColor }} />
                  <span>Chassis Shell Metallurgy</span>
                </div>
                <span className={`text-[9px] uppercase font-mono px-2 py-0.5 bg-black border ${metal.panel.borderClass} ${metal.badgeText} clip-chamfer-sm`}>
                  {metrics.shellMetal ? `${metrics.shellMetal.toUpperCase()} METAL` : 'GOLD METAL'}
                </span>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                {SHELL_METAL_THEMES.map((themeMetal) => {
                  const isSelected = (metrics.shellMetal || 'gold') === themeMetal.id;
                  return (
                    <button
                      key={themeMetal.id}
                      onClick={() => {
                        soundManager.playClick();
                        onUpdateMetrics({ shellMetal: themeMetal.id });
                        onAddLog(`CHASSIS METALLURGY: ${themeMetal.name.toUpperCase()}`, 'info');
                      }}
                      className={`flex items-center space-x-2.5 p-2 border transition-all cursor-pointer clip-chamfer-sm text-left ${
                        isSelected
                          ? `bg-white/15 ${themeMetal.badgeBorder} shadow-[0_0_12px_rgba(255,255,255,0.2)]`
                          : 'bg-black/50 border-stone-800 hover:border-stone-600 hover:bg-white/5 opacity-80 hover:opacity-100'
                      }`}
                    >
                      <div
                        className={`w-6 h-6 rounded-sm border shrink-0 ${isSelected ? 'scale-105 border-white shadow-md' : 'border-stone-700'}`}
                        style={{ background: themeMetal.previewGradient }}
                      />
                      <div className="min-w-0">
                        <div className={`text-xs font-bold uppercase ${isSelected ? themeMetal.badgeText : 'text-stone-300'}`}>
                          {themeMetal.name}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. Neon Core Glow Spectrum */}
            <div className={`p-3 bg-black/70 border ${metal.panel.borderClass} space-y-2 clip-chamfer-sm`}>
              <div className="flex items-center justify-between">
                <div className={`text-xs font-bold ${metal.panel.titleColorClass} flex items-center space-x-1.5`}>
                  <Sparkles className="w-4 h-4" style={{ color: metal.panel.cornerBracketColor }} />
                  <span>Internal Neon Glow Spectrum</span>
                </div>
                <span className={`text-[9px] uppercase font-mono px-2 py-0.5 bg-black border ${metal.panel.borderClass} ${metal.panel.tagTextClass} clip-chamfer-sm`}>
                  {metrics.neonTheme || 'amber'}
                </span>
              </div>
              
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 pt-1">
                {NEON_THEMES.map((theme) => {
                  const isSelected = (metrics.neonTheme || 'amber') === theme.id;
                  return (
                    <button
                      key={theme.id}
                      onClick={() => {
                        soundManager.playColorShift();
                        onUpdateMetrics({ neonTheme: theme.id });
                        onAddLog(`SPECTRUM SHIFT: ${theme.name.toUpperCase()}`, 'info');
                      }}
                      className={`flex flex-col items-center justify-center p-1.5 border transition-all cursor-pointer clip-chamfer-sm ${
                        isSelected
                          ? 'bg-white/10 border-amber-300 shadow-[0_0_10px_rgba(255,255,255,0.2)]'
                          : 'bg-black/40 border-stone-800 hover:border-stone-600 hover:bg-white/5 opacity-80 hover:opacity-100'
                      }`}
                    >
                      <div
                        className="w-3.5 h-3.5 mb-1"
                        style={{
                          backgroundColor: theme.glowColor,
                          clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
                          boxShadow: isSelected ? `0 0 10px ${theme.glowColor}` : `0 0 3px ${theme.glowColor}80`,
                        }}
                      />
                      <span className="text-[9.5px] font-bold text-stone-300">
                        {theme.shortName}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 4. Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className={`flex items-center justify-between p-2.5 bg-black/70 border ${metal.panel.borderClass} clip-chamfer-sm`}>
                <div className="flex items-center space-x-2">
                  {metrics.isSoundEnabled ? <Volume2 className="w-4 h-4 text-amber-400" /> : <VolumeX className="w-4 h-4 text-stone-500" />}
                  <span className={`text-xs font-bold ${metal.panel.titleColorClass}`}>Sound FX</span>
                </div>
                <button
                  onClick={() => {
                    const nextSound = !metrics.isSoundEnabled;
                    soundManager.enabled = nextSound;
                    onUpdateMetrics({ isSoundEnabled: nextSound });
                    if (nextSound) soundManager.playClick();
                  }}
                  className="px-2.5 py-0.5 text-[10px] font-bold uppercase border transition-colors cursor-pointer clip-chamfer-sm"
                  style={{
                    backgroundColor: metrics.isSoundEnabled ? metal.panel.cornerBracketColor : '#000000',
                    color: metrics.isSoundEnabled ? '#000000' : metal.panel.cornerBracketColor,
                    borderColor: metal.panel.cornerBracketColor,
                  }}
                >
                  {metrics.isSoundEnabled ? 'ENABLED' : 'MUTED'}
                </button>
              </div>

              {/* TEST ACTIVE VOICE BUTTON */}
              <button
                onClick={() => handleTestVoice(selectedVoice)}
                disabled={testingVoiceId === selectedVoice}
                className="py-2.5 px-3 font-orbitron font-bold text-xs uppercase tracking-wider flex items-center justify-center space-x-1.5 transition-all cursor-pointer clip-chamfer-sm bg-stone-900 border border-amber-500/50 text-amber-300 hover:bg-stone-800 active:scale-98"
              >
                {testingVoiceId === selectedVoice ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>TESTING...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>TEST {selectedVoice.toUpperCase()}</span>
                  </>
                )}
              </button>

              {/* SAVE SETTINGS BUTTON */}
              <button
                onClick={handleSaveSettings}
                className="py-2.5 px-4 font-orbitron font-extrabold text-xs uppercase tracking-wider flex items-center justify-center space-x-2 transition-all cursor-pointer clip-chamfer-sm bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-black shadow-[0_0_15px_rgba(245,158,11,0.4)] hover:brightness-110 active:scale-98"
              >
                {isSaved ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>SAVED & APPLIED!</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>SAVE CONFIG</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* TAB 4: OPERATOR */}
        {activeTab === 'user' && (
          <div className="space-y-4">
            <div className={`flex items-center space-x-3 p-3 bg-black/70 border ${metal.panel.borderClass} clip-chamfer-sm`}>
              <div 
                className="w-11 h-11 border flex items-center justify-center font-bold text-base clip-octagon"
                style={{ 
                  borderColor: metal.panel.cornerBracketColor,
                  backgroundColor: `${metal.panel.cornerBracketColor}20`,
                  color: metal.panel.cornerBracketColor
                }}
              >
                OP1
              </div>
              <div>
                <div className={`text-sm font-extrabold ${metal.panel.titleColorClass}`}>OPERATOR: COMMANDER</div>
                <div className={`text-xs ${metal.panel.tagTextClass}`}>CLEARANCE: LEVEL 5 OVERRIDE</div>
                <div className="text-[10px] text-stone-400 mt-0.5">SESSION ID: 884-AETHER-901 [{metal.shortName}]</div>
              </div>
            </div>

            <div className={`p-3 bg-black/70 border ${metal.panel.borderClass} clip-chamfer-sm`}>
              <div className={`text-xs font-bold ${metal.panel.titleColorClass} mb-2 uppercase`}>Security Clearance Log</div>
              <div className="text-[11px] text-stone-300/80 space-y-1">
                <div>■ AUTHENTICATED VIA RETINAL MATRIX</div>
                <div>■ BIOMETRIC SYNC: STABLE</div>
                <div>■ CHASSIS ARCHITECTURE: {metal.name.toUpperCase()}</div>
                <div>■ VOICE LINK: GEMINI LIVE ({selectedVoice.toUpperCase()})</div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
