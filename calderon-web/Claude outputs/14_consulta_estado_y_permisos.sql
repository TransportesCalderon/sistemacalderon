-- 14 · CONSULTA DE SOLO LECTURA (no cambia nada) · Estado de la base y permisos de lo agregado en S2
-- Sección A: qué cambios están aplicados de verdad (no por el número de versión, sino mirando el objeto).
-- Sección B: para cada rol de la base, si puede usar lo nuevo igual que lo que ya existía al lado.
--            Solo salen las filas con problema: «FALTA PERMISO». Si no sale ninguna fila B, está bien.
-- Cómo usarla: pegar todo en el SQL Editor de Supabase, Run, y pasar el resultado (CSV o captura).
WITH estado(orden, que, valor) AS (
    VALUES
    (1, 'versión de la base (web.version_base)', (SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base')),
    (2, 'cambio 258 · m265 · quién maneja el tractor', CASE WHEN to_regprocedure('mae.fn_chofer_pendientes(bigint)') IS NOT NULL THEN 'aplicado' ELSE 'NO aplicado' END),
    (3, 'cambio 259 · m266 · consumo objetivo', CASE WHEN to_regprocedure('fue.fn_objetivo_tramo(bigint,bigint)') IS NOT NULL THEN 'aplicado' ELSE 'NO aplicado' END),
    (4, 'cambio 260 · m267 · capacidad tanques y mochila', CASE WHEN (SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('fue.fn_capacidad_camion(bigint,timestamptz)')) LIKE '%total_l%' THEN 'aplicado' ELSE 'NO aplicado' END),
    (5, 'cambio 261 · m268 · faltante con su parte de mochila', CASE WHEN EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'fue.carga_combustible'::regclass AND attname = 'faltante_mochila_l' AND NOT attisdropped) THEN 'aplicado' ELSE 'NO aplicado' END),
    (6, 'cambio 262 · m269 · mail único de las órdenes', CASE WHEN to_regprocedure('fue.fn_mail_orden(bigint,text)') IS NOT NULL THEN 'aplicado' ELSE 'NO aplicado' END),
    (7, 'm270 · el cierre acepta la fuente «tablero»', CASE WHEN (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'fue.cierre_viaje'::regclass AND conname = 'ck_cv_fuente_cons') LIKE '%tablero%' THEN 'aplicado' ELSE 'NO aplicado' END),
    (8, 'cargas con faltante (total)', (SELECT count(*)::text FROM fue.carga_combustible WHERE eliminado_en IS NULL AND estado_validacion <> 'anulada' AND faltante_lleno_l > 0)),
    (9, 'cargas con faltante ya repartido (corrección 13)',
        CASE WHEN EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'fue.carga_combustible'::regclass AND attname = 'faltante_mochila_l' AND NOT attisdropped)
             THEN (SELECT (xpath('/row/n/text()', query_to_xml('SELECT count(*) AS n FROM fue.carga_combustible WHERE eliminado_en IS NULL AND estado_validacion <> ''anulada'' AND faltante_lleno_l > 0 AND faltante_mochila_l IS NOT NULL', false, true, '')))[1]::text)
             ELSE 'la columna todavía no existe' END),
    (10, 'clientes (para A5)', (SELECT count(*)::text FROM mae.cliente WHERE eliminado_en IS NULL))
),
roles AS (   -- los roles de la base que usa la web
    SELECT DISTINCT r.rolname
      FROM pg_roles r
     WHERE r.rolname = 'authenticated'
        OR r.rolname IN (SELECT rol_bd FROM seg.rol_aplicacion WHERE rol_bd IS NOT NULL)
),
funciones(fn, vecina, donde) AS (   -- función nueva, la que ya existía al lado, y quién la llama
    VALUES
    ('mae.fn_chofer_pendientes(bigint)', 'mae.fn_eliminar_chofer(bigint,text)', 'ficha y formulario del chofer'),
    ('fue.fn_faltante_mochila(bigint,timestamptz,numeric,numeric)', 'fue.fn_capacidad_mochila(bigint)', 'alta de una carga'),
    ('fue.fn_capacidad_camion(bigint,timestamptz)', 'fue.fn_capacidad_mochila(bigint)', 'alta de una carga'),
    ('fue.fn_objetivo_tramo(bigint,bigint)', 'fue.fn_objetivo_cierre(bigint,numeric)', 'cierre y seguimiento'),
    ('tel.fn_chofer_tarjeta(bigint,timestamptz)', 'tel.fn_seguimiento_viajes()', 'seguimiento de viajes'),
    ('ops.fn_avisar(bigint[],text,text,text,text,boolean)', 'tel.fn_pedir_carga(bigint,bigint,numeric,numeric,numeric,numeric,numeric,numeric,numeric,jsonb,text,text)', 'avisos al teléfono')
),
fn_mal AS (
    SELECT 'B · FALTA PERMISO' AS seccion, f.fn || ' · rol ' || r.rolname AS que,
           'no puede ejecutarla y sí puede ' || f.vecina || ' (' || f.donde || ')' AS valor
      FROM funciones f CROSS JOIN roles r
     WHERE to_regprocedure(f.fn) IS NOT NULL AND to_regprocedure(f.vecina) IS NOT NULL
       AND has_function_privilege(r.rolname, to_regprocedure(f.vecina), 'EXECUTE')
       AND NOT has_function_privilege(r.rolname, to_regprocedure(f.fn), 'EXECUTE')
),
col_mal AS (
    SELECT 'B · FALTA PERMISO', 'fue.carga_combustible.faltante_mochila_l · rol ' || r.rolname || ' · ' || p.priv,
           'no puede y sí puede sobre faltante_lleno_l (' || p.donde || ')'
      FROM roles r CROSS JOIN (VALUES ('SELECT', 'ficha y formulario de la carga'), ('INSERT', 'alta de una carga')) p(priv, donde)
     WHERE EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'fue.carga_combustible'::regclass AND attname = 'faltante_mochila_l' AND NOT attisdropped)
       AND has_column_privilege(r.rolname, 'fue.carga_combustible', 'faltante_lleno_l', p.priv)
       AND NOT has_column_privilege(r.rolname, 'fue.carga_combustible', 'faltante_mochila_l', p.priv)
)
SELECT 'A · estado' AS seccion, que, valor FROM (SELECT * FROM estado ORDER BY orden) e
UNION ALL SELECT * FROM fn_mal
UNION ALL SELECT * FROM col_mal;
