import { describe, expect, it } from 'vitest';
import { agrupar, resultadosVisibles } from '@/modules/core/buscador/resultados';
import { permisosDe } from '@/modules/core/permissions/resolver';

/** Sprint 2: el buscador muestra solo lo que el rol puede ver (la base dice la pantalla). */
const opciones = { gerenciaDetalleAlertas: 'agregado' as const };
const filas = [
  { tipo: 'camion', id: 12, titulo: 'SXXV17', detalle: 'T-12 · Volvo FH', pantalla: 'flota.camiones' },
  { tipo: 'chofer', id: 5, titulo: 'Pérez, Juan', detalle: 'Legajo 33', pantalla: 'flota.choferes' },
  { tipo: 'factura', id: 7, titulo: 'Factura 0001-123', detalle: null, pantalla: 'ventas.facturacion' },
  { tipo: 'operacion', id: 3, titulo: 'Operación 6234', detalle: null, pantalla: 'operacion.servicios' },
  { tipo: 'camion', id: 13, titulo: 'SXXV18', detalle: null, pantalla: 'flota.camiones' },
];

describe('buscador (Sprint 2)', () => {
  it('TI ve todo lo que trae la base (con la migración de cada ficha)', () => {
    const r = resultadosVisibles(filas, permisosDe(['ti'], opciones), 115);
    expect(r.map((x) => `${x.tipo}:${x.id}`)).toEqual(['camion:12', 'chofer:5', 'factura:7', 'operacion:3', 'camion:13']);
  });

  it('un rol sin la pantalla no ve ese resultado', () => {
    const r = resultadosVisibles(filas, permisosDe(['adm_combustible'], opciones), 115);
    expect(r.some((x) => x.tipo === 'factura')).toBe(false);
    expect(r.some((x) => x.tipo === 'camion')).toBe(true);
  });

  it('sin la migración 114, la operación no aparece (su ficha no se puede abrir)', () => {
    const r = resultadosVisibles(filas, permisosDe(['ti'], opciones), 113);
    expect(r.some((x) => x.tipo === 'operacion')).toBe(false);
  });

  it('ignora tipos, pantallas o ids que no conoce', () => {
    const malas = [
      { tipo: 'nave', id: 1, titulo: 'x', pantalla: 'flota.camiones' },
      { tipo: 'camion', id: 1, titulo: 'x', pantalla: 'pantalla.inventada' },
      { tipo: 'camion', id: -1, titulo: 'x', pantalla: 'flota.camiones' },
    ];
    expect(resultadosVisibles(malas, permisosDe(['ti'], opciones), 115)).toEqual([]);
    expect(resultadosVisibles(null, permisosDe(['ti'], opciones), 115)).toEqual([]);
  });

  it('agrupa por tipo en el orden en que llegan', () => {
    const g = agrupar(resultadosVisibles(filas, permisosDe(['ti'], opciones), 115));
    expect(g.map((x) => `${x.titulo}:${x.items.length}`)).toEqual(['Camiones:2', 'Choferes:1', 'Facturas:1', 'Operaciones:1']);
  });
});
