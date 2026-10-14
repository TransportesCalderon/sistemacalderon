import { cn } from '@/shared/lib/cn';
import { ETIQUETA_ESTADO_CHOFER, type EstadoChofer } from '../../domain/chofer.types';

const COLOR: Record<EstadoChofer, string> = {
  activo: 'bg-exito/10 text-exito',
  licencia: 'bg-alerta-suave text-alerta',
  baja: 'bg-hover text-tinta-suave',
};

/** Chip de estado del chofer. Un registro eliminado se marca aparte. */
export function EstadoChoferChip({ estado, eliminado = false }: { estado: EstadoChofer; eliminado?: boolean }) {
  if (eliminado) {
    return <span className="inline-flex rounded-full bg-error-suave px-2 py-0.5 text-xs font-medium text-error">Eliminado</span>;
  }
  return (
    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', COLOR[estado])}>
      {ETIQUETA_ESTADO_CHOFER[estado]}
    </span>
  );
}
