import { describe, expect, it } from 'vitest';
import {
  agruparPartidas,
  ajustarPlanSchema,
  cerrarPartidaSchema,
  etiquetaSemana,
  parsearPlanCaja,
  partidaCajaSchema,
  partidasDeCubo,
  partidasDeSemana,
  situacionPlan,
} from '@/modules/finanzas/domain/plan-caja';

/** Lo que devuelve fin.fn_plan_caja (recortado), con los nombres de la base. */
const crudo = {
  hoy: '2026-11-26', moneda: 'CLP', semanas: 4, hasta: '2026-12-20', con_dudosas: false, con_viajes: true, puede_editar: true,
  caja: {
    total: 4790000,
    cuentas: [
      { id: 1, nombre: 'ZZ Pesos', tipo: 'banco', moneda: 'CLP', saldo: 3500000, saldo_vista: 3500000, cartola_fecha: '2026-11-18', cartola_saldo: 3400000, por_conciliar: 1 },
      { id: 2, nombre: 'ZZ Dólares', tipo: 'banco', moneda: 'USD', saldo: 1200, saldo_vista: 1140000, cartola_fecha: null, cartola_saldo: null, por_conciliar: 0 },
      { id: 3, nombre: 'ZZ Caja', tipo: 'caja', moneda: 'CLP', saldo: 150000, saldo_vista: 150000 },
    ],
  },
  plan: [
    { n: 0, desde: '2026-11-26', hasta: '2026-11-29', entradas: 0, salidas: 530000, neto: -530000, saldo: 4260000, saldo_prudente: 4260000 },
    { n: 1, desde: '2026-11-30', hasta: '2026-12-06', entradas: 33250000, salidas: 3605000, neto: 29645000, saldo: 33905000, saldo_prudente: 33905000 },
    { n: 2, desde: '2026-12-07', hasta: '2026-12-13', entradas: 11400000, salidas: 2300000, neto: 9100000, saldo: 43005000, saldo_prudente: 43005000 },
    { n: 3, desde: '2026-12-14', hasta: '2026-12-20', entradas: 13490000, salidas: 11300000, neto: 2190000, saldo: 45195000, saldo_prudente: 31705000 },
  ],
  resumen: {
    entradas: 58140000, salidas: 17735000, saldo_final: 45195000,
    saldo_minimo: { n: 0, desde: '2026-11-26', hasta: '2026-11-29', saldo: 4260000 },
    primera_negativa: null, prudente_minimo: { n: 0, desde: '2026-11-26', hasta: '2026-11-29', saldo: 4260000 }, prudente_primera_negativa: null,
    sin_fecha_cobrar: { monto: 8075000, cantidad: 1 }, sin_fecha_pagar: { monto: 0, cantidad: 0 },
    despues_entradas: 0, despues_salidas: 0,
    dudosas_sin_contar: { entradas: 6000000, salidas: 0, cantidad: 1 }, no_contar: { entradas: 1900000, salidas: 600000, cantidad: 2 },
  },
  partidas: [
    { clave: 'partida:3', origen: 'partida', id: 3, sentido: 'entrada', grupo: 'previstas_entrada', titulo: 'ZZ Venta de 2 generadores', fecha: '2026-12-02', moneda: 'CLP', monto: 6000000,
      monto_vista: 6000000, certeza: 'dudosa', cubo: 'semana', semana: 1, cuenta: false, categoria: 'venta_activo', descripcion: 'ZZ Venta de 2 generadores', version: 1 },
    { clave: 'partida:1', origen: 'partida', id: 1, sentido: 'entrada', grupo: 'previstas_entrada', titulo: 'ZZ Venta del tractor · ZZ Comprador', fecha: '2026-12-04', moneda: 'USD', monto: 35000,
      monto_vista: 33250000, certeza: 'segura', cubo: 'semana', semana: 1, cuenta: true, categoria: 'venta_activo', tercero: 'ZZ Comprador', descripcion: 'ZZ Venta del tractor', version: 2 },
    { clave: 'gasto:99201', origen: 'gasto', id: 99201, sentido: 'salida', grupo: 'proveedores', titulo: 'ZZ Repuestos', fecha: '2026-12-03', fecha_base: '2026-12-03', supuesto: 'Por su vencimiento',
      moneda: 'CLP', monto: 1800000, monto_vista: 1800000, certeza: 'segura', cubo: 'semana', semana: 1, cuenta: true, ajustable: true },
    { clave: 'liquidacion:99401', origen: 'liquidacion', id: 99401, sentido: 'salida', grupo: 'sueldos', titulo: 'Sueldo 11/2026 · ZZ', fecha: '2026-11-30', moneda: 'CLP', monto: 820000,
      monto_vista: 820000, certeza: 'segura', cubo: 'semana', semana: 1, cuenta: true, ajustable: true },
    { clave: 'factura:99001', origen: 'factura', id: 99001, sentido: 'entrada', grupo: 'facturas', titulo: 'ZZ Dorinka · 110-901', fecha: '2026-12-09', fecha_base: '2026-10-20', moneda: 'USD', monto: 12000,
      monto_vista: 11400000, certeza: 'segura', cubo: 'semana', semana: 2, cuenta: true, ajustada: true, fecha_cargada: '2026-12-09', certeza_cargada: 'segura', nota: 'Prometió pagar el 9', ajustable: true },
    { clave: 'factura:99002', origen: 'factura', id: 99002, sentido: 'entrada', grupo: 'facturas', titulo: 'ZZ Dorinka · 110-902', fecha: null, fecha_base: '2026-11-09',
      supuesto: 'Vencida: falta cargar cuándo va a pagar', moneda: 'USD', monto: 8500, monto_vista: 8075000, certeza: 'probable', cubo: 'sin_fecha', semana: null, cuenta: true, ajustable: true },
    { clave: 'fijo:99302:2026-12', origen: 'fijo', id: 99302, sentido: 'salida', grupo: 'fijos', titulo: 'ZZ Arriendo · 12/2026', fecha: '2026-12-05', moneda: 'CLP', monto: 600000, monto_vista: 600000,
      certeza: 'segura', cubo: 'no_contar', semana: null, cuenta: false, ajustada: true, ajustable: true, solo_contar: true },
    { clave: 'rara:1', origen: 'rara', id: 1, sentido: 'salida', grupo: 'renglon_nuevo', titulo: 'ZZ algo que la web no conoce', fecha: '2026-12-01', moneda: 'CLP', monto: 10, monto_vista: 10, certeza: 'x',
      cubo: 'semana', semana: 1, cuenta: true },
  ],
  avisos: ['ZZ aviso'],
  cuenta_venta_activos: { codigo: '4.1.02', nombre: 'Venta de activos' },
  categorias: [{ codigo: 'venta_activo', tipo: 'entrada', nombre: 'Venta de un activo' }, { codigo: 'impuestos', tipo: 'salida', nombre: 'Impuestos e imposiciones' }],
  cerradas: [{ id: 6, tipo: 'salida', descripcion: 'ZZ Imposiciones (3 de 3)', fecha: '2027-02-12', moneda: 'CLP', monto: 2300000, estado: 'anulada', cerrada_en: '2026-11-26' }],
};

describe('migración 367: planificador de caja', () => {
  const plan = parsearPlanCaja(crudo);

  it('lee la caja, las semanas y el resumen', () => {
    expect(plan.moneda).toBe('CLP');
    expect(plan.puedeEditar).toBe(true);
    expect(plan.caja.total).toBe(4790000);
    expect(plan.caja.cuentas[2]).toMatchObject({ tipo: 'caja', cartolaFecha: null, porConciliar: 0 });
    expect(plan.plan).toHaveLength(4);
    expect(plan.plan[3]).toMatchObject({ saldo: 45195000, saldoPrudente: 31705000 });
    expect(plan.resumen.primeraNegativa).toBeNull();
    expect(plan.resumen.sinFechaCobrar).toEqual({ monto: 8075000, cantidad: 1 });
    expect(plan.cuentaVentaActivos?.codigo).toBe('4.1.02');
    expect(plan.cerradas[0]).toMatchObject({ estado: 'anulada', cerradaEn: '2026-11-26' });
  });

  it('distingue lo que cargó una persona de lo que propone el sistema', () => {
    const dorinka = plan.partidas.find((p) => p.clave === 'factura:99001')!;
    expect(dorinka).toMatchObject({ ajustada: true, fechaCargada: '2026-12-09', certezaCargada: 'segura', nota: 'Prometió pagar el 9' });
    const repuestos = plan.partidas.find((p) => p.clave === 'gasto:99201')!;
    expect(repuestos).toMatchObject({ ajustada: false, fechaCargada: null, certezaCargada: null, fecha: '2026-12-03' });
    expect(plan.partidas.find((p) => p.origen === 'fijo')!.soloContar).toBe(true);
  });

  it('arma los renglones de una semana: primero lo que entra, y suma solo lo que cuenta', () => {
    const g = agruparPartidas(partidasDeSemana(plan, 1));
    expect(g.map((x) => x.codigo)).toEqual(['previstas_entrada', 'proveedores', 'sueldos', 'otras_salida']);
    // La venta dudosa se muestra pero no suma
    expect(g[0]!.partidas).toHaveLength(2);
    expect(g[0]!.total).toBe(33250000);
    expect(g[1]!.total).toBe(1800000);
  });

  it('separa lo vencido sin fecha y lo que no se cuenta', () => {
    expect(partidasDeCubo(plan, 'sin_fecha', 'entrada').map((p) => p.id)).toEqual([99002]);
    expect(partidasDeCubo(plan, 'sin_fecha', 'salida')).toHaveLength(0);
    expect(partidasDeCubo(plan, 'no_contar').map((p) => p.origen)).toEqual(['fijo']);
  });

  it('nombra las semanas y resume la situación', () => {
    expect(etiquetaSemana(plan.plan[0]!)).toBe('Esta semana');
    expect(etiquetaSemana(plan.plan[1]!)).toBe('Semana del 30/11');
    expect(situacionPlan(plan)).toMatchObject({ tono: 'bien' });
    expect(situacionPlan(plan).texto).toContain('no baja de $ 4.260.000');
    const justo = { ...plan, resumen: { ...plan.resumen, prudentePrimeraNegativa: { n: 3, desde: '2026-12-14', hasta: '2026-12-20', falta: 500000 } } };
    expect(situacionPlan(justo).tono).toBe('justo');
    expect(situacionPlan(justo).texto).toContain('si solo entra lo seguro, faltan $ 500.000 la semana del 14/12');
    const mal = { ...plan, resumen: { ...plan.resumen, primeraNegativa: { n: 0, desde: '2026-11-26', hasta: '2026-11-29', falta: 545000 } } };
    expect(situacionPlan(mal)).toEqual({ tono: 'mal', texto: 'Con lo previsto, la caja no alcanza esta semana: faltan $ 545.000.' });
  });

  it('una respuesta vacía no rompe', () => {
    const v = parsearPlanCaja(null);
    expect(v.plan).toEqual([]);
    expect(v.partidas).toEqual([]);
    expect(v.puedeEditar).toBe(false);
    expect(v.cuentaVentaActivos).toBeNull();
  });

  it('valida lo que se manda a guardar', () => {
    expect(ajustarPlanSchema.safeParse({ origen: 'factura', id: 99001, fecha: '2026-12-09', contar: true, certeza: null, nota: '  ' }).data).toMatchObject({ nota: null });
    expect(ajustarPlanSchema.safeParse({ origen: 'partida', id: 1, fecha: null, contar: true, certeza: null, nota: null }).success).toBe(false);
    expect(ajustarPlanSchema.safeParse({ origen: 'gasto', id: 1, fecha: '09/12/2026', contar: true, certeza: null, nota: null }).success).toBe(false);
    const base = { id: null, version: null, tipo: 'entrada', categoria: 'venta_activo', descripcion: 'Venta del tractor', tercero: '', fecha: '2026-12-04', moneda: 'USD', certeza: 'segura', nota: '',
                   repetir: { cada: 'no', veces: 1 } };
    expect(partidaCajaSchema.safeParse({ ...base, monto: '35.000' }).data).toMatchObject({ monto: 35000, tercero: null, nota: null });
    expect(partidaCajaSchema.safeParse({ ...base, monto: '9.500.000,50' }).data?.monto).toBe(9500000.5);
    expect(partidaCajaSchema.safeParse({ ...base, monto: '' }).success).toBe(false);
    expect(partidaCajaSchema.safeParse({ ...base, monto: '10', descripcion: 'ab' }).success).toBe(false);
    expect(partidaCajaSchema.safeParse({ ...base, monto: '10', repetir: { cada: 'mes', veces: 30 } }).success).toBe(false);
    expect(cerrarPartidaSchema.safeParse({ id: 3, accion: 'cumplida', fecha: '2026-11-26' }).success).toBe(true);
    expect(cerrarPartidaSchema.safeParse({ id: 3, accion: 'borrar', fecha: null }).success).toBe(false);
  });
});
