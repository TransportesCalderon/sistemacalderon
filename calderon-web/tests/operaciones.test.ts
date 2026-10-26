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
    // Migración 76: sin marcar, va con mercadería
    expect(r.contenedorVacio).toBe(false);
    expect(operacionSchema.parse({ ...base, contenedorVacio: true }).contenedorVacio).toBe(true);
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
      consumoObjetivo: '33,5',
      activa: true,
      canonChofer: '120.000',
      canonMoneda: 'ARS',
    });
    expect(l).toMatchObject({ codigo: 'SAI-BSAS', lugarAduanaId: null, distanciaKm: 1500, transitHoras: null, canonChofer: 120000, canonMoneda: 'ARS', consumoObjetivo: 33.5 });
    expect(transportistaSchema.safeParse({ id: null, versionFila: null, razonSocial: '', cuit: '', telefono: '', observaciones: '', activo: true }).success).toBe(false);
  });
});

describe('Operaciones más simples (migración 42)', () => {
  it('alta: cantidad por defecto 1 y equipo opcional', async () => {
    const { altaSchema } = await import('@/modules/logistica/domain/operacion.schemas');
    const r = altaSchema.parse({ ...base, cantidad: '', semiId: '', camionId: '', choferId: '' });
    expect(r.cantidad).toBe(1);
    expect(r.semiId).toBeNull();
    expect(altaSchema.safeParse({ ...base, cantidad: '0', semiId: '', camionId: '', choferId: '' }).success).toBe(false);
    expect(altaSchema.parse({ ...base, cantidad: '8', semiId: '', camionId: '', choferId: '' }).cantidad).toBe(8);
  });

  it('un paso: vacío = ahora; odómetro con puntos de miles', async () => {
    const { avanzarSchema } = await import('@/modules/logistica/domain/operacion.schemas');
    const r = avanzarSchema.parse({ servicioId: 5, paso: 'cargo', momento: '', odometroKm: '101.500', detalle: '' });
    expect(r).toMatchObject({ momento: null, odometroKm: 101500, detalle: null });
    expect(avanzarSchema.safeParse({ servicioId: 5, paso: 'volar', momento: '', odometroKm: '', detalle: '' }).success).toBe(false);
  });

  it('cada paso tiene su etiqueta', async () => {
    const { PASOS_OPERACION, PASO_OPERACION_ETIQUETA, esPasoOperacion } = await import('@/modules/logistica/domain/operacion.types');
    for (const p of PASOS_OPERACION) expect(PASO_OPERACION_ETIQUETA[p]).toBeTruthy();
    expect(PASO_OPERACION_ETIQUETA.cargo).toBe('Cargó');
    expect(esPasoOperacion('entrego')).toBe(true);
    expect(esPasoOperacion('x')).toBe(false);
  });
});
