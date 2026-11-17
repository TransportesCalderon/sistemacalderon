-- Ficha del cliente · Servicios, Rentabilidad mensual y Auditoría (Ingresos usa la cuenta corriente)
-- Pedido de Gerencia (17/11/2026). NO cambia web.version_base. Solo lectura. Necesita cuenta_corriente_clientes.sql aplicada.
-- Quién ve qué: Servicios, cualquiera que vea Ventas u Operaciones. Rentabilidad: Gerencia, Finanzas y TI. Auditoría: Gerencia, Finanzas, TI y auditor.

BEGIN;

DO $do$
BEGIN
    IF to_regprocedure('ven.fn_cc_movimientos(bigint)') IS NULL THEN RAISE EXCEPTION 'Primero hay que correr cuenta_corriente_clientes.sql'; END IF;
END $do$;

CREATE OR REPLACE FUNCTION ven.fn_cliente_resumen(p_cliente bigint)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
    v_roles text[]; v_hoy date := mae.fn_hoy(); v_desde date := (date_trunc('month', mae.fn_hoy()) - interval '11 months')::date;
    v_dia numeric := ref.fn_parametro_num('ia.costeo_fijo_dia_usd', 119.5) + ref.fn_parametro_num('ia.costeo_chofer_dia_usd', 58);
    v_neu numeric := ref.fn_parametro_num('ia.costeo_neumaticos_km_usd', 0.028);
    v_cc numeric := ref.fn_parametro_num('ia.costeo_consumo_cargado', 38.7);
    v_tc numeric; v_litro numeric; v_eco boolean; v_aud boolean; v_serv jsonb; v_rent jsonb; v_audit jsonb;
BEGIN
    SELECT coalesce(array_agg(rol_codigo), '{}') INTO v_roles FROM seg.usuario_rol WHERE usuario_id = aud.fn_usuario_actual();
    IF NOT (v_roles && ARRAY['comercial', 'gerencia', 'finanzas', 'ti', 'auditor', 'operaciones']) THEN
        RAISE EXCEPTION 'La ficha del cliente la ven Ventas, Operaciones, Gerencia, Finanzas o TI' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM mae.cliente WHERE id = p_cliente) THEN RAISE EXCEPTION 'El cliente no existe' USING ERRCODE = 'P0002'; END IF;
    v_eco := v_roles && ARRAY['gerencia', 'finanzas', 'ti'];
    v_aud := v_roles && ARRAY['gerencia', 'finanzas', 'ti', 'auditor'];

    -- Servicios: las últimas 150 operaciones del cliente
    SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.fecha DESC NULLS LAST, q.numero DESC), '[]') INTO v_serv FROM (
        SELECT s.id AS servicio_id, coalesce(s.numero_operacion::text, s.numero_servicio) AS numero, coalesce(s.fecha_operacion, s.creado_en::date) AS fecha,
               s.estado, l.codigo AS linea, s.contenedor,
               CASE WHEN v_roles && ARRAY['comercial', 'gerencia', 'finanzas', 'ti', 'auditor'] THEN s.precio_viaje END AS precio, s.precio_moneda AS moneda,
               (SELECT string_agg(coalesce(f.numero_fiscal, f.numero), ', ') FROM ven.factura_renglon r JOIN ven.factura f ON f.id = r.factura_id
                 WHERE r.servicio_id = s.id AND f.eliminado_en IS NULL AND f.estado IN ('emitida', 'cobrada')) AS factura
          FROM ops.servicio_comercial s LEFT JOIN mae.linea l ON l.id = s.linea_id
         WHERE s.cliente_id = p_cliente AND s.eliminado_en IS NULL
         ORDER BY coalesce(s.fecha_operacion, s.creado_en::date) DESC NULLS LAST, s.id DESC LIMIT 150) q;

    -- Rentabilidad mensual (12 meses): viajes, ingreso, ganancia estimada, facturado y cobrado, todo en USD
    IF v_eco THEN
        SELECT tc.tasa INTO v_tc FROM fin.tipo_cambio tc
         WHERE tc.moneda_origen = 'USD' AND tc.moneda_destino = 'CLP' AND tc.eliminado_en IS NULL AND tc.fecha <= v_hoy ORDER BY tc.fecha DESC LIMIT 1;
        v_litro := ref.fn_parametro_num('ia.costeo_gasoil_clp', 1630) / nullif(v_tc, 0);
        WITH meses AS (SELECT generate_series(v_desde, date_trunc('month', v_hoy)::date, interval '1 month')::date AS mes),
        o AS (
            SELECT date_trunc('month', coalesce(s.fecha_operacion, s.creado_en::date))::date AS mes,
                   ven.fn_a_usd(s.precio_viaje, s.precio_moneda::text, coalesce(s.fecha_operacion, v_hoy)) AS usd,
                   CASE WHEN l.distancia_km > 0 AND v_litro IS NOT NULL THEN
                       l.distancia_km * v_cc / 100 * v_litro + l.distancia_km * v_neu
                       + v_dia * CASE WHEN s.fecha_real_fin > s.fecha_real_inicio
                                      THEN least(greatest(extract(epoch FROM s.fecha_real_fin - s.fecha_real_inicio) / 86400, 1), 15)
                                      ELSE greatest(round(l.distancia_km / 450 * 2) / 2, 1) END END AS costo
              FROM ops.servicio_comercial s LEFT JOIN mae.linea l ON l.id = s.linea_id
             WHERE s.cliente_id = p_cliente AND s.eliminado_en IS NULL AND s.estado <> 'cancelado'
               AND coalesce(s.fecha_operacion, s.creado_en::date) >= v_desde),
        m AS (SELECT date_trunc('month', x.fecha)::date AS mes,
                     sum(ven.fn_a_usd(x.debe, x.moneda, x.fecha)) FILTER (WHERE x.tipo = 'factura') AS facturado,
                     sum(ven.fn_a_usd(x.haber, x.moneda, x.fecha)) FILTER (WHERE x.tipo = 'cobro') AS cobrado
                FROM ven.fn_cc_movimientos(p_cliente) x WHERE x.fecha >= v_desde GROUP BY 1)
        SELECT jsonb_agg(jsonb_build_object(
                   'mes', to_char(meses.mes, 'YYYY-MM'),
                   'viajes', (SELECT count(*) FROM o WHERE o.mes = meses.mes),
                   'viajes_sin_precio', (SELECT count(*) FROM o WHERE o.mes = meses.mes AND o.usd IS NULL),
                   'ingreso_usd', (SELECT round(sum(o.usd)) FROM o WHERE o.mes = meses.mes),
                   'ganancia_estimada_usd', (SELECT round(sum(o.usd - o.costo)) FROM o WHERE o.mes = meses.mes AND o.usd IS NOT NULL AND o.costo IS NOT NULL),
                   'margen_estimado_pct', (SELECT round(100 * sum(o.usd - o.costo) / nullif(sum(o.usd), 0)) FROM o WHERE o.mes = meses.mes AND o.usd IS NOT NULL AND o.costo IS NOT NULL),
                   'facturado_usd', (SELECT round(m.facturado) FROM m WHERE m.mes = meses.mes),
                   'cobrado_usd', (SELECT round(m.cobrado) FROM m WHERE m.mes = meses.mes)) ORDER BY meses.mes DESC)
          INTO v_rent FROM meses;
    END IF;

    -- Auditoría: quién cambió la ficha del cliente y qué datos (sin mostrar los valores)
    IF v_aud THEN
        SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.cuando DESC), '[]') INTO v_audit FROM (
            SELECT c.cambiado_en AS cuando, (SELECT u.nombre FROM seg.usuario u WHERE u.id = c.usuario_id) AS quien,
                   CASE c.operacion WHEN 'I' THEN 'Alta' WHEN 'U' THEN 'Cambio' WHEN 'D' THEN 'Baja' ELSE c.operacion::text END AS que,
                   CASE WHEN c.tabla = 'cliente' THEN 'Datos del cliente' ELSE 'Datos para la factura' END AS donde,
                   (SELECT string_agg(k, ', ' ORDER BY k) FROM unnest(c.columnas_modificadas) k
                     WHERE k NOT IN ('actualizado_en', 'actualizado_por', 'version_fila', 'creado_en', 'creado_por')) AS datos,
                   c.motivo
              FROM aud.cambio c
             WHERE ((c.esquema = 'mae' AND c.tabla = 'cliente' AND c.fila_id = p_cliente)
                 OR (c.esquema = 'ven' AND c.tabla = 'cliente_sii' AND c.fila_id = p_cliente))
             ORDER BY c.cambiado_en DESC LIMIT 100) q;
    END IF;

    RETURN jsonb_build_object('servicios', v_serv, 've_rentabilidad', v_eco, 'rentabilidad', v_rent, 've_auditoria', v_aud, 'auditoria', v_audit,
                              've_ingresos', v_roles && ARRAY['comercial', 'gerencia', 'finanzas', 'ti', 'auditor']);
END $function$;

CREATE OR REPLACE FUNCTION ops.fn_ven_cliente_resumen(p_cliente bigint)
 RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$ SELECT ven.fn_cliente_resumen(p_cliente) $f$;

REVOKE ALL ON FUNCTION ven.fn_cliente_resumen(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION ops.fn_ven_cliente_resumen(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ven.fn_cliente_resumen(bigint) TO tc_app, tc_admin, tc_lectura, tc_auditor;
GRANT EXECUTE ON FUNCTION ops.fn_ven_cliente_resumen(bigint) TO tc_app, tc_admin, tc_lectura, tc_auditor;

COMMIT;
