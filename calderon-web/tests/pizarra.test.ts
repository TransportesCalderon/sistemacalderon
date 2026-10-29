import { describe, expect, it } from 'vitest';
import {
  clasificarDescarga,
  coincide,
  cumpleApto,
  filtrar,
  FILTROS_VACIOS,
  hayFiltros,
  nivelFila,
  normalizar,
  opciones,
} from '@/modules/pizarra/domain/pizarra.filtros';
import type { FilaPizarra } from '@/modules/pizarra/domain/pizarra.types';
import { edicionPizarraSchema, semiSchema, tipoAccesorioSchema } from '@/modules/pizarra/domain/pizarra.schemas';

const ZONA = 'America/Argentina/Mendoza';
const AHORA = new Date('2026-10-19T15:00:00Z'); // 12:00 en Mendoza

const fila = (p: Partial<FilaPizarra>): FilaPizarra => ({
  semiId: 1,
  patente: 'PWTT41',
  codigoInterno: 'PWTT41',
  tipo: 'plataforma',
  estado: 'en_viaje',
  taraFecha: null,
  taraDias: null,
  accesorios: {},
  gensetCodigo: null,
  gensetDesde: null,
  tramoId: 1,
  gensetId: null,
  camionId: null,
  choferId: null,
  servicioId: null,
  tractor: 'GCSC93',
  chofer: 'Marcelo Reta',
  numeroServicio: 'SC-00000001',
  cliente: 'TUCAPEL',
  producto: 'Arroz',
  contenedor: 'MSKU4829130',
  taraMaxDias: null,
  salidaTs: null,
  salidaLugar: null,
  destino: null,
  descarga: null,
  proxima: null,
  ubicacion: null,
  ubicacionFuente: null,
  ubicacionTs: null,
  observacion: null,
  observacionPor: null,
  observacionEn: null,
  alertas: [],
  versionFila: 1,
  ...p,
});

describe('pizarra: búsqueda rápida', () => {
  it('ignora espacios, guiones y mayúsculas', () => {
    expect(normalizar('PWTT 41')).toBe('pwtt41');
    expect(coincide(fila({}), 'tt41')).toBe(true);
    expect(coincide(fila({}), 'pwtt-41')).toBe(true);
    expect(coincide(fila({}), 'msku 4829')).toBe(true);
    expect(coincide(fila({}), 'reta')).toBe(true);
    expect(coincide(fila({}), 'xx99')).toBe(false);
    expect(coincide(fila({}), '')).toBe(true);
  });
});

describe('pizarra: descarga respecto de hoy (zona de Mendoza)', () => {
  it('vencida, hoy, mañana, después y sin fecha', () => {
    expect(clasificarDescarga('2026-10-19T14:00:00Z', ZONA, AHORA)).toBe('vencida');
    expect(clasificarDescarga('2026-10-20T01:00:00Z', ZONA, AHORA)).toBe('hoy'); // 22:00 del 19 en Mendoza
    expect(clasificarDescarga('2026-10-20T15:00:00Z', ZONA, AHORA)).toBe('manana');
    expect(clasificarDescarga('2026-10-25T15:00:00Z', ZONA, AHORA)).toBe('futuro');
    expect(clasificarDescarga(null, ZONA, AHORA)).toBe('sin_fecha');
  });
});

describe('pizarra: filtros', () => {
  const filas = [
    fila({ semiId: 1, accesorios: { 7: 15, 8: 1 }, alertas: [{ codigo: 'descarga_vencida', nivel: 'critico', texto: 'x' }] }),
    fila({ semiId: 2, patente: 'PXCG47', estado: 'disponible', cliente: null, chofer: null, tractor: null, accesorios: { 7: 4 } }),
    fila({ semiId: 3, patente: 'KYPG18', estado: 'vacio', cliente: null, accesorios: { 7: 20, 8: 0 } }),
  ];
  it('por estado y por alertas', () => {
    expect(filtrar(filas, { ...FILTROS_VACIOS, estados: ['disponible', 'vacio'] }, ZONA, AHORA).map((f) => f.semiId)).toEqual([2, 3]);
    expect(filtrar(filas, { ...FILTROS_VACIOS, soloAlertas: true }, ZONA, AHORA).map((f) => f.semiId)).toEqual([1]);
  });
  it('apto para: al menos N de un accesorio; sin dato no cumple', () => {
    expect(
      cumpleApto(filas[0]!, [
        { tipoId: 7, minimo: 15 },
        { tipoId: 8, minimo: 1 },
      ]),
    ).toBe(true);
    expect(filtrar(filas, { ...FILTROS_VACIOS, apto: [{ tipoId: 7, minimo: 15 }] }, ZONA, AHORA).map((f) => f.semiId)).toEqual([1, 3]);
    expect(filtrar(filas, { ...FILTROS_VACIOS, apto: [{ tipoId: 8, minimo: 1 }] }, ZONA, AHORA).map((f) => f.semiId)).toEqual([1]);
    expect(cumpleApto(filas[1]!, [{ tipoId: 8, minimo: 0 }])).toBe(false);
  });
  it('listas de los filtros sin vacíos y ordenadas', () => {
    expect(opciones(filas, (f) => f.patente)).toEqual(['KYPG18', 'PWTT41', 'PXCG47']);
    expect(opciones(filas, (f) => f.cliente)).toEqual(['TUCAPEL']);
    expect(hayFiltros(FILTROS_VACIOS)).toBe(false);
  });
  it('nivel de la fila: crítico gana a aviso', () => {
    expect(nivelFila(filas[0]!)).toBe('critico');
    expect(nivelFila(fila({ alertas: [{ codigo: 'sin_tara', nivel: 'aviso', texto: 'x' }] }))).toBe('aviso');
    expect(nivelFila(filas[1]!)).toBeNull();
  });
});

describe('pizarra: formularios (solo forma)', () => {
  it('accesorios: vacío = sin dato, número = cantidad', () => {
    const r = edicionPizarraSchema.parse({
      semiId: 1,
      versionFila: 3,
      lugarId: '',
      observacion: '  ',
      accesorios: { '7': '15', '8': null, '9': '' },
    });
    expect(r).toEqual({ semiId: 1, versionFila: 3, lugarId: null, observacion: null, accesorios: { '7': 15, '8': null, '9': null } });
    expect(
      edicionPizarraSchema.safeParse({ semiId: 1, versionFila: 3, lugarId: '', observacion: '', accesorios: { '7': '-1' } }).success,
    ).toBe(false);
  });
  it('semi: patente en mayúsculas sin espacios ni guiones; tara vacía = sin tara', () => {
    const r = semiSchema.parse({
      id: null,
      versionFila: null,
      codigoInterno: 'pwtt41',
      patente: 'pw tt-41',
      paisPatente: 'CL',
      tipo: 'plataforma',
      capacidadKg: '30.000',
      tieneEquipoFrio: false,
      estado: 'activo',
      taraFecha: '',
    });
    expect(r.patente).toBe('PWTT41');
    expect(r.capacidadKg).toBe(30000);
    expect(r.taraFecha).toBeNull();
  });
  it('tipo de accesorio: sigla corta en mayúsculas', () => {
    expect(tipoAccesorioSchema.parse({ id: null, versionFila: null, nombre: 'Nylon', sigla: 'nyl', orden: '', activo: true }).sigla).toBe(
      'NYL',
    );
    expect(
      tipoAccesorioSchema.safeParse({ id: null, versionFila: null, nombre: 'Nylon', sigla: 'NY L', orden: '', activo: true }).success,
    ).toBe(false);
  });
});

describe('«Lo que sigue» de la fila (Sprint 6 · migración 118)', async () => {
  const { parsearSigue, botonesPaso, puedeIniciarViaje } = await import('@/modules/pizarra/domain/pizarra.sigue');
  const base = {
    semi_id: 1, servicio_id: 10, numero_operacion: 6234, siguiente: 'cargo', posibles: ['retiro', 'cargando', 'cargo', 'demora', 'otro'],
    puede_volver: true, camion_id: 5, situacion_tractor: 'disponible', chofer_fijo: 'Uno Prueba', viaje_id: null, viaje_numero: null,
    carga_salida_ts: '2026-10-29T10:00:00Z', item_id: null, continua: null,
  };

  it('lee lo que manda la base y descarta lo que no conoce', () => {
    const m = parsearSigue([base, { ...base, semi_id: 2, servicio_id: null, siguiente: null, posibles: null, camion_id: null, situacion_tractor: null, puede_volver: null }]);
    expect(m.get(1)).toMatchObject({ servicioId: 10, siguiente: 'cargo', posibles: ['retiro', 'cargando', 'cargo', 'demora'], situacionTractor: 'disponible' });
    expect(m.get(2)).toMatchObject({ servicioId: null, siguiente: null, posibles: [], puedeVolver: false });
    expect(parsearSigue(null).size).toBe(0);
  });

  it('el botón principal es el que dijo la base; los otros van en «Más»; equipo y confirmar quedan en Operaciones', () => {
    const s = parsearSigue([base]).get(1)!;
    expect(botonesPaso(s)).toEqual({ principal: 'cargo', otros: ['retiro', 'cargando', 'demora'] });
    const sinEquipo = parsearSigue([{ ...base, siguiente: 'equipo', posibles: ['equipo'] }]).get(1)!;
    expect(botonesPaso(sinEquipo)).toEqual({ principal: null, otros: [] });
    expect(botonesPaso(parsearSigue([{ ...base, servicio_id: null }]).get(1)!)).toEqual({ principal: null, otros: [] });
  });

  it('«Continúa a…» solo con el tramo que falta; iniciar viaje si el tractor no está en viaje ni en taller', () => {
    const c = parsearSigue([{ ...base, item_id: 7, viaje_id: 3, situacion_tractor: 'en_viaje', continua: { desde: 'Mendoza', hasta: 'Buenos Aires', linea: 'MZA-BSAS', linea_id: 4 } }]).get(1)!;
    expect(c.continua).toEqual({ hasta: 'Buenos Aires', linea: 'MZA-BSAS' });
    expect(puedeIniciarViaje(c)).toBe(false);
    expect(puedeIniciarViaje(parsearSigue([base]).get(1)!)).toBe(true);
    expect(puedeIniciarViaje(parsearSigue([{ ...base, situacion_tractor: 'taller' }]).get(1)!)).toBe(false);
    expect(puedeIniciarViaje(parsearSigue([{ ...base, camion_id: null }]).get(1)!)).toBe(false);
    expect(parsearSigue([{ ...base, continua: { hasta: 'X' } }]).get(1)!.continua).toBeNull(); // sin ítem no hay «Continúa»
  });
});
