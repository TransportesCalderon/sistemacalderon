import { RepoError, type Db } from '@/shared/repository/types';
import type { Json } from '@/shared/types/db';
import { parsearActa, parsearActas, type Acta, type Actas, type CambiarActa, type CrearActa, type TipoActa } from '../domain/acta.types';

const nulo = (v: string | null | undefined) => (v === undefined || v === null || v.trim() === '' ? null : v.trim());

/** Migración 122 · Actas de infracción. Todo lo decide la base; su mensaje se muestra tal cual. */
export const actaRepository = (db: Db) => {
  const ops = () => db.schema('ops');
  return {
    async lista(f: { desde: string | null; hasta: string | null; choferId: number | null; tipo: TipoActa | null }): Promise<Actas> {
      const { data, error } = await ops().rpc('fn_actas', { p_desde: f.desde, p_hasta: f.hasta, p_chofer: f.choferId, p_tipo: f.tipo });
      if (error) throw new RepoError(error);
      return parsearActas(data);
    },

    async detalle(id: number): Promise<Acta> {
      const { data, error } = await ops().rpc('fn_acta', { p_id: id });
      if (error) throw new RepoError(error);
      return parsearActa(data);
    },

    async crear(d: CrearActa): Promise<number> {
      const datos: Record<string, Json | undefined> = d.alertaId
        ? { alerta_id: d.alertaId, descripcion: nulo(d.descripcion), lugar: nulo(d.lugar) }
        : { tipo: d.tipo, chofer_id: d.choferId, camion_id: d.camionId, fecha: d.fecha, lugar: nulo(d.lugar), descripcion: nulo(d.descripcion) };
      if (d.monto !== null || d.descontar) {
        Object.assign(datos, {
          monto: d.monto,
          moneda: d.moneda,
          descontar: d.descontar,
          importe_descuento: d.importeDescuento,
          periodo_descuento: d.periodoDescuento,
        });
      }
      const { data, error } = await ops().rpc('fn_crear_acta', { p_datos: datos });
      if (error) throw new RepoError(error);
      return data;
    },

    async cambiar(d: CambiarActa): Promise<void> {
      const datos: Record<string, Json | undefined> = { lugar: nulo(d.lugar), descripcion: d.descripcion };
      if (d.dinero) {
        Object.assign(datos, {
          monto: d.dinero.monto,
          moneda: d.dinero.moneda,
          descontar: d.dinero.descontar,
          importe_descuento: d.dinero.importeDescuento,
          periodo_descuento: d.dinero.periodoDescuento,
        });
      }
      const { error } = await ops().rpc('fn_cambiar_acta', { p_id: d.id, p_version: d.version, p_datos: datos });
      if (error) throw new RepoError(error);
    },

    async agregarFoto(actaId: number, ruta: string, nombre: string | null): Promise<number> {
      const { data, error } = await ops().rpc('fn_agregar_foto_acta', { p_acta: actaId, p_ruta: ruta, p_nombre: nombre });
      if (error) throw new RepoError(error);
      return data;
    },

    async quitarFoto(fotoId: number): Promise<string> {
      const { data, error } = await ops().rpc('fn_quitar_foto_acta', { p_foto: fotoId });
      if (error) throw new RepoError(error);
      return data;
    },

    async firmar(id: number, ruta: string | null, descargo: string, seNego: boolean): Promise<void> {
      const { error } = await ops().rpc('fn_firmar_acta', { p_id: id, p_ruta: ruta, p_descargo: nulo(descargo), p_se_nego: seNego });
      if (error) throw new RepoError(error);
    },

    async anular(id: number, motivo: string): Promise<void> {
      const { error } = await ops().rpc('fn_anular_acta', { p_id: id, p_motivo: motivo });
      if (error) throw new RepoError(error);
    },
  };
};
