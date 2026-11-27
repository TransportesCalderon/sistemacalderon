import { describe, expect, it } from 'vitest';
import { lineaDeRuta, parsearRutasAsignadas, rutaPrincipal } from '@/modules/telemetria/domain/ruta-asignada';

/** Migración 385 · Mapa de flota: la ruta asignada al chofer del tractor elegido, en azul. */
const crudo = {
  chofer_id: 34,
  rutas: [
    {
      id: 99602, orden: 1, en_curso: true, numero: 9001, notas: 'ZZ por Cristo Redentor', km: 260.5,
      puntos: [{ nombre: 'ZZ Uspallata', lat: -32.59, lng: -69.35 }, { nombre: 'ZZ Los Andes', lat: -32.83, lng: -70.6 }, { nombre: '', lat: -33.45, lng: -70.66 }],
      camino: [[-32.59, -69.35], [-32.8, -69.8], [-33.45, -70.66]],
    },
    {
      id: 99603, orden: 2, en_curso: false, numero: null, notas: null, km: null, camino: null,
      puntos: [{ nombre: 'ZZ Santiago', lat: -33.45, lng: -70.66 }, { nombre: 'ZZ sin ubicar', lat: null, lng: null }, { nombre: 'ZZ San Antonio', lat: -33.59, lng: -71.61 }],
    },
  ],
};

describe('migración 385: la ruta asignada en el mapa', () => {
  const rutas = parsearRutasAsignadas(crudo);

  it('lee las rutas por hacer en orden, con sus puntos y el camino', () => {
    expect(rutas.map((r) => [r.id, r.orden, r.enCurso])).toEqual([[99602, 1, true], [99603, 2, false]]);
    expect(rutas[0]!.numeroOperacion).toBe(9001);
    // Un punto sin nombre se llama por su número
    expect(rutas[0]!.puntos[2]!.nombre).toBe('Punto 3');
    expect(rutas[0]!.camino).toHaveLength(3);
    expect(rutas[1]!.camino).toBeNull();
  });

  it('pinta el camino por las rutas si está; si no, los puntos ubicados en recta', () => {
    expect(lineaDeRuta(rutas[0]!)).toEqual({ linea: [[-32.59, -69.35], [-32.8, -69.8], [-33.45, -70.66]], porCamino: true });
    expect(lineaDeRuta(rutas[1]!)).toEqual({ linea: [[-33.45, -70.66], [-33.59, -71.61]], porCamino: false });
  });

  it('la ruta fuerte es la que sigue ahora; si no hay, la primera; sin rutas, nada', () => {
    expect(rutaPrincipal(rutas)?.id).toBe(99602);
    expect(rutaPrincipal(rutas.map((r) => ({ ...r, enCurso: false })))?.id).toBe(99602);
    expect(rutaPrincipal([])).toBeNull();
    expect(parsearRutasAsignadas(null)).toEqual([]);
  });
});
