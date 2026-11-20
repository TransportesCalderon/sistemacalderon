import { describe, expect, it } from 'vitest';
import { parsearFicha } from '@/modules/anomalias/domain/ficha-cumplimiento';

describe('ficha de cumplimiento (iris 16)', () => {
  it('lee el fondo fijo, los colores y la oficina', () => {
    const f = parsearFicha({
      mes: '11/2026',
      choferes: [{ chofer: 'chofer 1', en_rojo: 1, fondo_fijo: [{ moneda: 'ARS', entregado_en_el_mes: '100000', rendido: 0, sin_rendir: 100000, pct_rendido_de_eso: 0 }], fondo_color: 'rojo', atrasos_hoy: ['x', ''] }],
      oficina: { gastos_revisados: [{ quien: 'usuario 1', gastos: 2, dias_que_tardo: 1, color: 'verde' }] },
      no_se_pudo_leer: null,
    });
    expect(f.choferes[0]).toMatchObject({ enRojo: 1, enAmarillo: 0, fondoColor: 'rojo', atrasos: ['x'] });
    expect(f.choferes[0]!.fondo[0]).toEqual({ moneda: 'ARS', entregadoMes: 100000, rendido: 0, sinRendir: 100000, pctRendido: 0 });
    expect(f.gastosRevisados[0]).toEqual({ quien: 'usuario 1', cantidad: 2, demora: 1, color: 'verde' });
    expect(f.cierresAprobados).toEqual([]);
    expect(f.noSePudoLeer).toEqual([]);
  });

  it('no se rompe con datos raros', () => {
    expect(parsearFicha(null).choferes).toEqual([]);
    expect(parsearFicha({ choferes: [{ fondo_color: 'violeta' }] }).choferes[0]!.fondoColor).toBeNull();
  });
});
