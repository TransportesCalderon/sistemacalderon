import { z } from 'zod';

/** Migración 305 · Cotizador simple: precio por km con los costos reales de la empresa. */
export interface RutaPosible {
  id: number;
  codigo: string;
  km: number;
}
export interface ResultadoCotizador {
  origen: string | null;
  destino: string | null;
  regreso: string | null;
  rutas: RutaPosible[];
  lineaId: number | null;
  ruta: string | null;
  kmCargado: number | null;
  fuenteKm: 'ruta' | 'mapa' | null;
  kmVacio: number;
  kmTotal: number | null;
  costoKmUsd: number | null;
  fuenteCosto: string | null;
  costoDesde: string | null;
  costoHasta: string | null;
  costoUsd: number | null;
  margenPct: number;
  precioUsd: number | null;
  precioKmUsd: number | null;
  precioKmCargadoUsd: number | null;
  tarifaVigenteUsd: number | null;
  tarifaDe: 'cliente' | 'general' | null;
  falta: string | null;
}
export interface MesCosto {
  mes: string;
  hasta: string;
  costoUsd: number | null;
  km: number | null;
  camiones: number;
  costoKmUsd: number | null;
  combustibleUsd: number | null;
  cargasUsd: number | null;
  usado: boolean;
}
export interface BaseCosto {
  costoKmUsd: number | null;
  costoUsd: number | null;
  km: number | null;
  desde: string | null;
  hasta: string | null;
  mesesPedidos: number;
  hastaHoy: boolean;
  combustibleDeCargas: boolean;
  cuentasFuera: string[];
  combustibleContableUsd: number | null;
  combustibleCargasUsd: number | null;
  meses: MesCosto[];
  cuentas: { codigo: string; nombre: string; usd: number; pct: number | null }[];
  kmDeCierres: number | null;
  camionesSinKm: string[];
}

type O = Record<string, unknown>;
const o = (v: unknown): O => (typeof v === 'object' && v !== null ? (v as O) : {});
const n = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const s = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export function parsearCotizador(v: unknown): ResultadoCotizador {
  const x = o(v);
  return {
    origen: s(x.origen),
    destino: s(x.destino),
    regreso: s(x.regreso),
    rutas: arr(x.rutas).map((r) => ({ id: Number(o(r).id), codigo: s(o(r).codigo) ?? '', km: n(o(r).km) ?? 0 })),
    lineaId: n(x.linea_id),
    ruta: s(x.ruta),
    kmCargado: n(x.km_cargado),
    fuenteKm: x.fuente_km === 'ruta' || x.fuente_km === 'mapa' ? x.fuente_km : null,
    kmVacio: n(x.km_vacio) ?? 0,
    kmTotal: n(x.km_total),
    costoKmUsd: n(x.costo_km_usd),
    fuenteCosto: s(x.fuente_costo),
    costoDesde: s(x.costo_desde),
    costoHasta: s(x.costo_hasta),
    costoUsd: n(x.costo_usd),
    margenPct: n(x.margen_pct) ?? 20,
    precioUsd: n(x.precio_usd),
    precioKmUsd: n(x.precio_km_usd),
    precioKmCargadoUsd: n(x.precio_km_cargado_usd),
    tarifaVigenteUsd: n(x.tarifa_vigente_usd),
    tarifaDe: x.tarifa_de === 'cliente' || x.tarifa_de === 'general' ? x.tarifa_de : null,
    falta: s(x.falta),
  };
}

export function parsearBaseCosto(v: unknown): BaseCosto {
  const x = o(v);
  return {
    costoKmUsd: n(x.costo_km_usd),
    costoUsd: n(x.costo_usd),
    km: n(x.km),
    desde: s(x.desde),
    hasta: s(x.hasta),
    mesesPedidos: n(x.meses_pedidos) ?? 3,
    hastaHoy: x.hasta_hoy === true,
    combustibleDeCargas: x.combustible_de_cargas !== false,
    cuentasFuera: arr(x.cuentas_fuera).map(String),
    combustibleContableUsd: n(x.combustible_contable_usd),
    combustibleCargasUsd: n(x.combustible_cargas_usd),
    meses: arr(x.meses).map((m) => {
      const y = o(m);
      return {
        mes: s(y.mes) ?? '',
        hasta: s(y.hasta) ?? '',
        costoUsd: n(y.costo_usd),
        km: n(y.km),
        camiones: n(y.camiones) ?? 0,
        costoKmUsd: n(y.costo_km_usd),
        combustibleUsd: n(y.combustible_usd),
        cargasUsd: n(y.cargas_usd),
        usado: y.usado === true,
      };
    }),
    cuentas: arr(x.cuentas).map((c) => ({ codigo: s(o(c).codigo) ?? '', nombre: s(o(c).nombre) ?? '', usd: n(o(c).usd) ?? 0, pct: n(o(c).pct) })),
    kmDeCierres: n(x.km_de_cierres),
    camionesSinKm: arr(x.camiones_sin_km).map(String),
  };
}

/** Margen que queda con un precio dado (sobre el costo). */
export const margenDe = (precio: number | null, costo: number | null): number | null =>
  precio !== null && costo !== null && costo > 0 ? Math.round(((precio - costo) / costo) * 1000) / 10 : null;

export const cotizarGuardarSchema = z
  .object({
    empresaId: z.number().int().positive().nullable(),
    empresaNombre: z.string().trim().max(150),
    origenId: z.number({ message: 'Elegí el origen.' }).int().positive('Elegí el origen.'),
    destinoId: z.number({ message: 'Elegí el destino.' }).int().positive('Elegí el destino.'),
    lineaId: z.number().int().positive().nullable(),
    vueltaVacia: z.boolean(),
    precioUsd: z.number({ message: 'Escribí el precio.' }).positive('El precio tiene que ser mayor que cero.'),
    viajes: z.number().positive().max(1000),
    observacion: z.string().trim().max(2000),
  })
  .refine((d) => d.empresaId !== null || d.empresaNombre.length >= 2, { message: 'Elegí la empresa o escribí su nombre.', path: ['empresaNombre'] });
export type CotizarGuardarEntrada = z.infer<typeof cotizarGuardarSchema>;

export const baseCostoSchema = z.object({
  meses: z.number().int().min(1).max(12),
  hastaHoy: z.boolean(),
  combustibleDeCargas: z.boolean(),
});
