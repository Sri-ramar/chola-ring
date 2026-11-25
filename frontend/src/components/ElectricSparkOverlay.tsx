import React, { useEffect, useRef } from 'react';
import { soundManager } from '../utils/audio';

interface ElectricSparkOverlayProps {
  isOverclocked: boolean;
  neonGlowColor?: string;
}

interface SparkParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

interface LightningArc {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  curveFactor: number;
  frameCounter: number;
  durationFrames: number; // 60 frames = 1.0 second
  glowColor: string;
}

export const ElectricSparkOverlay: React.FC<ElectricSparkOverlayProps> = ({
  isOverclocked,
  neonGlowColor = '#38bdf8',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isOverclockedRef = useRef(isOverclocked);
  const activeArcsRef = useRef<LightningArc[]>([]);
  const sparkParticlesRef = useRef<SparkParticle[]>([]);

  useEffect(() => {
    isOverclockedRef.current = isOverclocked;
  }, [isOverclocked]);

  // Generates non-linear, curving fractal electric arc points
  const generateCurvedLightning = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    curveOffset: number
  ) => {
    const points: { x: number; y: number }[] = [];
    const segments = 12; // High resolution non-linear path

    const midX = (x1 + x2) / 2 + Math.cos(curveOffset) * 22;
    const midY = (y1 + y2) / 2 + Math.sin(curveOffset) * 22;

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      // Quadratic bezier base curve
      const bx = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * midX + t * t * x2;
      const by = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * midY + t * t * y2;

      // Chaotic high-voltage fractal displacement jitter
      const jitter = (Math.random() - 0.5) * 7.0 * (1 - Math.abs(t - 0.5) * 0.8);
      const perpAngle = Math.atan2(y2 - y1, x2 - x1) + Math.PI / 2;

      points.push({
        x: bx + Math.cos(perpAngle) * jitter,
        y: by + Math.sin(perpAngle) * jitter
      });
    }

    return points;
  };

  // Trigger 1.0-second high-voltage electric discharge
  useEffect(() => {
    if (!isOverclocked) return;

    let timer: NodeJS.Timeout;

    const trigger1SecArc = () => {
      if (!isOverclockedRef.current) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      // Random non-linear arc endpoints at arbitrary angles
      const radiusOuter = 95 + Math.random() * 25;
      const radiusInner = 35 + Math.random() * 30;

      const angle1 = Math.random() * Math.PI * 2;
      // Non-linear, arbitrary angle offset
      const angle2 = angle1 + (Math.random() * 1.8 + 0.6) * (Math.random() > 0.5 ? 1 : -1);

      const x1 = centerX + Math.cos(angle1) * radiusOuter;
      const y1 = centerY + Math.sin(angle1) * radiusOuter;

      const x2 = centerX + Math.cos(angle2) * radiusInner;
      const y2 = centerY + Math.sin(angle2) * radiusInner;

      // Start 1.0-second electric arc (60 frames @ 60fps)
      activeArcsRef.current.push({
        x1,
        y1,
        x2,
        y2,
        curveFactor: Math.random() * Math.PI * 2,
        frameCounter: 0,
        durationFrames: 60, // Exactly 1.0 second duration
        glowColor: Math.random() > 0.4 ? '#38bdf8' : '#60a5fa'
      });

      // Play matching 1.0-second procedural electric sizzle audio
      soundManager.playElectricArc();

      // Schedule next arc after this 1.0s arc finishes (+ slight gap)
      const nextDelay = 1350 + Math.random() * 600;
      timer = setTimeout(trigger1SecArc, nextDelay);
    };

    timer = setTimeout(trigger1SecArc, 300);

    return () => {
      clearTimeout(timer);
      activeArcsRef.current = [];
      sparkParticlesRef.current = [];
    };
  }, [isOverclocked]);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const render = () => {
      const hasWork = activeArcsRef.current.length > 0 || sparkParticlesRef.current.length > 0;
      // Idle: nothing is drawn, so don't clear or iterate the canvas every frame.
      // The loop stays scheduled, so arcs pushed in later are picked up immediately.
      if (!hasWork) {
        animId = requestAnimationFrame(render);
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 1. Draw Active 1.0-Second Non-Linear Electric Arcs
      for (let i = activeArcsRef.current.length - 1; i >= 0; i--) {
        const arc = activeArcsRef.current[i];
        arc.frameCounter++;

        if (arc.frameCounter >= arc.durationFrames) {
          activeArcsRef.current.splice(i, 1);
          continue;
        }

        // Natural pulse intensity envelope over the 1.0 second
        const progress = arc.frameCounter / arc.durationFrames;
        const envelope = Math.sin(progress * Math.PI); // Smooth fade in and fade out
        const flicker = Math.random() > 0.15 ? 1.0 : 0.4;
        const alpha = envelope * flicker;

        // Generate non-linear jagged fractal curve points (jitters each frame)
        const pts = generateCurvedLightning(
          arc.x1,
          arc.y1,
          arc.x2,
          arc.y2,
          arc.curveFactor + arc.frameCounter * 0.1
        );

        if (pts.length >= 2) {
          // Layer 1: Delicate Cyan/Blue Ionization Glow (Reduced size: 2.2px)
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let j = 1; j < pts.length; j++) {
            ctx.lineTo(pts[j].x, pts[j].y);
          }
          ctx.strokeStyle = arc.glowColor;
          ctx.lineWidth = 2.2;
          ctx.globalAlpha = alpha * 0.65;
          ctx.stroke();

          // Layer 2: White-Hot Core Electric Filament (Reduced size: 0.8px)
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let j = 1; j < pts.length; j++) {
            ctx.lineTo(pts[j].x, pts[j].y);
          }
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 0.8;
          ctx.globalAlpha = alpha * 0.95;
          ctx.stroke();

          // Spawn micro flying spark embers during the 1.0s discharge
          if (Math.random() > 0.4) {
            const splitPt = pts[Math.floor(Math.random() * pts.length)];
            const sparkAngle = Math.random() * Math.PI * 2;
            const speed = 1.2 + Math.random() * 2.8;
            sparkParticlesRef.current.push({
              x: splitPt.x,
              y: splitPt.y,
              vx: Math.cos(sparkAngle) * speed,
              vy: Math.sin(sparkAngle) * speed + 0.3,
              life: 0,
              maxLife: 8 + Math.floor(Math.random() * 8),
              size: 0.8 + Math.random() * 1.0, // Fine micro spark size
              color: Math.random() > 0.5 ? '#7dd3fc' : '#ffffff'
            });
          }
        }
      }

      // 2. Draw Flying Hot Micro Spark Embers
      for (let i = sparkParticlesRef.current.length - 1; i >= 0; i--) {
        const sp = sparkParticlesRef.current[i];
        sp.life++;
        sp.x += sp.vx;
        sp.y += sp.vy;
        sp.vx *= 0.93;
        sp.vy *= 0.93;
        sp.vy += 0.05; // gentle gravity

        if (sp.life >= sp.maxLife) {
          sparkParticlesRef.current.splice(i, 1);
          continue;
        }

        const spAlpha = 1.0 - sp.life / sp.maxLife;
        ctx.fillStyle = sp.color;
        ctx.globalAlpha = spAlpha * 0.85;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, sp.size * spAlpha, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1.0;
      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none z-20 flex items-center justify-center">
      <canvas
        ref={canvasRef}
        width={400}
        height={400}
        className="w-[360px] h-[360px] sm:w-[400px] sm:h-[400px] pointer-events-none"
      />
    </div>
  );
};
