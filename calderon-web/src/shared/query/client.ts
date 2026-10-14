import { QueryClient, isServer } from '@tanstack/react-query';
import { FRESCURA } from './frescura';

/** Errores de PostgREST con código 4xx / SQLSTATE no se reintentan: la base ya decidió. */
function esErrorDeRed(error: unknown): boolean {
  if (error instanceof TypeError) return true; // fetch falló (sin conexión)
  const status = (error as { status?: number } | null)?.status;
  return typeof status === 'number' && status >= 500;
}

export function crearQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: FRESCURA.transaccional,
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: true,
        retry: (intentos, error) => intentos < 1 && esErrorDeRed(error),
      },
      mutations: { retry: false },
    },
  });
}

let clienteNavegador: QueryClient | undefined;

/** Servidor: un QueryClient por petición. Navegador: uno solo para toda la sesión. */
export function getQueryClient(): QueryClient {
  if (isServer) return crearQueryClient();
  clienteNavegador ??= crearQueryClient();
  return clienteNavegador;
}
