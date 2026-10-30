import { describe, expect, it } from 'vitest';
import { esLinkCorto, esLinkDeMaps, leerLinkMaps, linkCompleto, linkDesde, parsearRutaChofer, siguientePunto, type PuntoRuta } from '@/modules/logistica/domain/rutas';
import { parsearMisCargas } from '@/modules/chofer/domain/chofer.types';
import { pantallaDeRuta } from '@/modules/core/navigation/rutas';

const P = (nombre: string, lat: number, lng: number): PuntoRuta => ({ nombre, lat, lng });
// Puerto → Santiago → Los Andes → Mendoza (aprox.)
const ruta = [P('Puerto', -33.59, -71.61), P('Santiago', -33.45, -70.66), P('Los Andes', -32.83, -70.6), P('Mendoza', -32.89, -68.84)];

describe('rutas para los choferes (migración 135)', () => {
  it('lee un link de Google Maps con lugares y coordenadas', () => {
    const link =
      'https://www.google.com/maps/dir/Puerto+San+Antonio,+Chile/-33.45,-70.66/Mendoza,+Argentina/@-33.1,-70.1,8z/data=!3m1!4b1!4m15!4m14!1m5!1m1!1s0x1:0x2!2m2!1d-71.61!2d-33.59!1m0!1m5!1m1!1s0x3:0x4!2m2!1d-68.84!2d-32.89!3e0';
    const p = leerLinkMaps(link);
    expect(p.map((x) => x.nombre)).toEqual(['Puerto San Antonio, Chile', '', 'Mendoza, Argentina']);
    expect(p[0]).toMatchObject({ lat: -33.59, lng: -71.61 });
    expect(p[1]).toMatchObject({ lat: -33.45, lng: -70.66 });
    expect(p[2]).toMatchObject({ lat: -32.89, lng: -68.84 });
  });

  it('lee el formato api=1 y deja sin ubicar lo que no trae coordenadas', () => {
    const p = leerLinkMaps('https://www.google.com/maps/dir/?api=1&origin=-33.59,-71.61&destination=Mendoza&waypoints=-33.45,-70.66%7C-32.83,-70.6');
    expect(p).toHaveLength(4);
    expect(p[3]).toMatchObject({ nombre: 'Mendoza', lat: null });
    expect(leerLinkMaps('no es un link')).toEqual([]);
    expect(esLinkCorto('https://maps.app.goo.gl/abc123')).toBe(true);
    expect(esLinkDeMaps('https://maps.app.goo.gl/abc123')).toBe(true);
    expect(esLinkDeMaps('https://evil.example.com/maps/dir/a/b')).toBe(false);
    expect(esLinkDeMaps('http://maps.app.goo.gl/abc')).toBe(false);
  });

  it('retoma desde donde está el chofer: saltea las paradas que ya pasó', () => {
    expect(siguientePunto(ruta, null)).toBe(1);
    expect(siguientePunto(ruta, { lat: -33.5, lng: -71.1 })).toBe(1); // entre el puerto y Santiago
    expect(siguientePunto(ruta, { lat: -33.1, lng: -70.63 })).toBe(2); // pasó Santiago
    expect(siguientePunto(ruta, { lat: -32.86, lng: -69.7 })).toBe(3); // cruzando a Mendoza
    const l = linkDesde(ruta, 2)!;
    expect(l.url).toContain('destination=-32.89%2C-68.84');
    expect(l.url).toContain('waypoints=-32.83%2C-70.6');
    expect(l.url).not.toContain('origin=');
    expect(l.tramoFinal).toBe(true);
  });

  it('con más de 9 paradas el link llega hasta la 10.ª y se sigue por tramos', () => {
    const larga = Array.from({ length: 14 }, (_, i) => P(`P${i}`, -33 + i * 0.01, -70));
    const l = linkDesde(larga, 1)!;
    expect(l.paradas).toBe(9);
    expect(l.hasta.nombre).toBe('P10');
    expect(l.tramoFinal).toBe(false);
    expect(linkDesde(larga, 11)!.tramoFinal).toBe(true);
    expect(linkCompleto(ruta)).toContain('origin=-33.59%2C-71.61');
  });

  it('el chofer recibe la ruta con su carga; sin puntos no hay ruta', () => {
    const m = parsearMisCargas({
      chofer: 'ZZ',
      cargas: [{ servicio_id: 1, numero: 6222, ruta: { id: 3, nombre: 'Normal', notas: 'Altura 4,30', linea: 'SAI-MZA', puntos: [{ nombre: 'A', lat: 1, lng: 2 }, { nombre: 'B', lat: 3, lng: 4 }] } }],
    });
    expect(m.cargas[0]?.ruta?.nombre).toBe('Normal');
    expect(parsearRutaChofer({ puntos: [{ lat: 1, lng: 2 }] })).toBeNull();
    expect(parsearRutaChofer(null)).toBeNull();
    expect(pantallaDeRuta('/operacion/lineas')).toBe('operacion.servicios');
  });
});
