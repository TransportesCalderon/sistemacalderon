-- Finanzas · Pagar un gasto con recargos por atraso (interés por mora, gastos de cobranza y otros)
-- Pedido de Gerencia (17/11/2026). NO cambia web.version_base. Se puede correr más de una vez.
-- Al registrar el pago de un gasto (por ejemplo, una cuota de leasing) se pueden cargar los recargos que cobró el banco.
-- Cada recargo queda como un gasto aparte, unido a la cuota, pagado el mismo día desde la misma cuenta.
-- Así se ve cuánto fue la cuota y cuánto costó el atraso. El pago normal (sin recargos) sigue igual.

BEGIN;

ALTER TABLE fin.gasto ADD COLUMN IF NOT EXISTS recargo_de_id bigint REFERENCES fin.gasto(id);
ALTER TABLE fin.gasto ADD COLUMN IF NOT EXISTS recargo_tipo text;
COMMENT ON COLUMN fin.gasto.recargo_de_id IS 'Si este gasto es un recargo por atraso (mora, cobranza, otros), el gasto original al que corresponde.';
DO $do$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_gasto_recargo') THEN
        ALTER TABLE fin.gasto ADD CONSTRAINT ck_gasto_recargo
            CHECK ((recargo_de_id IS NULL) = (recargo_tipo IS NULL) AND (recargo_tipo IS NULL OR recargo_tipo IN ('mora', 'cobranza', 'otros')));
    END IF;
END $do$;
CREATE INDEX IF NOT EXISTS ix_gasto_recargo_de ON fin.gasto (recargo_de_id) WHERE recargo_de_id IS NOT NULL;

-- A qué categoría (cuenta) va cada recargo: el código de la cuenta. Vacío = la misma categoría del gasto original.
INSERT INTO ref.parametro (codigo, valor, descripcion) VALUES
 ('fin.recargo_cuenta_mora',     '""', 'Código de la cuenta contable para el interés por mora al pagar un gasto atrasado. Vacío = la misma cuenta del gasto.'),
 ('fin.recargo_cuenta_cobranza', '""', 'Código de la cuenta contable para los gastos de cobranza al pagar un gasto atrasado. Vacío = la misma cuenta del gasto.'),
 ('fin.recargo_cuenta_otros',    '""', 'Código de la cuenta contable para otros recargos al pagar un gasto atrasado. Vacío = la misma cuenta del gasto.')
ON CONFLICT (codigo) DO NOTHING;

CREATE OR REPLACE FUNCTION fin.fn_pagar_gasto_con_recargos(p_datos jsonb)
 RETURNS jsonb LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
    g fin.gasto%ROWTYPE; cd fin.cuenta_dinero%ROWTYPE; v_fecha date := (p_datos ->> 'fecha')::date;
    v_pago bigint; r record; v_imp numeric; v_cuenta smallint; m record; v_id bigint; v_recargos jsonb := '[]'; v_total numeric := 0;
    v_det text := nullif(btrim(p_datos ->> 'otros_detalle'), '');
BEGIN
    PERFORM fin.fn_exigir_finanzas();
    SELECT * INTO g FROM fin.gasto WHERE id = (p_datos ->> 'gasto_id')::bigint AND eliminado_en IS NULL;
    IF NOT FOUND OR g.estado = 'anulado' THEN RAISE EXCEPTION 'Elegí el gasto que se paga' USING ERRCODE = '22023'; END IF;
    IF g.recargo_de_id IS NOT NULL THEN RAISE EXCEPTION 'Ese gasto ya es un recargo: pagalo sin recargos' USING ERRCODE = '22023'; END IF;
    SELECT * INTO cd FROM fin.cuenta_dinero WHERE id = (p_datos ->> 'cuenta_dinero_id')::bigint AND eliminado_en IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Elegí la cuenta (banco o caja)' USING ERRCODE = '22023'; END IF;

    -- Controles de los recargos antes de registrar nada
    FOR r IN SELECT * FROM (VALUES ('mora'), ('cobranza'), ('otros')) x(tipo) LOOP
        v_imp := nullif(p_datos ->> r.tipo, '')::numeric;
        IF v_imp IS NOT NULL AND v_imp < 0 THEN RAISE EXCEPTION 'Los recargos no pueden ser negativos' USING ERRCODE = '22023'; END IF;
        v_total := v_total + coalesce(v_imp, 0);
    END LOOP;
    IF v_total > 0 AND cd.moneda <> g.moneda THEN
        RAISE EXCEPTION 'Los recargos se cargan en la moneda del gasto (%): elegí una cuenta en esa moneda', g.moneda USING ERRCODE = '22023';
    END IF;
    IF coalesce(nullif(p_datos ->> 'otros', '')::numeric, 0) > 0 AND v_det IS NULL THEN
        RAISE EXCEPTION 'Escribí de qué son los otros recargos' USING ERRCODE = '23502';
    END IF;

    -- 1) El pago del gasto, como siempre
    v_pago := fin.fn_registrar_movimiento_interno(jsonb_build_object('tipo', 'pago', 'fecha', v_fecha, 'cuenta_dinero_id', cd.id,
                  'monto', p_datos ->> 'monto', 'gasto_id', g.id, 'monto_documento', p_datos ->> 'monto_documento'));

    -- 2) Cada recargo: un gasto aparte, unido al original y pagado en el mismo momento
    FOR r IN SELECT * FROM (VALUES ('mora', 'Interés por mora', 'fin.recargo_cuenta_mora'),
                                   ('cobranza', 'Gastos de cobranza', 'fin.recargo_cuenta_cobranza'),
                                   ('otros', 'Otros recargos', 'fin.recargo_cuenta_otros')) x(tipo, nombre, parametro) LOOP
        v_imp := round(coalesce(nullif(p_datos ->> r.tipo, '')::numeric, 0), CASE WHEN g.moneda = 'CLP' THEN 0 ELSE 2 END);
        CONTINUE WHEN v_imp <= 0;
        SELECT c.id INTO v_cuenta FROM fin.cuenta_contable c
         WHERE c.codigo = nullif(btrim(ref.fn_parametro_texto(r.parametro, '')), '') AND c.imputable AND c.activa AND c.eliminado_en IS NULL;
        v_cuenta := coalesce(v_cuenta, g.cuenta_id);
        SELECT * INTO m FROM fin.fn_montos_gasto('sin_documento', g.moneda::text, v_imp, 0, v_imp);
        PERFORM set_config('fin.cont_fn', '1', true);
        INSERT INTO fin.gasto (fecha, proveedor_id, proveedor_nombre, tipo_documento, numero_documento, descripcion, cuenta_id, camion_id, moneda,
                               exento, neto, iva, retencion, total, tc_clp, vence, recargo_de_id, recargo_tipo)
        VALUES (v_fecha, g.proveedor_id, g.proveedor_nombre, 'sin_documento', NULL,
                left(r.nombre || CASE WHEN r.tipo = 'otros' THEN ' (' || v_det || ')' ELSE '' END || ' · ' || g.descripcion || ' · ' || g.numero, 300),
                v_cuenta, g.camion_id, g.moneda, m.exento, m.neto, m.iva, m.retencion, m.total, fin.fn_tc_clp(g.moneda::text, v_fecha), v_fecha, g.id, r.tipo)
        RETURNING id INTO v_id;
        PERFORM fin.fn_registrar_movimiento_interno(jsonb_build_object('tipo', 'pago', 'fecha', v_fecha, 'cuenta_dinero_id', cd.id,
                    'monto', v_imp, 'gasto_id', v_id, 'monto_documento', v_imp));
        v_recargos := v_recargos || jsonb_build_object('tipo', r.tipo, 'gasto_id', v_id, 'importe', v_imp);
    END LOOP;
    RETURN jsonb_build_object('movimiento_id', v_pago, 'recargos', v_recargos, 'total_recargos', v_total);
END $function$;

REVOKE ALL ON FUNCTION fin.fn_pagar_gasto_con_recargos(jsonb) FROM PUBLIC;
DO $do$
DECLARE r record;
BEGIN
    FOR r IN SELECT rolname FROM pg_roles WHERE NOT rolsuper AND rolname LIKE 'tc\_%' AND has_function_privilege(oid, 'fin.fn_registrar_movimiento(jsonb)', 'EXECUTE') LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_pagar_gasto_con_recargos(jsonb) TO %I', r.rolname);
    END LOOP;
    IF NOT has_function_privilege('tc_admin', 'fin.fn_pagar_gasto_con_recargos(jsonb)', 'EXECUTE') THEN RAISE EXCEPTION 'Faltó el permiso de la web'; END IF;
END $do$;

COMMIT;
