import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Regla de todo el sistema (docs/DECISIONES.md, 25/11/2026): lo que se abre al tocar un renglón
 * va justo debajo de ese renglón (`shared/ui/fila-desplegable.tsx`), no al final de la página.
 */
function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? archivos(p) : p.endsWith('.tsx') ? [p] : [];
  });
}

const RENGLON_QUE_ABRE = /<tr\b[^>]*onClick=\{\(\) => set\w+\(\w+ === [\w.]+ \? null/;

describe('renglones que se abren debajo', () => {
  const todos = archivos(join(process.cwd(), 'src'));

  it('toda tabla que abre un renglón lo abre debajo de él', () => {
    const mal = todos.filter((p) => {
      const t = readFileSync(p, 'utf8');
      return RENGLON_QUE_ABRE.test(t) && !t.includes('colSpan') && !t.includes('FilaDesplegable');
    });
    expect(mal).toEqual([]);
  });

  it('liquidaciones, facturas y fondos usan la fila desplegable', () => {
    for (const p of [
      'src/modules/liquidacion/components/liquidaciones-pantalla.tsx',
      'src/modules/ventas/components/facturacion-pantalla.tsx',
      'src/modules/chofer/components/fondos-pantalla.tsx',
    ]) {
      const t = readFileSync(join(process.cwd(), p), 'utf8');
      expect(t, p).toContain('<FilaDesplegable');
    }
  });
});
