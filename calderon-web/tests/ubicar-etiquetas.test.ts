import { describe, expect, it } from 'vitest';
import { RADIO_PUNTO, ubicarEtiquetas, type CajaEtiqueta } from '@/modules/telemetria/domain/ubicar-etiquetas';

type R = { x: number; y: number; w: number; h: number };
const pisa = (a: R, b: R) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function rects(items: CajaEtiqueta[]) {
  const u = ubicarEtiquetas(items);
  return u.map((e, i) => {
    const it = items[i]!;
    const cx = it.x + e.dx;
    const cy = it.y + e.dy;
    return { e, punto: { x: cx - RADIO_PUNTO, y: cy - RADIO_PUNTO, w: RADIO_PUNTO * 2, h: RADIO_PUNTO * 2 }, nombre: { x: cx + e.lx, y: cy + e.ly, w: it.w, h: it.h } };
  });
}

describe('Mapa desagrupado: cada camión en su lugar sin pisarse', () => {
  it('un camión solo queda en su lugar con el nombre a la derecha', () => {
    const [r] = rects([{ id: 'a', x: 100, y: 100, w: 120, h: 17 }]);
    expect(r!.e).toMatchObject({ dx: 0, dy: 0, lx: 12, guia: false });
  });

  it('seis camiones en el mismo lugar: se abren en ronda y ningún nombre ni punto se pisa', () => {
    const items = Array.from({ length: 6 }, (_, i) => ({ id: String(i), x: 300, y: 300, w: 150, h: 17 }));
    const r = rects(items);
    for (let a = 0; a < r.length; a++) {
      for (let b = a + 1; b < r.length; b++) {
        expect(pisa(r[a]!.nombre, r[b]!.nombre), `nombres ${a}-${b}`).toBe(false);
        expect(pisa(r[a]!.punto, r[b]!.punto), `puntos ${a}-${b}`).toBe(false);
        expect(pisa(r[a]!.nombre, r[b]!.punto), `nombre ${a} sobre punto ${b}`).toBe(false);
      }
    }
    expect(r.every((x) => Math.hypot(x.e.dx, x.e.dy) > 0)).toBe(true);
  });

  it('camiones cerca pero no juntos: no se mueven, solo se acomodan los nombres', () => {
    const items = [
      { id: 'a', x: 100, y: 100, w: 160, h: 17 },
      { id: 'b', x: 140, y: 104, w: 160, h: 17 },
      { id: 'c', x: 120, y: 120, w: 160, h: 17 },
    ];
    const r = rects(items);
    expect(r.every((x) => x.e.dx === 0 && x.e.dy === 0)).toBe(true);
    for (let a = 0; a < r.length; a++) for (let b = a + 1; b < r.length; b++) expect(pisa(r[a]!.nombre, r[b]!.nombre)).toBe(false);
  });
});
