-- =============================================================================
-- IronTrack — Verificación 313 · Cambio 262 (migración 269) · Un solo mail para las órdenes
-- -----------------------------------------------------------------------------
-- Correr DESPUÉS de la migración 269. NO GUARDA NADA: con un usuario ZZ que autoriza cargas
-- crea una orden de camión y una de genset de prueba, mira el mail que queda en la cola y
-- termina con un error a propósito («VERIFICACIÓN 313 OK …») que deshace todo: no queda la
-- orden ni sale ningún mail. Lo único que queda es que se saltean hasta dos números de orden.
-- Si termina con otro error, copiarlo y mandarlo.
-- =============================================================================
DO $do$
DECLARE
    v_usr bigint; v_est bigint; v_cam bigint; v_ch bigint; v_gen bigint; r jsonb; o fue.orden_carga; ms record; m jsonb;
    v_ok text[] := '{}'; v_salto text[] := '{}'; v_msg text;
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 269 THEN
        RAISE EXCEPTION 'Falta aplicar la migración 269';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'fue' AND p.proname IN ('fn_crear_orden_carga', 'fn_crear_orden_genset') AND p.prosrc LIKE '%ops.mail_saliente%') THEN
        RAISE EXCEPTION 'FALLA 1: alguna función de crear orden todavía tiene el mail adentro';
    END IF;
    v_ok := v_ok || '1 el mail está en un solo lugar'::text;

    SELECT id INTO v_est FROM mae.estacion_servicio
     WHERE eliminado_en IS NULL AND NOT es_tanque_propio AND nullif(btrim(coalesce(correo, '')), '') IS NOT NULL ORDER BY id LIMIT 1;
    IF v_est IS NULL THEN RAISE EXCEPTION 'No hay una estación con correo para probar'; END IF;
    INSERT INTO seg.usuario (login, nombre, autoriza_cargas) VALUES ('zz_autoriza_313', 'ZZ Autoriza 313', true) RETURNING id INTO v_usr;
    PERFORM set_config('app.usuario_id', v_usr::text, true);

    -- 2 · Orden de camión
    SELECT c.id, tel.fn_chofer_en(c.id, now()) INTO v_cam, v_ch FROM mae.camion c
     WHERE c.eliminado_en IS NULL AND c.fecha_baja IS NULL AND tel.fn_chofer_en(c.id, now()) IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM fue.orden_carga oc WHERE oc.camion_id = c.id AND oc.genset_id IS NULL AND oc.estado IN ('emitida', 'autorizada') AND oc.vence_en > now())
     ORDER BY c.id LIMIT 1;
    IF v_cam IS NULL THEN
        v_salto := v_salto || '2 (no hay un camión con chofer y sin orden vigente)'::text;
    ELSE
        BEGIN
            r := fue.fn_crear_orden_carga(v_cam, v_est, 'litros', 123, NULL, NULL, v_ch, 'ZZ prueba 313', NULL);
            SELECT * INTO o FROM fue.orden_carga WHERE id = (r ->> 'id')::bigint;
            SELECT x.* INTO ms FROM ops.mail_saliente x WHERE x.id = o.mail_id;
            m := fue.fn_mail_orden_partes(o.id, r ->> 'palabra');
            IF ms.id IS NULL OR ms.referencia <> 'orden_carga:' || o.id OR ms.para IS DISTINCT FROM (SELECT correo FROM mae.estacion_servicio WHERE id = v_est)
               OR ms.asunto <> 'Orden de carga ' || o.numero || ' · ' || (SELECT patente FROM mae.camion WHERE id = v_cam)
               OR strpos(ms.html, m ->> 'html') = 0 OR ms.html NOT LIKE '%Palabra de seguridad: <b>' || (r ->> 'palabra') || '</b>%'
               OR ms.html NOT LIKE '%<tr><td>Patente</td>%' OR ms.html LIKE '%<tr><td>Genset</td>%' OR ms.html NOT LIKE '%' || o.numero || '%'
               OR (SELECT count(*) FROM ops.mail_saliente x WHERE x.referencia = 'orden_carga:' || o.id) <> 1 THEN
                RAISE EXCEPTION 'FALLA 2: el mail de la orden de camión no quedó como se esperaba (asunto «%», para %)', ms.asunto, ms.para;
            END IF;
            v_ok := v_ok || format('2 orden de camión con su mail (%s)', ms.asunto);
        EXCEPTION WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
            IF v_msg LIKE 'FALLA%' THEN RAISE EXCEPTION '%', v_msg; END IF;
            v_salto := v_salto || format('2 (no se pudo crear la orden de camión: %s)', left(v_msg, 160));
        END;
    END IF;

    -- 3 · Orden de genset
    SELECT g.id INTO v_gen FROM mae.genset g
     WHERE g.eliminado_en IS NULL AND g.estado = 'activo'
       AND NOT EXISTS (SELECT 1 FROM fue.orden_carga oc WHERE oc.genset_id = g.id AND oc.estado IN ('emitida', 'autorizada') AND oc.vence_en > now())
     ORDER BY ((fue.fn_contexto_genset(g.id, now()) ->> 'chofer_id') IS NULL), g.id LIMIT 1;
    IF v_gen IS NULL THEN
        v_salto := v_salto || '3 (no hay un genset activo sin orden vigente)'::text;
    ELSE
        BEGIN
            r := fue.fn_crear_orden_genset(v_gen, v_est, 'lleno', NULL,
                     coalesce((fue.fn_contexto_genset(v_gen, now()) ->> 'chofer_id')::bigint, (SELECT id FROM mae.chofer WHERE estado = 'activo' AND eliminado_en IS NULL ORDER BY id LIMIT 1)),
                     'ZZ prueba 313');
            SELECT * INTO o FROM fue.orden_carga WHERE id = (r ->> 'id')::bigint;
            SELECT x.* INTO ms FROM ops.mail_saliente x WHERE x.id = o.mail_id;
            m := fue.fn_mail_orden_partes(o.id, r ->> 'palabra');
            IF ms.id IS NULL OR ms.asunto <> 'Orden de carga ' || o.numero || ' · Genset ' || (SELECT codigo FROM mae.genset WHERE id = v_gen)
               OR strpos(ms.html, m ->> 'html') = 0 OR ms.html NOT LIKE '%generador (genset)%' OR ms.html NOT LIKE '%<tr><td>Genset</td>%'
               OR ms.html LIKE '%<tr><td>Patente</td>%' OR ms.html NOT LIKE '%Palabra de seguridad: <b>' || (r ->> 'palabra') || '</b>%' THEN
                RAISE EXCEPTION 'FALLA 3: el mail de la orden de genset no quedó como se esperaba (asunto «%»)', ms.asunto;
            END IF;
            v_ok := v_ok || format('3 orden de genset con su mail (%s)', ms.asunto);
        EXCEPTION WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
            IF v_msg LIKE 'FALLA%' THEN RAISE EXCEPTION '%', v_msg; END IF;
            v_salto := v_salto || format('3 (no se pudo crear la orden de genset: %s)', left(v_msg, 160));
        END;
    END IF;

    RAISE EXCEPTION 'VERIFICACIÓN 313 OK (no se guardó nada): % · no se pudo probar: %',
        array_to_string(v_ok, ' · '), coalesce(nullif(array_to_string(v_salto, ', '), ''), 'nada');
END $do$;
