import { describe, expect, it } from 'vitest';
import { parsearConsumoChoferes, parsearConsumoRutas, parsearLitrosRuta } from '@/modules/combustible/domain/consumo-aprendido.types';
import { parsearDatosPedido } from '@/modules/telemetria/domain/seguimiento.types';
import { PESTANAS_CONSUMO, PESTANAS_RANKING } from '@/shared/ui/pestanas-secciones';

describe('migración 223 · consumo aprendido', () => {
  it('litros para un recorrido: por tramo, total y si faltan datos', () => {
    const p = parsearLitrosRuta({
      tramos: [
        { origen: 'Mendoza', destino: 'Santiago', con_carga: true, estado: 'en_curso', km: 300, l_100km: 35.2, litros: 106, texto: 'este camión en esta ruta' },
        { origen: 'Santiago', destino: 'San Antonio', con_carga: false, km: null, l_100km: null, litros: null, motivo: 'No se sabe cuántos km tiene esta ruta' },
      ],
      km: 300, litros: 106, sin_dato: 1, completo: false,
    });
    expect(p.tramos[0]).toMatchObject({ estado: 'en_curso', litros: 106, l100km: 35.2 });
    expect(p.tramos[1]?.motivo).toBe('No se sabe cuántos km tiene esta ruta');
    expect(p).toMatchObject({ litros: 106, sinDato: 1, completo: false });
  });

  it('rutas aprendidas con el detalle por marca y los camiones con lo que necesitan', () => {
    const r = parsearConsumoRutas({
      aprendidos: 9, sin_medir: 1,
      rutas: [{ origen: 'Mendoza', destino: 'Santiago', con_carga: true, tramos: 9, km: 500, l_100km: 34.7, min: 32, max: 40, por_marca: [{ marca: 'VOLVO', tramos: 9, l_100km: 34.7 }] }],
      camiones: [{ camion_id: 1, patente: 'SXXV29', pendiente: { tramos: [], km: 500, litros: 176, completo: true } }],
    });
    expect(r.rutas[0]?.porMarca[0]).toEqual({ marca: 'VOLVO', tramos: 9, l100km: 34.7 });
    expect(r.camiones[0]?.pendiente.litros).toBe(176);
  });

  it('choferes: desvío, litros de más, revisión y lo de la IA', () => {
    const c = parsearConsumoChoferes({
      mes: '2026-10-01', umbral_pct: 10, km_min: 500, ia_disponible: true,
      choferes: [{ chofer_id: 3, chofer: 'PRUEBA, Equis', km: 1500, litros: 600, litros_esperados: 480, litros_de_mas: 120, desvio_pct: 25, marcado: true, ia_estado: 'esperando', detalle: [] }],
    });
    expect(c.choferes[0]).toMatchObject({ litrosDeMas: 120, desvioPct: 25, marcado: true, iaEstado: 'esperando', revisadoEn: null });
    expect(c.iaDisponible).toBe(true);
  });

  it('el pedido de carga trae lo necesario para llegar y para llenar', () => {
    const d = parsearDatosPedido({ litros_para_llenar: 400, litros_para_llegar: 250, necesario: { tramos: [], litros: 330, km: 900, completo: true } });
    expect(d).toMatchObject({ litrosParaLlenar: 400, litrosParaLlegar: 250 });
    expect(d.necesario?.litros).toBe(330);
    expect(parsearDatosPedido({}).necesario).toBeNull();
  });

  it('las vistas nuevas están como pestañas de sus pantallas', () => {
    expect(PESTANAS_CONSUMO.map((p) => p.href)).toContain('/analisis/consumo?vista=rutas');
    expect(PESTANAS_RANKING.map((p) => p.href)).toContain('/analisis/ranking?vista=consumo');
  });
});
