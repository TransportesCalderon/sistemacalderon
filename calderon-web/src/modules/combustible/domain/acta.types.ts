import type { FechaISO } from '@/shared/types/dominio';

/** Datos del acta del cierre (migración 56, fue.fn_acta_cierre). Lo calcula la base; acá solo se convierte. */
export interface ActaExtra {
  capacidadL: number | null;
  /** Migración 57: «actual» = los tanques figuran en la ficha desde después del viaje; se usó la capacidad de hoy. */
  capacidadActual: boolean;
  salida: { fecha: FechaISO | null; estacion: string | null; litros: number | null; faltanteL: number; faltanteObs: string | null; inicioL: number | null };
  llegada: { fecha: FechaISO | null; estacion: string | null; litros: number | null; faltanteL: number; faltanteObs: string | null };
  cargas: { fecha: FechaISO; estacion: string | null; litros: number; corte: boolean; lleno: boolean }[];
  movimientos: { fecha: FechaISO; tipo: string; litros: number; motivo: string | null }[];
  km: number | null;
  fuenteKm: string | null;
  consumoMotorL: number | null;
  fuenteConsumo: string | null;
  l100km: number | null;
  horasMotor: number | null;
  ralenti: { litros: number | null; horas: number | null; fuente: string | null };
  programadorPct: number | null;
  cargasL: number | null;
  entradasL: number | null;
  salidasL: number | null;
  faltanteSalidaL: number | null;
  faltanteLlegadaL: number | null;
  libroL: number | null;
  diferenciaL: number | null;
  toleranciaL: number | null;
  justificadosL: number | null;
  motivoJustificados: string | null;
  aDescontarL: number | null;
  comentario: string | null;
  observaciones: string | null;
  ajusteManual: string | null;
  alertas: { tipo: string; cuando: FechaISO; valor: number | null; unidad: string | null; estado: string; resolucion: string | null }[];
  /** Migración 75: rendimiento real (lo que consumió el motor cada 100 km). */
  l100kmMotor: number | null;
  /** Migración 75: consumo objetivo del viaje (promedio de los tramos ponderado por km). */
  objetivo: ObjetivoViaje | null;
  /** Migración 85: consumo del motor contra el objetivo, con el color que decide la base. */
  vsObjetivo: { litros: number; pct: number; nivel: 'normal' | 'naranja' | 'rojo'; naranjaPct: number; rojoPct: number } | null;
  /** Migración 85: Eco Score de Volvo Connect / Renault Optifleet entre la salida y la llegada. */
  ecoScore: EcoScore | null;
}

export interface EcoScore {
  marca: string | null;
  total: number | null;
  componentes: Record<string, number>;
  motivo: string | null;
  desde: string | null;
  hasta: string | null;
}

/** Nombres de las partes del Eco Score, en este orden (las que no están acá no se muestran). */
export const PARTE_ECO: Record<string, string> = {
  anticipation: 'Anticipación',
  braking: 'Frenado',
  anticipationAndBraking: 'Anticipación y frenado',
  coasting: 'Inercia',
  engineAndGearUtilization: 'Uso del motor y los cambios',
  engineAndGearUtilisation: 'Uso del motor y los cambios',
  withinEconomy: 'En zona económica',
  speedAdaption: 'Adaptación de la velocidad',
  speedAdaptation: 'Adaptación de la velocidad',
  cruiseControl: 'Programador de velocidad',
  idling: 'Ralentí',
};

/** La API de Volvo y Renault puntúa de 0 a 10; si algún día llega de 0 a 100, se muestra así. */
export const escalaEco = (total: number) => (total <= 10 ? 10 : 100);

export interface ObjetivoViaje {
  l100km: number | null;
  debioL: number | null;
  kmVacioSinRegistrar: number;
  vacioL100km: number | null;
  contenedorVacioL100km: number | null;
  tramos: { linea: string | null; operacion: string | null; vacio: boolean; contenedorVacio: boolean; km: number | null; objetivo: number | null }[];
  sinObjetivo: string[];
}

type J = Record<string, unknown>;
const o = (v: unknown): J => (v && typeof v === 'object' && !Array.isArray(v) ? (v as J) : {});
const a = (v: unknown): J[] => (Array.isArray(v) ? (v as J[]) : []);
const n = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
const t = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null);

export function parsearActa(d: unknown): ActaExtra {
  const x = o(d);
  const s = o(x.salida);
  const l = o(x.llegada);
  const r = o(x.ralenti);
  return {
    capacidadL: n(x.capacidad_l),
    capacidadActual: o(x.capacidad).fuente === 'actual',
    salida: {
      fecha: t(s.fecha_hora) as FechaISO | null,
      estacion: t(s.estacion),
      litros: n(s.litros),
      faltanteL: n(s.faltante_lleno_l) ?? 0,
      faltanteObs: t(s.faltante_observacion),
      inicioL: n(s.inicio_l),
    },
    llegada: {
      fecha: t(l.fecha_hora) as FechaISO | null,
      estacion: t(l.estacion),
      litros: n(l.litros),
      faltanteL: n(l.faltante_lleno_l) ?? 0,
      faltanteObs: t(l.faltante_observacion),
    },
    cargas: a(x.cargas).map((k) => ({
      fecha: (t(k.fecha_hora) ?? '') as FechaISO,
      estacion: t(k.estacion),
      litros: Number(k.litros),
      corte: k.es_frontera === true,
      lleno: k.tanque_lleno === true,
    })),
    movimientos: a(x.movimientos).map((m) => ({ fecha: (t(m.fecha_hora) ?? '') as FechaISO, tipo: t(m.tipo) ?? '', litros: Number(m.litros), motivo: t(m.motivo) })),
    km: n(x.km),
    fuenteKm: t(x.fuente_km),
    consumoMotorL: n(x.consumo_motor_l),
    fuenteConsumo: t(x.fuente_consumo),
    l100km: n(x.l_100km),
    horasMotor: n(x.horas_motor),
    ralenti: { litros: n(r.litros), horas: n(r.horas) ?? n(r.horas_resumen), fuente: t(r.fuente) },
    programadorPct: n(x.programador_pct),
    cargasL: n(x.cargas_l),
    entradasL: n(x.entradas_l),
    salidasL: n(x.salidas_l),
    faltanteSalidaL: n(x.faltante_salida_l),
    faltanteLlegadaL: n(x.faltante_llegada_l),
    libroL: n(x.libro_l),
    diferenciaL: n(x.diferencia_l),
    toleranciaL: n(x.tolerancia_l),
    justificadosL: n(x.justificados_l),
    motivoJustificados: t(x.motivo_justificados),
    aDescontarL: n(x.a_descontar_l),
    comentario: t(x.comentario),
    observaciones: t(x.observaciones),
    ajusteManual: t(x.ajuste_manual),
    alertas: a(x.alertas).map((y) => ({
      tipo: t(y.tipo) ?? '',
      cuando: (t(y.cuando) ?? '') as FechaISO,
      valor: n(y.valor),
      unidad: t(y.unidad),
      estado: t(y.estado) ?? '',
      resolucion: t(y.resolucion),
    })),
    l100kmMotor: n(x.l_100km_motor),
    objetivo: x.objetivo
      ? {
          l100km: n(o(x.objetivo).l_100km),
          debioL: n(o(x.objetivo).debio_l),
          kmVacioSinRegistrar: n(o(x.objetivo).km_vacio_sin_registrar) ?? 0,
          vacioL100km: n(o(x.objetivo).vacio_l_100km),
          contenedorVacioL100km: n(o(x.objetivo).contenedor_vacio_l_100km),
          tramos: a(o(x.objetivo).tramos).map((k) => ({
            linea: t(k.linea),
            operacion: k.operacion === null || k.operacion === undefined ? null : String(k.operacion),
            vacio: k.vacio === true,
            contenedorVacio: k.contenedor_vacio === true,
            km: n(k.km),
            objetivo: n(k.objetivo_l_100km),
          })),
          sinObjetivo: (Array.isArray(o(x.objetivo).sin_objetivo) ? (o(x.objetivo).sin_objetivo as unknown[]) : []).map(String),
        }
      : null,
    vsObjetivo: x.vs_objetivo
      ? {
          litros: Number(o(x.vs_objetivo).litros),
          pct: Number(o(x.vs_objetivo).pct),
          nivel: o(x.vs_objetivo).nivel === 'rojo' ? 'rojo' : o(x.vs_objetivo).nivel === 'naranja' ? 'naranja' : 'normal',
          naranjaPct: Number(o(x.vs_objetivo).naranja_pct),
          rojoPct: Number(o(x.vs_objetivo).rojo_pct),
        }
      : null,
    ecoScore: x.eco_score
      ? {
          marca: t(o(x.eco_score).marca),
          total: n(o(x.eco_score).total),
          componentes: Object.fromEntries(
            Object.entries(o(o(x.eco_score).componentes)).filter(([, v]) => typeof v === 'number') as [string, number][],
          ),
          motivo: t(o(x.eco_score).motivo),
          desde: t(o(x.eco_score).desde),
          hasta: t(o(x.eco_score).hasta),
        }
      : null,
  };
}
