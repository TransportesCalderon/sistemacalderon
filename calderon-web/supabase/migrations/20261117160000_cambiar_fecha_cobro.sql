-- =============================================================================
-- IronTrack — 273 · Cambio 267 · Cambiar la fecha de un cobro ya registrado
-- -----------------------------------------------------------------------------
-- Pedido del usuario (17/11/2026): un cobro de octubre se registró el 16/11 y quedó con la
-- fecha del 16/11 (la pantalla propone el día de hoy). No había cómo corregirlo sin anular el
-- cobro y volver a cargarlo.
--   · fin.fn_cambiar_fecha_cobro(movimiento, fecha, motivo): cambia la fecha de un cobro de
--     Finanzas. Mismos controles que al registrarlo (no futura, no antes de la factura ni del
--     saldo inicial de la cuenta). Si el cobro ya está conciliado con la cartola, pide
--     desconciliarlo primero. La factura cobrada queda con la fecha de su último cobro y el
--     asiento se rehace solo (con el tipo de cambio de la fecha nueva).
--   · ven.fn_cambiar_fecha_cobro(factura, fecha, motivo): lo mismo desde la factura. Si el cobro
--     se marcó sin banco, cambia la fecha de la factura; si tiene un cobro, cambia ese; si tiene
--     varios, pide hacerlo en Finanzas › Cobros y pagos (uno por uno).
--   · El motivo queda en el registro de cambios (aud.cambio).
-- Lo pueden hacer los mismos que registran cobros: Finanzas y TI. No cambia datos. web.version_base = 273.
-- =============================================================================
SET search_path = public, extensions;
BEGIN;

DO $do$
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 272 THEN
        RAISE EXCEPTION 'Falta la migración 272 (Uruguay como país): aplicarla antes';
    END IF;
    IF to_regprocedure('fin.fn_cambiar_fecha_cobro(bigint,date,text)') IS NOT NULL THEN
        RAISE EXCEPTION 'La migración 273 (cambiar la fecha de un cobro) ya está aplicada';
    END IF;
END $do$;

CREATE FUNCTION fin.fn_cambiar_fecha_cobro(p_movimiento bigint, p_fecha date, p_motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE m fin.movimiento%ROWTYPE; f ven.factura%ROWTYPE; cd fin.cuenta_dinero%ROWTYPE; v_ult date; v_cartola text;
BEGIN
    PERFORM fin.fn_exigir_finanzas();
    IF nullif(btrim(p_motivo), '') IS NULL THEN RAISE EXCEPTION 'Escribí por qué se cambia la fecha' USING ERRCODE = '22023'; END IF;
    SELECT * INTO m FROM fin.movimiento WHERE id = p_movimiento AND eliminado_en IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'El cobro no existe' USING ERRCODE = 'P0002'; END IF;
    IF m.tipo <> 'cobro' OR m.factura_id IS NULL THEN RAISE EXCEPTION 'Solo se cambia la fecha de un cobro de factura' USING ERRCODE = '55000'; END IF;
    IF m.estado = 'anulado' THEN RAISE EXCEPTION 'El cobro está anulado' USING ERRCODE = '55000'; END IF;
    IF m.origen IS NOT NULL THEN RAISE EXCEPTION 'Este cobro lo generó otro registro: se cambia desde ahí' USING ERRCODE = '55000'; END IF;
    IF p_fecha IS NULL OR p_fecha > mae.fn_hoy() + 1 THEN RAISE EXCEPTION 'Elegí la fecha del cobro (no futura)' USING ERRCODE = '22023'; END IF;
    IF p_fecha = m.fecha THEN RAISE EXCEPTION 'El cobro ya tiene esa fecha' USING ERRCODE = '22023'; END IF;
    SELECT * INTO f FROM ven.factura WHERE id = m.factura_id FOR UPDATE;
    IF p_fecha < f.fecha_emision THEN
        RAISE EXCEPTION 'El cobro no puede ser antes de la factura (%)', to_char(f.fecha_emision, 'DD/MM/YYYY') USING ERRCODE = '22023';
    END IF;
    SELECT * INTO cd FROM fin.cuenta_dinero WHERE id = m.cuenta_dinero_id;
    IF cd.saldo_inicial_fecha IS NOT NULL AND p_fecha < cd.saldo_inicial_fecha THEN
        RAISE EXCEPTION 'La fecha es anterior al saldo inicial de % (%)', cd.nombre, to_char(cd.saldo_inicial_fecha, 'DD/MM/YYYY') USING ERRCODE = '22023';
    END IF;
    SELECT string_agg(DISTINCT to_char(l.fecha, 'DD/MM/YYYY'), ', ') INTO v_cartola FROM fin.cartola_linea l WHERE l.movimiento_id = m.id;
    IF v_cartola IS NOT NULL THEN
        RAISE EXCEPTION 'El cobro ya está conciliado con la cartola (línea del %): desconcilialo primero en Finanzas › Cartola', v_cartola USING ERRCODE = '55000';
    END IF;
    PERFORM set_config('app.motivo', 'Cambio de fecha del cobro: ' || btrim(p_motivo), true);
    PERFORM set_config('fin.cont_fn', '1', true);
    UPDATE fin.movimiento SET fecha = p_fecha WHERE id = m.id;
    -- La factura cobrada queda con la fecha de su último cobro
    IF f.estado = 'cobrada' THEN
        SELECT max(x.fecha) INTO v_ult FROM fin.movimiento x
         WHERE x.factura_id = f.id AND x.tipo = 'cobro' AND x.estado <> 'anulado' AND x.eliminado_en IS NULL;
        IF v_ult IS DISTINCT FROM f.cobrada_en THEN
            PERFORM set_config('ven.fn', '1', true);
            UPDATE ven.factura SET cobrada_en = v_ult WHERE id = f.id;
            PERFORM set_config('ven.fn', '', true);
        END IF;
    END IF;
END $f$;
COMMENT ON FUNCTION fin.fn_cambiar_fecha_cobro(bigint, date, text) IS 'Migración 273: cambia la fecha de un cobro de factura (Finanzas o TI).';

CREATE FUNCTION ven.fn_cambiar_fecha_cobro(p_factura bigint, p_fecha date, p_motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE f ven.factura%ROWTYPE; v_n integer; v_mov bigint;
BEGIN
    PERFORM ven.fn_exigir_facturacion();
    IF nullif(btrim(p_motivo), '') IS NULL THEN RAISE EXCEPTION 'Escribí por qué se cambia la fecha' USING ERRCODE = '22023'; END IF;
    SELECT * INTO f FROM ven.factura WHERE id = p_factura AND eliminado_en IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'La factura no existe' USING ERRCODE = 'P0002'; END IF;
    IF f.estado <> 'cobrada' THEN RAISE EXCEPTION 'La factura no está cobrada (está %)', f.estado USING ERRCODE = '55000'; END IF;
    SELECT count(*), min(id) INTO v_n, v_mov FROM fin.movimiento
     WHERE factura_id = f.id AND tipo = 'cobro' AND estado <> 'anulado' AND eliminado_en IS NULL;
    IF v_n > 1 THEN
        RAISE EXCEPTION 'La factura tiene % cobros: cambiá la fecha de cada uno en Finanzas › Cobros y pagos', v_n USING ERRCODE = '55000';
    END IF;
    IF v_n = 1 THEN
        PERFORM fin.fn_cambiar_fecha_cobro(v_mov, p_fecha, p_motivo);
        RETURN;
    END IF;
    -- Cobro marcado sin banco: solo la fecha de la factura
    IF p_fecha IS NULL OR p_fecha < f.fecha_emision OR p_fecha > mae.fn_hoy() + 1 THEN
        RAISE EXCEPTION 'Elegí la fecha del cobro (desde la factura, no futura)' USING ERRCODE = '22023';
    END IF;
    IF p_fecha = f.cobrada_en THEN RAISE EXCEPTION 'El cobro ya tiene esa fecha' USING ERRCODE = '22023'; END IF;
    PERFORM set_config('app.motivo', 'Cambio de fecha del cobro: ' || btrim(p_motivo), true);
    PERFORM set_config('ven.fn', '1', true);
    UPDATE ven.factura SET cobrada_en = p_fecha WHERE id = f.id;
    PERFORM set_config('ven.fn', '', true);
END $f$;
COMMENT ON FUNCTION ven.fn_cambiar_fecha_cobro(bigint, date, text) IS 'Migración 273: cambia la fecha del cobro de una factura (Finanzas o TI).';

-- La web llega a Ventas por ops.fn_ven_* (como ops.fn_ven_cobrar_factura)
CREATE FUNCTION ops.fn_ven_cambiar_fecha_cobro(p_id bigint, p_fecha date, p_motivo text)
RETURNS void
LANGUAGE sql
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$ SELECT ven.fn_cambiar_fecha_cobro(p_factura => p_id, p_fecha => p_fecha, p_motivo => p_motivo) $f$;

-- Permisos: los mismos que las funciones vecinas (registrar el cobro y anular un movimiento)
DO $do$
DECLARE r record;
BEGIN
    REVOKE ALL ON FUNCTION fin.fn_cambiar_fecha_cobro(bigint, date, text) FROM PUBLIC;
    REVOKE ALL ON FUNCTION ven.fn_cambiar_fecha_cobro(bigint, date, text) FROM PUBLIC;
    REVOKE ALL ON FUNCTION ops.fn_ven_cambiar_fecha_cobro(bigint, date, text) FROM PUBLIC;
    FOR r IN SELECT DISTINCT x.grantee FROM pg_proc p, aclexplode(p.proacl) x
              WHERE p.oid = 'fin.fn_anular_movimiento(bigint,text)'::regprocedure AND x.privilege_type = 'EXECUTE' AND x.grantee <> p.proowner AND x.grantee <> 0 LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_cambiar_fecha_cobro(bigint, date, text) TO %I', pg_get_userbyid(r.grantee));
    END LOOP;
    FOR r IN SELECT DISTINCT x.grantee FROM pg_proc p, aclexplode(p.proacl) x
              WHERE p.oid = 'ven.fn_cobrar_factura(bigint,date,bigint)'::regprocedure AND x.privilege_type = 'EXECUTE' AND x.grantee <> p.proowner AND x.grantee <> 0 LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION ven.fn_cambiar_fecha_cobro(bigint, date, text) TO %I', pg_get_userbyid(r.grantee));
    END LOOP;
    FOR r IN SELECT DISTINCT x.grantee FROM pg_proc p, aclexplode(p.proacl) x
              WHERE p.oid = 'ops.fn_ven_cobrar_factura(bigint,date,bigint)'::regprocedure AND x.privilege_type = 'EXECUTE' AND x.grantee <> p.proowner AND x.grantee <> 0 LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION ops.fn_ven_cambiar_fecha_cobro(bigint, date, text) TO %I', pg_get_userbyid(r.grantee));
    END LOOP;
END $do$;

-- Control: cada rol de la web puede usar lo nuevo igual que lo vecino
DO $do$
DECLARE v_mal text;
BEGIN
    SELECT string_agg(ro.rolname, ', ') INTO v_mal FROM pg_roles ro
     WHERE ro.rolname IN (SELECT rol_bd FROM seg.rol_aplicacion WHERE rol_bd IS NOT NULL)
       AND (has_function_privilege(ro.rolname, 'fin.fn_anular_movimiento(bigint,text)', 'EXECUTE')
                IS DISTINCT FROM has_function_privilege(ro.rolname, 'fin.fn_cambiar_fecha_cobro(bigint,date,text)', 'EXECUTE')
            OR has_function_privilege(ro.rolname, 'ops.fn_ven_cobrar_factura(bigint,date,bigint)', 'EXECUTE')
                IS DISTINCT FROM has_function_privilege(ro.rolname, 'ops.fn_ven_cambiar_fecha_cobro(bigint,date,text)', 'EXECUTE')
            OR has_function_privilege(ro.rolname, 'ven.fn_cobrar_factura(bigint,date,bigint)', 'EXECUTE')
                IS DISTINCT FROM has_function_privilege(ro.rolname, 'ven.fn_cambiar_fecha_cobro(bigint,date,text)', 'EXECUTE'));
    IF v_mal IS NOT NULL THEN RAISE EXCEPTION 'Los permisos de las funciones nuevas no quedaron iguales a los vecinos para: %', v_mal; END IF;
END $do$;

UPDATE ref.parametro SET valor = '273' WHERE codigo = 'web.version_base' AND valor::text::int < 273;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'migración 273 aplicada' AS que, (SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base') AS version_base;
