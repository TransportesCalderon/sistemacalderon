-- =====================================================================================
-- Migración 372 · Tablero financiero en pesos chilenos o en dólares
-- =====================================================================================
-- Pedido (26/11/2026): poder ver el tablero financiero en CLP o en USD.
--   · fin.fn_tablero_finanzas (envoltorio; la anterior queda como fin.fn_tablero_finanzas_sin_usd) agrega:
--       tc_usd       = dólar de hoy (el último cargado hasta hoy, en CLP por USD): para los saldos de hoy
--                      (bancos, por cobrar, por pagar, fondos…);
--       tc_usd_fecha = la fecha de ese dólar;
--       tc_usd_meses = el dólar de cada mes del gráfico (promedio de los cargados en el mes; si no hay, el último antes
--                      de que termine el mes): para ingresos, gastos y resultado de cada mes.
--   · La conversión la hace la web; la contabilidad sigue en pesos.
-- No cambia datos ni web.version_base. Se puede correr más de una vez.
-- =====================================================================================
BEGIN;

DO $r$
BEGIN
    IF to_regprocedure('fin.fn_tablero_finanzas_sin_usd()') IS NULL THEN
        ALTER FUNCTION fin.fn_tablero_finanzas() RENAME TO fn_tablero_finanzas_sin_usd;
    END IF;
END $r$;

-- Dólar de un mes: promedio de los cargados en el mes (USD→CLP o CLP→USD); si no hay, el último hasta fin de mes
CREATE OR REPLACE FUNCTION fin.fn_tc_usd_mes(p_mes date)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
    SELECT coalesce(
        (SELECT round(avg(x.t), 4) FROM (
            SELECT tc.tasa AS t FROM fin.tipo_cambio tc
             WHERE tc.moneda_origen = 'USD' AND tc.moneda_destino = 'CLP' AND tc.eliminado_en IS NULL AND tc.tasa > 0
               AND tc.fecha >= date_trunc('month', p_mes) AND tc.fecha < date_trunc('month', p_mes) + interval '1 month'
            UNION ALL
            SELECT 1 / tc.tasa FROM fin.tipo_cambio tc
             WHERE tc.moneda_origen = 'CLP' AND tc.moneda_destino = 'USD' AND tc.eliminado_en IS NULL AND tc.tasa > 0
               AND tc.fecha >= date_trunc('month', p_mes) AND tc.fecha < date_trunc('month', p_mes) + interval '1 month') x),
        fin.fn_tc_clp_o_null('USD', least((date_trunc('month', p_mes) + interval '1 month - 1 day')::date, mae.fn_hoy())))
$function$;

CREATE OR REPLACE FUNCTION fin.fn_tablero_finanzas()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE t jsonb := fin.fn_tablero_finanzas_sin_usd(); v_hoy date := mae.fn_hoy();
BEGIN
    RETURN t || jsonb_build_object(
        'tc_usd', fin.fn_tc_clp_o_null('USD', v_hoy),
        'tc_usd_fecha', (SELECT max(tc.fecha) FROM fin.tipo_cambio tc
                          WHERE tc.eliminado_en IS NULL AND tc.tasa > 0 AND tc.fecha <= v_hoy
                            AND ((tc.moneda_origen = 'USD' AND tc.moneda_destino = 'CLP') OR (tc.moneda_origen = 'CLP' AND tc.moneda_destino = 'USD'))),
        'tc_usd_meses', coalesce((SELECT jsonb_agg(fin.fn_tc_usd_mes(m::date) ORDER BY n)
                                    FROM jsonb_array_elements_text(t -> 'meses') WITH ORDINALITY AS x(m, n)), '[]'::jsonb));
END $function$;

-- Permisos: los mismos que tenía
DO $g$
DECLARE r record;
BEGIN
    REVOKE ALL ON FUNCTION fin.fn_tablero_finanzas() FROM PUBLIC;
    FOR r IN SELECT a.grantee FROM pg_proc p, aclexplode(p.proacl) a
              WHERE p.oid = 'fin.fn_tablero_finanzas_sin_usd()'::regprocedure AND a.privilege_type = 'EXECUTE' AND a.grantee <> 0 LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_tablero_finanzas() TO %I', pg_get_userbyid(r.grantee));
    END LOOP;
END $g$;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'Listo: el tablero trae el dólar de hoy y el de cada mes' AS resultado,
       (SELECT fin.fn_tc_clp_o_null('USD', mae.fn_hoy())) AS dolar_de_hoy;
