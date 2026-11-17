import { describe, expect, it } from 'vitest';
import { nombreMes, parsearClienteResumen } from '@/modules/comercial/domain/cliente-resumen';

describe('Ficha del cliente · servicios, rentabilidad y auditoría', () => {
  it('lee lo que devuelve la base y respeta lo que el perfil no ve', () => {
    const r = parsearClienteResumen({
      servicios: [{ servicio_id: 8, numero: '6262', fecha: '2026-10-27', estado: 'facturado', linea: 'ZZ-ZZ', precio: null, factura: '110-18' }],
      ve_ingresos: true,
      ve_rentabilidad: true,
      rentabilidad: [{ mes: '2026-11', viajes: 2, viajes_sin_precio: 1, ingreso_usd: 3000, ganancia_estimada_usd: 900, margen_estimado_pct: 30, facturado_usd: 6350, cobrado_usd: null }],
      ve_auditoria: false,
      auditoria: null,
    });
    expect(r.servicios[0]?.precio).toBeNull();
    expect(r.servicios[0]?.factura).toBe('110-18');
    expect(r.rentabilidad[0]?.cobradoUsd).toBeNull();
    expect(r.rentabilidad[0]?.margenPct).toBe(30);
    expect(r.veAuditoria).toBe(false);
    expect(r.auditoria).toEqual([]);
    expect(parsearClienteResumen(null).veRentabilidad).toBe(false);
  });

  it('nombra el mes', () => {
    expect(nombreMes('2026-11')).toBe('noviembre 2026');
    expect(nombreMes('cualquiera')).toBe('cualquiera');
  });
});
