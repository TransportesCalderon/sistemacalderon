import { describe, expect, it } from 'vitest';
import { buscarEnMapa, letrasDe, normalizar, type CelularBuscable } from '@/modules/telemetria/domain/buscar-en-mapa';
import type { CamionEnVivo, DetalleMapa } from '@/modules/telemetria/domain/flota.types';
import type { FechaISO } from '@/shared/types/dominio';

const camion = (camionId: number, patente: string, codigoInterno: string, conPosicion = true): CamionEnVivo => ({
  camionId, codigoInterno, patente, marca: 'volvo', nombreApi: null, ts: '2026-11-26T12:00:00Z' as FechaISO,
  latitud: conPosicion ? -33 : null, longitud: conPosicion ? -70 : null, velocidadKmh: 0, rumbo: null, odometroKm: null,
  nivelPct: null, nivelL: null, motorEncendido: false,
});
const detalle = (camionId: number, chofer: string | null, op: { numero: number; cliente: string; contenedor?: string } | null): DetalleMapa => ({
  camionId, estadoMotor: null, estela: [], chofer, choferFuente: 'tarjeta', viaje: null,
  operacion: op ? { numero: op.numero, cliente: op.cliente, linea: 'SAI-MZA', estado: 'en_curso', contenedor: op.contenedor ?? null, producto: null } : null,
  combustible: null, hoy: null, choferId: null, consumoMes: null, consumo4h: null,
});

const camiones = [
  camion(1, 'SHXB49', 'T-12'),
  camion(2, 'AF123KD', 'T-03'),
  camion(3, 'SXXV17', 'T-21'),
  camion(4, 'KLMN33', 'T-16', false),
  camion(5, 'AB111CD', 'T-01'),
];
const detalles = [
  detalle(1, 'Martínez, Juan', { numero: 6300, cliente: 'Compass Cargo', contenedor: 'MSCU 123456-7' }),
  detalle(2, 'Pérez, Raúl', { numero: 6301, cliente: 'Humber Chile SpA' }),
  detalle(3, 'López, Marcelo', { numero: 16300, cliente: 'Trangesa' }),
  detalle(4, 'Rojas, Andrés', null),
  detalle(5, 'Fernández, Luis', { numero: 6290, cliente: 'Compass Cargo' }),
];
const celulares: CelularBuscable[] = [{ choferId: 300, chofer: 'Ibarra, Néstor', numeroOperacion: 6299, patente: 'AA222BB', latitud: -32.9, longitud: -68.8 }];
const ids = (texto: string, cel: CelularBuscable[] = []) => buscarEnMapa(texto, camiones, detalles, cel).resultados.map((r) => `${r.tipo[0]}${r.id}`);

describe('buscador del Mapa de flota (26/11/2026)', () => {
  it('no busca con menos de 2 letras o números', () => {
    expect(ids('4')).toEqual([]);
    expect(ids(' - ')).toEqual([]);
    expect(letrasDe('SHXB-49')).toBe(6);
  });

  it('encuentra la patente con o sin espacios y guiones, y el código interno', () => {
    expect(ids('SHXB49')).toEqual(['c1']);
    expect(ids('shxb 49')).toEqual(['c1']);
    expect(ids('shxb-49')).toEqual(['c1']);
    expect(ids('t-03')).toEqual(['c2']);
  });

  it('encuentra al chofer sin acentos ni mayúsculas, en cualquier orden', () => {
    expect(ids('martinez')).toEqual(['c1']);
    expect(ids('juan martínez')).toEqual(['c1']);
    expect(ids('PEREZ')).toEqual(['c2']);
    expect(normalizar('Fernández')).toBe('fernandez');
  });

  it('encuentra por operación (la exacta primero), cliente y contenedor', () => {
    expect(ids('6300')).toEqual(['c1', 'c3']);
    expect(ids('op 6300')).toEqual(['c1', 'c3']);
    expect(ids('16300')).toEqual(['c3']);
    expect(ids('Op. 6301')).toEqual(['c2']);
    expect(ids('compass')).toEqual(['c5', 'c1']);
    expect(ids('mscu1234567')).toEqual(['c1']);
    expect(ids('compass martinez')).toEqual(['c1']);
  });

  it('la patente que empieza así va antes que la que lo tiene en el medio', () => {
    const dos = [camion(11, 'AAB12', 'T-40'), camion(12, 'ABZ99', 'T-41')];
    expect(buscarEnMapa('ab', dos, []).resultados.map((x) => x.id)).toEqual([12, 11]);
  });

  it('muestra los que no tienen posición, marcados y al final', () => {
    const r = buscarEnMapa('rojas', camiones, detalles).resultados;
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ tipo: 'camion', id: 4, conPosicion: false, titulo: 'KLMN33 · Rojas, Andrés', texto: 'KLMN33' });
    // «an»: Rojas, Andrés empieza así, pero no está en el mapa
    expect(ids('an').at(-1)).toBe('c4');
  });

  it('arma el título y el detalle de cada camión', () => {
    const [r] = buscarEnMapa('shxb49', camiones, detalles).resultados;
    expect(r).toMatchObject({ titulo: 'SHXB49 · Martínez, Juan', detalle: 'Op. 6300 · Compass Cargo · MSCU 123456-7 · T-12', texto: 'SHXB49' });
  });

  it('busca en los celulares solo si el mapa los muestra', () => {
    expect(ids('ibarra')).toEqual([]);
    expect(ids('ibarra', celulares)).toEqual(['c300']);
    const [r] = buscarEnMapa('6299', camiones, detalles, celulares).resultados;
    expect(r).toMatchObject({ tipo: 'celular', titulo: 'Ibarra, Néstor (celular)', detalle: 'Op. 6299 · AA222BB', texto: 'Ibarra, Néstor', lat: -32.9 });
  });

  it('corta en el máximo y dice cuántos hay en total', () => {
    const s = buscarEnMapa('ez', camiones, detalles, [], 2);
    expect(s.resultados).toHaveLength(2);
    expect(s.total).toBe(4);
  });
});
