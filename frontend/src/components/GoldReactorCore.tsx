import React, { useState, useEffect, useRef } from 'react';
import { soundManager } from '../utils/audio';
import { NeonColorId, getNeonTheme } from '../utils/neonThemes';
import { ShellMetalId, getShellMetalTheme } from '../utils/metalThemes';
import { getVoicePairForShell, interpolateHex } from '../utils/voiceColors';
import { VoiceState } from '../utils/voiceManager';
import { SteamVentingSystem } from './SteamVentingSystem';
import { ElectricSparkOverlay } from './ElectricSparkOverlay';

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

  const [steamBurst, setSteamBurst] = useState(false);

  // Trigger steam burst whenever overclock mode changes
  useEffect(() => {
    setSteamBurst(true);
    soundManager.playSteamHiss();
    const t = setTimeout(() => setSteamBurst(false), 1600);
    return () => clearTimeout(t);
  }, [isOverclocked, shellMetal]);

  // Active speaking states
  const isSpeaking = voiceState === 'speaking';
  const isUserSpeaking = voiceState === 'user_speaking';
  const isListening = voiceState === 'listening';
  const isVoiceActive = voiceState !== 'idle' && voiceState !== 'error';

  // Phase tracker for rapid dual-color snapping according to voice
  const [voicePhase, setVoicePhase] = useState(0);
  const smoothAudioRef = useRef(0);
  const phaseAccumulatorRef = useRef(0);

  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();

    const updateSmoothAudio = (now: number) => {
      const delta = (now - lastTime) / 1000;
      lastTime = now;

      const rawTarget = typeof voiceAudioLevel === 'number' ? Math.max(0, Math.min(1, voiceAudioLevel)) : 0;
      const target = rawTarget > 0
        ? rawTarget
        : (isSpeaking ? 0.35 : (isListening ? 0.05 : 0));

      const alpha = target > smoothAudioRef.current ? 0.45 : 0.20;
      smoothAudioRef.current = smoothAudioRef.current * (1 - alpha) + target * alpha;

      // Active voice utterance detection
      const isActivelySpeaking = isSpeaking || isUserSpeaking || smoothAudioRef.current > 0.035;

      if (isVoiceActive && isActivelySpeaking) {
        // Switch between the two paired colors rapidly in direct sync with voice syllables & volume
        const intensity = Math.max(smoothAudioRef.current, isSpeaking ? 0.35 : isUserSpeaking ? 0.40 : 0);
        const switchSpeed = 3.5 + intensity * 15.0; // 3.5Hz to 18.5Hz rapid syllable switching
        phaseAccumulatorRef.current += delta * switchSpeed;

        // Fast square-smooth sine wave oscillation: 0 (Color 1) <-> 1 (Color 2)
        const wave = Math.sin(phaseAccumulatorRef.current * Math.PI * 2);
        const phase = (wave + 1) / 2;
        setVoicePhase((prev) => (Math.abs(prev - phase) > 0.03 ? phase : prev));
      } else {
        phaseAccumulatorRef.current = 0;
        if (voicePhase !== 0) {
          setVoicePhase(0);
        }
      }

      animId = requestAnimationFrame(updateSmoothAudio);
    };

    animId = requestAnimationFrame(updateSmoothAudio);
    return () => cancelAnimationFrame(animId);
  }, [voiceAudioLevel, isSpeaking, isUserSpeaking, isListening, isVoiceActive, voicePhase]);

  // Color interpolation for voice reactivity
  const moltenGoldCore = isVoiceActive && voicePhase > 0
    ? interpolateHex(voicePair.color1Core, voicePair.color2Core, voicePhase)
    : (neonTheme === 'amber' ? '#fff494' : currentNeon.coreColor);

  const moltenGoldBody = isVoiceActive && voicePhase > 0
    ? interpolateHex(voicePair.color1Core, voicePair.color2Core, voicePhase)
    : (neonTheme === 'amber' ? '#ffca28' : currentNeon.coreColor);

  const thermalOrange = isVoiceActive && voicePhase > 0
    ? interpolateHex(voicePair.color1Hex, voicePair.color2Hex, voicePhase)
    : (neonTheme === 'amber' ? '#f97316' : currentNeon.glowColor);

  const thermalRedEdge = isVoiceActive && voicePhase > 0
    ? interpolateHex(voicePair.color1Glow, voicePair.color2Glow, voicePhase)
    : (neonTheme === 'amber' ? '#c2410c' : currentNeon.deepGlow);

  const activeTickColor = isVoiceActive && voicePhase > 0
    ? interpolateHex(voicePair.color1Hex, voicePair.color2Hex, voicePhase)
    : (neonTheme === 'amber' ? '#d97706' : currentNeon.tickColor);

  const handleClick = (e: React.MouseEvent) => {
    if (e.shiftKey && onCycleTheme) {
      soundManager.playColorShift();
      onCycleTheme();
    } else {
      setSteamBurst(true);
      soundManager.playSteamHiss();
      setTimeout(() => setSteamBurst(false), 1600);
      onToggleOverclock();
    }
  };

  // 8 Celestial Beacon nodes on the outer track (R=127)
  // Angles: 0° (East/Right), 45°, 90° (South/Bottom), 135°, 180° (West/Left), 225°, 270° (North/Top), 315°
  const beaconAngles = [0, 45, 90, 135, 180, 225, 270, 315];

  // Segmented arcs geometry (R=104, circumference ~653.45)
  // 4 glowing plasma arcs separated by dark gaps
  const plasmaArcDash = "138 25.36";
  const plasmaArcOffset = "12";

  return (
    <div className="relative flex items-center justify-center select-none">
      {/* Live Particle Steam Venting System */}
      <SteamVentingSystem isVenting={steamBurst} isOverclocked={isOverclocked} />

      {/* Main Core Interactive Container */}
      <div 
        onClick={handleClick}
        className="relative w-[280px] h-[280px] sm:w-[300px] sm:h-[300px] cursor-pointer group flex items-center justify-center transition-transform duration-300 z-10"
      >
        {/* Realistic Dielectric Electric Arc Discharge Sparks */}
        <ElectricSparkOverlay 
          isOverclocked={isOverclocked} 
          neonGlowColor={currentNeon.glowColor}
        />

        <svg 
          viewBox="54 54 292 292" 
          className="w-full h-full drop-shadow-[0_0_40px_rgba(245,158,11,0.5)]"
        >
          <defs>
            {/* Interior Glass Chamber Clipping Mask (R=146 fits exactly inside the circular socket) */}
            <clipPath id="innerChamberClip">
              <circle cx="200" cy="200" r="146" />
            </clipPath>

            {/* Deep Obsidian / Gunmetal Bevel Radial Gradient */}
            <radialGradient id="coreBasinDarkGrad" cx="50%" cy="50%" r="72%">
              <stop offset="0%" stopColor="#020202" />
              <stop offset="38%" stopColor="#080706" />
              <stop offset="68%" stopColor="#12100e" />
              <stop offset="85%" stopColor="#221e1a" />
              <stop offset="93%" stopColor="#2d2722" />
              <stop offset="98%" stopColor="#181512" />
              <stop offset="100%" stopColor="#0a0807" />
            </radialGradient>

            {/* Stepped Machined Gunmetal Outer Bevel Sheen */}
            <linearGradient id="bezelDirectionalSheen" x1="15%" y1="10%" x2="85%" y2="90%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.32" />
              <stop offset="25%" stopColor="#ffffff" stopOpacity="0.04" />
              <stop offset="55%" stopColor="#000000" stopOpacity="0.8" />
              <stop offset="80%" stopColor="#ffffff" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0.22" />
            </linearGradient>

            {/* Grand Thermal Blackbody Bloom Filter */}
            <filter id="coreGrandBloom" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="sharpGlow" />
              <feGaussianBlur in="SourceGraphic" stdDeviation="6.5" result="mediumGlow" />
              <feGaussianBlur in="SourceGraphic" stdDeviation="12.0" result="wideBloom" />
              <feMerge>
                <feMergeNode in="wideBloom" />
                <feMergeNode in="mediumGlow" />
                <feMergeNode in="sharpGlow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Spark Beacon Bloom Filter */}
            <filter id="beaconBloom" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="2.0" result="sharp" />
              <feGaussianBlur in="SourceGraphic" stdDeviation="4.5" result="spread" />
              <feMerge>
                <feMergeNode in="spread" />
                <feMergeNode in="sharp" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Central Singularity Coronal Inward Bleed */}
            <radialGradient id="singularityCoronalBleed" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#000000" stopOpacity="1" />
              <stop offset="72%" stopColor="#000000" stopOpacity="1" />
              <stop offset="88%" stopColor="#1a0901" stopOpacity="0.95" />
              <stop offset="95%" stopColor={thermalOrange} stopOpacity="0.5" />
              <stop offset="100%" stopColor={moltenGoldBody} stopOpacity="0.95" />
            </radialGradient>

            {/* Frutiger Aero Upper Convex Lens Specular Crescent Glare */}
            <linearGradient id="frutigerAeroUpperGlare" x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
              <stop offset="28%" stopColor="#ffffff" stopOpacity="0.22" />
              <stop offset="60%" stopColor="#ffffff" stopOpacity="0.03" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0.0" />
            </linearGradient>

            {/* Frutiger Aero Crystal Rim Bevel Refraction */}
            <radialGradient id="frutigerAeroRimRefract" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.0" />
              <stop offset="85%" stopColor="#ffffff" stopOpacity="0.0" />
              <stop offset="93%" stopColor="#ffffff" stopOpacity="0.18" />
              <stop offset="98%" stopColor="#ffffff" stopOpacity="0.40" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.30" />
            </radialGradient>

            {/* Bottom Ambient Caustic Bounce Light */}
            <linearGradient id="bottomCausticGrad" x1="50%" y1="100%" x2="50%" y2="0%">
              <stop offset="0%" stopColor={moltenGoldBody} stopOpacity="0.38" />
              <stop offset="42%" stopColor={thermalOrange} stopOpacity="0.14" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.0" />
            </linearGradient>

            {/* Chamber Wall Glass Reflection Wings */}
            <linearGradient id="chamberWallReflectLeft" x1="0%" y1="50%" x2="100%" y2="50%">
              <stop offset="0%" stopColor={thermalOrange} stopOpacity="0.35" />
              <stop offset="40%" stopColor={moltenGoldBody} stopOpacity="0.15" />
              <stop offset="80%" stopColor="#000000" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="chamberWallReflectRight" x1="100%" y1="50%" x2="0%" y2="50%">
              <stop offset="0%" stopColor={thermalOrange} stopOpacity="0.35" />
              <stop offset="40%" stopColor={moltenGoldBody} stopOpacity="0.15" />
              <stop offset="80%" stopColor="#000000" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* ========================================================= */}
          {/* APERTURE BOUNDARY & COLLAR LIP (R=146)                   */}
          {/* ========================================================= */}
          <circle cx="200" cy="200" r="146" fill="none" stroke="#1c1409" strokeWidth="2.5" />
          <circle cx="200" cy="200" r="145" fill="none" stroke="#b4731e" strokeWidth="1.0" strokeOpacity="0.5" />

          {/* ========================================================= */}
          {/* INTERIOR SKEUOMORPHIC & FRUTIGER AERO CORE CHAMBER        */}
          {/* Matches uploaded reference image exactly                 */}
          {/* ========================================================= */}
          <g clipPath="url(#innerChamberClip)">
            {/* 1. Deep Obsidian / Gunmetal Bevel Basin Floor */}
            <circle cx="200" cy="200" r="146" fill="url(#coreBasinDarkGrad)" />

            {/* Directional Machined Specular Sheen */}
            <circle cx="200" cy="200" r="146" fill="url(#bezelDirectionalSheen)" />

            {/* Stepped Machined Concentric Bevel Grooves */}
            <circle cx="200" cy="200" r="142" fill="none" stroke="#2d2822" strokeWidth="1.5" />
            <circle cx="200" cy="200" r="136" fill="none" stroke="#15120f" strokeWidth="2.0" />
            <circle cx="200" cy="200" r="134" fill="none" stroke="#3d342a" strokeWidth="0.8" strokeOpacity="0.7" />

            {/* Chamber Wall Curved Glass Reflection Wings */}
            <path d="M 54 135 C 50 178, 50 222, 54 265 L 80 252 C 76 218, 76 182, 80 148 Z" fill="url(#chamberWallReflectLeft)" />
            <path d="M 346 135 C 350 178, 350 222, 346 265 L 320 252 C 324 218, 324 182, 320 148 Z" fill="url(#chamberWallReflectRight)" />

            {/* 2. Outer Celestial Beacon Track (R=127) */}
            <circle cx="200" cy="200" r="129" fill="none" stroke="#522408" strokeWidth="0.8" opacity="0.65" />
            <circle cx="200" cy="200" r="127" fill="none" stroke={thermalOrange} strokeWidth="1.4" opacity="0.85" />
            <circle cx="200" cy="200" r="125" fill="none" stroke="#361704" strokeWidth="0.8" opacity="0.65" />

            {/* 3. Outer Astrolabe Degree Ticks & Micro Dial (R=123 to 115) */}
            <g
              key={`astrolabe-dial-${isOverclocked ? 'fast' : 'slow'}`}
              style={{
                transformOrigin: '200px 200px',
                animation: `spinClockwise ${isOverclocked ? 0.9 : 60}s linear infinite`,
                willChange: 'transform',
              }}
            >
              {/* Fine Circular Guidelines */}
              <circle cx="200" cy="200" r="123" fill="none" stroke={activeTickColor} strokeWidth="0.6" strokeOpacity="0.4" />
              <circle cx="200" cy="200" r="115" fill="none" stroke={activeTickColor} strokeWidth="0.6" strokeOpacity="0.4" />

              {/* 72 Radial Graduation Ticks */}
              {Array.from({ length: 72 }).map((_, i) => {
                const angle = (i * 360) / 72;
                const rad = (angle * Math.PI) / 180;
                const isCardinal = i % 18 === 0;
                const isMajor = i % 9 === 0;
                const innerR = isCardinal ? 114 : isMajor ? 116 : 118;
                const outerR = 123;
                const x1 = 200 + innerR * Math.cos(rad);
                const y1 = 200 + innerR * Math.sin(rad);
                const x2 = 200 + outerR * Math.cos(rad);
                const y2 = 200 + outerR * Math.sin(rad);
                return (
                  <line
                    key={`astro-tick-${i}`}
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke={isCardinal ? moltenGoldBody : isMajor ? thermalOrange : activeTickColor}
                    strokeWidth={isCardinal ? '1.5' : isMajor ? '1.0' : '0.6'}
                    opacity={isCardinal ? '0.95' : isMajor ? '0.75' : '0.45'}
                  />
                );
              })}

              {/* 36 Micro Luminous Celestial Dots at R=116 */}
              {Array.from({ length: 36 }).map((_, i) => {
                const angle = (i * 360) / 36 + 5;
                const rad = (angle * Math.PI) / 180;
                const x = 200 + 116 * Math.cos(rad);
                const y = 200 + 116 * Math.sin(rad);
                return (
                  <circle
                    key={`micro-dot-${i}`}
                    cx={x} cy={y} r="0.75"
                    fill={moltenGoldCore}
                    opacity="0.65"
                  />
                );
              })}
            </g>

            {/* 4. Segmented Golden Plasma Arc Ring (R=104) */}
            <g
              key={`plasma-arcs-${isOverclocked ? 'fast' : 'slow'}`}
              style={{
                transformOrigin: '200px 200px',
                animation: `spinCounterClockwise ${isOverclocked ? 0.75 : 45}s linear infinite`,
                willChange: 'transform',
              }}
            >
              {/* Outer Thermal Glow on Arcs */}
              <circle
                cx="200" cy="200" r="104"
                fill="none"
                stroke={thermalOrange}
                strokeWidth="5.5"
                strokeDasharray={plasmaArcDash}
                strokeDashoffset={plasmaArcOffset}
                strokeLinecap="round"
                opacity="0.75"
                filter="url(#beaconBloom)"
              />
              {/* Main Golden Arc Plasma Body */}
              <circle
                cx="200" cy="200" r="104"
                fill="none"
                stroke={moltenGoldBody}
                strokeWidth="3.2"
                strokeDasharray={plasmaArcDash}
                strokeDashoffset={plasmaArcOffset}
                strokeLinecap="round"
                opacity="0.95"
              />
              {/* White-Hot Core Plasma Filament */}
              <circle
                cx="200" cy="200" r="104"
                fill="none"
                stroke={moltenGoldCore}
                strokeWidth="1.4"
                strokeDasharray={plasmaArcDash}
                strokeDashoffset={plasmaArcOffset}
                strokeLinecap="round"
                opacity="1.0"
              />
              {/* 4 Arc Interstitial Node Beads */}
              {[0, 90, 180, 270].map((angle, idx) => {
                const rad = (angle * Math.PI) / 180;
                const x = 200 + 104 * Math.cos(rad);
                const y = 200 + 104 * Math.sin(rad);
                return (
                  <g key={`arc-gap-node-${idx}`}>
                    <circle cx={x} cy={y} r="2.8" fill={thermalOrange} opacity="0.6" filter="url(#beaconBloom)" />
                    <circle cx={x} cy={y} r="1.5" fill={moltenGoldCore} />
                  </g>
                );
              })}
            </g>

            {/* 5. Middle Concentric Guide & Conduit Ring (R=92) */}
            <circle cx="200" cy="200" r="92" fill="none" stroke={thermalOrange} strokeWidth="1.4" opacity="0.85" />
            <circle cx="200" cy="200" r="86" fill="none" stroke={activeTickColor} strokeWidth="0.8" strokeDasharray="3 3" opacity="0.55" />

            {/* 8 Secondary Nodal Spark Beads at R=92 (offset by 22.5°) */}
            {[22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5].map((angle, idx) => {
              const rad = (angle * Math.PI) / 180;
              const x = 200 + 92 * Math.cos(rad);
              const y = 200 + 92 * Math.sin(rad);
              return (
                <g key={`secondary-node-${idx}`}>
                  <circle cx={x} cy={y} r="3.2" fill={thermalOrange} opacity="0.6" filter="url(#beaconBloom)" />
                  <circle cx={x} cy={y} r="1.8" fill={moltenGoldBody} />
                  <circle cx={x} cy={y} r="1.0" fill="#ffffff" />
                </g>
              );
            })}

            {/* 6. Inner Instrument Chrono Dial (R=82 to 74) */}
            <g
              key={`chrono-inner-${isOverclocked ? 'fast' : 'slow'}`}
              style={{
                transformOrigin: '200px 200px',
                animation: `spinClockwise ${isOverclocked ? 0.6 : 38}s linear infinite`,
                willChange: 'transform',
              }}
            >
              <circle cx="200" cy="200" r="81" fill="none" stroke={activeTickColor} strokeWidth="0.8" strokeOpacity="0.5" />
              <circle cx="200" cy="200" r="74" fill="none" stroke={thermalOrange} strokeWidth="1.0" strokeOpacity="0.7" />

              {Array.from({ length: 48 }).map((_, i) => {
                const angle = (i * 360) / 48;
                const rad = (angle * Math.PI) / 180;
                const isMajor = i % 6 === 0;
                const innerR = isMajor ? 75 : 77;
                const outerR = 80.5;
                const x1 = 200 + innerR * Math.cos(rad);
                const y1 = 200 + innerR * Math.sin(rad);
                const x2 = 200 + outerR * Math.cos(rad);
                const y2 = 200 + outerR * Math.sin(rad);
                return (
                  <line
                    key={`chrono-tick-${i}`}
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke={isMajor ? moltenGoldBody : activeTickColor}
                    strokeWidth={isMajor ? '1.2' : '0.6'}
                    opacity={isMajor ? '0.9' : '0.5'}
                  />
                );
              })}
            </g>

            {/* 7. THE SIGNATURE SUPERHEATED MOLTEN GOLD TOROID (R=60, width 26px) */}
            {/* Exactly matching uploaded reference image centerpiece */}
            <g>
              {/* Outermost Optical Bloom */}
              <circle
                cx="200" cy="200" r="60"
                fill="none"
                stroke={thermalRedEdge}
                strokeWidth="32"
                opacity="0.80"
                filter="url(#coreGrandBloom)"
              />

              {/* Layer 1: Thermodynamic Red/Amber Blackbody Base */}
              <circle
                cx="200" cy="200" r="60"
                fill="none"
                stroke={thermalRedEdge}
                strokeWidth="28"
                opacity="0.92"
              />

              {/* Layer 2: Blazing Hot Orange Plasma Mantle */}
              <circle
                cx="200" cy="200" r="60"
                fill="none"
                stroke={thermalOrange}
                strokeWidth="22"
                opacity="0.96"
              />

              {/* Layer 3: Solid 24K Liquid Gold Toroid */}
              <circle
                cx="200" cy="200" r="60"
                fill="none"
                stroke={moltenGoldBody}
                strokeWidth="15"
                opacity="1.0"
              />

              {/* Layer 4: Incandescent Hot Yellow Solar Core */}
              <circle
                cx="200" cy="200" r="60"
                fill="none"
                stroke={moltenGoldCore}
                strokeWidth="8"
                opacity="0.98"
              />

              {/* Layer 5: Blinding White-Hot Singularity Filament */}
              <circle
                cx="200" cy="200" r="60"
                fill="none"
                stroke="#ffffff"
                strokeWidth="3.0"
                opacity="1.0"
              />

              {/* Layer 6: Razor-Sharp Coronal Inner Lip (R=47.5) Kissing Black Void */}
              <circle
                cx="200" cy="200" r="47.5"
                fill="none"
                stroke={moltenGoldCore}
                strokeWidth="2.2"
                opacity="1.0"
              />
              <circle
                cx="200" cy="200" r="46.5"
                fill="none"
                stroke="#ffffff"
                strokeWidth="1.0"
                opacity="0.95"
              />

              {/* Layer 7: Outer Confinement Rim (R=73) */}
              <circle
                cx="200" cy="200" r="73"
                fill="none"
                stroke={thermalOrange}
                strokeWidth="1.2"
                opacity="0.85"
              />
            </g>

            {/* 8. THE CENTRAL OBSIDIAN SINGULARITY VOID (R < 46) */}
            {/* Pure deep black cosmic event horizon with inner coronal bleed */}
            <circle cx="200" cy="200" r="46" fill="#000000" />
            <circle cx="200" cy="200" r="46" fill="url(#singularityCoronalBleed)" />
            <circle cx="200" cy="200" r="45.5" fill="none" stroke="#221104" strokeWidth="1.2" />

            {/* 9. THE 8 GLOWING CELESTIAL BEACON NODES (R=127) */}
            {/* Rendered on top of dials to cast bright spark light */}
            {beaconAngles.map((angle, idx) => {
              const rad = (angle * Math.PI) / 180;
              const x = 200 + 127 * Math.cos(rad);
              const y = 200 + 127 * Math.sin(rad);
              const isCardinal = angle % 90 === 0;

              return (
                <g key={`beacon-spark-${idx}`}>
                  {/* Broad Thermal Spark Bloom */}
                  <circle
                    cx={x} cy={y}
                    r={isCardinal ? 7.5 : 5.5}
                    fill={thermalOrange}
                    opacity="0.85"
                    filter="url(#beaconBloom)"
                  />
                  {/* Golden Corona */}
                  <circle
                    cx={x} cy={y}
                    r={isCardinal ? 4.2 : 3.2}
                    fill={moltenGoldBody}
                  />
                  {/* Blinding White-Hot Center Jewel */}
                  <circle
                    cx={x} cy={y}
                    r={isCardinal ? 2.2 : 1.6}
                    fill="#ffffff"
                  />
                  {/* 4-Point Micro Specular Glint Cross on Cardinal Beacons */}
                  {isCardinal && (
                    <>
                      <line x1={x - 6} y1={y} x2={x + 6} y2={y} stroke="#ffffff" strokeWidth="0.8" strokeOpacity="0.9" />
                      <line x1={x} y1={y - 6} x2={x} y2={y + 6} stroke="#ffffff" strokeWidth="0.8" strokeOpacity="0.9" />
                    </>
                  )}
                </g>
              );
            })}

            {/* ========================================================= */}
            {/* 10. SKEUOMORPHIC & FRUTIGER AERO GLASS DOME OPTICS OVERLAY */}
            {/* ========================================================= */}
            {/* Convex Upper Spherical Dome Specular Crescent Glare */}
            <path
              d="M 80 135 C 84 75, 128 42, 200 42 C 272 42, 316 75, 320 135 C 280 98, 244 84, 200 84 C 156 84, 120 98, 80 135 Z"
              fill="url(#frutigerAeroUpperGlare)"
              opacity="0.92"
              pointerEvents="none"
            />

            {/* Secondary Soft Convex Glass Ambient Glint */}
            <ellipse
              cx="200" cy="90"
              rx="85" ry="30"
              fill="#ffffff"
              opacity="0.09"
              pointerEvents="none"
            />

            {/* Curved Sapphire Crystal Rim Bevel Refraction Ring */}
            <circle
              cx="200" cy="200" r="145"
              fill="url(#frutigerAeroRimRefract)"
              pointerEvents="none"
            />

            {/* Bottom Ambient Caustic Bounce Light Crescent */}
            <path
              d="M 125 318 C 160 334, 240 334, 275 318 C 255 328, 222 332, 200 332 C 178 332, 145 328, 125 318 Z"
              fill="url(#bottomCausticGrad)"
              pointerEvents="none"
            />
          </g>
        </svg>

        {/* Hover Status Pill (BLANKA font applied via font-tech) */}
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
          {isVoiceActive ? (
            <span className="font-bold text-white">
              {isSpeaking ? 'AI RESPONDING' : 'VOICE MODE ACTIVE'}
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
