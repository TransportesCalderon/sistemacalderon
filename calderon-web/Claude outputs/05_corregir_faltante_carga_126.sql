-- =============================================================================
-- IronTrack · Corrección por base: carga 126 · faltaron 220 L para quedar lleno
-- -----------------------------------------------------------------------------
-- Carga 126 · 12/11/2026 15:11 · SXXV29 · Shell Rodriguez Peña · 1.000,62 L · tanque lleno.
-- Al registrarla quedó «Le faltaron para quedar lleno: 0,00 L» y tenían que ser 220 L.
-- Usa la misma función que el botón Editar (fue.fn_editar_carga), con todos sus controles.
--
-- PASO 1: correrlo así como está (v_guardar = false). Termina con un error
--         «SIMULACIÓN…» que muestra cómo queda la carga. NO guarda nada.
-- PASO 2: si está bien, cambiar v_guardar a true y correrlo de nuevo.
-- =============================================================================
DO $do$
DECLARE
    v_guardar   boolean := false;          -- ← poner true para guardar
    v_carga     bigint  := 126;
    v_faltante  numeric := 220;
    v_obs       text    := 'Faltaron 220 L para llenar (se olvidó cargar al registrar; corregido por base 12/11/2026)';
    v_motivo    text    := 'Faltaron 220 L para quedar lleno: se olvidó cargar al registrar';
    c fue.carga_combustible%ROWTYPE; d fue.carga_combustible%ROWTYPE;
    v_usr bigint; v_usr_nombre text; v_patente text; v_usos text; v_cap numeric;
BEGIN
    SELECT * INTO c FROM fue.carga_combustible WHERE id = v_carga;
    SELECT patente INTO v_patente FROM mae.camion WHERE id = c.camion_id;
    -- Controles: que sea la carga de la foto
    IF c.id IS NULL THEN RAISE EXCEPTION 'No existe la carga %', v_carga; END IF;
    IF v_patente <> 'SXXV29' OR round(c.litros, 2) <> 1000.62 OR NOT c.tanque_lleno OR NOT c.es_frontera THEN
        RAISE EXCEPTION 'La carga % no es la esperada (patente %, % L, lleno %, corte %): no se toca', v_carga, v_patente, c.litros, c.tanque_lleno, c.es_frontera;
    END IF;
    IF c.faltante_lleno_l = v_faltante THEN RAISE EXCEPTION 'La carga % ya tiene % L de faltante: no hay nada que cambiar', v_carga, v_faltante; END IF;
    SELECT x.capacidad_util_l INTO v_cap FROM mae.fn_capacidad_camion(c.camion_id, c.fecha_hora::date) x;

    -- Quién figura como autor del cambio: un usuario activo de TI
    SELECT u.id, u.nombre INTO v_usr, v_usr_nombre FROM seg.usuario u JOIN seg.usuario_rol r ON r.usuario_id = u.id AND r.rol_codigo = 'ti'
     WHERE u.activo ORDER BY u.id LIMIT 1;
    IF v_usr IS NULL THEN RAISE EXCEPTION 'No hay un usuario activo de TI para registrar el cambio'; END IF;
    PERFORM set_config('app.usuario_id', v_usr::text, true);

    -- Dónde se usa la carga (cierres y viajes de chofer)
    SELECT string_agg(x, ' | ') INTO v_usos FROM (
        SELECT format('cierre %s (%s, %s)', v.numero, v.estado, CASE WHEN v.carga_llegada_id = c.id THEN 'llegada' ELSE 'salida' END) AS x
          FROM fue.cierre_viaje v WHERE (v.carga_salida_id = c.id OR v.carga_llegada_id = c.id) AND v.eliminado_en IS NULL AND v.estado <> 'anulado'
        UNION ALL
        SELECT format('viaje %s (%s, %s)', v.numero, v.estado, CASE WHEN v.carga_llegada_id = c.id THEN 'llegada' ELSE 'salida' END)
          FROM ops.viaje_chofer v WHERE (v.carga_salida_id = c.id OR v.carga_llegada_id = c.id) AND v.eliminado_en IS NULL AND v.estado <> 'anulado') s;

    PERFORM fue.fn_editar_carga(c.id, c.version_fila,
        jsonb_build_object('faltante_lleno_l', v_faltante, 'faltante_observacion', v_obs), v_motivo);
    SELECT * INTO d FROM fue.carga_combustible WHERE id = v_carga;

    IF NOT v_guardar THEN
        RAISE EXCEPTION E'SIMULACIÓN (no se guardó nada)\n'
            '· Carga %: % · % · % L\n'
            '· Faltante para lleno: % L → % L (capacidad útil del camión: % L)\n'
            '· Observación del faltante: %\n'
            '· Se usa en: %\n'
            '· Queda registrado a nombre de: % (motivo: «%»)\n'
            'Si está bien, poné v_guardar := true y corrélo de nuevo.',
            d.id, v_patente, to_char(d.fecha_hora AT TIME ZONE 'America/Argentina/Mendoza', 'DD/MM/YYYY HH24:MI'), d.litros,
            c.faltante_lleno_l, d.faltante_lleno_l, coalesce(v_cap::text, 'sin dato'),
            d.faltante_observacion, coalesce(v_usos, 'ningún cierre ni viaje todavía'), v_usr_nombre, v_motivo;
    END IF;
    RAISE NOTICE 'GUARDADO: carga % con % L de faltante para lleno. Se usa en: %', d.id, d.faltante_lleno_l, coalesce(v_usos, 'ningún cierre ni viaje');
END $do$;
