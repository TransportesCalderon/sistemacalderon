import { describe, expect, it } from 'vitest';
import { laminas } from '@/modules/ia/asistente/imprimir';

describe('Iris · imprimir una respuesta como presentación', () => {
  it('cada título abre una lámina y lo anterior al primer título va en la primera', () => {
    const l = laminas('Resumen ZZ.\n\n## La cuenta\n\nCosto 100.\n\n- uno\n- dos\n\n## La propuesta\n\nPedir 130.');
    expect(l.length).toBe(3);
    expect(l[0]?.[0]?.tipo).toBe('parrafo');
    expect(l[1]?.[0]?.tipo).toBe('titulo');
    expect(l[1]?.length).toBe(3);
    expect(l[2]?.length).toBe(2);
  });

  it('sin títulos es una sola hoja y un texto vacío no da láminas', () => {
    expect(laminas('Hola ZZ.\n\nChau.').length).toBe(1);
    expect(laminas('').length).toBe(0);
  });
});
