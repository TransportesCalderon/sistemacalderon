-- =============================================================================
-- IronTrack — 279 · Cambio 274 · Comprobante de pago en el recibo de cobranza
-- -----------------------------------------------------------------------------
-- Pedido del usuario (19/11/2026): al hacer un recibo desde Cobros y pagos, poder adjuntar el comprobante (foto o PDF).
--   · fin.recibo_cobro: comprobante_ruta y comprobante_nombre.
--   · fin.fn_registrar_recibo: recibe «comprobante_ruta» y «comprobante_nombre» (el archivo se sube a la carpeta
--     cobros/<una de las facturas>/, la misma que usa el comprobante de la factura). Queda en el recibo y en cada
--     factura del recibo que todavía no tenía comprobante (así se ve también en Ventas).
--   · fin.fn_adjuntar_comprobante_recibo(recibo, ruta, nombre): para adjuntarlo o cambiarlo después.
--   · fin.fn_recibos: devuelve el comprobante.
-- No cambia datos. web.version_base = 279.
-- =============================================================================
SET search_path = public, extensions;
BEGIN;

DO $do$
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 278 THEN
        RAISE EXCEPTION 'Falta la migración 278 (pedido de fondo del chofer): aplicarla antes';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'fin' AND table_name = 'recibo_cobro' AND column_name = 'comprobante_ruta') THEN
        RAISE EXCEPTION 'La migración 279 (comprobante del recibo) ya está aplicada';
    END IF;
END $do$;

ALTER TABLE fin.recibo_cobro
    ADD COLUMN comprobante_ruta text CHECK (comprobante_ruta IS NULL OR (comprobante_ruta ~ '^cobros/[0-9]+/[A-Za-z0-9_.-]+$' AND length(comprobante_ruta) <= 300)),
    ADD COLUMN comprobante_nombre text CHECK (comprobante_nombre IS NULL OR length(comprobante_nombre) <= 200);

-- El comprobante tiene que estar en la carpeta de una factura del recibo; queda en el recibo y en sus facturas sin comprobante
CREATE FUNCTION fin.fn_recibo_poner_comprobante(p_recibo bigint, p_ruta text, p_nombre text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE r fin.recibo_cobro%ROWTYPE; v_ruta text := nullif(btrim(p_ruta), '');
BEGIN
    SELECT * INTO r FROM fin.recibo_cobro WHERE id = p_recibo FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'El recibo no existe' USING ERRCODE = 'P0002'; END IF;
    IF v_ruta IS NULL OR v_ruta !~ '^cobros/[0-9]+/[A-Za-z0-9_.-]+$'
       OR NOT EXISTS (SELECT 1 FROM fin.movimiento m WHERE m.recibo_id = r.id AND v_ruta LIKE 'cobros/' || m.factura_id || '/%') THEN
        RAISE EXCEPTION 'Subí el comprobante (foto o PDF)' USING ERRCODE = '22023';
    END IF;
    PERFORM set_config('fin.cont_fn', '1', true);
    UPDATE fin.recibo_cobro SET comprobante_ruta = v_ruta, comprobante_nombre = left(nullif(btrim(p_nombre), ''), 200) WHERE id = r.id;
    PERFORM set_config('ven.fn', '1', true);
    UPDATE ven.factura f SET comprobante_ruta = v_ruta, comprobante_nombre = left(nullif(btrim(p_nombre), ''), 200)
     WHERE f.id IN (SELECT m.factura_id FROM fin.movimiento m WHERE m.recibo_id = r.id AND m.estado <> 'anulado')
       AND (f.comprobante_ruta IS NULL OR f.comprobante_ruta = r.comprobante_ruta);
    RETURN CASE WHEN r.comprobante_ruta IS DISTINCT FROM v_ruta THEN r.comprobante_ruta END;
END $f$;

CREATE FUNCTION fin.fn_adjuntar_comprobante_recibo(p_recibo bigint, p_ruta text, p_nombre text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
BEGIN
    PERFORM fin.fn_exigir_finanzas();
    IF (SELECT estado FROM fin.recibo_cobro WHERE id = p_recibo) = 'anulado' THEN
        RAISE EXCEPTION 'El recibo está anulado' USING ERRCODE = '55000';
    END IF;
    RETURN fin.fn_recibo_poner_comprobante(p_recibo, p_ruta, p_nombre);
END $f$;

-- Cambios por texto exacto en las funciones de la 275
CREATE FUNCTION pg_temp.cambiar(p_fn regprocedure, p_ancla text, p_nuevo text) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE v_def text := pg_get_functiondef(p_fn);
BEGIN
    IF (length(v_def) - length(replace(v_def, p_ancla, ''))) / length(p_ancla) <> 1 THEN
        RAISE EXCEPTION 'No encontré el texto esperado en %: avisar antes de seguir («%»)', p_fn, left(p_ancla, 80);
    END IF;
    EXECUTE replace(v_def, p_ancla, p_nuevo);
END $f$;

-- Al final del recibo (después de cobrar cada factura), el comprobante si vino
SELECT pg_temp.cambiar('fin.fn_registrar_recibo(jsonb)'::regprocedure,
    'RETURN jsonb_build_object(''id'', v_id, ''numero'', v_numero, ''facturas'', v_n, ''total'', v_total, ''moneda'', cd.moneda);',
    '-- Migración 279: el comprobante de pago (foto o PDF), si se adjuntó
    IF nullif(btrim(p_datos ->> ''comprobante_ruta''), '''') IS NOT NULL THEN
        PERFORM fin.fn_recibo_poner_comprobante(v_id, p_datos ->> ''comprobante_ruta'', p_datos ->> ''comprobante_nombre'');
    END IF;
    RETURN jsonb_build_object(''id'', v_id, ''numero'', v_numero, ''facturas'', v_n, ''total'', v_total, ''moneda'', cd.moneda);');
SELECT pg_temp.cambiar('fin.fn_recibos(date,date)'::regprocedure,
    '''motivo_anulacion'', r.motivo_anulacion, ''creado_por'', u.nombre,',
    '''motivo_anulacion'', r.motivo_anulacion, ''creado_por'', u.nombre,
                   ''comprobante_ruta'', r.comprobante_ruta, ''comprobante_nombre'', r.comprobante_nombre,');

-- Permisos: adjuntar como hacer el recibo; la interna, nadie
DO $do$
DECLARE r record; v_mal text;
BEGIN
    REVOKE ALL ON FUNCTION fin.fn_recibo_poner_comprobante(bigint, text, text) FROM PUBLIC;
    REVOKE ALL ON FUNCTION fin.fn_adjuntar_comprobante_recibo(bigint, text, text) FROM PUBLIC;
    FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'tc\_%' OR rolname = 'authenticated' LOOP
        IF has_function_privilege(r.rolname, 'fin.fn_registrar_recibo(jsonb)', 'EXECUTE') THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_adjuntar_comprobante_recibo(bigint, text, text) TO %I', r.rolname);
        END IF;
    END LOOP;
    SELECT string_agg(ro.rolname, ', ') INTO v_mal FROM pg_roles ro
     WHERE ro.rolname IN (SELECT rol_bd FROM seg.rol_aplicacion WHERE rol_bd IS NOT NULL)
       AND has_function_privilege(ro.rolname, 'fin.fn_registrar_recibo(jsonb)', 'EXECUTE')
           IS DISTINCT FROM has_function_privilege(ro.rolname, 'fin.fn_adjuntar_comprobante_recibo(bigint,text,text)', 'EXECUTE');
    IF v_mal IS NOT NULL THEN RAISE EXCEPTION 'Los permisos del comprobante no quedaron como los del recibo para: %', v_mal; END IF;
END $do$;

UPDATE ref.parametro SET valor = '279' WHERE codigo = 'web.version_base' AND valor::text::int < 279;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'migración 279 aplicada' AS que, (SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base') AS version_base;
