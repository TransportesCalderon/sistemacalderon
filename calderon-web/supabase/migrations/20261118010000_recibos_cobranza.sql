-- =============================================================================
-- IronTrack — 275 · Cambio 269 · Recibos de cobranza con varias facturas
-- -----------------------------------------------------------------------------
-- Pedido del usuario (18/11/2026): poder hacer un recibo de cobranza eligiendo más de una
-- factura, y que esas facturas queden asociadas al recibo.
--   · fin.recibo_cobro: el recibo (RC-000001…), con su fecha, el cliente, el banco o caja
--     donde entró y una observación. Solo se escribe desde las funciones de Finanzas.
--   · fin.movimiento.recibo_id: cada factura del recibo se cobra como siempre (un cobro por
--     factura, con su asiento) y ese cobro queda unido al recibo.
--   · fin.fn_registrar_recibo(datos): arma el recibo y cobra cada factura con
--     fin.fn_registrar_movimiento_interno (mismos controles que un cobro suelto: fecha, saldo
--     de la factura, cuenta). Si una factura falla, no se guarda nada. Todas las facturas tienen
--     que ser del mismo cliente y de la moneda de la cuenta.
--   · fin.fn_anular_recibo(recibo, motivo): anula los cobros del recibo (las facturas vuelven a
--     quedar por cobrar) y el recibo.
--   · fin.fn_recibos(desde, hasta): la lista, con las facturas de cada recibo.
--   · fin.fn_cambiar_fecha_cobro (migración 273): un cobro que es parte de un recibo no se
--     cambia de fecha suelto (se anula el recibo y se hace de nuevo).
-- Lo hacen Finanzas y TI, como los cobros. No cambia datos. web.version_base = 275.
-- =============================================================================
SET search_path = public, extensions;
BEGIN;

DO $do$
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 274 THEN
        RAISE EXCEPTION 'Falta la migración 274 (cuenta corriente con estaciones): aplicarla antes';
    END IF;
    IF to_regclass('fin.recibo_cobro') IS NOT NULL THEN
        RAISE EXCEPTION 'La migración 275 (recibos de cobranza) ya está aplicada';
    END IF;
    IF to_regprocedure('fin.fn_registrar_movimiento_interno(jsonb)') IS NULL OR to_regprocedure('fin.fn_cambiar_fecha_cobro(bigint,date,text)') IS NULL THEN
        RAISE EXCEPTION 'No encontré las funciones de cobros que se esperan: avisar antes de seguir';
    END IF;
END $do$;

-- 1 · El recibo
CREATE SEQUENCE fin.seq_recibo_cobro;
CREATE TABLE fin.recibo_cobro (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    numero           text NOT NULL DEFAULT ('RC-' || lpad(nextval('fin.seq_recibo_cobro')::text, 6, '0')),
    fecha            date NOT NULL,
    cliente_id       bigint NOT NULL REFERENCES mae.cliente (id) ON DELETE RESTRICT,
    cuenta_dinero_id bigint NOT NULL REFERENCES fin.cuenta_dinero (id) ON DELETE RESTRICT,
    moneda           character(3) NOT NULL REFERENCES ref.moneda (codigo) ON DELETE RESTRICT,
    observacion      text,
    estado           text NOT NULL DEFAULT 'vigente',
    motivo_anulacion text,
    creado_en        timestamptz NOT NULL DEFAULT now(),
    creado_por       bigint REFERENCES seg.usuario (id) ON DELETE RESTRICT,
    actualizado_en   timestamptz NOT NULL DEFAULT now(),
    actualizado_por  bigint REFERENCES seg.usuario (id) ON DELETE RESTRICT,
    eliminado_en     timestamptz,
    eliminado_por    bigint REFERENCES seg.usuario (id) ON DELETE RESTRICT,
    version_fila     integer NOT NULL DEFAULT 1,
    CONSTRAINT ux_recibo_cobro_numero UNIQUE (numero),
    CONSTRAINT ck_recibo_estado CHECK (estado IN ('vigente', 'anulado')),
    CONSTRAINT ck_recibo_anulado CHECK ((estado = 'anulado') = (nullif(btrim(motivo_anulacion), '') IS NOT NULL)),
    CONSTRAINT ck_recibo_observacion CHECK (observacion IS NULL OR length(observacion) <= 500)
);
COMMENT ON TABLE fin.recibo_cobro IS 'Migración 275: recibo de cobranza; sus cobros (fin.movimiento.recibo_id) cancelan una o varias facturas del mismo cliente.';
CREATE INDEX ix_recibo_cobro_cliente ON fin.recibo_cobro (cliente_id, fecha);
CALL aud.aplicar_estandar('fin.recibo_cobro'::regclass, true, true, false, true);
CREATE TRIGGER tg_08_solo_funciones BEFORE INSERT OR UPDATE OR DELETE ON fin.recibo_cobro
    FOR EACH ROW EXECUTE FUNCTION fin.fn_cont_solo_funciones();

ALTER TABLE fin.movimiento ADD COLUMN recibo_id bigint REFERENCES fin.recibo_cobro (id) ON DELETE RESTRICT;
CREATE INDEX ix_movimiento_recibo ON fin.movimiento (recibo_id) WHERE recibo_id IS NOT NULL;
COMMENT ON COLUMN fin.movimiento.recibo_id IS 'Migración 275: recibo de cobranza al que pertenece este cobro.';

-- Permisos de la tabla: los mismos que fin.movimiento (Finanzas la escribe solo por funciones)
DO $do$
DECLARE r record; p text;
BEGIN
    REVOKE ALL ON TABLE fin.recibo_cobro FROM PUBLIC;
    REVOKE ALL ON SEQUENCE fin.seq_recibo_cobro FROM PUBLIC;
    FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'tc\_%' OR rolname IN ('authenticated', 'anon') LOOP
        FOREACH p IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
            IF has_table_privilege(r.rolname, 'fin.movimiento', p) THEN
                EXECUTE format('GRANT %s ON TABLE fin.recibo_cobro TO %I', p, r.rolname);
            END IF;
        END LOOP;
    END LOOP;
END $do$;

-- 2 · Hacer un recibo
CREATE FUNCTION fin.fn_registrar_recibo(p_datos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE
    v_fecha date := nullif(p_datos ->> 'fecha', '')::date;
    v_facturas jsonb := p_datos -> 'facturas';
    v_obs text := nullif(btrim(p_datos ->> 'observacion'), '');
    cd fin.cuenta_dinero%ROWTYPE; f ven.factura%ROWTYPE; x jsonb;
    v_cliente bigint; v_id bigint; v_numero text; v_mov bigint; v_monto numeric; v_total numeric := 0; v_n integer := 0;
BEGIN
    PERFORM fin.fn_exigir_finanzas();
    IF v_facturas IS NULL OR jsonb_typeof(v_facturas) <> 'array' OR jsonb_array_length(v_facturas) = 0 THEN
        RAISE EXCEPTION 'Elegí al menos una factura' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(v_facturas) > 100 THEN RAISE EXCEPTION 'Un recibo lleva hasta 100 facturas' USING ERRCODE = '22023'; END IF;
    IF (SELECT count(DISTINCT e ->> 'factura_id') FROM jsonb_array_elements(v_facturas) e) <> jsonb_array_length(v_facturas) THEN
        RAISE EXCEPTION 'Hay una factura repetida en el recibo' USING ERRCODE = '22023';
    END IF;
    IF v_fecha IS NULL THEN RAISE EXCEPTION 'Elegí la fecha del recibo' USING ERRCODE = '22023'; END IF;
    IF v_obs IS NOT NULL AND length(v_obs) > 500 THEN RAISE EXCEPTION 'La observación es muy larga (hasta 500 letras)' USING ERRCODE = '22023'; END IF;
    SELECT * INTO cd FROM fin.cuenta_dinero WHERE id = nullif(p_datos ->> 'cuenta_dinero_id', '')::bigint AND activa AND eliminado_en IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Elegí en qué banco o caja entró' USING ERRCODE = '22023'; END IF;

    -- Todas del mismo cliente y de la moneda de la cuenta
    FOR x IN SELECT * FROM jsonb_array_elements(v_facturas) LOOP
        SELECT * INTO f FROM ven.factura WHERE id = nullif(x ->> 'factura_id', '')::bigint AND eliminado_en IS NULL;
        IF NOT FOUND THEN RAISE EXCEPTION 'Una de las facturas no existe' USING ERRCODE = 'P0002'; END IF;
        IF v_cliente IS NULL THEN v_cliente := f.cliente_id;
        ELSIF f.cliente_id <> v_cliente THEN
            RAISE EXCEPTION 'Las facturas de un recibo tienen que ser del mismo cliente (la % es de otro)', coalesce(f.numero_fiscal, f.numero) USING ERRCODE = '22023';
        END IF;
        IF f.moneda <> cd.moneda THEN
            RAISE EXCEPTION 'La factura % es en % y la cuenta en %: el recibo se hace con facturas en la moneda de la cuenta', coalesce(f.numero_fiscal, f.numero), f.moneda, cd.moneda
                USING ERRCODE = '22023';
        END IF;
    END LOOP;

    PERFORM set_config('fin.cont_fn', '1', true);
    INSERT INTO fin.recibo_cobro (fecha, cliente_id, cuenta_dinero_id, moneda, observacion)
    VALUES (v_fecha, v_cliente, cd.id, cd.moneda, v_obs)
    RETURNING id, numero INTO v_id, v_numero;

    -- Cada factura se cobra como siempre (mismos controles y asiento) y el cobro queda unido al recibo
    FOR x IN SELECT * FROM jsonb_array_elements(v_facturas) LOOP
        v_monto := nullif(x ->> 'monto', '')::numeric;
        v_mov := fin.fn_registrar_movimiento_interno(jsonb_build_object(
                     'tipo', 'cobro', 'fecha', v_fecha, 'cuenta_dinero_id', cd.id, 'monto', v_monto,
                     'factura_id', x ->> 'factura_id', 'monto_documento', v_monto, 'descripcion', 'Recibo ' || v_numero));
        PERFORM set_config('fin.cont_fn', '1', true);
        UPDATE fin.movimiento SET recibo_id = v_id WHERE id = v_mov;
        v_total := v_total + v_monto;
        v_n := v_n + 1;
    END LOOP;
    RETURN jsonb_build_object('id', v_id, 'numero', v_numero, 'facturas', v_n, 'total', v_total, 'moneda', cd.moneda);
END $f$;
COMMENT ON FUNCTION fin.fn_registrar_recibo(jsonb) IS 'Migración 275: recibo de cobranza con una o varias facturas del mismo cliente (Finanzas o TI).';

-- 3 · Anular un recibo
CREATE FUNCTION fin.fn_anular_recibo(p_recibo bigint, p_motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE r fin.recibo_cobro%ROWTYPE; m record;
BEGIN
    PERFORM fin.fn_exigir_finanzas();
    IF nullif(btrim(p_motivo), '') IS NULL THEN RAISE EXCEPTION 'Escribí por qué se anula' USING ERRCODE = '22023'; END IF;
    SELECT * INTO r FROM fin.recibo_cobro WHERE id = p_recibo AND eliminado_en IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'El recibo no existe' USING ERRCODE = 'P0002'; END IF;
    IF r.estado = 'anulado' THEN RAISE EXCEPTION 'El recibo ya está anulado' USING ERRCODE = '55000'; END IF;
    FOR m IN SELECT id FROM fin.movimiento WHERE recibo_id = r.id AND estado <> 'anulado' AND eliminado_en IS NULL ORDER BY id LOOP
        PERFORM fin.fn_anular_movimiento(m.id, 'Recibo ' || r.numero || ' anulado: ' || btrim(p_motivo));
    END LOOP;
    PERFORM set_config('fin.cont_fn', '1', true);
    UPDATE fin.recibo_cobro SET estado = 'anulado', motivo_anulacion = btrim(p_motivo) WHERE id = r.id;
END $f$;
COMMENT ON FUNCTION fin.fn_anular_recibo(bigint, text) IS 'Migración 275: anula el recibo y sus cobros (las facturas vuelven a quedar por cobrar).';

-- 4 · La lista
CREATE FUNCTION fin.fn_recibos(p_desde date DEFAULT NULL, p_hasta date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
BEGIN
    PERFORM fin.fn_exigir_lectura_finanzas();
    RETURN coalesce((
        SELECT jsonb_agg(jsonb_build_object(
                   'id', r.id, 'numero', r.numero, 'fecha', r.fecha, 'cliente_id', r.cliente_id, 'cliente', c.razon_social,
                   'cuenta', cd.nombre, 'moneda', r.moneda, 'observacion', r.observacion, 'estado', r.estado,
                   'motivo_anulacion', r.motivo_anulacion, 'creado_por', u.nombre,
                   'total', (SELECT coalesce(sum(m.monto), 0) FROM fin.movimiento m
                              WHERE m.recibo_id = r.id AND m.estado <> 'anulado' AND m.eliminado_en IS NULL),
                   'facturas', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                                    'factura_id', f.id, 'numero', coalesce(f.numero_fiscal, f.numero), 'fecha', f.fecha_emision,
                                    'monto', m.monto, 'anulado', m.estado = 'anulado') ORDER BY f.fecha_emision, f.id), '[]')
                                  FROM fin.movimiento m JOIN ven.factura f ON f.id = m.factura_id
                                 WHERE m.recibo_id = r.id AND m.eliminado_en IS NULL))
               ORDER BY r.fecha DESC, r.id DESC)
          FROM fin.recibo_cobro r
          JOIN mae.cliente c ON c.id = r.cliente_id
          JOIN fin.cuenta_dinero cd ON cd.id = r.cuenta_dinero_id
          LEFT JOIN seg.usuario u ON u.id = r.creado_por
         WHERE r.eliminado_en IS NULL
           AND r.fecha >= coalesce(p_desde, mae.fn_hoy() - 90)
           AND r.fecha <= coalesce(p_hasta, mae.fn_hoy() + 1)
    ), '[]');
END $f$;
COMMENT ON FUNCTION fin.fn_recibos(date, date) IS 'Migración 275: recibos de cobranza con sus facturas (por defecto, los últimos 90 días).';

-- 5 · Un cobro que es parte de un recibo no se cambia de fecha suelto
DO $do$
DECLARE v_def text; v_ancla text := 'IF m.origen IS NOT NULL THEN RAISE EXCEPTION ''Este cobro lo generó otro registro: se cambia desde ahí'' USING ERRCODE = ''55000''; END IF;';
BEGIN
    v_def := pg_get_functiondef('fin.fn_cambiar_fecha_cobro(bigint,date,text)'::regprocedure);
    IF (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 THEN
        RAISE EXCEPTION 'No encontré el texto esperado en fin.fn_cambiar_fecha_cobro: avisar antes de seguir';
    END IF;
    v_def := replace(v_def, v_ancla, v_ancla || E'\n    IF m.recibo_id IS NOT NULL THEN\n        RAISE EXCEPTION ''Este cobro es parte del recibo %: para cambiar la fecha, anulá el recibo y hacelo de nuevo'', (SELECT numero FROM fin.recibo_cobro WHERE id = m.recibo_id) USING ERRCODE = ''55000'';\n    END IF;');
    EXECUTE v_def;
END $do$;

-- 6 · Permisos: escribir como fin.fn_registrar_movimiento, leer como fin.fn_por_cobrar
DO $do$
DECLARE r record; v_mal text;
BEGIN
    REVOKE ALL ON FUNCTION fin.fn_registrar_recibo(jsonb) FROM PUBLIC;
    REVOKE ALL ON FUNCTION fin.fn_anular_recibo(bigint, text) FROM PUBLIC;
    REVOKE ALL ON FUNCTION fin.fn_recibos(date, date) FROM PUBLIC;
    FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'tc\_%' OR rolname = 'authenticated' LOOP
        IF has_function_privilege(r.rolname, 'fin.fn_registrar_movimiento(jsonb)', 'EXECUTE') THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_registrar_recibo(jsonb) TO %I', r.rolname);
            EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_anular_recibo(bigint, text) TO %I', r.rolname);
        END IF;
        IF has_function_privilege(r.rolname, 'fin.fn_por_cobrar()', 'EXECUTE') THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_recibos(date, date) TO %I', r.rolname);
        END IF;
    END LOOP;
    SELECT string_agg(ro.rolname, ', ') INTO v_mal FROM pg_roles ro
     WHERE ro.rolname IN (SELECT rol_bd FROM seg.rol_aplicacion WHERE rol_bd IS NOT NULL)
       AND (has_function_privilege(ro.rolname, 'fin.fn_registrar_movimiento(jsonb)', 'EXECUTE')
                IS DISTINCT FROM has_function_privilege(ro.rolname, 'fin.fn_registrar_recibo(jsonb)', 'EXECUTE')
            OR has_function_privilege(ro.rolname, 'fin.fn_por_cobrar()', 'EXECUTE')
                IS DISTINCT FROM has_function_privilege(ro.rolname, 'fin.fn_recibos(date,date)', 'EXECUTE'));
    IF v_mal IS NOT NULL THEN RAISE EXCEPTION 'Los permisos de los recibos no quedaron como los de los cobros para: %', v_mal; END IF;
END $do$;

UPDATE ref.parametro SET valor = '275' WHERE codigo = 'web.version_base' AND valor::text::int < 275;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'migración 275 aplicada' AS que, (SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base') AS version_base;
