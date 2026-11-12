/**
 * Migración 258: control de precio y moneda de las cargas. La base decide (bloquea la moneda
 * que no es la del país de la estación y el precio imposible; lo dudoso queda como alerta);
 * acá solo se adelanta el aviso en el formulario, con los mismos umbrales de la regla.
 */
export const VERSION_CONTROL_PRECIO = 258;

export interface ReferenciaPrecio {
  /** Moneda del país de la estación: la que corresponde a la carga. */
  moneda: string;
  pais: string;
  /** Precio habitual por litro (mediana de las cargas recientes del país); null si todavía no hay suficientes. */
  precio: number | null;
  cargas: number;
  pctAviso: number;
  factorBloqueo: number;
}

/** Lo que devuelve fue.fn_referencia_carga. null: a esa estación no se le aplica (surtidor propio, sin regla). */
export function parsearReferencia(dato: unknown): ReferenciaPrecio | null {
  if (!dato || typeof dato !== 'object' || Array.isArray(dato)) return null;
  const d = dato as Record<string, unknown>;
  const moneda = typeof d.moneda_esperada === 'string' ? d.moneda_esperada.trim() : '';
  if (d.resultado === 'no_aplica' || moneda === '') return null;
  const n = (v: unknown) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  const precio = n(d.referencia);
  return {
    moneda,
    pais: typeof d.pais_nombre === 'string' && d.pais_nombre ? d.pais_nombre : String(d.pais ?? ''),
    precio: precio !== null && precio > 0 ? precio : null,
    cargas: n(d.cargas_referencia) ?? 0,
    pctAviso: n(d.pct_aviso) ?? 20,
    factorBloqueo: n(d.factor_bloqueo) ?? 2,
  };
}

export interface PrecioEvaluado {
  nivel: 'normal' | 'dudoso' | 'imposible';
  /** Diferencia contra el precio habitual, en % (positivo: más caro). */
  desvioPct: number;
  /** Si el precio parece el total del ticket: cuánto daría por litro. */
  porLitro: number | null;
}

/** Misma cuenta que la base: imposible fuera de [ref ÷ factor, ref × factor]; dudoso con más de pctAviso % de diferencia. */
export function evaluarPrecio(ref: ReferenciaPrecio, precio: number | null, litros: number | null): PrecioEvaluado | null {
  if (ref.precio === null || precio === null || precio <= 0) return null;
  const desvioPct = Math.round((precio / ref.precio - 1) * 1000) / 10;
  const enRango = (v: number) => v >= ref.precio! / ref.factorBloqueo && v <= ref.precio! * ref.factorBloqueo;
  if (!enRango(precio)) {
    const porLitro = litros !== null && litros > 0 && enRango(precio / litros) ? Math.round((precio / litros) * 100) / 100 : null;
    return { nivel: 'imposible', desvioPct, porLitro };
  }
  return { nivel: Math.abs(desvioPct) > ref.pctAviso ? 'dudoso' : 'normal', desvioPct, porLitro: null };
}
