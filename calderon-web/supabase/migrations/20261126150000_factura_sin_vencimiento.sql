-- =====================================================================================
-- Migración 360 · La factura sale sin fecha de vencimiento
-- =====================================================================================
-- Pedido (26/11/2026): «que no aparezca ninguna fecha de vencimiento cuando emitimos la factura a través del
-- sistema».
--   · ven.fn_sii_xml: el documento que va a Facturacion.cl ya no lleva <FchVenc>. El PDF (original y cedible) sale
--     sin «Fecha de vencimiento». Para el SII ese dato es opcional. Vale para la factura exenta (34) y la de
--     exportación (110); las notas de crédito ya no lo llevaban.
--   · ven.fn_sii_vista_previa: deja de mandar «vence», así la vista previa de la web no muestra «Vencimiento»
--     (la web lo oculta sola: no hay que subir nada).
-- No cambia: la forma de pago («Crédito»), las facturas ya emitidas (ya están en el SII) ni la fecha de cobro
-- interna de cada factura (cuenta corriente, «Por cobrar», facturas vencidas), que no se imprime.
-- No cambia datos. NO cambia web.version_base. Se puede correr más de una vez.
-- =====================================================================================
BEGIN;

-- 1 · El XML de la factura: sin FchVenc (se reemplaza solo esa línea; el resto de la función queda igual)
DO $do$
DECLARE
    v_firma constant regprocedure := 'ven.fn_sii_xml(bigint, smallint, date, numeric, bigint, text)'::regprocedure;
    v_def text := pg_get_functiondef(v_firma);
    v_ancla constant text := '|| CASE WHEN NOT v_nc THEN ven.fn_xml_el(''FchVenc'', to_char(p_fecha + v_dias, ''YYYY-MM-DD'')) ELSE '''' END';
    v_nuevo constant text := '-- Migración 360: la factura no lleva fecha de vencimiento (el SII no la exige)';
    v_veces integer;
BEGIN
    IF position('''FchVenc''' IN v_def) = 0 THEN
        RAISE NOTICE 'ven.fn_sii_xml ya estaba sin fecha de vencimiento';
        RETURN;
    END IF;
    v_veces := (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla);
    IF v_veces <> 1 THEN
        RAISE EXCEPTION 'ven.fn_sii_xml no es la que esperaba esta migración (la línea del vencimiento aparece % veces): avisar antes de seguir', v_veces;
    END IF;
    EXECUTE replace(v_def, v_ancla, v_nuevo);
    IF position('''FchVenc''' IN pg_get_functiondef(v_firma)) > 0 THEN
        RAISE EXCEPTION 'ven.fn_sii_xml sigue mandando la fecha de vencimiento';
    END IF;
END $do$;

-- 2 · La vista previa: sin «vence»
DO $do$
DECLARE
    v_firma constant regprocedure := 'ven.fn_sii_vista_previa(bigint, date)'::regprocedure;
    v_def text := pg_get_functiondef(v_firma);
    v_ancla constant text := '''fecha'', p_fecha, ''vence'', p_fecha + coalesce(c.condicion_pago_dias, 0),';
    v_veces integer;
BEGIN
    IF position('''vence''' IN v_def) = 0 THEN
        RAISE NOTICE 'ven.fn_sii_vista_previa ya estaba sin fecha de vencimiento';
        RETURN;
    END IF;
    v_veces := (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla);
    IF v_veces <> 1 THEN
        RAISE EXCEPTION 'ven.fn_sii_vista_previa no es la que esperaba esta migración (el vencimiento aparece % veces): avisar antes de seguir', v_veces;
    END IF;
    EXECUTE replace(v_def, v_ancla, '''fecha'', p_fecha,');
    IF position('''vence''' IN pg_get_functiondef(v_firma)) > 0 THEN
        RAISE EXCEPTION 'ven.fn_sii_vista_previa sigue mandando la fecha de vencimiento';
    END IF;
END $do$;

COMMIT;

-- Resultado
SELECT 'Factura sin fecha de vencimiento' AS cambio,
       position('''FchVenc''' IN pg_get_functiondef('ven.fn_sii_xml(bigint, smallint, date, numeric, bigint, text)'::regprocedure)) = 0
           AS xml_sin_vencimiento,
       position('''vence''' IN pg_get_functiondef('ven.fn_sii_vista_previa(bigint, date)'::regprocedure)) = 0
           AS vista_previa_sin_vencimiento,
       (SELECT valor FROM ref.parametro WHERE codigo = 'web.version_base') AS version_web;
