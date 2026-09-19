import React, { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import AppLogo from '@/components/ui/AppLogo';
import Icon from '@/components/ui/AppIcon';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

type Mode = 'signin' | 'signup' | 'forgot' | 'check-email';

type AuthForm = {
  fullName: string;
  email: string;
  password: string;
  confirm: string;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Only same-site paths: "/video-study-page?v=x" yes, "//evil.com" or "https://…" no. */
function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/dashboard-home';
}

function friendly(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/invalid login credentials/i.test(msg)) return 'Wrong email or password.';
  if (/email not confirmed/i.test(msg)) return 'Please confirm your email first — check your inbox.';
  if (/already registered/i.test(msg)) return 'An account with this email already exists. Sign in instead.';
  if (/rate limit|too many/i.test(msg)) return 'Too many attempts. Wait a minute and try again.';
  if (/fetch|network/i.test(msg)) return "Can't reach the sign-in service. Check your connection.";
  return msg;
}

export default function LoginPage() {
  const auth = useAuth();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [mode, setMode] = useState<Mode>('signin');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState('');

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<AuthForm>({ mode: 'onBlur' });

  // a reset link was opened AND it signed us in → choose a new password before anything else
  const recovering = auth.recovering && !!auth.session;
  // signed in otherwise → straight back to where they were going
  if (auth.session && !recovering) return <Navigate to={next} replace />;
  const switchMode = (m: Mode) => {
    setMode(m);
    setUnconfirmedEmail(null);
    reset(undefined, { keepValues: true });
  };

  const onSubmit = async (data: AuthForm) => {
    setBusy(true);
    setUnconfirmedEmail(null);
    try {
      if (recovering) {
        await auth.updatePassword(data.password);
        toast.success('Password updated — you are signed in.');
      } else if (mode === 'signin') {
        await auth.signIn(data.email.trim(), data.password);
        toast.success('Welcome back!');
      } else if (mode === 'signup') {
        const { needsConfirmation } = await auth.signUp(data.email.trim(), data.password, data.fullName.trim());
        if (needsConfirmation) {
          setSentTo(data.email.trim());
          setMode('check-email');
        } else {
          toast.success('Account created — welcome to StudyLoop!');
        }
      } else if (mode === 'forgot') {
        await auth.sendPasswordReset(data.email.trim());
        setSentTo(data.email.trim());
        toast.success('If that email has an account, a reset link is on its way.');
        setMode('signin');
      }
    } catch (err) {
      if (/email not confirmed/i.test(String((err as Error)?.message))) setUnconfirmedEmail(data.email.trim());
      toast.error(friendly(err));
    } finally {
      setBusy(false);
    }
  };

  const resendConfirmation = async () => {
    if (!unconfirmedEmail) return;
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: unconfirmedEmail,
      options: { emailRedirectTo: `${window.location.origin}/login` },
    });
    if (error) toast.error(friendly(error));
    else toast.success('Confirmation email sent again.');
  };

  const title = recovering
    ? 'Choose a new password'
    : mode === 'signup'
      ? 'Create your account'
      : mode === 'forgot'
        ? 'Reset your password'
        : mode === 'check-email'
          ? 'Check your inbox'
          : 'Sign in to continue';

  const submitLabel = recovering
    ? 'Update password'
    : mode === 'signup'
      ? 'Create account'
      : mode === 'forgot'
        ? 'Send reset link'
        : 'Sign in';

  const showName = !recovering && mode === 'signup';
  const showEmail = !recovering;
  const showPasswordField = recovering || mode === 'signin' || mode === 'signup';
  const showConfirm = recovering || mode === 'signup';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center relative overflow-hidden px-4">
      {/* Background Orbs */}
      <div className="absolute top-[-10%] left-[-5%] w-[500px] h-[500px] orb-purple pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[500px] h-[500px] orb-blue pointer-events-none" />
      <div className="absolute top-[40%] left-[60%] w-[300px] h-[300px] orb-orange pointer-events-none" />

      {/* Geometric Grid Pattern */}
      <div
        className="absolute inset-0 pointer-events-none opacity-5"
        style={{
          backgroundImage: `linear-gradient(rgba(108, 63, 197, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(108, 63, 197, 0.5) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      <div className="w-full max-w-md relative z-10 fade-in">
        <div className="glass-card rounded-2xl p-8 shadow-modal">
          {/* Logo & Branding */}
          <div className="flex flex-col items-center mb-6">
            <Link to="/" className="flex items-center gap-3 mb-3" aria-label="StudyLoop home">
              <AppLogo size={48} />
              <span className="font-extrabold text-2xl text-foreground tracking-tight">StudyLoop</span>
            </Link>
            <h1 className="text-base font-semibold text-foreground">{title}</h1>
            <p className="text-center text-sm text-muted-foreground leading-relaxed mt-1">
              Voice-native study copilot · English + हिंदी
            </p>
          </div>

          {!auth.configured && (
            <div className="mb-5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
              Sign-in isn't configured: set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in
              <code> frontend/.env</code>.
            </div>
          )}

          {mode === 'check-email' && !recovering ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto w-12 h-12 rounded-2xl bg-indigo-500/15 flex items-center justify-center">
                <Icon name="EnvelopeIcon" size={22} className="text-indigo-300" />
              </div>
              <p className="text-sm text-muted-foreground">
                We sent a confirmation link to <span className="font-semibold text-foreground">{sentTo}</span>. Open it
                on this device to finish creating your account.
              </p>
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className="btn-primary w-full py-3 rounded-xl text-sm font-bold text-primary-foreground"
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              {showName && (
                <Field label="Full name" error={errors.fullName?.message} icon="UserIcon">
                  <input
                    type="text"
                    autoComplete="name"
                    placeholder="Your name"
                    className={inputClass(!!errors.fullName)}
                    {...register('fullName', { required: 'Name is required' })}
                  />
                </Field>
              )}

              {showEmail && (
                <Field label="Email" error={errors.email?.message} icon="EnvelopeIcon">
                  <input
                    type="email"
                    autoComplete="email"
                    placeholder="your@email.com"
                    className={inputClass(!!errors.email)}
                    {...register('email', {
                      required: 'Email is required',
                      pattern: { value: EMAIL, message: 'Invalid email format' },
                    })}
                  />
                </Field>
              )}

              {showPasswordField && (
                <Field
                  label={recovering ? 'New password' : 'Password'}
                  error={errors.password?.message}
                  icon="LockClosedIcon"
                  trailing={
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors duration-150 p-1"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      <Icon name={showPassword ? 'EyeSlashIcon' : 'EyeIcon'} size={16} />
                    </button>
                  }
                >
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={mode === 'signin' && !recovering ? 'current-password' : 'new-password'}
                    placeholder="••••••••"
                    className={inputClass(!!errors.password) + ' pr-12'}
                    {...register('password', {
                      required: 'Password is required',
                      minLength: { value: 6, message: 'At least 6 characters' },
                    })}
                  />
                </Field>
              )}

              {showConfirm && (
                <Field label="Confirm password" error={errors.confirm?.message} icon="LockClosedIcon">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="••••••••"
                    className={inputClass(!!errors.confirm)}
                    {...register('confirm', {
                      validate: (v) => v === watch('password') || "Passwords don't match",
                    })}
                  />
                </Field>
              )}

              {mode === 'signin' && !recovering && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    className="text-xs text-primary hover:text-accent transition-colors duration-150 font-medium"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              {unconfirmedEmail && (
                <p className="text-xs text-amber-200">
                  Didn't get the email?{' '}
                  <button type="button" onClick={resendConfirmation} className="font-semibold underline">
                    Send it again
                  </button>
                </p>
              )}

              <button
                type="submit"
                disabled={busy || !auth.configured}
                className="btn-primary w-full py-3 rounded-xl text-sm font-bold text-primary-foreground flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ minHeight: '48px' }}
              >
                {busy ? (
                  <>
                    <Icon name="ArrowPathIcon" size={16} className="animate-spin" />
                    <span>Please wait…</span>
                  </>
                ) : (
                  <>
                    <Icon name="ArrowRightCircleIcon" size={16} />
                    <span>{submitLabel}</span>
                  </>
                )}
              </button>
            </form>
          )}

          {!recovering && mode !== 'check-email' && (
            <p className="text-center text-xs text-muted-foreground mt-5">
              {mode === 'signin' ? (
                <>
                  New to StudyLoop?{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('signup')}
                    className="text-primary hover:text-accent font-semibold transition-colors duration-150"
                  >
                    Create an account
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('signin')}
                    className="text-primary hover:text-accent font-semibold transition-colors duration-150"
                  >
                    Sign in
                  </button>
                </>
              )}
            </p>
          )}
        </div>

        {/* Tech badges — the stack actually in use (roadmap v2) */}
        <div className="flex items-center justify-center gap-3 mt-6 flex-wrap">
          {['Web Speech API', 'LangGraph', 'DistilBERT', 'BGE-M3', 'pgvector'].map((tech) => (
            <span
              key={`tech-${tech}`}
              className="text-xs text-muted-foreground px-2.5 py-1 rounded-full border border-border bg-secondary"
            >
              {tech}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function inputClass(hasError: boolean): string {
  return `input-field w-full rounded-xl pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground ${
    hasError ? 'border-destructive' : ''
  }`;
}

function Field({
  label,
  error,
  icon,
  trailing,
  children,
}: {
  label: string;
  error?: string;
  icon: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-foreground mb-1.5">
        {label}
        <div className="relative mt-1.5 font-normal">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
            <Icon name={icon} size={16} />
          </div>
          {children}
          {trailing}
        </div>
      </label>
      {error && (
        <p className="mt-1.5 text-xs text-destructive flex items-center gap-1" role="alert">
          <Icon name="ExclamationCircleIcon" size={12} />
          {error}
        </p>
      )}
    </div>
  );
}
