import { describe, expect, it } from 'vitest';
import { laminas } from '@/modules/ia/asistente/imprimir';
import { esOrdenDeCallar, pareceIncompleta, pedidoParaIris, quitarCierre } from '@/modules/ia/asistente/voz';

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

describe('Iris · modo reunión: respeta los silencios de quien está pensando', () => {
  it('distingue una frase por la mitad de una pregunta terminada', () => {
    expect(pareceIncompleta('cuántos viajes necesitamos a Mar del Plata para')).toBe(true);
    expect(pareceIncompleta('cuánto deja el viaje de Terramar y')).toBe(true);
    expect(pareceIncompleta('quiero saber, o sea')).toBe(true);
    expect(pareceIncompleta('cuánto')).toBe(true);
    expect(pareceIncompleta('cuántos viajes de tres mil necesitamos a Mar del Plata')).toBe(false);
    expect(pareceIncompleta('¿cuánto facturamos este mes?')).toBe(false);
  });

  it('«listo» o «eso es todo» al final cierran la pregunta', () => {
    expect(quitarCierre('cuánto facturamos este mes, eso es todo')).toEqual({ texto: 'cuánto facturamos este mes', cerro: true });
    expect(quitarCierre('cuánto deja Coronel a 4900 listo')).toEqual({ texto: 'cuánto deja Coronel a 4900', cerro: true });
    expect(quitarCierre('qué camión está listo para salir mañana')).toEqual({ texto: 'qué camión está listo para salir mañana', cerro: false });
  });

  it('«Iris, esperá» es para que se calle', () => {
    expect(esOrdenDeCallar('esperá')).toBe(true);
    expect(esOrdenDeCallar('espera un momento')).toBe(true);
  });
});
