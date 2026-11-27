import { RepoError, type Db } from '@/shared/repository/types';
import { parsearConceptos, parsearDias, parsearLiquidacion, parsearPeriodo, parsearTarifas, type DiaTrabajado } from '../domain/liquidacion.types';
import type {
  BonoColaboradoresEntrada,
  BonoDesempenoEntrada,
  ConceptoEntrada,
  DiaTrabajadoEntrada,
  TramoLiquidacionEntrada,
  EmpresaEntrada,
  FichaEntrada,
  IndicadoresEntrada,
  LegalEntrada,
  RenglonEntrada,
  TarifaEntrada,
} from '../domain/liquidacion.schemas';
import type { NovedadChofer } from '../domain/novedades';
import { parsearDatosLegales } from '../domain/legal.types';

/** La base todavía no tiene la función (o no con esos datos): se usa la forma anterior. */
const FUNCION_INEXISTENTE = new Set(['PGRST202', '42883']);

/** Liquidaciones (migración 62). Todo pasa por funciones de la base; su mensaje se muestra tal cual. */
export const liquidacionRepository = (db: Db) => {
  const fin = () => db.schema('fin');
  const leer = async <T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> => {
    const { data, error } = await p;
    if (error) throw new RepoError(error as never);
    return data as T;
  };
  return {
    async periodo(periodo: string) {
      return parsearPeriodo(await leer(fin().rpc('fn_liquidaciones', { p_periodo: periodo })));
    },
    async liquidacion(id: number) {
      return parsearLiquidacion(await leer(fin().rpc('fn_liquidacion', { p_liq: id })));
    },
    async mias() {
      const v = await leer(fin().rpc('fn_mis_liquidaciones'));
      return (Array.isArray(v) ? v : []).map(parsearLiquidacion);
    },
    async tarifas() {
      return parsearTarifas(await leer(fin().rpc('fn_tarifas')));
    },
    async conceptos() {
      return parsearConceptos(await leer(fin().rpc('fn_conceptos_liquidacion')));
    },

    async guardarTarifa(t: TarifaEntrada): Promise<number> {
      return leer(
        fin().rpc('fn_guardar_tarifa', {
          p_chofer: t.choferId,
          p_desde: t.desde,
          p_sueldo_fijo: t.sueldoFijo,
          p_precio_km: t.precioKm,
          p_observacion: t.observacion,
        }),
      );
    },
    async quitarTarifa(id: number) {
      await leer(fin().rpc('fn_quitar_tarifa', { p_tarifa: id }));
    },
    async guardarConcepto(c: ConceptoEntrada): Promise<number> {
      return leer(
        fin().rpc('fn_guardar_concepto', {
          p_id: c.id,
          p_codigo: c.codigo,
          p_nombre: c.nombre,
          p_tipo: c.tipo,
          p_calculo: c.calculo,
          p_valor: c.valor,
          p_base: c.base,
          p_automatico: c.automatico,
          p_activo: c.activo,
          p_orden: c.orden,
        }),
      );
    },
    async preparar(choferId: number, periodo: string): Promise<number> {
      return leer(fin().rpc('fn_preparar_liquidacion', { p_chofer: choferId, p_periodo: periodo }));
    },
    /** Choferes a preparar en el período (la pantalla los prepara de a uno). */
    async choferesAPreparar(periodo: string): Promise<{ id: number; nombre: string }[]> {
      const r = (await leer(fin().rpc('fn_choferes_a_preparar', { p_periodo: periodo }))) as { id: number; nombre: string }[] | null;
      return r ?? [];
    },
    async prepararTodas(periodo: string) {
      const r = (await leer(fin().rpc('fn_preparar_liquidaciones', { p_periodo: periodo }))) as {
        preparadas?: number;
        errores?: { chofer: string; error: string }[];
      } | null;
      return { preparadas: r?.preparadas ?? 0, errores: r?.errores ?? [] };
    },
    async agregarRenglon(r: RenglonEntrada): Promise<number> {
      return leer(
        fin().rpc('fn_agregar_renglon', {
          p_liq: r.liquidacionId,
          p_tipo: r.tipo,
          p_descripcion: r.descripcion,
          p_importe: r.importe as number,
          p_concepto: r.conceptoId,
        }),
      );
    },
    async quitarRenglon(id: number) {
      await leer(fin().rpc('fn_quitar_renglon', { p_renglon: id }));
    },
    async aprobar(id: number, version: number) {
      await leer(fin().rpc('fn_aprobar_liquidacion', { p_liq: id, p_version: version }));
    },
    async pagar(id: number, fecha: string, forma: string | null, banco: string | null, numero: string | null, cuenta: number | null = null): Promise<string> {
      return leer(fin().rpc('fn_pagar_liquidacion', { p_liq: id, p_fecha: fecha, p_forma: forma, p_banco: banco, p_numero: numero, p_cuenta: cuenta }));
    },
    // Migración 66
    async datosLegales() {
      return parsearDatosLegales(await leer(fin().rpc('fn_datos_legales')));
    },
    async guardarEmpresa(e: EmpresaEntrada) {
      await leer(fin().rpc('fn_guardar_empresa', { p_razon_social: e.razonSocial, p_rut: e.rut, p_direccion: e.direccion, p_comuna: e.comuna }));
    },
    async guardarIndicadores(i: IndicadoresEntrada): Promise<number> {
      return leer(
        fin().rpc('fn_guardar_indicadores', {
          p_periodo: i.periodo,
          p_uf: i.uf as number,
          p_utm: i.utm as number,
          p_tope_imponible_uf: i.topeImponibleUf as number,
          p_tope_cesantia_uf: i.topeCesantiaUf as number,
        }),
      );
    },
    async guardarFicha(f: FichaEntrada): Promise<number> {
      return leer(
        fin().rpc('fn_guardar_ficha_laboral', {
          p_chofer: f.choferId,
          p_rut: f.rut,
          p_extranjero: f.extranjero,
          p_cargo: f.cargo,
          p_afp: f.afp,
          p_afp_comision_pct: f.afpComisionPct as number,
          p_salud: f.salud,
          p_isapre: f.isapre,
          p_isapre_plan_uf: f.isaprePlanUf,
          p_contrato: f.contrato,
          p_contrato_firmado: f.contratoFirmado,
          p_observacion: f.observacion,
        }),
      );
    },
    async guardarLegal(g: LegalEntrada) {
      await leer(
        fin().rpc('fn_guardar_legal', {
          p_liq: g.liquidacionId,
          p_dias_licencia: g.diasLicencia,
          p_dias_sin_licencia: g.diasSinLicencia,
          p_dias_vacaciones: g.diasVacaciones,
          p_haberes: g.haberes.filter((h) => h.importe !== null).map((h) => ({ codigo: h.codigo, importe: h.importe })),
        }),
      );
    },
    // Liquidación en 3 pasos
    /** Días del período de liquidación (periodo = primer día del mes). */
    async diasTrabajados(
      choferId: number,
      periodo: string,
    ): Promise<{ desde: string; hasta: string; viaticoDia: number; dias: DiaTrabajado[]; bloqueado: boolean }> {
      const v = (await leer(fin().rpc('fn_dias_trabajados', { p_chofer: choferId, p_desde: periodo }))) as Record<string, unknown> | null;
      return {
        desde: String(v?.desde ?? ''),
        hasta: String(v?.hasta ?? ''),
        viaticoDia: Number(v?.viatico_dia ?? 0),
        dias: parsearDias(v?.dias),
        bloqueado: v?.bloqueado === true,
      };
    },
    async guardarDiaTrabajado(d: DiaTrabajadoEntrada) {
      await leer(fin().rpc('fn_guardar_dia_trabajado', { p_chofer: d.choferId, p_fecha: d.fecha, p_trabajado: d.trabajado as boolean, p_motivo: d.motivo as string }));
    },
    async guardarBonoDesempeno(b: BonoDesempenoEntrada) {
      await leer(
        fin().rpc('fn_guardar_bono_desempeno', {
          p_liq: b.id,
          p_cuidado: b.cuidado as boolean,
          p_limpieza: b.limpieza as boolean,
          p_otorgar: b.otorgar,
          p_motivo: b.motivo as string,
        }),
      );
    },
    async guardarBonoColaboradores(b: BonoColaboradoresEntrada) {
      await leer(
        fin().rpc('fn_guardar_bono_colaboradores', {
          p_liq: b.id,
          p_datos: {
            imponible: b.imponible,
            no_imponible: b.noImponible,
            gratificacion: b.gratificacion,
            afp: b.afp,
            salud: b.salud,
            cesantia: b.cesantia,
            impuesto: b.impuesto,
            otros_descuentos: b.otrosDescuentos,
            liquido: b.liquido,
            aporte_empleador: b.aporteEmpleador,
            pdf_ruta: b.pdfRuta,
          },
        }),
      );
    },
    /**
     * Migración 384: manda la liquidación que se está mirando (con relevo de chofer, el mismo movimiento está en la de
     * los dos). Si la base todavía no tiene esa migración, guarda como antes.
     */
    async guardarTramo(t: TramoLiquidacionEntrada) {
      const datos = {
        p_item: t.itemId,
        p_liquidar: t.liquidar as boolean,
        p_canon: t.canon as number,
        p_moneda: t.moneda as string,
        p_km: t.km as number,
        p_motivo: t.motivo as string,
      };
      if (t.liquidacionId) {
        const { error } = await fin().rpc('fn_guardar_tramo_liquidacion', { ...datos, p_liq: t.liquidacionId });
        if (!error) return;
        if (!FUNCION_INEXISTENTE.has(error.code)) throw new RepoError(error);
      }
      await leer(fin().rpc('fn_guardar_tramo_liquidacion', datos));
    },
    async quitarBonoColaboradores(id: number) {
      await leer(fin().rpc('fn_quitar_bono_colaboradores', { p_liq: id }));
    },
    async novedades(periodo: string): Promise<NovedadChofer[]> {
      const v = await leer(fin().rpc('fn_novedades_periodo', { p_periodo: periodo }));
      return (Array.isArray(v) ? (v as Record<string, unknown>[]) : []).map((x) => ({
        chofer: String(x.chofer ?? ''),
        rut: typeof x.rut === 'string' ? x.rut : null,
        estado: String(x.estado ?? ''),
        basico: Number(x.basico ?? 0),
        bonoViaje: Number(x.bono_viaje ?? 0),
        otrosImponibles: Number(x.otros_imponibles ?? 0),
        viaticos: Number(x.viaticos ?? 0),
        dias: Number(x.dias ?? 0),
        adicionalKm: Number(x.adicional_km ?? 0),
        bonoDesempeno: Number(x.bono_desempeno ?? 0),
        otrosNoImponibles: Number(x.otros_no_imponibles ?? 0),
        totalImponible: Number(x.total_imponible ?? 0),
        totalNoImponible: Number(x.total_no_imponible ?? 0),
      }));
    },
    async adjuntarFirmada(id: number, ruta: string) {
      await leer(fin().rpc('fn_adjuntar_firmada', { p_liq: id, p_ruta: ruta }));
    },
    async reabrir(id: number, motivo: string) {
      await leer(fin().rpc('fn_reabrir_liquidacion', { p_liq: id, p_motivo: motivo }));
    },
    async anular(id: number, motivo: string) {
      await leer(fin().rpc('fn_anular_liquidacion', { p_liq: id, p_motivo: motivo }));
    },
  };
};
