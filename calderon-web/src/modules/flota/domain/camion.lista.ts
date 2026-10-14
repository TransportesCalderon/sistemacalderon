import {
  ORDENES_CAMION,
  esEstadoCamion,
  esPropietarioCamion,
  type CamionListaParams,
  type CampoOrdenCamion,
} from './camion.types';

/**
 * Parámetros de la lista de camiones ⇄ URL (?q=&estado=&…). El servidor y el navegador
 * usan esta misma función, así la clave de React Query precargada coincide con la del
 * cliente y la lista se hidrata sin una segunda consulta.
 */
type Entrada = URLSearchParams | Record<string, string | string[] | undefined>;

function leer(e: Entrada, clave: string): string | undefined {
  if (e instanceof URLSearchParams) return e.get(clave) ?? undefined;
  const v = e[clave];
  return Array.isArray(v) ? v[0] : v;
}

export const LISTA_CAMIONES_DEFECTO: CamionListaParams = { orden: 'codigo_interno', dir: 'asc', pagina: 1 };

export function parsearListaCamiones(e: Entrada): CamionListaParams {
  const p: CamionListaParams = { ...LISTA_CAMIONES_DEFECTO };

  const texto = leer(e, 'q')?.trim();
  if (texto) p.texto = texto.slice(0, 60);

  const estado = leer(e, 'estado');
  if (esEstadoCamion(estado)) p.estado = estado;

  const propietario = leer(e, 'propietario');
  if (esPropietarioCamion(propietario)) p.propietario = propietario;

  const pais = leer(e, 'pais');
  if (pais && /^[A-Z]{2}$/.test(pais)) p.pais = pais;

  const tipo = leer(e, 'combustible');
  if (tipo && /^\d{1,5}$/.test(tipo)) p.tipoCombustibleId = Number(tipo);

  if (leer(e, 'eliminados') === '1') p.incluirEliminados = true;

  const orden = leer(e, 'orden');
  if (orden && (ORDENES_CAMION as readonly string[]).includes(orden)) p.orden = orden as CampoOrdenCamion;

  if (leer(e, 'dir') === 'desc') p.dir = 'desc';

  const pagina = Number(leer(e, 'pagina'));
  if (Number.isInteger(pagina) && pagina > 1 && pagina < 10_000) p.pagina = pagina;

  return p;
}

/** Inversa de parsearListaCamiones: omite los valores por defecto para dejar URLs cortas. */
export function serializarListaCamiones(p: CamionListaParams): string {
  const u = new URLSearchParams();
  if (p.texto) u.set('q', p.texto);
  if (p.estado) u.set('estado', p.estado);
  if (p.propietario) u.set('propietario', p.propietario);
  if (p.pais) u.set('pais', p.pais);
  if (p.tipoCombustibleId !== undefined) u.set('combustible', String(p.tipoCombustibleId));
  if (p.incluirEliminados) u.set('eliminados', '1');
  if (p.orden !== LISTA_CAMIONES_DEFECTO.orden) u.set('orden', p.orden);
  if (p.dir !== LISTA_CAMIONES_DEFECTO.dir) u.set('dir', p.dir);
  if (p.pagina > 1) u.set('pagina', String(p.pagina));
  return u.toString();
}
