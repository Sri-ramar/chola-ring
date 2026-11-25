import React from 'react';
import { NeonColorId, getNeonTheme } from '../utils/neonThemes';
import { ShellMetalId, getShellMetalTheme } from '../utils/metalThemes';
import { getVoicePairForShell } from '../utils/voiceColors';
import { VoiceState } from '../utils/voiceManager';

interface CircuitTracesSVGProps {
  neonTheme?: NeonColorId;
  shellMetal?: ShellMetalId;
  voiceState?: VoiceState;
}

export const CircuitTracesSVG: React.FC<CircuitTracesSVGProps> = ({
  neonTheme = 'amber',
  shellMetal = 'gold',
  voiceState = 'idle',
}) => {
  const theme = getNeonTheme(neonTheme);
  const metal = getShellMetalTheme(shellMetal);
  const voicePair = getVoicePairForShell(shellMetal);
  const isSpeakingActive = voiceState === 'speaking' || voiceState === 'listening';

  const pulseColor1 = isSpeakingActive ? voicePair.color1Hex : theme.glowColor;
  const pulseColor2 = isSpeakingActive ? voicePair.color2Hex : theme.coreColor;
  const pulseDeep = isSpeakingActive ? voicePair.color1Glow : theme.deepGlow;

  return (
    <svg 
      className="absolute inset-0 w-full h-full pointer-events-none z-0"
      viewBox="0 0 1600 900"
      preserveAspectRatio="none"
    >
      <defs>
        {/* Glow filter for base PCB metal traces */}
        <filter id="pcbTraceGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>

        {/* High-intensity glow filter for moving energy light packets */}
        <filter id="pcbPacketGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Cross-Hatch Pattern for PCB Ground Pours */}
        <pattern id="pcbGroundHatch" width="8" height="8" patternUnits="userSpaceOnUse">
          <path d="M 0 0 L 8 8 M 8 0 L 0 8" stroke={metal.pcb.outerRail} strokeWidth="0.4" opacity="0.15" />
        </pattern>

        {/* Node Solder Glow Gradient */}
        <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={pulseColor2} />
          <stop offset="50%" stopColor={pulseColor1} />
          <stop offset="100%" stopColor={pulseDeep} />
        </radialGradient>
      </defs>

      {/* ======================================================== */}
      {/* 1. PCB GROUND PLANES, CORNER BRACKETS & HATCHED COPPER   */}
      {/* ======================================================== */}

      {/* Ground Copper Cross-Hatched Fill Zones */}
      <rect x="60" y="60" width="280" height="40" fill="url(#pcbGroundHatch)" />
      <rect x="1260" y="60" width="280" height="40" fill="url(#pcbGroundHatch)" />
      <rect x="60" y="800" width="280" height="60" fill="url(#pcbGroundHatch)" />
      <rect x="1260" y="800" width="280" height="60" fill="url(#pcbGroundHatch)" />

      {/* Corner Outer Framing Brackets */}
      <g stroke={metal.pcb.framingBracket} strokeWidth="1.5" fill="none" opacity="0.4">
        {/* Top-Left Screen Corner */}
        <path d="M 25 70 L 25 25 L 70 25" />
        <circle cx="25" cy="25" r="2.5" fill={metal.pcb.framingBracket} />
        <rect x="35" y="32" width="18" height="4" fill={metal.pcb.framingBracket} opacity="0.2" />

        {/* Top-Right Screen Corner */}
        <path d="M 1575 70 L 1575 25 L 1530 25" />
        <circle cx="1575" cy="25" r="2.5" fill={metal.pcb.framingBracket} />
        <rect x="1547" y="32" width="18" height="4" fill={metal.pcb.framingBracket} opacity="0.2" />

        {/* Bottom-Left Screen Corner */}
        <path d="M 25 830 L 25 875 L 70 875" />
        <circle cx="25" cy="875" r="2.5" fill={metal.pcb.framingBracket} />

        {/* Bottom-Right Screen Corner */}
        <path d="M 1575 830 L 1575 875 L 1530 875" />
        <circle cx="1575" cy="875" r="2.5" fill={metal.pcb.framingBracket} />
      </g>

      {/* Outer Edge Power Conduits */}
      <g stroke={metal.pcb.outerRail} strokeWidth="1.2" fill="none" opacity="0.3">
        <path d="M 45 45 L 45 855" />
        <path d="M 52 70 L 52 830" strokeDasharray="3 4" />
        <path d="M 1555 45 L 1555 855" />
        <path d="M 1548 70 L 1548 830" strokeDasharray="3 4" />
        
        {/* Top & Bottom Edge Rails */}
        <path d="M 70 45 L 1530 45" />
        <path d="M 70 855 L 1530 855" />
      </g>

      {/* Micro Ground Via Arrays */}
      <g fill={metal.pcb.viaCluster} opacity="0.35">
        {/* Top Left via cluster */}
        <circle cx="78" cy="58" r="1.2" /><circle cx="86" cy="58" r="1.2" /><circle cx="94" cy="58" r="1.2" />
        <circle cx="78" cy="66" r="1.2" /><circle cx="86" cy="66" r="1.2" /><circle cx="94" cy="66" r="1.2" />

        {/* Bottom Left via cluster */}
        <circle cx="78" cy="838" r="1.2" /><circle cx="86" cy="838" r="1.2" /><circle cx="94" cy="838" r="1.2" />
        <circle cx="78" cy="846" r="1.2" /><circle cx="86" cy="846" r="1.2" /><circle cx="94" cy="846" r="1.2" />

        {/* Top Right via cluster */}
        <circle cx="1508" cy="58" r="1.2" /><circle cx="1516" cy="58" r="1.2" /><circle cx="1524" cy="58" r="1.2" />
        <circle cx="1508" cy="66" r="1.2" /><circle cx="1516" cy="66" r="1.2" /><circle cx="1524" cy="66" r="1.2" />

        {/* Bottom Right via cluster */}
        <circle cx="1508" cy="838" r="1.2" /><circle cx="1516" cy="838" r="1.2" /><circle cx="1524" cy="838" r="1.2" />
        <circle cx="1508" cy="846" r="1.2" /><circle cx="1516" cy="846" r="1.2" /><circle cx="1524" cy="846" r="1.2" />
      </g>

      {/* Engineering Silk-Screen Technical Markings */}
      <g fill={metal.pcb.techText} opacity="0.65" fontSize="7.5" fontFamily="monospace" letterSpacing="1.8">
        <text x="65" y="40">RAIL_L01 // +48V_BUS [{metal.shortName}] // IMP:50Ω</text>
        <text x="1350" y="40">RAIL_R01 // RETURN_GND [{metal.shortName}] // ISO_8849</text>
        <text x="430" y="116">BUS_01 // S2S_LINK // CH_01</text>
        <text x="420" y="388">BUS_02 // KERNEL_IO // DMA_SYNC</text>
        <text x="430" y="653">BUS_03 // CRAWL_NET // RX_TX</text>
        <text x="1030" y="116">BUS_04 // HW_TELEMETRY // PCIE_G5</text>
        <text x="1040" y="388">BUS_05 // TASK_MATRIX // RTOS</text>
        <text x="1030" y="653">BUS_06 // AUDIO_SYNTH // I2S_DAC</text>
        <text x="670" y="755">BUS_MAIN_SYNC // MASTER_CTRL [{metal.shortName}] // CLK:100MHz</text>
      </g>

      {/* Outer Side Bus Links to HUD Cards */}
      <g stroke={metal.pcb.primaryTrace} strokeWidth="1.2" fill="none" opacity="0.6">
        {/* Left Side Outer Ingress */}
        <path d="M 45 131 L 128 131" />
        <circle cx="45" cy="131" r="2" fill={metal.pcb.dockTerminalAccent} />
        <path d="M 45 402 L 112 402" />
        <circle cx="45" cy="402" r="2" fill={metal.pcb.dockTerminalAccent} />
        <path d="M 45 665 L 128 665" />
        <circle cx="45" cy="665" r="2" fill={metal.pcb.dockTerminalAccent} />

        {/* Right Side Outer Ingress */}
        <path d="M 1555 131 L 1472 131" />
        <circle cx="1555" cy="131" r="2" fill={metal.pcb.dockTerminalAccent} />
        <path d="M 1555 402 L 1488 402" />
        <circle cx="1555" cy="402" r="2" fill={metal.pcb.dockTerminalAccent} />
        <path d="M 1555 665 L 1472 665" />
        <circle cx="1555" cy="665" r="2" fill={metal.pcb.dockTerminalAccent} />
      </g>

      {/* ======================================================== */}
      {/* 2. MULTI-LANE PARALLEL RIBBON CONDUITS (3-LANE BUSES)    */}
      {/* ======================================================== */}

      {/* LANE 1: PRIMARY MAIN POWER BUS (Heavy 2.5px Gold Conduit) */}
      <g stroke={metal.pcb.primaryTrace} strokeWidth="2.5" fill="none" strokeLinecap="square" strokeLinejoin="miter">
        <path id="trace-top-left" d="M 665 305 L 535 175 L 250 175" />
        <path id="trace-mid-left" d="M 610 440 L 450 440 L 160 440" />
        <path id="trace-bot-left" d="M 665 575 L 535 725 L 250 725" />
        <path id="trace-top-right" d="M 935 305 L 1065 175 L 1350 175" />
        <path id="trace-mid-right" d="M 990 440 L 1150 440 L 1440 440" />
        <path id="trace-bot-right" d="M 935 575 L 1065 725 L 1350 725" />
        <path id="trace-bot-nav" d="M 800 630 L 800 780" />
      </g>

      {/* LANE 2: SECONDARY DATA TRACK (Dashed 1.2px Line) */}
      <g stroke={metal.pcb.secondaryTrace} strokeWidth="1.2" fill="none" strokeDasharray="6 3" opacity="0.75">
        <path d="M 655 295 L 530 170 L 250 170" />
        <path d="M 610 452 L 450 452 L 160 452" />
        <path d="M 655 585 L 530 730 L 250 730" />
        <path d="M 945 295 L 1070 170 L 1350 170" />
        <path d="M 990 452 L 1150 452 L 1440 452" />
        <path d="M 945 585 L 1070 730 L 1350 730" />
        <path d="M 780 630 L 780 730 L 650 780 L 520 780" />
        <path d="M 820 630 L 820 730 L 950 780 L 1080 780" />
      </g>

      {/* LANE 3: GROUND SHIELD TRACK (Thin 0.75px Solid Outer Line) */}
      <g stroke={metal.pcb.outerRail} strokeWidth="0.75" fill="none" opacity="0.45">
        <path d="M 675 315 L 540 180 L 250 180" />
        <path d="M 610 428 L 450 428 L 160 428" />
        <path d="M 675 565 L 540 720 L 250 720" />
        <path d="M 925 315 L 1060 180 L 1350 180" />
        <path d="M 990 428 L 1150 428 L 1440 428" />
        <path d="M 925 565 L 1060 720 L 1350 720" />
      </g>

      {/* ======================================================== */}
      {/* 3. SURFACE-MOUNT SMD CHIPS, CAPACITORS & FERRITE CHOKES  */}
      {/* ======================================================== */}

      {/* Surface Mount IC Chipsets along the Traces */}
      <g fill={metal.pcb.chipBody} stroke={metal.pcb.chipBorder} strokeWidth="1.5">
        {/* IC Chip 1 (Top Left Trace Junction) */}
        <rect x="475" y="118" width="22" height="14" rx="0" />
        <line x1="475" y1="122" x2="471" y2="122" stroke={metal.pcb.chipPin} strokeWidth="1.5" />
        <line x1="475" y1="128" x2="471" y2="128" stroke={metal.pcb.chipPin} strokeWidth="1.5" />
        <line x1="497" y1="122" x2="501" y2="122" stroke={metal.pcb.chipPin} strokeWidth="1.5" />
        <line x1="497" y1="128" x2="501" y2="128" stroke={metal.pcb.chipPin} strokeWidth="1.5" />

        {/* IC Chip 2 (Top Right Trace Junction) */}
        <rect x="1103" y="118" width="22" height="14" rx="0" />
        <line x1="1103" y1="122" x2="1099" y2="122" stroke={metal.pcb.chipPin} strokeWidth="1.5" />
        <line x1="1103" y1="128" x2="1099" y2="128" stroke={metal.pcb.chipPin} strokeWidth="1.5" />
        <line x1="1125" y1="122" x2="1129" y2="122" stroke={metal.pcb.chipPin} strokeWidth="1.5" />
        <line x1="1125" y1="128" x2="1129" y2="128" stroke={metal.pcb.chipPin} strokeWidth="1.5" />

        {/* IC Chip 3 (Bottom Left Trace Junction) */}
        <rect x="475" y="748" width="22" height="14" rx="0" />
        <line x1="475" y1="752" x2="471" y2="752" stroke={metal.pcb.chipPin} strokeWidth="1.5" />
        <line x1="475" y1="758" x2="471" y2="758" stroke={metal.pcb.chipPin} strokeWidth="1.5" />
        <line x1="497" y1="752" x2="501" y2="752" stroke={metal.pcb.chipPin} strokeWidth="1.5" />
        <line x1="497" y1="758" x2="501" y2="758" stroke={metal.pcb.chipPin} strokeWidth="1.5" />

        {/* IC Chip 4 (Bottom Right Trace Junction) */}
        <rect x="1103" y="748" width="22" height="14" rx="0" />
        <line x1="1103" y1="752" x2="1099" y2="752" stroke={metal.pcb.chipPin} strokeWidth="1.5" />
        <line x1="1103" y1="758" x2="1099" y2="758" stroke={metal.pcb.chipPin} strokeWidth="1.5" />
        <line x1="1125" y1="752" x2="1129" y2="752" stroke={metal.pcb.chipPin} strokeWidth="1.5" />
        <line x1="1125" y1="758" x2="1129" y2="758" stroke={metal.pcb.chipPin} strokeWidth="1.5" />
      </g>

      {/* Surface Mount Ceramic Capacitors (0805 Package) */}
      <g fill={metal.pcb.chipBody} stroke={metal.pcb.dockTerminalAccent} strokeWidth="1">
        {/* Cap near Top-Left */}
        <rect x="360" y="121" width="10" height="8" />
        <rect x="358" y="121" width="2.5" height="8" fill={metal.pcb.dockTerminalAccent} />
        <rect x="367.5" y="121" width="2.5" height="8" fill={metal.pcb.dockTerminalAccent} />

        {/* Cap near Mid-Left */}
        <rect x="340" y="436" width="10" height="8" />
        <rect x="338" y="436" width="2.5" height="8" fill={metal.pcb.dockTerminalAccent} />
        <rect x="347.5" y="436" width="2.5" height="8" fill={metal.pcb.dockTerminalAccent} />

        {/* Cap near Bot-Left */}
        <rect x="360" y="751" width="10" height="8" />
        <rect x="358" y="751" width="2.5" height="8" fill={metal.pcb.dockTerminalAccent} />
        <rect x="367.5" y="751" width="2.5" height="8" fill={metal.pcb.dockTerminalAccent} />

        {/* Cap near Top-Right */}
        <rect x="1230" y="121" width="10" height="8" />
        <rect x="1228" y="121" width="2.5" height="8" fill={metal.pcb.dockTerminalAccent} />
        <rect x="1237.5" y="121" width="2.5" height="8" fill={metal.pcb.dockTerminalAccent} />

        {/* Cap near Mid-Right */}
        <rect x="1250" y="436" width="10" height="8" />
        <rect x="1248" y="436" width="2.5" height="8" fill={metal.pcb.dockTerminalAccent} />
        <rect x="1257.5" y="436" width="2.5" height="8" fill={metal.pcb.dockTerminalAccent} />

        {/* Cap near Bot-Right */}
        <rect x="1230" y="751" width="10" height="8" />
        <rect x="1228" y="751" width="2.5" height="8" fill={metal.pcb.dockTerminalAccent} />
        <rect x="1237.5" y="751" width="2.5" height="8" fill={metal.pcb.dockTerminalAccent} />
      </g>

      {/* Solder Fillet Pads at Reactor Core Conduit Roots */}
      <g fill={metal.pcb.primaryTrace} stroke={metal.pcb.dockTerminalAccent} strokeWidth="1">
        <polygon points="665,301 669,305 665,309 661,305" />
        <polygon points="610,436 614,440 610,444 606,440" />
        <polygon points="665,571 669,575 665,579 661,575" />
        <polygon points="935,301 939,305 935,309 931,305" />
        <polygon points="990,436 994,440 990,444 986,440" />
        <polygon points="935,571 939,575 935,579 931,575" />
        <polygon points="800,626 804,630 800,634 796,630" />
      </g>

      {/* ======================================================== */}
      {/* 4. STATOR-TO-ROTOR ELECTROMAGNETIC FLUX FIELD LINES      */}
      {/* ======================================================== */}
      <g stroke={pulseColor1} strokeWidth="0.8" fill="none" opacity="0.3" strokeDasharray="5 7">
        {/* Left Stator North Pole -> Rotor Flux Arcs */}
        <path d="M 155 240 Q 420 330 660 360">
          <animate attributeName="stroke-dashoffset" from="100" to="0" dur="2.4s" repeatCount="indefinite" />
        </path>
        <path d="M 145 450 Q 400 450 610 450">
          <animate attributeName="stroke-dashoffset" from="100" to="0" dur="2.0s" repeatCount="indefinite" />
        </path>
        <path d="M 155 660 Q 420 570 660 540">
          <animate attributeName="stroke-dashoffset" from="100" to="0" dur="2.4s" repeatCount="indefinite" />
        </path>

        {/* Right Stator South Pole -> Rotor Flux Arcs */}
        <path d="M 1445 240 Q 1180 330 940 360">
          <animate attributeName="stroke-dashoffset" from="0" to="100" dur="2.4s" repeatCount="indefinite" />
        </path>
        <path d="M 1455 450 Q 1200 450 990 450">
          <animate attributeName="stroke-dashoffset" from="0" to="100" dur="2.0s" repeatCount="indefinite" />
        </path>
        <path d="M 1445 660 Q 1180 570 940 540">
          <animate attributeName="stroke-dashoffset" from="0" to="100" dur="2.4s" repeatCount="indefinite" />
        </path>
      </g>

      {/* ======================================================== */}
      {/* 5. HIGH-SPEED ELECTRIC CURRENT LASER STREAMS & PULSES    */}
      {/* ======================================================== */}

      {/* Laser Light Stream Gradients */}
      <defs>
        <linearGradient id="laserStreamGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={theme.coreColor} stopOpacity="0.0" />
          <stop offset="30%" stopColor={theme.glowColor} stopOpacity="0.85" />
          <stop offset="90%" stopColor={theme.coreColor} stopOpacity="1.0" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="1.0" />
        </linearGradient>
      </defs>

      {/* FAST MOVING LASER STREAM LINES (Core -> 6 HUD Docks & Nav) */}
      <g filter="url(#pcbPacketGlow)">
        {/* 1. TOP-LEFT HIGH SPEED CURRENT (Core -> Transcriber) */}
        <path
          d="M 665 305 L 535 175 L 250 175"
          fill="none"
          stroke={theme.glowColor}
          strokeWidth="3.2"
          strokeDasharray="90 520"
          strokeLinecap="round"
        >
          <animate
            attributeName="stroke-dashoffset"
            from="610"
            to="0"
            dur="0.85s"
            repeatCount="indefinite"
          />
        </path>
        <path
          d="M 665 305 L 535 175 L 250 175"
          fill="none"
          stroke="#ffffff"
          strokeWidth="1.6"
          strokeDasharray="30 580"
          strokeLinecap="round"
        >
          <animate
            attributeName="stroke-dashoffset"
            from="610"
            to="0"
            dur="0.85s"
            repeatCount="indefinite"
          />
        </path>

        {/* 2. MID-LEFT HIGH SPEED CURRENT (Core -> OS Controller) */}
        <path
          d="M 610 440 L 450 440 L 160 440"
          fill="none"
          stroke={theme.glowColor}
          strokeWidth="3.2"
          strokeDasharray="80 420"
          strokeLinecap="round"
        >
          <animate
            attributeName="stroke-dashoffset"
            from="500"
            to="0"
            dur="0.75s"
            repeatCount="indefinite"
            begin="-0.2s"
          />
        </path>
        <path
          d="M 610 440 L 450 440 L 160 440"
          fill="none"
          stroke="#ffffff"
          strokeWidth="1.6"
          strokeDasharray="25 475"
          strokeLinecap="round"
        >
          <animate
            attributeName="stroke-dashoffset"
            from="500"
            to="0"
            dur="0.75s"
            repeatCount="indefinite"
            begin="-0.2s"
          />
        </path>

        {/* 3. BOTTOM-LEFT HIGH SPEED CURRENT (Core -> Firecrawl) */}
        <path
          d="M 665 575 L 535 725 L 250 725"
          fill="none"
          stroke={theme.glowColor}
          strokeWidth="3.2"
          strokeDasharray="90 520"
          strokeLinecap="round"
        >
          <animate
            attributeName="stroke-dashoffset"
            from="610"
            to="0"
            dur="0.9s"
            repeatCount="indefinite"
            begin="-0.4s"
          />
        </path>
        <path
          d="M 665 575 L 535 725 L 250 725"
          fill="none"
          stroke="#ffffff"
          strokeWidth="1.6"
          strokeDasharray="30 580"
          strokeLinecap="round"
        >
          <animate
            attributeName="stroke-dashoffset"
            from="610"
            to="0"
            dur="0.9s"
            repeatCount="indefinite"
            begin="-0.4s"
          />
        </path>

        {/* 4. TOP-RIGHT HIGH SPEED CURRENT (Core -> Hardware Telemetry) */}
        <path
          d="M 935 305 L 1065 175 L 1350 175"
          fill="none"
          stroke={theme.glowColor}
          strokeWidth="3.2"
          strokeDasharray="90 520"
          strokeLinecap="round"
        >
          <animate
            attributeName="stroke-dashoffset"
            from="610"
            to="0"
            dur="0.82s"
            repeatCount="indefinite"
            begin="-0.15s"
          />
        </path>
        <path
          d="M 935 305 L 1065 175 L 1350 175"
          fill="none"
          stroke="#ffffff"
          strokeWidth="1.6"
          strokeDasharray="30 580"
          strokeLinecap="round"
        >
          <animate
            attributeName="stroke-dashoffset"
            from="610"
            to="0"
            dur="0.82s"
            repeatCount="indefinite"
            begin="-0.15s"
          />
        </path>

        {/* 5. MID-RIGHT HIGH SPEED CURRENT (Core -> TODO Matrix) */}
        <path
          d="M 990 440 L 1150 440 L 1440 440"
          fill="none"
          stroke={theme.glowColor}
          strokeWidth="3.2"
          strokeDasharray="80 420"
          strokeLinecap="round"
        >
          <animate
            attributeName="stroke-dashoffset"
            from="500"
            to="0"
            dur="0.76s"
            repeatCount="indefinite"
            begin="-0.35s"
          />
        </path>
        <path
          d="M 990 440 L 1150 440 L 1440 440"
          fill="none"
          stroke="#ffffff"
          strokeWidth="1.6"
          strokeDasharray="25 475"
          strokeLinecap="round"
        >
          <animate
            attributeName="stroke-dashoffset"
            from="500"
            to="0"
            dur="0.76s"
            repeatCount="indefinite"
            begin="-0.35s"
          />
        </path>

        {/* 6. BOTTOM-RIGHT HIGH SPEED CURRENT (Core -> Media Controller) */}
        <path
          d="M 935 575 L 1065 725 L 1350 725"
          fill="none"
          stroke={theme.glowColor}
          strokeWidth="3.2"
          strokeDasharray="90 520"
          strokeLinecap="round"
        >
          <animate
            attributeName="stroke-dashoffset"
            from="610"
            to="0"
            dur="0.88s"
            repeatCount="indefinite"
            begin="-0.5s"
          />
        </path>
        <path
          d="M 935 575 L 1065 725 L 1350 725"
          fill="none"
          stroke="#ffffff"
          strokeWidth="1.6"
          strokeDasharray="30 580"
          strokeLinecap="round"
        >
          <animate
            attributeName="stroke-dashoffset"
            from="610"
            to="0"
            dur="0.88s"
            repeatCount="indefinite"
            begin="-0.5s"
          />
        </path>

        {/* 7. BOTTOM NAV BUS HIGH SPEED CURRENT */}
        <path
          d="M 800 630 L 800 780"
          fill="none"
          stroke={theme.glowColor}
          strokeWidth="3.0"
          strokeDasharray="45 200"
          strokeLinecap="round"
        >
          <animate
            attributeName="stroke-dashoffset"
            from="245"
            to="0"
            dur="0.55s"
            repeatCount="indefinite"
          />
        </path>
      </g>

    </svg>
  );
};
