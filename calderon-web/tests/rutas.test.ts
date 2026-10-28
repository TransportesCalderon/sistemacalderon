import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { esRutaSinPantalla, pantallaDeRuta } from '@/modules/core/navigation/rutas';
import FOTO from './rutas.snapshot.json';

/**
 * Sprint 0 · T02 (docs/DECISIONES.md, regla 3): toda página de app/(app) está protegida.
 * Si una ruta cambia de pantalla a propósito, se actualiza rutas.snapshot.json en el mismo commit.
 */
const RAIZ = join(__dirname, '../src/app/(app)');

/** Excepciones conocidas, con el motivo. Ninguna excepción silenciosa. */
const EXCEPCIONES: Record<string, string> = {};

function paginas(dir = RAIZ): { url: string; codigo: string }[] {
  const lista: { url: string; codigo: string }[] = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) lista.push(...paginas(ruta));
    else if (nombre === 'page.tsx') {
      const segmentos = ruta.slice(RAIZ.length + 1).split(/[\\/]/).slice(0, -1).filter((s) => !s.startsWith('('));
      if (segmentos.some((s) => s.startsWith('[...'))) continue; // [...ruta]: solo responde rutas inexistentes
      const url = `/${segmentos.map((s) => (s.startsWith('[') ? '_' : s)).join('/')}`;
      lista.push({ url, codigo: readFileSync(ruta, 'utf8') });
    }
  }
  return lista;
}

const PAGINAS = paginas();

describe('rutas protegidas (Sprint 0 · T02)', () => {
  it('encuentra las páginas', () => {
    expect(PAGINAS.length).toBeGreaterThan(80);
  });

  for (const p of PAGINAS) {
    it(p.url, () => {
      const pantalla = pantallaDeRuta(p.url);
      // 1 · Tiene pantalla o es de las que solo piden sesión
      expect(pantalla !== null || esRutaSinPantalla(p.url), 'sin pantalla en la tabla de rutas').toBe(true);
      // 2 · La página repite la guardia, y con la misma pantalla
      expect(/\brequire(Permiso|Session)\(/.test(p.codigo), 'no llama a requirePermiso ni a requireSession').toBe(true);
      const pedidos = [...p.codigo.matchAll(/requirePermiso\(\s*[`'"]([a-z_]+\.[a-z_]+)/g)].map((m) => m[1]);
      if (pantalla && pedidos.length > 0 && !EXCEPCIONES[p.url]) {
        expect(pedidos, 'la página pide otra pantalla que el middleware').toContain(pantalla);
      }
      // 3 · Igual a la foto
      expect(pantalla, 'cambió la pantalla de la ruta (actualizar rutas.snapshot.json si es a propósito)').toBe(
        (FOTO as Record<string, string | null>)[p.url],
      );
    });
  }

  it('la foto no tiene rutas que ya no existen', () => {
    const urls = new Set(PAGINAS.map((p) => p.url));
    for (const url of Object.keys(FOTO)) expect(urls.has(url), url).toBe(true);
  });

  it('las excepciones siguen siendo necesarias', () => {
    for (const url of Object.keys(EXCEPCIONES)) expect(PAGINAS.some((p) => p.url === url), url).toBe(true);
  });
});
