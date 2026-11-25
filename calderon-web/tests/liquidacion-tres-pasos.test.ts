import { describe, expect, it } from 'vitest';
import { hojaNovedades, nombreModelo, xlsxNovedades, type NovedadChofer } from '@/modules/liquidacion/domain/novedades';
import { parsearLiquidacion, parsearPeriodo } from '@/modules/liquidacion/domain/liquidacion.types';
import { parsearLegal } from '@/modules/liquidacion/domain/legal.types';
import { bonoColaboradoresSchema } from '@/modules/liquidacion/domain/liquidacion.schemas';

const nov: NovedadChofer = {
  chofer: 'Chofer Uno',
  rut: '12.345.678-5',
  estado: 'borrador',
  basico: 184665,
  bonoViaje: 160000,
  otrosImponibles: 0,
  viaticos: 120000,
  dias: 12,
  adicionalKm: 0,
  bonoDesempeno: 0,
  otrosNoImponibles: 0,
  totalImponible: 344665,
  totalNoImponible: 120000,
};

describe('liquidación en 3 pasos', () => {
  it('arma las novedades exactamente como el modelo de RRHH para Colaboradores', () => {
    const h = hojaNovedades([nov, { ...nov, chofer: 'Argomedo, Kevin' }], 'Noviembre 2026');
    const en = (f: number, c: number) => h.celdas.find((x) => x.fila === f && x.col === c)?.valor;
    expect(en(1, 1)).toBe('CHOFER');
    expect(en(2, 1)).toBe('CHOFER UNO');
    expect(en(3, 1)).toBe('NOVEDADES NOVIEMBRE 2026');
    expect([en(4, 1), en(4, 2)]).toEqual(['BONO POR VIAJE', 160000]);
    expect([en(5, 1), en(5, 2)]).toEqual(['BASICO', 184665]);
    expect([en(6, 1), en(6, 2)]).toEqual(['TOTAL IMPONIBLE', 344665]);
    expect([en(7, 1), en(7, 2)]).toEqual(['', '']);
    expect([en(8, 1), en(8, 2)]).toEqual(['TOTAL NO IMPONIBLE', 120000]);
    expect(en(10, 1)).toBe('ARGOMEDO KEVIN');
    expect(h.combinadas).toEqual(['A3:B3', 'A11:B11']);
    expect(nombreModelo('Agüero, Ezequiel')).toBe('AGÜERO EZEQUIEL');
    const x = xlsxNovedades([nov], 'Noviembre 2026');
    expect([x[0], x[1]]).toEqual([0x50, 0x4b]);
  });

  it('lee días trabajados, bono por desempeño y el bono de Colaboradores', () => {
    const l = parsearLiquidacion({
      id: 1,
      estado: 'borrador',
      viatico_dia: 10000,
      dias_trabajados: [{ fecha: '2026-11-03', trabajado: true, propuesto: true, fuente: 'gps', detalle: 'Manejó 120 km', motivo: null }],
      bono_desempeno: { aplica: true, importe: 200000, consumo: 33.5, consumo_max: 34, cumple_consumo: true, sin_faltantes: null, otorgar: false },
      colaboradores: { imponible: 394665, gratificacion: 50000, no_imponible: 120000, afp: 39000, salud: 27600, cesantia: 2400, liquido: 445665 },
      legal: { fuente: 'colaboradores', gratificacion: 50000, a_pagar: 400000, avisos: ['AFP: revisar'] },
    });
    expect(l.diasTrabajados[0]!.fuente).toBe('gps');
    expect(l.bonoDesempeno!.cumpleConsumo).toBe(true);
    expect(l.bonoDesempeno!.sinFaltantes).toBeNull();
    expect(l.colaboradores!.liquido).toBe(445665);
    expect(l.legal!.fuente).toBe('colaboradores');
    expect(l.legal!.avisos).toHaveLength(1);
    expect(parsearLegal({ faltan: [] })!.fuente).toBe('sistema');
  });

  it('lee los tramos con su estado y la baja del chofer', () => {
    const l = parsearLiquidacion({
      id: 1,
      baja_chofer: '2026-11-10',
      tramos: [
        { item_id: 87, viaje: 'VC-000009', linea: 'SAI-MZA', km: 477, canon: 80000, canon_moneda: 'CLP', canon_base: 80000, estado: 'no_se_liquida', detalle: 'Liquidado en octubre' },
        { item_id: 89, viaje: 'VC-000039', linea: 'SAI-BSAS', km: 477, canon: 80000, canon_moneda: 'CLP', canon_base: 80000, estado: 'incluido', ajustado: true },
      ],
    });
    expect(l.bajaChofer).toBe('2026-11-10');
    expect(l.tramos).toHaveLength(2);
    expect(l.tramos[0]!.estado).toBe('no_se_liquida');
    expect(l.tramos[1]!.ajustado).toBe(true);
  });

  it('la lista dice si ya tiene el bono y cuánto se transfiere', () => {
    const p = parsearPeriodo({ liquidaciones: [{ id: 1, estado: 'aprobada', con_bono: true, a_pagar: 350000 }, { id: 2, estado: 'borrador' }] });
    expect(p.liquidaciones[0]!.aPagar).toBe(350000);
    expect(p.liquidaciones[1]!.conBono).toBe(false);
    expect(p.liquidaciones[1]!.aPagar).toBeNull();
  });

  it('los importes del bono quedan como enteros sin puntos', () => {
    const r = bonoColaboradoresSchema.parse({ id: 1, imponible: '394.665', liquido: 445665, pdfRuta: null });
    expect(r.imponible).toBe('394665');
    expect(r.liquido).toBe('445665');
    expect(r.afp).toBe('');
  });
});
