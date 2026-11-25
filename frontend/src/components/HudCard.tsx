import React from 'react';
import { ShellMetalId, getShellMetalTheme } from '../utils/metalThemes';
import { GripHorizontal } from 'lucide-react';

interface HudCardProps {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
  tag?: string;
  title?: string;
  isDragged?: boolean;
  dockSide?: 'left' | 'right' | 'both' | 'none';
  shellMetal?: ShellMetalId;
  dragHandleProps?: any;
  onResetPosition?: () => void;
}

export const HudCard: React.FC<HudCardProps> = ({
  children,
  className = '',
  glow = false,
  tag,
  title,
  isDragged = false,
  shellMetal = 'gold',
  dragHandleProps,
  onResetPosition,
}) => {
  const metal = getShellMetalTheme(shellMetal);

  return (
    <div className={`relative group w-full h-full flex flex-col transition-all duration-300 ${className}`}>
      {/* Skeuomorphic Dark Bronze/Obsidian Chassis Plate */}
      <div
        className={`relative w-full h-full flex flex-col rounded p-1.5 sm:p-2 font-mono transition-all duration-300 ${
          isDragged
            ? 'border border-amber-500/80 shadow-[0_8px_32px_rgba(0,0,0,0.95),0_0_24px_rgba(245,158,11,0.5)]'
            : glow
            ? metal.panel.glowClass
            : 'border border-amber-900/15'
        }`}
        style={{
          backgroundColor: isDragged ? 'rgba(12, 9, 6, 0.94)' : 'rgba(8, 6, 4, 0.48)',
          backdropFilter: 'blur(6px)',
          boxShadow: isDragged
            ? 'inset 0 1px 1px rgba(251, 191, 36, 0.4), 0 10px 40px rgba(0, 0, 0, 0.98)'
            : 'inset 0 1px 2px rgba(0, 0, 0, 0.6)',
        }}
      >
        {/* Top Tag & Drag Bar */}
        {(tag || title || dragHandleProps) && (
          <div className="flex items-center justify-between mb-1 px-1 select-none gap-1">
            {/* Left Status LED & Drag Handle */}
            <div 
              {...dragHandleProps}
              className="flex items-center space-x-1.5 cursor-grab active:cursor-grabbing hover:opacity-100 opacity-80 transition-opacity"
              title="Click and drag to move window (double click to reset)"
              onDoubleClick={onResetPosition}
            >
              <GripHorizontal className="w-3.5 h-3.5 text-amber-500/70 hover:text-amber-300 transition-colors" />
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shadow-[0_0_6px_#f59e0b]" />
              {title && (
                <span className="font-orbitron font-bold text-[10px] tracking-wider text-amber-300 uppercase">
                  {title}
                </span>
              )}
            </div>

            {/* Right Port Tag Badge */}
            {tag && (
              <span 
                className="px-1.5 py-0.2 rounded text-[8px] font-tech tracking-wider uppercase font-bold text-amber-400/90 border border-amber-700/40 bg-black/85 shadow-sm"
              >
                {tag}
              </span>
            )}
          </div>
        )}

        {/* Card Body Content */}
        <div className="flex-1 w-full flex flex-col overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
};

