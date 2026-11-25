import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Home, Activity, Grid3x3, Settings, User } from 'lucide-react';
import { NavTab } from '../types';
import { soundManager } from '../utils/audio';
import { ShellMetalId, getShellMetalTheme } from '../utils/metalThemes';

interface BottomNavProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  shellMetal?: ShellMetalId;
}

export const BottomNav: React.FC<BottomNavProps> = ({ 
  activeTab, 
  onTabChange,
  shellMetal = 'gold'
}) => {
  const metal = getShellMetalTheme(shellMetal);
  const [clickedTab, setClickedTab] = useState<NavTab | null>(null);

  const navItems: { id: NavTab; label: string; icon: React.ReactNode; code: string }[] = [
    { 
      id: 'home', 
      label: 'CORE MAIN', 
      code: '01', 
      icon: <Home className="w-5 h-5 transition-transform duration-300 group-hover:scale-110" /> 
    },
    { 
      id: 'pulse', 
      label: 'DIAGNOSTICS', 
      code: '02', 
      icon: <Activity className="w-5 h-5 transition-transform duration-300 group-hover:scale-110" /> 
    },
    { 
      id: 'grid', 
      label: 'MATRIX', 
      code: '03', 
      icon: <Grid3x3 className="w-5 h-5 transition-transform duration-300 group-hover:scale-110" /> 
    },
    { 
      id: 'settings', 
      label: 'CONFIG', 
      code: '04', 
      icon: <Settings className="w-5 h-5 transition-transform duration-300 group-hover:rotate-45" /> 
    },
    { 
      id: 'user', 
      label: 'OPERATOR', 
      code: '05', 
      icon: <User className="w-5 h-5 transition-transform duration-300 group-hover:scale-110" /> 
    },
  ];

  const handleSelect = (tab: NavTab) => {
    soundManager.playClick();
    setClickedTab(tab);
    onTabChange(tab);
    setTimeout(() => setClickedTab(null), 400);
  };

  return (
    <div className="relative w-[344px] h-[51px] flex items-center justify-between select-none">
      {navItems.map((item) => {
        const isActive = activeTab === item.id;
        const isRecentlyClicked = clickedTab === item.id;

        return (
          <motion.button
            key={item.id}
            onClick={() => handleSelect(item.id)}
            whileHover={{ scale: 1.14, y: -2 }}
            whileTap={{ scale: 0.91 }}
            transition={{ type: "spring", stiffness: 500, damping: 22 }}
            className="group relative z-10 w-[51px] h-[51px] rounded-full flex items-center justify-center cursor-pointer outline-none focus:outline-none"
            title={item.label}
          >
            {/* 1. OUTER CHOLA BRONZE / GOLD BEVELED RETAINING RING */}
            <div 
              className={`absolute inset-0 rounded-full transition-all duration-400 ${
                isActive
                  ? 'shadow-[0_0_24px_rgba(245,158,11,0.85),0_4px_16px_rgba(0,0,0,0.95)]'
                  : 'shadow-[0_3px_10px_rgba(0,0,0,0.85)] group-hover:shadow-[0_0_15px_rgba(245,158,11,0.45)]'
              }`}
              style={{
                background: isActive
                  ? 'linear-gradient(135deg, #ffd54f 0%, #b45309 50%, #fef08a 70%, #78350f 100%)'
                  : 'linear-gradient(135deg, #784a1e 0%, #3a220a 50%, #9a652a 75%, #241405 100%)',
                padding: '1.8px',
              }}
            >
              {/* 2. RECESSED INNER CHROME / GOLD SHADOW GROOVE */}
              <div 
                className="w-full h-full rounded-full relative overflow-hidden"
                style={{
                  boxShadow: 'inset 0 1.5px 3px rgba(0,0,0,0.9), inset 0 -1px 2px rgba(255,255,255,0.2)',
                }}
              >
                {/* 3. CONVEX GLASS CABOCHON BODY (FRUTIGER AERO / FRUIT UI CRYSTAL LENS) */}
                <div
                  className="w-full h-full rounded-full relative overflow-hidden transition-all duration-400"
                  style={{
                    background: isActive
                      ? 'radial-gradient(circle at 36% 28%, #fff9c4 0%, #fde047 18%, #f59e0b 46%, #b45309 78%, #451a03 100%)'
                      : 'radial-gradient(circle at 36% 28%, rgba(85, 60, 32, 0.65) 0%, rgba(38, 26, 14, 0.85) 45%, rgba(14, 9, 4, 0.95) 85%, #050301 100%)',
                    boxShadow: isActive
                      ? 'inset 0 0 14px rgba(251, 191, 36, 0.95), inset 0 2px 4px rgba(255,255,255,0.9), inset 0 -3px 6px rgba(120,53,15,0.85)'
                      : 'inset 0 1px 2px rgba(255, 255, 255, 0.45), inset 0 -2px 5px rgba(0, 0, 0, 0.9), inset 0 0 8px rgba(0,0,0,0.7)',
                    backdropFilter: 'blur(3px)',
                  }}
                >
                  {/* 4. BOTTOM AMBIENT BOUNCE REFRACTION (Realistic glass thickness caustic) */}
                  <div
                    className="absolute -bottom-1 inset-x-2 h-3.5 rounded-full pointer-events-none transition-opacity duration-400"
                    style={{
                      background: isActive
                        ? 'radial-gradient(ellipse at 50% 100%, rgba(254, 240, 138, 0.85) 0%, rgba(245, 158, 11, 0.4) 60%, transparent 100%)'
                        : 'radial-gradient(ellipse at 50% 100%, rgba(255, 255, 255, 0.28) 0%, rgba(245, 158, 11, 0.15) 50%, transparent 100%)',
                    }}
                  />

                  {/* 5. TOP HIGH-GLOSS CURVED SPECULAR CRESCENT (The signature Aero glass shine) */}
                  <div
                    className="absolute top-[1.5px] left-1/2 -translate-x-1/2 pointer-events-none"
                    style={{
                      width: '84%',
                      height: '46%',
                      borderRadius: '50% 50% 45% 45% / 60% 60% 25% 25%',
                      background: isActive
                        ? 'linear-gradient(180deg, rgba(255, 255, 255, 0.92) 0%, rgba(255, 255, 255, 0.45) 45%, rgba(255, 255, 255, 0) 100%)'
                        : 'linear-gradient(180deg, rgba(255, 255, 255, 0.75) 0%, rgba(255, 255, 255, 0.22) 50%, rgba(255, 255, 255, 0) 100%)',
                      filter: 'drop-shadow(0 0.5px 1px rgba(255,255,255,0.6))',
                    }}
                  />

                  {/* 6. SECONDARY SPECULAR MICRO-PINPOINT (Curved sphere reflection) */}
                  <div 
                    className="absolute top-1 left-2.5 w-2 h-1 rounded-full pointer-events-none"
                    style={{
                      background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 80%)',
                      transform: 'rotate(-25deg)',
                    }}
                  />

                  {/* 7. GLASS FROSTED / SOLID 24K GOLD EMBOSSED ICON */}
                  <div 
                    className={`relative z-10 flex items-center justify-center w-full h-full transition-all duration-300 ${
                      isActive
                        ? 'text-[#2a1303]'
                        : 'text-stone-300/90 group-hover:text-amber-100'
                    }`}
                    style={{
                      filter: isActive
                        ? 'drop-shadow(0 1px 1px rgba(255, 255, 255, 0.75)) drop-shadow(0 -1px 1px rgba(120, 53, 15, 0.95)) drop-shadow(0 0 10px rgba(245, 158, 11, 0.95))'
                        : 'drop-shadow(0 1.5px 2px rgba(0, 0, 0, 0.95)) drop-shadow(0 0 1px rgba(255, 255, 255, 0.35))',
                    }}
                  >
                    {/* Render Icon with gold overlay if active */}
                    <div className="relative">
                      {item.icon}
                      {isActive && (
                        <div 
                          className="absolute inset-0 text-amber-950 mix-blend-overlay opacity-90 pointer-events-none"
                        >
                          {item.icon}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 8. ACTIVE GOLD PULSE AURA (Fluid energy wave when active or clicked) */}
            {isActive && (
              <motion.div
                layoutId="aeroActiveAura"
                className="absolute -inset-[3px] rounded-full pointer-events-none"
                style={{
                  boxShadow: '0 0 20px rgba(245, 158, 11, 0.75), 0 0 35px rgba(251, 191, 36, 0.4), inset 0 0 10px rgba(254, 240, 138, 0.6)',
                  border: '1.2px solid rgba(253, 224, 71, 0.65)',
                }}
                transition={{ type: "spring", stiffness: 450, damping: 28 }}
              />
            )}

            {/* 9. ACTIVE APEX FACETED AMBER BEACON GEM */}
            {isActive && (
              <div className="absolute -top-1.5 flex items-center justify-center pointer-events-none z-20">
                <span className="w-2 h-2 rounded-full bg-gradient-to-t from-amber-500 via-amber-300 to-white shadow-[0_0_10px_#f59e0b,0_0_4px_#fff] border border-amber-200 animate-pulse" />
              </div>
            )}

            {/* 10. CYBERPUNK CHOLA HOLOGRAPHIC TOOLTIP */}
            <span className="absolute -top-8 opacity-0 group-hover:opacity-100 transition-all duration-200 text-[8.5px] font-tech font-bold tracking-widest text-amber-200 bg-stone-950/95 px-2 py-0.5 border border-amber-500/60 rounded pointer-events-none whitespace-nowrap shadow-[0_0_15px_rgba(0,0,0,0.95)] backdrop-blur-md">
              [{item.code}] {item.label}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
};
