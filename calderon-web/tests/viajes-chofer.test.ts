import { describe, expect, it } from 'vitest';
import { ajustarItemSchema, asignarTractorSchema, iniciarViajeSchema } from '@/modules/logistica/domain/viaje-chofer.schemas';
import { parsearViajeChofer } from '@/modules/logistica/domain/viaje-chofer.types';
import { NAVEGACION, pantallaDeRuta } from '@/modules/core/navigation/navigation';

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
    expect(logistica?.entradas.some((e) => e.href === '/operacion/tractores' && !e.oculta)).toBe(true);
    expect(pantallaDeRuta('/operacion/viajes-chofer/12')).toBe('operacion.tramos');
    expect(pantallaDeRuta('/operacion/tractores')).toBe('operacion.tramos');
  });
});
