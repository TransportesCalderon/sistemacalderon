import { describe, expect, it } from 'vitest';
import { NAVEGACION } from '@/modules/core/navigation/navigation';
import { pantallaDeRuta } from '@/modules/core/navigation/rutas';
import { parsearViajesEnCurso } from '@/modules/telemetria/domain/seguimiento.types';

describe('migración 194 · módulo Telemetría: seguimiento de viajes', () => {
  it('la base interpreta y escribe el mensaje; la web lo muestra tal cual', () => {
    const [v] = parsearViajesEnCurso([
      {
        viaje_id: 9,
        patente: 'SDKZ68',
        chofer: 'Chana, Gustavo',
        km: 1612,
        litros: 434,
        programador_pct: 95,
        con_telemetria: true,
        evaluacion: { resultado: 'a_mejorar', l_100km: 26.9, objetivo_l_100km: 26, estado_consumo: 'naranja', estado_programador: 'verde', mensaje: 'Buenos días Gustavo…' },
        ultimo_control: null,
        controles_hoy: 0,
      },
    ]);
    expect(v?.evaluacion).toMatchObject({ resultado: 'a_mejorar', estadoConsumo: 'naranja', mensaje: 'Buenos días Gustavo…' });
    expect(v?.conTelemetria).toBe(true);
  });

  it('el módulo Telemetría reúne seguimiento, mapa, rutas, alertas, actas y ranking', () => {
    const t = NAVEGACION.find((g) => g.id === 'telemetria');
    expect(t?.entradas.map((e) => e.href)).toEqual(['/telemetria/seguimiento', '/pizarra/mapa', '/pizarra/rutas', '/analisis/alertas', '/actas', '/analisis/ranking']);
    expect(pantallaDeRuta('/telemetria/seguimiento')).toBe('telemetria.mapa');
  });
});

describe('migración 195 · pedido de carga', () => {
  it('trae los números y el precio de la última carga de la estación', async () => {
    const { parsearDatosPedido } = await import('@/modules/telemetria/domain/seguimiento.types');
    const d = parsearDatosPedido({ inicial_l: 1550, km: 1047, gasto_l: 506, tanques_l: 374, mochila_l: 720, litros_sugeridos: 506, precio: 1525, moneda: 'ARS', con_telemetria: true });
    expect(d).toMatchObject({ inicialL: 1550, gastoL: 506, tanquesL: 374, mochilaL: 720, litrosSugeridos: 506, precio: 1525, moneda: 'ARS' });
  });
});
