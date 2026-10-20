import { describe, expect, it } from 'vitest';
import { LISTA_CHOFERES_DEFECTO, parsearListaChoferes, serializarListaChoferes } from '@/modules/flota/domain/chofer.lista';
import { choferAltaSchema, choferEdicionSchema, choferFormSchema, valoresAltaChofer, valoresEdicionChofer } from '@/modules/flota/domain/chofer.schemas';
import { digitoCuil, digitoRut, errorDocumento, normalizarDocumento } from '@/modules/flota/domain/documento';
import { aChofer, aFilaChofer, filtrosChoferPostgrest } from '@/modules/flota/repositories/chofer.repository';
import { choferService } from '@/modules/flota/services/chofer.service';
import { traducirErrorDb } from '@/server/errors/traducir';
import type { Db } from '@/shared/repository/types';
import type { FechaDia } from '@/shared/types/dominio';

const alta = () => ({
  ...valoresAltaChofer('2026-10-01' as FechaDia),
  legajo: ' L-001 ',
  nombre: '  Juan   Carlos ',
  apellido: 'Pérez',
  documentoNumero: '30.123.456',
});

describe('documento del chofer', () => {
  it('normaliza según el tipo', () => {
    expect(normalizarDocumento('DNI', '30.123.456')).toBe('30123456');
    expect(normalizarDocumento('CUIL', '20-30123456-7')).toBe('20301234567');
    expect(normalizarDocumento('RUT', '12.345.678-5')).toBe('12345678-5');
    expect(normalizarDocumento('RUT', '123456785')).toBe('12345678-5');
    expect(normalizarDocumento('PASAPORTE', 'aab 123456')).toBe('AAB123456');
  });

  it('verifica dígitos de CUIL y RUT', () => {
    expect(digitoCuil('2030123456')).not.toBeNull();
    const cuil = `2030123456${digitoCuil('2030123456')}`;
    expect(errorDocumento('CUIL', cuil)).toBeNull();
    expect(errorDocumento('CUIL', `2030123456${(digitoCuil('2030123456')! + 1) % 10}`)).toMatch(/verificador/);
    expect(digitoRut('12345678')).toBe('5');
    expect(errorDocumento('RUT', '12345678-5')).toBeNull();
    expect(errorDocumento('RUT', '12345678-K')).toMatch(/verificador/);
    expect(errorDocumento('DNI', '123')).toMatch(/7 u 8/);
  });
});

describe('esquemas del chofer (F-MAE-03)', () => {
  it('alta: normaliza y exige documento', () => {
    const r = choferAltaSchema.parse(alta());
    expect(r).toMatchObject({ legajo: 'L-001', nombre: 'Juan Carlos', baseUbicacionId: null, documento: { tipo: 'DNI', numero: '30123456' } });
    expect(r).not.toHaveProperty('cambiarDocumento');
    const sinDoc = choferAltaSchema.safeParse({ ...alta(), documentoNumero: '' });
    expect(sinDoc.error!.issues.map((i) => i.path.join('.'))).toContain('documentoNumero');
  });

  it('egreso: ≥ ingreso y exige estado Baja', () => {
    const r = choferAltaSchema.safeParse({ ...alta(), fechaEgreso: '2026-09-01' });
    expect(r.error!.issues.map((i) => i.path.join('.'))).toEqual(expect.arrayContaining(['fechaEgreso', 'estado']));
    expect(choferAltaSchema.safeParse({ ...alta(), fechaEgreso: '2026-12-01', estado: 'baja' }).success).toBe(true);
  });

  it('edición: el documento solo viaja si se marca "cambiar"', () => {
    const fila = { id: 9, ...aFilaChofer(choferAltaSchema.parse(alta())), creado_en: 'x', creado_por: 1, actualizado_en: 'x', actualizado_por: 1, eliminado_en: null, version_fila: 4 };
    const chofer = aChofer(fila);
    const valores = valoresEdicionChofer(chofer);
    expect(valores.documentoNumero).toBe('');
    const sinCambio = choferEdicionSchema.parse({ ...valores, id: 9, versionFila: 4 });
    expect(sinCambio.documento).toBeNull();
    expect(choferFormSchema.safeParse(valores).success).toBe(true);
    const conCambio = choferEdicionSchema.safeParse({ ...valores, id: 9, versionFila: 4, cambiarDocumento: true });
    expect(conCambio.success).toBe(false);
    const nuevo = choferEdicionSchema.parse({ ...valores, id: 9, versionFila: 4, cambiarDocumento: true, documentoTipo: 'RUT', documentoNumero: '12.345.678-5' });
    expect(nuevo.documento).toEqual({ tipo: 'RUT', numero: '12345678-5' });
  });

  it('las columnas que se escriben no incluyen el documento', () => {
    const cols = Object.keys(aFilaChofer(choferAltaSchema.parse(alta())));
    expect(cols).not.toContain('documento_numero');
    expect(cols).not.toContain('documento_tipo');
  });
});

describe('servicio del chofer: permisos que dependen del dato', () => {
  const dbFalsa = {} as Db; // las reglas fallan antes de tocar la base

  it('alta exige alcance "todo"', async () => {
    await expect(choferService(dbFalsa).crear(choferAltaSchema.parse(alta()), { alcance: 'propio' })).rejects.toMatchObject({ codigo: 'sin_permiso' });
  });

  it('cambiar el documento exige el permiso de RR. HH.', async () => {
    const ed = { id: 3, versionFila: 1, ...choferAltaSchema.parse(alta()) };
    await expect(
      choferService(dbFalsa).editar(ed, { alcance: 'todo', choferIdSesion: null, puedeCambiarDocumento: false }),
    ).rejects.toMatchObject({ codigo: 'sin_permiso' });
  });

  it('alcance "propio" solo sobre el propio registro', async () => {
    await expect(choferService(dbFalsa).revelarDocumento(5, { alcance: 'propio', choferIdSesion: 4 }, null)).rejects.toMatchObject({
      codigo: 'sin_permiso',
    });
  });
});

describe('lista de choferes', () => {
  it('búsqueda por palabras, nunca por documento', () => {
    const f = filtrosChoferPostgrest({ texto: 'juan pérez', estado: 'licencia', baseId: 2 });
    expect(f.eq).toEqual([
      ['estado', 'licencia'],
      ['base_ubicacion_id', 2],
    ]);
    expect(f.or).toEqual([
      'legajo.ilike.*juan*,nombre.ilike.*juan*,apellido.ilike.*juan*,id_conductor_optifleet.ilike.*juan*',
      'legajo.ilike.*pérez*,nombre.ilike.*pérez*,apellido.ilike.*pérez*,id_conductor_optifleet.ilike.*pérez*',
    ]);
    expect(f.or.join()).not.toMatch(/documento/);
  });

  it('URL ida y vuelta y valores inválidos', () => {
    const p = { ...LISTA_CHOFERES_DEFECTO, texto: 'ana', estado: 'baja' as const, pais: 'CL', baseId: 3, incluirEliminados: true, orden: 'legajo' as const, dir: 'desc' as const, pagina: 2 };
    expect(parsearListaChoferes(new URLSearchParams(serializarListaChoferes(p)))).toEqual(p);
    expect(parsearListaChoferes({ estado: 'x', orden: 'documento_numero', base: 'a' })).toEqual(LISTA_CHOFERES_DEFECTO);
  });

  it('errores de la base marcan el campo', () => {
    expect(traducirErrorDb({ code: '23505', message: 'duplicate key value violates unique constraint "ux_chofer_documento"' })).toEqual({
      codigo: 'duplicado',
      mensaje: 'Ya existe un chofer con ese documento.',
      campos: { documentoNumero: 'Ya existe un chofer con ese documento.' },
    });
  });
});

describe('Datos del chofer (migración 43)', () => {
  it('licencia: vencida, por vencer (menos de 60 días) o vigente', async () => {
    const { situacionLicencia } = await import('@/modules/flota/domain/chofer.types');
    const hoy = '2026-10-19' as never;
    expect(situacionLicencia('2026-02-14' as never, hoy)).toBe('vencida');
    expect(situacionLicencia('2026-12-06' as never, hoy)).toBe('por_vencer');
    expect(situacionLicencia('2030-06-11' as never, hoy)).toBe('vigente');
    expect(situacionLicencia(null, hoy)).toBeNull();
  });

  it('el alta lleva los datos nuevos; la edición solo toca los reservados si se marca', async () => {
    const { choferAltaSchema, choferEdicionSchema, valoresAltaChofer } = await import('@/modules/flota/domain/chofer.schemas');
    const base = {
      ...valoresAltaChofer('2026-10-19' as never),
      legajo: 'CH-001',
      nombre: 'Ezequiel',
      apellido: 'Aguero',
      documentoNumero: '41.795.954',
      telefono: '+54 9 2634 21-5639',
      licenciaVencimiento: '2030-06-11',
      visaEstado: 'en_tramite',
      rutChile: '44.459.984-7',
    };
    const alta = choferAltaSchema.parse(base);
    expect(alta).toMatchObject({ telefono: '+54 9 2634 21-5639', licenciaVencimiento: '2030-06-11', visaEstado: 'en_tramite' });
    expect(alta.reservados).toMatchObject({ rutChile: '44.459.984-7', fechaNacimiento: null });
    const ed = choferEdicionSchema.parse({ ...base, id: 1, versionFila: 1, cambiarDocumento: false, cambiarReservados: false });
    expect(ed.reservados).toBeNull();
    expect(ed.documento).toBeNull();
  });
});

describe('Eliminar chofer (migración 45)', () => {
  it('pide motivo', async () => {
    const { eliminarChoferSchema } = await import('@/modules/flota/domain/chofer.schemas');
    expect(eliminarChoferSchema.safeParse({ id: 3, motivo: 'Cargado dos veces' }).success).toBe(true);
    expect(eliminarChoferSchema.safeParse({ id: 3, motivo: ' ' }).success).toBe(false);
  });
});
