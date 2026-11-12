import { describe, expect, it } from 'vitest';
import { parsearDetalle, parsearPreparado, parsearSolicitudes } from '@/modules/combustible/domain/orden-carga.types';
import { parsearPedidos, parsearViajesEnCurso } from '@/modules/telemetria/domain/seguimiento.types';

describe('migración 259 · solicitud de carga desde Seguimiento de viaje', () => {
  it('Órdenes de carga lee las solicitudes pendientes con lo que se pidió', () => {
    const [s] = parsearSolicitudes([
      {
        id: 7, en: '2026-11-12T10:00:00Z', por: 'ZZ Telemetría', viaje: 'VC-000010', camion_id: 3, patente: 'ZZ001TT', chofer_id: 4, chofer: 'Prueba, Uno',
        estacion_id: 5, estacion: 'ZZ YPF', correo: 'zz@zz.invalid', litros: 400, observacion: 'ZZ',
        detalle: { destino: 'tanques_mochila', tanques: { modo: 'lleno' }, mochila: { modo: 'litros', litros: 300, capacidad_l: 700 } },
        a_cargar: 'Tanques: llenos · Mochila: 300 L',
      },
    ]);
    expect(s).toMatchObject({ id: 7, camionId: 3, estacionId: 5, litros: 400, aCargar: 'Tanques: llenos · Mochila: 300 L' });
    expect(s?.detalle).toEqual({ destino: 'tanques_mochila', tanques: { modo: 'lleno', litros: null }, mochila: { modo: 'litros', litros: 300 } });
    expect(parsearDetalle({ destino: 'tanques', tanques: { modo: 'litros', litros: 150 } })).toEqual({ destino: 'tanques', tanques: { modo: 'litros', litros: 150 } });
    expect(parsearDetalle(null)).toBeNull();
  });

  it('el formulario avisa si el camión ya tiene una solicitud pendiente', () => {
    expect(parsearPreparado({ patente: 'ZZ001TT', pendiente: { id: 7, por: 'ZZ', en: '2026-11-12T10:00:00Z' } }).pendiente).toMatchObject({ id: 7, por: 'ZZ' });
    expect(parsearPreparado({ patente: 'ZZ001TT' }).pendiente).toBeNull();
  });

  it('Seguimiento muestra el estado: pendiente, aprobada con la orden o rechazada con el motivo', () => {
    const p = parsearPedidos([
      { id: 1, via: 'sistema', estado: 'aprobada', orden: 'OC-000123', litros: 400 },
      { id: 2, via: 'sistema', estado: 'rechazada', motivo_rechazo: 'Carga en la próxima', litros: 300 },
      { id: 3, litros: 200, mensaje: 'x' },
    ]);
    expect(p.map((x) => [x.via, x.estado])).toEqual([['sistema', 'aprobada'], ['sistema', 'rechazada'], ['mensaje', null]]);
    expect(p[0]?.orden).toBe('OC-000123');
    expect(p[1]?.motivoRechazo).toBe('Carga en la próxima');
    const [v] = parsearViajesEnCurso([{ viaje_id: 9, patente: 'ZZ001TT', evaluacion: {}, solicitud_carga: { estado: 'pendiente', en: '2026-11-12T10:00:00Z' } }]);
    expect(v?.solicitudCarga).toMatchObject({ estado: 'pendiente', orden: null });
    expect(parsearViajesEnCurso([{ viaje_id: 9, patente: 'ZZ001TT', evaluacion: {} }])[0]?.solicitudCarga).toBeNull();
  });
});
