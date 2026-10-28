import { describe, expect, it } from 'vitest';
import {
  MAX_RASTRO,
  TIPOS_FICHA,
  conFicha,
  leerFicha,
  leerRastro,
  rastroAlAbrir,
  sinFicha,
  volverA,
  type RefFicha,
} from '@/modules/core/fichas/ficha-url';
import { DETALLES_VIEJOS, FICHAS } from '@/modules/core/fichas/tipos';
import { PANTALLAS } from '@/modules/core/permissions/matriz';
import { pantallaDeRuta } from '@/modules/core/navigation/rutas';

/** Sprint 1 · S1-01, S1-02 y S1-07: la ficha abierta vive en la dirección. */
const camion: RefFicha = { tipo: 'camion', id: 12 };
const chofer: RefFicha = { tipo: 'chofer', id: 5 };
const carga: RefFicha = { tipo: 'carga', id: 1234 };

describe('dirección de la ficha', () => {
  it('lee tipo:id y rechaza lo inválido', () => {
    expect(leerFicha('camion:12')).toEqual(camion);
    for (const v of [null, '', 'camion', 'camion:', 'camion:0', 'camion:-3', 'camion:1.5', 'nave:3', 'Camion:3', 'camion:12;x']) {
      expect(leerFicha(v), String(v)).toBeNull();
    }
  });

  it('abrir y cerrar conservan los demás filtros', () => {
    const abierta = conFicha('estado=abierto&pagina=3', camion);
    expect(abierta).toBe('?estado=abierto&pagina=3&ficha=camion%3A12');
    expect(sinFicha(abierta.slice(1))).toBe('?estado=abierto&pagina=3');
    expect(sinFicha('ficha=camion%3A12&rastro=chofer%3A5')).toBe('');
  });

  it('el rastro va en la dirección y se lee igual', () => {
    const q = conFicha('', carga, [camion, chofer]);
    const p = new URLSearchParams(q);
    expect(leerFicha(p.get('ficha'))).toEqual(carga);
    expect(leerRastro(p.get('rastro'))).toEqual([camion, chofer]);
    expect(leerRastro('camion:12,basura,chofer:5')).toEqual([camion, chofer]);
  });
});

describe('rastro (un solo panel)', () => {
  it('abrir desde el panel suma la ficha actual', () => {
    expect(rastroAlAbrir(camion, [], chofer)).toEqual([camion]);
    expect(rastroAlAbrir(chofer, [camion], carga)).toEqual([camion, chofer]);
  });

  it('volver a una ficha del rastro corta lo que seguía', () => {
    expect(volverA([camion, chofer], 0)).toEqual({ ficha: camion, rastro: [] });
    expect(volverA([camion, chofer], 1)).toEqual({ ficha: chofer, rastro: [camion] });
    expect(volverA([camion], 3)).toBeNull();
  });

  it('abrir una ficha que ya estaba en el rastro no la repite', () => {
    expect(rastroAlAbrir(carga, [camion, chofer], camion)).toEqual([]);
    expect(rastroAlAbrir(carga, [camion, chofer], carga)).toEqual([camion, chofer]);
  });

  it(`no pasa de ${MAX_RASTRO} pasos`, () => {
    let rastro: RefFicha[] = [];
    let actual: RefFicha = { tipo: 'carga', id: 1 };
    for (let i = 2; i < 10; i++) {
      const nueva: RefFicha = { tipo: 'carga', id: i };
      rastro = rastroAlAbrir(actual, rastro, nueva);
      actual = nueva;
    }
    expect(rastro).toHaveLength(MAX_RASTRO);
    expect(rastro.at(-1)).toEqual({ tipo: 'carga', id: 8 });
  });
});

describe('registro de fichas', () => {
  it('cada tipo tiene pantalla de la matriz y una lista protegida por esa misma pantalla', () => {
    for (const tipo of TIPOS_FICHA) {
      const def = FICHAS[tipo];
      expect(PANTALLAS[def.pantalla], tipo).toBeDefined();
      expect(pantallaDeRuta(def.lista), tipo).toBe(def.pantalla);
    }
  });

  it('cada página de detalle vieja tiene su tipo y la misma pantalla que la protegía', () => {
    for (const { ruta, tipo } of DETALLES_VIEJOS) {
      expect(pantallaDeRuta(`${ruta}/7`), ruta).toBe(FICHAS[tipo].pantalla);
    }
  });
});
