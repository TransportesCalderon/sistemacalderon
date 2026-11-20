import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { identidadDesdeClaims } from '@/modules/core/auth/claims';
import { ROLES_APP, ROLES_BD } from '@/modules/core/permissions/roles';
import {
  cargaUnidad,
  destinoDelCliente,
  horaCorta,
  leerSeguimiento,
  RUTA_CLIENTE,
  tienePosicion,
  tituloUnidad,
} from '@/modules/cliente/domain/seguimiento';

/** Migración 288 · Usuario de un cliente: solo ve el mapa con los camiones que llevan su carga. */
const SRC = join(__dirname, '../src');
const leer = (ruta: string) => readFileSync(join(SRC, ruta), 'utf8');

describe('usuario de un cliente (migración 288)', () => {
  it('el token con tc_cliente se reconoce, sin roles de la aplicación ni permisos', () => {
    expect(ROLES_BD).toContain('tc_cliente');
    expect(ROLES_APP as readonly string[]).not.toContain('cliente');
    const identidad = identidadDesdeClaims({ sub: 'x', usuario_id: 7, roles_app: ['cliente'], rol_bd: 'tc_cliente' });
    expect(identidad).toEqual({ usuarioId: 7, rolesApp: [], rolBd: 'tc_cliente', choferId: null });
  });

  it('solo entra a su seguimiento: todo lo demás lo manda ahí', () => {
    expect(destinoDelCliente('/seguimiento')).toBeNull();
    expect(destinoDelCliente('/sin-acceso')).toBeNull();
    for (const ruta of ['/', '/pizarra', '/telemetria/seguimiento', '/configuracion/usuarios', '/seguimientos', '/api/mail', '/mi-viaje']) {
      expect(destinoDelCliente(ruta), ruta).toBe(RUTA_CLIENTE);
    }
    // «¿Olvidaste tu contraseña?» vuelve a /perfil: el cliente la cambia en su pantalla
    expect(destinoDelCliente('/perfil')).toBe(`${RUTA_CLIENTE}?clave=1`);
  });

  it('lee lo que devuelve la base', () => {
    const s = leerSeguimiento({
      cliente: 'ZZ Cliente',
      consultado: '2026-11-20T18:00:00Z',
      unidades: [
        { id: 1, tractor: 'ZZ002BB', semi: 'ZZS002', chofer: 'Juan Pérez', contenedor: 'MSCU1234567', referencia: null, en_base: false, lugar: null, lat: -32.9, lng: -68.8, ts: '2026-11-20T17:55:00Z' },
        { id: 2, tractor: null, semi: 'ZZS001', chofer: null, contenedor: null, referencia: 'PO-881', en_base: true, lugar: 'ZZ Aduana Los Andes', lat: '-32.8', lng: '-70.1', ts: null },
        { id: 3, tractor: 'ZZ003CC', semi: null, chofer: 'Ana Gómez', contenedor: 'TGHU7654321', referencia: 'R-1', en_base: false, lugar: null, lat: null, lng: null, ts: null },
      ],
    });
    expect(s.cliente).toBe('ZZ Cliente');
    expect(s.unidades.map(tituloUnidad)).toEqual(['ZZ002BB', 'Semi ZZS001', 'ZZ003CC']);
    expect(s.unidades.map(tienePosicion)).toEqual([true, true, false]);
    expect(s.unidades[1]).toMatchObject({ enBase: true, lugar: 'ZZ Aduana Los Andes', lat: -32.8, lng: -70.1, chofer: null, tractor: null });
    expect(s.unidades.map(cargaUnidad)).toEqual(['Contenedor MSCU1234567', 'Ref. PO-881', 'Contenedor TGHU7654321 · Ref. R-1']);
    expect(horaCorta(s.consultado, 'America/Argentina/Mendoza')).toBe('15:00');
    expect(horaCorta(null, 'America/Argentina/Mendoza')).toBe('—');
  });

  it('sin respuesta o con datos raros no se rompe', () => {
    expect(leerSeguimiento(null)).toEqual({ cliente: null, consultado: null, unidades: [] });
    expect(leerSeguimiento({ unidades: 'x' }).unidades).toEqual([]);
    expect(leerSeguimiento({ unidades: [null, 3] }).unidades).toEqual([]);
  });

  it('la web del cliente solo llama a sus dos funciones de public: ninguna tabla ni otro esquema', () => {
    const codigo = leer('modules/cliente/repositories/cliente.repository.ts');
    expect([...codigo.matchAll(/\.rpc\('([a-z_]+)'/g)].map((m) => m[1]).sort()).toEqual(['fn_cliente_debo_cambiar_clave', 'fn_mapa_cliente']);
    expect([...codigo.matchAll(/\.schema\('([a-z_]+)'\)/g)].map((m) => m[1])).toEqual(['public', 'public']);
    expect(codigo).not.toMatch(/\.from\(/);
  });

  it('el middleware manda al cliente a su seguimiento antes que cualquier otra regla', () => {
    const m = leer('middleware.ts');
    const cliente = m.indexOf("identidad?.rolBd === 'tc_cliente'");
    expect(cliente).toBeGreaterThan(-1);
    expect(cliente).toBeLessThan(m.indexOf("pathname === '/' || esRutaSinPantalla(pathname)"));
  });

  it('su pantalla queda fuera de app/(app) (sin menú ni avisos) y no deja entrar a otros usuarios', () => {
    expect(existsSync(join(SRC, 'app/(cliente)/seguimiento/page.tsx'))).toBe(true);
    expect(existsSync(join(SRC, 'app/(app)/seguimiento'))).toBe(false);
    expect(leer('app/(cliente)/layout.tsx')).toMatch(/rolBd !== 'tc_cliente'\) redirect\('\/'\)/);
  });

  it('la sesión no le pide a la base nada más (ni versión, ni moneda, ni parámetros)', () => {
    const s = leer('modules/core/auth/session.ts');
    expect(s).toMatch(/identidad\?\.rolBd && !esCliente/);
    expect(s).toMatch(/identidad\.rolBd !== 'tc_chofer' && !esCliente/);
  });

  it('Usuarios: el usuario de un cliente se guarda con su función y no tiene las marcas internas', () => {
    const p = leer('modules/usuarios/components/usuarios-pantalla.tsx');
    expect(p).toMatch(/guardarUsuarioCliente\.mutateAsync|guardarCliente\.mutateAsync/);
    expect(p.match(/oculto=\{clienteDe\.has\(u\.id\)\}/g)?.length).toBe(7);
    expect(p).toMatch(/useBaseTiene\(288\)/);
  });
});
