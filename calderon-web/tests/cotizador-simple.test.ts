import { describe, expect, it } from 'vitest';
import {
  baseCotizadorSchema,
  cotizarGuardarSchema,
  leerNumero,
  margenDe,
  nombreTramo,
  opcionesParaLaBase,
  parsearBaseCotizador,
  parsearCotizador,
  tramoEstandarSchema,
} from '@/modules/ventas/domain/cotizador';

describe('migración 308: cotizador como las presentaciones', () => {
  it('lee el viaje tramo por tramo (Entre Ríos → Coronel con los dos vacíos)', () => {
    const r = parsearCotizador({
      origen: 'ENTRE RIOS', destino: 'CORONEL', rutas: [{ id: 920, codigo: 'ER-NQ-CNL', km: 2140 }], linea_id: 920, ruta: 'ER-NQ-CNL',
      vacio_desde_id: 913, vacio_desde: 'BUENOS AIRES', vacio_hasta_id: 910, vacio_hasta: 'SAN ANTONIO',
      tramos: [
        { tipo: 'vacio_ida', desde_id: 913, desde: 'BUENOS AIRES', hasta_id: 911, hasta: 'ENTRE RIOS', km: 320, fuente_km: 'estandar', dias: 0.5,
          fuente_dias: 'estandar', litros: 93, gasoil_usd: 140.56, camion_chofer_usd: 88.75, canon_usd: 0, peajes_usd: 15, neumaticos_usd: 8.96,
          total_usd: 253.27, estandar: { id: 2, km: 320, dias: 0.5, consumo_l100: 29.06, peajes_usd: 15 } },
        { tipo: 'cargado', desde_id: 911, desde: 'ENTRE RIOS', hasta_id: 912, hasta: 'CORONEL', linea_id: 920, ruta: 'ER-NQ-CNL', km: 2464,
          fuente_km: 'estandar', dias: 6, fuente_dias: 'estandar', litros: 953.1, gasoil_usd: 1440.5, camion_chofer_usd: 1065, canon_usd: 171.67,
          peajes_usd: 170, neumaticos_usd: 68.99, total_usd: 2916.16, estandar: null },
        { tipo: 'vacio_vuelta', desde_id: 912, desde: 'CORONEL', hasta_id: 910, hasta: 'SAN ANTONIO', km: 720, fuente_km: 'estandar', dias: 1.5,
          total_usd: 679.82, falta: null, aviso: null },
      ],
      km_total: 3504, km_cargado: 2464, km_vacio: 1040, dias: 8, costo_usd: 3849.25,
      valores: { fijo_dia_usd: 119.5, chofer_dia_usd: 58, gasoil_clp_litro: 1488, gasoil_fuente: 'cargas', margen_objetivo_pct: 20, margen_minimo_pct: 12 },
      margen_pct: 20, precio_usd: 4820, precio_km_cargado_usd: 1.956, falta: null, avisos: ['Los km de A a B son estimados en línea recta'],
    });
    expect(r.tramos.map((t) => t.tipo)).toEqual(['vacio_ida', 'cargado', 'vacio_vuelta']);
    expect(r.tramos[1]?.canonUsd).toBe(171.67);
    expect(r.tramos[0]?.estandar?.consumoL100).toBe(29.06);
    expect(r.tramos[2]?.canonUsd).toBe(0);
    expect(r.costoUsd).toBe(3849.25);
    expect(r.valores.gasoilFuente).toBe('cargas');
    expect(r.avisos).toHaveLength(1);
    expect(nombreTramo(r.tramos[0]!)).toBe('Vacío BUENOS AIRES → ENTRE RIOS');
  });
  it('lee la base y los tramos estándar', () => {
    const b = parsearBaseCotizador({
      fijo_dia_usd: 119.5, chofer_dia_usd: 58, gasoil_fuente: 'fijo', gasoil_clp_litro: 1488, bases: [{ id: 910, nombre: 'SAN ANTONIO', pais: 'CL' }],
      tramos: [{ id: 1, desde_id: 911, desde: 'ENTRE RIOS', hasta_id: 912, hasta: 'CORONEL', linea_id: 920, ruta: 'ER-NQ-CNL', km: 2464, dias: 6, consumo_l100: 38.68, peajes_usd: 170 }],
    });
    expect(b.fijoDiaUsd + b.choferDiaUsd).toBe(177.5);
    expect(b.gasoilFuente).toBe('fijo');
    expect(b.bases[0]?.nombre).toBe('SAN ANTONIO');
    expect(b.tramos[0]?.consumoL100).toBe(38.68);
  });
  it('el margen es sobre el precio, como en las presentaciones', () => {
    expect(margenDe(4450, 3849.25)).toBe(13.5);
    expect(margenDe(1000, 800)).toBe(20);
    expect(margenDe(null, 1000)).toBeNull();
    expect(margenDe(0, 1000)).toBeNull();
  });
  it('a la base van solo las opciones elegidas', () => {
    expect(opcionesParaLaBase({ lineaId: null, vacioDesde: null, vacioHasta: null, ajustes: {}, margen: null, empresaId: null })).toEqual({});
    expect(opcionesParaLaBase({ lineaId: 0, vacioDesde: 0, vacioHasta: 910, ajustes: { dias_cargado: 7 }, margen: 15, empresaId: 3 })).toEqual({
      linea_id: 0, vacio_desde: 0, vacio_hasta: 910, dias_cargado: 7, margen_pct: 15, empresa_id: 3,
    });
  });
  it('lee los números escritos a mano', () => {
    expect(leerNumero('2.464')).toBe(2464);
    expect(leerNumero('0,5')).toBe(0.5);
    expect(leerNumero('1.5')).toBe(1.5);
    expect(leerNumero('1.234,5')).toBe(1234.5);
    expect(leerNumero('')).toBeNull();
    expect(leerNumero('abc')).toBeNull();
  });
  it('para guardar pide la empresa o su nombre', () => {
    const base = { empresaId: null, empresaNombre: '', origenId: 1, destinoId: 2, lineaId: null, vacioDesde: null, vacioHasta: null, ajustes: {}, precioUsd: 1000, viajes: 1 };
    expect(cotizarGuardarSchema.safeParse(base).success).toBe(false);
    expect(cotizarGuardarSchema.safeParse({ ...base, empresaNombre: 'Nueva SA', ajustes: { km_cargado: 2464 } }).success).toBe(true);
    expect(baseCotizadorSchema.safeParse({ valores: { fijo_dia_usd: 120 }, bases: null }).success).toBe(true);
    expect(tramoEstandarSchema.safeParse({ desdeId: 1, hastaId: 2, lineaId: null, km: 320, dias: 0.5, quitar: false }).success).toBe(true);
  });
});
