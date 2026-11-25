export type ShellMetalId = 'gold' | 'black' | 'silver';

export interface ShellMetalTheme {
  id: ShellMetalId;
  name: string;
  shortName: string;
  subtitle: string;
  iconBg: string;
  previewGradient: string;
  
  // Reactor Core SVG Gradients & Accents
  bezelStops: { offset: string; color: string }[];
  plateStops: { offset: string; color: string }[];
  shineStops: { offset: string; color: string; opacity?: number }[];
  boltStops: { offset: string; color: string }[];
  outerShadowColor: string;
  rimHighlightColor: string;
  recessColor: string;
  grooveLightColor: string;
  grooveDarkColor: string;
  collarColor: string;
  collarLightColor: string;
  pinBaseColor: string;
  pinBorderColor: string;
  boltHoleBg: string;
  boltHoleBorder: string;
  boltInnerBorder: string;
  boltCenterFill: string;
  boltCenterBorder: string;

  // PCB Trace SVG Colors & Hardware Motherboard
  pcb: {
    primaryTrace: string;
    secondaryTrace: string;
    framingBracket: string;
    outerRail: string;
    viaCluster: string;
    techText: string;
    dockTerminal: string;
    dockTerminalAccent: string;
    chipBody: string;
    chipBorder: string;
    chipPin: string;
    nodeRing: string;
  };

  // HUD Card & UI Panel Styling
  panel: {
    bgClass: string;
    borderClass: string;
    hoverBorderClass: string;
    glowClass: string;
    cornerBracketColor: string;
    notchColor: string;
    scanlineStyle: string;
    tagBorderClass: string;
    tagTextClass: string;
    dockPinColor: string;
    dockPinBorderClass: string;
    dockPinGlow: string;
    headerBorderClass: string;
    titleColorClass: string;
    titleDotClass: string;
    buttonClass: string;
    accentGlow: string;
    valueTextClass: string;
    valueGlowClass: string;
    statusOnlineClass: string;
    statusOverclockedClass: string;
    accentClass: string;
    bodyTextClass: string;
    mutedTextColor: string;
    activeBarGlow: string;
  };

  // Bottom Navigation Bar
  nav: {
    trackColor: string;
    trackShadow: string;
    nodePadBg: string;
    nodePadBorder: string;
    btnActive: string;
    btnInactive: string;
  };

  // Global Page Theme & Layout
  rootBg: string;
  vignetteGradient: string;
  headerBg: string;
  headerBorder: string;
  headerText: string;
  badgeBorder: string;
  badgeText: string;
  badgeBg: string;
}

export const SHELL_METAL_THEMES: ShellMetalTheme[] = [
  {
    id: 'gold',
    name: 'Chola Gold',
    shortName: 'CHOLA',
    subtitle: 'Machined Brass & Aerogold Alloy',
    iconBg: '#d4a338',
    previewGradient: 'linear-gradient(135deg, #f7d57f 0%, #b8860b 50%, #4a340a 100%)',
    
    // Reactor Core Metallurgy
    bezelStops: [
      { offset: '0%', color: '#3b2509' },
      { offset: '20%', color: '#d9ad52' },
      { offset: '45%', color: '#73501a' },
      { offset: '70%', color: '#fce394' },
      { offset: '90%', color: '#664414' },
      { offset: '100%', color: '#2b1b04' }
    ],
    plateStops: [
      { offset: '0%', color: '#e0b556' },
      { offset: '30%', color: '#9e7327' },
      { offset: '60%', color: '#4a320a' },
      { offset: '85%', color: '#b5862e' },
      { offset: '97%', color: '#1a1003' },
      { offset: '100%', color: '#0d0701' }
    ],
    shineStops: [
      { offset: '0%', color: '#fff6d4', opacity: 0.85 },
      { offset: '25%', color: '#805b19', opacity: 0.1 },
      { offset: '65%', color: '#1a1003', opacity: 0.9 },
      { offset: '100%', color: '#fff6d4', opacity: 0.85 }
    ],
    boltStops: [
      { offset: '0%', color: '#fae8a8' },
      { offset: '35%', color: '#b58930' },
      { offset: '70%', color: '#5e4010' },
      { offset: '100%', color: '#1f1303' }
    ],
    outerShadowColor: '#080501',
    rimHighlightColor: '#fffae0',
    recessColor: '#0c0701',
    grooveLightColor: '#faeab4',
    grooveDarkColor: '#261703',
    collarColor: '#050300',
    collarLightColor: '#faebbc',
    pinBaseColor: '#080501',
    pinBorderColor: '#9e7327',
    boltHoleBg: '#050300',
    boltHoleBorder: '#876022',
    boltInnerBorder: '#000000',
    boltCenterFill: '#040200',
    boltCenterBorder: '#3b2509',

    // PCB Hardware & Trace Colors
    pcb: {
      primaryTrace: '#a67c24',
      secondaryTrace: '#c7972c',
      framingBracket: '#d4a338',
      outerRail: '#805b19',
      viaCluster: '#8c641c',
      techText: '#cfa039',
      dockTerminal: '#ffc83b',
      dockTerminalAccent: '#d4a338',
      chipBody: '#14110b',
      chipBorder: '#d4a338',
      chipPin: '#ffc83b',
      nodeRing: '#876022'
    },

    // Panel & Card Theme
    panel: {
      bgClass: 'bg-[#0a0907]/92',
      borderClass: 'border-amber-500/40',
      hoverBorderClass: 'hover:border-amber-400/90',
      glowClass: 'border-amber-400 shadow-[0_0_25px_rgba(255,179,0,0.4),inset_0_0_15px_rgba(255,179,0,0.15)]',
      cornerBracketColor: '#ffb300',
      notchColor: 'rgba(245,158,11,0.5)',
      scanlineStyle: 'linear-gradient(to bottom, rgba(255,179,0,0.03) 1px, transparent 1px)',
      tagBorderClass: 'border-amber-500/50',
      tagTextClass: 'text-amber-400/80',
      dockPinColor: '#d4a338',
      dockPinBorderClass: 'border-amber-200',
      dockPinGlow: '0 0 8px #ffb300',
      headerBorderClass: 'border-amber-500/20',
      titleColorClass: 'text-amber-300/90',
      titleDotClass: 'bg-amber-400 shadow-[0_0_6px_#ffb300]',
      buttonClass: 'border-amber-500/40 bg-black/60 text-amber-300 hover:text-amber-100 hover:border-amber-300 hover:bg-amber-500/20',
      accentGlow: 'rgba(255,179,0,0.5)',
      valueTextClass: 'text-amber-300',
      valueGlowClass: 'neon-text-glow',
      statusOnlineClass: 'text-amber-400 neon-text-glow',
      statusOverclockedClass: 'text-amber-300 neon-text-glow animate-pulse',
      accentClass: 'accent-amber-400',
      bodyTextClass: 'text-amber-100/90',
      mutedTextColor: 'text-amber-300/70',
      activeBarGlow: 'bg-amber-400 shadow-[0_0_8px_#ffc107] border-t-2 border-amber-100'
    },

    // Bottom Nav
    nav: {
      trackColor: '#d4a338',
      trackShadow: '0 0 8px #ffb300',
      nodePadBg: '#f59e0b',
      nodePadBorder: '#fef3c7',
      btnActive: 'bg-amber-400/20 text-amber-200 border-amber-300 shadow-[0_0_20px_rgba(255,179,0,0.8),inset_0_0_12px_rgba(255,179,0,0.4)]',
      btnInactive: 'bg-[#0e0c08]/95 text-amber-300/70 border-amber-500/50 hover:text-amber-100 hover:border-amber-400 hover:bg-amber-500/10 hover:shadow-[0_0_12px_rgba(255,179,0,0.5)]'
    },

    // Global
    rootBg: '#080706',
    vignetteGradient: 'radial-gradient(circle at center, rgba(35,26,12,0.4) 0%, rgba(10,9,8,0.85) 50%, rgba(4,4,4,1) 100%)',
    headerBg: 'bg-black/75',
    headerBorder: 'border-amber-500/25',
    headerText: 'text-amber-300/80',
    badgeBorder: 'border-amber-400/60',
    badgeText: 'text-amber-300',
    badgeBg: 'bg-black/60'
  },
  {
    id: 'black',
    name: 'Imperial Bronze',
    shortName: 'BRONZE',
    subtitle: 'Stealth Obsidian & Dark Bronze',
    iconBg: '#2b2927',
    previewGradient: 'linear-gradient(135deg, #504f4e 0%, #21201f 50%, #0a0a0a 100%)',
    
    // Reactor Core Metallurgy
    bezelStops: [
      { offset: '0%', color: '#444342' },
      { offset: '25%', color: '#272625' },
      { offset: '50%', color: '#131312' },
      { offset: '75%', color: '#363534' },
      { offset: '100%', color: '#181716' }
    ],
    plateStops: [
      { offset: '0%', color: '#403e3d' },
      { offset: '45%', color: '#2b2928' },
      { offset: '70%', color: '#191817' },
      { offset: '88%', color: '#2e2c2b' },
      { offset: '96%', color: '#141312' },
      { offset: '100%', color: '#090808' }
    ],
    shineStops: [
      { offset: '0%', color: '#7a7775', opacity: 0.6 },
      { offset: '30%', color: '#2b2a29', opacity: 0.15 },
      { offset: '70%', color: '#121110', opacity: 0.85 },
      { offset: '100%', color: '#6e6b69', opacity: 0.6 }
    ],
    boltStops: [
      { offset: '0%', color: '#63605e' },
      { offset: '40%', color: '#383635' },
      { offset: '75%', color: '#1a1918' },
      { offset: '100%', color: '#0a0a09' }
    ],
    outerShadowColor: '#050505',
    rimHighlightColor: '#8a8785',
    recessColor: '#0a0a0a',
    grooveLightColor: '#63605e',
    grooveDarkColor: '#141312',
    collarColor: '#080808',
    collarLightColor: '#5c5957',
    pinBaseColor: '#080808',
    pinBorderColor: '#3d3b3a',
    boltHoleBg: '#080808',
    boltHoleBorder: '#383635',
    boltInnerBorder: '#000000',
    boltCenterFill: '#050505',
    boltCenterBorder: '#292726',

    // PCB Hardware & Trace Colors
    pcb: {
      primaryTrace: '#4f4d4b',
      secondaryTrace: '#666360',
      framingBracket: '#73706c',
      outerRail: '#302f2e',
      viaCluster: '#3a3837',
      techText: '#787572',
      dockTerminal: '#8a8784',
      dockTerminalAccent: '#545250',
      chipBody: '#0a0a0a',
      chipBorder: '#545250',
      chipPin: '#8a8784',
      nodeRing: '#3d3b3a'
    },

    // Panel & Card Theme
    panel: {
      bgClass: 'bg-[#080808]/94',
      borderClass: 'border-stone-600/40',
      hoverBorderClass: 'hover:border-stone-400/90',
      glowClass: 'border-stone-400 shadow-[0_0_25px_rgba(168,162,158,0.3),inset_0_0_15px_rgba(120,113,108,0.2)]',
      cornerBracketColor: '#a8a29e',
      notchColor: 'rgba(168,162,158,0.5)',
      scanlineStyle: 'linear-gradient(to bottom, rgba(200,200,200,0.03) 1px, transparent 1px)',
      tagBorderClass: 'border-stone-600/60',
      tagTextClass: 'text-stone-300/80',
      dockPinColor: '#4f4d4b',
      dockPinBorderClass: 'border-stone-400',
      dockPinGlow: '0 0 8px rgba(168,162,158,0.4)',
      headerBorderClass: 'border-stone-700/40',
      titleColorClass: 'text-stone-300/90',
      titleDotClass: 'bg-stone-300 shadow-[0_0_6px_#a8a29e]',
      buttonClass: 'border-stone-600/50 bg-black/70 text-stone-300 hover:text-white hover:border-stone-300 hover:bg-stone-700/30',
      accentGlow: 'rgba(168,162,158,0.4)',
      valueTextClass: 'text-stone-100',
      valueGlowClass: 'shadow-[0_0_8px_rgba(214,211,209,0.4)]',
      statusOnlineClass: 'text-stone-100 drop-shadow-[0_0_8px_rgba(214,211,209,0.5)]',
      statusOverclockedClass: 'text-white drop-shadow-[0_0_10px_#a8a29e] animate-pulse',
      accentClass: 'accent-stone-400',
      bodyTextClass: 'text-stone-200/90',
      mutedTextColor: 'text-stone-400/70',
      activeBarGlow: 'bg-stone-300 shadow-[0_0_8px_#a8a29e] border-t-2 border-stone-100'
    },

    // Bottom Nav
    nav: {
      trackColor: '#4f4d4b',
      trackShadow: '0 0 8px rgba(168,162,158,0.4)',
      nodePadBg: '#78716c',
      nodePadBorder: '#d6d3d1',
      btnActive: 'bg-stone-400/20 text-stone-100 border-stone-300 shadow-[0_0_20px_rgba(214,211,209,0.5),inset_0_0_12px_rgba(168,162,158,0.3)]',
      btnInactive: 'bg-[#0a0a0a]/95 text-stone-400/70 border-stone-600/50 hover:text-white hover:border-stone-400 hover:bg-stone-800/30 hover:shadow-[0_0_12px_rgba(168,162,158,0.3)]'
    },

    // Global
    rootBg: '#050505',
    vignetteGradient: 'radial-gradient(circle at center, rgba(28,28,28,0.45) 0%, rgba(10,10,10,0.9) 50%, rgba(2,2,2,1) 100%)',
    headerBg: 'bg-black/85',
    headerBorder: 'border-stone-700/40',
    headerText: 'text-stone-300/80',
    badgeBorder: 'border-stone-500/60',
    badgeText: 'text-stone-300',
    badgeBg: 'bg-black/70'
  },
  {
    id: 'silver',
    name: 'Temple Stone',
    shortName: 'STONE',
    subtitle: 'Granite & Ancient Carved Stone',
    iconBg: '#c2cad4',
    previewGradient: 'linear-gradient(135deg, #ffffff 0%, #94a3b8 50%, #334155 100%)',
    
    // Reactor Core Metallurgy
    bezelStops: [
      { offset: '0%', color: '#cbd5e1' },
      { offset: '25%', color: '#94a3b8' },
      { offset: '50%', color: '#475569' },
      { offset: '75%', color: '#a1b0c2' },
      { offset: '100%', color: '#556579' }
    ],
    plateStops: [
      { offset: '0%', color: '#e2e8f0' },
      { offset: '45%', color: '#a8b6c8' },
      { offset: '70%', color: '#64748b' },
      { offset: '88%', color: '#94a3b8' },
      { offset: '96%', color: '#475569' },
      { offset: '100%', color: '#1e293b' }
    ],
    shineStops: [
      { offset: '0%', color: '#ffffff', opacity: 0.85 },
      { offset: '30%', color: '#94a3b8', opacity: 0.25 },
      { offset: '70%', color: '#334155', opacity: 0.85 },
      { offset: '100%', color: '#ffffff', opacity: 0.85 }
    ],
    boltStops: [
      { offset: '0%', color: '#f8fafc' },
      { offset: '40%', color: '#cbd5e1' },
      { offset: '75%', color: '#64748b' },
      { offset: '100%', color: '#1e293b' }
    ],
    outerShadowColor: '#0a0f18',
    rimHighlightColor: '#ffffff',
    recessColor: '#0f172a',
    grooveLightColor: '#f1f5f9',
    grooveDarkColor: '#334155',
    collarColor: '#090d14',
    collarLightColor: '#cbd5e1',
    pinBaseColor: '#090d14',
    pinBorderColor: '#64748b',
    boltHoleBg: '#090e17',
    boltHoleBorder: '#64748b',
    boltInnerBorder: '#000000',
    boltCenterFill: '#070a10',
    boltCenterBorder: '#475569',

    // PCB Hardware & Trace Colors
    pcb: {
      primaryTrace: '#8fa0b5',
      secondaryTrace: '#b2c0d1',
      framingBracket: '#cbd5e1',
      outerRail: '#475569',
      viaCluster: '#64748b',
      techText: '#94a3b8',
      dockTerminal: '#ffffff',
      dockTerminalAccent: '#cbd5e1',
      chipBody: '#0c121e',
      chipBorder: '#94a3b8',
      chipPin: '#e2e8f0',
      nodeRing: '#64748b'
    },

    // Panel & Card Theme
    panel: {
      bgClass: 'bg-[#0a0f18]/92',
      borderClass: 'border-slate-500/45',
      hoverBorderClass: 'hover:border-slate-300/90',
      glowClass: 'border-slate-300 shadow-[0_0_25px_rgba(203,213,225,0.4),inset_0_0_15px_rgba(148,163,184,0.2)]',
      cornerBracketColor: '#e2e8f0',
      notchColor: 'rgba(203,213,225,0.5)',
      scanlineStyle: 'linear-gradient(to bottom, rgba(203,213,225,0.03) 1px, transparent 1px)',
      tagBorderClass: 'border-slate-500/60',
      tagTextClass: 'text-slate-300/80',
      dockPinColor: '#cbd5e1',
      dockPinBorderClass: 'border-white',
      dockPinGlow: '0 0 8px #ffffff',
      headerBorderClass: 'border-slate-600/35',
      titleColorClass: 'text-slate-200/90',
      titleDotClass: 'bg-slate-200 shadow-[0_0_6px_#ffffff]',
      buttonClass: 'border-slate-500/50 bg-black/70 text-slate-200 hover:text-white hover:border-slate-200 hover:bg-slate-700/30',
      accentGlow: 'rgba(203,213,225,0.5)',
      valueTextClass: 'text-slate-100',
      valueGlowClass: 'shadow-[0_0_10px_rgba(255,255,255,0.6)]',
      statusOnlineClass: 'text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.7)]',
      statusOverclockedClass: 'text-white drop-shadow-[0_0_12px_#ffffff] animate-pulse',
      accentClass: 'accent-slate-300',
      bodyTextClass: 'text-slate-200/90',
      mutedTextColor: 'text-slate-300/70',
      activeBarGlow: 'bg-slate-200 shadow-[0_0_8px_#ffffff] border-t-2 border-white'
    },

    // Bottom Nav
    nav: {
      trackColor: '#94a3b8',
      trackShadow: '0 0 8px rgba(203,213,225,0.6)',
      nodePadBg: '#cbd5e1',
      nodePadBorder: '#ffffff',
      btnActive: 'bg-slate-300/20 text-white border-slate-200 shadow-[0_0_20px_rgba(255,255,255,0.7),inset_0_0_12px_rgba(203,213,225,0.4)]',
      btnInactive: 'bg-[#090d15]/95 text-slate-300/70 border-slate-500/50 hover:text-white hover:border-slate-300 hover:bg-slate-700/20 hover:shadow-[0_0_12px_rgba(203,213,225,0.4)]'
    },

    // Global
    rootBg: '#05080f',
    vignetteGradient: 'radial-gradient(circle at center, rgba(25,35,52,0.45) 0%, rgba(8,13,22,0.9) 50%, rgba(3,5,10,1) 100%)',
    headerBg: 'bg-[#070b12]/80',
    headerBorder: 'border-slate-600/35',
    headerText: 'text-slate-300/80',
    badgeBorder: 'border-slate-300/60',
    badgeText: 'text-slate-200',
    badgeBg: 'bg-black/60'
  }
];

export const getShellMetalTheme = (id?: string | ShellMetalId | undefined): ShellMetalTheme => {
  if (!id) return SHELL_METAL_THEMES[0];
  return SHELL_METAL_THEMES.find((t) => t.id === id) || SHELL_METAL_THEMES[0];
};
