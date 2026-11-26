/**
 * Migración 309 · ¿Cuánto cargar para llegar? Desde donde está el camión (GPS) o desde un lugar, pasando por las
 * paradas en orden, la base suma los km y el consumo medido de los camiones en cada tramo (cargado o vacío) y dice
 * cuánto cargar: lo justo (llega sin reserva) y lo recomendado (llega con la reserva de «Solicitar carga», 100 L).
 * Todo lo calcula la base; la web muestra.
 */
export const VERSION_CUANTO_CARGAR = 309;

/** Una parada como la arma la pantalla: el lugar y si el tramo que llega a ella va cargado. */
export interface ParadaRecorrido {
  lugarId: number | null;
  conCarga: boolean;
}

/** Un tramo del recorrido, con sus km, el consumo usado y de dónde sale. */
export interface TramoRecorrido {
  n: number;
  desde: string;
  hasta: string;
  conCarga: boolean;
  km: number | null;
  /** mapa, recta (estimado), viajes (medido en esa ruta), ruta (km de la línea), ya_esta o los del mapa guardado. */
  fuenteKm: string | null;
  l100km: number | null;
  consumoDe: string | null;
  litros: number | null;
  falta: string | null;
}

export interface CuantoCargar {
  patente: string;
  desde: string;
  desdeGps: boolean;
  gpsEn: string | null;
  tramos: TramoRecorrido[];
  km: number;
  litrosNecesarios: number | null;
  litrosActuales: number | null;
  litrosAMano: boolean;
  litrosSistema: number | null;
  litrosSistemaMotivo: string | null;
  capacidadL: number | null;
  reservaL: number;
  justoL: number | null;
  recomendadoL: number | null;
  entraL: number | null;
  llegaJustoL: number | null;
  llegaRecomendadoL: number | null;
  noEntra: boolean;
  falta: string | null;
  avisos: string[];
  /** Resumen listo para copiar (WhatsApp). */
  texto: string | null;
}

type J = Record<string, unknown>;
const obj = (v: unknown): J => (v && typeof v === 'object' && !Array.isArray(v) ? (v as J) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const txt = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

export function parsearCuantoCargar(v: unknown): CuantoCargar {
  const x = obj(v);
  return {
    patente: txt(x.patente) ?? '',
    desde: txt(x.desde) ?? '',
    desdeGps: x.desde_gps === true,
    gpsEn: txt(x.gps_en),
    tramos: arr(x.tramos).map((t) => {
      const y = obj(t);
      return {
        n: num(y.n) ?? 0,
        desde: txt(y.desde) ?? '',
        hasta: txt(y.hasta) ?? '',
        conCarga: y.con_carga !== false,
        km: num(y.km),
        fuenteKm: txt(y.fuente_km),
        l100km: num(y.l_100km),
        consumoDe: txt(y.consumo_de),
        litros: num(y.litros),
        falta: txt(y.falta),
      };
    }),
    km: num(x.km) ?? 0,
    litrosNecesarios: num(x.litros_necesarios),
    litrosActuales: num(x.litros_actuales),
    litrosAMano: x.litros_a_mano === true,
    litrosSistema: num(x.litros_sistema),
    litrosSistemaMotivo: txt(x.litros_sistema_motivo),
    capacidadL: num(x.capacidad_l),
    reservaL: num(x.reserva_l) ?? 100,
    justoL: num(x.justo_l),
    recomendadoL: num(x.recomendado_l),
    entraL: num(x.entra_l),
    llegaJustoL: num(x.llega_justo_l),
    llegaRecomendadoL: num(x.llega_recomendado_l),
    noEntra: x.no_entra === true,
    falta: txt(x.falta),
    avisos: arr(x.avisos).map(String),
    texto: txt(x.texto),
  };
}

/** Lo que se manda a la base: solo las paradas con lugar elegido; desde y litros vacíos = los del sistema. */
export function datosCuantoCargar(desdeId: number | null, paradas: ParadaRecorrido[], litros: number | null) {
  return {
    desde_id: desdeId,
    paradas: paradas.filter((p) => p.lugarId !== null).map((p) => ({ lugar_id: p.lugarId, con_carga: p.conCarga })),
    litros,
  };
}

export type DatosCuantoCargar = ReturnType<typeof datosCuantoCargar>;

/** Todas las paradas tienen su lugar (si no, todavía no se calcula). */
export const paradasCompletas = (paradas: ParadaRecorrido[]): boolean => paradas.length > 0 && paradas.every((p) => p.lugarId !== null);

/** De dónde salen los km de un tramo, en palabras. */
export const FUENTE_KM: Record<string, string> = {
  mapa: 'del mapa',
  recta: 'estimados en línea recta',
  viajes: 'de los viajes hechos',
  ruta: 'de la ruta cargada',
  ya_esta: 'ya está ahí',
};
