-- Fechas de cada tramo en la liquidación (antes mostraba la salida y la llegada del viaje en todos los tramos)
-- Cada tramo (renglón del viaje del chofer: una línea, por ejemplo SAI-MZA) toma, en este orden:
--   1. Los tramos operativos de su operación que salen del origen de la línea (desde) o llegan a su destino (hasta),
--      con la hora del chofer si quedó registrada (relevos).
--   2. Si la operación tiene un solo tramo en este viaje: los hitos (retiro de contenedor / carga → entrega)
--      o el inicio y fin reales de la operación.
--   3. Lo que falte se estima: un tramo termina cuando empieza el siguiente, y el tiempo entre dos fechas
--      conocidas (o la salida y la llegada del viaje) se reparte según los km de cada tramo. Queda «estimada».
-- Una fecha fuera del viaje (más de un día antes de la salida o después de la llegada) no se usa.
-- La baja del chofer ahora se mira con la fecha de cada tramo (salió después de la baja → no entra).
-- Va después de la 20261125160000 (liquidación por tramo). No cambia web.version_base.

CREATE OR REPLACE FUNCTION fin.fn_fechas_tramos_viaje(p_viaje bigint)
RETURNS TABLE (item_id bigint, desde timestamptz, hasta timestamptz, fuente text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE
    v ops.viaje_chofer%ROWTYPE; r record; i int := 0; n int;
    ids bigint[] := '{}'; ds timestamptz[] := '{}'; hs timestamptz[] := '{}'; est boolean[] := '{}'; kms numeric[] := '{}';
    b timestamptz[]; j int; k int; v_tot numeric; v_acc numeric;
    v_d timestamptz; v_h timestamptz; v_min timestamptz; v_max timestamptz; v_solo boolean;
BEGIN
    SELECT * INTO v FROM ops.viaje_chofer WHERE id = p_viaje;
    IF NOT FOUND THEN RETURN; END IF;
    v_min := v.salida_ts - interval '1 day';
    v_max := coalesce(v.llegada_ts, now()) + interval '1 day';
    FOR r IN SELECT it.id, it.servicio_id, ln.lugar_retiro_id, ln.lugar_entrega_id, greatest(coalesce(it.km, ln.distancia_km, 1), 1) AS km
               FROM ops.viaje_chofer_item it LEFT JOIN mae.linea ln ON ln.id = it.linea_id
              WHERE it.viaje_id = p_viaje AND it.eliminado_en IS NULL ORDER BY it.id LOOP
        -- 1 · Tramos operativos de la operación que salen del origen / llegan al destino de la línea
        SELECT min(coalesce(tc.desde_ts, t.inicio_real)) INTO v_d
          FROM ops.servicio_tramo st JOIN ops.tramo_operativo t ON t.id = st.tramo_id AND t.eliminado_en IS NULL AND t.estado <> 'anulado'
          LEFT JOIN ops.tramo_chofer tc ON tc.tramo_id = t.id AND tc.chofer_id = v.chofer_id AND tc.eliminado_en IS NULL
         WHERE st.servicio_id = r.servicio_id AND st.eliminado_en IS NULL AND t.origen_id = r.lugar_retiro_id
           AND coalesce(tc.desde_ts, t.inicio_real) BETWEEN v_min AND v_max;
        SELECT max(coalesce(tc.hasta_ts, t.fin_real)) INTO v_h
          FROM ops.servicio_tramo st JOIN ops.tramo_operativo t ON t.id = st.tramo_id AND t.eliminado_en IS NULL AND t.estado <> 'anulado'
          LEFT JOIN ops.tramo_chofer tc ON tc.tramo_id = t.id AND tc.chofer_id = v.chofer_id AND tc.eliminado_en IS NULL
         WHERE st.servicio_id = r.servicio_id AND st.eliminado_en IS NULL AND t.destino_id = r.lugar_entrega_id
           AND coalesce(tc.hasta_ts, t.fin_real) BETWEEN v_min AND v_max;
        -- 2 · La operación tiene un solo tramo en este viaje: sus hitos o sus fechas reales
        SELECT count(*) = 1 INTO v_solo FROM ops.viaje_chofer_item x
         WHERE x.viaje_id = p_viaje AND x.servicio_id = r.servicio_id AND x.eliminado_en IS NULL;
        IF v_solo AND r.servicio_id IS NOT NULL THEN
            IF v_d IS NULL THEN
                SELECT min(h.ts) INTO v_d FROM ops.servicio_hito h
                 WHERE h.servicio_id = r.servicio_id AND h.eliminado_en IS NULL AND h.tipo IN ('retiro_contenedor', 'carga') AND h.ts BETWEEN v_min AND v_max;
                IF v_d IS NULL THEN
                    SELECT s.fecha_real_inicio INTO v_d FROM ops.servicio_comercial s
                     WHERE s.id = r.servicio_id AND s.fecha_real_inicio BETWEEN v_min AND v_max;
                END IF;
            END IF;
            IF v_h IS NULL THEN
                SELECT max(h.ts) INTO v_h FROM ops.servicio_hito h
                 WHERE h.servicio_id = r.servicio_id AND h.eliminado_en IS NULL AND h.tipo = 'entrega' AND h.ts BETWEEN v_min AND v_max;
                IF v_h IS NULL THEN
                    SELECT s.fecha_real_fin INTO v_h FROM ops.servicio_comercial s
                     WHERE s.id = r.servicio_id AND s.fecha_real_fin BETWEEN v_min AND v_max;
                END IF;
            END IF;
        END IF;
        IF v_d IS NOT NULL AND v_h IS NOT NULL AND v_h < v_d THEN v_h := NULL; END IF;
        ids := ids || r.id; ds := ds || v_d; hs := hs || v_h; est := est || (v_d IS NULL OR v_h IS NULL); kms := kms || r.km;
    END LOOP;
    n := coalesce(array_length(ids, 1), 0);
    IF n = 0 THEN RETURN; END IF;
    -- 3 · Bordes entre tramos: b[0] = empieza el primero, b[i] = termina el tramo i (= empieza el i+1), b[n] = termina el último.
    --     (índices corridos en 1: b[1] es el borde 0)
    b := array_fill(NULL::timestamptz, ARRAY[n + 1]);
    b[1] := coalesce(ds[1], v.salida_ts);
    b[n + 1] := coalesce(hs[n], v.llegada_ts, now());
    FOR i IN 1 .. n - 1 LOOP
        b[i + 1] := coalesce(hs[i], ds[i + 1]);
    END LOOP;
    -- los bordes que faltan se reparten por km entre los conocidos
    j := 1;
    WHILE j <= n LOOP
        IF b[j + 1] IS NULL THEN
            k := j + 1;
            WHILE b[k + 1] IS NULL LOOP k := k + 1; END LOOP;   -- b[k+1] conocido (b[n+1] siempre lo es)
            v_tot := 0; FOR i IN j .. k LOOP v_tot := v_tot + kms[i]; END LOOP;
            v_acc := 0;
            FOR i IN j .. k - 1 LOOP
                v_acc := v_acc + kms[i];
                b[i + 1] := b[j] + (b[k + 1] - b[j]) * (v_acc / v_tot)::float8;
            END LOOP;
            j := k;
        ELSE
            j := j + 1;
        END IF;
    END LOOP;
    FOR i IN 1 .. n LOOP
        ds[i] := coalesce(ds[i], b[i]);
        hs[i] := coalesce(hs[i], b[i + 1]);
        IF hs[i] < ds[i] THEN hs[i] := ds[i]; END IF;
    END LOOP;
    FOR i IN 1 .. n LOOP
        item_id := ids[i]; desde := ds[i]; hasta := hs[i]; fuente := CASE WHEN est[i] THEN 'estimada' ELSE 'operacion' END;
        RETURN NEXT;
    END LOOP;
END $f$;
REVOKE ALL ON FUNCTION fin.fn_fechas_tramos_viaje(bigint) FROM PUBLIC;

-- Los tramos de la liquidación, ahora con la fecha de cada uno (salida / llegada = del tramo)
DROP FUNCTION IF EXISTS fin.fn_tramos_liquidacion(bigint);
CREATE FUNCTION fin.fn_tramos_liquidacion(p_liq bigint)
RETURNS TABLE (item_id bigint, viaje text, salida date, llegada date, linea text, recorrido text,
               km numeric, canon numeric, canon_moneda text, canon_base numeric, estado text, detalle text, ajustado boolean, motivo text,
               fuente_fecha text, viaje_salida date, viaje_llegada date)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    WITH l AS (
        SELECT lm.id, lm.chofer_id, lm.hasta, ch.fecha_egreso,
               (ref.fn_parametro_texto('fin.liq_tramos_desde', '2026-10-27'))::date AS piso
          FROM fin.liquidacion_mensual lm JOIN mae.chofer ch ON ch.id = lm.chofer_id
         WHERE lm.id = p_liq),
    t AS (
        SELECT i.id, x.numero,
               (f.desde AT TIME ZONE 'America/Argentina/Mendoza')::date AS salida,
               (f.hasta AT TIME ZONE 'America/Argentina/Mendoza')::date AS llegada,
               f.fuente,
               (x.salida_ts AT TIME ZONE 'America/Argentina/Mendoza')::date AS v_salida,
               (x.llegada_ts AT TIME ZONE 'America/Argentina/Mendoza')::date AS v_llegada,
               ln.codigo AS linea, ur.nombre || ' → ' || ue.nombre AS recorrido,
               CASE WHEN a.liquidar AND a.km IS NOT NULL THEN a.km ELSE i.km END AS km,
               CASE WHEN a.liquidar AND a.canon IS NOT NULL THEN a.canon ELSE i.canon END AS canon,
               CASE WHEN a.liquidar AND a.canon IS NOT NULL THEN a.canon_moneda::text ELSE i.canon_moneda::text END AS moneda,
               a.liquidar, a.motivo, (a.item_id IS NOT NULL AND a.liquidar AND (a.canon IS NOT NULL OR a.km IS NOT NULL)) AS ajustado,
               l.fecha_egreso,
               (SELECT lm2.numero || ' (' || to_char(lm2.periodo, 'MM/YYYY') || ')'
                  FROM fin.liquidacion_renglon r2 JOIN fin.liquidacion_mensual lm2 ON lm2.id = r2.liquidacion_id
                 WHERE r2.codigo = 'CANON' AND r2.eliminado_en IS NULL AND lm2.id <> l.id AND lm2.estado <> 'anulada' AND lm2.eliminado_en IS NULL
                   AND jsonb_typeof(r2.referencia -> 'items') = 'array' AND (r2.referencia -> 'items') @> to_jsonb(i.id)
                 LIMIT 1) AS en_otra
          FROM l
          JOIN ops.viaje_chofer x ON x.chofer_id = l.chofer_id AND x.estado = 'cerrado' AND x.eliminado_en IS NULL
           AND x.llegada_ts < (l.hasta + 1)::timestamp AT TIME ZONE 'America/Argentina/Mendoza'
           AND x.llegada_ts >= l.piso::timestamp AT TIME ZONE 'America/Argentina/Mendoza'
          JOIN ops.viaje_chofer_item i ON i.viaje_id = x.id AND i.eliminado_en IS NULL
          LEFT JOIN LATERAL fin.fn_fechas_tramos_viaje(x.id) f ON f.item_id = i.id
          LEFT JOIN mae.linea ln ON ln.id = i.linea_id
          LEFT JOIN mae.ubicacion ur ON ur.id = ln.lugar_retiro_id
          LEFT JOIN mae.ubicacion ue ON ue.id = ln.lugar_entrega_id
          LEFT JOIN fin.tramo_liquidacion a ON a.item_id = i.id)
    SELECT t.id, t.numero, t.salida, t.llegada, t.linea, t.recorrido, t.km, t.canon, t.moneda,
           CASE WHEN t.canon IS NULL THEN NULL WHEN t.moneda = ref.fn_moneda_base() THEN t.canon
                ELSE ops.fn_a_moneda_base(t.canon, t.moneda, coalesce(t.llegada, t.v_llegada)) END,
           CASE WHEN t.liquidar IS FALSE THEN 'no_se_liquida'
                WHEN t.en_otra IS NOT NULL THEN 'en_otra'
                WHEN t.fecha_egreso IS NOT NULL AND t.salida > t.fecha_egreso THEN 'despues_baja'
                ELSE 'incluido' END,
           CASE WHEN t.liquidar IS FALSE THEN t.motivo
                WHEN t.en_otra IS NOT NULL THEN 'Ya está en la liquidación ' || t.en_otra
                WHEN t.fecha_egreso IS NOT NULL AND t.salida > t.fecha_egreso THEN 'El tramo empezó después de la baja del chofer (' || to_char(t.fecha_egreso, 'DD/MM/YYYY') || ')'
                WHEN t.ajustado THEN 'Ajustado: ' || t.motivo
                WHEN t.fecha_egreso IS NOT NULL AND t.llegada > t.fecha_egreso THEN 'El tramo terminó después de la baja: revisá que lo haya hecho él' END,
           coalesce(t.ajustado, false), t.motivo, t.fuente, t.v_salida, t.v_llegada
      FROM t
     ORDER BY t.v_salida, t.numero, t.id
$f$;

-- La liquidación para la pantalla: la fecha del tramo y de dónde salió
CREATE OR REPLACE FUNCTION fin.fn_liquidacion_json(p_liq bigint)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT fin.fn_liquidacion_json_sin_pasos(p_liq) || jsonb_build_object(
        'viatico_dia', ref.fn_parametro_num('fin.viatico_por_dia', 10000),
        'dias_trabajados', coalesce((SELECT jsonb_agg(jsonb_build_object('fecha', x.fecha, 'trabajado', x.trabajado, 'propuesto', x.propuesto,
                                                                        'fuente', x.fuente, 'detalle', nullif(x.detalle, ''), 'motivo', x.motivo) ORDER BY x.fecha)
                                       FROM fin.liquidacion_mensual l CROSS JOIN LATERAL fin.fn_dias_chofer(l.chofer_id, l.desde, l.hasta) x
                                      WHERE l.id = p_liq), '[]'::jsonb),
        'bono_desempeno', fin.fn_bono_propuesta(p_liq),
        'colaboradores', (SELECT jsonb_build_object('imponible', g.col_imponible, 'no_imponible', g.col_no_imponible, 'gratificacion', g.col_gratificacion,
                                                    'afp', g.col_afp, 'salud', g.col_salud, 'cesantia', g.col_cesantia, 'impuesto', g.col_impuesto,
                                                    'otros_descuentos', g.col_otros_descuentos, 'liquido', g.col_liquido,
                                                    'aporte_empleador', g.col_aporte_empleador, 'pdf_ruta', g.col_pdf_ruta, 'cargado_en', g.col_cargado_en)
                            FROM fin.liquidacion_legal g WHERE g.liquidacion_id = p_liq AND g.eliminado_en IS NULL AND g.col_liquido IS NOT NULL),
        'baja_chofer', (SELECT ch.fecha_egreso FROM fin.liquidacion_mensual l JOIN mae.chofer ch ON ch.id = l.chofer_id WHERE l.id = p_liq),
        'tramos', coalesce((SELECT jsonb_agg(jsonb_build_object('item_id', x.item_id, 'viaje', x.viaje, 'salida', x.salida, 'llegada', x.llegada,
                                                               'fuente_fecha', x.fuente_fecha, 'viaje_salida', x.viaje_salida, 'viaje_llegada', x.viaje_llegada,
                                                               'linea', x.linea, 'recorrido', x.recorrido, 'km', x.km, 'canon', x.canon,
                                                               'canon_moneda', x.canon_moneda, 'canon_base', x.canon_base, 'estado', x.estado,
                                                               'detalle', x.detalle, 'ajustado', x.ajustado, 'motivo', x.motivo)
                                             ORDER BY x.viaje_salida, x.viaje, x.item_id)
                              FROM fin.fn_tramos_liquidacion(p_liq) x), '[]'::jsonb))
$f$;

-- Permisos (el DROP se los llevó): los mismos que la planilla
DO $g$
DECLARE g record;
BEGIN
    REVOKE ALL ON FUNCTION fin.fn_tramos_liquidacion(bigint) FROM PUBLIC;
    FOR g IN SELECT DISTINCT grantee FROM information_schema.routine_privileges
              WHERE routine_schema = 'fin' AND routine_name = 'fn_planilla_detalle_sin_tramos' AND privilege_type = 'EXECUTE' AND grantee <> 'PUBLIC' LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_tramos_liquidacion(bigint) TO %I', g.grantee);
    END LOOP;
END $g$;

NOTIFY pgrst, 'reload schema';

SELECT 'Listo: cada tramo con sus fechas' AS resultado;
