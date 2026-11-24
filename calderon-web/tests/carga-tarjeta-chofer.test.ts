import { describe, expect, it } from 'vitest';
import { parsearCargaTarjetaInformada, parsearOpcionesCargaTarjeta, VERSION_CARGA_TARJETA_CHOFER } from '@/modules/combustible/domain/orden-carga.types';

/** Migración 304 · Chile: el chofer avisa la carga con tarjeta de flota y sube el ticket (con orden o sin ella). */
describe('carga con tarjeta que avisa el chofer', () => {
  it('lee los camiones y las estaciones de Chile, con la más cercana elegida', () => {
    const op = parsearOpcionesCargaTarjeta({
      camiones: [{ id: 1, patente: 'SHXB49' }],
      camion_id: 1,
      estaciones: [
        { id: 36, nombre: 'Shell Los Andes', km: '0.2' },
        { id: 40, nombre: 'Shell Lo Espejo', km: null },
      ],
      cerca: 36,
    });
    expect(op).toEqual({
      camiones: [{ id: 1, patente: 'SHXB49' }],
      camionId: 1,
      estaciones: [
        { id: 36, nombre: 'Shell Los Andes', km: 0.2 },
        { id: 40, nombre: 'Shell Lo Espejo', km: null },
      ],
      cerca: 36,
    });
  });

  it('sin camión ni GPS no se rompe', () => {
    expect(parsearOpcionesCargaTarjeta(null)).toEqual({ camiones: [], camionId: null, estaciones: [], cerca: null });
    expect(parsearOpcionesCargaTarjeta({ camiones: [], estaciones: [{ id: 36, nombre: 'Shell Los Andes' }] }).estaciones[0]).toEqual({ id: 36, nombre: 'Shell Los Andes', km: null });
  });

  it('lo que devuelve la base al mandar el ticket', () => {
    expect(parsearCargaTarjetaInformada({ numero: 'OC-000047', litros: '420.75', nueva: true, alerta: false })).toEqual({ numero: 'OC-000047', litros: 420.75, nueva: true });
    expect(parsearCargaTarjetaInformada({ numero: 'OC-000048', litros: 150.5, nueva: false })).toMatchObject({ numero: 'OC-000048', nueva: false });
  });

  it('la pantalla aparece con la migración 304', () => {
    expect(VERSION_CARGA_TARJETA_CHOFER).toBe(304);
  });
});
