import { NeonColorId, NEON_THEMES } from './neonThemes';
import { ShellMetalId } from './metalThemes';

export interface ParsedVoiceCommand {
  hasAction: boolean;
  neonTheme?: NeonColorId;
  shellMetal?: ShellMetalId;
  isOverclocked?: boolean;
  actionSummary?: string;
}

// Color alias mappings for voice commands
const COLOR_ALIASES: Record<string, NeonColorId> = {
  amber: 'amber',
  gold: 'amber',
  yellow: 'amber',
  orange: 'amber',
  warm: 'amber',
  
  cyan: 'cyan',
  blue: 'cyan',
  aqua: 'cyan',
  azure: 'cyan',
  teal: 'cyan',
  
  crimson: 'crimson',
  red: 'crimson',
  ruby: 'crimson',
  scarlet: 'crimson',
  blood: 'crimson',
  
  emerald: 'emerald',
  green: 'emerald',
  jade: 'emerald',
  lime: 'emerald',
  
  violet: 'violet',
  purple: 'violet',
  magenta: 'violet',
  neon: 'violet',
  amethyst: 'violet',
  
  ice: 'ice',
  white: 'ice',
  frost: 'ice',
  silver: 'ice',
  arctic: 'ice',
  crystal: 'ice',
};

const SHELL_ALIASES: Record<string, ShellMetalId> = {
  gold: 'gold',
  brass: 'gold',
  bronze: 'gold',
  gilded: 'gold',
  
  black: 'black',
  dark: 'black',
  stealth: 'black',
  obsidian: 'black',
  carbon: 'black',
  
  silver: 'silver',
  chrome: 'silver',
  platinum: 'silver',
  titanium: 'silver',
  steel: 'silver',
  metallic: 'silver',
};

/**
 * Strict, intent-based voice command parser.
 * Requires explicit command verbs (change, switch, set, turn, activate, overclock, etc.)
 * with word boundaries to prevent false positives from incidental speech substrings.
 */
export function parseVoiceCommand(text: string): ParsedVoiceCommand {
  if (!text || typeof text !== 'string') {
    return { hasAction: false };
  }

  const cleanText = text.toLowerCase().trim();
  let hasAction = false;
  let neonTheme: NeonColorId | undefined = undefined;
  let shellMetal: ShellMetalId | undefined = undefined;
  let isOverclocked: boolean | undefined = undefined;
  let actionSummary: string | undefined = undefined;

  // 1. Check Overclock / Boost Intents
  const overclockEnableRegex = /\b(?:overclock|engage overclock|activate overclock|turbo mode|boost core|maximum power|overdrive|engage boost)\b/i;
  const overclockDisableRegex = /\b(?:stabilize|stabilize core|cool down|cool core|deactivate overclock|disable overclock|normal mode|safe mode|standard mode)\b/i;

  if (overclockEnableRegex.test(cleanText)) {
    isOverclocked = true;
    hasAction = true;
    actionSummary = 'OVERCLOCK ENGAGED';
  } else if (overclockDisableRegex.test(cleanText)) {
    isOverclocked = false;
    hasAction = true;
    actionSummary = 'CORE STABILIZED';
  }

  // 2. Check Chassis Metallurgy Shell Intents
  // Matches: "switch chassis to black", "change metal to silver", "set shell to gold", "black shell", "silver chassis"
  const shellPattern = /\b(?:change|switch|set|turn|make|select)\s+(?:the\s+)?(?:chassis|shell|metal|casing|frame|body)\s+(?:to\s+)?\b(gold|brass|black|dark|stealth|obsidian|carbon|silver|chrome|titanium|steel)\b/i;
  const shellDirectPattern = /\b(gold|brass|black|dark|stealth|obsidian|carbon|silver|chrome|titanium|steel)\s+(?:chassis|shell|metal|casing|frame|body)\b/i;

  const shellMatch = cleanText.match(shellPattern) || cleanText.match(shellDirectPattern);
  if (shellMatch && shellMatch[1]) {
    const rawMetal = shellMatch[1].toLowerCase();
    const mapped = SHELL_ALIASES[rawMetal];
    if (mapped) {
      shellMetal = mapped;
      hasAction = true;
      actionSummary = `CHASSIS: ${mapped.toUpperCase()}`;
    }
  }

  // 3. Check Neon Spectrum Color Intents
  // Matches: "change theme to cyan", "switch color to red", "turn neon to emerald", "set glow to amber", "cyan color", "emerald theme"
  const colorPattern = /\b(?:change|switch|set|turn|make|select)\s+(?:the\s+)?(?:theme|color|neon|glow|spectrum|lighting|light)\s+(?:to\s+)?\b(amber|gold|yellow|orange|cyan|blue|aqua|teal|crimson|red|ruby|scarlet|emerald|green|jade|lime|violet|purple|magenta|ice|white|frost)\b/i;
  const colorDirectPattern = /\b(amber|cyan|crimson|emerald|violet|ice)\s+(?:theme|color|neon|glow|spectrum|lighting)\b/i;
  const colorShortCommandPattern = /^(?:theme|color|neon|glow|spectrum)\s+(?:to\s+)?\b(amber|gold|yellow|orange|cyan|blue|aqua|teal|crimson|red|ruby|scarlet|emerald|green|jade|lime|violet|purple|magenta|ice|white|frost)\b$/i;

  const colorMatch = cleanText.match(colorPattern) || cleanText.match(colorDirectPattern) || cleanText.match(colorShortCommandPattern);
  if (colorMatch && colorMatch[1]) {
    const rawColor = colorMatch[1].toLowerCase();
    const mappedColor = COLOR_ALIASES[rawColor];
    if (mappedColor) {
      neonTheme = mappedColor;
      hasAction = true;
      actionSummary = `NEON: ${mappedColor.toUpperCase()}`;
    }
  }

  return {
    hasAction,
    neonTheme,
    shellMetal,
    isOverclocked,
    actionSummary,
  };
}
