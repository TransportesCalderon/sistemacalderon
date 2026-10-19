import { RepoError, type Db } from '@/shared/repository/types';
import type { FechaISO } from '@/shared/types/dominio';
import type { AsignarViajeDatos, ModificarViajeDatos, PasoDatos, VueltaVaciaDatos } from '../domain/viaje.schemas';
import { esPaso, type OpcionesViaje, type ViajeAbierto } from '../domain/viaje.types';

/** Viajes de Logística (migración 40). Cada paso es una función de la base; su mensaje se muestra tal cual. */
export const viajesRepository = (db: Db) => {
  const ops = () => db.schema('ops');
  const llamar = async (p: PromiseLike<{ error: unknown }>) => {
    const { error } = await p;
    if (error) throw new RepoError(error as never);
  };

  return {
    async abiertos(): Promise<ViajeAbierto[]> {
      const { data, error } = await ops().rpc('fn_viajes_abiertos');
      if (error) throw new RepoError(error);
      return (data ?? []).map((v) => ({
        tramoId: v.tramo_id,
        enCurso: v.estado === 'en_curso',
        paso: esPaso(v.paso) ? v.paso : 'planificado',
        conCarga: v.con_carga,
        semiId: v.semi_id,
        semi: v.semi_patente,
        camionId: v.camion_id,
        tractor: v.tractor_patente,
        choferId: v.chofer_id,
        chofer: v.chofer_nombre,
        numeroServicio: v.numero_servicio,
        numeroOperacion: v.numero_operacion ?? null,
        clienteId: v.cliente_id,
        cliente: v.cliente,
        producto: v.producto,
        contenedor: v.contenedor,
        taraMaxDias: v.tara_max_dias,
        origenId: v.origen_id,
        origen: v.origen,
        destinoId: v.destino_id,
        destino: v.destino,
        fechaCarga: v.fecha_carga as FechaISO | null,
        fechaDescarga: v.fecha_descarga as FechaISO | null,
        inicioReal: v.inicio_real as FechaISO | null,
        observacion: v.observacion,
      }));
    },

    /** Listas de los formularios. Lo no disponible se muestra marcado (la base igual lo rechaza). */
    async opciones(): Promise<OpcionesViaje> {
      const mae = db.schema('mae');
      const [s, c, ch, cl, u] = await Promise.all([
        mae.from('semirremolque').select('id, patente, estado').is('eliminado_en', null).order('patente'),
        mae.from('camion').select('id, patente, estado').is('eliminado_en', null).order('patente'),
        mae.from('chofer').select('id, nombre, apellido, estado').is('eliminado_en', null).order('apellido'),
        mae.from('cliente').select('id, razon_social, estado').is('eliminado_en', null).order('razon_social'),
        mae.from('ubicacion').select('id, nombre').is('eliminado_en', null).order('nombre'),
      ]);
      for (const r of [s, c, ch, cl, u]) if (r.error) throw new RepoError(r.error);
      const motivo = (e: string, etiquetas: Record<string, string>) => (e === 'activo' ? undefined : (etiquetas[e] ?? e));
      return {
        semis: (s.data ?? []).map((x) => ({
          id: x.id,
          nombre: x.patente,
          noDisponible: motivo(x.estado, { taller: 'en taller', inactivo: 'fuera de servicio' }),
        })),
        tractores: (c.data ?? []).map((x) => ({ id: x.id, nombre: x.patente, noDisponible: motivo(x.estado, { taller: 'en taller' }) })),
        choferes: (ch.data ?? []).map((x) => ({
          id: x.id,
          nombre: `${x.nombre} ${x.apellido}`,
          noDisponible: motivo(x.estado, { licencia: 'de licencia' }),
        })),
        clientes: (cl.data ?? []).map((x) => ({ id: x.id, nombre: x.razon_social, noDisponible: motivo(x.estado, {}) })),
        lugares: (u.data ?? []).map((x) => ({ id: x.id, nombre: x.nombre })),
      };
    },

    async asignar(d: AsignarViajeDatos): Promise<number> {
      const { data, error } = await ops().rpc('fn_asignar_viaje', {
        p_semi: d.semiId,
        p_camion: d.camionId,
        p_chofer: d.choferId,
        p_cliente: d.clienteId,
        p_producto: d.producto,
        p_origen: d.origenId,
        p_destino: d.destinoId,
        p_fecha_carga: d.fechaCarga as string,
        p_fecha_descarga: d.fechaDescarga,
        p_contenedor: d.contenedor,
        p_tara_max_dias: d.taraMaxDias,
        p_observacion: d.observacion,
      });
      if (error) throw new RepoError(error);
      return data;
    },

    async vueltaVacia(d: VueltaVaciaDatos): Promise<number> {
      const { data, error } = await ops().rpc('fn_asignar_vuelta_vacia', {
        p_semi: d.semiId,
        p_camion: d.camionId,
        p_chofer: d.choferId,
        p_origen: d.origenId,
        p_destino: d.destinoId,
        p_fecha: d.fecha as string,
        p_observacion: d.observacion,
      });
      if (error) throw new RepoError(error);
      return data;
    },

    modificar: (d: ModificarViajeDatos) =>
      llamar(
        ops().rpc('fn_modificar_viaje', {
          p_tramo: d.tramoId,
          p_semi: d.semiId,
          p_camion: d.camionId,
          p_chofer: d.choferId,
          p_cliente: d.clienteId,
          p_producto: d.producto,
          p_origen: d.origenId,
          p_destino: d.destinoId,
          p_fecha_carga: d.fechaCarga as string,
          p_fecha_descarga: d.fechaDescarga,
          p_contenedor: d.contenedor,
          p_tara_max_dias: d.taraMaxDias,
          p_observacion: d.observacion,
        }),
      ),
    reprogramar: (tramo: number, fecha: string | null) =>
      llamar(ops().rpc('fn_reprogramar_descarga', { p_tramo: tramo, p_fecha_descarga: fecha })),
    cambiarChofer: (tramo: number, chofer: number, desde: string | null) =>
      llamar(ops().rpc('fn_cambiar_chofer', { p_tramo: tramo, p_chofer: chofer, p_desde: desde })),
    cancelar: (tramo: number, motivo: string) => llamar(ops().rpc('fn_cancelar_viaje', { p_tramo: tramo, p_motivo: motivo })),

    paso(d: PasoDatos) {
      const t = d.tramoId;
      switch (d.paso) {
        case 'salir':
          return llamar(ops().rpc('fn_iniciar_viaje', { p_tramo: t, p_inicio: d.momento, p_odometro_km: d.odometroKm }));
        case 'iniciar_carga':
          return llamar(
            ops().rpc('fn_iniciar_carga', { p_tramo: t, p_ubicacion: d.lugarId, p_inicio: d.momento, p_odometro_km: d.odometroKm }),
          );
        case 'terminar_carga':
          return llamar(ops().rpc('fn_terminar_carga', { p_tramo: t, p_fin: d.momento }));
        case 'iniciar_descarga':
          return llamar(ops().rpc('fn_iniciar_descarga', { p_tramo: t, p_ubicacion: d.lugarId, p_inicio: d.momento }));
        case 'terminar_descarga':
          return llamar(ops().rpc('fn_terminar_descarga', { p_tramo: t, p_fin: d.momento, p_odometro_km: d.odometroKm }));
        case 'terminar_viaje':
          return llamar(ops().rpc('fn_terminar_viaje', { p_tramo: t, p_fin: d.momento, p_odometro_km: d.odometroKm }));
      }
    },
  };
};
