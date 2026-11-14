-- =============================================================================
-- IronTrack — 267 · Cambio 260 · Capacidad de tanques, mochila y total desde una sola función (backlog A3, parte 1)
-- -----------------------------------------------------------------------------
-- Regla que se conserva: tanques llenos no es lo mismo que camión completamente lleno.
-- La mochila está cargada como un tanque más del camión (tipo «mochila»). Hasta ahora varias
-- funciones sumaban todo junto y el pedido de carga trataba ese total como «tanques».
--   1. fue.fn_capacidad_camion(camión, momento) devuelve los tres números de las mismas
--      filas de mae.tanque_combustible: tanques_l, mochila_l y total_l (litros útiles).
--      Conserva «litros» (= total) y «tanques» (cantidad) para lo que ya la usaba.
--   2. fue.fn_capacidad_mochila lee de ella. La validación del faltante al cargar, al editar
--      y la alerta de carga que no entra dejan de usar mae.fn_capacidad_camion (queda sin uso,
--      junto con la vista mae.v_capacidad_camion que todavía lee Flota).
--   3. El combustible actual reparte lo que hay: tanques llenos primero y el resto en la
--      mochila (es una estimación). El total no cambia.
--   4. El pedido de carga deja de tomar la mochila como tanque: disponible e inicial salen
--      repartidos con la capacidad de tanques. Lo recomendado, lo que falta para llegar y lo
--      que falta para llenar NO cambian (se calculan con el total).
-- No cambia tablas. La migración saca una foto de «antes» de todos los camiones y de los
-- pedidos de los viajes en curso, aplica, compara y se frena sola si un total cambia.
-- web.version_base = 267.
-- =============================================================================
SET search_path = public, extensions;
BEGIN;

DO $do$
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 266 THEN
        RAISE EXCEPTION 'Falta la migración 266 (cambio 259): aplicarla antes';
    END IF;
    IF (SELECT prosrc FROM pg_proc WHERE oid = 'fue.fn_capacidad_camion(bigint,timestamptz)'::regprocedure) LIKE '%total_l%' THEN
        RAISE EXCEPTION 'La migración 267 (capacidad de tanques y mochila) ya está aplicada';
    END IF;
    IF (SELECT prosrc FROM pg_proc WHERE oid = 'fue.fn_capacidad_camion(bigint,timestamptz)'::regprocedure)
           NOT LIKE '%''litros'', f.l, ''tanques'', f.n, ''fuente'', ''en_fecha''%' THEN
        RAISE EXCEPTION 'fue.fn_capacidad_camion no es la esperada: avisar antes de seguir';
    END IF;
END $do$;

-- -----------------------------------------------------------------------------
-- 0 · Foto de «antes»
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE zz_cam_267 ON COMMIT DROP AS
SELECT c.id, c.patente,
       (SELECT k.capacidad_util_l FROM mae.fn_capacidad_camion(c.id, mae.fn_hoy()) k) AS total,
       fue.fn_capacidad_mochila(c.id) AS mochila,
       (fue.fn_capacidad_camion(c.id, now()) ->> 'litros')::numeric AS total_fue,
       fue.fn_combustible_actual(c.id) AS comb
  FROM mae.camion c WHERE c.eliminado_en IS NULL;

CREATE TEMP TABLE zz_ped_267 ON COMMIT DROP AS
SELECT v.id, v.numero, v.camion_id, tel.fn_preparar_pedido_carga(v.id) AS b
  FROM ops.viaje_chofer v WHERE v.estado = 'abierto' AND v.eliminado_en IS NULL;

-- -----------------------------------------------------------------------------
-- 1 · La función única: tanques, mochila y total
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fue.fn_capacidad_camion(p_camion bigint, p_ts timestamp with time zone)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
    -- Migración 267: tanques_l (sin la mochila), mochila_l y total_l, en litros útiles. «litros» = total y
    -- «tanques» = cantidad de tanques se conservan. Si en esa fecha no había tanques cargados, usa los de hoy.
    WITH d AS (SELECT (p_ts AT TIME ZONE 'America/Argentina/Mendoza')::date AS dia, mae.fn_hoy() AS hoy),
    en_fecha AS (
        SELECT sum(t.capacidad_util_l) AS l, count(*) AS n,
               coalesce(sum(t.capacidad_util_l) FILTER (WHERE t.tipo = 'mochila'), 0) AS m
          FROM mae.tanque_combustible t, d
         WHERE t.camion_id = p_camion AND t.eliminado_en IS NULL
           AND t.vigente_desde <= d.dia AND (t.vigente_hasta IS NULL OR t.vigente_hasta > d.dia)),
    hoy AS (
        SELECT sum(t.capacidad_util_l) AS l, count(*) AS n, min(t.vigente_desde) AS desde,
               coalesce(sum(t.capacidad_util_l) FILTER (WHERE t.tipo = 'mochila'), 0) AS m
          FROM mae.tanque_combustible t, d
         WHERE t.camion_id = p_camion AND t.eliminado_en IS NULL
           AND t.vigente_desde <= d.hoy AND (t.vigente_hasta IS NULL OR t.vigente_hasta > d.hoy))
    SELECT CASE WHEN f.n > 0 THEN jsonb_build_object('litros', f.l, 'tanques', f.n, 'fuente', 'en_fecha',
                                                     'tanques_l', f.l - f.m, 'mochila_l', f.m, 'total_l', f.l)
                WHEN h.n > 0 THEN jsonb_build_object('litros', h.l, 'tanques', h.n, 'fuente', 'actual', 'desde', h.desde,
                                                     'tanques_l', h.l - h.m, 'mochila_l', h.m, 'total_l', h.l)
                ELSE jsonb_build_object('litros', NULL, 'tanques', 0, 'fuente', NULL, 'tanques_l', NULL, 'mochila_l', NULL, 'total_l', NULL) END
      FROM en_fecha f, hoy h
$function$;

COMMENT ON FUNCTION fue.fn_capacidad_camion(bigint, timestamp with time zone) IS
    'Migración 267: única fuente de la capacidad del camión (litros útiles): tanques_l, mochila_l y total_l, de mae.tanque_combustible.';

CREATE OR REPLACE FUNCTION fue.fn_capacidad_mochila(p_camion bigint)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
    -- Migración 267: lee de la función única
    SELECT nullif((fue.fn_capacidad_camion(p_camion, now()) ->> 'mochila_l')::numeric, 0)
$function$;

-- -----------------------------------------------------------------------------
-- 2 · Las funciones que leían la capacidad por otro lado o trataban el total como tanques
-- -----------------------------------------------------------------------------
DO $do$
DECLARE
    v_def text; v_n int; i int;
    -- función, texto ancla, veces que tiene que aparecer, texto nuevo
    c text[][] := ARRAY[
      -- Validación del faltante al cargar
      ['fue.fn_carga_faltante()',
       $a$SELECT c.capacidad_util_l INTO v_cap FROM mae.fn_capacidad_camion(NEW.camion_id, NEW.fecha_hora::date) c;$a$, '1',
       $n$v_cap := (SELECT (q.j ->> 'total_l')::numeric FROM (SELECT fue.fn_capacidad_camion(NEW.camion_id, NEW.fecha_hora) AS j) q WHERE q.j ->> 'fuente' = 'en_fecha');$n$],
      -- Validación del faltante al editar
      ['fue.fn_editar_carga',
       $a$SELECT x.capacidad_util_l INTO v_cap FROM mae.fn_capacidad_camion(n.camion_id, n.fecha_hora::date) x;$a$, '1',
       $n$v_cap := (SELECT (q.j ->> 'total_l')::numeric FROM (SELECT fue.fn_capacidad_camion(n.camion_id, n.fecha_hora) AS j) q WHERE q.j ->> 'fuente' = 'en_fecha');$n$],
      -- Alerta de carga que no entra
      ['fue.fn_revisar_carga_imposible',
       $a$SELECT capacidad_util_l INTO v_cap FROM mae.fn_capacidad_camion(v_cam, (v_ancla AT TIME ZONE 'America/Argentina/Mendoza')::date);$a$, '1',
       $n$v_cap := (SELECT (q.j ->> 'total_l')::numeric FROM (SELECT fue.fn_capacidad_camion(v_cam, v_ancla) AS j) q WHERE q.j ->> 'fuente' = 'en_fecha');$n$],
      -- Combustible actual: reparte lo que hay en tanques y mochila
      ['fue.fn_combustible_actual',
       $a$    v_fecha text;$a$, '1',
       $n$    v_fecha text; v_cap_t numeric; v_en_t numeric;$n$],
      ['fue.fn_combustible_actual',
       $a$v_cap := (fue.fn_capacidad_camion(p_camion, k.fecha_hora) ->> 'litros')::numeric;$a$, '1',
       $n$v_cap := (fue.fn_capacidad_camion(p_camion, k.fecha_hora) ->> 'total_l')::numeric; v_cap_t := (fue.fn_capacidad_camion(p_camion, k.fecha_hora) ->> 'tanques_l')::numeric;$n$],
      ['fue.fn_combustible_actual',
       $a$v_tractor := greatest(0, least(v_cap, v_crudo));$a$, '1',
       $n$v_tractor := greatest(0, least(v_cap, v_crudo));
    -- Migración 267: tanques llenos primero; lo que pasa de su capacidad está en la mochila (estimación)
    v_en_t := round(least(v_tractor, coalesce(v_cap_t, v_cap)));$n$],
      ['fue.fn_combustible_actual',
       $a$'litros', round(v_tractor + v_moch), 'tractor_l', round(v_tractor), 'mochila_l', nullif(round(v_moch), 0),$a$, '1',
       $n$'litros', round(v_tractor + v_moch), 'tractor_l', v_en_t, 'mochila_l', nullif(round(v_tractor + v_moch) - v_en_t, 0),
        'tanques_l', v_en_t, 'capacidad_tanques_l', v_cap_t, 'capacidad_mochila_l', v_cap - v_cap_t + v_moch_cap, 'reparto', 'estimado',$n$],
      -- Pedido de carga: la capacidad de tanques es la de los tanques
      ['tel.fn_preparar_pedido_carga',
       $a$v_cap numeric; v_moch_salida numeric;$a$, '1',
       $n$v_cap numeric; v_cap_t numeric; v_moch_salida numeric;$n$],
      ['tel.fn_preparar_pedido_carga',
       $a$v_cap := (fue.fn_capacidad_camion(v.camion_id, now()) ->> 'litros')::numeric;$a$, '1',
       $n$v_cap := (fue.fn_capacidad_camion(v.camion_id, now()) ->> 'total_l')::numeric; v_cap_t := (fue.fn_capacidad_camion(v.camion_id, now()) ->> 'tanques_l')::numeric;$n$],
      ['tel.fn_preparar_pedido_carga',
       $a$'inicial_tanques_l', CASE WHEN v_inicial IS NOT NULL AND v_cap IS NOT NULL THEN round(least(v_inicial, v_cap)) END,$a$, '1',
       $n$'inicial_tanques_l', CASE WHEN v_inicial IS NOT NULL AND v_cap_t IS NOT NULL THEN round(least(v_inicial, v_cap_t)) END,$n$],
      ['tel.fn_preparar_pedido_carga',
       $a$'inicial_mochila_l', CASE WHEN v_inicial IS NOT NULL AND v_cap IS NOT NULL THEN round(greatest(v_inicial - v_cap, 0)) END,$a$, '1',
       $n$'inicial_mochila_l', CASE WHEN v_inicial IS NOT NULL AND v_cap_t IS NOT NULL THEN round(greatest(v_inicial - v_cap_t, 0)) END,$n$],
      ['tel.fn_preparar_pedido_carga',
       $a$'capacidad_tanques_l', v_cap,$a$, '1',
       $n$'capacidad_tanques_l', v_cap_t, 'capacidad_mochila_l', v_cap - v_cap_t, 'capacidad_total_l', v_cap,$n$],
      -- «para llenar» sigue siendo lo que falta para el camión completo (tanques y mochila)
      ['tel.fn_preparar_pedido_carga',
       $a$greatest(round(v_cap - v_tanques), 0)$a$, '3',
       $n$greatest(round(v_cap - v_tanques - coalesce(v_mochila, 0)), 0)$n$]
    ];
BEGIN
    FOR i IN 1 .. array_length(c, 1) LOOP
        v_def := pg_get_functiondef((SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                                      WHERE n.nspname || '.' || p.proname = split_part(c[i][1], '(', 1)));
        v_n := (length(v_def) - length(replace(v_def, c[i][2], ''))) / length(c[i][2]);
        IF v_n <> c[i][3]::int THEN
            RAISE EXCEPTION '% no es la esperada: «%» aparece % veces y tenían que ser %: avisar antes de seguir', c[i][1], left(c[i][2], 70), v_n, c[i][3];
        END IF;
        EXECUTE replace(v_def, c[i][2], c[i][4]);
    END LOOP;
END $do$;

-- -----------------------------------------------------------------------------
-- 3 · Control con los datos reales: ningún total cambió y el reparto cierra
-- -----------------------------------------------------------------------------
DO $do$
DECLARE r record; k jsonb; ca jsonb; b jsonb; v_mal text[] := '{}'; v_cam int := 0; v_ped int := 0;
BEGIN
    FOR r IN SELECT * FROM zz_cam_267 LOOP
        v_cam := v_cam + 1;
        k := fue.fn_capacidad_camion(r.id, now());
        IF (k ->> 'total_l')::numeric IS DISTINCT FROM r.total_fue OR (k ->> 'litros')::numeric IS DISTINCT FROM r.total_fue
           OR (r.total IS NOT NULL AND (k ->> 'total_l')::numeric IS DISTINCT FROM r.total) THEN
            v_mal := v_mal || format('%s: el total era %s y ahora %s', r.patente, coalesce(r.total, r.total_fue), k ->> 'total_l');
        END IF;
        IF (k ->> 'total_l') IS NOT NULL AND (k ->> 'tanques_l')::numeric + (k ->> 'mochila_l')::numeric <> (k ->> 'total_l')::numeric THEN
            v_mal := v_mal || format('%s: tanques + mochila no da el total', r.patente);
        END IF;
        IF fue.fn_capacidad_mochila(r.id) IS DISTINCT FROM r.mochila OR coalesce(r.mochila, 0) IS DISTINCT FROM coalesce((k ->> 'mochila_l')::numeric, 0) THEN
            v_mal := v_mal || format('%s: la mochila era %s y ahora %s', r.patente, r.mochila, k ->> 'mochila_l');
        END IF;
        ca := fue.fn_combustible_actual(r.id);
        IF (ca ->> 'litros') IS DISTINCT FROM (r.comb ->> 'litros') OR (ca ->> 'capacidad_l') IS DISTINCT FROM (r.comb ->> 'capacidad_l')
           OR (ca ->> 'pct') IS DISTINCT FROM (r.comb ->> 'pct') OR (ca ->> 'motivo') IS DISTINCT FROM (r.comb ->> 'motivo') THEN
            v_mal := v_mal || format('%s: el combustible actual era %s L y ahora %s L', r.patente, r.comb ->> 'litros', ca ->> 'litros');
        END IF;
        IF (ca ->> 'litros') IS NOT NULL AND (
               coalesce((ca ->> 'tractor_l')::numeric, 0) + coalesce((ca ->> 'mochila_l')::numeric, 0) <> (ca ->> 'litros')::numeric
            OR (ca ->> 'tractor_l')::numeric > (ca ->> 'capacidad_tanques_l')::numeric
            OR ((ca ->> 'mochila_l') IS NOT NULL AND (ca ->> 'tractor_l')::numeric < round((ca ->> 'capacidad_tanques_l')::numeric))) THEN
            v_mal := v_mal || format('%s: el reparto del combustible actual no cierra (%s tanques, %s mochila, %s total)', r.patente,
                                     ca ->> 'tractor_l', ca ->> 'mochila_l', ca ->> 'litros');
        END IF;
    END LOOP;

    FOR r IN SELECT * FROM zz_ped_267 LOOP
        v_ped := v_ped + 1;
        b := tel.fn_preparar_pedido_carga(r.id);
        IF (b ->> 'litros_sugeridos') IS DISTINCT FROM (r.b ->> 'litros_sugeridos') OR (b ->> 'litros_para_llegar') IS DISTINCT FROM (r.b ->> 'litros_para_llegar')
           OR (b ->> 'litros_para_llenar') IS DISTINCT FROM (r.b ->> 'litros_para_llenar') OR (b ->> 'inicial_l') IS DISTINCT FROM (r.b ->> 'inicial_l')
           OR coalesce((b ->> 'tanques_l')::numeric, 0) + coalesce((b ->> 'mochila_l')::numeric, 0)
              <> coalesce((r.b ->> 'tanques_l')::numeric, 0) + coalesce((r.b ->> 'mochila_l')::numeric, 0) THEN
            v_mal := v_mal || format('pedido del viaje %s: cambió un total (recomendado %s→%s, para llegar %s→%s, para llenar %s→%s, inicial %s→%s)', r.numero,
                r.b ->> 'litros_sugeridos', b ->> 'litros_sugeridos', r.b ->> 'litros_para_llegar', b ->> 'litros_para_llegar',
                r.b ->> 'litros_para_llenar', b ->> 'litros_para_llenar', r.b ->> 'inicial_l', b ->> 'inicial_l');
        END IF;
        IF (b ->> 'capacidad_tanques_l')::numeric IS DISTINCT FROM (fue.fn_capacidad_camion(r.camion_id, now()) ->> 'tanques_l')::numeric
           OR (b ->> 'tanques_l')::numeric > (b ->> 'capacidad_tanques_l')::numeric
           OR (b ->> 'inicial_tanques_l')::numeric > (b ->> 'capacidad_tanques_l')::numeric
           OR coalesce((b ->> 'inicial_tanques_l')::numeric, 0) + coalesce((b ->> 'inicial_mochila_l')::numeric, 0) <> coalesce((b ->> 'inicial_l')::numeric, 0) THEN
            v_mal := v_mal || format('pedido del viaje %s: el reparto no cierra (tanques %s de %s, inicial %s + %s = %s)', r.numero,
                b ->> 'tanques_l', b ->> 'capacidad_tanques_l', b ->> 'inicial_tanques_l', b ->> 'inicial_mochila_l', b ->> 'inicial_l');
        END IF;
    END LOOP;

    IF array_length(v_mal, 1) > 0 THEN
        RAISE EXCEPTION 'No se guardó nada. % diferencia(s): %', array_length(v_mal, 1), left(array_to_string(v_mal, ' | '), 1800);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE p.prokind = 'f' AND n.nspname IN ('fue', 'tel', 'ops', 'fin', 'ana') AND p.prosrc LIKE '%mae.fn_capacidad_camion(%') THEN
        RAISE EXCEPTION 'Quedó alguna función leyendo mae.fn_capacidad_camion: avisar antes de seguir';
    END IF;
    RAISE NOTICE 'Totales iguales antes y después en % camiones y % pedidos de viajes en curso', v_cam, v_ped;
END $do$;

UPDATE ref.parametro SET valor = '267' WHERE codigo = 'web.version_base' AND valor::text::int < 267;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'migración 267 aplicada' AS que, (SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base') AS version_base;
