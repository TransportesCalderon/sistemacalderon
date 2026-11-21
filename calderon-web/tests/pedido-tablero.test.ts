import { describe, expect, it } from 'vitest';
import {
  parsearMisPedidosTablero,
  parsearPedidosTablero,
  pedidoDelCamion,
  pedirTableroSchema,
  VERSION_PEDIDO_TABLERO,
} from '@/modules/telemetria/domain/pedido-tablero';

describe('migración 297 · la foto del tablero solo a pedido de Telemetría', () => {
  const crudo = {
    dias: 7,
    por_foto: [1, '35', null, 'x'],
    pedidos: [
      { id: 4, camion_id: 1, viaje_id: 9001, chofer_id: 1, chofer: 'ZZ Ana', motivo: 'Control', pedido_en: '2026-11-21T15:00:00Z', pedido_por: 'ZZ Tel', recibido_en: '2026-11-21T16:00:00Z' },
      { id: 3, camion_id: 1, viaje_id: 9001, chofer_id: 1, chofer: 'ZZ Ana', motivo: null, pedido_en: '2026-11-21T10:00:00Z', pedido_por: 'ZZ Tel', recibido_en: null },
      { id: 2, camion_id: 35, viaje_id: null, chofer_id: null, chofer: null, motivo: '', pedido_en: '2026-11-20T10:00:00Z', pedido_por: null, recibido_en: '2026-11-20T12:00:00Z' },
      { camion_id: 9 },
    ],
  };

  it('lee los camiones a los que se les puede pedir y los pedidos', () => {
    const d = parsearPedidosTablero(crudo);
    expect(VERSION_PEDIDO_TABLERO).toBe(297);
    expect(d.dias).toBe(7);
    expect(d.porFoto).toEqual([1, 35]);
    expect(d.pedidos.map((p) => p.id)).toEqual([4, 3, 2]);
    expect(d.pedidos[1]).toMatchObject({ camionId: 1, viajeId: 9001, chofer: 'ZZ Ana', motivo: null, recibidoEn: null });
    expect(d.pedidos[2]).toMatchObject({ viajeId: null, choferId: null, motivo: null, pedidoPor: null });
    expect(parsearPedidosTablero(null)).toEqual({ dias: 7, porFoto: [], pedidos: [] });
  });

  it('en la fila del camión va el pedido que falta subir; si no hay, el último que llegó', () => {
    const d = parsearPedidosTablero(crudo);
    expect(pedidoDelCamion(d, 1)?.id).toBe(3);
    expect(pedidoDelCamion(d, 35)?.id).toBe(2);
    expect(pedidoDelCamion(d, 902)).toBeNull();
    expect(pedidoDelCamion(undefined, 1)).toBeNull();
  });

  it('lo que le pidieron al chofer', () => {
    const m = parsearMisPedidosTablero([{ id: 3, camion_id: 1, patente: 'ZZ001AA', motivo: 'Control', pedido_en: '2026-11-21T10:00:00Z' }, { patente: 'sin id' }]);
    expect(m).toEqual([{ id: 3, camionId: 1, patente: 'ZZ001AA', motivo: 'Control', pedidoEn: '2026-11-21T10:00:00Z' }]);
    expect(parsearMisPedidosTablero({})).toEqual([]);
  });

  it('la web solo arma el pedido: el motivo puede ir vacío y lo demás lo valida la base', () => {
    expect(pedirTableroSchema.safeParse({ viajeId: 9001, motivo: null }).success).toBe(true);
    expect(pedirTableroSchema.safeParse({ viajeId: 0, motivo: null }).success).toBe(false);
  });
});
