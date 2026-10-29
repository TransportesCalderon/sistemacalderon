/**
 * IA-1 · Rentabilidad (migración 119, fin.fn_rentabilidad). Margen de contribución por viaje, chofer
 * o camión: lo facturado de cada operación menos el costo directo de sus viajes. Lo calcula la base;
 * acá solo se lee. Los viajes incompletos (sin facturar, sin tipo de cambio, sin km…) no suman al
 * margen: se muestran con sus motivos. Funciona aunque el asistente de IA esté apagado.
 */
export const VERSION_RENTABILIDAD = 119;

export const AGRUPACIONES = ['chofer', 'camion', 'viaje'] as const;
export type Agrupacion = (typeof AGRUPACIONES)[number];
export const ETIQUETA_AGRUPACION: Record<Agrupacion, string> = { chofer: 'Chofer', camion: 'Camión', viaje: 'Viaje' };

export interface FilaRentabilidad {
  id: number | null;
  nombre: string;
  viajes: number;
  completos: number;
  incompletos: number;
  ingreso: number | null;
  costo: number | null;
  margen: number | null;
  margenPct: number | null;
  km: number | null;
  margenKm: number | null;
  motivos: string[];
}

export interface Rentabilidad {
  aviso: string;
  moneda: string;
  desde: string;
  hasta: string;
  agrupar: Agrupacion;
  filas: FilaRentabilidad[];
  totales: { viajes: number; completos: number; incompletos: number; ingreso: number; costo: number; margen: number };
}

type Obj = Record<string, unknown>;
const numN = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));
const num = (v: unknown): number => Number(v ?? 0);

export function esAgrupacion(v: unknown): v is Agrupacion {
  return typeof v === 'string' && (AGRUPACIONES as readonly string[]).includes(v);
}

export function parsearRentabilidad(raw: unknown): Rentabilidad {
  const j = (raw ?? {}) as Obj;
  const t = (j.totales ?? {}) as Obj;
  const filas = Array.isArray(j.filas) ? (j.filas as Obj[]) : [];
  return {
    aviso: String(j.aviso ?? ''),
    moneda: String(j.moneda ?? ''),
    desde: String(j.desde ?? ''),
    hasta: String(j.hasta ?? ''),
    agrupar: esAgrupacion(j.agrupar) ? j.agrupar : 'chofer',
    filas: filas.map((f) => ({
      id: numN(f.id),
      nombre: String(f.nombre ?? '—'),
      viajes: num(f.viajes),
      completos: num(f.completos),
      incompletos: num(f.incompletos),
      ingreso: numN(f.ingreso),
      costo: numN(f.costo),
      margen: numN(f.margen),
      margenPct: numN(f.margen_pct),
      km: numN(f.km),
      margenKm: numN(f.margen_km),
      motivos: Array.isArray(f.motivos) ? (f.motivos as unknown[]).map(String) : [],
    })),
    totales: {
      viajes: num(t.viajes),
      completos: num(t.completos),
      incompletos: num(t.incompletos),
      ingreso: num(t.ingreso),
      costo: num(t.costo),
      margen: num(t.margen),
    },
  };
}
