import { z } from 'zod';

/** Migración 307 · Velocidades máximas por tramo de montaña (normativa de la empresa). */
export type SentidoZona = 'ida' | 'vuelta' | 'ambos';
export type EstadoZona = 'a_verificar' | 'verificada' | 'inactiva';
export interface PuntoZona {
  lat: number;
  lng: number;
}
export interface ZonaVelocidad {
  id: number;
  nombre: string;
  sentido: SentidoZona;
  velocidadMax: number;
  puntos: PuntoZona[];
  anchoM: number;
  km: number | null;
  armadoCon: 'mapa' | 'recta' | 'punto' | null;
  estado: EstadoZona;
  orden: number;
  documento: string | null;
  observacion: string | null;
  verificadaEn: string | null;
  /** GeoJSON del corredor (polígono) y del camino (línea), para el mapa. */
  geom: unknown;
  camino: unknown;
  excesos30d: number;
}

export const ETIQUETA_SENTIDO: Record<SentidoZona, string> = { ida: 'Ida (Argentina → Chile)', vuelta: 'Vuelta (Chile → Argentina)', ambos: 'Los dos sentidos' };
export const ETIQUETA_ESTADO_ZONA: Record<EstadoZona, string> = { a_verificar: 'A verificar', verificada: 'Verificada', inactiva: 'Inactiva' };

type O = Record<string, unknown>;
const o = (v: unknown): O => (typeof v === 'object' && v !== null ? (v as O) : {});
const n = (v: unknown): number | null => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const s = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

export function parsearZonas(v: unknown): ZonaVelocidad[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => {
    const z = o(x);
    const sentido = z.sentido === 'ida' || z.sentido === 'vuelta' ? z.sentido : 'ambos';
    const estado = z.estado === 'verificada' || z.estado === 'inactiva' ? z.estado : 'a_verificar';
    const armado = z.armado_con === 'mapa' || z.armado_con === 'recta' || z.armado_con === 'punto' ? z.armado_con : null;
    return {
      id: Number(z.id),
      nombre: s(z.nombre) ?? '',
      sentido,
      velocidadMax: n(z.velocidad_max) ?? 0,
      puntos: (Array.isArray(z.puntos) ? z.puntos : [])
        .map((p) => ({ lat: n(o(p).lat), lng: n(o(p).lng) }))
        .filter((p): p is PuntoZona => p.lat !== null && p.lng !== null),
      anchoM: n(z.ancho_m) ?? 120,
      km: n(z.km),
      armadoCon: armado,
      estado,
      orden: n(z.orden) ?? 0,
      documento: s(z.documento),
      observacion: s(z.observacion),
      verificadaEn: s(z.verificada_en),
      geom: z.geom ?? null,
      camino: z.camino ?? null,
      excesos30d: n(z.excesos_30d) ?? 0,
    };
  });
}

const punto = z.object({ lat: z.number().min(-60).max(10), lng: z.number().min(-90).max(-30) });
export const guardarZonaSchema = z.object({
  id: z.number().int().positive().nullable(),
  nombre: z.string().trim().min(3, 'Escribí el nombre del tramo.').max(120),
  sentido: z.enum(['ida', 'vuelta', 'ambos']),
  velocidadMax: z.number({ message: 'Escribí la velocidad máxima.' }).int().min(5).max(130),
  anchoM: z.number().int().min(20).max(2000),
  orden: z.number().int().min(0).max(999),
  observacion: z.string().trim().max(500),
  puntos: z.array(punto).min(1, 'Marcá al menos el punto de inicio.').max(30),
});
export type GuardarZonaEntrada = z.infer<typeof guardarZonaSchema>;
export const estadoZonaSchema = z.object({ id: z.number().int().positive(), estado: z.enum(['a_verificar', 'verificada', 'inactiva', 'quitar']) });
