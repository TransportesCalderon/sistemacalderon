-- =====================================================================================
-- Migración 288 · La cuenta del chofer para transferirle el fondo fijo, en su perfil y en Fondos
-- =====================================================================================
-- Pedido (20/11/2026): que el chofer cargue en su perfil la cuenta a la que se le deposita el fondo fijo,
-- y que el módulo de Fondos la tome sola.
--
-- Usa la tabla de la migración 284 (fin.chofer_cuenta_transferencia, una cuenta por chofer y moneda) y su función
-- para guardar (fin.fn_guardar_cuenta_transferencia). Agrega solo la lectura de todas las cuentas de un chofer:
--   · fin.fn_cuentas_transferencia(chofer): chofer vacío = las mías (el chofer); con chofer, quien pide, autoriza
--     o paga fondos, Gerencia, TI y el auditor.
-- No cambia datos ni funciones existentes. web.version_base = 288.
-- =====================================================================================
BEGIN;

DO $v$
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 287 THEN
        RAISE EXCEPTION 'Primero hay que aplicar las migraciones anteriores, hasta la 287 (llegada a estación). La base está en la %',
            coalesce((SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base'), '?');
    END IF;
    IF to_regprocedure('fin.fn_guardar_cuenta_transferencia(bigint,text,jsonb)') IS NULL THEN
        RAISE EXCEPTION 'Falta la migración 284 de la cuenta a transferir (20261120100000_cuenta_transferencia_chofer.sql)';
    END IF;
END $v$;

CREATE OR REPLACE FUNCTION fin.fn_cuentas_transferencia(p_chofer bigint DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_chofer bigint;
BEGIN
    IF p_chofer IS NULL THEN
        v_chofer := ops.fn_exigir_mi_chofer();
    ELSE
        IF NOT (fin.fn_puedo_pedir_fondos() OR fin.fn_puedo_aprobar_fondos() OR fin.fn_puedo_depositar_fondos()
                OR EXISTS (SELECT 1 FROM seg.usuario_rol WHERE usuario_id = aud.fn_usuario_actual() AND rol_codigo IN ('gerencia', 'ti', 'auditor'))) THEN
            RAISE EXCEPTION 'Las cuentas de los choferes las ven quienes piden, autorizan o pagan fondos' USING ERRCODE = '42501';
        END IF;
        v_chofer := p_chofer;
    END IF;
    RETURN coalesce((SELECT jsonb_agg(fin.fn_cuenta_transferencia_json(c.chofer_id, c.moneda) ORDER BY c.moneda)
                       FROM fin.chofer_cuenta_transferencia c WHERE c.chofer_id = v_chofer), '[]');
END $f$;
COMMENT ON FUNCTION fin.fn_cuentas_transferencia(bigint) IS
    'Migración 288: las cuentas de un chofer para transferirle el fondo fijo, una por moneda. Vacío = las mías.';

DO $g$
DECLARE r record;
BEGIN
    REVOKE ALL ON FUNCTION fin.fn_cuentas_transferencia(bigint) FROM PUBLIC;
    FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'tc\_%' OR rolname = 'authenticated' LOOP
        IF has_function_privilege(r.rolname, 'fin.fn_guardar_cuenta_transferencia(bigint,text,jsonb)', 'EXECUTE')
           OR has_function_privilege(r.rolname, 'fin.fn_fondo_chofer(bigint,date,date)', 'EXECUTE') THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_cuentas_transferencia(bigint) TO %I', r.rolname);
        END IF;
    END LOOP;
END $g$;

UPDATE ref.parametro SET valor = '288' WHERE codigo = 'web.version_base' AND valor::text::int < 288;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'migración 288 aplicada' AS que, (SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base') AS version_base;
