'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { SesionCliente } from '@/modules/core/auth/session';

const SesionContext = createContext<SesionCliente | null>(null);

/**
 * Expone al navegador un subconjunto serializable de la sesión: usuario, roles,
 * permisos ya resueltos, zona horaria y moneda base. Nunca tokens.
 */
export function SessionProvider({ value, children }: { value: SesionCliente; children: ReactNode }) {
  return <SesionContext.Provider value={value}>{children}</SesionContext.Provider>;
}

export function useSesion(): SesionCliente {
  const sesion = useContext(SesionContext);
  if (!sesion) throw new Error('useSesion() debe usarse dentro de <SessionProvider>.');
  return sesion;
}
