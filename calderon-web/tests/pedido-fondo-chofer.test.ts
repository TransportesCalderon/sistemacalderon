import { describe, expect, it } from 'vitest';
import { ESTADO_PEDIDO, parsearMisPedidos } from '@/modules/chofer/domain/pedido-fondo';

/** Migración 278 · Pedido de dinero desde el perfil del chofer. */
describe('mis pedidos de dinero', () => {
  it('lee lo que devuelve la base', () => {
    const [a, b] = parsearMisPedidos([
      { id: 4, numero: 'PF-000004', estado: 'depositado', moneda: 'ARS', importe: '150000.00', importe_solicitado: '200000.00', detalle: 'Viaje a Santiago',
        pedido_en: '2026-11-19T14:00:00Z', fecha_deposito: '2026-11-19', puede_anular: false },
      { id: 5, numero: 'PF-000005', estado: 'solicitado', moneda: 'CLP', importe: 20000, detalle: 'Peajes', puede_anular: true, motivo: '' },
    ]);
    expect(a).toMatchObject({ importe: 150000, importeSolicitado: 200000, estado: 'depositado', fechaDeposito: '2026-11-19' });
    expect(b).toMatchObject({ importeSolicitado: 20000, puedeAnular: true, motivo: null });
    expect(ESTADO_PEDIDO[b!.estado].texto).toBe('Lo está revisando Operaciones');
    expect(parsearMisPedidos({})).toEqual([]);
  });
  it('un estado desconocido queda como pedido en revisión', () => {
    expect(parsearMisPedidos([{ id: 1, estado: 'raro' }])[0]!.estado).toBe('solicitado');
  });
});
