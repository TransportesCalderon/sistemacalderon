import { describe, expect, it } from 'vitest';
import { deDondeADonde, lugaresUnicos, observacionParaChofer } from '@/modules/chofer/domain/chofer.types';
import { parsearChoferesRutas, parsearMiRuta } from '@/modules/logistica/domain/rutas';

const lugar = (nombre: string) => ({ nombre, tipo: null, pais: null, latitud: null, longitud: null });

describe('Mi viaje más simple', () => {
  it('no repite lugares: retiro, carga y aduana en el mismo lugar van una sola vez', () => {
    const c = { retiro: lugar('ENTRE RIOS'), carga: lugar('ENTRE RIOS'), aduana: lugar('Entre Rios'), entrega: lugar('SANTIAGO') };
    expect(lugaresUnicos(c).map((g) => [g.titulo, g.lugar.nombre])).toEqual([
      ['Retirar el contenedor, cargar y aduana', 'ENTRE RIOS'],
      ['Entregar', 'SANTIAGO'],
    ]);
    expect(deDondeADonde(c)).toEqual({ desde: 'ENTRE RIOS', hasta: 'SANTIAGO' });
    expect(lugaresUnicos({ retiro: null, carga: lugar('A'), aduana: null, entrega: lugar('B') }).map((g) => g.titulo)).toEqual(['Cargar', 'Entregar']);
  });

  it('saca de la observación las líneas internas de Redline', () => {
    expect(observacionParaChofer('Redline N° 6222 · 04-Aduana · camión ZZ001')).toBeNull();
    expect(observacionParaChofer('Llevar cadenas\nRedline Nº 6241 · 01-Programado')).toBe('Llevar cadenas');
    expect(observacionParaChofer(null)).toBeNull();
  });
});

describe('rutas por chofer (migración 161)', () => {
  it('lee la tabla de choferes', () => {
    const [c] = parsearChoferesRutas([
      {
        chofer_id: 7, chofer: 'ZZ Ana', camion_id: 3, tractor: 'ZZ001', pendientes: 2,
        operaciones: [{ servicio_id: 1, numero: 6241, estado: 'en_curso', cliente: 'ZZ', origen: 'A', destino: 'B' }],
        ruta: { id: 9, servicio_id: null, numero: null, partida: 'Base', destino: 'Taller' }, desvio: null,
      },
    ]);
    expect(c).toMatchObject({ choferId: 7, tractor: 'ZZ001', pendientes: 2, ruta: { servicioId: null, numero: null, destino: 'Taller' } });
    expect(c?.operaciones[0]?.numero).toBe(6241);
  });

  it('lee la ruta en curso del chofer (movimiento)', () => {
    const r = parsearMiRuta({ id: 9, servicio_id: null, nombre: 'Movimiento', puntos: [{ nombre: 'A', lat: 1, lng: 2 }, { nombre: 'B', lat: 3, lng: 4 }], total: 3 });
    expect(r).toMatchObject({ id: 9, servicioId: null, nombre: 'Movimiento', total: 3 });
    expect(parsearMiRuta(null)).toBeNull();
  });
});
