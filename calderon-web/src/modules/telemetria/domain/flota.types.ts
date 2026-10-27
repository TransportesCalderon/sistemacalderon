import type { FechaISO } from '@/shared/types/dominio';

/**
 * Telemetría (migraciones 31 y 32): la base trae cada 10 minutos el último estado de cada
 * camión por la API rFMS (Renault; después Volvo) y lo guarda como lectura. Acá solo se muestra.
 */
export interface CamionEnVivo {
  camionId: number;
  codigoInterno: string;
  patente: string;
  marca: string | null;
  nombreApi: string | null;
  ts: FechaISO | null;
  latitud: number | null;
  longitud: number | null;
  velocidadKmh: number | null;
  rumbo: number | null;
  odometroKm: number | null;
  nivelPct: number | null;
  nivelL: number | null;
  motorEncendido: boolean | null;
}

/** Migración 84: lo que el mapa agrega de cada camión (estela, chofer, viaje y operación). */
export interface DetalleMapa {
  camionId: number;
  /** Posiciones de la más vieja a la más nueva: latitud, longitud, velocidad, hora. */
  estela: { lat: number; lng: number; vel: number | null; ts: string }[];
  chofer: string | null;
  choferFuente: 'tarjeta' | 'asignado';
  viaje: { id: number; numero: string } | null;
  operacion: { numero: number; cliente: string; linea: string | null; estado: string; contenedor: string | null; producto: string | null } | null;
  /** Migración 94: combustible que debería tener (último llenado − inyección + cargas), con el sensor del tanque principal. */
  combustible: CombustibleActual | null;
  /** Migración 96: programador de hoy y Eco Score del día (con el color que decide la base). */
  hoy: ConduccionHoy | null;
}

export type NivelHoy = 'verde' | 'naranja' | 'rojo';
export interface ConduccionHoy {
  programadorPct: number | null;
  programadorNivel: NivelHoy | null;
  eco: { fecha: string; hoy: boolean; total: number; escala: number; marca: string; nivel: NivelHoy | null } | null;
}

const nivelHoy = (v: unknown): NivelHoy | null => (v === 'verde' || v === 'naranja' || v === 'rojo' ? v : null);
function parsearHoy(v: unknown): ConduccionHoy | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const h = v as Record<string, unknown>;
  const e = h.eco && typeof h.eco === 'object' ? (h.eco as Record<string, unknown>) : null;
  return {
    programadorPct: h.programador_pct == null ? null : Number(h.programador_pct),
    programadorNivel: nivelHoy(h.programador_nivel),
    eco: e
      ? {
          fecha: String(e.fecha),
          hoy: e.hoy === true,
          total: Number(e.total),
          escala: Number(e.escala ?? 100),
          marca: String(e.marca ?? ''),
          nivel: nivelHoy(e.nivel),
        }
      : null,
  };
}

export interface CombustibleActual {
  litros: number | null;
  pct: number | null;
  capacidadL: number | null;
  mochilaL: number | null;
  /** 'inyeccion' (contador del motor), 'km' (km × rendimiento) o 'recien_lleno'. */
  metodo: string | null;
  desde: string | null;
  motivo: string | null;
  sensorPct: number | null;
  sensorL: number | null;
}

const numONull = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
function parsearCombustible(v: unknown): CombustibleActual | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const c = v as Record<string, unknown>;
  return {
    litros: numONull(c.litros),
    pct: numONull(c.pct),
    capacidadL: numONull(c.capacidad_l),
    mochilaL: numONull(c.mochila_l),
    metodo: typeof c.metodo === 'string' ? c.metodo : null,
    desde: typeof c.desde === 'string' ? c.desde : null,
    motivo: typeof c.motivo === 'string' ? c.motivo : null,
    sensorPct: numONull(c.sensor_pct),
    sensorL: numONull(c.sensor_l),
  };
}

export function parsearMapa(v: unknown): DetalleMapa[] {
  const o = (x: unknown) => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null);
  return (Array.isArray(v) ? v : []).flatMap((x) => {
    const d = o(x);
    if (!d) return [];
    const viaje = o(d.viaje);
    const op = o(d.operacion);
    return [
      {
        camionId: Number(d.camion_id),
        estela: (Array.isArray(d.estela) ? (d.estela as unknown[][]) : [])
          .filter((p) => Array.isArray(p) && p[0] != null && p[1] != null)
          .map((p) => ({ lat: Number(p[0]), lng: Number(p[1]), vel: p[2] == null ? null : Number(p[2]), ts: String(p[3]) })),
        chofer: typeof d.chofer === 'string' ? d.chofer : null,
        choferFuente: d.chofer_fuente === 'tarjeta' ? 'tarjeta' : 'asignado',
        viaje: viaje ? { id: Number(viaje.id), numero: String(viaje.numero) } : null,
        combustible: parsearCombustible(d.combustible),
        hoy: parsearHoy(d.hoy),
        operacion: op
          ? {
              numero: Number(op.numero),
              cliente: String(op.cliente ?? ''),
              linea: typeof op.linea === 'string' ? op.linea : null,
              estado: String(op.estado ?? ''),
              contenedor: typeof op.contenedor === 'string' ? op.contenedor : null,
              producto: typeof op.producto === 'string' ? op.producto : null,
            }
          : null,
      },
    ];
  });
}

export interface VehiculoApi {
  marca: string;
  vin: string;
  nombre: string | null;
  modelo: string | null;
  camionId: number | null;
  patente: string | null;
}

export interface CorridaApi {
  id: number;
  ejecutadoEn: FechaISO;
  marca: string;
  operacion: string;
  ok: boolean;
  detalle: string | null;
}

/** Minutos desde la última lectura (para mostrar «hace 12 min»). */
export function minutosDesde(ts: string | null, ahora: number = Date.now()): number | null {
  if (!ts) return null;
  const t = new Date(ts).getTime();
  return Number.isNaN(t) ? null : Math.max(0, Math.round((ahora - t) / 60_000));
}

export function haceTexto(min: number | null): string {
  if (min === null) return 'sin datos';
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} días`;
}

/** Estado de la señal: en vivo (≤ 30 min), demorada (≤ 24 h) o sin señal. */
export type Senal = 'vivo' | 'demorada' | 'sin_senal';
export function senalDe(min: number | null): Senal {
  if (min === null || min > 24 * 60) return 'sin_senal';
  return min <= 30 ? 'vivo' : 'demorada';
}

/** Patente al principio del nombre de la API («SRYR 55 // CHOFER», «SHXB49 | CHOFER»), sin espacios. */
export function patenteDeNombre(nombre: string | null): string | null {
  const p =
    (nombre ?? '')
      .split(/[/|]/)[0]
      ?.toUpperCase()
      .replace(/[^A-Z0-9]/g, '') ?? '';
  return p.length >= 5 && p.length <= 8 ? p : null;
}

/** País probable de la patente: Chile (BBBB12 o BB1234) o Argentina (AA123BB o ABC123). Se puede cambiar en el alta. */
export function paisDePatente(patente: string | null): 'CL' | 'AR' | null {
  if (!patente) return null;
  if (/^[A-Z]{4}\d{2}$/.test(patente) || /^[A-Z]{2}\d{4}$/.test(patente)) return 'CL';
  if (/^[A-Z]{2}\d{3}[A-Z]{2}$/.test(patente) || /^[A-Z]{3}\d{3}$/.test(patente)) return 'AR';
  return null;
}

const MARCA: Record<string, string> = { renault: 'Renault Trucks', volvo: 'Volvo' };

/** Enlace al alta de camión con los datos de la API. */
export function enlaceAlta(v: VehiculoApi): string {
  const patente = patenteDeNombre(v.nombre);
  const u = new URLSearchParams({ vin: v.vin });
  if (patente) u.set('patente', patente);
  const pais = paisDePatente(patente);
  if (pais) u.set('pais', pais);
  if (MARCA[v.marca]) u.set('marca', MARCA[v.marca]!);
  if (v.modelo) u.set('modelo', v.modelo);
  return `/flota/camiones/nuevo?${u.toString()}`;
}
