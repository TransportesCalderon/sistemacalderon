import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

const config = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'src/shared/types/database.generated.ts'],
  },
  {
    // Regla de capas: la clave service_role nunca se importa desde módulos ni componentes.
    files: ['src/modules/**/*.{ts,tsx}', 'src/app/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@/server/supabase/admin'], message: 'service_role solo en scripts y jobs (arquitectura §6).' },
          ],
        },
      ],
    },
  },
];

export default config;
