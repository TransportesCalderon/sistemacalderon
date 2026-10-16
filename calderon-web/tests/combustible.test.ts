import { describe, expect, it } from 'vitest';
import { parsearListaCargas, serializarListaCargas } from '@/modules/combustible/domain/carga.lista';
import { resolverSolicitudSchema } from '@/modules/combustible/domain/carga.schemas';
import { parsearResultado, parsearVerificacion } from '@/modules/combustible/domain/cierre.resultado';
import { aFormularioBorrador, borradorFormSchema } from '@/modules/combustible/domain/cierre.schemas';
import { parsearListaCierres, resultadoVerificacion, serializarListaCierres, type DatosBorrador } from '@/modules/combustible/domain/cierre.types';
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

describe('parsearResultado (fn_resultado_cierre)', () => {
  it('solo renombra campos; números de texto se leen tal cual', () => {
    const r = parsearResultado({
      tractor: { consumo_llenado_l: '412.50', consumo_plataforma_l: 400, diferencia_l: 12.5, tolerancia_l: 10, imputable_l: 2.5 },
      usa_mochila: true,
      mochila: { deposito_id: 4, codigo: 'MOC-01', teorico_l: 300, fisico_l: 295, diferencia_l: 5, tolerancia_l: 10, control_llegada: { id: 9, litros: 295, fuente: 'medicion' } },
      imputable_total_l: 2.5,
      pendientes: [{ codigo: 'falta_control', mensaje: 'Falta el control de llegada' }],
      avisos: ['Viaje largo'],
    });
    expect(r.tractor.consumoLlenadoL).toBe(412.5);
    expect(r.tractor.diferenciaL).toBe(12.5);
    expect(r.tractor.kmRecorridos).toBeNull();
    expect(r.mochila?.depositoCodigo).toBe('MOC-01');
    expect(r.mochila?.controlLlegada).toEqual({ id: 9, litros: 295, fuente: 'medicion' });
    expect(r.pendientes).toEqual([{ codigo: 'falta_control', mensaje: 'Falta el control de llegada' }]);
    expect(r.avisos).toEqual(['Viaje largo']);
  });
  it('sin mochila y con JSON vacío no rompe', () => {
    const r = parsearResultado({});
    expect(r.mochila).toBeNull();
    expect(r.usaMochila).toBeNull();
    expect(r.pendientes).toEqual([]);
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
      consumoPlataformaManualL: null, motivoAjuste: null, tractorNoImputableL: 0, tractorNoImputableRalentiH: 0, tractorNoImputableMotivo: null,
      tractorJustificacion: null, mochilaNoImputableL: 12.25, mochilaNoImputableMotivo: 'Derrame', mochilaJustificacion: null, observaciones: null,
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
