import { describe, expect, it } from 'vitest';
import { laminas } from '@/modules/ia/asistente/imprimir';
import { esOrdenDeCallar, pedidoParaIris } from '@/modules/ia/asistente/voz';

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

describe('Iris · modo reunión: responde solo si la nombran', () => {
  it('toma la pregunta que viene después (o antes) del nombre', () => {
    expect(pedidoParaIris('Iris, ¿cuánto facturamos este mes?')).toBe('¿cuánto facturamos este mes?');
    expect(pedidoParaIris('Oye Siri dime qué camión consume más')).toBe('dime qué camión consume más');
    expect(pedidoParaIris('cuánto deja el viaje a Coronel, Iris')).toBe('cuánto deja el viaje a Coronel');
  });

  it('si solo la nombran espera la pregunta, y si no la nombran no responde', () => {
    expect(pedidoParaIris('Oye Iris')).toBe('');
    expect(pedidoParaIris('Iris.')).toBe('');
    expect(pedidoParaIris('mañana salen dos camiones a Buenos Aires')).toBeNull();
    expect(pedidoParaIris('la crisis del gasoil')).toBeNull();
  });

  it('reconoce cuando le piden que se calle', () => {
    expect(esOrdenDeCallar('silencio')).toBe(true);
    expect(esOrdenDeCallar('Gracias, ya está')).toBe(true);
    expect(esOrdenDeCallar('paradas de los camiones de hoy')).toBe(false);
  });
});
