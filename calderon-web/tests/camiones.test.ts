import { describe, expect, it } from 'vitest';
import { camionAltaSchema, camionEdicionSchema, normalizarPatente, valoresAltaCamion, valoresEdicionCamion } from '@/modules/flota/domain/camion.schemas';
import { parsearListaCamiones, serializarListaCamiones, LISTA_CAMIONES_DEFECTO } from '@/modules/flota/domain/camion.lista';
import { aCamion, aFilaCamion, filtrosCamionPostgrest } from '@/modules/flota/repositories/camion.repository';
import { traducirErrorDb } from '@/server/errors/traducir';
import { ConflictoVersion, rangoPagina, textoBusqueda } from '@/shared/repository/types';
import { ErrorNegocio } from '@/shared/lib/errores';
import { esFechaDiaValida, formatearFechaDia, hoyEnZona } from '@/shared/lib/fechas';
import type { FechaDia } from '@/shared/types/dominio';

const base = () => ({
  ...valoresAltaCamion('2026-10-01' as FechaDia),
  codigoInterno: ' TC-01 ',
  patente: 'ab 123 cd',
  tipoCombustibleId: '1',
});

describe('esquema del camión (F-MAE-01)', () => {
  it('normaliza patente, textos vacíos y números', () => {
    const r = camionAltaSchema.parse({ ...base(), vin: ' 1hgcm82633a004352 ', anio: '2019', consumoReferencia: '32,5', marca: '  ' });
    expect(r.codigoInterno).toBe('TC-01');
    expect(r.patente).toBe('AB123CD');
    expect(r.vin).toBe('1HGCM82633A004352');
    expect(r.anio).toBe(2019);
    expect(r.consumoReferencia).toBe('32.5');
    expect(r.marca).toBeNull();
    expect(r.fechaBaja).toBeNull();
    expect(r.tipoCombustibleId).toBe(1);
  });

  it('rechaza año fuera de 1990–2100 y consumo no positivo', () => {
    const r = camionAltaSchema.safeParse({ ...base(), anio: '1985', consumoReferencia: '0' });
    expect(r.success).toBe(false);
    const campos = r.error!.issues.map((i) => i.path.join('.'));
    expect(campos).toContain('anio');
    expect(campos).toContain('consumoReferencia');
  });

  it('exige fecha de baja ≥ alta y estado inactivo cuando hay baja', () => {
    const r = camionAltaSchema.safeParse({ ...base(), fechaBaja: '2026-09-01' });
    expect(r.success).toBe(false);
    const campos = r.error!.issues.map((i) => i.path.join('.'));
    expect(campos).toEqual(expect.arrayContaining(['fechaBaja', 'estado']));
    expect(camionAltaSchema.safeParse({ ...base(), fechaBaja: '2026-12-01', estado: 'inactivo' }).success).toBe(true);
  });

  it('exige obligatorios', () => {
    const r = camionAltaSchema.safeParse({ ...base(), codigoInterno: '', patente: ' ', tipoCombustibleId: '', paisPatente: '' });
    const campos = r.error!.issues.map((i) => i.path.join('.'));
    expect(campos).toEqual(expect.arrayContaining(['codigoInterno', 'patente', 'tipoCombustibleId', 'paisPatente']));
  });

  it('la edición agrega id y versión, y es ida y vuelta con la ficha', () => {
    const datos = camionAltaSchema.parse({ ...base(), consumoReferencia: '31.25', anio: '2020' });
    const fila = { id: 7, ...aFilaCamion(datos), consumo_referencia_l_100km: '31.25', creado_en: '2026-10-01T12:00:00Z', creado_por: 1, actualizado_en: '2026-10-01T12:00:00Z', actualizado_por: 1, eliminado_en: null, version_fila: 3 };
    const camion = aCamion(fila);
    const r = camionEdicionSchema.parse({ ...valoresEdicionCamion(camion), id: camion.id, versionFila: camion.versionFila });
    expect(r).toMatchObject({ id: 7, versionFila: 3, patente: 'AB123CD', consumoReferencia: '31.25', anio: 2020 });
    expect(camionEdicionSchema.safeParse(valoresEdicionCamion(camion)).success).toBe(false);
  });

  it('normalizarPatente quita espacios y pasa a mayúsculas', () => {
    expect(normalizarPatente(' ab 12\tcd ')).toBe('AB12CD');
  });
});

describe('repositorio del camión', () => {
  it('convierte el consumo a número exacto para PostgREST', () => {
    const datos = camionAltaSchema.parse({ ...base(), consumoReferencia: '32.45' });
    expect(aFilaCamion(datos).consumo_referencia_l_100km).toBe(32.45);
    expect(JSON.stringify(aFilaCamion(datos).consumo_referencia_l_100km)).toBe('32.45');
  });

  it('arma filtros y búsqueda segura', () => {
    const f = filtrosCamionPostgrest({ estado: 'taller', pais: 'CL', tipoCombustibleId: 2, texto: 'volvo,fh)(' });
    expect(f.eq).toEqual([
      ['estado', 'taller'],
      ['pais_patente', 'CL'],
      ['tipo_combustible_id', 2],
    ]);
    expect(f.or).toBe('codigo_interno.ilike.*volvo*fh*,patente.ilike.*volvo*fh*,marca.ilike.*volvo*fh*,modelo.ilike.*volvo*fh*,vin.ilike.*volvo*fh*');
    expect(filtrosCamionPostgrest({}).or).toBeNull();
  });

  it('textoBusqueda y rangoPagina', () => {
    expect(textoBusqueda('  %*,() ')).toBeNull();
    expect(textoBusqueda('Scania R-450')).toBe('Scania R-450');
    expect(rangoPagina(3, 25)).toEqual([50, 74]);
    expect(rangoPagina(0, 25)).toEqual([0, 24]);
  });
});

describe('lista ⇄ URL', () => {
  it('ida y vuelta conserva los parámetros', () => {
    const p = { ...LISTA_CAMIONES_DEFECTO, texto: 'fh', estado: 'activo' as const, pais: 'AR', tipoCombustibleId: 1, incluirEliminados: true, orden: 'patente' as const, dir: 'desc' as const, pagina: 3 };
    expect(parsearListaCamiones(new URLSearchParams(serializarListaCamiones(p)))).toEqual(p);
  });

  it('descarta valores inválidos', () => {
    expect(parsearListaCamiones({ estado: 'roto', orden: 'id;drop', pagina: '-4', pais: 'arg', combustible: 'x' })).toEqual(LISTA_CAMIONES_DEFECTO);
    expect(serializarListaCamiones(LISTA_CAMIONES_DEFECTO)).toBe('');
  });
});

describe('traducción de errores', () => {
  it('duplicado de patente se marca en el campo', () => {
    const r = traducirErrorDb({ code: '23505', message: 'duplicate key value violates unique constraint "ux_camion_patente"' });
    expect(r).toEqual({ codigo: 'duplicado', mensaje: 'Ya existe un camión con esa patente.', campos: { patente: 'Ya existe un camión con esa patente.' } });
  });

  it('conflicto de versión y errores de negocio', () => {
    expect(traducirErrorDb(new ConflictoVersion('mae.camion', 1)).codigo).toBe('conflicto_version');
    expect(traducirErrorDb(new ErrorNegocio('inmutable', 'No se modifica.'))).toEqual({ codigo: 'inmutable', mensaje: 'No se modifica.' });
  });
});

describe('fechas', () => {
  it('formatea y valida días', () => {
    expect(formatearFechaDia('2026-10-13')).toBe('13/10/2026');
    expect(esFechaDiaValida('2026-02-30')).toBe(false);
    expect(esFechaDiaValida('2024-02-29')).toBe(true);
    // 02:00 UTC del 14/10 todavía es 13/10 en Mendoza (UTC−3)
    expect(hoyEnZona('America/Argentina/Mendoza', new Date('2026-10-14T02:00:00Z'))).toBe('2026-10-13');
  });
});
