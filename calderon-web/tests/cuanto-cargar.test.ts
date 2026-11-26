import { describe, expect, it } from 'vitest';
import { datosCuantoCargar, FUENTE_KM, paradasCompletas, parsearCuantoCargar } from '@/modules/telemetria/domain/cuanto-cargar';

describe('migración 309: cuánto cargar para llegar', () => {
  it('lee el recorrido con las dos opciones', () => {
    const r = parsearCuantoCargar({
      patente: 'SHXB49', desde: 'Donde está ahora (en LOS ANDES)', desde_gps: true, gps_en: '2026-11-26T12:30:00Z',
      tramos: [
        { n: 1, desde: 'Donde está ahora (en LOS ANDES)', hasta: 'CLIENTE SANTIAGO', con_carga: true, km: 88, fuente_km: 'mapa', l_100km: 37.5,
          consumo_de: 'este camión en esta ruta, cargado (3 tramos medidos)', litros: 33 },
        { n: 2, desde: 'CLIENTE SANTIAGO', hasta: 'SAN ANTONIO', con_carga: false, km: 115, fuente_km: 'viajes', l_100km: 27.8, litros: 32 },
        { n: 3, desde: 'SAN ANTONIO', hasta: 'LO ESPEJO', con_carga: true, km: 105, fuente_km: 'viajes', l_100km: 38.1, litros: 40 },
      ],
      km: 308, litros_necesarios: 105, litros_actuales: 60, litros_a_mano: true, litros_sistema: null, capacidad_l: 1550, reserva_l: 100,
      justo_l: 45, recomendado_l: 145, entra_l: 1490, llega_justo_l: 0, llega_recomendado_l: 100, no_entra: false, falta: null, avisos: [],
      texto: 'SHXB49: … Justo: cargar 45 L (llega sin reserva). Recomendado: cargar 145 L (llega con 100 L de reserva).',
    });
    expect(r.tramos).toHaveLength(3);
    expect(r.tramos[1]?.conCarga).toBe(false);
    expect(r.justoL).toBe(45);
    expect(r.recomendadoL).toBe(145);
    expect(r.llegaRecomendadoL).toBe(100);
    expect(r.desdeGps).toBe(true);
    expect(FUENTE_KM[r.tramos[1]?.fuenteKm ?? '']).toBe('de los viajes hechos');
  });
  it('sin datos de litros: no hay opciones y dice qué falta', () => {
    const r = parsearCuantoCargar({ tramos: [], km: 0, litros_necesarios: 105, justo_l: null, recomendado_l: null, falta: 'No se sabe cuántos litros tiene ahora: escribilos' });
    expect(r.justoL).toBeNull();
    expect(r.falta).toContain('escribilos');
    expect(r.reservaL).toBe(100);
  });
  it('manda solo las paradas con lugar, y desde y litros vacíos', () => {
    const p = [
      { lugarId: 931, conCarga: true },
      { lugarId: 910, conCarga: false },
    ];
    expect(datosCuantoCargar(null, p, null)).toEqual({ desde_id: null, paradas: [{ lugar_id: 931, con_carga: true }, { lugar_id: 910, con_carga: false }], litros: null });
    expect(paradasCompletas(p)).toBe(true);
    expect(paradasCompletas([...p, { lugarId: null, conCarga: true }])).toBe(false);
    expect(paradasCompletas([])).toBe(false);
  });
});
