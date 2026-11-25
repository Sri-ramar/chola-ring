import { NeonColorId } from './utils/neonThemes';
import { ShellMetalId } from './utils/metalThemes';

export interface CoreMetrics {
  status: 'ONLINE' | 'OVERCLOCKED' | 'DIAGNOSTIC' | 'STANDBY' | 'CRITICAL';
  temperature: number; // in °C
  powerOutput: number; // percentage 0-100
  energyLevel: number; // 0 - 100
  connectionStatus: 'SECURE' | 'ENCRYPTING' | 'SYNCING';
  coreSpeedRPM: number; // rotation speed multiplier
  isSoundEnabled: boolean;
  isOverclocked: boolean;
  neonTheme: NeonColorId;
  shellMetal: ShellMetalId;
}

export interface LogMessage {
  id: string;
  timestamp: string;
  text: string;
  type: 'info' | 'success' | 'warning' | 'alert';
}

export type NavTab = 'home' | 'pulse' | 'grid' | 'settings' | 'user';
