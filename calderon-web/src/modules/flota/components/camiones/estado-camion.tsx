import { cn } from '@/shared/lib/cn';
import { ETIQUETA_ESTADO_CAMION, type EstadoCamion } from '../../domain/camion.types';

const COLOR: Record<EstadoCamion, string> = {
  activo: 'bg-exito/10 text-exito',
  taller: 'bg-alerta-suave text-alerta',
  inactivo: 'bg-hover text-tinta-suave',
};

/** Chip de estado operativo del camión. Un registro eliminado se marca aparte. */
export function EstadoCamionChip({ estado, eliminado = false }: { estado: EstadoCamion; eliminado?: boolean }) {
  if (eliminado) {
    return <span className="inline-flex rounded-full bg-error-suave px-2 py-0.5 text-xs font-medium text-error">Eliminado</span>;
  }
  return (
    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', COLOR[estado])}>
      {ETIQUETA_ESTADO_CAMION[estado]}
    </span>
  );
}
