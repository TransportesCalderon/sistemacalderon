-- 01 · Inventario de la base (solo lectura: no modifica ni muestra datos, solo la estructura)
-- Correr en Supabase › SQL Editor y exportar el resultado como CSV.
-- Devuelve una fila por tabla, vista y función: esquema, nombre, cantidad aproximada de filas y sus columnas.

with esquemas as (
  select oid, nspname
  from pg_namespace
  where nspname !~ '^pg_'
    and nspname not in (
      'information_schema', 'auth', 'storage', 'vault', 'extensions', 'graphql', 'graphql_public',
      'realtime', 'supabase_functions', 'supabase_migrations', 'net', 'cron', 'pgsodium',
      'pgsodium_masks', 'pgbouncer', 'pgtle', 'tiger', 'topology'
    )
)
select
  case c.relkind when 'r' then 'tabla' when 'p' then 'tabla' when 'v' then 'vista' else 'vista materializada' end as tipo,
  e.nspname as esquema,
  c.relname as nombre,
  case when c.relkind in ('r', 'p') then coalesce(s.n_live_tup, 0)::bigint end as filas_aprox,
  string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod), ', ' order by a.attnum) as detalle
from pg_class c
join esquemas e on e.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
left join pg_stat_user_tables s on s.relid = c.oid
where c.relkind in ('r', 'p', 'v', 'm')
group by c.relkind, e.nspname, c.relname, s.n_live_tup

union all

select
  'funcion',
  e.nspname,
  p.proname,
  null::bigint,
  '(' || pg_get_function_arguments(p.oid) || ') -> ' || pg_get_function_result(p.oid)
from pg_proc p
join esquemas e on e.oid = p.pronamespace
where p.prokind = 'f'
  and p.proname like 'fn\_%'

order by 1, 2, 3;
