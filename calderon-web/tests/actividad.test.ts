import { describe, expect, it } from 'vitest';
import { parsearActividad } from '@/modules/actividad/actividad';

describe('migración 235 · registro de actividad', () => {
  it('lee qué se hizo, cuándo, quién y adónde lleva', () => {
    const [a] = parsearActividad([
      { id: 7, en: '2026-11-09T12:48:00Z', usuario_id: 3, usuario: 'Brian Di Julio', tipo: 'Cierre de viaje', grupo: 'cierres', registro: 'CV-000012 · GCSC92', que: 'Borrador creado', ruta: '/combustible/cierres/12' },
    ]);
    expect(a).toMatchObject({ usuario: 'Brian Di Julio', que: 'Borrador creado', registro: 'CV-000012 · GCSC92', ruta: '/combustible/cierres/12', usuarioId: 3 });
    expect(parsearActividad([{ id: 1, usuario_id: null }])[0]).toMatchObject({ usuarioId: null, grupo: 'otros', ruta: null });
  });
});
