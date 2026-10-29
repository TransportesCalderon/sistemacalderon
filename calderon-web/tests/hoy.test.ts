import { describe, expect, it } from 'vitest';
import { accionDe, agruparTareas, contarPendientes, parsearTareas, tareasVisibles } from '@/modules/hoy/hoy';
import { permisosDe } from '@/modules/core/permissions/resolver';

/** Sprint 3 · «Hoy»: la lista de lo que le toca a cada uno (seg.fn_lo_mio_de_hoy). */
const opciones = { gerenciaDetalleAlertas: 'agregado' as const };
const filas = [
  { grupo: 'aprobar', tipo: 'anular_carga', objeto_tipo: 'carga', objeto_id: 12, fecha: '2026-10-27T10:00:00Z', titulo: 'Anular la carga #12', detalle: 'Error', ruta: null, pantalla: 'combustible.cargas', cantidad: 1 },
  { grupo: 'revisar', tipo: 'carga_sin_ticket', objeto_tipo: 'carga', objeto_id: 13, fecha: '2026-10-26T10:00:00Z', titulo: 'Falta el ticket de la carga #13', detalle: '400 L', ruta: null, pantalla: 'combustible.cargas', cantidad: 1 },
  { grupo: 'revisar', tipo: 'alertas_nuevas', objeto_tipo: null, objeto_id: null, fecha: null, titulo: '3 alerta(s)', detalle: null, ruta: '/anomalias/alertas', pantalla: 'anomalias.alertas', cantidad: 3 },
  { grupo: 'esperando', tipo: 'cierre', objeto_tipo: 'cierre', objeto_id: 7, fecha: '2026-10-25T10:00:00Z', titulo: 'Cierre C-7', detalle: null, ruta: null, pantalla: 'combustible.cierre_viaje', cantidad: 1 },
  { grupo: 'revisar', tipo: 'sin_destino', objeto_tipo: null, objeto_id: null, fecha: null, titulo: 'Sin a dónde ir', detalle: null, ruta: null, pantalla: null, cantidad: 1 },
  { grupo: 'aprobar', tipo: 'pago', objeto_tipo: null, objeto_id: null, fecha: null, titulo: 'Un pago', detalle: null, ruta: '/finanzas/cobros-pagos', pantalla: 'finanzas.cobros_pagos', cantidad: 1 },
];

describe('«Hoy» (Sprint 3)', () => {
  it('cada tarea abre una ficha o una lista; lo que no tiene a dónde ir se descarta', () => {
    const t = parsearTareas(filas);
    expect(t).toHaveLength(5);
    expect(t[0]!.objeto).toEqual({ tipo: 'carga', id: 12 });
    expect(t[2]!.ruta).toBe('/anomalias/alertas');
    expect(parsearTareas(null)).toEqual([]);
  });

  it('solo se ven las tareas de pantallas que el rol puede ver', () => {
    const t = tareasVisibles(parsearTareas(filas), permisosDe(['adm_combustible'], opciones));
    expect(t.some((x) => x.tipo === 'pago')).toBe(false);
    expect(t.some((x) => x.tipo === 'carga_sin_ticket')).toBe(true);
  });

  it('agrupa: para aprobar, para hacer y esperando; lo más viejo primero', () => {
    const g = agruparTareas(parsearTareas(filas));
    expect(g.map((x) => x.grupo)).toEqual(['aprobar', 'revisar', 'esperando']);
    expect(g[1]!.tareas.map((x) => x.tipo)).toEqual(['carga_sin_ticket', 'alertas_nuevas']);
  });

  it('el contador de la barra cuenta lo que espera una acción tuya (no lo que esperás de otro)', () => {
    expect(contarPendientes(parsearTareas(filas))).toBe(1 + 1 + 3 + 1);
  });

  it('el botón dice qué hace', () => {
    const t = parsearTareas(filas);
    expect(accionDe(t[0]!)).toBe('Revisar');
    expect(accionDe(t[1]!)).toBe('Adjuntar ticket');
    expect(accionDe(t[2]!)).toBe('Ir');
    expect(accionDe(t[3]!)).toBe('Abrir');
  });
});
