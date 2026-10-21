/** Conducción por chofer y calidad de los datos de telemetría (migración 49). Lo calcula la base. */
export interface PuntajeChofer {
  choferId: number;
  chofer: string;
  km: number;
  litros: number | null;
  l100km: number | null;
  programadorPct: number | null;
  ralentiPct: number | null;
  sobreVelocidadMin100km: number | null;
  frenadaFuerteS100km: number | null;
  rpmAltaPct: number | null;
  alertas: number;
  puntaje: number | null;
  dias: number;
  camiones: string | null;
  conAcumulados: boolean;
}

export interface DiaConduccion {
  camionId: number;
  fecha: string;
  km: number;
  litros: number | null;
  horasMotor: number | null;
  ralentiH: number | null;
  ralentiL: number | null;
  programadorKm: number | null;
  sobreVelocidadMin: number | null;
  rpmAltaMin: number | null;
  frenadaFuerteS: number | null;
  velocidadMax: number | null;
  pesoMedioKg: number | null;
  acumulados: boolean;
}

export interface CampoTelemetria {
  marca: string;
  seccion: string;
  campo: string;
  lecturas: number;
  total: number;
  pct: number;
  ejemplo: string | null;
}

export interface TarjetaSinEnlace {
  choferExternoId: string;
  camionId: number;
  patente: string;
  ultimoTs: string;
  lecturas: number;
}
