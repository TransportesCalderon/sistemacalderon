import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { can, permisosDe } from '@/modules/core/permissions/resolver';

const agregado = { gerenciaDetalleAlertas: 'agregado' as const };
const leer = (p: string) => readFileSync(p, 'utf8');

// Migración 170: quién aprueba un cierre de viaje lo decide la base (autorizados por TI y nunca quien lo preparó).
describe('aprobación cruzada del cierre de viaje', () => {
  it('Operaciones llega a la acción de aprobar (ve los cierres); la base decide', () => {
    expect(can(permisosDe(['operaciones'], agregado), 'combustible.cierre_viaje:ver')).toBe(true);
    for (const [archivo, accion] of [
      ['src/modules/combustible/actions/cierre.actions.ts', 'aprobarCierre'],
      ['src/modules/logistica/actions/viajes-chofer.actions.ts', 'cerrarYAprobarViaje'],
      ['src/modules/logistica/actions/por-cerrar.actions.ts', 'aprobarVariosCierres'],
    ] as const) {
      const bloque = leer(archivo).split(`export const ${accion} = createAction({`)[1] ?? '';
      expect(bloque.slice(0, 300), accion).toContain("permiso: 'combustible.cierre_viaje:ver'");
    }
  });

  it('anular un cierre sigue pidiendo el permiso de acciones', () => {
    const bloque = leer('src/modules/combustible/actions/cierre.actions.ts').split('export const anularCierre = createAction({')[1] ?? '';
    expect(bloque.slice(0, 200)).toContain("permiso: 'combustible.cierre_viaje:transicionar'");
  });

  it('los botones de aprobar usan lo que dice la base', () => {
    for (const archivo of [
      'src/modules/combustible/components/cierres/cierre-ficha.tsx',
      'src/modules/logistica/components/viaje-chofer-ficha.tsx',
      'src/modules/logistica/components/por-cerrar.tsx',
    ]) {
      expect(leer(archivo), archivo).toContain('usePuedeAprobarCierres()');
    }
  });
});
