import { describe, expect, it } from 'vitest';
import { parsearCreada, parsearMisOrdenes, parsearOrdenes, parsearPreparado, parsearSolicitudes } from '@/modules/combustible/domain/orden-carga.types';
import { parsearPendientesEnex } from '@/modules/combustible/domain/enex.types';

/** Migración 284 · Carga en Chile con tarjeta de flota: sin QR, aprobada desde el sistema y registrada con Enex. */
describe('carga en Chile con tarjeta de flota', () => {
  it('la orden creada en Chile no trae palabra y dice qué se autorizó', () => {
    const c = parsearCreada({ id: 7, numero: 'OC-000047', palabra: null, mail: 'tarjeta', autorizado: '300 litros', chofer_avisado: true });
    expect(c).toMatchObject({ mail: 'tarjeta', palabra: '', autorizado: '300 litros', choferAvisado: true });
    expect(parsearCreada({ mail: 'en_cola', palabra: 'GATO-AZUL' })).toMatchObject({ mail: 'en_cola', autorizado: null, choferAvisado: false });
  });

  it('las pantallas saben si es con tarjeta', () => {
    expect(parsearPreparado({ tarjeta: true }).tarjeta).toBe(true);
    expect(parsearPreparado({}).tarjeta).toBe(false);
    expect(parsearSolicitudes([{ id: 1, tarjeta: true, litros: 400 }])[0]).toMatchObject({ tarjeta: true, litros: 400 });
    expect(parsearOrdenes([{ id: 2, tarjeta: true, enex_litros: '340.25' }])[0]).toMatchObject({ tarjeta: true, enexLitros: 340.25 });
    expect(parsearMisOrdenes([{ id: 3, estado: 'autorizada', tarjeta: true, autorizado: 'Tanques: llenos' }])[0]).toMatchObject({
      estado: 'autorizada',
      tarjeta: true,
      autorizado: 'Tanques: llenos',
    });
  });

  it('Shell Card: la carga de una orden que no se registró sola', () => {
    const p = parsearPendientesEnex({
      cargas: [{ id: 9, fecha_hora: '2026-11-19T18:00:00Z', patente: 'SHXB49', litros: 500, situacion: 'orden_sin_registrar', orden: 'OC-000048', motivo_auto: 'Fue a tanque lleno pero no hay fotos del tablero' }],
    });
    expect(p.cargas[0]).toMatchObject({ situacion: 'orden_sin_registrar', orden: 'OC-000048', motivoAuto: 'Fue a tanque lleno pero no hay fotos del tablero' });
    expect(parsearPendientesEnex({ cargas: [{ id: 1, fecha_hora: 'x', situacion: 'falta_registrar' }] }).cargas[0]).toMatchObject({ orden: null, motivoAuto: null });
  });
});
