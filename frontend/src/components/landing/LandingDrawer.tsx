import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Icon from '@/components/ui/AppIcon';
import AppLogo from '@/components/ui/AppLogo';

interface LandingDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  signedIn: boolean;
}

const LINKS = [
  { href: '#demo', label: 'Illustration', icon: 'PlayCircleIcon', color: 'text-indigo-400' },
  { href: '#architecture', label: 'How it works', icon: 'CpuChipIcon', color: 'text-cyan-400' },
  { href: '#scenarios', label: 'Voice commands', icon: 'MicrophoneIcon', color: 'text-emerald-400' },
  { href: '#faq', label: 'FAQ', icon: 'QuestionMarkCircleIcon', color: 'text-amber-400' },
];

/** Slide-out menu of the landing page on phones: only links to sections that exist, real auth routes. */
export default function LandingDrawer({ isOpen, onClose, signedIn }: LandingDrawerProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 md:hidden"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed inset-y-0 right-0 w-4/5 max-w-sm bg-[#151926] border-l border-indigo-500/40 z-50 p-6 flex flex-col justify-between shadow-2xl md:hidden"
          >
            <div>
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

              <nav className="py-6 space-y-2">
                {LINKS.map((l) => (
                  <a
                    key={l.href}
                    href={l.href}
                    onClick={onClose}
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-surface-elevated text-sm font-bold text-foreground"
                  >
                    <Icon name={l.icon} size={18} className={l.color} />
                    <span>{l.label}</span>
                  </a>
                ))}
              </nav>
            </div>

            <div className="pt-6 border-t border-border/60 space-y-3">
              {signedIn ? (
                <Link
                  to="/dashboard-home"
                  onClick={onClose}
                  className="w-full py-3 rounded-xl btn-primary text-center text-xs font-bold text-white block shadow-glow-indigo-sm"
                >
                  Open app
                </Link>
              ) : (
                <>
                  <Link
                    to="/login"
                    onClick={onClose}
                    className="w-full py-3 rounded-xl bg-surface-elevated border border-border text-center text-xs font-bold text-foreground block"
                  >
                    Sign in
                  </Link>
                  <Link
                    to="/login?mode=signup"
                    onClick={onClose}
                    className="w-full py-3 rounded-xl btn-primary text-center text-xs font-bold text-white block shadow-glow-indigo-sm"
                  >
                    Get started
                  </Link>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
