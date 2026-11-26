-- =====================================================================================
-- Migración 363 · Dar de baja al chofer aunque tenga cierres pendientes; el pago espera a los cierres
-- =====================================================================================
-- Pedido (26/11/2026): «que se pueda dar de baja a los choferes por más que tengan cierres pendientes, pero que no
-- se les pueda transferir el monto final hasta que el cierre se haga». La fecha de egreso real hace falta para que
-- cuadre la liquidación (días, viáticos, básico y tramos se cortan en la baja).
--   · fue.fn_cierres_pendientes_chofer(chofer): los cierres que le faltan al chofer: viajes de chofer abiertos y
--     viajes que llegaron sin el cierre de combustible aprobado (los de «Cierres por hacer», desde
--     fue.cierre_obligatorio_desde), con el texto para mostrar.
--   · mae.fn_chofer_pendientes(chofer): suma «frena_baja» y «texto_baja» (lo que frena la baja: tractores
--     asignados, relevos abiertos y viajes planificados o en curso de las operaciones) y «cierres». «hay» y «texto»
--     no cambian: eliminar un chofer sigue frenando con cualquier cosa abierta.
--   · La baja (trigger tg_15_baja_pendientes, mae.fn_chofer_baja_reglas) ya no la frena un viaje de chofer abierto.
--   · fin.fn_pago_frenado(chofer): si el chofer está de baja (o tiene fecha de egreso) y le faltan cierres, el motivo.
--     fin.fn_pagar_liquidacion no registra la transferencia mientras haya un motivo, y fin.fn_liquidacion_json lo
--     manda como «pago_frenado» para que la pantalla lo muestre antes.
-- A los choferes activos no les cambia nada. No cambia datos ni web.version_base. Se puede correr más de una vez.
-- =====================================================================================
BEGIN;

DO $v$
BEGIN
    IF to_regprocedure('mae.fn_chofer_pendientes(bigint)') IS NULL OR to_regprocedure('fue.fn_cierres_pendientes()') IS NULL THEN
        RAISE EXCEPTION 'Faltan las migraciones de los cierres obligatorios (133) y de quién maneja el tractor (265)';
    END IF;
    IF to_regprocedure('fin.fn_tramos_liquidacion(bigint)') IS NULL THEN
        RAISE EXCEPTION 'Falta la migración 346 (20261125160000_liquidacion_por_tramo.sql)';
    END IF;
END $v$;

-- Permisos: los mismos que una función vecina (sin PUBLIC)
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

-- ---------------------------------------------------------------------------------
-- 1 · Los cierres que le faltan a un chofer
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fue.fn_cierres_pendientes_chofer(p_chofer bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
    WITH vc AS (
        SELECT count(*)::int AS n, string_agg(v.numero, ', ' ORDER BY v.salida_ts, v.numero) AS lista
          FROM ops.viaje_chofer v
         WHERE v.chofer_id = p_chofer AND v.estado = 'abierto' AND v.eliminado_en IS NULL),
    sc AS (
        SELECT count(*)::int AS n,
               string_agg(p.patente || ' llegó el ' || to_char(p.llegada_ts AT TIME ZONE 'America/Argentina/Mendoza', 'DD/MM'), ', '
                          ORDER BY p.llegada_ts) AS lista
          FROM fue.fn_cierres_pendientes() p
         WHERE p.chofer_id = p_chofer)
    SELECT jsonb_build_object(
               'hay', vc.n + sc.n > 0,
               'viajes_abiertos', vc.n,
               'sin_cierre', sc.n,
               'texto', nullif(concat_ws('; ',
                   CASE WHEN vc.n = 1 THEN 'el viaje de chofer ' || vc.lista || ' sin cerrar (Viajes › Viajes de chofer)'
                        WHEN vc.n > 1 THEN 'los viajes de chofer ' || vc.lista || ' sin cerrar (Viajes › Viajes de chofer)' END,
                   CASE WHEN sc.n = 1 THEN 'el cierre de combustible del viaje (' || sc.lista || ') sin aprobar (Viajes › Cierres por hacer)'
                        WHEN sc.n > 1 THEN sc.n || ' cierres de combustible sin aprobar (' || sc.lista || ') (Viajes › Cierres por hacer)' END), ''))
      FROM vc, sc
$function$;
COMMENT ON FUNCTION fue.fn_cierres_pendientes_chofer(bigint) IS
    'Migración 363: viajes de chofer abiertos y viajes llegados sin cierre de combustible aprobado de un chofer, con el texto para mostrar.';
SELECT pg_temp.fn_copiar_permisos('fue.fn_cierres_pendientes()', 'fue.fn_cierres_pendientes_chofer(bigint)');

-- ---------------------------------------------------------------------------------
-- 2 · Lo que el chofer tiene abierto: qué frena la baja y qué cierres le faltan
-- ---------------------------------------------------------------------------------
DO $do$
DECLARE v_def text := pg_get_functiondef('mae.fn_chofer_pendientes(bigint)'::regprocedure);
BEGIN
    IF position('frena_baja' IN v_def) > 0 THEN RETURN; END IF;
    IF position('''viaje de chofer abierto '' || p.viajes_chofer' IN v_def) = 0 OR position('''asignaciones'', p.asignaciones' IN v_def) = 0 THEN
        RAISE EXCEPTION 'mae.fn_chofer_pendientes no es la que esperaba esta migración: avisar antes de seguir';
    END IF;
END $do$;

CREATE OR REPLACE FUNCTION mae.fn_chofer_pendientes(p_chofer bigint)
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
                 WHERE v.chofer_id = p_chofer AND v.estado = 'abierto' AND v.eliminado_en IS NULL) AS viajes_chofer),
    t AS (
        SELECT p.*,
               'sigue asignado a ' || p.asignaciones || ' (se cambia en Flota › Choferes de los tractores)' AS t_asignaciones,
               CASE WHEN p.en_curso > 0 THEN p.en_curso || CASE WHEN p.en_curso = 1 THEN ' viaje en curso' ELSE ' viajes en curso' END
                                              || ' (Viajes › Operaciones)' END AS t_en_curso,
               CASE WHEN p.planificados > 0 THEN p.planificados || CASE WHEN p.planificados = 1 THEN ' viaje planificado' ELSE ' viajes planificados' END
                                              || ' (Viajes › Operaciones)' END AS t_planificados,
               CASE WHEN p.relevos > 0 THEN p.relevos || CASE WHEN p.relevos = 1 THEN ' relevo abierto' ELSE ' relevos abiertos' END
                                              || ' (Viajes › Operaciones)' END AS t_relevos,
               fue.fn_cierres_pendientes_chofer(p_chofer) AS cierres
          FROM p)
    SELECT jsonb_build_object(
               'hay', t.asignaciones IS NOT NULL OR t.relevos + t.planificados + t.en_curso > 0 OR t.viajes_chofer IS NOT NULL,
               'asignaciones', t.asignaciones, 'relevos', t.relevos, 'planificados', t.planificados,
               'en_curso', t.en_curso, 'viajes_chofer', t.viajes_chofer,
               'texto', nullif(concat_ws('; ', t.t_asignaciones, t.t_en_curso, t.t_planificados, t.t_relevos,
                                         'viaje de chofer abierto ' || t.viajes_chofer || ' (Viajes › Viajes de chofer)'), ''),
               -- Migración 363: los cierres de viaje pendientes no frenan la baja (frenan la transferencia de la liquidación)
               'frena_baja', t.asignaciones IS NOT NULL OR t.relevos + t.planificados + t.en_curso > 0,
               'texto_baja', nullif(concat_ws('; ', t.t_asignaciones, t.t_en_curso, t.t_planificados, t.t_relevos), ''),
               'cierres', t.cierres)
      FROM t
$function$;

CREATE OR REPLACE FUNCTION mae.fn_chofer_baja_reglas()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE p jsonb;
BEGIN
    IF NEW.estado = 'baja' AND OLD.estado IS DISTINCT FROM 'baja' THEN
        p := mae.fn_chofer_pendientes(NEW.id);
        -- Migración 363: frena lo que sigue en las operaciones; los cierres de viaje pendientes no (frenan el pago)
        IF (p ->> 'frena_baja')::boolean THEN
            RAISE EXCEPTION 'No se puede dar de baja a % %: %. Resolvé eso y después cargá la baja. Si es una ausencia temporal, usá el estado Licencia.',
                NEW.nombre, NEW.apellido, p ->> 'texto_baja' USING ERRCODE = '55000';
        END IF;
    END IF;
    RETURN NEW;
END $function$;

-- ---------------------------------------------------------------------------------
-- 3 · Al chofer de baja no se le transfiere mientras le falten cierres
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fin.fn_pago_frenado(p_chofer bigint)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
    SELECT 'No se le puede transferir a ' || ch.apellido || ', ' || ch.nombre || ' hasta que se hagan sus cierres: está de baja'
           || CASE WHEN ch.fecha_egreso IS NOT NULL THEN ' desde el ' || to_char(ch.fecha_egreso, 'DD/MM/YYYY') ELSE '' END
           || ' y tiene ' || (x.c ->> 'texto') || '.'
      FROM mae.chofer ch
     CROSS JOIN LATERAL (SELECT fue.fn_cierres_pendientes_chofer(ch.id) AS c) x
     WHERE ch.id = p_chofer AND (ch.estado = 'baja' OR ch.fecha_egreso IS NOT NULL) AND (x.c ->> 'hay')::boolean
$function$;
COMMENT ON FUNCTION fin.fn_pago_frenado(bigint) IS
    'Migración 363: si el chofer está de baja y le faltan cierres de viaje, por qué no se le puede transferir la liquidación (si no, NULL).';
SELECT pg_temp.fn_copiar_permisos('fin.fn_liquidacion_json(bigint)', 'fin.fn_pago_frenado(bigint)');

DO $do$
DECLARE
    v_def text := pg_get_functiondef('fin.fn_pagar_liquidacion(bigint, date, text, text, text, bigint)'::regprocedure);
    v_ancla constant text := 'IF l.estado <> ''aprobada'' THEN RAISE EXCEPTION ''Solo se paga una liquidación aprobada (está %)'', l.estado USING ERRCODE = ''55000''; END IF;';
    v_veces integer;
BEGIN
    IF position('fin.fn_pago_frenado' IN v_def) > 0 THEN RETURN; END IF;
    v_veces := (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla);
    IF v_veces <> 1 THEN
        RAISE EXCEPTION 'fin.fn_pagar_liquidacion no es la que esperaba esta migración (el control del estado aparece % veces): avisar antes de seguir', v_veces;
    END IF;
    EXECUTE replace(v_def, v_ancla, v_ancla || '
        -- Migración 363: al chofer de baja no se le transfiere mientras le falten cierres de viaje
        IF fin.fn_pago_frenado(l.chofer_id) IS NOT NULL THEN
            RAISE EXCEPTION ''%'', fin.fn_pago_frenado(l.chofer_id) USING ERRCODE = ''55000'';
        END IF;');
END $do$;

DO $do$
DECLARE
    v_def text := pg_get_functiondef('fin.fn_liquidacion_json(bigint)'::regprocedure);
    v_ancla constant text := '''baja_chofer'', (SELECT ch.fecha_egreso FROM fin.liquidacion_mensual l JOIN mae.chofer ch ON ch.id = l.chofer_id WHERE l.id = p_liq),';
    v_veces integer;
BEGIN
    IF position('pago_frenado' IN v_def) > 0 THEN RETURN; END IF;
    v_veces := (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla);
    IF v_veces <> 1 THEN
        RAISE EXCEPTION 'fin.fn_liquidacion_json no es la que esperaba esta migración (la baja del chofer aparece % veces): avisar antes de seguir', v_veces;
    END IF;
    EXECUTE replace(v_def, v_ancla, v_ancla || '
        -- Migración 363: por qué todavía no se le puede transferir (chofer de baja con cierres pendientes)
        ''pago_frenado'', (SELECT fin.fn_pago_frenado(l.chofer_id) FROM fin.liquidacion_mensual l WHERE l.id = p_liq),');
END $do$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Resultado: los choferes de baja (o con egreso) que tienen una liquidación sin transferir, y si se les puede transferir
SELECT 'migración 363 aplicada' AS que,
       ch.id AS chofer_id, ch.apellido || ', ' || ch.nombre AS chofer, ch.estado, ch.fecha_egreso,
       (SELECT string_agg(l.numero || ' (' || l.estado || ')', ', ' ORDER BY l.periodo) FROM fin.liquidacion_mensual l
         WHERE l.chofer_id = ch.id AND l.estado IN ('borrador', 'aprobada') AND l.eliminado_en IS NULL) AS liquidaciones,
       coalesce(fin.fn_pago_frenado(ch.id), 'se le puede transferir') AS pago
  FROM mae.chofer ch
 WHERE ch.eliminado_en IS NULL AND (ch.estado = 'baja' OR ch.fecha_egreso IS NOT NULL)
   AND EXISTS (SELECT 1 FROM fin.liquidacion_mensual l WHERE l.chofer_id = ch.id AND l.estado IN ('borrador', 'aprobada') AND l.eliminado_en IS NULL)
 ORDER BY ch.fecha_egreso DESC NULLS LAST, ch.apellido;
