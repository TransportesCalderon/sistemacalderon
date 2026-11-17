-- =============================================================================
-- IronTrack — 274 · Cambio 268 · Finanzas › Cobros y pagos › Debemos: cuenta corriente con estaciones
-- -----------------------------------------------------------------------------
-- Pedido del usuario (17/11/2026): en «Debemos» tiene que aparecer lo que se le debe a cada
-- estación (por ejemplo, Shell Rodríguez Peña), no solo los gastos ya cargados.
-- Lo que se le debe a un proveedor de combustible tiene dos partes:
--   · cargas en cuenta corriente o con tarjeta (regla «factura después») que todavía no tienen
--     factura: ya se cargó el gasoil, falta que llegue la factura;
--   · facturas del proveedor (gastos) que todavía no se pagaron.
-- fin.fn_cuenta_estaciones() devuelve, por proveedor y moneda, las dos partes y el total, con las
-- estaciones del proveedor. Es solo lectura y usa las mismas reglas que ya usa la factura del
-- proveedor para elegir sus cargas (fin.fn_cargas_por_facturar). Permisos: los de fin.fn_por_pagar.
-- No cambia datos. web.version_base = 274.
-- =============================================================================
SET search_path = public, extensions;
BEGIN;

DO $do$
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 273 THEN
        RAISE EXCEPTION 'Falta la migración 273 (cambiar la fecha de un cobro): aplicarla antes';
    END IF;
    IF to_regprocedure('fin.fn_cuenta_estaciones()') IS NOT NULL THEN
        RAISE EXCEPTION 'La migración 274 (cuenta corriente con estaciones) ya está aplicada';
    END IF;
END $do$;

CREATE FUNCTION fin.fn_cuenta_estaciones()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
BEGIN
    PERFORM fin.fn_exigir_lectura_finanzas();
    RETURN coalesce((
        WITH cargas AS (
            SELECT e.proveedor_id, c.moneda::text AS moneda, count(*) AS n, coalesce(sum(c.importe_original), 0) AS importe,
                   count(*) FILTER (WHERE c.importe_original IS NULL) AS sin_importe, coalesce(sum(c.litros), 0) AS litros,
                   min((c.fecha_hora AT TIME ZONE 'America/Argentina/Mendoza')::date) AS desde,
                   max((c.fecha_hora AT TIME ZONE 'America/Argentina/Mendoza')::date) AS hasta
              FROM fue.carga_combustible c
              JOIN mae.estacion_servicio e ON e.id = c.estacion_id
              LEFT JOIN fin.gasto_carga gc ON gc.carga_id = c.id
             WHERE e.proveedor_id IS NOT NULL AND c.estado_validacion <> 'anulada' AND c.eliminado_en IS NULL
               AND (fin.fn_medio_de_carga(c.medio_pago, e.proveedor_id)).tipo = 'factura_posterior'
               AND gc.gasto_id IS NULL
             GROUP BY 1, 2
        ), facturas AS (
            SELECT g.proveedor_id, g.moneda::text AS moneda, count(*) AS n, sum(fin.fn_saldo_gasto(g.id)) AS saldo,
                   coalesce(sum(fin.fn_saldo_gasto(g.id)) FILTER (WHERE g.vence < mae.fn_hoy()), 0) AS vencido
              FROM fin.gasto g
             WHERE g.estado = 'vigente' AND g.eliminado_en IS NULL AND fin.fn_saldo_gasto(g.id) > 0
               AND g.proveedor_id IN (SELECT e.proveedor_id FROM mae.estacion_servicio e WHERE e.proveedor_id IS NOT NULL)
             GROUP BY 1, 2
        ), x AS (
            SELECT coalesce(c.proveedor_id, f.proveedor_id) AS proveedor_id, coalesce(c.moneda, f.moneda) AS moneda,
                   coalesce(c.n, 0) AS cargas, coalesce(c.importe, 0) AS cargas_importe, coalesce(c.sin_importe, 0) AS cargas_sin_importe,
                   coalesce(c.litros, 0) AS litros, c.desde, c.hasta,
                   coalesce(f.n, 0) AS facturas, coalesce(f.saldo, 0) AS facturas_saldo, coalesce(f.vencido, 0) AS vencido
              FROM cargas c FULL JOIN facturas f ON f.proveedor_id = c.proveedor_id AND f.moneda = c.moneda
        )
        SELECT jsonb_agg(jsonb_build_object(
                   'proveedor_id', x.proveedor_id, 'proveedor', p.razon_social,
                   'estaciones', (SELECT string_agg(e.nombre, ', ' ORDER BY e.nombre) FROM mae.estacion_servicio e
                                   WHERE e.proveedor_id = x.proveedor_id AND e.eliminado_en IS NULL),
                   'moneda', x.moneda, 'cargas', x.cargas, 'cargas_importe', x.cargas_importe, 'cargas_sin_importe', x.cargas_sin_importe,
                   'litros', x.litros, 'desde', x.desde, 'hasta', x.hasta,
                   'facturas', x.facturas, 'facturas_saldo', x.facturas_saldo, 'vencido', x.vencido,
                   'total', x.cargas_importe + x.facturas_saldo)
               ORDER BY x.cargas_importe + x.facturas_saldo DESC, p.razon_social)
          FROM x JOIN mae.proveedor p ON p.id = x.proveedor_id
    ), '[]');
END $f$;
COMMENT ON FUNCTION fin.fn_cuenta_estaciones() IS
    'Migración 274: lo que se le debe a cada proveedor de combustible (cargas sin factura + facturas sin pagar), por moneda.';

-- Permisos: los mismos que fin.fn_por_pagar (la lista de «Debemos»)
DO $do$
DECLARE r record; v_mal text;
BEGIN
    REVOKE ALL ON FUNCTION fin.fn_cuenta_estaciones() FROM PUBLIC;
    FOR r IN SELECT DISTINCT x.grantee FROM pg_proc p, aclexplode(p.proacl) x
              WHERE p.oid = 'fin.fn_por_pagar()'::regprocedure AND x.privilege_type = 'EXECUTE' AND x.grantee <> p.proowner AND x.grantee <> 0 LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_cuenta_estaciones() TO %I', pg_get_userbyid(r.grantee));
    END LOOP;
    SELECT string_agg(ro.rolname, ', ') INTO v_mal FROM pg_roles ro
     WHERE ro.rolname IN (SELECT rol_bd FROM seg.rol_aplicacion WHERE rol_bd IS NOT NULL)
       AND has_function_privilege(ro.rolname, 'fin.fn_por_pagar()', 'EXECUTE')
           IS DISTINCT FROM has_function_privilege(ro.rolname, 'fin.fn_cuenta_estaciones()', 'EXECUTE');
    IF v_mal IS NOT NULL THEN RAISE EXCEPTION 'Los permisos no quedaron iguales a los de «Debemos» para: %', v_mal; END IF;
END $do$;

UPDATE ref.parametro SET valor = '274' WHERE codigo = 'web.version_base' AND valor::text::int < 274;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'migración 274 aplicada' AS que, (SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base') AS version_base;
