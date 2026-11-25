import React, { useEffect, useState, useRef } from 'react';
import { NeonColorId, getNeonTheme } from '../utils/neonThemes';
import { ShellMetalId, getShellMetalTheme } from '../utils/metalThemes';
import { VoiceState } from '../utils/voiceManager';
import { soundManager } from '../utils/audio';

interface StatorMagnetVisualizerProps {
  side: 'left' | 'right';
  neonTheme?: NeonColorId;
  shellMetal?: ShellMetalId;
  voiceState?: VoiceState;
  audioLevel?: number;
  isOverclocked?: boolean;
}

export const StatorMagnetVisualizer: React.FC<StatorMagnetVisualizerProps> = ({
  side,
  neonTheme = 'amber',
  shellMetal = 'gold',
  voiceState = 'idle',
  audioLevel = 0,
  isOverclocked = false,
}) => {
  const currentNeon = getNeonTheme(neonTheme);
  const currentMetal = getShellMetalTheme(shellMetal);

  const isSpeaking = voiceState === 'speaking';
  const isListening = voiceState === 'listening';
  const isUserSpeaking = voiceState === 'user_speaking';
  const isSpeakingActive = isSpeaking || isListening || isUserSpeaking;

  const totalRows = 64; // 64 segmented hot metal alloy bars stacking vertically

  const [currentLevel, setCurrentLevel] = useState<number>(0.22);
  const [peakLevel, setPeakLevel] = useState<number>(0.26);
  const [isSurging, setIsSurging] = useState<boolean>(false);

  const currentLevelRef = useRef(0.22);
  const peakLevelRef = useRef(0.26);
  const smoothAudioRef = useRef(0.22);
  const peakRef = useRef(0.26);
  const surgeRef = useRef(0.0);
  const lastTimeRef = useRef(performance.now());

  // Interactive click surge: Turns visualizer into glowing molten 24K hot metal shockwave
  const handleTriggerSurge = () => {
    soundManager.playClick();
    surgeRef.current = 1.0;
    setIsSurging(true);
    setTimeout(() => setIsSurging(false), 2400);
  };

  useEffect(() => {
    let animId: number;

    const updateVisualizer = () => {
      const now = performance.now();
      const delta = Math.min(0.1, (now - lastTimeRef.current) / 1000);
      lastTimeRef.current = now;

      // Click surge decay
      if (surgeRef.current > 0.005) {
        surgeRef.current = Math.max(0.0, surgeRef.current - delta * 0.48);
      } else {
        surgeRef.current = 0.0;
      }

      // STRICT SYNCHRONIZATION: Left & Right share 100% identical phase (0 offset)
      let rawAudio = Math.max(0.0, Math.min(1.0, (audioLevel || 0) * 1.5));

      let targetAudio = rawAudio;
      if (surgeRef.current > 0.01) {
        targetAudio = Math.max(targetAudio, surgeRef.current);
      } else if (isSpeaking) {
        targetAudio = Math.max(targetAudio, 0.48 + Math.sin(now * 0.008) * 0.38);
      } else if (rawAudio < 0.04) {
        // Idle synchronized breathing: Both pillars rise and lower IN UNISON
        const t = now * 0.0022;
        targetAudio = 0.20 + Math.sin(t * 1.6) * 0.12 + (isOverclocked ? 0.22 : 0);
      }

      // Attack & decay ballistics matching analog thermal VU meter
      const attack = 0.75;
      const decay = 0.15;
      const alpha = targetAudio > smoothAudioRef.current ? attack : decay;
      smoothAudioRef.current = smoothAudioRef.current * (1 - alpha) + targetAudio * alpha;

      const dynamicHeight = Math.max(0.0, Math.min(1.0, smoothAudioRef.current));

      // Peak-hold floating needle with gravity drop
      if (dynamicHeight >= peakRef.current) {
        peakRef.current = dynamicHeight;
      } else {
        peakRef.current = Math.max(0.0, peakRef.current - delta * 0.32);
      }

      if (Math.abs(dynamicHeight - currentLevelRef.current) > 0.004) {
        currentLevelRef.current = dynamicHeight;
        setCurrentLevel(dynamicHeight);
      }

      if (Math.abs(peakRef.current - peakLevelRef.current) > 0.004) {
        peakLevelRef.current = peakRef.current;
        setPeakLevel(peakRef.current);
      }

      animId = requestAnimationFrame(updateVisualizer);
    };

    animId = requestAnimationFrame(updateVisualizer);
    return () => cancelAnimationFrame(animId);
  }, [audioLevel, isSpeaking, isListening, isUserSpeaking, isSpeakingActive, isOverclocked]);

  // SVG coordinate dimensions
  const svgWidth = 40;
  const svgHeight = 600;
  const topPad = 12;
  const botPad = 10;
  const meterHeight = svgHeight - topPad - botPad;
  const segmentStep = meterHeight / totalRows;
  const segmentHeight = segmentStep - 2.0;
  const segmentWidth = 32;
  const segmentX = (svgWidth - segmentWidth) / 2;

  return (
    <div 
      onClick={handleTriggerSurge}
      className="relative w-full h-full cursor-pointer flex items-center justify-center select-none group transition-transform duration-300 active:scale-[0.985]"
      title="Hot Metal Induction Visualizer // Click to trigger Thermal Power Surge"
    >
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="w-full h-full drop-shadow-[0_0_18px_rgba(0,0,0,0.95)]"
        preserveAspectRatio="none"
      >
        <defs>
          {/* Authentic Blackbody Thermal Glow (Incandescent Hot Metal Bloom) */}
          <filter id={`hotMetalBloom-${side}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.6" result="heatBlur" />
            <feColorMatrix
              in="heatBlur"
              type="matrix"
              values="1.2 0 0 0 0.1  0 0.7 0 0 0  0 0 0.1 0 0  0 0 0 2.2 0"
              result="emberGlow"
            />
            <feMerge>
              <feMergeNode in="emberGlow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Peak Needle Incandescent Bloom */}
          <filter id={`peakBloom-${side}`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* 1. Low Tier: Fiery Hot Red-Orange Molten Steel (0% - 38% Height) */}
          <linearGradient id={`hotMetalLow-${side}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#7c2d12" />
            <stop offset="18%" stopColor="#c2410c" />
            <stop offset="50%" stopColor="#ea580c" />
            <stop offset="82%" stopColor="#c2410c" />
            <stop offset="100%" stopColor="#7c2d12" />
          </linearGradient>

          {/* 2. Mid Tier: Blazing Hot Orange to Golden Amber (39% - 75% Height) */}
          <linearGradient id={`hotMetalMid-${side}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#9a3412" />
            <stop offset="16%" stopColor="#ea580c" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="84%" stopColor="#ea580c" />
            <stop offset="100%" stopColor="#9a3412" />
          </linearGradient>

          {/* 3. High Tier: Incandescent Hot Yellow with White-Hot Core (76% - 100% Height) */}
          <linearGradient id={`hotMetalHigh-${side}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#c2410c" />
            <stop offset="18%" stopColor="#f97316" />
            <stop offset="42%" stopColor="#fbbf24" />
            <stop offset="50%" stopColor="#fef08a" />
            <stop offset="58%" stopColor="#fbbf24" />
            <stop offset="82%" stopColor="#f97316" />
            <stop offset="100%" stopColor="#c2410c" />
          </linearGradient>

          {/* Unlit Segment: Dark Cold Tungsten Ingot in Crucible Socket */}
          <linearGradient id={`coldMetalGrad-${side}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0d0803" />
            <stop offset="25%" stopColor="#1c1106" />
            <stop offset="50%" stopColor="#241608" />
            <stop offset="75%" stopColor="#1c1106" />
            <stop offset="100%" stopColor="#0d0803" />
          </linearGradient>

          {/* Deep Recessed Pillar Slot Groove */}
          <linearGradient id={`pillarSlotGrad-${side}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#030201" stopOpacity="0.98" />
            <stop offset="12%" stopColor="#120b04" stopOpacity="0.85" />
            <stop offset="88%" stopColor="#120b04" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#030201" stopOpacity="0.98" />
          </linearGradient>

          {/* Subtle Heavy Quartz Glass Column Refraction (NO harsh plastic lines) */}
          <linearGradient id={`glassRefraction-${side}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.10" />
            <stop offset="15%" stopColor="#ffffff" stopOpacity="0.03" />
            <stop offset="50%" stopColor="#ffffff" stopOpacity="0.0" />
            <stop offset="85%" stopColor="#ffffff" stopOpacity="0.02" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.08" />
          </linearGradient>
        </defs>

        {/* 1. Recessed Heavy Bronze Crucible Channel */}
        <rect
          x="2"
          y="2"
          width={svgWidth - 4}
          height={svgHeight - 4}
          rx="3.5"
          fill={`url(#pillarSlotGrad-${side})`}
          stroke="#382109"
          strokeWidth="1.2"
        />

        {/* 2. 64 Segmented Hot Metal Ingot Bars */}
        <g>
          {Array.from({ length: totalRows }).map((_, rowIdx) => {
            const rowRatio = (rowIdx + 1) / totalRows;
            const y = svgHeight - botPad - (rowIdx + 1) * segmentStep;

            const isLit = currentLevel >= rowRatio;
            const isPeak = Math.abs(peakLevel - rowRatio) < 1.4 / totalRows;

            // Thermodynamic Temperature Gradient: Orange (bottom) -> Amber -> Molten Yellow (top)
            let metalFill = `url(#hotMetalLow-${side})`;
            let coreColor = '#fb923c'; // hot orange core
            let coreOpacity = 0.55;

            if (rowRatio > 0.72) {
              metalFill = `url(#hotMetalHigh-${side})`;
              coreColor = '#ffffff'; // white-hot plasma core
              coreOpacity = 0.90;
            } else if (rowRatio > 0.36) {
              metalFill = `url(#hotMetalMid-${side})`;
              coreColor = '#fef08a'; // incandescent yellow core
              coreOpacity = 0.75;
            }

            return (
              <g key={rowIdx}>
                {/* A. Machined Tungsten Socket */}
                <rect
                  x={segmentX}
                  y={y}
                  width={segmentWidth}
                  height={segmentHeight}
                  rx="1.8"
                  fill="#0a0501"
                  stroke={isLit ? '#5a2d0c' : '#221406'}
                  strokeWidth="0.6"
                />

                {/* B. Hot Metal Ingot Body */}
                <rect
                  x={segmentX + 0.6}
                  y={y + 0.5}
                  width={segmentWidth - 1.2}
                  height={segmentHeight - 1.0}
                  rx="1.4"
                  fill={isLit ? metalFill : `url(#coldMetalGrad-${side})`}
                  opacity={isLit ? 0.98 : 0.40}
                  filter={isLit ? `url(#hotMetalBloom-${side})` : undefined}
                />

                {/* C. Internal Thermal Radiance Core (Incandescent center heat) */}
                {isLit && (
                  <rect
                    x={segmentX + 4}
                    y={y + 0.8}
                    width={segmentWidth - 8}
                    height={segmentHeight - 1.6}
                    rx="1.0"
                    fill={coreColor}
                    opacity={coreOpacity}
                  />
                )}

                {/* D. Subtle Chamfered Metallic Edge Catch (Realistic metal gleam, not plastic) */}
                {isLit && (
                  <line
                    x1={segmentX + 2}
                    y1={y + 0.6}
                    x2={segmentX + segmentWidth - 2}
                    y2={y + 0.6}
                    stroke="rgba(255, 245, 220, 0.45)"
                    strokeWidth="0.5"
                    strokeLinecap="round"
                  />
                )}

                {/* E. Floating White-Hot Peak Hold Indicator */}
                {!isLit && isPeak && (
                  <g filter={`url(#peakBloom-${side})`}>
                    <rect
                      x={segmentX + 1}
                      y={y + 0.5}
                      width={segmentWidth - 2}
                      height={segmentHeight - 1.0}
                      rx="1.4"
                      fill="#ea580c"
                      stroke="#fbbf24"
                      strokeWidth="0.8"
                    />
                    <rect
                      x={segmentX + 3}
                      y={y + 0.8}
                      width={segmentWidth - 6}
                      height={segmentHeight - 1.6}
                      rx="1.0"
                      fill="#fffbeb"
                      opacity="0.95"
                    />
                  </g>
                )}
              </g>
            );
          })}
        </g>

        {/* 3. Heavy Refractory Quartz Glass Column Sleeve (Soft Glass Refraction) */}
        <rect
          x="3"
          y="3"
          width={svgWidth - 6}
          height={svgHeight - 6}
          rx="3.0"
          fill={`url(#glassRefraction-${side})`}
          pointerEvents="none"
          stroke="rgba(217, 119, 6, 0.28)"
          strokeWidth="0.8"
        />

        {/* 4. Polished Bronze Rim Accents (Top & Bottom Caps) */}
        <line
          x1="5"
          y1="4"
          x2={svgWidth - 5}
          y2="4"
          stroke="rgba(251, 191, 36, 0.45)"
          strokeWidth="1.0"
          strokeLinecap="round"
          pointerEvents="none"
        />
        <line
          x1="5"
          y1={svgHeight - 4}
          x2={svgWidth - 5}
          y2={svgHeight - 4}
          stroke="rgba(251, 191, 36, 0.45)"
          strokeWidth="1.0"
          strokeLinecap="round"
          pointerEvents="none"
        />
      </svg>
    </div>
  );
};
