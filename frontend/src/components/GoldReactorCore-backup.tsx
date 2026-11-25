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

  // Smooth audio level using exponential moving average to prevent jerky jumps / blinking
  const [smoothAudio, setSmoothAudio] = useState(0);
  const smoothAudioRef = useRef(0);

  // Phase tracker for smooth voice pair color alternation (0 -> 1 -> 0)
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
        : (isSpeaking ? 0.40 + Math.sin(now / 140) * 0.22 : (isListening ? 0.08 : 0));
      
      // Fast attack, smooth decay
      const alpha = target > smoothAudioRef.current ? 0.35 : 0.15;
      smoothAudioRef.current = smoothAudioRef.current * (1 - alpha) + target * alpha;
      setSmoothAudio(smoothAudioRef.current);

      // Advance voice pair color phase one by one during active voice mode
      if (isSpeaking || isListening) {
        // Frequency shifts with speech modulation for responsive tactile transitions
        const speed = (isSpeaking ? 0.65 : 0.45) * (1 + smoothAudioRef.current * 0.8);
        voicePhaseRef.current = (voicePhaseRef.current + delta * speed) % 1;
        // Smooth sine wave easing: 0 -> 1 -> 0
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

  // Color selection: In voice mode, transition one by one between the shell's paired colors:
  // Gold shell: Gold + Green
  // Black shell: Red + Pink
  // Silver shell: White + Blue
  const activeGlowHex = isSpeakingActive
    ? interpolateHex(voicePair.color1Hex, voicePair.color2Hex, voicePhase)
    : currentNeon.glowColor;

  const activeCoreHex = isSpeakingActive
    ? interpolateHex(voicePair.color1Core, voicePair.color2Core, voicePhase)
    : currentNeon.coreColor;

  const activeDeepHex = isSpeakingActive
    ? interpolateHex(voicePair.color1Glow, voicePair.color2Glow, voicePhase)
    : currentNeon.deepGlow;

  const activeOuterArc = isSpeakingActive ? activeGlowHex : currentNeon.outerArcColor;
  const activeTickColor = isSpeakingActive ? activeGlowHex : currentNeon.tickColor;
  const activeTickMajor = isSpeakingActive ? activeCoreHex : currentNeon.tickMajor;

  const handleClick = (e: React.MouseEvent) => {
    if (e.shiftKey && onCycleTheme) {
      soundManager.playColorShift();
      onCycleTheme();
    } else {
      soundManager.playOverclock();
      onToggleOverclock();
    }
  };

  // 60 precision radial ticks for the reticle gauge
  const ticks = Array.from({ length: 60 });

  // Core pulse scale derived from smooth audio & overclock
  const audioEnergy = Math.min(1.0, Math.max(0, smoothAudio));
  const pulseScale = 1 + audioEnergy * 0.25 + (isOverclocked ? 0.08 : 0);
  const auraGlowIntensity = 0.72 + audioEnergy * 0.45 + (isOverclocked ? 0.28 : 0);

  return (
    <div className="relative flex items-center justify-center select-none">
      {/* Outer Volumetric Luminous Aura Halo behind the physical Bezel */}
      <div 
        className="absolute w-[380px] h-[380px] sm:w-[440px] sm:h-[440px] rounded-full pointer-events-none transition-all duration-500 blur-3xl"
        style={{
          background: `radial-gradient(circle, ${activeGlowHex}99 0%, ${activeDeepHex}66 42%, transparent 75%)`,
          opacity: auraGlowIntensity,
          transform: `scale(${pulseScale})`,
        }}
      />

      {/* Secondary Outer Concentrated Glow Halo */}
      <div 
        className="absolute w-[320px] h-[320px] sm:w-[380px] sm:h-[380px] rounded-full pointer-events-none transition-all duration-300 blur-2xl"
        style={{
          background: `radial-gradient(circle, ${activeCoreHex}88 0%, ${activeGlowHex}66 40%, transparent 70%)`,
          opacity: isSpeakingActive ? 0.95 : 0.8,
        }}
      />

      {/* Main Core Container */}
      <div 
        onClick={handleClick}
        className="relative w-[320px] h-[320px] sm:w-[360px] sm:h-[360px] cursor-pointer transition-transform duration-300 hover:scale-[1.015] active:scale-[0.985] group"
        title="Click: Toggle Overclock | Shift+Click: Cycle Neon Glow"
      >
        <svg 
          viewBox="0 0 400 400" 
          className="w-full h-full drop-shadow-[0_20px_45px_rgba(0,0,0,0.95)]"
        >
          <defs>
            {/* Clip path strictly confining all inner luminosity to the interior lens chamber (R=153) */}
            <clipPath id="reactorChamberClip">
              <circle cx="200" cy="200" r="153" />
            </clipPath>

            {/* 1. Dynamic Shell Metal Gradients (Gold, Black, Silver) */}
            <linearGradient id={`steppedOuterBezel-${currentMetal.id}`} x1="15%" y1="10%" x2="85%" y2="90%">
              {currentMetal.bezelStops.map((stop, idx) => (
                <stop key={idx} offset={stop.offset} stopColor={stop.color} />
              ))}
            </linearGradient>

            <radialGradient id={`brushedMetalPlate-${currentMetal.id}`} cx="42%" cy="38%" r="65%">
              {currentMetal.plateStops.map((stop, idx) => (
                <stop key={idx} offset={stop.offset} stopColor={stop.color} />
              ))}
            </radialGradient>

            <linearGradient id={`machinedShine-${currentMetal.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
              {currentMetal.shineStops.map((stop, idx) => (
                <stop 
                  key={idx} 
                  offset={stop.offset} 
                  stopColor={stop.color} 
                  stopOpacity={stop.opacity ?? 1} 
                />
              ))}
            </linearGradient>

            {/* 2. Recessed Socket-Head Bolt Head Gradient */}
            <radialGradient id={`machinedBoltHead-${currentMetal.id}`} cx="35%" cy="35%" r="65%">
              {currentMetal.boltStops.map((stop, idx) => (
                <stop key={idx} offset={stop.offset} stopColor={stop.color} />
              ))}
            </radialGradient>

            {/* 3. Luminous Chamber Background & Radial Glow Halo matching current theme */}
            <radialGradient id="chamberLuminousGlow" cx="50%" cy="50%" r="55%">
              <stop offset="0%" stopColor={activeGlowHex} stopOpacity={isOverclocked ? "0.85" : "0.65"} />
              <stop offset="28%" stopColor={activeDeepHex} stopOpacity={isOverclocked ? "0.6" : "0.45"} />
              <stop offset="58%" stopColor="#120e09" stopOpacity="0.88" />
              <stop offset="85%" stopColor="#060504" stopOpacity="0.98" />
              <stop offset="100%" stopColor="#020202" stopOpacity="1" />
            </radialGradient>

            {/* Intense Center Radial Light Bloom */}
            <radialGradient id="coreRadialBloom" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity={0.9 + smoothAudio * 0.1} />
              <stop offset="22%" stopColor={activeCoreHex} stopOpacity={0.8 + smoothAudio * 0.2} />
              <stop offset="50%" stopColor={activeGlowHex} stopOpacity={0.6} />
              <stop offset="78%" stopColor={activeDeepHex} stopOpacity={0.3} />
              <stop offset="100%" stopColor="transparent" stopOpacity="0" />
            </radialGradient>

            {/* 4. Rich Thermal Plasma Bloom & Glow Filters */}
            <filter id="neonArcGlowFilter" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur1" />
              <feGaussianBlur in="SourceGraphic" stdDeviation="6.0" result="blur2" />
              <feMerge>
                <feMergeNode in="blur2" />
                <feMergeNode in="blur1" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <filter id="centerRingGlowFilter" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="2.0" result="blur1" />
              <feGaussianBlur in="SourceGraphic" stdDeviation="5.0" result="blur2" />
              <feMerge>
                <feMergeNode in="blur2" />
                <feMergeNode in="blur1" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* 5. 3D Convex Crystal Dome Reflections */}
            <linearGradient id="glassReflectionGradient" x1="10%" y1="10%" x2="90%" y2="90%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.28" />
              <stop offset="20%" stopColor="#ffffff" stopOpacity="0.10" />
              <stop offset="50%" stopColor="#ffffff" stopOpacity="0.0" />
              <stop offset="80%" stopColor="#ffffff" stopOpacity="0.0" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0.18" />
            </linearGradient>

            <linearGradient id="crescentGlint" x1="10%" y1="5%" x2="50%" y2="50%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.80" />
              <stop offset="45%" stopColor="#ffffff" stopOpacity="0.22" />
              <stop offset="85%" stopColor="#ffffff" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* ========================================================= */}
          {/* LAYER 1: OUTER STEPPED CHASSIS SHELL (GOLD/BLACK/SILVER)   */}
          {/* ========================================================= */}

          {/* Outer Bevel Shadow Drop */}
          <circle cx="200" cy="200" r="197" fill="none" stroke={currentMetal.outerShadowColor} strokeWidth="4" />

          {/* Outermost Stepped Rim (Radius 194) */}
          <circle cx="200" cy="200" r="194" fill="none" stroke={`url(#steppedOuterBezel-${currentMetal.id})`} strokeWidth="4" />
          <circle cx="200" cy="200" r="192" fill="none" stroke={currentMetal.rimHighlightColor} strokeWidth="0.8" strokeOpacity="0.6" />

          {/* Recessed Step-Down Channel */}
          <circle cx="200" cy="200" r="190" fill="none" stroke={currentMetal.recessColor} strokeWidth="2.5" />

          {/* Main Brushed Chassis Metal Bezel Plate (Outer R=188 to Inner R=155) */}
          <circle 
            cx="200" cy="200" r="172" 
            fill="none" 
            stroke={`url(#brushedMetalPlate-${currentMetal.id})`} 
            strokeWidth="32" 
          />
          <circle 
            cx="200" cy="200" r="172" 
            fill="none" 
            stroke={`url(#machinedShine-${currentMetal.id})`} 
            strokeWidth="32" 
            opacity="0.65" 
          />

          {/* Machined Fine Concentric Lathe Grooves */}
          <circle cx="200" cy="200" r="185" fill="none" stroke={currentMetal.grooveLightColor} strokeWidth="0.6" strokeOpacity="0.45" />
          <circle cx="200" cy="200" r="160" fill="none" stroke={currentMetal.grooveDarkColor} strokeWidth="1" strokeOpacity="0.8" />

          {/* Inner Retaining Collar bordering the Glass */}
          <circle cx="200" cy="200" r="156" fill="none" stroke={currentMetal.collarColor} strokeWidth="3" />
          <circle cx="200" cy="200" r="154.5" fill="none" stroke={currentMetal.collarLightColor} strokeWidth="0.75" strokeOpacity="0.5" />

          {/* Optical Machined Alignment Pin */}
          <circle cx="265" cy="52" r="2" fill={currentMetal.pinBaseColor} stroke={currentMetal.pinBorderColor} strokeWidth="0.6" />

          {/* ========================================================= */}
          {/* LAYER 2: 4 RECESSED SOCKET BOLTS                          */}
          {/* ========================================================= */}

          {/* Top Bolt Assembly (12 o'clock) */}
          <g transform="translate(200, 28)">
            <circle cx="0" cy="0" r="12" fill={currentMetal.boltHoleBg} stroke={currentMetal.boltHoleBorder} strokeWidth="0.8" />
            <circle cx="0" cy="0" r="10" fill="none" stroke={currentMetal.boltInnerBorder} strokeWidth="1.2" />
            <circle cx="0" cy="0" r="8.5" fill={`url(#machinedBoltHead-${currentMetal.id})`} stroke={currentMetal.rimHighlightColor} strokeWidth="0.5" />
            <circle cx="0" cy="0" r="3" fill={currentMetal.boltCenterFill} stroke={currentMetal.boltCenterBorder} strokeWidth="0.6" />
            <circle cx="0.5" cy="-0.5" r="0.7" fill="#ffffff" opacity="0.6" />
          </g>

          {/* Right Bolt Assembly (3 o'clock) */}
          <g transform="translate(372, 200)">
            <circle cx="0" cy="0" r="12" fill={currentMetal.boltHoleBg} stroke={currentMetal.boltHoleBorder} strokeWidth="0.8" />
            <circle cx="0" cy="0" r="10" fill="none" stroke={currentMetal.boltInnerBorder} strokeWidth="1.2" />
            <circle cx="0" cy="0" r="8.5" fill={`url(#machinedBoltHead-${currentMetal.id})`} stroke={currentMetal.rimHighlightColor} strokeWidth="0.5" />
            <circle cx="0" cy="0" r="3" fill={currentMetal.boltCenterFill} stroke={currentMetal.boltCenterBorder} strokeWidth="0.6" />
            <circle cx="0.5" cy="-0.5" r="0.7" fill="#ffffff" opacity="0.6" />
          </g>

          {/* Bottom Bolt Assembly (6 o'clock) */}
          <g transform="translate(200, 372)">
            <circle cx="0" cy="0" r="12" fill={currentMetal.boltHoleBg} stroke={currentMetal.boltHoleBorder} strokeWidth="0.8" />
            <circle cx="0" cy="0" r="10" fill="none" stroke={currentMetal.boltInnerBorder} strokeWidth="1.2" />
            <circle cx="0" cy="0" r="8.5" fill={`url(#machinedBoltHead-${currentMetal.id})`} stroke={currentMetal.rimHighlightColor} strokeWidth="0.5" />
            <circle cx="0" cy="0" r="3" fill={currentMetal.boltCenterFill} stroke={currentMetal.boltCenterBorder} strokeWidth="0.6" />
            <circle cx="0.5" cy="-0.5" r="0.7" fill="#ffffff" opacity="0.6" />
          </g>

          {/* Left Bolt Assembly (9 o'clock) */}
          <g transform="translate(28, 200)">
            <circle cx="0" cy="0" r="12" fill={currentMetal.boltHoleBg} stroke={currentMetal.boltHoleBorder} strokeWidth="0.8" />
            <circle cx="0" cy="0" r="10" fill="none" stroke={currentMetal.boltInnerBorder} strokeWidth="1.2" />
            <circle cx="0" cy="0" r="8.5" fill={`url(#machinedBoltHead-${currentMetal.id})`} stroke={currentMetal.rimHighlightColor} strokeWidth="0.5" />
            <circle cx="0" cy="0" r="3" fill={currentMetal.boltCenterFill} stroke={currentMetal.boltCenterBorder} strokeWidth="0.6" />
            <circle cx="0.5" cy="-0.5" r="0.7" fill="#ffffff" opacity="0.6" />
          </g>

          {/* ========================================================= */}
          {/* INNER CHAMBER CONTENT (STRICTLY CLIPPED TO LENS R=153)     */}
          {/* ========================================================= */}
          <g clipPath="url(#reactorChamberClip)">
            {/* LAYER 3: LUMINOUS CHAMBER WELL (Deep Dynamic Glow) */}
            <circle cx="200" cy="200" r="153" fill="url(#chamberLuminousGlow)" />

            {/* Central Volumetric Light Bloom Halo */}
            <circle 
              cx="200" cy="200" r="128" 
              fill="url(#coreRadialBloom)" 
              opacity={0.9 + smoothAudio * 0.1} 
            />

            {/* Outer Perimeter Dashed Accent Ring & Micro-Track */}
            <circle cx="200" cy="200" r="147" fill="none" stroke={currentMetal.pinBorderColor} strokeWidth="0.6" strokeOpacity="0.5" />
            <circle 
              cx="200" cy="200" r="141" 
              fill="none" 
              stroke={activeGlowHex} 
              strokeWidth="1" 
              strokeDasharray="3 4" 
              strokeOpacity="0.85" 
            />

            {/* Outer Thin Broken Arc Accents */}
            <circle 
              cx="200" cy="200" r="133" 
              fill="none" 
              stroke={activeOuterArc} 
              strokeWidth="1.4" 
              strokeDasharray="25 90" 
              strokeDashoffset="12" 
              strokeOpacity="0.9" 
            />
            <circle 
              cx="200" cy="200" r="133" 
              fill="none" 
              stroke={activeOuterArc} 
              strokeWidth="1.4" 
              strokeDasharray="25 90" 
              strokeDashoffset="142" 
              strokeOpacity="0.9" 
            />

            {/* LAYER 4: MAIN 4-SEGMENT LUMINOUS NEON ARC RING */}
            <motion.g
              animate={{ rotate: [0, 360] }}
              transition={{ duration: isOverclocked ? 8 : 28, ease: "linear", repeat: Infinity }}
              style={{ transformOrigin: '200px 200px' }}
            >
              {/* Volumetric Deep Radial Bloom Layer */}
              <circle
                cx="200" cy="200" r="106"
                fill="none"
                stroke={activeDeepHex}
                strokeWidth="28"
                strokeDasharray="146 20"
                strokeDashoffset="10"
                strokeLinecap="butt"
                opacity="0.8"
                filter="url(#neonArcGlowFilter)"
              />

              {/* Main Glowing Arc Segments (R=106, Width=18) */}
              <circle
                cx="200" cy="200" r="106"
                fill="none"
                stroke={activeGlowHex}
                strokeWidth="18"
                strokeDasharray="146 20"
                strokeDashoffset="10"
                strokeLinecap="butt"
                filter="url(#neonArcGlowFilter)"
                opacity="1"
              />

              {/* Intense White/Bright Centerline Core */}
              <circle
                cx="200" cy="200" r="106"
                fill="none"
                stroke={activeCoreHex}
                strokeWidth="7"
                strokeDasharray="146 20"
                strokeDashoffset="10"
                strokeLinecap="butt"
                opacity="1"
              />

              {/* Framing Outer and Inner Precision Glowing Borders */}
              <circle 
                cx="200" cy="200" r="118" 
                fill="none" 
                stroke={activeGlowHex} 
                strokeWidth="1.8" 
                opacity="1" 
                filter="url(#neonArcGlowFilter)"
              />
              <circle 
                cx="200" cy="200" r="94" 
                fill="none" 
                stroke={activeGlowHex} 
                strokeWidth="1.8" 
                opacity="1" 
                filter="url(#neonArcGlowFilter)"
              />

              {/* 4 Diagonal Dark Crossbar Radial Dividers at 45°, 135°, 225°, 315° */}
              <g stroke="#030201" strokeWidth="4">
                <line x1="283.5" y1="116.5" x2="266.5" y2="133.5" />
                <line x1="283.5" y1="283.5" x2="266.5" y2="266.5" />
                <line x1="116.5" y1="283.5" x2="133.5" y2="266.5" />
                <line x1="116.5" y1="116.5" x2="133.5" y2="133.5" />
              </g>
            </motion.g>

            {/* LAYER 5: HIGH-DENSITY RADIAL RETICLE GAUGE TICKS */}
            <motion.g
              animate={{ rotate: [360, 0] }}
              transition={{ duration: isOverclocked ? 10 : 38, ease: "linear", repeat: Infinity }}
              style={{ transformOrigin: '200px 200px' }}
            >
              {ticks.map((_, i) => {
                const angle = (i * 360) / 60;
                const rad = (angle * Math.PI) / 180;
                const isMajor = i % 5 === 0;
                const innerR = isMajor ? 68 : 74;
                const outerR = 88;
                const x1 = 200 + innerR * Math.cos(rad);
                const y1 = 200 + innerR * Math.sin(rad);
                const x2 = 200 + outerR * Math.cos(rad);
                const y2 = 200 + outerR * Math.sin(rad);
                return (
                  <line
                    key={i}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={isMajor ? activeTickMajor : activeTickColor}
                    strokeWidth={isMajor ? "2.0" : "1.2"}
                    opacity={isMajor ? "1.0" : "0.85"}
                  />
                );
              })}
            </motion.g>

            {/* LAYER 6: INNER NEON GLOWING RING & BRILLIANT CORONA */}
            {/* Clean Hollow Dark Void Center */}
            <circle
              cx="200" cy="200" r="49"
              fill="#080706"
              stroke="#1a1714"
              strokeWidth="1.5"
            />

            <circle
              cx="200" cy="200" r="54"
              fill="none"
              stroke={activeDeepHex}
              strokeWidth="20"
              opacity="0.9"
              filter="url(#centerRingGlowFilter)"
            />

            {/* Inner Glowing Ring (Radius = 54, Width = 7) */}
            <circle
              cx="200" cy="200" r="54"
              fill="none"
              stroke={activeGlowHex}
              strokeWidth="7"
              filter="url(#centerRingGlowFilter)"
              opacity="1"
            />
            {/* Brilliant Core Centerline */}
            <circle
              cx="200" cy="200" r="54"
              fill="none"
              stroke={activeCoreHex}
              strokeWidth="3"
              opacity="1"
            />

            {/* Precision Framing Inner Borders */}
            <circle 
              cx="200" cy="200" r="58" 
              fill="none" 
              stroke={activeGlowHex} 
              strokeWidth="1.4" 
              opacity="1" 
            />
            <circle 
              cx="200" cy="200" r="50" 
              fill="none" 
              stroke={activeGlowHex} 
              strokeWidth="1.4" 
              opacity="1" 
            />

            {/* LAYER 7: REALISTIC 3D CONVEX CRYSTAL LENS DOME */}
            <circle
              cx="200" cy="200" r="153"
              fill="url(#glassReflectionGradient)"
              pointerEvents="none"
            />

            {/* Curved Specular Glare Arc on Upper Quadrant */}
            <path
              d="M 85 105 A 153 153 0 0 1 295 85 A 148 135 0 0 0 85 105 Z"
              fill="url(#crescentGlint)"
              opacity="0.85"
              pointerEvents="none"
            />

            {/* Lower Subtle Edge Refraction Highlight */}
            <path
              d="M 125 315 A 153 153 0 0 0 275 315 A 145 138 0 0 1 125 315 Z"
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
              backgroundColor: activeGlowHex, 
              boxShadow: `0 0 8px ${activeGlowHex}` 
            }} 
          />
          <span className="font-orbitron font-bold" style={{ color: activeGlowHex }}>
            {currentMetal.name.toUpperCase()}
          </span>
          <span className="text-stone-500">•</span>
          {isSpeakingActive ? (
            <span className="font-bold text-white">
              {isSpeaking ? 'AI RESPONDING' : 'LISTENING TO VOICE'}
            </span>
          ) : (
            <span style={{ color: activeGlowHex }}>{currentNeon.name.toUpperCase()}</span>
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
