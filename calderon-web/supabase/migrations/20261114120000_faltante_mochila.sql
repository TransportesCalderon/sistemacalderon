-- =============================================================================
-- IronTrack — 268 · Cambio 261 · El faltante para lleno lleva su parte de mochila (backlog A3, parte 2)
-- -----------------------------------------------------------------------------
-- Tanques llenos no es lo mismo que camión completamente lleno: cuando una carga a tanque
-- lleno declara que faltaron litros, casi siempre faltaron en la mochila, pero no siempre
-- (cargas 88 y 91). Por eso la parte de mochila se GUARDA en la carga y no se calcula.
--   · Columna nueva fue.carga_combustible.faltante_mochila_l: de los litros que faltaron para
--     quedar lleno, cuántos son de la mochila. Lo que faltó en los tanques es la diferencia.
--   · Si no se informa, se propone por la regla: todo a la mochila, hasta su capacidad.
--   · La base controla que no supere el faltante ni la capacidad de la mochila del camión.
--   · Se puede corregir desde Editar (fue.fn_editar_carga) y viene en las órdenes por registrar.
--   · El cierre de viaje y el acta informan el faltante de salida y de llegada con su parte
--     de mochila. Ningún número del cierre cambia.
-- Las cargas ya registradas quedan sin repartir (vacío): se completan con el script de
-- corrección 13, con simulación. Esta migración no cambia ningún dato existente.
-- web.version_base = 268.
-- =============================================================================
SET search_path = public, extensions;
BEGIN;

DO $do$
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 267 THEN
        RAISE EXCEPTION 'Falta la migración 267 (cambio 260): aplicarla antes';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'fue.carga_combustible'::regclass AND attname = 'faltante_mochila_l' AND NOT attisdropped) THEN
        RAISE EXCEPTION 'La migración 268 (faltante de mochila) ya está aplicada';
    END IF;
END $do$;

-- Foto de «antes»: el balance del tanque de todos los cierres (no tiene que cambiar ningún número)
CREATE TEMP TABLE zz_cierres_268 ON COMMIT DROP AS
SELECT c.id, c.numero, fue.fn_tanque_cierre(c.id) AS t
  FROM fue.cierre_viaje c WHERE c.eliminado_en IS NULL AND c.estado <> 'anulado';

-- -----------------------------------------------------------------------------
-- 1 · La columna
-- -----------------------------------------------------------------------------
ALTER TABLE fue.carga_combustible ADD COLUMN faltante_mochila_l numeric(8,2);
ALTER TABLE fue.carga_combustible ADD CONSTRAINT ck_carga_faltante_mochila
    CHECK (faltante_mochila_l IS NULL OR (faltante_mochila_l >= 0 AND faltante_mochila_l <= faltante_lleno_l));
COMMENT ON COLUMN fue.carga_combustible.faltante_mochila_l IS
    'Migración 268: de los litros que faltaron para quedar lleno (faltante_lleno_l), cuántos son de la mochila. Vacío = carga anterior sin repartir.';

-- -----------------------------------------------------------------------------
-- 2 · La regla y el control, en un solo lugar
-- -----------------------------------------------------------------------------
CREATE FUNCTION fue.fn_faltante_mochila(p_camion bigint, p_ts timestamp with time zone, p_faltante numeric, p_mochila numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE v_capm numeric;
BEGIN
    IF coalesce(p_faltante, 0) = 0 THEN RETURN 0; END IF;
    v_capm := coalesce((fue.fn_capacidad_camion(p_camion, p_ts) ->> 'mochila_l')::numeric, 0);
    -- Sin dato: la regla (todo a la mochila, hasta su capacidad)
    IF p_mochila IS NULL THEN RETURN least(p_faltante, v_capm); END IF;
    IF p_mochila < 0 OR p_mochila > p_faltante THEN
        RAISE EXCEPTION 'Lo que faltó en la mochila (% L) no puede ser más que lo que faltó para quedar lleno (% L)', p_mochila, p_faltante
            USING ERRCODE = '23514';
    END IF;
    IF p_mochila > v_capm THEN
        RAISE EXCEPTION 'Lo que faltó en la mochila (% L) supera la capacidad de la mochila del camión (% L)', p_mochila, v_capm
            USING ERRCODE = '23514';
    END IF;
    RETURN round(p_mochila, 2);
END $function$;

COMMENT ON FUNCTION fue.fn_faltante_mochila(bigint, timestamp with time zone, numeric, numeric) IS
    'Migración 268: parte del faltante que es de la mochila. Sin dato propone la regla (todo a la mochila, hasta su capacidad); con dato lo controla.';

-- -----------------------------------------------------------------------------
-- 3 · Alta, edición, órdenes por registrar, cierre y acta
-- -----------------------------------------------------------------------------
DO $do$
DECLARE
    v_def text; v_n int; i int;
    c text[][] := ARRAY[
      -- Alta de una carga: propone o controla
      ['fue.fn_carga_faltante',
       $a$    RETURN NEW;$a$, '1',
       $n$    -- Migración 268: la parte del faltante que es de la mochila
    NEW.faltante_mochila_l := fue.fn_faltante_mochila(NEW.camion_id, NEW.fecha_hora, NEW.faltante_lleno_l, NEW.faltante_mochila_l);
    RETURN NEW;$n$],
      -- Editar: si viene el dato o cambió el faltante, se vuelve a proponer o controlar
      ['fue.fn_editar_carga',
       $a$    n.importe_original := round(n.litros * n.precio_unitario, 2);$a$, '1',
       $n$    -- Migración 268: la parte del faltante que es de la mochila
    IF d ? 'faltante_mochila_l' OR n.faltante_lleno_l IS DISTINCT FROM c.faltante_lleno_l OR n.camion_id IS DISTINCT FROM c.camion_id THEN
        n.faltante_mochila_l := fue.fn_faltante_mochila(n.camion_id, n.fecha_hora, n.faltante_lleno_l,
                                                         CASE WHEN d ? 'faltante_mochila_l' THEN (d ->> 'faltante_mochila_l')::numeric END);
    END IF;
    n.importe_original := round(n.litros * n.precio_unitario, 2);$n$],
      ['fue.fn_editar_carga',
       $a$faltante_lleno_l = n.faltante_lleno_l, faltante_observacion = n.faltante_observacion$a$, '1',
       $n$faltante_lleno_l = n.faltante_lleno_l, faltante_observacion = n.faltante_observacion, faltante_mochila_l = n.faltante_mochila_l$n$],
      -- Órdenes por registrar
      ['fue.fn_registrar_carga_orden',
       $a$faltante_lleno_l, faltante_observacion, motivo_observacion)$a$, '1',
       $n$faltante_lleno_l, faltante_observacion, motivo_observacion, faltante_mochila_l)$n$],
      ['fue.fn_registrar_carga_orden',
       $a$p_inicia_viaje, v_falt, v_fobs, 'Orden de carga ' || o.numero)$a$, '1',
       $n$p_inicia_viaje, v_falt, v_fobs, 'Orden de carga ' || o.numero, CASE WHEN v_falt > 0 THEN (a ->> 'faltante_mochila_l')::numeric END)$n$],
      -- Balance del tanque del cierre
      ['fue.fn_tanque_cierre',
       $a$'faltante_salida_l', v_fs,$a$, '1',
       $n$'faltante_salida_l', v_fs,
        'faltante_salida_mochila_l', (SELECT k.faltante_mochila_l FROM fue.carga_combustible k WHERE k.id = cv.carga_salida_id AND k.faltante_lleno_l = v_fs),$n$],
      ['fue.fn_tanque_cierre',
       $a$'faltante_llegada_l', v_fl,$a$, '1',
       $n$'faltante_llegada_l', v_fl,
        'faltante_llegada_mochila_l', (SELECT k.faltante_mochila_l FROM fue.carga_combustible k WHERE k.id = v_llegada_id AND k.faltante_lleno_l = v_fl),$n$],
      -- Acta del cierre
      ['fue.fn_acta_cierre',
       $a$'inicio_l', CASE WHEN v_cap IS NOT NULL THEN v_cap - coalesce((r #>> '{salida,faltante_lleno_l}')::numeric, 0) END),$a$, '1',
       $n$'faltante_mochila_l', (SELECT k.faltante_mochila_l FROM fue.carga_combustible k WHERE k.id = cv.carga_salida_id),
            'inicio_l', CASE WHEN v_cap IS NOT NULL THEN v_cap - coalesce((r #>> '{salida,faltante_lleno_l}')::numeric, 0) END),$n$],
      ['fue.fn_acta_cierre',
       $a$'estacion', (SELECT e.nombre FROM mae.estacion_servicio e WHERE e.id = (r #>> '{llegada,estacion_id}')::bigint)),$a$, '1',
       $n$'estacion', (SELECT e.nombre FROM mae.estacion_servicio e WHERE e.id = (r #>> '{llegada,estacion_id}')::bigint),
            'faltante_mochila_l', (SELECT k.faltante_mochila_l FROM fue.carga_combustible k WHERE k.id = (r ->> 'carga_llegada_id')::bigint)),$n$]
    ];
BEGIN
    FOR i IN 1 .. array_length(c, 1) LOOP
        v_def := pg_get_functiondef((SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                                      WHERE n.nspname || '.' || p.proname = c[i][1]));
        v_n := (length(v_def) - length(replace(v_def, c[i][2], ''))) / length(c[i][2]);
        IF v_n <> c[i][3]::int THEN
            RAISE EXCEPTION '% no es la esperada: «%» aparece % veces y tenían que ser %: avisar antes de seguir', c[i][1], left(c[i][2], 70), v_n, c[i][3];
        END IF;
        EXECUTE replace(v_def, c[i][2], c[i][4]);
    END LOOP;
END $do$;

-- -----------------------------------------------------------------------------
-- 4 · La vista que lee la web suma la columna al final
-- -----------------------------------------------------------------------------
DO $do$
DECLARE v_def text; v_n int; v_ancla text := 'faltante_observacion';
BEGIN
    v_def := pg_get_viewdef('fue.v_carga_combustible'::regclass);
    v_n := (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla);
    IF v_n <> 1 OR v_def LIKE '%faltante_mochila_l%' THEN
        RAISE EXCEPTION 'La vista fue.v_carga_combustible no es la esperada: avisar antes de seguir';
    END IF;
    EXECUTE 'CREATE OR REPLACE VIEW fue.v_carga_combustible AS ' || replace(v_def, v_ancla, v_ancla || ', faltante_mochila_l');
END $do$;

-- -----------------------------------------------------------------------------
-- 5 · Control: el balance de ningún cierre cambió y no se tocó ninguna carga
-- -----------------------------------------------------------------------------
DO $do$
DECLARE v_mal text; v_n int; v_total int;
BEGIN
    SELECT count(*), count(*) FILTER (WHERE (fue.fn_tanque_cierre(z.id) - 'faltante_salida_mochila_l' - 'faltante_llegada_mochila_l') IS DISTINCT FROM z.t),
           string_agg(z.numero, ', ') FILTER (WHERE (fue.fn_tanque_cierre(z.id) - 'faltante_salida_mochila_l' - 'faltante_llegada_mochila_l') IS DISTINCT FROM z.t)
      INTO v_total, v_n, v_mal FROM zz_cierres_268 z;
    IF v_n > 0 THEN
        RAISE EXCEPTION 'El balance del tanque cambió en % cierre(s) y no tenía que cambiar ninguno: %. No se guardó nada: avisar.', v_n, v_mal;
    END IF;
    IF EXISTS (SELECT 1 FROM fue.carga_combustible WHERE faltante_mochila_l IS NOT NULL) THEN
        RAISE EXCEPTION 'La migración no tenía que completar ninguna carga: avisar antes de seguir';
    END IF;
    RAISE NOTICE 'Balance del tanque igual antes y después en % cierres', v_total;
END $do$;

UPDATE ref.parametro SET valor = '268' WHERE codigo = 'web.version_base' AND valor::text::int < 268;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'migración 268 aplicada' AS que, (SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base') AS version_base;
