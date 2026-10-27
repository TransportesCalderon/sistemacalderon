import type { FechaISO } from '@/shared/types/dominio';

/**
 * Tablero del camión (migración 88): datos de la pantalla del tablero leídos por IA de las fotos
 * del chofer y confirmados por una persona. La base revisa y avisa; acá solo se convierten tipos.
 */
export interface DatosTablero {
  odometro_km?: number;
  km?: number;
  litros?: number;
  ralenti_l?: number;
  pto_l?: number;
  horas?: number;
  ralenti_h?: number;
  pto_h?: number;
  velocidad_media_kmh?: number;
  l_100km?: number;
  programador_pct?: number;
  puntaje?: number;
  puntaje_escala?: number;
  partes?: Record<string, number>;
  marca?: string;
}

export interface Tablero extends DatosTablero {
  id: number;
  camionId: number;
  patente: string;
  tomadaEn: FechaISO;
  corregido: boolean;
  avisos: string[];
  fotos: { ruta: string }[];
}

export interface CamionTablero {
  id: number;
  patente: string;
  codigo: string;
  marca: string | null;
  ultima: { tomadaEn: FechaISO; odometroKm: number | null } | null;
}

export interface Combinado {
  datos: DatosTablero;
  avisos: string[];
  listas: number;
  esperando: number;
  errores: string[];
}

/** Campos que se muestran para revisar, en este orden. Las horas se escriben como 68:42. */
export const CAMPOS_TABLERO: { clave: keyof DatosTablero; etiqueta: string; unidad: string; horas?: boolean }[] = [
  { clave: 'km', etiqueta: 'Km del viaje', unidad: 'km' },
  { clave: 'litros', etiqueta: 'Litros del viaje', unidad: 'L' },
  { clave: 'l_100km', etiqueta: 'Rendimiento', unidad: 'L/100 km' },
  { clave: 'horas', etiqueta: 'Horas de motor', unidad: 'h', horas: true },
  { clave: 'ralenti_h', etiqueta: 'Horas en ralentí', unidad: 'h', horas: true },
  { clave: 'ralenti_l', etiqueta: 'Litros en ralentí', unidad: 'L' },
  { clave: 'velocidad_media_kmh', etiqueta: 'Velocidad promedio', unidad: 'km/h' },
  { clave: 'odometro_km', etiqueta: 'Odómetro', unidad: 'km' },
  { clave: 'puntaje', etiqueta: 'Puntuación de conducción', unidad: '%' },
  { clave: 'programador_pct', etiqueta: 'Programador de velocidad', unidad: '%' },
];

/** 68,7 → «68:42». */
export function horasATexto(h: number | undefined | null): string {
  if (h === undefined || h === null || !Number.isFinite(h)) return '';
  const total = Math.round(h * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** «68:42» o «68,7» → 68,7 (null si no se entiende). */
export function textoAHoras(t: string): number | null {
  const s = t.trim();
  if (s === '') return null;
  const m = /^(\d{1,6})\s*[:hH]\s*(\d{1,2})$/.exec(s);
  if (m) return Math.round((Number(m[1]) + Number(m[2]) / 60) * 100) / 100;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

type J = Record<string, unknown>;
const o = (v: unknown): J => (v && typeof v === 'object' && !Array.isArray(v) ? (v as J) : {});
const num = (v: unknown) => (v === null || v === undefined || v === '' ? undefined : Number(v));

export function parsearDatos(v: unknown): DatosTablero {
  const d = o(v);
  const r: DatosTablero = {};
  for (const k of ['odometro_km', 'km', 'litros', 'ralenti_l', 'pto_l', 'horas', 'ralenti_h', 'pto_h', 'velocidad_media_kmh', 'l_100km', 'programador_pct', 'puntaje', 'puntaje_escala'] as const) {
    const x = num(d[k]);
    if (x !== undefined && Number.isFinite(x)) r[k] = x;
  }
  const partes = Object.fromEntries(Object.entries(o(d.partes)).filter(([, x]) => typeof x === 'number')) as Record<string, number>;
  if (Object.keys(partes).length > 0) r.partes = partes;
  if (typeof d.marca === 'string') r.marca = d.marca;
  return r;
}

export function parsearTableros(v: unknown): Tablero[] {
  return (Array.isArray(v) ? v : []).map((x) => {
    const t = o(x);
    return {
      ...parsearDatos(t),
      id: Number(t.id),
      camionId: Number(t.camion_id),
      patente: String(t.patente ?? ''),
      tomadaEn: String(t.tomada_en) as FechaISO,
      corregido: t.corregido === true,
      avisos: Array.isArray(t.avisos) ? t.avisos.map(String) : [],
      fotos: Array.isArray(t.fotos) ? (t.fotos as J[]).filter((f) => typeof f.ruta === 'string').map((f) => ({ ruta: String(f.ruta) })) : [],
    };
  });
}

export function parsearContexto(v: unknown): { choferId: number | null; camiones: CamionTablero[] } {
  const c = o(v);
  return {
    choferId: c.chofer_id == null ? null : Number(c.chofer_id),
    camiones: (Array.isArray(c.camiones) ? (c.camiones as J[]) : []).map((x) => ({
      id: Number(x.id),
      patente: String(x.patente ?? ''),
      codigo: String(x.codigo ?? ''),
      marca: typeof x.marca === 'string' ? x.marca : null,
      ultima: x.ultima ? { tomadaEn: String(o(x.ultima).tomada_en) as FechaISO, odometroKm: num(o(x.ultima).odometro_km) ?? null } : null,
    })),
  };
}

export function parsearCombinado(v: unknown): Combinado {
  const c = o(v);
  return {
    datos: parsearDatos(c.datos),
    avisos: Array.isArray(c.avisos) ? c.avisos.map(String) : [],
    listas: Number(c.listas ?? 0),
    esperando: Number(c.esperando ?? 0),
    errores: Array.isArray(c.errores) ? c.errores.map(String) : [],
  };
}

/** Aviso de carga (migración 89). */
export interface AvisoCarga {
  id: number;
  camionId: number | null;
  patente: string;
  codigo: string | null;
  chofer: string | null;
  estacion: string;
  litros: number;
  texto: string | null;
  creadoEn: FechaISO;
  visto: boolean;
  cargado: { litros: number; fechaHora: FechaISO } | null;
}

export function parsearAvisos(v: unknown): AvisoCarga[] {
  return (Array.isArray(v) ? v : []).map((x) => {
    const a = o(x);
    const c = a.cargado ? o(a.cargado) : null;
    return {
      id: Number(a.id),
      camionId: a.camion_id == null ? null : Number(a.camion_id),
      patente: String(a.patente ?? ''),
      codigo: typeof a.codigo === 'string' ? a.codigo : null,
      chofer: typeof a.chofer === 'string' ? a.chofer : null,
      estacion: String(a.estacion ?? ''),
      litros: Number(a.litros),
      texto: typeof a.texto === 'string' ? a.texto : null,
      creadoEn: String(a.creado_en) as FechaISO,
      visto: a.visto === true,
      cargado: c ? { litros: Number(c.litros), fechaHora: String(c.fecha_hora) as FechaISO } : null,
    };
  });
}

/** Litros sugeridos (migración 89). */
export interface Sugerido {
  litros: number | null;
  texto: string | null;
  motivo: string | null;
  desde: FechaISO | null;
}

export function parsearSugerido(v: unknown): Sugerido {
  const s = o(v);
  return {
    litros: s.litros == null ? null : Number(s.litros),
    texto: typeof s.texto === 'string' ? s.texto : null,
    motivo: typeof s.motivo === 'string' ? s.motivo : null,
    desde: typeof s.desde === 'string' ? (s.desde as FechaISO) : null,
  };
}
