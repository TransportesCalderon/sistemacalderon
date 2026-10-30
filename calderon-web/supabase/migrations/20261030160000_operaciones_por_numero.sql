-- =============================================================================
-- IronTrack — 132 · Las operaciones, siempre por número (la más nueva arriba)
-- -----------------------------------------------------------------------------
-- Pedido de Gerencia (30/10/2026): las operaciones se ordenan siempre por número, de mayor a
-- menor. ops.fn_operaciones ya lo hacía; faltaba «Para facturar» (ven.fn_por_facturar), que las
-- ordenaba por cliente, entregadas primero y fecha. Ahora: por cliente y, dentro de cada
-- cliente, por número de mayor a menor. (La web: el selector de operaciones de los viajes del
-- chofer también.) web.version_base = 132. No crea datos.
-- =============================================================================
SET search_path = public, extensions;
BEGIN;

DO $do$
BEGIN
    IF to_regprocedure('ia.fn_modelo_actualizar()') IS NULL THEN
        RAISE EXCEPTION 'Falta la migración 131 (116_iris_modelo_automatico.sql): aplicarla antes';
    END IF;
END $do$;

DO $do$
DECLARE v text; n text;
BEGIN
    v := pg_get_functiondef('ven.fn_por_facturar()'::regprocedure);
    n := replace(v, $a$ORDER BY c.razon_social, (s.estado = 'entregado') DESC, s.fecha_real_fin, s.fecha_operacion, s.id)$a$,
                    $a$ORDER BY c.razon_social, s.numero_operacion DESC, s.id DESC)$a$);
    IF n = v THEN RAISE EXCEPTION 'No se pudo ajustar ven.fn_por_facturar (cambió su texto)'; END IF;
    EXECUTE n;
END $do$;

UPDATE ref.parametro SET valor = '132' WHERE codigo = 'web.version_base' AND valor::text::int < 132;

NOTIFY pgrst, 'reload schema';

COMMIT;
