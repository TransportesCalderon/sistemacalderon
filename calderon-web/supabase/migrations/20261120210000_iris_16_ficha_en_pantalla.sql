-- =====================================================================================
-- Iris 16 · La ficha de cumplimiento también en pantalla (Combustible › Alertas)
-- =====================================================================================
-- Pedido (20/11/2026): que la ficha de cumplimiento por persona se vea en el sistema, sin preguntarle a Iris.
-- La lectura vive en el esquema «ia», que la web no ve: esta función la expone en «ana» (el de las alertas),
-- con los mismos permisos de la bandeja de alertas. La ficha sigue exigiendo Gerencia, TI o auditor.
-- No cambia datos. Numeración propia de Iris: no toca web.version_base.
-- =====================================================================================
BEGIN;

DO $do$
BEGIN
    IF to_regprocedure('ia.fn_lectura_ficha_cumplimiento(jsonb)') IS NULL
       OR pg_get_functiondef('ia.fn_lectura_ficha_cumplimiento(jsonb)'::regprocedure) NOT LIKE '%fondo_fijo%' THEN
        RAISE EXCEPTION 'Primero hay que aplicar iris_15 (la versión con el fondo fijo)';
    END IF;
END $do$;

CREATE OR REPLACE FUNCTION ana.fn_ficha_cumplimiento(p_mes date DEFAULT NULL, p_chofer text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT ia.fn_lectura_ficha_cumplimiento(jsonb_strip_nulls(jsonb_build_object('mes', p_mes, 'chofer', nullif(btrim(p_chofer), ''))))
$f$;
COMMENT ON FUNCTION ana.fn_ficha_cumplimiento(date, text) IS
    'Iris 16: la ficha de cumplimiento por persona para la pantalla de Alertas (solo Gerencia, TI y auditor; lo controla la lectura de Iris).';

DO $g$
DECLARE r record;
BEGIN
    REVOKE ALL ON FUNCTION ana.fn_ficha_cumplimiento(date, text) FROM PUBLIC;
    FOR r IN SELECT DISTINCT a.grantee FROM pg_proc p, aclexplode(p.proacl) a
              WHERE p.oid = 'ana.fn_bandeja_alertas(text,date,date,bigint,text)'::regprocedure AND a.privilege_type = 'EXECUTE' AND a.grantee <> 0 LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION ana.fn_ficha_cumplimiento(date, text) TO %I', pg_get_userbyid(r.grantee));
    END LOOP;
    IF NOT has_function_privilege('tc_app', 'ana.fn_ficha_cumplimiento(date,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'La función quedó sin el permiso de la web: avisar antes de seguir';
    END IF;
END $g$;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'iris 16 aplicada' AS que;
