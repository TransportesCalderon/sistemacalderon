import { RepoError, type Db } from '@/shared/repository/types';
import type { Json } from '@/shared/types/database.generated';
import {
  parsearCotizacion,
  parsearCotizaciones,
  parsearEmpresa,
  parsearEmpresas,
  parsearFactura,
  parsearFacturas,
  parsearPorFacturar,
  parsearSugerencia,
  parsearTablero,
  parsearTarifario,
} from '../domain/ventas.types';
import type {
  ActividadEntrada,
  AdicionalEntrada,
  ContactoEntrada,
  CotizacionEntrada,
  EmpresaEntrada,
  GuardarFacturaEntrada,
  HacerClienteEntrada,
  NegocioEntrada,
  ParametrosEntrada,
  TarifaEntrada,
} from '../domain/ventas.schemas';

/** Ventas (migraciones 67 y 68). Todo pasa por funciones de la base; su mensaje se muestra tal cual. */
export const ventasRepository = (db: Db) => {
  // Migración 68: Ventas se publica por ops (ops.fn_ven_* llama a ven.*); no hace falta exponer «ven» en la API
  const ven = () => db.schema('ops');
  const leer = async <T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> => {
    const { data, error } = await p;
    if (error) throw new RepoError(error as never);
    return data as T;
  };
  return {
    // Lecturas
    async tablero() {
      return parsearTablero(await leer(ven().rpc('fn_ven_tablero')));
    },
    async empresas(texto: string | null, solo: string | null) {
      return parsearEmpresas(await leer(ven().rpc('fn_ven_empresas', { p_texto: texto, p_solo: solo })));
    },
    async empresa(id: number) {
      return parsearEmpresa(await leer(ven().rpc('fn_ven_empresa', { p_id: id })));
    },
    async tarifario() {
      return parsearTarifario(await leer(ven().rpc('fn_ven_tarifario')));
    },
    async sugerir(lineaId: number, empresaId: number, unidad: string, contenedor: string | null, vueltaVacia: boolean) {
      return parsearSugerencia(
        await leer(
          ven().rpc('fn_ven_sugerir', { p_linea: lineaId, p_empresa: empresaId, p_unidad: unidad, p_contenedor: contenedor, p_vuelta_vacia: vueltaVacia }),
        ),
      );
    },
    async cotizaciones(estado: string | null, texto: string | null) {
      return parsearCotizaciones(await leer(ven().rpc('fn_ven_cotizaciones', { p_estado: estado, p_texto: texto })));
    },
    async cotizacion(id: number) {
      return parsearCotizacion(await leer(ven().rpc('fn_ven_cotizacion', { p_id: id })));
    },
    async porFacturar() {
      return parsearPorFacturar(await leer(ven().rpc('fn_ven_por_facturar')));
    },
    async facturas(estado: string | null) {
      return parsearFacturas(await leer(ven().rpc('fn_ven_facturas', { p_estado: estado })));
    },
    async factura(id: number) {
      return parsearFactura(await leer(ven().rpc('fn_ven_factura', { p_id: id })));
    },

    // Seguimiento
    async guardarEmpresa(e: EmpresaEntrada): Promise<number> {
      return leer(
        ven().rpc('fn_ven_guardar_empresa', {
          p_id: e.id,
          p_datos: {
            nombre: e.nombre,
            pais: e.pais,
            rubro: e.rubro,
            origen: e.origen,
            responsable_id: e.responsableId,
            notas: e.notas,
            descartada: e.descartada ?? null,
          } as Json,
        }),
      );
    },
    async guardarContacto(c: ContactoEntrada): Promise<number> {
      return leer(
        ven().rpc('fn_ven_guardar_contacto', {
          p_id: c.id,
          p_empresa: c.empresaId,
          p_datos: { nombre: c.nombre, cargo: c.cargo, email: c.email, telefono: c.telefono, principal: c.principal } as Json,
        }),
      );
    },
    async quitarContacto(id: number) {
      await leer(ven().rpc('fn_ven_quitar_contacto', { p_id: id }));
    },
    async guardarNegocio(n: NegocioEntrada): Promise<number> {
      return leer(
        ven().rpc('fn_ven_guardar_negocio', {
          p_id: n.id,
          p_empresa: n.empresaId,
          p_datos: {
            titulo: n.titulo,
            linea_id: n.lineaId,
            viajes_mes: n.viajesMes,
            valor_mensual_usd: n.valorMensualUsd,
            cierre_estimado: n.cierreEstimado,
          } as Json,
        }),
      );
    },
    async moverNegocio(id: number, etapa: string, motivo: string | null) {
      await leer(ven().rpc('fn_ven_mover_negocio', { p_id: id, p_etapa: etapa, p_motivo: motivo }));
    },
    async guardarActividad(a: ActividadEntrada): Promise<number> {
      return leer(
        ven().rpc('fn_ven_guardar_actividad', {
          p_id: a.id,
          p_empresa: a.empresaId,
          p_datos: {
            tipo: a.tipo,
            titulo: a.titulo,
            fecha: a.fecha,
            oportunidad_id: a.oportunidadId,
            hecha: a.hecha ?? false,
            resultado: a.resultado,
          } as Json,
        }),
      );
    },
    async completarActividad(id: number, resultado: string | null) {
      await leer(ven().rpc('fn_ven_completar_actividad', { p_id: id, p_resultado: resultado }));
    },
    async quitarActividad(id: number) {
      await leer(ven().rpc('fn_ven_quitar_actividad', { p_id: id }));
    },
    async hacerCliente(h: HacerClienteEntrada): Promise<number> {
      return leer(
        ven().rpc('fn_ven_hacer_cliente', {
          p_empresa: h.empresaId,
          p_cliente_existente: h.clienteExistenteId,
          p_datos: h.clienteExistenteId
            ? null
            : ({
                razon_social: h.razonSocial,
                identificador_fiscal: h.identificadorFiscal,
                pais: h.pais,
                condicion_pago_dias: h.condicionPagoDias,
              } as Json),
        }),
      );
    },

    // Tarifario
    async guardarTarifa(t: TarifaEntrada): Promise<number> {
      return leer(
        ven().rpc('fn_ven_guardar_tarifa', {
          p_linea: t.lineaId,
          p_cliente: t.clienteId,
          p_unidad: t.unidad,
          p_precio: t.precioUsd as number,
          p_desde: t.desde,
          p_contenedor: t.tipoContenedor,
          p_observacion: t.observacion,
        }),
      );
    },
    async quitarTarifa(id: number) {
      await leer(ven().rpc('fn_ven_quitar_tarifa', { p_id: id }));
    },
    async guardarAdicional(a: AdicionalEntrada) {
      await leer(
        ven().rpc('fn_ven_guardar_adicional', { p_codigo: a.codigo, p_nombre: a.nombre, p_unidad: a.unidad, p_precio: a.precioUsd, p_activo: a.activo }),
      );
    },
    async guardarParametros(p: ParametrosEntrada) {
      await leer(
        ven().rpc('fn_ven_guardar_parametros', {
          p_margen: p.margen as number,
          p_validez: p.validez,
          p_condiciones: p.condiciones,
          p_costo_km_manual: p.costoKmManual,
        }),
      );
    },
    async recalcularCostoKm() {
      await leer(ven().rpc('fn_ven_recalcular_costo_km'));
    },

    // Cotizaciones
    async guardarCotizacion(c: CotizacionEntrada): Promise<number> {
      return leer(
        ven().rpc('fn_ven_guardar_cotizacion', {
          p_id: c.id,
          p_version: c.version,
          p_datos: {
            empresa_id: c.empresaId,
            contacto_id: c.contactoId,
            oportunidad_id: c.oportunidadId,
            fecha: c.fecha,
            validez_dias: c.validezDias,
            condiciones: c.condiciones,
            observacion: c.observacion,
            renglones: c.renglones.map((r, i) => ({
              orden: i + 1,
              tipo: r.tipo,
              linea_id: r.lineaId,
              adicional_codigo: r.adicionalCodigo,
              descripcion: r.descripcion,
              tipo_operacion: r.tipoOperacion,
              tipo_contenedor: r.tipoContenedor,
              unidad: r.unidad,
              cantidad: r.cantidad,
              viajes: r.viajes,
              vuelta_vacia: r.vueltaVacia,
              precio_usd: r.precioUsd,
            })),
          } as Json,
        }),
      );
    },
    async enviarCotizacion(id: number, version: number) {
      await leer(ven().rpc('fn_ven_enviar_cotizacion', { p_id: id, p_version: version }));
    },
    async responderCotizacion(id: number, aceptada: boolean, motivo: string | null, guardarTarifas: boolean): Promise<number> {
      return leer(ven().rpc('fn_ven_responder_cotizacion', { p_id: id, p_aceptada: aceptada, p_motivo: motivo, p_guardar_tarifas: guardarTarifas }));
    },
    async anularCotizacion(id: number, motivo: string) {
      await leer(ven().rpc('fn_ven_anular_cotizacion', { p_id: id, p_motivo: motivo }));
    },
    async duplicarCotizacion(id: number): Promise<number> {
      return leer(ven().rpc('fn_ven_duplicar_cotizacion', { p_id: id }));
    },

    // Facturación
    async crearFactura(clienteId: number, servicios: number[]): Promise<number> {
      return leer(ven().rpc('fn_ven_crear_factura', { p_cliente: clienteId, p_servicios: servicios }));
    },
    async guardarFactura(f: GuardarFacturaEntrada) {
      await leer(
        ven().rpc('fn_ven_guardar_factura', {
          p_id: f.id,
          p_version: f.version,
          p_observacion: f.observacion,
          p_renglones: f.renglones.map((r) => ({ servicio_id: r.servicioId, descripcion: r.descripcion, cantidad: r.cantidad, precio: r.precio })) as Json,
        }),
      );
    },
    async emitirFactura(id: number, version: number, numeroFiscal: string, fecha: string) {
      await leer(ven().rpc('fn_ven_emitir_factura', { p_id: id, p_version: version, p_numero_fiscal: numeroFiscal, p_fecha: fecha }));
    },
    async cobrarFactura(id: number, fecha: string) {
      await leer(ven().rpc('fn_ven_cobrar_factura', { p_id: id, p_fecha: fecha }));
    },
    async anularFactura(id: number, motivo: string) {
      await leer(ven().rpc('fn_ven_anular_factura', { p_id: id, p_motivo: motivo }));
    },
  };
};
