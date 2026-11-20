import { z } from 'zod';

/** Migración 289 · Gastos que paga la empresa y se le cobran al chofer en cuotas (visa de trabajo y otros). */
export interface CargoChofer {
  id: number;
  numero: string;
  concepto: string;
  fecha: string;
  moneda: string;
  total: number;
  cuotas: number;
  desde: string;
  gasto: string | null;
  estado: 'vigente' | 'anulado' | 'condonado';
  motivo: string | null;
  observacion: string | null;
  cuotasDescontadas: number;
  descontado: number;
  saldo: number;
  cuotaDeEsteMes: { numero: number; importe: number } | null;
}

type O = Record<string, unknown>;
const num = (v: unknown) => (v === null || v === undefined || v === '' ? 0 : Number(v));
const txt = (v: unknown) => (typeof v === 'string' ? v : '');
const opc = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null);

export function parsearCargos(v: unknown): CargoChofer[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is O => typeof x === 'object' && x !== null)
    .map((o) => {
      const q = o.cuota_de_este_mes as O | null | undefined;
      const estado = o.estado === 'anulado' || o.estado === 'condonado' ? o.estado : 'vigente';
      return {
        id: num(o.id),
        numero: txt(o.numero),
        concepto: txt(o.concepto),
        fecha: txt(o.fecha),
        moneda: txt(o.moneda),
        total: num(o.total),
        cuotas: num(o.cuotas),
        desde: txt(o.desde),
        gasto: opc(o.gasto),
        estado,
        motivo: opc(o.motivo),
        observacion: opc(o.observacion),
        cuotasDescontadas: num(o.cuotas_descontadas),
        descontado: num(o.descontado),
        saldo: num(o.saldo),
        cuotaDeEsteMes: q && typeof q === 'object' ? { numero: num(q.numero), importe: num(q.importe) } : null,
      };
    });
}

/** Solo forma: las reglas las aplica la base. Van acá y no en las acciones («use server» solo admite funciones async). */
export const cargoChoferSchema = z.object({
  choferId: z.number().int().positive(),
  concepto: z.string().trim().min(3, 'Escribí qué se le cobra.').max(120),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Elegí la fecha.'),
  moneda: z.enum(['ARS', 'CLP', 'USD']),
  total: z.number({ message: 'Escribí el total.' }).positive('El total tiene que ser mayor que cero.'),
  cuotas: z.number().int().min(1, 'Al menos 1 cuota.').max(36, 'Hasta 36 cuotas.'),
  desde: z.string().regex(/^\d{4}-\d{2}$/, 'Elegí el mes de la primera cuota.'),
  gasto: z.string().trim().max(30),
  observacion: z.string().trim().max(500),
});
export const terminarCargoSchema = z.object({ id: z.number().int().positive(), motivo: z.string().trim().min(5, 'Escribí el motivo.').max(500) });
