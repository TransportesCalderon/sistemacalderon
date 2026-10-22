import { describe, expect, it } from 'vitest';
import { conceptoSchema, renglonSchema, tarifaSchema } from '@/modules/liquidacion/domain/liquidacion.schemas';
import { moverPeriodo, parsearLiquidacion } from '@/modules/liquidacion/domain/liquidacion.types';
import { can, permisosDe } from '@/modules/core/permissions/resolver';

const agregado = { gerenciaDetalleAlertas: 'agregado' as const };

describe('liquidaciones (migración 62)', () => {
  it('lee la liquidación tal como la arma la base', () => {
    const l = parsearLiquidacion({
      id: 3, numero: 'LQ-000003', chofer: 'PRUEBA ANA', periodo: '2026-10-01', estado: 'aprobada', remunerativo: '900000', descuentos: 99800, neto: 800200,
      avisos: ['x'], renglones: [{ id: 1, origen: 'sistema', codigo: 'CANON', descripcion: 'Canon', tipo: 'remunerativo', importe: '150000' }],
    });
    expect(l.remunerativo).toBe(900000);
    expect(l.renglones[0]?.importe).toBe(150000);
    expect(l.avisos).toEqual(['x']);
  });

  it('formularios: vacío es null y la coma decimal se entiende', () => {
    const t = tarifaSchema.parse({ choferId: null, desde: '2026-10-01', sueldoFijo: '1.500.000,50', precioKm: '', observacion: '' });
    expect(t.sueldoFijo).toBe(1500000.5);
    expect(t.precioKm).toBeNull();
    expect(renglonSchema.safeParse({ liquidacionId: 1, tipo: 'descuento', descripcion: 'x', importe: '0', conceptoId: null }).success).toBe(false);
    expect(conceptoSchema.parse({ id: null, codigo: 'JUBILACION', nombre: 'Jubilación', tipo: 'descuento', calculo: 'porcentaje', valor: '11', base: 'remunerativo', automatico: true, activo: true, orden: 10 }).valor).toBe(11);
  });

  it('períodos y permisos', () => {
    expect(moverPeriodo('2026-01-01', -1)).toBe('2025-12-01');
    expect(can(permisosDe(['rrhh'], agregado), 'liquidacion.liquidaciones:editar')).toBe(true);
    expect(can(permisosDe(['finanzas'], agregado), 'liquidacion.liquidaciones:transicionar')).toBe(true);
    expect(can(permisosDe(['finanzas'], agregado), 'liquidacion.liquidaciones:editar')).toBe(false);
    expect(can(permisosDe(['chofer'], agregado), 'chofer.mis_liquidaciones:ver')).toBe(true);
    expect(can(permisosDe(['chofer'], agregado), 'liquidacion.liquidaciones:ver')).toBe(false);
  });
});

describe('liquidación de sueldo de Chile (migración 66)', () => {
  it('lee el cálculo legal y el egreso tal como los manda la base', async () => {
    const { parsearLiquidacion } = await import('@/modules/liquidacion/domain/liquidacion.types');
    const { clp } = await import('@/modules/liquidacion/domain/legal.types');
    const l = parsearLiquidacion({
      id: 1,
      numero: 'LQ-000001',
      estado: 'pagada',
      egreso_numero: 'CE-000001',
      egreso_letras: 'un millón ochenta y un mil cuarenta y nueve pesos',
      legal: {
        congelado: true,
        faltan: [],
        ficha: { rut: '12.345.678-5', salud: 'fonasa', contrato: 'indefinido', afp_comision_pct: 0.46 },
        haberes: [{ codigo: 'SUELDO_BASE', nombre: 'Sueldo base', imponible: true, importe: 553553 }],
        total_haberes: 1664000,
        liquido: 1447959,
        a_pagar: 1081049,
      },
      planilla: { viajes: [], fondo: [{ moneda: 'CLP', entregado: 563030, gastos: 225000, devuelto: 0, diferencia: 338030 }] },
    });
    expect(l.legal?.liquido).toBe(1447959);
    expect(l.legal?.ficha?.rut).toBe('12.345.678-5');
    expect(l.legal?.haberes[0]?.imponible).toBe(true);
    expect(l.planilla.fondo[0]?.diferencia).toBe(338030);
    expect(l.egresoNumero).toBe('CE-000001');
    expect(clp(1081049)).toBe('1.081.049');
  });
});
