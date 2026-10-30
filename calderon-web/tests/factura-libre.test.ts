import { describe, expect, it } from 'vitest';
import { crearFacturaLibreSchema } from '@/modules/ventas/domain/ventas.schemas';

describe('Factura sin operación (migración 144)', () => {
  it('lleva cliente y renglones escritos a mano', () => {
    const d = crearFacturaLibreSchema.parse({
      clienteId: 3,
      observacion: '',
      renglones: [{ descripcion: ' COSTO ADICIONAL AL CAMIONAJE POR PAGO EN GATE IN EN CAPITAN CORTES ', cantidad: '1', precio: '150,50' }],
    });
    expect(d.renglones[0]).toEqual({ descripcion: 'COSTO ADICIONAL AL CAMIONAJE POR PAGO EN GATE IN EN CAPITAN CORTES', cantidad: 1, precio: 150.5 });
    expect(d.observacion).toBeNull();
  });
  it('sin renglones no se manda', () => {
    expect(crearFacturaLibreSchema.safeParse({ clienteId: 3, observacion: '', renglones: [] }).success).toBe(false);
  });
});
