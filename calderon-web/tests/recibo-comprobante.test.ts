import { describe, expect, it } from 'vitest';
import { parsearRecibos } from '@/modules/finanzas/domain/finanzas.types';
import { comprobanteReciboSchema, reciboSchema } from '@/modules/finanzas/domain/finanzas.schemas';

/** Migración 279 · Comprobante de pago en el recibo de cobranza. */
describe('comprobante del recibo', () => {
  it('lee el comprobante del recibo', () => {
    const [r] = parsearRecibos([{ id: 1, numero: 'RC-000001', comprobante_ruta: 'cobros/47/abc.pdf', comprobante_nombre: 'transf.pdf', facturas: [] }]);
    expect(r).toMatchObject({ comprobanteRuta: 'cobros/47/abc.pdf', comprobanteNombre: 'transf.pdf' });
    expect(parsearRecibos([{ id: 2 }])[0]!.comprobanteRuta).toBeNull();
  });
  it('el recibo acepta el comprobante (o ninguno)', () => {
    const base = { fecha: '2026-11-19', cuentaDineroId: 4, observacion: null, facturas: [{ facturaId: 47, monto: 1000 }] };
    expect(reciboSchema.parse({ ...base, comprobanteRuta: 'cobros/47/abc.pdf', comprobanteNombre: 'transf.pdf' }).comprobanteRuta).toBe('cobros/47/abc.pdf');
    expect(reciboSchema.safeParse(base).success).toBe(true);
    expect(comprobanteReciboSchema.safeParse({ id: 1, ruta: '', nombre: null }).success).toBe(false);
  });
});
