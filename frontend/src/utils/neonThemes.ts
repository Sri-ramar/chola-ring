export type NeonColorId = 'amber' | 'cyan' | 'emerald' | 'crimson' | 'violet' | 'ice';

export interface NeonTheme {
  id: NeonColorId;
  name: string;
  shortName: string;
  glowColor: string;
  deepGlow: string;
  coreColor: string;
  tickColor: string;
  tickMajor: string;
  outerArcColor: string;
  auraClass: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  hexPrimary: string;
  traceHex: string;
}

export const NEON_THEMES: NeonTheme[] = [
  {
    id: 'amber',
    name: 'Solar Amber',
    shortName: 'AMBER',
    glowColor: '#ffb300',
    deepGlow: '#ff8f00',
    coreColor: '#fff9c4',
    tickColor: '#ffb300',
    tickMajor: '#fff9c4',
    outerArcColor: '#ffb703',
    auraClass: 'bg-amber-500',
    badgeBg: 'bg-amber-500/20',
    badgeBorder: 'border-amber-400',
    badgeText: 'text-amber-300',
    hexPrimary: '#ffb300',
    traceHex: '#cfa039',
  },
  {
    id: 'cyan',
    name: 'Cyan Plasma',
    shortName: 'CYAN',
    glowColor: '#00e5ff',
    deepGlow: '#00b0ff',
    coreColor: '#e0f7fa',
    tickColor: '#00e5ff',
    tickMajor: '#e0f7fa',
    outerArcColor: '#00e5ff',
    auraClass: 'bg-cyan-500',
    badgeBg: 'bg-cyan-500/20',
    badgeBorder: 'border-cyan-400',
    badgeText: 'text-cyan-300',
    hexPrimary: '#00e5ff',
    traceHex: '#00bcd4',
  },
  {
    id: 'emerald',
    name: 'Emerald Fusion',
    shortName: 'EMERALD',
    glowColor: '#00e676',
    deepGlow: '#00c853',
    coreColor: '#e8f5e9',
    tickColor: '#00e676',
    tickMajor: '#e8f5e9',
    outerArcColor: '#00e676',
    auraClass: 'bg-emerald-500',
    badgeBg: 'bg-emerald-500/20',
    badgeBorder: 'border-emerald-400',
    badgeText: 'text-emerald-300',
    hexPrimary: '#00e676',
    traceHex: '#4caf50',
  },
  {
    id: 'crimson',
    name: 'Crimson Nova',
    shortName: 'CRIMSON',
    glowColor: '#ff1744',
    deepGlow: '#d50000',
    coreColor: '#ffebee',
    tickColor: '#ff1744',
    tickMajor: '#ffebee',
    outerArcColor: '#ff1744',
    auraClass: 'bg-red-500',
    badgeBg: 'bg-red-500/20',
    badgeBorder: 'border-red-400',
    badgeText: 'text-red-300',
    hexPrimary: '#ff1744',
    traceHex: '#f44336',
  },
  {
    id: 'violet',
    name: 'Quantum Violet',
    shortName: 'VIOLET',
    glowColor: '#d500f9',
    deepGlow: '#aa00ff',
    coreColor: '#f3e5f5',
    tickColor: '#d500f9',
    tickMajor: '#f3e5f5',
    outerArcColor: '#d500f9',
    auraClass: 'bg-purple-500',
    badgeBg: 'bg-purple-500/20',
    badgeBorder: 'border-purple-400',
    badgeText: 'text-purple-300',
    hexPrimary: '#d500f9',
    traceHex: '#ab47bc',
  },
  {
    id: 'ice',
    name: 'Stellar Ice',
    shortName: 'ICE',
    glowColor: '#e0f7fa',
    deepGlow: '#80deea',
    coreColor: '#ffffff',
    tickColor: '#b2ebf2',
    tickMajor: '#ffffff',
    outerArcColor: '#b2ebf2',
    auraClass: 'bg-sky-400',
    badgeBg: 'bg-sky-500/20',
    badgeBorder: 'border-sky-300',
    badgeText: 'text-sky-200',
    hexPrimary: '#e0f7fa',
    traceHex: '#90caf9',
  }
];

export const getNeonTheme = (id?: string | NeonColorId | undefined): NeonTheme => {
  if (!id) return NEON_THEMES[0];
  return NEON_THEMES.find((t) => t.id === id) || NEON_THEMES[0];
};
