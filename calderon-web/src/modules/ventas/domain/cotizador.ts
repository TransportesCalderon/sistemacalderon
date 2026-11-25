import { z } from 'zod';

/**
 * Migración 308 · Cotizador como las presentaciones: el costo de un viaje es la suma de sus tramos
 * (vacío hasta el origen, cargado y vacío hasta la base). Cada tramo: gasoil + días × (fijo del camión + chofer)
 * + peajes + neumáticos; el cargado suma el canon del chofer que pase del normal. Todo lo calcula la base.
 */
export type TipoTramo = 'vacio_ida' | 'cargado' | 'vacio_vuelta';
export interface RutaPosible {
  id: number;
  codigo: string;
  km: number | null;
}
export interface TramoViaje {
  tipo: TipoTramo;
  desdeId: number;
  desde: string;
  hastaId: number;
  hasta: string;
  lineaId: number | null;
  ruta: string | null;
  km: number | null;
  /** a_mano, estandar, ruta, mapa o recta (línea recta estimada). */
  fuenteKm: string | null;
  dias: number | null;
  /** a_mano, estandar o estimado. */
  fuenteDias: string | null;
  consumoL100: number | null;
  litros: number | null;
  gasoilUsd: number | null;
  camionChoferUsd: number | null;
  canonUsd: number;
  peajesUsd: number | null;
  neumaticosUsd: number | null;
  totalUsd: number | null;
  estandar: { id: number; km: number; dias: number; consumoL100: number | null; peajesUsd: number | null } | null;
  falta: string | null;
  aviso: string | null;
}
/** Los valores de la base con que se calcula (los cambian Ventas, Gerencia o TI). */
export interface ValoresCotizador {
  fijoDiaUsd: number;
  choferDiaUsd: number;
  consumoCargadoL100: number;
  consumoVacioL100: number;
  neumaticosUsdKm: number;
  peajesUsdKm: number;
  kmDiaCargado: number;
  diasExtraCargado: number;
  kmDiaVacio: number;
  canonNormalClp: number;
  cargasSocialesPct: number;
  margenObjetivoPct: number;
  margenMinimoPct: number;
  gasoilClpLitroFijo: number;
  gasoilDias: number;
  gasoilClpLitro: number | null;
  gasoilFuente: 'cargas' | 'fijo';
  gasoilCargas: number;
  gasoilLitros: number;
  clpPorUsd: number | null;
  gasoilUsdLitro: number | null;
}
export interface ResultadoCotizador {
  origen: string | null;
  destino: string | null;
  rutas: RutaPosible[];
  lineaId: number | null;
  ruta: string | null;
  vacioDesdeId: number | null;
  vacioDesde: string | null;
  vacioHastaId: number | null;
  vacioHasta: string | null;
  tramos: TramoViaje[];
  kmTotal: number | null;
  kmCargado: number | null;
  kmVacio: number | null;
  dias: number | null;
  litros: number | null;
  gasoilUsd: number | null;
  camionChoferUsd: number | null;
  canonUsd: number | null;
  peajesUsd: number | null;
  neumaticosUsd: number | null;
  costoUsd: number | null;
  valores: ValoresCotizador;
  margenPct: number;
  precioUsd: number | null;
  precioKmUsd: number | null;
  precioKmCargadoUsd: number | null;
  tarifaVigenteUsd: number | null;
  tarifaDe: 'cliente' | 'general' | null;
  falta: string | null;
  avisos: string[];
}
export interface TramoEstandar {
  id: number;
  desdeId: number;
  desde: string;
  hastaId: number;
  hasta: string;
  lineaId: number | null;
  ruta: string | null;
  km: number;
  dias: number;
  consumoL100: number | null;
  peajesUsd: number | null;
  nota: string | null;
  actualizadoEn: string | null;
  actualizadoPor: string | null;
}
export interface BaseCotizador extends ValoresCotizador {
  bases: { id: number; nombre: string; pais: string | null }[];
  tramos: TramoEstandar[];
}
/** Lo que se le pide a la base para cotizar (vacío = lo que la base elige). */
export interface OpcionesCotizador {
  origenId: number;
  destinoId: number;
  /** null = la primera ruta cargada; 0 = el camino del mapa. */
  lineaId: number | null;
  /** null = la base más cercana; 0 = sin vacío. */
  vacioDesde: number | null;
  vacioHasta: number | null;
  ajustes: Partial<Record<`${'km' | 'dias'}_${TipoTramo}`, number>>;
  margen: number | null;
  empresaId: number | null;
}

type O = Record<string, unknown>;
const o = (v: unknown): O => (typeof v === 'object' && v !== null ? (v as O) : {});
const n = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const s = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const tipo = (v: unknown): TipoTramo => (v === 'vacio_ida' || v === 'vacio_vuelta' ? v : 'cargado');

function parsearValores(x: O): ValoresCotizador {
  return {
    fijoDiaUsd: n(x.fijo_dia_usd) ?? 0,
    choferDiaUsd: n(x.chofer_dia_usd) ?? 0,
    consumoCargadoL100: n(x.consumo_cargado_l100) ?? 0,
    consumoVacioL100: n(x.consumo_vacio_l100) ?? 0,
    neumaticosUsdKm: n(x.neumaticos_usd_km) ?? 0,
    peajesUsdKm: n(x.peajes_usd_km) ?? 0,
    kmDiaCargado: n(x.km_dia_cargado) ?? 0,
    diasExtraCargado: n(x.dias_extra_cargado) ?? 0,
    kmDiaVacio: n(x.km_dia_vacio) ?? 0,
    canonNormalClp: n(x.canon_normal_clp) ?? 0,
    cargasSocialesPct: n(x.cargas_sociales_pct) ?? 0,
    margenObjetivoPct: n(x.margen_objetivo_pct) ?? 20,
    margenMinimoPct: n(x.margen_minimo_pct) ?? 12,
    gasoilClpLitroFijo: n(x.gasoil_clp_litro_fijo) ?? 0,
    gasoilDias: n(x.gasoil_dias) ?? 15,
    gasoilClpLitro: n(x.gasoil_clp_litro),
    gasoilFuente: x.gasoil_fuente === 'cargas' ? 'cargas' : 'fijo',
    gasoilCargas: n(x.gasoil_cargas) ?? 0,
    gasoilLitros: n(x.gasoil_litros) ?? 0,
    clpPorUsd: n(x.clp_por_usd),
    gasoilUsdLitro: n(x.gasoil_usd_litro),
  };
}

function parsearTramo(v: unknown): TramoViaje {
  const x = o(v);
  const e = x.estandar ? o(x.estandar) : null;
  return {
    tipo: tipo(x.tipo),
    desdeId: n(x.desde_id) ?? 0,
    desde: s(x.desde) ?? '',
    hastaId: n(x.hasta_id) ?? 0,
    hasta: s(x.hasta) ?? '',
    lineaId: n(x.linea_id),
    ruta: s(x.ruta),
    km: n(x.km),
    fuenteKm: s(x.fuente_km),
    dias: n(x.dias),
    fuenteDias: s(x.fuente_dias),
    consumoL100: n(x.consumo_l100),
    litros: n(x.litros),
    gasoilUsd: n(x.gasoil_usd),
    camionChoferUsd: n(x.camion_chofer_usd),
    canonUsd: n(x.canon_usd) ?? 0,
    peajesUsd: n(x.peajes_usd),
    neumaticosUsd: n(x.neumaticos_usd),
    totalUsd: n(x.total_usd),
    estandar: e ? { id: n(e.id) ?? 0, km: n(e.km) ?? 0, dias: n(e.dias) ?? 0, consumoL100: n(e.consumo_l100), peajesUsd: n(e.peajes_usd) } : null,
    falta: s(x.falta),
    aviso: s(x.aviso),
  };
}

export function parsearCotizador(v: unknown): ResultadoCotizador {
  const x = o(v);
  return {
    origen: s(x.origen),
    destino: s(x.destino),
    rutas: arr(x.rutas).map((r) => ({ id: Number(o(r).id), codigo: s(o(r).codigo) ?? '', km: n(o(r).km) })),
    lineaId: n(x.linea_id),
    ruta: s(x.ruta),
    vacioDesdeId: n(x.vacio_desde_id),
    vacioDesde: s(x.vacio_desde),
    vacioHastaId: n(x.vacio_hasta_id),
    vacioHasta: s(x.vacio_hasta),
    tramos: arr(x.tramos).map(parsearTramo),
    kmTotal: n(x.km_total),
    kmCargado: n(x.km_cargado),
    kmVacio: n(x.km_vacio),
    dias: n(x.dias),
    litros: n(x.litros),
    gasoilUsd: n(x.gasoil_usd),
    camionChoferUsd: n(x.camion_chofer_usd),
    canonUsd: n(x.canon_usd),
    peajesUsd: n(x.peajes_usd),
    neumaticosUsd: n(x.neumaticos_usd),
    costoUsd: n(x.costo_usd),
    valores: parsearValores(o(x.valores)),
    margenPct: n(x.margen_pct) ?? 20,
    precioUsd: n(x.precio_usd),
    precioKmUsd: n(x.precio_km_usd),
    precioKmCargadoUsd: n(x.precio_km_cargado_usd),
    tarifaVigenteUsd: n(x.tarifa_vigente_usd),
    tarifaDe: x.tarifa_de === 'cliente' || x.tarifa_de === 'general' ? x.tarifa_de : null,
    falta: s(x.falta),
    avisos: arr(x.avisos).map(String),
  };
}

export function parsearBaseCotizador(v: unknown): BaseCotizador {
  const x = o(v);
  return {
    ...parsearValores(x),
    bases: arr(x.bases).map((b) => ({ id: Number(o(b).id), nombre: s(o(b).nombre) ?? '', pais: s(o(b).pais) })),
    tramos: arr(x.tramos).map((t) => {
      const y = o(t);
      return {
        id: Number(y.id),
        desdeId: n(y.desde_id) ?? 0,
        desde: s(y.desde) ?? '',
        hastaId: n(y.hasta_id) ?? 0,
        hasta: s(y.hasta) ?? '',
        lineaId: n(y.linea_id),
        ruta: s(y.ruta),
        km: n(y.km) ?? 0,
        dias: n(y.dias) ?? 0,
        consumoL100: n(y.consumo_l100),
        peajesUsd: n(y.peajes_usd),
        nota: s(y.nota),
        actualizadoEn: s(y.actualizado_en),
        actualizadoPor: s(y.actualizado_por),
      };
    }),
  };
}

/** Lo que se manda a la base como opciones (solo lo que se eligió; lo demás lo decide la base). */
export function opcionesParaLaBase(p: Omit<OpcionesCotizador, 'origenId' | 'destinoId'>): Record<string, number> {
  const d: Record<string, number> = { ...p.ajustes };
  if (p.lineaId !== null) d.linea_id = p.lineaId;
  if (p.vacioDesde !== null) d.vacio_desde = p.vacioDesde;
  if (p.vacioHasta !== null) d.vacio_hasta = p.vacioHasta;
  if (p.margen !== null) d.margen_pct = p.margen;
  if (p.empresaId !== null) d.empresa_id = p.empresaId;
  return d;
}

/** Lee un número escrito a mano: «2.464», «0,5» y también «1.5» (un punto con 1 o 2 decimales es la coma). */
export const leerNumero = (t: string): number | null => {
  let x = t.trim().replace(/\s/g, '');
  if (x === '') return null;
  if (x.includes(',')) x = x.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(x)) x = x.replace(/\./g, '');
  const v = Number(x);
  return Number.isFinite(v) ? v : null;
};

/** Margen que queda con un precio dado: ganancia ÷ precio, como en las presentaciones. */
export const margenDe = (precio: number | null, costo: number | null): number | null =>
  precio !== null && costo !== null && precio > 0 ? Math.round(((precio - costo) / precio) * 1000) / 10 : null;

const ajustesSchema = z.record(z.string(), z.number());
export const cotizarGuardarSchema = z
  .object({
    empresaId: z.number().int().positive().nullable(),
    empresaNombre: z.string().trim().max(150),
    origenId: z.number({ message: 'Elegí el origen.' }).int().positive('Elegí el origen.'),
    destinoId: z.number({ message: 'Elegí el destino.' }).int().positive('Elegí el destino.'),
    lineaId: z.number().int().min(0).nullable(),
    vacioDesde: z.number().int().min(0).nullable(),
    vacioHasta: z.number().int().min(0).nullable(),
    ajustes: ajustesSchema,
    precioUsd: z.number({ message: 'Escribí el precio.' }).positive('El precio tiene que ser mayor que cero.'),
    viajes: z.number().positive().max(1000),
  })
  .refine((d) => d.empresaId !== null || d.empresaNombre.length >= 2, { message: 'Elegí la empresa o escribí su nombre.', path: ['empresaNombre'] });
export type CotizarGuardarEntrada = z.infer<typeof cotizarGuardarSchema>;

/** Los valores de la base que se cambian (solo los que vienen). */
export const baseCotizadorSchema = z.object({
  valores: z.record(z.string(), z.number()),
  bases: z.array(z.number().int().positive()).max(10).nullable(),
});
export type BaseCotizadorEntrada = z.infer<typeof baseCotizadorSchema>;

/** Guardar (o quitar) el estándar de un tramo. Consumo y peajes: si no vienen, quedan los que tenía. */
export const tramoEstandarSchema = z.object({
  desdeId: z.number().int().positive(),
  hastaId: z.number().int().positive(),
  lineaId: z.number().int().positive().nullable(),
  km: z.number().nullable(),
  dias: z.number().nullable(),
  consumoL100: z.number().nullable().optional(),
  peajesUsd: z.number().nullable().optional(),
  nota: z.string().trim().max(300).optional(),
  quitar: z.boolean(),
});
export type TramoEstandarEntrada = z.infer<typeof tramoEstandarSchema>;

/** Nombre de un tramo para mostrar. */
export const nombreTramo = (t: Pick<TramoViaje, 'tipo' | 'desde' | 'hasta'>): string =>
  `${t.tipo === 'cargado' ? 'Cargado' : 'Vacío'} ${t.desde} → ${t.hasta}`;
