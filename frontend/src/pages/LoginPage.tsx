import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import AppLogo from '@/components/ui/AppLogo';
import Icon from '@/components/ui/AppIcon';

type LoginForm = {
  email: string;
  password: string;
};

const demoCredentials = { email: 'student@studyloop.ai', password: 'demo123' };

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginForm>({ mode: 'onBlur' });

  const onSubmit = (data: LoginForm) => {
    setIsLoading(true);
    // BACKEND INTEGRATION: POST /api/auth/login { email, password } → JWT token
    setTimeout(() => {
      setIsLoading(false);
      if (
        data.email === demoCredentials.email &&
        data.password === demoCredentials.password
      ) {
        toast.success('Welcome back, Arjun!', {
          icon: '🎉',
        });
        navigate('/dashboard-home');
      } else {
        toast.error('Invalid credentials — use the demo accounts below to sign in');
      }
    }, 1200);
  };

  const fillCredentials = () => {
    setValue('email', demoCredentials.email);
    setValue('password', demoCredentials.password);
    toast.success('Demo credentials filled!');
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success(`${label} copied!`);
    });
  };

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

      {/* Login Card */}
      <div className="w-full max-w-md relative z-10 fade-in">
        <div className="glass-card rounded-2xl p-8 shadow-modal">
          {/* Logo & Branding */}
          <div className="flex flex-col items-center mb-8">
            <div className="flex items-center gap-3 mb-3">
              <AppLogo size={48} />
              <span className="font-extrabold text-2xl text-foreground tracking-tight">StudyLoop</span>
            </div>
            <p className="text-center text-sm text-muted-foreground leading-relaxed">
              Voice-Native AI Study Copilot
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Email */}
            <div>
              <label className="block text-sm font-semibold text-foreground mb-1.5">
                Email
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <Icon name="EnvelopeIcon" size={16} />
                </div>
                <input
                  type="email"
                  placeholder="your@email.com"
                  className={`input-field w-full rounded-xl pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground ${
                    errors.email ? 'border-destructive' : ''
                  }`}
                  {...register('email', {
                    required: 'Email is required',
                    pattern: {
                      value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                      message: 'Invalid email format',
                    },
                  })}
                />
              </div>
              {errors.email && (
                <p className="mt-1.5 text-xs text-destructive flex items-center gap-1">
                  <Icon name="ExclamationCircleIcon" size={12} />
                  {errors.email.message}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-semibold text-foreground mb-1.5">
                Password
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <Icon name="LockClosedIcon" size={16} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  className={`input-field w-full rounded-xl pl-10 pr-12 py-3 text-sm text-foreground placeholder:text-muted-foreground ${
                    errors.password ? 'border-destructive' : ''
                  }`}
                  {...register('password', {
                    required: 'Password is required',
                    minLength: {
                      value: 6,
                      message: 'Minimum 6 characters required',
                    },
                  })}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors duration-150 p-1"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Icon name={showPassword ? 'EyeSlashIcon' : 'EyeIcon'} size={16} />
                </button>
              </div>
              {errors.password && (
                <p className="mt-1.5 text-xs text-destructive flex items-center gap-1">
                  <Icon name="ExclamationCircleIcon" size={12} />
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* Remember me + Forgot */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-border bg-input accent-primary cursor-pointer"
                />
                <span className="text-xs text-muted-foreground">Remember me</span>
              </label>
              <button type="button" className="text-xs text-primary hover:text-accent transition-colors duration-150 font-medium">
                Forgot password?
              </button>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full py-3 rounded-xl text-sm font-bold text-primary-foreground flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ minHeight: '48px' }}
            >
              {isLoading ? (
                <>
                  <Icon name="ArrowPathIcon" size={16} className="animate-spin" />
                  <span>Signing in…</span>
                </>
              ) : (
                <>
                  <Icon name="ArrowRightCircleIcon" size={16} />
                  <span>Sign In</span>
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Demo Credentials Box */}
          <div className="bg-muted rounded-xl p-4 border border-border">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Icon name="BeakerIcon" size={14} className="text-highlight" />
                <span className="text-xs font-semibold text-foreground">Demo Credentials</span>
              </div>
              <button
                onClick={fillCredentials}
                className="text-xs font-semibold text-primary hover:text-accent transition-colors duration-150 flex items-center gap-1"
              >
                <Icon name="ArrowDownTrayIcon" size={12} />
                Autofill
              </button>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-muted-foreground">Email: </span>
                  <span className="text-xs font-mono text-foreground">{demoCredentials.email}</span>
                </div>
                <button
                  onClick={() => copyToClipboard(demoCredentials.email, 'Email')}
                  className="p-1 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-all duration-150"
                  aria-label="Copy email"
                >
                  <Icon name="ClipboardIcon" size={12} />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-muted-foreground">Password: </span>
                  <span className="text-xs font-mono text-foreground">{demoCredentials.password}</span>
                </div>
                <button
                  onClick={() => copyToClipboard(demoCredentials.password, 'Password')}
                  className="p-1 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-all duration-150"
                  aria-label="Copy password"
                >
                  <Icon name="ClipboardIcon" size={12} />
                </button>
              </div>
            </div>
          </div>

          {/* Sign up link */}
          <p className="text-center text-xs text-muted-foreground mt-5">
            Don't have an account?{' '}
            <Link to="#" className="text-primary hover:text-accent font-semibold transition-colors duration-150">
              Sign up free
            </Link>
          </p>
        </div>

        {/* Tech badges */}
        <div className="flex items-center justify-center gap-3 mt-6 flex-wrap">
          {['Whisper ASR', 'LangGraph', 'Qwen2.5', 'BGE-M3', 'pgVector'].map((tech) => (
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
