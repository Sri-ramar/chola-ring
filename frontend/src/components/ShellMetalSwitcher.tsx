import React from 'react';
import { ShellMetalId, SHELL_METAL_THEMES, getShellMetalTheme } from '../utils/metalThemes';
import { soundManager } from '../utils/audio';
import { Shield } from 'lucide-react';

interface ShellMetalSwitcherProps {
  currentMetal: ShellMetalId;
  onMetalChange: (metalId: ShellMetalId) => void;
  compact?: boolean;
}

export const ShellMetalSwitcher: React.FC<ShellMetalSwitcherProps> = ({
  currentMetal,
  onMetalChange,
  compact = false
}) => {
  const activeTheme = getShellMetalTheme(currentMetal);

  const handleSelect = (id: ShellMetalId) => {
    if (id === currentMetal) return;
    soundManager.playSteamHiss();
    onMetalChange(id);
  };

  return (
    <div className="flex items-center select-none">
      {/* Heavy Machined Metallurgical Rack */}
      <div 
        className="flex items-center px-1.5 py-1 bg-stone-950/95 border backdrop-blur-md shadow-[inset_0_2px_8px_rgba(0,0,0,0.9),0_4px_16px_rgba(0,0,0,0.8)] clip-chamfer-sm space-x-1"
        style={{ borderColor: activeTheme.panel.cornerBracketColor }}
      >
        <div className="hidden sm:flex items-center space-x-1 mr-1 pr-1 border-r border-stone-800 text-[8px] font-orbitron font-bold text-stone-400">
          <Shield className="w-3 h-3" style={{ color: activeTheme.panel.cornerBracketColor }} />
          <span>SHELL</span>
        </div>

        {SHELL_METAL_THEMES.map((theme) => {
          const isActive = theme.id === currentMetal;

          return (
            <button
              key={theme.id}
              onClick={() => handleSelect(theme.id)}
              title={`${theme.name} (${theme.subtitle})`}
              className={`relative flex items-center justify-center transition-all duration-300 cursor-pointer clip-chamfer-sm px-1.5 py-0.5 ${
                isActive
                  ? 'bg-stone-900 border shadow-[0_0_12px_rgba(217,119,6,0.4)]'
                  : 'bg-black/60 border border-stone-800/80 hover:border-stone-600 hover:bg-stone-900/60 opacity-80 hover:opacity-100'
              }`}
              style={{
                borderColor: isActive ? activeTheme.panel.cornerBracketColor : undefined
              }}
            >
              {/* Machined Metal Ingot Swatch */}
              <div 
                className="w-3.5 h-3.5 rounded-sm border transition-transform duration-300 shadow-sm"
                style={{
                  background: theme.previewGradient,
                  borderColor: isActive ? '#fff' : 'rgba(255,255,255,0.2)',
                  transform: isActive ? 'scale(1.1)' : 'scale(1)'
                }}
              />

              <span 
                className={`ml-1 text-[8.5px] font-bold font-mono tracking-wider transition-colors ${
                  isActive ? 'text-white' : 'text-stone-400'
                }`}
              >
                {theme.shortName}
              </span>

              {/* Active Underglow Line */}
              {isActive && (
                <div 
                  className="absolute -bottom-0.5 inset-x-1 h-[2px]"
                  style={{
                    backgroundColor: activeTheme.panel.cornerBracketColor,
                    boxShadow: `0 0 6px ${activeTheme.panel.cornerBracketColor}`
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
