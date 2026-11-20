'use client';

import { useQuery } from '@tanstack/react-query';
import { browserDb } from '@/shared/supabase/browser';
import { clienteRepository } from '../repositories/cliente.repository';

/** Migración 288 · El mapa del cliente se vuelve a leer solo cada minuto (el GPS de cada camión manda cada pocos minutos). */
export const REFRESCO_CLIENTE_MS = 60_000;

export const useSeguimientoCliente = () =>
  useQuery({
    queryKey: ['cliente', 'seguimiento'],
    queryFn: () => clienteRepository(browserDb()).seguimiento(),
    refetchInterval: REFRESCO_CLIENTE_MS,
    staleTime: 30_000,
  });

/** Va bajo «usuarios/debo-cambiar-clave»: al guardar la contraseña la recarga invalidar(qc, 'clave'). */
export const useClienteDeboCambiarClave = () =>
  useQuery({
    queryKey: ['usuarios', 'debo-cambiar-clave', 'cliente'],
    queryFn: () => clienteRepository(browserDb()).deboCambiarClave(),
    staleTime: 5 * 60_000,
  });
