-- Iris 02 · Etapa 1: viento y clima en ruta, impacto en litros y plata, y hora de Mendoza
-- (numeración propia de Iris: NO cambia web.version_base)
--
-- Qué agrega:
--   1) Lectura nueva «viento_en_ruta»: pronóstico de viento, lluvia y nieve sobre el camino entre dos lugares,
--      con el combustible de más (litros y USD) y la comparación entre salir ahora o más tarde.
--   2) Las horas de todas las lecturas de Iris pasan a hora de Mendoza (antes salían en UTC).
--   3) Instrucciones de Iris: cómo responder cuando le cuentan algo operativo (viento, clima, salidas).
-- No toca datos. Se puede correr más de una vez.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Horas en hora de Mendoza
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ia.fn_hora_local(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE r jsonb; k text; v jsonb; s text;
BEGIN
    IF p IS NULL THEN RETURN NULL; END IF;
    CASE jsonb_typeof(p)
    WHEN 'object' THEN
        r := '{}';
        FOR k, v IN SELECT * FROM jsonb_each(p) LOOP r := r || jsonb_build_object(k, ia.fn_hora_local(v)); END LOOP;
        RETURN r;
    WHEN 'array' THEN
        RETURN (SELECT coalesce(jsonb_agg(ia.fn_hora_local(e) ORDER BY i), '[]') FROM jsonb_array_elements(p) WITH ORDINALITY x(e, i));
    WHEN 'string' THEN
        s := p #>> '{}';
        -- Solo fecha con hora y zona (así las escribe la base): 2026-11-14T23:05:11.12+00:00
        IF s ~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}(:?\d{2})?)$' THEN
            BEGIN
                RETURN to_jsonb(to_char(s::timestamptz AT TIME ZONE 'America/Argentina/Mendoza', 'DD/MM/YYYY HH24:MI'));
            EXCEPTION WHEN OTHERS THEN RETURN p;
            END;
        END IF;
        RETURN p;
    ELSE
        RETURN p;
    END CASE;
END $function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Pronóstico de varios días para una lista de puntos (Open-Meteo, igual que el mapa)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ia.fn_pronostico_puntos(p_lats numeric[], p_lngs numeric[], OUT datos jsonb, OUT error text)
 RETURNS record
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE v_clave text; v_url text; v_status integer; v_body text; j jsonb;
BEGIN
    BEGIN
        EXECUTE $q$SELECT max(decrypted_secret) FROM vault.decrypted_secrets WHERE name = 'open_meteo_clave'$q$ INTO v_clave;
    EXCEPTION WHEN OTHERS THEN v_clave := NULL;
    END;
    v_url := 'https://' || CASE WHEN v_clave IS NOT NULL THEN 'customer-' ELSE '' END || 'api.open-meteo.com/v1/forecast'
          || '?latitude=' || array_to_string(p_lats, ',') || '&longitude=' || array_to_string(p_lngs, ',')
          || '&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation,snowfall'
          || '&wind_speed_unit=kmh&timezone=GMT&forecast_days=4'
          || CASE WHEN v_clave IS NOT NULL THEN '&apikey=' || v_clave ELSE '' END;
    BEGIN
        BEGIN EXECUTE $q$SELECT http_set_curlopt('CURLOPT_TIMEOUT', '20')$q$; EXCEPTION WHEN OTHERS THEN NULL; END;
        EXECUTE $q$SELECT r.status, r.content FROM http_get($1) r$q$ INTO v_status, v_body USING v_url;
    EXCEPTION WHEN OTHERS THEN
        error := 'No se pudo consultar el pronóstico (Open-Meteo): ' || SQLERRM; RETURN;
    END;
    BEGIN j := v_body::jsonb; EXCEPTION WHEN OTHERS THEN j := NULL; END;
    IF v_status IS DISTINCT FROM 200 OR j IS NULL THEN
        error := format('El pronóstico (Open-Meteo) respondió %s: %s', coalesce(v_status::text, 'nada'), left(coalesce(j ->> 'reason', v_body, ''), 200)); RETURN;
    END IF;
    datos := CASE WHEN jsonb_typeof(j) = 'array' THEN j ELSE jsonb_build_array(j) END;
END $function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Un lugar por su nombre o código (Maestros › Ubicaciones)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ia.fn_lugar(p_texto text, OUT id bigint, OUT nombre text, OUT lat numeric, OUT lng numeric, OUT error text)
 RETURNS record
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE v text := upper(btrim(coalesce(p_texto, ''))); n integer; v_lista text;
BEGIN
    IF v = '' THEN error := 'Falta el lugar'; RETURN; END IF;
    v := translate(v, 'ÁÉÍÓÚÜ', 'AEIOUU');
    WITH u AS (
        SELECT x.id, x.nombre, x.latitud, x.longitud, x.tipo,
               translate(upper(x.nombre), 'ÁÉÍÓÚÜ', 'AEIOUU') AS nn, upper(x.codigo) AS cc
          FROM mae.ubicacion x WHERE x.eliminado_en IS NULL),
    c AS (
        SELECT u.*, CASE WHEN u.nn = v OR u.cc = v THEN 1 WHEN u.nn LIKE v || '%' THEN 2 WHEN u.nn LIKE '%' || v || '%' THEN 3 END AS nivel
          FROM u),
    m AS (SELECT c.* FROM c WHERE c.nivel = (SELECT min(nivel) FROM c))
    SELECT count(*), string_agg(m.nombre, ', ' ORDER BY m.nombre), min(m.id) INTO n, v_lista, id FROM m;
    IF n = 0 THEN
        error := format('No encuentro el lugar «%s» en Maestros › Ubicaciones', btrim(p_texto)); id := NULL; RETURN;
    ELSIF n > 1 THEN
        error := format('Hay varios lugares que coinciden con «%s»: %s. Decime cuál', btrim(p_texto), left(v_lista, 300)); id := NULL; RETURN;
    END IF;
    SELECT x.nombre, x.latitud, x.longitud INTO nombre, lat, lng FROM mae.ubicacion x WHERE x.id = fn_lugar.id;
    -- Coordenadas fuera de Sudamérica: están mal cargadas (por ejemplo, la longitud sin el signo menos)
    IF lat IS NULL OR lng IS NULL OR lat NOT BETWEEN -56 AND 13 OR lng NOT BETWEEN -82 AND -34 THEN
        error := format('La ubicación «%s» tiene mal las coordenadas (%s, %s): hay que corregirla en Maestros › Ubicaciones', nombre,
                        coalesce(lat::text, 'sin latitud'), coalesce(lng::text, 'sin longitud'));
    END IF;
END $function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) La lectura: viento, lluvia y nieve en el camino, con su costo en combustible
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ia.fn_lectura_viento_ruta(p_entrada jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
    e jsonb := coalesce(p_entrada, '{}');
    v_zona constant text := 'America/Argentina/Mendoza';
    o record; d record; r record; c record;
    v_linea extensions.geometry; v_km numeric; v_recta boolean := false; v_avisos jsonb := '[]';
    v_n integer; i integer; k integer; v_len integer;
    v_lats numeric[] := '{}'; v_lngs numeric[] := '{}'; v_rumbos numeric[] := '{}'; v_kms numeric[] := '{}';
    a extensions.geometry; b extensions.geometry;
    v_vel numeric; v_cons numeric; v_base_l numeric; v_precio numeric;
    v_fuerte numeric := ref.fn_parametro_num('tel.viento_fuerte_kmh', 25);
    v_aire numeric := ref.fn_parametro_num('tel.viento_parte_aire', 0.4);
    v_salida timestamptz; v_t0 timestamptz; v_s timestamptz; v_t timestamptz; v_horas numeric;
    v_despues numeric[] := ARRAY[0, 3, 6, 12, 24]; h numeric;
    w numeric; wd numeric; wg numeric; pp numeric; nn numeric; v_contra numeric; v_lat numeric;
    s_n integer; s_contra numeric; s_max numeric; s_raf numeric; s_raf_km numeric; s_lateral numeric; s_fuertes integer; s_f numeric;
    s_lluvia numeric; s_nieve numeric; v_pct numeric;
    v_opciones jsonb := '[]'; v_tramos jsonb := '[]'; v_camiones jsonb := '[]'; v_op jsonb; v_mejor jsonb;
    g_n integer; g_contra numeric; g_raf numeric; g_desde numeric; g_tam integer; g_lat numeric; g_lng numeric;
    p text; v_cam record; v_comb jsonb; v_pos record; v_extra0 numeric;
BEGIN
    IF NOT ia.fn_puede_asistente() THEN RAISE EXCEPTION 'Iris es para Gerencia' USING ERRCODE = '42501'; END IF;

    -- Destino y origen (si no dicen el origen: la base operativa)
    SELECT * INTO d FROM ia.fn_lugar(e ->> 'hasta');
    IF d.error IS NOT NULL THEN RAISE EXCEPTION '%', d.error USING ERRCODE = '22023'; END IF;
    IF nullif(btrim(e ->> 'desde'), '') IS NULL THEN
        SELECT u.id, u.nombre, u.latitud AS lat, u.longitud AS lng, NULL::text AS error INTO o
          FROM mae.ubicacion u WHERE u.id = ref.fn_parametro_num('ops.base_operativa_id', 0)::bigint AND u.eliminado_en IS NULL;
        IF o.id IS NULL OR o.lat IS NULL THEN RAISE EXCEPTION 'Decime desde dónde salen (no está definida la base operativa)' USING ERRCODE = '22023'; END IF;
    ELSE
        SELECT * INTO o FROM ia.fn_lugar(e ->> 'desde');
        IF o.error IS NOT NULL THEN RAISE EXCEPTION '%', o.error USING ERRCODE = '22023'; END IF;
    END IF;
    IF o.id = d.id THEN RAISE EXCEPTION 'El origen y el destino son el mismo lugar' USING ERRCODE = '22023'; END IF;

    -- Velocidad de marcha y consumo
    v_vel := coalesce(nullif(e ->> 'velocidad_kmh', '')::numeric, 80);
    IF v_vel NOT BETWEEN 40 AND 110 THEN RAISE EXCEPTION 'La velocidad tiene que estar entre 40 y 110 km/h' USING ERRCODE = '22023'; END IF;
    v_cons := coalesce(nullif(e ->> 'consumo_l_100km', '')::numeric, ref.fn_parametro_num('fue.orden_carga_consumo_defecto_l_100km', 35));
    IF v_cons NOT BETWEEN 15 AND 70 THEN RAISE EXCEPTION 'El consumo tiene que estar entre 15 y 70 L cada 100 km' USING ERRCODE = '22023'; END IF;

    -- Hora de salida (hora de Mendoza). Si no la dicen: ahora
    IF nullif(btrim(e ->> 'salida'), '') IS NULL THEN
        v_salida := now();
    ELSE
        BEGIN
            v_salida := (btrim(e ->> 'salida'))::timestamp AT TIME ZONE v_zona;
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'La hora de salida «%» no es válida (usá AAAA-MM-DD HH:MM, hora de Mendoza)', e ->> 'salida' USING ERRCODE = '22023';
        END;
        IF v_salida < now() - interval '2 hours' THEN
            RAISE EXCEPTION 'Esa salida ya pasó: esta lectura es el pronóstico (para un viaje ya hecho está el viento del cierre de viaje)' USING ERRCODE = '22023';
        END IF;
        IF v_salida > now() + interval '60 hours' THEN
            RAISE EXCEPTION 'El pronóstico llega hasta 3 días: pedí una salida más cercana' USING ERRCODE = '22023';
        END IF;
    END IF;

    -- El camino por ruta; si el servicio de mapas no responde, la línea recta (y se avisa)
    SELECT * INTO r FROM tel.fn_osrm_camino(jsonb_build_array(jsonb_build_object('lat', o.lat, 'lng', o.lng),
                                                              jsonb_build_object('lat', d.lat, 'lng', d.lng)));
    IF r.error IS NULL AND r.camino IS NOT NULL AND r.km > 0 THEN
        v_linea := r.camino::geometry; v_km := r.km;
    ELSE
        v_recta := true;
        v_linea := ST_SetSRID(ST_MakeLine(ST_MakePoint(o.lng::float8, o.lat::float8), ST_MakePoint(d.lng::float8, d.lat::float8)), 4326);
        v_km := round((ST_Length(v_linea::geography) / 1000 * 1.2)::numeric, 1);
        v_avisos := v_avisos || to_jsonb('No se pudo traer el camino por ruta (' || coalesce(r.error, 'sin respuesta')
                    || '): se usó la línea recta más 20 %; los km y el rumbo son aproximados.');
    END IF;
    IF v_km < 30 THEN RAISE EXCEPTION 'El tramo es muy corto (% km): el viento casi no cambia el consumo', v_km USING ERRCODE = '22023'; END IF;
    IF v_km > 4000 THEN RAISE EXCEPTION 'El tramo es muy largo (% km): pedilo por partes', round(v_km) USING ERRCODE = '22023'; END IF;

    -- Puntos del camino (uno cada ~40 km, entre 8 y 40) con su rumbo
    v_n := least(40, greatest(8, ceil(v_km / 40)::integer));
    FOR i IN 0 .. v_n - 1 LOOP
        a := ST_LineInterpolatePoint(v_linea, i::float8 / v_n);
        b := ST_LineInterpolatePoint(v_linea, (i + 1)::float8 / v_n);
        v_lats := v_lats || round(ST_Y(ST_LineInterpolatePoint(v_linea, (i + 0.5)::float8 / v_n))::numeric, 2);
        v_lngs := v_lngs || round(ST_X(ST_LineInterpolatePoint(v_linea, (i + 0.5)::float8 / v_n))::numeric, 2);
        v_rumbos := v_rumbos || round(coalesce(degrees(ST_Azimuth(a::geography, b::geography)), 0)::numeric, 0);
        v_kms := v_kms || round(v_km * (i + 0.5) / v_n, 0);
    END LOOP;

    SELECT * INTO c FROM ia.fn_pronostico_puntos(v_lats, v_lngs);
    IF c.error IS NOT NULL THEN RAISE EXCEPTION '%', c.error USING ERRCODE = '55000'; END IF;
    IF jsonb_array_length(c.datos) < v_n THEN RAISE EXCEPTION 'El pronóstico vino incompleto: probá de nuevo en un rato' USING ERRCODE = '55000'; END IF;
    v_t0 := (c.datos #>> '{0,hourly,time,0}')::timestamp AT TIME ZONE 'UTC';
    v_len := jsonb_array_length(c.datos #> '{0,hourly,time}');

    -- Precio del litro: lo que se viene pagando (últimos 30 días, en USD)
    BEGIN
        -- Solo las cargas que se pueden pasar a USD (si no hay tipo de cambio de esa moneda, no entran)
        SELECT round(sum(z.usd) / nullif(sum(z.litros), 0), 3) INTO v_precio
          FROM (SELECT k2.litros, ven.fn_a_usd(k2.importe_original, k2.moneda::text, (k2.fecha_hora AT TIME ZONE v_zona)::date) AS usd
                  FROM fue.carga_combustible k2
                 WHERE k2.eliminado_en IS NULL AND coalesce(k2.estado_validacion, '') <> 'anulada' AND k2.tanque_reefer_id IS NULL
                   AND k2.litros > 0 AND k2.importe_original > 0 AND k2.fecha_hora > now() - interval '30 days') z
         WHERE z.usd > 0;
    EXCEPTION WHEN OTHERS THEN v_precio := NULL;
    END;
    IF v_precio IS NULL THEN
        v_avisos := v_avisos || to_jsonb('No hay cargas de combustible con precio en los últimos 30 días: el impacto va solo en litros.'::text);
    END IF;

    v_base_l := round(v_km * v_cons / 100, 0);
    v_horas := round(v_km / v_vel, 1);

    -- Cada opción de salida: la pedida y más tarde
    FOREACH h IN ARRAY v_despues LOOP
        v_s := v_salida + make_interval(mins => (h * 60)::integer);
        s_n := 0; s_contra := 0; s_max := NULL; s_raf := NULL; s_raf_km := NULL; s_lateral := NULL; s_fuertes := 0; s_f := 0; s_lluvia := NULL; s_nieve := 0;
        IF h = 0 THEN g_tam := ceil(v_n / 5.0)::integer; g_n := 0; g_contra := 0; g_raf := NULL; g_desde := 0; END IF;
        FOR i IN 1 .. v_n LOOP
            v_t := v_s + make_interval(secs => (v_kms[i] / v_vel * 3600)::integer);
            k := floor(extract(epoch FROM (date_trunc('hour', v_t + interval '30 minutes') - v_t0)) / 3600)::integer;
            IF k >= 0 AND k < v_len THEN
                w := (c.datos -> (i - 1) -> 'hourly' -> 'wind_speed_10m' ->> k)::numeric;
                wd := (c.datos -> (i - 1) -> 'hourly' -> 'wind_direction_10m' ->> k)::numeric;
                wg := (c.datos -> (i - 1) -> 'hourly' -> 'wind_gusts_10m' ->> k)::numeric;
                pp := (c.datos -> (i - 1) -> 'hourly' -> 'precipitation' ->> k)::numeric;
                nn := (c.datos -> (i - 1) -> 'hourly' -> 'snowfall' ->> k)::numeric;
            ELSE
                w := NULL; wd := NULL;
            END IF;
            IF w IS NOT NULL AND wd IS NOT NULL THEN
                -- Viento de frente (positivo) o de cola (negativo), igual que en el cierre de viaje
                v_contra := round((w * cos(radians(wd - v_rumbos[i])))::numeric, 1);
                v_lat := round(abs(w * sin(radians(wd - v_rumbos[i])))::numeric, 1);
                s_n := s_n + 1; s_contra := s_contra + v_contra;
                s_max := greatest(s_max, v_contra); s_lateral := greatest(s_lateral, v_lat);
                IF wg IS NOT NULL AND (s_raf IS NULL OR wg > s_raf) THEN s_raf := wg; s_raf_km := v_kms[i]; END IF;
                IF v_contra >= v_fuerte THEN s_fuertes := s_fuertes + 1; END IF;
                s_f := s_f + (power(greatest(v_vel + v_contra, 0), 2) - power(v_vel, 2)) / power(v_vel, 2);
                s_lluvia := greatest(s_lluvia, pp); s_nieve := s_nieve + coalesce(nn, 0);
                IF h = 0 THEN g_n := g_n + 1; g_contra := g_contra + v_contra; g_raf := greatest(g_raf, wg); g_lat := v_lats[i]; g_lng := v_lngs[i]; END IF;
            END IF;
            -- Tramos (solo de la salida pedida): cinco partes del camino
            IF h = 0 AND (i % g_tam = 0 OR i = v_n) THEN
                IF g_n > 0 THEN
                    v_tramos := v_tramos || jsonb_build_object(
                        'km_desde', round(g_desde), 'km_hasta', round(v_km * i / v_n),
                        'cerca_de', (SELECT u.nombre FROM mae.ubicacion u
                                      WHERE u.eliminado_en IS NULL AND u.geom IS NOT NULL AND u.tipo <> 'estacion'
                                        AND ST_DWithin(u.geom, ST_SetSRID(ST_MakePoint(g_lng::float8, g_lat::float8), 4326)::geography, 90000)
                                      ORDER BY ST_Distance(u.geom, ST_SetSRID(ST_MakePoint(g_lng::float8, g_lat::float8), 4326)::geography) LIMIT 1),
                        'pasa_a_las', to_char(v_t AT TIME ZONE v_zona, 'DD/MM HH24:MI'),
                        'viento_de_frente_kmh', round(g_contra / g_n), 'rafaga_max_kmh', round(g_raf));
                END IF;
                g_n := 0; g_contra := 0; g_raf := NULL; g_desde := v_km * i / v_n;
            END IF;
        END LOOP;
        CONTINUE WHEN s_n = 0;
        v_pct := round(v_aire * s_f / s_n * 100, 1);
        v_op := jsonb_build_object(
            'salida', to_char(v_s AT TIME ZONE v_zona, 'DD/MM HH24:MI'),
            'llegada_sin_paradas', to_char((v_s + make_interval(secs => (v_km / v_vel * 3600)::integer)) AT TIME ZONE v_zona, 'DD/MM HH24:MI'),
            'viento_de_frente_prom_kmh', round(s_contra / s_n), 'viento_de_frente_max_kmh', round(s_max),
            'rafaga_max_kmh', round(s_raf), 'rafaga_max_en_km', s_raf_km, 'viento_lateral_max_kmh', round(s_lateral),
            'horas_con_viento_fuerte_de_frente', round(s_fuertes * v_horas / v_n, 1),
            'consumo_extra_pct', v_pct, 'litros_extra_por_camion', round(v_base_l * v_pct / 100),
            'usd_extra_por_camion', CASE WHEN v_precio IS NOT NULL THEN round(v_base_l * v_pct / 100 * v_precio) END,
            'lluvia_max_mm_h', round(coalesce(s_lluvia, 0), 1), 'nieve_cm', round(s_nieve, 1),
            'pronostico_cubre_pct', round(100.0 * s_n / v_n));
        IF h = 0 THEN v_extra0 := round(v_base_l * v_pct / 100); END IF;
        v_opciones := v_opciones || v_op;
        IF (v_op ->> 'pronostico_cubre_pct')::numeric >= 80
           AND (v_mejor IS NULL OR (v_op ->> 'consumo_extra_pct')::numeric < (v_mejor ->> 'consumo_extra_pct')::numeric) THEN
            v_mejor := v_op;
        END IF;
    END LOOP;
    IF jsonb_array_length(v_opciones) = 0 THEN RAISE EXCEPTION 'El pronóstico no cubre esas horas' USING ERRCODE = '55000'; END IF;

    -- Los camiones que nombraron: combustible que tienen y si les alcanza
    IF jsonb_typeof(e -> 'patentes') = 'array' THEN
        FOR p IN SELECT upper(regexp_replace(x, '[^A-Za-z0-9]', '', 'g')) FROM jsonb_array_elements_text(e -> 'patentes') x LIMIT 6 LOOP
            SELECT k3.id, k3.patente INTO v_cam FROM mae.camion k3
             WHERE k3.eliminado_en IS NULL AND upper(regexp_replace(k3.patente, '[^A-Za-z0-9]', '', 'g')) = p LIMIT 1;
            IF v_cam.id IS NULL THEN
                v_camiones := v_camiones || jsonb_build_object('patente', p, 'error', 'No encuentro esa patente');
                CONTINUE;
            END IF;
            v_comb := coalesce((SELECT rc.combustible FROM tel.resumen_camion rc WHERE rc.camion_id = v_cam.id), fue.fn_combustible_actual(v_cam.id));
            SELECT l.latitud, l.longitud, l.ts INTO v_pos FROM tel.lectura l
             WHERE l.camion_id = v_cam.id AND l.latitud IS NOT NULL AND l.calidad > 0 AND l.ts > now() - interval '2 days' ORDER BY l.ts DESC LIMIT 1;
            v_camiones := v_camiones || jsonb_strip_nulls(jsonb_build_object(
                'patente', v_cam.patente,
                'chofer', ops.fn_nombre_chofer(tel.fn_chofer_actual(v_cam.id)),
                'km_al_origen', CASE WHEN v_pos.latitud IS NOT NULL THEN round((ST_Distance(
                                    ST_SetSRID(ST_MakePoint(v_pos.longitud::float8, v_pos.latitud::float8), 4326)::geography,
                                    ST_SetSRID(ST_MakePoint(o.lng::float8, o.lat::float8), 4326)::geography) / 1000)::numeric) END,
                'ultima_posicion', to_char(v_pos.ts AT TIME ZONE v_zona, 'DD/MM HH24:MI'),
                'combustible_l', (v_comb ->> 'litros')::numeric, 'capacidad_l', (v_comb ->> 'capacidad_l')::numeric,
                'combustible_no_se_sabe_por', CASE WHEN v_comb ->> 'litros' IS NULL THEN v_comb ->> 'motivo' END,
                'litros_que_necesita', v_base_l + coalesce(v_extra0, 0),
                'le_sobran_l', CASE WHEN v_comb ->> 'litros' IS NOT NULL THEN round((v_comb ->> 'litros')::numeric - v_base_l - coalesce(v_extra0, 0)) END));
        END LOOP;
    END IF;

    RETURN jsonb_strip_nulls(jsonb_build_object(
        'desde', o.nombre, 'hasta', d.nombre, 'km', round(v_km), 'horas_de_marcha', v_horas,
        'consumo_normal_l', v_base_l, 'precio_litro_usd', v_precio,
        'opciones_de_salida', v_opciones,
        'salida_con_menos_viento', v_mejor -> 'salida',
        'tramos_de_la_primera_salida', v_tramos,
        'camiones', CASE WHEN jsonb_array_length(v_camiones) > 0 THEN v_camiones END,
        'como_se_calcula', format('Pronóstico de Open-Meteo sobre %s puntos del camino. Marcha a %s km/h sin contar paradas ni descansos. Consumo normal %s L cada 100 km. '
                                  || 'Viento de frente positivo, de cola negativo. Viento fuerte: %s km/h o más de frente. Es una estimación: el pronóstico puede cambiar.',
                                  v_n, v_vel, v_cons, v_fuerte),
        'aviso', CASE WHEN jsonb_array_length(v_avisos) > 0 THEN (SELECT string_agg(x, ' ') FROM jsonb_array_elements_text(v_avisos) x) END));
END $function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) La lectura entra en la lista de Iris
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO ia.asistente_herramienta (codigo, orden, descripcion, etiqueta, leyendo, pantalla, entrada, activa)
VALUES ('viento_en_ruta', 29,
        'Pronóstico de viento, lluvia y nieve sobre el camino entre dos lugares, y cuánto combustible de más cuesta (litros y USD por camión). '
        || 'Compara salir a la hora pedida contra salir 3, 6, 12 y 24 horas después, y dice en qué tramo pega más fuerte. '
        || 'Si le pasás patentes, dice cuánto combustible tiene cada camión y si le alcanza. '
        || 'Usala SIEMPRE que hablen de viento, clima, lluvia, nieve o de si conviene salir ahora o esperar. '
        || 'Los lugares son los de Maestros › Ubicaciones (por ejemplo: BUENOS AIRES, SAN ANTONIO, SANTIAGO, ROSARIO, CORDOBA, MAR DEL PLATA). '
        || 'Si no dicen de dónde salen, es la base operativa (Mendoza).',
        'Viento y clima en el camino', 'Mirando el pronóstico en el camino…', '/pizarra/mapa',
        '{"type": "object", "required": ["hasta"], "properties": {
            "hasta": {"type": "string", "description": "Lugar de destino (nombre o código de la ubicación)."},
            "desde": {"type": "string", "description": "Lugar de salida. Si no se manda: la base operativa."},
            "salida": {"type": "string", "description": "Fecha y hora de salida en hora de Mendoza, AAAA-MM-DD HH:MM. Si no se manda: ahora."},
            "patentes": {"type": "array", "items": {"type": "string"}, "description": "Patentes de los tractores que salen (hasta 6), para ver su combustible."},
            "consumo_l_100km": {"type": "number", "description": "Consumo normal del camión en ese tramo. Si no se manda: el consumo por defecto del sistema."},
            "velocidad_kmh": {"type": "number", "description": "Velocidad de marcha. Si no se manda: 80."}}}'::jsonb,
        true)
ON CONFLICT (codigo) DO UPDATE
   SET descripcion = EXCLUDED.descripcion, etiqueta = EXCLUDED.etiqueta, leyendo = EXCLUDED.leyendo, pantalla = EXCLUDED.pantalla,
       entrada = EXCLUDED.entrada, activa = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) El despacho: la lectura nueva y las horas en hora de Mendoza
--    (se conserva lo que ya hacía; si alguien lo cambió, la migración se detiene)
-- ─────────────────────────────────────────────────────────────────────────────
DO $do$
DECLARE v text := (SELECT prosrc FROM pg_proc WHERE oid = 'ia.fn_herramienta(text, jsonb)'::regprocedure);
BEGIN
    IF v LIKE '%fn_hora_local%' THEN RETURN; END IF;   -- ya está aplicada
    IF v NOT LIKE '%RETURN ia.fn_herramienta_base(p_codigo, p_entrada);%'
       OR (length(v) - length(replace(v, 'IF p_codigo', ''))) / length('IF p_codigo') <> 1
       OR v NOT LIKE '%cargas_precio_dudoso%' THEN
        RAISE EXCEPTION 'ia.fn_herramienta no es la que esperaba esta migración: avisar antes de seguir';
    END IF;
END $do$;

CREATE OR REPLACE FUNCTION ia.fn_herramienta(p_codigo text, p_entrada jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE r jsonb;
BEGIN
    -- Migración 258: precios dudosos. Iris 02: viento en ruta y horas en hora de Mendoza (fn_hora_local).
    IF p_codigo = 'cargas_precio_dudoso' THEN
        r := ia.fn_lectura_cargas_precio(nullif(p_entrada->>'desde', '')::date, nullif(p_entrada->>'hasta', '')::date);
    ELSIF p_codigo = 'viento_en_ruta' THEN
        IF NOT EXISTS (SELECT 1 FROM ia.asistente_herramienta WHERE codigo = p_codigo AND activa) THEN
            RETURN jsonb_build_object('ok', false, 'error', 'Esa lectura no está en la lista del asistente');
        END IF;
        BEGIN
            r := jsonb_build_object('ok', true, 'datos', ia.fn_lectura_viento_ruta(p_entrada));
        EXCEPTION WHEN OTHERS THEN
            RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
        END;
    ELSE
        r := ia.fn_herramienta_base(p_codigo, p_entrada);
    END IF;
    IF r ? 'datos' THEN r := jsonb_set(r, '{datos}', ia.fn_hora_local(r -> 'datos')); END IF;
    RETURN r;
END $function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) Instrucciones de Iris: se agregan reglas al final (lo anterior queda igual)
-- ─────────────────────────────────────────────────────────────────────────────
DO $do$
DECLARE
    v_def text := pg_get_functiondef('ia.fn_instrucciones_asistente()'::regprocedure);
    v_ancla constant text := '|| ''12) Las tablas van ordenadas de mayor a menor por el número principal (salvo que sean por fecha) y con el total al final.''';
    v_nuevo constant text := $t$
        || ' 13) Todas las horas de las lecturas están en hora de Mendoza: decilas así, sin aclarar la zona, y nunca digas UTC. '
        || '14) Cuando te cuentan algo de la operación (viento, lluvia, nieve, un camión que sale o si conviene esperar) NO contestes que no tenés el dato: '
        || 'usá «viento_en_ruta» con el destino que nombran (y el origen si lo dicen; si no, la base). Si no dicen qué camiones son, calculá igual por camión y preguntá las patentes al final. '
        || '15) Con esa lectura respondé siempre en este orden y corto: '
        || 'a) qué va a pasar (viento de frente promedio y máximo, ráfagas y en qué tramo y a qué hora); '
        || 'b) cuánto cuesta (litros y USD de más por camión y en total por los camiones que salen); '
        || 'c) qué recomendás, eligiendo UNA cosa: salir ahora, o esperar hasta la salida con menos viento diciendo cuánto se ahorra, y si hace falta cargar más combustible antes de salir. '
        || 'Si la diferencia entre salir ahora y esperar es menos de 15 litros por camión, decí que no vale la pena esperar. '
        || 'Si hay ráfagas de 70 km/h o más, viento lateral de 50 km/h o más, o nieve, avisá primero el riesgo para la seguridad, antes que el costo. '
        || 'Números negativos de viento de frente son viento de cola: es ahorro, decilo así. '
        || '16) Lo del viento es un pronóstico y una estimación: decilo una sola vez, al final, en una línea. Esos números salen de la lectura, no los calcules vos.'$t$;
BEGIN
    IF v_def LIKE '%viento_en_ruta%' THEN RETURN; END IF;   -- ya está aplicada
    IF position(v_ancla IN v_def) = 0 THEN
        RAISE EXCEPTION 'ia.fn_instrucciones_asistente no es la que esperaba esta migración: avisar antes de seguir';
    END IF;
    EXECUTE replace(v_def, v_ancla, v_ancla || v_nuevo);
END $do$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8) Permisos: lo mismo que las otras lecturas de Iris
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION ia.fn_pronostico_puntos(numeric[], numeric[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION ia.fn_lugar(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION ia.fn_lectura_viento_ruta(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION ia.fn_hora_local(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ia.fn_lectura_viento_ruta(jsonb) TO tc_app, tc_admin, tc_lectura;
GRANT EXECUTE ON FUNCTION ia.fn_hora_local(jsonb) TO tc_app, tc_admin, tc_lectura;

COMMIT;
