-- =============================================================================
-- IronTrack — 130 · El sistema se llama IronTrack
-- -----------------------------------------------------------------------------
-- Pedido de Gerencia (30/10/2026): el sistema pasa a llamarse IronTrack e Iris es su
-- «asistente inteligente». Cambian solo las instrucciones de Iris (las mismas reglas);
-- el informe semanal las usa también. La web cambia el nombre y el logo de Iris.
-- web.version_base = 130. No crea datos.
-- =============================================================================
SET search_path = public, extensions;
BEGIN;

DO $do$
BEGIN
    IF NOT has_table_privilege('tc_lectura', 'ia.asistente_herramienta', 'SELECT') THEN
        RAISE EXCEPTION 'Falta la migración 129 (114_iris_para_gerencia.sql): aplicarla antes';
    END IF;
END $do$;

DO $do$
DECLARE v text; n text;
BEGIN
    v := pg_get_functiondef('ia.fn_instrucciones_asistente()'::regprocedure);
    n := replace(v, 'Sos Iris, el asistente de Gerencia de Transportes Calderón (si te preguntan, te llamás Iris y funcionás con Claude, de Anthropic), una empresa de transporte internacional de cargas entre Chile y Argentina.',
                    'Sos Iris, el asistente inteligente de IronTrack, el sistema de gestión de la empresa, y atendés a Gerencia (si te preguntan, te llamás Iris y funcionás con Claude, de Anthropic). La empresa hace transporte internacional de cargas entre Chile y Argentina.');
    IF n = v AND v NOT LIKE '%asistente inteligente de IronTrack%' THEN
        RAISE EXCEPTION 'No se pudo ajustar ia.fn_instrucciones_asistente (cambió su texto)';
    END IF;
    EXECUTE n;
END $do$;

UPDATE ref.parametro SET descripcion = replace(descripcion, 'Iris, el asistente de IA', 'Iris, el asistente inteligente de IronTrack')
 WHERE codigo = 'ia.asistente_activo' AND descripcion NOT LIKE '%IronTrack%';

UPDATE ref.parametro SET valor = '130' WHERE codigo = 'web.version_base' AND valor::text::int < 130;

NOTIFY pgrst, 'reload schema';

COMMIT;
