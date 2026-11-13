-- =============================================================================
-- IronTrack — Verificación 312 · Cambio 261 (migración 268) · El faltante lleva su parte de mochila
-- -----------------------------------------------------------------------------
-- Correr DESPUÉS de la migración 268. NO GUARDA NADA: prueba la regla y los controles con un
-- camión real, edita una carga real con faltante (con un usuario ZZ de TI) y mira el cierre y
-- el acta. Termina con un error a propósito («VERIFICACIÓN 312 OK …») que deshace todo.
-- Si termina con otro error, copiarlo y mandarlo.
-- =============================================================================
DO $do$
DECLARE
    v_cam bigint; v_capm numeric; v_sin bigint; v_ok text[] := '{}'; v_salto text[] := '{}'; v_msg text;
    k fue.carga_combustible%ROWTYPE; d fue.carga_combustible%ROWTYPE; v_ti bigint; v_sin_repartir int; v_cierre bigint; t jsonb; a jsonb; v_esp numeric;
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 268 THEN
        RAISE EXCEPTION 'Falta aplicar la migración 268';
    END IF;

    SELECT count(*) INTO v_sin_repartir FROM fue.carga_combustible c
     WHERE c.eliminado_en IS NULL AND c.estado_validacion <> 'anulada' AND c.faltante_lleno_l > 0 AND c.faltante_mochila_l IS NULL;

    -- 1 · La regla y los controles, con un camión que tiene mochila
    SELECT c.id, (fue.fn_capacidad_camion(c.id, now()) ->> 'mochila_l')::numeric INTO v_cam, v_capm
      FROM mae.camion c WHERE c.eliminado_en IS NULL AND (fue.fn_capacidad_camion(c.id, now()) ->> 'mochila_l')::numeric > 0 ORDER BY c.id LIMIT 1;
    IF v_cam IS NULL THEN RAISE EXCEPTION 'No hay ningún camión con mochila cargada en Flota: no se puede probar'; END IF;
    IF fue.fn_faltante_mochila(v_cam, now(), 0, NULL) <> 0 OR fue.fn_faltante_mochila(v_cam, now(), 0, 50) <> 0 THEN
        RAISE EXCEPTION 'FALLA 1: sin faltante la parte de mochila tiene que ser 0';
    END IF;
    IF fue.fn_faltante_mochila(v_cam, now(), 100, NULL) <> least(100, v_capm)
       OR fue.fn_faltante_mochila(v_cam, now(), v_capm + 50, NULL) <> v_capm THEN
        RAISE EXCEPTION 'FALLA 1: la regla (todo a la mochila, hasta su capacidad de % L) no dio lo esperado', v_capm;
    END IF;
    IF fue.fn_faltante_mochila(v_cam, now(), 20, 0) <> 0 OR fue.fn_faltante_mochila(v_cam, now(), 189, 169) <> 169 THEN
        RAISE EXCEPTION 'FALLA 1: un reparto informado y válido tiene que respetarse (casos de las cargas 88 y 91)';
    END IF;
    BEGIN
        PERFORM fue.fn_faltante_mochila(v_cam, now(), 100, 101);
        RAISE EXCEPTION 'FALLA 1: la mochila no puede llevar más que el faltante';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
        PERFORM fue.fn_faltante_mochila(v_cam, now(), v_capm + 100, v_capm + 1);
        RAISE EXCEPTION 'FALLA 1: la mochila no puede llevar más que su capacidad';
    EXCEPTION WHEN check_violation THEN NULL; END;
    SELECT c.id INTO v_sin FROM mae.camion c
     WHERE c.eliminado_en IS NULL AND (fue.fn_capacidad_camion(c.id, now()) ->> 'total_l') IS NOT NULL
       AND (fue.fn_capacidad_camion(c.id, now()) ->> 'mochila_l')::numeric = 0 LIMIT 1;
    IF v_sin IS NOT NULL AND fue.fn_faltante_mochila(v_sin, now(), 100, NULL) <> 0 THEN
        RAISE EXCEPTION 'FALLA 1: en un camión sin mochila todo el faltante es de los tanques';
    END IF;
    v_ok := v_ok || format('1 regla y controles (mochila de %s L)', v_capm);

    -- 2 · La columna está donde tiene que estar y ninguna carga se completó sola
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'fue' AND table_name = 'v_carga_combustible' AND column_name = 'faltante_mochila_l')
       OR (SELECT prosrc FROM pg_proc WHERE oid = 'fue.fn_carga_faltante()'::regprocedure) NOT LIKE '%fn_faltante_mochila%'
       OR (SELECT prosrc FROM pg_proc WHERE oid = 'fue.fn_registrar_carga_orden(bigint,boolean,jsonb)'::regprocedure) NOT LIKE '%faltante_mochila_l%' THEN
        RAISE EXCEPTION 'FALLA 2: falta la columna en la vista, o el alta o las órdenes por registrar no la usan';
    END IF;
    v_ok := v_ok || '2 vista, alta y órdenes por registrar'::text;

    -- 3 · Editar una carga real con faltante: informar el reparto, y volver a la regla
    SELECT c.* INTO k FROM fue.carga_combustible c
     WHERE c.eliminado_en IS NULL AND c.estado_validacion <> 'anulada' AND c.faltante_lleno_l > 0 AND c.deposito_id IS NULL AND c.carga_principal_id IS NULL
       AND (fue.fn_capacidad_camion(c.camion_id, c.fecha_hora) ->> 'mochila_l')::numeric > 0
     ORDER BY c.fecha_hora DESC LIMIT 1;
    IF k.id IS NULL THEN
        v_salto := v_salto || '3 (no hay una carga con faltante de un camión con mochila)'::text;
    ELSE
        INSERT INTO seg.usuario (login, nombre) VALUES ('zz_ti_312', 'ZZ TI 312') RETURNING id INTO v_ti;
        INSERT INTO seg.usuario_rol (usuario_id, rol_codigo) VALUES (v_ti, 'ti');
        PERFORM set_config('app.usuario_id', v_ti::text, true);
        BEGIN
            PERFORM fue.fn_editar_carga(k.id, k.version_fila, jsonb_build_object('faltante_mochila_l', 0), 'ZZ prueba 312');
            SELECT * INTO d FROM fue.carga_combustible WHERE id = k.id;
            IF d.faltante_mochila_l IS DISTINCT FROM 0::numeric OR d.faltante_lleno_l <> k.faltante_lleno_l OR d.litros <> k.litros
               OR d.importe_original <> k.importe_original OR d.fecha_hora <> k.fecha_hora THEN
                RAISE EXCEPTION 'FALLA 3: al informar 0 L de mochila en la carga % tenía que cambiar solo ese dato', k.id;
            END IF;
            PERFORM fue.fn_editar_carga(k.id, d.version_fila, jsonb_build_object('faltante_mochila_l', NULL), 'ZZ prueba 312');
            SELECT * INTO d FROM fue.carga_combustible WHERE id = k.id;
            v_esp := least(k.faltante_lleno_l, (fue.fn_capacidad_camion(k.camion_id, k.fecha_hora) ->> 'mochila_l')::numeric);
            IF d.faltante_mochila_l IS DISTINCT FROM v_esp THEN
                RAISE EXCEPTION 'FALLA 3: sin dato tenía que proponer % L de mochila y quedó %', v_esp, d.faltante_mochila_l;
            END IF;
            BEGIN
                PERFORM fue.fn_editar_carga(k.id, d.version_fila, jsonb_build_object('faltante_mochila_l', k.faltante_lleno_l + 1), 'ZZ prueba 312');
                RAISE EXCEPTION 'FALLA 3: Editar dejó poner más mochila que faltante';
            EXCEPTION WHEN check_violation THEN NULL; END;
            v_ok := v_ok || format('3 Editar: reparto informado y regla (carga %s)', k.id);
        EXCEPTION WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
            IF v_msg LIKE 'FALLA%' THEN RAISE EXCEPTION '%', v_msg; END IF;
            v_salto := v_salto || format('3 (la carga %s no se pudo editar: %s)', k.id, left(v_msg, 160));
        END;
    END IF;

    -- 4 · El cierre y el acta traen la parte de mochila
    SELECT c.id INTO v_cierre FROM fue.cierre_viaje c WHERE c.eliminado_en IS NULL AND c.estado <> 'anulado' ORDER BY c.id DESC LIMIT 1;
    IF v_cierre IS NULL THEN
        v_salto := v_salto || '4 (no hay cierres)'::text;
    ELSE
        t := fue.fn_tanque_cierre(v_cierre);
        IF (t ->> 'disponible')::boolean AND NOT (t ? 'faltante_salida_mochila_l' AND t ? 'faltante_llegada_mochila_l') THEN
            RAISE EXCEPTION 'FALLA 4: el balance del cierre no trae la parte de mochila';
        END IF;
        BEGIN
            a := fue.fn_acta_cierre(v_cierre);
            IF NOT (a #> '{extra,salida}' ? 'faltante_mochila_l' OR a -> 'salida' ? 'faltante_mochila_l'
                    OR a::text LIKE '%faltante_mochila_l%') THEN
                RAISE EXCEPTION 'FALLA 4: el acta no trae la parte de mochila';
            END IF;
            v_ok := v_ok || '4 cierre y acta con la parte de mochila'::text;
        EXCEPTION WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
            IF v_msg LIKE 'FALLA%' THEN RAISE EXCEPTION '%', v_msg; END IF;
            v_ok := v_ok || '4 cierre con la parte de mochila'::text;
            v_salto := v_salto || format('4 acta (%s)', left(v_msg, 120));
        END;
    END IF;

    RAISE EXCEPTION 'VERIFICACIÓN 312 OK (no se guardó nada): % · no se pudo probar: % · cargas con faltante todavía sin repartir: %',
        array_to_string(v_ok, ' · '), coalesce(nullif(array_to_string(v_salto, ', '), ''), 'nada'),
        v_sin_repartir;
END $do$;
