import { describe, expect, it } from 'vitest';
import { parsearListaCargas, serializarListaCargas } from '@/modules/combustible/domain/carga.lista';
import { resolverSolicitudSchema } from '@/modules/combustible/domain/carga.schemas';
import { parsearResultado, parsearVerificacion, resultadoCongelado } from '@/modules/combustible/domain/cierre.resultado';
import { aFormularioBorrador, borradorFormSchema } from '@/modules/combustible/domain/cierre.schemas';
import { parsearListaCierres, resultadoVerificacion, serializarListaCierres, type DatosBorrador } from '@/modules/combustible/domain/cierre.types';
import { cargaFormSchema } from '@/modules/combustible/domain/carga.schemas';
import { movimientoConMotivoSchema, movimientoFormSchema } from '@/modules/combustible/domain/movimiento.schemas';
import { parsearListaMovimientos, serializarListaMovimientos } from '@/modules/combustible/domain/movimiento.types';
import { parsearListaViajes, serializarListaViajes } from '@/modules/combustible/domain/viaje.types';
import { horaLocalAIso, isoAHoraLocal } from '@/shared/lib/fechas';

describe('listas ⇄ URL', () => {
  it('cargas: ida y vuelta, descarta valores inválidos', () => {
    const p = parsearListaCargas(new URLSearchParams('camion=7&desde=2026-10-01&hasta=xx&fronteras=1&situacion=anulada&pagina=3'));
    expect(p).toEqual({ pagina: 3, camionId: 7, desde: '2026-10-01', soloFronteras: true, situacion: 'anulada' });
    expect(parsearListaCargas(new URLSearchParams(serializarListaCargas(p)))).toEqual(p);
    expect(parsearListaCargas({ situacion: 'otra', camion: 'abc' })).toEqual({ pagina: 1 });
  });

  it('viajes: situación válida y página 1 implícita', () => {
    const p = parsearListaViajes(new URLSearchParams('camion=2&situacion=sin_cierre'));
    expect(p).toEqual({ pagina: 1, camionId: 2, situacion: 'sin_cierre' });
    expect(serializarListaViajes(p)).toBe('camion=2&situacion=sin_cierre');
    expect(parsearListaViajes({ situacion: 'cerrado' }).situacion).toBeUndefined();
  });

  it('cierres: ida y vuelta', () => {
    const p = parsearListaCierres(new URLSearchParams('estado=aprobado&imputable=1&desde=2026-09-01&pagina=2'));
    expect(p).toEqual({ pagina: 2, estado: 'aprobado', conImputable: true, desde: '2026-09-01' });
    expect(parsearListaCierres(new URLSearchParams(serializarListaCierres(p)))).toEqual(p);
  });
});

describe('verificación: resultado, no estado', () => {
  const v = (ok: boolean, defectos: string[] = [], avisos: string[] = []) => ({ ok, defectos, avisos, verificadoEn: null });
  it('verificado / con avisos / con diferencias', () => {
    expect(resultadoVerificacion(v(true))).toBe('verificado');
    expect(resultadoVerificacion(v(true, [], ['a']))).toBe('con_avisos');
    expect(resultadoVerificacion(v(true, ['d'], ['a']))).toBe('con_diferencias');
    expect(resultadoVerificacion(v(false))).toBe('con_diferencias');
  });
  it('parsea la respuesta de fn_verificar_cierre sin inventar', () => {
    expect(parsearVerificacion({ ok: true, defectos: ['x', 3], avisos: null })).toEqual({ ok: true, defectos: ['x'], avisos: [], verificadoEn: null });
    expect(parsearVerificacion(null).ok).toBe(false);
  });
});

describe('parsearResultado (fn_resultado_cierre, migración 26)', () => {
  it('solo renombra campos del camión; números de texto se leen tal cual', () => {
    const r = parsearResultado({
      camion: {
        cargas_l: '1350.00', entradas_l: 20, salidas_l: 300, faltante_salida_l: 0, faltante_llegada_l: 50, libro_l: 1120,
        consumo_plataforma_l: 1080, diferencia_l: 40, tolerancia_l: 20, no_imputable_l: 15, imputable_l: 25,
      },
      imputable_total_l: 25,
      pendientes: [{ codigo: 'justificacion', mensaje: 'Escribí la justificación' }],
      avisos: ['El corte de llegada declara 50 L de faltante'],
    });
    expect(r.versionCalculo).toBe(2);
    expect(r.camion.cargasL).toBe(1350);
    expect(r.camion.libroL).toBe(1120);
    expect(r.camion.diferenciaL).toBe(40);
    expect(r.camion.kmRecorridos).toBeNull();
    expect(r.imputableTotalL).toBe(25);
    expect(r.anterior).toBeNull();
    expect(r.pendientes).toEqual([{ codigo: 'justificacion', mensaje: 'Escribí la justificación' }]);
    expect(r.avisos).toEqual(['El corte de llegada declara 50 L de faltante']);
  });
  it('con JSON vacío no rompe', () => {
    const r = parsearResultado({});
    expect(r.camion.libroL).toBeNull();
    expect(r.pendientes).toEqual([]);
  });
});

describe('resultadoCongelado (columnas al aprobar)', () => {
  const base = {
    cargas_l: null, entradas_l: null, salidas_l: null, faltante_salida_l: null, faltante_llegada_l: null, libro_l: null,
    diferencia_l: null, tolerancia_l: null, consumo_plataforma_l: 830, fuente_consumo_plataforma: 'manual', km_recorridos: 2000,
    fuente_km: 'manual', consumo_l_100km: null, horas_motor: null, horas_ralenti: null, dias_parado: 0, tractor_no_imputable_l: 0,
    tractor_diferencia_l: null, mochila_diferencia_l: null, imputable_total_l: 30, linea_viaje: null, chofer_responsable_id: 1,
    carga_llegada_id: 2, detalle: { avisos: ['x'] }, calculado_en: null,
  };
  it('v2: el cálculo del camión', () => {
    const r = resultadoCongelado({ ...base, version_calculo: 2, libro_l: 1120, diferencia_l: 40, tolerancia_l: 20, imputable_total_l: 25 });
    expect(r.versionCalculo).toBe(2);
    expect(r.camion.libroL).toBe(1120);
    expect(r.camion.imputableL).toBe(25);
    expect(r.anterior).toBeNull();
    expect(r.avisos).toEqual(['x']);
  });
  it('v1: un cierre del modelo anterior muestra sus dos diferencias', () => {
    const r = resultadoCongelado({ ...base, version_calculo: 1, tractor_diferencia_l: 20, mochila_diferencia_l: 10 });
    expect(r.versionCalculo).toBe(1);
    expect(r.anterior).toEqual({ tractorDiferenciaL: 20, mochilaDiferenciaL: 10 });
  });
});

describe('hora local ⇄ ISO', () => {
  it('Argentina (UTC−3, sin horario de verano)', () => {
    expect(horaLocalAIso('2026-10-15T08:30', 'America/Argentina/Mendoza')).toBe('2026-10-15T11:30:00.000Z');
    expect(isoAHoraLocal('2026-10-15T11:30:00.000Z', 'America/Argentina/Mendoza')).toBe('2026-10-15T08:30');
  });
  it('Chile con horario de verano', () => {
    expect(horaLocalAIso('2026-01-10T12:00', 'America/Santiago')).toBe('2026-01-10T15:00:00.000Z');
    expect(horaLocalAIso('2026-07-10T12:00', 'America/Santiago')).toBe('2026-07-10T16:00:00.000Z');
  });
  it('valor inválido → null', () => {
    expect(horaLocalAIso('', 'America/Argentina/Mendoza')).toBeNull();
    expect(horaLocalAIso('15/10/2026 08:30', 'America/Argentina/Mendoza')).toBeNull();
  });
});

describe('formularios (solo forma)', () => {
  it('borrador: ida y vuelta con coma decimal', () => {
    const datos: DatosBorrador = {
      choferResponsableId: null, motivoChofer: null, programadorVelocidadPct: 87.5, testAlcohol: 'negativo', kmManual: null,
      consumoPlataformaManualL: null, motivoAjuste: null, noImputableL: 12.25, noImputableRalentiH: 0, noImputableMotivo: 'Derrame',
      justificacion: null, observaciones: null,
    };
    const f = aFormularioBorrador(datos);
    expect(f.programadorVelocidadPct).toBe('87,5');
    expect(borradorFormSchema.parse(f)).toEqual(datos);
  });
  it('rechazar una anulación pide motivo; aprobar no', () => {
    expect(resolverSolicitudSchema.safeParse({ solicitudId: 1, aprobar: false, motivo: '' }).success).toBe(false);
    expect(resolverSolicitudSchema.safeParse({ solicitudId: 1, aprobar: true, motivo: '' }).success).toBe(true);
  });
});

describe('movimientos del camión y faltante (solo forma)', () => {
  it('lista de movimientos ⇄ URL', () => {
    const p = parsearListaMovimientos(new URLSearchParams('camion=3&tipo=descarga_base&pagina=2'));
    expect(p).toEqual({ pagina: 2, camionId: 3, tipo: 'descarga_base' });
    expect(parsearListaMovimientos(new URLSearchParams(serializarListaMovimientos(p)))).toEqual(p);
    expect(parsearListaMovimientos({ tipo: 'ajuste' }).tipo).toBeUndefined();
  });
  it('formulario de movimiento: litros positivos y coma decimal', () => {
    const base = { clase: 'descarga_base', camionId: '1', fechaHoraLocal: '2026-10-16T08:00', depositoBaseId: '4', camionDestinoId: '',
      categoria: '', choferId: '', motivo: '', evidencia: '' };
    expect(movimientoFormSchema.parse({ ...base, litros: '200,5' }).litros).toBe(200.5);
    expect(movimientoFormSchema.safeParse({ ...base, litros: '0' }).success).toBe(false);
  });
  it('movimiento con motivo: categoría del catálogo y motivo obligatorio', () => {
    const d = { camionId: 1, litros: 30, fechaHora: '2026-10-16T11:00:00Z', evidencia: null, choferId: null };
    expect(movimientoConMotivoSchema.safeParse({ ...d, categoria: 'derrame', motivo: 'en ruta' }).success).toBe(true);
    expect(movimientoConMotivoSchema.safeParse({ ...d, categoria: 'derrame', motivo: '' }).success).toBe(false);
    expect(movimientoConMotivoSchema.safeParse({ ...d, categoria: 'compra_granel', motivo: 'x' }).success).toBe(false);
  });
  it('carga: el faltante vacío es 0', () => {
    const f = { camionId: '1', choferId: '', estacionId: '2', fechaHoraLocal: '2026-10-16T08:00', litros: '450', precioUnitario: '1',
      moneda: 'ARS', importeOriginal: '450', medioPago: 'tarjeta', odometroKm: '', tanqueLleno: true, esFrontera: true,
      faltanteObservacion: '' };
    expect(cargaFormSchema.parse({ ...f, faltanteLlenoL: '' }).faltanteLlenoL).toBe(0);
    expect(cargaFormSchema.parse({ ...f, faltanteLlenoL: '50' }).faltanteLlenoL).toBe(50);
  });
});

describe('Eliminar carga (migración 44)', () => {
  it('pide la carga y el motivo', async () => {
    const { eliminarCargaSchema } = await import('@/modules/combustible/domain/carga.schemas');
    expect(eliminarCargaSchema.safeParse({ cargaId: 5, motivo: 'Cargada dos veces' }).success).toBe(true);
    expect(eliminarCargaSchema.safeParse({ cargaId: 5, motivo: '  ' }).success).toBe(false);
  });
});

describe('Cargas más simples (migración 47)', () => {
  it('editar: mismos datos que el alta, sin camión; con versión', async () => {
    const { cargaEdicionSchema } = await import('@/modules/combustible/domain/carga.schemas');
    const d = cargaEdicionSchema.parse({
      cargaId: 31, versionFila: 2, choferId: null, estacionId: 2, fechaHora: '2026-10-19T12:00:00.000Z', litros: 450, precioUnitario: 1.2,
      moneda: 'CLP', medioPago: 'tarjeta', odometroKm: 123456, tanqueLleno: true, esFrontera: true, faltanteLlenoL: 0, faltanteObservacion: null, motivo: null,
    });
    expect(d).toMatchObject({ cargaId: 31, esFrontera: true });
    expect('camionId' in d).toBe(false);
  });

  it('ticket: la foto es opcional', async () => {
    const { documentoSchema } = await import('@/modules/combustible/domain/documento.schemas');
    expect(documentoSchema.safeParse({ cargaId: 1, tipo: 'ticket', numero: '0045-1', fecha: '2026-10-19', archivo: null, hash: null, emisorId: null }).success).toBe(true);
    expect(documentoSchema.safeParse({ cargaId: 1, tipo: 'ticket', numero: '', fecha: '2026-10-19', archivo: null, hash: null, emisorId: null }).success).toBe(false);
  });
});

describe('Combustible de los gensets (migración 48)', () => {
  it('vuelta: traduce el cálculo de la base sin calcular', async () => {
    const { parsearVuelta } = await import('@/modules/combustible/domain/genset.types');
    const v = parsearVuelta({
      inicio: { id: 7, fecha_hora: '2026-10-10T12:00:00Z', litros: 200, horometro_h: 1000, chofer_id: 3, chofer: 'Pérez, Juan' },
      fin: { id: 9, tipo: 'descarga', fecha_hora: '2026-10-15T12:00:00Z', litros: 250, horometro_h: 1080 },
      situacion: 'por_cerrar', horas: 80, cargado_l: 0, descargado_l: 250, consumo_real_l: 150, consumo_esperado_l: 90, diferencia_l: 60,
      tolerancia_l: 10, dentro_tolerancia: false, descuento_l: 60, precio_litro: 1200, moneda: 'CLP', descuento_importe: 72000,
      chofer_propuesto_id: 3, cierre: null, pendientes: [], avisos: ['Exceso de consumo'],
    });
    expect(v).toMatchObject({ inicioId: 7, situacion: 'por_cerrar', descuentoL: 60, descuentoImporte: 72000, fin: { tipo: 'descarga' } });
  });

  it('registro: chofer y horómetro como texto del formulario', async () => {
    const { registroGensetFormSchema } = await import('@/modules/combustible/domain/genset.schemas');
    const r = registroGensetFormSchema.parse({
      gensetId: '4', tipo: 'carga', fechaHoraLocal: '2026-10-19T10:30', litros: '180,5', horometroH: '12345,6', tanqueLleno: true, vacio: false,
      choferId: '3', camionId: '', estacionId: '2', precioUnitario: '1250', moneda: 'CLP', ticketNumero: '', depositoId: '', observacion: '',
    });
    expect(r).toMatchObject({ gensetId: 4, litros: 180.5, horometroH: 12345.6, choferId: 3, camionId: null, ticketNumero: null });
  });
});

describe('acta del cierre (migración 56)', () => {
  it('lee los datos del acta tal como los arma la base', async () => {
    const { parsearActa } = await import('@/modules/combustible/domain/acta.types');
    const a = parsearActa({
      capacidad_l: 1000,
      salida: { fecha_hora: '2026-10-15T15:11:00Z', estacion: 'Copec', litros: 400, faltante_lleno_l: 50, inicio_l: 950 },
      cargas: [{ fecha_hora: '2026-10-16T20:11:00Z', estacion: 'Copec', litros: 500, es_frontera: false, tanque_lleno: false }],
      ralenti: { litros: 18, horas: 3.6, fuente: 'telemetria' },
      km: 1440, diferencia_l: 132, a_descontar_l: 132, alertas: [],
    });
    expect(a.salida.inicioL).toBe(950);
    expect(a.salida.faltanteL).toBe(50);
    expect(a.cargas).toHaveLength(1);
    expect(a.ralenti.litros).toBe(18);
    expect(a.aDescontarL).toBe(132);
  });

  it('un acta sin telemetría no rompe', async () => {
    const { parsearActa } = await import('@/modules/combustible/domain/acta.types');
    const a = parsearActa({});
    expect(a.km).toBeNull();
    expect(a.ralenti.litros).toBeNull();
    expect(a.cargas).toEqual([]);
    expect(a.objetivo).toBeNull();
  });

  it('lee el consumo objetivo del viaje (migración 75)', async () => {
    const { parsearActa } = await import('@/modules/combustible/domain/acta.types');
    const a = parsearActa({
      l_100km_motor: 40.12,
      objetivo: {
        l_100km: 30.33, debio_l: 910, km: 3000, km_vacio_sin_registrar: 600, vacio_l_100km: 28,
        tramos: [{ linea: 'SAI-BSAS', operacion: 12, vacio: false, km: 1400, objetivo_l_100km: 33 }],
        sin_objetivo: ['MZA-VALP'],
      },
    });
    expect(a.l100kmMotor).toBe(40.12);
    expect(a.objetivo?.debioL).toBe(910);
    expect(a.objetivo?.kmVacioSinRegistrar).toBe(600);
    expect(a.objetivo?.tramos[0]).toEqual({ linea: 'SAI-BSAS', operacion: '12', vacio: false, km: 1400, objetivo: 33 });
    expect(a.objetivo?.sinObjetivo).toEqual(['MZA-VALP']);
  });
});
