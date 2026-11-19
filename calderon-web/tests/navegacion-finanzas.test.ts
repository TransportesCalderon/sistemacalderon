import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NAVEGACION } from '@/modules/core/navigation/navigation';
import { rutaDe } from '@/modules/core/navigation/rutas';

/** 19/11/2026 · Navegación de Finanzas: una sola puerta para cobrar y un solo nombre para lo por cobrar. */
describe('Finanzas: Facturación y Por cobrar', () => {
  it('la entrada se llama «Facturación» (sin «cobranzas»)', () => {
    const fin = NAVEGACION.find((g) => g.id === 'finanzas')!;
    expect(fin.entradas.find((e) => e.href === '/analisis/facturacion')?.etiqueta).toBe('Facturación');
    expect(rutaDe('/analisis/facturacion')?.titulo).toBe('Facturación');
  });

  it('la ficha de la factura ya no registra el cobro: lleva a Cobros y pagos', () => {
    const src = readFileSync('src/modules/ventas/components/facturacion-pantalla.tsx', 'utf8');
    expect(src).not.toContain('Registrar el cobro');
    expect(src).toContain('Cobrar en Cobros y pagos');
  });

  it('Cobros y pagos usa «Por cobrar» y «Por pagar»', () => {
    const src = readFileSync('src/modules/finanzas/components/cobros-pagos-pantalla.tsx', 'utf8');
    expect(src).toContain('["cobrar", "Por cobrar"]');
    expect(src).toContain('["pagar", "Por pagar"]');
    expect(src).not.toContain('"Nos deben"');
  });

  it('la cuenta corriente está en Cobros y pagos, no en Facturación', () => {
    const cobros = readFileSync('src/modules/finanzas/components/cobros-pagos-pantalla.tsx', 'utf8');
    const fac = readFileSync('src/modules/ventas/components/facturacion-pantalla.tsx', 'utf8');
    expect(cobros).toContain('["cuenta", "Cuenta corriente"]');
    expect(fac).not.toContain('CuentaCorrienteVista');
  });
});
