-- =====================================================================================
-- Migración 291 · Litros a cargar: sumar lo que el camión va a gastar hasta llegar a la estación
-- =====================================================================================
-- Pedido (20/11/2026): la orden calcula cuánto le falta para llenar AHORA; si el camión está a 200 km de la estación,
-- al llegar va a cargar más. Hay que sumar lo que va a consumir en el camino.
--
--   · fue.fn_camino_a_estacion(camión, estación): km desde la última posición del GPS hasta la estación (por calle con
--     el servicio de mapas; si no responde, línea recta × fue.orden_factor_camino = 1,3), su consumo
--     (fue.fn_rendimiento_camion) y los litros que va a gastar. Guarda los km 6 horas (fue.km_estacion_cache).
--   · fue.fn_preparar_orden_carga (envoltorio; la anterior queda como _sin_camino): «litros para llenar» suma esos
--     litros (sin pasar la capacidad) y el texto de la estimación lo dice. Sirve para Nueva orden, el pedido desde
--     Seguimiento y la edición al aprobar.
--   · La orden guarda lo mismo: disparador antes de crearla suma los litros del camino a «litros_calculados» y deja
--     km y litros en «combustible». No cambia órdenes ya creadas.
--   · fue.orden_camino_activo = false lo apaga.
-- web.version_base = 291.
-- =====================================================================================
BEGIN;

DO $v$
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 290 THEN
        RAISE EXCEPTION 'Primero hay que aplicar la migración 290 (carga en Chile: tarjeta o transferencia). La base está en la %',
            coalesce((SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base'), '?');
    END IF;
    IF to_regprocedure('fue.fn_preparar_orden_carga_sin_camino(bigint,bigint)') IS NOT NULL THEN
        RAISE EXCEPTION 'La migración 291 ya está aplicada';
    END IF;
    IF to_regprocedure('fue.fn_rendimiento_camion(bigint)') IS NULL OR to_regprocedure('tel.fn_osrm_camino(jsonb)') IS NULL THEN
        RAISE EXCEPTION 'Faltan funciones que esta migración necesita (rendimiento del camión o servicio de mapas)';
    END IF;
END $v$;

INSERT INTO ref.parametro (codigo, valor, descripcion)
SELECT x.codigo, x.valor, x.descripcion FROM (VALUES
    ('fue.orden_camino_activo', 'true'::jsonb, 'Migración 291: los litros de la orden de carga suman lo que el camión gasta hasta llegar a la estación. false = no se suma.'),
    ('fue.orden_camino_osrm', 'true'::jsonb, 'Migración 291: usar el servicio de mapas para los km por calle hasta la estación. false = línea recta × factor.'),
    ('fue.orden_factor_camino', '1.3'::jsonb, 'Migración 291: cuánto más largo es el camino que la línea recta, cuando no responde el servicio de mapas.'),
    ('fue.orden_camino_gps_horas', '12'::jsonb, 'Migración 291: posición del GPS más vieja que esto no se usa para calcular los km hasta la estación.')
) x(codigo, valor, descripcion)
WHERE NOT EXISTS (SELECT 1 FROM ref.parametro p WHERE p.codigo = x.codigo);

CREATE TABLE IF NOT EXISTS fue.km_estacion_cache (
    clave     text PRIMARY KEY,
    km        numeric(8,1) NOT NULL,
    metodo    text NOT NULL,
    creado_en timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE fue.km_estacion_cache IS 'Migración 291: km por calle desde un punto (redondeado a ~1 km) hasta una estación, por 6 horas.';
DO $r$
DECLARE r record;
BEGIN
    REVOKE ALL ON TABLE fue.km_estacion_cache FROM PUBLIC;
    FOR r IN SELECT rolname FROM pg_roles WHERE (rolname LIKE 'tc\_%' OR rolname IN ('authenticated', 'anon'))
                AND rolname <> (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = 'fue.km_estacion_cache'::regclass) LOOP
        EXECUTE format('REVOKE ALL ON TABLE fue.km_estacion_cache FROM %I', r.rolname);
    END LOOP;
END $r$;

CREATE FUNCTION fue.fn_camino_a_estacion(p_camion bigint, p_estacion bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE
    v_lat numeric; v_lng numeric; v_ts timestamptz; e_lat numeric; e_lng numeric; v_recta numeric; v_km numeric; v_metodo text;
    v_clave text; v_l100 numeric; v_lit numeric; o record;
BEGIN
    IF p_camion IS NULL OR p_estacion IS NULL
       OR coalesce((SELECT valor::text FROM ref.parametro WHERE codigo = 'fue.orden_camino_activo' AND eliminado_en IS NULL), 'true') <> 'true' THEN
        RETURN NULL;
    END IF;
    SELECT u.latitud, u.longitud INTO e_lat, e_lng
      FROM mae.estacion_servicio e JOIN mae.ubicacion u ON u.id = e.ubicacion_id WHERE e.id = p_estacion;
    IF e_lat IS NULL OR e_lng IS NULL THEN
        RETURN jsonb_build_object('litros', 0, 'texto', 'la estación no tiene su ubicación en el mapa: no se sumó el camino');
    END IF;
    SELECT l.latitud, l.longitud, l.ts INTO v_lat, v_lng, v_ts FROM tel.lectura l
     WHERE l.camion_id = p_camion AND l.latitud IS NOT NULL AND l.longitud IS NOT NULL AND l.ts > now() - interval '3 days'
     ORDER BY l.ts DESC LIMIT 1;
    IF v_lat IS NULL OR v_ts < now() - make_interval(hours => coalesce(ref.fn_parametro_num('fue.orden_camino_gps_horas', 12), 12)::int) THEN
        RETURN jsonb_build_object('litros', 0, 'texto', 'sin posición reciente del GPS: no se sumó el camino hasta la estación');
    END IF;
    v_recta := round((extensions.ST_Distance(extensions.ST_SetSRID(extensions.ST_MakePoint(v_lng, v_lat), 4326)::extensions.geography,
                                             extensions.ST_SetSRID(extensions.ST_MakePoint(e_lng, e_lat), 4326)::extensions.geography) / 1000)::numeric, 1);
    IF v_recta < 2 THEN
        RETURN jsonb_build_object('km', 0, 'litros', 0, 'texto', 'el camión ya está en la estación');
    END IF;
    -- Km por calle: guardado, servicio de mapas o línea recta × factor
    v_clave := p_estacion || '|' || round(v_lat, 2) || '|' || round(v_lng, 2);
    SELECT km, metodo INTO v_km, v_metodo FROM fue.km_estacion_cache WHERE clave = v_clave AND creado_en > now() - interval '6 hours';
    IF v_km IS NULL AND coalesce((SELECT valor::text FROM ref.parametro WHERE codigo = 'fue.orden_camino_osrm' AND eliminado_en IS NULL), 'true') = 'true' THEN
        BEGIN
            SELECT * INTO o FROM tel.fn_osrm_camino(jsonb_build_array(jsonb_build_object('lat', v_lat, 'lng', v_lng), jsonb_build_object('lat', e_lat, 'lng', e_lng)));
            -- Fuera de 0,9 a 2,5 veces la línea recta, no se le cree al servicio de mapas
            IF o.error IS NULL AND o.km IS NOT NULL AND o.km BETWEEN v_recta * 0.9 AND v_recta * 2.5 THEN v_km := o.km; v_metodo := 'mapa'; END IF;
        EXCEPTION WHEN OTHERS THEN v_km := NULL;
        END;
        IF v_km IS NOT NULL THEN
            INSERT INTO fue.km_estacion_cache (clave, km, metodo) VALUES (v_clave, v_km, v_metodo)
            ON CONFLICT (clave) DO UPDATE SET km = EXCLUDED.km, metodo = EXCLUDED.metodo, creado_en = now();
        END IF;
    END IF;
    IF v_km IS NULL THEN
        v_km := round(v_recta * coalesce(ref.fn_parametro_num('fue.orden_factor_camino', 1.3), 1.3), 1);
        v_metodo := 'linea_recta';
    END IF;
    v_l100 := coalesce(fue.fn_rendimiento_camion(p_camion), ref.fn_parametro_num('fue.orden_carga_consumo_defecto_l_100km', 35));
    v_lit := round(v_km * v_l100 / 100);
    RETURN jsonb_build_object('km', round(v_km), 'l_100km', v_l100, 'litros', v_lit, 'metodo', v_metodo, 'gps_en', v_ts,
        'texto', format('+ ≈ %s L para llegar: %s km hasta la estación%s a %s L/100 km', tel.fn_num_ar(v_lit), tel.fn_num_ar(round(v_km)),
                        CASE WHEN v_metodo = 'linea_recta' THEN ' (estimados)' ELSE '' END, tel.fn_num_ar(v_l100)));
END $f$;
COMMENT ON FUNCTION fue.fn_camino_a_estacion(bigint, bigint) IS
    'Migración 291: km desde la última posición del camión hasta la estación y los litros que va a gastar en ese camino.';
REVOKE ALL ON FUNCTION fue.fn_camino_a_estacion(bigint, bigint) FROM PUBLIC;

-- ------------------------------------------------------------------ la pantalla de la orden
ALTER FUNCTION fue.fn_preparar_orden_carga(bigint, bigint) RENAME TO fn_preparar_orden_carga_sin_camino;
CREATE FUNCTION fue.fn_preparar_orden_carga(p_camion bigint, p_estacion bigint DEFAULT NULL::bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE r jsonb := fue.fn_preparar_orden_carga_sin_camino(p_camion, p_estacion); c jsonb; v_cap numeric; v_base numeric; v_nuevo numeric;
BEGIN
    IF r IS NULL OR p_estacion IS NULL THEN RETURN r; END IF;
    c := fue.fn_camino_a_estacion(p_camion, p_estacion);
    IF c IS NULL THEN RETURN r; END IF;
    v_base := (r ->> 'litros_para_llenar')::numeric;
    v_cap := coalesce((r #>> '{combustible,capacidad_l}')::numeric, (fue.fn_capacidad_camion(p_camion, now()) ->> 'litros')::numeric);
    v_nuevo := CASE WHEN v_base IS NULL THEN NULL WHEN v_cap IS NULL THEN v_base + coalesce((c ->> 'litros')::numeric, 0)
                    ELSE least(round(v_cap), v_base + coalesce((c ->> 'litros')::numeric, 0)) END;
    RETURN r || jsonb_build_object(
        'litros_para_llenar', v_nuevo, 'litros_para_llenar_ahora', v_base, 'camino', c,
        'estimacion', coalesce(r -> 'estimacion', '{}'::jsonb)
                      || jsonb_build_object('texto', concat_ws(' ', nullif(r #>> '{estimacion,texto}', ''), c ->> 'texto')));
END $f$;
DO $g$
DECLARE r record;
BEGIN
    REVOKE ALL ON FUNCTION fue.fn_preparar_orden_carga(bigint, bigint) FROM PUBLIC;
    FOR r IN SELECT a.grantee FROM pg_proc p, aclexplode(p.proacl) a
              WHERE p.oid = 'fue.fn_preparar_orden_carga_sin_camino(bigint,bigint)'::regprocedure AND a.privilege_type = 'EXECUTE' LOOP
        IF r.grantee = 0 THEN EXECUTE 'GRANT EXECUTE ON FUNCTION fue.fn_preparar_orden_carga(bigint, bigint) TO PUBLIC';
        ELSE EXECUTE format('GRANT EXECUTE ON FUNCTION fue.fn_preparar_orden_carga(bigint, bigint) TO %I', pg_get_userbyid(r.grantee)); END IF;
    END LOOP;
END $g$;

-- ------------------------------------------------------------------ la orden guarda lo mismo
CREATE FUNCTION fue.fn_orden_carga_camino()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE c jsonb; v_cap numeric;
BEGIN
    IF NEW.genset_id IS NOT NULL OR NEW.camion_id IS NULL OR NEW.litros_calculados IS NULL THEN RETURN NEW; END IF;
    c := fue.fn_camino_a_estacion(NEW.camion_id, NEW.estacion_id);
    IF c IS NULL OR coalesce((c ->> 'litros')::numeric, 0) <= 0 THEN
        IF c IS NOT NULL THEN NEW.combustible := coalesce(NEW.combustible, '{}'::jsonb) || jsonb_build_object('camino', c); END IF;
        RETURN NEW;
    END IF;
    v_cap := (NEW.combustible ->> 'capacidad_l')::numeric;
    NEW.combustible := coalesce(NEW.combustible, '{}'::jsonb) || jsonb_build_object('camino', c, 'litros_para_llenar_ahora', NEW.litros_calculados);
    NEW.litros_calculados := round(CASE WHEN v_cap IS NULL THEN NEW.litros_calculados + (c ->> 'litros')::numeric
                                        ELSE least(v_cap, NEW.litros_calculados + (c ->> 'litros')::numeric) END, 1);
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RETURN NEW;   -- si algo falla, la orden sale como antes
END $f$;
REVOKE ALL ON FUNCTION fue.fn_orden_carga_camino() FROM PUBLIC;
CREATE TRIGGER tg_06_camino BEFORE INSERT ON fue.orden_carga FOR EACH ROW EXECUTE FUNCTION fue.fn_orden_carga_camino();

UPDATE ref.parametro SET valor = '291' WHERE codigo = 'web.version_base' AND valor::text::int < 291;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'migración 291 aplicada' AS que, (SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base') AS version_base;
