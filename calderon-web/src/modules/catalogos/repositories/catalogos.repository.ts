import { ConflictoVersion, RepoError, type Db } from '@/shared/repository/types';
import type { Json } from '@/shared/types/db';
import type { FechaDia } from '@/shared/types/dominio';
import type { Eliminar, EstacionDatos, ParametroDatos, ProveedorDatos, TipoCambioDatos, UbicacionDatos } from '../domain/catalogos.schemas';
import { parsearTiposCarga, type TipoCargaDatos, type TiposCarga } from '../domain/tipos-carga';
import {
  esTipoProveedor,
  tasaDesde,
  tipoValor,
  type Estacion,
  type ImportacionCotizacion,
  type Opcion,
  type Parametro,
  type Proveedor,
  type TipoCambio,
  type TipoUbicacion,
  type Ubicacion,
} from '../domain/catalogos.types';

/**
 * Catálogos (migración 28). Escrituras directas a las tablas con concurrencia optimista;
 * la base aplica las reglas y su mensaje se muestra tal cual.
 */
export const catalogosRepository = (db: Db) => {
  const mae = () => db.schema('mae');

  return {
    // ---------------------------------------------------------------- apoyo
    async paises(): Promise<Opcion[]> {
      const { data, error } = await db.schema('ref').from('pais').select('iso2, nombre').is('eliminado_en', null).order('nombre');
      if (error) throw new RepoError(error);
      return data.map((p) => ({ codigo: p.iso2.trim(), nombre: p.nombre }));
    },
    async monedas(): Promise<(Opcion & { esBase: boolean })[]> {
      const { data, error } = await db.schema('ref').from('moneda').select('codigo, nombre, es_base').is('eliminado_en', null).order('codigo');
      if (error) throw new RepoError(error);
      return data.map((m) => ({ codigo: m.codigo.trim(), nombre: m.nombre, esBase: m.es_base }));
    },

    // ---------------------------------------------------------- proveedores
    async proveedores(): Promise<Proveedor[]> {
      const { data, error } = await mae()
        .from('proveedor')
        .select('id, codigo, razon_social, identificador_fiscal, pais, tipo, moneda_defecto, version_fila')
        .is('eliminado_en', null)
        .order('razon_social');
      if (error) throw new RepoError(error);
      return data.map((p) => ({
        id: p.id,
        codigo: p.codigo,
        razonSocial: p.razon_social,
        identificadorFiscal: p.identificador_fiscal,
        pais: p.pais.trim(),
        tipo: esTipoProveedor(p.tipo) ? p.tipo : 'otro',
        monedaDefecto: p.moneda_defecto?.trim() ?? null,
        versionFila: p.version_fila,
      }));
    },
    async guardarProveedor(d: ProveedorDatos): Promise<void> {
      const fila = {
        codigo: d.codigo,
        razon_social: d.razonSocial,
        identificador_fiscal: d.identificadorFiscal,
        pais: d.pais,
        tipo: d.tipo,
        moneda_defecto: d.monedaDefecto,
      };
      if (d.id === null) {
        const { error } = await mae().from('proveedor').insert(fila);
        if (error) throw new RepoError(error);
        return;
      }
      const { data, error } = await mae()
        .from('proveedor')
        .update({ ...fila, version_fila: d.versionFila ?? 0 })
        .eq('id', d.id)
        .eq('version_fila', d.versionFila ?? 0)
        .select('id')
        .maybeSingle();
      if (error) throw new RepoError(error);
      if (!data) throw new ConflictoVersion('mae.proveedor', d.id);
    },
    async eliminarProveedor(d: Eliminar): Promise<void> {
      const { data, error } = await mae()
        .from('proveedor')
        .update({ eliminado_en: new Date().toISOString(), version_fila: d.versionFila })
        .eq('id', d.id)
        .eq('version_fila', d.versionFila)
        .select('id')
        .maybeSingle();
      if (error) throw new RepoError(error);
      if (!data) throw new ConflictoVersion('mae.proveedor', d.id);
    },

    // ----------------------------------------------------------- estaciones
    async estaciones(): Promise<Estacion[]> {
      const { data, error } = await mae()
        .from('estacion_servicio')
        .select('id, codigo, nombre, proveedor_id, pais, es_tanque_propio, version_fila, ubicacion_id')
        .is('eliminado_en', null)
        .order('nombre');
      if (error) throw new RepoError(error);
      // Migración 143: el punto de cada estación está en su ubicación
      const ids = data.map((e) => e.ubicacion_id).filter((x): x is number => x !== null);
      const puntos = new Map<number, { latitud: number | null; longitud: number | null }>();
      if (ids.length > 0) {
        const u = await mae().from('ubicacion').select('id, latitud, longitud').in('id', ids).is('eliminado_en', null);
        if (u.error) throw new RepoError(u.error);
        for (const x of u.data) puntos.set(x.id, { latitud: x.latitud === null ? null : Number(x.latitud), longitud: x.longitud === null ? null : Number(x.longitud) });
      }
      return data.map((e) => ({
        id: e.id,
        codigo: e.codigo,
        nombre: e.nombre,
        proveedorId: e.proveedor_id,
        pais: e.pais.trim(),
        esTanquePropio: e.es_tanque_propio,
        versionFila: e.version_fila,
        latitud: e.ubicacion_id === null ? null : (puntos.get(e.ubicacion_id)?.latitud ?? null),
        longitud: e.ubicacion_id === null ? null : (puntos.get(e.ubicacion_id)?.longitud ?? null),
      }));
    },
    async guardarEstacion(d: EstacionDatos): Promise<void> {
      const fila = { codigo: d.codigo, nombre: d.nombre, proveedor_id: d.proveedorId, pais: d.pais, es_tanque_propio: d.esTanquePropio };
      let id = d.id;
      if (id === null) {
        const { data, error } = await mae().from('estacion_servicio').insert(fila).select('id').single();
        if (error) throw new RepoError(error);
        id = data.id;
      } else {
        const { data, error } = await mae()
          .from('estacion_servicio')
          .update({ ...fila, version_fila: d.versionFila ?? 0 })
          .eq('id', id)
          .eq('version_fila', d.versionFila ?? 0)
          .select('id')
          .maybeSingle();
        if (error) throw new RepoError(error);
        if (!data) throw new ConflictoVersion('mae.estacion_servicio', id);
      }
      // Migración 143: el punto en el mapa (solo si el formulario lo manda)
      if (d.latitud !== undefined && d.longitud !== undefined) {
        const { error } = await mae().rpc('fn_ubicar_estacion', { p_estacion: id, p_latitud: d.latitud, p_longitud: d.longitud });
        if (error) throw new RepoError(error);
      }
    },
    async eliminarEstacion(d: Eliminar): Promise<void> {
      const { data, error } = await mae()
        .from('estacion_servicio')
        .update({ eliminado_en: new Date().toISOString(), version_fila: d.versionFila })
        .eq('id', d.id)
        .eq('version_fila', d.versionFila)
        .select('id')
        .maybeSingle();
      if (error) throw new RepoError(error);
      if (!data) throw new ConflictoVersion('mae.estacion_servicio', d.id);
    },

    // ----------------------------------------------------------- ubicaciones
    async ubicaciones(): Promise<Ubicacion[]> {
      const { data, error } = await mae()
        .from('ubicacion')
        .select('id, codigo, nombre, tipo, pais, latitud, longitud, radio_geocerca_m, version_fila')
        .is('eliminado_en', null)
        .order('nombre');
      if (error) throw new RepoError(error);
      return data.map((u) => ({
        id: u.id,
        codigo: u.codigo,
        nombre: u.nombre,
        tipo: u.tipo as TipoUbicacion,
        pais: u.pais.trim(),
        latitud: u.latitud === null ? null : Number(u.latitud),
        longitud: u.longitud === null ? null : Number(u.longitud),
        radioM: u.radio_geocerca_m,
        versionFila: u.version_fila,
      }));
    },
    async guardarUbicacion(d: UbicacionDatos): Promise<void> {
      const fila = { codigo: d.codigo, nombre: d.nombre, tipo: d.tipo, pais: d.pais, latitud: d.latitud, longitud: d.longitud, radio_geocerca_m: d.radioM };
      if (d.id === null) {
        const { error } = await mae().from('ubicacion').insert(fila);
        if (error) throw new RepoError(error);
        return;
      }
      const { data, error } = await mae()
        .from('ubicacion')
        .update({ ...fila, version_fila: d.versionFila ?? 0 })
        .eq('id', d.id)
        .eq('version_fila', d.versionFila ?? 0)
        .select('id')
        .maybeSingle();
      if (error) throw new RepoError(error);
      if (!data) throw new ConflictoVersion('mae.ubicacion', d.id);
    },
    async eliminarUbicacion(d: Eliminar): Promise<void> {
      const { data, error } = await mae()
        .from('ubicacion')
        .update({ eliminado_en: new Date().toISOString(), version_fila: d.versionFila })
        .eq('id', d.id)
        .eq('version_fila', d.versionFila)
        .select('id')
        .maybeSingle();
      if (error) throw new RepoError(error);
      if (!data) throw new ConflictoVersion('mae.ubicacion', d.id);
    },

    // ------------------------------------------------------- tipos de cambio
    /** Últimas cotizaciones oficiales (las que usan las cargas), más nuevas primero. */
    async tiposCambio(p: { moneda?: string; limite?: number }): Promise<TipoCambio[]> {
      let q = db
        .schema('fin')
        .from('tipo_cambio')
        .select('id, fecha, moneda_origen, moneda_destino, tasa::text, tipo, fuente, version_fila')
        .is('eliminado_en', null)
        .eq('tipo', 'oficial');
      if (p.moneda) q = q.eq('moneda_origen', p.moneda);
      const { data, error } = await q.order('fecha', { ascending: false }).order('moneda_origen').limit(p.limite ?? 120);
      if (error) throw new RepoError(error);
      return (data as unknown as { id: number; fecha: string; moneda_origen: string; moneda_destino: string; tasa: string; tipo: string; fuente: string | null; version_fila: number }[]).map((t) => ({
        id: t.id,
        fecha: t.fecha as FechaDia,
        moneda: t.moneda_origen.trim(),
        monedaBase: t.moneda_destino.trim(),
        tasa: Number(t.tasa),
        tipo: t.tipo,
        fuente: t.fuente,
        versionFila: t.version_fila,
      }));
    },
    async crearTipoCambio(d: TipoCambioDatos, monedaBase: string): Promise<void> {
      const { error } = await db.schema('fin').from('tipo_cambio').insert({
        fecha: d.fecha,
        moneda_origen: d.moneda,
        moneda_destino: monedaBase,
        tasa: tasaDesde(d.valor, d.sentido),
        tipo: 'oficial',
        fuente: d.fuente,
      });
      if (error) throw new RepoError(error);
    },
    async eliminarTipoCambio(d: Eliminar): Promise<void> {
      const { data, error } = await db
        .schema('fin')
        .from('tipo_cambio')
        .update({ eliminado_en: new Date().toISOString(), version_fila: d.versionFila })
        .eq('id', d.id)
        .eq('version_fila', d.versionFila)
        .select('id')
        .maybeSingle();
      if (error) throw new RepoError(error);
      if (!data) throw new ConflictoVersion('fin.tipo_cambio', d.id);
    },

    /** Pide ahora la actualización automática (BCRA y Banco Central de Chile). */
    async actualizarCotizaciones(bcra: unknown | null): Promise<{ ok: boolean; insertadas: number; avisos: string[] }> {
      const { data, error } = await db
        .schema('fin')
        .rpc('fn_actualizar_cotizaciones', { p_dias: 10, p_origen: 'manual', ...(bcra ? { p_bcra: bcra as Json } : {}) });
      if (error) throw new RepoError(error);
      const r = (data ?? {}) as { ok?: boolean; insertadas?: number; avisos?: string[] };
      return { ok: r.ok === true, insertadas: r.insertadas ?? 0, avisos: r.avisos ?? [] };
    },
    async importaciones(): Promise<ImportacionCotizacion[]> {
      const { data, error } = await db
        .schema('fin')
        .from('importacion_cotizacion')
        .select('id, ejecutado_en, origen, ok, insertadas, detalle')
        .order('ejecutado_en', { ascending: false })
        .limit(5);
      if (error) throw new RepoError(error);
      return data.map((f) => ({
        id: f.id,
        ejecutadoEn: f.ejecutado_en,
        origen: f.origen === 'programada' ? 'programada' : 'manual',
        ok: f.ok,
        insertadas: f.insertadas,
        detalle: f.detalle,
      }));
    },
    async definirMonedaBase(codigo: string): Promise<void> {
      const { error } = await db.schema('ref').rpc('fn_definir_moneda_base', { p_codigo: codigo });
      if (error) throw new RepoError(error);
    },

    // ------------------------------------------------------------ parámetros
    /** Migración 121: tipos de carga (la base dice si el usuario los puede editar). */
    async tiposCarga(): Promise<TiposCarga> {
      const { data, error } = await db.schema('ref').rpc('fn_tipos_carga');
      if (error) throw new RepoError(error);
      return parsearTiposCarga(data);
    },

    async guardarTipoCarga(d: TipoCargaDatos): Promise<number> {
      const { data, error } = await db.schema('ref').rpc('fn_guardar_tipo_carga', {
        p_id: d.id,
        p_datos: { nombre: d.nombre, requiere_frio: d.requiereFrio, es_contenedor: d.esContenedor, activo: d.activo, orden: d.orden },
      });
      if (error) throw new RepoError(error);
      return data;
    },

    async parametros(): Promise<Parametro[]> {
      const { data, error } = await db
        .schema('ref')
        .from('parametro')
        .select('codigo, valor, descripcion, actualizado_en, version_fila')
        .is('eliminado_en', null)
        .order('codigo');
      if (error) throw new RepoError(error);
      return data.map((p) => ({
        codigo: p.codigo,
        valor: p.valor,
        tipoValor: tipoValor(p.valor),
        descripcion: p.descripcion,
        provisional: /PROVISIONAL/i.test(p.descripcion),
        obsoleto: /^OBSOLETO/i.test(p.descripcion),
        actualizadoEn: p.actualizado_en,
        versionFila: p.version_fila,
      }));
    },
    async guardarParametro(d: ParametroDatos): Promise<void> {
      const { data, error } = await db
        .schema('ref')
        .from('parametro')
        .update({ valor: d.valor as Json, descripcion: d.descripcion, version_fila: d.versionFila })
        .eq('codigo', d.codigo)
        .eq('version_fila', d.versionFila)
        .select('codigo')
        .maybeSingle();
      if (error) throw new RepoError(error);
      if (!data) throw new ConflictoVersion('ref.parametro', 0);
    },
  };
};
