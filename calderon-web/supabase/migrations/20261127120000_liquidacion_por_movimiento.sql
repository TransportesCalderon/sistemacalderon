-- =====================================================================================
-- Migración 384 · Liquidación: cada movimiento de «Quién la llevó» es un tramo
-- =====================================================================================
-- Pedido (27/11/2026): «ya habíamos hecho esa tarea, ¿por qué no lo toma desde ahí para hacer la liquidación?».
-- La liquidación leía la misma lista que «Quién la llevó» (ops.fn_segmentos_chofer), pero:
--   · solo tomaba los movimientos terminados y con llegada hasta el día de corte;
--   · juntaba los movimientos seguidos del mismo chofer en una operación (San Antonio → Aduana Global y
--     Aduana Global → Buenos Aires salían como un solo «San Antonio → Buenos Aires (2 movimientos)») y le buscaba una
--     línea a todo el recorrido. Se perdían las fechas de cada tramo y el bono salía de una línea que no era.
-- Caso: Op. 6305 (Entre Ríos → Mendoza, en curso el 27/11): no figuraba en la lista.
--
-- Decisiones del usuario:
--   · entran los tramos EMPEZADOS hasta el día de corte, y «empezó» es desde que el chofer lo tiene asignado (se le asignó
--     y ya había terminado el anterior). Operaciones suele registrar la salida más tarde: la Op. 6305 se asignó el 24/11
--     y su salida se registró el 27/11 12:07;
--   · no hace falta definir tramos en cada línea;
--   · el bono que quedó copiado en el renglón del viaje del chofer vale solo si lo ajustaron a mano (tiene motivo);
--     si no, vale el de la línea de hoy (había renglones con 160.000 ARS de cuando SAI-BSAS estaba en pesos).
--
-- Qué cambia:
--   1 · Un tramo por movimiento y por chofer, con sus fechas (fin.fn_segmentos_liquidacion, fin.fn_movimientos_liquidacion).
--   2 · La base y las aduanas de Mendoza cuentan como la ciudad de la base para buscar la línea (fin.fn_lugar_de_linea;
--       parámetros ops.base_ciudad_id = Mendoza y ops.base_ciudad_lugares = la base y las que se llaman «Aduana …»):
--       San Antonio → Aduana Global = SAI-MZA; Aduana Global → Buenos Aires = MZA-BSAS. Un movimiento dentro de la
--       ciudad queda «local» (no lleva bono). Si hay una línea cargada con los lugares tal cual, manda esa.
--       «En Planta» y «En Planta (Chile)», cargados como aduana para dejar el semi, NO cuentan como Mendoza.
--   3 · Entran los movimientos que el chofer tenía asignados hasta el fin del período. Los que no terminaron se ven
--       «en_curso» (también los asignados sin salida registrada) y no se pagan hasta que Operaciones registre la llegada.
--       Lo que no se pagó en un mes sigue apareciendo en el siguiente.
--   4 · Relevo de chofer adentro de un movimiento: cada chofer cobra su parte (las líneas de su viaje o, si las partes
--       del recorrido son tantas como choferes, la que le toca por orden). Si no se puede saber, queda «sin_linea»
--       para que RRHH ponga el bono (antes los dos cobraban el recorrido entero).
--   5 · Para cada movimiento: las líneas del viaje del chofer que van de su origen a su destino (si hay más de una
--       forma, la de más tramos y, si empatan, la última cargada) → la línea con bono de ese recorrido → las líneas
--       con bono que lo arman.
--   6 · Lo que RRHH ya decidió no cambia: cada decisión anterior queda marcada con los movimientos que tenía su fila
--       (fin.movimiento_liquidacion.grupo) y esa fila sigue con la forma de antes hasta que se toque «Volver a lo de
--       Operaciones». Si una decisión deja de coincidir con una fila, la liquidación lo avisa.
--   7 · Las liquidaciones aprobadas o pagadas no cambian: su renglón de bono por tramo guarda que se armó con la forma
--       de antes y qué movimientos iban juntos (referencia.antes y .grupos). En ellas «se liquida» es lo que quedó en
--       su renglón; lo que terminó después se ve «fuera» y entra en la siguiente. Las partes ya liquidadas quedan con
--       sus movimientos (referencia.movimientos) para que no se paguen dos veces.
--   8 · fin.fn_guardar_tramo_liquidacion recibe también la liquidación (con relevo, el mismo movimiento está en dos).
--   9 · Rehace el bono por tramo y los km de las liquidaciones en borrador. Frena sin aplicar nada si algo que RRHH
--       sacó, ajustó a mano o que ya está en otra liquidación cambiara.
-- Datos: solo agrega esas marcas y rehace los renglones del sistema de los borradores. No cambia web.version_base.
-- Se puede correr más de una vez. Al final muestra cómo queda cada liquidación (antes y ahora).
-- =====================================================================================
BEGIN;
SET LOCAL statement_timeout = '10min';

DO $v$
BEGIN
    IF to_regprocedure('fin.fn_tramos_liquidacion(bigint)') IS NULL OR to_regprocedure('fin.fn_movimientos_liquidacion(bigint)') IS NULL
       OR to_regprocedure('fin.fn_lineas_camino_partes(bigint,bigint)') IS NULL OR to_regprocedure('fin.fn_linea_de(bigint,bigint,bigint)') IS NULL
       OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'fin' AND table_name = 'movimiento_liquidacion' AND column_name = 'parte') THEN
        RAISE EXCEPTION 'Faltan las migraciones de la liquidación por tramo (350 a 353): no se aplicó nada';
    END IF;
END $v$;

-- ------------------------------------------------------------------ parámetros: la ciudad de la base y los lugares que cuentan como esa ciudad
INSERT INTO ref.parametro (codigo, valor, descripcion)
SELECT 'ops.base_ciudad_id', to_jsonb(u.id),
       'Lugar que usan las líneas para la ciudad donde están la base operativa y sus aduanas (Mendoza). Un movimiento que sale de uno de esos lugares (ops.base_ciudad_lugares), o llega ahí, busca su línea con este lugar.'
  FROM (SELECT x.id FROM mae.ubicacion x
         WHERE x.eliminado_en IS NULL AND x.tipo NOT IN ('base', 'aduana') AND (upper(btrim(x.codigo)) = 'MZA' OR upper(btrim(x.nombre)) = 'MENDOZA')
         ORDER BY (SELECT count(*) FROM mae.linea l WHERE l.eliminado_en IS NULL AND (l.lugar_retiro_id = x.id OR l.lugar_entrega_id = x.id)) DESC, x.id
         LIMIT 1) u
 WHERE NOT EXISTS (SELECT 1 FROM ref.parametro WHERE codigo = 'ops.base_ciudad_id');

-- Los lugares que cuentan como esa ciudad: la base y las aduanas de Mendoza (las que se llaman «Aduana …»).
-- Otros lugares cargados como aduana para dejar el semi («En Planta», «En Planta (Chile)») NO cuentan: no están en Mendoza.
INSERT INTO ref.parametro (codigo, valor, descripcion)
SELECT 'ops.base_ciudad_lugares', q.ids,
       'Ids de los lugares (Datos › Lugares) que cuentan como la ciudad de la base (ops.base_ciudad_id) para buscar la línea de un tramo: la base operativa y las aduanas de Mendoza. Si se carga otra aduana de Mendoza, agregar su id acá.'
  FROM (SELECT coalesce(jsonb_agg(u.id ORDER BY u.id), '[]'::jsonb) AS ids
          FROM mae.ubicacion u
         WHERE u.eliminado_en IS NULL AND (u.tipo = 'base' OR (u.tipo = 'aduana' AND btrim(u.nombre) ILIKE 'aduana%'))) q
 WHERE NOT EXISTS (SELECT 1 FROM ref.parametro WHERE codigo = 'ops.base_ciudad_lugares');

CREATE OR REPLACE FUNCTION fin.fn_lugar_de_linea(p_lugar bigint)
RETURNS bigint
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT CASE WHEN EXISTS (SELECT 1 FROM ref.parametro p
                              WHERE p.codigo = 'ops.base_ciudad_lugares' AND p.eliminado_en IS NULL
                                AND jsonb_typeof(p.valor) = 'array' AND p.valor @> to_jsonb(p_lugar))
                THEN coalesce((SELECT c.id FROM mae.ubicacion c
                                WHERE c.id = nullif(ref.fn_parametro_num('ops.base_ciudad_id', 0), 0)::bigint AND c.eliminado_en IS NULL), p_lugar)
                ELSE p_lugar END
$f$;
COMMENT ON FUNCTION fin.fn_lugar_de_linea(bigint) IS
    'Migración 384: el lugar con el que se busca la línea. La base y las aduanas de Mendoza (ops.base_ciudad_lugares) cuentan como la ciudad de la base (ops.base_ciudad_id).';
REVOKE ALL ON FUNCTION fin.fn_lugar_de_linea(bigint) FROM PUBLIC;

-- ------------------------------------------------------------------ lo ya decidido y lo ya liquidado no cambia
ALTER TABLE fin.movimiento_liquidacion ADD COLUMN IF NOT EXISTS grupo bigint[];
COMMENT ON COLUMN fin.movimiento_liquidacion.grupo IS
    'Migración 384: decisión tomada antes de liquidar por movimiento: los movimientos que tenía su fila. Mientras exista la decisión, esa fila sigue con la forma de antes (varios movimientos juntos; sin repartir por relevo).';

CREATE TEMP TABLE IF NOT EXISTS _l384_grupos (liq bigint, chofer bigint, clave bigint, tramos bigint[], partes int);
CREATE TEMP TABLE IF NOT EXISTS _l384_antes (liq bigint, item_id bigint, estado text, canon_base numeric, km numeric, movs bigint[], ajustado boolean,
                                              viaje text, linea text, recorrido text, salida date, llegada date, detalle text);
CREATE TEMP TABLE IF NOT EXISTS _l384_despues (liq bigint, item_id bigint, estado text, canon_base numeric, km numeric, movs bigint[], recorrido text, linea text, sin_bono boolean,
                                                viaje text, salida date, llegada date, detalle text);
CREATE TEMP TABLE IF NOT EXISTS _l384_informe (orden int, dato text, antes text, ahora text, detalle text);
TRUNCATE _l384_grupos, _l384_antes, _l384_despues, _l384_informe;

DO $c$
DECLARE r record; v_piso date := (ref.fn_parametro_texto('fin.liq_tramos_desde', '2026-10-27'))::date; v_m jsonb; n_dec int := 0; n_ref int := 0; n_apr int := 0;
BEGIN
    IF EXISTS (SELECT 1 FROM ref.parametro WHERE codigo = 'fin.liq_por_movimiento') THEN RETURN; END IF;   -- ya se convirtió
    -- Foto de antes, con las funciones anteriores
    FOR r IN SELECT lm.id, lm.chofer_id FROM fin.liquidacion_mensual lm
              WHERE lm.estado <> 'anulada' AND lm.eliminado_en IS NULL AND lm.hasta >= v_piso LOOP
        INSERT INTO _l384_grupos SELECT r.id, r.chofer_id, mv.clave, mv.tramos, 0 FROM fin.fn_movimientos_liquidacion(r.id) mv;
        INSERT INTO _l384_antes SELECT r.id, x.item_id, x.estado, x.canon_base, x.km, NULL, x.ajustado, x.viaje, x.linea, x.recorrido, x.salida, x.llegada, x.detalle
          FROM fin.fn_tramos_liquidacion(r.id) x;
    END LOOP;
    UPDATE _l384_grupos g SET partes = (SELECT count(*) FROM _l384_antes a WHERE a.liq = g.liq AND a.item_id < 0 AND (-a.item_id) / 10 = g.clave);
    UPDATE _l384_antes a
       SET movs = (SELECT CASE WHEN a.item_id > 0 OR cardinality(g.tramos) = 1 THEN g.tramos
                               WHEN g.partes = cardinality(g.tramos) THEN ARRAY[g.tramos[((-a.item_id) % 10)::int]]
                               ELSE g.tramos END
                     FROM _l384_grupos g
                    WHERE g.liq = a.liq AND g.clave = CASE WHEN a.item_id < 0 THEN (-a.item_id) / 10 ELSE a.item_id END);
    -- 1 · Las decisiones que ya tomó RRHH quedan marcadas con los movimientos que tenía su fila: esa fila no cambia de forma
    --     (varios movimientos siguen juntos; con relevo de chofer, sigue como estaba)
    UPDATE fin.movimiento_liquidacion d SET grupo = g.tramos
      FROM (SELECT DISTINCT ON (x.chofer, x.clave) x.chofer, x.clave, x.tramos FROM _l384_grupos x ORDER BY x.chofer, x.clave, x.liq DESC) g
     WHERE d.chofer_id = g.chofer AND d.tramo_id = g.clave AND d.grupo IS NULL;
    SELECT count(*) INTO n_dec FROM fin.movimiento_liquidacion d WHERE cardinality(d.grupo) > 1;
    -- 2 · Liquidaciones que ya tienen partes de varios movimientos juntos: se anota qué movimientos son
    PERFORM set_config('fin.liq_fn', '1', true);
    FOR r IN SELECT rr.id, rr.liquidacion_id, rr.referencia FROM fin.liquidacion_renglon rr JOIN fin.liquidacion_mensual lm ON lm.id = rr.liquidacion_id
              WHERE rr.codigo = 'CANON' AND rr.eliminado_en IS NULL AND lm.estado <> 'anulada' AND lm.eliminado_en IS NULL
                AND jsonb_typeof(rr.referencia -> 'partes') = 'array' AND jsonb_array_length(rr.referencia -> 'partes') > 0
                AND NOT rr.referencia ? 'movimientos' LOOP
        SELECT jsonb_agg(DISTINCT m.m) INTO v_m
          FROM jsonb_array_elements(r.referencia -> 'partes') e
          JOIN _l384_grupos g ON g.liq = r.liquidacion_id AND g.clave = (-(e #>> '{}')::bigint) / 10 AND cardinality(g.tramos) > 1
          CROSS JOIN LATERAL unnest(CASE WHEN g.partes = cardinality(g.tramos) THEN ARRAY[g.tramos[((-(e #>> '{}')::bigint) % 10)::int]] ELSE g.tramos END) m(m);
        IF v_m IS NOT NULL THEN
            UPDATE fin.liquidacion_renglon SET referencia = referencia || jsonb_build_object('movimientos', v_m) WHERE id = r.id;
            n_ref := n_ref + 1;
        END IF;
    END LOOP;
    -- 3 · Liquidaciones aprobadas o pagadas: guardan que se armaron con la forma de antes y qué movimientos iban juntos,
    --     para que su lista de tramos no cambie
    UPDATE fin.liquidacion_renglon rr
       SET referencia = rr.referencia || jsonb_build_object('antes', true, 'grupos',
               coalesce((SELECT jsonb_agg(to_jsonb(x.tramos) ORDER BY x.clave) FROM _l384_grupos x WHERE x.liq = rr.liquidacion_id AND cardinality(x.tramos) > 1), '[]'::jsonb))
      FROM fin.liquidacion_mensual lm
     WHERE lm.id = rr.liquidacion_id AND lm.estado IN ('aprobada', 'pagada') AND lm.eliminado_en IS NULL AND lm.hasta >= v_piso
       AND rr.codigo = 'CANON' AND rr.eliminado_en IS NULL AND NOT rr.referencia ? 'antes';
    GET DIAGNOSTICS n_apr = ROW_COUNT;
    INSERT INTO _l384_informe VALUES
        (2, 'Decisiones de RRHH que quedan como estaban (varios movimientos juntos)', NULL, n_dec::text, NULL),
        (3, 'Liquidaciones con partes ya incluidas: se anotó qué movimientos son', NULL, n_ref::text, NULL),
        (4, 'Liquidaciones aprobadas o pagadas que quedan con su lista como estaba', NULL, n_apr::text, NULL);
END $c$;

-- ------------------------------------------------------------------ 1 · un tramo por movimiento y por chofer
DROP FUNCTION IF EXISTS fin.fn_segmentos_liquidacion(bigint, date);
CREATE FUNCTION fin.fn_segmentos_liquidacion(p_chofer bigint, p_hasta date)
RETURNS TABLE (tramo_id bigint, servicio_id bigint, operacion bigint, tractor text, origen_id bigint, origen text, destino_id bigint, destino text,
               desde timestamptz, hasta timestamptz, terminado boolean, con_carga boolean, km numeric, choferes int, orden int,
               asignado timestamptz, sin_salida boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
SET jit TO 'off'
AS $f$
    WITH p AS (SELECT (ref.fn_parametro_texto('fin.liq_tramos_desde', '2026-10-27'))::date AS piso),
    -- Lo mismo que «Quién la llevó»: los movimientos del chofer (asignados sin salir, en curso y terminados)
    x AS (
        SELECT s.tramo_id, min(s.servicio_id) AS servicio_id, min(s.numero_operacion) AS operacion, min(s.tractor) AS tractor,
               min(s.origen_id) AS origen_id, min(s.origen) AS origen, min(s.destino_id) AS destino_id, min(s.destino) AS destino,
               min(s.desde) AS desde, bool_or(s.relevo) AS relevo, bool_and(coalesce(s.con_carga, true)) AS con_carga
          FROM p CROSS JOIN LATERAL ops.fn_segmentos_chofer((p.piso - 60)::timestamp AT TIME ZONE 'America/Argentina/Mendoza', NULL, p_chofer, NULL) s
         WHERE s.estado IN ('planificado', 'en_curso', 'cerrado') AND s.desde IS NOT NULL
         GROUP BY s.tramo_id),
    y AS (
        SELECT x.*, t.estado, t.inicio_real, t.fin_real, coalesce(t.inicio_planificado, t.creado_en) AS plan,
               coalesce(t.km_recorridos, t.km_recorridos_telemetria) AS km, rc.n, rc.orden, rc.abierto, rc.hasta AS hasta_relevo,
               pv.fin AS fin_anterior, coalesce(pv.abierto, false) AS anterior_abierto, coalesce(pv.posterior, false) AS hizo_otro
          FROM x JOIN ops.tramo_operativo t ON t.id = x.tramo_id
          LEFT JOIN LATERAL (
              -- Con relevo: cuántos choferes manejaron el movimiento, en qué orden entró este y si su parte terminó
              SELECT count(*)::int AS n, (min(q.k) FILTER (WHERE q.chofer_id = p_chofer))::int AS orden,
                     coalesce(bool_or(q.hasta_ts IS NULL) FILTER (WHERE q.chofer_id = p_chofer), true) AS abierto,
                     max(q.hasta_ts) FILTER (WHERE q.chofer_id = p_chofer) AS hasta
                FROM (SELECT tc.chofer_id, tc.hasta_ts, row_number() OVER (ORDER BY tc.desde_ts, tc.id) AS k
                        FROM ops.tramo_chofer tc
                       WHERE tc.tramo_id = x.tramo_id AND tc.eliminado_en IS NULL AND tc.rol = 'conductor') q) rc ON x.relevo
          LEFT JOIN LATERAL (
              -- Los otros movimientos del chofer: cuándo terminó el anterior, si todavía tiene uno abierto y,
              -- para uno que no salió, si después de asignárselo salió con otro
              SELECT max(o.fin_real) FILTER (WHERE o.estado = 'cerrado' AND o.inicio_real < coalesce(t.inicio_real, 'infinity'::timestamptz)) AS fin,
                     bool_or(o.estado = 'en_curso' AND o.inicio_real < coalesce(t.inicio_real, 'infinity'::timestamptz)) AS abierto,
                     bool_or(t.inicio_real IS NULL AND o.inicio_real > coalesce(t.inicio_planificado, t.creado_en)) AS posterior
                FROM ops.tramo_operativo o
               WHERE o.chofer_id = p_chofer AND o.id <> t.id AND o.eliminado_en IS NULL AND o.estado IN ('en_curso', 'cerrado')) pv ON NOT x.relevo),
    z AS (
        SELECT y.*, CASE WHEN y.relevo THEN NOT y.abierto ELSE y.estado = 'cerrado' END AS terminado,
               CASE WHEN y.relevo THEN y.hasta_relevo ELSE y.fin_real END AS fin,
               -- Desde cuándo el chofer tiene ese movimiento: se le asignó y ya había terminado el anterior.
               -- (Operaciones suele registrar la salida más tarde: por eso no se usa la hora de salida para el corte.)
               CASE WHEN y.relevo THEN y.desde
                    WHEN y.inicio_real IS NULL THEN CASE WHEN y.anterior_abierto OR y.hizo_otro THEN NULL
                                                         ELSE greatest(y.plan, coalesce(y.fin_anterior, y.plan)) END
                    ELSE least(y.inicio_real, greatest(y.plan, coalesce(y.fin_anterior, y.plan)))
               END AS asignado
          FROM y)
    SELECT z.tramo_id, z.servicio_id, z.operacion, z.tractor, z.origen_id, z.origen, z.destino_id, z.destino,
           coalesce(CASE WHEN z.relevo THEN z.desde ELSE z.inicio_real END, z.asignado),
           CASE WHEN z.terminado THEN z.fin END, z.terminado, z.con_carga, z.km, coalesce(z.n, 1), coalesce(z.orden, 1),
           z.asignado, (NOT z.relevo AND z.inicio_real IS NULL)
      FROM z CROSS JOIN p
     WHERE z.asignado < (p_hasta + 1)::timestamp AT TIME ZONE 'America/Argentina/Mendoza'
       AND (NOT z.terminado OR z.fin >= p.piso::timestamp AT TIME ZONE 'America/Argentina/Mendoza')
$f$;
COMMENT ON FUNCTION fin.fn_segmentos_liquidacion(bigint, date) IS
    'Migración 384: los movimientos de Operaciones de un chofer para liquidar (los de «Quién la llevó»), uno por movimiento: los que tenía asignados hasta la fecha (asignado = se le asignó y ya había terminado el anterior), sin salir, en curso o terminados desde fin.liq_tramos_desde.';
REVOKE ALL ON FUNCTION fin.fn_segmentos_liquidacion(bigint, date) FROM PUBLIC;

-- Las líneas con bono que arman un recorrido sin usar una línea dada (la directa). Sirve cuando la línea directa
-- hoy tiene bono pero el tramo tiene que verse por partes: RRHH ya decidió sobre una parte, o hubo relevo de chofer.
CREATE OR REPLACE FUNCTION fin.fn_lineas_camino_partes_sin(p_origen bigint, p_destino bigint, p_sin_linea bigint)
RETURNS TABLE (parte integer, partes integer, linea_id bigint, codigo text, origen text, destino text, km numeric, canon numeric, canon_moneda text,
               km_antes numeric, km_total numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    WITH RECURSIVE ln AS (
        SELECT l.id, l.lugar_retiro_id AS o, l.lugar_entrega_id AS d, coalesce(l.distancia_km, 0) AS km, l.activa
          FROM mae.linea l
         WHERE l.eliminado_en IS NULL AND l.canon_chofer IS NOT NULL AND l.lugar_retiro_id <> l.lugar_entrega_id
           AND l.id IS DISTINCT FROM p_sin_linea),
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
COMMENT ON FUNCTION fin.fn_lineas_camino_partes_sin(bigint, bigint, bigint) IS
    'Migración 384: como fin.fn_lineas_camino_partes, pero sin usar una línea (la directa del recorrido).';
REVOKE ALL ON FUNCTION fin.fn_lineas_camino_partes_sin(bigint, bigint, bigint) FROM PUBLIC;

DROP FUNCTION IF EXISTS fin.fn_movimientos_liquidacion(bigint);
CREATE FUNCTION fin.fn_movimientos_liquidacion(p_liq bigint)
RETURNS TABLE (clave bigint, tramos bigint[], servicio_id bigint, operacion bigint, tractor text, recorrido text,
               desde timestamptz, hasta timestamptz, con_carga boolean, linea_id bigint, km_movimiento numeric,
               origen_id bigint, destino_id bigint, terminado boolean, choferes int, orden int, local boolean,
               asignado timestamptz, sin_salida boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
SET jit TO 'off'
AS $f$
    WITH l AS (
        SELECT lm.id, lm.chofer_id, lm.hasta, lm.estado,
               -- aprobada o pagada: lo que quedó en su renglón de bono por tramo
               CASE WHEN lm.estado <> 'borrador' THEN (SELECT r.referencia FROM fin.liquidacion_renglon r
                                                        WHERE r.liquidacion_id = lm.id AND r.codigo = 'CANON' AND r.eliminado_en IS NULL
                                                        ORDER BY r.id DESC LIMIT 1) END AS propia
          FROM fin.liquidacion_mensual lm WHERE lm.id = p_liq),
    s AS (
        SELECT x.*, fin.fn_lugar_de_linea(x.origen_id) AS lo, fin.fn_lugar_de_linea(x.destino_id) AS ld,
               -- si hay una línea cargada con esos mismos lugares (por ejemplo, hasta la base o una aduana), manda esa
               fin.fn_linea_de(x.origen_id, x.destino_id, x.servicio_id) AS linea_exacta
          FROM l CROSS JOIN LATERAL fin.fn_segmentos_liquidacion(l.chofer_id, l.hasta) x),
    -- Movimientos que siguen juntos: los de las decisiones de antes de esta migración y, si la liquidación ya está
    -- aprobada o pagada, los que iban juntos cuando se aprobó (referencia.grupos)
    g AS (
        SELECT DISTINCT a.grupo FROM fin.movimiento_liquidacion a JOIN l ON a.chofer_id = l.chofer_id
         WHERE a.grupo IS NOT NULL AND cardinality(a.grupo) > 1
        UNION
        SELECT ARRAY(SELECT (e #>> '{}')::bigint FROM jsonb_array_elements(x.g) WITH ORDINALITY q(e, i) ORDER BY q.i)
          FROM l CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(l.propia -> 'grupos') = 'array' THEN l.propia -> 'grupos' ELSE '[]'::jsonb END) x(g)),
    sg AS (
        SELECT s.*, gg.grupo, array_position(gg.grupo, s.tramo_id) AS pos
          FROM s LEFT JOIN LATERAL (SELECT g.grupo FROM g WHERE s.tramo_id = ANY (g.grupo) ORDER BY g.grupo LIMIT 1) gg ON true),
    j AS (
        SELECT sg.grupo, array_agg(sg.tramo_id ORDER BY sg.pos) AS tramos,
               (array_agg(sg.servicio_id ORDER BY sg.pos))[1] AS servicio_id, (array_agg(sg.operacion ORDER BY sg.pos))[1] AS operacion,
               (array_agg(sg.tractor ORDER BY sg.pos))[1] AS tractor,
               (array_agg(sg.origen ORDER BY sg.pos))[1] AS origen, (array_agg(sg.destino ORDER BY sg.pos DESC))[1] AS destino,
               (array_agg(sg.lo ORDER BY sg.pos))[1] AS lo, (array_agg(sg.ld ORDER BY sg.pos DESC))[1] AS ld,
               (array_agg(sg.origen_id ORDER BY sg.pos))[1] AS o_raw, (array_agg(sg.destino_id ORDER BY sg.pos DESC))[1] AS d_raw,
               min(sg.desde) AS desde, max(sg.hasta) AS hasta, bool_and(sg.terminado) AS terminado, bool_or(sg.con_carga) AS con_carga,
               sum(sg.km) AS km, count(*)::int AS n, min(sg.asignado) AS asignado
          FROM sg WHERE sg.grupo IS NOT NULL GROUP BY sg.grupo)
    SELECT sg.tramo_id, ARRAY[sg.tramo_id], sg.servicio_id, sg.operacion, sg.tractor, sg.origen || ' → ' || sg.destino,
           sg.desde, sg.hasta, sg.con_carga,
           coalesce(sg.linea_exacta, CASE WHEN sg.lo IS DISTINCT FROM sg.origen_id OR sg.ld IS DISTINCT FROM sg.destino_id
                                          THEN fin.fn_linea_de(sg.lo, sg.ld, sg.servicio_id) END),
           sg.km, sg.lo, sg.ld,
           sg.terminado, CASE WHEN v.como_antes THEN 1 ELSE sg.choferes END, CASE WHEN v.como_antes THEN 1 ELSE sg.orden END,
           (sg.lo = sg.ld AND sg.linea_exacta IS NULL), sg.asignado, sg.sin_salida
      FROM sg CROSS JOIN l
     -- con la forma de antes (sin repartir el relevo): si RRHH ya había decidido sobre ese movimiento, o si la liquidación
     -- se aprobó antes de esta migración
     CROSS JOIN LATERAL (SELECT coalesce((l.propia ->> 'antes')::boolean, false)
                                OR EXISTS (SELECT 1 FROM fin.movimiento_liquidacion a
                                            WHERE a.chofer_id = l.chofer_id AND a.tramo_id = sg.tramo_id AND a.grupo IS NOT NULL) AS como_antes) v
     WHERE sg.grupo IS NULL
    UNION ALL
    SELECT j.grupo[1], j.tramos, j.servicio_id, j.operacion, j.tractor,
           j.origen || ' → ' || j.destino || CASE WHEN j.n > 1 THEN ' (' || j.n || ' movimientos)' ELSE '' END,
           j.desde, CASE WHEN j.terminado THEN j.hasta END, j.con_carga,
           coalesce(fin.fn_linea_de(j.o_raw, j.d_raw, j.servicio_id), fin.fn_linea_de(j.lo, j.ld, j.servicio_id)), j.km, j.lo, j.ld,
           j.terminado, 1, 1, false, j.asignado, false
      FROM j
$f$;
COMMENT ON FUNCTION fin.fn_movimientos_liquidacion(bigint) IS
    'Migración 384: un tramo por movimiento de Operaciones y por chofer (clave = el movimiento), con la línea de su recorrido (la base y las aduanas de Mendoza cuentan como la ciudad de la base). «origen_id» y «destino_id» son los lugares de línea; «asignado» es desde cuándo el chofer lo tiene.';
REVOKE ALL ON FUNCTION fin.fn_movimientos_liquidacion(bigint) FROM PUBLIC;

CREATE OR REPLACE FUNCTION fin.fn_tramos_liquidacion(p_liq bigint)
RETURNS TABLE (item_id bigint, viaje text, salida date, llegada date, linea text, recorrido text,
               km numeric, canon numeric, canon_moneda text, canon_base numeric, estado text, detalle text, ajustado boolean, motivo text,
               fuente_fecha text, viaje_salida date, viaje_llegada date)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
SET jit TO 'off'
AS $f$
    WITH l AS (
        SELECT lm.id, lm.chofer_id, ch.fecha_egreso, lm.hasta AS corte,
               -- aprobada o pagada: lo que quedó en su renglón de bono por tramo
               CASE WHEN lm.estado <> 'borrador' THEN (SELECT r.referencia FROM fin.liquidacion_renglon r
                                                        WHERE r.liquidacion_id = lm.id AND r.codigo = 'CANON' AND r.eliminado_en IS NULL
                                                          AND jsonb_typeof(r.referencia -> 'tramos') = 'array' ORDER BY r.id DESC LIMIT 1) END AS propia
          FROM fin.liquidacion_mensual lm JOIN mae.chofer ch ON ch.id = lm.chofer_id WHERE lm.id = p_liq),
    mv AS (
        SELECT x.*, ln.codigo AS linea_op, ln.canon_chofer AS lcanon, ln.canon_moneda::text AS lmoneda, ln.distancia_km AS lkm,
               -- La forma del tramo la fija lo que ya se decidió sobre él: RRHH decidió sobre el tramo entero o sobre una parte;
               -- y en una liquidación aprobada o pagada, cómo quedó en su renglón (entero o por partes).
               (a0.tramo_id IS NOT NULL OR coalesce((l.propia -> 'tramos') @> to_jsonb(x.clave), false)) AS decidido_entero,
               greatest(coalesce((SELECT max(a.parte) FROM fin.movimiento_liquidacion a
                                   WHERE a.tramo_id = x.clave AND a.chofer_id = l.chofer_id AND a.parte > 0), 0),
                        coalesce((SELECT max((-(e #>> '{}')::bigint) % 10)
                                    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(l.propia -> 'partes') = 'array' THEN l.propia -> 'partes' ELSE '[]'::jsonb END) e
                                   WHERE (-(e #>> '{}')::bigint) / 10 = x.clave), 0))::int AS partes_min
          FROM l
          CROSS JOIN LATERAL fin.fn_movimientos_liquidacion(l.id) x
          LEFT JOIN mae.linea ln ON ln.id = x.linea_id
          LEFT JOIN fin.movimiento_liquidacion a0 ON a0.tramo_id = x.clave AND a0.chofer_id = l.chofer_id AND a0.parte = 0),
    -- 1 · Las líneas que quedaron en el viaje del chofer para esa operación (como en el cierre), con su bono y sus km
    it0 AS (
        SELECT mv.clave, mv.origen_id AS mo, mv.destino_id AS md, mv.choferes, i.id AS item,
               ln.codigo, uo.nombre AS origen, ud.nombre AS destino,
               -- una línea cargada hasta la base o una aduana cuenta como una línea hasta la ciudad de la base
               fin.fn_lugar_de_linea(ln.lugar_retiro_id) AS o, fin.fn_lugar_de_linea(ln.lugar_entrega_id) AS d,
               -- El renglón del viaje manda si lo ajustaron a mano (tiene motivo). Si no, vale lo que dice la línea hoy:
               -- el bono que quedó copiado en el viaje puede ser viejo (por ejemplo, 160.000 ARS de cuando la línea estaba en pesos).
               CASE WHEN aj.si THEN coalesce(i.km, ln.distancia_km, 0) ELSE coalesce(ln.distancia_km, i.km, 0) END AS km,
               CASE WHEN aj.si AND i.canon IS NOT NULL THEN i.canon WHEN ln.canon_chofer IS NOT NULL THEN ln.canon_chofer ELSE i.canon END AS canon,
               CASE WHEN aj.si AND i.canon IS NOT NULL THEN i.canon_moneda::text WHEN ln.canon_chofer IS NOT NULL THEN ln.canon_moneda::text
                    ELSE i.canon_moneda::text END AS canon_moneda,
               CASE WHEN aj.si THEN btrim(i.motivo_ajuste) END AS motivo_ajuste
          FROM mv
          JOIN ops.viaje_chofer_item i ON i.servicio_id = mv.servicio_id AND i.eliminado_en IS NULL
          JOIN ops.viaje_chofer vc ON vc.id = i.viaje_id AND vc.chofer_id = (SELECT chofer_id FROM l) AND vc.estado <> 'anulado' AND vc.eliminado_en IS NULL
          JOIN mae.linea ln ON ln.id = i.linea_id
          LEFT JOIN mae.ubicacion uo ON uo.id = ln.lugar_retiro_id
          LEFT JOIN mae.ubicacion ud ON ud.id = ln.lugar_entrega_id
          CROSS JOIN LATERAL (SELECT nullif(btrim(i.motivo_ajuste), '') IS NOT NULL AS si) aj
         WHERE mv.servicio_id IS NOT NULL AND mv.con_carga AND NOT mv.local AND NOT mv.decidido_entero),
    it1 AS (
        SELECT it0.*, (row_number() OVER w)::int AS k, lag(it0.d) OVER w AS d_ant, (count(*) OVER (PARTITION BY it0.clave))::int AS n
          FROM it0 WINDOW w AS (PARTITION BY it0.clave ORDER BY it0.item)),
    it AS (
        SELECT it1.*, sum(CASE WHEN it1.k > 1 AND it1.d_ant IS DISTINCT FROM it1.o THEN 1 ELSE 0 END) OVER (PARTITION BY it1.clave ORDER BY it1.k) AS corte
          FROM it1),
    -- Las que van seguidas del origen al destino del movimiento. Si hay más de una forma (la operación cargada entera en un
    -- viaje y por tramos en otro, o dos veces), vale la que tiene más tramos y, si empatan, la última que se cargó.
    ini AS (SELECT it.clave, it.k, it.corte FROM it WHERE it.choferes = 1 AND it.o = it.mo),
    cand AS (
        SELECT ini.clave, ini.k AS k1,
               (SELECT min(f.k) FROM it f WHERE f.clave = ini.clave AND f.corte = ini.corte AND f.k >= ini.k AND f.d = f.md) AS k2
          FROM ini),
    run AS (
        (SELECT DISTINCT ON (c.clave) c.clave, c.k1, c.k2
           FROM cand c
          WHERE c.k2 IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM ini i2 WHERE i2.clave = c.clave AND i2.k > c.k1 AND i2.k <= c.k2)
          ORDER BY c.clave, (c.k2 - c.k1) DESC, c.k1 DESC)
        UNION ALL
        -- con relevo: las del chofer, si van todas seguidas (dicen qué parte hizo)
        SELECT a.clave, a.k, b.k
          FROM it a JOIN it b ON b.clave = a.clave AND b.corte = a.corte AND b.k = a.n
         WHERE a.choferes > 1 AND a.k = 1),
    -- 2 · Las líneas con bono que arman el recorrido, cuando:
    --       · no hay una línea con bono para ese recorrido (como siempre); o
    --       · la línea directa tiene bono, pero el tramo tiene que verse por partes: RRHH ya decidió sobre una parte
    --         (o así quedó en la liquidación aprobada), o hubo relevo de chofer. Ahí se arma sin usar la línea directa.
    --     Con relevo solo sirve si las partes son tantas como choferes: a cada uno le toca la suya, por orden.
    run_ok AS (SELECT run.clave FROM run JOIN mv ON mv.clave = run.clave WHERE (run.k2 - run.k1 + 1) >= mv.partes_min),
    cad AS (
        SELECT mv.clave, p.parte, p.partes, p.codigo, p.origen, p.destino, p.km, p.canon, p.canon_moneda,
               CASE WHEN mv.choferes > 1 THEN 'la parte que le toca por el relevo' ELSE 'armado con las líneas con bono' END AS de_donde
          FROM mv CROSS JOIN LATERAL (
                  SELECT q.parte, q.partes, q.codigo, q.origen, q.destino, q.km, q.canon, q.canon_moneda, false AS forzada
                    FROM fin.fn_lineas_camino_partes(mv.origen_id, mv.destino_id) q
                   WHERE mv.linea_id IS NULL OR mv.lcanon IS NULL
                  UNION ALL
                  SELECT q.parte, q.partes, q.codigo, q.origen, q.destino, q.km, q.canon, q.canon_moneda, true
                    FROM fin.fn_lineas_camino_partes_sin(mv.origen_id, mv.destino_id, mv.linea_id) q
                   WHERE mv.linea_id IS NOT NULL AND mv.lcanon IS NOT NULL AND (mv.partes_min > 0 OR mv.choferes > 1)
                     -- solo si es el mismo recorrido partido (no un rodeo por otra ciudad): no mucho más largo que la línea directa
                     AND q.km_total <= mv.lkm * 1.5) p
         WHERE mv.con_carga AND NOT mv.local AND NOT mv.decidido_entero
           AND mv.clave NOT IN (SELECT run_ok.clave FROM run_ok)
           AND (mv.choferes = 1 OR (p.partes = mv.choferes AND p.parte = mv.orden))
           AND (NOT p.forzada OR mv.choferes > 1 OR p.partes >= mv.partes_min)),
    pt AS (
        -- la del viaje: si alcanza para lo ya decidido, o si no hay otra forma de armarlo
        SELECT it.clave, (it.k - run.k1 + 1)::int AS parte, (run.k2 - run.k1 + 1)::int AS partes, it.codigo, it.origen, it.destino, it.km, it.canon,
               it.canon_moneda, 'del viaje del chofer'::text AS de_donde, it.motivo_ajuste
          FROM it JOIN run ON run.clave = it.clave AND it.k BETWEEN run.k1 AND run.k2
         WHERE run.clave IN (SELECT run_ok.clave FROM run_ok) OR run.clave NOT IN (SELECT cad.clave FROM cad)
        UNION ALL
        SELECT cad.clave, cad.parte, cad.partes, cad.codigo, cad.origen, cad.destino, cad.km, cad.canon, cad.canon_moneda, cad.de_donde, NULL
          FROM cad),
    ptk AS (
        SELECT pt.*, coalesce(sum(pt.km) OVER (PARTITION BY pt.clave ORDER BY pt.parte ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS km_antes,
               sum(pt.km) OVER (PARTITION BY pt.clave) AS km_total, (count(*) OVER (PARTITION BY pt.clave))::int AS filas
          FROM pt),
    u AS (
        -- el movimiento entero
        SELECT mv.clave AS clave_item, mv.clave, 0 AS parte, 0 AS partes, mv.tramos, mv.operacion, mv.tractor, mv.recorrido,
               mv.desde, mv.hasta, mv.terminado, mv.con_carga, mv.local, mv.linea_op AS linea, mv.lcanon AS canon_l, mv.lmoneda AS moneda_l,
               coalesce(mv.lkm, mv.km_movimiento) AS km_l, (mv.linea_id IS NOT NULL) AS con_linea,
               (mv.choferes > 1 AND NOT mv.decidido_entero) AS relevo, NULL::text AS armado, false AS estimada, mv.asignado, mv.sin_salida
          FROM mv WHERE NOT EXISTS (SELECT 1 FROM ptk WHERE ptk.clave = mv.clave)
        UNION ALL
        -- una fila por línea
        SELECT -(ptk.clave * 10 + ptk.parte), ptk.clave, ptk.parte, ptk.partes, mv.tramos, mv.operacion, mv.tractor,
               CASE WHEN ptk.partes = 1 AND cardinality(mv.tramos) = 1 AND mv.choferes = 1 THEN mv.recorrido ELSE ptk.origen || ' → ' || ptk.destino END,
               coalesce(mv.desde + (mv.hasta - mv.desde) * (ptk.km_antes / nullif(ptk.km_total, 0))::float8, mv.desde),
               coalesce(mv.desde + (mv.hasta - mv.desde) * ((ptk.km_antes + ptk.km) / nullif(ptk.km_total, 0))::float8, mv.hasta),
               mv.terminado, mv.con_carga, false, ptk.codigo, ptk.canon, ptk.canon_moneda, ptk.km, true, false,
               CASE WHEN ptk.partes = 1 THEN 'Línea ' || ptk.de_donde ELSE format('Parte %s de %s de %s (%s)', ptk.parte, ptk.partes, mv.recorrido, ptk.de_donde) END
               || coalesce(' · ajuste del viaje: ' || ptk.motivo_ajuste, ''),
               (ptk.filas > 1 AND mv.terminado), mv.asignado, mv.sin_salida
          FROM ptk JOIN mv ON mv.clave = ptk.clave),
    m AS (
        SELECT u.*, a.liquidar, a.canon AS a_canon, a.canon_moneda::text AS a_moneda, a.km AS a_km, a.motivo,
               (a.liquidar IS TRUE AND (a.canon IS NOT NULL OR a.km IS NOT NULL)) AS ajustado,
               l.fecha_egreso, l.corte, (l.propia IS NOT NULL) AS cerrada,
               (l.propia IS NOT NULL AND CASE WHEN u.parte = 0 THEN (l.propia -> 'tramos') @> to_jsonb(u.clave)
                                              ELSE coalesce((l.propia -> 'partes') @> to_jsonb(u.clave_item), false) END) AS propio,
               (SELECT lm2.numero || ' (' || to_char(lm2.periodo, 'MM/YYYY') || ')'
                  FROM fin.liquidacion_renglon r2 JOIN fin.liquidacion_mensual lm2 ON lm2.id = r2.liquidacion_id
                 WHERE r2.codigo = 'CANON' AND r2.eliminado_en IS NULL AND lm2.id <> l.id AND lm2.chofer_id = l.chofer_id
                   AND lm2.estado <> 'anulada' AND lm2.eliminado_en IS NULL
                   AND ((jsonb_typeof(r2.referencia -> 'tramos') = 'array'
                         AND EXISTS (SELECT 1 FROM unnest(u.tramos) x WHERE (r2.referencia -> 'tramos') @> to_jsonb(x)))
                        OR (jsonb_typeof(r2.referencia -> 'movimientos') = 'array'
                            AND EXISTS (SELECT 1 FROM unnest(CASE WHEN u.parte = 0 OR cardinality(u.tramos) = 1 THEN u.tramos
                                                                  WHEN u.partes = cardinality(u.tramos) THEN ARRAY[u.tramos[u.parte]]
                                                                  ELSE u.tramos END) x
                                         WHERE (r2.referencia -> 'movimientos') @> to_jsonb(x)))
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
               (m.asignado AT TIME ZONE 'America/Argentina/Mendoza')::date AS f_asignado,
               CASE WHEN m.terminado THEN (m.hasta AT TIME ZONE 'America/Argentina/Mendoza')::date END AS f_hasta,
               CASE WHEN m.ajustado AND m.a_km IS NOT NULL THEN m.a_km ELSE m.km_l END AS v_km,
               CASE WHEN m.ajustado AND m.a_canon IS NOT NULL THEN m.a_canon ELSE m.canon_l END AS v_canon,
               CASE WHEN m.ajustado AND m.a_canon IS NOT NULL THEN m.a_moneda ELSE m.moneda_l END AS v_moneda
          FROM m),
    w AS (
        SELECT v.*,
               CASE WHEN v.liquidar IS FALSE THEN 'no_se_liquida'
                    WHEN v.en_otra IS NOT NULL THEN 'en_otra'
                    WHEN v.fecha_egreso IS NOT NULL AND v.f_desde > v.fecha_egreso THEN 'despues_baja'
                    WHEN v.ajustado THEN 'incluido'
                    WHEN NOT v.con_carga THEN 'vacio'
                    WHEN v.local THEN 'local'
                    WHEN NOT v.terminado THEN 'en_curso'
                    WHEN v.relevo OR NOT v.con_linea THEN 'sin_linea'
                    ELSE 'incluido' END AS e
          FROM v)
    SELECT v.clave_item, 'Op. ' || coalesce(v.operacion::text, '—') || coalesce(' · ' || v.tractor, ''),
           v.f_desde, v.f_hasta, v.linea, v.recorrido, v.v_km, v.v_canon, v.v_moneda,
           CASE WHEN v.v_canon IS NULL THEN NULL WHEN v.v_moneda = ref.fn_moneda_base() THEN v.v_canon
                ELSE ops.fn_a_moneda_base(v.v_canon, v.v_moneda, coalesce(v.f_hasta, mae.fn_hoy())) END,
           -- aprobada o pagada: «se liquida» es lo que quedó en su renglón; lo que terminó después entra en la siguiente
           CASE WHEN v.cerrada AND v.propio THEN 'incluido'
                WHEN v.cerrada AND v.e IN ('incluido', 'en_curso') THEN 'fuera'
                ELSE v.e END,
           CASE WHEN v.cerrada AND v.propio AND v.e <> 'incluido' THEN v.armado
                WHEN v.cerrada AND NOT v.propio AND v.e = 'incluido' THEN 'No estaba cuando se aprobó esta liquidación: entra en la siguiente'
                WHEN v.cerrada AND NOT v.propio AND v.e = 'en_curso' THEN 'Sigue en curso: entra en la liquidación siguiente cuando llegue'
                WHEN v.liquidar IS FALSE THEN v.motivo
                WHEN v.en_otra IS NOT NULL THEN 'Ya está en la liquidación ' || v.en_otra
                WHEN v.fecha_egreso IS NOT NULL AND v.f_desde > v.fecha_egreso THEN 'Empezó después de la baja del chofer (' || to_char(v.fecha_egreso, 'DD/MM/YYYY') || ')'
                WHEN v.ajustado THEN 'Ajustado: ' || v.motivo || CASE WHEN NOT v.terminado THEN ' · todavía está en curso' ELSE '' END
                WHEN NOT v.con_carga THEN 'Vacío: no se paga'
                WHEN v.local THEN 'Movimiento dentro de la misma ciudad (base, aduanas): no lleva bono'
                WHEN v.sin_salida THEN 'Asignado el ' || to_char(v.f_asignado, 'DD/MM') || ': Operaciones todavía no registró la salida' || coalesce(' · ' || v.armado, '')
                WHEN NOT v.terminado THEN 'En curso' || CASE WHEN v.f_asignado < v.f_desde THEN ' (asignado el ' || to_char(v.f_asignado, 'DD/MM') || ')' ELSE '' END
                                          || ': entra cuando Operaciones registre la llegada' || coalesce(' · ' || v.armado, '')
                WHEN v.relevo THEN 'Hubo relevo de chofer en este movimiento: poné el bono y los km de la parte que hizo'
                WHEN NOT v.con_linea THEN 'No hay una línea con este recorrido: si corresponde, poné el bono y los km'
                WHEN v.canon_l IS NULL THEN 'La línea ' || v.linea || ' no tiene bono y no hay líneas con bono que la armen: cargalo en la línea o ajustalo acá'
                WHEN v.fecha_egreso IS NOT NULL AND v.f_hasta > v.fecha_egreso THEN 'Terminó después de la baja: revisá que lo haya hecho él'
                -- salió después del día de corte, pero el chofer ya lo tenía asignado: por eso está en esta liquidación
                ELSE nullif(concat_ws(' · ', v.armado, CASE WHEN NOT v.cerrada AND v.f_desde > v.corte AND v.f_asignado <= v.corte
                                                             THEN 'Asignado el ' || to_char(v.f_asignado, 'DD/MM') || ', antes del corte' END), '') END,
           coalesce(v.ajustado, false), v.motivo, CASE WHEN v.estimada THEN 'estimada' ELSE 'operacion' END, v.f_desde, v.f_hasta
      FROM w v
     ORDER BY v.desde, v.clave, v.parte
$f$;

-- ------------------------------------------------------------------ los renglones de la liquidación
CREATE OR REPLACE FUNCTION fin.fn_liq_tramos(p_liq bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE l fin.liquidacion_mensual%ROWTYPE; t record; v record; v_av jsonb; v_egreso date; v_tarde text; v_sinlinea int; v_curso int;
        v_filas jsonb; v_tr jsonb; v_movs jsonb; v_ref jsonb; v_sueltas text;
BEGIN
    SELECT * INTO l FROM fin.liquidacion_mensual WHERE id = p_liq;
    IF NOT FOUND OR l.estado <> 'borrador' THEN RETURN; END IF;
    SELECT fecha_egreso INTO v_egreso FROM mae.chofer WHERE id = l.chofer_id;
    PERFORM set_config('fin.liq_fn', '1', true);
    UPDATE fin.liquidacion_renglon SET eliminado_en = now()
     WHERE liquidacion_id = p_liq AND origen = 'sistema' AND codigo IN ('CANON', 'KM') AND eliminado_en IS NULL;

    SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]') INTO v_filas FROM fin.fn_tramos_liquidacion(p_liq) x;
    SELECT count(*)::int AS n, sum(f.km) AS km, sum(f.canon_base) AS canon,
           count(*) FILTER (WHERE f.canon IS NOT NULL AND f.canon_base IS NULL)::int AS sin_cot,
           count(*) FILTER (WHERE f.canon IS NULL)::int AS sin_bono,
           coalesce(jsonb_agg(f.item_id) FILTER (WHERE f.item_id < 0), '[]') AS partes,
           coalesce(jsonb_agg(DISTINCT f.viaje), '[]') AS operaciones
      INTO v
      FROM jsonb_to_recordset(v_filas) AS f(item_id bigint, viaje text, km numeric, canon numeric, canon_base numeric, estado text)
     WHERE f.estado = 'incluido';
    SELECT * INTO t FROM fin.fn_tarifa_en(l.chofer_id, l.hasta);
    -- Qué movimientos de Operaciones quedan pagados acá: los enteros y, de los que iban juntos, los de cada parte
    WITH mv AS (SELECT x.clave, x.tramos FROM fin.fn_movimientos_liquidacion(p_liq) x),
         f AS (SELECT * FROM jsonb_to_recordset(v_filas) AS f(item_id bigint, estado text)),
         np AS (SELECT (-f.item_id) / 10 AS clave, count(*)::int AS partes FROM f WHERE f.item_id < 0 GROUP BY 1)
    SELECT coalesce((SELECT jsonb_agg(DISTINCT u.u) FROM f JOIN mv ON mv.clave = f.item_id CROSS JOIN LATERAL unnest(mv.tramos) u(u)
                      WHERE f.item_id > 0 AND f.estado = 'incluido'), '[]'),
           coalesce((SELECT jsonb_agg(DISTINCT u.u) FROM f JOIN mv ON mv.clave = (-f.item_id) / 10 AND cardinality(mv.tramos) > 1
                       JOIN np ON np.clave = mv.clave
                      CROSS JOIN LATERAL unnest(CASE WHEN np.partes = cardinality(mv.tramos) THEN ARRAY[mv.tramos[((-f.item_id) % 10)::int]] ELSE mv.tramos END) u(u)
                      WHERE f.item_id < 0 AND f.estado = 'incluido'), '[]')
      INTO v_tr, v_movs;
    v_ref := jsonb_build_object('tramos', v_tr, 'partes', v.partes) || CASE WHEN v_movs <> '[]'::jsonb THEN jsonb_build_object('movimientos', v_movs) ELSE '{}'::jsonb END;

    PERFORM fin.fn_liq_renglon(p_liq, 'sistema', 'CANON', format('Bono por tramo (%s tramo%s)', v.n, CASE WHEN v.n = 1 THEN '' ELSE 's' END),
                               fin.fn_liq_tipo_param('fin.liq_canon_tipo'), v.n, NULL, coalesce(v.canon, 0),
                               v_ref || jsonb_build_object('operaciones', v.operaciones), 20);
    PERFORM fin.fn_liq_renglon(p_liq, 'sistema', 'KM', format('Km de línea (%s km × %s)', round(coalesce(v.km, 0)), coalesce(t.precio_km, 0)),
                               fin.fn_liq_tipo_param('fin.liq_km_tipo'), v.km, t.precio_km, coalesce(v.km, 0) * coalesce(t.precio_km, 0), v_ref, 30);

    SELECT count(*) FILTER (WHERE f.estado = 'sin_linea')::int, count(*) FILTER (WHERE f.estado = 'en_curso')::int INTO v_sinlinea, v_curso
      FROM jsonb_to_recordset(v_filas) AS f(estado text);
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
        v_av := v_av || to_jsonb(format('Movimientos: %s cargado(s) sin una línea igual o con relevo de chofer: no se pagan hasta que pongas el bono y los km', v_sinlinea));
    END IF;
    IF v_curso > 0 THEN
        v_av := v_av || to_jsonb(format('Tramos: %s en curso que el chofer ya tenía asignados el %s: entran acá cuando Operaciones registre la llegada (después, volvé a preparar)',
                                        v_curso, to_char(l.hasta, 'DD/MM')));
    END IF;
    -- Decisiones de RRHH sobre una parte que ya no existe (cambió cómo se arma el tramo): que no pasen sin verse
    SELECT string_agg(DISTINCT 'Op. ' || coalesce(mv.operacion::text, '—'), ', ') INTO v_sueltas
      FROM fin.movimiento_liquidacion a JOIN fin.fn_movimientos_liquidacion(p_liq) mv ON mv.clave = a.tramo_id
     WHERE a.chofer_id = l.chofer_id AND a.parte > 0
       AND NOT EXISTS (SELECT 1 FROM jsonb_to_recordset(v_filas) AS f(item_id bigint) WHERE f.item_id = -(a.tramo_id * 10 + a.parte));
    IF v_sueltas IS NOT NULL THEN
        v_av := v_av || to_jsonb(format('Tramos: hay decisiones de RRHH que ya no coinciden con ninguna fila (%s): revisá esos tramos', v_sueltas));
    END IF;
    IF coalesce(v.km, 0) > 0 AND t.precio_km IS NULL THEN
        v_av := v_av || to_jsonb('Hay km de línea pero no precio por km'::text);
    END IF;
    IF v_egreso IS NOT NULL THEN
        SELECT string_agg(DISTINCT f.viaje, ', ') INTO v_tarde
          FROM jsonb_to_recordset(v_filas) AS f(viaje text, estado text, llegada date, ajustado boolean)
         WHERE f.estado = 'incluido' AND f.llegada > v_egreso AND NOT f.ajustado;
        IF v_tarde IS NOT NULL THEN
            v_av := v_av || to_jsonb(format('Tramos: %s terminó después de la baja del chofer (%s): revisá que lo haya hecho él', v_tarde, to_char(v_egreso, 'DD/MM/YYYY')));
        END IF;
    END IF;
    UPDATE fin.liquidacion_mensual SET avisos = v_av WHERE id = p_liq;
    PERFORM fin.fn_liq_totales(p_liq);
END $f$;

-- ------------------------------------------------------------------ 7 · decidir un tramo: recibe también la liquidación
CREATE OR REPLACE FUNCTION fin.fn_guardar_tramo_liquidacion(p_item bigint, p_liquidar boolean, p_canon numeric, p_moneda text, p_km numeric, p_motivo text,
                                                            p_liq bigint DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_usr bigint; v_chofer bigint; v_liq bigint; v_mon text := upper(nullif(btrim(p_moneda), ''));
        v_tramo bigint := CASE WHEN p_item < 0 THEN (-p_item) / 10 ELSE p_item END;
        v_parte smallint := CASE WHEN p_item < 0 THEN ((-p_item) % 10)::smallint ELSE 0 END;
        v_movs bigint[]; v_grupo bigint[];
BEGIN
    v_usr := fin.fn_exigir_rol_liq(ARRAY['rrhh','ti'], 'Los tramos de la liquidación los deciden RRHH o TI');
    IF p_liq IS NOT NULL THEN
        -- Con relevo de chofer el mismo movimiento está en la liquidación de los dos: manda la que se está mirando
        SELECT lm.chofer_id INTO v_chofer FROM fin.liquidacion_mensual lm WHERE lm.id = p_liq AND lm.estado = 'borrador' AND lm.eliminado_en IS NULL;
        IF v_chofer IS NULL THEN RAISE EXCEPTION 'La liquidación no está en borrador: para cambiar sus tramos, reabrila' USING ERRCODE = '55000'; END IF;
        SELECT mv.tramos INTO v_movs FROM fin.fn_movimientos_liquidacion(p_liq) mv WHERE mv.clave = v_tramo;
        IF v_movs IS NULL THEN v_chofer := NULL; END IF;
    ELSE
        SELECT lm.chofer_id, (SELECT mv.tramos FROM fin.fn_movimientos_liquidacion(lm.id) mv WHERE mv.clave = v_tramo) INTO v_chofer, v_movs
          FROM fin.liquidacion_mensual lm
         WHERE lm.estado = 'borrador' AND lm.eliminado_en IS NULL
           AND EXISTS (SELECT 1 FROM fin.fn_movimientos_liquidacion(lm.id) mv WHERE mv.clave = v_tramo)
         ORDER BY lm.periodo DESC LIMIT 1;
    END IF;
    IF v_chofer IS NULL THEN RAISE EXCEPTION 'El tramo no está en ninguna liquidación en borrador' USING ERRCODE = 'P0002'; END IF;
    IF EXISTS (SELECT 1 FROM fin.liquidacion_renglon r JOIN fin.liquidacion_mensual lm ON lm.id = r.liquidacion_id
                WHERE r.codigo = 'CANON' AND r.eliminado_en IS NULL AND lm.estado IN ('aprobada','pagada') AND lm.eliminado_en IS NULL
                  AND lm.chofer_id = v_chofer
                  AND ((jsonb_typeof(r.referencia -> 'tramos') = 'array' AND EXISTS (SELECT 1 FROM unnest(v_movs) x WHERE (r.referencia -> 'tramos') @> to_jsonb(x)))
                       OR (jsonb_typeof(r.referencia -> 'movimientos') = 'array' AND EXISTS (SELECT 1 FROM unnest(v_movs) x WHERE (r.referencia -> 'movimientos') @> to_jsonb(x)))
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
        -- Si esos movimientos venían juntos por una decisión anterior, la nueva decisión es sobre el mismo conjunto
        SELECT a.grupo INTO v_grupo FROM fin.movimiento_liquidacion a
         WHERE a.tramo_id = v_tramo AND a.chofer_id = v_chofer AND a.grupo IS NOT NULL LIMIT 1;
        INSERT INTO fin.movimiento_liquidacion (tramo_id, chofer_id, parte, liquidar, canon, canon_moneda, km, motivo, creado_por, grupo)
        VALUES (v_tramo, v_chofer, v_parte, p_liquidar, CASE WHEN p_liquidar THEN p_canon END,
                CASE WHEN p_liquidar AND p_canon IS NOT NULL THEN v_mon END, CASE WHEN p_liquidar THEN p_km END, left(btrim(p_motivo), 300), v_usr, v_grupo)
        ON CONFLICT (tramo_id, chofer_id, parte) DO UPDATE SET liquidar = EXCLUDED.liquidar, canon = EXCLUDED.canon,
               canon_moneda = EXCLUDED.canon_moneda, km = EXCLUDED.km, motivo = EXCLUDED.motivo, creado_en = now(), creado_por = EXCLUDED.creado_por;
    END IF;
    -- del período más viejo al más nuevo: si el tramo puede ir en dos borradores, lo toma el más viejo
    FOR v_liq IN SELECT id FROM fin.liquidacion_mensual WHERE chofer_id = v_chofer AND estado = 'borrador' AND eliminado_en IS NULL ORDER BY hasta, id LOOP
        PERFORM fin.fn_liq_tramos(v_liq);
    END LOOP;
END $f$;

DO $g$
DECLARE r record;
BEGIN
    -- Los permisos de la función anterior (sin la liquidación) pasan a la nueva y la anterior se saca: queda una sola.
    -- La web de antes la llama sin la liquidación y sigue andando (p_liq es opcional).
    REVOKE ALL ON FUNCTION fin.fn_guardar_tramo_liquidacion(bigint, boolean, numeric, text, numeric, text, bigint) FROM PUBLIC;
    IF to_regprocedure('fin.fn_guardar_tramo_liquidacion(bigint,boolean,numeric,text,numeric,text)') IS NOT NULL THEN
        FOR r IN SELECT a.grantee FROM pg_proc p, aclexplode(p.proacl) a
                  WHERE p.oid = 'fin.fn_guardar_tramo_liquidacion(bigint,boolean,numeric,text,numeric,text)'::regprocedure
                    AND a.privilege_type = 'EXECUTE' AND a.grantee <> 0 LOOP
            EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_guardar_tramo_liquidacion(bigint, boolean, numeric, text, numeric, text, bigint) TO %I', pg_get_userbyid(r.grantee));
        END LOOP;
        DROP FUNCTION fin.fn_guardar_tramo_liquidacion(bigint, boolean, numeric, text, numeric, text);
    END IF;
END $g$;

-- ------------------------------------------------------------------ la lista en pantalla: las partes en orden (1, 2, 3)
DO $o$
DECLARE v_def text := pg_get_functiondef('fin.fn_liquidacion_json(bigint)'::regprocedure);
        c_de CONSTANT text := 'ORDER BY x.viaje_salida, x.viaje, x.item_id)'; c_a CONSTANT text := 'ORDER BY x.viaje_salida, x.viaje, abs(x.item_id))';
BEGIN
    IF (length(v_def) - length(replace(v_def, c_de, ''))) / length(c_de) = 1 THEN
        EXECUTE replace(v_def, c_de, c_a);
    ELSIF position(c_a IN v_def) = 0 THEN
        RAISE NOTICE 'fin.fn_liquidacion_json no tiene el orden esperado: las partes de un mismo movimiento pueden verse en otro orden (solo cambia el orden en pantalla)';
    END IF;
END $o$;

-- ------------------------------------------------------------------ los borradores quedan al día (bono por tramo y km)
-- Del período más viejo al más nuevo: si un movimiento puede ir en dos, lo toma el más viejo.
DO $b$
DECLARE r record; v_piso date := (ref.fn_parametro_texto('fin.liq_tramos_desde', '2026-10-27'))::date; n int := 0;
BEGIN
    FOR r IN SELECT lm.id FROM fin.liquidacion_mensual lm WHERE lm.estado = 'borrador' AND lm.eliminado_en IS NULL AND lm.hasta >= v_piso ORDER BY lm.periodo, lm.id LOOP
        PERFORM fin.fn_liq_tramos(r.id);
        n := n + 1;
    END LOOP;
    INSERT INTO _l384_informe VALUES (5, 'Liquidaciones en borrador con el bono por tramo y los km rehechos', NULL, n::text, NULL);
    IF to_regclass('fin.estimado_choferes') IS NOT NULL THEN
        DELETE FROM fin.estimado_choferes;   -- el estimado del tablero se calcula de nuevo la próxima vez que se mire
    END IF;
END $b$;

-- ------------------------------------------------------------------ control (con los borradores ya rehechos): nada de lo que RRHH sacó vuelve a quedar para liquidar
DO $k$
DECLARE r record; v_mal text; v_piso date := (ref.fn_parametro_texto('fin.liq_tramos_desde', '2026-10-27'))::date;
BEGIN
    IF EXISTS (SELECT 1 FROM ref.parametro WHERE codigo = 'fin.liq_por_movimiento') THEN RETURN; END IF;
    -- Foto de ahora (con los borradores ya rehechos), con las funciones nuevas
    FOR r IN SELECT lm.id FROM fin.liquidacion_mensual lm
              WHERE lm.estado <> 'anulada' AND lm.eliminado_en IS NULL AND lm.hasta >= v_piso LOOP
        INSERT INTO _l384_despues
        SELECT r.id, x.item_id, x.estado, x.canon_base, x.km, mv.tramos, x.recorrido, x.linea, (x.estado = 'incluido' AND x.canon IS NULL),
               x.viaje, x.salida, x.llegada, x.detalle
          FROM fin.fn_tramos_liquidacion(r.id) x
          LEFT JOIN fin.fn_movimientos_liquidacion(r.id) mv ON mv.clave = CASE WHEN x.item_id < 0 THEN (-x.item_id) / 10 ELSE x.item_id END;
    END LOOP;

    -- Lo que RRHH sacó a mano sigue sacado (misma fila, y no «se liquida»)
    SELECT string_agg(DISTINCT format('%s · tramo %s', lm.numero, a.item_id), ' | ') INTO v_mal
      FROM _l384_antes a JOIN fin.liquidacion_mensual lm ON lm.id = a.liq
     WHERE a.estado = 'no_se_liquida'
       AND NOT EXISTS (SELECT 1 FROM _l384_despues d WHERE d.liq = a.liq AND d.item_id = a.item_id AND d.estado <> 'incluido');
    IF v_mal IS NOT NULL THEN
        RAISE EXCEPTION 'No se aplicó nada: con el cambio volverían a quedar para liquidar tramos que RRHH había sacado: %. Pasale este mensaje a TI', v_mal;
    END IF;
    -- Lo que ya está en otra liquidación no vuelve a quedar para liquidar
    SELECT string_agg(DISTINCT format('%s · tramo %s', lm.numero, a.item_id), ' | ') INTO v_mal
      FROM _l384_antes a JOIN fin.liquidacion_mensual lm ON lm.id = a.liq
     WHERE a.estado = 'en_otra'
       AND EXISTS (SELECT 1 FROM _l384_despues d WHERE d.liq = a.liq AND d.item_id = a.item_id AND d.estado = 'incluido');
    IF v_mal IS NOT NULL THEN
        RAISE EXCEPTION 'No se aplicó nada: con el cambio volverían a quedar para liquidar tramos que ya están en otra liquidación: %. Pasale este mensaje a TI', v_mal;
    END IF;
    -- Aviso: un tramo que figuraba «en otra liquidación» y ahora sus movimientos se ven de otra forma y alguno queda para liquidar
    SELECT string_agg(DISTINCT format('%s · movimientos %s', lm.numero, array_to_string(a.movs, ', ')), ' | ') INTO v_mal
      FROM _l384_antes a JOIN fin.liquidacion_mensual lm ON lm.id = a.liq
     WHERE a.estado = 'en_otra' AND lm.estado = 'borrador'
       AND NOT EXISTS (SELECT 1 FROM _l384_despues d WHERE d.liq = a.liq AND d.item_id = a.item_id)
       AND EXISTS (SELECT 1 FROM _l384_despues d
                    WHERE d.liq = a.liq AND d.estado = 'incluido' AND d.movs && a.movs
                      AND NOT EXISTS (SELECT 1 FROM _l384_antes o WHERE o.liq = d.liq AND o.item_id = d.item_id));
    IF v_mal IS NOT NULL THEN
        INSERT INTO _l384_informe VALUES (7, 'PARA REVISAR: figuraban en otra liquidación y ahora algún movimiento queda para liquidar', NULL, v_mal, NULL);
    END IF;
    -- Lo que RRHH ajustó a mano sigue en la lista y se sigue liquidando
    SELECT string_agg(DISTINCT format('%s · tramo %s', lm.numero, a.item_id), ' | ') INTO v_mal
      FROM _l384_antes a JOIN fin.liquidacion_mensual lm ON lm.id = a.liq
     WHERE a.estado = 'incluido' AND a.ajustado
       AND NOT EXISTS (SELECT 1 FROM _l384_despues d WHERE d.liq = a.liq AND d.item_id = a.item_id AND d.estado = 'incluido');
    IF v_mal IS NOT NULL THEN
        RAISE EXCEPTION 'No se aplicó nada: con el cambio se perderían tramos que RRHH ajustó a mano: %. Pasale este mensaje a TI', v_mal;
    END IF;
    -- En las aprobadas o pagadas, lo que se liquida tiene que ser lo mismo que antes: si no, se avisa (los importes aprobados no cambian)
    SELECT string_agg(DISTINCT lm.numero, ', ') INTO v_mal
      FROM fin.liquidacion_mensual lm
     WHERE lm.estado IN ('aprobada', 'pagada') AND lm.id IN (SELECT liq FROM _l384_antes UNION SELECT liq FROM _l384_despues)
       AND (EXISTS (SELECT a.item_id, round(coalesce(a.canon_base, 0)), round(coalesce(a.km, 0)) FROM _l384_antes a WHERE a.liq = lm.id AND a.estado = 'incluido'
                    EXCEPT SELECT d.item_id, round(coalesce(d.canon_base, 0)), round(coalesce(d.km, 0)) FROM _l384_despues d WHERE d.liq = lm.id AND d.estado = 'incluido')
         OR EXISTS (SELECT d.item_id, round(coalesce(d.canon_base, 0)), round(coalesce(d.km, 0)) FROM _l384_despues d WHERE d.liq = lm.id AND d.estado = 'incluido'
                    EXCEPT SELECT a.item_id, round(coalesce(a.canon_base, 0)), round(coalesce(a.km, 0)) FROM _l384_antes a WHERE a.liq = lm.id AND a.estado = 'incluido'));
    IF v_mal IS NOT NULL THEN
        INSERT INTO _l384_informe VALUES (6, 'PARA REVISAR: la lista de tramos de estas liquidaciones aprobadas o pagadas se ve distinta (sus importes no cambian)', NULL, v_mal, NULL);
    END IF;
END $k$;

-- ------------------------------------------------------------------ informe: qué cambió en cada liquidación
INSERT INTO _l384_informe
SELECT 100 + (row_number() OVER (ORDER BY ops.fn_nombre_chofer(lm.chofer_id)))::int,
       lm.numero || ' · ' || ops.fn_nombre_chofer(lm.chofer_id) || ' · ' || lm.estado,
       format('%s tramos · bono %s · %s km', a.n, round(coalesce(a.bono, 0)), round(coalesce(a.km, 0))),
       format('%s tramos · bono %s · %s km', d.n, round(coalesce(d.bono, 0)), round(coalesce(d.km, 0))),
       nullif(concat_ws(' · ', CASE WHEN d.curso > 0 THEN d.curso || ' en curso' END, CASE WHEN d.sin_linea > 0 THEN d.sin_linea || ' sin línea o con relevo' END,
                        CASE WHEN d.locales > 0 THEN d.locales || ' entre base y aduana' END), '')
  FROM fin.liquidacion_mensual lm
  LEFT JOIN LATERAL (SELECT count(*) FILTER (WHERE x.estado = 'incluido') AS n, sum(x.canon_base) FILTER (WHERE x.estado = 'incluido') AS bono,
                            sum(x.km) FILTER (WHERE x.estado = 'incluido') AS km FROM _l384_antes x WHERE x.liq = lm.id) a ON true
  LEFT JOIN LATERAL (SELECT count(*) FILTER (WHERE x.estado = 'incluido') AS n, sum(x.canon_base) FILTER (WHERE x.estado = 'incluido') AS bono,
                            sum(x.km) FILTER (WHERE x.estado = 'incluido') AS km, count(*) FILTER (WHERE x.estado = 'en_curso') AS curso,
                            count(*) FILTER (WHERE x.estado = 'sin_linea') AS sin_linea, count(*) FILTER (WHERE x.estado = 'local') AS locales
                       FROM _l384_despues x WHERE x.liq = lm.id) d ON true
 WHERE lm.id IN (SELECT liq FROM _l384_despues UNION SELECT liq FROM _l384_antes)
   AND (a.n IS DISTINCT FROM d.n OR round(coalesce(a.bono, 0)) IS DISTINCT FROM round(coalesce(d.bono, 0))
        OR round(coalesce(a.km, 0)) IS DISTINCT FROM round(coalesce(d.km, 0)) OR d.curso > 0 OR d.sin_linea > 0);

INSERT INTO _l384_informe
SELECT 8, 'PARA REVISAR: recorridos cargados que quedan «sin línea» en los borradores (falta la línea en Datos › Líneas, o hubo relevo de chofer)', NULL,
       string_agg(q.recorrido || CASE WHEN q.n > 1 THEN ' ×' || q.n ELSE '' END, ' | ' ORDER BY q.n DESC, q.recorrido), NULL
  FROM (SELECT coalesce(d.recorrido, '—') AS recorrido, count(*) AS n
          FROM _l384_despues d JOIN fin.liquidacion_mensual lm ON lm.id = d.liq
         WHERE lm.estado = 'borrador' AND d.estado = 'sin_linea' GROUP BY 1) q
HAVING count(*) > 0;

INSERT INTO _l384_informe
SELECT 9, 'PARA REVISAR: líneas sin bono cargado en tramos que se liquidan (borradores)', NULL,
       string_agg(q.linea || CASE WHEN q.n > 1 THEN ' ×' || q.n ELSE '' END, ' | ' ORDER BY q.n DESC, q.linea), NULL
  FROM (SELECT coalesce(d.linea, d.recorrido, '—') AS linea, count(*) AS n
          FROM _l384_despues d JOIN fin.liquidacion_mensual lm ON lm.id = d.liq
         WHERE lm.estado = 'borrador' AND d.sin_bono GROUP BY 1) q
HAVING count(*) > 0;

INSERT INTO _l384_informe
SELECT 10, 'Lugares que cuentan como ' || coalesce((SELECT u.nombre FROM mae.ubicacion u WHERE u.id = nullif(ref.fn_parametro_num('ops.base_ciudad_id', 0), 0)::bigint), '—'),
       NULL,
       coalesce((SELECT string_agg(u.nombre, ' | ' ORDER BY u.tipo DESC, u.nombre) FROM mae.ubicacion u
                  WHERE u.eliminado_en IS NULL AND fin.fn_lugar_de_linea(u.id) <> u.id), 'ninguno'),
       'Cargados como base o aduana que NO cuentan (un tramo que termina ahí queda sin línea): '
       || coalesce((SELECT string_agg(u.nombre, ' | ' ORDER BY u.nombre) FROM mae.ubicacion u
                     WHERE u.eliminado_en IS NULL AND u.tipo IN ('base', 'aduana') AND fin.fn_lugar_de_linea(u.id) = u.id), 'ninguno');

INSERT INTO _l384_informe
SELECT 11, 'PARA REVISAR: decisiones de RRHH que ya no coinciden con ninguna fila (cambió cómo se arma el tramo)', NULL,
       string_agg(q.t, ' | ' ORDER BY q.t), NULL
  FROM (SELECT DISTINCT lm.numero || ' · ' || ops.fn_nombre_chofer(lm.chofer_id) || ' · Op. ' || coalesce(mv.operacion::text, '—') || ' · parte ' || a.parte AS t
          FROM fin.liquidacion_mensual lm
          CROSS JOIN LATERAL fin.fn_movimientos_liquidacion(lm.id) mv
          JOIN fin.movimiento_liquidacion a ON a.tramo_id = mv.clave AND a.chofer_id = lm.chofer_id AND a.parte > 0
         WHERE lm.estado = 'borrador' AND lm.eliminado_en IS NULL
           AND lm.hasta >= (ref.fn_parametro_texto('fin.liq_tramos_desde', '2026-10-27'))::date
           AND NOT EXISTS (SELECT 1 FROM fin.fn_tramos_liquidacion(lm.id) x WHERE x.item_id = -(a.tramo_id * 10 + a.parte))) q
HAVING count(*) > 0;

INSERT INTO ref.parametro (codigo, valor, descripcion)
SELECT 'fin.liq_por_movimiento', to_jsonb(to_char(now() AT TIME ZONE 'America/Argentina/Mendoza', 'YYYY-MM-DD HH24:MI')),
       'Migración 384: desde cuándo la liquidación toma un tramo por cada movimiento de Operaciones. Solo informativo: no cambiar.'
 WHERE NOT EXISTS (SELECT 1 FROM ref.parametro WHERE codigo = 'fin.liq_por_movimiento');

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT * FROM (
    SELECT 1 AS orden, 'Listo: cada movimiento de «Quién la llevó» es un tramo de la liquidación (entran los que el chofer tenía asignados hasta el día de corte)' AS dato,
           NULL::text AS antes,
           'La base y las aduanas cuentan como: ' || coalesce((SELECT u.nombre FROM mae.ubicacion u WHERE u.id = nullif(ref.fn_parametro_num('ops.base_ciudad_id', 0), 0)::bigint),
                                                          'FALTA DECIR CUÁL ES LA CIUDAD DE LA BASE (ops.base_ciudad_id)') AS ahora,
           NULL::text AS detalle
    UNION ALL SELECT * FROM _l384_informe) i
 ORDER BY i.orden;
