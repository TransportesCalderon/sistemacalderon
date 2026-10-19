import { describe, expect, it } from 'vitest';
import { lineaSchema, operacionSchema, transportistaSchema } from '@/modules/logistica/domain/operacion.schemas';
import { ESTADOS_LOGISTICA, ESTADO_INFO, GRUPOS_FILTRO, esAbierta, etiquetaTipo } from '@/modules/logistica/domain/operacion.types';

const base = {
  servicioId: null,
  versionFila: null,
  sinConfirmar: true,
  tipoOperacion: 'importacion',
  fechaOperacion: '2026-10-19',
  clienteId: '4',
  lineaId: '2',
  lugarRetiroId: '',
  origenId: '',
  lugarAduanaId: '',
  destinoId: '',
  fechaPresentacion: '',
  fechaEntrega: '',
  producto: ' Banana ',
  pesoKg: '22.680',
  tipoContenedor: '40 REEFER',
  contenedor: '',
  precinto: '',
  taraMaxDias: '',
  booking: 'GQL0477219',
  referenciaCliente: '',
  buque: '',
  crt: '',
  mic: '',
  observacion: '',
};

describe('Operaciones (migración 41)', () => {
  it('el formulario solo da forma: vacíos a null, ids y números', () => {
    const r = operacionSchema.parse(base);
    expect(r.clienteId).toBe(4);
    expect(r.lineaId).toBe(2);
    expect(r.origenId).toBeNull();
    expect(r.producto).toBe('Banana');
    expect(r.pesoKg).toBe(22680);
    expect(r.fechaPresentacion).toBeNull();
  });

  it('pide tipo y cliente, pero los lugares los completa la base con la línea', () => {
    expect(operacionSchema.safeParse({ ...base, tipoOperacion: '' }).success).toBe(false);
    expect(operacionSchema.safeParse({ ...base, clienteId: '' }).success).toBe(false);
    expect(operacionSchema.safeParse({ ...base, lineaId: '' }).success).toBe(true);
  });

  it('cada estado tiene etiqueta y está en un solo botón de color', () => {
    for (const e of ESTADOS_LOGISTICA) {
      expect(ESTADO_INFO[e].etiqueta).toBeTruthy();
      expect(GRUPOS_FILTRO.filter((g) => g.estados !== null && (g.estados as readonly string[]).includes(e))).toHaveLength(1);
    }
    expect(ESTADO_INFO.aduana.etiqueta).toBe('04-Aduana');
    expect(ESTADO_INFO.programado.etiqueta).toBe('01-Programado');
  });

  it('abierta = sin confirmar o programada; tipos con la palabra de REDLINE', () => {
    expect(esAbierta({ estado: 'sin_confirmar' })).toBe(true);
    expect(esAbierta({ estado: 'en_curso' })).toBe(false);
    expect(etiquetaTipo('round_trip')).toBe('ROUND TRIP');
    expect(etiquetaTipo(null)).toBe('—');
  });

  it('catálogos: línea y transportista', () => {
    const l = lineaSchema.parse({
      id: null,
      versionFila: null,
      codigo: ' SAI-BSAS ',
      lugarRetiroId: '1',
      lugarEntregaId: '2',
      lugarAduanaId: '',
      distanciaKm: '1500',
      cruzaFrontera: true,
      transitHoras: '',
      activa: true,
    });
    expect(l).toMatchObject({ codigo: 'SAI-BSAS', lugarAduanaId: null, distanciaKm: 1500, transitHoras: null });
    expect(transportistaSchema.safeParse({ id: null, versionFila: null, razonSocial: '', cuit: '', telefono: '', observaciones: '', activo: true }).success).toBe(false);
  });
});
