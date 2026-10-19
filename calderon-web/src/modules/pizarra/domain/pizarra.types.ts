import type { FechaDia, FechaISO } from '@/shared/types/dominio';

/**
 * Flota > Pizarra Azul (migración 39). Cada fila es un semi; la arma ops.fn_pizarra() con el
 * viaje que asigna Logística. El estado y las alertas los calcula la base: acá solo se muestran.
 */
export const ESTADOS_UNIDAD = [
  'disponible',
  'asignado',
  'cargando',
  'en_viaje',
  'descargando',
  'vacio',
  'taller',
  'fuera_servicio',
] as const;
export type EstadoUnidad = (typeof ESTADOS_UNIDAD)[number];

export const esEstadoUnidad = (v: string): v is EstadoUnidad => (ESTADOS_UNIDAD as readonly string[]).includes(v);

/** Etiqueta y aspecto de cada estado. El color fuerte es solo para Disponible; el rojo queda para errores. */
export const ESTADO_INFO: Record<EstadoUnidad, { etiqueta: string; corta: string; clase: string }> = {
  disponible: { etiqueta: 'Disponible', corta: 'Disp.', clase: 'bg-[#1e7a45] text-white' },
  asignado: { etiqueta: 'Asignado', corta: 'Asig.', clase: 'bg-[#fff8eb] text-[#7a4500] border border-dashed border-[#e5b04a]' },
  cargando: { etiqueta: 'Cargando', corta: 'Carg.', clase: 'bg-[#fff1d6] text-[#7a4500] border border-[#e5b04a]' },
  en_viaje: { etiqueta: 'En viaje', corta: 'Viaje', clase: 'bg-[#dbe8f7] text-[#0b4a85]' },
  descargando: { etiqueta: 'Descargando', corta: 'Desc.', clase: 'bg-[#ebe4fa] text-[#4b2c91]' },
  vacio: { etiqueta: 'Vacío', corta: 'Vacío', clase: 'bg-white text-[#344054] border border-dashed border-[#667085]' },
  taller: { etiqueta: 'Taller', corta: 'Taller', clase: 'bg-[#3d4654] text-white' },
  fuera_servicio: {
    etiqueta: 'Fuera de servicio',
    corta: 'F/S',
    clase: 'bg-[repeating-linear-gradient(135deg,#e4e7ec_0_4px,#f7f8fa_4px_8px)] text-[#344054] border border-[#b9c0ca]',
  },
};

export type NivelAlerta = 'critico' | 'aviso';
export interface Alerta {
  codigo: string;
  nivel: NivelAlerta;
  texto: string;
}

export interface FilaPizarra {
  semiId: number;
  patente: string;
  codigoInterno: string;
  tipo: string;
  estado: EstadoUnidad;
  taraFecha: FechaDia | null;
  taraDias: number | null;
  /** Cantidad por tipo de accesorio (id del tipo → cantidad). Sin clave = sin dato. */
  accesorios: Record<number, number>;
  gensetCodigo: string | null;
  gensetDesde: FechaISO | null;
  tramoId: number | null;
  tractor: string | null;
  chofer: string | null;
  numeroServicio: string | null;
  cliente: string | null;
  producto: string | null;
  contenedor: string | null;
  taraMaxDias: number | null;
  salidaTs: FechaISO | null;
  salidaLugar: string | null;
  destino: string | null;
  descarga: FechaISO | null;
  proxima: {
    cliente: string | null;
    producto: string | null;
    fecha: FechaISO | null;
    lugar: string | null;
    taraMaxDias: number | null;
  } | null;
  ubicacion: string | null;
  ubicacionFuente: 'telemetria' | 'evento' | 'playa' | 'ultimo_destino' | null;
  ubicacionTs: FechaISO | null;
  observacion: string | null;
  observacionPor: string | null;
  observacionEn: FechaISO | null;
  alertas: Alerta[];
  versionFila: number;
}

/** Columna de accesorio de la Pizarra con su total (fila TOTAL ENTREGADO de la planilla). */
export interface ColumnaAccesorio {
  id: number;
  nombre: string;
  sigla: string;
  orden: number;
  total: number;
  semisConDato: number;
}

export interface Lugar {
  id: number;
  nombre: string;
  tipo: string;
}

export interface TipoAccesorio {
  id: number;
  nombre: string;
  sigla: string;
  orden: number;
  activo: boolean;
  versionFila: number;
}

export interface Genset {
  id: number;
  codigo: string;
  marca: string | null;
  modelo: string | null;
  numeroSerie: string | null;
  estado: 'activo' | 'baja';
  observaciones: string | null;
  versionFila: number;
  /** Instalación vigente. */
  semiId: number | null;
  semiPatente: string | null;
  instaladoDesde: FechaISO | null;
}

export const TIPOS_SEMI = ['refrigerado', 'cisterna', 'plataforma', 'furgon', 'otro'] as const;
export type TipoSemi = (typeof TIPOS_SEMI)[number];
export const TIPO_SEMI_ETIQUETA: Record<TipoSemi, string> = {
  refrigerado: 'Refrigerado',
  cisterna: 'Cisterna',
  plataforma: 'Plataforma',
  furgon: 'Furgón',
  otro: 'Otro',
};
export const ESTADOS_SEMI = ['activo', 'taller', 'inactivo'] as const;
export type EstadoSemi = (typeof ESTADOS_SEMI)[number];
export const ESTADO_SEMI_ETIQUETA: Record<EstadoSemi, string> = { activo: 'Activo', taller: 'Taller', inactivo: 'Fuera de servicio' };

export interface Semi {
  id: number;
  codigoInterno: string;
  patente: string;
  paisPatente: string;
  tipo: TipoSemi;
  capacidadKg: number;
  tieneEquipoFrio: boolean;
  estado: EstadoSemi;
  taraFecha: FechaDia | null;
  versionFila: number;
}
