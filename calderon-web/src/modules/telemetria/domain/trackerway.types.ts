import type { FechaISO } from '@/shared/types/dominio';

/**
 * Equipos GPS de Trackerway (migraciones 70 a 72): camiones con Teltonika que no son Renault ni Volvo.
 * La base decide qué se trae; la pantalla solo muestra y manda los cambios.
 */
export interface EquipoTrackerway {
  imei: string;
  nombre: string | null;
  camionId: number | null;
  patente: string | null;
  codigoInterno: string | null;
  /** 'renault' o 'volvo' si ese camión ya llega por su propia API. */
  otraApi: string | null;
  importa: boolean;
  ultimoDato: FechaISO | null;
  /** Migración 91: qué datos del motor llegan (con el lector CAN); null si no hay lecturas recientes. */
  motor: Record<string, boolean> | null;
}

/** Datos del motor que puede mandar el lector, en el orden en que se muestran. */
export const DATOS_MOTOR: { clave: string; nombre: string }[] = [
  { clave: 'combustible_total_l', nombre: 'Consumo' },
  { clave: 'odometro_km', nombre: 'Odómetro' },
  { clave: 'horas_motor', nombre: 'Horas' },
  { clave: 'nivel_l', nombre: 'Nivel' },
  { clave: 'rpm', nombre: 'RPM' },
  { clave: 'programador', nombre: 'Programador' },
];

export interface CamionParaEnlazar {
  id: number;
  patente: string;
  codigoInterno: string;
  otraApi: boolean;
}

export interface PanelTrackerway {
  credenciales: boolean;
  tarea: boolean;
  ultima: { en: FechaISO; ok: boolean; detalle: string | null } | null;
  equipos: EquipoTrackerway[];
  camiones: CamionParaEnlazar[];
}

type Obj = Record<string, unknown>;
const txt = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));

export function parsearPanelTrackerway(raw: unknown): PanelTrackerway {
  const j = (raw ?? {}) as Obj;
  const u = j.ultima as Obj | null | undefined;
  return {
    credenciales: j.credenciales === true,
    tarea: j.tarea === true,
    ultima: u ? { en: String(u.en) as FechaISO, ok: u.ok === true, detalle: txt(u.detalle) } : null,
    equipos: ((j.equipos as Obj[] | undefined) ?? []).map((e) => ({
      imei: String(e.imei),
      nombre: txt(e.nombre),
      camionId: num(e.camion_id),
      patente: txt(e.patente),
      codigoInterno: txt(e.codigo_interno),
      otraApi: txt(e.otra_api),
      importa: e.importa === true,
      ultimoDato: txt(e.ultimo_dato) as FechaISO | null,
      motor: e.motor && typeof e.motor === 'object' ? (e.motor as Record<string, boolean>) : null,
    })),
    camiones: ((j.camiones as Obj[] | undefined) ?? []).map((c) => ({
      id: Number(c.id),
      patente: String(c.patente ?? ''),
      codigoInterno: String(c.codigo_interno ?? ''),
      otraApi: c.otra_api === true,
    })),
  };
}

/** Estado de cada equipo, en palabras simples. */
export type EstadoEquipo = 'se_trae' | 'llega_por_otra' | 'sin_enlazar' | 'no_se_trae';
export function estadoEquipo(e: EquipoTrackerway): EstadoEquipo {
  if (e.otraApi) return 'llega_por_otra';
  if (e.camionId === null) return 'sin_enlazar';
  return e.importa ? 'se_trae' : 'no_se_trae';
}
