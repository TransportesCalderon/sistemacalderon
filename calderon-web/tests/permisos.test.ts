import { describe, expect, it } from 'vitest';
import { ORDEN_COLUMNAS, PANTALLAS } from '@/modules/core/permissions/matriz';
import { alcanceDe, can, permisosDe } from '@/modules/core/permissions/resolver';
import { menuVisible, rutaInicial } from '@/modules/core/navigation/filtrar';
import { NAVEGACION, pantallaDeRuta } from '@/modules/core/navigation/navigation';
import { decodificarClaims, identidadDesdeClaims } from '@/modules/core/auth/claims';

const agregado = { gerenciaDetalleAlertas: 'agregado' as const };
const detalle = { gerenciaDetalleAlertas: 'detalle' as const };

describe('matriz de permisos (especificación §16)', () => {
  it('tiene una columna por rol en cada fila', () => {
    for (const [id, p] of Object.entries(PANTALLAS)) expect(p.fila.length, id).toBe(ORDEN_COLUMNAS.length);
  });

  it('solo el auditor ve accesos sensibles', () => {
    for (const rol of ORDEN_COLUMNAS) {
      expect(can(permisosDe([rol], agregado), 'auditoria.accesos:ver'), rol).toBe(rol === 'auditor');
    }
  });

  it('administración de combustible valida cargas; operaciones no', () => {
    expect(can(permisosDe(['adm_combustible'], agregado), 'combustible.cargas:transicionar')).toBe(true);
    expect(can(permisosDe(['operaciones'], agregado), 'combustible.cargas:transicionar')).toBe(false);
  });

  it('movimientos del camión: Base Mendoza registra; aprueba Adm. de combustible', () => {
    expect(can(permisosDe(['base_mendoza'], agregado), 'combustible.movimientos:editar')).toBe(true);
    expect(can(permisosDe(['base_mendoza'], agregado), 'combustible.movimientos:transicionar')).toBe(false);
    expect(can(permisosDe(['adm_combustible'], agregado), 'combustible.movimientos:transicionar')).toBe(true);
    expect(can(permisosDe(['chofer'], agregado), 'combustible.movimientos:ver')).toBe(false);
  });

  it('el alta de un tanque de base es solo de TI (la base exige tc_admin)', () => {
    for (const rol of ORDEN_COLUMNAS) {
      expect(can(permisosDe([rol], agregado), 'combustible.depositos:transicionar'), rol).toBe(rol === 'ti');
    }
  });

  it('el chofer tiene alcance propio en sus cargas', () => {
    expect(alcanceDe(permisosDe(['chofer'], agregado), 'combustible.cargas:editar')).toBe('propio');
  });

  it('con varios roles gana el alcance total', () => {
    expect(alcanceDe(permisosDe(['chofer', 'base_mendoza'], agregado), 'combustible.cargas:editar')).toBe('todo');
  });

  it('gerencia ve alertas solo si el parámetro está en detalle', () => {
    expect(can(permisosDe(['gerencia'], agregado), 'anomalias.alertas:ver')).toBe(false);
    expect(can(permisosDe(['gerencia'], detalle), 'anomalias.alertas:ver')).toBe(true);
  });

  it('finanzas registra pagos de liquidaciones pero no las edita', () => {
    const p = permisosDe(['finanzas'], agregado);
    expect(can(p, 'liquidacion.liquidaciones:transicionar')).toBe(true);
    expect(can(p, 'liquidacion.liquidaciones:editar')).toBe(false);
  });
});

describe('navegación (especificación §3)', () => {
  it('tiene 11 grupos y 61 entradas', () => {
    expect(NAVEGACION.length).toBe(11);
    expect(NAVEGACION.flatMap((g) => g.entradas).length).toBe(61);
  });

  it('todas las entradas apuntan a pantallas de la matriz', () => {
    for (const e of NAVEGACION.flatMap((g) => g.entradas)) expect(PANTALLAS[e.pantalla], e.href).toBeDefined();
  });

  it('resuelve la pantalla por prefijo, incluidas sub-rutas', () => {
    expect(pantallaDeRuta('/combustible/cargas/123/documentos')).toBe('combustible.cargas');
    expect(pantallaDeRuta('/otra-cosa')).toBeNull();
  });

  it('el auditor ve los 11 grupos; TI no ve accesos sensibles', () => {
    const ti = menuVisible(permisosDe(['ti'], agregado)).flatMap((g) => g.entradas.map((e) => e.href));
    expect(ti).not.toContain('/auditoria/accesos');
    expect(menuVisible(permisosDe(['auditor'], agregado)).length).toBe(11);
  });

  it('la ruta inicial de gerencia es el dashboard y la del chofer, sus cargas', () => {
    expect(rutaInicial(permisosDe(['gerencia'], agregado))).toBe('/inicio');
    expect(rutaInicial(permisosDe(['chofer'], agregado))).toBe('/combustible/cargas');
  });
});

describe('claims del token', () => {
  const token = (payload: object) =>
    ['e30', Buffer.from(JSON.stringify(payload)).toString('base64url'), 'firma'].join('.');

  it('extrae la identidad de negocio', () => {
    const id = identidadDesdeClaims(
      decodificarClaims(token({ sub: 'x', usuario_id: 7, roles_app: ['ti', 'inventado'], rol_bd: 'tc_admin' })),
    );
    expect(id).toEqual({ usuarioId: 7, rolesApp: ['ti'], rolBd: 'tc_admin', choferId: null });
  });

  it('sin usuario_id no hay identidad (usuario no vinculado)', () => {
    expect(identidadDesdeClaims(decodificarClaims(token({ sub: 'x' })))).toBeNull();
  });

  it('ignora un rol de base no permitido', () => {
    expect(identidadDesdeClaims(decodificarClaims(token({ sub: 'x', usuario_id: 1, rol_bd: 'tc_owner' })))?.rolBd).toBeNull();
  });
});
