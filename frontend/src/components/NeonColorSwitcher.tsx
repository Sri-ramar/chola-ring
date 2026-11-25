import React from 'react';
import { NeonColorId, NEON_THEMES } from '../utils/neonThemes';
import { ShellMetalId, getShellMetalTheme } from '../utils/metalThemes';
import { soundManager } from '../utils/audio';
import { Sparkles } from 'lucide-react';

interface NeonColorSwitcherProps {
  currentTheme: NeonColorId;
  onThemeChange: (themeId: NeonColorId) => void;
  compact?: boolean;
  shellMetal?: ShellMetalId;
}

export const NeonColorSwitcher: React.FC<NeonColorSwitcherProps> = ({
  currentTheme,
  onThemeChange,
  shellMetal = 'gold'
}) => {
  const metal = getShellMetalTheme(shellMetal);

  const handleSelect = (id: NeonColorId) => {
    if (id === currentTheme) return;
    soundManager.playColorShift();
    onThemeChange(id);
  };

  return (
    <div className="flex items-center select-none">
      {/* Heavy Machined Spectrum Tuner Deck */}
      <div 
        className="flex items-center px-1.5 py-1 bg-stone-950/95 border backdrop-blur-md shadow-[inset_0_2px_8px_rgba(0,0,0,0.9),0_4px_16px_rgba(0,0,0,0.8)] clip-chamfer-sm space-x-1"
        style={{ borderColor: metal.panel.cornerBracketColor }}
      >
        <div className="hidden sm:flex items-center space-x-1 mr-1 pr-1 border-r border-stone-800 text-[8px] font-orbitron font-bold text-stone-400">
          <Sparkles className="w-3 h-3" style={{ color: metal.panel.cornerBracketColor }} />
          <span>SPECTRUM</span>
        </div>

        {NEON_THEMES.map((theme) => {
          const isActive = theme.id === currentTheme;

          return (
            <button
              key={theme.id}
              onClick={() => handleSelect(theme.id)}
              title={`${theme.name} Glow`}
              className={`relative flex items-center justify-center transition-all duration-300 cursor-pointer clip-chamfer-sm px-1.5 py-0.5 ${
                isActive
                  ? 'bg-stone-900 border shadow-[0_0_12px_rgba(255,255,255,0.25)]'
                  : 'bg-black/60 border border-stone-800/80 hover:border-stone-600 hover:bg-stone-900/60 opacity-80 hover:opacity-100'
              }`}
              style={{
                borderColor: isActive ? theme.glowColor : undefined
              }}
            >
              {/* Glowing Diamond Frequency Crystal */}
              <div 
                className="w-3 h-3 transition-transform duration-300"
                style={{
                  backgroundColor: theme.glowColor,
                  clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
                  boxShadow: isActive 
                    ? `0 0 10px ${theme.glowColor}, 0 0 20px ${theme.glowColor}`
                    : `0 0 4px ${theme.glowColor}80`,
                  transform: isActive ? 'scale(1.2)' : 'scale(0.95)'
                }}
              />

              {/* Active Underglow Line */}
              {isActive && (
                <div 
                  className="absolute -bottom-0.5 inset-x-1 h-[2px]"
                  style={{
                    backgroundColor: theme.glowColor,
                    boxShadow: `0 0 6px ${theme.glowColor}`
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
