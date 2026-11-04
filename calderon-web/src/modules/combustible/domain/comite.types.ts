/** Migración 179 · Comité mensual de consumo (fue.fn_comite_consumo). Lo calcula la base; acá solo se convierte. */
export const VERSION_COMITE = 179;

export interface RevisionEquipo {
  revisado: boolean;
  comentario: string | null;
  accion: string | null;
  por: string | null;
  en: string | null;
}

export interface TractorComite {
  equipoId: number;
  nombre: string;
  viajes: number;
  km: number | null;
  cargadoL: number | null;
  motorL: number | null;
  diferenciaL: number | null;
  l100Cargado: number | null;
  l100Motor: number | null;
  fueraTolerancia: number;
  sinMotor: number;
  sinAprobar: number;
  alertas: number;
  alertasAbiertas: number;
  revision: RevisionEquipo | null;
}

export interface GensetComite {
  equipoId: number;
  nombre: string;
  cierres: number;
  horas: number | null;
  consumoL: number | null;
  consumoLh: number | null;
  objetivoLh: number | null;
  esperadoL: number | null;
  diferenciaL: number | null;
  fueraTolerancia: number;
  descuentoL: number | null;
  revision: RevisionEquipo | null;
}

export interface ComiteMes {
  mes: string;
  estado: 'abierto' | 'cerrado';
  sePuedeCerrar: boolean;
  participantes: string | null;
  conclusiones: string | null;
  cerradoPor: string | null;
  cerradoEn: string | null;
  tractores: TractorComite[];
  gensets: GensetComite[];
}

type J = Record<string, unknown>;
const o = (v: unknown): J => (v && typeof v === 'object' && !Array.isArray(v) ? (v as J) : {});
const a = (v: unknown): J[] => (Array.isArray(v) ? (v as J[]) : []);
const n = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
const t = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null);

const revision = (v: unknown): RevisionEquipo | null => {
  if (!v || typeof v !== 'object') return null;
  const r = o(v);
  return { revisado: r.revisado !== false, comentario: t(r.comentario), accion: t(r.accion), por: t(r.por), en: t(r.en) };
};

export function parsearComite(d: unknown): ComiteMes {
  const x = o(d);
  return {
    mes: t(x.mes) ?? '',
    estado: x.estado === 'cerrado' ? 'cerrado' : 'abierto',
    sePuedeCerrar: x.se_puede_cerrar === true,
    participantes: t(x.participantes),
    conclusiones: t(x.conclusiones),
    cerradoPor: t(x.cerrado_por),
    cerradoEn: t(x.cerrado_en),
    tractores: a(x.tractores).map((e) => ({
      equipoId: Number(e.equipo_id),
      nombre: t(e.nombre) ?? '',
      viajes: Number(e.viajes ?? 0),
      km: n(e.km),
      cargadoL: n(e.cargado_l),
      motorL: n(e.motor_l),
      diferenciaL: n(e.diferencia_l),
      l100Cargado: n(e.l100_cargado),
      l100Motor: n(e.l100_motor),
      fueraTolerancia: Number(e.fuera_tolerancia ?? 0),
      sinMotor: Number(e.sin_motor ?? 0),
      sinAprobar: Number(e.sin_aprobar ?? 0),
      alertas: Number(e.alertas ?? 0),
      alertasAbiertas: Number(e.alertas_abiertas ?? 0),
      revision: revision(e.revision),
    })),
    gensets: a(x.gensets).map((e) => ({
      equipoId: Number(e.equipo_id),
      nombre: t(e.nombre) ?? '',
      cierres: Number(e.cierres ?? 0),
      horas: n(e.horas),
      consumoL: n(e.consumo_l),
      consumoLh: n(e.consumo_lh),
      objetivoLh: n(e.objetivo_lh),
      esperadoL: n(e.esperado_l),
      diferenciaL: n(e.diferencia_l),
      fueraTolerancia: Number(e.fuera_tolerancia ?? 0),
      descuentoL: n(e.descuento_l),
      revision: revision(e.revision),
    })),
  };
}

/** Cuántos equipos faltan revisar (la base igual no deja cerrar si falta alguno). */
export const faltanRevisar = (c: ComiteMes) =>
  [...c.tractores, ...c.gensets].filter((e) => !e.revision?.revisado).map((e) => e.nombre);

/** Primer día del mes (AAAA-MM-01) de un «AAAA-MM» del selector. */
export const primerDia = (mes: string) => `${mes.slice(0, 7)}-01`;
