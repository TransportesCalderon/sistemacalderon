import 'server-only';

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/shared/types/db';
import { env } from '@/shared/lib/env';

/**
 * Cliente con service_role: SOLO para scripts y jobs (arquitectura §6).
 * Saltea permisos y deja la auditoría sin usuario. ESLint impide importarlo desde
 * src/modules y src/app.
 */
export function createSupabaseAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY (solo para scripts y jobs).');
  return createClient<Database>(env.supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
