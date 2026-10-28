import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { QueryClient } from '@tanstack/react-query';
import { OBJETOS, RAICES, TODO, invalidar } from '@/shared/query/invalidar';

/** Sprint 0 · T03 (docs/DECISIONES.md, regla 4): un solo mapa de recargas después de guardar. */
const SRC = join(__dirname, '../src');

function archivos(dir = SRC): string[] {
  return readdirSync(dir).flatMap((n) => {
    const r = join(dir, n);
    return statSync(r).isDirectory() ? archivos(r) : /\.tsx?$/.test(n) ? [r] : [];
  });
}
const CODIGO = archivos().map((r) => ({ ruta: r.slice(SRC.length + 1), texto: readFileSync(r, 'utf8') }));

/** QueryClient falso que anota lo que se recarga. */
function falso() {
  const llamadas: unknown[] = [];
  const qc = { invalidateQueries: (f?: { queryKey: unknown }) => (llamadas.push(f?.queryKey ?? 'todo'), Promise.resolve()) };
  return { qc: qc as unknown as QueryClient, llamadas };
}

describe('mapa de invalidaciones (Sprint 0 · T03)', () => {
  it('cada objeto recarga algo y empieza por una raíz conocida', () => {
    for (const [objeto, destino] of Object.entries(OBJETOS)) {
      if (destino === TODO) continue;
      expect(destino.length, objeto).toBeGreaterThan(0);
      for (const prefijo of destino) expect(RAICES, `${objeto}: ${prefijo.join('/')}`).toContain(prefijo[0]);
    }
  });

  it('cada raíz existe en las claves de consulta del código', () => {
    const todo = CODIGO.filter((a) => !a.ruta.endsWith('invalidar.ts')).map((a) => a.texto).join('\n');
    for (const raiz of RAICES) expect(todo.includes(`'${raiz}'`), raiz).toBe(true);
  });

  it('ninguna pantalla llama a invalidateQueries por su cuenta', () => {
    const fuera = CODIGO.filter((a) => a.texto.includes('invalidateQueries') && !a.ruta.endsWith(join('query', 'invalidar.ts')));
    expect(fuera.map((a) => a.ruta)).toEqual([]);
  });

  it('recarga los prefijos de los objetos pedidos', async () => {
    const { qc, llamadas } = falso();
    await invalidar(qc, 'alerta', 'chofer');
    expect(llamadas).toEqual([['anomalias'], ['pendientes'], ['flota', 'choferes', 'lista']]);
  });

  it('un cierre recarga todo', async () => {
    const { qc, llamadas } = falso();
    await invalidar(qc, 'cierre');
    expect(llamadas).toEqual(['todo']);
  });
});
