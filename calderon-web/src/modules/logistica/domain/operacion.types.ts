import type { FechaDia, FechaISO } from '@/shared/types/dominio';

/**
 * Operación > Operaciones (migración 41): lo que Logística cargaba en REDLINE.
 * El estado lo calcula la base (ops.fn_operaciones) con las mismas palabras de REDLINE.
 */
export const TIPOS_OPERACION = ['exportacion', 'importacion', 'nacional', 'round_trip'] as const;
export type TipoOperacion = (typeof TIPOS_OPERACION)[number];
export const TIPO_OPERACION_ETIQUETA: Record<TipoOperacion, string> = {
  exportacion: 'EXPORTACIÓN',
  importacion: 'IMPORTACIÓN',
  nacional: 'NACIONAL',
  round_trip: 'ROUND TRIP',
};
export const etiquetaTipo = (t: string | null) => (t && t in TIPO_OPERACION_ETIQUETA ? TIPO_OPERACION_ETIQUETA[t as TipoOperacion] : '—');

export const ESTADOS_LOGISTICA = [
  'sin_confirmar',
  'programado',
  'retirado',
  'posicionado',
  'aduana',
  'frontera',
  'en_transito',
  'hacia_puerto',
  'demorado',
  'descargando',
  'entregado',
  'cancelado',
] as const;
export type EstadoLogistica = (typeof ESTADOS_LOGISTICA)[number];
export const esEstadoLogistica = (v: string): v is EstadoLogistica => (ESTADOS_LOGISTICA as readonly string[]).includes(v);

/** Mismas palabras (y números) que el «Estado Plan Carga» de REDLINE. */
export const ESTADO_INFO: Record<EstadoLogistica, { etiqueta: string; clase: string }> = {
  sin_confirmar: { etiqueta: '00-Sin confirmar', clase: 'bg-[#f2f4f7] text-[#344054] border border-dashed border-[#98a2b3]' },
  programado: { etiqueta: '01-Programado', clase: 'bg-[#fee4e2] text-[#912018]' },
  retirado: { etiqueta: '02-Retirado', clase: 'bg-[#dcfae6] text-[#085d3a]' },
  posicionado: { etiqueta: '03-Posicionado', clase: 'bg-[#dcfae6] text-[#085d3a] border border-[#47cd89]' },
  aduana: { etiqueta: '04-Aduana', clase: 'bg-[#fef7c3] text-[#713b12]' },
  frontera: { etiqueta: 'Frontera', clase: 'bg-[#fef7c3] text-[#713b12] border border-[#fac515]' },
  en_transito: { etiqueta: '05-En tránsito', clase: 'bg-[#dbe8f7] text-[#0b4a85]' },
  demorado: { etiqueta: '06-Demorado', clase: 'bg-[#fef0c7] text-[#93370d] border border-[#f79009]' },
  hacia_puerto: { etiqueta: '07-En tránsito hacia puerto', clase: 'bg-[#dbe8f7] text-[#0b4a85] border border-[#84adff]' },
  descargando: { etiqueta: 'Descargando', clase: 'bg-[#ebe4fa] text-[#4b2c91]' },
  entregado: { etiqueta: '08-Entregado', clase: 'bg-[#1d4ed8] text-white' },
  cancelado: { etiqueta: 'Cancelado', clase: 'bg-white text-tinta-suave line-through border border-borde' },
};

/** Botones de color del filtro, como en REDLINE (Programados rojo, Retirados verde, En Aduana amarillo, Entregados azul). */
export const GRUPOS_FILTRO = [
  { id: 'todos', etiqueta: 'Todos', clase: 'bg-panel text-tinta border border-borde', estados: null },
  { id: 'sin_confirmar', etiqueta: 'Sin confirmar', clase: 'bg-[#98a2b3] text-white', estados: ['sin_confirmar'] },
  { id: 'programado', etiqueta: 'Programados', clase: 'bg-[#d92d20] text-white', estados: ['programado'] },
  { id: 'retirado', etiqueta: 'Retirados', clase: 'bg-[#079455] text-white', estados: ['retirado', 'posicionado'] },
  { id: 'aduana', etiqueta: 'En aduana', clase: 'bg-[#fac515] text-[#542c0d]', estados: ['aduana', 'frontera'] },
  {
    id: 'transito',
    etiqueta: 'En tránsito',
    clase: 'bg-[#2e90fa] text-white',
    estados: ['en_transito', 'hacia_puerto', 'demorado', 'descargando'],
  },
  { id: 'entregado', etiqueta: 'Entregados', clase: 'bg-[#1d4ed8] text-white', estados: ['entregado'] },
  { id: 'cancelado', etiqueta: 'Cancelados', clase: 'bg-panel text-tinta-suave border border-borde', estados: ['cancelado'] },
] as const satisfies readonly { id: string; etiqueta: string; clase: string; estados: readonly EstadoLogistica[] | null }[];
export type GrupoFiltro = (typeof GRUPOS_FILTRO)[number]['id'];

export const TIPOS_HITO = [
  'retiro_contenedor',
  'entrada_aduana',
  'liberacion_aduana',
  'ingreso_frontera',
  'liberacion_frontera',
  'demora',
  'carga',
  'entrega',
] as const;
export type TipoHito = (typeof TIPOS_HITO)[number];
export const HITO_ETIQUETA: Record<TipoHito, string> = {
  retiro_contenedor: 'Retiro contenedor',
  entrada_aduana: 'Entrada aduana',
  liberacion_aduana: 'Liberación aduana',
  ingreso_frontera: 'Ingreso frontera',
  liberacion_frontera: 'Liberación frontera',
  demora: 'Demora',
  carga: 'Carga',
  entrega: 'Entrega',
};

export interface Hito {
  id: number;
  tipo: TipoHito;
  ts: FechaISO;
  hasta: FechaISO | null;
  detalle: string | null;
}

export interface Operacion {
  servicioId: number;
  numero: number;
  fecha: FechaDia;
  tipo: string | null;
  estado: string;
  estadoLogistica: EstadoLogistica;
  clienteId: number;
  cliente: string;
  lineaId: number | null;
  linea: string | null;
  lugarRetiroId: number | null;
  lugarRetiro: string | null;
  origenId: number;
  origen: string | null;
  lugarAduanaId: number | null;
  lugarAduana: string | null;
  destinoId: number;
  destino: string | null;
  fechaPresentacion: FechaISO | null;
  fechaEntrega: FechaISO | null;
  inicioReal: FechaISO | null;
  finReal: FechaISO | null;
  producto: string | null;
  pesoKg: number | null;
  tipoContenedor: string | null;
  contenedor: string | null;
  precinto: string | null;
  taraMaxDias: number | null;
  booking: string | null;
  referenciaCliente: string | null;
  buque: string | null;
  crt: string | null;
  mic: string | null;
  observacion: string | null;
  motivoCancelacion: string | null;
  transportistaId: number | null;
  transportista: string | null;
  terceroChofer: string | null;
  terceroTractor: string | null;
  terceroSemi: string | null;
  tramoId: number | null;
  tramoEstado: string | null;
  paso: string | null;
  semiId: number | null;
  semi: string | null;
  camionId: number | null;
  tractor: string | null;
  choferId: number | null;
  chofer: string | null;
  hitos: Hito[];
  versionFila: number;
}

/** ¿Se pueden cambiar todos los datos? (si no, solo la documentación). Lo decide la base; esto solo arma el formulario. */
export const esAbierta = (o: Pick<Operacion, 'estado'>) => o.estado === 'sin_confirmar' || o.estado === 'planificado';

export interface Linea {
  id: number;
  codigo: string;
  lugarRetiroId: number;
  lugarEntregaId: number;
  lugarAduanaId: number | null;
  distanciaKm: number | null;
  cruzaFrontera: boolean;
  transitHoras: number | null;
  activa: boolean;
  versionFila: number;
}

export interface Transportista {
  id: number;
  razonSocial: string;
  cuit: string | null;
  telefono: string | null;
  observaciones: string | null;
  activo: boolean;
  versionFila: number;
}
