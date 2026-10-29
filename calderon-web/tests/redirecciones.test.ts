import { describe, expect, it } from 'vitest';
// El mismo intérprete de rutas que usa Next para redirects()
import { pathToRegexp } from 'next/dist/compiled/path-to-regexp';
import nextConfig from '../next.config';
import { leerFicha } from '@/modules/core/fichas/ficha-url';
import { DETALLES_VIEJOS, FICHAS } from '@/modules/core/fichas/tipos';
import { RUTAS_MOVIDAS, pantallaDeRuta } from '@/modules/core/navigation/rutas';

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
      // La ruta nueva la protege la misma pantalla que la vieja
      expect(pantallaDeRuta(hasta)).toBe(pantallaDeRuta(desde));
      expect(pathToRegexp(regla!.source).test(`${desde}/algo`)).toBe(false);
    });
  }
});
