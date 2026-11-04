import { describe, expect, it } from 'vitest';
import { parsearPorFacturar } from '@/modules/ventas/domain/ventas.types';
import { parsearActa } from '@/modules/combustible/domain/acta.types';
import { ESTADO_INFO, ESTADOS_UNIDAD } from '@/modules/pizarra/domain/pizarra.types';
import { TIPOS_UBICACION } from '@/modules/catalogos/domain/catalogos.types';

describe('migración 176', () => {
  it('por facturar trae el conforme de descarga (y sabe si la base lo manda)', () => {
    const [a, b] = parsearPorFacturar([
      { servicio_id: 1, cliente_id: 2, conforme_descarga: true, conforme_en: '2026-11-03T12:00:00Z' },
      { servicio_id: 3, cliente_id: 2 },
    ]);
    expect(a?.conConforme).toBe(true);
    expect(a?.conformeEn).toBe('2026-11-03T12:00:00Z');
    expect(b?.conConforme).toBe(false);
    expect(b?.conformeEn).toBeNull();
  });

  it('el acta lee el odómetro de salida y de llegada', () => {
    const x = parsearActa({ km: 1200, odometro_salida: 500100.4, odometro_llegada: 501300 });
    expect(x.odometroSalida).toBe(500100.4);
    expect(x.odometroLlegada).toBe(501300);
    expect(parsearActa({}).odometroSalida).toBeNull();
  });

  it('la pizarra tiene «cargado en base» y «en aduana», distintos de disponible', () => {
    expect(ESTADOS_UNIDAD).toContain('en_base');
    expect(ESTADOS_UNIDAD).toContain('en_aduana');
    expect(ESTADO_INFO.en_base.etiqueta).not.toBe('Disponible');
    expect(ESTADO_INFO.en_aduana.etiqueta).toBe('En aduana');
  });

  it('los lugares pueden ser aduana', () => {
    expect(JSON.stringify(TIPOS_UBICACION)).toContain('aduana');
  });
});
