import { describe, expect, it } from 'vitest';
import { numero, parsearMiManejo, posicionConsumo } from '@/modules/chofer/domain/mi-manejo';

/** Migración 387 · «Cómo voy manejando» (la base hace las cuentas; acá se lee). */
const BASE = {
  estado: 'lejos',
  titulo: 'Te falta bajar 6 L/100 km para ganar los $200.000. Venís en 40 y el objetivo es 34.',
  periodo: { desde: '2026-11-27', hasta: '2026-12-26', dias: 30, dias_pasados: 1 },
  bono: { aplica: true, importe: 200000, consumo_max: 34, consumo: 40, consumo_fuente: 'motor', faltante_l: 0, sin_faltantes: true },
  consumo: { cierres: { km: 0, aprobados: 0, pendientes: 2 }, motor: { km: 1200, dias: 2, l_100km: '40.0', ultimos_7_l_100km: 39.5 } },
  ralenti: { litros: 42, horas: 10, pct_motor: 38.5, permitido_l: 40, ritmo_fin_de_mes_l: 46.7, quedan_l: 0 },
  estilo: { programador_pct: 21, programador_objetivo_pct: 60, exceso_velocidad_min: 40, frenadas_fuertes_s_100km: 28.6, rpm_altas_pct: 14.8,
            niveles: { programador: 'mejorar', ralenti: 'mejorar', rpm: 'regular', raro: 'x', velocidad: 'otro' } },
  consejos: ['Usá más el programador…', '', 3],
};

describe('cómo voy manejando', () => {
  it('lee lo que devuelve la base', () => {
    const m = parsearMiManejo(BASE)!;
    expect(m.estado).toBe('lejos');
    expect(m.bono).toMatchObject({ aplica: true, importe: 200000, consumo: 40, consumoFuente: 'motor', cuidadoUnidad: null, limpieza: null, sinFaltantes: true });
    expect(m.consumo.cierres).toEqual({ l100: null, km: 0, aprobados: 0, pendientes: 2 });
    expect(m.consumo.motor).toMatchObject({ l100: 40, ultimos7: 39.5 });
    expect(m.ralenti.permitidoL).toBe(40);
    expect(m.estilo.niveles).toEqual({ programador: 'mejorar', ralenti: 'mejorar', rpm: 'regular' });
    expect(m.estilo.velocidadMax).toBeNull();
    expect(m.consejos).toEqual(['Usá más el programador…']);
  });
  it('lo que no es la respuesta queda afuera', () => {
    expect(parsearMiManejo(null)).toBeNull();
    expect(parsearMiManejo({ estado: 'otro', titulo: 'x' })).toBeNull();
    expect(parsearMiManejo({ estado: 'en_camino' })).toBeNull();
  });
  it('el medidor pone el objetivo en el medio y no se sale de la regla', () => {
    expect(posicionConsumo(34, 34)).toBe(50);
    expect(posicionConsumo(31, 34)).toBe(25);
    expect(posicionConsumo(37, 34)).toBe(75);
    expect(posicionConsumo(55, 34)).toBe(100);
    expect(posicionConsumo(10, 34)).toBe(0);
  });
  it('escribe los números como se leen acá', () => {
    expect(numero(33.2)).toBe('33,2');
    expect(numero(34)).toBe('34');
    expect(numero(200000, 0)).toBe('200.000');
  });
});
