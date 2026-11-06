import { describe, expect, it } from 'vitest';
import { leerLinkMaps, linkDesde, siguientePunto, variantesDireccion, type PuntoRuta } from '@/modules/logistica/domain/rutas';


describe('rutas · link con una dirección escrita y chofer fuera de la ruta (06/11/2026)', () => {
  it('una dirección sin coordenadas («!1m0») no corre las coordenadas de los demás puntos', () => {
    const link =
      'https://www.google.com/maps/dir/Cmo.+a+Melipilla+11246,+9280030+Maip%C3%BA,+Regi%C3%B3n+Metropolitana,+Chile/-33.51,-70.70/-33.53,-70.69/Shell+-+Av.+Lo+Espejo+03150,+Santiago/@-33.5,-70.7,13z/' +
      'data=!3m1!4b1!4m16!4m15!1m0!1m0!1m0!1m5!1m1!1s0x3:0x4!2m2!1d-70.6912!2d-33.5401!3e0';
    const p = leerLinkMaps(link);
    expect(p).toHaveLength(4);
    expect(p[0]).toMatchObject({ lat: null, lng: null }); // se ubica después por la dirección
    expect(p[3]).toMatchObject({ lat: -33.5401, lng: -70.6912 });
  });

  it('«Tu ubicación» (segmento vacío) también cuenta para alinear los puntos', () => {
    const link = 'https://www.google.com/maps/dir//-33.51,-70.70/Shell/@-33.5,-70.7,13z/data=!4m10!4m9!1m0!1m0!1m5!1m1!1s0x3:0x4!2m2!1d-70.6912!2d-33.5401!3e0';
    const p = leerLinkMaps(link);
    expect(p).toHaveLength(2);
    expect(p[1]).toMatchObject({ lat: -33.5401, lng: -70.6912 });
  });

  it('variantes para buscar la dirección (sin código postal, sin el comercio, sin la región)', () => {
    const v = variantesDireccion('Shell - Av. Lo Espejo 03150, Santiago, San Bernardo, Región Metropolitana, Chile');
    expect(v).toContain('Av. Lo Espejo 03150, Santiago, San Bernardo, Región Metropolitana, Chile');
    expect(variantesDireccion('Cmo. a Melipilla 11246, 9280030 Maipú, Región Metropolitana, Chile')).toContain('Cmo. a Melipilla 11246, Maipú, Región Metropolitana, Chile');
  });

  it('el chofer todavía en la base (lejos de la ruta) recibe TODAS las paradas, no desde la segunda', () => {
    const P = (nombre: string, lat: number, lng: number): PuntoRuta => ({ nombre, lat, lng });
    const ruta = [P('Parada 1', -33.51, -70.66), P('Parada 2', -33.56, -70.67), P('Shell', -33.54, -70.665)];
    const base = { lat: -33.52, lng: -70.76 }; // Cmo. a Melipilla, ~9 km al oeste
    const i = siguientePunto(ruta, base);
    expect(i).toBe(0);
    expect(linkDesde(ruta, i)!.paradas).toBe(2);
  });
});
