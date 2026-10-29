import { describe, expect, it } from 'vitest';
import { can, permisosDe } from '@/modules/core/permissions/resolver';
import { NOMBRE_DTE, parsearEstadoSii, parsearResultadoSii, parsearSiiFactura, VERSION_SII } from '@/modules/ventas/domain/sii';

describe('Facturación electrónica con Facturacion.cl (migración 124)', () => {
  it('lee lo que devuelve la base para la ficha de la factura', () => {
    const s = parsearSiiFactura({
      ambiente: 'prueba',
      tipo: 34,
      tipo_nombre: 'Factura exenta electrónica (34)',
      faltantes: ['Cliente: falta el giro'],
      puede_emitir: false,
      puede_anular: false,
      cliente: { id: 7, razon_social: 'ZZ CLIENTE', identificador_fiscal: '11.111.111-1', pais: 'CL', giro: null, direccion: 'ZZ 1', comuna: null, ciudad: null, correo: null },
      documentos: [
        { id: 3, tipo: 34, ambiente: 'prueba', estado: 'aceptado', folio: '101', fecha: '2026-10-28', url_original: 'https://zz.invalid/pdf', url_cedible: null, error: null },
        { id: 2, tipo: 34, ambiente: 'prueba', estado: 'rechazado', folio: null, fecha: '2026-10-28', error: 'ERROR: El RUT del receptor no es válido' },
      ],
    });
    expect(s.tipo).toBe(34);
    expect(s.faltantes).toEqual(['Cliente: falta el giro']);
    expect(s.cliente.giro).toBe('');
    expect(s.documentos[0]?.folio).toBe(101);
    expect(s.documentos[0]?.urlOriginal).toBe('https://zz.invalid/pdf');
    expect(s.documentos[1]?.error).toBe('ERROR: El RUT del receptor no es válido');
  });

  it('el resultado del envío trae el error de Facturacion.cl tal cual', () => {
    const r = parsearResultadoSii({ ok: false, id: 9, estado: 'rechazado', ambiente: 'produccion', tipo: 110, folio: null, error: 'ERROR: X' });
    expect(r.ok).toBe(false);
    expect(r.ambiente).toBe('produccion');
    expect(r.error).toBe('ERROR: X');
  });

  it('una respuesta vacía no rompe la pantalla', () => {
    expect(parsearSiiFactura(null).documentos).toEqual([]);
    expect(parsearEstadoSii(null)).toEqual({ ambiente: 'prueba', credenciales: false, conectado: false });
    expect(NOMBRE_DTE[110]).toBe('Factura de exportación');
    expect(VERSION_SII).toBe(124);
  });

  it('emiten Finanzas y TI; Comercial no', () => {
    const puede = (rol: Parameters<typeof permisosDe>[0][number]) =>
      can(permisosDe([rol], { gerenciaDetalleAlertas: 'agregado' }), 'ventas.facturacion:transicionar');
    expect(puede('finanzas')).toBe(true);
    expect(puede('ti')).toBe(true);
    expect(puede('chofer')).toBe(false);
  });
});
