-- 06 · Clientes: volumen, facturación y plazos de pago (solo lectura: no modifica nada)
-- Correr en Supabase › SQL Editor y pegar el resultado en el chat (o Export › Download CSV).
-- Una fila por cliente, desde el 01/08/2026. No incluye datos personales.

with k as (select date '2026-08-01' as desde),

sv as (  -- operaciones (se lee como JSON para no depender de nombres de columnas)
  select (j->>'cliente_id')::bigint as cliente_id,
         nullif(j->>'linea_id','')::bigint as linea_id,
         coalesce(j->>'fecha_operacion', j->>'creado_en')::timestamptz::date as fecha
  from (select to_jsonb(t) as j from ops.servicio_comercial t where t.eliminado_en is null) x
  where coalesce(j->>'estado','') !~* '^(anul|cancel)'
),
ops as (
  select cliente_id,
         count(*) as operaciones,
         count(*) filter (where fecha >= current_date - 30) as operaciones_ult_30_dias,
         min(fecha) as primera, max(fecha) as ultima
  from sv where fecha >= (select desde from k) group by 1
),
lin as (
  select cliente_id, string_agg(linea || ': ' || n, ' · ' order by n desc) as lineas
  from (select sv.cliente_id,
               coalesce(to_jsonb(l)->>'codigo', to_jsonb(l)->>'nombre', 'sin línea') as linea,
               count(*) as n
        from sv left join mae.linea l on l.id = sv.linea_id
        where sv.fecha >= (select desde from k) group by 1, 2) q
  group by 1
),
f as (
  select cliente_id, moneda, total, estado,
         fecha_emision::date as emision, vence::date as vence, cobrada_en::date as cobrada
  from ven.factura
  where eliminado_en is null and estado !~* '^anul' and fecha_emision is not null
    and fecha_emision >= (select desde from k)
),
fm as (  -- importes por moneda
  select cliente_id,
         string_agg(moneda || ' ' || to_char(tot, 'FM999G999G999G990'), ' · ') as facturado,
         string_agg(moneda || ' ' || to_char(pend, 'FM999G999G999G990'), ' · ') filter (where pend > 0) as pendiente_de_cobro,
         string_agg(moneda || ' ' || to_char(venc, 'FM999G999G999G990'), ' · ') filter (where venc > 0) as vencido_sin_cobrar
  from (select cliente_id, moneda, sum(total) as tot,
               coalesce(sum(total) filter (where cobrada is null), 0) as pend,
               coalesce(sum(total) filter (where cobrada is null and vence < current_date), 0) as venc
        from f group by 1, 2) q
  group by 1
),
fc as (
  select cliente_id,
         count(*) as facturas,
         count(*) filter (where cobrada is not null) as facturas_cobradas,
         round(avg(cobrada - emision) filter (where cobrada is not null)) as dias_reales_de_cobro,
         max(cobrada - emision) filter (where cobrada is not null) as peor_cobro_dias,
         round(avg(current_date - emision) filter (where cobrada is null)) as dias_esperando_las_impagas
  from f group by 1
)
select coalesce(c.nombre_fantasia, c.razon_social) as cliente,
       c.moneda_facturacion as moneda,
       c.condicion_pago_dias as plazo_pactado_dias,
       coalesce(o.operaciones, 0) as operaciones,
       coalesce(o.operaciones_ult_30_dias, 0) as operaciones_ult_30_dias,
       o.primera, o.ultima,
       l.lineas,
       coalesce(fc.facturas, 0) as facturas,
       fm.facturado,
       fc.facturas_cobradas,
       fc.dias_reales_de_cobro,
       fc.peor_cobro_dias,
       fm.pendiente_de_cobro,
       fc.dias_esperando_las_impagas,
       fm.vencido_sin_cobrar
from mae.cliente c
left join ops o on o.cliente_id = c.id
left join lin l on l.cliente_id = c.id
left join fc on fc.cliente_id = c.id
left join fm on fm.cliente_id = c.id
where c.eliminado_en is null and (o.operaciones > 0 or fc.facturas > 0)
order by coalesce(o.operaciones, 0) desc;
