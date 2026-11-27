import { describe, expect, it } from 'vitest';
import { bonoTramosDesactualizado, etiquetaEstadoTramo, parsearLiquidacion, tramoSinDecision } from '@/modules/liquidacion/domain/liquidacion.types';
import { tramoLiquidacionSchema } from '@/modules/liquidacion/domain/liquidacion.schemas';

/** Migración 384: cada movimiento de «Quién la llevó» es un tramo; entran los empezados hasta el fin del período. */
describe('liquidación por movimiento (384)', () => {
  const l = parsearLiquidacion({
    id: 7,
    tramos: [
      { item_id: 9001, viaje: 'Op. 6287 · AAAA11', salida: '2026-11-10', llegada: '2026-11-11', linea: 'SAI-MZA', recorrido: 'SAN ANTONIO → Aduana Global', km: 477, canon: 80000, canon_moneda: 'CLP', canon_base: 80000, estado: 'incluido', fuente_fecha: 'operacion' },
      { item_id: 9003, viaje: 'Op. 6305 · BBBB22', salida: '2026-11-25', llegada: null, linea: 'ER-MZA', recorrido: 'ENTRE RIOS → MENDOZA', km: 1207, canon: 80000, canon_moneda: 'CLP', canon_base: 80000, estado: 'en_curso', detalle: 'En curso: entra cuando Operaciones registre la llegada' },
      { item_id: 9012, viaje: 'Op. 6420 · CCCC33', salida: '2026-11-02', llegada: '2026-11-02', recorrido: 'Aduana Global → Base Operativa', km: 15, estado: 'local' },
      { item_id: 9020, viaje: 'Op. 6460 · DDDD44', salida: '2026-11-20', llegada: '2026-11-30', linea: 'ROS-MZA', estado: 'fuera' },
    ],
  });

  it('lee el tramo en curso sin fecha de llegada', () => {
    expect(l.tramos).toHaveLength(4);
    expect(l.tramos[1]?.estado).toBe('en_curso');
    expect(l.tramos[1]?.llegada).toBeNull();
    expect(l.tramos[0]?.recorrido).toBe('SAN ANTONIO → Aduana Global');
  });

  it('nombra los estados nuevos y no se rompe con uno que no conoce', () => {
    expect(etiquetaEstadoTramo('en_curso')).toBe('En curso');
    expect(etiquetaEstadoTramo('local')).toBe('En la base');
    expect(etiquetaEstadoTramo('fuera')).toBe('No entró');
    expect(etiquetaEstadoTramo('incluido')).toBe('Se liquida');
    expect(etiquetaEstadoTramo('otro_estado')).toBe('otro_estado');
  });

  it('solo se liquida lo incluido: en curso, local y fuera no suman', () => {
    const incluidos = l.tramos.filter((t) => t.estado === 'incluido');
    expect(incluidos.map((t) => t.itemId)).toEqual([9001]);
    expect(incluidos.reduce((a, t) => a + (t.canonBase ?? 0), 0)).toBe(80000);
  });

  it('RRHH decide sobre un tramo en curso o local, pero no sobre uno en otra liquidación, después de la baja o fuera', () => {
    expect(tramoSinDecision('en_curso')).toBe(false);
    expect(tramoSinDecision('local')).toBe(false);
    expect(tramoSinDecision('sin_linea')).toBe(false);
    expect(tramoSinDecision('en_otra')).toBe(true);
    expect(tramoSinDecision('despues_baja')).toBe(true);
    expect(tramoSinDecision('fuera')).toBe(true);
  });

  it('avisa cuando el bono por tramo quedó viejo porque llegó un tramo que estaba en curso', () => {
    const tramo = { item_id: 9003, viaje: 'Op. 6305', canon_base: 80000, estado: 'incluido' };
    const antes = parsearLiquidacion({ id: 1, estado: 'borrador', tramos: [tramo], renglones: [{ id: 1, codigo: 'CANON', importe: 0 }] });
    expect(bonoTramosDesactualizado(antes)).toEqual({ renglon: 0, lista: 80000 });
    const preparada = parsearLiquidacion({ id: 1, estado: 'borrador', tramos: [tramo], renglones: [{ id: 1, codigo: 'CANON', importe: 80000 }] });
    expect(bonoTramosDesactualizado(preparada)).toBeNull();
    const aprobada = parsearLiquidacion({ id: 1, estado: 'aprobada', tramos: [tramo], renglones: [{ id: 1, codigo: 'CANON', importe: 0 }] });
    expect(bonoTramosDesactualizado(aprobada)).toBeNull();
    const enCurso = parsearLiquidacion({ id: 1, estado: 'borrador', tramos: [{ ...tramo, estado: 'en_curso' }], renglones: [] });
    expect(bonoTramosDesactualizado(enCurso)).toBeNull();
  });

  it('la decisión lleva la liquidación que se está mirando (opcional para la base anterior)', () => {
    const con = tramoLiquidacionSchema.safeParse({ itemId: -90082, liquidar: false, canon: null, moneda: null, km: null, motivo: 'Liquidado en octubre', liquidacionId: 12 });
    expect(con.success && con.data.liquidacionId).toBe(12);
    const sin = tramoLiquidacionSchema.safeParse({ itemId: 9001, liquidar: false, canon: null, moneda: null, km: null, motivo: 'Liquidado en octubre' });
    expect(sin.success).toBe(true);
    expect(tramoLiquidacionSchema.safeParse({ itemId: 9001, liquidar: false, canon: null, moneda: null, km: null, motivo: 'x y z', liquidacionId: 0 }).success).toBe(false);
  });
});
