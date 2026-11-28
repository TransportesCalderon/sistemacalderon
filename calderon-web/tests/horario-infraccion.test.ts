import { describe, expect, it } from 'vitest';
import { etiquetaTipoActa, parsearActas, parsearTiposActa, resumenPorTipo } from '@/modules/actas/domain/acta.types';
import { estadoFueraHorario, parsearFueraHorario } from '@/modules/telemetria/domain/horario.types';

/** Migración 389 · Después de las 23 sin permiso es infracción, y los tipos de acta salen de un catálogo. */
describe('tipos de acta del catálogo', () => {
  it('lee el catálogo; sin la migración, la lista de siempre', () => {
    const t = parsearTiposActa({ puede_agregar: true, tipos: [{ codigo: 'uso_celular', nombre: 'Uso del celular', activo: true }, { codigo: 'X', nombre: 'mal' }] });
    expect(t.tipos).toEqual([{ codigo: 'uso_celular', nombre: 'Uso del celular', activo: true }]);
    expect(t.puedeAgregar).toBe(true);
    expect(parsearTiposActa(null).tipos.length).toBeGreaterThanOrEqual(12);
  });
  it('un acta de un tipo nuevo se muestra con el nombre que manda la base', () => {
    const r = parsearActas({ actas: [{ id: 1, tipo: 'uso_celular', tipo_nombre: 'Uso del celular', estado: 'registrada' }], por_tipo: { uso_celular: 1, otra: 0, fuera_horario: 2 } });
    expect(r.actas[0]).toMatchObject({ tipo: 'uso_celular', tipoNombre: 'Uso del celular' });
    expect(resumenPorTipo(r.porTipo, [{ codigo: 'uso_celular', nombre: 'Uso del celular', activo: true }])).toBe('1 de uso del celular, 2 de manejo fuera de horario sin permiso');
    expect(resumenPorTipo({})).toBe('ninguna acta');
    expect(etiquetaTipoActa('tipo_raro')).toBe('tipo raro');
  });
});

describe('fuera de horario sancionable', () => {
  const base = { id: 3, camion_id: 1, patente: 'SPKP91', desde: '2026-11-28T01:06:00Z', ultimo_ts: '2026-11-28T03:07:00Z', detenido_en: '2026-11-28T03:07:00Z', habilitado: false };
  it('lee la infracción, el acta y las pendientes', () => {
    const d = parsearFueraHorario({
      tope: '23:00', puede_acta: true, puede_sin_sancion: false,
      circulando: [{ ...base, infraccion: true, infraccion_desde: '2026-11-28T02:04:00Z', infraccion_hasta: '2026-11-28T03:07:00Z', infraccion_vmax: 45, acta: null, sin_sancion: null }],
      infracciones_pendientes: [{ ...base, id: 9, noche: '2026-11-25', infraccion: true, acta: null }],
    });
    expect(d.tope).toBe('23:00');
    expect(d.puedeActa).toBe(true);
    expect(d.circulando[0]).toMatchObject({ infraccion: true, infraccionVmax: 45, acta: null });
    expect(d.pendientes[0]).toMatchObject({ id: 9, noche: '2026-11-25' });
  });
  it('la infracción manda sobre «se detuvo»', () => {
    const d = parsearFueraHorario({ circulando: [{ ...base, infraccion: true }, { ...base, id: 4, infraccion: true, acta: { id: 7, numero: 'AI-000007', estado: 'registrada' } }, { ...base, id: 5 }] });
    expect(estadoFueraHorario(d.circulando[0]!)).toEqual({ texto: 'Infracción sin permiso', tono: 'error' });
    expect(estadoFueraHorario(d.circulando[1]!).texto).toBe('Infracción · acta AI-000007');
    expect(estadoFueraHorario(d.circulando[2]!).texto).toBe('Se detuvo');
  });
});
