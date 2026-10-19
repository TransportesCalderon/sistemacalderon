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
