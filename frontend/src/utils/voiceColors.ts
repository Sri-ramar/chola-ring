import { ShellMetalId } from './metalThemes';

export interface VoiceThemeColorPair {
  shellId: ShellMetalId;
  name1: string;
  name2: string;
  color1Hex: string;
  color2Hex: string;
  color1Core: string;
  color2Core: string;
  color1Glow: string;
  color2Glow: string;
  color1Aura: string;
  color2Aura: string;
  gradientClass: string;
  badgeBorder1: string;
  badgeBorder2: string;
  badgeText1: string;
  badgeText2: string;
}

export const VOICE_THEME_PAIRS: Record<ShellMetalId, VoiceThemeColorPair> = {
  gold: {
    shellId: 'gold',
    name1: 'Molten Amber',
    name2: 'Emerald Green',
    color1Hex: '#f97316', // Native molten thermal amber/orange
    color2Hex: '#00e676', // Native emerald green
    color1Core: '#fff494', // Native molten core
    color2Core: '#e8f5e9', // Native emerald light core
    color1Glow: '#c2410c', // Native deep thermal edge
    color2Glow: '#00c853', // Native deep emerald edge
    color1Aura: 'bg-amber-500',
    color2Aura: 'bg-emerald-400',
    gradientClass: 'from-amber-500 via-orange-400 to-emerald-400',
    badgeBorder1: 'border-amber-500',
    badgeBorder2: 'border-emerald-400',
    badgeText1: 'text-amber-400',
    badgeText2: 'text-emerald-400',
  },
  black: {
    shellId: 'black',
    name1: 'Crimson Red',
    name2: 'Neon Pink',
    color1Hex: '#ff1744', // Native crimson red
    color2Hex: '#ff2d87', // Native cyber neon pink
    color1Core: '#ffebee',
    color2Core: '#fce4ec',
    color1Glow: '#d50000',
    color2Glow: '#c2185b',
    color1Aura: 'bg-red-500',
    color2Aura: 'bg-pink-500',
    gradientClass: 'from-red-500 via-rose-500 to-pink-500',
    badgeBorder1: 'border-red-500',
    badgeBorder2: 'border-pink-500',
    badgeText1: 'text-red-400',
    badgeText2: 'text-pink-400',
  },
  silver: {
    shellId: 'silver',
    name1: 'Frost White',
    name2: 'Plasma Blue',
    color1Hex: '#ffffff', // Native platinum white
    color2Hex: '#00e5ff', // Native cyan plasma blue
    color1Core: '#ffffff',
    color2Core: '#e0f7fa',
    color1Glow: '#94a3b8',
    color2Glow: '#00b0ff',
    color1Aura: 'bg-slate-100',
    color2Aura: 'bg-cyan-500',
    gradientClass: 'from-white via-sky-200 to-cyan-500',
    badgeBorder1: 'border-slate-200',
    badgeBorder2: 'border-cyan-400',
    badgeText1: 'text-white',
    badgeText2: 'text-cyan-300',
  },
};

export const getVoicePairForShell = (shell: ShellMetalId | string = 'gold'): VoiceThemeColorPair => {
  const key = (shell as ShellMetalId) in VOICE_THEME_PAIRS ? (shell as ShellMetalId) : 'gold';
  return VOICE_THEME_PAIRS[key] || VOICE_THEME_PAIRS.gold;
};

/**
 * Parse hex color to RGB
 */
function hexToRgb(hex: string): [number, number, number] {
  let clean = hex.replace('#', '');
  if (clean.length === 3) {
    clean = clean.split('').map(c => c + c).join('');
  }
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

/**
 * Linearly interpolate between two hex colors
 */
export function interpolateHex(hex1: string, hex2: string, factor: number): string {
  const clamped = Math.max(0, Math.min(1, factor));
  const [r1, g1, b1] = hexToRgb(hex1);
  const [r2, g2, b2] = hexToRgb(hex2);

  const r = Math.round(r1 + (r2 - r1) * clamped);
  const g = Math.round(g1 + (g2 - g1) * clamped);
  const b = Math.round(b1 + (b2 - b1) * clamped);

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
