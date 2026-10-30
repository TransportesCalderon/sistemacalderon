-- =============================================================================
-- Transportes Calderón — 128 · El asistente de IA se llama «Iris»
-- -----------------------------------------------------------------------------
-- Pedido de Gerencia (30/10/2026): el asistente (IA-2 a IA-4) se presenta como «Iris».
-- Solo cambian sus instrucciones (las mismas reglas); el informe semanal las usa también.
-- web.version_base = 128. No crea datos.
-- =============================================================================
SET search_path = public, extensions;
BEGIN;

DO $do$
BEGIN
    IF to_regclass('ia.asistente_informe') IS NULL THEN
        RAISE EXCEPTION 'Falta la migración 127 (112_informe_semanal_ia.sql): aplicarla antes';
    END IF;
END $do$;

DO $do$
DECLARE v text; n text;
BEGIN
    v := pg_get_functiondef('ia.fn_instrucciones_asistente()'::regprocedure);
    n := replace(v, 'Sos el asistente de Gerencia de Transportes Calderón,',
                    'Sos Iris, el asistente de Gerencia de Transportes Calderón (si te preguntan, te llamás Iris y funcionás con Claude, de Anthropic),');
    IF n = v AND v NOT LIKE '%Sos Iris%' THEN RAISE EXCEPTION 'No se pudo ajustar ia.fn_instrucciones_asistente (cambió su texto)'; END IF;
    EXECUTE n;
END $do$;

UPDATE ref.parametro SET descripcion = replace(descripcion, 'el asistente de IA', 'Iris, el asistente de IA')
 WHERE codigo = 'ia.asistente_activo' AND descripcion NOT LIKE '%Iris%';

UPDATE ref.parametro SET valor = '128' WHERE codigo = 'web.version_base' AND valor::text::int < 128;

NOTIFY pgrst, 'reload schema';

COMMIT;
