'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/shared/types/db';
import { env } from '@/shared/lib/env';

let cliente: ReturnType<typeof createBrowserClient<Database>> | undefined;

/** Cliente Supabase del navegador (singleton). Lecturas de React Query y Realtime. */
export function browserDb() {
  cliente ??= createBrowserClient<Database>(env.supabaseUrl, env.supabaseAnonKey);
  return cliente;
}
