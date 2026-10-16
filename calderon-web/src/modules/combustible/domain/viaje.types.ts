import type { CamionId, CargaId, CierreViajeId, FechaISO } from '@/shared/types/dominio';
import { esDe, idDe, leerParam, paginaDe, type EntradaUrl } from './comun';

/**
 * Viajes = tramos entre dos fronteras consecutivas del camión. Fuente única: la vista
 * fue.v_viaje (migración 24); el navegador no recalcula límites ni situación.
 * Un cierre anulado libera su viaje: la vista lo vuelve a mostrar "sin cierre".
 */
export const SITUACIONES_VIAJE = ['en_curso', 'sin_cierre', 'borrador', 'aprobado', 'cierre_desactualizado'] as const;
export type SituacionViaje = (typeof SITUACIONES_VIAJE)[number];
export const esSituacionViaje = esDe(SITUACIONES_VIAJE);
export const ETIQUETA_SITUACION_VIAJE: Record<SituacionViaje, string> = {
  en_curso: 'En curso',
  sin_cierre: 'Sin cierre',
  borrador: 'Borrador',
  aprobado: 'Aprobado',
  cierre_desactualizado: 'Desactualizado',
};

export interface Viaje {
  camionId: CamionId;
  patente: string;
  cargaSalidaId: CargaId;
  salidaTs: FechaISO;
  cargaLlegadaId: CargaId | null;
  llegadaTs: FechaISO | null;
  cierreId: CierreViajeId | null;
  cierreNumero: string | null;
  situacion: SituacionViaje;
}

export interface ViajeListaParams {
  camionId?: number;
  situacion?: SituacionViaje;
  pagina: number;
}

export const TAMANO_PAGINA_VIAJES = 50;

export function parsearListaViajes(e: EntradaUrl): ViajeListaParams {
  const p: ViajeListaParams = { pagina: paginaDe(e) };
  const camion = idDe(e, 'camion');
  if (camion) p.camionId = camion;
  const situacion = leerParam(e, 'situacion');
  if (esSituacionViaje(situacion)) p.situacion = situacion;
  return p;
}

export function serializarListaViajes(p: ViajeListaParams): string {
  const u = new URLSearchParams();
  if (p.camionId !== undefined) u.set('camion', String(p.camionId));
  if (p.situacion) u.set('situacion', p.situacion);
  if (p.pagina > 1) u.set('pagina', String(p.pagina));
  return u.toString();
}
