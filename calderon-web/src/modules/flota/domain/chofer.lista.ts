import { ORDENES_CHOFER, esEstadoChofer, type CampoOrdenChofer, type ChoferListaParams } from './chofer.types';

/**
 * Parámetros de la lista de choferes ⇄ URL. Misma función en servidor y navegador,
 * así la clave de React Query precargada coincide con la del cliente.
 */
type Entrada = URLSearchParams | Record<string, string | string[] | undefined>;

function leer(e: Entrada, clave: string): string | undefined {
  if (e instanceof URLSearchParams) return e.get(clave) ?? undefined;
  const v = e[clave];
  return Array.isArray(v) ? v[0] : v;
}

export const LISTA_CHOFERES_DEFECTO: ChoferListaParams = { orden: 'apellido', dir: 'asc', pagina: 1 };

export function parsearListaChoferes(e: Entrada): ChoferListaParams {
  const p: ChoferListaParams = { ...LISTA_CHOFERES_DEFECTO };

  const texto = leer(e, 'q')?.trim();
  if (texto) p.texto = texto.slice(0, 60);

  const estado = leer(e, 'estado');
  if (esEstadoChofer(estado)) p.estado = estado;

  const pais = leer(e, 'pais');
  if (pais && /^[A-Z]{2}$/.test(pais)) p.pais = pais;

  const base = leer(e, 'base');
  if (base && /^\d{1,15}$/.test(base)) p.baseId = Number(base);

  if (leer(e, 'eliminados') === '1') p.incluirEliminados = true;

  const orden = leer(e, 'orden');
  if (orden && (ORDENES_CHOFER as readonly string[]).includes(orden)) p.orden = orden as CampoOrdenChofer;

  if (leer(e, 'dir') === 'desc') p.dir = 'desc';

  const pagina = Number(leer(e, 'pagina'));
  if (Number.isInteger(pagina) && pagina > 1 && pagina < 10_000) p.pagina = pagina;

  return p;
}

export function serializarListaChoferes(p: ChoferListaParams): string {
  const u = new URLSearchParams();
  if (p.texto) u.set('q', p.texto);
  if (p.estado) u.set('estado', p.estado);
  if (p.pais) u.set('pais', p.pais);
  if (p.baseId !== undefined) u.set('base', String(p.baseId));
  if (p.incluirEliminados) u.set('eliminados', '1');
  if (p.orden !== LISTA_CHOFERES_DEFECTO.orden) u.set('orden', p.orden);
  if (p.dir !== LISTA_CHOFERES_DEFECTO.dir) u.set('dir', p.dir);
  if (p.pagina > 1) u.set('pagina', String(p.pagina));
  return u.toString();
}
