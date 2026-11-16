-- Factura exenta (34): la orden de compra del cliente va en «Referencia»
-- Pedido de Facturación (16/11/2026). NO cambia web.version_base (no pisa la numeración del backlog).
-- Agrega dos columnas a ven.factura, una función para guardarlas, y manda la referencia en el XML
-- (referencia del SII: tipo de documento 801 = orden de compra). No toca facturas ya emitidas. Se puede correr más de una vez.

BEGIN;

ALTER TABLE ven.factura ADD COLUMN IF NOT EXISTS orden_compra text;
ALTER TABLE ven.factura ADD COLUMN IF NOT EXISTS orden_compra_fecha date;
COMMENT ON COLUMN ven.factura.orden_compra IS 'Número de la orden de compra del cliente: se imprime en «Referencia» de la factura exenta electrónica (referencia SII 801).';
COMMENT ON COLUMN ven.factura.orden_compra_fecha IS 'Fecha de la orden de compra del cliente (si no se carga, en la referencia va la fecha de la factura).';

-- Guardar (o borrar) la orden de compra de una factura que todavía no se emitió
CREATE OR REPLACE FUNCTION ven.fn_guardar_oc_sii(p_factura bigint, p_numero text, p_fecha date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE f ven.factura%ROWTYPE; v text := nullif(regexp_replace(btrim(coalesce(p_numero, '')), '\s+', ' ', 'g'), '');
BEGIN
    PERFORM ven.fn_exigir_facturacion();
    SELECT * INTO f FROM ven.factura WHERE id = p_factura AND eliminado_en IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'La factura no existe' USING ERRCODE = 'P0002'; END IF;
    IF f.estado <> 'borrador' THEN RAISE EXCEPTION 'La orden de compra se carga antes de emitir la factura' USING ERRCODE = '55000'; END IF;
    IF ven.fn_sii_tipo(f.cliente_id) <> 34 THEN
        RAISE EXCEPTION 'La referencia de orden de compra es solo para la factura exenta (clientes de Chile)' USING ERRCODE = '22023';
    END IF;
    IF length(v) > 18 THEN RAISE EXCEPTION 'El número de la orden de compra puede tener hasta 18 letras o números: tiene %', length(v) USING ERRCODE = '22023'; END IF;
    IF v IS NOT NULL AND p_fecha IS NOT NULL AND p_fecha > (now() AT TIME ZONE 'America/Santiago')::date THEN
        RAISE EXCEPTION 'La fecha de la orden de compra no puede ser futura' USING ERRCODE = '22023';
    END IF;
    PERFORM set_config('ven.fn', '1', true);
    UPDATE ven.factura SET orden_compra = v, orden_compra_fecha = CASE WHEN v IS NULL THEN NULL ELSE p_fecha END WHERE id = p_factura;
    PERFORM set_config('ven.fn', '', true);
    RETURN jsonb_build_object('orden_compra', v, 'orden_compra_fecha', CASE WHEN v IS NULL THEN NULL ELSE p_fecha END);
END $function$;

CREATE OR REPLACE FUNCTION ops.fn_ven_guardar_oc_sii(p_id bigint, p_numero text, p_fecha date)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ SELECT ven.fn_guardar_oc_sii(p_factura => p_id, p_numero => p_numero, p_fecha => p_fecha) $function$;

-- El XML: en la exenta, la orden de compra va como referencia (801)
DO $do$
DECLARE
    v_def text := pg_get_functiondef('ven.fn_sii_xml(bigint, smallint, date, numeric, bigint, text)'::regprocedure);
    v_ancla constant text := '|| ''<CodRef>1</CodRef>'' || ven.fn_xml_el(''RazonRef'', p_motivo, 90) || ''</Referencia>''
              ELSE '''' END';
    v_nuevo constant text := '|| ''<CodRef>1</CodRef>'' || ven.fn_xml_el(''RazonRef'', p_motivo, 90) || ''</Referencia>''
              -- Orden de compra del cliente (solo factura exenta): referencia 801, se imprime en «Referencia»
              WHEN p_tipo = 34 AND nullif(btrim(f.orden_compra), '''') IS NOT NULL
              THEN ''<Referencia><NroLinRef>1</NroLinRef><TpoDocRef>801</TpoDocRef>'' || ven.fn_xml_el(''FolioRef'', f.orden_compra, 18)
                   || ven.fn_xml_el(''FchRef'', to_char(coalesce(f.orden_compra_fecha, p_fecha), ''YYYY-MM-DD'')) || ''</Referencia>''
              ELSE '''' END';
BEGIN
    IF v_def LIKE '%<TpoDocRef>801</TpoDocRef>%' THEN RETURN; END IF;
    IF position(v_ancla IN v_def) = 0 THEN
        RAISE EXCEPTION 'ven.fn_sii_xml no es la que esperaba esta migración: avisar antes de seguir';
    END IF;
    EXECUTE replace(v_def, v_ancla, v_nuevo);
END $do$;

-- La vista previa: muestra la orden de compra y avisa a la web que el campo existe
DO $do$
DECLARE
    v_def text := pg_get_functiondef('ven.fn_sii_vista_previa(bigint, date)'::regprocedure);
    v_ancla constant text := '''faltantes'', to_jsonb(v_falta));';
BEGIN
    IF v_def LIKE '%orden_compra_admite%' THEN RETURN; END IF;
    IF position(v_ancla IN v_def) = 0 THEN
        RAISE EXCEPTION 'ven.fn_sii_vista_previa no es la que esperaba esta migración: avisar antes de seguir';
    END IF;
    EXECUTE replace(v_def, v_ancla, '''orden_compra_admite'', v_tipo = 34, ''orden_compra'', f.orden_compra, ''orden_compra_fecha'', f.orden_compra_fecha,
        ' || v_ancla);
END $do$;

-- Permisos: los mismos que la función de la leyenda
DO $do$
DECLARE r record;
BEGIN
    REVOKE ALL ON FUNCTION ven.fn_guardar_oc_sii(bigint, text, date) FROM PUBLIC;
    REVOKE ALL ON FUNCTION ops.fn_ven_guardar_oc_sii(bigint, text, date) FROM PUBLIC;
    FOR r IN SELECT rolname FROM pg_roles WHERE rolname NOT LIKE 'pg\_%'
                AND has_function_privilege(oid, 'ops.fn_ven_guardar_glosa_sii(bigint, text)', 'EXECUTE') AND NOT rolsuper LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION ven.fn_guardar_oc_sii(bigint, text, date) TO %I', r.rolname);
        EXECUTE format('GRANT EXECUTE ON FUNCTION ops.fn_ven_guardar_oc_sii(bigint, text, date) TO %I', r.rolname);
    END LOOP;
    IF NOT has_function_privilege('tc_app', 'ops.fn_ven_guardar_oc_sii(bigint, text, date)', 'EXECUTE')
       OR NOT has_function_privilege('tc_admin', 'ops.fn_ven_guardar_oc_sii(bigint, text, date)', 'EXECUTE') THEN
        RAISE EXCEPTION 'Los roles de la web no quedaron con permiso sobre la función nueva';
    END IF;
END $do$;

COMMIT;
