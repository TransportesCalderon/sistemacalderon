/**
 * Variables de entorno públicas. Se leen de forma explícita (no con process.env[nombre])
 * para que Next.js las incruste en el bundle del navegador.
 */
function requerida(nombre: string, valor: string | undefined): string {
  if (!valor) {
    throw new Error(`Falta la variable de entorno ${nombre}. Copiá .env.example como .env.local y completala.`);
  }
  return valor;
}

export const env = {
  supabaseUrl: requerida('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: requerida('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  zonaHorariaDefecto: process.env.NEXT_PUBLIC_ZONA_HORARIA_DEFECTO ?? 'America/Argentina/Mendoza',
} as const;
