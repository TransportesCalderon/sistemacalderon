-- 02 · Extracción para el costeo por viaje (solo lectura: no modifica nada)
-- Correr en Supabase › SQL Editor, exportar el resultado como CSV y adjuntar el archivo.
-- Devuelve una fila por bloque: nombre, cantidad de filas y los datos en JSON.
-- No incluye: usuarios, claves, documentos de identidad, teléfonos, comprobantes ni posiciones GPS.

with k as (
  select array['creado_en','creado_por','actualizado_en','actualizado_por',
               'eliminado_en','eliminado_por','version_fila']::text[] as q
)

-- ───────── Maestros ─────────
select 'mae.camion' as bloque, count(*) as filas,
       jsonb_agg(jsonb_strip_nulls(to_jsonb(t) - (select q from k))) as datos
from mae.camion t where t.eliminado_en is null

union all select 'mae.semirremolque', count(*),
       jsonb_agg(jsonb_strip_nulls(to_jsonb(t) - (select q from k)
         - array['observacion_operativa','observacion_por','observacion_en']))
from mae.semirremolque t where t.eliminado_en is null

union all select 'mae.genset', count(*),
       jsonb_agg(jsonb_strip_nulls(to_jsonb(t) - (select q from k)))
from mae.genset t where t.eliminado_en is null

union all select 'mae.genset_instalacion', count(*),
       jsonb_agg(jsonb_strip_nulls(to_jsonb(t) - (select q from k)))
from mae.genset_instalacion t where t.eliminado_en is null

union all select 'mae.chofer', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(x)))
from (select id, legajo, nombre, apellido, pais_residencia, categoria_liquidacion,
             fecha_ingreso, fecha_egreso, estado
      from mae.chofer where eliminado_en is null) x

union all select 'mae.asignacion_camion_chofer', count(*),
       jsonb_agg(jsonb_strip_nulls(to_jsonb(t) - (select q from k)))
from mae.asignacion_camion_chofer t where t.eliminado_en is null

union all select 'mae.cliente', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(x)))
from (select id, codigo, razon_social, nombre_fantasia, pais, moneda_facturacion,
             condicion_pago_dias, segmento, estado
      from mae.cliente where eliminado_en is null) x

union all select 'mae.ubicacion', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(x)))
from (select id, codigo, nombre, tipo, pais, region, latitud, longitud
      from mae.ubicacion where eliminado_en is null) x

union all select 'mae.linea', count(*),
       jsonb_agg(jsonb_strip_nulls(to_jsonb(t) - (select q from k)))
from mae.linea t where t.eliminado_en is null

union all select 'mae.estacion_servicio', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(x)))
from (select id, codigo, nombre, pais, es_tanque_propio, proveedor_id
      from mae.estacion_servicio where eliminado_en is null) x

union all select 'mae.proveedor', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(x)))
from (select id, codigo, razon_social, pais, tipo, moneda_defecto
      from mae.proveedor where eliminado_en is null) x

union all select 'mae.transportista', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(x)))
from (select id, razon_social, activo from mae.transportista where eliminado_en is null) x

union all select 'ref.tipo_carga', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(x)))
from (select id, codigo, nombre, requiere_frio, es_contenedor
      from ref.tipo_carga where eliminado_en is null) x

union all select 'ref.moneda', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(x)))
from (select codigo, nombre, es_base from ref.moneda where eliminado_en is null) x

union all select 'ref.categoria_costo', count(*),
       jsonb_agg(jsonb_strip_nulls(to_jsonb(t) - (select q from k)))
from ref.categoria_costo t where t.eliminado_en is null

union all select 'ref.parametro', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(x)))
from (select codigo, valor, descripcion from ref.parametro
      where eliminado_en is null
        and codigo !~* '(clave|token|secret|password|usuario|url|mail|smtp|push|sii|api)') x

-- ───────── Operación: operaciones, tramos y viajes ─────────
union all select 'ops.servicio_comercial', count(*),
       jsonb_agg(jsonb_strip_nulls(to_jsonb(t) - (select q from k)
         - array['precinto','booking','referencia_cliente','buque','crt','mic','guia',
                 'tercero_chofer','tercero_tractor','tercero_semi','conforme_descarga_por']))
from ops.servicio_comercial t where t.eliminado_en is null

union all select 'ops.tramo_operativo', count(*),
       jsonb_agg(jsonb_strip_nulls(to_jsonb(t) - (select q from k)))
from ops.tramo_operativo t where t.eliminado_en is null

union all select 'ops.servicio_tramo', count(*),
       jsonb_agg(jsonb_strip_nulls(to_jsonb(t) - (select q from k)))
from ops.servicio_tramo t where t.eliminado_en is null

union all select 'ops.relevo_tractor', count(*),
       jsonb_agg(jsonb_strip_nulls(to_jsonb(t) - (select q from k)))
from ops.relevo_tractor t where t.eliminado_en is null

union all select 'ops.paso_fletero', count(*),
       jsonb_agg(jsonb_strip_nulls(to_jsonb(t) - (select q from k)))
from ops.paso_fletero t where t.eliminado_en is null

union all select 'ops.servicio_hito', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(x)))
from (select id, servicio_id, tipo, ts, hasta_ts, detalle
      from ops.servicio_hito where eliminado_en is null) x

union all select 'ops.viaje_chofer', count(*),
       jsonb_agg(jsonb_strip_nulls(to_jsonb(t) - (select q from k) - array['cerrado_por']))
from ops.viaje_chofer t where t.eliminado_en is null

union all select 'ops.viaje_chofer_item', count(*),
       jsonb_agg(jsonb_strip_nulls(to_jsonb(t) - (select q from k)))
from ops.viaje_chofer_item t where t.eliminado_en is null

union all select 'ops.salida_base', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(x)))
from (select id, fecha, salida_ts, camion_id, chofer_id, semi_id, genset_id, producto,
             destino, origen, estado, devolucion_vacio
      from ops.salida_base) x

-- ───────── Ventas: tarifas y facturación ─────────
union all select 'ven.tarifa', count(*),
       jsonb_agg(jsonb_strip_nulls(to_jsonb(t) - (select q from k)))
from ven.tarifa t where t.eliminado_en is null

union all select 'ven.costo_referencia', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(t)))
from ven.costo_referencia t

union all select 'ven.factura', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(x)))
from (select id, numero, cliente_id, estado, moneda, total, numero_fiscal, fecha_emision,
             vence, cobrada_en, tc_clp
      from ven.factura where eliminado_en is null) x

union all select 'ven.factura_renglon', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(t)))
from ven.factura_renglon t

union all select 'fin.devengo_servicio', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(t)))
from fin.devengo_servicio t

union all select 'fin.ingreso_servicio', count(*),
       jsonb_agg(jsonb_strip_nulls(to_jsonb(t) - (select q from k)))
from fin.ingreso_servicio t where t.eliminado_en is null

-- ───────── Costos y finanzas ─────────
union all select 'fin.costo_directo', count(*),
       jsonb_agg(jsonb_strip_nulls(to_jsonb(t) - (select q from k)))
from fin.costo_directo t where t.eliminado_en is null

union all select 'fin.costo_indirecto_periodo', count(*),
       jsonb_agg(jsonb_strip_nulls(to_jsonb(t) - (select q from k)))
from fin.costo_indirecto_periodo t where t.eliminado_en is null

union all select 'fin.gasto', count(*),
       jsonb_agg(jsonb_strip_nulls(to_jsonb(t) - (select q from k)))
from fin.gasto t where t.eliminado_en is null

union all select 'fin.gasto_fijo', count(*),
       jsonb_agg(jsonb_strip_nulls(to_jsonb(t) - (select q from k)))
from fin.gasto_fijo t where t.eliminado_en is null

union all select 'fin.cuenta_contable', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(x)))
from (select id, codigo, nombre, tipo, padre_id, imputable, uso, activa
      from fin.cuenta_contable where eliminado_en is null) x

union all select 'fin.asiento', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(x)))
from (select id, fecha, glosa, origen, origen_id from fin.asiento) x

union all select 'fin.asiento_linea', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(t)))
from fin.asiento_linea t

union all select 'fin.movimiento', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(x)))
from (select id, numero, fecha, tipo, cuenta_dinero_id, monto, factura_id, gasto_id,
             cuenta_id, descripcion, estado, origen, origen_id, camion_id
      from fin.movimiento where eliminado_en is null) x

union all select 'fin.tipo_cambio', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(x)))
from (select id, fecha, moneda_origen, moneda_destino, tasa, tipo, fuente
      from fin.tipo_cambio where eliminado_en is null) x

union all select 'fin.movimiento_fondo_chofer', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(x)))
from (select id, numero, chofer_id, tipo, fecha, periodo, moneda, importe, estado,
             categoria_id, detalle, lugar, servicio_id, viaje_chofer_id, camion_id,
             costo_directo_id
      from fin.movimiento_fondo_chofer where eliminado_en is null) x

union all select 'fin.tarifa_chofer', count(*),
       jsonb_agg(jsonb_strip_nulls(to_jsonb(t) - (select q from k)))
from fin.tarifa_chofer t where t.eliminado_en is null

union all select 'fin.regla_liquidacion', count(*),
       jsonb_agg(jsonb_strip_nulls(to_jsonb(t) - (select q from k)))
from fin.regla_liquidacion t where t.eliminado_en is null

union all select 'fin.liquidacion_mensual', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(x)))
from (select id, numero, chofer_id, periodo, desde, hasta, moneda, estado, remunerativo,
             no_remunerativo, descuentos, neto, pagada_en
      from fin.liquidacion_mensual where eliminado_en is null) x

union all select 'fin.liquidacion_renglon', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(x)))
from (select id, liquidacion_id, origen, codigo, descripcion, tipo, cantidad, unitario, importe
      from fin.liquidacion_renglon where eliminado_en is null) x

-- ───────── Combustible ─────────
union all select 'fue.carga_combustible', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(x)))
from (select id, camion_id, chofer_id, estacion_id, fecha_hora, litros, precio_unitario,
             moneda, importe_original, importe_moneda_base, odometro_km, tanque_lleno,
             medio_pago, estado_validacion, deposito_id, carga_principal_id, es_frontera,
             anula_id
      from fue.carga_combustible where eliminado_en is null) x

union all select 'fue.cierre_viaje', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(x)))
from (select id, numero, camion_id, carga_salida_id, carga_llegada_id, salida_ts, llegada_ts,
             estado, chofer_responsable_id, km_recorridos, fuente_km, cargas_l,
             consumo_plataforma_l, consumo_l_100km, horas_motor, horas_ralenti, dias_parado,
             diferencia_l, tolerancia_l, imputable_total_l, linea_viaje
      from fue.cierre_viaje where eliminado_en is null) x

union all select 'fue.genset_registro', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(x)))
from (select id, genset_id, tipo, fecha_hora, litros, horometro_h, tanque_lleno, chofer_id,
             camion_id, semirremolque_id, estacion_id, precio_unitario, moneda, importe
      from fue.genset_registro where eliminado_en is null) x

union all select 'fue.consumo_tramo', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(t)))
from fue.consumo_tramo t

-- ───────── Uso real de la flota (km por camión y día) ─────────
union all select 'tel.agregado_diario_camion', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(x)))
from (select camion_id, fecha, km, litros_consumidos, horas_motor, horas_ralenti
      from tel.agregado_diario_camion) x

-- ───────── Mantenimiento ─────────
union all select 'mae.orden_trabajo', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(x)))
from (select id, origen, tarea_id, camion_id, semi_id, genset_id, titulo, prioridad, estado,
             creado_en, terminada_en, km_al_terminar, repuestos, costo, moneda, proveedor
      from mae.orden_trabajo where anulada_en is null) x

union all select 'mae.tarea_mantenimiento', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(x)))
from (select id, nombre, aplica, marca, cada_dias, cada_km, cada_horas, activo
      from mae.tarea_mantenimiento) x

union all select 'mae.movimiento_insumo', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(x)))
from (select id, fecha, tipo, insumo_id, cantidad, costo_unitario, importe, ot_id, gasto_id
      from mae.movimiento_insumo) x

union all select 'mae.insumo', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(x)))
from (select id, codigo, nombre, unidad, categoria from mae.insumo) x

union all select 'mae.vencimiento', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(x)))
from (select id, tipo_codigo, camion_id, semi_id, detalle, realizado, vence
      from mae.vencimiento where anulado_en is null and reemplazado_en is null) x

order by 1;
