import { describe, expect, it } from 'vitest';
import { esRutaPublica } from '@/modules/core/navigation/rutas';
import { ORDEN_COLUMNAS } from '@/modules/core/permissions/matriz';
import { can, permisosDe } from '@/modules/core/permissions/resolver';
import { parsearCreada, parsearMisOrdenes, parsearOrdenPublica, parsearOrdenes, parsearPreparado, urlQr } from '@/modules/combustible/domain/orden-carga.types';

const op = { gerenciaDetalleAlertas: 'agregado' } as const;

describe('migración 234 · órdenes de carga con QR', () => {
  it('las genera solo Gerencia (y TI); las ven Adm. de combustible, Telemetría y Finanzas', () => {
    for (const rol of ORDEN_COLUMNAS) expect(can(permisosDe([rol], op), 'combustible.ordenes:editar'), rol).toBe(rol === 'gerencia' || rol === 'ti');
    for (const rol of ['adm_combustible', 'analista_control', 'finanzas'] as const) expect(can(permisosDe([rol], op), 'combustible.ordenes:ver'), rol).toBe(true);
    expect(can(permisosDe(['chofer'], op), 'combustible.ordenes:ver')).toBe(false);
  });

  it('la página del playero es pública (sin usuario)', () => {
    expect(esRutaPublica('/qr/abc123')).toBe(true);
    expect(esRutaPublica('/qrx')).toBe(false);
    expect(urlQr('https://app.zz.com/', 'f'.repeat(48))).toBe(`https://app.zz.com/qr/${'f'.repeat(48)}`);
  });

  it('lee lo que devuelve la base', () => {
    const p = parsearPreparado({ patente: 'ZZ001TT', chofer: 'Prueba, Uno', chofer_id: 3, litros_para_llenar: 1350, combustible: { litros: 200, capacidad_l: 1550 }, mail: { activo: false } });
    expect(p).toMatchObject({ choferId: 3, litrosParaLlenar: 1350, litrosActuales: 200, capacidadL: 1550, mail: { activo: false } });
    expect(parsearCreada({ id: 1, numero: 'OC-000001', palabra: 'PUMA-RIO-07', mail: 'en_cola' })).toMatchObject({ palabra: 'PUMA-RIO-07', mail: 'en_cola' });
    const [o] = parsearOrdenes([{ id: 1, numero: 'OC-000001', modo: 'llenar', estado: 'cargada', diferencia_l: 100, alerta: 'Posible faltante', tickets: [{ ruta: 'a.jpg' }] }]);
    expect(o).toMatchObject({ modo: 'llenar', estado: 'cargada', diferenciaL: 100, tickets: [{ ruta: 'a.jpg' }] });
    expect(parsearMisOrdenes([{ id: 2, estado: 'autorizada', token: 'x' }])[0]).toMatchObject({ estado: 'autorizada', token: 'x' });
    expect(parsearOrdenPublica({ estado: 'no_existe' }).estado).toBe('no_existe');
  });
});
