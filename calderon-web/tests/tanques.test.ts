import { describe, expect, it } from 'vitest';
import { bajaTanqueSchema, cambioCapacidadSchema, filaTanqueVacia, tanqueAltaSchema, tanquesAltaSchema } from '@/modules/flota/domain/tanque.schemas';
import { aTanque } from '@/modules/flota/repositories/tanque.repository';
import { traducirErrorDb } from '@/server/errors/traducir';

describe('tanques del camión (migración 27)', () => {
  it('alta: convierte coma decimal y descripción vacía', () => {
    const r = tanqueAltaSchema.parse({
      camionId: 7,
      tipo: 'mochila',
      descripcion: '  ',
      capacidadNominalL: '720,5',
      capacidadUtilL: '700',
      vigenteDesde: '2026-01-01',
    });
    expect(r).toMatchObject({ tipo: 'mochila', descripcion: null, capacidadNominalL: 720.5, capacidadUtilL: 700 });
  });

  it('alta: rechaza tipo inexistente, litros mal escritos y fecha vacía', () => {
    const r = tanqueAltaSchema.safeParse({
      camionId: 7,
      tipo: 'bidon',
      descripcion: '',
      capacidadNominalL: 'mil',
      capacidadUtilL: '-5',
      vigenteDesde: '',
    });
    expect(r.success).toBe(false);
    const campos = new Set(r.error?.issues.map((i) => i.path[0]));
    expect(campos).toEqual(new Set(['tipo', 'capacidadNominalL', 'capacidadUtilL', 'vigenteDesde']));
  });

  it('no repite reglas de la base: útil mayor que nominal pasa el formulario (lo rechaza la base)', () => {
    const r = cambioCapacidadSchema.safeParse({ camionId: 1, tanqueId: 2, desde: '2026-10-18', capacidadNominalL: '100', capacidadUtilL: '120' });
    expect(r.success).toBe(true);
  });

  it('baja: exige fecha', () => {
    expect(bajaTanqueSchema.safeParse({ camionId: 1, tanqueId: 2, versionFila: 1, hasta: '' }).success).toBe(false);
  });

  it('fila de la base → tanque', () => {
    const t = aTanque({
      id: 3,
      camion_id: 7,
      numero_tanque: 2,
      tipo: 'secundario',
      descripcion: null,
      capacidad_nominal_l: '300.00',
      capacidad_util_l: '290.50',
      vigente_desde: '2026-01-01',
      vigente_hasta: null,
      version_fila: 4,
    });
    expect(t).toMatchObject({ numero: 2, tipo: 'secundario', capacidadNominalL: 300, capacidadUtilL: 290.5, vigenteHasta: null, versionFila: 4 });
  });

  it('errores de la base: restricción con mensaje y campo; mensaje de trigger sin cambios', () => {
    const util = traducirErrorDb({ code: '23514', message: 'new row for relation "tanque_combustible" violates check constraint "ck_tanque_util"' });
    expect(util.campos).toEqual({ capacidadUtilL: util.mensaje });
    const principal = traducirErrorDb({ code: '23P01', message: 'conflicting key value violates exclusion constraint "ex_tanque_principal"' });
    expect(principal.mensaje).toMatch(/tanque principal vigente/);
    const cargas = traducirErrorDb({ code: '55000', message: 'El tanque 1 tiene cargas registradas: no se elimina; darlo de baja con fecha' });
    expect(cargas.mensaje).toBe('El tanque 1 tiene cargas registradas: no se elimina; darlo de baja con fecha');
    const faltante = traducirErrorDb({
      code: '23514',
      message: 'El camión no tiene tanques cargados al 18/10/2026 (Flota > Camiones > Tanques): sin la capacidad no se puede declarar un faltante',
    });
    expect(faltante.mensaje).toMatch(/no tiene tanques cargados/);
  });

  it('alta del camión: varios tanques juntos; una fila vacía no cuenta', () => {
    expect(filaTanqueVacia({ tipo: 'mochila', descripcion: '', capacidadNominalL: ' ', capacidadUtilL: '' })).toBe(true);
    expect(filaTanqueVacia({ tipo: 'mochila', descripcion: '', capacidadNominalL: '700', capacidadUtilL: '' })).toBe(false);
    const r = tanquesAltaSchema.parse({
      camionId: 9,
      vigenteDesde: '2026-10-18',
      tanques: [
        { tipo: 'principal', descripcion: '', capacidadNominalL: '500', capacidadUtilL: '500' },
        { tipo: 'mochila', descripcion: 'cabina', capacidadNominalL: '720', capacidadUtilL: '700' },
      ],
    });
    expect(r.tanques.map((t) => t.capacidadUtilL)).toEqual([500, 700]);
    expect(tanquesAltaSchema.safeParse({ camionId: 9, vigenteDesde: '2026-10-18', tanques: [] }).success).toBe(false);
  });
});
