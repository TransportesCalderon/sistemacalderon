import { describe, expect, it } from 'vitest';
import { ORDEN_COLUMNAS, PANTALLAS } from '@/modules/core/permissions/matriz';
import { alcanceDe, can, permisosDe } from '@/modules/core/permissions/resolver';
import { itemActual, masVisible, puedeVerRuta, rutaInicial } from '@/modules/core/navigation/filtrar';
import { MAS } from '@/modules/core/navigation/navigation';
import { RUTAS, RUTAS_MOVIDAS, RUTAS_NUEVAS, pantallaDeRuta } from '@/modules/core/navigation/rutas';
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

describe('navegación (Sprint 8: barra de arriba y «Más», sin menú lateral)', () => {
  /** Las entradas del menú lateral antes del Sprint 8 (sin las altas, que siguen en sus listas y en Hoy). */
  const MENU_VIEJO = [
    '/hoy', '/mi-viaje', '/anomalias/alertas', '/ventas', '/cotizaciones', '/operacion/operaciones', '/operacion/viajes-chofer',
    '/operacion/por-cerrar', '/pizarra', '/pizarra/mapa', '/telemetria/ranking', '/combustible/cargas', '/combustible/base',
    '/combustible/costo-medio', '/flota/camiones', '/flota/choferes', '/flota/asignaciones', '/liquidaciones/fondos', '/liquidaciones',
    '/ventas/facturacion', '/finanzas', '/finanzas/gastos', '/finanzas/cobros-pagos', '/conciliacion', '/finanzas/informes',
    '/finanzas/plan-cuentas', '/cotizaciones/datos-clientes', '/comercial/ubicaciones', '/operacion/lineas', '/comercial/proveedores',
    '/operacion/transportistas', '/configuracion/usuarios', '/finanzas/tipos-cambio', '/configuracion/parametros', '/telemetria/datos',
    '/telemetria/equipos',
  ];
  const BARRA = ['/hoy', '/pizarra', '/pizarra/mapa', '/mi-viaje'];
  const adonde = (ruta: string) =>
    RUTAS_NUEVAS.find((n) => n.vieja === ruta)?.nueva ?? RUTAS_MOVIDAS.find((m) => m.desde === ruta)?.hasta.split('?')[0] ?? ruta;

  it('nada se pierde: lo que cada rol veía en el menú lateral está en la barra o en «Más»', () => {
    for (const rol of ORDEN_COLUMNAS) {
      const p = permisosDe([rol], agregado);
      const alcance = [...BARRA.filter((r) => puedeVerRuta(p, r)), ...masVisible(p).flatMap((g) => g.items.flatMap((i) => i.rutas))];
      for (const viejo of MENU_VIEJO.filter((r) => puedeVerRuta(p, r))) expect(alcance, `${rol}: ${viejo}`).toContain(adonde(viejo));
    }
  });

  it('cada dirección de Análisis y Ajustes está en «Más» y tiene la pantalla de la página de antes', () => {
    const todas = MAS.flatMap((g) => g.items.flatMap((i) => i.rutas));
    for (const n of RUTAS_NUEVAS) {
      expect(todas, n.nueva).toContain(n.nueva);
      expect(pantallaDeRuta(n.nueva), n.nueva).toBe(pantallaDeRuta(n.vieja));
    }
    for (const r of todas) expect(pantallaDeRuta(r), r).not.toBeNull();
    expect(new Set(todas).size).toBe(todas.length);
  });

  it('cada ítem de «Más» lleva a la primera pestaña que la persona puede ver', () => {
    const ope = masVisible(permisosDe(['operaciones'], agregado)).flatMap((g) => g.items);
    // Operaciones no ve Cotizaciones pero sí los datos de los clientes
    expect(ope.find((i) => i.etiqueta === 'Cotizaciones')?.href).toBe('/cotizaciones/datos-clientes');
    // Operaciones ve los fondos pero no las liquidaciones
    expect(ope.find((i) => i.etiqueta === 'Liquidaciones')?.href).toBe('/liquidaciones/fondos');
    expect(itemActual('/analisis/cierres/viajes', [{ id: 'analisis', etiqueta: '', items: ope }])).toBe('/analisis/viajes');
  });

  it('todas las rutas apuntan a pantallas de la matriz, sin prefijos repetidos (Sprint 0 · T01)', () => {
    for (const r of RUTAS) expect(PANTALLAS[r.pantalla], r.prefijo).toBeDefined();
    expect(new Set(RUTAS.map((r) => r.prefijo)).size).toBe(RUTAS.length);
  });

  it('resuelve la pantalla por prefijo, incluidas sub-rutas', () => {
    expect(pantallaDeRuta('/combustible/cargas/123/documentos')).toBe('combustible.cargas');
    expect(pantallaDeRuta('/analisis/cargas/por-validar')).toBe('combustible.bandejas');
    expect(pantallaDeRuta('/otra-cosa')).toBeNull();
  });

  it('el inicio de todos es «Hoy» (Sprint 3); el del chofer, Mi viaje, y no tiene «Más»', () => {
    for (const rol of ['gerencia', 'operaciones', 'base_mendoza', 'adm_combustible', 'finanzas', 'comercial', 'ti'] as const) {
      expect(rutaInicial(permisosDe([rol], agregado)), rol).toBe('/hoy');
    }
    expect(rutaInicial(permisosDe(['chofer'], agregado))).toBe('/mi-viaje');
    expect(masVisible(permisosDe(['chofer'], agregado))).toEqual([]);
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
