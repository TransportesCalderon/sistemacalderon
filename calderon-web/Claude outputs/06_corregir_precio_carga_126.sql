-- =============================================================================
-- IronTrack · Corrección por base: carga 126 · precio sin impuestos → con impuestos
-- -----------------------------------------------------------------------------
-- Carga 126 · 12/11/2026 15:11 · SXXV29 · Shell Rodriguez Peña · 1.000,62 L.
-- Quedó con 1.912,4858 ARS por litro (el del remito, sin impuestos) y por eso el
-- control de precio no deja cerrar el viaje. Se pone el precio por litro con impuestos.
-- Usa la misma función que el botón Editar (fue.fn_editar_carga): recalcula el importe
-- y la cotización, y queda en la auditoría.
--
-- PASO 0: escribir el precio por litro CON impuestos en v_precio (con punto decimal).
-- PASO 1: correrlo con v_guardar = false. Termina con un error «SIMULACIÓN…» que
--         muestra cómo queda y si el control de precio lo acepta. NO guarda nada.
-- PASO 2: si está bien, poner v_guardar = true y correrlo de nuevo.
-- =============================================================================
DO $do$
DECLARE
    v_guardar boolean := false;     -- ← poner true para guardar
    v_precio  numeric := 2609;      -- precio por litro CON impuestos, en ARS
    v_carga   bigint  := 126;
    v_motivo  text    := 'Precio del remito sin impuestos: se pone el precio con impuestos';
    c fue.carga_combustible%ROWTYPE; d fue.carga_combustible%ROWTYPE;
    v_usr bigint; v_usr_nombre text; v_patente text; v_eval jsonb; v_cierre text;
BEGIN
    IF v_precio IS NULL OR v_precio <= 0 THEN RAISE EXCEPTION 'Escribí el precio por litro con impuestos en v_precio'; END IF;
    SELECT * INTO c FROM fue.carga_combustible WHERE id = v_carga;
    SELECT patente INTO v_patente FROM mae.camion WHERE id = c.camion_id;
    -- Controles: que sea la carga de la foto
    IF c.id IS NULL THEN RAISE EXCEPTION 'No existe la carga %', v_carga; END IF;
    IF v_patente <> 'SXXV29' OR round(c.litros, 2) <> 1000.62 OR c.moneda <> 'ARS' OR round(c.precio_unitario, 4) <> 1912.4858 THEN
        RAISE EXCEPTION 'La carga % no es la esperada (patente %, % L, % % por litro): no se toca', v_carga, v_patente, c.litros, c.moneda, c.precio_unitario;
    END IF;

    -- Quién figura como autor del cambio: un usuario activo de TI
    SELECT u.id, u.nombre INTO v_usr, v_usr_nombre FROM seg.usuario u JOIN seg.usuario_rol r ON r.usuario_id = u.id AND r.rol_codigo = 'ti'
     WHERE u.activo ORDER BY u.id LIMIT 1;
    IF v_usr IS NULL THEN RAISE EXCEPTION 'No hay un usuario activo de TI para registrar el cambio'; END IF;
    PERFORM set_config('app.usuario_id', v_usr::text, true);

    PERFORM fue.fn_editar_carga(c.id, c.version_fila, jsonb_build_object('precio_unitario', v_precio), v_motivo);
    SELECT * INTO d FROM fue.carga_combustible WHERE id = v_carga;

    -- Cómo lo ve ahora el control de precio (el mismo que frena el cierre)
    v_eval := fue.fn_evaluar_precio(d.estacion_id, d.fecha_hora, d.moneda, d.precio_unitario, d.litros, d.medio_pago, d.deposito_id, d.id);
    SELECT string_agg(format('%s (%s)', v.numero, v.estado), ', ') INTO v_cierre FROM fue.cierre_viaje v
     WHERE v.camion_id = d.camion_id AND d.fecha_hora > v.salida_ts AND d.fecha_hora <= v.llegada_ts AND v.eliminado_en IS NULL AND v.estado <> 'anulado';

    IF NOT v_guardar THEN
        RAISE EXCEPTION E'SIMULACIÓN (no se guardó nada)\n'
            '· Carga %: % · % · % L\n'
            '· Precio por litro: % → % %\n'
            '· Importe: % → % % (en moneda base: % → %)\n'
            '· Control de precio: % · %\n'
            '· Cierre: %\n'
            '· Queda registrado a nombre de: % (motivo: «%»)\n'
            'Si está bien, poné v_guardar := true y corrélo de nuevo.',
            d.id, v_patente, to_char(d.fecha_hora AT TIME ZONE 'America/Argentina/Mendoza', 'DD/MM/YYYY HH24:MI'), d.litros,
            c.precio_unitario, d.precio_unitario, d.moneda,
            c.importe_original, d.importe_original, d.moneda, c.importe_moneda_base, d.importe_moneda_base,
            coalesce(v_eval ->> 'resultado', '—'), coalesce(v_eval ->> 'mensaje', 'sin observaciones'),
            coalesce(v_cierre, 'ninguno'), v_usr_nombre, v_motivo;
    END IF;
    RAISE NOTICE 'GUARDADO: carga % a % % por litro (importe % %). Control de precio: %',
        d.id, d.precio_unitario, d.moneda, d.importe_original, d.moneda, v_eval ->> 'resultado';
END $do$;
