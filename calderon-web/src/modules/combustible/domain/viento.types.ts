/** Migración 181 · Viento en contra por viaje (Open-Meteo). Lo calcula la base; acá solo se convierte. */

export interface VientoViaje {
  camionId: number;
  cargaSalidaId: number;
  estado: 'ok' | 'sin_datos' | 'error';
  /** Promedio del viento en contra (km/h). Negativo = a favor. */
  contraKmh: number | null;
  contraMaxKmh: number | null;
  rafagaMaxKmh: number | null;
  minutosFuerte: number;
  pctExtra: number | null;
  extraL: number | null;
  /** Una hora o más con viento fuerte de frente. */
  fuerte: boolean;
  error: string | null;
}

type J = Record<string, unknown>;
const n = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));

export function parsearViento(v: unknown, claves?: { camionId: number; cargaSalidaId: number }): VientoViaje | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const x = v as J;
  const estado = x.estado === 'ok' || x.estado === 'error' ? x.estado : 'sin_datos';
  return {
    camionId: claves?.camionId ?? Number(x.camion_id),
    cargaSalidaId: claves?.cargaSalidaId ?? Number(x.carga_salida_id),
    estado,
    contraKmh: n(x.contra_kmh),
    contraMaxKmh: n(x.contra_max_kmh),
    rafagaMaxKmh: n(x.rafaga_max_kmh),
    minutosFuerte: Number(x.minutos_fuerte ?? 0),
    pctExtra: n(x.pct_extra),
    extraL: n(x.extra_l),
    fuerte: x.fuerte === true,
    error: typeof x.error === 'string' ? x.error : null,
  };
}

export const parsearVientos = (v: unknown): VientoViaje[] =>
  (Array.isArray(v) ? v : []).map((x) => parsearViento(x)).filter((x): x is VientoViaje => x !== null);

export const claveViaje = (camionId: number, cargaSalidaId: number) => `${camionId}-${cargaSalidaId}`;

/** Texto corto para la tabla y el acta: «30 km/h en contra · ~57 L extra (36 %)». */
export function resumenViento(w: VientoViaje): string {
  if (w.estado !== 'ok' || w.contraKmh === null) return w.estado === 'error' ? 'Sin dato del viento (se reintenta)' : 'Sin dato del viento';
  const sentido = w.contraKmh >= 0 ? 'en contra' : 'a favor';
  const litros = w.extraL === null ? '' : ` · ${w.extraL >= 0 ? '~' : '−'}${Math.abs(Math.round(w.extraL))} L ${w.extraL >= 0 ? 'extra' : 'menos'}`;
  return `${Math.abs(Math.round(w.contraKmh))} km/h ${sentido}${litros}`;
}
