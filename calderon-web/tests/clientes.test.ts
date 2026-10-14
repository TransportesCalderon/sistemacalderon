import { describe, expect, it } from 'vitest';
import { LISTA_CLIENTES_DEFECTO, parsearListaClientes, serializarListaClientes } from '@/modules/comercial/domain/cliente.lista';
import { clienteAltaSchema, clienteEdicionSchema, valoresAltaCliente, valoresEdicionCliente } from '@/modules/comercial/domain/cliente.schemas';
import { textoCondicionPago } from '@/modules/comercial/domain/cliente.types';
import {
  errorIdentificadorFiscal,
  formatearIdentificadorFiscal,
  normalizarIdentificadorFiscal,
} from '@/modules/comercial/domain/identificador-fiscal';
import { aCliente, aFilaCliente, filtrosClientePostgrest, palabrasSignificativas } from '@/modules/comercial/repositories/cliente.repository';
import { digitoCuil } from '@/modules/flota/domain/documento';
import { traducirErrorDb } from '@/server/errors/traducir';

const cuitValido = `3071234567${digitoCuil('3071234567')}`;

const alta = () => ({
  ...valoresAltaCliente(),
  codigo: ' CLI-01 ',
  razonSocial: '  Frutícola   Andina  S.A. ',
  identificadorFiscal: `${cuitValido.slice(0, 2)}-${cuitValido.slice(2, 10)}-${cuitValido.slice(10)}`,
  condicionPagoDias: '30',
});

describe('identificador fiscal', () => {
  it('normaliza y valida CUIT (AR) y RUT (CL)', () => {
    expect(normalizarIdentificadorFiscal('AR', '30-71234567-1')).toBe('30712345671');
    expect(normalizarIdentificadorFiscal('CL', '76.123.456-0')).toBe('76123456-0');
    expect(errorIdentificadorFiscal('AR', cuitValido)).toBeNull();
    expect(errorIdentificadorFiscal('AR', '3071234567')).toMatch(/11 dígitos/);
    expect(errorIdentificadorFiscal('CL', '12345678-5')).toBeNull();
    expect(errorIdentificadorFiscal('CL', '12345678-4')).toMatch(/verificador/);
    expect(formatearIdentificadorFiscal('AR', cuitValido)).toBe(`30-71234567-${cuitValido[10]}`);
  });
});

describe('esquema del cliente (P-CLI-01)', () => {
  it('normaliza los datos', () => {
    const r = clienteAltaSchema.parse(alta());
    expect(r).toMatchObject({
      codigo: 'CLI-01',
      razonSocial: 'Frutícola Andina S.A.',
      identificadorFiscal: cuitValido,
      condicionPagoDias: 30,
      segmento: null,
      monedaFacturacion: 'ARS',
    });
  });

  it('valida condición de pago 0–365 e identificador según el país', () => {
    const r = clienteAltaSchema.safeParse({ ...alta(), condicionPagoDias: '400', pais: 'CL' });
    const campos = r.error!.issues.map((i) => i.path.join('.'));
    expect(campos).toEqual(expect.arrayContaining(['condicionPagoDias', 'identificadorFiscal']));
    expect(clienteAltaSchema.safeParse({ ...alta(), condicionPagoDias: '-1' }).success).toBe(false);
    expect(clienteAltaSchema.safeParse({ ...alta(), condicionPagoDias: '0' }).success).toBe(true);
  });

  it('edición: ida y vuelta con la ficha', () => {
    const fila = { id: 4, ...aFilaCliente(clienteAltaSchema.parse(alta())), creado_en: 'x', creado_por: 1, actualizado_en: 'x', actualizado_por: 1, eliminado_en: null, version_fila: 2 };
    const cliente = aCliente(fila);
    const r = clienteEdicionSchema.parse({ ...valoresEdicionCliente(cliente), id: cliente.id, versionFila: 2 });
    expect(r).toMatchObject({ id: 4, versionFila: 2, identificadorFiscal: cuitValido, condicionPagoDias: 30 });
    expect(clienteEdicionSchema.safeParse(valoresEdicionCliente(cliente)).success).toBe(false);
  });
});

describe('repositorio del cliente', () => {
  it('filtros y búsqueda (también CUIT con guiones)', () => {
    const f = filtrosClientePostgrest({ estado: 'bloqueado', moneda: 'USD', texto: 'andina 30-7123' });
    expect(f.eq).toEqual([
      ['estado', 'bloqueado'],
      ['moneda_facturacion', 'USD'],
    ]);
    expect(f.or[0]).toBe('codigo.ilike.*andina*,razon_social.ilike.*andina*,identificador_fiscal.ilike.*andina*');
    expect(f.or[1]).toBe(
      'codigo.ilike.*30-7123*,razon_social.ilike.*30-7123*,identificador_fiscal.ilike.*30-7123*,identificador_fiscal.ilike.*307123*',
    );
  });

  it('palabras significativas para buscar parecidos', () => {
    expect(palabrasSignificativas('Frutícola Andina S.A.')).toEqual(['FRUTÍCOLA', 'ANDINA']);
    expect(palabrasSignificativas('Transportes del Sur SRL')).toEqual(['TRANSPORTES', 'SUR']);
    expect(palabrasSignificativas('S.A. de la')).toEqual([]);
  });
});

describe('lista ⇄ URL y errores', () => {
  it('ida y vuelta conserva los parámetros', () => {
    const p = { ...LISTA_CLIENTES_DEFECTO, texto: 'andina', estado: 'activo' as const, pais: 'CL', moneda: 'CLP', segmento: 'Fruta', incluirEliminados: true, orden: 'codigo' as const, dir: 'desc' as const, pagina: 2 };
    expect(parsearListaClientes(new URLSearchParams(serializarListaClientes(p)))).toEqual(p);
    expect(parsearListaClientes({ estado: 'x', moneda: 'pesos', orden: 'id' })).toEqual(LISTA_CLIENTES_DEFECTO);
  });

  it('duplicado fiscal se marca en el campo', () => {
    expect(traducirErrorDb({ code: '23505', message: 'duplicate key value violates unique constraint "ux_cliente_fiscal"' })).toEqual({
      codigo: 'duplicado',
      mensaje: 'Ya existe un cliente con ese identificador fiscal en ese país.',
      campos: { identificadorFiscal: 'Ya existe un cliente con ese identificador fiscal en ese país.' },
    });
  });

  it('texto de condición de pago', () => {
    expect(textoCondicionPago(0)).toBe('Contado');
    expect(textoCondicionPago(30)).toBe('30 días');
  });
});

describe('identificador guardado (edición)', () => {
  it('no revalida el identificador si no cambió, sí si cambia', () => {
    const base = { ...valoresAltaCliente('CL', 'CLP'), codigo: 'C', razonSocial: 'X Ltda', identificadorFiscal: '76100001-1', id: 2, versionFila: 1 };
    expect(clienteEdicionSchema.safeParse({ ...base, identificadorGuardado: 'CL|76100001-1' }).success).toBe(true);
    expect(clienteEdicionSchema.safeParse({ ...base, identificadorFiscal: '76100002-1', identificadorGuardado: 'CL|76100001-1' }).success).toBe(false);
    expect(clienteEdicionSchema.parse({ ...base, identificadorGuardado: 'CL|76100001-1' })).not.toHaveProperty('identificadorGuardado');
  });
});
