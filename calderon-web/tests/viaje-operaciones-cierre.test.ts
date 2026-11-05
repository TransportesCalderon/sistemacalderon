import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { can, permisosDe } from '@/modules/core/permissions/resolver';

describe('operaciones del viaje del chofer: también las carga quien hace el cierre (05/11/2026)', () => {
  const acciones = readFileSync('src/modules/logistica/actions/viajes-chofer.actions.ts', 'utf8');
  it('agregar, ajustar, continuar, quitar y preparar el cierre aceptan el permiso del cierre de viaje', () => {
    for (const nombre of ['agregarItemViaje', 'ajustarItemViaje', 'continuarOperacionViaje', 'quitarItemViaje', 'prepararCierreCombustible']) {
      const i = acciones.indexOf(`export const ${nombre} = createAction({`);
      expect(acciones.slice(i, i + 300), nombre).toContain("'combustible.cierre_viaje:editar'");
    }
  });
  it('Administración de combustible tiene ese permiso (Operaciones sigue teniendo el suyo)', () => {
    expect(can(permisosDe(['adm_combustible']), 'combustible.cierre_viaje:editar')).toBe(true);
    expect(can(permisosDe(['operaciones']), 'operacion.tramos:editar')).toBe(true);
  });
});
