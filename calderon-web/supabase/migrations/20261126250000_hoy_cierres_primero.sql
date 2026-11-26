-- =====================================================================================
-- Migración 375 · Hoy: subir la firma de los cierres, para Operaciones y Telemetría
-- =====================================================================================
-- Pedido (26/11/2026): «tareas como subir la firma de un cierre de viaje [tienen que] figurar hasta arriba en Hoy,
-- como pendiente de realizar para las áreas de Operaciones y Telemetría, y todo lo que tiene que ver con cierre de
-- viaje [tiene que tener] una preponderancia mayor».
--   · Nuevo renglón «Subir la firma del cierre CV-… · patente» por cada cierre aprobado sin el acta firmada por el
--     chofer (fue.cierre_firma). Lo ven Operaciones y Telemetría (analista_control). Abre la ficha del cierre, donde se
--     sube la firma.
--   · Los cierres aprobados hace más de 60 días (parámetro seg.hoy_dias_cierre_sin_firma) no van de a uno: van en un
--     solo renglón que lleva a la lista de cierres. También si son más de 40.
--   · Que lo de cierres vaya arriba de todo lo decide la pantalla (web): la base solo agrega lo que faltaba.
-- Toca seg.fn_lo_mio_de_hoy por ancla (agrega un bloque al final, no reescribe nada). Si la función no es la que se
-- espera, frena sin aplicar nada. No cambia datos ni web.version_base. Se puede correr más de una vez.
-- =====================================================================================
BEGIN;

INSERT INTO ref.parametro (codigo, valor, descripcion)
SELECT 'seg.hoy_dias_cierre_sin_firma', '60'::jsonb,
       'Hoy (migración 375): los cierres aprobados sin firma de los últimos días (este número) van de a uno; los más viejos, juntos en un renglón.'
 WHERE NOT EXISTS (SELECT 1 FROM ref.parametro WHERE codigo = 'seg.hoy_dias_cierre_sin_firma');

DO $do$
DECLARE
    v_def text;
    v_nuevo constant text := $b$
    -- Migración 375: cierres aprobados sin el acta firmada por el chofer (Operaciones y Telemetría)
    IF v_roles && ARRAY['operaciones', 'analista_control'] AND to_regclass('fue.cierre_firma') IS NOT NULL THEN
        BEGIN
            RETURN QUERY
            WITH s AS (
                SELECT cv.id, cv.numero, coalesce(cv.aprobado_en, cv.llegada_ts) AS desde, m.patente,
                       nullif(btrim(concat_ws(' ', ch.nombre, ch.apellido)), '') AS chofer,
                       coalesce(cv.aprobado_en, cv.llegada_ts) >= now() - make_interval(days => greatest(ref.fn_parametro_num('seg.hoy_dias_cierre_sin_firma', 60)::integer, 1)) AS reciente
                  FROM fue.cierre_viaje cv
                  LEFT JOIN mae.camion m ON m.id = cv.camion_id
                  LEFT JOIN mae.chofer ch ON ch.id = cv.chofer_responsable_id
                 WHERE cv.estado = 'aprobado' AND cv.eliminado_en IS NULL
                   AND NOT EXISTS (SELECT 1 FROM fue.cierre_firma f WHERE f.cierre_id = cv.id)
            ), r AS (SELECT s.*, row_number() OVER (PARTITION BY s.reciente ORDER BY s.desde, s.id) AS k FROM s)
            SELECT 'revisar'::text, 'cierre_sin_firma'::text, 'cierre'::text, r.id, r.desde,
                   'Subir la firma del cierre ' || r.numero || coalesce(' · ' || r.patente, ''),
                   concat_ws(' · ', 'Aprobado y sin el acta firmada por el chofer', r.chofer),
                   NULL::text, 'combustible.cierre_viaje'::text, 1
              FROM r WHERE r.reciente AND r.k <= 40
            UNION ALL
            SELECT 'revisar'::text, 'cierres_sin_firma'::text, NULL::text, NULL::bigint, min(r.desde),
                   format('%s cierre(s) aprobado(s) sin la firma del chofer', count(*)),
                   'Los más viejos, juntos: abrí cada uno en la lista de cierres y subí el acta firmada'::text,
                   '/analisis/cierres'::text, 'combustible.cierre_viaje'::text, count(*)::integer
              FROM r WHERE NOT r.reciente OR r.k > 40
            HAVING count(*) > 0;
        EXCEPTION WHEN OTHERS THEN
            RETURN QUERY SELECT 'revisar'::text, 'error_seccion'::text, NULL::text, NULL::bigint, now(), 'No se pudo leer «Cierres sin firma»'::text,
                                SQLERRM, '/analisis/cierres'::text, 'combustible.cierre_viaje'::text, 1;
        END;
    END IF;
$b$;
BEGIN
    v_def := pg_get_functiondef('seg.fn_lo_mio_de_hoy()'::regprocedure);
    IF v_def LIKE '%''cierre_sin_firma''%' THEN RETURN; END IF;
    IF v_def !~ '\nEND \$function\$\s*$' OR v_def NOT LIKE '%v_roles text[];%' THEN
        RAISE EXCEPTION 'seg.fn_lo_mio_de_hoy no es la que esperaba esta migración. No se aplicó nada: avisar antes de seguir.';
    END IF;
    EXECUTE regexp_replace(v_def, '\nEND \$function\$\s*$', v_nuevo || E'END $function$\n');
END $do$;

-- Prueba: Hoy se arma igual para un usuario de cada rol (si falla, no queda nada aplicado)
DO $t$
DECLARE v_antes text := current_setting('app.usuario_id', true); r record;
BEGIN
    FOR r IN SELECT DISTINCT ON (ur.rol_codigo) ur.usuario_id FROM seg.usuario_rol ur ORDER BY ur.rol_codigo, ur.usuario_id LOOP
        PERFORM set_config('app.usuario_id', r.usuario_id::text, true);
        PERFORM count(*) FROM seg.fn_lo_mio_de_hoy();
        IF EXISTS (SELECT 1 FROM seg.fn_lo_mio_de_hoy() x WHERE x.titulo = 'No se pudo leer «Cierres sin firma»') THEN
            RAISE EXCEPTION 'el bloque nuevo da error para el usuario %', r.usuario_id;
        END IF;
    END LOOP;
    PERFORM set_config('app.usuario_id', coalesce(v_antes, ''), true);
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'La migración 375 no pasó su prueba (%). No se aplicó nada: avisar antes de seguir.', SQLERRM;
END $t$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Resultado: cuántos cierres aprobados esperan la firma
SELECT 'migración 375 aplicada' AS que,
       (SELECT count(*) FROM fue.cierre_viaje cv WHERE cv.estado = 'aprobado' AND cv.eliminado_en IS NULL
           AND NOT EXISTS (SELECT 1 FROM fue.cierre_firma f WHERE f.cierre_id = cv.id)) AS cierres_aprobados_sin_firma,
       (SELECT count(*) FROM fue.cierre_viaje cv WHERE cv.estado = 'aprobado' AND cv.eliminado_en IS NULL
           AND coalesce(cv.aprobado_en, cv.llegada_ts) >= now() - interval '60 days'
           AND NOT EXISTS (SELECT 1 FROM fue.cierre_firma f WHERE f.cierre_id = cv.id)) AS de_los_ultimos_60_dias;
