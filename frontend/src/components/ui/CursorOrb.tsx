import React, { useEffect, useState } from 'react';
import { motion, useSpring, useMotionValue } from 'framer-motion';

export default function CursorOrb() {
  const [isVisible, setIsVisible] = useState(false);
  const mouseX = useMotionValue(-100);
  const mouseY = useMotionValue(-100);

  // Smooth physics-based spring follower
  const springConfig = { damping: 28, stiffness: 180, mass: 0.6 };
  const orbX = useSpring(mouseX, springConfig);
  const orbY = useSpring(mouseY, springConfig);

  useEffect(() => {
    // Only track on fine pointer devices (desktop)
    if (window.matchMedia('(pointer: coarse)').matches) {
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      mouseX.set(e.clientX - 160); // Offset by half width (320px / 2)
      mouseY.set(e.clientY - 160);
      if (!isVisible) setIsVisible(true);
    };

    const handleMouseLeave = () => setIsVisible(false);
    const handleMouseEnter = () => setIsVisible(true);

    window.addEventListener('mousemove', handleMouseMove);
    document.body.addEventListener('mouseleave', handleMouseLeave);
    document.body.addEventListener('mouseenter', handleMouseEnter);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      document.body.removeEventListener('mouseleave', handleMouseLeave);
      document.body.removeEventListener('mouseenter', handleMouseEnter);
    };
  }, [mouseX, mouseY, isVisible]);

  if (!isVisible) return null;

  return (
    <motion.div
      style={{
        x: orbX,
        y: orbY,
      }}
      className="pointer-events-none fixed top-0 left-0 z-30 w-[320px] h-[320px] rounded-full opacity-40 mix-blend-screen"
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 0.35, scale: 1 }}
      exit={{ opacity: 0, scale: 0.5 }}
      transition={{ duration: 0.3 }}
    >
      {/* Dual Indigo & Cyan Radial Gradient */}
      <div className="w-full h-full rounded-full bg-[radial-gradient(circle_at_center,rgba(124,58,237,0.45)_0%,rgba(6,182,212,0.25)_45%,transparent_70%)] blur-[48px]" />
    </motion.div>
  );
}
