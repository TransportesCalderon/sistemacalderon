-- =====================================================================================
-- Migración 307 · Velocidades máximas por zona de montaña (normativa Mendoza – Los Andes – Santiago – San Antonio)
-- =====================================================================================
-- Pedido (24/11/2026): la empresa fija velocidades máximas por tramo (documentos «Normativa de velocidades en tramos
-- Argentina – Chile», ida AR→CL y vuelta CL→AR). El sistema tiene que registrarlas, avisar y permitir labrar el acta
-- cuando se exceden.
--   · tel.zona_velocidad: cada tramo con su velocidad máxima, su sentido (ida Argentina → Chile, vuelta Chile →
--     Argentina) y los puntos de inicio y fin (y los intermedios que hagan falta). El sistema arma el corredor sobre la
--     ruta con el mapa (OSRM) y un ancho (120 m por defecto). Un tramo de un solo punto es un círculo (nudos viales).
--   · Los tramos se cargan «a verificar»: los puntos son aproximados. Telemetría los revisa en el mapa (Configuración ›
--     Datos de los camiones), corre los puntos si hace falta y los marca verificados. SOLO los verificados generan
--     alertas (no se sanciona con un tramo mal dibujado).
--   · Regla EXCESO_VELOCIDAD_ZONA: lecturas del GPS dentro del corredor, en el sentido del tramo, que pasan el máximo
--     por más de 5 km/h en al menos 2 lecturas seguidas (parámetros de la regla). Una alerta por pasada, con la zona,
--     el máximo, la velocidad alcanzada y el recorrido en el mapa. Aviso al teléfono de Telemetría.
--   · Telemetría confirma la alerta y labra el acta de infracción (tipo «velocidad excesiva») con el botón de siempre;
--     el acta lleva como lugar el nombre del tramo.
-- Va después de la 306 (notificaciones, otro chat). web.version_base = 307.
-- =====================================================================================
BEGIN;

-- ---------------------------------------------------------------------------------
-- 1 · Los tramos
-- ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tel.zona_velocidad (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre text NOT NULL CHECK (length(btrim(nombre)) BETWEEN 3 AND 120),
    sentido text NOT NULL CHECK (sentido IN ('ida', 'vuelta', 'ambos')),
    velocidad_max integer NOT NULL CHECK (velocidad_max BETWEEN 5 AND 130),
    puntos jsonb NOT NULL CHECK (jsonb_typeof(puntos) = 'array' AND jsonb_array_length(puntos) BETWEEN 1 AND 30),
    ancho_m integer NOT NULL DEFAULT 120 CHECK (ancho_m BETWEEN 20 AND 2000),
    camino extensions.geometry(LineString, 4326),
    geom extensions.geometry(Geometry, 4326),
    km numeric,
    armado_con text,
    estado text NOT NULL DEFAULT 'a_verificar' CHECK (estado IN ('a_verificar', 'verificada', 'inactiva')),
    orden integer NOT NULL DEFAULT 0,
    documento text,
    observacion text,
    verificada_por bigint REFERENCES seg.usuario(id),
    verificada_en timestamptz,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_por bigint REFERENCES seg.usuario(id),
    eliminado_en timestamptz
);
CREATE INDEX IF NOT EXISTS ix_zona_velocidad_geom ON tel.zona_velocidad USING gist (geom) WHERE eliminado_en IS NULL;
REVOKE ALL ON tel.zona_velocidad FROM PUBLIC;
COMMENT ON TABLE tel.zona_velocidad IS
    'Migración 307: velocidades máximas por tramo de montaña (normativa de la empresa). Solo los verificados generan alertas.';

-- Quién maneja los tramos: los mismos que los umbrales de las alertas (Control/Telemetría y TI)
CREATE OR REPLACE FUNCTION tel.fn_exigir_zonas()
RETURNS bigint
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_usr bigint := aud.fn_usuario_actual();
BEGIN
    IF v_usr IS NULL OR NOT EXISTS (SELECT 1 FROM seg.usuario_rol WHERE usuario_id = v_usr AND rol_codigo IN ('analista_control', 'gerencia', 'ti')) THEN
        RAISE EXCEPTION 'Los tramos de velocidad los cargan Telemetría, Gerencia o TI' USING ERRCODE = '42501';
    END IF;
    RETURN v_usr;
END $f$;

-- Arma el corredor: el camino del mapa por los puntos (o una línea recta si el mapa no responde) y el ancho
CREATE OR REPLACE FUNCTION tel.fn_armar_zona_velocidad(p_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE z tel.zona_velocidad%ROWTYPE; m record; v_linea extensions.geometry; v_con text; v_pts jsonb;
BEGIN
    SELECT * INTO z FROM tel.zona_velocidad WHERE id = p_id FOR UPDATE;
    IF z.id IS NULL THEN RAISE EXCEPTION 'El tramo no existe' USING ERRCODE = 'P0002'; END IF;
    v_pts := (SELECT jsonb_agg(jsonb_build_object('lat', (e ->> 'lat')::numeric, 'lng', (e ->> 'lng')::numeric) ORDER BY o)
                FROM jsonb_array_elements(z.puntos) WITH ORDINALITY x(e, o));
    IF jsonb_array_length(v_pts) = 1 THEN
        -- Un solo punto: un círculo del ancho como radio (nudos viales)
        UPDATE tel.zona_velocidad
           SET camino = NULL,
               geom = extensions.ST_Buffer(extensions.ST_SetSRID(extensions.ST_MakePoint((v_pts -> 0 ->> 'lng')::float8, (v_pts -> 0 ->> 'lat')::float8), 4326)::extensions.geography, z.ancho_m)::extensions.geometry,
               km = 0, armado_con = 'punto', actualizado_en = now()
         WHERE id = z.id;
        RETURN jsonb_build_object('id', z.id, 'armado_con', 'punto');
    END IF;
    BEGIN
        SELECT * INTO m FROM tel.fn_osrm_camino(v_pts);
    EXCEPTION WHEN OTHERS THEN m := NULL;
    END;
    IF m.camino IS NOT NULL THEN
        v_linea := m.camino::extensions.geometry; v_con := 'mapa';
    ELSE
        v_linea := (SELECT extensions.ST_MakeLine(extensions.ST_SetSRID(extensions.ST_MakePoint((e ->> 'lng')::float8, (e ->> 'lat')::float8), 4326) ORDER BY o)
                      FROM jsonb_array_elements(v_pts) WITH ORDINALITY x(e, o));
        v_con := 'recta';
    END IF;
    UPDATE tel.zona_velocidad
       SET camino = extensions.ST_LineMerge(v_linea),
           geom = extensions.ST_Buffer(v_linea::extensions.geography, z.ancho_m, 'endcap=flat join=round')::extensions.geometry,
           km = round((extensions.ST_Length(v_linea::extensions.geography) / 1000)::numeric, 1), armado_con = v_con, actualizado_en = now()
     WHERE id = z.id;
    RETURN jsonb_build_object('id', z.id, 'armado_con', v_con, 'error_mapa', m.error);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('id', p_id, 'error', SQLERRM);
END $f$;

-- La lista para la pantalla (con el dibujo en GeoJSON)
CREATE OR REPLACE FUNCTION tel.fn_zonas_velocidad()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM seg.usuario_rol WHERE usuario_id = aud.fn_usuario_actual()
                    AND rol_codigo IN ('analista_control', 'gerencia', 'ti', 'auditor', 'operaciones', 'adm_combustible')) THEN
        RAISE EXCEPTION 'Los tramos de velocidad los ven Telemetría, Operaciones, Gerencia y TI' USING ERRCODE = '42501';
    END IF;
    RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
               'id', z.id, 'nombre', z.nombre, 'sentido', z.sentido, 'velocidad_max', z.velocidad_max, 'puntos', z.puntos, 'ancho_m', z.ancho_m,
               'km', z.km, 'armado_con', z.armado_con, 'estado', z.estado, 'orden', z.orden, 'documento', z.documento, 'observacion', z.observacion,
               'verificada_en', z.verificada_en,
               'geom', CASE WHEN z.geom IS NOT NULL THEN extensions.ST_AsGeoJSON(extensions.ST_SimplifyPreserveTopology(z.geom, 0.00005), 6)::jsonb END,
               'camino', CASE WHEN z.camino IS NOT NULL THEN extensions.ST_AsGeoJSON(extensions.ST_Simplify(z.camino, 0.00005), 6)::jsonb END,
               'excesos_30d', (SELECT count(*) FROM ana.alerta a JOIN ana.regla_anomalia r ON r.id = a.regla_id
                                WHERE r.codigo = 'EXCESO_VELOCIDAD_ZONA' AND (a.evidencia ->> 'zona_id')::bigint = z.id
                                  AND a.detectada_en > now() - interval '30 days'))
             ORDER BY z.sentido, z.orden, z.id)
              FROM tel.zona_velocidad z WHERE z.eliminado_en IS NULL), '[]');
END $f$;

-- Guardar un tramo (nuevo o cambiado): vuelve a quedar «a verificar» si cambian los puntos, el ancho o la velocidad
CREATE OR REPLACE FUNCTION tel.fn_guardar_zona_velocidad(p_id bigint, p_datos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_usr bigint := tel.fn_exigir_zonas(); d jsonb := coalesce(p_datos, '{}'); z tel.zona_velocidad%ROWTYPE; v_id bigint; v_pts jsonb;
        v_cambia boolean;
BEGIN
    v_pts := d -> 'puntos';
    IF jsonb_typeof(v_pts) <> 'array' OR jsonb_array_length(v_pts) = 0 THEN RAISE EXCEPTION 'Marcá al menos el punto de inicio' USING ERRCODE = '22023'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_pts) e
                WHERE (e ->> 'lat') IS NULL OR (e ->> 'lng') IS NULL OR (e ->> 'lat')::numeric NOT BETWEEN -60 AND 10
                   OR (e ->> 'lng')::numeric NOT BETWEEN -90 AND -30) THEN
        RAISE EXCEPTION 'Hay un punto fuera de Sudamérica: revisá latitud y longitud' USING ERRCODE = '22023';
    END IF;
    IF p_id IS NULL THEN
        INSERT INTO tel.zona_velocidad (nombre, sentido, velocidad_max, puntos, ancho_m, orden, documento, observacion, actualizado_por)
        VALUES (btrim(d ->> 'nombre'), coalesce(d ->> 'sentido', 'ambos'), (d ->> 'velocidad_max')::integer, v_pts,
                coalesce(nullif(d ->> 'ancho_m', '')::integer, 120), coalesce(nullif(d ->> 'orden', '')::integer, 0),
                nullif(btrim(coalesce(d ->> 'documento', '')), ''), nullif(btrim(coalesce(d ->> 'observacion', '')), ''), v_usr)
        RETURNING id INTO v_id;
    ELSE
        SELECT * INTO z FROM tel.zona_velocidad WHERE id = p_id AND eliminado_en IS NULL FOR UPDATE;
        IF z.id IS NULL THEN RAISE EXCEPTION 'El tramo no existe' USING ERRCODE = 'P0002'; END IF;
        v_cambia := z.puntos IS DISTINCT FROM v_pts OR z.ancho_m IS DISTINCT FROM coalesce(nullif(d ->> 'ancho_m', '')::integer, z.ancho_m)
                    OR z.velocidad_max IS DISTINCT FROM (d ->> 'velocidad_max')::integer OR z.sentido IS DISTINCT FROM coalesce(d ->> 'sentido', z.sentido);
        UPDATE tel.zona_velocidad
           SET nombre = btrim(coalesce(d ->> 'nombre', nombre)), sentido = coalesce(d ->> 'sentido', sentido),
               velocidad_max = (d ->> 'velocidad_max')::integer, puntos = v_pts, ancho_m = coalesce(nullif(d ->> 'ancho_m', '')::integer, ancho_m),
               orden = coalesce(nullif(d ->> 'orden', '')::integer, orden), documento = nullif(btrim(coalesce(d ->> 'documento', documento, '')), ''),
               observacion = nullif(btrim(coalesce(d ->> 'observacion', '')), ''),
               estado = CASE WHEN v_cambia AND estado = 'verificada' THEN 'a_verificar' ELSE estado END,
               verificada_en = CASE WHEN v_cambia THEN NULL ELSE verificada_en END,
               verificada_por = CASE WHEN v_cambia THEN NULL ELSE verificada_por END,
               actualizado_por = v_usr, actualizado_en = now()
         WHERE id = z.id;
        v_id := z.id;
    END IF;
    RETURN tel.fn_armar_zona_velocidad(v_id);
END $f$;

-- Verificar (o volver a «a verificar») y dar de baja
CREATE OR REPLACE FUNCTION tel.fn_estado_zona_velocidad(p_id bigint, p_estado text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_usr bigint := tel.fn_exigir_zonas();
BEGIN
    IF p_estado NOT IN ('a_verificar', 'verificada', 'inactiva', 'quitar') THEN RAISE EXCEPTION 'Estado desconocido' USING ERRCODE = '22023'; END IF;
    IF p_estado = 'verificada' AND EXISTS (SELECT 1 FROM tel.zona_velocidad WHERE id = p_id AND geom IS NULL) THEN
        RAISE EXCEPTION 'El tramo no tiene el corredor armado: guardalo de nuevo' USING ERRCODE = '55000';
    END IF;
    UPDATE tel.zona_velocidad
       SET estado = CASE WHEN p_estado = 'quitar' THEN estado ELSE p_estado END,
           eliminado_en = CASE WHEN p_estado = 'quitar' THEN now() ELSE eliminado_en END,
           verificada_por = CASE WHEN p_estado = 'verificada' THEN v_usr ELSE verificada_por END,
           verificada_en = CASE WHEN p_estado = 'verificada' THEN now() ELSE verificada_en END,
           actualizado_por = v_usr, actualizado_en = now()
     WHERE id = p_id AND eliminado_en IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'El tramo no existe' USING ERRCODE = 'P0002'; END IF;
END $f$;

-- ---------------------------------------------------------------------------------
-- 2 · Detección: excesos dentro de los tramos verificados
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tel.fn_excesos_zona(p_desde timestamptz, p_hasta timestamptz, p_tolerancia numeric DEFAULT 5, p_lecturas_min integer DEFAULT 2,
                                               p_camion bigint DEFAULT NULL, p_incluir_sin_verificar boolean DEFAULT false)
RETURNS TABLE (camion_id bigint, zona_id bigint, zona text, sentido text, limite integer, desde timestamptz, hasta timestamptz,
               lecturas integer, velocidad_max numeric, velocidad_media numeric, chofer_id bigint, verificada boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    WITH z AS (
        SELECT * FROM tel.zona_velocidad
         WHERE eliminado_en IS NULL AND geom IS NOT NULL AND (estado = 'verificada' OR (p_incluir_sin_verificar AND estado = 'a_verificar'))
    ), en AS (
        SELECT l.camion_id, l.ts, l.velocidad_kmh AS v, l.chofer_id, z.id AS zona_id, z.nombre, z.sentido, z.velocidad_max,
               z.estado = 'verificada' AS verificada,
               CASE WHEN z.camino IS NOT NULL
                    THEN extensions.ST_LineLocatePoint(z.camino, coalesce(l.geom::extensions.geometry,
                         extensions.ST_SetSRID(extensions.ST_MakePoint(l.longitud::float8, l.latitud::float8), 4326))) END AS frac
          FROM tel.lectura l
          JOIN z ON extensions.ST_Intersects(z.geom, coalesce(l.geom::extensions.geometry,
                                              extensions.ST_SetSRID(extensions.ST_MakePoint(l.longitud::float8, l.latitud::float8), 4326)))
         WHERE l.ts > p_desde AND l.ts <= p_hasta AND l.calidad > 0 AND l.latitud IS NOT NULL AND l.longitud IS NOT NULL
           AND l.velocidad_kmh IS NOT NULL AND (p_camion IS NULL OR l.camion_id = p_camion)
    ), saltos AS (
        SELECT en.*, CASE WHEN en.ts - lag(en.ts) OVER w <= interval '20 minutes' THEN 0 ELSE 1 END AS nueva
          FROM en WINDOW w AS (PARTITION BY en.camion_id, en.zona_id ORDER BY en.ts)
    ), pasadas AS (
        -- Una pasada: lecturas seguidas del mismo camión en el mismo tramo (sin huecos de más de 20 minutos)
        SELECT s.*, sum(s.nueva) OVER (PARTITION BY s.camion_id, s.zona_id ORDER BY s.ts) AS pasada FROM saltos s
    ), sentido_ok AS (
        -- En qué sentido iba: lo que avanzó sobre el camino del tramo (dibujado en el sentido de la norma)
        SELECT p.*, (last_value(p.frac) OVER x - first_value(p.frac) OVER x) AS avance
          FROM pasadas p
        WINDOW x AS (PARTITION BY p.camion_id, p.zona_id, p.pasada ORDER BY p.ts ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)
    ), filtradas AS (
        SELECT s.* FROM sentido_ok s
         WHERE s.sentido = 'ambos' OR s.frac IS NULL OR s.avance > 0
    ), marcas AS (
        SELECT f.*, (f.v > f.velocidad_max + p_tolerancia) AS excede,
               row_number() OVER (PARTITION BY f.camion_id, f.zona_id, f.pasada ORDER BY f.ts)
             - row_number() OVER (PARTITION BY f.camion_id, f.zona_id, f.pasada, (f.v > f.velocidad_max + p_tolerancia) ORDER BY f.ts) AS isla
          FROM filtradas f
    ), corridas AS (
        SELECT m.camion_id, m.zona_id, m.pasada, m.isla, count(*) AS n
          FROM marcas m WHERE m.excede GROUP BY 1, 2, 3, 4
    ), con_exceso AS (
        SELECT DISTINCT c.camion_id, c.zona_id, c.pasada FROM corridas c WHERE c.n >= p_lecturas_min
    )
    SELECT m.camion_id, m.zona_id, min(m.nombre), min(m.sentido), min(m.velocidad_max),
           min(m.ts) FILTER (WHERE m.excede), max(m.ts) FILTER (WHERE m.excede),
           (count(*) FILTER (WHERE m.excede))::integer, round(max(m.v), 0), round(avg(m.v) FILTER (WHERE m.excede), 0),
           coalesce(min(m.chofer_id) FILTER (WHERE m.excede), tel.fn_chofer_en(m.camion_id, min(m.ts) FILTER (WHERE m.excede), NULL)),
           bool_and(m.verificada)
      FROM marcas m JOIN con_exceso c ON c.camion_id = m.camion_id AND c.zona_id = m.zona_id AND c.pasada = m.pasada
     GROUP BY m.camion_id, m.zona_id, m.pasada
$f$;

-- Las alertas aceptan la unidad km/h
DO $c$
DECLARE d text := (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'ck_alerta_unidad' AND conrelid = 'ana.alerta'::regclass);
BEGIN
    IF d IS NOT NULL AND position('km_h' IN d) = 0 THEN
        ALTER TABLE ana.alerta DROP CONSTRAINT ck_alerta_unidad;
        ALTER TABLE ana.alerta ADD CONSTRAINT ck_alerta_unidad
            CHECK (unidad IS NULL OR unidad = ANY (ARRAY['l', 'l_100km', 'pct', 'km', 'min', 'h', 'km_h']));
    END IF;
END $c$;

-- La regla (copia el tipo y la categoría del exceso de velocidad general, si existe)
INSERT INTO ana.regla_anomalia (tipo_alerta_id, codigo, version, nombre, descripcion, categoria, severidad_defecto, parametros, alcance, modo, activa, vigente_desde)
SELECT (SELECT r.tipo_alerta_id FROM ana.regla_anomalia r WHERE r.codigo = 'EXCESO_VELOCIDAD' ORDER BY r.version DESC LIMIT 1),
       'EXCESO_VELOCIDAD_ZONA', 1, 'Exceso de velocidad en zona de montaña',
       'Velocidad por encima del máximo de un tramo de la normativa de la empresa (Mendoza – Los Andes – Santiago – San Antonio), en el sentido del tramo.',
       'telemetria', 'media',
       jsonb_build_object('tolerancia_kmh', 5, 'lecturas_min', 2, 'kmh_alta', 20, 'avisar', true),
       'global', coalesce((SELECT r.modo FROM ana.regla_anomalia r WHERE r.codigo = 'EXCESO_VELOCIDAD' ORDER BY r.version DESC LIMIT 1), 'productivo'),
       true, current_date
 WHERE NOT EXISTS (SELECT 1 FROM ana.regla_anomalia WHERE codigo = 'EXCESO_VELOCIDAD_ZONA');

-- El motor de alertas: lo de siempre y después los tramos de montaña
DO $r$
BEGIN
    IF to_regprocedure('ana.fn_ejecutar_motor_sin_zonas(integer)') IS NULL THEN
        ALTER FUNCTION ana.fn_ejecutar_motor(integer) RENAME TO fn_ejecutar_motor_sin_zonas;
    END IF;
END $r$;

CREATE OR REPLACE FUNCTION ana.fn_ejecutar_motor(p_horas integer DEFAULT 48)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE
    v_res jsonb := ana.fn_ejecutar_motor_sin_zonas(p_horas);
    v_hasta timestamptz := now(); v_desde timestamptz := now() - make_interval(hours => greatest(1, least(coalesce(p_horas, 48), 24 * 31)));
    rg ana.regla_anomalia%ROWTYPE; p jsonb; v_ej bigint; v_n integer := 0; v_err text; a record; v_id bigint; v_tel bigint[];
BEGIN
    SELECT r.* INTO rg FROM ana.regla_anomalia r
     WHERE r.codigo = 'EXCESO_VELOCIDAD_ZONA' AND r.activa AND r.eliminado_en IS NULL AND r.vigente_desde <= current_date
       AND (r.vigente_hasta IS NULL OR r.vigente_hasta > current_date)
     ORDER BY r.version DESC LIMIT 1;
    IF rg.id IS NULL THEN RETURN v_res; END IF;
    p := rg.parametros;
    INSERT INTO ana.ejecucion_regla (regla_id, ventana_desde, ventana_hasta) VALUES (rg.id, v_desde, v_hasta) RETURNING id INTO v_ej;
    v_tel := ARRAY(SELECT DISTINCT ur.usuario_id FROM seg.usuario_rol ur JOIN seg.usuario u ON u.id = ur.usuario_id
                    WHERE ur.rol_codigo = 'analista_control' AND u.activo);
    BEGIN
        FOR a IN SELECT x.*, m.patente FROM tel.fn_excesos_zona(v_desde, v_hasta, coalesce((p ->> 'tolerancia_kmh')::numeric, 5),
                                                               coalesce((p ->> 'lecturas_min')::integer, 2)) x
                   JOIN mae.camion m ON m.id = x.camion_id
                  WHERE NOT EXISTS (SELECT 1 FROM ana.alerta al
                                     WHERE al.regla_id = rg.id AND al.camion_id = x.camion_id AND (al.evidencia ->> 'zona_id')::bigint = x.zona_id
                                       AND al.ocurrio_desde <= x.hasta + interval '10 minutes' AND al.ocurrio_hasta >= x.desde - interval '10 minutes') LOOP
            INSERT INTO ana.alerta (regla_id, ejecucion_id, camion_id, chofer_id, ocurrio_desde, ocurrio_hasta, severidad, puntaje,
                                    valor_observado, valor_esperado, unidad, evidencia, huella)
            VALUES (rg.id, v_ej, a.camion_id, (SELECT c.id FROM mae.chofer c WHERE c.id = a.chofer_id), a.desde, a.hasta,
                    CASE WHEN a.velocidad_max >= a.limite + coalesce((p ->> 'kmh_alta')::numeric, 20) THEN 'alta' ELSE 'media' END,
                    least(100, round(100 * (a.velocidad_max - a.limite) / a.limite)), a.velocidad_max, a.limite, 'km_h',
                    jsonb_build_object('zona', a.zona, 'zona_id', a.zona_id, 'sentido', a.sentido, 'limite_kmh', a.limite,
                                       'tolerancia_kmh', coalesce((p ->> 'tolerancia_kmh')::numeric, 5), 'lecturas_exceso', a.lecturas,
                                       'velocidad_max', a.velocidad_max, 'velocidad_media_exceso', a.velocidad_media,
                                       'minutos', round((extract(epoch FROM a.hasta - a.desde) / 60)::numeric, 1)),
                    md5('EVZ|' || a.camion_id || '|' || a.zona_id || '|' || date_trunc('minute', a.desde)))
            ON CONFLICT DO NOTHING
            RETURNING id INTO v_id;
            IF v_id IS NOT NULL THEN
                v_n := v_n + 1;
                IF coalesce((p ->> 'avisar')::boolean, true) AND cardinality(v_tel) > 0 THEN
                    BEGIN
                        PERFORM ops.fn_avisar(v_tel, 'evz:' || v_id, 'Exceso de velocidad en zona de montaña',
                            format('%s%s a %s km/h en «%s» (máximo %s) el %s', a.patente, coalesce(' · ' || ops.fn_nombre_chofer(a.chofer_id), ''),
                                   a.velocidad_max, a.zona, a.limite, to_char(a.desde AT TIME ZONE 'America/Argentina/Mendoza', 'DD/MM HH24:MI')),
                            '/anomalias/alertas', a.velocidad_max >= a.limite + coalesce((p ->> 'kmh_alta')::numeric, 20));
                    EXCEPTION WHEN OTHERS THEN NULL;
                    END;
                END IF;
            END IF;
            v_id := NULL;
        END LOOP;
    EXCEPTION WHEN OTHERS THEN
        v_err := SQLERRM;
    END;
    UPDATE ana.ejecucion_regla
       SET fin_ts = clock_timestamp(), alertas_generadas = v_n, estado = CASE WHEN v_err IS NULL THEN 'completada' ELSE 'fallida' END, error = v_err
     WHERE id = v_ej;
    RETURN v_res || jsonb_build_object('EXCESO_VELOCIDAD_ZONA', coalesce(v_err, v_n::text));
END $f$;

-- El mapa del recorrido en la alerta y el tipo del acta: también para los tramos de montaña
DO $m$
DECLARE d text; n int;
BEGIN
    d := pg_get_functiondef('ana.fn_exceso_velocidad_tramos(bigint)'::regprocedure);
    IF position('EXCESO_VELOCIDAD_ZONA' IN d) = 0 THEN
        n := (length(d) - length(replace(d, 'v_cod IS DISTINCT FROM ''EXCESO_VELOCIDAD''', ''))) / length('v_cod IS DISTINCT FROM ''EXCESO_VELOCIDAD''');
        IF n <> 1 THEN RAISE EXCEPTION 'No encontré el control de la regla en ana.fn_exceso_velocidad_tramos (%)', n; END IF;
        d := replace(d, 'v_cod IS DISTINCT FROM ''EXCESO_VELOCIDAD''', 'coalesce(v_cod NOT IN (''EXCESO_VELOCIDAD'', ''EXCESO_VELOCIDAD_ZONA''), true)');
        d := replace(d, 'AND x.chofer_id IS NOT DISTINCT FROM a.chofer_id', 'AND (v_cod = ''EXCESO_VELOCIDAD_ZONA'' OR x.chofer_id IS NOT DISTINCT FROM a.chofer_id)');
        EXECUTE d;
    END IF;
    d := pg_get_functiondef('ops.fn_crear_acta(jsonb)'::regprocedure);
    IF position('EXCESO_VELOCIDAD_ZONA' IN d) = 0 THEN
        n := (length(d) - length(replace(d, 'WHEN al.regla_codigo = ''EXCESO_VELOCIDAD'' THEN', ''))) / length('WHEN al.regla_codigo = ''EXCESO_VELOCIDAD'' THEN');
        IF n <> 1 THEN RAISE EXCEPTION 'No encontré el tipo del acta en ops.fn_crear_acta (%)', n; END IF;
        -- y la unidad «km_h» se escribe «km/h» en la descripción
        EXECUTE replace(replace(d, 'WHEN al.regla_codigo = ''EXCESO_VELOCIDAD'' THEN', 'WHEN al.regla_codigo IN (''EXCESO_VELOCIDAD'', ''EXCESO_VELOCIDAD_ZONA'') THEN'),
                        'coalesce(al.unidad, '''')', 'replace(coalesce(al.unidad, ''''), ''km_h'', ''km/h'')');
    END IF;
END $m$;

-- El acta de un exceso en un tramo lleva como lugar el nombre del tramo
CREATE OR REPLACE FUNCTION ops.fn_acta_lugar_de_zona()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
BEGIN
    IF NEW.alerta_id IS NOT NULL AND nullif(btrim(coalesce(NEW.lugar, '')), '') IS NULL THEN
        SELECT left(a.evidencia ->> 'zona', 200) INTO NEW.lugar FROM ana.alerta a WHERE a.id = NEW.alerta_id AND (a.evidencia ->> 'zona') IS NOT NULL;
    END IF;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
END $f$;
DROP TRIGGER IF EXISTS tg_15_lugar_zona ON ops.acta_infraccion;
CREATE TRIGGER tg_15_lugar_zona BEFORE INSERT ON ops.acta_infraccion FOR EACH ROW EXECUTE FUNCTION ops.fn_acta_lugar_de_zona();

-- ---------------------------------------------------------------------------------
-- 3 · Los tramos de las dos normativas (puntos APROXIMADOS: quedan «a verificar»)
-- ---------------------------------------------------------------------------------
DO $s$
DECLARE r record; v_id bigint;
BEGIN
    IF EXISTS (SELECT 1 FROM tel.zona_velocidad) THEN RETURN; END IF;
    FOR r IN SELECT * FROM (VALUES
        -- Ida: Argentina → Chile («Normativa … ARG-CL R1»)
        ('ida', 1, 'Transporte → Las Avispas', 70, '[[-32.94108,-68.70279],[-33.00800,-69.03900]]', 120),
        ('ida', 2, 'Las Avispas → Las Cuevas (solo de ida)', 60, '[[-33.00800,-69.03900],[-32.59310,-69.34560],[-32.81280,-70.04780]]', 120),
        ('ida', 3, 'Salida del túnel Cristo Redentor y cobertizo', 20, '[[-32.82420,-70.08270],[-32.82650,-70.09850]]', 120),
        ('ida', 4, 'Cobertizo («falso túnel») → Complejo Los Libertadores', 40, '[[-32.82650,-70.09850],[-32.83100,-70.12050]]', 120),
        ('ida', 5, 'Complejo Los Libertadores → Portillo', 25, '[[-32.83100,-70.12050],[-32.83450,-70.13100]]', 120),
        ('ida', 6, 'Portillo → El Japonés', 20, '[[-32.83450,-70.13100],[-32.85200,-70.14200]]', 120),
        ('ida', 7, 'El Japonés (descanso Vialidad) → curvas Caracoles', 40, '[[-32.85200,-70.14200],[-32.85600,-70.14800]]', 120),
        ('ida', 8, 'Zona Caracoles', 20, '[[-32.85600,-70.14800],[-32.86900,-70.15600]]', 150),
        ('ida', 9, 'Zona El Juncal', 30, '[[-32.86900,-70.15600],[-32.87400,-70.19000]]', 120),
        ('ida', 10, 'El Juncal → peaje Guardia Vieja', 20, '[[-32.87400,-70.19000],[-32.89600,-70.27000]]', 120),
        ('ida', 11, 'Peaje Guardia Vieja → Carabineros', 40, '[[-32.89600,-70.27000],[-32.90000,-70.28500]]', 120),
        ('ida', 12, 'Carabineros → Copec Guardia Vieja', 20, '[[-32.90000,-70.28500],[-32.90600,-70.30000]]', 120),
        ('ida', 13, 'Copec Guardia Vieja → Los Andes', 50, '[[-32.90600,-70.30000],[-32.83380,-70.59720]]', 120),
        ('ida', 14, 'Aduana Los Andes (PTLA) → parqueaderos Messina', 70, '[[-32.86400,-70.62100],[-32.91200,-70.65600]]', 120),
        ('ida', 15, 'Bajada parqueadero Messina', 25, '[[-32.91200,-70.65600],[-32.91500,-70.68800]]', 120),
        ('ida', 16, 'Carretera Bypass', 70, '[[-32.91500,-70.68800],[-32.93000,-70.74000]]', 120),
        ('ida', 17, 'Túnel Chacabuco → monumento Chacabuco (peaje)', 25, '[[-32.98000,-70.71500],[-33.03300,-70.71300]]', 120),
        ('ida', 18, 'Nudo vial ruta 78 (acceso puerto San Antonio)', 10, '[[-33.60400,-71.59500]]', 250),
        ('ida', 19, 'Bajada a puerto San Antonio', 40, '[[-33.60000,-71.60000],[-33.58800,-71.61500]]', 120),
        -- Vuelta: Chile → Argentina («Normativa … CL - ARG»)
        ('vuelta', 1, 'Túnel Chacabuco → ruta E-911 Los Andes', 30, '[[-32.97500,-70.71600],[-32.94500,-70.71500]]', 120),
        ('vuelta', 2, 'Los Andes (vía del tren) → Los Espinos', 40, '[[-32.83380,-70.59720],[-32.87000,-70.45000]]', 120),
        ('vuelta', 3, 'Los Espinos → Los Riecillos', 30, '[[-32.87000,-70.45000],[-32.92200,-70.35700]]', 120),
        ('vuelta', 4, 'Los Riecillos → curva 0 de Caracoles', 40, '[[-32.92200,-70.35700],[-32.86900,-70.15600]]', 120),
        ('vuelta', 5, 'Las Cuevas → Puente del Inca', 40, '[[-32.81280,-70.04780],[-32.82480,-69.91040]]', 120),
        ('vuelta', 6, 'Puente del Inca → Punta de Vacas', 50, '[[-32.82480,-69.91040],[-32.85490,-69.76230]]', 120),
        ('vuelta', 7, 'Bajada hacia Polvaredas', 30, '[[-32.85490,-69.76230],[-32.79290,-69.65240]]', 120),
        ('vuelta', 8, 'Polvaredas → Uspallata → Las Avispas', 60, '[[-32.79290,-69.65240],[-32.59310,-69.34560],[-33.00800,-69.03900]]', 120),
        ('vuelta', 9, 'Las Avispas → ruta 40', 70, '[[-33.00800,-69.03900],[-33.03530,-68.88380]]', 120),
        ('vuelta', 10, 'Ruta 40 → puente Adolfo Calle', 70, '[[-33.03530,-68.88380],[-32.91000,-68.82600]]', 120),
        ('vuelta', 11, 'Puente Adolfo Calle → intersección ruta 7 (predio de la Virgen)', 30, '[[-32.91000,-68.82600],[-32.89800,-68.82900]]', 120),
        ('vuelta', 12, 'Nudo vial intersección ruta 7', 10, '[[-32.89580,-68.82900]]', 250),
        ('vuelta', 13, 'Cóndor → zona del Transporte', 60, '[[-32.90000,-68.78000],[-32.94108,-68.70279]]', 120)
    ) AS t(sentido, orden, nombre, vmax, pts, ancho) LOOP
        INSERT INTO tel.zona_velocidad (nombre, sentido, velocidad_max, puntos, ancho_m, orden, documento, observacion)
        VALUES (r.nombre, r.sentido, r.vmax,
                (SELECT jsonb_agg(jsonb_build_object('lat', (e ->> 0)::numeric, 'lng', (e ->> 1)::numeric) ORDER BY o)
                   FROM jsonb_array_elements(r.pts::jsonb) WITH ORDINALITY x(e, o)),
                r.ancho, r.orden,
                CASE r.sentido WHEN 'ida' THEN 'Normativa velocidades Argentina – Chile (R1)' ELSE 'Normativa velocidades Chile – Argentina' END,
                'Puntos aproximados: revisalos en el mapa antes de verificar.')
        RETURNING id INTO v_id;
        PERFORM tel.fn_armar_zona_velocidad(v_id);
    END LOOP;
END $s$;

-- ---------------------------------------------------------------------------------
-- 4 · Permisos (copiados de una función de telemetría que usa la web)
-- ---------------------------------------------------------------------------------
DO $g$
DECLARE r record;
BEGIN
    REVOKE ALL ON FUNCTION tel.fn_exigir_zonas() FROM PUBLIC;
    REVOKE ALL ON FUNCTION tel.fn_armar_zona_velocidad(bigint) FROM PUBLIC;
    REVOKE ALL ON FUNCTION tel.fn_zonas_velocidad() FROM PUBLIC;
    REVOKE ALL ON FUNCTION tel.fn_guardar_zona_velocidad(bigint, jsonb) FROM PUBLIC;
    REVOKE ALL ON FUNCTION tel.fn_estado_zona_velocidad(bigint, text) FROM PUBLIC;
    REVOKE ALL ON FUNCTION tel.fn_excesos_zona(timestamptz, timestamptz, numeric, integer, bigint, boolean) FROM PUBLIC;
    FOR r IN SELECT DISTINCT a.grantee FROM information_schema.routine_privileges a
              WHERE a.routine_schema = 'tel' AND a.routine_name = 'fn_preparar_pedido_carga' AND a.privilege_type = 'EXECUTE'
                AND a.grantee NOT IN ('PUBLIC', 'postgres') LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION tel.fn_zonas_velocidad() TO %I', r.grantee);
        EXECUTE format('GRANT EXECUTE ON FUNCTION tel.fn_guardar_zona_velocidad(bigint, jsonb) TO %I', r.grantee);
        EXECUTE format('GRANT EXECUTE ON FUNCTION tel.fn_estado_zona_velocidad(bigint, text) TO %I', r.grantee);
        EXECUTE format('GRANT EXECUTE ON FUNCTION tel.fn_excesos_zona(timestamptz, timestamptz, numeric, integer, bigint, boolean) TO %I', r.grantee);
    END LOOP;
    -- El motor lo corre el mismo rol de siempre
    FOR r IN SELECT DISTINCT a.grantee FROM information_schema.routine_privileges a
              WHERE a.routine_schema = 'ana' AND a.routine_name = 'fn_ejecutar_motor_sin_zonas' AND a.privilege_type = 'EXECUTE'
                AND a.grantee NOT IN ('PUBLIC', 'postgres') LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION ana.fn_ejecutar_motor(integer) TO %I', r.grantee);
    END LOOP;
END $g$;
REVOKE ALL ON FUNCTION ana.fn_ejecutar_motor(integer) FROM PUBLIC;

UPDATE ref.parametro SET valor = '307' WHERE codigo = 'web.version_base' AND valor::text::int < 307;

COMMIT;

-- Resultado: los tramos cargados (todos «a verificar») y cómo quedó armado cada uno
SELECT 'migración 307 aplicada' AS que, sentido, orden, nombre, velocidad_max AS max_kmh, km, armado_con, estado
  FROM tel.zona_velocidad WHERE eliminado_en IS NULL ORDER BY sentido, orden;
