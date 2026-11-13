-- =============================================================================
-- IronTrack — Verificación 309 · Cambio 258 (migración 265) · Quién maneja el tractor
-- -----------------------------------------------------------------------------
-- Correr DESPUÉS de la migración 265. NO GUARDA NADA: mira los tractores y viajes reales,
-- prueba la licencia, la baja y la eliminación sobre choferes que ya existen y termina con un
-- error a propósito («VERIFICACIÓN 309 OK …») que deshace todo.
-- Si termina con otro error, copiarlo y mandarlo.
-- =============================================================================
DO $do$
DECLARE
    v_ti bigint; r record; v_esp bigint; v_n int := 0; v_ok text[] := '{}'; v_salto text[] := '{}';
    v_cam bigint; v_ch bigint; v_msg text; v_estado text; p jsonb; s jsonb; v_viaje bigint;
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 265 THEN
        RAISE EXCEPTION 'Falta aplicar la migración 265';
    END IF;

    -- 1 · Todas las pantallas dan el mismo chofer, tractor por tractor
    FOR r IN SELECT c.id, c.patente FROM mae.camion c WHERE c.eliminado_en IS NULL AND c.fecha_baja IS NULL LOOP
        v_esp := tel.fn_chofer_en(r.id, now());
        IF fue.fn_chofer_actual(r.id) IS DISTINCT FROM v_esp OR tel.fn_chofer_actual(r.id) IS DISTINCT FROM v_esp THEN
            RAISE EXCEPTION 'FALLA 1: en % la orden de carga dice %, el mapa % y la regla única %', r.patente,
                ops.fn_nombre_chofer(fue.fn_chofer_actual(r.id)), ops.fn_nombre_chofer(tel.fn_chofer_actual(r.id)), ops.fn_nombre_chofer(v_esp);
        END IF;
        v_n := v_n + 1;
    END LOOP;
    FOR r IN SELECT v.id, v.numero, v.camion_id, v.chofer_id FROM ops.viaje_chofer v WHERE v.estado = 'abierto' AND v.eliminado_en IS NULL LOOP
        IF tel.fn_chofer_ahora_viaje(r.id) IS DISTINCT FROM coalesce(tel.fn_chofer_en(r.camion_id, now()), r.chofer_id) THEN
            RAISE EXCEPTION 'FALLA 1: en el viaje % Seguimiento dice % y la regla única %', r.numero,
                ops.fn_nombre_chofer(tel.fn_chofer_ahora_viaje(r.id)), ops.fn_nombre_chofer(tel.fn_chofer_en(r.camion_id, now()));
        END IF;
    END LOOP;
    v_ok := v_ok || format('1 las pantallas dan el mismo chofer en los %s tractores', v_n);

    -- 2 · El orden de la regla, calculado aparte sobre los tractores reales
    v_n := 0;
    FOR r IN
        SELECT c.id, c.patente,
               (SELECT coalesce((SELECT tc.chofer_id FROM ops.tramo_chofer tc
                                  WHERE tc.tramo_id = t.id AND tc.rol = 'conductor' AND tc.hasta_ts IS NULL AND tc.eliminado_en IS NULL
                                  ORDER BY tc.desde_ts DESC LIMIT 1), t.chofer_id)
                  FROM ops.tramo_operativo t
                 WHERE t.camion_id = c.id AND t.estado = 'en_curso' AND t.eliminado_en IS NULL AND t.inicio_real <= now()
                 ORDER BY t.inicio_real DESC LIMIT 1) AS de_tramo,
               (SELECT a.chofer_id FROM mae.asignacion_camion_chofer a JOIN mae.chofer ch ON ch.id = a.chofer_id
                 WHERE a.camion_id = c.id AND a.tipo = 'titular' AND a.eliminado_en IS NULL AND a.vigente_desde <= mae.fn_hoy()
                   AND (a.vigente_hasta IS NULL OR a.vigente_hasta > mae.fn_hoy()) AND ch.estado = 'activo' AND ch.eliminado_en IS NULL
                 ORDER BY a.vigente_desde DESC LIMIT 1) AS titular_activo,
               EXISTS (SELECT 1 FROM ops.viaje_chofer v WHERE v.camion_id = c.id AND v.estado <> 'anulado' AND v.eliminado_en IS NULL) AS con_viajes
          FROM mae.camion c WHERE c.eliminado_en IS NULL AND c.fecha_baja IS NULL
    LOOP
        v_esp := tel.fn_chofer_en(r.id, now());
        IF r.de_tramo IS NOT NULL AND v_esp IS DISTINCT FROM r.de_tramo THEN
            RAISE EXCEPTION 'FALLA 2: % tiene un viaje de logística en curso con % y la regla única dice %', r.patente,
                ops.fn_nombre_chofer(r.de_tramo), ops.fn_nombre_chofer(v_esp);
        END IF;
        IF r.de_tramo IS NULL AND NOT r.con_viajes AND v_esp IS DISTINCT FROM r.titular_activo THEN
            RAISE EXCEPTION 'FALLA 2: % no tiene viajes y la regla única dice % en vez del titular activo (%)', r.patente,
                ops.fn_nombre_chofer(v_esp), ops.fn_nombre_chofer(r.titular_activo);
        END IF;
        IF r.de_tramo IS NOT NULL THEN v_n := v_n + 1; END IF;
    END LOOP;
    v_ok := v_ok || format('2 manda el viaje de logística en curso (%s tractores) y, sin viajes, el titular activo', v_n);

    -- 3 · De un viaje cerrado, el chofer es el del viaje
    SELECT v.id, v.chofer_id INTO v_viaje, v_ch FROM ops.viaje_chofer v WHERE v.estado = 'cerrado' AND v.eliminado_en IS NULL ORDER BY v.id DESC LIMIT 1;
    IF v_viaje IS NULL THEN
        v_salto := v_salto || '3 (no hay viajes cerrados)'::text;
    ELSE
        IF tel.fn_chofer_ahora_viaje(v_viaje) IS DISTINCT FROM v_ch THEN
            RAISE EXCEPTION 'FALLA 3: de un viaje cerrado tiene que salir el chofer del viaje';
        END IF;
        v_ok := v_ok || '3 viaje cerrado: el chofer del viaje'::text;
    END IF;

    -- 4 · Seguimiento trae la señal de la tarjeta
    s := tel.fn_seguimiento_viajes();
    IF jsonb_array_length(s) = 0 THEN
        v_salto := v_salto || '4 (no hay viajes en seguimiento)'::text;
    ELSE
        IF NOT (s -> 0 ? 'chofer_tarjeta') OR NOT (s -> 0 ? 'chofer') OR NOT (s -> 0 ? 'chofer_viaje') THEN
            RAISE EXCEPTION 'FALLA 4: Seguimiento no trae el chofer o la señal de la tarjeta: %', (s -> 0) - 'evaluacion';
        END IF;
        v_ok := v_ok || '4 Seguimiento trae la señal de la tarjeta'::text;
    END IF;

    -- Usuario ZZ de TI para las pruebas que cambian datos (se deshace)
    INSERT INTO seg.usuario (login, nombre) VALUES ('zz_ti_309', 'ZZ TI 309') RETURNING id INTO v_ti;
    INSERT INTO seg.usuario_rol (usuario_id, rol_codigo) VALUES (v_ti, 'ti');
    PERFORM set_config('app.usuario_id', v_ti::text, true);
    PERFORM set_config('app.motivo', 'ZZ prueba 309', true);

    -- 5 · Titular de licencia y sin viajes: el tractor queda «sin conductor»; hacia atrás sigue siendo él
    SELECT c.id, mae.fn_chofer_de_tractor(c.id) INTO v_cam, v_ch
      FROM mae.camion c
     WHERE c.eliminado_en IS NULL AND c.fecha_baja IS NULL AND mae.fn_chofer_de_tractor(c.id) IS NOT NULL
       AND tel.fn_chofer_en(c.id, now()) = mae.fn_chofer_de_tractor(c.id)
       AND NOT EXISTS (SELECT 1 FROM ops.tramo_operativo t WHERE t.camion_id = c.id AND t.estado = 'en_curso' AND t.eliminado_en IS NULL)
       AND NOT EXISTS (SELECT 1 FROM ops.viaje_chofer v WHERE v.camion_id = c.id AND v.estado = 'abierto' AND v.eliminado_en IS NULL)
       AND NOT EXISTS (SELECT 1 FROM ops.viaje_chofer v WHERE v.camion_id = c.id AND v.estado <> 'anulado' AND v.eliminado_en IS NULL
                          AND v.salida_ts <= now() AND now() < coalesce(v.llegada_ts, (ops.fn_corte_siguiente(v.camion_id, v.salida_ts)).fecha_hora, 'infinity'))
     ORDER BY c.id LIMIT 1;
    IF v_cam IS NULL THEN
        v_salto := v_salto || '5 (no hay un tractor parado con titular activo)'::text;
    ELSE
        p := mae.fn_chofer_pendientes(v_ch);
        IF NOT (p ->> 'hay')::boolean OR p ->> 'asignaciones' IS NULL OR p ->> 'texto' NOT LIKE '%Choferes de los tractores%' THEN
            RAISE EXCEPTION 'FALLA 5: un titular tiene que figurar con el tractor asignado como pendiente: %', p;
        END IF;
        UPDATE mae.chofer SET estado = 'licencia' WHERE id = v_ch;   -- la licencia NO se frena
        IF tel.fn_chofer_en(v_cam, now()) IS NOT NULL OR fue.fn_chofer_actual(v_cam) IS NOT NULL OR tel.fn_chofer_actual(v_cam) IS NOT NULL THEN
            RAISE EXCEPTION 'FALLA 5: con el titular de licencia y sin viajes el tractor tenía que quedar sin conductor';
        END IF;
        IF mae.fn_chofer_de_tractor(v_cam) IS DISTINCT FROM v_ch THEN
            RAISE EXCEPTION 'FALLA 5: la licencia no tiene que tocar al titular del tractor';
        END IF;
        IF EXISTS (SELECT 1 FROM mae.asignacion_camion_chofer a WHERE a.camion_id = v_cam AND a.chofer_id = v_ch AND a.tipo = 'titular'
                      AND a.eliminado_en IS NULL AND a.vigente_desde <= mae.fn_hoy() - 3)
           AND NOT EXISTS (SELECT 1 FROM ops.viaje_chofer v WHERE v.camion_id = v_cam AND v.estado <> 'anulado' AND v.eliminado_en IS NULL)
           AND NOT EXISTS (SELECT 1 FROM ops.tramo_operativo t WHERE t.camion_id = v_cam AND t.estado <> 'anulado' AND t.eliminado_en IS NULL AND t.inicio_real IS NOT NULL)
           AND tel.fn_chofer_en(v_cam, now() - interval '2 days') IS DISTINCT FROM v_ch THEN
            RAISE EXCEPTION 'FALLA 5: hacia atrás (hace 2 días) el titular tenía que seguir figurando';
        END IF;
        -- 6 · La baja se frena mientras siga asignado
        BEGIN
            UPDATE mae.chofer SET estado = 'baja' WHERE id = v_ch;
            RAISE EXCEPTION 'FALLA 6: la baja de un chofer con tractor asignado tenía que frenarse';
        EXCEPTION WHEN sqlstate '55000' THEN
            GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
            IF v_msg NOT LIKE 'No se puede dar de baja%' OR v_msg NOT LIKE '%Choferes de los tractores%' THEN
                RAISE EXCEPTION 'FALLA 6: el mensaje de la baja no es el esperado: %', v_msg;
            END IF;
        END;
        -- 7 · Eliminar frena igual
        BEGIN
            PERFORM mae.fn_eliminar_chofer(v_ch, 'ZZ prueba 309');
            RAISE EXCEPTION 'FALLA 7: eliminar un chofer con tractor asignado tenía que frenarse';
        EXCEPTION WHEN sqlstate '55000' THEN
            GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
            IF v_msg NOT LIKE 'No se puede eliminar%' THEN
                RAISE EXCEPTION 'FALLA 7: el mensaje al eliminar no es el esperado: %', v_msg;
            END IF;
        END;
        v_ok := v_ok || '5 titular de licencia: tractor sin conductor y titular intacto'::text
                     || '6 la baja se frena con tractor asignado'::text || '7 eliminar se frena igual'::text;
    END IF;

    -- 8 · Sin nada abierto, la baja pasa
    SELECT c.id INTO v_ch FROM mae.chofer c
     WHERE c.estado = 'activo' AND c.eliminado_en IS NULL AND NOT (mae.fn_chofer_pendientes(c.id) ->> 'hay')::boolean ORDER BY c.id LIMIT 1;
    IF v_ch IS NULL THEN
        v_salto := v_salto || '8 (no hay un chofer activo sin nada abierto)'::text;
    ELSE
        UPDATE mae.chofer SET estado = 'baja', fecha_egreso = coalesce(fecha_egreso, greatest(mae.fn_hoy(), fecha_ingreso)) WHERE id = v_ch;
        SELECT estado INTO v_estado FROM mae.chofer WHERE id = v_ch;
        IF v_estado <> 'baja' THEN RAISE EXCEPTION 'FALLA 8: la baja de un chofer sin nada abierto no se guardó'; END IF;
        v_ok := v_ok || '8 sin nada abierto la baja pasa'::text;
    END IF;

    -- 9 · Los que ya están de baja con algo abierto (para resolver; no frena nada)
    SELECT string_agg(btrim(c.apellido || ' ' || c.nombre) || ': ' || (mae.fn_chofer_pendientes(c.id) ->> 'texto'), ' | ' ORDER BY c.apellido) INTO v_msg
      FROM mae.chofer c WHERE c.estado = 'baja' AND c.eliminado_en IS NULL AND (mae.fn_chofer_pendientes(c.id) ->> 'hay')::boolean;

    RAISE EXCEPTION 'VERIFICACIÓN 309 OK (no se guardó nada): % · no se pudo probar: % · de baja con algo abierto: %',
        array_to_string(v_ok, ' · '), coalesce(nullif(array_to_string(v_salto, ', '), ''), 'nada'), coalesce(v_msg, 'ninguno');
END $do$;
