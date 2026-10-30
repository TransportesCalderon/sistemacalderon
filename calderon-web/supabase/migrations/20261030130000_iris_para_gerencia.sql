-- =============================================================================
-- Transportes Calderón — 129 · Iris también para quien es SOLO Gerencia
-- -----------------------------------------------------------------------------
-- Falla (30/10/2026): a un usuario que solo tiene el rol Gerencia no le aparecía Iris.
-- Causa: Gerencia entra a la base con el rol tc_lectura y las migraciones 126 (IA-2) y
-- 127 (IA-4) solo les dieron permiso a tc_admin y tc_app. Quien además tenía otro rol
-- (RRHH, Operaciones…) sí lo veía.
-- Arreglo: el mismo permiso para tc_lectura en las funciones del asistente y del informe
-- semanal.
-- Además, ia.fn_herramienta lee la lista de lecturas con los permisos de quien pregunta y
-- esa lista no la podían leer tc_lectura ni tc_app: Iris no podía leer datos para ellos.
-- «Lo mío de hoy» sigue sin ser de Gerencia (no tiene renglones para ese rol y lee auditoría):
-- para Gerencia esa lectura responde «no se pudo leer» e Iris usa las demás.
-- La base sigue exigiendo Gerencia o usuario de prueba: esto no abre Iris a nadie más.
-- Iris sigue sin poder cambiar nada (solo lee). web.version_base = 129. No crea datos.
-- =============================================================================
SET search_path = public, extensions;
BEGIN;

DO $do$
BEGIN
    IF to_regprocedure('ia.fn_informes(integer)') IS NULL THEN
        RAISE EXCEPTION 'Falta la migración 127 (112_informe_semanal_ia.sql): aplicarla antes';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tc_lectura') THEN
        RAISE EXCEPTION 'No existe el rol tc_lectura (migración 20)';
    END IF;
END $do$;

DO $do$
DECLARE f text;
BEGIN
    FOREACH f IN ARRAY ARRAY[
        -- IA-2 (migración 126)
        'ia.fn_puede_asistente(bigint)', 'ia.fn_limpiar(jsonb,integer)', 'ia.fn_fecha_entrada(jsonb,text,date)',
        'ia.fn_herramienta(text,jsonb)', 'ia.fn_turno_publico(bigint)', 'ia.fn_asistente_preparar(text,bigint,text)',
        'ia.fn_asistente_arrancar(bigint,jsonb)', 'ia.fn_asistente_leer(bigint)', 'ia.fn_asistente_seguir(bigint,jsonb)',
        'ia.fn_preguntar(text,bigint,text)', 'ia.fn_respuesta(bigint)', 'ia.fn_valorar_respuesta(bigint,boolean,text)',
        'ia.fn_asistente_estado()', 'ia.fn_conversacion(bigint)', 'ia.fn_uso_asistente(date,date)',
        'ops.fn_ia_asistente_estado()', 'ops.fn_ia_preguntar(text,bigint,text)', 'ops.fn_ia_respuesta(bigint)',
        'ops.fn_ia_valorar(bigint,boolean,text)', 'ops.fn_ia_conversacion(bigint)', 'ops.fn_ia_uso_asistente(date,date)',
        -- IA-4 (migración 127)
        'ia.fn_informe_generar(date)', 'ia.fn_informes(integer)', 'ia.fn_informe(bigint)',
        'ops.fn_ia_informes(integer)', 'ops.fn_ia_informe(bigint)', 'ops.fn_ia_informe_generar(date)',
        -- Código de la moneda base: lo usa «Consumo por camión» (fue.fn_consumo_camiones), que
        -- Gerencia ya podía abrir pero fallaba por esto
        'ref.fn_moneda_base()'] LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO tc_lectura', f);
    END LOOP;
    -- La lista de lecturas de Iris (solo nombres y descripciones): ia.fn_herramienta la lee con los
    -- permisos de quien pregunta. Faltaba también para tc_app (usuarios de prueba de Operaciones).
    GRANT SELECT ON TABLE ia.asistente_herramienta TO tc_lectura, tc_app;
END $do$;

UPDATE ref.parametro SET valor = '129' WHERE codigo = 'web.version_base' AND valor::text::int < 129;

NOTIFY pgrst, 'reload schema';

COMMIT;
