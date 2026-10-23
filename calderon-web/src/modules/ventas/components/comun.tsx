import { Chip, type Tono } from '@/modules/combustible/components/comun/ui';
import { ETIQUETA_ESTADO_COT, ETIQUETA_ESTADO_FAC, ETIQUETA_ETAPA, type Etapa, type EstadoCotizacion, type EstadoFactura } from '../domain/ventas.types';

/** Piezas chicas compartidas por las pantallas de Ventas. */
export const PAISES = [
  { codigo: 'AR', nombre: 'Argentina' },
  { codigo: 'CL', nombre: 'Chile' },
  { codigo: 'BR', nombre: 'Brasil' },
  { codigo: 'PY', nombre: 'Paraguay' },
] as const;

const TONO_ETAPA: Record<Etapa, Tono> = { nuevo: 'neutro', contactado: 'neutro', cotizado: 'marca', negociacion: 'alerta', ganado: 'exito', perdido: 'error' };
const TONO_COT: Record<EstadoCotizacion, Tono> = { borrador: 'neutro', enviada: 'marca', vencida: 'alerta', aceptada: 'exito', rechazada: 'error', anulada: 'neutro' };
const TONO_FAC: Record<EstadoFactura, Tono> = { borrador: 'neutro', emitida: 'marca', vencida: 'error', cobrada: 'exito', anulada: 'neutro' };

export const ChipEtapa = ({ etapa }: { etapa: Etapa }) => <Chip tono={TONO_ETAPA[etapa]}>{ETIQUETA_ETAPA[etapa]}</Chip>;
export const ChipCotizacion = ({ estado }: { estado: EstadoCotizacion }) => <Chip tono={TONO_COT[estado]}>{ETIQUETA_ESTADO_COT[estado]}</Chip>;
export const ChipFactura = ({ estado }: { estado: EstadoFactura }) => <Chip tono={TONO_FAC[estado]}>{ETIQUETA_ESTADO_FAC[estado]}</Chip>;

