-- =====================================================================================
-- Migración 385 · Mapa de flota: la ruta asignada al chofer, en azul
-- =====================================================================================
-- Pedido (27/11/2026): al elegir un tractor en el mapa, mostrar en azul la ruta que Telemetría le asignó al chofer
-- (Logística › Rutas de choferes, la misma que le llega al teléfono), del punto 1 al último.
--   · tel.fn_ruta_asignada(p_chofer): las rutas que el chofer tiene por hacer, en el orden en que le llegan
--     (ops.fn_rutas_de_chofer): la que está siguiendo ahora y las que vienen después. Las ya hechas no van.
--   · Cada ruta trae sus puntos y, si ya está calculado, el camino por las rutas (tel.ruta_camino, el mismo que se
--     usa para avisar los desvíos). Si no está, la pantalla une los puntos en línea recta.
--   · Solo lee. La ven los usuarios con algún rol que no sea chofer ni cliente; permisos como tel.fn_mapa_flota.
-- No cambia datos ni web.version_base. Se puede correr más de una vez.
-- =====================================================================================
BEGIN;

DO $v$
BEGIN
    IF to_regprocedure('ops.fn_rutas_de_chofer(bigint)') IS NULL OR to_regprocedure('tel.fn_mapa_flota(integer)') IS NULL THEN
        RAISE EXCEPTION 'Faltan las rutas de los choferes o el mapa de flota: avisar antes de seguir';
    END IF;
END $v$;

CREATE OR REPLACE FUNCTION tel.fn_ruta_asignada(p_chofer bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_usr bigint := aud.fn_usuario_actual(); v_rutas jsonb;
BEGIN
    IF v_usr IS NULL OR NOT EXISTS (SELECT 1 FROM seg.usuario_rol WHERE usuario_id = v_usr AND rol_codigo NOT IN ('chofer', 'cliente')) THEN
        RAISE EXCEPTION 'La ruta asignada la ve la oficina' USING ERRCODE = '42501';
    END IF;
    IF p_chofer IS NULL THEN RETURN NULL; END IF;

    WITH r AS (
        SELECT x, row_number() OVER (ORDER BY n) AS n FROM jsonb_array_elements(ops.fn_rutas_de_chofer(p_chofer)) WITH ORDINALITY t(x, n)
         WHERE x ->> 'estado' <> 'hecha'
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', (r.x ->> 'id')::bigint,
               'orden', r.n,
               'en_curso', r.x ->> 'estado' = 'en_curso',
               'numero', r.x -> 'numero',
               'notas', r.x ->> 'notas',
               'puntos', r.x -> 'puntos',
               'km', k.km,
               -- El camino por las rutas, si se calculó para estos mismos puntos: [[lat, lng], …], simplificado a ~50 m
               'camino', CASE WHEN k.camino IS NOT NULL AND k.huella = md5(o.puntos::text) THEN
                   (SELECT jsonb_agg(jsonb_build_array(round((c ->> 1)::numeric, 5), round((c ->> 0)::numeric, 5)) ORDER BY i)
                      FROM jsonb_array_elements(extensions.ST_AsGeoJSON(extensions.ST_Simplify(k.camino::extensions.geometry, 0.0005))::jsonb -> 'coordinates')
                           WITH ORDINALITY q(c, i)) END)
               ORDER BY r.n), '[]'::jsonb)
      INTO v_rutas
      FROM r
      JOIN ops.operacion_ruta o ON o.id = (r.x ->> 'id')::bigint
      LEFT JOIN tel.ruta_camino k ON k.ruta_id = o.id;

    RETURN jsonb_build_object('chofer_id', p_chofer, 'rutas', v_rutas);
END $f$;
COMMENT ON FUNCTION tel.fn_ruta_asignada(bigint) IS
    'Migración 385 · Mapa de flota: las rutas que el chofer tiene por hacer (la de ahora y las que siguen), con sus puntos y el camino por las rutas si está calculado. Solo lee.';

-- Permisos: los del mapa de flota, sin PUBLIC ni el cliente
DO $p$
DECLARE g text; f regprocedure := 'tel.fn_ruta_asignada(bigint)';
BEGIN
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    FOR g IN SELECT r.rolname FROM pg_roles r WHERE r.rolname LIKE 'tc\_%' OR r.rolname IN ('authenticated', 'anon') LOOP
        IF g NOT IN ('tc_cliente', 'tc_chofer', 'anon') AND has_function_privilege(g, 'tel.fn_mapa_flota(integer)', 'EXECUTE') THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', f, g);
        ELSE
            EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', f, g);
        END IF;
    END LOOP;
END $p$;

-- Prueba: arma la ruta de los choferes que tienen rutas por hacer (si falla, no queda nada aplicado)
DO $t$
DECLARE v_antes text := current_setting('app.usuario_id', true); v_usr text; r record; j jsonb;
BEGIN
    SELECT ur.usuario_id::text INTO v_usr FROM seg.usuario_rol ur WHERE ur.rol_codigo NOT IN ('chofer', 'cliente') ORDER BY ur.usuario_id LIMIT 1;
    IF v_usr IS NULL THEN RETURN; END IF;
    PERFORM set_config('app.usuario_id', v_usr, true);
    FOR r IN SELECT DISTINCT o.chofer_id FROM ops.operacion_ruta o WHERE o.chofer_id IS NOT NULL AND o.eliminado_en IS NULL AND o.llegada_en IS NULL LIMIT 20 LOOP
        j := tel.fn_ruta_asignada(r.chofer_id);
        IF jsonb_typeof(j -> 'rutas') <> 'array' THEN RAISE EXCEPTION 'chofer %: la respuesta no trae las rutas', r.chofer_id; END IF;
    END LOOP;
    PERFORM set_config('app.usuario_id', coalesce(v_antes, ''), true);
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'La migración 385 no pasó su prueba (%). No se aplicó nada: avisar antes de seguir.', SQLERRM;
END $t$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Resultado
SELECT 'migración 385 aplicada' AS que,
       (SELECT count(DISTINCT o.chofer_id) FROM ops.operacion_ruta o WHERE o.chofer_id IS NOT NULL AND o.eliminado_en IS NULL AND o.llegada_en IS NULL) AS choferes_con_ruta_por_hacer,
       (SELECT count(*) FROM tel.ruta_camino k WHERE k.camino IS NOT NULL) AS rutas_con_el_camino_calculado;
