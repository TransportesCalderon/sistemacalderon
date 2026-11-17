import { describe, expect, it } from 'vitest';
import { BASE_DEJA, baseDeja } from '@/modules/core/permissions/base-deja';

/** S4 · Mapa de permisos (16/11/2026): se ocultan los botones y lecturas que la base siempre rechaza. */
describe('S4 · lo que la base deja hacer', () => {
  it('el Auditor no escribe ni lee lo que su rol de base no ejecuta', () => {
    for (const a of ['ordenesCarga', 'cerrarYAprobar', 'marcarConforme', 'revelarDocumentoChofer', 'loMioDeHoy', 'cerrarComite'] as const)
      expect(baseDeja(BASE_DEJA[a], 'tc_auditor', ['auditor']), a).toBe(false);
  });

  it('Gerencia: lo que la base le deja sigue a la vista y lo que no, se oculta', () => {
    expect(baseDeja(BASE_DEJA.cerrarComite, 'tc_lectura', ['gerencia'])).toBe(true);
    expect(baseDeja(BASE_DEJA.ordenesCarga, 'tc_lectura', ['gerencia'])).toBe(true);
    expect(baseDeja(BASE_DEJA.loMioDeHoy, 'tc_lectura', ['gerencia'])).toBe(true);
    expect(baseDeja(BASE_DEJA.cerrarYAprobar, 'tc_lectura', ['gerencia'])).toBe(false);
    expect(baseDeja(BASE_DEJA.consumoChoferes, 'tc_lectura', ['gerencia'])).toBe(false);
    expect(baseDeja(BASE_DEJA.marcarConforme, 'tc_lectura', ['gerencia'])).toBe(false);
  });

  it('controla también el rol de aplicación que exige la función', () => {
    expect(baseDeja(BASE_DEJA.marcarConforme, 'tc_app', ['operaciones'])).toBe(true);
    expect(baseDeja(BASE_DEJA.marcarConforme, 'tc_app', ['comercial'])).toBe(false);
    expect(baseDeja(BASE_DEJA.resolverLiquidacion, 'tc_admin', ['finanzas'])).toBe(false);
    expect(baseDeja(BASE_DEJA.resolverLiquidacion, 'tc_admin', ['rrhh'])).toBe(true);
    expect(baseDeja(BASE_DEJA.decidirDiferencia, 'tc_app', ['base_mendoza'])).toBe(false);
    expect(baseDeja(BASE_DEJA.decidirDiferencia, 'tc_app', ['adm_combustible'])).toBe(true);
  });

  it('con varios roles alcanza con uno; sin rol de base conocido no oculta por ese lado', () => {
    expect(baseDeja(BASE_DEJA.revisarOrdenCarga, 'tc_app', ['adm_combustible', 'analista_control'])).toBe(true);
    expect(baseDeja(BASE_DEJA.ordenesCarga, null, ['auditor'])).toBe(true);
  });

  it('el chofer no pide el aviso del tablero pendiente (la base no se lo deja leer)', () => {
    expect(baseDeja(BASE_DEJA.tableroPendienteChofer, 'tc_chofer', ['chofer'])).toBe(false);
    expect(baseDeja(BASE_DEJA.tableroPendienteChofer, 'tc_app', ['adm_combustible'])).toBe(true);
  });
});
