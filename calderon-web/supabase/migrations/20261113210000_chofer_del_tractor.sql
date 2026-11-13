-- =============================================================================
-- IronTrack — 265 · Cambio 258 · Quién maneja el tractor: una sola regla (backlog A1)
-- -----------------------------------------------------------------------------
-- Había cinco reglas distintas para decir quién maneja un tractor (orden de carga, mapa de
-- flota, seguimiento, alertas y titular). Desde ahora hay una sola, tel.fn_chofer_en(camión,
-- momento), con este orden:
--   1. El viaje de logística que el tractor tenía en curso en ese momento, con sus relevos.
--   2. Si no hay, el viaje de chofer vigente en ese momento.
--   3. Si tampoco, el chofer titular. Para «ahora» solo vale si el chofer está activo: si está
--      de licencia o de baja y no hay viaje ni relevo, la respuesta es «sin conductor».
-- La tarjeta de la telemetría deja de decidir: queda como señal (tel.fn_chofer_tarjeta) y
-- Seguimiento avisa cuando marca a otro chofer.
-- Las tres funciones anteriores quedan como envoltorio de una línea: fue.fn_chofer_actual,
-- tel.fn_chofer_actual y tel.fn_chofer_ahora_viaje (se borran cuando nada las nombre).
-- No cambia mae.fn_chofer_de_tractor (quién es el titular), mae.asignacion_camion_chofer ni
-- mae.fn_asignar_tractor. La función única nunca escribe en la asignación.
--
-- Baja y licencia del chofer:
--   · mae.fn_chofer_pendientes(chofer) lista lo que el chofer tiene abierto: tractores
--     asignados (titular o relevo), relevos abiertos, viajes planificados o en curso y viajes
--     de chofer abiertos.
--   · Pasar un chofer a BAJA se frena si tiene algo abierto (trigger en mae.chofer). El
--     mensaje dice qué resolver y dónde. Los que ya están de baja no se tocan.
--   · La LICENCIA no frena: la ficha y el formulario muestran la advertencia.
--   · Eliminar un chofer frena igual que la baja (antes cerraba la asignación sola).
-- No cambia tablas. web.version_base = 265.
-- =============================================================================
SET search_path = public, extensions;
BEGIN;

DO $do$
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 264 THEN
        RAISE EXCEPTION 'Falta la migración 264 (cambio 254): aplicarla antes';
    END IF;
    IF to_regprocedure('mae.fn_chofer_pendientes(bigint)') IS NOT NULL THEN
        RAISE EXCEPTION 'La migración 265 (quién maneja el tractor) ya está aplicada';
    END IF;
END $do$;

-- -----------------------------------------------------------------------------
-- 1 · La regla única
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tel.fn_chofer_en(p_camion bigint, p_ts timestamp with time zone, p_externo text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
    -- Migración 265: única regla de «quién maneja». p_externo (la tarjeta) ya no decide: se conserva
    -- el parámetro para no cambiar a quienes la llaman.
    SELECT coalesce(
        -- 1. Viaje de logística en curso en ese momento, con el relevo vigente si lo hay
        (SELECT coalesce((SELECT tc.chofer_id FROM ops.tramo_chofer tc
                           WHERE tc.tramo_id = t.id AND tc.rol = 'conductor' AND tc.eliminado_en IS NULL
                             AND tc.desde_ts <= p_ts AND p_ts < coalesce(tc.hasta_ts, 'infinity')
                           ORDER BY tc.desde_ts DESC LIMIT 1), t.chofer_id)
           FROM ops.tramo_operativo t
          WHERE t.camion_id = p_camion AND t.estado IN ('en_curso', 'cerrado') AND t.eliminado_en IS NULL
            AND t.inicio_real <= p_ts AND p_ts < coalesce(t.fin_real, 'infinity')
          ORDER BY t.inicio_real DESC LIMIT 1),
        -- 2. Viaje de chofer vigente en ese momento
        (SELECT v.chofer_id FROM ops.viaje_chofer v
          WHERE v.camion_id = p_camion AND v.estado <> 'anulado' AND v.eliminado_en IS NULL AND v.salida_ts <= p_ts
            AND p_ts < coalesce(v.llegada_ts, (ops.fn_corte_siguiente(v.camion_id, v.salida_ts)).fecha_hora, 'infinity')
          ORDER BY v.salida_ts DESC LIMIT 1),
        -- 3. Titular. Para «ahora» (último día) solo si está activo
        (SELECT c.id FROM mae.chofer c
          WHERE c.id = mae.fn_chofer_de_tractor(p_camion, (p_ts AT TIME ZONE 'America/Argentina/Mendoza')::date)
            AND (p_ts < now() - interval '1 day' OR (c.estado = 'activo' AND c.eliminado_en IS NULL))))
$function$;

COMMENT ON FUNCTION tel.fn_chofer_en(bigint, timestamp with time zone, text) IS
    'Migración 265: única regla de quién maneja un tractor en un momento: viaje de logística con relevos, viaje de chofer, titular activo.';

-- La tarjeta de la telemetría: solo señal
CREATE FUNCTION tel.fn_chofer_tarjeta(p_camion bigint, p_desde timestamp with time zone DEFAULT NULL)
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
    SELECT l.chofer_id FROM tel.lectura l
     WHERE l.camion_id = p_camion AND l.chofer_id IS NOT NULL
       AND l.ts > greatest(now() - interval '12 hours', coalesce(p_desde, '-infinity'))
     ORDER BY l.ts DESC LIMIT 1
$function$;

COMMENT ON FUNCTION tel.fn_chofer_tarjeta(bigint, timestamp with time zone) IS
    'Migración 265: chofer que marca la tarjeta de la telemetría en las últimas 12 h. Es una señal: no decide quién maneja.';

-- -----------------------------------------------------------------------------
-- 2 · Las tres funciones anteriores quedan como envoltorio (misma firma y mismos permisos)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fue.fn_chofer_actual(p_camion bigint)
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
    -- Migración 265: envoltorio de tel.fn_chofer_en (se borra cuando nada la nombre)
    SELECT tel.fn_chofer_en(p_camion, now())
$function$;

CREATE OR REPLACE FUNCTION tel.fn_chofer_actual(p_camion bigint)
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
    -- Migración 265: envoltorio de tel.fn_chofer_en (se borra cuando nada la nombre)
    SELECT tel.fn_chofer_en(p_camion, now())
$function$;

CREATE OR REPLACE FUNCTION tel.fn_chofer_ahora_viaje(p_viaje bigint)
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
    -- Migración 265: envoltorio de tel.fn_chofer_en (se borra cuando nada la nombre).
    -- De un viaje que ya no está abierto, el chofer es el del viaje.
    SELECT CASE WHEN v.estado = 'abierto' THEN coalesce(tel.fn_chofer_en(v.camion_id, now()), v.chofer_id) ELSE v.chofer_id END
      FROM ops.viaje_chofer v WHERE v.id = p_viaje AND v.eliminado_en IS NULL
$function$;

-- -----------------------------------------------------------------------------
-- 3 · Seguimiento: avisa cuando la tarjeta marca a otro chofer
-- -----------------------------------------------------------------------------
DO $do$
DECLARE v_def text; v_ancla text := $a$'salida_ts', x.salida_ts,$a$; v_n int;
BEGIN
    v_def := pg_get_functiondef('tel.fn_seguimiento_viajes()'::regprocedure);
    v_n := (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla);
    IF v_n <> 1 THEN
        RAISE EXCEPTION 'tel.fn_seguimiento_viajes no es la esperada (el texto ancla aparece % veces): avisar antes de seguir', v_n;
    END IF;
    v_def := replace(v_def, v_ancla,
        $n$'chofer_tarjeta', CASE WHEN tel.fn_chofer_tarjeta(x.camion_id, x.salida_ts) IS DISTINCT FROM tel.fn_chofer_ahora_viaje(x.id)
                                        THEN ops.fn_nombre_chofer(tel.fn_chofer_tarjeta(x.camion_id, x.salida_ts)) END,
                $n$ || v_ancla);
    EXECUTE v_def;
END $do$;

-- -----------------------------------------------------------------------------
-- 4 · Lo que un chofer tiene abierto
-- -----------------------------------------------------------------------------
CREATE FUNCTION mae.fn_chofer_pendientes(p_chofer bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
    WITH p AS (
        SELECT (SELECT string_agg(c.patente || ' (' || a.tipo || ')', ', ' ORDER BY c.patente)
                  FROM mae.asignacion_camion_chofer a JOIN mae.camion c ON c.id = a.camion_id
                 WHERE a.chofer_id = p_chofer AND a.eliminado_en IS NULL
                   AND (a.vigente_hasta IS NULL OR a.vigente_hasta > mae.fn_hoy())) AS asignaciones,
               (SELECT count(*) FROM ops.tramo_chofer tc JOIN ops.tramo_operativo t ON t.id = tc.tramo_id
                 WHERE tc.chofer_id = p_chofer AND tc.hasta_ts IS NULL AND tc.eliminado_en IS NULL
                   AND t.chofer_id IS DISTINCT FROM p_chofer
                   AND t.estado IN ('planificado', 'en_curso') AND t.eliminado_en IS NULL)::int AS relevos,
               (SELECT count(*) FROM ops.tramo_operativo t
                 WHERE t.chofer_id = p_chofer AND t.estado = 'planificado' AND t.eliminado_en IS NULL)::int AS planificados,
               (SELECT count(*) FROM ops.tramo_operativo t
                 WHERE t.chofer_id = p_chofer AND t.estado = 'en_curso' AND t.eliminado_en IS NULL)::int AS en_curso,
               (SELECT string_agg(v.numero, ', ' ORDER BY v.numero) FROM ops.viaje_chofer v
                 WHERE v.chofer_id = p_chofer AND v.estado = 'abierto' AND v.eliminado_en IS NULL) AS viajes_chofer)
    SELECT jsonb_build_object(
               'hay', p.asignaciones IS NOT NULL OR p.relevos + p.planificados + p.en_curso > 0 OR p.viajes_chofer IS NOT NULL,
               'asignaciones', p.asignaciones, 'relevos', p.relevos, 'planificados', p.planificados,
               'en_curso', p.en_curso, 'viajes_chofer', p.viajes_chofer,
               'texto', nullif(concat_ws('; ',
                   'sigue asignado a ' || p.asignaciones || ' (se cambia en Flota › Choferes de los tractores)',
                   CASE WHEN p.en_curso > 0 THEN p.en_curso || CASE WHEN p.en_curso = 1 THEN ' viaje en curso' ELSE ' viajes en curso' END
                                                  || ' (Viajes › Operaciones)' END,
                   CASE WHEN p.planificados > 0 THEN p.planificados || CASE WHEN p.planificados = 1 THEN ' viaje planificado' ELSE ' viajes planificados' END
                                                  || ' (Viajes › Operaciones)' END,
                   CASE WHEN p.relevos > 0 THEN p.relevos || CASE WHEN p.relevos = 1 THEN ' relevo abierto' ELSE ' relevos abiertos' END
                                                  || ' (Viajes › Operaciones)' END,
                   'viaje de chofer abierto ' || p.viajes_chofer || ' (Viajes › Viajes de chofer)'), ''))
      FROM p
$function$;

COMMENT ON FUNCTION mae.fn_chofer_pendientes(bigint) IS
    'Migración 265: lo que un chofer tiene abierto (tractores asignados, relevos, viajes). Frena la baja y la eliminación; en la licencia solo se advierte.';

-- Los mismos permisos que la función de eliminar un chofer
DO $do$
DECLARE g record; v_acl aclitem[];
BEGIN
    SELECT proacl INTO v_acl FROM pg_proc WHERE oid = 'mae.fn_eliminar_chofer(bigint,text)'::regprocedure;
    IF v_acl IS NOT NULL THEN
        REVOKE ALL ON FUNCTION mae.fn_chofer_pendientes(bigint) FROM PUBLIC;
        FOR g IN SELECT DISTINCT a.grantee::regrole::text AS rol FROM aclexplode(v_acl) a WHERE a.privilege_type = 'EXECUTE' AND a.grantee <> 0 LOOP
            EXECUTE format('GRANT EXECUTE ON FUNCTION mae.fn_chofer_pendientes(bigint) TO %s', g.rol);
        END LOOP;
        IF EXISTS (SELECT 1 FROM aclexplode(v_acl) a WHERE a.privilege_type = 'EXECUTE' AND a.grantee = 0) THEN
            GRANT EXECUTE ON FUNCTION mae.fn_chofer_pendientes(bigint) TO PUBLIC;
        END IF;
    END IF;
END $do$;

-- -----------------------------------------------------------------------------
-- 5 · La baja se frena si queda algo abierto
-- -----------------------------------------------------------------------------
CREATE FUNCTION mae.fn_chofer_baja_reglas()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE p jsonb;
BEGIN
    IF NEW.estado = 'baja' AND OLD.estado IS DISTINCT FROM 'baja' THEN
        p := mae.fn_chofer_pendientes(NEW.id);
        IF (p ->> 'hay')::boolean THEN
            RAISE EXCEPTION 'No se puede dar de baja a % %: %. Resolvé eso y después cargá la baja. Si es una ausencia temporal, usá el estado Licencia.',
                NEW.nombre, NEW.apellido, p ->> 'texto' USING ERRCODE = '55000';
        END IF;
    END IF;
    RETURN NEW;
END $function$;

CREATE TRIGGER tg_15_baja_pendientes BEFORE UPDATE OF estado ON mae.chofer
    FOR EACH ROW EXECUTE FUNCTION mae.fn_chofer_baja_reglas();

-- -----------------------------------------------------------------------------
-- 6 · Eliminar un chofer frena igual que la baja
-- -----------------------------------------------------------------------------
DO $do$
DECLARE v_def text; v_ancla text := $a$    v_nombre := ch.apellido || ', ' || ch.nombre;$a$; v_n int;
BEGIN
    v_def := pg_get_functiondef('mae.fn_eliminar_chofer(bigint,text)'::regprocedure);
    v_n := (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla);
    IF v_n <> 1 THEN
        RAISE EXCEPTION 'mae.fn_eliminar_chofer no es la esperada (el texto ancla aparece % veces): avisar antes de seguir', v_n;
    END IF;
    v_def := replace(v_def, v_ancla, v_ancla || $n$
    -- Migración 265: con algo abierto no se elimina (antes la asignación se cerraba sola)
    IF (mae.fn_chofer_pendientes(p_chofer) ->> 'hay')::boolean THEN
        RAISE EXCEPTION 'No se puede eliminar a %: %. Resolvé eso antes de eliminarlo.', v_nombre, mae.fn_chofer_pendientes(p_chofer) ->> 'texto'
            USING ERRCODE = '55000';
    END IF;$n$);
    EXECUTE v_def;
END $do$;

-- -----------------------------------------------------------------------------
-- 7 · Control: la regla vieja no quedó escrita en ningún lado
-- -----------------------------------------------------------------------------
DO $do$
DECLARE v_mal text;
BEGIN
    SELECT string_agg(n.nspname || '.' || p.proname, ', ') INTO v_mal
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE p.prokind = 'f' AND (n.nspname, p.proname) IN (('fue', 'fn_chofer_actual'), ('tel', 'fn_chofer_actual'), ('tel', 'fn_chofer_ahora_viaje'))
       AND p.prosrc NOT LIKE '%tel.fn_chofer_en(%';
    IF v_mal IS NOT NULL THEN
        RAISE EXCEPTION 'Quedaron funciones con la regla anterior: %: avisar antes de seguir', v_mal;
    END IF;
    IF (SELECT prosrc FROM pg_proc WHERE oid = 'tel.fn_seguimiento_viajes()'::regprocedure) NOT LIKE '%chofer_tarjeta%'
       OR (SELECT prosrc FROM pg_proc WHERE oid = 'mae.fn_eliminar_chofer(bigint,text)'::regprocedure) NOT LIKE '%fn_chofer_pendientes%' THEN
        RAISE EXCEPTION 'No quedaron cambiadas tel.fn_seguimiento_viajes o mae.fn_eliminar_chofer: avisar antes de seguir';
    END IF;
END $do$;

UPDATE ref.parametro SET valor = '265' WHERE codigo = 'web.version_base' AND valor::text::int < 265;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'migración 265 aplicada' AS que, (SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base') AS version_base;
