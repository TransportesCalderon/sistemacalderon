import { describe, expect, it } from 'vitest';
import { documentoSchema, validarCargaSchema } from '@/modules/combustible/domain/documento.schemas';
import { rutaArchivo } from '@/modules/combustible/domain/documento.types';
import { ORDEN_COLUMNAS } from '@/modules/core/permissions/matriz';
import { can, permisosDe } from '@/modules/core/permissions/resolver';
import { traducirErrorDb } from '@/server/errors/traducir';

const agregado = { gerenciaDetalleAlertas: 'agregado' as const };

describe('operación diaria (migración 34)', () => {
  it('ruta del ticket en Storage: cargas/<carga>/<id>.<ext>', () => {
    expect(rutaArchivo(15, 'JPG', 'abc')).toBe('cargas/15/abc.jpg');
    expect(rutaArchivo(15, '', 'abc')).toBe('cargas/15/abc.bin');
  });

  it('ticket: número, fecha y hash obligatorios', () => {
    const base = {
      cargaId: 1,
      tipo: 'ticket',
      numero: 'T-1',
      fecha: '2026-10-19',
      archivo: 'cargas/1/a.jpg',
      hash: 'a'.repeat(64),
      emisorId: null,
    };
    expect(documentoSchema.safeParse(base).success).toBe(true);
    expect(documentoSchema.safeParse({ ...base, numero: ' ' }).success).toBe(false);
    expect(documentoSchema.safeParse({ ...base, hash: 'x' }).success).toBe(false);
    expect(validarCargaSchema.parse({ cargaId: 1, motivo: '  ' }).motivo).toBeNull();
  });

  it('usuarios y roles: solo TI', () => {
    for (const rol of ORDEN_COLUMNAS) {
      expect(can(permisosDe([rol], agregado), 'configuracion.usuarios:ver'), rol).toBe(rol === 'ti');
    }
  });

  it('validar una carga: Adm. de combustible y TI', () => {
    expect(can(permisosDe(['adm_combustible'], agregado), 'combustible.cargas:transicionar')).toBe(true);
    expect(can(permisosDe(['operaciones'], agregado), 'combustible.cargas:transicionar')).toBe(false);
  });

  it('número de ticket repetido: mensaje de negocio en el campo número', () => {
    const e = traducirErrorDb({ code: '23505', message: 'duplicate key value violates unique constraint "ux_doc_emisor_tipo_numero"' });
    expect(e.mensaje).toContain('ticket');
    expect(e.campos?.numero).toBeDefined();
  });
});
