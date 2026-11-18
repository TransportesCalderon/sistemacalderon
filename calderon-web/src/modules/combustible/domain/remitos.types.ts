/**
 * Migración 277 · Remitos que mandan las estaciones por mail (Shell Rodríguez Peña), leídos por Iris y cruzados con la
 * carga del chofer. Para resolver: «falta registrar» (no hay carga de ese tractor a esa hora), «difiere» (litros, precio
 * por litro, moneda o estación distintos) y «no se leyó» (Iris no pudo leer el PDF).
 */
export interface RemitoEstacion {
  id: number;
  numero: string | null;
  fechaHora: string | null;
  patente: string | null;
  esTractor: boolean;
  chofer: string | null;
  producto: string | null;
  litros: number | null;
  precio: number | null;
  total: number | null;
  moneda: string;
  /** La estación que el sistema reconoce por el CUIT del remito. */
  estacionId: number | null;
  estacion: string | null;
  situacion: 'falta_registrar' | 'difiere' | 'no_se_leyo';
  cargaId: number | null;
  diferencia: string | null;
  avisos: string | null;
  error: string | null;
  archivo: string;
}

export interface PendientesRemitos {
  puedeResolver: boolean;
  activo: boolean;
  ultimaConsulta: { cuando: string; ok: boolean; mensaje: string | null } | null;
  coinciden30Dias: number;
  leyendo: number;
  esperandoChofer: number;
  estaciones: { id: number; nombre: string }[];
  remitos: RemitoEstacion[];
}

type J = Record<string, unknown>;
const esObj = (x: unknown): x is J => typeof x === 'object' && x !== null && !Array.isArray(x);
const num = (x: unknown): number | null => (x === null || x === undefined || x === '' || !Number.isFinite(Number(x)) ? null : Number(x));
const txt = (x: unknown): string | null => (typeof x === 'string' && x.trim() !== '' ? x : null);

export function parsearPendientesRemitos(crudo: unknown): PendientesRemitos {
  const j = esObj(crudo) ? crudo : {};
  const u = esObj(j.ultima_consulta) ? j.ultima_consulta : null;
  return {
    puedeResolver: j.puede_resolver === true,
    activo: j.activo === true,
    ultimaConsulta: u && typeof u.cuando === 'string' ? { cuando: u.cuando, ok: u.ok === true, mensaje: txt(u.mensaje) } : null,
    coinciden30Dias: num(j.coinciden_30_dias) ?? 0,
    leyendo: num(j.leyendo) ?? 0,
    esperandoChofer: num(j.esperando_chofer) ?? 0,
    estaciones: (Array.isArray(j.estaciones) ? j.estaciones : []).filter(esObj).map((e) => ({ id: Number(e.id), nombre: String(e.nombre ?? '') })),
    remitos: (Array.isArray(j.remitos) ? j.remitos : [])
      .filter(esObj)
      .filter((r) => num(r.id) !== null)
      .map((r) => ({
        id: Number(r.id),
        numero: txt(r.numero),
        fechaHora: txt(r.fecha_hora),
        patente: txt(r.patente),
        esTractor: r.es_tractor === true,
        chofer: txt(r.chofer),
        producto: txt(r.producto),
        litros: num(r.litros),
        precio: num(r.precio),
        total: num(r.total),
        moneda: txt(r.moneda) ?? 'ARS',
        estacionId: num(r.estacion_id),
        estacion: txt(r.estacion),
        situacion: r.situacion === 'difiere' ? ('difiere' as const) : r.situacion === 'no_se_leyo' ? ('no_se_leyo' as const) : ('falta_registrar' as const),
        cargaId: num(r.carga_id),
        diferencia: txt(r.diferencia),
        avisos: txt(r.avisos),
        error: txt(r.error),
        archivo: txt(r.archivo) ?? 'remito.pdf',
      })),
  };
}
