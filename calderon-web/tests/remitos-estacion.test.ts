import { describe, expect, it } from 'vitest';
import { parsearPendientesRemitos } from '@/modules/combustible/domain/remitos.types';
import { partesPdf } from '@/server/mail/partes-pdf';

/** Migración 277 · Remitos de las estaciones que llegan por mail. */
describe('remitos de estaciones', () => {
  it('lee los pendientes de la base', () => {
    const p = parsearPendientesRemitos({
      puede_resolver: true, activo: true, coinciden_30_dias: 4, leyendo: 1, esperando_chofer: 2,
      ultima_consulta: { cuando: '2026-11-18T19:00:00Z', ok: false, mensaje: 'Usuario o contraseña del mail incorrectos (IMAP)' },
      estaciones: [{ id: 24, nombre: 'Shell Rodriguez Peña' }],
      remitos: [
        { id: 5, numero: '0001-00025327', fecha_hora: '2026-11-18T18:56:36Z', patente: 'SDKZ64', es_tractor: true, litros: '11.9920', precio: '2609.0000',
          total: 31287.13, moneda: 'ARS', estacion_id: 24, situacion: 'difiere', carga_id: 130, diferencia: 'litros: registrado 11.90, remito 11.992', archivo: 'REM.pdf' },
        { id: 6, situacion: 'no_se_leyo', error: 'No se entendió la respuesta de Iris' },
      ],
    });
    expect(p.ultimaConsulta?.ok).toBe(false);
    expect(p.esperandoChofer).toBe(2);
    expect(p.remitos[0]).toMatchObject({ litros: 11.992, precio: 2609, situacion: 'difiere', cargaId: 130, estacionId: 24 });
    expect(p.remitos[1]).toMatchObject({ situacion: 'no_se_leyo', litros: null, archivo: 'remito.pdf', moneda: 'ARS' });
    expect(parsearPendientesRemitos(null).remitos).toEqual([]);
  });

  it('encuentra el PDF adjunto del mail', () => {
    const estructura = {
      type: 'multipart/mixed',
      childNodes: [
        { part: '1', type: 'text/plain' },
        { part: '2', type: 'application/pdf', disposition: 'attachment', dispositionParameters: { filename: 'REM 0001-00025327 - AUREA CARGO SPA.pdf' } },
        { part: '3', type: 'application/octet-stream', parameters: { name: 'otro.PDF' } },
        { part: '4', type: 'image/png', parameters: { name: 'logo.png' } },
      ],
    };
    expect(partesPdf(estructura as never)).toEqual([
      { parte: '2', nombre: 'REM 0001-00025327 - AUREA CARGO SPA.pdf' },
      { parte: '3', nombre: 'otro.PDF' },
    ]);
    expect(partesPdf({ type: 'application/pdf' } as never)).toEqual([{ parte: '1', nombre: 'remito.pdf' }]);
    expect(partesPdf(undefined)).toEqual([]);
  });
});
