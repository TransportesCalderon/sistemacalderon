import { describe, expect, it } from 'vitest';
import { subirGastoSchema } from '@/modules/chofer/domain/chofer.schemas';
import { nombrePeriodo, parsearMisCargas, parsearResumen, parsearSeguimiento } from '@/modules/chofer/domain/chofer.types';
import { pantallaDeRuta } from '@/modules/core/navigation/rutas';

describe('módulo del chofer (migraciones 60 y 61)', () => {
  it('lee Mi carga tal como la arma la base', () => {
    const m = parsearMisCargas({
      chofer: 'PRUEBA ANA',
      compartir_ubicacion: true,
      intervalo_s: 5,
      cargas: [{ servicio_id: 7, numero: 120, producto: 'Banana', retiro: { nombre: 'San Antonio', latitud: -33.5, longitud: -71.6 }, documentos: [{ id: 1, tipo: 'mic', archivo: '3/x.jpg', por_chofer: true }] }],
    });
    expect(m.intervaloS).toBe(20);
    expect(m.cargas[0]?.retiro?.latitud).toBe(-33.5);
    expect(m.cargas[0]?.carga).toBeNull();
    expect(m.cargas[0]?.documentos[0]?.porChofer).toBe(true);
  });

  it('seguimiento: la más nueva y el recorrido', () => {
    const s = parsearSeguimiento({ ultima: { fuente: 'celular', ts: '2026-10-21T10:00:00Z', latitud: -33, longitud: -70 }, telemetria: null, recorrido_celular: [[-33, -70, 'x']] });
    expect(s.ultima?.fuente).toBe('celular');
    expect(s.recorrido).toHaveLength(1);
  });

  it('el importe acepta coma decimal y punto de miles', () => {
    const base = { categoria: 'PEAJE', moneda: 'ARS', fecha: '2026-10-21' };
    expect(subirGastoSchema.parse({ ...base, importe: '1.234,50' }).importe).toBe(1234.5);
    expect(subirGastoSchema.parse({ ...base, importe: '12.5' }).importe).toBe(12.5);
    expect(subirGastoSchema.safeParse({ ...base, importe: '0' }).success).toBe(false);
  });

  it('resumen para liquidar y nombre del período', () => {
    const r = parsearResumen({ periodo: '2026-10-01', desde: '2026-09-26', hasta: '2026-10-25', choferes: [{ chofer_id: 1, a_descontar: -50, fondo: [{ moneda: 'USD', saldo: -50 }] }] });
    expect(r.choferes[0]?.aDescontar).toBe(-50);
    expect(nombrePeriodo('2026-10-01')).toContain('octubre');
  });

  it('las rutas nuevas quedan protegidas', () => {
    expect(pantallaDeRuta('/chofer')).toBe('chofer.mi_carga');
    expect(pantallaDeRuta('/chofer/gastos')).toBe('chofer.mis_gastos');
    expect(pantallaDeRuta('/rrhh/fondos')).toBe('rrhh.fondos');
    expect(pantallaDeRuta('/rrhh/liquidacion')).toBe('liquidacion.liquidaciones');
    expect(pantallaDeRuta('/rrhh/liquidaciones/4/recibo')).toBe('liquidacion.liquidaciones');
    expect(pantallaDeRuta('/rrhh/tarifas')).toBe('liquidacion.reglas');
    expect(pantallaDeRuta('/chofer/liquidaciones/4/recibo')).toBe('chofer.mis_liquidaciones');
  });
});
