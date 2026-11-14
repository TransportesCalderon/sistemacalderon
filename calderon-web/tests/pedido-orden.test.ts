import { describe, expect, it } from 'vitest';
import { compararLitros, parsearSolicitudes } from '@/modules/combustible/domain/orden-carga.types';
import { parsearPedidos } from '@/modules/telemetria/domain/seguimiento.types';

describe('migración 263 · pedido y orden de carga: recomendación, pedido y decisión', () => {
  it('dice cuánto se aparta un número de otro', () => {
    expect(compararLitros(400, 400)).toEqual({ diferencia: 0, texto: 'igual' });
    expect(compararLitros(520, 400)).toEqual({ diferencia: 120, texto: '120 L más' });
    expect(compararLitros(300, 400.4)).toEqual({ diferencia: -100, texto: '100 L menos' });
    expect(compararLitros(null, 400)).toBeNull();
    expect(compararLitros(400, null)).toBeNull();
  });

  it('la solicitud pendiente trae la recomendación del sistema junto al pedido', () => {
    const [s] = parsearSolicitudes([
      { id: 7, camion_id: 3, patente: 'ZZ001TT', litros: 450, a_cargar: 'Tanques: llenos', recomendado_l: 380, para_llegar_l: 380, para_llenar_l: 610 },
    ]);
    expect(s).toMatchObject({ litros: 450, recomendadoL: 380, paraLlegarL: 380, paraLlenarL: 610 });
    expect(compararLitros(s?.litros ?? null, s?.recomendadoL ?? null)?.texto).toBe('70 L más');
  });

  it('una solicitud anterior al cambio (sin recomendación guardada) no muestra nada de más', () => {
    const [s] = parsearSolicitudes([{ id: 8, camion_id: 3, patente: 'ZZ001TT', litros: 300 }]);
    expect(s).toMatchObject({ recomendadoL: null, paraLlegarL: null, paraLlenarL: null });
  });

  it('Seguimiento muestra lo recomendado y lo que decidió la orden', () => {
    const p = parsearPedidos([
      { id: 1, via: 'sistema', estado: 'aprobada', orden: 'OC-000123', litros: 400, a_cargar: 'Tanques: llenos', recomendado_l: 380,
        orden_a_cargar: 'Tanques: 300 L', orden_litros: 300, orden_con_cambios: true },
      { id: 2, via: 'sistema', estado: 'aprobada', orden: 'OC-000124', litros: 400, orden_a_cargar: 'Tanques: llenos', orden_con_cambios: false },
      { id: 3, via: 'sistema', estado: 'pendiente', litros: 200 },
    ]);
    expect(p[0]).toMatchObject({ recomendadoL: 380, ordenACargar: 'Tanques: 300 L', ordenLitros: 300, ordenConCambios: true });
    expect(p[1]).toMatchObject({ recomendadoL: null, ordenConCambios: false });
    expect(p[2]).toMatchObject({ recomendadoL: null, ordenACargar: null, ordenLitros: null, ordenConCambios: null });
  });
});
