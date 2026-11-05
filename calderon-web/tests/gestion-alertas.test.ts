import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { can, permisosDe } from '@/modules/core/permissions/resolver';
import { parsearAvisosEscalamiento, parsearGestiones, parsearResumenCargaImposible } from '@/modules/anomalias/domain/gestion.types';

const opciones = { gerenciaDetalleAlertas: 'agregado' as const };

describe('Fase 2 · alertas con responsable, vencimiento y escalamiento (migraciones 188 y 189)', () => {
  it('la bandeja trae responsable, vencida, días abierta y reasignaciones', () => {
    const [g] = parsearGestiones([
      { id: 7, responsable: 'Telemetría', responsable_rol: 'analista_control', vence_en: '2026-11-07T10:00:00Z', vencida: true, escalada: true, dias_abierta: 3, reasignaciones: 2, es_mia: true },
    ]);
    expect(g).toMatchObject({ id: 7, vencida: true, escalada: true, diasAbierta: 3, reasignaciones: 2, esMia: true, prorrogaPendiente: false });
  });

  it('la ventana de escalamiento llega con el historial (qué se hizo, qué falta) y el pedido de prórroga', () => {
    const [a] = parsearAvisosEscalamiento([
      {
        id: 9,
        motivo: 'prorroga',
        tipo: 'Carga imposible',
        gestion: {
          responsable: 'Administración de combustible',
          avances: [{ hecho: 'Pedí el ticket', falta: 'Hablar con la estación', usuario: 'Ana', en: '2026-11-05T10:00:00Z' }],
          prorroga: { id: 3, hasta: '2026-11-08T10:00:00Z', motivo: 'Espero el ticket', pedida_por: 'Ana', puedo_resolver: true },
        },
      },
    ]);
    expect(a?.motivo).toBe('prorroga');
    expect(a?.gestion.avances[0]?.falta).toBe('Hablar con la estación');
    expect(a?.gestion.prorroga?.puedoResolver).toBe(true);
  });

  it('el resumen de carga imposible mide falsos positivos', () => {
    const r = parsearResumenCargaImposible({ revisadas: 3, normales: 2, imposibles: 1, falsos_positivos: 1, pct_falsos_positivos: 100, sin_dato_motivos: { 'Falta telemetría': 2 } });
    expect(r).toMatchObject({ revisadas: 3, imposibles: 1, pctFalsosPositivos: 100 });
    expect(r.sinDatoMotivos).toEqual([{ motivo: 'Falta telemetría', cantidad: 2 }]);
  });

  it('Gerencia puede responder prórrogas desde la ventana aunque no vea la bandeja (la base decide quién)', () => {
    const acciones = readFileSync('src/modules/anomalias/actions/alerta.actions.ts', 'utf8');
    expect(acciones).toContain("'inicio.dashboard:ver'");
    expect(can(permisosDe(['gerencia'], opciones), 'inicio.dashboard:ver')).toBe(true);
    const layout = readFileSync('src/app/(app)/layout.tsx', 'utf8');
    expect(layout).toContain('<AvisosEscalamiento />');
  });
});
