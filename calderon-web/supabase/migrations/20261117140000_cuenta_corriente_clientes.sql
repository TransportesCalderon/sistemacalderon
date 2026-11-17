-- Ventas › Facturación · Cuenta corriente de clientes (saldos y movimientos, como en un ERP)
-- Pedido de Gerencia (17/11/2026). NO cambia web.version_base. Solo lectura: no toca datos. Se puede correr más de una vez.
-- La ven los mismos perfiles que ven las facturas (ven.fn_exigir_lectura).
-- Movimientos: factura emitida (debe), cobro registrado (haber) y anulación (haber). Saldo corrido por moneda.

BEGIN;

-- Todos los movimientos de un cliente (o de todos), sin filtrar fechas
CREATE OR REPLACE FUNCTION ven.fn_cc_movimientos(p_cliente bigint)
 RETURNS TABLE(cliente_id bigint, moneda text, fecha date, orden integer, tipo text, factura_id bigint, documento text, detalle text, vence date, debe numeric, haber numeric)
 LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
    -- Facturas emitidas (también las que después se cobraron o se anularon)
    SELECT f.cliente_id, f.moneda::text, f.fecha_emision::date, 1, 'factura', f.id,
           coalesce('Factura ' || nullif(btrim(f.numero_fiscal), ''), f.numero), nullif(btrim(f.observacion), ''), f.vence::date, f.total, 0::numeric
      FROM ven.factura f
     WHERE f.eliminado_en IS NULL AND f.fecha_emision IS NOT NULL AND f.estado IN ('emitida', 'cobrada', 'anulada')
       AND (p_cliente IS NULL OR f.cliente_id = p_cliente)
    UNION ALL
    -- Cobros registrados en bancos y cajas
    SELECT f.cliente_id, f.moneda::text, m.fecha, 2, 'cobro', f.id, coalesce(m.numero, 'Cobro'),
           'Cobro de ' || coalesce('la factura ' || nullif(btrim(f.numero_fiscal), ''), f.numero), NULL::date, 0::numeric, m.monto_documento
      FROM fin.movimiento m JOIN ven.factura f ON f.id = m.factura_id
     WHERE m.tipo = 'cobro' AND m.estado = 'vigente' AND m.eliminado_en IS NULL AND f.eliminado_en IS NULL AND f.fecha_emision IS NOT NULL
       AND f.estado <> 'anulada' AND (p_cliente IS NULL OR f.cliente_id = p_cliente)
    UNION ALL
    -- Facturas marcadas cobradas sin movimiento de banco (cobro cargado a mano)
    SELECT f.cliente_id, f.moneda::text, f.cobrada_en::date, 2, 'cobro', f.id, 'Cobro',
           'Cobro de ' || coalesce('la factura ' || nullif(btrim(f.numero_fiscal), ''), f.numero) || ' (sin banco)', NULL::date, 0::numeric,
           f.total - fin.fn_cobrado_factura(f.id)
      FROM ven.factura f
     WHERE f.eliminado_en IS NULL AND f.estado = 'cobrada' AND f.cobrada_en IS NOT NULL AND f.total - fin.fn_cobrado_factura(f.id) > 0
       AND (p_cliente IS NULL OR f.cliente_id = p_cliente)
    UNION ALL
    -- Anulaciones (nota de crédito)
    SELECT f.cliente_id, f.moneda::text, greatest(coalesce((SELECT max(d.fecha) FROM ven.dte d WHERE d.factura_id = f.id AND d.tipo IN (61, 112) AND d.estado = 'aceptado'),
                                                         (f.actualizado_en AT TIME ZONE 'America/Argentina/Mendoza')::date), f.fecha_emision::date),
           3, 'anulacion', f.id, 'Anulación',
           'Anula ' || coalesce('la factura ' || nullif(btrim(f.numero_fiscal), ''), f.numero) || coalesce(': ' || nullif(btrim(f.motivo), ''), ''), NULL::date, 0::numeric, f.total
      FROM ven.factura f
     WHERE f.eliminado_en IS NULL AND f.estado = 'anulada' AND f.fecha_emision IS NOT NULL AND (p_cliente IS NULL OR f.cliente_id = p_cliente)
$function$;

-- Saldos de todos los clientes (p_cliente nulo) o la cuenta de uno, con saldo anterior y saldo corrido
CREATE OR REPLACE FUNCTION ven.fn_cuenta_corriente(p_cliente bigint, p_desde date, p_hasta date)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE v_hoy date := mae.fn_hoy(); v_desde date := coalesce(p_desde, v_hoy - 90); v_hasta date := coalesce(p_hasta, v_hoy);
BEGIN
    PERFORM ven.fn_exigir_lectura();
    IF v_hasta < v_desde THEN RAISE EXCEPTION 'El período está al revés' USING ERRCODE = '22023'; END IF;

    IF p_cliente IS NULL THEN
        RETURN jsonb_build_object('clientes', coalesce((
            SELECT jsonb_agg(to_jsonb(q) ORDER BY q.saldo DESC, q.cliente)
              FROM (SELECT m.cliente_id, coalesce(c.nombre_fantasia, c.razon_social) AS cliente, c.razon_social, m.moneda,
                           sum(m.debe) AS facturado, sum(m.haber) AS cobrado, sum(m.debe - m.haber) AS saldo,
                           coalesce((SELECT sum(fin.fn_saldo_factura(f.id)) FROM ven.factura f
                                      WHERE f.cliente_id = m.cliente_id AND f.moneda::text = m.moneda AND f.eliminado_en IS NULL AND f.estado = 'emitida' AND f.vence::date < v_hoy), 0) AS vencido,
                           (SELECT count(*) FROM ven.factura f WHERE f.cliente_id = m.cliente_id AND f.moneda::text = m.moneda AND f.eliminado_en IS NULL AND f.estado = 'emitida') AS facturas_abiertas,
                           (SELECT min(f.vence::date) FROM ven.factura f WHERE f.cliente_id = m.cliente_id AND f.moneda::text = m.moneda AND f.eliminado_en IS NULL AND f.estado = 'emitida') AS vence_la_mas_vieja,
                           max(m.fecha) FILTER (WHERE m.tipo = 'factura') AS ultima_factura, max(m.fecha) FILTER (WHERE m.tipo = 'cobro') AS ultimo_cobro
                      FROM ven.fn_cc_movimientos(NULL) m JOIN mae.cliente c ON c.id = m.cliente_id
                     WHERE m.fecha <= v_hoy GROUP BY m.cliente_id, c.nombre_fantasia, c.razon_social, m.moneda) q), '[]'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM mae.cliente WHERE id = p_cliente) THEN RAISE EXCEPTION 'El cliente no existe' USING ERRCODE = 'P0002'; END IF;
    RETURN jsonb_build_object(
        'cliente', (SELECT jsonb_build_object('id', c.id, 'nombre', coalesce(c.nombre_fantasia, c.razon_social), 'razon_social', c.razon_social,
                                              'plazo_dias', c.condicion_pago_dias) FROM mae.cliente c WHERE c.id = p_cliente),
        'desde', v_desde, 'hasta', v_hasta,
        'monedas', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                    'moneda', g.moneda, 'saldo_anterior', g.anterior, 'facturado', g.debe, 'cobrado', g.haber, 'saldo', g.anterior + g.debe - g.haber,
                    'saldo_hoy', g.saldo_hoy,
                    'por_vencer', a.por_vencer, 'vencido_1_30', a.v30, 'vencido_31_60', a.v60, 'vencido_mas_60', a.v61,
                    'movimientos', coalesce((
                        SELECT jsonb_agg(jsonb_build_object('fecha', x.fecha, 'tipo', x.tipo, 'factura_id', x.factura_id, 'documento', x.documento, 'detalle', x.detalle,
                                                            'vence', x.vence, 'debe', x.debe, 'haber', x.haber, 'saldo', x.saldo) ORDER BY x.fecha, x.orden, x.factura_id)
                          FROM (SELECT m.*, g.anterior + sum(m.debe - m.haber) OVER (ORDER BY m.fecha, m.orden, m.factura_id) AS saldo
                                  FROM ven.fn_cc_movimientos(p_cliente) m
                                 WHERE m.moneda = g.moneda AND m.fecha BETWEEN v_desde AND v_hasta) x), '[]')) ORDER BY g.moneda)
              FROM (SELECT m.moneda,
                           coalesce(sum(m.debe - m.haber) FILTER (WHERE m.fecha < v_desde), 0) AS anterior,
                           coalesce(sum(m.debe) FILTER (WHERE m.fecha BETWEEN v_desde AND v_hasta), 0) AS debe,
                           coalesce(sum(m.haber) FILTER (WHERE m.fecha BETWEEN v_desde AND v_hasta), 0) AS haber,
                           coalesce(sum(m.debe - m.haber) FILTER (WHERE m.fecha <= v_hoy), 0) AS saldo_hoy
                      FROM ven.fn_cc_movimientos(p_cliente) m GROUP BY m.moneda) g
              CROSS JOIN LATERAL (
                    SELECT coalesce(sum(s) FILTER (WHERE d <= 0), 0) AS por_vencer, coalesce(sum(s) FILTER (WHERE d BETWEEN 1 AND 30), 0) AS v30,
                           coalesce(sum(s) FILTER (WHERE d BETWEEN 31 AND 60), 0) AS v60, coalesce(sum(s) FILTER (WHERE d > 60), 0) AS v61
                      FROM (SELECT fin.fn_saldo_factura(f.id) AS s, v_hoy - f.vence::date AS d FROM ven.factura f
                             WHERE f.cliente_id = p_cliente AND f.moneda::text = g.moneda AND f.eliminado_en IS NULL AND f.estado = 'emitida') z) a), '[]'));
END $function$;

CREATE OR REPLACE FUNCTION ops.fn_ven_cuenta_corriente(p_cliente bigint, p_desde date, p_hasta date)
 RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$ SELECT ven.fn_cuenta_corriente(p_cliente, p_desde, p_hasta) $f$;

-- Permisos: los mismos que la lista de facturas
DO $do$
DECLARE r record;
BEGIN
    REVOKE ALL ON FUNCTION ven.fn_cc_movimientos(bigint) FROM PUBLIC;
    REVOKE ALL ON FUNCTION ven.fn_cuenta_corriente(bigint, date, date) FROM PUBLIC;
    REVOKE ALL ON FUNCTION ops.fn_ven_cuenta_corriente(bigint, date, date) FROM PUBLIC;
    FOR r IN SELECT rolname FROM pg_roles WHERE NOT rolsuper AND rolname LIKE 'tc\_%' AND has_function_privilege(oid, 'ops.fn_ven_facturas(text)', 'EXECUTE') LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION ven.fn_cuenta_corriente(bigint, date, date) TO %I', r.rolname);
        EXECUTE format('GRANT EXECUTE ON FUNCTION ops.fn_ven_cuenta_corriente(bigint, date, date) TO %I', r.rolname);
    END LOOP;
    IF NOT has_function_privilege('tc_admin', 'ops.fn_ven_cuenta_corriente(bigint, date, date)', 'EXECUTE') THEN RAISE EXCEPTION 'Faltó el permiso de la web'; END IF;
END $do$;

COMMIT;
