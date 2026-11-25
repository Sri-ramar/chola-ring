import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { soundManager } from '../utils/audio';
import { NeonColorId, getNeonTheme } from '../utils/neonThemes';
import { ShellMetalId, getShellMetalTheme } from '../utils/metalThemes';
import { getVoicePairForShell, interpolateHex } from '../utils/voiceColors';
import { VoiceState } from '../utils/voiceManager';

interface GoldReactorCoreProps {
  isOverclocked: boolean;
  onToggleOverclock: () => void;
  coreSpeedRPM: number;
  temperature: number;
  neonTheme?: NeonColorId;
  shellMetal?: ShellMetalId;
  onCycleTheme?: () => void;
  voiceState?: VoiceState;
  voiceAudioLevel?: number;
}

export const GoldReactorCore: React.FC<GoldReactorCoreProps> = ({
  isOverclocked,
  onToggleOverclock,
  neonTheme = 'amber',
  shellMetal = 'gold',
  onCycleTheme,
  voiceState = 'idle',
  voiceAudioLevel = 0,
}) => {
  const currentNeon = getNeonTheme(neonTheme);
  const currentMetal = getShellMetalTheme(shellMetal);
  const voicePair = getVoicePairForShell(shellMetal);

  // Active speaking states
  const isSpeaking = voiceState === 'speaking';
  const isListening = voiceState === 'listening';
  const isSpeakingActive = isSpeaking || isListening;

  // Smooth audio level using exponential moving average
  const [smoothAudio, setSmoothAudio] = useState(0);
  const smoothAudioRef = useRef(0);

  // Phase tracker for smooth voice pair color alternation
  const [voicePhase, setVoicePhase] = useState(0);
  const voicePhaseRef = useRef(0);

  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();

    const updateSmoothAudio = (now: number) => {
      const delta = (now - lastTime) / 1000;
      lastTime = now;

      const rawTarget = typeof voiceAudioLevel === 'number' ? voiceAudioLevel : 0;
      const target = rawTarget > 0 
        ? rawTarget 
        : (isSpeaking ? 0.35 + Math.sin(now / 150) * 0.18 : (isListening ? 0.08 : 0));
      
      const alpha = target > smoothAudioRef.current ? 0.30 : 0.12;
      smoothAudioRef.current = smoothAudioRef.current * (1 - alpha) + target * alpha;
      setSmoothAudio(smoothAudioRef.current);

      if (isSpeaking || isListening) {
        const speed = (isSpeaking ? 0.6 : 0.4) * (1 + smoothAudioRef.current * 0.7);
        voicePhaseRef.current = (voicePhaseRef.current + delta * speed) % 1;
        const easedPhase = (1 - Math.cos(voicePhaseRef.current * 2 * Math.PI)) / 2;
        setVoicePhase(easedPhase);
      } else {
        voicePhaseRef.current = 0;
        setVoicePhase(0);
      }

      animId = requestAnimationFrame(updateSmoothAudio);
    };

    animId = requestAnimationFrame(updateSmoothAudio);
    return () => cancelAnimationFrame(animId);
  }, [voiceAudioLevel, isSpeaking, isListening]);

  // Balanced Molten Core with enhanced warm amber-red thermal depth
  const moltenGoldCore = isSpeakingActive
    ? interpolateHex(voicePair.color1Core, voicePair.color2Core, voicePhase)
    : (neonTheme === 'amber' ? '#fff494' : currentNeon.coreColor);

  const moltenGoldBody = isSpeakingActive
    ? interpolateHex(voicePair.color1Core, voicePair.color2Core, voicePhase)
    : (neonTheme === 'amber' ? '#ffca28' : currentNeon.coreColor);

  const thermalOrange = isSpeakingActive
    ? interpolateHex(voicePair.color1Hex, voicePair.color2Hex, voicePhase)
    : (neonTheme === 'amber' ? '#f97316' : currentNeon.glowColor);

  const thermalRedEdge = isSpeakingActive
    ? interpolateHex(voicePair.color1Glow, voicePair.color2Glow, voicePhase)
    : (neonTheme === 'amber' ? '#c2410c' : currentNeon.deepGlow);

  const activeTickColor = isSpeakingActive 
    ? thermalOrange 
    : (neonTheme === 'amber' ? '#d97706' : currentNeon.tickColor);

  const handleClick = (e: React.MouseEvent) => {
    if (e.shiftKey && onCycleTheme) {
      soundManager.playColorShift();
      onCycleTheme();
    } else {
      soundManager.playOverclock();
      onToggleOverclock();
    }
  };

  // Chunky 4 Blocks Geometry (R=90, circumference ~565.49)
  // 4 blocks separated by 7.0px mechanical joints
  // (565.49 - 4*7.0)/4 = 537.49/4 = 134.37 dash, 7.0 gap
  const chunkyBlockDash = "134.37 7.0";
  const chunkyBlockOffset = "3.5";

  // Outer Thin Concentric Guide Rail (R=107, circumference ~672.30)
  // (672.30 - 4*6.0)/4 = 648.30/4 = 162.08 dash, 6.0 gap
  const outerRailDash = "162.08 6.0";
  const outerRailOffset = "3.0";

  return (
    <div className="relative flex items-center justify-center select-none">
      {/* Main Core Interactive Container */}
      <div 
        onClick={handleClick}
        className="relative w-[340px] h-[340px] sm:w-[380px] sm:h-[380px] cursor-pointer group"
        title="Click: Toggle Overclock | Shift+Click: Cycle Neon Spectrum"
      >
        <svg 
          viewBox="0 0 400 400" 
          className="w-full h-full drop-shadow-[0_30px_60px_rgba(0,0,0,0.98)]"
        >
          <defs>
            {/* Interior Glass Chamber Clipping Mask (R=146) */}
            <clipPath id="innerChamberClip">
              <circle cx="200" cy="200" r="146" />
            </clipPath>

            {/* Deep Dark Antique Brass / Weathered Bronze Shell Gradient */}
            <radialGradient id="machinedGoldBezelGrad" cx="34%" cy="24%" r="76%">
              {currentMetal.id === 'gold' ? (
                <>
                  <stop offset="0%" stopColor="#b59850" />
                  <stop offset="18%" stopColor="#8e6e28" />
                  <stop offset="42%" stopColor="#6e5218" />
                  <stop offset="68%" stopColor="#4a340b" />
                  <stop offset="88%" stopColor="#2c1c04" />
                  <stop offset="100%" stopColor="#150d01" />
                </>
              ) : currentMetal.id === 'black' ? (
                <>
                  <stop offset="0%" stopColor="#484745" />
                  <stop offset="25%" stopColor="#2f2e2d" />
                  <stop offset="55%" stopColor="#1a1918" />
                  <stop offset="80%" stopColor="#282726" />
                  <stop offset="95%" stopColor="#100f0e" />
                  <stop offset="100%" stopColor="#060606" />
                </>
              ) : (
                <>
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="25%" stopColor="#cbd5e1" />
                  <stop offset="55%" stopColor="#64748b" />
                  <stop offset="80%" stopColor="#94a3b8" />
                  <stop offset="95%" stopColor="#334155" />
                  <stop offset="100%" stopColor="#1e293b" />
                </>
              )}
            </radialGradient>

            {/* Subtle Directional Specular Sheen */}
            <linearGradient id="bezelDirectionalSheen" x1="15%" y1="10%" x2="85%" y2="90%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.25" />
              <stop offset="22%" stopColor="#ffffff" stopOpacity="0.02" />
              <stop offset="58%" stopColor="#000000" stopOpacity="0.7" />
              <stop offset="85%" stopColor="#ffffff" stopOpacity="0.06" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0.18" />
            </linearGradient>

            {/* Recessed Bolt Well Pocket Radial Depth */}
            <radialGradient id="heavyBoltPocketWell" cx="42%" cy="38%" r="58%">
              <stop offset="0%" stopColor="#040200" />
              <stop offset="65%" stopColor="#0d0801" />
              <stop offset="88%" stopColor="#1c1203" />
              <stop offset="100%" stopColor="#332005" />
            </radialGradient>

            {/* Cylindrical Domed Socket Screw Head */}
            <radialGradient id="heavySocketScrewHead" cx="28%" cy="25%" r="72%">
              {currentMetal.id === 'gold' ? (
                <>
                  <stop offset="0%" stopColor="#b39452" />
                  <stop offset="28%" stopColor="#876624" />
                  <stop offset="65%" stopColor="#482e08" />
                  <stop offset="90%" stopColor="#1c1001" />
                  <stop offset="100%" stopColor="#080400" />
                </>
              ) : currentMetal.id === 'black' ? (
                <>
                  <stop offset="0%" stopColor="#6e6c6a" />
                  <stop offset="35%" stopColor="#3c3a38" />
                  <stop offset="70%" stopColor="#1d1b1a" />
                  <stop offset="100%" stopColor="#0a0909" />
                </>
              ) : (
                <>
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="35%" stopColor="#cbd5e1" />
                  <stop offset="70%" stopColor="#64748b" />
                  <stop offset="100%" stopColor="#1e293b" />
                </>
              )}
            </radialGradient>

            {/* Stepped Dark Brass Chamber Basin Floor */}
            <radialGradient id="steppedBrassChamberBg" cx="50%" cy="50%" r="65%">
              <stop offset="0%" stopColor="#201103" />
              <stop offset="45%" stopColor="#120901" />
              <stop offset="80%" stopColor="#060300" />
              <stop offset="100%" stopColor="#010000" />
            </radialGradient>

            {/* Enhanced Warm Thermal Bloom Filter */}
            <filter id="forgedThermalBloom" x="-25%" y="-25%" width="150%" height="150%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="2.0" result="softGlow" />
              <feGaussianBlur in="SourceGraphic" stdDeviation="4.2" result="wideGlow" />
              <feMerge>
                <feMergeNode in="wideGlow" />
                <feMergeNode in="softGlow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Convex Watch Crystal Glass Dome Overlay Reflections */}
            <linearGradient id="convexDomeUpperGlare" x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.48" />
              <stop offset="28%" stopColor="#ffffff" stopOpacity="0.18" />
              <stop offset="60%" stopColor="#ffffff" stopOpacity="0.02" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0.0" />
            </linearGradient>

            <radialGradient id="glassRimBevelRefract" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.0" />
              <stop offset="86%" stopColor="#ffffff" stopOpacity="0.0" />
              <stop offset="94%" stopColor="#ffffff" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0.32" />
            </radialGradient>

            {/* Chamber Wall Warm Chrome / Glass Reflection Wings */}
            <linearGradient id="chamberWallReflectLeft" x1="0%" y1="50%" x2="100%" y2="50%">
              <stop offset="0%" stopColor="#d97706" stopOpacity="0.32" />
              <stop offset="35%" stopColor="#f97316" stopOpacity="0.16" />
              <stop offset="70%" stopColor="#92400e" stopOpacity="0.04" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.0" />
            </linearGradient>

            <linearGradient id="chamberWallReflectRight" x1="100%" y1="50%" x2="0%" y2="50%">
              <stop offset="0%" stopColor="#d97706" stopOpacity="0.32" />
              <stop offset="35%" stopColor="#f97316" stopOpacity="0.16" />
              <stop offset="70%" stopColor="#92400e" stopOpacity="0.04" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* ========================================================= */}
          {/* LAYER 1: DARK ANTIQUE BRASS CHASSIS (R=146 to 190, W=44px)*/}
          {/* ========================================================= */}
          {/* Outer Ambient Occlusion Shadow */}
          <circle cx="200" cy="200" r="192" fill="none" stroke="#000000" strokeWidth="6" opacity="0.95" />

          {/* Outer Stepped Rim with Recessed Groove */}
          <circle cx="200" cy="200" r="190" fill="none" stroke="#9e7c38" strokeWidth="1.0" opacity="0.45" />
          <circle cx="200" cy="200" r="188.5" fill="none" stroke="#120a01" strokeWidth="2.0" />
          <circle cx="200" cy="200" r="186" fill="none" stroke="#1f1302" strokeWidth="1.5" />
          <circle cx="200" cy="200" r="183.5" fill="none" stroke="#9e7c38" strokeWidth="0.75" strokeOpacity="0.35" />

          {/* Main Dark Antique Brass Faceplate Ring */}
          <circle 
            cx="200" cy="200" r="168" 
            fill="none" 
            stroke="url(#machinedGoldBezelGrad)" 
            strokeWidth="38" 
          />
          {/* Directional Studio Sheen Overlay */}
          <circle 
            cx="200" cy="200" r="168" 
            fill="none" 
            stroke="url(#bezelDirectionalSheen)" 
            strokeWidth="38" 
            opacity="0.35" 
          />

          {/* Concentric Lathe Machining Micro-Grooves on Brass Plate */}
          <circle cx="200" cy="200" r="180" fill="none" stroke="#9e7c38" strokeWidth="0.5" strokeOpacity="0.25" />
          <circle cx="200" cy="200" r="174" fill="none" stroke="#261703" strokeWidth="0.75" strokeOpacity="0.7" />
          <circle cx="200" cy="200" r="158" fill="none" stroke="#261703" strokeWidth="0.75" strokeOpacity="0.7" />
          <circle cx="200" cy="200" r="152" fill="none" stroke="#9e7c38" strokeWidth="0.5" strokeOpacity="0.3" />

          {/* Micro Stamped Technical Dot at 1 o'clock */}
          <circle cx="216" cy="38" r="1" fill="#1f1302" />

          {/* Inner Stepped Bezel Collar Framing Glass Aperture */}
          <circle cx="200" cy="200" r="148" fill="none" stroke="#050300" strokeWidth="2.5" />
          <circle cx="200" cy="200" r="146" fill="none" stroke="#9e7c38" strokeWidth="1.0" strokeOpacity="0.6" />

          {/* ========================================================= */}
          {/* LAYER 2: 4 RECESSED SOCKET-CAP BOLTS (R=168)              */}
          {/* ========================================================= */}
          {/* 1. TOP BOLT (12 o'clock: X=200, Y=32) */}
          <g transform="translate(200, 32)">
            <circle cx="0" cy="0" r="13.5" fill="url(#heavyBoltPocketWell)" stroke="#0d0701" strokeWidth="1.0" />
            <circle cx="0" cy="0" r="13.5" fill="none" stroke="#9e7c38" strokeWidth="0.6" strokeOpacity="0.4" />
            <circle cx="0" cy="0" r="9.8" fill="url(#heavySocketScrewHead)" stroke="#9e7c38" strokeWidth="0.5" />
            <circle cx="0" cy="0" r="4.6" fill="#020100" stroke="#1c1102" strokeWidth="0.8" />
            <circle cx="-1" cy="-1" r="1.2" fill="#ffffff" opacity="0.5" />
          </g>

          {/* 2. RIGHT BOLT (3 o'clock: X=368, Y=200) */}
          <g transform="translate(368, 200)">
            <circle cx="0" cy="0" r="13.5" fill="url(#heavyBoltPocketWell)" stroke="#0d0701" strokeWidth="1.0" />
            <circle cx="0" cy="0" r="13.5" fill="none" stroke="#9e7c38" strokeWidth="0.6" strokeOpacity="0.4" />
            <circle cx="0" cy="0" r="9.8" fill="url(#heavySocketScrewHead)" stroke="#9e7c38" strokeWidth="0.5" />
            <circle cx="0" cy="0" r="4.6" fill="#020100" stroke="#1c1102" strokeWidth="0.8" />
            <circle cx="-1" cy="-1" r="1.2" fill="#ffffff" opacity="0.5" />
          </g>

          {/* 3. BOTTOM BOLT (6 o'clock: X=200, Y=368) */}
          <g transform="translate(200, 368)">
            <circle cx="0" cy="0" r="13.5" fill="url(#heavyBoltPocketWell)" stroke="#0d0701" strokeWidth="1.0" />
            <circle cx="0" cy="0" r="13.5" fill="none" stroke="#9e7c38" strokeWidth="0.6" strokeOpacity="0.4" />
            <circle cx="0" cy="0" r="9.8" fill="url(#heavySocketScrewHead)" stroke="#9e7c38" strokeWidth="0.5" />
            <circle cx="0" cy="0" r="4.6" fill="#020100" stroke="#1c1102" strokeWidth="0.8" />
            <circle cx="-1" cy="-1" r="1.2" fill="#ffffff" opacity="0.5" />
          </g>

          {/* 4. LEFT BOLT (9 o'clock: X=32, Y=200) */}
          <g transform="translate(32, 200)">
            <circle cx="0" cy="0" r="13.5" fill="url(#heavyBoltPocketWell)" stroke="#0d0701" strokeWidth="1.0" />
            <circle cx="0" cy="0" r="13.5" fill="none" stroke="#9e7c38" strokeWidth="0.6" strokeOpacity="0.4" />
            <circle cx="0" cy="0" r="9.8" fill="url(#heavySocketScrewHead)" stroke="#9e7c38" strokeWidth="0.5" />
            <circle cx="0" cy="0" r="4.6" fill="#020100" stroke="#1c1102" strokeWidth="0.8" />
            <circle cx="-1" cy="-1" r="1.2" fill="#ffffff" opacity="0.5" />
          </g>

          {/* Semi-circular relief cuts in inner rim framing the 4 bolts */}
          <path d="M 186 146 A 14 14 0 0 0 214 146" fill="none" stroke="#1c1102" strokeWidth="1.2" />
          <path d="M 146 186 A 14 14 0 0 0 146 214" fill="none" stroke="#1c1102" strokeWidth="1.2" />
          <path d="M 186 254 A 14 14 0 0 1 214 254" fill="none" stroke="#1c1102" strokeWidth="1.2" />
          <path d="M 254 186 A 14 14 0 0 1 254 214" fill="none" stroke="#1c1102" strokeWidth="1.2" />

          {/* ========================================================= */}
          {/* LAYER 3: INTERIOR REACTOR CHAMBER (R <= 146)              */}
          {/* ========================================================= */}
          <g clipPath="url(#innerChamberClip)">
            {/* Stepped Dark Brass Basin Floor */}
            <circle cx="200" cy="200" r="146" fill="url(#steppedBrassChamberBg)" />

            {/* Stepped Chamber Well Brass Walls */}
            <circle cx="200" cy="200" r="140" fill="none" stroke="#2e1906" strokeWidth="1.8" />
            <circle cx="200" cy="200" r="130" fill="none" stroke="#1c0f03" strokeWidth="1.5" />
            <circle cx="200" cy="200" r="118" fill="none" stroke="#100801" strokeWidth="1.2" />

            {/* Chamber Wall Curved Chrome/Glass Reflection Wings */}
            <path d="M 54 135 C 50 178, 50 222, 54 265 L 82 252 C 78 218, 78 182, 82 148 Z" fill="url(#chamberWallReflectLeft)" />
            <path d="M 346 135 C 350 178, 350 222, 346 265 L 318 252 C 322 218, 322 182, 318 148 Z" fill="url(#chamberWallReflectRight)" />

            {/* Outer Chamber Segmented Indicator Arcs & Ticks (R=126 and R=122) */}
            <circle
              cx="200" cy="200" r="126"
              fill="none"
              stroke={thermalOrange}
              strokeWidth="1.2"
              strokeDasharray="44 14 6 14"
              strokeOpacity="0.45"
            />
            <circle
              cx="200" cy="200" r="122"
              fill="none"
              stroke="#241203"
              strokeWidth="0.8"
            />

            {/* Outer Thin Concentric Guide Rail (R=107) */}
            <circle
              cx="200" cy="200" r="107"
              fill="none"
              stroke={thermalOrange}
              strokeWidth="1.5"
              strokeDasharray={outerRailDash}
              strokeDashoffset={outerRailOffset}
              strokeOpacity="0.8"
              filter="url(#forgedThermalBloom)"
            />

            {/* ========================================================= */}
            {/* 4. MAIN 4 CHUNKY 3D PRISMATIC MOLTEN BLOCKS (R=90, W=26px)*/}
            {/* ========================================================= */}
            <motion.g
              animate={{ rotate: [0, 360] }}
              transition={{ duration: isOverclocked ? 18 : 60, ease: "linear", repeat: Infinity }}
              style={{ transformOrigin: '200px 200px' }}
            >
              {/* Thermal Halo Bloom */}
              <circle
                cx="200" cy="200" r="90"
                fill="none"
                stroke={thermalOrange}
                strokeWidth="31"
                strokeDasharray={chunkyBlockDash}
                strokeDashoffset={chunkyBlockOffset}
                strokeLinecap="butt"
                opacity="0.78"
                filter="url(#forgedThermalBloom)"
              />

              {/* Layer 1: Thermal Red/Amber Base Chamfer */}
              <circle
                cx="200" cy="200" r="90"
                fill="none"
                stroke={thermalRedEdge}
                strokeWidth="26"
                strokeDasharray={chunkyBlockDash}
                strokeDashoffset={chunkyBlockOffset}
                strokeLinecap="butt"
                opacity="0.92"
              />

              {/* Layer 2: Radiant Molten Orange Block Body */}
              <circle
                cx="200" cy="200" r="90"
                fill="none"
                stroke={thermalOrange}
                strokeWidth="22"
                strokeDasharray={chunkyBlockDash}
                strokeDashoffset={chunkyBlockOffset}
                strokeLinecap="butt"
                opacity="0.95"
              />

              {/* Layer 3: Solid Volumetric Molten Gold Ingot */}
              <circle
                cx="200" cy="200" r="90"
                fill="none"
                stroke={moltenGoldBody}
                strokeWidth="17"
                strokeDasharray={chunkyBlockDash}
                strokeDashoffset={chunkyBlockOffset}
                strokeLinecap="butt"
                opacity="1.0"
              />

              {/* Layer 4: Incandescent White-Gold Heat Core */}
              <circle
                cx="200" cy="200" r="90"
                fill="none"
                stroke={moltenGoldCore}
                strokeWidth="9"
                strokeDasharray={chunkyBlockDash}
                strokeDashoffset={chunkyBlockOffset}
                strokeLinecap="butt"
                opacity="0.95"
              />

              {/* Outer and Inner Prismatic Edge Guide Rails */}
              <circle
                cx="200" cy="200" r="103"
                fill="none"
                stroke={thermalRedEdge}
                strokeWidth="0.75"
                strokeOpacity="0.65"
              />
              <circle
                cx="200" cy="200" r="77"
                fill="none"
                stroke={thermalRedEdge}
                strokeWidth="0.75"
                strokeOpacity="0.65"
              />
            </motion.g>

            {/* ========================================================= */}
            {/* 5. DUAL-TIER PRECISION CHRONOGRAPH INSTRUMENT DIAL (R=56-75)*/}
            {/* ========================================================= */}
            <motion.g
              animate={{ rotate: [360, 0] }}
              transition={{ duration: isOverclocked ? 24 : 75, ease: "linear", repeat: Infinity }}
              style={{ transformOrigin: '200px 200px' }}
            >
              {/* Outer Bounding Wire Rail */}
              <circle cx="200" cy="200" r="75" fill="none" stroke={activeTickColor} strokeWidth="0.8" strokeOpacity="0.5" />
              {/* Mid Track Separator Wire */}
              <circle cx="200" cy="200" r="66" fill="none" stroke={activeTickColor} strokeWidth="0.6" strokeOpacity="0.35" />
              {/* Inner Bounding Wire Rail */}
              <circle cx="200" cy="200" r="56" fill="none" stroke={activeTickColor} strokeWidth="0.8" strokeOpacity="0.5" />

              {/* TIER 1: OUTER ROW INSTRUMENT TICKS (48 Ticks) */}
              {Array.from({ length: 48 }).map((_, i) => {
                const angle = (i * 360) / 48;
                const rad = (angle * Math.PI) / 180;
                const isMajor = i % 4 === 0;
                const innerR = 67.5;
                const outerR = isMajor ? 74 : 72;
                const x1 = 200 + innerR * Math.cos(rad);
                const y1 = 200 + innerR * Math.sin(rad);
                const x2 = 200 + outerR * Math.cos(rad);
                const y2 = 200 + outerR * Math.sin(rad);
                return (
                  <line
                    key={`outer-gauge-tick-${i}`}
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke={activeTickColor}
                    strokeWidth={isMajor ? "1.3" : "0.75"}
                    opacity={isMajor ? "0.9" : "0.5"}
                  />
                );
              })}

              {/* TIER 2: INNER ROW INSTRUMENT TICKS (48 Ticks, offset by 3.75 deg) */}
              {Array.from({ length: 48 }).map((_, i) => {
                const angle = (i * 360) / 48 + 3.75;
                const rad = (angle * Math.PI) / 180;
                const isMajor = i % 4 === 0;
                const innerR = isMajor ? 57.5 : 59.5;
                const outerR = 64.5;
                const x1 = 200 + innerR * Math.cos(rad);
                const y1 = 200 + innerR * Math.sin(rad);
                const x2 = 200 + outerR * Math.cos(rad);
                const y2 = 200 + outerR * Math.sin(rad);
                return (
                  <line
                    key={`inner-gauge-tick-${i}`}
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke={activeTickColor}
                    strokeWidth={isMajor ? "1.1" : "0.6"}
                    opacity={isMajor ? "0.8" : "0.4"}
                  />
                );
              })}
            </motion.g>

            {/* ========================================================= */}
            {/* 6. CONTINUOUS 3D MOLTEN TORUS TUBE (R=46, W=11px)        */}
            {/* ========================================================= */}
            {/* Torus Thermal Red Outer Bevel */}
            <circle
              cx="200" cy="200" r="46"
              fill="none"
              stroke={thermalRedEdge}
              strokeWidth="11"
              opacity="0.9"
              filter="url(#forgedThermalBloom)"
            />
            {/* Torus Radiant Thermal Orange Body */}
            <circle
              cx="200" cy="200" r="46"
              fill="none"
              stroke={thermalOrange}
              strokeWidth="8"
              opacity="0.95"
            />
            {/* Torus Solid Molten Gold Body */}
            <circle
              cx="200" cy="200" r="46"
              fill="none"
              stroke={moltenGoldBody}
              strokeWidth="5.5"
              opacity="1.0"
            />
            {/* Torus Incandescent Center Heat Line */}
            <circle
              cx="200" cy="200" r="46"
              fill="none"
              stroke={moltenGoldCore}
              strokeWidth="2.5"
              opacity="0.95"
            />

            {/* ========================================================= */}
            {/* 7. STEPPED METALLIC INNER BEZEL & OBSIDIAN ABYSS VOID     */}
            {/* ========================================================= */}
            {/* Stepped Metallic Retainer Collar */}
            <circle
              cx="200" cy="200" r="40.5"
              fill="none"
              stroke="#3a2008"
              strokeWidth="1.5"
            />
            {/* Deep Solid Obsidian Abyss Void Center Core */}
            <circle
              cx="200" cy="200" r="39"
              fill="#010101"
              stroke="#180c02"
              strokeWidth="1.2"
            />

            {/* ========================================================= */}
            {/* 8. CONVEX WATCH CRYSTAL GLASS DOME OPTICS OVERLAY         */}
            {/* ========================================================= */}
            {/* Upper Spherical Convex Dome Glare Crescent */}
            <path
              d="M 80 135 C 84 75, 128 42, 200 42 C 272 42, 316 75, 320 135 C 280 98, 244 84, 200 84 C 156 84, 120 98, 80 135 Z"
              fill="url(#convexDomeUpperGlare)"
              opacity="0.92"
              pointerEvents="none"
            />

            {/* Secondary Soft Convex Glass Ambient Glint */}
            <ellipse
              cx="200" cy="92"
              rx="90" ry="32"
              fill="#ffffff"
              opacity="0.08"
              pointerEvents="none"
            />

            {/* Glass Rim Bevel Refraction Ring */}
            <circle
              cx="200" cy="200" r="145"
              fill="url(#glassRimBevelRefract)"
              pointerEvents="none"
            />

            {/* Bottom Subtle Meniscus Glint */}
            <path
              d="M 130 315 C 165 332, 235 332, 270 315 C 250 326, 218 330, 200 330 C 182 330, 150 326, 130 315 Z"
              fill="#ffffff"
              opacity="0.18"
              pointerEvents="none"
            />
          </g>
        </svg>

        {/* Hover Status Pill */}
        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none whitespace-nowrap bg-black/95 px-3 py-1 rounded border border-stone-700 text-[10px] tracking-widest text-stone-200 font-tech z-30 shadow-[0_0_15px_rgba(0,0,0,0.9)] flex items-center space-x-1.5">
          <span 
            className="w-1.5 h-1.5 rounded-full animate-pulse" 
            style={{ 
              backgroundColor: thermalOrange, 
              boxShadow: `0 0 8px ${thermalOrange}` 
            }} 
          />
          <span className="font-orbitron font-bold" style={{ color: thermalOrange }}>
            {currentMetal.name.toUpperCase()}
          </span>
          <span className="text-stone-500">•</span>
          {isSpeakingActive ? (
            <span className="font-bold text-white">
              {isSpeaking ? 'AI RESPONDING' : 'LISTENING TO VOICE'}
            </span>
          ) : (
            <span style={{ color: thermalOrange }}>{currentNeon.name.toUpperCase()}</span>
          )}
          <span className="text-stone-500">•</span>
          <span className={isOverclocked ? "font-bold text-white" : "text-stone-400"}>
            {isOverclocked ? 'OVERCLOCK ENGAGED' : 'CLICK: OVERCLOCK'}
          </span>
        </div>
      </div>
    </div>
  );
};
