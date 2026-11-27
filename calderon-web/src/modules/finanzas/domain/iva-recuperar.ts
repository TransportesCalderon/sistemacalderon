/**
 * Migración 388 · IVA por recuperar: lo que devuelve fin.fn_iva_por_recuperar() (la base hace las cuentas y valida;
 * acá solo se lee). Todo en pesos chilenos.
 */
export type FormaRecuperacion = 'devolucion_exportador' | 'f29' | 'ajuste' | 'otra';
export type EstadoRecuperacion = 'solicitada' | 'recuperada' | 'rechazada' | 'anulada';

export const FORMA_RECUPERACION: Record<FormaRecuperacion, string> = {
  devolucion_exportador: 'Devolución de exportador (SII)',
  f29: 'Usado contra el débito en el F29',
  ajuste: 'Ya recuperado antes del sistema',
  otra: 'Otra',
};
export const ESTADO_RECUPERACION: Record<EstadoRecuperacion, string> = {
  solicitada: 'En trámite',
  recuperada: 'Recuperado',
  rechazada: 'Rechazado',
  anulada: 'Anulado',
};

export interface MesIva {
  mes: string;
  facturas: number;
  neto: number;
  ivaFacturas: number;
  ivaVehiculos: number;
  juntado: number;
  debitoVentas: number;
  recuperado: number;
  porRecuperarAlCierre: number;
}
export interface RecuperacionIva {
  id: number;
  numero: string;
  forma: FormaRecuperacion;
  fecha: string;
  periodoDesde: string | null;
  periodoHasta: string | null;
  montoSolicitado: number;
  estado: EstadoRecuperacion;
  fechaRecuperada: string | null;
  montoRecuperado: number | null;
  numeroTramite: string | null;
  nota: string | null;
  motivo: string | null;
}
export interface IvaPorRecuperar {
  desde: string | null;
  ivaPct: number;
  resumen: { juntado: number; recuperado: number; enTramite: number; porRecuperar: number; disponible: number; facturas: number; vehiculos: number };
  comparar: { cuentaIvaCredito: number | null; debitoVentas: number | null };
  meses: MesIva[];
  proveedores: { proveedor: string; facturas: number; iva: number }[];
  recuperaciones: RecuperacionIva[];
  avisos: string[];
  puedeEditar: boolean;
}

const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const numONull = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const num = (v: unknown): number => numONull(v) ?? 0;
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const FORMAS = Object.keys(FORMA_RECUPERACION) as FormaRecuperacion[];
const ESTADOS = Object.keys(ESTADO_RECUPERACION) as EstadoRecuperacion[];

export function parsearIvaPorRecuperar(v: unknown): IvaPorRecuperar {
  const o = obj(v);
  const r = obj(o.resumen);
  const c = obj(o.comparar);
  return {
    desde: texto(o.desde),
    ivaPct: num(o.iva_pct) || 19,
    resumen: {
      juntado: num(r.juntado),
      recuperado: num(r.recuperado),
      enTramite: num(r.en_tramite),
      porRecuperar: num(r.por_recuperar),
      disponible: num(r.disponible_para_pedir),
      facturas: num(r.facturas),
      vehiculos: num(r.vehiculos),
    },
    comparar: { cuentaIvaCredito: numONull(c.cuenta_iva_credito), debitoVentas: numONull(c.debito_ventas) },
    meses: arr(o.meses).map((x) => {
      const m = obj(x);
      return {
        mes: String(m.mes ?? ''),
        facturas: num(m.facturas),
        neto: num(m.neto),
        ivaFacturas: num(m.iva_facturas),
        ivaVehiculos: num(m.iva_vehiculos),
        juntado: num(m.juntado),
        debitoVentas: num(m.debito_ventas),
        recuperado: num(m.recuperado),
        porRecuperarAlCierre: num(m.por_recuperar_al_cierre),
      };
    }),
    proveedores: arr(o.proveedores).map((x) => {
      const p = obj(x);
      return { proveedor: texto(p.proveedor) ?? 'Sin proveedor', facturas: num(p.facturas), iva: num(p.iva) };
    }),
    recuperaciones: arr(o.recuperaciones).flatMap((x) => {
      const p = obj(x);
      const forma = FORMAS.find((f) => f === p.forma);
      const estado = ESTADOS.find((e) => e === p.estado);
      const id = num(p.id);
      if (!forma || !estado || id <= 0) return [];
      return [
        {
          id,
          numero: String(p.numero ?? ''),
          forma,
          fecha: String(p.fecha ?? ''),
          periodoDesde: texto(p.periodo_desde),
          periodoHasta: texto(p.periodo_hasta),
          montoSolicitado: num(p.monto_solicitado),
          estado,
          fechaRecuperada: texto(p.fecha_recuperada),
          montoRecuperado: numONull(p.monto_recuperado),
          numeroTramite: texto(p.numero_tramite),
          nota: texto(p.nota),
          motivo: texto(p.motivo),
        },
      ];
    }),
    avisos: arr(o.avisos).filter((a): a is string => typeof a === 'string' && a.trim() !== ''),
    puedeEditar: o.puede_editar === true,
  };
}

/** Monto escrito a mano en pesos chilenos («1.234.567» o «1234567») → número; vacío o inválido → NaN. */
export function montoClp(s: string): number {
  const t = s.trim().replace(/\$/g, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  return t === '' ? NaN : Math.round(Number(t));
}
