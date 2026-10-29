import { describe, expect, it } from 'vitest';
import { ORDEN_COLUMNAS, PANTALLAS } from '@/modules/core/permissions/matriz';
import { alcanceDe, can, permisosDe } from '@/modules/core/permissions/resolver';
import { menuVisible, pantallaDeEntrada, rutaInicial } from '@/modules/core/navigation/filtrar';
import { NAVEGACION, entradaActual } from '@/modules/core/navigation/navigation';
import { RUTAS, pantallaDeRuta } from '@/modules/core/navigation/rutas';
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

  it('TI puede hacer todo en las pantallas de negocio (para probar el sistema), salvo Auditoría', () => {
    const ti = permisosDe(['ti'], agregado);
    for (const p of ['combustible.cargas:editar', 'combustible.cargas:transicionar', 'combustible.movimientos:editar',
      'combustible.cierre_viaje:transicionar', 'flota.camiones:editar'] as const) {
      expect(can(ti, p), p).toBe(true);
    }
    expect(can(ti, 'auditoria.accesos:ver')).toBe(false);
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

  it('Base Mendoza: el alta del tanque es solo de TI; aprueban Adm. de combustible y TI', () => {
    for (const rol of ORDEN_COLUMNAS) {
      expect(can(permisosDe([rol], agregado), 'configuracion.catalogos:editar'), rol).toBe(rol === 'ti');
      expect(can(permisosDe([rol], agregado), 'combustible.depositos:transicionar'), rol).toBe(rol === 'ti' || rol === 'adm_combustible');
    }
    expect(can(permisosDe(['base_mendoza'], agregado), 'combustible.depositos:editar')).toBe(true);
  });

  it('el chofer solo tiene sus dos pantallas, con alcance propio (migración 60)', () => {
    const p = permisosDe(['chofer'], agregado);
    expect(alcanceDe(p, 'chofer.mi_carga:editar')).toBe('propio');
    expect(alcanceDe(p, 'chofer.mis_gastos:editar')).toBe('propio');
    expect(alcanceDe(p, 'combustible.cargas:ver')).toBeNull();
    expect(can(p, 'rrhh.fondos:ver')).toBe(false);
  });

  it('los fondos de choferes los manejan RRHH, Finanzas y TI', () => {
    for (const rol of ORDEN_COLUMNAS) {
      expect(can(permisosDe([rol], agregado), 'rrhh.fondos:transicionar'), rol).toBe(['rrhh', 'finanzas', 'ti'].includes(rol));
    }
  });

  it('con varios roles suma los permisos de todos', () => {
    expect(alcanceDe(permisosDe(['chofer', 'base_mendoza'], agregado), 'combustible.cargas:editar')).toBe('todo');
    expect(alcanceDe(permisosDe(['chofer', 'base_mendoza'], agregado), 'chofer.mi_carga:editar')).toBe('propio');
  });

  it('gerencia ve alertas solo si el parámetro está en detalle', () => {
    expect(can(permisosDe(['gerencia'], agregado), 'anomalias.alertas:ver')).toBe(false);
    expect(can(permisosDe(['gerencia'], detalle), 'anomalias.alertas:ver')).toBe(true);
  });

  it('migración 49: Adm. de combustible revisa alertas y Control cambia los umbrales', () => {
    expect(can(permisosDe(['adm_combustible'], agregado), 'anomalias.alertas:transicionar')).toBe(true);
    expect(can(permisosDe(['adm_combustible'], agregado), 'anomalias.reglas:editar')).toBe(false);
    expect(can(permisosDe(['analista_control'], agregado), 'anomalias.reglas:editar')).toBe(true);
    expect(can(permisosDe(['operaciones'], agregado), 'anomalias.alertas:ver')).toBe(false);
  });

  it('finanzas registra pagos de liquidaciones pero no las edita', () => {
    const p = permisosDe(['finanzas'], agregado);
    expect(can(p, 'liquidacion.liquidaciones:transicionar')).toBe(true);
    expect(can(p, 'liquidacion.liquidaciones:editar')).toBe(false);
  });
});

describe('navegación (especificación §3)', () => {
  it('menú corto: «Cargar nuevo», lo del chofer aparte y las pantallas hermanas como pestañas', () => {
    expect(NAVEGACION.map((g) => g.id)).toEqual(['inicio', 'chofer', 'cargar', 'pendientes', 'ventas', 'logistica', 'combustible', 'flota', 'rrhh', 'finanzas', 'datos', 'configuracion']);
    const entradas = NAVEGACION.flatMap((g) => g.entradas);
    // 46: la migración 103 agregó «Ranking de choferes»; 47: la 109, «Choferes de los tractores»
    // (Sprint 0: las rutas que no están en el menú viven solo en rutas.ts)
    // 46: el Sprint 3 sacó «Mis pendientes», que ahora está dentro de «Hoy»
    expect(entradas.length).toBe(46);
    expect(NAVEGACION.find((g) => g.id === 'cargar')?.entradas.every((e) => e.accion === 'editar')).toBe(true);
    // Toda ruta incluida como pestaña sigue protegida por su fila en rutas.ts
    for (const e of entradas) for (const r of e.incluye ?? []) expect(pantallaDeRuta(r), r).not.toBeNull();
  });

  it('marca una sola entrada: la de la coincidencia más larga, contando las pestañas', () => {
    const visibles = NAVEGACION.flatMap((g) => g.entradas);
    expect(entradaActual('/combustible/cargas/nueva', visibles)).toBe('/combustible/cargas/nueva');
    expect(entradaActual('/combustible/cargas/12', visibles)).toBe('/combustible/cargas');
    expect(entradaActual('/combustible/cierres/5', visibles)).toBe('/operacion/tractores');
    expect(entradaActual('/flota/gensets', visibles)).toBe('/flota/camiones');
    expect(entradaActual('/operacion/operaciones', visibles)).toBe('/operacion/operaciones');
  });

  it('todas las rutas apuntan a pantallas de la matriz', () => {
    for (const r of RUTAS) expect(PANTALLAS[r.pantalla], r.prefijo).toBeDefined();
  });

  it('toda entrada del menú tiene su fila en rutas.ts, y no hay prefijos repetidos (Sprint 0 · T01)', () => {
    for (const e of NAVEGACION.flatMap((g) => g.entradas)) expect(pantallaDeEntrada(e), e.href).not.toBeNull();
    expect(new Set(RUTAS.map((r) => r.prefijo)).size).toBe(RUTAS.length);
  });

  it('resuelve la pantalla por prefijo, incluidas sub-rutas', () => {
    expect(pantallaDeRuta('/combustible/cargas/123/documentos')).toBe('combustible.cargas');
    expect(pantallaDeRuta('/otra-cosa')).toBeNull();
  });

  it('el menú no muestra las rutas de pestañas; TI ve 11 grupos (no el del chofer)', () => {
    const ti = menuVisible(permisosDe(['ti'], agregado)).flatMap((g) => g.entradas.map((e) => e.href));
    expect(ti).not.toContain('/combustible/cierres');
    expect(ti).not.toContain('/combustible/viajes');
    expect(ti).toContain('/operacion/tractores');
    expect(menuVisible(permisosDe(['ti'], agregado)).length).toBe(11);
    expect(pantallaDeRuta('/combustible/cierres/5')).toBe('combustible.cierre_viaje');
  });

  it('la ruta inicial de todos es «Hoy» (Sprint 3) y la del chofer, Mi carga', () => {
    for (const rol of ['gerencia', 'operaciones', 'base_mendoza', 'adm_combustible', 'finanzas', 'comercial'] as const) {
      expect(rutaInicial(permisosDe([rol], agregado)), rol).toBe('/hoy');
    }
    expect(rutaInicial(permisosDe(['chofer'], agregado))).toBe('/chofer');
    expect(menuVisible(permisosDe(['chofer'], agregado)).map((g) => g.id)).toEqual(['chofer']);
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
