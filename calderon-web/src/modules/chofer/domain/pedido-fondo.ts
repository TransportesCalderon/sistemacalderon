import type { Tono } from '@/modules/combustible/components/comun/ui';

/** Migración 278 · Los pedidos de dinero del chofer (lo que ve desde su perfil). */
export type EstadoPedido = 'solicitado' | 'pendiente' | 'aprobado' | 'rechazado' | 'depositado' | 'anulado';
export interface MiPedido {
  id: number;
  numero: string;
  estado: EstadoPedido;
  moneda: string;
  importe: number;
  importeSolicitado: number;
  detalle: string;
  pedidoEn: string;
  motivo: string | null;
  fechaDeposito: string | null;
  puedeAnular: boolean;
}

export const ESTADO_PEDIDO: Record<EstadoPedido, { texto: string; tono: Tono }> = {
  solicitado: { texto: 'Lo está revisando Operaciones', tono: 'alerta' },
  pendiente: { texto: 'Esperando autorización', tono: 'alerta' },
  aprobado: { texto: 'Autorizado: falta el pago', tono: 'marca' },
  rechazado: { texto: 'Rechazado', tono: 'error' },
  depositado: { texto: 'Enviado', tono: 'exito' },
  anulado: { texto: 'Anulado', tono: 'neutro' },
};

type J = Record<string, unknown>;
export function parsearMisPedidos(crudo: unknown): MiPedido[] {
  return (Array.isArray(crudo) ? (crudo as J[]) : []).map((p) => ({
    id: Number(p.id),
    numero: String(p.numero ?? ''),
    estado: (String(p.estado) in ESTADO_PEDIDO ? String(p.estado) : 'solicitado') as EstadoPedido,
    moneda: String(p.moneda ?? 'ARS'),
    importe: Number(p.importe ?? 0),
    importeSolicitado: Number(p.importe_solicitado ?? p.importe ?? 0),
    detalle: String(p.detalle ?? ''),
    pedidoEn: String(p.pedido_en ?? ''),
    motivo: typeof p.motivo === 'string' && p.motivo !== '' ? p.motivo : null,
    fechaDeposito: typeof p.fecha_deposito === 'string' ? p.fecha_deposito : null,
    puedeAnular: p.puede_anular === true,
  }));
}
