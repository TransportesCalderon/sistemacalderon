import type { Json } from '@/shared/types/db';
import type { FechaISO } from '@/shared/types/dominio';
import { esPasoOperacion, type PasoOperacion } from '@/modules/logistica/domain/operacion.types';
import { esSituacionTractor, type SituacionTractor } from '@/modules/logistica/domain/viaje-chofer.types';

/**
 * Sprint 6 · «Lo que sigue» de cada fila de la Pizarra (ops.fn_pizarra_sigue, migración 118).
 * La base dice el paso que sigue, los posibles, la situación del tractor y si hay un tramo
 * para continuar; la web solo arma los botones con eso y llama a las acciones de siempre.
 */
export const VERSION_SIGUE = 118;

export interface SigueFila {
  semiId: number;
  servicioId: number | null;
  numeroOperacion: number | null;
  siguiente: PasoOperacion | null;
  posibles: PasoOperacion[];
  puedeVolver: boolean;
  camionId: number | null;
  situacionTractor: SituacionTractor | null;
  choferFijo: string | null;
  viajeId: number | null;
  viajeNumero: string | null;
  /** La carga a tanque lleno con la que saldría el viaje del chofer (null: no hay). */
  cargaSalida: FechaISO | null;
  itemId: number | null;
  /** «Continúa a…»: el tramo que falta de la operación en el viaje del chofer. */
  continua: { hasta: string; linea: string | null } | null;
}

type Crudo = {
  semi_id: number;
  servicio_id: number | null;
  numero_operacion: number | null;
  siguiente: string | null;
  posibles: string[] | null;
  puede_volver: boolean | null;
  camion_id: number | null;
  situacion_tractor: string | null;
  chofer_fijo: string | null;
  viaje_id: number | null;
  viaje_numero: string | null;
  carga_salida_ts: string | null;
  item_id: number | null;
  continua: Json | null;
};

function continua(j: Json | null): SigueFila['continua'] {
  if (!j || typeof j !== 'object' || Array.isArray(j)) return null;
  const hasta = j.hasta;
  if (typeof hasta !== 'string') return null;
  return { hasta, linea: typeof j.linea === 'string' ? j.linea : null };
}

export function parsearSigue(filas: readonly Crudo[] | null | undefined): Map<number, SigueFila> {
  const m = new Map<number, SigueFila>();
  for (const f of filas ?? []) {
    m.set(f.semi_id, {
      semiId: f.semi_id,
      servicioId: f.servicio_id,
      numeroOperacion: f.numero_operacion,
      siguiente: f.siguiente && esPasoOperacion(f.siguiente) ? f.siguiente : null,
      posibles: (f.posibles ?? []).filter(esPasoOperacion),
      puedeVolver: !!f.puede_volver,
      camionId: f.camion_id,
      situacionTractor: esSituacionTractor(f.situacion_tractor) ? f.situacion_tractor : null,
      choferFijo: f.chofer_fijo,
      viajeId: f.viaje_id,
      viajeNumero: f.viaje_numero,
      cargaSalida: f.carga_salida_ts as FechaISO | null,
      itemId: f.item_id,
      continua: f.item_id ? continua(f.continua) : null,
    });
  }
  return m;
}

/**
 * Pasos que se hacen desde la fila. «Asignar equipo» y «Confirmar» se hacen en Operaciones (la fila ya tiene equipo);
 * también el cambio de tractor en la base (migración 125), que pide la base o el tractor y el chofer.
 */
const EN_LA_FILA = (p: PasoOperacion) => p !== 'equipo' && p !== 'confirmar' && p !== 'en_base' && p !== 'seguir';

/** Los botones de la fila: el principal es el que la base marcó como «siguiente»; los otros van en «Más». */
export function botonesPaso(s: SigueFila): { principal: PasoOperacion | null; otros: PasoOperacion[] } {
  if (!s.servicioId) return { principal: null, otros: [] };
  const principal = s.siguiente && EN_LA_FILA(s.siguiente) ? s.siguiente : null;
  return { principal, otros: s.posibles.filter((p) => EN_LA_FILA(p) && p !== principal) };
}

/** Se ofrece iniciar el viaje del chofer si el tractor no está en viaje ni en taller (la base valida el resto). */
export const puedeIniciarViaje = (s: SigueFila) =>
  s.camionId !== null && s.situacionTractor !== null && s.situacionTractor !== 'en_viaje' && s.situacionTractor !== 'taller';
