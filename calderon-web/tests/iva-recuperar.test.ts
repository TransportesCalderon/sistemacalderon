import { describe, expect, it } from 'vitest';
import { montoClp, parsearIvaPorRecuperar } from '@/modules/finanzas/domain/iva-recuperar';

/** Migración 388 · IVA por recuperar (la base hace las cuentas; acá se lee). */
describe('IVA por recuperar', () => {
  it('lee lo que devuelve la base', () => {
    const d = parsearIvaPorRecuperar({
      desde: '2026-05-10', iva_pct: 19,
      resumen: { juntado: 1416059, recuperado: '1050000', en_tramite: 0, por_recuperar: 366059, disponible_para_pedir: 366059, facturas: 4, vehiculos: 0 },
      comparar: { cuenta_iva_credito: 0, debito_ventas: null },
      meses: [{ mes: '2026-11-01', facturas: 1, neto: 1512605, iva_facturas: 287395, iva_vehiculos: 0, juntado: 287395, debito_ventas: 0, recuperado: 850000, por_recuperar_al_cierre: 366059 }],
      proveedores: [{ proveedor: 'ZZ Combustibles SA', facturas: 1, iva: 957983 }, { facturas: 2, iva: 1 }],
      recuperaciones: [
        { id: 3, numero: 'IVR-000002', forma: 'devolucion_exportador', fecha: '2026-11-20', periodo_desde: '2026-10-01', periodo_hasta: '2026-10-01',
          monto_solicitado: 900000, estado: 'recuperada', fecha_recuperada: '2026-11-26', monto_recuperado: 850000, numero_tramite: 'SII-123', nota: '', motivo: null },
        { id: 4, numero: 'IVR-000003', forma: 'rara', estado: 'solicitada' },
      ],
      avisos: ['4 facturas sin número de documento', 7],
      puede_editar: true,
    });
    expect(d.resumen).toMatchObject({ recuperado: 1050000, porRecuperar: 366059, disponible: 366059 });
    expect(d.comparar).toEqual({ cuentaIvaCredito: 0, debitoVentas: null });
    expect(d.meses[0]).toMatchObject({ mes: '2026-11-01', porRecuperarAlCierre: 366059, recuperado: 850000 });
    expect(d.proveedores[1]!.proveedor).toBe('Sin proveedor');
    expect(d.recuperaciones).toHaveLength(1);
    expect(d.recuperaciones[0]).toMatchObject({ forma: 'devolucion_exportador', estado: 'recuperada', montoRecuperado: 850000, nota: null });
    expect(d.avisos).toEqual(['4 facturas sin número de documento']);
    expect(d.puedeEditar).toBe(true);
  });
  it('una respuesta vacía no rompe', () => {
    const d = parsearIvaPorRecuperar(null);
    expect(d.resumen.porRecuperar).toBe(0);
    expect(d.meses).toEqual([]);
    expect(d.puedeEditar).toBe(false);
  });
  it('lee el monto escrito a mano en pesos chilenos', () => {
    expect(montoClp('1.234.567')).toBe(1234567);
    expect(montoClp('$ 900.000')).toBe(900000);
    expect(montoClp('850000')).toBe(850000);
    expect(montoClp('')).toBeNaN();
  });
});
