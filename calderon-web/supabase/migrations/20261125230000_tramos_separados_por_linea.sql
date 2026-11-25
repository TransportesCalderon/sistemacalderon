-- Un movimiento que se paga con varias líneas se separa en un renglón por línea
--   Ejemplo: Op. 6240 Entre Ríos → Santiago (la línea ERIOS-STGO no tiene bono) = ER-MZA (80.000) + MZA-STGO (80.000).
--   Ahora son dos tramos: cada uno se puede marcar «No se liquida acá» (ER-MZA, ya pagado en octubre) o ajustar por separado.
--   · Fechas de cada parte: el tiempo del movimiento repartido según los km de cada línea.
--   · Clave de una parte: -(tramo × 10 + número de parte) (negativa, para no chocar con los tramos enteros).
--   · Si RRHH ya había ajustado el movimiento entero, se respeta (sale entero). «Volver a lo del viaje» lo separa.
--   · El renglón del bono guarda los tramos enteros («tramos») y las partes («partes»): cada cosa se paga una sola vez.
-- Va después de la 20261125220000. No cambia web.version_base.

-- Decisiones de RRHH por parte (0 = el movimiento entero)
ALTER TABLE fin.movimiento_liquidacion ADD COLUMN IF NOT EXISTS parte smallint NOT NULL DEFAULT 0;
DO $k$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'fin.movimiento_liquidacion'::regclass AND contype = 'p'
                 AND pg_get_constraintdef(oid) = 'PRIMARY KEY (tramo_id, chofer_id)') THEN
        EXECUTE (SELECT format('ALTER TABLE fin.movimiento_liquidacion DROP CONSTRAINT %I', conname)
                   FROM pg_constraint WHERE conrelid = 'fin.movimiento_liquidacion'::regclass AND contype = 'p');
        ALTER TABLE fin.movimiento_liquidacion ADD PRIMARY KEY (tramo_id, chofer_id, parte);
    END IF;
END $k$;

-- Las líneas con bono que arman un recorrido, una fila por línea (mismo criterio que fin.fn_lineas_camino)
CREATE OR REPLACE FUNCTION fin.fn_lineas_camino_partes(p_origen bigint, p_destino bigint)
RETURNS TABLE (parte int, partes int, linea_id bigint, codigo text, origen text, destino text, km numeric, canon numeric, canon_moneda text,
               km_antes numeric, km_total numeric)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    WITH RECURSIVE ln AS (
        SELECT l.id, l.lugar_retiro_id AS o, l.lugar_entrega_id AS d, coalesce(l.distancia_km, 0) AS km, l.activa
          FROM mae.linea l
         WHERE l.eliminado_en IS NULL AND l.canon_chofer IS NOT NULL AND l.lugar_retiro_id <> l.lugar_entrega_id),
    c AS (
        SELECT ln.d, ARRAY[ln.o, ln.d] AS lugares, ARRAY[ln.id] AS ids, ln.km, 1 AS saltos, (NOT ln.activa)::int AS inactivas
          FROM ln WHERE ln.o = p_origen
        UNION ALL
        SELECT ln.d, c.lugares || ln.d, c.ids || ln.id, c.km + ln.km, c.saltos + 1, c.inactivas + (NOT ln.activa)::int
          FROM c JOIN ln ON ln.o = c.d
         WHERE c.saltos < 3 AND c.d <> p_destino AND NOT (ln.d = ANY (c.lugares))),
    mejor AS (
        SELECT c.ids, c.km FROM c
         WHERE c.d = p_destino AND p_origen IS NOT NULL AND p_destino IS NOT NULL AND p_origen <> p_destino
         ORDER BY c.saltos, c.inactivas, c.km LIMIT 1)
    SELECT u.k::int, cardinality(m.ids), l.id, l.codigo, uo.nombre, ud.nombre, coalesce(l.distancia_km, 0), l.canon_chofer, l.canon_moneda::text,
           coalesce(sum(coalesce(l.distancia_km, 0)) OVER (ORDER BY u.k ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0), m.km
      FROM mejor m
     CROSS JOIN LATERAL unnest(m.ids) WITH ORDINALITY u(id, k)
      JOIN mae.linea l ON l.id = u.id
      LEFT JOIN mae.ubicacion uo ON uo.id = l.lugar_retiro_id
      LEFT JOIN mae.ubicacion ud ON ud.id = l.lugar_entrega_id
     ORDER BY u.k
$f$;
REVOKE ALL ON FUNCTION fin.fn_lineas_camino_partes(bigint, bigint) FROM PUBLIC;

CREATE OR REPLACE FUNCTION fin.fn_tramos_liquidacion(p_liq bigint)
RETURNS TABLE (item_id bigint, viaje text, salida date, llegada date, linea text, recorrido text,
               km numeric, canon numeric, canon_moneda text, canon_base numeric, estado text, detalle text, ajustado boolean, motivo text,
               fuente_fecha text, viaje_salida date, viaje_llegada date)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    WITH l AS (
        SELECT lm.id, lm.chofer_id, ch.fecha_egreso FROM fin.liquidacion_mensual lm JOIN mae.chofer ch ON ch.id = lm.chofer_id WHERE lm.id = p_liq),
    mv AS (
        SELECT x.*, ln.codigo AS linea_op, ln.canon_chofer AS lcanon, ln.canon_moneda::text AS lmoneda, ln.distancia_km AS lkm,
               (a0.tramo_id IS NOT NULL) AS decidido_entero
          FROM l
          CROSS JOIN LATERAL fin.fn_movimientos_liquidacion(l.id) x
          LEFT JOIN mae.linea ln ON ln.id = x.linea_id
          LEFT JOIN fin.movimiento_liquidacion a0 ON a0.tramo_id = x.clave AND a0.chofer_id = l.chofer_id AND a0.parte = 0),
    -- La línea no tiene bono (o no hay): se separa en las líneas con bono que la arman, salvo que RRHH ya haya decidido el movimiento entero
    pt AS (
        SELECT mv.clave, p.*
          FROM mv CROSS JOIN LATERAL fin.fn_lineas_camino_partes(mv.origen_id, mv.destino_id) p
         WHERE mv.con_carga AND (mv.linea_id IS NULL OR mv.lcanon IS NULL) AND NOT mv.decidido_entero),
    u AS (
        -- movimientos enteros
        SELECT mv.clave AS clave_item, mv.clave, 0 AS parte, mv.tramos, mv.operacion, mv.tractor, mv.recorrido, mv.desde, mv.hasta,
               mv.con_carga, mv.linea_op AS linea, mv.lcanon AS canon_l, mv.lmoneda AS moneda_l, coalesce(mv.lkm, mv.km_movimiento) AS km_l,
               (mv.linea_id IS NOT NULL) AS con_linea, mv.linea_op, NULL::text AS armado
          FROM mv WHERE NOT EXISTS (SELECT 1 FROM pt WHERE pt.clave = mv.clave)
        UNION ALL
        -- una fila por línea que arma el recorrido
        SELECT -(pt.clave * 10 + pt.parte), pt.clave, pt.parte, mv.tramos, mv.operacion, mv.tractor, pt.origen || ' → ' || pt.destino,
               mv.desde + (mv.hasta - mv.desde) * (pt.km_antes / nullif(pt.km_total, 0))::float8,
               mv.desde + (mv.hasta - mv.desde) * ((pt.km_antes + pt.km) / nullif(pt.km_total, 0))::float8,
               mv.con_carga, pt.codigo, pt.canon, pt.canon_moneda, pt.km, true, mv.linea_op,
               format('Parte %s de %s de %s', pt.parte, pt.partes, mv.recorrido) || coalesce(' (la línea ' || mv.linea_op || ' no tiene bono)', '')
          FROM pt JOIN mv ON mv.clave = pt.clave),
    m AS (
        SELECT u.*, a.liquidar, a.canon AS a_canon, a.canon_moneda::text AS a_moneda, a.km AS a_km, a.motivo,
               (a.liquidar IS TRUE AND (a.canon IS NOT NULL OR a.km IS NOT NULL)) AS ajustado,
               l.fecha_egreso,
               (SELECT lm2.numero || ' (' || to_char(lm2.periodo, 'MM/YYYY') || ')'
                  FROM fin.liquidacion_renglon r2 JOIN fin.liquidacion_mensual lm2 ON lm2.id = r2.liquidacion_id
                 WHERE r2.codigo = 'CANON' AND r2.eliminado_en IS NULL AND lm2.id <> l.id AND lm2.chofer_id = l.chofer_id
                   AND lm2.estado <> 'anulada' AND lm2.eliminado_en IS NULL
                   AND ((jsonb_typeof(r2.referencia -> 'tramos') = 'array'
                         AND EXISTS (SELECT 1 FROM unnest(u.tramos) x WHERE (r2.referencia -> 'tramos') @> to_jsonb(x)))
                        OR (jsonb_typeof(r2.referencia -> 'partes') = 'array'
                            AND (CASE WHEN u.parte = 0
                                      THEN EXISTS (SELECT 1 FROM jsonb_array_elements(r2.referencia -> 'partes') e WHERE (-(e #>> '{}')::bigint) / 10 = u.clave)
                                      ELSE (r2.referencia -> 'partes') @> to_jsonb(u.clave_item) END)))
                 LIMIT 1) AS en_otra
          FROM u CROSS JOIN l
          LEFT JOIN fin.movimiento_liquidacion a ON a.tramo_id = u.clave AND a.chofer_id = l.chofer_id AND a.parte = u.parte),
    v AS (
        SELECT m.*,
               (m.desde AT TIME ZONE 'America/Argentina/Mendoza')::date AS f_desde,
               (m.hasta AT TIME ZONE 'America/Argentina/Mendoza')::date AS f_hasta,
               CASE WHEN m.ajustado AND m.a_km IS NOT NULL THEN m.a_km ELSE m.km_l END AS v_km,
               CASE WHEN m.ajustado AND m.a_canon IS NOT NULL THEN m.a_canon ELSE m.canon_l END AS v_canon,
               CASE WHEN m.ajustado AND m.a_canon IS NOT NULL THEN m.a_moneda ELSE m.moneda_l END AS v_moneda
          FROM m)
    SELECT v.clave_item, 'Op. ' || coalesce(v.operacion::text, '—') || coalesce(' · ' || v.tractor, ''),
           v.f_desde, v.f_hasta, v.linea, v.recorrido, v.v_km, v.v_canon, v.v_moneda,
           CASE WHEN v.v_canon IS NULL THEN NULL WHEN v.v_moneda = ref.fn_moneda_base() THEN v.v_canon
                ELSE ops.fn_a_moneda_base(v.v_canon, v.v_moneda, v.f_hasta) END,
           CASE WHEN v.liquidar IS FALSE THEN 'no_se_liquida'
                WHEN v.en_otra IS NOT NULL THEN 'en_otra'
                WHEN v.fecha_egreso IS NOT NULL AND v.f_desde > v.fecha_egreso THEN 'despues_baja'
                WHEN v.ajustado THEN 'incluido'
                WHEN NOT v.con_carga THEN 'vacio'
                WHEN NOT v.con_linea THEN 'sin_linea'
                ELSE 'incluido' END,
           CASE WHEN v.liquidar IS FALSE THEN v.motivo
                WHEN v.en_otra IS NOT NULL THEN 'Ya está en la liquidación ' || v.en_otra
                WHEN v.fecha_egreso IS NOT NULL AND v.f_desde > v.fecha_egreso THEN 'Empezó después de la baja del chofer (' || to_char(v.fecha_egreso, 'DD/MM/YYYY') || ')'
                WHEN v.ajustado THEN 'Ajustado: ' || v.motivo
                WHEN NOT v.con_carga THEN 'Vacío: no se paga'
                WHEN NOT v.con_linea THEN 'No hay una línea con este recorrido: si corresponde, poné el bono y los km'
                WHEN v.canon_l IS NULL THEN 'La línea ' || v.linea || ' no tiene bono y no hay líneas con bono que la armen: cargalo en la línea o ajustalo acá'
                WHEN v.fecha_egreso IS NOT NULL AND v.f_hasta > v.fecha_egreso THEN 'Terminó después de la baja: revisá que lo haya hecho él'
                ELSE v.armado END,
           coalesce(v.ajustado, false), v.motivo, CASE WHEN v.parte = 0 THEN 'operacion' ELSE 'estimada' END, v.f_desde, v.f_hasta
      FROM v
     ORDER BY v.desde, v.clave, v.parte
$f$;

-- El bono y los km: guarda los tramos enteros y las partes que se pagan
CREATE OR REPLACE FUNCTION fin.fn_liq_tramos(p_liq bigint)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE l fin.liquidacion_mensual%ROWTYPE; t record; v record; v_av jsonb; v_egreso date; v_tarde text; v_sinlinea int;
BEGIN
    SELECT * INTO l FROM fin.liquidacion_mensual WHERE id = p_liq;
    IF NOT FOUND OR l.estado <> 'borrador' THEN RETURN; END IF;
    SELECT fecha_egreso INTO v_egreso FROM mae.chofer WHERE id = l.chofer_id;
    PERFORM set_config('fin.liq_fn', '1', true);
    UPDATE fin.liquidacion_renglon SET eliminado_en = now()
     WHERE liquidacion_id = p_liq AND origen = 'sistema' AND codigo IN ('CANON', 'KM') AND eliminado_en IS NULL;

    SELECT count(*)::int AS n, sum(x.km) AS km, sum(x.canon_base) AS canon,
           count(*) FILTER (WHERE x.canon IS NOT NULL AND x.canon_base IS NULL)::int AS sin_cot,
           count(*) FILTER (WHERE x.canon IS NULL)::int AS sin_bono,
           coalesce(jsonb_agg(x.item_id) FILTER (WHERE x.item_id < 0), '[]') AS partes,
           coalesce(jsonb_agg(DISTINCT x.viaje), '[]') AS operaciones,
           array_agg(x.item_id) FILTER (WHERE x.item_id > 0) AS enteros
      INTO v
      FROM fin.fn_tramos_liquidacion(p_liq) x WHERE x.estado = 'incluido';
    SELECT * INTO t FROM fin.fn_tarifa_en(l.chofer_id, l.hasta);
    v_av := coalesce((SELECT jsonb_agg(DISTINCT u) FROM fin.fn_movimientos_liquidacion(p_liq) mv, unnest(mv.tramos) u
                       WHERE mv.clave = ANY (coalesce(v.enteros, '{}'))), '[]');

    PERFORM fin.fn_liq_renglon(p_liq, 'sistema', 'CANON', format('Bono por tramo (%s tramo%s)', v.n, CASE WHEN v.n = 1 THEN '' ELSE 's' END),
                               fin.fn_liq_tipo_param('fin.liq_canon_tipo'), v.n, NULL, coalesce(v.canon, 0),
                               jsonb_build_object('tramos', v_av, 'partes', v.partes, 'operaciones', v.operaciones), 20);
    PERFORM fin.fn_liq_renglon(p_liq, 'sistema', 'KM', format('Km de línea (%s km × %s)', round(coalesce(v.km, 0)), coalesce(t.precio_km, 0)),
                               fin.fn_liq_tipo_param('fin.liq_km_tipo'), v.km, t.precio_km, coalesce(v.km, 0) * coalesce(t.precio_km, 0),
                               jsonb_build_object('tramos', v_av, 'partes', v.partes), 30);

    SELECT count(*) FILTER (WHERE x.estado = 'sin_linea')::int INTO v_sinlinea FROM fin.fn_tramos_liquidacion(p_liq) x;
    SELECT coalesce(jsonb_agg(a ORDER BY i), '[]') INTO v_av
      FROM jsonb_array_elements(l.avisos) WITH ORDINALITY q(a, i)
     WHERE (a #>> '{}') NOT LIKE '%canon(es) en otra moneda%' AND (a #>> '{}') <> 'Hay km de línea pero no precio por km'
       AND (a #>> '{}') NOT LIKE 'Tramo%' AND (a #>> '{}') NOT LIKE 'El viaje % terminó después de la baja%'
       AND (a #>> '{}') NOT LIKE 'Movimiento%';
    IF v.sin_cot > 0 THEN
        v_av := v_av || to_jsonb(format('Tramos: %s bono(s) en otra moneda sin cotización del día: no se sumaron (cargala en Tipos de cambio)', v.sin_cot));
    END IF;
    IF v.sin_bono > 0 THEN
        v_av := v_av || to_jsonb(format('Tramos: %s tramo(s) con una línea sin bono cargado: cargalo en la línea o ajustalo en el tramo', v.sin_bono));
    END IF;
    IF v_sinlinea > 0 THEN
        v_av := v_av || to_jsonb(format('Movimientos: %s cargado(s) sin una línea igual: no se pagan hasta que pongas el bono y los km', v_sinlinea));
    END IF;
    IF coalesce(v.km, 0) > 0 AND t.precio_km IS NULL THEN
        v_av := v_av || to_jsonb('Hay km de línea pero no precio por km'::text);
    END IF;
    IF v_egreso IS NOT NULL THEN
        SELECT string_agg(DISTINCT x.viaje, ', ') INTO v_tarde FROM fin.fn_tramos_liquidacion(p_liq) x
         WHERE x.estado = 'incluido' AND x.llegada > v_egreso AND NOT x.ajustado;
        IF v_tarde IS NOT NULL THEN
            v_av := v_av || to_jsonb(format('Tramos: %s terminó después de la baja del chofer (%s): revisá que lo haya hecho él', v_tarde, to_char(v_egreso, 'DD/MM/YYYY')));
        END IF;
    END IF;
    UPDATE fin.liquidacion_mensual SET avisos = v_av WHERE id = p_liq;
    PERFORM fin.fn_liq_totales(p_liq);
END $f$;

-- RRHH decide un tramo: p_item > 0 = movimiento entero (su primer tramo); p_item < 0 = una parte (-(tramo × 10 + parte))
CREATE OR REPLACE FUNCTION fin.fn_guardar_tramo_liquidacion(p_item bigint, p_liquidar boolean, p_canon numeric, p_moneda text, p_km numeric, p_motivo text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_usr bigint; v_chofer bigint; v_liq bigint; v_mon text := upper(nullif(btrim(p_moneda), ''));
        v_tramo bigint := CASE WHEN p_item < 0 THEN (-p_item) / 10 ELSE p_item END;
        v_parte smallint := CASE WHEN p_item < 0 THEN ((-p_item) % 10)::smallint ELSE 0 END;
BEGIN
    v_usr := fin.fn_exigir_rol_liq(ARRAY['rrhh','ti'], 'Los tramos de la liquidación los deciden RRHH o TI');
    SELECT lm.chofer_id INTO v_chofer FROM fin.liquidacion_mensual lm
     WHERE lm.estado = 'borrador' AND lm.eliminado_en IS NULL
       AND EXISTS (SELECT 1 FROM fin.fn_movimientos_liquidacion(lm.id) mv WHERE mv.clave = v_tramo)
     ORDER BY lm.periodo DESC LIMIT 1;
    IF v_chofer IS NULL THEN RAISE EXCEPTION 'El tramo no está en ninguna liquidación en borrador' USING ERRCODE = 'P0002'; END IF;
    IF EXISTS (SELECT 1 FROM fin.liquidacion_renglon r JOIN fin.liquidacion_mensual lm ON lm.id = r.liquidacion_id
                WHERE r.codigo = 'CANON' AND r.eliminado_en IS NULL AND lm.estado IN ('aprobada','pagada') AND lm.eliminado_en IS NULL
                  AND lm.chofer_id = v_chofer
                  AND ((jsonb_typeof(r.referencia -> 'tramos') = 'array' AND (r.referencia -> 'tramos') @> to_jsonb(v_tramo))
                       OR (jsonb_typeof(r.referencia -> 'partes') = 'array' AND (r.referencia -> 'partes') @> to_jsonb(p_item)))) THEN
        RAISE EXCEPTION 'Ese tramo ya está en una liquidación aprobada: para cambiarlo, reabrila' USING ERRCODE = '55000';
    END IF;
    IF p_liquidar IS NULL THEN
        DELETE FROM fin.movimiento_liquidacion WHERE tramo_id = v_tramo AND chofer_id = v_chofer AND parte = v_parte;
    ELSE
        IF length(btrim(coalesce(p_motivo, ''))) < 3 THEN
            RAISE EXCEPTION 'Escribí por qué (por ejemplo: liquidado en octubre por fuera del sistema, renunció en Mendoza)' USING ERRCODE = '22023';
        END IF;
        IF p_liquidar AND p_canon IS NULL AND p_km IS NULL THEN
            RAISE EXCEPTION 'Escribí el bono o los km que corresponden' USING ERRCODE = '22023';
        END IF;
        IF p_canon IS NOT NULL AND (p_canon < 0 OR v_mon IS NULL OR NOT EXISTS (SELECT 1 FROM ref.moneda WHERE codigo = v_mon)) THEN
            RAISE EXCEPTION 'Revisá el bono y su moneda' USING ERRCODE = '22023';
        END IF;
        IF p_km IS NOT NULL AND (p_km < 0 OR p_km > 20000) THEN
            RAISE EXCEPTION 'Revisá los km' USING ERRCODE = '22023';
        END IF;
        INSERT INTO fin.movimiento_liquidacion (tramo_id, chofer_id, parte, liquidar, canon, canon_moneda, km, motivo, creado_por)
        VALUES (v_tramo, v_chofer, v_parte, p_liquidar, CASE WHEN p_liquidar THEN p_canon END,
                CASE WHEN p_liquidar AND p_canon IS NOT NULL THEN v_mon END, CASE WHEN p_liquidar THEN p_km END, left(btrim(p_motivo), 300), v_usr)
        ON CONFLICT (tramo_id, chofer_id, parte) DO UPDATE SET liquidar = EXCLUDED.liquidar, canon = EXCLUDED.canon,
               canon_moneda = EXCLUDED.canon_moneda, km = EXCLUDED.km, motivo = EXCLUDED.motivo, creado_en = now(), creado_por = EXCLUDED.creado_por;
    END IF;
    FOR v_liq IN SELECT id FROM fin.liquidacion_mensual WHERE chofer_id = v_chofer AND estado = 'borrador' AND eliminado_en IS NULL LOOP
        PERFORM fin.fn_liq_tramos(v_liq);
    END LOOP;
END $f$;

NOTIFY pgrst, 'reload schema';

SELECT 'Listo: los movimientos que se arman con varias líneas salen separados por línea' AS resultado;
