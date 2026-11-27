/**
 * Migración 387 · «Cómo voy manejando»: lo que devuelve tel.fn_mi_manejo() (la base hace todas las cuentas y los cortes;
 * acá solo se lee). Bono por desempeño, consumo (cierres y motor), ralentí del mes y estilo de manejo, con consejos.
 */
export type EstadoManejo = 'en_camino' | 'cerca' | 'lejos' | 'faltante' | 'sin_datos' | 'no_aplica';
export type Nivel = 'bien' | 'regular' | 'mejorar';

export interface MiManejo {
  estado: EstadoManejo;
  titulo: string;
  periodo: { desde: string; hasta: string; dias: number; diasPasados: number };
  bono: {
    aplica: boolean;
    importe: number;
    consumoMax: number;
    consumo: number | null;
    consumoFuente: 'cierres' | 'motor' | null;
    faltanteL: number;
    /** null = todavía sin cierres aprobados en el período. */
    sinFaltantes: boolean | null;
    cuidadoUnidad: boolean | null;
    limpieza: boolean | null;
  };
  consumo: {
    cierres: { l100: number | null; km: number; aprobados: number; pendientes: number };
    motor: { l100: number | null; km: number; dias: number; ultimos7: number | null };
  };
  ralenti: { litros: number; horas: number; pctMotor: number | null; permitidoL: number; ritmoFinDeMesL: number; quedanL: number };
  estilo: {
    programadorPct: number | null;
    programadorObjetivoPct: number;
    excesoVelocidadMin: number | null;
    excesoVelocidadMin100: number | null;
    frenadas100: number | null;
    rpmPct: number | null;
    velocidadMax: number | null;
    niveles: Partial<Record<'programador' | 'velocidad' | 'rpm' | 'frenadas' | 'ralenti' | 'consumo', Nivel>>;
  };
  consejos: string[];
}

const ESTADOS: readonly EstadoManejo[] = ['en_camino', 'cerca', 'lejos', 'faltante', 'sin_datos', 'no_aplica'];
const NIVELES: readonly Nivel[] = ['bien', 'regular', 'mejorar'];

const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const numONull = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const num = (v: unknown): number => numONull(v) ?? 0;
const boolONull = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);

export function parsearMiManejo(v: unknown): MiManejo | null {
  const o = obj(v);
  const estado = ESTADOS.find((e) => e === o.estado);
  if (!estado || typeof o.titulo !== 'string') return null;
  const per = obj(o.periodo);
  const b = obj(o.bono);
  const co = obj(o.consumo);
  const ci = obj(co.cierres);
  const mo = obj(co.motor);
  const ra = obj(o.ralenti);
  const es = obj(o.estilo);
  const nv = obj(es.niveles);
  const niveles: MiManejo['estilo']['niveles'] = {};
  for (const k of ['programador', 'velocidad', 'rpm', 'frenadas', 'ralenti', 'consumo'] as const) {
    const n = NIVELES.find((x) => x === nv[k]);
    if (n) niveles[k] = n;
  }
  return {
    estado,
    titulo: o.titulo,
    periodo: { desde: String(per.desde ?? ''), hasta: String(per.hasta ?? ''), dias: num(per.dias), diasPasados: num(per.dias_pasados) },
    bono: {
      aplica: b.aplica === true,
      importe: num(b.importe),
      consumoMax: num(b.consumo_max) || 34,
      consumo: numONull(b.consumo),
      consumoFuente: b.consumo_fuente === 'cierres' || b.consumo_fuente === 'motor' ? b.consumo_fuente : null,
      faltanteL: num(b.faltante_l),
      sinFaltantes: boolONull(b.sin_faltantes),
      cuidadoUnidad: boolONull(b.cuidado_unidad),
      limpieza: boolONull(b.limpieza),
    },
    consumo: {
      cierres: { l100: numONull(ci.l_100km), km: num(ci.km), aprobados: num(ci.aprobados), pendientes: num(ci.pendientes) },
      motor: { l100: numONull(mo.l_100km), km: num(mo.km), dias: num(mo.dias), ultimos7: numONull(mo.ultimos_7_l_100km) },
    },
    ralenti: {
      litros: num(ra.litros),
      horas: num(ra.horas),
      pctMotor: numONull(ra.pct_motor),
      permitidoL: num(ra.permitido_l) || 40,
      ritmoFinDeMesL: num(ra.ritmo_fin_de_mes_l),
      quedanL: num(ra.quedan_l),
    },
    estilo: {
      programadorPct: numONull(es.programador_pct),
      programadorObjetivoPct: num(es.programador_objetivo_pct) || 60,
      excesoVelocidadMin: numONull(es.exceso_velocidad_min),
      excesoVelocidadMin100: numONull(es.exceso_velocidad_min_100km),
      frenadas100: numONull(es.frenadas_fuertes_s_100km),
      rpmPct: numONull(es.rpm_altas_pct),
      velocidadMax: numONull(es.velocidad_max),
      niveles,
    },
    consejos: Array.isArray(o.consejos) ? o.consejos.filter((c): c is string => typeof c === 'string' && c.trim() !== '') : [],
  };
}

/** Número como se lee en Chile/Argentina: 33,2 · 200.000 · 34 (sin «,0»). */
export function numero(v: number, decimales = 1): string {
  return v.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: decimales });
}

/**
 * Dónde cae el consumo en la regla del medidor (0 a 100 %): el objetivo queda en el medio y la regla va de
 * objetivo − rango a objetivo + rango, así un número muy alto no rompe el dibujo.
 */
export function posicionConsumo(consumo: number, objetivo: number, rango = 6): number {
  const p = 50 + ((consumo - objetivo) / rango) * 50;
  return Math.min(Math.max(Math.round(p), 0), 100);
}
