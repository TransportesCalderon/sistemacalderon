import { describe, expect, it } from 'vitest';
import { MOTIVO_NO_CARGO, parsearMisOrdenes, parsearOrdenes, parsearVencidasSinTicket } from '@/modules/combustible/domain/orden-carga.types';

/** Cambio 360 · Órdenes de Chile que vencen sin ticket: quedan pendientes en la oficina y en Mi viaje. */
describe('órdenes de Chile vencidas sin ticket', () => {
  it('lee la lista de la oficina con lo que puede hacer quien mira', () => {
    const v = parsearVencidasSinTicket({
      puede_ticket: true,
      puede_anular: false,
      ordenes: [
        {
          id: 36,
          numero: 'OC-000036',
          patente: 'SHXB49',
          chofer: 'Martinez, Matias',
          estacion: 'Shell Los Andes',
          medio_pago: 'tarjeta',
          autorizado: 'Tanques: 150 L',
          autorizada_en: '2026-11-24T15:36:00+00:00',
          vence_en: '2026-11-26T03:36:00+00:00',
          creada_por: 'Verónica Gonzalez',
          chofer_la_ve: true,
        },
      ],
    });
    expect(v.puedeTicket).toBe(true);
    expect(v.puedeAnular).toBe(false);
    expect(v.ordenes[0]).toEqual({
      id: 36,
      numero: 'OC-000036',
      patente: 'SHXB49',
      chofer: 'Martinez, Matias',
      estacion: 'Shell Los Andes',
      transferencia: false,
      autorizado: 'Tanques: 150 L',
      autorizadaEn: '2026-11-24T15:36:00+00:00',
      venceEn: '2026-11-26T03:36:00+00:00',
      creadaPor: 'Verónica Gonzalez',
      choferLaVe: true,
    });
  });

  it('sin datos no se rompe', () => {
    expect(parsearVencidasSinTicket(null)).toEqual({ puedeTicket: false, puedeAnular: false, ordenes: [] });
    expect(parsearVencidasSinTicket({ ordenes: [{ id: 1, medio_pago: 'transferencia' }] }).ordenes[0]).toMatchObject({
      transferencia: true,
      choferLaVe: false,
      venceEn: null,
    });
  });

  it('Mi viaje marca vencida solo la de Chile autorizada que pasó la hora (no la vigente, ni la del genset, ni la de Argentina)', () => {
    const ahora = Date.parse('2026-11-26T12:00:00Z');
    const vencidas = parsearMisOrdenes(
      [
        { id: 1, estado: 'autorizada', tarjeta: true, vence_en: '2026-11-26T03:36:00+00:00' },
        { id: 2, estado: 'autorizada', tarjeta: true, vence_en: '2026-11-27T03:36:00+00:00' },
        { id: 3, estado: 'autorizada', tarjeta: true, genset: true, vence_en: '2026-11-26T03:36:00+00:00' },
        { id: 4, estado: 'autorizada', tarjeta: false, vence_en: '2026-11-26T03:36:00+00:00' },
        { id: 5, estado: 'emitida', tarjeta: true, vence_en: '2026-11-26T03:36:00+00:00' },
      ],
      ahora,
    ).map((o) => o.vencida);
    expect(vencidas).toEqual([true, false, false, false, false]);
  });

  it('la lista de órdenes trae el genset, y el motivo de «No cargó» alcanza para la base', () => {
    expect(parsearOrdenes([{ id: 5, estado: 'vencida', tarjeta: true, genset_id: 7 }])[0]).toMatchObject({ estado: 'vencida', tarjeta: true, gensetId: 7 });
    expect(parsearOrdenes([{ id: 6 }])[0]!.gensetId).toBeNull();
    // fue.fn_anular_orden_carga pide al menos 5 letras
    expect(MOTIVO_NO_CARGO.trim().length).toBeGreaterThanOrEqual(5);
  });
});
