/**
 * The one Supabase client (roadmap D9: the browser signs in with supabase-js; FastAPI only verifies).
 * Only public values here: the project URL and the publishable/anon key. RLS protects the data.
 */
import { createClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || '';
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || '';

export const supabaseConfigured = Boolean(url && key);

export const supabase = createClient(url || 'https://not-configured.invalid', key || 'not-configured', {
  auth: {
    persistSession: true, // stay signed in across reloads
    autoRefreshToken: true, // access tokens last ~1 h; refreshed in the background
    detectSessionInUrl: true, // email-confirmation and password-reset links land back here
  },
});
