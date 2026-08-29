import { createClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://viwfwbzapbtvcnwhepzq.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_J28lQIO_60y_TPjv1T4ICQ_MTbW5Wmr';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || DEFAULT_SUPABASE_URL;
const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) || DEFAULT_SUPABASE_PUBLISHABLE_KEY;

export const supabase = createClient(supabaseUrl, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
