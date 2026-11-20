/**
 * Shell 02 · Cargas de Shell Card informadas por Enex que hay que resolver: las que nadie registró
 * («falta registrar») y las registradas con otros números («difiere»). Enex comanda: se registra y se corrige con sus datos.
 * Migración 284: las de una orden de carga de Chile se registran y corrigen solas; acá quedan las que no se pudieron.
 */
export interface CargaEnex {
  id: number;
  fechaHora: string;
  patente: string;
  esTractor: boolean;
  litros: number;
  precioClp: number | null;
  montoClp: number | null;
  producto: string | null;
  donde: string | null;
  documento: string | null;
  /** La estación de IronTrack que el sistema ya recuerda para esa estación de Enex. */
  estacionId: number | null;
  /** Migración 284: «orden_sin_registrar» = es de una orden de carga con tarjeta que no se pudo registrar sola. */
  situacion: 'falta_registrar' | 'orden_sin_registrar' | 'difiere';
  cargaId: number | null;
  diferencia: string | null;
  /** Migración 284: la orden de carga (Chile) y por qué no se resolvió sola. */
  orden: string | null;
  motivoAuto: string | null;
}

export interface PendientesEnex {
  puedeResolver: boolean;
  ultimaConsulta: { cuando: string; ok: boolean; mensaje: string | null } | null;
  estaciones: { id: number; nombre: string }[];
  cargas: CargaEnex[];
}

type J = Record<string, unknown>;
const esObj = (x: unknown): x is J => typeof x === 'object' && x !== null && !Array.isArray(x);
const num = (x: unknown): number | null => (x === null || x === undefined || x === '' || !Number.isFinite(Number(x)) ? null : Number(x));
const txt = (x: unknown): string | null => (typeof x === 'string' && x.trim() !== '' ? x : null);

export function parsearPendientesEnex(crudo: unknown): PendientesEnex {
  const j = esObj(crudo) ? crudo : {};
  const u = esObj(j.ultima_consulta) ? j.ultima_consulta : null;
  return {
    puedeResolver: j.puede_resolver === true,
    ultimaConsulta: u && typeof u.cuando === 'string' ? { cuando: u.cuando, ok: u.ok === true, mensaje: txt(u.mensaje) } : null,
    estaciones: (Array.isArray(j.estaciones) ? j.estaciones : []).filter(esObj).map((e) => ({ id: Number(e.id), nombre: String(e.nombre ?? '') })),
    cargas: (Array.isArray(j.cargas) ? j.cargas : [])
      .filter(esObj)
      .filter((c) => num(c.id) !== null && typeof c.fecha_hora === 'string')
      .map((c) => ({
        id: Number(c.id),
        fechaHora: String(c.fecha_hora),
        patente: String(c.patente ?? ''),
        esTractor: c.es_tractor === true,
        litros: num(c.litros) ?? 0,
        precioClp: num(c.precio_clp),
        montoClp: num(c.monto_clp),
        producto: txt(c.producto),
        donde: txt(c.donde),
        documento: txt(c.documento),
        estacionId: num(c.estacion_id),
        situacion:
          c.situacion === 'difiere' ? ('difiere' as const) : c.situacion === 'orden_sin_registrar' ? ('orden_sin_registrar' as const) : ('falta_registrar' as const),
        cargaId: num(c.carga_id),
        diferencia: txt(c.diferencia),
        orden: txt(c.orden),
        motivoAuto: txt(c.motivo_auto),
      })),
  };
}
