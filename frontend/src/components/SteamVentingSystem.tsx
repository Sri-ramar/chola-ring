import React, { useEffect, useRef } from 'react';
import { soundManager } from '../utils/audio';

interface SteamVentingSystemProps {
  isVenting: boolean;
  isOverclocked?: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  growth: number;
  alpha: number;
  decay: number;
  rotation: number;
  rotSpeed: number;
  color: string;
}

export const SteamVentingSystem: React.FC<SteamVentingSystemProps> = ({
  isVenting,
  isOverclocked = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const isVentingRef = useRef(isVenting);
  const isOverclockedRef = useRef(isOverclocked);

  // Active firing state for periodic burst
  const burstActiveRef = useRef(false);
  const selectedNozzlesRef = useRef<number[]>([]);
  const lastNozzlesRef = useRef<number[]>([]);

  useEffect(() => {
    isVentingRef.current = isVenting;
  }, [isVenting]);

  useEffect(() => {
    isOverclockedRef.current = isOverclocked;
  }, [isOverclocked]);

  // Periodic 2-second steam blow cycle when Overclocked
  useEffect(() => {
    if (!isOverclocked) {
      burstActiveRef.current = false;
      return;
    }

    let timer: NodeJS.Timeout;

    const trigger2SecHissCycle = () => {
      if (!isOverclockedRef.current) return;

      // 1. Pick a random number of nozzles (2 to 3 nozzles)
      const numNozzles = Math.floor(Math.random() * 2) + 2; // 2 or 3 nozzles
      
      // 2. Pick nozzles different from the previous cycle
      const allIndices = [0, 1, 2, 3, 4, 5, 6, 7];
      const available = allIndices.filter((idx) => !lastNozzlesRef.current.includes(idx));
      const pool = available.length >= numNozzles ? available : allIndices;
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      
      const chosen = shuffled.slice(0, numNozzles);
      selectedNozzlesRef.current = chosen;
      lastNozzlesRef.current = chosen;
      burstActiveRef.current = true;

      // 3. Play matching 2.0-second procedural steam hiss audio in exact sync
      soundManager.playSteamHiss();

      // 4. Steam jet actively shoots for exactly 2.0 seconds (2000ms)
      setTimeout(() => {
        burstActiveRef.current = false;
      }, 2000);

      // 5. Schedule next 2-second steam blow after completion (+ short recovery pause)
      const nextInterval = 2500 + Math.random() * 600; // 2.5s - 3.1s total cycle
      timer = setTimeout(trigger2SecHissCycle, nextInterval);
    };

    // First steam blow starts 300ms after overclock begins
    timer = setTimeout(trigger2SecHissCycle, 300);

    return () => {
      clearTimeout(timer);
      burstActiveRef.current = false;
    };
  }, [isOverclocked]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const ventRadius = 146; // Radius of exhaust ports on the reactor rim

    // 8 Precise Radial Nozzle Vent Ports
    const nozzleAngles = [
      Math.PI * 0.25,  // 0: 45 deg (Top-Right)
      Math.PI * 0.75,  // 1: 135 deg (Bottom-Right)
      Math.PI * 1.25,  // 2: 225 deg (Bottom-Left)
      Math.PI * 1.75,  // 3: 315 deg (Top-Left)
      0,               // 4: 0 deg (Right)
      Math.PI * 0.5,   // 5: 90 deg (Bottom)
      Math.PI,         // 6: 180 deg (Left)
      Math.PI * 1.5    // 7: 270 deg (Top)
    ];

    // Fires continuous narrow high-speed steam particles from a specific nozzle
    const fireNozzleJet = (angle: number, intensity: number) => {
      const count = 2; // Continuous stream generation per animation frame
      for (let i = 0; i < count; i++) {
        // Tight angle deviation (narrow collimated jet stream)
        const angleDev = (Math.random() * 0.06 - 0.03);
        const jetAngle = angle + angleDev;
        
        // High initial forward velocity
        const speed = 6.0 + Math.random() * 5.5 * intensity;
        const startR = ventRadius + Math.random() * 2;

        // Pure translucent cryogenic white
        const color = '245, 250, 255';

        particlesRef.current.push({
          x: centerX + Math.cos(jetAngle) * startR,
          y: centerY + Math.sin(jetAngle) * startR,
          vx: Math.cos(jetAngle) * speed + (Math.random() * 0.2 - 0.1),
          vy: Math.sin(jetAngle) * speed + (Math.random() * 0.2 - 0.1) - 0.35, // thermal upward buoyancy
          size: 3.5 + Math.random() * 2.0, // starts narrow at nozzle mouth
          growth: 0.9 + Math.random() * 0.6, // expands into soft smoky plume
          alpha: 0.24 + Math.random() * 0.08, // soft translucent opacity
          decay: 0.009 + Math.random() * 0.005, // smooth long dissipation over time
          rotation: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() * 0.02 - 0.01),
          color
        });
      }
    };

    const render = () => {
      const hasParticles = particlesRef.current.length > 0;
      const bursting = isVentingRef.current || (isOverclockedRef.current && burstActiveRef.current);
      // Idle: the 760x760 canvas is blank anyway, so skip the clear + particle pass.
      // Keeps the loop armed for the next burst without burning a frame of work.
      if (!bursting && !hasParticles) {
        animId = requestAnimationFrame(render);
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (isVentingRef.current) {
        // Initial manual purge: all 8 nozzles fire narrow supersonic streams
        nozzleAngles.forEach((angle) => {
          fireNozzleJet(angle, 1.2);
        });
      } else if (isOverclockedRef.current && burstActiveRef.current) {
        // 3-second continuous steam blow: continuously fires from chosen nozzles
        selectedNozzlesRef.current.forEach((idx) => {
          if (nozzleAngles[idx] !== undefined) {
            fireNozzleJet(nozzleAngles[idx], 1.1);
          }
        });
      }

      // Update & Draw Smoke Particles
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const p = particlesRef.current[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.94; // atmospheric deceleration (converts jet stream into expanding plume)
        p.vy *= 0.94;
        p.vy -= 0.03; // gentle heat float upward
        p.size += p.growth;
        p.alpha -= p.decay;
        p.rotation += p.rotSpeed;

        if (p.alpha <= 0 || p.size > 80) {
          particlesRef.current.splice(i, 1);
          continue;
        }

        // Draw Soft Translucent Vapor Cloud
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);

        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size);
        grad.addColorStop(0, `rgba(${p.color}, ${p.alpha * 0.75})`);
        grad.addColorStop(0.5, `rgba(${p.color}, ${p.alpha * 0.3})`);
        grad.addColorStop(1, `rgba(${p.color}, 0)`);

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, p.size, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none z-30 flex items-center justify-center overflow-visible">
      <canvas
        ref={canvasRef}
        width={760}
        height={760}
        className="w-[540px] h-[540px] sm:w-[640px] sm:h-[640px] pointer-events-none"
      />
    </div>
  );
};
