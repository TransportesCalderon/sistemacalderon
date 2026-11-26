import { describe, expect, it } from 'vitest';
import {
  moraCajaSchema,
  moverPaso,
  parsearRepartoCaja,
  reglasCambiadas,
  reglasRepartoSchema,
  resumenReparto,
  textoTasa,
} from '@/modules/finanzas/domain/reparto-caja';

const reglas = { orden: ['cuotas', 'sueldos', 'espalda', 'deudas'], espalda: 60000000, reserva_sueldos_dias: 10, cuotas_dias: 7 };
const cuota = {
  clave: 'gasto:99208', origen: 'gasto', id: 99208, titulo: 'ZZ Leasing SA · ZZ Leasing tractor · 09/2026 · cuota 4 de 12', detalle: 'GA-ZZ208', fecha: null,
  vence: '2026-09-15', dias_atraso: 72, moneda: 'CLP', monto: 4500000, clp: 4500000, clase: 'cuota', acreedor_tipo: 'fijo', acreedor_id: 99301,
  acreedor: 'ZZ Leasing SA · ZZ Leasing tractor', critico: false, tasa: 2.5, tasa_fuente: 'observada', tasa_nota: null, se_paga: true, mas_vencidas: 2, mas_vencidas_clp: 9000000,
};
const crudo = {
  hoy: '2026-11-26', moneda: 'CLP',
  dinero: { en_caja: 4790000, usa_caja: true, entra: 150000000, entra_moneda: 'CLP', entra_clp: 150000000, total: 154790000 },
  reglas: { ...reglas, guardadas: reglas },
  pasos: [
    { codigo: 'cuotas', titulo: 'Una cuota de cada leasing o crédito', que_es: 'ZZ', necesita: 12260000, asignado: 12260000, falta: 0, queda_despues: 142530000, items: [cuota] },
    { codigo: 'sueldos', titulo: 'Guardar para los sueldos de los próximos 10 días', que_es: 'ZZ', necesita: 3920000, asignado: 3920000, falta: 0, queda_despues: 138610000,
      items: [{ clave: 'liquidacion:99401', origen: 'liquidacion', titulo: 'Sueldo 11/2026 · ZZ', fecha: '2026-11-30', vence: '2026-11-30', dias_atraso: 0, moneda: 'CLP', monto: 820000, clp: 820000, clase: 'sueldo' }] },
    { codigo: 'espalda', titulo: 'Espalda para operar', que_es: 'ZZ', necesita: 60000000, asignado: 60000000, falta: 0, queda_despues: 78610000, items: [],
      gasto_operativo: { dias: 30, combustible: 18000000, fondos: 4500000, aduana: 1500000, total: 24000000, por_dia: 800000, pagos: 3 }, comprometido: 1880000,
      dias_que_cubre: 75, dias_que_cubriria_completa: 75 },
    { codigo: 'deudas', titulo: 'Cancelar deudas vencidas', que_es: 'ZZ', necesita: 19550000, asignado: 19550000, falta: 0, queda_despues: 59060000,
      items: [{ clave: 'gasto:99213', origen: 'gasto', titulo: 'ZZ Combustibles SA · ZZ Combustible de octubre', vence: '2026-11-05', dias_atraso: 21, moneda: 'CLP', monto: 6000000, clp: 6000000,
                clase: 'proveedor', acreedor_tipo: 'proveedor', acreedor_id: 9903, acreedor: 'ZZ Combustibles SA', critico: true, tasa: null, se_paga: true }] },
    { codigo: 'inventado', titulo: 'ZZ no existe', necesita: 1, asignado: 1, falta: 0, items: [] },
  ],
  repartido: 95730000, sobra: 59060000, sin_cubrir: 0,
  vence_pronto: { dias: 7, monto: 2085000, cantidad: 2, items: [] },
  avisos: ['ZZ aviso'], puede_editar: true,
};

describe('migración 368: qué hacemos con la plata', () => {
  const r = parsearRepartoCaja(crudo);

  it('lee la plata, las reglas y los cuatro pasos', () => {
    expect(r.dinero).toMatchObject({ enCaja: 4790000, entraClp: 150000000, total: 154790000, usaCaja: true });
    expect(r.reglas.orden).toEqual(['cuotas', 'sueldos', 'espalda', 'deudas']);
    expect(r.reglas.guardadas.espalda).toBe(60000000);
    // Un paso que la web no conoce no se muestra
    expect(r.pasos.map((p) => p.codigo)).toEqual(['cuotas', 'sueldos', 'espalda', 'deudas']);
    expect(r.pasos[0]!.items[0]).toMatchObject({ sePaga: true, tasa: 2.5, tasaFuente: 'observada', acreedorTipo: 'fijo', acreedorId: 99301, masVencidas: 2, diasAtraso: 72 });
    // Los sueldos solo se apartan: no llevan «se paga» ni acreedor
    expect(r.pasos[1]!.items[0]).toMatchObject({ sePaga: null, acreedorTipo: null, tasa: null });
    expect(r.pasos[2]).toMatchObject({ diasQueCubre: 75, comprometido: 1880000 });
    expect(r.pasos[2]!.gastoOperativo).toMatchObject({ porDia: 800000, combustible: 18000000 });
    expect(r.pasos[3]!.items[0]).toMatchObject({ critico: true, tasa: null, tasaFuente: null });
    expect(r.repartido + r.sobra).toBe(r.dinero.total);
    expect(r.puedeEditar).toBe(true);
  });

  it('resume la propuesta: alcanza, alcanza justo o no alcanza', () => {
    expect(resumenReparto(r)).toEqual({ tono: 'bien', texto: 'Con $ 154.790.000 alcanza para los cuatro pasos y sobran $ 59.060.000.' });
    const corto = parsearRepartoCaja({
      ...crudo,
      dinero: { ...crudo.dinero, entra: 20000000, entra_clp: 20000000, total: 24790000 },
      pasos: [crudo.pasos[0], crudo.pasos[1], { ...crudo.pasos[2], asignado: 8610000, falta: 51390000 }, { ...crudo.pasos[3], asignado: 0, falta: 19550000 }],
      sobra: 0, sin_cubrir: 70940000,
    });
    expect(resumenReparto(corto).tono).toBe('mal');
    expect(resumenReparto(corto).texto).toContain('alcanza para una cuota de cada leasing o crédito, guardar para los sueldos que vienen');
    expect(resumenReparto(corto).texto).toContain('en «espalda para operar» faltan $ 51.390.000');
    const soloDeudas = parsearRepartoCaja({ ...crudo, pasos: [crudo.pasos[0], crudo.pasos[1], crudo.pasos[2], { ...crudo.pasos[3], asignado: 1550000, falta: 18000000 }], sobra: 2060000, sin_cubrir: 18000000 });
    expect(resumenReparto(soloDeudas).tono).toBe('justo');
    expect(resumenReparto(parsearRepartoCaja({ ...crudo, dinero: { ...crudo.dinero, total: 0 } })).tono).toBe('mal');
  });

  it('sabe si se están probando reglas distintas de las guardadas', () => {
    expect(reglasCambiadas(r)).toBe(false);
    expect(reglasCambiadas(parsearRepartoCaja({ ...crudo, reglas: { ...reglas, espalda: 80000000, guardadas: reglas } }))).toBe(true);
    expect(reglasCambiadas(parsearRepartoCaja({ ...crudo, reglas: { ...reglas, orden: ['sueldos', 'cuotas', 'espalda', 'deudas'], guardadas: reglas } }))).toBe(true);
    // Un orden mal escrito vuelve al de siempre
    expect(parsearRepartoCaja({ ...crudo, reglas: { ...reglas, orden: ['sueldos'], guardadas: reglas } }).reglas.orden).toEqual(['cuotas', 'sueldos', 'espalda', 'deudas']);
  });

  it('sube y baja un paso sin perder ninguno', () => {
    expect(moverPaso(['cuotas', 'sueldos', 'espalda', 'deudas'], 'espalda', -1)).toEqual(['cuotas', 'espalda', 'sueldos', 'deudas']);
    expect(moverPaso(['cuotas', 'sueldos', 'espalda', 'deudas'], 'cuotas', -1)).toEqual(['cuotas', 'sueldos', 'espalda', 'deudas']);
    expect(moverPaso(['cuotas', 'sueldos', 'espalda', 'deudas'], 'deudas', 1)).toEqual(['cuotas', 'sueldos', 'espalda', 'deudas']);
    expect(moverPaso(['cuotas', 'sueldos', 'espalda', 'deudas'], 'sueldos', 1)).toEqual(['cuotas', 'espalda', 'sueldos', 'deudas']);
  });

  it('escribe el interés como se dice', () => {
    expect(textoTasa(2.5)).toBe('2,5 % por mes');
    expect(textoTasa(3)).toBe('3 % por mes');
    expect(textoTasa(1.256)).toBe('1,26 % por mes');
  });

  it('una respuesta vacía no rompe', () => {
    const v = parsearRepartoCaja(null);
    expect(v.pasos).toEqual([]);
    expect(v.puedeEditar).toBe(false);
    expect(v.reglas.orden).toHaveLength(4);
  });

  it('valida lo que se manda a guardar', () => {
    expect(reglasRepartoSchema.safeParse({ orden: ['sueldos', 'espalda', 'cuotas', 'deudas'], espalda: '60.000.000', reservaSueldosDias: 10, cuotasDias: 7 }).data).toMatchObject({ espalda: 60000000 });
    expect(reglasRepartoSchema.safeParse({ orden: ['sueldos', 'espalda'], espalda: 1, reservaSueldosDias: 10, cuotasDias: 7 }).success).toBe(false);
    expect(reglasRepartoSchema.safeParse({ orden: ['sueldos', 'espalda', 'cuotas', 'deudas'], espalda: '', reservaSueldosDias: 10, cuotasDias: 7 }).success).toBe(false);
    expect(reglasRepartoSchema.safeParse({ orden: ['sueldos', 'espalda', 'cuotas', 'deudas'], espalda: 1, reservaSueldosDias: 90, cuotasDias: 7 }).success).toBe(false);
    expect(moraCajaSchema.safeParse({ tipo: 'proveedor', id: 9902, tasaMensual: '2,5', nota: '  ' }).data).toEqual({ tipo: 'proveedor', id: 9902, tasaMensual: 2.5, nota: null });
    // Vacío = sacar el dato
    expect(moraCajaSchema.safeParse({ tipo: 'fijo', id: 99301, tasaMensual: '', nota: null }).data?.tasaMensual).toBeNull();
    expect(moraCajaSchema.safeParse({ tipo: 'fijo', id: 99301, tasaMensual: '80', nota: null }).success).toBe(false);
    expect(moraCajaSchema.safeParse({ tipo: 'cliente', id: 1, tasaMensual: '1', nota: null }).success).toBe(false);
  });
});
