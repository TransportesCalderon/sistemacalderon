import { describe, expect, it } from 'vitest';
import { ajustarItemSchema, asignarTractorSchema, iniciarViajeSchema } from '@/modules/logistica/domain/viaje-chofer.schemas';
import { parsearViajeChofer } from '@/modules/logistica/domain/viaje-chofer.types';
import { NAVEGACION } from '@/modules/core/navigation/navigation';
import { pantallaDeRuta } from '@/modules/core/navigation/rutas';

describe('Tractores y viajes de chofer (migración 46)', () => {
  it('formularios: solo forma', () => {
    expect(asignarTractorSchema.parse({ camionId: '3', choferId: '', desde: '' })).toEqual({ camionId: 3, choferId: null, desde: null });
    const i = iniciarViajeSchema.parse({ camionId: 3, choferId: '7', items: [{ servicioId: 10, lineaId: null }, { servicioId: null, lineaId: 2 }], observacion: ' ' });
    expect(i).toMatchObject({ choferId: 7, observacion: null });
    expect(i.items).toHaveLength(2);
    expect(ajustarItemSchema.parse({ itemId: 1, canon: '60.000,50', moneda: 'ARS', km: '750', motivo: '' })).toMatchObject({ canon: 60000.5, km: 750, motivo: null });
    expect(ajustarItemSchema.safeParse({ itemId: 1, canon: '-1', moneda: 'ARS', km: '', motivo: '' }).success).toBe(false);
  });

  it('ficha: traduce el jsonb de la base sin calcular', () => {
    const v = parsearViajeChofer({
      id: 4, numero: 'VC-000004', estado: 'abierto', situacion: 'por_cerrar', version_fila: 2,
      camion: { id: 1, codigo_interno: 'T1', patente: 'AB123CD' }, chofer: { id: 9, nombre: 'Pérez, Juan' },
      salida_ts: '2026-09-11T22:04:00Z', llegada_ts: '2026-09-18T22:50:00Z',
      cargas: [{ id: 1, fecha_hora: '2026-09-11T22:04:00Z', litros: 830, momento: 'salida', tanque_lleno: true }],
      items: [{ id: 5, servicio_id: 3, numero_operacion: 120, linea_id: 2, linea: 'SAI-BSAS', canon: '120000.00', canon_moneda: 'ARS', km: '1500.0',
                relevo: [{ viaje_id: 6, numero: 'VC-000006', chofer: 'Gómez, Ana' }] }],
      canon_total: [{ moneda: 'ARS', total: 120000 }], km_total: 1500, cierre: null, pendientes: ['Falta x'],
    });
    expect(v.situacion).toBe('por_cerrar');
    expect(v.items[0]).toMatchObject({ canon: 120000, km: 1500, relevo: [{ numero: 'VC-000006' }] });
    expect(v.cargas[0]?.momento).toBe('salida');
    expect(v.pendientes).toEqual(['Falta x']);
  });

  it('menú: Tractores y viajes en Logística; la lista y la ficha usan el mismo permiso', () => {
    const logistica = NAVEGACION.find((g) => g.id === 'logistica');
    expect(logistica?.entradas.some((e) => e.href === '/operacion/tractores')).toBe(true);
    expect(pantallaDeRuta('/operacion/viajes-chofer/12')).toBe('operacion.tramos');
    expect(pantallaDeRuta('/operacion/tractores')).toBe('operacion.tramos');
  });
});

describe('costos del viaje (migración 51)', () => {
  it('lee los costos tal como los arma la base', async () => {
    const { parsearCostosViaje } = await import('@/modules/logistica/domain/costos.types');
    const c = parsearCostosViaje({
      moneda: 'ARS', en_curso: false, km_linea: 1400, km_reales: 1500, fuente_km: 'telemetria',
      telemetria: { km: 1500, litros: 480, horas_motor: 30, l_100km: 32 },
      litros_cargados: 500, combustible: 500000, combustible_estimado: false, canon: 120000, canon_sin_cotizacion: 0,
      costo_km_fijo: 100, costo_km: 150000, gastos: 5000,
      gastos_detalle: [{ id: 1, categoria: 'Peaje', fecha: '2026-10-16', importe: 5000, moneda: 'ARS', importe_base: 5000, estado: 'registrado' }],
      total: 775000, por_km: 516.67, operaciones: 1, por_operacion: 775000,
    });
    expect(c.kmReales).toBe(1500);
    expect(c.l100km).toBe(32);
    expect(c.gastosDetalle[0]?.anulado).toBe(false);
    expect(c.total).toBe(775000);
  });

  it('sin telemetría ni gastos no rompe', async () => {
    const { parsearCostosViaje } = await import('@/modules/logistica/domain/costos.types');
    const c = parsearCostosViaje({ moneda: 'ARS', total: 0 });
    expect(c.kmReales).toBeNull();
    expect(c.gastosDetalle).toEqual([]);
    expect(c.fuenteKm).toBeNull();
  });
});
