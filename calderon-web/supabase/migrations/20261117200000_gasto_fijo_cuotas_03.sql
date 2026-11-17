-- Finanzas › Gastos fijos · Cuotas con su vencimiento original y fecha prevista de pago
-- Pedido de Gerencia (17/11/2026). NO cambia web.version_base. Necesita gasto_fijo_cuotas_02.sql. Se puede correr más de una vez.
-- Regla: cada cuota tiene SU mes del calendario original (cuota n = mes «desde» + n − 1) y vence en ese mes.
--   · Las cuotas atrasadas (de meses pasados, todavía sin emitir) se generan todas juntas, cada una con su vencimiento original:
--     así la deuda queda completa en el balance.
--   · Cada cuota sin pagar lleva además una «fecha prevista de pago» (una por mes desde ahora) para proyectar la caja.
--     Se pueden pagar de a una o todas juntas.

BEGIN;

DO $do$
BEGIN
    IF to_regprocedure('fin.fn_gasto_fijo_corresponde(bigint, date)') IS NULL THEN RAISE EXCEPTION 'Primero hay que correr gasto_fijo_cuotas_02.sql'; END IF;
END $do$;

ALTER TABLE fin.gasto ADD COLUMN IF NOT EXISTS pago_previsto date;
COMMENT ON COLUMN fin.gasto.pago_previsto IS 'Cuándo se piensa pagar (para proyectar la caja). El vencimiento original sigue en «vence».';

-- Qué número de cuota le toca a un mes del calendario (1 = el mes «desde»)
CREATE OR REPLACE FUNCTION fin.fn_gasto_fijo_cuota_de(p_id bigint, p_mes date)
 RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT ((extract(year FROM p_mes) - extract(year FROM f.desde)) * 12 + extract(month FROM p_mes) - extract(month FROM f.desde))::integer + 1
      FROM fin.gasto_fijo f WHERE f.id = p_id
$f$;

-- ¿Le corresponde un gasto en ese mes? Con cuotas: si la cuota de ese mes del calendario está entre las que faltan
CREATE OR REPLACE FUNCTION fin.fn_gasto_fijo_corresponde(p_id bigint, p_mes date)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT f.desde <= p_mes AND CASE
             WHEN f.cuotas IS NULL THEN f.hasta IS NULL OR f.hasta >= p_mes
             ELSE fin.fn_gasto_fijo_cuota_de(f.id, p_mes) BETWEEN coalesce(f.cuotas_previas, 0) + 1 AND f.cuotas END
      FROM fin.gasto_fijo f WHERE f.id = p_id
$f$;

-- Reparte las fechas previstas de pago: la cuota sin pagar más vieja, este mes; la siguiente, el mes que viene; y así
CREATE OR REPLACE FUNCTION fin.fn_gasto_fijo_prever_pagos(p_fijo bigint)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE f fin.gasto_fijo%ROWTYPE; g record; k integer := 0; v_mes date := date_trunc('month', mae.fn_hoy())::date; v_prev date;
BEGIN
    SELECT * INTO f FROM fin.gasto_fijo WHERE id = p_fijo;
    IF f.cuotas IS NULL THEN RETURN; END IF;
    PERFORM set_config('fin.cont_fn', '1', true);
    -- Si este mes ya se pagó una cuota, la próxima se prevé para el mes que viene
    IF EXISTS (SELECT 1 FROM fin.movimiento mv JOIN fin.gasto x ON x.id = mv.gasto_id
                WHERE x.gasto_fijo_id = p_fijo AND mv.tipo = 'pago' AND mv.estado = 'vigente' AND mv.eliminado_en IS NULL
                  AND mv.fecha >= v_mes AND mv.fecha < (v_mes + interval '1 month')::date) THEN k := 1; END IF;
    FOR g IN SELECT x.id, x.vence, x.pago_previsto FROM fin.gasto x
              WHERE x.gasto_fijo_id = p_fijo AND x.estado <> 'anulado' AND x.eliminado_en IS NULL AND fin.fn_saldo_gasto(x.id) > 0
              ORDER BY x.periodo, x.id LOOP
        -- Nunca antes de su vencimiento; las atrasadas, una por mes desde este mes
        v_prev := greatest(g.vence, (v_mes + make_interval(months => k))::date + (f.dia_vence - 1));
        IF g.pago_previsto IS DISTINCT FROM v_prev THEN UPDATE fin.gasto SET pago_previsto = v_prev WHERE id = g.id; END IF;
        IF g.vence < (v_mes + make_interval(months => k + 1))::date THEN k := k + 1; END IF;
    END LOOP;
END $function$;

-- Genera las cuotas de meses pasados que faltan emitir, cada una en su mes y con su vencimiento original
CREATE OR REPLACE FUNCTION fin.fn_generar_cuotas_atrasadas(p_hasta_mes date)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE f fin.gasto_fijo%ROWTYPE; n integer := 0; i integer; v_mes date; v_fecha date; v_tc numeric; m record;
        v_iva numeric := ref.fn_parametro_num('fin.iva_pct', 19); v_tope date := date_trunc('month', p_hasta_mes)::date;
BEGIN
    PERFORM set_config('fin.cont_fn', '1', true);
    FOR f IN SELECT * FROM fin.gasto_fijo WHERE activo AND eliminado_en IS NULL AND cuotas IS NOT NULL ORDER BY id LOOP
        FOR i IN coalesce(f.cuotas_previas, 0) + 1 .. f.cuotas LOOP
            v_mes := (f.desde + make_interval(months => i - 1))::date;
            EXIT WHEN v_mes >= v_tope;      -- el mes en curso y los futuros los genera el proceso de siempre
            CONTINUE WHEN EXISTS (SELECT 1 FROM fin.gasto g WHERE g.gasto_fijo_id = f.id AND g.periodo = v_mes AND g.estado <> 'anulado' AND g.eliminado_en IS NULL);
            v_fecha := v_mes + (f.dia_vence - 1);
            v_tc := fin.fn_tc_clp_o_null(f.moneda, v_fecha);
            CONTINUE WHEN v_tc IS NULL;
            SELECT * INTO m FROM fin.fn_montos_gasto(f.tipo_documento, f.moneda,
                CASE WHEN f.tipo_documento = 'factura' AND f.moneda = 'CLP' THEN round(f.monto / (1 + v_iva / 100), 0)
                     WHEN f.tipo_documento = 'boleta_honorarios' THEN round(f.monto / (1 - ref.fn_parametro_num('fin.retencion_honorarios_pct', 15.25) / 100), 0)
                     ELSE f.monto END,
                0, f.monto);
            INSERT INTO fin.gasto (fecha, proveedor_id, tipo_documento, numero_documento, descripcion, cuenta_id, camion_id, moneda,
                                   exento, neto, iva, retencion, total, tc_clp, vence, gasto_fijo_id, periodo)
            VALUES (v_mes, f.proveedor_id, f.tipo_documento, NULL, f.nombre || ' · ' || to_char(v_mes, 'MM/YYYY') || ' · cuota ' || i || ' de ' || f.cuotas,
                    f.cuenta_id, f.camion_id, f.moneda, m.exento, m.neto, m.iva, m.retencion, m.total, v_tc, v_fecha, f.id, v_mes);
            n := n + 1;
        END LOOP;
        PERFORM fin.fn_gasto_fijo_prever_pagos(f.id);
    END LOOP;
    RETURN n;
END $function$;

REVOKE ALL ON FUNCTION fin.fn_gasto_fijo_cuota_de(bigint, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION fin.fn_gasto_fijo_prever_pagos(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION fin.fn_generar_cuotas_atrasadas(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fin.fn_gasto_fijo_cuota_de(bigint, date) TO tc_app, tc_admin, tc_lectura, tc_auditor;

-- El generador de siempre: la cuota lleva el número del calendario y, al final, se emiten las atrasadas
DO $do$
DECLARE v text := pg_get_functiondef('fin.fn_generar_gastos_fijos_mes(date)'::regprocedure);
BEGIN
    IF v LIKE '%fn_generar_cuotas_atrasadas%' THEN RETURN; END IF;
    IF position('(fin.fn_gasto_fijo_cuotas_hechas(f.id) + 1)' IN v) = 0 OR (length(v) - length(replace(v, 'RETURN n;', ''))) / 9 <> 1 THEN
        RAISE EXCEPTION 'fin.fn_generar_gastos_fijos_mes no es la que esperaba esta migración: avisar antes de seguir';
    END IF;
    v := replace(v, '(fin.fn_gasto_fijo_cuotas_hechas(f.id) + 1)', 'fin.fn_gasto_fijo_cuota_de(f.id, v_mes)');
    v := replace(v, 'RETURN n;', 'n := n + fin.fn_generar_cuotas_atrasadas(v_mes);
    RETURN n;');
    EXECUTE v;
END $do$;

-- La lista: cuotas pagadas, si terminó, si hay atraso y el detalle de las cuotas sin pagar
DO $do$
DECLARE v text := pg_get_functiondef('fin.fn_gastos_fijos()'::regprocedure); i integer; j integer;
        a constant text := '''cuota_actual'', CASE WHEN f.cuotas IS NOT NULL THEN least(fin.fn_gasto_fijo_cuotas_hechas';
        b constant text := 'fin.fn_gasto_fijo_cuotas_hechas(f.id) < f.cuotas,';
BEGIN
    IF v LIKE '%cuotas_sin_pagar%' THEN RETURN; END IF;
    i := position(a IN v); j := position(b IN v);
    IF i = 0 OR j = 0 OR j < i THEN RAISE EXCEPTION 'fin.fn_gastos_fijos no es la que esperaba esta migración: avisar antes de seguir'; END IF;
    v := substring(v FROM 1 FOR i - 1)
      || '''cuota_actual'', CASE WHEN f.cuotas IS NOT NULL THEN greatest(f.cuotas - (f.cuotas - least(fin.fn_gasto_fijo_cuotas_hechas(f.id), f.cuotas))
                              - (SELECT count(*) FROM fin.gasto g WHERE g.gasto_fijo_id = f.id AND g.estado <> ''anulado'' AND g.eliminado_en IS NULL AND fin.fn_saldo_gasto(g.id) > 0), 0) END,
                       ''terminado'', CASE WHEN f.cuotas IS NOT NULL THEN fin.fn_gasto_fijo_cuotas_hechas(f.id) >= f.cuotas
                                              AND NOT EXISTS (SELECT 1 FROM fin.gasto g WHERE g.gasto_fijo_id = f.id AND g.estado <> ''anulado'' AND g.eliminado_en IS NULL AND fin.fn_saldo_gasto(g.id) > 0)
                                         ELSE f.hasta IS NOT NULL AND f.hasta < v_mes END,
                       ''atrasado'', f.cuotas IS NOT NULL AND EXISTS (SELECT 1 FROM fin.gasto g WHERE g.gasto_fijo_id = f.id AND g.estado <> ''anulado'' AND g.eliminado_en IS NULL
                                                                      AND fin.fn_saldo_gasto(g.id) > 0 AND g.vence < mae.fn_hoy()),
                       ''cuotas_sin_pagar'', CASE WHEN f.cuotas IS NOT NULL THEN coalesce((
                            SELECT jsonb_agg(jsonb_build_object(''gasto_id'', g.id, ''cuota'', fin.fn_gasto_fijo_cuota_de(f.id, g.periodo), ''periodo'', g.periodo, ''vence'', g.vence,
                                       ''pago_previsto'', g.pago_previsto, ''total'', g.total, ''saldo'', fin.fn_saldo_gasto(g.id), ''moneda'', g.moneda,
                                       ''dias_vencido'', greatest(mae.fn_hoy() - g.vence, 0)) ORDER BY g.periodo)
                              FROM fin.gasto g WHERE g.gasto_fijo_id = f.id AND g.estado <> ''anulado'' AND g.eliminado_en IS NULL AND fin.fn_saldo_gasto(g.id) > 0), ''[]''::jsonb) END,'
      || substring(v FROM j + length(b));
    EXECUTE v;
END $do$;

-- Por pagar: suma la fecha prevista (la pantalla y la proyección de caja pueden usarla)
DO $do$
DECLARE v text := pg_get_functiondef('fin.fn_por_pagar()'::regprocedure); a constant text := '''fecha'', g.fecha, ''vence'', g.vence,';
BEGIN
    IF v LIKE '%pago_previsto%' THEN RETURN; END IF;
    IF position(a IN v) = 0 THEN RAISE EXCEPTION 'fin.fn_por_pagar no es la que esperaba esta migración: avisar antes de seguir'; END IF;
    EXECUTE replace(v, a, a || ' ''pago_previsto'', coalesce(g.pago_previsto, g.vence),');
END $do$;

COMMIT;
