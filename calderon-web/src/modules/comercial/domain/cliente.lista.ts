import { ORDENES_CLIENTE, esEstadoCliente, type CampoOrdenCliente, type ClienteListaParams } from './cliente.types';

/**
 * Parámetros de la lista de clientes ⇄ URL. Misma función en servidor y navegador,
 * así la clave de React Query precargada coincide con la del cliente.
 */
type Entrada = URLSearchParams | Record<string, string | string[] | undefined>;

function leer(e: Entrada, clave: string): string | undefined {
  if (e instanceof URLSearchParams) return e.get(clave) ?? undefined;
  const v = e[clave];
  return Array.isArray(v) ? v[0] : v;
}

export const LISTA_CLIENTES_DEFECTO: ClienteListaParams = { orden: 'razon_social', dir: 'asc', pagina: 1 };

export function parsearListaClientes(e: Entrada): ClienteListaParams {
  const p: ClienteListaParams = { ...LISTA_CLIENTES_DEFECTO };

  const texto = leer(e, 'q')?.trim();
  if (texto) p.texto = texto.slice(0, 60);

  const estado = leer(e, 'estado');
  if (esEstadoCliente(estado)) p.estado = estado;

  const pais = leer(e, 'pais');
  if (pais && /^[A-Z]{2}$/.test(pais)) p.pais = pais;

  const moneda = leer(e, 'moneda');
  if (moneda && /^[A-Z]{3}$/.test(moneda)) p.moneda = moneda;

  const segmento = leer(e, 'segmento')?.trim();
  if (segmento) p.segmento = segmento.slice(0, 60);

  if (leer(e, 'eliminados') === '1') p.incluirEliminados = true;

  const orden = leer(e, 'orden');
  if (orden && (ORDENES_CLIENTE as readonly string[]).includes(orden)) p.orden = orden as CampoOrdenCliente;

  if (leer(e, 'dir') === 'desc') p.dir = 'desc';

  const pagina = Number(leer(e, 'pagina'));
  if (Number.isInteger(pagina) && pagina > 1 && pagina < 10_000) p.pagina = pagina;

  return p;
}

export function serializarListaClientes(p: ClienteListaParams): string {
  const u = new URLSearchParams();
  if (p.texto) u.set('q', p.texto);
  if (p.estado) u.set('estado', p.estado);
  if (p.pais) u.set('pais', p.pais);
  if (p.moneda) u.set('moneda', p.moneda);
  if (p.segmento) u.set('segmento', p.segmento);
  if (p.incluirEliminados) u.set('eliminados', '1');
  if (p.orden !== LISTA_CLIENTES_DEFECTO.orden) u.set('orden', p.orden);
  if (p.dir !== LISTA_CLIENTES_DEFECTO.dir) u.set('dir', p.dir);
  if (p.pagina > 1) u.set('pagina', String(p.pagina));
  return u.toString();
}
