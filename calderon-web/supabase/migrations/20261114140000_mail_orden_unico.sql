-- =============================================================================
-- IronTrack — 269 · Cambio 262 · Un solo mail para la orden de camión y la de genset (backlog B5)
-- -----------------------------------------------------------------------------
-- El mail que recibe la estación estaba escrito dos veces, casi igual: en la orden de carga
-- del camión (fue.fn_crear_orden_carga) y en la del genset (fue.fn_crear_orden_genset). Cada
-- cambio había que hacerlo en los dos lados (el último, la fila «Combustible» del cambio 250).
-- Desde ahora:
--   · fue.fn_mail_orden_partes(orden, palabra) arma el mail (para, asunto, html y adjuntos)
--     para los dos casos, a partir de la orden.
--   · fue.fn_mail_orden(orden, palabra) lo deja en la cola y lo anota en la orden.
--   · Las dos funciones de crear orden la llaman. Sus validaciones no se tocan: las de camión
--     y las de genset son distintas de verdad y siguen separadas.
-- El mail queda igual, letra por letra. La migración vuelve a armar los mails de las órdenes
-- ya enviadas y los compara con lo que se mandó; si en las últimas órdenes ninguno coincide,
-- se frena sola y no guarda nada.
-- No cambia tablas ni pantallas. web.version_base = 269.
-- =============================================================================
SET search_path = public, extensions;
BEGIN;

DO $do$
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 264 THEN
        RAISE EXCEPTION 'Falta la migración 264 (cambio 254): aplicarla antes';
    END IF;
    IF to_regprocedure('fue.fn_mail_orden(bigint,text)') IS NOT NULL THEN
        RAISE EXCEPTION 'La migración 269 (mail único de las órdenes) ya está aplicada';
    END IF;
END $do$;

-- -----------------------------------------------------------------------------
-- 1 · El mail, armado una sola vez
-- -----------------------------------------------------------------------------
CREATE FUNCTION fue.fn_mail_orden_partes(p_orden bigint, p_palabra text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
    o fue.orden_carga; e mae.estacion_servicio%ROWTYPE; g mae.genset%ROWTYPE; c jsonb; v_patente text; v_foto text;
BEGIN
    SELECT * INTO o FROM fue.orden_carga WHERE id = p_orden;
    IF o.id IS NULL THEN RAISE EXCEPTION 'La orden de carga no existe' USING ERRCODE = 'P0002'; END IF;
    SELECT * INTO e FROM mae.estacion_servicio WHERE id = o.estacion_id;
    SELECT patente INTO v_patente FROM mae.camion WHERE id = o.camion_id;
    SELECT foto_mini INTO v_foto FROM mae.chofer WHERE id = o.chofer_id;
    IF o.genset_id IS NOT NULL THEN
        SELECT * INTO g FROM mae.genset WHERE id = o.genset_id;
        c := fue.fn_contexto_genset(o.genset_id, o.creada_en);
    END IF;
    RETURN jsonb_build_object(
        'para', e.correo,
        'asunto', 'Orden de carga ' || o.numero || ' · ' || CASE WHEN o.genset_id IS NOT NULL THEN 'Genset ' || g.codigo ELSE v_patente END,
        'html',
            '<p>Estación <b>' || e.nombre || '</b>:</p>'
            || CASE WHEN o.genset_id IS NOT NULL
                    THEN '<p>Está autorizada la siguiente carga de combustible para un <b>generador (genset)</b>.</p>'
                    ELSE '<p>Está autorizada la siguiente carga de combustible.</p>' END
            || '<table cellpadding="4" style="border-collapse:collapse">'
            || '<tr><td>Orden</td><td><b>' || o.numero || '</b></td></tr>'
            || '<tr><td>Chofer</td><td>'
            || CASE WHEN v_foto IS NOT NULL
                    THEN '<img src="cid:foto-chofer" width="120" height="120" alt="Foto del chofer" style="display:block;border-radius:60px;margin-bottom:6px">' ELSE '' END
            || '<b>' || coalesce(ops.fn_nombre_chofer(o.chofer_id), '') || '</b></td></tr>'
            || CASE WHEN o.genset_id IS NOT NULL
                    THEN '<tr><td>Genset</td><td><b>' || g.codigo || '</b>'
                         || coalesce(' · tractor <b>' || (c ->> 'tractor') || '</b>', '') || coalesce(' · semi ' || (c ->> 'semi'), '') || '</td></tr>'
                    ELSE '<tr><td>Patente</td><td><b>' || v_patente || '</b></td></tr>' END
            || '<tr><td>A cargar</td><td style="font-size:18px"><b>' || fue.fn_texto_autorizado(o) || '</b></td></tr>'
            || coalesce('<tr><td>Combustible</td><td style="font-size:18px"><b>' || fue.fn_combustible_estacion(e.id) || '</b></td></tr>', '')
            || '<tr><td>Vence</td><td>' || to_char((o.vence_en - interval '1 second') AT TIME ZONE 'America/Argentina/Mendoza', 'DD/MM/YYYY "a las 23:59"') || '</td></tr>'
            || '</table>'
            || '<p style="font-size:18px">Palabra de seguridad: <b>' || p_palabra || '</b></p>'
            || '<p>El chofer le va a mostrar un código QR. Escanéelo con el teléfono, escriba la palabra de seguridad y confirme la carga. '
            || 'La palabra sirve solo para esta orden. No la comparta con el chofer.</p>',
        'adjuntos', CASE WHEN v_foto IS NOT NULL
                         THEN jsonb_build_array(jsonb_build_object('cid', 'foto-chofer', 'nombre', 'chofer.jpg', 'tipo', 'image/jpeg', 'base64', v_foto)) END);
END $function$;

COMMENT ON FUNCTION fue.fn_mail_orden_partes(bigint, text) IS
    'Migración 269: arma el mail de una orden de carga (camión o genset) para la estación. Único lugar donde está escrito.';

CREATE FUNCTION fue.fn_mail_orden(p_orden bigint, p_palabra text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE m jsonb := fue.fn_mail_orden_partes(p_orden, p_palabra); v_mail bigint;
BEGIN
    IF nullif(btrim(coalesce(m ->> 'para', '')), '') IS NULL THEN RETURN NULL; END IF;
    INSERT INTO ops.mail_saliente (para, asunto, referencia, html, adjuntos)
    VALUES (m ->> 'para', m ->> 'asunto', 'orden_carga:' || p_orden, m ->> 'html', nullif(m -> 'adjuntos', 'null'::jsonb))
    RETURNING id INTO v_mail;
    UPDATE fue.orden_carga SET mail_id = v_mail WHERE id = p_orden;
    RETURN v_mail;
END $function$;

COMMENT ON FUNCTION fue.fn_mail_orden(bigint, text) IS
    'Migración 269: deja en la cola el mail de la orden para la estación y lo anota en la orden. La palabra de seguridad solo existe al crear la orden.';

-- Solo las llaman las funciones de crear orden (llevan la palabra de seguridad)
REVOKE ALL ON FUNCTION fue.fn_mail_orden_partes(bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION fue.fn_mail_orden(bigint, text) FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- 2 · Las dos funciones de crear orden la llaman (se saca el mail copiado)
-- -----------------------------------------------------------------------------
DO $do$
DECLARE
    f text; v_def text; v_ini text; v_fin text := 'UPDATE fue.orden_carga SET mail_id = v_mail WHERE id = o.id;';
    a int; b int; v_corte text;
BEGIN
    FOREACH f IN ARRAY ARRAY['fn_crear_orden_carga', 'fn_crear_orden_genset'] LOOP
        v_def := pg_get_functiondef((SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'fue' AND p.proname = f));
        v_ini := CASE f WHEN 'fn_crear_orden_carga' THEN 'IF e.correo IS NOT NULL THEN' ELSE 'INSERT INTO ops.mail_saliente (para, asunto, referencia, html, adjuntos)' END;
        IF (length(v_def) - length(replace(v_def, v_ini, ''))) / length(v_ini) <> 1
           OR (length(v_def) - length(replace(v_def, v_fin, ''))) / length(v_fin) <> 1
           OR (length(v_def) - length(replace(v_def, 'INSERT INTO ops.mail_saliente', ''))) / length('INSERT INTO ops.mail_saliente') <> 1 THEN
            RAISE EXCEPTION 'fue.% no es la esperada (no se encuentra el mail una sola vez): avisar antes de seguir', f;
        END IF;
        a := strpos(v_def, v_ini); b := strpos(v_def, v_fin) + length(v_fin);
        v_corte := substr(v_def, a, b - a);
        IF a >= b OR length(v_corte) > 4500 OR v_corte NOT LIKE '%Palabra de seguridad%' OR v_corte NOT LIKE '%cid:foto-chofer%'
           OR v_corte NOT LIKE '%fn_combustible_estacion%' OR v_corte LIKE '%RETURN %' THEN
            RAISE EXCEPTION 'fue.%: el bloque del mail no es el esperado: avisar antes de seguir', f;
        END IF;
        v_def := left(v_def, a - 1) || 'v_mail := fue.fn_mail_orden(o.id, v_pal);   -- Migración 269: el mail está en un solo lugar' || '@@FIN@@' || substr(v_def, b);
        -- En la del camión el mail estaba dentro de un «IF … END IF»: se va con el bloque
        v_def := CASE f WHEN 'fn_crear_orden_carga' THEN regexp_replace(v_def, '@@FIN@@\s*END IF;', '') ELSE replace(v_def, '@@FIN@@', '') END;
        IF v_def LIKE '%@@FIN@@%' THEN RAISE EXCEPTION 'fue.%: no se pudo cerrar el bloque del mail: avisar antes de seguir', f; END IF;
        EXECUTE v_def;
    END LOOP;
END $do$;

-- -----------------------------------------------------------------------------
-- 3 · Control: el mail sale igual que los que ya se mandaron
-- -----------------------------------------------------------------------------
DO $do$
DECLARE r record; m jsonb; v_pal text; v_tipo text; v_n int[] := ARRAY[0, 0]; v_ig int[] := ARRAY[0, 0]; i int; v_dif text[] := '{}'; p int; v_env text;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'fue' AND p.proname IN ('fn_crear_orden_carga', 'fn_crear_orden_genset')
                  AND (p.prosrc LIKE '%ops.mail_saliente%' OR p.prosrc NOT LIKE '%fue.fn_mail_orden(o.id, v_pal)%')) THEN
        RAISE EXCEPTION 'Alguna de las dos funciones de crear orden todavía tiene el mail adentro: avisar antes de seguir';
    END IF;
    FOR r IN
        SELECT * FROM (
            SELECT o.id, o.numero, o.genset_id IS NOT NULL AS es_genset, ms.asunto, ms.html,
                   row_number() OVER (PARTITION BY o.genset_id IS NOT NULL ORDER BY o.creada_en DESC) AS orden
              FROM fue.orden_carga o JOIN ops.mail_saliente ms ON ms.id = o.mail_id) q
         WHERE q.orden <= 5
    LOOP
        i := CASE WHEN r.es_genset THEN 2 ELSE 1 END;
        v_pal := substring(r.html FROM 'Palabra de seguridad: <b>([^<]*)</b>');
        IF v_pal IS NULL THEN CONTINUE; END IF;
        v_n[i] := v_n[i] + 1;
        m := fue.fn_mail_orden_partes(r.id, v_pal);
        -- La cola le agrega un marco al html: lo que se compara es que el mail armado esté adentro, letra por letra
        IF strpos(r.html, m ->> 'html') > 0 AND m ->> 'asunto' = r.asunto THEN
            v_ig[i] := v_ig[i] + 1;
        ELSE
            v_env := substr(r.html, greatest(strpos(r.html, '<p>Estación'), 1));
            p := 1;
            WHILE p <= least(length(v_env), length(m ->> 'html')) AND substr(v_env, p, 1) = substr(m ->> 'html', p, 1) LOOP p := p + 1; END LOOP;
            v_dif := v_dif || format('%s: enviado «…%s» / ahora «…%s»', r.numero,
                substr(v_env, greatest(p - 25, 1), 70), substr(m ->> 'html', greatest(p - 25, 1), 70));
        END IF;
    END LOOP;
    IF (v_n[1] > 0 AND v_ig[1] = 0) OR (v_n[2] > 0 AND v_ig[2] = 0) THEN
        RAISE EXCEPTION 'No se guardó nada: el mail armado no coincide con ninguno de los últimos enviados (camión % de %, genset % de %). Diferencias: %',
            v_ig[1], v_n[1], v_ig[2], v_n[2], left(array_to_string(v_dif, ' | '), 1500);
    END IF;
    RAISE NOTICE 'Mail igual al enviado: camión % de las últimas %, genset % de las últimas % (las que difieren cambiaron de datos después: %)',
        v_ig[1], v_n[1], v_ig[2], v_n[2], coalesce(nullif(left(array_to_string(v_dif, ' | '), 600), ''), 'ninguna');
END $do$;

UPDATE ref.parametro SET valor = '269' WHERE codigo = 'web.version_base' AND valor::text::int < 269;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'migración 269 aplicada' AS que, (SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base') AS version_base;
