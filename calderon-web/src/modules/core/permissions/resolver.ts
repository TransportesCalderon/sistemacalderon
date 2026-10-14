import { IDS_PANTALLA, ORDEN_COLUMNAS, PANTALLAS, type CodigoCelda, type PantallaId } from './matriz';
import type { RolApp } from './roles';
import type { Acceso, Accion, Alcance, MapaPermisos, OpcionesResolucion, Permiso } from './types';

const SIN_ACCESO: Acceso = { ver: null, editar: null, transicionar: null };

/** Traduce el código de una celda de la matriz a un acceso. */
export function accesoDeCelda(codigo: CodigoCelda, opciones: OpcionesResolucion): Acceso {
  switch (codigo) {
    case '—':
      return SIN_ACCESO;
    case 'L':
      return { ver: 'todo', editar: null, transicionar: null };
    case 'L*':
      return opciones.gerenciaDetalleAlertas === 'detalle' ? { ver: 'todo', editar: null, transicionar: null } : SIN_ACCESO;
    case 'E':
      return { ver: 'todo', editar: 'todo', transicionar: null };
    case 'A':
    case 'L A':
      return { ver: 'todo', editar: null, transicionar: 'todo' };
    case 'E A':
      return { ver: 'todo', editar: 'todo', transicionar: 'todo' };
    case 'P':
      return { ver: 'propio', editar: 'propio', transicionar: null };
  }
}

/** 'todo' gana sobre 'propio', y cualquiera gana sobre null. */
function unirAlcance(a: Alcance | null, b: Alcance | null): Alcance | null {
  if (a === 'todo' || b === 'todo') return 'todo';
  return a ?? b;
}

function unir(a: Acceso, b: Acceso): Acceso {
  return {
    ver: unirAlcance(a.ver, b.ver),
    editar: unirAlcance(a.editar, b.editar),
    transicionar: unirAlcance(a.transicionar, b.transicionar),
  };
}

/** Une los permisos de todos los roles del usuario. Pantallas sin ningún acceso se omiten. */
export function permisosDe(roles: readonly RolApp[], opciones: OpcionesResolucion): MapaPermisos {
  const mapa: MapaPermisos = {};
  for (const pantalla of IDS_PANTALLA) {
    let acceso = SIN_ACCESO;
    for (const rol of roles) {
      const columna = ORDEN_COLUMNAS.indexOf(rol);
      const codigo = PANTALLAS[pantalla].fila[columna];
      if (codigo) acceso = unir(acceso, accesoDeCelda(codigo, opciones));
    }
    if (acceso.ver || acceso.editar || acceso.transicionar) mapa[pantalla] = acceso;
  }
  return mapa;
}

export function separarPermiso(permiso: Permiso): [PantallaId, Accion] {
  const i = permiso.lastIndexOf(':');
  return [permiso.slice(0, i) as PantallaId, permiso.slice(i + 1) as Accion];
}

/** Alcance con el que el usuario puede ejecutar el permiso, o null si no puede. */
export function alcanceDe(mapa: MapaPermisos, permiso: Permiso): Alcance | null {
  const [pantalla, accion] = separarPermiso(permiso);
  return mapa[pantalla]?.[accion] ?? null;
}

/** ¿Puede el usuario ejecutar el permiso (con cualquier alcance)? */
export function can(mapa: MapaPermisos, permiso: Permiso): boolean {
  return alcanceDe(mapa, permiso) !== null;
}
