import { RepoError, type Db } from '@/shared/repository/types';

/**
 * Operaciones a las que les falta el cliente real («SIN CLIENTE») o el precio (pedido de Gerencia, 17/11/2026).
 * La base decide qué ve cada uno: Operaciones, todas; Gerencia, las que pasaron el plazo sin resolverse.
 */
export interface OperacionIncompleta {
  servicioId: number;
  numero: string;
  estado: string;
  faltaCliente: boolean;
  faltaPrecio: boolean;
  cliente: string | null;
  linea: string | null;
  dias: number;
  vencida: boolean;
  cargadaPor: string | null;
}

export interface OperacionesIncompletas {
  alcance: 'todas' | 'vencidas' | 'nada';
  plazoGerenciaDias: number;
  total: number;
  sinCliente: number;
  sinPrecio: number;
  vencidas: number;
  operaciones: OperacionIncompleta[];
}

type J = Record<string, unknown>;
const esObj = (x: unknown): x is J => typeof x === 'object' && x !== null && !Array.isArray(x);
const num = (x: unknown): number => (Number.isFinite(Number(x)) ? Number(x) : 0);
const txt = (x: unknown): string | null => (typeof x === 'string' && x.trim() !== '' ? x : null);

export function parsearOperacionesIncompletas(crudo: unknown): OperacionesIncompletas {
  const j = esObj(crudo) ? crudo : {};
  return {
    alcance: j.alcance === 'todas' || j.alcance === 'vencidas' ? j.alcance : 'nada',
    plazoGerenciaDias: num(j.plazo_gerencia_dias) || 3,
    total: num(j.total),
    sinCliente: num(j.sin_cliente),
    sinPrecio: num(j.sin_precio),
    vencidas: num(j.vencidas),
    operaciones: (Array.isArray(j.operaciones) ? j.operaciones : [])
      .filter(esObj)
      .filter((o) => o.numero !== null && o.numero !== undefined)
      .map((o) => ({
        servicioId: num(o.servicio_id),
        numero: String(o.numero),
        estado: String(o.estado ?? ''),
        faltaCliente: o.falta_cliente === true,
        faltaPrecio: o.falta_precio === true,
        cliente: txt(o.cliente),
        linea: txt(o.linea),
        dias: num(o.dias),
        vencida: o.vencida === true,
        cargadaPor: txt(o.cargada_por),
      })),
  };
}

/** «12 operaciones sin precio y 3 sin cliente». */
export function resumenIncompletas(d: Pick<OperacionesIncompletas, 'sinCliente' | 'sinPrecio'>): string {
  const partes = [
    d.sinPrecio > 0 ? `${d.sinPrecio} ${d.sinPrecio === 1 ? 'operación' : 'operaciones'} sin precio` : null,
    d.sinCliente > 0 ? `${d.sinCliente} sin cliente` : null,
  ].filter(Boolean);
  if (partes.length === 2 && d.sinPrecio === 0) return partes.join(' y ');
  return d.sinPrecio === 0 && d.sinCliente > 0 ? `${d.sinCliente} ${d.sinCliente === 1 ? 'operación' : 'operaciones'} sin cliente` : partes.join(' y ');
}

export function faltaEn(o: Pick<OperacionIncompleta, 'faltaCliente' | 'faltaPrecio'>): string {
  return o.faltaCliente && o.faltaPrecio ? 'Faltan el cliente y el precio' : o.faltaCliente ? 'Falta el cliente' : 'Falta el precio';
}

export async function leerOperacionesIncompletas(db: Db): Promise<OperacionesIncompletas> {
  const { data, error } = await db.schema('ops').rpc('fn_operaciones_incompletas');
  if (error) throw new RepoError(error);
  return parsearOperacionesIncompletas(data);
}
