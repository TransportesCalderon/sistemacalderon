-- 05 · Datos para medir la rentabilidad por operación (solo lectura: no modifica nada)
-- Correr en Supabase › SQL Editor, exportar el resultado como CSV (Export › Download CSV)
-- y guardar el archivo en la carpeta  calderon-web\Claude outputs  con el nombre  05_resultado.csv
-- Devuelve una fila por bloque: nombre, cantidad de filas y los datos en JSON. Desde el 01/08/2026.
-- No incluye: usuarios, claves, documentos de identidad, teléfonos, comprobantes ni posiciones GPS.

with k as (
  select array['creado_en','creado_por','actualizado_en','actualizado_por',
               'eliminado_en','eliminado_por','version_fila']::text[] as q,
         date '2026-08-01' as desde
)

-- ───────── Quién es quién ─────────
select 'mae.camion' as bloque, count(*) as filas, jsonb_agg(jsonb_strip_nulls(to_jsonb(x))) as datos
from (select id, codigo_interno, patente from mae.camion where eliminado_en is null) x

union all select 'mae.cliente', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(x)))
from (select id, codigo, razon_social, nombre_fantasia, moneda_facturacion, condicion_pago_dias
      from mae.cliente where eliminado_en is null) x

union all select 'mae.ubicacion', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(x)))
from (select id, codigo, nombre, tipo, pais from mae.ubicacion where eliminado_en is null) x

union all select 'mae.linea', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(t) - (select q from k)))
from mae.linea t where t.eliminado_en is null

union all select 'mae.estacion_servicio', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(x)))
from (select id, nombre, pais, es_tanque_propio from mae.estacion_servicio where eliminado_en is null) x

union all select 'mae.genset_instalacion', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(t) - (select q from k)))
from mae.genset_instalacion t where t.eliminado_en is null

-- ───────── Operaciones, tramos, hitos y viajes de chofer ─────────
union all select 'ops.servicio_comercial', count(*),
       jsonb_agg(jsonb_strip_nulls(to_jsonb(t) - (select q from k)
         - array['precinto','booking','referencia_cliente','buque','crt','mic','guia',
                 'tercero_chofer','tercero_tractor','tercero_semi','conforme_descarga_por']))
from ops.servicio_comercial t where t.eliminado_en is null

union all select 'ops.tramo_operativo', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(t) - (select q from k)))
from ops.tramo_operativo t where t.eliminado_en is null

union all select 'ops.servicio_tramo', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(t) - (select q from k)))
from ops.servicio_tramo t where t.eliminado_en is null

union all select 'ops.relevo_tractor', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(t) - (select q from k)))
from ops.relevo_tractor t where t.eliminado_en is null

union all select 'ops.servicio_hito', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(x)))
from (select id, servicio_id, tipo, ts, hasta_ts, detalle from ops.servicio_hito where eliminado_en is null) x

union all select 'ops.viaje_chofer', count(*),
       jsonb_agg(jsonb_strip_nulls(to_jsonb(t) - (select q from k) - array['cerrado_por']))
from ops.viaje_chofer t where t.eliminado_en is null

union all select 'ops.viaje_chofer_item', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(t) - (select q from k)))
from ops.viaje_chofer_item t where t.eliminado_en is null

-- ───────── Gastos directos ─────────
union all select 'fue.carga_combustible', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(x)))
from (select id, camion_id, chofer_id, estacion_id, fecha_hora, litros, precio_unitario, moneda,
             importe_original, importe_moneda_base, odometro_km, tanque_lleno, medio_pago,
             estado_validacion, deposito_id
      from fue.carga_combustible
      where eliminado_en is null and estado_validacion <> 'anulada' and fecha_hora >= (select desde from k)) x

union all select 'fue.cierre_viaje', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(x)))
from (select id, numero, camion_id, salida_ts, llegada_ts, estado, chofer_responsable_id, km_recorridos,
             cargas_l, consumo_plataforma_l, consumo_l_100km, dias_parado, linea_viaje
      from fue.cierre_viaje where eliminado_en is null) x

union all select 'fue.genset_registro', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(x)))
from (select id, genset_id, tipo, fecha_hora, litros, horometro_h, tanque_lleno, camion_id,
             semirremolque_id, estacion_id, precio_unitario, moneda, importe
      from fue.genset_registro where eliminado_en is null and fecha_hora >= (select desde from k)) x

union all select 'fin.movimiento_fondo_chofer', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(x)))
from (select id, chofer_id, tipo, fecha, moneda, importe, estado, categoria_id, detalle, lugar,
             servicio_id, viaje_chofer_id, camion_id
      from fin.movimiento_fondo_chofer where eliminado_en is null and fecha >= (select desde from k)) x

union all select 'fin.costo_directo', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(t) - (select q from k)))
from fin.costo_directo t where t.eliminado_en is null

union all select 'ref.categoria_costo', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(t) - (select q from k)))
from ref.categoria_costo t where t.eliminado_en is null

-- ───────── Uso real del camión por día y cotizaciones ─────────
union all select 'tel.agregado_diario_camion', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(x)))
from (select camion_id, fecha, km, litros_consumidos, horas_motor, horas_ralenti
      from tel.agregado_diario_camion where fecha >= (select desde from k)) x

union all select 'fin.tipo_cambio', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(x)))
from (select fecha, moneda_origen, moneda_destino, tasa, tipo
      from fin.tipo_cambio where eliminado_en is null and fecha >= (select desde from k)) x

-- ───────── Lo facturado ─────────
union all select 'ven.factura', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(x)))
from (select id, numero, cliente_id, estado, moneda, total, fecha_emision, vence, cobrada_en, tc_clp
      from ven.factura where eliminado_en is null) x

union all select 'ven.factura_renglon', count(*), jsonb_agg(jsonb_strip_nulls(to_jsonb(t)))
from ven.factura_renglon t

order by 1;
