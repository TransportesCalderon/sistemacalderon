import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsearAvisosTanqueBajo } from '@/modules/logistica/domain/rutas';
import { faltanRevisar, parsearComite, primerDia } from '@/modules/combustible/domain/comite.types';

const leer = (r: string) => readFileSync(join(__dirname, '..', r), 'utf8');

describe('migración 177: tanque bajo y llegada en destino', () => {
  it('la ventana de tanque bajo lee lo que manda la base', () => {
    const [a] = parsearAvisosTanqueBajo([{ id: 3, tractor: 'AB123CD', chofer: null, desde: '2026-11-04T10:00:00Z', pct: 19, ultimo_pct: 17.5, litros: 105, latitud: -32.9, longitud: -68.8 }]);
    expect(a).toMatchObject({ id: 3, tractor: 'AB123CD', ultimoPct: 17.5, litros: 105, lat: -32.9 });
    expect(parsearAvisosTanqueBajo(null)).toEqual([]);
  });

  it('la ventana está montada en toda la app y el chofer manda la ubicación al marcar la llegada', () => {
    expect(leer('src/app/(app)/layout.tsx')).toContain('<AvisosTanqueBajo />');
    const chofer = leer('src/modules/chofer/components/ruta-chofer.tsx');
    expect(chofer).toContain('ubicacionCelular()');
    // La regla (estar en el destino) la decide la base: el celular no valida distancias
    expect(chofer).not.toMatch(/ruta_km_llegada|distancia/i);
  });
});

describe('migración 179: comité mensual de consumo', () => {
  const datos = {
    mes: '2026-10-01',
    estado: 'abierto',
    se_puede_cerrar: true,
    tractores: [
      { equipo_id: 1, nombre: 'AA001', viajes: 3, km: 2400, diferencia_l: 35.5, fuera_tolerancia: 1, revision: { revisado: true, comentario: 'ok', por: 'Ana' } },
      { equipo_id: 2, nombre: 'AA002', viajes: 1, km: 800, diferencia_l: null, sin_motor: 1, revision: null },
    ],
    gensets: [{ equipo_id: 9, nombre: 'G-09', cierres: 2, horas: 40, consumo_l: 120, consumo_lh: 3 }],
  };
  it('convierte los números y las revisiones', () => {
    const c = parsearComite(datos);
    expect(c.estado).toBe('abierto');
    expect(c.tractores[0]).toMatchObject({ nombre: 'AA001', diferenciaL: 35.5, fueraTolerancia: 1, revision: { comentario: 'ok' } });
    expect(c.tractores[1]?.revision).toBeNull();
    expect(c.gensets[0]).toMatchObject({ nombre: 'G-09', consumoLh: 3 });
  });
  it('dice qué equipos faltan revisar y arma el primer día del mes', () => {
    expect(faltanRevisar(parsearComite(datos))).toEqual(['AA002', 'G-09']);
    expect(primerDia('2026-10')).toBe('2026-10-01');
  });
});
