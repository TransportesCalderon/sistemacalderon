import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('migración 192 · TI restablece la contraseña', () => {
  it('Usuarios tiene «Contraseña» para TI con una provisoria al azar', () => {
    const ui = readFileSync('src/modules/usuarios/components/usuarios-pantalla.tsx', 'utf8');
    expect(ui).toContain('function FormClave');
    expect(ui).toContain('restablecerClave');
    const acciones = readFileSync('src/modules/usuarios/usuarios.actions.ts', 'utf8');
    expect(acciones).toMatch(/export const restablecerClave = createAction\(\{\s+permiso: 'configuracion\.usuarios:editar'/);
  });

  it('al entrar con la provisoria se pide elegir la propia, y al cambiarla se avisa a la base', () => {
    expect(readFileSync('src/app/(app)/layout.tsx', 'utf8')).toContain('<CambioClaveObligatorio />');
    expect(readFileSync('src/modules/core/auth/actions.ts', 'utf8')).toContain("rpc('fn_clave_cambiada')");
  });
});
