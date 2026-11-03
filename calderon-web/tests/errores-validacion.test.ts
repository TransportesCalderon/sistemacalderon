import { describe, expect, it } from 'vitest';

import { traducirErrorDb } from '@/server/errors/traducir';

// Las funciones de la base avisan con 22023 / 23502 / 54000 y un mensaje para el usuario:
// la web lo muestra tal cual (antes salía «Ocurrió un error inesperado»).
describe('errores de validación de la base', () => {
  it('22023: muestra el mensaje de la base (ej. giro muy largo)', () => {
    const m = 'El giro puede tener hasta 40 letras (el SII no acepta más)';
    expect(traducirErrorDb({ code: '22023', message: m })).toEqual({ codigo: 'validacion', mensaje: m });
  });
  it('23502 y 54000 también muestran el mensaje de la base', () => {
    expect(traducirErrorDb({ code: '23502', message: 'No se sabe quién manejó: elegí el chofer' }).mensaje).toBe(
      'No se sabe quién manejó: elegí el chofer',
    );
    expect(traducirErrorDb({ code: '54000', message: 'Llegaste al tope de preguntas de hoy' }).mensaje).toBe(
      'Llegaste al tope de preguntas de hoy',
    );
  });
  it('un mensaje técnico no se muestra', () => {
    expect(traducirErrorDb({ code: '23502', message: 'null value in column "x" violates not-null constraint' }).mensaje).toBe('Revisá los datos.');
  });
});
