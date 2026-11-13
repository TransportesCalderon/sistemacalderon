-- =============================================================================
-- IronTrack · Corrección por base 13 · Repartir el faltante de las cargas ya registradas (A3)
-- -----------------------------------------------------------------------------
-- Correr DESPUÉS de la migración 268. Completa, en las cargas que ya declararon un faltante para
-- lleno, cuánto de ese faltante fue en la mochila:
--   · por la regla (todo a la mochila, hasta su capacidad), salvo
--   · carga 88: 0 L de mochila (los 20 L faltaron en el tanque principal)
--   · carga 91: 169 L de mochila (20 L en el principal y 169 L en la mochila)
-- No cambia los litros del faltante ni ningún otro dato: solo agrega el reparto.
-- Usa la misma función que el botón Editar (fue.fn_editar_carga), con todos sus controles.
--
-- PASO 1: correrlo así como está (v_guardar = false). Termina con un error «SIMULACIÓN…» que
--         lista carga por carga cómo queda. NO guarda nada. Mandame esa lista.
-- PASO 2: si está bien, cambiar v_guardar a true y correrlo de nuevo.
-- =============================================================================
DO $do$
DECLARE
    v_guardar boolean := false;          -- ← poner true para guardar
    v_motivo  text := 'Reparto del faltante entre tanques y mochila (corrección por base, cambio 261)';
    r record; d fue.carga_combustible%ROWTYPE; v_usr bigint; v_usr_nombre text; v_dato numeric; v_msg text;
    v_lista text[] := '{}'; v_err text[] := '{}'; v_n int := 0;
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 268 THEN
        RAISE EXCEPTION 'Falta aplicar la migración 268';
    END IF;
    -- Controles: las dos excepciones tienen que ser las que conocemos
    IF EXISTS (SELECT 1 FROM fue.carga_combustible WHERE id = 88 AND faltante_mochila_l IS NULL AND faltante_lleno_l <> 20)
       OR EXISTS (SELECT 1 FROM fue.carga_combustible WHERE id = 91 AND faltante_mochila_l IS NULL AND faltante_lleno_l <> 189) THEN
        RAISE EXCEPTION 'La carga 88 o la 91 no tienen el faltante esperado (20 L y 189 L): no se toca nada, avisar';
    END IF;

    -- Quién figura como autor del cambio: un usuario activo de TI
    SELECT u.id, u.nombre INTO v_usr, v_usr_nombre FROM seg.usuario u JOIN seg.usuario_rol ur ON ur.usuario_id = u.id AND ur.rol_codigo = 'ti'
     WHERE u.activo ORDER BY u.id LIMIT 1;
    IF v_usr IS NULL THEN RAISE EXCEPTION 'No hay un usuario activo de TI para registrar el cambio'; END IF;
    PERFORM set_config('app.usuario_id', v_usr::text, true);

    FOR r IN
        SELECT c.id, c.version_fila, c.faltante_lleno_l, c.fecha_hora, c.faltante_observacion, cam.patente,
               (fue.fn_capacidad_camion(c.camion_id, c.fecha_hora) ->> 'mochila_l')::numeric AS capm
          FROM fue.carga_combustible c JOIN mae.camion cam ON cam.id = c.camion_id
         WHERE c.eliminado_en IS NULL AND c.estado_validacion <> 'anulada' AND c.faltante_lleno_l > 0 AND c.faltante_mochila_l IS NULL
         ORDER BY c.fecha_hora
    LOOP
        v_dato := CASE r.id WHEN 88 THEN 0 WHEN 91 THEN 169 END;   -- NULL = por la regla
        BEGIN
            PERFORM fue.fn_editar_carga(r.id, r.version_fila, jsonb_build_object('faltante_mochila_l', v_dato), v_motivo);
            SELECT * INTO d FROM fue.carga_combustible WHERE id = r.id;
            IF d.faltante_lleno_l <> r.faltante_lleno_l OR d.faltante_mochila_l IS NULL THEN
                RAISE EXCEPTION 'quedó con otro faltante o sin reparto';
            END IF;
            v_n := v_n + 1;
            v_lista := v_lista || format('· Carga %s · %s · %s · faltaron %s L → mochila %s L, tanques %s L%s%s', r.id, r.patente,
                to_char(r.fecha_hora AT TIME ZONE 'America/Argentina/Mendoza', 'DD/MM/YYYY'), r.faltante_lleno_l,
                d.faltante_mochila_l, r.faltante_lleno_l - d.faltante_mochila_l,
                CASE WHEN v_dato IS NOT NULL THEN ' (dato confirmado, no por la regla)' WHEN d.faltante_mochila_l < r.faltante_lleno_l THEN ' (la mochila es de ' || r.capm || ' L)' ELSE '' END,
                CASE WHEN r.faltante_observacion IS NOT NULL THEN ' · «' || left(r.faltante_observacion, 70) || '»' ELSE '' END);
        EXCEPTION WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
            v_err := v_err || format('· Carga %s (%s, faltaron %s L): NO se pudo: %s', r.id, r.patente, r.faltante_lleno_l, left(v_msg, 200));
        END;
    END LOOP;

    IF NOT v_guardar OR array_length(v_err, 1) > 0 THEN
        RAISE EXCEPTION E'%\n%\n%\nQueda registrado a nombre de: % (motivo: «%»)\n%',
            CASE WHEN v_guardar THEN 'NO SE GUARDÓ NADA: hay cargas que no se pudieron repartir' ELSE 'SIMULACIÓN (no se guardó nada) · ' || v_n || ' carga(s) a repartir' END,
            coalesce(nullif(array_to_string(v_lista, E'\n'), ''), '· No hay cargas con faltante sin repartir'),
            coalesce(nullif(array_to_string(v_err, E'\n'), ''), '· Ninguna carga dio error'),
            v_usr_nombre, v_motivo,
            CASE WHEN v_guardar THEN 'Mandame esta lista.' ELSE 'Mandame esta lista. Si está bien, poné v_guardar := true y corrélo de nuevo.' END;
    END IF;
    RAISE NOTICE 'GUARDADO: % carga(s) con el faltante repartido entre tanques y mochila', v_n;
END $do$;
