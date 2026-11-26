-- =====================================================================================
-- Migración 366 · Tablero de Finanzas: estimado de lo que se les debe a los choferes en el mes (sin liquidar)
-- =====================================================================================
-- Pedido (26/11/2026): «En qué se fue la plata este mes» no muestra el bono por tramo ni el adicional por km de los
-- choferes. Es porque entran a la contabilidad recién cuando se aprueba la liquidación. Mientras tanto se muestra un
-- estimado, calculado igual que el paso 1 de la liquidación.
--
--   · fin.fn_estimado_choferes_mes(): para el período de liquidación del mes (del 27 al 26), por cada chofer que todavía
--     no tiene la liquidación aprobada o pagada:
--       - si ya tiene el borrador, usa sus tramos (fin.fn_tramos_liquidacion), con lo que ajustó RRHH;
--       - si no, arma un borrador de prueba dentro de una subtransacción, lee sus tramos y lo deshace (no queda nada:
--         ni la liquidación, ni el número, ni la auditoría).
--     Suma el bono de los tramos «incluido» y los km × el precio por km del chofer. Devuelve el total y el detalle.
--   · Tarda unos segundos (calcula chofer por chofer): el resultado se guarda en fin.estimado_choferes y se reusa por
--     30 minutos (o se recalcula con p_recalcular = true).
--   · Para quien ve el tablero de Finanzas. No toca la contabilidad. No cambia web.version_base.
-- =====================================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS fin.estimado_choferes (
    periodo      date PRIMARY KEY,
    datos        jsonb NOT NULL,
    calculado_en timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON fin.estimado_choferes FROM PUBLIC;

DROP FUNCTION IF EXISTS fin.fn_estimado_choferes_mes();
DROP FUNCTION IF EXISTS fin.fn_estimado_choferes_mes(boolean);
CREATE FUNCTION fin.fn_estimado_choferes_mes(p_recalcular boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
    v_per date := date_trunc('month', mae.fn_hoy())::date; r record; c record; v_liq bigint; v_base text := ref.fn_moneda_base();
    v_canon numeric; v_km numeric; v_precio numeric; v_n int; v_tot_canon numeric := 0; v_tot_km numeric := 0; v_tot_km_l numeric := 0;
    v_det jsonb := '[]'; v_errores int := 0; v_borradores int := 0; v_res jsonb;
BEGIN
    PERFORM fin.fn_exigir_lectura_finanzas();
    IF NOT p_recalcular THEN
        SELECT e.datos || jsonb_build_object('calculado_en', e.calculado_en) INTO v_res FROM fin.estimado_choferes e
         WHERE e.periodo = v_per AND e.calculado_en > now() - interval '30 minutes';
        IF v_res IS NOT NULL THEN RETURN v_res; END IF;
    END IF;
    SELECT * INTO r FROM fin.fn_rango_periodo(v_per);
    FOR c IN SELECT ch.id FROM mae.chofer ch
              WHERE ch.eliminado_en IS NULL AND ch.fecha_ingreso <= r.hasta AND (ch.fecha_egreso IS NULL OR ch.fecha_egreso >= r.desde)
                AND NOT EXISTS (SELECT 1 FROM fin.liquidacion_mensual l WHERE l.chofer_id = ch.id AND l.periodo = v_per
                                  AND l.estado IN ('aprobada','pagada') AND l.eliminado_en IS NULL)
              ORDER BY ch.id LOOP
        v_canon := NULL; v_km := NULL; v_n := 0;
        v_precio := (SELECT t.precio_km FROM fin.fn_tarifa_en(c.id, r.hasta) t);
        SELECT id INTO v_liq FROM fin.liquidacion_mensual
         WHERE chofer_id = c.id AND periodo = v_per AND estado = 'borrador' AND eliminado_en IS NULL;
        IF v_liq IS NOT NULL THEN
            v_borradores := v_borradores + 1;
            SELECT count(*), sum(x.canon_base), sum(x.km) INTO v_n, v_canon, v_km
              FROM fin.fn_tramos_liquidacion(v_liq) x WHERE x.estado = 'incluido';
        ELSE
            BEGIN
                PERFORM set_config('fin.liq_fn', '1', true);
                INSERT INTO fin.liquidacion_mensual (numero, chofer_id, periodo, desde, hasta, moneda)
                VALUES ('ESTIMADO-' || c.id, c.id, v_per, r.desde, r.hasta, v_base) RETURNING id INTO v_liq;
                SELECT count(*), sum(x.canon_base), sum(x.km) INTO v_n, v_canon, v_km
                  FROM fin.fn_tramos_liquidacion(v_liq) x WHERE x.estado = 'incluido';
                RAISE EXCEPTION 'deshacer' USING ERRCODE = 'ZZ366';   -- deshace el borrador de prueba; las variables quedan
            EXCEPTION
                WHEN SQLSTATE 'ZZ366' THEN NULL;
                WHEN OTHERS THEN v_errores := v_errores + 1; v_n := 0;
            END;
        END IF;
        IF coalesce(v_n, 0) > 0 THEN
            v_tot_canon := v_tot_canon + coalesce(v_canon, 0);
            v_tot_km := v_tot_km + coalesce(v_km, 0) * coalesce(v_precio, 0);
            v_tot_km_l := v_tot_km_l + coalesce(v_km, 0);
            v_det := v_det || jsonb_build_object('chofer_id', c.id, 'chofer', ops.fn_nombre_chofer(c.id), 'tramos', v_n,
                                                 'bono', round(coalesce(v_canon, 0)), 'km', round(coalesce(v_km, 0)),
                                                 'adicional_km', round(coalesce(v_km, 0) * coalesce(v_precio, 0)));
        END IF;
    END LOOP;
    v_res := jsonb_build_object(
        'periodo', v_per, 'desde', r.desde, 'hasta', r.hasta, 'moneda', v_base,
        'bono', round(v_tot_canon), 'adicional_km', round(v_tot_km), 'km', round(v_tot_km_l),
        'total', round(v_tot_canon + v_tot_km), 'choferes', jsonb_array_length(v_det), 'borradores', v_borradores,
        'errores', v_errores, 'detalle', v_det);
    INSERT INTO fin.estimado_choferes (periodo, datos, calculado_en) VALUES (v_per, v_res, now())
    ON CONFLICT (periodo) DO UPDATE SET datos = EXCLUDED.datos, calculado_en = EXCLUDED.calculado_en;
    RETURN v_res || jsonb_build_object('calculado_en', now());
END $function$;

-- Permisos: los mismos que el tablero de Finanzas
DO $g$
DECLARE r record;
BEGIN
    REVOKE ALL ON FUNCTION fin.fn_estimado_choferes_mes(boolean) FROM PUBLIC;
    FOR r IN SELECT a.grantee FROM pg_proc p, aclexplode(p.proacl) a
              WHERE p.oid = 'fin.fn_tablero_finanzas()'::regprocedure AND a.privilege_type = 'EXECUTE' AND a.grantee <> 0 LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_estimado_choferes_mes(boolean) TO %I', pg_get_userbyid(r.grantee));
    END LOOP;
END $g$;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'Listo: el tablero muestra el estimado de los choferes del mes' AS resultado;
