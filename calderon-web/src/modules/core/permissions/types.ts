import type { PantallaId } from './matriz';

export type Accion = 'ver' | 'editar' | 'transicionar';
export type Alcance = 'todo' | 'propio';

/** Permiso con forma '<pantalla>:<accion>', p. ej. 'combustible.cargas:transicionar'. */
export type Permiso = `${PantallaId}:${Accion}`;

/** Lo que un usuario puede hacer en una pantalla, unificando todos sus roles. */
export interface Acceso {
  ver: Alcance | null;
  editar: Alcance | null;
  transicionar: Alcance | null;
}

/** Mapa serializable (se envía al cliente en el Session Provider). */
export type MapaPermisos = Partial<Record<PantallaId, Acceso>>;

export interface OpcionesResolucion {
  /** Valor de ref.parametro 'ana.gerencia_detalle_alertas' (especificación §16, "elegible"). */
  gerenciaDetalleAlertas: 'agregado' | 'detalle';
}
