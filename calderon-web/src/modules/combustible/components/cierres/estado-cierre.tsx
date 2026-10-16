import { ETIQUETA_ESTADO_CIERRE, ETIQUETA_VERIFICACION, type EstadoCierre, type ResultadoVerificacion } from '../../domain/cierre.types';
import { Chip, type Tono } from '../comun/ui';

const TONO_ESTADO: Record<EstadoCierre, Tono> = { borrador: 'marca', aprobado: 'exito', anulado: 'error' };
const TONO_VERIFICACION: Record<ResultadoVerificacion, Tono> = { verificado: 'exito', con_diferencias: 'error', con_avisos: 'alerta' };

export function EstadoCierreChip({ estado }: { estado: EstadoCierre }) {
  return <Chip tono={TONO_ESTADO[estado]}>{ETIQUETA_ESTADO_CIERRE[estado]}</Chip>;
}

/** Resultado de la verificación (no es un estado del cierre). */
export function VerificacionChip({ resultado }: { resultado: ResultadoVerificacion }) {
  return <Chip tono={TONO_VERIFICACION[resultado]}>{ETIQUETA_VERIFICACION[resultado]}</Chip>;
}
