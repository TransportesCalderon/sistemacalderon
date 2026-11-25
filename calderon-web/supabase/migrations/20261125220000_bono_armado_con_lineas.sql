-- La línea entera de la operación sin bono (por ejemplo ERIOS-STGO): el bono se arma con las líneas que la componen
--   · Si la línea del movimiento no tiene bono, o no hay línea, se busca el camino de líneas CON bono que va del origen
--     al destino (hasta 3 líneas, la menor cantidad): ER → MZA → STGO = ER-MZA + MZA-STGO = 160.000, con sus km.
--   · Hasta dónde llegó cada chofer lo dice Operaciones: si hubo relevo en Mendoza, cada uno tiene su movimiento
--     (ER → MZA y MZA → STGO) y cobra su línea. Si no se registró relevo, el movimiento es entero del chofer.
--   · Vacíos siguen sin pagarse. Sin camino posible: «Sin línea», lo ajusta RRHH.
-- Va después de la 20261125200000. No cambia web.version_base.

CREATE OR REPLACE FUNCTION fin.fn_lineas_camino(p_origen bigint, p_destino bigint, p_fecha date)
RETURNS TABLE (lineas text, canon_base numeric, km numeric, cantidad int)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    WITH RECURSIVE ln AS (
        SELECT l.id, l.codigo, l.lugar_retiro_id AS o, l.lugar_entrega_id AS d, l.distancia_km,
               CASE WHEN l.canon_moneda::text = ref.fn_moneda_base() THEN l.canon_chofer ELSE ops.fn_a_moneda_base(l.canon_chofer, l.canon_moneda::text, p_fecha) END AS canon,
               l.activa
          FROM mae.linea l
         WHERE l.eliminado_en IS NULL AND l.canon_chofer IS NOT NULL AND l.lugar_retiro_id <> l.lugar_entrega_id),
    c AS (
        SELECT ln.d, ARRAY[ln.o, ln.d] AS lugares, ARRAY[ln.codigo] AS codigos, ln.canon, coalesce(ln.distancia_km, 0) AS km,
               1 AS saltos, (NOT ln.activa)::int AS inactivas
          FROM ln WHERE ln.o = p_origen
        UNION ALL
        SELECT ln.d, c.lugares || ln.d, c.codigos || ln.codigo, c.canon + ln.canon, c.km + coalesce(ln.distancia_km, 0),
               c.saltos + 1, c.inactivas + (NOT ln.activa)::int
          FROM c JOIN ln ON ln.o = c.d
         WHERE c.saltos < 3 AND c.d <> p_destino AND NOT (ln.d = ANY (c.lugares)))
    SELECT array_to_string(c.codigos, ' + '), c.canon, c.km, c.saltos
      FROM c
     WHERE c.d = p_destino AND c.canon IS NOT NULL AND p_origen IS NOT NULL AND p_destino IS NOT NULL AND p_origen <> p_destino
     ORDER BY c.saltos, c.inactivas, c.km
     LIMIT 1
$f$;
REVOKE ALL ON FUNCTION fin.fn_lineas_camino(bigint, bigint, date) FROM PUBLIC;

DROP FUNCTION IF EXISTS fin.fn_movimientos_liquidacion(bigint);
CREATE FUNCTION fin.fn_movimientos_liquidacion(p_liq bigint)
 RETURNS TABLE(clave bigint, tramos bigint[], servicio_id bigint, operacion bigint, tractor text, recorrido text, desde timestamp with time zone, hasta timestamp with time zone, con_carga boolean, linea_id bigint, km_movimiento numeric, origen_id bigint, destino_id bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
    l record; s record; i int; j int; n int; v_lin bigint; v_srv bigint;
    seg_t bigint[]; seg_o bigint[]; seg_d bigint[]; seg_on text[]; seg_dn text[]; seg_desde timestamptz[]; seg_hasta timestamptz[];
    seg_carga boolean[]; seg_km numeric[]; seg_op bigint[]; seg_tr text[];
BEGIN
    SELECT lm.chofer_id, lm.hasta, (ref.fn_parametro_texto('fin.liq_tramos_desde', '2026-10-27'))::date AS piso
      INTO l FROM fin.liquidacion_mensual lm WHERE lm.id = p_liq;
    IF NOT FOUND THEN RETURN; END IF;
    FOR v_srv IN
        SELECT DISTINCT coalesce(x.servicio_id, -x.tramo_id)
          FROM ops.fn_segmentos_chofer((l.piso - 60)::timestamp AT TIME ZONE 'America/Argentina/Mendoza',
                                       (l.hasta + 1)::timestamp AT TIME ZONE 'America/Argentina/Mendoza', l.chofer_id, NULL) x
         WHERE x.estado = 'cerrado' AND x.hasta IS NOT NULL
           AND x.hasta >= l.piso::timestamp AT TIME ZONE 'America/Argentina/Mendoza'
           AND x.hasta < (l.hasta + 1)::timestamp AT TIME ZONE 'America/Argentina/Mendoza'
    LOOP
        seg_t := '{}'; seg_o := '{}'; seg_d := '{}'; seg_on := '{}'; seg_dn := '{}'; seg_desde := '{}'; seg_hasta := '{}';
        seg_carga := '{}'; seg_km := '{}'; seg_op := '{}'; seg_tr := '{}';
        FOR s IN
            SELECT x.*, coalesce(t.km_recorridos, t.km_recorridos_telemetria) AS km
              FROM ops.fn_segmentos_chofer((l.piso - 60)::timestamp AT TIME ZONE 'America/Argentina/Mendoza',
                                           (l.hasta + 1)::timestamp AT TIME ZONE 'America/Argentina/Mendoza', l.chofer_id, NULL) x
              JOIN ops.tramo_operativo t ON t.id = x.tramo_id
             WHERE coalesce(x.servicio_id, -x.tramo_id) = v_srv AND x.estado = 'cerrado' AND x.hasta IS NOT NULL
               AND x.hasta >= l.piso::timestamp AT TIME ZONE 'America/Argentina/Mendoza'
               AND x.hasta < (l.hasta + 1)::timestamp AT TIME ZONE 'America/Argentina/Mendoza'
             ORDER BY x.desde, x.tramo_id
        LOOP
            seg_t := seg_t || s.tramo_id; seg_o := seg_o || s.origen_id; seg_d := seg_d || s.destino_id;
            seg_on := seg_on || s.origen; seg_dn := seg_dn || s.destino; seg_desde := seg_desde || s.desde; seg_hasta := seg_hasta || s.hasta;
            seg_carga := seg_carga || coalesce(s.con_carga, true); seg_km := seg_km || s.km; seg_op := seg_op || s.numero_operacion;
            seg_tr := seg_tr || s.tractor;
        END LOOP;
        n := coalesce(array_length(seg_t, 1), 0);
        i := 1;
        WHILE i <= n LOOP
            -- el tramo más largo (seguido, mismo chofer, misma operación) que tenga línea de punta a punta
            v_lin := NULL; j := n;
            WHILE j >= i LOOP
                IF j = i OR NOT EXISTS (SELECT 1 FROM generate_series(i, j - 1) k WHERE seg_d[k] IS DISTINCT FROM seg_o[k + 1]) THEN
                    v_lin := fin.fn_linea_de(seg_o[i], seg_d[j], CASE WHEN v_srv > 0 THEN v_srv END);
                    EXIT WHEN v_lin IS NOT NULL;
                END IF;
                j := j - 1;
            END LOOP;
            IF v_lin IS NULL THEN j := i; END IF;
            clave := seg_t[i]; tramos := seg_t[i:j]; servicio_id := CASE WHEN v_srv > 0 THEN v_srv END; operacion := seg_op[i];
            tractor := seg_tr[i]; recorrido := seg_on[i] || ' → ' || seg_dn[j];
            IF j > i THEN recorrido := recorrido || ' (' || (j - i + 1) || ' movimientos)'; END IF;
            desde := seg_desde[i]; hasta := seg_hasta[j];
            con_carga := EXISTS (SELECT 1 FROM generate_series(i, j) k WHERE seg_carga[k]);
            linea_id := v_lin;
            km_movimiento := (SELECT sum(seg_km[k]) FROM generate_series(i, j) k);
            origen_id := seg_o[i]; destino_id := seg_d[j];
            RETURN NEXT;
            i := j + 1;
        END LOOP;
    END LOOP;
END $function$;

REVOKE ALL ON FUNCTION fin.fn_movimientos_liquidacion(bigint) FROM PUBLIC;

CREATE OR REPLACE FUNCTION fin.fn_tramos_liquidacion(p_liq bigint)
 RETURNS TABLE(item_id bigint, viaje text, salida date, llegada date, linea text, recorrido text, km numeric, canon numeric, canon_moneda text, canon_base numeric, estado text, detalle text, ajustado boolean, motivo text, fuente_fecha text, viaje_salida date, viaje_llegada date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
    WITH l AS (
        SELECT lm.id, lm.chofer_id, ch.fecha_egreso FROM fin.liquidacion_mensual lm JOIN mae.chofer ch ON ch.id = lm.chofer_id WHERE lm.id = p_liq),
    m AS (
        SELECT mv.*, coalesce(CASE WHEN cam.lineas IS NOT NULL THEN cam.lineas END, ln.codigo) AS linea, ln.codigo AS linea_op,
               ln.canon_chofer, ln.canon_moneda::text AS lmoneda, ln.distancia_km, cam.lineas AS cam_lineas, cam.canon_base AS cam_canon, cam.km AS cam_km,
               a.liquidar, a.canon AS a_canon, a.canon_moneda::text AS a_moneda, a.km AS a_km, a.motivo,
               (a.liquidar IS TRUE AND (a.canon IS NOT NULL OR a.km IS NOT NULL)) AS ajustado,
               l.fecha_egreso, l.id AS liq, l.chofer_id,
               (SELECT lm2.numero || ' (' || to_char(lm2.periodo, 'MM/YYYY') || ')'
                  FROM fin.liquidacion_renglon r2 JOIN fin.liquidacion_mensual lm2 ON lm2.id = r2.liquidacion_id
                 WHERE r2.codigo = 'CANON' AND r2.eliminado_en IS NULL AND lm2.id <> l.id AND lm2.chofer_id = l.chofer_id
                   AND lm2.estado <> 'anulada' AND lm2.eliminado_en IS NULL
                   AND jsonb_typeof(r2.referencia -> 'tramos') = 'array'
                   AND EXISTS (SELECT 1 FROM unnest(mv.tramos) x WHERE (r2.referencia -> 'tramos') @> to_jsonb(x))
                 LIMIT 1) AS en_otra
          FROM l
          CROSS JOIN LATERAL fin.fn_movimientos_liquidacion(l.id) mv
          LEFT JOIN mae.linea ln ON ln.id = mv.linea_id
          -- La línea no tiene bono (o no hay línea): se arma con las líneas con bono que cubren el recorrido (ER-MZA + MZA-STGO)
          LEFT JOIN LATERAL fin.fn_lineas_camino(mv.origen_id, mv.destino_id, (mv.hasta AT TIME ZONE 'America/Argentina/Mendoza')::date) cam
            ON mv.con_carga AND (ln.id IS NULL OR ln.canon_chofer IS NULL)
          LEFT JOIN fin.movimiento_liquidacion a ON a.tramo_id = mv.clave AND a.chofer_id = l.chofer_id),
    v AS (
        SELECT m.*,
               (m.desde AT TIME ZONE 'America/Argentina/Mendoza')::date AS f_desde,
               (m.hasta AT TIME ZONE 'America/Argentina/Mendoza')::date AS f_hasta,
               CASE WHEN m.ajustado AND m.a_km IS NOT NULL THEN m.a_km ELSE coalesce(m.cam_km, m.distancia_km, m.km_movimiento) END AS v_km,
               CASE WHEN m.ajustado AND m.a_canon IS NOT NULL THEN m.a_canon ELSE coalesce(m.canon_chofer, m.cam_canon) END AS v_canon,
               CASE WHEN m.ajustado AND m.a_canon IS NOT NULL THEN m.a_moneda WHEN m.canon_chofer IS NULL AND m.cam_canon IS NOT NULL THEN ref.fn_moneda_base() ELSE m.lmoneda END AS v_moneda
          FROM m)
    SELECT v.clave, 'Op. ' || coalesce(v.operacion::text, '—') || coalesce(' · ' || v.tractor, ''),
           v.f_desde, v.f_hasta, v.linea, v.recorrido, v.v_km, v.v_canon, v.v_moneda,
           CASE WHEN v.v_canon IS NULL THEN NULL WHEN v.v_moneda = ref.fn_moneda_base() THEN v.v_canon
                ELSE ops.fn_a_moneda_base(v.v_canon, v.v_moneda, v.f_hasta) END,
           CASE WHEN v.liquidar IS FALSE THEN 'no_se_liquida'
                WHEN v.en_otra IS NOT NULL THEN 'en_otra'
                WHEN v.fecha_egreso IS NOT NULL AND v.f_desde > v.fecha_egreso THEN 'despues_baja'
                WHEN v.ajustado THEN 'incluido'
                WHEN NOT v.con_carga THEN 'vacio'
                WHEN v.linea_id IS NULL AND v.cam_lineas IS NULL THEN 'sin_linea'
                ELSE 'incluido' END,
           CASE WHEN v.liquidar IS FALSE THEN v.motivo
                WHEN v.en_otra IS NOT NULL THEN 'Ya está en la liquidación ' || v.en_otra
                WHEN v.fecha_egreso IS NOT NULL AND v.f_desde > v.fecha_egreso THEN 'Empezó después de la baja del chofer (' || to_char(v.fecha_egreso, 'DD/MM/YYYY') || ')'
                WHEN v.ajustado THEN 'Ajustado: ' || v.motivo
                WHEN NOT v.con_carga THEN 'Vacío: no se paga'
                WHEN v.cam_lineas IS NOT NULL THEN 'Armado con ' || v.cam_lineas || CASE WHEN v.linea_op IS NOT NULL THEN ' (la línea ' || v.linea_op || ' no tiene bono)' ELSE '' END
                WHEN v.linea_id IS NULL THEN 'No hay una línea con este recorrido: si corresponde, poné el bono y los km'
                WHEN v.canon_chofer IS NULL THEN 'La línea ' || v.linea_op || ' no tiene bono y no hay líneas con bono que la armen: cargalo en la línea o ajustalo acá'
                WHEN v.fecha_egreso IS NOT NULL AND v.f_hasta > v.fecha_egreso THEN 'Terminó después de la baja: revisá que lo haya hecho él' END,
           coalesce(v.ajustado, false), v.motivo, 'operacion', v.f_desde, v.f_hasta
      FROM v
     ORDER BY v.desde, v.clave
$function$;

NOTIFY pgrst, 'reload schema';

SELECT 'Listo: el bono de las líneas sin monto se arma con sus tramos' AS resultado;
