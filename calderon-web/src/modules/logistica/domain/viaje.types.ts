import type { FechaISO } from '@/shared/types/dominio';

/**
 * Operación > Viajes (migración 40): lo que asigna Logística y alimenta la Pizarra Azul.
 * El paso lo calcula la base (ops.fn_viajes_abiertos).
 */
export const PASOS = ['planificado', 'yendo_a_cargar', 'cargando', 'en_viaje', 'descargando', 'vuelta_vacia'] as const;
export type Paso = (typeof PASOS)[number];
export const esPaso = (v: string): v is Paso => (PASOS as readonly string[]).includes(v);

export const PASO_INFO: Record<Paso, { etiqueta: string; clase: string }> = {
  planificado: { etiqueta: 'Planificado', clase: 'bg-[#fff8eb] text-[#7a4500] border border-dashed border-[#e5b04a]' },
  yendo_a_cargar: { etiqueta: 'Yendo a cargar', clase: 'bg-[#fff8eb] text-[#7a4500] border border-[#e5b04a]' },
  cargando: { etiqueta: 'Cargando', clase: 'bg-[#fff1d6] text-[#7a4500] border border-[#e5b04a]' },
  en_viaje: { etiqueta: 'En viaje', clase: 'bg-[#dbe8f7] text-[#0b4a85]' },
  descargando: { etiqueta: 'Descargando', clase: 'bg-[#ebe4fa] text-[#4b2c91]' },
  vuelta_vacia: { etiqueta: 'Vuelta vacía', clase: 'bg-white text-[#344054] border border-dashed border-[#667085]' },
};

export interface ViajeAbierto {
  tramoId: number;
  enCurso: boolean;
  paso: Paso;
  conCarga: boolean;
  semiId: number | null;
  semi: string | null;
  camionId: number;
  tractor: string;
  choferId: number;
  chofer: string;
  numeroServicio: string | null;
  clienteId: number | null;
  cliente: string | null;
  producto: string | null;
  contenedor: string | null;
  taraMaxDias: number | null;
  origenId: number;
  origen: string | null;
  destinoId: number;
  destino: string | null;
  fechaCarga: FechaISO | null;
  fechaDescarga: FechaISO | null;
  inicioReal: FechaISO | null;
  observacion: string | null;
}

export interface Opcion {
  id: number;
  nombre: string;
  /** Motivo por el que no se puede elegir (taller, licencia…); la base igual lo controla. */
  noDisponible?: string;
}

export interface OpcionesViaje {
  semis: Opcion[];
  tractores: Opcion[];
  choferes: Opcion[];
  clientes: Opcion[];
  lugares: Opcion[];
}
