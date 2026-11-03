import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { can, permisosDe } from '@/modules/core/permissions/resolver';

const agregado = { gerenciaDetalleAlertas: 'agregado' as const };
const pantalla = readFileSync('src/modules/logistica/components/operaciones-pantalla.tsx', 'utf8');

// Relevo desde Operaciones: el mismo cambio de chofer de Viajes (ops.fn_cambiar_chofer), con el permiso de los viajes.
describe('relevo desde la operación', () => {
  it('Operaciones puede hacer relevos (permiso de los viajes)', () => {
    expect(can(permisosDe(['operaciones'], agregado), 'operacion.tramos:editar')).toBe(true);
    expect(can(permisosDe(['gerencia'], agregado), 'operacion.tramos:editar')).toBe(false);
  });

  it('el botón «Relevo» aparece con la operación en curso y usa el cambio de chofer de siempre', () => {
    expect(pantalla).toContain("useCan('operacion.tramos:editar') && !!o.tramoId && !o.transportistaId && o.estado === 'en_curso'");
    expect(pantalla).toMatch(/function PanelRelevo[\s\S]*useCambiarChofer\(\)/);
    expect(pantalla).toContain("{tipo === 'relevo' && <PanelRelevo");
  });

  it('migración 173: también pasa el semi a otro tractor en ruta, sin dejarlo en la base', () => {
    expect(pantalla).toMatch(/function PanelRelevo[\s\S]*useCambiarTractorEnRuta\(\)/);
    expect(pantalla).toContain('Pasa el semi a otro tractor');
    expect(pantalla).toContain('label="Dónde se hace el cambio *"');
  });
});
