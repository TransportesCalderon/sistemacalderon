import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NAVEGACION } from '@/modules/core/navigation/navigation';
import { rutaDe } from '@/modules/core/navigation/rutas';
import { PESTANAS_CONCILIACION } from '@/shared/ui/pestanas-secciones';

const leer = (ruta: string) => readFileSync(ruta, 'utf8');
const FIN = 'src/modules/finanzas/components';

/**
 * 20/11/2026 · Plan de simplificación de proveedores, pagos y bancos (solo web): una pregunta = una pantalla principal,
 * una acción = un lugar principal.
 */
describe('plan de simplificación: proveedores, pagos y bancos', () => {
  it('1 · Gastos es para cargar: abre en «Todos» y el combustible lleva a Por pagar', () => {
    expect(leer(`${FIN}/gastos-pantalla.tsx`)).toContain("useState<string>('')");
    const comb = leer(`${FIN}/combustible-pantalla.tsx`);
    expect(comb).not.toContain('Cargas sin factura del proveedor ·');
    expect(comb).toContain('/analisis/cobros-pagos?ver=pagar&estaciones=1');
  });

  it('2 · Por pagar tiene un solo total: facturas y estaciones plegadas', () => {
    const cobros = leer(`${FIN}/cobros-pagos-pantalla.tsx`);
    expect(cobros).toContain('Facturas por vencimiento');
    expect(cobros).not.toContain('Gastos por pagar ·');
    expect(leer(`${FIN}/cuenta-estaciones.tsx`)).toContain('Detalle por estación');
    expect(leer(`${FIN}/tablero.tsx`)).toContain('titulo="Facturas por pagar"');
  });

  it('3 · un solo «Pagar»: la ficha del gasto lleva a Por pagar y las filas pagan solo esa factura', () => {
    const ficha = leer(`${FIN}/gasto-ficha.tsx`);
    expect(ficha).not.toContain('<PagarGasto gastoId={g.id}');
    expect(ficha).toContain('Pagar en Por pagar');
    expect(leer(`${FIN}/cobros-pagos-pantalla.tsx`)).toContain('Pagar solo esta factura');
    const cuenta = leer(`${FIN}/cuenta-proveedores.tsx`);
    expect(cuenta).not.toContain('<Plus className="size-4" /> Orden de pago');
    expect(cuenta).toContain("params.get('pagar') === '1'");
  });

  it('3 · Gastos fijos tampoco registra pagos: cada cuota lleva a Por pagar', () => {
    const fijos = leer(`${FIN}/gastos-fijos-pantalla.tsx`);
    expect(fijos).not.toContain('<PagarGasto');
    expect(fijos).toContain('/analisis/cobros-pagos?ver=pagar&facturas=1&gasto=${c.gastoId}');
  });

  it('4 · un solo menú para el banco: «Bancos» con Cuentas, Movimientos y Cambios de moneda', () => {
    const fin = NAVEGACION.find((g) => g.id === 'finanzas')!;
    expect(fin.entradas.find((e) => e.href === '/conciliacion')?.etiqueta).toBe('Bancos');
    expect(rutaDe('/conciliacion')?.titulo).toBe('Bancos');
    expect(PESTANAS_CONCILIACION.map((p) => p.etiqueta)).toEqual(['Cuentas', 'Movimientos', 'Cambios de moneda']);
    expect(PESTANAS_CONCILIACION[1].href).toBe('/conciliacion?vista=movimientos');
    // «Entradas y salidas» salió de Cobros y pagos y la dirección vieja redirige
    expect(leer(`${FIN}/cobros-pagos-pantalla.tsx`)).not.toContain('["movimientos", "Entradas y salidas"]');
    expect(leer('src/app/(app)/finanzas/cobros-pagos/page.tsx')).toContain("redirect('/conciliacion?vista=movimientos')");
    expect(leer('src/app/(app)/conciliacion/page.tsx')).toContain("sp.vista === 'movimientos'");
  });

  it('5 · conciliación en cadena', () => {
    const cartola = leer(`${FIN}/cartola-pantalla.tsx`);
    expect(cartola).toContain('Siguiente cuenta con líneas por conciliar');
    expect(cartola).toContain('Otro ingreso (no es una transferencia entre nuestras cuentas)');
    expect(leer(`${FIN}/bancos-pantalla.tsx`)).toContain('Number(b.porConciliar > 0) - Number(a.porConciliar > 0)');
  });
});
