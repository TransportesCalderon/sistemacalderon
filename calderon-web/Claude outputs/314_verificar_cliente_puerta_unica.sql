-- =============================================================================
-- IronTrack — Verificación 314 · Cambio 263 (migración 271) · Clientes: una sola puerta de alta
-- -----------------------------------------------------------------------------
-- Correr DESPUÉS de la migración 271. NO GUARDA NADA: da de alta clientes ZZ por la puerta,
-- prueba los frenos (identificador fiscal, nombre, código), pasa un prospecto ZZ a cliente,
-- revisa los permisos rol por rol y termina con un error a propósito («VERIFICACIÓN 314 OK …»)
-- que deshace todo. Si termina con otro error, copiarlo y mandarlo.
-- =============================================================================
DO $do$
DECLARE
    v_ti bigint; r jsonb; v_id bigint; v_id2 bigint; v_emp bigint; v_cli bigint; v_msg text; v_roles text; v_ok text[] := '{}'; v_salto text[] := '{}';
    v_base jsonb := '{"codigo":"ZZ-314-A","razon_social":"ZZ Prueba Trescientos Catorce S.A.","identificador_fiscal":"ZZ-314.000-1","pais":"AR","moneda_facturacion":"USD"}';
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 271 THEN
        RAISE EXCEPTION 'Falta aplicar la migración 271';
    END IF;

    -- 1 · Una sola puerta
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE p.prokind = 'f' AND p.prosrc ~* 'insert\s+into\s+mae\.cliente\M' AND (n.nspname, p.proname) <> ('mae', 'fn_crear_cliente')) THEN
        RAISE EXCEPTION 'FALLA 1: hay funciones que dan de alta clientes por fuera de la puerta';
    END IF;
    v_ok := v_ok || '1 una sola función da de alta clientes'::text;

    -- 2 · Permisos: todo rol de la web que puede insertar en mae.cliente puede usar la puerta, y ninguno más
    SELECT string_agg(ro.rolname, ', ') INTO v_msg FROM pg_roles ro
     WHERE (ro.rolname = 'authenticated' OR ro.rolname IN (SELECT rol_bd FROM seg.rol_aplicacion WHERE rol_bd IS NOT NULL))
       AND has_table_privilege(ro.rolname, 'mae.cliente', 'INSERT') IS DISTINCT FROM has_function_privilege(ro.rolname, 'mae.fn_crear_cliente(jsonb,text)', 'EXECUTE');
    IF v_msg IS NOT NULL THEN
        RAISE EXCEPTION 'FALLA 2: estos roles no tienen sobre la puerta el mismo permiso que sobre la tabla de clientes: %', v_msg;
    END IF;
    SELECT string_agg(ro.rolname, ', ' ORDER BY ro.rolname) INTO v_roles FROM pg_roles ro
     WHERE (ro.rolname = 'authenticated' OR ro.rolname IN (SELECT rol_bd FROM seg.rol_aplicacion WHERE rol_bd IS NOT NULL))
       AND has_function_privilege(ro.rolname, 'mae.fn_crear_cliente(jsonb,text)', 'EXECUTE');
    v_ok := v_ok || format('2 permisos iguales a los de la tabla (pueden: %s)', coalesce(v_roles, 'ninguno'));

    INSERT INTO seg.usuario (login, nombre) VALUES ('zz_ti_314', 'ZZ TI 314') RETURNING id INTO v_ti;
    INSERT INTO seg.usuario_rol (usuario_id, rol_codigo) VALUES (v_ti, 'ti');
    PERFORM set_config('app.usuario_id', v_ti::text, true);

    -- 3 · Alta normal: queda el cliente y su empresa en Ventas (una sola)
    r := mae.fn_crear_cliente(v_base, 'web');
    v_id := (r ->> 'id')::bigint;
    IF v_id IS NULL OR jsonb_array_length(r -> 'avisos') <> 0
       OR NOT EXISTS (SELECT 1 FROM mae.cliente WHERE id = v_id AND codigo = 'ZZ-314-A' AND estado = 'activo' AND eliminado_en IS NULL)
       OR (SELECT count(*) FROM ven.empresa WHERE cliente_id = v_id AND eliminado_en IS NULL) <> 1 THEN
        RAISE EXCEPTION 'FALLA 3: el alta normal no dejó el cliente con su empresa de Ventas: %', r;
    END IF;
    v_ok := v_ok || '3 alta normal con su empresa en Ventas'::text;

    -- 4 · Mismo identificador fiscal (con otros signos): frena siempre, aunque se acepten parecidos
    BEGIN
        PERFORM mae.fn_crear_cliente(v_base || '{"codigo":"ZZ-314-B","razon_social":"ZZ Otra Razón 314","identificador_fiscal":"zz 314 000 1","aceptar_parecidos":true}', 'web');
        RAISE EXCEPTION 'FALLA 4: dejó repetir el identificador fiscal';
    EXCEPTION WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        IF v_msg NOT LIKE 'Ya existe un cliente con ese identificador fiscal%' THEN RAISE EXCEPTION 'FALLA 4: mensaje inesperado: %', v_msg; END IF;
    END;
    -- 5 · Mismo nombre (otras mayúsculas y signos): frena; con «es otro cliente» pasa y avisa
    BEGIN
        PERFORM mae.fn_crear_cliente(v_base || '{"codigo":"ZZ-314-C","razon_social":"zz PRUEBA trescientos catorce s a","identificador_fiscal":"ZZ-314-2"}', 'web');
        RAISE EXCEPTION 'FALLA 5: dejó repetir el nombre sin confirmar';
    EXCEPTION WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        IF v_msg NOT LIKE 'Ya hay un cliente con ese nombre%«Es otro cliente»%' THEN RAISE EXCEPTION 'FALLA 5: mensaje inesperado: %', v_msg; END IF;
    END;
    r := mae.fn_crear_cliente(v_base || '{"codigo":"ZZ-314-C","razon_social":"zz PRUEBA trescientos catorce s a","identificador_fiscal":"ZZ-314-2","aceptar_parecidos":true}', 'web');
    IF (r ->> 'id') IS NULL OR jsonb_array_length(r -> 'avisos') <> 1 THEN RAISE EXCEPTION 'FALLA 5: con «es otro cliente» tenía que pasar y avisar: %', r; END IF;
    -- 6 · Redline: el nombre igual avisa y no frena
    r := mae.fn_crear_cliente(v_base || '{"codigo":"ZZ-314-D","identificador_fiscal":"REDLINE-ZZ314"}', 'redline');
    IF (r ->> 'id') IS NULL OR jsonb_array_length(r -> 'avisos') <> 1 THEN RAISE EXCEPTION 'FALLA 6: en Redline el nombre igual tenía que avisar sin frenar: %', r; END IF;
    -- 7 · Código repetido y dato obligatorio
    BEGIN
        PERFORM mae.fn_crear_cliente(v_base || '{"razon_social":"ZZ Distinto 314","identificador_fiscal":"ZZ-314-9"}', 'web');
        RAISE EXCEPTION 'FALLA 7: dejó repetir el código';
    EXCEPTION WHEN unique_violation THEN NULL; END;
    BEGIN
        PERFORM mae.fn_crear_cliente(v_base - 'razon_social' || '{"codigo":"ZZ-314-E","identificador_fiscal":"ZZ-314-8"}', 'web');
        RAISE EXCEPTION 'FALLA 7: dejó dar de alta sin razón social';
    EXCEPTION WHEN not_null_violation THEN NULL; END;
    v_ok := v_ok || '4 fiscal repetido frena'::text || '5 nombre igual frena y con «es otro cliente» avisa'::text
                 || '6 Redline avisa sin frenar'::text || '7 código repetido y dato faltante frenan'::text;

    -- 8 · Pasar un prospecto a cliente usa la misma puerta
    BEGIN
        INSERT INTO ven.empresa (nombre, pais, origen) VALUES ('ZZ Prospecto 314', 'AR', 'otro') RETURNING id INTO v_emp;
        BEGIN
            PERFORM ven.fn_hacer_cliente(v_emp, NULL, '{"identificador_fiscal":"ZZ.314.000.1"}');
            RAISE EXCEPTION 'FALLA 8: el prospecto pasó a cliente con un identificador fiscal que ya existe';
        EXCEPTION WHEN unique_violation THEN NULL; END;
        v_cli := ven.fn_hacer_cliente(v_emp, NULL, '{"identificador_fiscal":"ZZ-314-PROSPECTO"}');
        IF NOT EXISTS (SELECT 1 FROM mae.cliente WHERE id = v_cli AND razon_social = 'ZZ Prospecto 314' AND eliminado_en IS NULL)
           OR (SELECT cliente_id FROM ven.empresa WHERE id = v_emp) IS DISTINCT FROM v_cli
           OR (SELECT count(*) FROM ven.empresa WHERE cliente_id = v_cli AND eliminado_en IS NULL) <> 1 THEN
            RAISE EXCEPTION 'FALLA 8: el prospecto no quedó como cliente con una sola empresa';
        END IF;
        v_ok := v_ok || '8 prospecto a cliente por la misma puerta'::text;
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        IF v_msg LIKE 'FALLA%' THEN RAISE EXCEPTION '%', v_msg; END IF;
        v_salto := v_salto || format('8 (no se pudo armar el prospecto de prueba: %s)', left(v_msg, 160));
    END;

    RAISE EXCEPTION 'VERIFICACIÓN 314 OK (no se guardó nada): % · no se pudo probar: %',
        array_to_string(v_ok, ' · '), coalesce(nullif(array_to_string(v_salto, ', '), ''), 'nada');
END $do$;
