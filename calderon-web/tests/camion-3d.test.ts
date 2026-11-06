import { describe, expect, it } from 'vitest';
import { caras, dentro, estiloCabina, modeloSemi, modeloTractor, piezaMarcada, zonasEnModelo } from '@/modules/flota/domain/camion3d';

// Las zonas que la base acepta (mae.zona_equipo, migración 199)
const TRACTOR = ['motor', 'cabina', 'caja', 'eje_1', 'eje_2', 'eje_3', 'ruedas', 'frenos', 'suspension', 'quinta_rueda', 'tanques', 'aire', 'electrico', 'chasis'];
const SEMI = ['eje_1', 'eje_2', 'eje_3', 'ruedas', 'frenos', 'suspension', 'perno_rey', 'patas', 'aire', 'electrico', 'chasis', 'carroceria', 'equipo_frio'];

describe('fase M4 · camión en 3D con las zonas en amarillo', () => {
  it('el tractor tiene 3 ejes y todas sus zonas; el semi refrigerado también, con su equipo de frío', () => {
    const t = modeloTractor(estiloCabina('Renault Trucks', 'T HIGH'));
    expect(zonasEnModelo(t, TRACTOR)).toEqual(TRACTOR);
    expect(t.filter((p) => p.zonas.includes('ruedas') && p.color === '#22262b')).toHaveLength(6);
    expect(zonasEnModelo(modeloSemi('refrigerado'), SEMI)).toEqual(SEMI);
    expect(zonasEnModelo(modeloSemi('plataforma'), ['equipo_frio'])).toEqual([]);
  });

  it('marcar «Eje 2» pinta su eje, sus ruedas, sus frenos y su suspensión; nada del eje 1', () => {
    const t = modeloTractor(estiloCabina(null, null));
    const marcadas = t.filter((p) => piezaMarcada(p, ['eje_2']));
    expect(new Set(marcadas.flatMap((p) => p.zonas))).toEqual(new Set(['eje_2', 'ruedas', 'frenos', 'suspension']));
    expect(t.filter((p) => piezaMarcada(p, ['eje_2']) && p.zonas.includes('eje_1'))).toHaveLength(0);
  });

  it('la cabina sale alta o baja según la ficha (sin copiar ningún diseño)', () => {
    expect(estiloCabina('Renault Trucks', 'T HIGH').alta).toBe(true);
    expect(estiloCabina('Scania', 'P310A').alta).toBe(false);
    expect(estiloCabina('MERCEDES', 'NEW ACTROS 2548 LS')).toMatchObject({ alta: true, larga: true });
  });

  it('las caras se arman y se puede saber qué parte se tocó', () => {
    expect(caras(modeloTractor(estiloCabina(null, null))).length).toBeGreaterThan(200);
    expect(dentro(5, 5, [[0, 0], [10, 0], [10, 10], [0, 10]])).toBe(true);
    expect(dentro(15, 5, [[0, 0], [10, 0], [10, 10], [0, 10]])).toBe(false);
  });
});
