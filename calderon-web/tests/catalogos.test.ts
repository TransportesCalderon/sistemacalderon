import { describe, expect, it } from 'vitest';
import { estacionSchema, normalizarDecimal, proveedorSchema, tipoCambioSchema } from '@/modules/catalogos/domain/catalogos.schemas';
import { cotizacionDesdeTasa, tasaDesdeCotizacion, tipoValor } from '@/modules/catalogos/domain/catalogos.types';
import { traducirErrorDb } from '@/server/errors/traducir';

describe('catálogos (migración 28)', () => {
  it('números escritos por personas: coma decimal con puntos de miles, o punto decimal', () => {
    expect(normalizarDecimal('7.300,50')).toBe('7300.50');
    expect(normalizarDecimal('950')).toBe('950');
    expect(normalizarDecimal('5.42')).toBe('5.42');
    expect(normalizarDecimal(' 1 234,5 ')).toBe('1234.5');
  });

  it('cotización: la pantalla pide 1 USD = X; la base guarda la inversa con 8 decimales', () => {
    expect(tasaDesdeCotizacion(950)).toBe(0.00105263);
    expect(Math.round(cotizacionDesdeTasa(0.00105263))).toBe(950);
    const r = tipoCambioSchema.parse({ fecha: '2026-10-18', moneda: 'CLP', unidadesPorBase: '950,5', fuente: '' });
    expect(r).toEqual({ fecha: '2026-10-18', moneda: 'CLP', unidadesPorBase: 950.5, fuente: null });
    expect(tipoCambioSchema.safeParse({ fecha: '2026-10-18', moneda: 'CLP', unidadesPorBase: '0', fuente: '' }).success).toBe(false);
  });

  it('proveedor y estación: código en mayúsculas, vacíos a null; la regla del proveedor la aplica la base', () => {
    const p = proveedorSchema.parse({ id: null, versionFila: null, codigo: ' copec ', razonSocial: 'Copec S.A.', identificadorFiscal: '', pais: 'CL', tipo: 'combustible', monedaDefecto: '' });
    expect(p).toMatchObject({ codigo: 'COPEC', identificadorFiscal: null, monedaDefecto: null });
    const e = estacionSchema.parse({ id: null, versionFila: null, codigo: 'ypf-1', nombre: 'YPF Uspallata', proveedorId: '', pais: 'AR', esTanquePropio: false });
    expect(e.proveedorId).toBeNull();
  });

  it('tipo del valor de un parámetro', () => {
    expect(tipoValor(20)).toBe('number');
    expect(tipoValor('avisar')).toBe('string');
    expect(tipoValor(true)).toBe('boolean');
    expect(tipoValor(['ti'])).toBe('array');
  });

  it('errores: restricción con mensaje y campo; mensaje de la base sin cambios', () => {
    const dup = traducirErrorDb({ code: '23505', message: 'duplicate key value violates unique constraint "ux_tc_fecha_par_tipo"' });
    expect(dup.campos).toEqual({ fecha: dup.mensaje });
    const prov = traducirErrorDb({ code: '23514', message: 'new row for relation "estacion_servicio" violates check constraint "ck_estacion_proveedor"' });
    expect(prov.campos).toEqual({ proveedorId: prov.mensaje });
    const falta = traducirErrorDb({ code: '23503', message: 'Falta la cotización CLP del 18/10/2026 (Finanzas > Tipos de cambio): cargala y volvé a registrar la carga' });
    expect(falta.mensaje).toMatch(/^Falta la cotización CLP del 18\/10\/2026/);
  });
});
