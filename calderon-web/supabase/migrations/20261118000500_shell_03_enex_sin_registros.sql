-- Shell 03 · Enex: «código 03: Sin registros» no es un error, es un día sin cargas con tarjeta
-- Primera prueba real (17/11/2026): Enex contestó bien, pero el sistema lo anotaba como falla. NO cambia web.version_base.
-- Necesita shell_01_cargas_enex.sql. Se puede correr más de una vez.

BEGIN;

DO $do$
DECLARE v_def text; v_a constant text := 'IF v_cod IS DISTINCT FROM ''00'' THEN v_err := format(''Enex devolvió el código %s: %s''';
BEGIN
    IF to_regprocedure('fue.fn_enex_traer(date)') IS NULL THEN RAISE EXCEPTION 'Primero hay que correr shell_01_cargas_enex.sql'; END IF;
    v_def := pg_get_functiondef('fue.fn_enex_traer(date)'::regprocedure);
    IF v_def LIKE '%Sin cargas con tarjeta ese día%' THEN RETURN; END IF;
    IF position(v_a IN v_def) = 0 THEN RAISE EXCEPTION 'fue.fn_enex_traer no es la que esperaba esta migración: avisar antes de seguir'; END IF;
    EXECUTE replace(v_def, v_a, 'IF v_cod = ''03'' THEN
            INSERT INTO fue.enex_consulta (fecha, ok, mensaje) VALUES (p_fecha, true, ''Sin cargas con tarjeta ese día'');
            RETURN jsonb_build_object(''ok'', true, ''fecha'', p_fecha, ''recibidas'', 0, ''nuevas'', 0, ''avisos'', ''Enex no tiene cargas con tarjeta ese día'');
        END IF;
        ' || v_a);
END $do$;

COMMIT;
