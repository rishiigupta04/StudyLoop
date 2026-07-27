import React from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Icon from '@/components/ui/AppIcon';
import AppLogo from '@/components/ui/AppLogo';

interface MobileLandingDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MobileLandingDrawer({ isOpen, onClose }: MobileLandingDrawerProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 md:hidden"
          />

          {/* Slide-out Drawer Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed inset-y-0 right-0 w-4/5 max-w-sm bg-[#151926] border-l border-indigo-500/40 z-50 p-6 flex flex-col justify-between shadow-2xl md:hidden"
          >
            <div>
              {/* Header */}
              <div className="flex items-center justify-between pb-6 border-b border-border/60">
                <div className="flex items-center gap-2">
                  <AppLogo size={28} />
                  <span className="font-extrabold text-base text-foreground">
                    Study<span className="gradient-text-indigo">Loop</span>
                  </span>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 rounded-xl bg-surface-elevated text-muted-foreground hover:text-foreground"
                  aria-label="Close menu"
                >
                  <Icon name="XMarkIcon" size={20} />
                </button>
              </div>

              {/* Nav Links */}
              <nav className="py-6 space-y-4">
                <a
                  href="#features"
                  onClick={onClose}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-surface-elevated text-sm font-bold text-foreground"
                >
                  <Icon name="SparklesIcon" size={18} className="text-indigo-400" />
                  <span>Features</span>
                </a>
                <a
                  href="#architecture"
                  onClick={onClose}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-surface-elevated text-sm font-bold text-foreground"
                >
                  <Icon name="CpuChipIcon" size={18} className="text-cyan-400" />
                  <span>Architecture</span>
                </a>
                <a
                  href="#pricing"
                  onClick={onClose}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-surface-elevated text-sm font-bold text-foreground"
                >
                  <Icon name="CurrencyRupeeIcon" size={18} className="text-emerald-400" />
                  <span>Pricing (₹)</span>
                </a>
                <a
                  href="#faq"
                  onClick={onClose}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-surface-elevated text-sm font-bold text-foreground"
                >
                  <Icon name="QuestionMarkCircleIcon" size={18} className="text-amber-400" />
                  <span>FAQ</span>
                </a>
              </nav>
            </div>

            {/* Auth Actions */}
            <div className="pt-6 border-t border-border/60 space-y-3">
              <Link
                to="/login"
                onClick={onClose}
                className="w-full py-3 rounded-xl bg-surface-elevated border border-border text-center text-xs font-bold text-foreground block"
              >
                Log In
              </Link>
              <Link
                to="/dashboard-home"
                onClick={onClose}
                className="w-full py-3 rounded-xl btn-primary text-center text-xs font-bold text-white block shadow-glow-indigo-sm"
              >
                Launch App
              </Link>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
