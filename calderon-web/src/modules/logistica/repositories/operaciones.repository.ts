import { ConflictoVersion, RepoError, type Db } from '@/shared/repository/types';
import type { FechaDia, FechaISO } from '@/shared/types/dominio';
import type { OperacionRow } from '@/shared/types/database.generated';
import type {
  AltaDatos,
  AvanzarDatos,
  EliminarDatos,
  EquipoDatos,
  HitoDatos,
  LineaDatos,
  OperacionDatos,
  TerceroDatos,
  TransportistaDatos,
} from '../domain/operacion.schemas';
import { esEstadoLogistica, esPasoOperacion, parsearFacturacionOp, type GensetOpcion, type Hito, type SugerenciaCliente, type Linea, type Operacion, type TramosOperacion, type Transportista } from '../domain/operacion.types';

/** Datos de la operación como los recibe la base (ops.fn_guardar_operacion / fn_alta_operaciones). */
const datosOperacion = (d: OperacionDatos) => ({
  sin_confirmar: d.sinConfirmar,
  tipo_operacion: d.tipoOperacion,
  fecha_operacion: d.fechaOperacion,
  cliente_id: d.clienteId,
  linea_id: d.lineaId,
  lugar_retiro_id: d.lugarRetiroId,
  origen_id: d.origenId,
  lugar_aduana_id: d.lugarAduanaId,
  destino_id: d.destinoId,
  fecha_presentacion: d.fechaPresentacion,
  fecha_entrega: d.fechaEntrega,
  producto: d.producto,
  peso_kg: d.pesoKg,
  tipo_contenedor: d.tipoContenedor,
  contenedor: d.contenedor,
  contenedor_vacio: d.contenedorVacio,
  precinto: d.precinto,
  tara_max_dias: d.taraMaxDias,
  booking: d.booking,
  referencia_cliente: d.referenciaCliente,
  buque: d.buque,
  crt: d.crt,
  mic: d.mic,
  observacion: d.observacion,
});

/** Operaciones de Logística (migraciones 41 y 42). Cada acción es una función de la base; su mensaje se muestra tal cual. */
/** Fila de ops.fn_operaciones / ops.fn_operacion (mismas columnas) como la usa la web. */
function aOperacion(o: OperacionRow): Operacion {
  return {
    servicioId: o.servicio_id,
    numero: o.numero_operacion,
    fecha: o.fecha_operacion as FechaDia,
    tipo: o.tipo_operacion,
    estado: o.estado,
    estadoLogistica: esEstadoLogistica(o.estado_logistica) ? o.estado_logistica : 'programado',
    clienteId: o.cliente_id,
    cliente: o.cliente,
    lineaId: o.linea_id,
    linea: o.linea,
    lugarRetiroId: o.lugar_retiro_id,
    lugarRetiro: o.lugar_retiro,
    origenId: o.origen_id,
    origen: o.origen,
    lugarAduanaId: o.lugar_aduana_id,
    lugarAduana: o.lugar_aduana,
    destinoId: o.destino_id,
    destino: o.destino,
    fechaPresentacion: o.fecha_presentacion as FechaISO | null,
    fechaEntrega: o.fecha_entrega as FechaISO | null,
    inicioReal: o.inicio_real as FechaISO | null,
    finReal: o.fin_real as FechaISO | null,
    producto: o.producto,
    pesoKg: o.peso_kg === null ? null : Number(o.peso_kg),
    tipoContenedor: o.tipo_contenedor,
    contenedor: o.contenedor,
    contenedorVacio: o.contenedor_vacio === true,
    redline: o.redline ?? null,
    precinto: o.precinto,
    taraMaxDias: o.tara_max_dias,
    booking: o.booking,
    referenciaCliente: o.referencia_cliente,
    buque: o.buque,
    crt: o.crt,
    mic: o.mic,
    observacion: o.observacion,
    motivoCancelacion: o.motivo_cancelacion,
    transportistaId: o.transportista_id,
    transportista: o.transportista,
    terceroChofer: o.tercero_chofer,
    terceroTractor: o.tercero_tractor,
    terceroSemi: o.tercero_semi,
    tramoId: o.tramo_id,
    tramoEstado: o.tramo_estado,
    paso: o.paso,
    semiId: o.semi_id,
    semi: o.semi,
    camionId: o.camion_id,
    tractor: o.tractor,
    choferId: o.chofer_id,
    chofer: o.chofer,
    hitos: (Array.isArray(o.hitos) ? o.hitos : []) as unknown as Hito[],
    versionFila: o.version_fila,
    siguiente: o.siguiente && esPasoOperacion(o.siguiente) ? o.siguiente : null,
    posibles: (o.posibles ?? []).filter(esPasoOperacion),
    activa: o.activa ?? ['sin_confirmar', 'planificado', 'en_curso'].includes(o.estado),
    puedeVolver: o.puede_volver === true,
    gensetId: o.genset_id ?? null,
    genset: o.genset ?? null,
    facturacion: parsearFacturacionOp(o.facturacion),
  };
}

export const operacionesRepository = (db: Db) => {
  const ops = () => db.schema('ops');
  const mae = () => db.schema('mae');
  const llamar = async (p: PromiseLike<{ error: unknown }>) => {
    const { error } = await p;
    if (error) throw new RepoError(error as never);
  };

  return {
    /** Las abiertas siempre; las terminadas o canceladas, con fecha de operación entre desde y hasta. */
    async listar(desde: FechaDia | null, hasta: FechaDia | null): Promise<Operacion[]> {
      const { data, error } = await ops().rpc('fn_operaciones', { p_desde: desde, p_hasta: hasta });
      if (error) throw new RepoError(error);
      return (data ?? []).map(aOperacion);
    },

    /** Alta en un paso: varias iguales o una con su equipo. Devuelve los ids. */
    /** Una operación por su id (migración 114, ficha del panel); null si no existe. */
    async obtener(servicio: number): Promise<Operacion | null> {
      const { data, error } = await ops().rpc('fn_operacion', { p_servicio: servicio });
      if (error) throw new RepoError(error);
      const fila = (data ?? [])[0];
      return fila ? aOperacion(fila) : null;
    },

    async alta(d: AltaDatos): Promise<number[]> {
      const { data, error } = await ops().rpc('fn_alta_operaciones', {
        p_cantidad: d.cantidad,
        p_datos: {
          ...datosOperacion(d),
          semi_id: d.semiId,
          camion_id: d.camionId,
          chofer_id: d.choferId,
        },
      });
      if (error) throw new RepoError(error);
      return data ?? [];
    },

    avanzar: (d: AvanzarDatos) =>
      llamar(
        ops().rpc('fn_avanzar', {
          p_servicio: d.servicioId,
          p_paso: d.paso,
          p_ts: d.momento,
          p_odometro_km: d.odometroKm,
          p_detalle: d.detalle,
        }),
      ),

    async tramos(servicio: number): Promise<TramosOperacion> {
      const { data, error } = await ops().rpc('fn_tramos_de_operacion', { p_servicio: servicio });
      if (error) throw new RepoError(error);
      const j = (data ?? {}) as Record<string, unknown>;
      const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
      return {
        lineaOperacion: typeof j.linea_operacion === 'string' ? j.linea_operacion : null,
        kmOperacion: num(j.km_operacion),
        tramos: (Array.isArray(j.tramos) ? (j.tramos as Record<string, unknown>[]) : []).map((t) => ({
          viajeId: Number(t.viaje_id),
          viaje: String(t.viaje ?? ''),
          estadoViaje: String(t.estado_viaje ?? ''),
          chofer: typeof t.chofer === 'string' ? t.chofer : null,
          camion: typeof t.camion === 'string' ? t.camion : null,
          linea: typeof t.linea === 'string' ? t.linea : null,
          km: num(t.km),
        })),
      };
    },
    async sugerencia(cliente: number): Promise<SugerenciaCliente | null> {
      const { data, error } = await ops().rpc('fn_sugerencia_cliente', { p_cliente: cliente });
      if (error) throw new RepoError(error);
      if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
      const j = data as Record<string, unknown>;
      const n = (k: string) => (typeof j[k] === 'number' ? (j[k] as number) : undefined);
      const t = (k: string) => (typeof j[k] === 'string' ? (j[k] as string) : undefined);
      return {
        tipoOperacion: t('tipo_operacion'),
        lineaId: n('linea_id'),
        lugarRetiroId: n('lugar_retiro_id'),
        origenId: n('origen_id'),
        lugarAduanaId: n('lugar_aduana_id'),
        destinoId: n('destino_id'),
        producto: t('producto'),
        tipoContenedor: t('tipo_contenedor'),
        taraMaxDias: n('tara_max_dias'),
      };
    },

    async guardar(d: OperacionDatos): Promise<number> {
      const { data, error } = await ops().rpc('fn_guardar_operacion', {
        p_servicio: d.servicioId,
        p_version: d.versionFila,
        p_datos: datosOperacion(d),
      });
      if (error) throw new RepoError(error);
      return data;
    },

    confirmar: (servicio: number) => llamar(ops().rpc('fn_confirmar_operacion', { p_servicio: servicio })),
    async asignarEquipo(d: EquipoDatos): Promise<number> {
      const { data, error } = await ops().rpc('fn_asignar_equipo', {
        p_servicio: d.servicioId,
        p_semi: d.semiId,
        p_camion: d.camionId,
        p_chofer: d.choferId,
        p_observacion: d.observacion,
      });
      if (error) throw new RepoError(error);
      return data;
    },
    quitarEquipo: (servicio: number, motivo: string | null) =>
      llamar(ops().rpc('fn_quitar_equipo', { p_servicio: servicio, p_motivo: motivo })),
    asignarTercero: (d: TerceroDatos) =>
      llamar(
        ops().rpc('fn_asignar_tercero', {
          p_servicio: d.servicioId,
          p_transportista: d.transportistaId,
          p_chofer: d.chofer,
          p_tractor: d.tractor,
          p_semi: d.semi,
        }),
      ),
    async registrarHito(d: HitoDatos): Promise<number> {
      const { data, error } = await ops().rpc('fn_registrar_hito', {
        p_servicio: d.servicioId,
        p_tipo: d.tipo,
        p_ts: d.momento,
        p_detalle: d.detalle,
      });
      if (error) throw new RepoError(error);
      return data;
    },
    terminarDemora: (servicio: number, hasta: string | null) =>
      llamar(ops().rpc('fn_terminar_demora', { p_servicio: servicio, p_hasta: hasta })),
    anularHito: (hito: number) => llamar(ops().rpc('fn_anular_hito', { p_hito: hito })),
    /** Migración 101: deshace el último paso; devuelve cuál. */
    async volverPaso(servicio: number): Promise<string> {
      const { data, error } = await ops().rpc('fn_volver_paso', { p_servicio: servicio });
      if (error) throw new RepoError(error);
      return data;
    },
    asignarGenset: (servicio: number, genset: number | null) =>
      llamar(ops().rpc('fn_asignar_genset', { p_servicio: servicio, p_genset: genset })),
    async gensets(servicio: number): Promise<GensetOpcion[]> {
      const { data, error } = await ops().rpc('fn_gensets_operacion', { p_servicio: servicio });
      if (error) throw new RepoError(error);
      return (Array.isArray(data) ? (data as Record<string, unknown>[]) : []).map((g) => ({
        id: Number(g.id),
        codigo: String(g.codigo),
        detalle: [g.marca, g.modelo].filter(Boolean).join(' ') || null,
        enSemi: g.en_semi === true,
        semi: (g.semi as string | null) ?? null,
        enOperacion: g.en_operacion == null ? null : Number(g.en_operacion),
      }));
    },
    cancelar: (servicio: number, motivo: string) => llamar(ops().rpc('fn_cancelar_operacion', { p_servicio: servicio, p_motivo: motivo })),

    // ---------------------------------------------------------------- líneas
    async lineas(): Promise<Linea[]> {
      const { data, error } = await mae()
        .from('linea')
        .select('id, codigo, lugar_retiro_id, lugar_entrega_id, lugar_aduana_id, distancia_km, cruza_frontera, transit_horas, activa, canon_chofer, canon_moneda, consumo_objetivo_l_100km, version_fila')
        .is('eliminado_en', null)
        .order('codigo');
      if (error) throw new RepoError(error);
      return data.map((l) => ({
        id: l.id,
        codigo: l.codigo,
        lugarRetiroId: l.lugar_retiro_id,
        lugarEntregaId: l.lugar_entrega_id,
        lugarAduanaId: l.lugar_aduana_id,
        distanciaKm: l.distancia_km === null ? null : Number(l.distancia_km),
        cruzaFrontera: l.cruza_frontera,
        transitHoras: l.transit_horas,
        activa: l.activa,
        canonChofer: l.canon_chofer === null ? null : Number(l.canon_chofer),
        canonMoneda: l.canon_moneda?.trim() ?? null,
        consumoObjetivo: l.consumo_objetivo_l_100km === null ? null : Number(l.consumo_objetivo_l_100km),
        versionFila: l.version_fila,
      }));
    },
    async guardarLinea(d: LineaDatos): Promise<void> {
      const fila = {
        codigo: d.codigo,
        lugar_retiro_id: d.lugarRetiroId,
        lugar_entrega_id: d.lugarEntregaId,
        lugar_aduana_id: d.lugarAduanaId,
        distancia_km: d.distanciaKm,
        cruza_frontera: d.cruzaFrontera,
        transit_horas: d.transitHoras,
        activa: d.activa,
        canon_chofer: d.canonChofer,
        canon_moneda: d.canonChofer === null ? null : d.canonMoneda,
        consumo_objetivo_l_100km: d.consumoObjetivo,
      };
      if (d.id === null) {
        const { error } = await mae().from('linea').insert(fila);
        if (error) throw new RepoError(error);
        return;
      }
      const { data, error } = await mae()
        .from('linea')
        .update({ ...fila, version_fila: d.versionFila ?? 0 })
        .eq('id', d.id)
        .eq('version_fila', d.versionFila ?? 0)
        .select('id')
        .maybeSingle();
      if (error) throw new RepoError(error);
      if (!data) throw new ConflictoVersion('mae.linea', d.id);
    },
    async eliminarLinea(d: EliminarDatos): Promise<void> {
      const { data, error } = await mae()
        .from('linea')
        .update({ eliminado_en: new Date().toISOString(), version_fila: d.versionFila })
        .eq('id', d.id)
        .eq('version_fila', d.versionFila)
        .select('id')
        .maybeSingle();
      if (error) throw new RepoError(error);
      if (!data) throw new ConflictoVersion('mae.linea', d.id);
    },

    // --------------------------------------------------------- transportistas
    async transportistas(): Promise<Transportista[]> {
      const { data, error } = await mae()
        .from('transportista')
        .select('id, razon_social, cuit, telefono, observaciones, activo, version_fila')
        .is('eliminado_en', null)
        .order('razon_social');
      if (error) throw new RepoError(error);
      return data.map((t) => ({
        id: t.id,
        razonSocial: t.razon_social,
        cuit: t.cuit,
        telefono: t.telefono,
        observaciones: t.observaciones,
        activo: t.activo,
        versionFila: t.version_fila,
      }));
    },
    async guardarTransportista(d: TransportistaDatos): Promise<void> {
      const fila = { razon_social: d.razonSocial, cuit: d.cuit, telefono: d.telefono, observaciones: d.observaciones, activo: d.activo };
      if (d.id === null) {
        const { error } = await mae().from('transportista').insert(fila);
        if (error) throw new RepoError(error);
        return;
      }
      const { data, error } = await mae()
        .from('transportista')
        .update({ ...fila, version_fila: d.versionFila ?? 0 })
        .eq('id', d.id)
        .eq('version_fila', d.versionFila ?? 0)
        .select('id')
        .maybeSingle();
      if (error) throw new RepoError(error);
      if (!data) throw new ConflictoVersion('mae.transportista', d.id);
    },
    async eliminarTransportista(d: EliminarDatos): Promise<void> {
      const { data, error } = await mae()
        .from('transportista')
        .update({ eliminado_en: new Date().toISOString(), version_fila: d.versionFila })
        .eq('id', d.id)
        .eq('version_fila', d.versionFila)
        .select('id')
        .maybeSingle();
      if (error) throw new RepoError(error);
      if (!data) throw new ConflictoVersion('mae.transportista', d.id);
    },
  };
};
