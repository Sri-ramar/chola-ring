import { ShellMetalId, getShellMetalTheme } from './metalThemes';
import { NeonColorId, getNeonTheme } from './neonThemes';

export interface UnifiedThemeStyle {
  glowColor: string;
  coreColor: string;
  deepGlow: string;
  accentText: string;
  accentBg: string;
  accentBorder: string;
  accentGlow: string;
  activeBtn: string;
  inactiveBtn: string;
  badge: string;
  inputFocusBorder: string;
  barFill: string;
  barBg: string;
  cardBg: string;
  cardBorder: string;
  sparklineStroke: string;
}

export const getUnifiedTheme = (
  shellMetal: ShellMetalId = 'gold',
  neonTheme: NeonColorId = 'amber'
): UnifiedThemeStyle => {
  const metal = getShellMetalTheme(shellMetal);
  const neon = getNeonTheme(neonTheme);

  // If neon theme is selected, use the neon theme for dynamic illumination,
  // blended with the shell metal frame
  const glow = neon.glowColor;
  const core = neon.coreColor;
  const deep = neon.deepGlow;

  return {
    glowColor: glow,
    coreColor: core,
    deepGlow: deep,
    accentText: `text-[${glow}]`,
    accentBg: `bg-[${glow}]/20`,
    accentBorder: `border-[${glow}]/60`,
    accentGlow: `shadow-[0_0_10px_${glow}]`,
    activeBtn: `border-[${glow}] text-white bg-[${glow}]/25 shadow-[0_0_8px_${glow}66]`,
    inactiveBtn: `border-stone-800 text-stone-400 hover:text-[${glow}] hover:border-[${glow}]/40 bg-stone-900/60`,
    badge: `border-[${glow}]/50 text-[${glow}] bg-[${glow}]/15`,
    inputFocusBorder: `focus:border-[${glow}]`,
    barFill: `bg-[${glow}] shadow-[0_0_8px_${glow}]`,
    barBg: 'bg-stone-900/90 border border-stone-800',
    cardBg: metal.panel.bgClass,
    cardBorder: metal.panel.borderClass,
    sparklineStroke: glow,
  };
};
