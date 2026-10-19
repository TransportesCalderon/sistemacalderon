import { cn } from '@/shared/lib/cn';
import { formatearFechaDia } from '@/shared/lib/fechas';
import type { FechaDia } from '@/shared/types/dominio';
import { ETIQUETA_ESTADO_CHOFER, situacionLicencia, type EstadoChofer } from '../../domain/chofer.types';

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

/** Licencia de conducir: vencida (rojo), por vencer en menos de 60 días (amarillo) o la fecha. Solo informa: la base bloquea. */
export function LicenciaChip({ vence, hoy }: { vence: FechaDia | null; hoy: FechaDia }) {
  const s = situacionLicencia(vence, hoy);
  if (!s || !vence) return <span className="text-tinta-suave">—</span>;
  const fecha = formatearFechaDia(vence);
  if (s === 'vigente') return <span className="whitespace-nowrap tabular-nums">{fecha}</span>;
  return (
    <span
      title={s === 'vencida' ? 'Licencia vencida: no se le asignan viajes' : 'Vence en menos de 60 días'}
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        s === 'vencida' ? 'bg-error-suave text-error' : 'bg-[#fef0c7] text-[#93370d]',
      )}
    >
      {s === 'vencida' ? 'Vencida' : 'Vence'} {fecha}
    </span>
  );
}
