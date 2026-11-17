import { describe, expect, it } from 'vitest';
import { faltaEn, parsearOperacionesIncompletas, resumenIncompletas } from '@/modules/hoy/operaciones-incompletas';

describe('Operaciones sin cliente o sin precio', () => {
  it('lee lo que devuelve la base', () => {
    const d = parsearOperacionesIncompletas({
      alcance: 'todas',
      plazo_gerencia_dias: 3,
      total: 2,
      sin_cliente: 1,
      sin_precio: 2,
      vencidas: 1,
      operaciones: [
        { servicio_id: 8, numero: '6262', estado: 'entregado', falta_cliente: true, falta_precio: true, cliente: 'SIN CLIENTE (ZZ)', linea: 'ZZ-ZZ', dias: 5, vencida: true, cargada_por: 'ZZ Uno' },
        { servicio_id: 9, numero: 6287, estado: 'en_curso', falta_cliente: false, falta_precio: true, cliente: 'ZZ SA', dias: 0, vencida: false },
        { servicio_id: 10 },
      ],
    });
    expect(d.operaciones.length).toBe(2);
    expect(d.operaciones[1]?.numero).toBe('6287');
    expect(faltaEn(d.operaciones[0]!)).toBe('Faltan el cliente y el precio');
    expect(faltaEn(d.operaciones[1]!)).toBe('Falta el precio');
    expect(resumenIncompletas(d)).toBe('2 operaciones sin precio y 1 sin cliente');
  });

  it('arma el resumen en singular, solo con lo que falta, y sin datos no hay aviso', () => {
    expect(resumenIncompletas({ sinCliente: 0, sinPrecio: 1 })).toBe('1 operación sin precio');
    expect(resumenIncompletas({ sinCliente: 3, sinPrecio: 0 })).toBe('3 operaciones sin cliente');
    const d = parsearOperacionesIncompletas(null);
    expect(d.alcance).toBe('nada');
    expect(d.total).toBe(0);
  });
});
