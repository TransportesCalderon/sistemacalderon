import { describe, expect, it } from 'vitest';
import { coordenadasDeTexto } from '@/modules/catalogos/domain/ubicacion-link';
import { estacionSchema } from '@/modules/catalogos/domain/catalogos.schemas';

describe('Ubicación de las estaciones (migración 143)', () => {
  it('lee coordenadas sueltas', () => {
    expect(coordenadasDeTexto('-32.8895, -68.8458')).toEqual({ lat: -32.8895, lng: -68.8458 });
    expect(coordenadasDeTexto(' -32.5 -69.3 ')).toEqual({ lat: -32.5, lng: -69.3 });
  });
  it('lee el punto exacto de un lugar de Google Maps (antes que la vista)', () => {
    const link = 'https://www.google.com/maps/place/YPF/@-32.59,-69.35,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x1!8m2!3d-32.5912!4d-69.3456!16s';
    expect(coordenadasDeTexto(link)).toEqual({ lat: -32.5912, lng: -69.3456 });
  });
  it('lee ?q=, /search/ y la vista @', () => {
    expect(coordenadasDeTexto('https://maps.google.com/?q=-33.45,-70.66')).toEqual({ lat: -33.45, lng: -70.66 });
    expect(coordenadasDeTexto('https://www.google.com/maps/search/-33.45,+-70.66?entry=tts')).toEqual({ lat: -33.45, lng: -70.66 });
    expect(coordenadasDeTexto('https://www.google.com/maps/@-33.4,-70.6,15z')).toEqual({ lat: -33.4, lng: -70.6 });
  });
  it('no inventa puntos', () => {
    expect(coordenadasDeTexto('YPF Uspallata')).toBeNull();
    expect(coordenadasDeTexto('-132.5, -69.3')).toBeNull();
    expect(coordenadasDeTexto('')).toBeNull();
  });
  it('el formulario manda el punto o nada', () => {
    const base = { id: null, versionFila: null, codigo: 'zz', nombre: 'ZZ', proveedorId: '1', pais: 'AR', esTanquePropio: false };
    expect(estacionSchema.parse({ ...base, latitud: '-32.5', longitud: '-69.3' })).toMatchObject({ latitud: -32.5, longitud: -69.3 });
    expect(estacionSchema.parse({ ...base, latitud: '', longitud: '' })).toMatchObject({ latitud: null, longitud: null });
    expect(estacionSchema.parse(base).latitud).toBeUndefined();
  });
});
