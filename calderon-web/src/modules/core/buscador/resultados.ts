import { esTipoFicha, type TipoFicha } from '@/modules/core/fichas/ficha-url';
import { FICHAS } from '@/modules/core/fichas/tipos';
import { IDS_PANTALLA, type PantallaId } from '@/modules/core/permissions/matriz';
import { can } from '@/modules/core/permissions/resolver';
import type { MapaPermisos } from '@/modules/core/permissions/types';
import { baseTiene } from '@/shared/lib/version-base';

/**
 * Sprint 2: resultados del buscador (seg.fn_buscar, migración 115). La base devuelve la
 * pantalla que hace falta para ver cada resultado; acá solo se dejan los que el rol puede ver.
 * Funciones puras (se prueban sin navegador).
 */
export interface Resultado {
  tipo: TipoFicha;
  id: number;
  titulo: string;
  detalle: string | null;
}

const esPantalla = (v: string): v is PantallaId => (IDS_PANTALLA as readonly string[]).includes(v);

/** Migración que trae el buscador: sin ella, el buscador no se muestra. */
export const VERSION_BUSCADOR = 115;
/** Letras mínimas para buscar (la base tampoco busca con menos). */
export const MINIMO_LETRAS = 2;

/** Filas de seg.fn_buscar → resultados visibles para este rol, en el orden de la base. */
export function resultadosVisibles(filas: unknown, permisos: MapaPermisos, versionBase: number): Resultado[] {
  if (!Array.isArray(filas)) return [];
  const lista: Resultado[] = [];
  for (const f of filas as Record<string, unknown>[]) {
    const tipo = String(f?.tipo ?? '');
    const pantalla = String(f?.pantalla ?? '');
    const id = Number(f?.id);
    if (!esTipoFicha(tipo) || !esPantalla(pantalla) || !Number.isSafeInteger(id) || id <= 0) continue;
    if (!can(permisos, `${pantalla}:ver`)) continue;
    const version = FICHAS[tipo].version;
    if (version && !baseTiene(versionBase, version)) continue;
    lista.push({ tipo, id, titulo: String(f.titulo ?? ''), detalle: f.detalle == null ? null : String(f.detalle) });
  }
  return lista;
}

/** Agrupa por tipo conservando el orden de la base (lo más parecido primero). */
export function agrupar(resultados: readonly Resultado[]): { tipo: TipoFicha; titulo: string; items: Resultado[] }[] {
  const grupos: { tipo: TipoFicha; titulo: string; items: Resultado[] }[] = [];
  for (const r of resultados) {
    let g = grupos.find((x) => x.tipo === r.tipo);
    if (!g) {
      g = { tipo: r.tipo, titulo: TITULO_GRUPO[r.tipo], items: [] };
      grupos.push(g);
    }
    g.items.push(r);
  }
  return grupos;
}

const TITULO_GRUPO: Record<TipoFicha, string> = {
  camion: 'Camiones',
  chofer: 'Choferes',
  cliente: 'Clientes',
  carga: 'Cargas',
  cierre: 'Cierres',
  viaje: 'Viajes',
  genset: 'Gensets',
  empresa: 'Empresas',
  operacion: 'Operaciones',
  factura: 'Facturas',
};
