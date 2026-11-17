/**
 * Lo que muestran las pestañas Servicios, Rentabilidad mensual y Auditoría de la ficha del cliente (17/11/2026).
 * La base decide qué ve cada perfil: lo económico es para Gerencia, Finanzas y TI.
 */
export interface ServicioCliente {
  servicioId: number;
  numero: string;
  fecha: string | null;
  estado: string;
  linea: string | null;
  contenedor: string | null;
  precio: number | null;
  moneda: string | null;
  factura: string | null;
}

export interface MesCliente {
  mes: string;
  viajes: number;
  viajesSinPrecio: number;
  ingresoUsd: number | null;
  gananciaUsd: number | null;
  margenPct: number | null;
  facturadoUsd: number | null;
  cobradoUsd: number | null;
}

export interface CambioCliente {
  cuando: string;
  quien: string | null;
  que: string;
  donde: string;
  datos: string | null;
  motivo: string | null;
}

export interface ClienteResumen {
  servicios: ServicioCliente[];
  veIngresos: boolean;
  veRentabilidad: boolean;
  rentabilidad: MesCliente[];
  veAuditoria: boolean;
  auditoria: CambioCliente[];
}

type J = Record<string, unknown>;
const esObj = (x: unknown): x is J => typeof x === 'object' && x !== null && !Array.isArray(x);
const numN = (x: unknown): number | null => (x === null || x === undefined || x === '' || !Number.isFinite(Number(x)) ? null : Number(x));
const txt = (x: unknown): string | null => (typeof x === 'string' && x.trim() !== '' ? x : null);
const lista = (x: unknown): J[] => (Array.isArray(x) ? x.filter(esObj) : []);

export function parsearClienteResumen(crudo: unknown): ClienteResumen {
  const j = esObj(crudo) ? crudo : {};
  return {
    servicios: lista(j.servicios).map((s) => ({
      servicioId: numN(s.servicio_id) ?? 0,
      numero: String(s.numero ?? ''),
      fecha: txt(s.fecha),
      estado: String(s.estado ?? ''),
      linea: txt(s.linea),
      contenedor: txt(s.contenedor),
      precio: numN(s.precio),
      moneda: txt(s.moneda),
      factura: txt(s.factura),
    })),
    veIngresos: j.ve_ingresos === true,
    veRentabilidad: j.ve_rentabilidad === true,
    rentabilidad: lista(j.rentabilidad).map((m) => ({
      mes: String(m.mes ?? ''),
      viajes: numN(m.viajes) ?? 0,
      viajesSinPrecio: numN(m.viajes_sin_precio) ?? 0,
      ingresoUsd: numN(m.ingreso_usd),
      gananciaUsd: numN(m.ganancia_estimada_usd),
      margenPct: numN(m.margen_estimado_pct),
      facturadoUsd: numN(m.facturado_usd),
      cobradoUsd: numN(m.cobrado_usd),
    })),
    veAuditoria: j.ve_auditoria === true,
    auditoria: lista(j.auditoria).map((c) => ({
      cuando: String(c.cuando ?? ''),
      quien: txt(c.quien),
      que: String(c.que ?? ''),
      donde: String(c.donde ?? ''),
      datos: txt(c.datos),
      motivo: txt(c.motivo),
    })),
  };
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** «2026-11» → «noviembre 2026». */
export function nombreMes(mes: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(mes);
  return m ? `${MESES[Number(m[2]) - 1] ?? m[2]} ${m[1]}` : mes;
}

export const ETIQUETA_ESTADO_SERVICIO: Record<string, string> = {
  sin_confirmar: 'Sin confirmar',
  planificado: 'Planificada',
  en_curso: 'En curso',
  entregado: 'Entregada',
  facturado: 'Facturada',
  cancelado: 'Cancelada',
};
