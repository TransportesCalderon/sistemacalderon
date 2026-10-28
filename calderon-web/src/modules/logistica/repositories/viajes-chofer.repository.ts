import { RepoError, type Db } from '@/shared/repository/types';
import type { FechaDia, FechaISO } from '@/shared/types/dominio';
import type { AjustarItemDatos, AsignarTractorDatos, IniciarViajeDatos } from '../domain/viaje-chofer.schemas';
import {
  esSituacionTractor,
  esSituacionViajeChofer,
  parsearViajeChofer,
  type Tractor,
  type ViajeChofer,
  type ViajeChoferResumen,
} from '../domain/viaje-chofer.types';

/** Tractores y viajes de chofer (migración 46). Cada acción es una función de la base; su mensaje se muestra tal cual. */
export const viajesChoferRepository = (db: Db) => {
  const ops = () => db.schema('ops');
  const llamar = async (p: PromiseLike<{ error: unknown }>) => {
    const { error } = await p;
    if (error) throw new RepoError(error as never);
  };

  return {
    async tractores(): Promise<Tractor[]> {
      const { data, error } = await ops().rpc('fn_tractores');
      if (error) throw new RepoError(error);
      return (data ?? []).map((t) => ({
        camionId: t.camion_id,
        codigoInterno: t.codigo_interno,
        patente: t.patente,
        choferId: t.chofer_id,
        chofer: t.chofer_nombre,
        choferEstado: t.chofer_estado,
        licenciaVencimiento: t.licencia_vencimiento,
        asignadoDesde: t.asignado_desde,
        viajeId: t.viaje_id,
        viajeNumero: t.viaje_numero,
        viajeSalida: t.viaje_salida_ts as FechaISO | null,
        viajeChofer: t.viaje_chofer_nombre,
        situacion: esSituacionTractor(t.situacion) ? t.situacion : 'disponible',
        corteDisponibleId: t.corte_disponible_id,
        corteDisponible: t.corte_disponible_ts as FechaISO | null,
      }));
    },

    async viajes(desde: FechaDia | null, hasta: FechaDia | null): Promise<ViajeChoferResumen[]> {
      const { data, error } = await ops().rpc('fn_viajes_chofer', { p_desde: desde, p_hasta: hasta });
      if (error) throw new RepoError(error);
      return (data ?? []).map((v) => ({
        id: v.id,
        numero: v.numero,
        camionId: v.camion_id,
        patente: v.patente,
        choferId: v.chofer_id,
        chofer: v.chofer_nombre,
        salida: v.salida_ts as FechaISO,
        llegada: v.llegada_ts as FechaISO | null,
        situacion: esSituacionViajeChofer(v.situacion) ? v.situacion : 'en_viaje',
        operaciones: v.operaciones,
        km: v.km === null ? null : Number(v.km),
        canon: v.canon,
        relevo: Boolean(v.relevo),
        cierreId: v.cierre_id,
        cierreEstado: v.cierre_estado,
      }));
    },

    async viaje(id: number): Promise<ViajeChofer> {
      const { data, error } = await ops().rpc('fn_viaje_chofer', { p_viaje: id });
      if (error) throw new RepoError(error);
      return parsearViajeChofer(data as Record<string, unknown>);
    },

    asignarTractor: (d: AsignarTractorDatos) =>
      llamar(db.schema('mae').rpc('fn_asignar_tractor', { p_camion: d.camionId, p_chofer: d.choferId, p_desde: d.desde })),

    async iniciar(d: IniciarViajeDatos): Promise<number> {
      const { data, error } = await ops().rpc('fn_iniciar_viaje_chofer', {
        p_camion: d.camionId,
        p_chofer: d.choferId,
        p_items: d.items.map((i) => ({ servicio_id: i.servicioId, linea_id: i.lineaId })),
        p_observacion: d.observacion,
      });
      if (error) throw new RepoError(error);
      return data;
    },

    agregarItem: (viaje: number, servicio: number | null, linea: number | null) =>
      llamar(ops().rpc('fn_agregar_item_viaje', { p_viaje: viaje, p_servicio: servicio, p_linea: linea })),
    ajustarItem: (d: AjustarItemDatos) =>
      llamar(ops().rpc('fn_ajustar_item_viaje', { p_item: d.itemId, p_canon: d.canon, p_moneda: d.moneda, p_km: d.km, p_motivo: d.motivo })),
    quitarItem: (item: number) => llamar(ops().rpc('fn_quitar_item_viaje', { p_item: item })),
    /** Migración 109: agrega el tramo que sigue de la misma operación hasta su destino. */
    continuarOperacion: (item: number) => llamar(ops().rpc('fn_continuar_operacion', { p_item: item })),
    cambiarChofer: (viaje: number, chofer: number) => llamar(ops().rpc('fn_cambiar_chofer_viaje', { p_viaje: viaje, p_chofer: chofer })),

    async prepararCierre(viaje: number): Promise<number> {
      const { data, error } = await ops().rpc('fn_preparar_cierre_combustible', { p_viaje: viaje });
      if (error) throw new RepoError(error);
      return data;
    },
    cerrar: (viaje: number, version: number) => llamar(ops().rpc('fn_cerrar_viaje_chofer', { p_viaje: viaje, p_version: version })),
    cerrarYAprobar: (viaje: number, version: number) => llamar(ops().rpc('fn_cerrar_y_aprobar', { p_viaje: viaje, p_version: version })),
    reabrir: (viaje: number, motivo: string) => llamar(ops().rpc('fn_reabrir_viaje_chofer', { p_viaje: viaje, p_motivo: motivo })),
    anular: (viaje: number, motivo: string) => llamar(ops().rpc('fn_anular_viaje_chofer', { p_viaje: viaje, p_motivo: motivo })),
  };
};
