-- =============================================================================
-- IronTrack — 266 · Cambio 259 · Consumo objetivo: la regla escrita una sola vez (backlog A4)
-- -----------------------------------------------------------------------------
-- La regla del consumo objetivo de un tramo estaba escrita dos veces: en Seguimiento
-- (tel.fn_objetivo_viaje) y en el cierre y el acta (fue.fn_objetivo_cierre). Era la misma,
-- pero si se cambiaba una sola un viaje podía dar bien en ruta y mal en el cierre.
-- Desde ahora está en una función: fue.fn_objetivo_tramo(operación, línea):
--   · tramo sin operación (vacío)        → parámetro fue.consumo_objetivo_vacio_l_100km
--   · operación con contenedor vacío     → parámetro fue.consumo_objetivo_contenedor_vacio_l_100km
--   · operación cargada                  → el objetivo de la línea
-- Las dos funciones la llaman. El cierre conserva lo suyo (los km sin tramo cuentan como vacío).
-- No cambia ningún número: la migración calcula el objetivo de TODOS los viajes y cierres
-- antes y después, y si alguno difiere se frena sola y no guarda nada.
-- No cambia tablas ni pantallas. web.version_base = 266.
-- =============================================================================
SET search_path = public, extensions;
BEGIN;

DO $do$
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 265 THEN
        RAISE EXCEPTION 'Falta la migración 265 (cambio 258): aplicarla antes';
    END IF;
    IF to_regprocedure('fue.fn_objetivo_tramo(bigint,bigint)') IS NOT NULL THEN
        RAISE EXCEPTION 'La migración 266 (consumo objetivo único) ya está aplicada';
    END IF;
END $do$;

-- -----------------------------------------------------------------------------
-- 0 · Foto de «antes»: el objetivo de todos los viajes y de todos los cierres
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE zz_antes_266 ON COMMIT DROP AS
SELECT 'viaje'::text AS que, v.id, to_jsonb(tel.fn_objetivo_viaje(v.id)) AS valor
  FROM ops.viaje_chofer v WHERE v.eliminado_en IS NULL
UNION ALL
SELECT 'cierre', c.id, fue.fn_objetivo_cierre(c.id, 1000)
  FROM fue.cierre_viaje c WHERE c.eliminado_en IS NULL;

-- -----------------------------------------------------------------------------
-- 1 · La regla, una sola vez
-- -----------------------------------------------------------------------------
CREATE FUNCTION fue.fn_objetivo_tramo(p_servicio bigint, p_linea bigint)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
    SELECT CASE WHEN p_servicio IS NULL THEN ref.fn_parametro_num('fue.consumo_objetivo_vacio_l_100km', 26)
                WHEN (SELECT s.contenedor_vacio FROM ops.servicio_comercial s WHERE s.id = p_servicio)
                     THEN ref.fn_parametro_num('fue.consumo_objetivo_contenedor_vacio_l_100km', 28)
                ELSE (SELECT l.consumo_objetivo_l_100km FROM mae.linea l WHERE l.id = p_linea) END
$function$;

COMMENT ON FUNCTION fue.fn_objetivo_tramo(bigint, bigint) IS
    'Migración 266: consumo objetivo (L/100 km) de un tramo. Sin operación: vacío; contenedor vacío: su parámetro; cargado: el de la línea. La usan Seguimiento y el cierre.';

-- Los mismos permisos que la función del cierre
DO $do$
DECLARE g record; v_acl aclitem[];
BEGIN
    SELECT proacl INTO v_acl FROM pg_proc WHERE oid = 'fue.fn_objetivo_cierre(bigint,numeric)'::regprocedure;
    IF v_acl IS NOT NULL THEN
        REVOKE ALL ON FUNCTION fue.fn_objetivo_tramo(bigint, bigint) FROM PUBLIC;
        FOR g IN SELECT DISTINCT a.grantee::regrole::text AS rol FROM aclexplode(v_acl) a WHERE a.privilege_type = 'EXECUTE' AND a.grantee <> 0 LOOP
            EXECUTE format('GRANT EXECUTE ON FUNCTION fue.fn_objetivo_tramo(bigint, bigint) TO %s', g.rol);
        END LOOP;
        IF EXISTS (SELECT 1 FROM aclexplode(v_acl) a WHERE a.privilege_type = 'EXECUTE' AND a.grantee = 0) THEN
            GRANT EXECUTE ON FUNCTION fue.fn_objetivo_tramo(bigint, bigint) TO PUBLIC;
        END IF;
    END IF;
END $do$;

-- -----------------------------------------------------------------------------
-- 2 · Seguimiento y el cierre pasan a llamarla
-- -----------------------------------------------------------------------------
DO $do$
DECLARE v_def text; v_n int; v_ancla text; v_nuevo text;
    v_quitar text[] := ARRAY[
        $a$WHEN s.contenedor_vacio THEN ref.fn_parametro_num('fue.consumo_objetivo_contenedor_vacio_l_100km', 28)$a$,
        $a$ELSE l.consumo_objetivo_l_100km END AS obj$a$];
BEGIN
    -- Seguimiento
    v_def := pg_get_functiondef('tel.fn_objetivo_viaje(bigint)'::regprocedure);
    v_ancla := $a$CASE WHEN i.servicio_id IS NULL THEN ref.fn_parametro_num('fue.consumo_objetivo_vacio_l_100km', 26)$a$;
    v_n := (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla);
    IF v_n <> 1 THEN RAISE EXCEPTION 'tel.fn_objetivo_viaje no es la esperada (ancla 1 aparece % veces): avisar antes de seguir', v_n; END IF;
    v_def := replace(v_def, v_ancla, $n$fue.fn_objetivo_tramo(i.servicio_id, i.linea_id) AS obj$n$);
    FOREACH v_ancla IN ARRAY v_quitar LOOP
        v_n := (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla);
        IF v_n <> 1 THEN RAISE EXCEPTION 'tel.fn_objetivo_viaje no es la esperada («%» aparece % veces): avisar antes de seguir', v_ancla, v_n; END IF;
        v_def := replace(v_def, v_ancla, '');
    END LOOP;
    -- sin dejar renglones en blanco donde estaba la regla
    v_def := regexp_replace(v_def, 'AS obj(\r?\n[ \t]*)+\r?\n', E'AS obj\n');
    EXECUTE v_def;

    -- Cierre y acta
    v_def := pg_get_functiondef('fue.fn_objetivo_cierre(bigint,numeric)'::regprocedure);
    v_ancla := $a$'objetivo_l_100km', CASE WHEN x.servicio_id IS NULL THEN v_vacio WHEN s.contenedor_vacio THEN v_cont ELSE l.consumo_objetivo_l_100km END)$a$;
    v_n := (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla);
    IF v_n <> 1 THEN RAISE EXCEPTION 'fue.fn_objetivo_cierre no es la esperada (el ancla aparece % veces): avisar antes de seguir', v_n; END IF;
    v_def := replace(v_def, v_ancla, $n$'objetivo_l_100km', fue.fn_objetivo_tramo(x.servicio_id, x.linea_id))$n$);
    EXECUTE v_def;
END $do$;

-- -----------------------------------------------------------------------------
-- 3 · Control: ningún viaje ni cierre cambió de objetivo, y la regla no quedó repetida
-- -----------------------------------------------------------------------------
DO $do$
DECLARE v_mal text; v_n int; v_viajes int; v_cierres int;
BEGIN
    SELECT count(*), string_agg(a.que || ' ' || a.id || ': antes ' || left(coalesce(a.valor::text, 'nada'), 80) || ' / ahora ' || left(coalesce(d.valor::text, 'nada'), 80), ' | ')
      INTO v_n, v_mal
      FROM zz_antes_266 a
      JOIN LATERAL (SELECT CASE a.que WHEN 'viaje' THEN to_jsonb(tel.fn_objetivo_viaje(a.id)) ELSE fue.fn_objetivo_cierre(a.id, 1000) END AS valor) d ON true
     WHERE a.valor IS DISTINCT FROM d.valor;
    IF v_n > 0 THEN
        RAISE EXCEPTION 'El objetivo cambió en % caso(s) y no tenía que cambiar ninguno: %. No se guardó nada: avisar.', v_n, left(v_mal, 1500);
    END IF;
    SELECT string_agg(n.nspname || '.' || p.proname, ', ') INTO v_mal
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE (n.nspname, p.proname) IN (('tel', 'fn_objetivo_viaje'), ('fue', 'fn_objetivo_cierre'))
       AND (p.prosrc NOT LIKE '%fue.fn_objetivo_tramo(%' OR p.prosrc LIKE '%l.consumo_objetivo_l_100km%');
    IF v_mal IS NOT NULL THEN
        RAISE EXCEPTION 'La regla quedó repetida en: %: avisar antes de seguir', v_mal;
    END IF;
    SELECT count(*) FILTER (WHERE que = 'viaje'), count(*) FILTER (WHERE que = 'cierre') INTO v_viajes, v_cierres FROM zz_antes_266;
    RAISE NOTICE 'Objetivo igual antes y después en % viajes y % cierres', v_viajes, v_cierres;
END $do$;

UPDATE ref.parametro SET valor = '266' WHERE codigo = 'web.version_base' AND valor::text::int < 266;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'migración 266 aplicada' AS que, (SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base') AS version_base;
