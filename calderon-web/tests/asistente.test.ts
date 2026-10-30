import { describe, expect, it } from 'vitest';
import { can, permisosDe } from '@/modules/core/permissions/resolver';
import { parsearEstadoAsistente, parsearInforme, parsearInformes, parsearTurno, textoPeriodo, textoSemana, VERSION_ASISTENTE, VERSION_INFORME } from '@/modules/ia/asistente/asistente';
import { parsearMarkdown, trozos } from '@/modules/ia/asistente/markdown';

describe('IA-3 · El asistente «Preguntale»', () => {
  it('lee el estado y una pregunta tal como los devuelve la base', () => {
    const e = parsearEstadoAsistente({
      puede: true,
      activo: true,
      con_clave: true,
      con_pg_net: true,
      quedan_hoy: 39,
      sugeridas: [{ codigo: 'resolver_hoy', pregunta: '¿Qué tengo que resolver hoy?' }],
    });
    expect(e.quedanHoy).toBe(39);
    expect(e.sugeridas[0]?.codigo).toBe('resolver_hoy');
    expect(parsearEstadoAsistente(null).puede).toBe(false);

    const t = parsearTurno({
      id: 5,
      conversacion_id: 2,
      pregunta: '¿Qué chofer fue más rentable?',
      estado: 'lista',
      respuesta: 'ZZ Uno.',
      avisos: ['Margen de contribución. No incluye costos indirectos ni gastos generales.'],
      fuentes: [{ herramienta: 'rentabilidad', etiqueta: 'Rentabilidad', pantalla: '/analisis/rentabilidad', periodo: { desde: '2026-10-01', hasta: '2026-10-30' }, ok: true }],
      util: null,
    });
    expect(t.fuentes[0]?.pantalla).toBe('/analisis/rentabilidad');
    expect(textoPeriodo(t.fuentes[0]?.periodo ?? null)).toBe('01/10 al 30/10');
    expect(textoPeriodo({ mes: '2026-10' })).toBe('10/2026');
    expect(parsearTurno({ id: 1, estado: 'esperando' }).estado).toBe('pensando');
    expect(VERSION_ASISTENTE).toBe(126);
  });

  it('dibuja el markdown de la respuesta sin HTML: párrafos, listas, tablas y negrita', () => {
    const b = parsearMarkdown(
      '## Resumen\nHay **3** facturas vencidas.\nSegunda línea.\n\n- Uno\n- Dos\n\n1. Primero\n2. Segundo\n\n| Cliente | USD |\n|---|---:|\n| ZZ | 1.500 |\n| YY | 300 |\n\n<script>alert(1)</script>',
    );
    expect(b.map((x) => x.tipo)).toEqual(['titulo', 'parrafo', 'lista', 'lista', 'tabla', 'parrafo']);
    const tabla = b[4];
    expect(tabla?.tipo === 'tabla' && tabla.filas.length).toBe(2);
    expect(trozos('Hay **3** y `x`')).toEqual([
      { tipo: 'texto', texto: 'Hay ' },
      { tipo: 'negrita', texto: '3' },
      { tipo: 'texto', texto: ' y ' },
      { tipo: 'codigo', texto: 'x' },
    ]);
    // El texto se muestra como texto (React lo escapa), nunca como HTML
    const ultimo = b[5];
    expect(ultimo?.tipo === 'parrafo' && ultimo.lineas[0]?.[0]?.texto).toBe('<script>alert(1)</script>');
  });

  it('el chofer no tiene el asistente; la base decide el resto (Gerencia y usuarios de prueba)', () => {
    const p = (rol: Parameters<typeof permisosDe>[0][number]) => can(permisosDe([rol], { gerenciaDetalleAlertas: 'agregado' }), 'ia.asistente:editar');
    expect(p('gerencia')).toBe(true);
    expect(p('operaciones')).toBe(true);
    expect(p('chofer')).toBe(false);
  });

  it('IA-4: lee la lista de informes semanales y un informe', () => {
    const l = parsearInformes({
      puede_armar: true,
      semana_pasada: '2026-10-19',
      informes: [{ id: 3, desde: '2026-10-19', hasta: '2026-10-25', estado: 'pensando' }, { id: 2, desde: '2026-10-12', hasta: '2026-10-18', estado: 'error', error: 'La IA no respondió a tiempo: armalo de nuevo' }],
    });
    expect(l.informes[0]?.estado).toBe('pensando');
    expect(l.informes[1]?.error).toContain('armalo de nuevo');
    const i = parsearInforme({ id: 3, desde: '2026-10-19', hasta: '2026-10-25', estado: 'lista', texto: '## Resumen', avisos: ['x'], fuentes: [{ herramienta: 'flujo_caja', etiqueta: 'Flujo de caja', pantalla: '/analisis/informes', ok: true }] });
    expect(i.texto).toBe('## Resumen');
    expect(i.fuentes[0]?.etiqueta).toBe('Flujo de caja');
    expect(textoSemana('2026-10-19', '2026-10-25')).toBe('Semana del 19/10 al 25/10');
    expect(VERSION_INFORME).toBe(127);
  });
});
