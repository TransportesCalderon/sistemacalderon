import { describe, expect, it } from 'vitest';
import { leerListadoRemitos, numeroAr, parsearCruceRemitos, renglonesPdf, type TextoPdf } from '@/modules/finanzas/domain/listado-remitos';

// Migración 365 · Listado de facturación de remitos de QA Gestión (textos como los devuelve pdf.js, desordenados)
const t = (y: number, x: number, texto: string, pagina = 1): TextoPdf => ({ pagina, x, y, texto });
const textos: TextoPdf[] = [
  t(678.5, 106.3, 'FAB-0102-00000349'),
  t(678.5, 34.3, 'Comprobante:'),
  t(678.5, 241.3, '25/11/2026'),
  t(651.5, 241.3, '19/11/2026'),
  t(651.5, 54.3, 'AUREA CARGO SPA'),
  t(651.5, 301.3, 'REM-0001-00025374'),
  t(651.5, 420.1, '100,14'),
  t(651.5, 470.1, '2.332,00'),
  t(651.5, 520.1, '2.332,00'),
  t(651.5, 570.1, '233.526,48'),
  t(624.2, 241.3, '18/11/2026'),
  t(624.2, 301.3, 'REM-0001-00025311'),
  t(624.2, 420.1, '362,83'),
  t(624.2, 470.1, '2.609,00'),
  t(624.2, 520.1, '2.609,00'),
  t(624.2, 570.1, '946.615,64'),
  t(611.0, 241.3, '18/11/2026'),
  t(611.0, 301.3, 'REM-0001-00025311'),
  t(611.0, 420.1, '54,23'),
  t(611.0, 470.1, '2.609,00'),
  t(611.0, 520.1, '2.609,00'),
  t(611.4, 570.1, '141.486,07'),
  t(560.0, 520.1, 'Total:'),
  t(560.0, 570.1, '1.321.628,19'),
];

describe('listado de facturación de remitos', () => {
  it('lee el comprobante, la fecha, el total y cada renglón', () => {
    const l = leerListadoRemitos(renglonesPdf(textos));
    expect(l.comprobante).toBe('FAB-0102-00000349');
    expect(l.fecha).toBe('2026-11-25');
    expect(l.total).toBe(1321628.19);
    expect(l.remitos).toEqual([
      { fecha: '2026-11-19', numero: '0001-00025374', litros: 100.14, precio: 2332, total: 233526.48 },
      { fecha: '2026-11-18', numero: '0001-00025311', litros: 362.83, precio: 2609, total: 946615.64 },
      { fecha: '2026-11-18', numero: '0001-00025311', litros: 54.23, precio: 2609, total: 141486.07 },
    ]);
  });

  it('sin remitos devuelve la lista vacía', () => {
    expect(leerListadoRemitos(['Factura de otra cosa', 'Total: 10,00']).remitos).toEqual([]);
  });

  it('número argentino', () => {
    expect(numeroAr('7.857.637,60')).toBe(7857637.6);
    expect(numeroAr('100,14')).toBe(100.14);
  });

  it('parsea el cruce de la base', () => {
    const c = parsearCruceRemitos({
      remitos: [
        { numero: '0001-00025265', fecha: '2026-11-17', renglones: 1, litros: 18.97, total: 49484.9, carga_id: 138, como: 'litros', patente: 'GCSC92',
          carga_litros: 18.97, carga_importe: 49406.77, otra_factura: null, dif_litros: 0, dif_importe: 78.13 },
        { numero: '0001-00099999', fecha: '2026-11-18', renglones: 1, litros: 10, total: 26090, carga_id: null, como: null },
      ],
      sin_remito: [{ carga_id: 160, fecha: '2026-11-23', patente: 'RLWB45', litros: 204, importe: 532236 }],
    });
    expect(c.remitos[0]).toMatchObject({ cargaId: 138, como: 'litros', difImporte: 78.13, otraFactura: null });
    expect(c.remitos[1]).toMatchObject({ cargaId: null, como: null, patente: null });
    expect(c.sinRemito).toEqual([{ cargaId: 160, fecha: '2026-11-23', patente: 'RLWB45', litros: 204, importe: 532236 }]);
  });
});
