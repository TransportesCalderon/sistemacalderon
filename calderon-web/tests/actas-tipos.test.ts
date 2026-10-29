import { describe, expect, it } from 'vitest';
import { parsearActas, ETIQUETA_TIPO_ACTA, TIPOS_ACTA, VERSION_ACTAS, carpetaActa } from '@/modules/actas/domain/acta.types';
import { opcionesTipoCarga, parsearTiposCarga, VERSION_TIPOS_CARGA } from '@/modules/catalogos/domain/tipos-carga';
import { SEVERIDADES, VERSION_FILTROS_ALERTAS } from '@/modules/anomalias/domain/alerta.types';
import { pantallaDeRuta } from '@/modules/core/navigation/rutas';
import { can, permisosDe } from '@/modules/core/permissions/resolver';

const opciones = { gerenciaDetalleAlertas: 'agregado' as const };

describe('Migración 120 · filtros de alertas', () => {
  it('filtra por las tres gravedades de la base', () => {
    expect(SEVERIDADES).toEqual(['alta', 'media', 'baja']);
    expect(VERSION_FILTROS_ALERTAS).toBe(120);
  });
});

describe('Migración 121 · tipos de carga', () => {
  const t = parsearTiposCarga({
    puede_editar: true,
    tipos: [
      { id: 1, nombre: 'A GRANEL', activo: true, orden: 10, usos: 3 },
      { id: 9, nombre: 'CONTENEDOR 40 RF', requiere_frio: true, es_contenedor: true, activo: true, orden: 90, usos: 0 },
      { id: 4, nombre: 'PALLET', activo: false, orden: 40, usos: 1 },
    ],
  });
  it('lee la lista de la base', () => {
    expect(t.puedeEditar).toBe(true);
    expect(t.tipos[1]?.requiereFrio).toBe(true);
    expect(VERSION_TIPOS_CARGA).toBe(121);
  });
  it('el formulario ofrece los activos y conserva el valor viejo del registro', () => {
    expect(opcionesTipoCarga(t.tipos, '').map((o) => o.valor)).toEqual(['A GRANEL', 'CONTENEDOR 40 RF']);
    expect(opcionesTipoCarga(t.tipos, '20 REEFER').at(-1)).toEqual({ valor: '20 REEFER', etiqueta: '20 REEFER (anterior)' });
    expect(opcionesTipoCarga(t.tipos, 'A GRANEL')).toHaveLength(2);
  });
  it('la página de tipos de carga es de Catálogos', () => {
    expect(pantallaDeRuta('/ajustes/parametros/tipos-carga')).toBe('configuracion.catalogos');
  });
});

describe('Migración 122 · actas de infracción', () => {
  it('los tres tipos pedidos', () => {
    expect(TIPOS_ACTA.map((t) => ETIQUETA_TIPO_ACTA[t])).toEqual(['Consumo excesivo', 'Daños en la unidad', 'Velocidad excesiva']);
    expect(VERSION_ACTAS).toBe(122);
    expect(carpetaActa(7)).toBe('actas/7');
  });
  it('lee lo que devuelve la base', () => {
    const r = parsearActas({
      puede_crear: true,
      puede_monto: false,
      por_tipo: { consumo_excesivo: 0, danos_unidad: 1, exceso_velocidad: 2 },
      actas: [{ id: 1, numero: 'AI-000001', tipo: 'danos_unidad', estado: 'firmada', se_nego_firmar: true, chofer_id: 3, chofer: 'ZZ Prueba', monto: '300000', moneda: 'CLP', descontar: true, importe_descuento: 100000, periodo_descuento: '2026-10-01', fotos: [{ id: 5, ruta: 'actas/1/a.jpg', nombre: null }] }],
    });
    expect(r.puedeMonto).toBe(false);
    expect(r.porTipo?.exceso_velocidad).toBe(2);
    expect(r.actas[0]?.monto).toBe(300000);
    expect(r.actas[0]?.seNegoFirmar).toBe(true);
    expect(r.actas[0]?.fotos[0]?.ruta).toBe('actas/1/a.jpg');
  });
  it('las ven Gerencia, Operaciones, Control, RRHH y Finanzas; no Comercial ni el chofer', () => {
    const ve = (rol: Parameters<typeof permisosDe>[0][number]) => can(permisosDe([rol], opciones), 'operacion.actas:ver');
    for (const rol of ['gerencia', 'operaciones', 'analista_control', 'rrhh', 'finanzas', 'ti', 'auditor'] as const) expect(ve(rol), rol).toBe(true);
    expect(ve('comercial')).toBe(false);
    expect(ve('chofer')).toBe(false);
    expect(can(permisosDe(['operaciones'], opciones), 'operacion.actas:transicionar')).toBe(true);
    expect(can(permisosDe(['analista_control'], opciones), 'operacion.actas:transicionar')).toBe(false);
    expect(pantallaDeRuta('/actas/5/imprimir')).toBe('operacion.actas');
  });
});
