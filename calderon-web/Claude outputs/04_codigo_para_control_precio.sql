-- 04 · Solo lectura: trae el código y la configuración que necesito para armar el control
-- de precio y moneda de las cargas con el mismo estilo que el resto del sistema.
-- Correr en Supabase › SQL Editor, exportar como CSV y adjuntar el archivo.

select 'funcion' as tipo, n.nspname || '.' || p.proname as nombre, pg_get_functiondef(p.oid) as codigo
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where (n.nspname = 'fue' and p.proname in (
            'fn_tg_carga_imposible', 'fn_revisar_carga_imposible', 'fn_revalidar_cargas_imposibles',
            'fn_aprobar_cierre', 'fn_verificar_cierre', 'fn_cotizacion_para_carga',
            'fn_exigir_abierto', 'fn_es_propietario', 'fn_registrar_carga_orden'))
    or (n.nspname = 'ia' and p.proname in (
            'fn_herramienta', 'fn_informe_lecturas', 'fn_lectura_cargas_combustible', 'fn_instrucciones_informe'))
    or (n.nspname = 'fin' and p.proname in ('fn_multimoneda', 'tg_carga_eliminada', 'fn_tc_clp_o_null'))
    or (n.nspname = 'ana' and p.proname in ('fn_regla_vigente', 'fn_alerta_responsable', 'fn_cambiar_umbrales'))
    or (n.nspname = 'ref' and p.proname in ('fn_parametro_num'))

union all
select 'restriccion', c.conrelid::regclass::text || ' · ' || c.conname, pg_get_constraintdef(c.oid)
  from pg_constraint c
 where c.conrelid in ('ana.alerta'::regclass, 'ana.regla_anomalia'::regclass, 'ref.tipo_alerta'::regclass,
                      'fue.control_carga_imposible'::regclass, 'ia.asistente_herramienta'::regclass)

union all
select 'obligatorias', a.attrelid::regclass::text,
       string_agg(a.attname || coalesce(' = ' || pg_get_expr(d.adbin, d.adrelid), ''), ', ' order by a.attnum)
  from pg_attribute a
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
 where a.attrelid in ('ana.alerta'::regclass, 'ana.regla_anomalia'::regclass, 'ref.tipo_alerta'::regclass)
   and a.attnum > 0 and not a.attisdropped and a.attnotnull
 group by a.attrelid

union all
select 'datos', 'ana.regla_anomalia',
       (select jsonb_agg(to_jsonb(t) - array['creado_en','creado_por','actualizado_en','actualizado_por','eliminado_por']) from ana.regla_anomalia t)::text
union all
select 'datos', 'ref.tipo_alerta',
       (select jsonb_agg(to_jsonb(t) - array['creado_en','creado_por','actualizado_en','actualizado_por','eliminado_por']) from ref.tipo_alerta t)::text
union all
select 'datos', 'ana.responsable_alerta', (select jsonb_agg(to_jsonb(t)) from ana.responsable_alerta t)::text
union all
select 'datos', 'ref.pais',
       (select jsonb_agg(jsonb_build_object('iso2', t.iso2, 'nombre', t.nombre, 'moneda_defecto', t.moneda_defecto)) from ref.pais t where t.eliminado_en is null)::text
union all
select 'datos', 'ia.asistente_herramienta', (select jsonb_agg(to_jsonb(t) order by t.orden) from ia.asistente_herramienta t)::text
union all
select 'datos', 'ia.asistente_sugerida', (select jsonb_agg(to_jsonb(t) order by t.orden) from ia.asistente_sugerida t)::text
union all
select 'datos', 'alertas por regla',
       (select jsonb_agg(x) from (select r.codigo, a.estado, count(*) as cantidad
                                    from ana.alerta a join ana.regla_anomalia r on r.id = a.regla_id
                                   group by r.codigo, a.estado) x)::text

order by 1, 2;
