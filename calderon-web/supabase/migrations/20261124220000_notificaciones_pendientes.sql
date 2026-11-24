-- =====================================================================================
-- Migración 306 · Notificaciones del teléfono: quedan pendientes hasta que se abren
-- =====================================================================================
-- Pedido (24/11/2026): la notificación que llega al teléfono y no se abre queda pendiente; el ícono de la app muestra
-- cuántas hay (1, 2…, en rojo arriba a la derecha) y el inicio tiene «Notificaciones sin revisar».
--
--   1 · ops.push_saliente.visto_en: cuándo la abrió la persona (tocándola en el teléfono o en el sistema).
--       Pendiente = sin abrir, que no se omitió, de los últimos ops.notificaciones_dias (30) días y desde que se aplicó
--       esta migración (ops.notificaciones_desde): las de antes no aparecen de golpe como pendientes.
--   2 · ops.fn_mis_notificaciones(): las pendientes de quien entra (la más nueva primero) y cuántas son.
--       ops.fn_notificacion_vista(id) y ops.fn_notificaciones_vistas(): marcan una o todas; devuelven cuántas quedan.
--       Cada uno ve y marca solo las suyas. Permisos: los de ops.fn_push_estado (cualquiera con sesión).
--   3 · ops.fn_enviar_push (reemplazo con control de una línea): el mensaje lleva su número y cuántas pendientes tiene
--       la persona, para poner el número en el ícono.
-- No borra ni cambia datos. Va después de la 305 (cotizador simple, de otro chat). web.version_base = 306.
-- =====================================================================================
BEGIN;

DO $v$
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 305 THEN
        RAISE EXCEPTION 'Primero hay que aplicar la migración 305 (20261124210000_cotizador_simple.sql). La base está en la %',
            coalesce((SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base'), '?');
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'ops' AND table_name = 'push_saliente' AND column_name = 'visto_en') THEN
        RAISE EXCEPTION 'La migración 306 ya está aplicada';
    END IF;
    IF to_regclass('ops.push_saliente') IS NULL OR to_regprocedure('ops.fn_enviar_push()') IS NULL OR to_regprocedure('ops.fn_push_estado()') IS NULL THEN
        RAISE EXCEPTION 'Faltan las alertas del teléfono (migración 238)';
    END IF;
END $v$;

-- Copia los permisos de ejecución de una función a otra: solo roles tc_* (nunca tc_cliente) y authenticated (como la 297)
CREATE FUNCTION pg_temp.fn_copiar_permisos(p_de regprocedure, p_a regprocedure)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE g text;
BEGIN
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', p_a);
    FOR g IN SELECT r.rolname FROM pg_roles r
              WHERE (r.rolname LIKE 'tc\_%' AND r.rolname <> 'tc_cliente') OR r.rolname = 'authenticated' LOOP
        IF has_function_privilege(g, p_de, 'EXECUTE') THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', p_a, g);
        END IF;
    END LOOP;
END $fn$;

-- Funciones internas: solo las usan otras funciones de la base
CREATE FUNCTION pg_temp.fn_solo_interna(p_fn regprocedure)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE g text;
BEGIN
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', p_fn);
    FOR g IN SELECT r.rolname FROM pg_roles r WHERE r.rolname LIKE 'tc\_%' OR r.rolname IN ('authenticated', 'anon') LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', p_fn, g);
    END LOOP;
END $fn$;

-- ------------------------------------------------------------------ 1 · cuándo se abrió
ALTER TABLE ops.push_saliente ADD COLUMN visto_en timestamptz;
COMMENT ON COLUMN ops.push_saliente.visto_en IS
    'Migración 306: cuándo la persona abrió la notificación (en el teléfono o en el sistema). Vacío = pendiente.';
CREATE INDEX ix_push_saliente_sin_ver ON ops.push_saliente (usuario_id, id DESC) WHERE visto_en IS NULL AND estado <> 'omitido';

INSERT INTO ref.parametro (codigo, valor, descripcion)
SELECT x.codigo, x.valor, x.descripcion FROM (VALUES
    ('ops.notificaciones_desde', to_jsonb(to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
     'Migración 306: solo las notificaciones desde este momento pueden quedar pendientes (las anteriores no aparecen como sin revisar).'),
    ('ops.notificaciones_dias', '30'::jsonb,
     'Migración 306: una notificación sin abrir deja de contarse como pendiente después de estos días.')
) x(codigo, valor, descripcion)
WHERE NOT EXISTS (SELECT 1 FROM ref.parametro p WHERE p.codigo = x.codigo);

-- Desde cuándo una notificación sin abrir cuenta como pendiente
CREATE FUNCTION ops.fn_notificaciones_desde()
RETURNS timestamptz
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT greatest(
        coalesce((SELECT (valor #>> '{}')::timestamptz FROM ref.parametro WHERE codigo = 'ops.notificaciones_desde' AND eliminado_en IS NULL), '-infinity'::timestamptz),
        now() - make_interval(days => greatest(coalesce(ref.fn_parametro_num('ops.notificaciones_dias', 30), 30), 1)::integer))
$f$;

-- Cuántas pendientes tiene una persona
CREATE FUNCTION ops.fn_notificaciones_pendientes(p_usuario bigint)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT count(*)::integer FROM ops.push_saliente p
     WHERE p.usuario_id = p_usuario AND p.visto_en IS NULL AND p.estado <> 'omitido' AND p.creado_en >= ops.fn_notificaciones_desde()
$f$;

-- ------------------------------------------------------------------ 2 · lo que ve y marca cada uno
CREATE FUNCTION ops.fn_mis_notificaciones(p_limite integer DEFAULT 30)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT jsonb_build_object(
        'pendientes', coalesce(ops.fn_notificaciones_pendientes(aud.fn_usuario_actual()), 0),
        'lista', coalesce((
            SELECT jsonb_agg(jsonb_build_object('id', x.id, 'titulo', x.titulo, 'cuerpo', x.cuerpo, 'url', x.url, 'urgente', x.urgente,
                                                'creado_en', x.creado_en) ORDER BY x.id DESC)
              FROM (SELECT p.* FROM ops.push_saliente p
                     WHERE p.usuario_id = aud.fn_usuario_actual() AND p.visto_en IS NULL AND p.estado <> 'omitido'
                       AND p.creado_en >= ops.fn_notificaciones_desde()
                     ORDER BY p.id DESC
                     LIMIT least(greatest(coalesce(p_limite, 30), 1), 100)) x), '[]'::jsonb))
$f$;
COMMENT ON FUNCTION ops.fn_mis_notificaciones(integer) IS
    'Migración 306: las notificaciones del teléfono que la persona todavía no abrió (la más nueva primero) y cuántas son.';

CREATE FUNCTION ops.fn_notificacion_vista(p_id bigint)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_usr bigint := aud.fn_usuario_actual();
BEGIN
    IF v_usr IS NULL THEN RETURN 0; END IF;
    UPDATE ops.push_saliente SET visto_en = now() WHERE id = p_id AND usuario_id = v_usr AND visto_en IS NULL;
    RETURN ops.fn_notificaciones_pendientes(v_usr);
END $f$;
COMMENT ON FUNCTION ops.fn_notificacion_vista(bigint) IS
    'Migración 306: la persona abrió una notificación suya; devuelve cuántas le quedan sin abrir.';

CREATE FUNCTION ops.fn_notificaciones_vistas()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_usr bigint := aud.fn_usuario_actual();
BEGIN
    IF v_usr IS NULL THEN RETURN 0; END IF;
    UPDATE ops.push_saliente SET visto_en = now() WHERE usuario_id = v_usr AND visto_en IS NULL AND estado <> 'omitido';
    RETURN ops.fn_notificaciones_pendientes(v_usr);
END $f$;
COMMENT ON FUNCTION ops.fn_notificaciones_vistas() IS
    'Migración 306: «Marcar todas como vistas»: las notificaciones sin abrir de la persona; devuelve cuántas quedan (0).';

SELECT pg_temp.fn_solo_interna('ops.fn_notificaciones_desde()');
SELECT pg_temp.fn_solo_interna('ops.fn_notificaciones_pendientes(bigint)');
SELECT pg_temp.fn_copiar_permisos('ops.fn_push_estado()', 'ops.fn_mis_notificaciones(integer)');
SELECT pg_temp.fn_copiar_permisos('ops.fn_push_estado()', 'ops.fn_notificacion_vista(bigint)');
SELECT pg_temp.fn_copiar_permisos('ops.fn_push_estado()', 'ops.fn_notificaciones_vistas()');

-- ------------------------------------------------------------------ 3 · el mensaje lleva su número y las pendientes
-- Reemplazo con control (una sola línea de ancla; CREATE OR REPLACE conserva los permisos de la función)
DO $p$
DECLARE
    v_def text := pg_get_functiondef('ops.fn_enviar_push()'::regprocedure);
    a CONSTANT text := $t$'etiqueta', p.clave)::text$t$;
    b CONSTANT text := $t$'etiqueta', p.clave, 'id', p.id, 'pendientes', ops.fn_notificaciones_pendientes(p.usuario_id))::text$t$;
BEGIN
    IF (length(v_def) - length(replace(v_def, a, ''))) / length(a) <> 1 THEN
        RAISE EXCEPTION 'ops.fn_enviar_push no es la que esperaba esta migración (el mensaje al teléfono): avisar antes de seguir';
    END IF;
    EXECUTE replace(v_def, a, b);
END $p$;

UPDATE ref.parametro SET valor = '306' WHERE codigo = 'web.version_base' AND valor::text::int < 306;

COMMIT;

NOTIFY pgrst, 'reload schema';

SELECT 'migración 306 aplicada' AS que, (SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base') AS version_base,
       (SELECT count(DISTINCT usuario_id) FROM ops.push_suscripcion WHERE activa) AS personas_con_telefono,
       (SELECT valor #>> '{}' FROM ref.parametro WHERE codigo = 'ops.notificaciones_desde') AS pendientes_desde;
