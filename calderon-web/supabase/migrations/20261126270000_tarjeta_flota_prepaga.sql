-- =====================================================================================
-- Migración 376 · Tarjeta de flota prepaga (Enex)
-- =====================================================================================
-- Pedido (26/11/2026): la tarjeta de flota de Enex es prepaga. No hay cuenta corriente: primero se le transfiere y
-- después ese saldo se usa para cargar combustible. Enex manda una factura por mes con lo cargado.
--
-- El modelo:
--   · La tarjeta es una cuenta de dinero (tipo caja) atada al proveedor: fin.tarjeta_prepaga.
--   · Recarga = transferencia de un banco a la tarjeta. Si alguien registra una «orden de pago» a Enex desde un banco,
--     se guarda como recarga (fin.fn_registrar_orden_pago, envoltorio; la anterior queda como _sin_tarjeta).
--   · Cada carga con la tarjeta sigue como hasta hoy: costo del camión y «por facturar» de Enex.
--   · La factura del mes de Enex se paga sola desde la tarjeta al guardarla (disparador al final de la transacción).
--   · Saldo que queda en Enex ≈ saldo de la tarjeta − lo cargado que Enex todavía no facturó (fin.fn_tarjeta_sin_facturar).
--     Bancos lo muestra en la tarjeta (fin.fn_cuentas_dinero, envoltorio; la anterior queda como _sin_tarjeta).
--   · fin.fn_crear_tarjeta_prepaga(proveedor, nombre, desde, saldo): crea la cuenta y la ata al proveedor.
-- No cambia datos. La tarjeta de Enex se crea con el script de la cuenta (377). Se puede correr más de una vez.
-- =====================================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS fin.tarjeta_prepaga (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cuenta_dinero_id bigint NOT NULL UNIQUE REFERENCES fin.cuenta_dinero(id) ON DELETE RESTRICT,
    proveedor_id     bigint NOT NULL UNIQUE REFERENCES mae.proveedor(id) ON DELETE RESTRICT,
    creado_en        timestamptz NOT NULL DEFAULT now(),
    creado_por       bigint REFERENCES seg.usuario(id) ON DELETE RESTRICT
);
COMMENT ON TABLE fin.tarjeta_prepaga IS
    'Migración 376 · Tarjeta de flota prepaga: la cuenta de dinero (tipo caja) donde está la plata cargada en el proveedor. Las facturas del proveedor se pagan solas desde ella.';
REVOKE ALL ON fin.tarjeta_prepaga FROM PUBLIC;

-- Lo cargado con la tarjeta que el proveedor todavía no facturó («por facturar» del proveedor)
CREATE OR REPLACE FUNCTION fin.fn_tarjeta_sin_facturar(p_proveedor bigint)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
    SELECT coalesce(sum(l.haber - l.debe), 0) FROM fin.asiento_linea l
     WHERE l.cuenta_id = fin.fn_cuenta_uso('POR_FACTURAR') AND l.tercero_tipo = 'proveedor' AND l.tercero_id = p_proveedor
$function$;

-- Crear la tarjeta: la cuenta de dinero y su proveedor
CREATE OR REPLACE FUNCTION fin.fn_crear_tarjeta_prepaga(p_proveedor bigint, p_nombre text, p_desde date, p_saldo numeric DEFAULT 0)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE v_usr bigint := fin.fn_exigir_finanzas(); v_cd bigint;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM mae.proveedor WHERE id = p_proveedor AND eliminado_en IS NULL) THEN
        RAISE EXCEPTION 'Elegí el proveedor de la tarjeta' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM fin.tarjeta_prepaga WHERE proveedor_id = p_proveedor) THEN
        RAISE EXCEPTION 'Ese proveedor ya tiene su tarjeta prepaga' USING ERRCODE = '23505';
    END IF;
    v_cd := fin.fn_guardar_cuenta_dinero(NULL, jsonb_build_object('nombre', p_nombre, 'tipo', 'caja', 'moneda', 'CLP',
                'saldo_inicial', coalesce(p_saldo, 0), 'saldo_inicial_fecha', p_desde));
    INSERT INTO fin.tarjeta_prepaga (cuenta_dinero_id, proveedor_id, creado_por) VALUES (v_cd, p_proveedor, v_usr);
    RETURN v_cd;
END $function$;
REVOKE ALL ON FUNCTION fin.fn_crear_tarjeta_prepaga(bigint, text, date, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION fin.fn_tarjeta_sin_facturar(bigint) FROM PUBLIC;

-- La factura del proveedor se paga sola desde la tarjeta (al final de la transacción, cuando ya tiene sus cargas y totales)
CREATE OR REPLACE FUNCTION fin.tg_gasto_tarjeta_prepaga()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE g fin.gasto%ROWTYPE; t fin.tarjeta_prepaga%ROWTYPE; cd fin.cuenta_dinero%ROWTYPE; v_saldo numeric;
BEGIN
    SELECT * INTO g FROM fin.gasto WHERE id = NEW.id;
    IF NOT FOUND OR g.estado = 'anulado' OR g.eliminado_en IS NOT NULL THEN RETURN NULL; END IF;
    SELECT * INTO t FROM fin.tarjeta_prepaga WHERE proveedor_id = g.proveedor_id;
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT * INTO cd FROM fin.cuenta_dinero WHERE id = t.cuenta_dinero_id AND eliminado_en IS NULL AND activa;
    IF NOT FOUND OR g.moneda <> cd.moneda OR g.fecha < cd.saldo_inicial_fecha THEN RETURN NULL; END IF;
    v_saldo := fin.fn_saldo_gasto(g.id);
    IF v_saldo <= 0 THEN RETURN NULL; END IF;
    PERFORM fin.fn_registrar_movimiento_interno(jsonb_build_object('tipo', 'pago', 'fecha', least(g.fecha, mae.fn_hoy()), 'cuenta_dinero_id', cd.id,
                'monto', v_saldo, 'gasto_id', g.id, 'monto_documento', v_saldo,
                'descripcion', left(g.numero || ' · factura pagada con la tarjeta prepaga', 200)));
    RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS tg_90_tarjeta_prepaga ON fin.gasto;
CREATE CONSTRAINT TRIGGER tg_90_tarjeta_prepaga AFTER INSERT OR UPDATE ON fin.gasto
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fin.tg_gasto_tarjeta_prepaga();

-- Bancos: la tarjeta muestra cuánto queda en el proveedor
DO $r$
BEGIN
    IF to_regprocedure('fin.fn_cuentas_dinero_sin_tarjeta()') IS NULL THEN
        ALTER FUNCTION fin.fn_cuentas_dinero() RENAME TO fn_cuentas_dinero_sin_tarjeta;
    END IF;
    IF to_regprocedure('fin.fn_registrar_orden_pago_sin_tarjeta(jsonb)') IS NULL THEN
        ALTER FUNCTION fin.fn_registrar_orden_pago(jsonb) RENAME TO fn_registrar_orden_pago_sin_tarjeta;
    END IF;
END $r$;

CREATE OR REPLACE FUNCTION fin.fn_cuentas_dinero()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
BEGIN
    RETURN coalesce((
        SELECT jsonb_agg(CASE WHEN t.id IS NULL THEN c
                              ELSE c || jsonb_build_object('tarjeta', jsonb_build_object(
                                       'proveedor_id', t.proveedor_id,
                                       'proveedor', (SELECT razon_social FROM mae.proveedor WHERE id = t.proveedor_id),
                                       'sin_facturar', fin.fn_tarjeta_sin_facturar(t.proveedor_id),
                                       'disponible', (c ->> 'saldo')::numeric - fin.fn_tarjeta_sin_facturar(t.proveedor_id))) END
                         ORDER BY n)
          FROM jsonb_array_elements(fin.fn_cuentas_dinero_sin_tarjeta()) WITH ORDINALITY x(c, n)
          LEFT JOIN fin.tarjeta_prepaga t ON t.cuenta_dinero_id = (c ->> 'id')::bigint), '[]');
END $function$;

-- Orden de pago a un proveedor con tarjeta prepaga, desde un banco: es una recarga de la tarjeta
CREATE OR REPLACE FUNCTION fin.fn_registrar_orden_pago(p_datos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE t fin.tarjeta_prepaga%ROWTYPE; cd fin.cuenta_dinero%ROWTYPE; tc fin.cuenta_dinero%ROWTYPE; v_mov bigint; v_dest numeric;
BEGIN
    SELECT * INTO t FROM fin.tarjeta_prepaga WHERE proveedor_id = nullif(p_datos ->> 'proveedor_id', '')::bigint;
    IF NOT FOUND OR t.cuenta_dinero_id = nullif(p_datos ->> 'cuenta_dinero_id', '')::bigint THEN
        RETURN fin.fn_registrar_orden_pago_sin_tarjeta(p_datos);
    END IF;
    SELECT * INTO cd FROM fin.cuenta_dinero WHERE id = nullif(p_datos ->> 'cuenta_dinero_id', '')::bigint AND eliminado_en IS NULL;
    SELECT * INTO tc FROM fin.cuenta_dinero WHERE id = t.cuenta_dinero_id;
    v_dest := CASE WHEN cd.moneda = tc.moneda THEN nullif(p_datos ->> 'monto', '')::numeric ELSE nullif(p_datos ->> 'monto_deuda', '')::numeric END;
    IF cd.id IS NOT NULL AND cd.moneda <> tc.moneda AND coalesce(v_dest, 0) <= 0 THEN
        RAISE EXCEPTION 'La tarjeta está en %: escribí cuántos % se cargaron en la tarjeta', tc.moneda, tc.moneda USING ERRCODE = '22023';
    END IF;
    v_mov := fin.fn_registrar_movimiento(jsonb_build_object('tipo', 'transferencia', 'fecha', p_datos ->> 'fecha', 'cuenta_dinero_id', cd.id,
                 'monto', p_datos ->> 'monto', 'destino_id', tc.id, 'monto_destino', v_dest,
                 'descripcion', left('Recarga de ' || tc.nombre || coalesce(' · ' || nullif(btrim(p_datos ->> 'observacion'), ''), ''), 200)));
    RETURN jsonb_build_object('id', NULL, 'numero', (SELECT numero FROM fin.movimiento WHERE id = v_mov), 'movimiento_id', v_mov,
                              'a_cuenta', 0, 'recarga', true, 'tarjeta', tc.nombre);
END $function$;

-- Permisos: los mismos que tenían
DO $g$
DECLARE r record;
BEGIN
    REVOKE ALL ON FUNCTION fin.fn_cuentas_dinero() FROM PUBLIC;
    REVOKE ALL ON FUNCTION fin.fn_registrar_orden_pago(jsonb) FROM PUBLIC;
    FOR r IN SELECT a.grantee FROM pg_proc p, aclexplode(p.proacl) a
              WHERE p.oid = 'fin.fn_cuentas_dinero_sin_tarjeta()'::regprocedure AND a.privilege_type = 'EXECUTE' AND a.grantee <> 0 LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_cuentas_dinero() TO %I', pg_get_userbyid(r.grantee));
        EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_tarjeta_sin_facturar(bigint) TO %I', pg_get_userbyid(r.grantee));
        EXECUTE format('GRANT SELECT ON fin.tarjeta_prepaga TO %I', pg_get_userbyid(r.grantee));
    END LOOP;
    FOR r IN SELECT a.grantee FROM pg_proc p, aclexplode(p.proacl) a
              WHERE p.oid = 'fin.fn_registrar_orden_pago_sin_tarjeta(jsonb)'::regprocedure AND a.privilege_type = 'EXECUTE' AND a.grantee <> 0 LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_registrar_orden_pago(jsonb) TO %I', pg_get_userbyid(r.grantee));
        EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_crear_tarjeta_prepaga(bigint, text, date, numeric) TO %I', pg_get_userbyid(r.grantee));
    END LOOP;
END $g$;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'Listo: tarjeta de flota prepaga (recargas, facturas pagadas con la tarjeta y saldo que queda)' AS resultado,
       (SELECT count(*) FROM fin.tarjeta_prepaga) AS tarjetas;
