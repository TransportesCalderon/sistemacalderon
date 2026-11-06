import { describe, expect, it } from 'vitest';
import { parsearEsperas, parsearSegundoNivel } from '@/modules/combustible/domain/segundo-nivel.types';

describe('migración 200 · cierre: segunda aprobación si se descuenta menos que la diferencia', () => {
  it('la base dice si hace falta y en qué paso está; la web lo muestra', () => {
    expect(parsearSegundoNivel({ diferencia_l: 50, a_descontar_l: 0, requiere: true, primera_por: 'Maxi', primera_vigente: true })).toMatchObject({
      requiere: true,
      primeraPor: 'Maxi',
      primeraVigente: true,
      segundaPor: null,
    });
    expect(parsearSegundoNivel(null)).toBeNull();
  });

  it('lo que espera al gerente: cierres y pedidos de quitar descuento', () => {
    const [a, b] = parsearEsperas([
      { tipo: 'cierre', cierre_id: 1, numero: 'CV-000014', patente: 'SXXV29', diferencia_l: 144, a_descontar_l: 100, primera_por: 'Maxi' },
      { tipo: 'quitar_descuento', cierre_id: 2, numero: 'CV-000015', quitar_l: 144 },
    ]);
    expect(a).toMatchObject({ tipo: 'cierre', aDescontarL: 100, diferenciaL: 144 });
    expect(b).toMatchObject({ tipo: 'quitar_descuento', quitarL: 144 });
  });
});
