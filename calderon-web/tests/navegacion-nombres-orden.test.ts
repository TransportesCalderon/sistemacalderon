import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NAVEGACION } from '@/modules/core/navigation/navigation';
import { RUTAS_MOVIDAS, RUTAS_NUEVAS, rutaDe } from '@/modules/core/navigation/rutas';
import { PESTANAS_COTIZACIONES, PESTANAS_LIQUIDACIONES } from '@/shared/ui/pestanas-secciones';

/** 20/11/2026 · Navegación de Finanzas, cambios 8, 9 y 10: nombres sin ambigüedad, menú por trabajo y enlaces vigentes. */
const leer = (ruta: string) => readFileSync(ruta, 'utf8');
const grupo = (id: string) => NAVEGACION.find((g) => g.id === id)!;

describe('8 · nombres sin ambigüedad', () => {
  it('Tablero financiero, Datos para liquidar, Tarifas a clientes y Tarifas del chofer', () => {
    expect(grupo('finanzas').entradas.find((e) => e.href === '/analisis/resultados')?.etiqueta).toBe('Tablero financiero');
    expect(rutaDe('/analisis/resultados')?.titulo).toBe('Tablero financiero');
    expect(rutaDe('/liquidaciones/resumen')?.titulo).toBe('Datos para liquidar');
    expect(rutaDe('/cotizaciones/tarifas')?.titulo).toBe('Tarifas a clientes');
    expect(rutaDe('/ajustes/liquidacion')?.titulo).toBe('Tarifas del chofer');
    expect(PESTANAS_LIQUIDACIONES.map((p) => p.etiqueta)).toEqual(
      expect.arrayContaining(['Datos para liquidar', 'Tarifas del chofer']),
    );
    expect(PESTANAS_COTIZACIONES.map((p) => p.etiqueta)).toContain('Tarifas a clientes');
  });

  it('los títulos de las cuatro pantallas dicen lo mismo que el menú', () => {
    expect(leer('src/modules/finanzas/components/tablero.tsx')).toContain('<Encabezado titulo="Tablero financiero"');
    expect(leer('src/modules/chofer/components/resumen-liquidacion.tsx')).toContain('<Encabezado titulo="Datos para liquidar"');
    expect(leer('src/modules/liquidacion/components/tarifas-pantalla.tsx')).toContain('<Encabezado titulo="Tarifas del chofer"');
    expect(leer('src/modules/ventas/components/tarifas-pantalla.tsx')).toContain('<Encabezado titulo="Tarifas a clientes"');
    expect(leer('src/app/(app)/finanzas/page.tsx')).toContain("title: 'Tablero financiero'");
    expect(leer('src/app/(app)/liquidaciones/resumen/page.tsx')).toContain("title: 'Datos para liquidar'");
    expect(leer('src/app/(app)/rrhh/tarifas/page.tsx')).toContain("title: 'Tarifas del chofer'");
    expect(leer('src/app/(app)/cotizaciones/tarifas/page.tsx')).toContain("title: 'Tarifas a clientes'");
  });

  it('no quedan los nombres viejos en el menú, las pestañas ni las rutas', () => {
    const textos = [
      ...NAVEGACION.flatMap((g) => g.entradas.map((e) => e.etiqueta)),
      ...PESTANAS_LIQUIDACIONES.map((p) => p.etiqueta),
      ...PESTANAS_COTIZACIONES.map((p) => p.etiqueta),
      ...RUTAS_NUEVAS.map((r) => r.titulo),
    ];
    for (const viejo of ['Resumen', 'Resumen financiero', 'Resumen para liquidar', 'Tarifas y costos', 'Tarifas y conceptos']) {
      expect(textos, viejo).not.toContain(viejo);
    }
  });
});

describe('9 · Finanzas ordenado por trabajo; Plan de cuentas en Configuración', () => {
  it('primero lo de todos los días, después el análisis', () => {
    expect(grupo('finanzas').entradas.map((e) => e.etiqueta)).toEqual([
      'Facturación',
      'Cobros y pagos',
      'Gastos',
      'Bancos',
      'Tablero financiero',
      'Rentabilidad',
      'Informes',
    ]);
  });

  it('el Plan de cuentas está en Configuración, junto a Monedas, con la misma dirección', () => {
    const conf = grupo('configuracion').entradas.map((e) => e.href);
    expect(conf.indexOf('/ajustes/plan-cuentas')).toBe(conf.indexOf('/ajustes/monedas/tipos-cambio') + 1);
    expect(grupo('finanzas').entradas.some((e) => e.href === '/ajustes/plan-cuentas')).toBe(false);
    expect(leer('src/modules/finanzas/components/plan-cuentas-pantalla.tsx')).toContain('subtitulo="Configuración"');
  });
});

describe('10 · avisos y enlaces con el nombre y la dirección vigentes', () => {
  // Direcciones viejas que hoy solo redirigen (rutas.ts)
  const viejas = [...RUTAS_NUEVAS.map((r) => r.vieja), ...RUTAS_MOVIDAS.map((r) => r.desde).filter((d) => !d.includes(':'))];
  const enlaceViejo = new RegExp(
    `(?:href=|assign\\(|push\\()\\{?["'\`](?:${viejas.map((v) => v.replace(/[/.*+?^${}()|[\]\\-]/g, '\\$&')).join('|')})(?=["'\`?#])`,
  );
  const FIN = 'src/modules/finanzas/components';
  const archivos = [
    ...readdirSync(FIN).filter((n) => n.endsWith('.tsx')).map((n) => join(FIN, n)),
    'src/modules/ventas/components/cuenta-corriente.tsx',
    'src/modules/liquidacion/components/sueldo-legal.tsx',
  ];

  it('Finanzas no enlaza a direcciones que redirigen', () => {
    for (const a of archivos) expect(enlaceViejo.test(leer(a)), a).toBe(false);
  });

  it('el aviso del tablero lleva a Por cobrar, y la lista usa el nombre de hoy', () => {
    expect(leer(`${FIN}/tablero.tsx`)).toContain('href="/analisis/cobros-pagos?ver=cobrar"');
    const cobros = leer(`${FIN}/cobros-pagos-pantalla.tsx`);
    expect(cobros).toContain('titulo="Facturas cobradas sin decir el banco"');
    expect(cobros).not.toContain('Cobradas desde Ventas');
    expect(leer('src/modules/chofer/components/pedidos-fondo.tsx')).not.toContain('Bancos y cajas');
  });
});
