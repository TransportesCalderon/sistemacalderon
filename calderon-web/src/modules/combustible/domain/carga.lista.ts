import { FECHA_DIA, idDe, leerParam, paginaDe, type EntradaUrl } from './comun';
import { esSituacionCarga, type CargaListaParams } from './carga.types';

/** Parámetros de la lista de cargas ⇄ URL (misma función en servidor y navegador). */
export function parsearListaCargas(e: EntradaUrl): CargaListaParams {
  const p: CargaListaParams = { pagina: paginaDe(e) };
  const camion = idDe(e, 'camion');
  if (camion) p.camionId = camion;
  const desde = leerParam(e, 'desde');
  if (desde && FECHA_DIA.test(desde)) p.desde = desde;
  const hasta = leerParam(e, 'hasta');
  if (hasta && FECHA_DIA.test(hasta)) p.hasta = hasta;
  if (leerParam(e, 'fronteras') === '1') p.soloFronteras = true;
  const situacion = leerParam(e, 'situacion');
  if (esSituacionCarga(situacion)) p.situacion = situacion;
  return p;
}

export function serializarListaCargas(p: CargaListaParams): string {
  const u = new URLSearchParams();
  if (p.camionId !== undefined) u.set('camion', String(p.camionId));
  if (p.desde) u.set('desde', p.desde);
  if (p.hasta) u.set('hasta', p.hasta);
  if (p.soloFronteras) u.set('fronteras', '1');
  if (p.situacion) u.set('situacion', p.situacion);
  if (p.pagina > 1) u.set('pagina', String(p.pagina));
  return u.toString();
}
