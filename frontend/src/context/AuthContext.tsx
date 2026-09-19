import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import { setAccessTokenGetter } from '@/services/apiClient';

interface AuthState {
  session: Session | null;
  user: User | null;
  /** true until the stored session has been read — guards must not redirect before that */
  loading: boolean;
  /** a password-reset link was opened: show "choose a new password" */
  recovering: boolean;
  configured: boolean;
  signIn(email: string, password: string): Promise<void>;
  /** resolves `needsConfirmation: true` when the project requires email confirmation */
  signUp(email: string, password: string, fullName: string): Promise<{ needsConfirmation: boolean }>;
  sendPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

// REST calls and the WebSocket hello both carry the current access token (refreshed by supabase-js).
setAccessTokenGetter(async () => (await supabase.auth.getSession()).data.session?.access_token ?? null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // the reset email links back to /login?reset=1; checking the URL too (not just the PASSWORD_RECOVERY
  // event) means a fast token exchange that finishes before we subscribe can't skip the new-password step
  const [recovering, setRecovering] = useState(
    () => new URLSearchParams(window.location.search).get('reset') === '1'
  );

  useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      if (event === 'SIGNED_OUT') setRecovering(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      recovering,
      configured: supabaseConfigured,
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      },
      async signUp(email, password, fullName) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          // full_name is copied into public.profiles by the handle_new_user trigger
          options: { data: { full_name: fullName }, emailRedirectTo: `${window.location.origin}/login` },
        });
        if (error) throw error;
        return { needsConfirmation: !data.session };
      },
      async sendPasswordReset(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/login?reset=1`,
        });
        if (error) throw error;
      },
      async updatePassword(password) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setRecovering(false);
      },
      async signOut() {
        await supabase.auth.signOut();
      },
    }),
    [session, loading, recovering]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** "Rishi Raj" → "RR", falls back to the email's first letter. */
export function initials(user: User | null): string {
  const name = (user?.user_metadata?.full_name as string | undefined)?.trim();
  if (name) return name.split(/\s+/).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
  return (user?.email?.[0] ?? '?').toUpperCase();
}
