-- =============================================================================
-- IronTrack — 303 · Remitos de estaciones: un remito raro ya no frena la lectura de todos
-- -----------------------------------------------------------------------------
-- Pedido del usuario (24/11/2026): «¿Hay alguna carga de la Shell de Rodríguez Peña que no se haya registrado en el
-- sistema?». La consulta 337 mostró que Iris no leyó ninguno de los 20 remitos llegados desde el 16/11 y que la tarea
-- de cada 10 minutos fallaba casi siempre (142 de 144 corridas en 24 h) con «malformed array literal: "Iris no encontró
-- los litros en el remito"».
-- Causa: fue.fn_remito_completar agregaba dos avisos fijos con `v_av || 'texto'`. Un texto sin tipo pegado a una
-- lista PostgreSQL lo toma como otra lista y falla. Pasa cuando Iris no encuentra litros, por ejemplo con un recibo o
-- una factura que llegan por el mismo mail. La tarea es una sola transacción, así que ese error deshacía todo: lo leído
-- de los demás remitos y la revisión de la casilla. Solo andaba cuando la respuesta de Iris ya se había borrado (cada
-- ~6 h), y entonces volvía a mandar los mismos seis primeros: los demás nunca se leían.
--   · fue.fn_remito_completar: los dos avisos fijos se agregan con array_append.
--   · fue.fn_remitos_recoger y fue.fn_remitos_leer: si pasar los datos de un remito falla, ese remito queda «no se
--     pudo leer» con el motivo (se ve en Combustible › Cargas) y la tarea sigue con los demás.
--   · fue.fn_remitos_leer: primero los remitos que nunca se mandaron a Iris, después los que se mandaron hace más
--     tiempo (antes eran siempre los seis de número más bajo).
--   · fue.fn_remitos_sincronizar: cada paso (recoger lo leído, mirar la casilla, mandar a leer, cruzar con cargas y
--     órdenes) va por separado. Si uno falla, lo de los otros queda guardado y el error se anota como última revisión
--     con error, que muestra la pantalla de remitos.
-- No toca datos: los remitos pendientes se leen solos en las próximas vueltas. No toca la web ni web.version_base.
-- =============================================================================
SET search_path = public, extensions;
BEGIN;

DO $do$
BEGIN
    IF to_regprocedure('fue.fn_remito_completar(bigint)') IS NULL OR to_regprocedure('fue.fn_remitos_recoger()') IS NULL
       OR to_regprocedure('fue.fn_remitos_leer(integer)') IS NULL OR to_regprocedure('fue.fn_remitos_sincronizar()') IS NULL
       OR to_regprocedure('fue.fn_remitos_traer()') IS NULL OR to_regprocedure('fue.fn_remitos_vincular()') IS NULL
       OR to_regclass('fue.remito_consulta') IS NULL THEN
        RAISE EXCEPTION 'Faltan las funciones de los remitos de estaciones (migración 277): aplicarla antes';
    END IF;
    IF pg_get_functiondef('fue.fn_remito_completar(bigint)'::regprocedure) LIKE '%array_append(v_av, ''Iris no encontró los litros en el remito'')%' THEN
        RAISE EXCEPTION 'La migración 303 (remitos: un remito raro no frena la lectura) ya está aplicada';
    END IF;
END $do$;

-- Cambios en las funciones vivas: cada texto viejo tiene que estar una sola vez; si no, no se aplica nada
DO $do$
DECLARE c record; v_def text; v_n integer;
BEGIN
    FOR c IN SELECT * FROM (VALUES
        (1, 'fue.fn_remito_completar(bigint)',
            $t$v_av := v_av || 'el remito tiene renglones de combustible con precios distintos';$t$,
            $t$v_av := array_append(v_av, 'el remito tiene renglones de combustible con precios distintos');$t$),
        (2, 'fue.fn_remito_completar(bigint)',
            $t$v_av := v_av || 'Iris no encontró los litros en el remito';$t$,
            $t$v_av := array_append(v_av, 'Iris no encontró los litros en el remito');$t$),
        (3, 'fue.fn_remitos_recoger()',
            $t$PERFORM fue.fn_remito_completar(r.id);$t$,
            $t$BEGIN
            PERFORM fue.fn_remito_completar(r.id);
        EXCEPTION WHEN OTHERS THEN   -- Migración 303: un remito que falla no frena a los demás
            UPDATE fue.remito_estacion SET lectura = 'error', error = left('No se pudieron pasar los datos leídos: ' || SQLERRM, 300) WHERE id = r.id;
            CONTINUE;
        END;$t$),
        (4, 'fue.fn_remitos_leer(integer)',
            $t$PERFORM fue.fn_remito_completar(r.id);$t$,
            $t$BEGIN
                PERFORM fue.fn_remito_completar(r.id);
            EXCEPTION WHEN OTHERS THEN   -- Migración 303
                UPDATE fue.remito_estacion SET lectura = 'error', error = left('No se pudieron pasar los datos leídos: ' || SQLERRM, 300) WHERE id = r.id;
            END;$t$),
        (5, 'fue.fn_remitos_leer(integer)',
            $t$WHERE lectura = 'pendiente' ORDER BY id LIMIT p_max$t$,
            $t$WHERE lectura = 'pendiente' ORDER BY enviado_en NULLS FIRST, id LIMIT p_max$t$)
    ) AS t(n, fn, viejo, nuevo) ORDER BY n LOOP
        v_def := pg_get_functiondef(c.fn::regprocedure);
        v_n := (length(v_def) - length(replace(v_def, c.viejo, ''))) / length(c.viejo);
        IF v_n <> 1 THEN
            RAISE EXCEPTION 'En % el texto del cambio % está % veces (tenía que estar una): no se aplicó nada', c.fn, c.n, v_n;
        END IF;
        EXECUTE replace(v_def, c.viejo, c.nuevo);
    END LOOP;
END $do$;

-- La vuelta de cada 10 minutos: cada paso por separado
CREATE OR REPLACE FUNCTION fue.fn_remitos_sincronizar()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE v_traer jsonb; v_rec integer; v_env integer; v_vin integer; v_err jsonb := '{}'::jsonb;
BEGIN
    IF NOT coalesce((SELECT valor::text::boolean FROM ref.parametro WHERE codigo = 'fue.remitos_activo' AND eliminado_en IS NULL), false) THEN
        RETURN jsonb_build_object('activo', false);
    END IF;
    -- Migración 303: si un paso falla, lo de los otros queda guardado
    BEGIN v_rec := fue.fn_remitos_recoger(); EXCEPTION WHEN OTHERS THEN v_err := v_err || jsonb_build_object('recoger lo leído', SQLERRM); END;
    BEGIN v_traer := fue.fn_remitos_traer(); EXCEPTION WHEN OTHERS THEN v_err := v_err || jsonb_build_object('mirar la casilla', SQLERRM); END;
    BEGIN v_env := fue.fn_remitos_leer(); EXCEPTION WHEN OTHERS THEN v_err := v_err || jsonb_build_object('mandar a leer', SQLERRM); END;
    BEGIN v_vin := fue.fn_remitos_vincular(); EXCEPTION WHEN OTHERS THEN v_err := v_err || jsonb_build_object('cruzar con cargas', SQLERRM); END;
    IF v_err <> '{}'::jsonb THEN
        INSERT INTO fue.remito_consulta (ok, mensaje)
        VALUES (false, left('Falló un paso de la lectura de remitos: '
                            || (SELECT string_agg(k || ': ' || (v_err ->> k), ' · ') FROM jsonb_object_keys(v_err) k), 400));
        RAISE WARNING 'Remitos de estaciones: %', v_err::text;
    END IF;
    RETURN jsonb_build_object('traer', v_traer, 'leidos', v_rec, 'enviados_a_iris', v_env, 'unidos', v_vin)
           || CASE WHEN v_err <> '{}'::jsonb THEN jsonb_build_object('errores', v_err) ELSE '{}'::jsonb END;
END $function$;

COMMENT ON FUNCTION fue.fn_remitos_sincronizar() IS
    'Migración 303: la vuelta de cada 10 minutos de los remitos de estaciones; cada paso por separado, los errores quedan en fue.remito_consulta.';

COMMIT;

NOTIFY pgrst, 'reload schema';

SELECT 'migración 303 aplicada' AS que,
       (SELECT count(*) FROM fue.remito_estacion WHERE lectura IN ('pendiente', 'enviada') AND descartada_en IS NULL) AS remitos_por_leer,
       'se leen solos en las próximas vueltas (6 cada 10 minutos)' AS como_sigue;
