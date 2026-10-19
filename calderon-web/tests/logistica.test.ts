import { describe, expect, it } from 'vitest';
import { asignarViajeSchema, modificarViajeSchema, pasoSchema, vueltaVaciaSchema } from '@/modules/logistica/domain/viaje.schemas';

const base = {
  semiId: '1',
  camionId: '2',
  choferId: '3',
  origenId: '4',
  destinoId: '5',
  observacion: '',
  clienteId: '6',
  producto: ' Madera ',
  contenedor: '',
  taraMaxDias: '',
  fechaCarga: '2026-10-20T11:00:00.000Z',
  fechaDescarga: '',
};

describe('logística: formularios (solo forma)', () => {
  it('asignar: ids a número, vacíos a null', () => {
    const r = asignarViajeSchema.parse(base);
    expect(r).toMatchObject({ semiId: 1, clienteId: 6, producto: 'Madera', contenedor: null, taraMaxDias: null, fechaDescarga: null });
  });
  it('asignar exige semi, cliente y fecha de carga', () => {
    const r = asignarViajeSchema.safeParse({ ...base, semiId: '', clienteId: '', fechaCarga: '' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.map((i) => i.path[0]).sort()).toEqual(['clienteId', 'fechaCarga', 'semiId']);
  });
  it('modificar una vuelta vacía no exige cliente', () => {
    expect(modificarViajeSchema.safeParse({ ...base, tramoId: 9, clienteId: '' }).success).toBe(true);
  });
  it('vuelta vacía exige la salida', () => {
    expect(vueltaVaciaSchema.safeParse({ ...base, fecha: '' }).success).toBe(false);
  });
  it('paso: vacío = ahora y telemetría; odómetro con miles y coma', () => {
    expect(pasoSchema.parse({ tramoId: 1, paso: 'salir', momento: '', lugarId: '', odometroKm: '' })).toEqual({
      tramoId: 1,
      paso: 'salir',
      momento: null,
      lugarId: null,
      odometroKm: null,
    });
    expect(pasoSchema.parse({ tramoId: 1, paso: 'terminar_descarga', momento: '', lugarId: '', odometroKm: '100.420,5' }).odometroKm).toBe(
      100420.5,
    );
    expect(pasoSchema.safeParse({ tramoId: 1, paso: 'volar', momento: '', lugarId: '', odometroKm: '' }).success).toBe(false);
  });
});
