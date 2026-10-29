import { describe, expect, it } from 'vitest';
// El mismo intérprete de rutas que usa Next para redirects()
import { pathToRegexp } from 'next/dist/compiled/path-to-regexp';
import nextConfig from '../next.config';
import { leerFicha } from '@/modules/core/fichas/ficha-url';
import { DETALLES_VIEJOS, FICHAS } from '@/modules/core/fichas/tipos';
import { RUTAS_MOVIDAS, pantallaDeRuta } from '@/modules/core/navigation/rutas';
import { ORDEN_COLUMNAS } from '@/modules/core/permissions/matriz';
import { can, permisosDe } from '@/modules/core/permissions/resolver';

/**
 * Sprint 6: RRHH veía «Tractores y viajes» (solo lectura) pero no la Pizarra. Lo que miraba ahí
 * sigue en «Viajes de chofer» (los viajes) y en «Choferes de los tractores» (el chofer fijo).
 */
const SIN_LA_NUEVA = [{ desde: '/operacion/tractores', rol: 'rrhh' as const, sigueEn: ['/operacion/viajes-chofer', '/flota/asignaciones'] }];

/** Sprint 1 · S1-06: las rutas de detalle viejas abren su lista con la ficha en el panel. */
describe('redirecciones de detalle (Sprint 1 · S1-06)', async () => {
  const reglas = (await nextConfig.redirects?.()) ?? [];

  it('hay una regla por cada página de detalle vieja y por cada ruta movida, todas temporales', () => {
    expect(reglas).toHaveLength(DETALLES_VIEJOS.length + RUTAS_MOVIDAS.length);
    for (const r of reglas) expect(r.permanent, r.source).toBe(false);
  });

  for (const { ruta, tipo } of DETALLES_VIEJOS) {
    it(ruta, () => {
      const regla = reglas.find((r) => r.source.startsWith(`${ruta}/`));
      expect(regla).toBeDefined();
      const re = pathToRegexp(regla!.source);
      // Solo números: el alta y la edición no se tocan
      expect(re.test(`${ruta}/12`)).toBe(true);
      expect(re.test(`${ruta}/nuevo`)).toBe(false);
      expect(re.test(`${ruta}/12/editar`)).toBe(false);
      expect(re.test(`${ruta}/12/acta`)).toBe(false);
      // El destino es la lista del tipo, protegida por la misma pantalla, con la ficha
      const [lista, query] = regla!.destination.split('?');
      expect(lista).toBe(FICHAS[tipo].lista);
      expect(pantallaDeRuta(lista!)).toBe(FICHAS[tipo].pantalla);
      expect(leerFicha(new URLSearchParams(query).get('ficha')?.replace(':id', '12'))).toEqual({ tipo, id: 12 });
    });
  }

  for (const { desde, hasta } of RUTAS_MOVIDAS) {
    it(`${desde} → ${hasta}`, () => {
      const regla = reglas.find((r) => r.source === desde);
      expect(regla?.destination).toBe(hasta);
      expect(pathToRegexp(regla!.source).test(`${desde}/algo`)).toBe(false);
      // Quien veía la ruta vieja ve la nueva (salvo las excepciones anotadas abajo)
      const vieja = pantallaDeRuta(desde)!;
      const nueva = pantallaDeRuta(hasta.split('?')[0]!)!;
      expect(nueva).not.toBeNull();
      for (const rol of ORDEN_COLUMNAS) {
        const p = permisosDe([rol], { gerenciaDetalleAlertas: 'agregado' });
        if (!can(p, `${vieja}:ver`) || SIN_LA_NUEVA.some((x) => x.desde === desde && x.rol === rol)) continue;
        expect(can(p, `${nueva}:ver`), `${rol} veía ${desde}`).toBe(true);
      }
    });
  }

  it('las excepciones siguen siendo excepciones (si la matriz cambia, se borran)', () => {
    for (const x of SIN_LA_NUEVA) {
      const p = permisosDe([x.rol], { gerenciaDetalleAlertas: 'agregado' });
      const hasta = RUTAS_MOVIDAS.find((r) => r.desde === x.desde)!.hasta.split('?')[0]!;
      expect(can(p, `${pantallaDeRuta(x.desde)!}:ver`)).toBe(true);
      expect(can(p, `${pantallaDeRuta(hasta)!}:ver`)).toBe(false);
      for (const r of x.sigueEn) expect(can(p, `${pantallaDeRuta(r)!}:ver`), r).toBe(true);
    }
  });
});

/** Sprint 7: las rutas con número llevan el número a la ruta nueva; las de imprimir no se tocan. */
describe('rutas movidas con número (Sprint 7)', async () => {
  const reglas = (await nextConfig.redirects?.()) ?? [];
  const destino = (ruta: string) => {
    for (const r of reglas) {
      const m = pathToRegexp(r.source).exec(ruta);
      if (m) return r.destination.replace(':id', m[1] ?? '');
    }
    return null;
  };
  it('cotización, cartola y lo del chofer', () => {
    expect(destino('/ventas/cotizaciones/12')).toBe('/cotizaciones/12');
    expect(destino('/ventas/cotizaciones/nueva')).toBe('/cotizaciones/nueva');
    expect(destino('/ventas/cotizaciones/12/imprimir')).toBeNull();
    expect(destino('/finanzas/bancos/3')).toBe('/conciliacion/3');
    expect(destino('/chofer/gastos')).toBe('/mi-viaje?ver=gastos');
    expect(destino('/chofer/liquidaciones/4/recibo')).toBeNull();
    expect(destino('/rrhh/liquidaciones/4/recibo')).toBeNull();
    expect(destino('/comercial/clientes/nuevo')).toBeNull();
    expect(destino('/comercial/clientes/7/editar')).toBeNull();
  });
});
