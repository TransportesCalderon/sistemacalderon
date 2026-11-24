import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { numeroInsignia, parsearNotificaciones, textoPendientes, urlInterna, VERSION_NOTIFICACIONES } from '@/modules/core/push/notificaciones';
import { OBJETOS } from '@/shared/query/invalidar';

/** Migración 306 · Las notificaciones del teléfono quedan pendientes hasta que se abren; el ícono muestra cuántas hay. */
describe('notificaciones sin revisar', () => {
  it('lee las pendientes de la base, la más nueva primero', () => {
    const d = parsearNotificaciones({
      pendientes: 2,
      lista: [
        { id: 59, titulo: 'Carga autorizada · SHXB49', cuerpo: 'Cargá en Shell Lo Espejo', url: '/mi-viaje', urgente: false, creado_en: '2026-11-24T20:30:00Z' },
        { id: 57, titulo: 'Camión fuera de la ruta', cuerpo: '', url: '/pizarra/rutas', urgente: true, creado_en: '2026-11-24T20:10:00Z' },
      ],
    });
    expect(d.pendientes).toBe(2);
    expect(d.lista[0]).toEqual({ id: 59, titulo: 'Carga autorizada · SHXB49', cuerpo: 'Cargá en Shell Lo Espejo', url: '/mi-viaje', urgente: false, creadaEn: '2026-11-24T20:30:00Z' });
    expect(d.lista[1]).toMatchObject({ cuerpo: null, urgente: true });
  });

  it('sin datos no se rompe', () => {
    expect(parsearNotificaciones(null)).toEqual({ pendientes: 0, lista: [] });
    expect(parsearNotificaciones({ pendientes: '3', lista: [{ id: 0 }] })).toEqual({ pendientes: 3, lista: [] });
  });

  it('solo lleva a pantallas del sistema', () => {
    expect(urlInterna('/combustible/cargas?vista=ordenes')).toBe('/combustible/cargas?vista=ordenes');
    expect(urlInterna('https://otro.sitio/x')).toBe('/');
    expect(urlInterna('//otro.sitio')).toBe('/');
    expect(urlInterna(null)).toBe('/');
  });

  it('el número rojo y el texto', () => {
    expect(numeroInsignia(1)).toBe('1');
    expect(numeroInsignia(2)).toBe('2');
    expect(numeroInsignia(150)).toBe('99+');
    expect(textoPendientes(1)).toBe('1 notificación sin revisar');
    expect(textoPendientes(2)).toBe('2 notificaciones sin revisar');
  });

  it('al abrir una se recarga la lista', () => {
    expect(OBJETOS.notificacion).toEqual([['usuarios', 'notificaciones']]);
    expect(VERSION_NOTIFICACIONES).toBe(306);
  });

  it('el service worker pone el número en el ícono y marca la vista al tocarla', () => {
    const sw = readFileSync(join(__dirname, '../public/sw.js'), 'utf8');
    expect(sw).toContain('setAppBadge');
    expect(sw).toContain('/api/notificaciones/vista');
    expect(sw).toContain('d.pendientes');
  });
});
