import { describe, expect, it } from 'vitest';
import { esEstadoLogistica, esPasoOperacion, ESTADO_INFO, PASO_OPERACION_ETIQUETA, PASOS_CON_PANEL } from '@/modules/logistica/domain/operacion.types';
import { botonesPaso, type SigueFila } from '@/modules/pizarra/domain/pizarra.sigue';
import { parsearDetalleCliente, VERSION_DETALLE } from '@/modules/ventas/domain/detalle';
import { parsearSiiFactura } from '@/modules/ventas/domain/sii';
import { parsearFactura } from '@/modules/ventas/domain/ventas.types';

describe('Migración 125 · detalle de la factura, comprobante del cobro y cambio de tractor', () => {
  it('lee la lista de datos y lo guardado para el cliente', () => {
    const d = parsearDetalleCliente({
      campos: [
        { codigo: 'operacion', etiqueta: 'N° de operación' },
        { codigo: 'guia', etiqueta: 'N° de guía' },
      ],
      elegidos: ['operacion', 'guia'],
      guardado: true,
      ejemplo: 'Op. 1 · Guía ZZ',
    });
    expect(d.campos[1]?.etiqueta).toBe('N° de guía');
    expect(d.elegidos).toEqual(['operacion', 'guia']);
    expect(parsearDetalleCliente(null)).toEqual({ campos: [], elegidos: [], guardado: false, ejemplo: null });
    expect(VERSION_DETALLE).toBe(125);
  });

  it('la factura trae el comprobante del cobro y la exenta su total en pesos', () => {
    const f = parsearFactura({ id: 1, estado: 'cobrada', comprobante_ruta: 'cobros/1/a.pdf', comprobante_nombre: 'a.pdf', renglones: [] });
    expect(f.comprobanteRuta).toBe('cobros/1/a.pdf');
    expect(parsearFactura({ id: 2 }).comprobanteRuta).toBeNull();
    const s = parsearSiiFactura({ tipo: 34, tc_clp: '950.55', total_clp: 1425825 });
    expect(s.tcClp).toBe(950.55);
    expect(s.totalClp).toBe(1425825);
  });

  it('el cambio de tractor tiene sus pasos y su estado, con panel propio', () => {
    expect(esPasoOperacion('en_base')).toBe(true);
    expect(esPasoOperacion('seguir')).toBe(true);
    expect(PASO_OPERACION_ETIQUETA.seguir).toBe('Seguir con otro tractor');
    expect(PASOS_CON_PANEL).toContain('en_base');
    expect(esEstadoLogistica('en_base')).toBe(true);
    expect(ESTADO_INFO.en_base.etiqueta).toContain('En base');
  });

  it('en la Pizarra no se hace con un clic (va a Operaciones)', () => {
    const fila = { servicioId: 1, siguiente: 'seguir', posibles: ['seguir'] } as unknown as SigueFila;
    expect(botonesPaso(fila)).toEqual({ principal: null, otros: [] });
    const cargado = { servicioId: 1, siguiente: 'entrego', posibles: ['en_base', 'entrego', 'demora'] } as unknown as SigueFila;
    expect(botonesPaso(cargado)).toEqual({ principal: 'entrego', otros: ['demora'] });
  });
});
