import { RepoError, type Db } from '@/shared/repository/types';
import type { CampoTelemetria, DiaConduccion, PuntajeChofer, TarjetaSinEnlace } from '../domain/conduccion.types';

const n = (v: number | string | null | undefined) => (v === null || v === undefined ? null : Number(v));

/** Conducción y calidad de datos (migración 49). Solo lectura: lo calcula la base. */
export const conduccionRepository = (db: Db) => {
  const tel = () => db.schema('tel');
  return {
    async puntajes(desde: string, hasta: string): Promise<PuntajeChofer[]> {
      const { data, error } = await tel().rpc('fn_puntaje_choferes', { p_desde: desde, p_hasta: hasta });
      if (error) throw new RepoError(error);
      return (data ?? []).map((p) => ({
        choferId: p.chofer_id,
        chofer: p.chofer,
        km: Number(p.km),
        litros: n(p.litros),
        l100km: n(p.l_100km),
        programadorPct: n(p.programador_pct),
        ralentiPct: n(p.ralenti_pct),
        sobreVelocidadMin100km: n(p.sobre_velocidad_min_100km),
        frenadaFuerteS100km: n(p.frenada_fuerte_s_100km),
        rpmAltaPct: n(p.rpm_alta_pct),
        alertas: p.alertas,
        puntaje: n(p.puntaje),
        dias: p.dias,
        camiones: p.camiones,
        conAcumulados: p.con_acumulados,
      }));
    },

    async diasChofer(choferId: number, desde: string, hasta: string): Promise<DiaConduccion[]> {
      const { data, error } = await tel().rpc('fn_conduccion_chofer', { p_chofer: choferId, p_desde: desde, p_hasta: hasta });
      if (error) throw new RepoError(error);
      return (data ?? []).map((d) => ({
        camionId: d.camion_id,
        fecha: d.fecha,
        km: Number(d.km),
        litros: n(d.litros),
        horasMotor: n(d.horas_motor),
        ralentiH: n(d.ralenti_h),
        programadorKm: n(d.programador_km),
        sobreVelocidadMin: n(d.sobre_velocidad_min),
        rpmAltaMin: n(d.rpm_alta_min),
        frenadaFuerteS: n(d.frenada_fuerte_s),
        velocidadMax: n(d.velocidad_max),
        pesoMedioKg: n(d.peso_medio_kg),
        acumulados: d.acumulados,
      }));
    },

    async inventario(dias: number): Promise<CampoTelemetria[]> {
      const { data, error } = await tel().rpc('fn_inventario_campos', { p_dias: dias });
      if (error) throw new RepoError(error);
      return (data ?? []).map((c) => ({ ...c, lecturas: Number(c.lecturas), total: Number(c.total), pct: Number(c.pct) }));
    },

    async sinEnlace(dias: number): Promise<TarjetaSinEnlace[]> {
      const { data, error } = await tel().rpc('fn_choferes_sin_enlace', { p_dias: dias });
      if (error) throw new RepoError(error);
      return (data ?? []).map((t) => ({
        choferExternoId: t.chofer_externo_id,
        camionId: t.camion_id,
        patente: t.patente,
        ultimoTs: t.ultimo_ts,
        lecturas: Number(t.lecturas),
      }));
    },

    /** % de km con programador de velocidad entre dos momentos (null si no hay dato). */
    async programadorPct(camionId: number, desde: string, hasta: string): Promise<number | null> {
      const { data, error } = await tel().rpc('fn_programador_pct', { p_camion: camionId, p_desde: desde, p_hasta: hasta });
      if (error) throw new RepoError(error);
      return n(data);
    },
  };
};
