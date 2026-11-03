import { describe, expect, it } from 'vitest';
import { parsearGastosPorRevisar, parsearMiFondo } from '@/modules/chofer/domain/chofer.types';

describe('apelar un gasto rechazado (migración 164)', () => {
  it('el chofer ve si puede apelar y el estado de la apelación', () => {
    const f = parsearMiFondo({
      chofer_id: 1,
      movimientos: [
        { id: 1, tipo: 'gasto', estado: 'rechazado', motivo: 'ZZ borroso', puede_apelar: true },
        { id: 2, tipo: 'gasto', estado: 'apelado', apelacion: 'ZZ es el peaje', motivo_rechazo: 'ZZ borroso' },
        { id: 3, tipo: 'gasto', estado: 'rechazado', rechazo_definitivo: true, apelacion: 'ZZ tasa' },
      ],
    });
    expect(f.movimientos.map((m) => [m.estado, m.puedeApelar, m.rechazoDefinitivo])).toEqual([
      ['rechazado', true, false],
      ['apelado', false, false],
      ['rechazado', false, true],
    ]);
    expect(f.movimientos[1]?.apelacion).toBe('ZZ es el peaje');
  });

  it('Administración ve los apelados con la explicación y el motivo del rechazo', () => {
    const [g] = parsearGastosPorRevisar([{ id: 5, apelado: true, apelacion: 'ZZ es el peaje', motivo_rechazo: 'ZZ borroso' }]);
    expect(g).toMatchObject({ apelado: true, apelacion: 'ZZ es el peaje', motivoRechazo: 'ZZ borroso' });
  });
});
