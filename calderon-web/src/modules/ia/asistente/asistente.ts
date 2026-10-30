import { RepoError, type Db } from '@/shared/repository/types';

/**
 * IA-3 · El asistente «Preguntale» (base: migración 126, IA-2). La base arma el pedido, hace las
 * lecturas con los permisos de quien pregunta, llama a Claude y guarda todo; acá solo se muestra.
 */
export const VERSION_ASISTENTE = 126;

export interface Sugerida {
  codigo: string;
  pregunta: string;
}
export interface EstadoAsistente {
  puede: boolean;
  activo: boolean;
  conClave: boolean;
  conPgNet: boolean;
  quedanHoy: number;
  sugeridas: Sugerida[];
}
export interface Fuente {
  herramienta: string;
  etiqueta: string;
  pantalla: string | null;
  periodo: Record<string, string> | null;
  ok: boolean;
}
export interface Turno {
  id: number;
  conversacionId: number;
  pregunta: string;
  estado: 'pensando' | 'lista' | 'error';
  leyendo: string | null;
  respuesta: string | null;
  error: string | null;
  avisos: string[];
  fuentes: Fuente[];
  util: boolean | null;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? (v as Obj[]) : []);
const strN = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null);

export function parsearEstadoAsistente(raw: unknown): EstadoAsistente {
  const j = obj(raw);
  return {
    puede: j.puede === true,
    activo: j.activo === true,
    conClave: j.con_clave === true,
    conPgNet: j.con_pg_net === true,
    quedanHoy: Number(j.quedan_hoy ?? 0),
    sugeridas: arr(j.sugeridas).map((s) => ({ codigo: String(s.codigo ?? ''), pregunta: String(s.pregunta ?? '') })),
  };
}

export function parsearTurno(raw: unknown): Turno {
  const j = obj(raw);
  const estado = j.estado === 'lista' || j.estado === 'error' ? j.estado : 'pensando';
  return {
    id: Number(j.id),
    conversacionId: Number(j.conversacion_id),
    pregunta: String(j.pregunta ?? ''),
    estado,
    leyendo: strN(j.leyendo),
    respuesta: strN(j.respuesta),
    error: strN(j.error),
    avisos: Array.isArray(j.avisos) ? j.avisos.map(String) : [],
    fuentes: arr(j.fuentes).map((f) => ({
      herramienta: String(f.herramienta ?? ''),
      etiqueta: String(f.etiqueta ?? ''),
      pantalla: strN(f.pantalla),
      periodo: f.periodo && typeof f.periodo === 'object' ? (f.periodo as Record<string, string>) : null,
      ok: f.ok !== false,
    })),
    util: typeof j.util === 'boolean' ? j.util : null,
  };
}

/** «01/10 al 30/10» o «2026-10» (el período que usó cada lectura). */
export function textoPeriodo(p: Record<string, string> | null): string | null {
  if (!p) return null;
  const dm = (f: string) => (/^\d{4}-\d{2}-\d{2}$/.test(f) ? `${f.slice(8, 10)}/${f.slice(5, 7)}` : f);
  if (p.desde && p.hasta) return `${dm(p.desde)} al ${dm(p.hasta)}`;
  if (p.mes) return /^\d{4}-\d{2}$/.test(p.mes) ? `${p.mes.slice(5, 7)}/${p.mes.slice(0, 4)}` : p.mes;
  return null;
}

// IA-4 (migración 127): informe semanal (lunes 7:00, semana anterior)
export const VERSION_INFORME = 127;
export interface InformeFila {
  id: number;
  desde: string;
  hasta: string;
  estado: 'pensando' | 'lista' | 'error';
  error: string | null;
}
export interface Informes {
  puedeArmar: boolean;
  semanaPasada: string;
  informes: InformeFila[];
}
export interface Informe extends InformeFila {
  texto: string | null;
  avisos: string[];
  fuentes: Fuente[];
}
const estadoDe = (v: unknown): InformeFila['estado'] => (v === 'lista' || v === 'error' ? v : 'pensando');

export function parsearInformes(raw: unknown): Informes {
  const j = obj(raw);
  return {
    puedeArmar: j.puede_armar === true,
    semanaPasada: String(j.semana_pasada ?? ''),
    informes: arr(j.informes).map((i) => ({ id: Number(i.id), desde: String(i.desde ?? ''), hasta: String(i.hasta ?? ''), estado: estadoDe(i.estado), error: strN(i.error) })),
  };
}

export function parsearInforme(raw: unknown): Informe {
  const j = obj(raw);
  const t = parsearTurno({ ...j, respuesta: j.texto });
  return { id: Number(j.id), desde: String(j.desde ?? ''), hasta: String(j.hasta ?? ''), estado: estadoDe(j.estado), error: strN(j.error), texto: t.respuesta, avisos: t.avisos, fuentes: t.fuentes };
}

/** «Semana del 19/10 al 25/10». */
export const textoSemana = (desde: string, hasta: string) => `Semana del ${textoPeriodo({ desde, hasta }) ?? desde}`;

export const asistenteRepository = (db: Db) => {
  const ops = () => db.schema('ops');
  const leer = async <T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> => {
    const { data, error } = await p;
    if (error) throw new RepoError(error as never);
    return data as T;
  };
  return {
    async estado() {
      return parsearEstadoAsistente(await leer(ops().rpc('fn_ia_asistente_estado')));
    },
    async preguntar(pregunta: string | null, conversacionId: number | null, sugerida: string | null): Promise<number> {
      return leer(ops().rpc('fn_ia_preguntar', { p_pregunta: pregunta, p_conversacion: conversacionId, p_sugerida: sugerida }));
    },
    /** Se llama cada segundo y medio: la base avanza (lecturas, Claude) y devuelve cómo va. */
    async respuesta(turno: number) {
      return parsearTurno(await leer(ops().rpc('fn_ia_respuesta', { p_turno: turno })));
    },
    async informes() {
      return parsearInformes(await leer(ops().rpc('fn_ia_informes', { p_limite: 12 })));
    },
    async informe(id: number) {
      return parsearInforme(await leer(ops().rpc('fn_ia_informe', { p_id: id })));
    },
    async generarInforme(desde: string | null): Promise<number> {
      return leer(ops().rpc('fn_ia_informe_generar', { p_desde: desde }));
    },
    async valorar(turno: number, util: boolean, comentario: string | null) {
      await leer(ops().rpc('fn_ia_valorar', { p_turno: turno, p_util: util, p_comentario: comentario }));
    },
  };
};
