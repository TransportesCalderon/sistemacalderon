-- =============================================================================
-- IronTrack — 281 · Cambio 276 · Orden de pago y cuenta corriente de proveedores
-- -----------------------------------------------------------------------------
-- Pedido del usuario (19/11/2026): «se debe poder hacer un pago a cuenta» y «deberíamos ver de forma más sencilla,
-- por un lado el saldo y por otro los movimientos». Hoy solo se paga factura por factura; un pago a cuenta no
-- descuenta la deuda y la factura queda «vencida» aunque el proveedor esté pago.
--   · fin.orden_pago (OP-000001…): un pago a un proveedor, que sale de un banco o caja. Es UN movimiento de dinero
--     (egreso contra «Anticipos a proveedores»), así se concilia con una sola línea de la cartola.
--   · fin.orden_pago_aplicacion: qué parte de la orden cancela cada factura (gasto). Lo que no se aplica queda «a cuenta».
--   · fin.fn_pagado_gasto suma también lo aplicado desde órdenes de pago: «Por pagar», lo vencido y la cuenta con
--     estaciones lo descuentan solos.
--   · fin.fn_registrar_orden_pago(datos): registra la orden y la aplica (a las facturas elegidas o, si no se eligen,
--     a las más viejas del proveedor). La deuda puede estar en otra moneda que el banco (pago por Vita en CLP de una
--     deuda en ARS): se escribe cuánto se canceló en la moneda de la deuda.
--   · fin.fn_aplicar_orden_pago / fin.fn_aplicar_pagos_a_cuenta: aplicar después lo que quedó a cuenta (por ejemplo,
--     cuando llega la factura).
--   · fin.fn_adoptar_orden_pago: convierte en orden de pago un egreso que ya estaba en «Anticipos a proveedores».
--   · fin.fn_anular_orden_pago. Un movimiento que es una orden de pago no se anula suelto.
--   · fin.fn_cuenta_proveedores() y fin.fn_cuenta_proveedor(proveedor, moneda): saldo y movimientos.
-- Contabilidad: la orden es Debe Anticipos a proveedores / Haber banco; cada aplicación es Debe Proveedores /
-- Haber Anticipos a proveedores (la diferencia de cambio, aparte).
-- No cambia datos. web.version_base = 281.
-- =============================================================================
SET search_path = public, extensions;
BEGIN;

DO $do$
DECLARE v_def text;
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 275 THEN
        RAISE EXCEPTION 'Falta la migración 275 (recibos de cobranza): aplicarla antes';
    END IF;
    IF to_regclass('fin.orden_pago') IS NOT NULL THEN
        RAISE EXCEPTION 'La migración 281 (orden de pago) ya está aplicada';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM fin.cuenta_contable WHERE codigo = '1.1.06' AND eliminado_en IS NULL AND imputable) THEN
        RAISE EXCEPTION 'No encontré la cuenta 1.1.06 «Anticipos a proveedores»: avisar antes de seguir';
    END IF;
    -- origen de asiento nuevo: orden_pago (se agrega a la lista que haya)
    SELECT pg_get_constraintdef(oid) INTO v_def FROM pg_constraint WHERE conrelid = 'fin.asiento'::regclass AND conname = 'ck_as_origen';
    IF v_def IS NULL OR v_def NOT LIKE '%''movimiento''::text%' THEN RAISE EXCEPTION 'No encontré la lista de orígenes de asiento que se espera: avisar antes de seguir'; END IF;
    IF v_def NOT LIKE '%''orden_pago''%' THEN
        ALTER TABLE fin.asiento DROP CONSTRAINT ck_as_origen;
        EXECUTE 'ALTER TABLE fin.asiento ADD CONSTRAINT ck_as_origen ' || replace(v_def, '''movimiento''::text', '''movimiento''::text, ''orden_pago''::text');
    END IF;
END $do$;

-- 1 · Tablas
CREATE SEQUENCE fin.seq_orden_pago;
CREATE TABLE fin.orden_pago (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    numero           text NOT NULL,
    fecha            date NOT NULL,
    proveedor_id     bigint NOT NULL REFERENCES mae.proveedor (id) ON DELETE RESTRICT,
    cuenta_dinero_id bigint NOT NULL REFERENCES fin.cuenta_dinero (id) ON DELETE RESTRICT,
    moneda           character(3) NOT NULL REFERENCES ref.moneda (codigo) ON DELETE RESTRICT,
    monto            numeric(16,2) NOT NULL,
    movimiento_id    bigint NOT NULL REFERENCES fin.movimiento (id) ON DELETE RESTRICT,
    observacion      text,
    estado           text NOT NULL DEFAULT 'vigente',
    motivo_anulacion text,
    creado_en        timestamptz NOT NULL DEFAULT now(),
    creado_por       bigint REFERENCES seg.usuario (id) ON DELETE RESTRICT,
    CONSTRAINT ux_orden_pago_numero UNIQUE (numero),
    CONSTRAINT ux_orden_pago_movimiento UNIQUE (movimiento_id),
    CONSTRAINT ck_op_monto CHECK (monto > 0),
    CONSTRAINT ck_op_estado CHECK (estado IN ('vigente', 'anulado')),
    CONSTRAINT ck_op_anulado CHECK ((estado = 'anulado') = (nullif(btrim(motivo_anulacion), '') IS NOT NULL)),
    CONSTRAINT ck_op_observacion CHECK (observacion IS NULL OR length(observacion) <= 500)
);
COMMENT ON TABLE fin.orden_pago IS 'Migración 281: orden de pago a un proveedor. Un movimiento de dinero (fin.movimiento, egreso a Anticipos a proveedores); monto y moneda son los de la deuda que cancela.';
CREATE INDEX ix_orden_pago_proveedor ON fin.orden_pago (proveedor_id, fecha);
CREATE TRIGGER tg_08_solo_funciones BEFORE INSERT OR UPDATE OR DELETE ON fin.orden_pago
    FOR EACH ROW EXECUTE FUNCTION fin.fn_cont_solo_funciones();

CREATE TABLE fin.orden_pago_aplicacion (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    orden_pago_id bigint NOT NULL REFERENCES fin.orden_pago (id) ON DELETE RESTRICT,
    gasto_id      bigint NOT NULL REFERENCES fin.gasto (id) ON DELETE RESTRICT,
    monto         numeric(16,2) NOT NULL CHECK (monto > 0),
    creado_en     timestamptz NOT NULL DEFAULT now(),
    creado_por    bigint REFERENCES seg.usuario (id) ON DELETE RESTRICT,
    CONSTRAINT ux_op_aplicacion UNIQUE (orden_pago_id, gasto_id)
);
COMMENT ON TABLE fin.orden_pago_aplicacion IS 'Migración 281: parte de una orden de pago que cancela una factura (gasto), en la moneda de la factura.';
CREATE INDEX ix_op_aplicacion_gasto ON fin.orden_pago_aplicacion (gasto_id);
CREATE TRIGGER tg_08_solo_funciones BEFORE INSERT OR UPDATE OR DELETE ON fin.orden_pago_aplicacion
    FOR EACH ROW EXECUTE FUNCTION fin.fn_cont_solo_funciones();

DO $do$
DECLARE r record; p text; t text;
BEGIN
    REVOKE ALL ON TABLE fin.orden_pago, fin.orden_pago_aplicacion FROM PUBLIC;
    REVOKE ALL ON SEQUENCE fin.seq_orden_pago FROM PUBLIC;
    FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'tc\_%' OR rolname IN ('authenticated', 'anon') LOOP
        FOREACH p IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
            IF has_table_privilege(r.rolname, 'fin.movimiento', p) THEN
                FOREACH t IN ARRAY ARRAY['fin.orden_pago', 'fin.orden_pago_aplicacion'] LOOP
                    EXECUTE format('GRANT %s ON TABLE %s TO %I', p, t, r.rolname);
                END LOOP;
            END IF;
        END LOOP;
    END LOOP;
END $do$;

-- 2 · Lo pagado de un gasto: pagos directos + lo aplicado desde órdenes de pago
CREATE OR REPLACE FUNCTION fin.fn_pagado_gasto(p_gasto bigint, p_excluir bigint DEFAULT NULL::bigint)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT coalesce((SELECT sum(monto_documento) FROM fin.movimiento
                      WHERE gasto_id = p_gasto AND tipo = 'pago' AND estado = 'vigente' AND eliminado_en IS NULL AND id IS DISTINCT FROM p_excluir), 0)
         + coalesce((SELECT sum(a.monto) FROM fin.orden_pago_aplicacion a JOIN fin.orden_pago o ON o.id = a.orden_pago_id
                      WHERE a.gasto_id = p_gasto AND o.estado = 'vigente'), 0)
$f$;

-- Lo que le queda a cuenta a una orden de pago
CREATE FUNCTION fin.fn_orden_pago_disponible(p_op bigint)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT CASE WHEN o.estado <> 'vigente' THEN 0
                ELSE o.monto - coalesce((SELECT sum(a.monto) FROM fin.orden_pago_aplicacion a WHERE a.orden_pago_id = o.id), 0) END
      FROM fin.orden_pago o WHERE o.id = p_op
$f$;

-- 3 · Contabilidad de una aplicación: Debe Proveedores / Haber Anticipos a proveedores
CREATE FUNCTION fin.fn_contabilizar_aplicacion_pago(p_apl bigint)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE a fin.orden_pago_aplicacion%ROWTYPE; o fin.orden_pago%ROWTYPE; g fin.gasto%ROWTYPE; m fin.movimiento%ROWTYPE; cd fin.cuenta_dinero%ROWTYPE;
        v_doc numeric; v_ant numeric; v_dif smallint := fin.fn_cuenta_uso('DIF_CAMBIO'); v_prov text;
BEGIN
    SELECT * INTO a FROM fin.orden_pago_aplicacion WHERE id = p_apl;
    IF NOT FOUND THEN PERFORM fin.fn_grabar_asiento('orden_pago', p_apl, current_date, '', '[]'); RETURN; END IF;
    SELECT * INTO o FROM fin.orden_pago WHERE id = a.orden_pago_id;
    SELECT * INTO g FROM fin.gasto WHERE id = a.gasto_id;
    SELECT * INTO m FROM fin.movimiento WHERE id = o.movimiento_id;
    SELECT * INTO cd FROM fin.cuenta_dinero WHERE id = m.cuenta_dinero_id;
    IF o.estado <> 'vigente' OR g.estado = 'anulado' OR g.eliminado_en IS NOT NULL THEN
        PERFORM fin.fn_grabar_asiento('orden_pago', p_apl, current_date, '', '[]'); RETURN;
    END IF;
    SELECT razon_social INTO v_prov FROM mae.proveedor WHERE id = o.proveedor_id;
    v_doc := round(a.monto * g.tc_clp, 0);                                                              -- lo que baja de Proveedores (al cambio de la factura)
    v_ant := round(round(m.monto * fin.fn_tc_clp(cd.moneda, m.fecha), 0) * a.monto / o.monto, 0);       -- la parte del anticipo que se usa
    PERFORM fin.fn_grabar_asiento('orden_pago', a.id, greatest(o.fecha, g.fecha),
        o.numero || ' aplicada a ' || g.numero || ' · ' || coalesce(v_prov, ''),
        jsonb_build_array(fin.fn_linea(fin.fn_cuenta_uso('CXP'), v_doc, 0, v_prov, NULL, 'proveedor', o.proveedor_id),
                          fin.fn_linea(m.cuenta_id, 0, v_ant, v_prov, NULL, 'proveedor', o.proveedor_id),
                          fin.fn_linea(v_dif, greatest(v_ant - v_doc, 0), greatest(v_doc - v_ant, 0))));
END $f$;

-- 4 · Aplicar una orden de pago a una factura
CREATE FUNCTION fin.fn_aplicar_orden_pago(p_op bigint, p_gasto bigint, p_monto numeric DEFAULT NULL)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_usr bigint := fin.fn_exigir_finanzas(); o fin.orden_pago%ROWTYPE; g fin.gasto%ROWTYPE; v_disp numeric; v_saldo numeric; v_m numeric; v_id bigint;
BEGIN
    PERFORM set_config('fin.cont_fn', '1', true);
    SELECT * INTO o FROM fin.orden_pago WHERE id = p_op FOR UPDATE;
    IF NOT FOUND OR o.estado <> 'vigente' THEN RAISE EXCEPTION 'La orden de pago no existe o está anulada' USING ERRCODE = 'P0002'; END IF;
    SELECT * INTO g FROM fin.gasto WHERE id = p_gasto AND eliminado_en IS NULL FOR UPDATE;
    IF NOT FOUND OR g.estado = 'anulado' THEN RAISE EXCEPTION 'La factura no existe o está anulada' USING ERRCODE = 'P0002'; END IF;
    IF g.proveedor_id IS DISTINCT FROM o.proveedor_id THEN RAISE EXCEPTION 'La factura es de otro proveedor' USING ERRCODE = '22023'; END IF;
    IF g.moneda <> o.moneda THEN RAISE EXCEPTION 'La factura está en % y la orden de pago en %', g.moneda, o.moneda USING ERRCODE = '22023'; END IF;
    v_disp := fin.fn_orden_pago_disponible(o.id);
    v_saldo := fin.fn_saldo_gasto(g.id);
    v_m := round(coalesce(p_monto, least(v_disp, v_saldo)), 2);
    IF v_m IS NULL OR v_m <= 0 THEN RAISE EXCEPTION 'No hay nada para aplicar (a cuenta %, falta pagar %)', v_disp, v_saldo USING ERRCODE = '22023'; END IF;
    IF v_m > v_disp THEN RAISE EXCEPTION 'A la orden % le quedan % % a cuenta', o.numero, v_disp, o.moneda USING ERRCODE = '22023'; END IF;
    IF v_m > v_saldo THEN RAISE EXCEPTION 'A la factura le falta pagar % %', v_saldo, g.moneda USING ERRCODE = '22023'; END IF;
    INSERT INTO fin.orden_pago_aplicacion (orden_pago_id, gasto_id, monto, creado_por) VALUES (o.id, g.id, v_m, v_usr)
    ON CONFLICT (orden_pago_id, gasto_id) DO UPDATE SET monto = fin.orden_pago_aplicacion.monto + EXCLUDED.monto
    RETURNING id INTO v_id;
    PERFORM fin.fn_contabilizar_aplicacion_pago(v_id);
    RETURN v_m;
END $f$;

-- Aplica lo que haya a cuenta de un proveedor a sus facturas impagas, de la más vieja a la más nueva
CREATE FUNCTION fin.fn_aplicar_pagos_a_cuenta(p_proveedor bigint)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE o record; g record; n integer := 0;
BEGIN
    PERFORM fin.fn_exigir_finanzas();
    FOR o IN SELECT x.id, x.moneda FROM fin.orden_pago x WHERE x.proveedor_id = p_proveedor AND x.estado = 'vigente' AND fin.fn_orden_pago_disponible(x.id) > 0 ORDER BY x.fecha, x.id LOOP
        FOR g IN SELECT y.id FROM fin.gasto y WHERE y.proveedor_id = p_proveedor AND y.moneda = o.moneda AND y.estado = 'vigente' AND y.eliminado_en IS NULL
                    AND fin.fn_saldo_gasto(y.id) > 0 ORDER BY y.vence, y.id LOOP
            EXIT WHEN fin.fn_orden_pago_disponible(o.id) <= 0;
            PERFORM fin.fn_aplicar_orden_pago(o.id, g.id, NULL);
            n := n + 1;
        END LOOP;
    END LOOP;
    RETURN n;
END $f$;

-- 5 · Registrar una orden de pago
CREATE FUNCTION fin.fn_registrar_orden_pago(p_datos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_usr bigint := fin.fn_exigir_finanzas(); cd fin.cuenta_dinero%ROWTYPE; v_prov bigint := nullif(p_datos ->> 'proveedor_id', '')::bigint; v_nom text;
        v_fecha date := (p_datos ->> 'fecha')::date; v_monto numeric := nullif(p_datos ->> 'monto', '')::numeric;
        v_moneda text := upper(nullif(btrim(p_datos ->> 'moneda'), '')); v_deuda numeric := nullif(p_datos ->> 'monto_deuda', '')::numeric;
        v_obs text := nullif(btrim(p_datos ->> 'observacion'), ''); v_num text; v_mov bigint; v_id bigint; v_ant smallint; x jsonb;
BEGIN
    PERFORM set_config('fin.cont_fn', '1', true);
    SELECT razon_social INTO v_nom FROM mae.proveedor WHERE id = v_prov AND eliminado_en IS NULL;
    IF v_nom IS NULL THEN RAISE EXCEPTION 'Elegí el proveedor' USING ERRCODE = '22023'; END IF;
    SELECT * INTO cd FROM fin.cuenta_dinero WHERE id = nullif(p_datos ->> 'cuenta_dinero_id', '')::bigint AND eliminado_en IS NULL AND activa;
    IF NOT FOUND THEN RAISE EXCEPTION 'Elegí de qué banco o caja sale el pago' USING ERRCODE = '22023'; END IF;
    IF v_fecha IS NULL OR v_fecha > mae.fn_hoy() + 1 THEN RAISE EXCEPTION 'Elegí la fecha del pago (no futura)' USING ERRCODE = '22023'; END IF;
    IF v_monto IS NULL OR v_monto <= 0 THEN RAISE EXCEPTION 'Escribí cuánto salió del banco o de la caja' USING ERRCODE = '22023'; END IF;
    v_moneda := coalesce(v_moneda, cd.moneda);
    IF NOT EXISTS (SELECT 1 FROM ref.moneda WHERE codigo = v_moneda) THEN RAISE EXCEPTION 'La moneda % no existe', v_moneda USING ERRCODE = '22023'; END IF;
    IF v_moneda = cd.moneda THEN
        v_deuda := v_monto;
    ELSIF v_deuda IS NULL OR v_deuda <= 0 THEN
        RAISE EXCEPTION 'El pago sale en % y la deuda está en %: escribí cuánto se canceló en %', cd.moneda, v_moneda, v_moneda USING ERRCODE = '22023';
    END IF;
    IF coalesce(length(v_obs), 0) > 500 THEN RAISE EXCEPTION 'La observación es demasiado larga' USING ERRCODE = '22023'; END IF;
    SELECT c.id INTO v_ant FROM fin.cuenta_contable c WHERE c.codigo = '1.1.06' AND c.eliminado_en IS NULL;
    v_num := 'OP-' || lpad(nextval('fin.seq_orden_pago')::text, 6, '0');
    v_mov := fin.fn_movimiento_de_origen(NULL, NULL, 'egreso', v_fecha, cd.id, v_monto, v_ant,
                 v_num || ' · Orden de pago a ' || v_nom || CASE WHEN v_moneda <> cd.moneda THEN format(' (%s %s)', v_moneda, round(v_deuda, 2)) ELSE '' END, 'proveedor', v_prov);
    INSERT INTO fin.orden_pago (numero, fecha, proveedor_id, cuenta_dinero_id, moneda, monto, movimiento_id, observacion, creado_por)
    VALUES (v_num, v_fecha, v_prov, cd.id, v_moneda, round(v_deuda, 2), v_mov, v_obs, v_usr) RETURNING id INTO v_id;
    -- A qué facturas: las elegidas, en ese orden; si no se eligieron, las más viejas
    IF jsonb_typeof(p_datos -> 'gastos') = 'array' AND jsonb_array_length(p_datos -> 'gastos') > 0 THEN
        FOR x IN SELECT e FROM jsonb_array_elements(p_datos -> 'gastos') e LOOP
            EXIT WHEN fin.fn_orden_pago_disponible(v_id) <= 0;
            PERFORM fin.fn_aplicar_orden_pago(v_id, (x #>> '{}')::bigint, NULL);
        END LOOP;
    ELSIF coalesce((p_datos ->> 'aplicar')::boolean, true) THEN
        PERFORM fin.fn_aplicar_pagos_a_cuenta(v_prov);
    END IF;
    RETURN jsonb_build_object('id', v_id, 'numero', v_num, 'movimiento_id', v_mov, 'a_cuenta', fin.fn_orden_pago_disponible(v_id));
END $f$;

-- Un egreso que ya estaba en «Anticipos a proveedores» pasa a ser una orden de pago de ese proveedor
CREATE FUNCTION fin.fn_adoptar_orden_pago(p_movimiento bigint, p_proveedor bigint, p_moneda text DEFAULT NULL, p_monto_deuda numeric DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_usr bigint := fin.fn_exigir_finanzas(); m fin.movimiento%ROWTYPE; cd fin.cuenta_dinero%ROWTYPE; v_nom text; v_num text; v_id bigint; v_moneda text; v_deuda numeric;
BEGIN
    PERFORM set_config('fin.cont_fn', '1', true);
    SELECT * INTO m FROM fin.movimiento WHERE id = p_movimiento AND eliminado_en IS NULL FOR UPDATE;
    IF NOT FOUND OR m.estado <> 'vigente' OR m.tipo <> 'egreso' OR m.origen IS NOT NULL
       OR m.cuenta_id IS DISTINCT FROM (SELECT c.id FROM fin.cuenta_contable c WHERE c.codigo = '1.1.06' AND c.eliminado_en IS NULL) THEN
        RAISE EXCEPTION 'Ese movimiento no es un egreso vigente a «Anticipos a proveedores»' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM fin.orden_pago WHERE movimiento_id = m.id) THEN RAISE EXCEPTION 'Ese movimiento ya es una orden de pago' USING ERRCODE = '23505'; END IF;
    SELECT razon_social INTO v_nom FROM mae.proveedor WHERE id = p_proveedor AND eliminado_en IS NULL;
    IF v_nom IS NULL THEN RAISE EXCEPTION 'Elegí el proveedor' USING ERRCODE = '22023'; END IF;
    SELECT * INTO cd FROM fin.cuenta_dinero WHERE id = m.cuenta_dinero_id;
    v_moneda := coalesce(upper(nullif(btrim(p_moneda), '')), cd.moneda);
    v_deuda := CASE WHEN v_moneda = cd.moneda THEN m.monto ELSE p_monto_deuda END;
    IF v_deuda IS NULL OR v_deuda <= 0 THEN RAISE EXCEPTION 'Escribí cuánto se canceló en %', v_moneda USING ERRCODE = '22023'; END IF;
    v_num := 'OP-' || lpad(nextval('fin.seq_orden_pago')::text, 6, '0');
    UPDATE fin.movimiento SET tercero_tipo = 'proveedor', tercero_id = p_proveedor, descripcion = left(v_num || ' · Orden de pago a ' || v_nom || ' · ' || coalesce(descripcion, ''), 200) WHERE id = m.id;
    INSERT INTO fin.orden_pago (numero, fecha, proveedor_id, cuenta_dinero_id, moneda, monto, movimiento_id, observacion, creado_por)
    VALUES (v_num, m.fecha, p_proveedor, cd.id, v_moneda, round(v_deuda, 2), m.id, 'Pago a cuenta que ya estaba registrado', v_usr) RETURNING id INTO v_id;
    PERFORM fin.fn_aplicar_pagos_a_cuenta(p_proveedor);
    RETURN jsonb_build_object('id', v_id, 'numero', v_num, 'a_cuenta', fin.fn_orden_pago_disponible(v_id));
END $f$;

-- 6 · Anular
CREATE FUNCTION fin.fn_anular_orden_pago(p_op bigint, p_motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE o fin.orden_pago%ROWTYPE; a record;
BEGIN
    PERFORM fin.fn_exigir_finanzas();
    PERFORM set_config('fin.cont_fn', '1', true);
    IF nullif(btrim(p_motivo), '') IS NULL THEN RAISE EXCEPTION 'Escribí por qué se anula' USING ERRCODE = '22023'; END IF;
    SELECT * INTO o FROM fin.orden_pago WHERE id = p_op FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'La orden de pago no existe' USING ERRCODE = 'P0002'; END IF;
    IF o.estado = 'anulado' THEN RAISE EXCEPTION 'La orden de pago ya está anulada' USING ERRCODE = '55000'; END IF;
    FOR a IN SELECT id FROM fin.orden_pago_aplicacion WHERE orden_pago_id = o.id LOOP
        DELETE FROM fin.orden_pago_aplicacion WHERE id = a.id;
        PERFORM fin.fn_contabilizar_aplicacion_pago(a.id);
    END LOOP;
    UPDATE fin.orden_pago SET estado = 'anulado', motivo_anulacion = left(btrim(p_motivo), 500) WHERE id = o.id;
    PERFORM set_config('fin.op_fn', '1', true);
    PERFORM fin.fn_anular_movimiento(o.movimiento_id, p_motivo);
    PERFORM set_config('fin.op_fn', '', true);
END $f$;

-- El movimiento de una orden de pago no se anula suelto (quedarían facturas pagadas con plata que no salió)
CREATE FUNCTION fin.tg_movimiento_de_orden_pago()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_num text;
BEGIN
    IF NEW.estado = 'anulado' AND OLD.estado = 'vigente' AND coalesce(current_setting('fin.op_fn', true), '') <> '1' THEN
        SELECT numero INTO v_num FROM fin.orden_pago WHERE movimiento_id = OLD.id AND estado = 'vigente';
        IF v_num IS NOT NULL THEN
            RAISE EXCEPTION 'Este movimiento es la orden de pago %: se anula desde Cobros y pagos › Por pagar', v_num USING ERRCODE = '55000';
        END IF;
    END IF;
    RETURN NEW;
END $f$;
CREATE TRIGGER tg_12_orden_pago BEFORE UPDATE OF estado ON fin.movimiento
    FOR EACH ROW EXECUTE FUNCTION fin.tg_movimiento_de_orden_pago();

-- 7 · Lectura: la cuenta corriente de cada proveedor
CREATE FUNCTION fin.fn_cuenta_proveedores()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
BEGIN
    PERFORM fin.fn_exigir_lectura_finanzas();
    RETURN coalesce((
        WITH fac AS (
            SELECT g.proveedor_id, g.moneda::text AS moneda, count(*) AS n, sum(fin.fn_saldo_gasto(g.id)) AS saldo,
                   sum(fin.fn_saldo_gasto(g.id)) FILTER (WHERE g.vence < mae.fn_hoy()) AS vencido
              FROM fin.gasto g
             WHERE g.proveedor_id IS NOT NULL AND g.estado = 'vigente' AND g.eliminado_en IS NULL AND fin.fn_saldo_gasto(g.id) > 0
             GROUP BY 1, 2),
        car AS (
            SELECT e.proveedor_id, c.moneda::text AS moneda, count(*) AS n, coalesce(sum(c.importe_original), 0) AS importe
              FROM fue.carga_combustible c JOIN mae.estacion_servicio e ON e.id = c.estacion_id
             WHERE e.proveedor_id IS NOT NULL AND c.estado_validacion <> 'anulada' AND c.eliminado_en IS NULL
               AND (fin.fn_medio_de_carga(c.medio_pago, e.proveedor_id)).tipo = 'factura_posterior'
               AND NOT EXISTS (SELECT 1 FROM fin.gasto_carga gc WHERE gc.carga_id = c.id)
             GROUP BY 1, 2),
        ant AS (
            SELECT o.proveedor_id, o.moneda::text AS moneda, count(*) AS n, sum(fin.fn_orden_pago_disponible(o.id)) AS disponible
              FROM fin.orden_pago o WHERE o.estado = 'vigente' AND fin.fn_orden_pago_disponible(o.id) > 0 GROUP BY 1, 2),
        k AS (SELECT proveedor_id, moneda FROM fac UNION SELECT proveedor_id, moneda FROM car UNION SELECT proveedor_id, moneda FROM ant)
        SELECT jsonb_agg(jsonb_build_object(
                   'proveedor_id', k.proveedor_id, 'proveedor', p.razon_social, 'moneda', k.moneda,
                   'facturas', coalesce(fac.n, 0), 'facturas_saldo', coalesce(fac.saldo, 0),
                   'cargas', coalesce(car.n, 0), 'cargas_importe', coalesce(car.importe, 0),
                   'a_cuenta', coalesce(ant.disponible, 0),
                   'saldo', coalesce(fac.saldo, 0) + coalesce(car.importe, 0) - coalesce(ant.disponible, 0),
                   'vencido', greatest(coalesce(fac.vencido, 0) - coalesce(ant.disponible, 0), 0))
               ORDER BY p.razon_social, k.moneda)
          FROM k JOIN mae.proveedor p ON p.id = k.proveedor_id
          LEFT JOIN fac ON fac.proveedor_id = k.proveedor_id AND fac.moneda = k.moneda
          LEFT JOIN car ON car.proveedor_id = k.proveedor_id AND car.moneda = k.moneda
          LEFT JOIN ant ON ant.proveedor_id = k.proveedor_id AND ant.moneda = k.moneda), '[]');
END $f$;

CREATE FUNCTION fin.fn_cuenta_proveedor(p_proveedor bigint, p_moneda text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_mon text := upper(p_moneda);
BEGIN
    PERFORM fin.fn_exigir_lectura_finanzas();
    RETURN (
        WITH mov AS (
            -- facturas (suben la deuda)
            SELECT g.fecha, 1 AS orden, g.id AS ref, 'factura'::text AS tipo, g.numero,
                   coalesce(nullif(g.numero_documento, '') || ' · ', '') || g.descripcion AS detalle, g.total AS debe, 0::numeric AS haber,
                   g.vence, fin.fn_saldo_gasto(g.id) AS pendiente, NULL::text AS cuenta, NULL::bigint AS gasto_id, NULL::bigint AS orden_pago_id
              FROM fin.gasto g
             WHERE g.proveedor_id = p_proveedor AND g.moneda = v_mon AND g.estado = 'vigente' AND g.eliminado_en IS NULL
            UNION ALL
            -- pagos hechos directo sobre una factura
            SELECT m.fecha, 2, m.id, 'pago', m.numero, 'Pago de ' || g.numero, 0, m.monto_documento, NULL, NULL, cd.nombre, g.id, NULL
              FROM fin.movimiento m JOIN fin.gasto g ON g.id = m.gasto_id JOIN fin.cuenta_dinero cd ON cd.id = m.cuenta_dinero_id
             WHERE m.tipo = 'pago' AND m.estado = 'vigente' AND m.eliminado_en IS NULL
               AND g.proveedor_id = p_proveedor AND g.moneda = v_mon AND g.estado = 'vigente' AND g.eliminado_en IS NULL
            UNION ALL
            -- órdenes de pago
            SELECT o.fecha, 3, o.id, 'orden_pago', o.numero,
                   coalesce(o.observacion, 'Orden de pago') || coalesce(' · aplicada a ' || (SELECT string_agg(g.numero, ', ' ORDER BY g.numero)
                       FROM fin.orden_pago_aplicacion a JOIN fin.gasto g ON g.id = a.gasto_id WHERE a.orden_pago_id = o.id), ''),
                   0, o.monto, NULL, fin.fn_orden_pago_disponible(o.id), cd.nombre, NULL, o.id
              FROM fin.orden_pago o JOIN fin.cuenta_dinero cd ON cd.id = o.cuenta_dinero_id
             WHERE o.proveedor_id = p_proveedor AND o.moneda = v_mon AND o.estado = 'vigente'
            UNION ALL
            -- cargas de combustible sin factura (deuda que todavía no tiene papel)
            SELECT (c.fecha_hora AT TIME ZONE 'America/Argentina/Mendoza')::date, 0, c.id, 'carga', 'Carga ' || c.id,
                   e.nombre || coalesce(' · ' || cm.patente, '') || ' · ' || c.litros || ' L (sin factura)', coalesce(c.importe_original, 0), 0, NULL, NULL, NULL, NULL, NULL
              FROM fue.carga_combustible c JOIN mae.estacion_servicio e ON e.id = c.estacion_id LEFT JOIN mae.camion cm ON cm.id = c.camion_id
             WHERE e.proveedor_id = p_proveedor AND c.moneda = v_mon AND c.estado_validacion <> 'anulada' AND c.eliminado_en IS NULL
               AND (fin.fn_medio_de_carga(c.medio_pago, e.proveedor_id)).tipo = 'factura_posterior'
               AND NOT EXISTS (SELECT 1 FROM fin.gasto_carga gc WHERE gc.carga_id = c.id)),
        con AS (SELECT mov.*, sum(debe - haber) OVER (ORDER BY fecha, orden, ref) AS saldo FROM mov)
        SELECT jsonb_build_object(
                   'proveedor_id', p_proveedor, 'proveedor', (SELECT razon_social FROM mae.proveedor WHERE id = p_proveedor), 'moneda', v_mon,
                   'saldo', coalesce((SELECT sum(debe - haber) FROM mov), 0),
                   'a_cuenta', coalesce((SELECT sum(pendiente) FROM mov WHERE tipo = 'orden_pago'), 0),
                   'movimientos', coalesce((SELECT jsonb_agg(jsonb_build_object('tipo', tipo, 'id', ref, 'fecha', fecha, 'numero', numero, 'detalle', detalle,
                                       'debe', debe, 'haber', haber, 'saldo', saldo, 'vence', vence, 'pendiente', pendiente, 'cuenta', cuenta,
                                       'gasto_id', gasto_id, 'orden_pago_id', orden_pago_id) ORDER BY fecha DESC, orden DESC, ref DESC) FROM con), '[]')));
END $f$;

-- 8 · Permisos: escribir como fin.fn_registrar_movimiento, leer como fin.fn_por_pagar
DO $do$
DECLARE r record; f text;
BEGIN
    FOREACH f IN ARRAY ARRAY['fin.fn_registrar_orden_pago(jsonb)', 'fin.fn_aplicar_orden_pago(bigint, bigint, numeric)', 'fin.fn_aplicar_pagos_a_cuenta(bigint)',
                             'fin.fn_adoptar_orden_pago(bigint, bigint, text, numeric)', 'fin.fn_anular_orden_pago(bigint, text)',
                             'fin.fn_cuenta_proveedores()', 'fin.fn_cuenta_proveedor(bigint, text)', 'fin.fn_contabilizar_aplicacion_pago(bigint)',
                             'fin.fn_orden_pago_disponible(bigint)'] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    END LOOP;
    FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'tc\_%' OR rolname = 'authenticated' LOOP
        IF has_function_privilege(r.rolname, 'fin.fn_registrar_movimiento(jsonb)', 'EXECUTE') THEN
            FOREACH f IN ARRAY ARRAY['fin.fn_registrar_orden_pago(jsonb)', 'fin.fn_aplicar_orden_pago(bigint, bigint, numeric)', 'fin.fn_aplicar_pagos_a_cuenta(bigint)',
                                     'fin.fn_adoptar_orden_pago(bigint, bigint, text, numeric)', 'fin.fn_anular_orden_pago(bigint, text)'] LOOP
                EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', f, r.rolname);
            END LOOP;
        END IF;
        IF has_function_privilege(r.rolname, 'fin.fn_por_pagar()', 'EXECUTE') THEN
            FOREACH f IN ARRAY ARRAY['fin.fn_cuenta_proveedores()', 'fin.fn_cuenta_proveedor(bigint, text)', 'fin.fn_orden_pago_disponible(bigint)'] LOOP
                EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', f, r.rolname);
            END LOOP;
        END IF;
    END LOOP;
END $do$;

UPDATE ref.parametro SET valor = '281' WHERE codigo = 'web.version_base' AND valor::text::int < 281;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'migración 281 aplicada' AS que, (SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base') AS version_base;
