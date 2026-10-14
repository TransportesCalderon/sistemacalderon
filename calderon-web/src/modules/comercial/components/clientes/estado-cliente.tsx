import { cn } from '@/shared/lib/cn';
import { ETIQUETA_ESTADO_CLIENTE, type EstadoCliente } from '../../domain/cliente.types';

const COLOR: Record<EstadoCliente, string> = {
  activo: 'bg-exito/10 text-exito',
  inactivo: 'bg-hover text-tinta-suave',
  bloqueado: 'bg-error-suave text-error',
};

/** Chip de estado del cliente. Un registro eliminado se marca aparte. */
export function EstadoClienteChip({ estado, eliminado = false }: { estado: EstadoCliente; eliminado?: boolean }) {
  if (eliminado) {
    return <span className="inline-flex rounded-full bg-error-suave px-2 py-0.5 text-xs font-medium text-error">Eliminado</span>;
  }
  return (
    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', COLOR[estado])}>
      {ETIQUETA_ESTADO_CLIENTE[estado]}
    </span>
  );
}
