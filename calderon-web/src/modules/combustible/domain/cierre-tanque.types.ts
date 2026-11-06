/**
 * Migración 206 · Balance del tanque de un cierre de viaje (todos los tanques del camión juntos):
 * con cuántos litros salió, cuánto cargó en el viaje, con cuánto llegó y cuánto consumió según el libro.
 * Lo calcula la base (fue.fn_tanque_cierre); acá solo se cambian los nombres.
 */
export const VERSION_TANQUE_CIERRE = 206;

export interface TanqueCierre {
  disponible: boolean;
  motivo: string | null;
  capacidadL: number | null;
  faltanteSalidaL: number | null;
  salioConL: number | null;
  cargadoViajeL: number | null;
  entradasL: number | null;
  salidasL: number | null;
  llegoConL: number | null;
  cargaLlegadaL: number | null;
  faltanteLlegadaL: number | null;
  quedoConL: number | null;
  consumoLibroL: number | null;
  aviso: string | null;
}

type J = Record<string, unknown>;
const n = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));
const t = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

export function parsearTanqueCierre(d: unknown): TanqueCierre {
  const x = (d && typeof d === 'object' && !Array.isArray(d) ? d : {}) as J;
  return {
    disponible: x.disponible === true,
    motivo: t(x.motivo),
    capacidadL: n(x.capacidad_l),
    faltanteSalidaL: n(x.faltante_salida_l),
    salioConL: n(x.salio_con_l),
    cargadoViajeL: n(x.cargado_viaje_l),
    entradasL: n(x.entradas_l),
    salidasL: n(x.salidas_l),
    llegoConL: n(x.llego_con_l),
    cargaLlegadaL: n(x.carga_llegada_l),
    faltanteLlegadaL: n(x.faltante_llegada_l),
    quedoConL: n(x.quedo_con_l),
    consumoLibroL: n(x.consumo_libro_l),
    aviso: t(x.aviso),
  };
}
