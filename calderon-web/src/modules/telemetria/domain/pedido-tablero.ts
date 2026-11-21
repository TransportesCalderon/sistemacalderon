import { z } from 'zod';

/**
 * Migración 297 · La foto del tablero, solo cuando la pide Telemetría y solo a los Mercedes y los Scania (los Renault
 * y el Volvo mandan sus datos por la API del fabricante). Telemetría la pide desde Seguimiento de viajes; al chofer le
 * llega el aviso al teléfono y lo ve en Mi viaje. Si no la sube, la base no lo deja pedir dinero (con el mismo margen
 * de horas que las otras trabas). Todo lo decide la base; la web muestra.
 */
export const VERSION_PEDIDO_TABLERO = 297;

/** Un pedido de la foto, como lo ve Seguimiento de viajes. */
export interface PedidoTablero {
  id: number;
  camionId: number;
  viajeId: number | null;
  choferId: number | null;
  chofer: string | null;
  motivo: string | null;
  pedidoEn: string;
  pedidoPor: string | null;
  /** Cuándo llegó la foto (null: el chofer todavía no la subió). */
  recibidoEn: string | null;
}

export interface PedidosTablero {
  /** Cuántos días vale un pedido. */
  dias: number;
  /** Camiones a los que Telemetría les puede pedir la foto (hoy, los Mercedes y los Scania). */
  porFoto: number[];
  /** Pedidos vigentes, del más nuevo al más viejo. */
  pedidos: PedidoTablero[];
}

/** Lo que Telemetría le pidió al chofer y todavía no subió (Mi viaje). */
export interface MiPedidoTablero {
  id: number;
  camionId: number;
  patente: string;
  motivo: string | null;
  pedidoEn: string;
}

type J = Record<string, unknown>;
const esObj = (x: unknown): x is J => typeof x === 'object' && x !== null && !Array.isArray(x);
const num = (x: unknown): number | null => (x === null || x === undefined || x === '' || !Number.isFinite(Number(x)) ? null : Number(x));
const txt = (x: unknown): string | null => (typeof x === 'string' && x.trim() !== '' ? x : null);
const lista = (x: unknown): J[] => (Array.isArray(x) ? x.filter(esObj) : []);

export function parsearPedidosTablero(crudo: unknown): PedidosTablero {
  const j = esObj(crudo) ? crudo : {};
  return {
    dias: num(j.dias) ?? 7,
    porFoto: (Array.isArray(j.por_foto) ? j.por_foto : []).map(num).filter((n): n is number => n !== null),
    pedidos: lista(j.pedidos)
      .filter((p) => num(p.id) !== null && num(p.camion_id) !== null)
      .map((p) => ({
        id: Number(p.id),
        camionId: Number(p.camion_id),
        viajeId: num(p.viaje_id),
        choferId: num(p.chofer_id),
        chofer: txt(p.chofer),
        motivo: txt(p.motivo),
        pedidoEn: txt(p.pedido_en) ?? '',
        pedidoPor: txt(p.pedido_por),
        recibidoEn: txt(p.recibido_en),
      })),
  };
}

export function parsearMisPedidosTablero(crudo: unknown): MiPedidoTablero[] {
  return lista(crudo)
    .filter((p) => num(p.id) !== null)
    .map((p) => ({
      id: Number(p.id),
      camionId: num(p.camion_id) ?? 0,
      patente: txt(p.patente) ?? '',
      motivo: txt(p.motivo),
      pedidoEn: txt(p.pedido_en) ?? '',
    }));
}

/** El pedido que se muestra en la fila del camión: el que falta subir; si no hay, el último que llegó. */
export function pedidoDelCamion(datos: PedidosTablero | undefined, camionId: number): PedidoTablero | null {
  const delCamion = (datos?.pedidos ?? []).filter((p) => p.camionId === camionId);
  return delCamion.find((p) => p.recibidoEn === null) ?? delCamion[0] ?? null;
}

/** Lo valida la base (rol, viaje en curso, marca del camión, largo del motivo); acá solo la forma. */
export const pedirTableroSchema = z.object({
  viajeId: z.number().int().positive(),
  motivo: z.string().nullable(),
});
export const anularPedidoTableroSchema = z.object({ id: z.number().int().positive() });
