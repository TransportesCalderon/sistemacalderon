-- =============================================================================
-- IronTrack — 286 · Cambio 279 · Horario de manejo: de 5:30 a 22:00 (hora de Mendoza)
-- -----------------------------------------------------------------------------
-- Pedido del usuario (20/11/2026): fuera del horario de manejo, al chofer que anda circulando y a Telemetría les llega
-- un aviso al teléfono para que busque dónde estacionar y pasar la noche; si una hora después sigue manejando, el
-- aviso escala a Gerencia con el chofer y la patente. Habilitar a circular fuera de horario lo pueden hacer solo
-- quienes tengan la marca «Habilita manejo fuera de horario» (Configuración › Usuarios, la maneja TI).
-- Decisiones: hora de Mendoza para todos; toda la franja 22:00–5:30 es fuera de horario (también la madrugada);
-- «circulando» = el GPS marca más de 10 km/h; la habilitación es por tractor y por esa noche, con motivo.
--   · Parámetros: tel.horario_manejo_desde (05:30), tel.horario_manejo_hasta (22:00), tel.fuera_horario_kmh (10),
--     tel.fuera_horario_escalar_min (60) y tel.fuera_horario_activo (true).
--   · seg.usuario.habilita_fuera_horario + seg.fn_habilitan_fuera_horario() / seg.fn_marcar_habilita_fuera_horario()
--     (las maneja TI, como «Autoriza cargas»). Se marca a Andrés Calderón y a Maximiliano Campo si están como usuarios.
--   · tel.fuera_horario: un renglón por tractor y noche (cuándo se lo vio, avisos, escalamiento, si paró).
--   · tel.habilitacion_horario: el permiso de un tractor para una noche, con motivo; se puede anular.
--   · tel.fn_controlar_horario(): cada 10 minutos (pg_cron «horario_de_manejo»). Primera vez que circula fuera de
--     horario → aviso al chofer y a Telemetría. Si sigue (o vuelve a circular) una hora después del aviso → aviso a
--     Gerencia y a quienes habilitan. Si paró 20 minutos, queda «detenido»; si vuelve a circular, se avisa de nuevo.
--     Con habilitación, no avisa.
--   · tel.fn_habilitar_fuera_horario(tractor, motivo) y tel.fn_anular_habilitacion_horario(id, motivo): solo con la
--     marca. Le avisa al chofer y a Telemetría. Vale para la noche en curso (o la de hoy, si se da de día).
--   · tel.fn_fuera_horario(): la pantalla (Telemetría › Seguimiento de viajes): esta noche, quién circula, quién está
--     habilitado y si el usuario puede habilitar.
-- No toca funciones existentes. web.version_base = 286.
-- =============================================================================
SET search_path = public, extensions;
BEGIN;

DO $do$
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 285 THEN
        RAISE EXCEPTION 'Falta la migración 285 (el chofer no pide dinero si no está al día): aplicarla antes';
    END IF;
    IF to_regclass('tel.fuera_horario') IS NOT NULL THEN
        RAISE EXCEPTION 'La migración 286 (horario de manejo) ya está aplicada';
    END IF;
    IF to_regprocedure('ops.fn_avisar(bigint[],text,text,text,text,boolean)') IS NULL OR to_regprocedure('seg.fn_exigir_ti()') IS NULL
       OR to_regprocedure('mae.fn_chofer_de_tractor(bigint,date)') IS NULL OR to_regprocedure('ops.fn_nombre_chofer(bigint)') IS NULL
       OR to_regprocedure('seg.fn_marcar_autoriza_cargas(bigint,boolean)') IS NULL OR to_regprocedure('tel.fn_avisos_tanque_bajo()') IS NULL
       OR to_regclass('tel.lectura') IS NULL THEN
        RAISE EXCEPTION 'Faltan funciones o tablas que esta migración necesita (avisos, usuarios o telemetría)';
    END IF;
END $do$;

-- Copia los permisos de ejecución de una función a otra (los mismos roles)
CREATE FUNCTION pg_temp.fn_copiar_permisos(p_de regprocedure, p_a regprocedure)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE g text;
BEGIN
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', p_a);
    FOR g IN SELECT DISTINCT CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(x.grantee)) END
               FROM pg_proc p, aclexplode(p.proacl) x
              WHERE p.oid = p_de AND x.privilege_type = 'EXECUTE' LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %s', p_a, g);
    END LOOP;
    IF (SELECT proacl FROM pg_proc WHERE oid = p_de) IS NULL THEN
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', p_a);
    END IF;
END $fn$;

-- 1 · Parámetros ------------------------------------------------------------------
INSERT INTO ref.parametro (codigo, valor, descripcion) VALUES
 ('tel.horario_manejo_desde', '"05:30"', 'Migración 286: desde qué hora se puede manejar (hora de Mendoza).'),
 ('tel.horario_manejo_hasta', '"22:00"', 'Migración 286: hasta qué hora se puede manejar (hora de Mendoza).'),
 ('tel.fuera_horario_kmh', '10', 'Migración 286: velocidad (km/h) desde la que el tractor cuenta como «circulando».'),
 ('tel.fuera_horario_escalar_min', '60', 'Migración 286: minutos después del primer aviso en que, si sigue manejando, se avisa a Gerencia.'),
 ('tel.fuera_horario_activo', 'true', 'Migración 286: «false» apaga los avisos de manejo fuera de horario.')
ON CONFLICT (codigo) DO NOTHING;

-- La hora de un parámetro «HH:MM» (si está mal escrito, la de siempre)
CREATE FUNCTION tel.fn_hora_parametro(p_codigo text, p_defecto time)
RETURNS time
LANGUAGE plpgsql
STABLE
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
BEGIN
    RETURN coalesce((SELECT btrim(valor #>> '{}')::time FROM ref.parametro WHERE codigo = p_codigo AND eliminado_en IS NULL), p_defecto);
EXCEPTION WHEN OTHERS THEN
    RETURN p_defecto;
END $f$;

-- ¿A qué noche corresponde esta hora? (la noche del 20 va de las 22:00 del 20 a las 5:30 del 21). NULL = dentro del horario.
CREATE FUNCTION tel.fn_noche_manejo(p_ts timestamptz)
RETURNS date
LANGUAGE sql
STABLE
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT CASE WHEN l::time >= tel.fn_hora_parametro('tel.horario_manejo_hasta', '22:00') THEN l::date
                WHEN l::time < tel.fn_hora_parametro('tel.horario_manejo_desde', '05:30') THEN l::date - 1 END
      FROM (SELECT p_ts AT TIME ZONE 'America/Argentina/Mendoza' AS l) x
$f$;
GRANT EXECUTE ON FUNCTION tel.fn_hora_parametro(text, time), tel.fn_noche_manejo(timestamptz) TO PUBLIC;

-- 2 · Quién habilita (lo maneja TI) --------------------------------------------------
ALTER TABLE seg.usuario ADD COLUMN habilita_fuera_horario boolean NOT NULL DEFAULT false;

CREATE FUNCTION seg.fn_habilitan_fuera_horario()
RETURNS bigint[]
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
BEGIN
    PERFORM seg.fn_exigir_ti();
    RETURN coalesce((SELECT array_agg(u.id ORDER BY u.id) FROM seg.usuario u WHERE u.habilita_fuera_horario), '{}');
END $f$;

CREATE FUNCTION seg.fn_marcar_habilita_fuera_horario(p_usuario bigint, p_habilita boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
BEGIN
    PERFORM seg.fn_exigir_ti();
    IF coalesce(p_habilita, false) AND EXISTS (SELECT 1 FROM seg.usuario WHERE id = p_usuario AND chofer_id IS NOT NULL) THEN
        RAISE EXCEPTION 'Un chofer no puede habilitar manejo fuera de horario' USING ERRCODE = '22023';
    END IF;
    UPDATE seg.usuario SET habilita_fuera_horario = coalesce(p_habilita, false) WHERE id = p_usuario;
    IF NOT FOUND THEN RAISE EXCEPTION 'El usuario no existe' USING ERRCODE = 'P0002'; END IF;
END $f$;
SELECT pg_temp.fn_copiar_permisos('seg.fn_autorizan_cargas()', 'seg.fn_habilitan_fuera_horario()');
SELECT pg_temp.fn_copiar_permisos('seg.fn_marcar_autoriza_cargas(bigint,boolean)', 'seg.fn_marcar_habilita_fuera_horario(bigint,boolean)');

-- Los dos que nombró el usuario (si están como usuarios activos y no son choferes)
UPDATE seg.usuario SET habilita_fuera_horario = true
 WHERE activo AND chofer_id IS NULL
   AND (translate(lower(nombre), 'áéíóú', 'aeiou') LIKE '%andres%calderon%' OR translate(lower(nombre), 'áéíóú', 'aeiou') LIKE '%maximiliano%campo%');

-- 3 · Tablas ---------------------------------------------------------------------
CREATE TABLE tel.habilitacion_horario (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    camion_id bigint NOT NULL REFERENCES mae.camion (id),
    noche date NOT NULL,
    motivo text NOT NULL CHECK (length(btrim(motivo)) >= 5),
    creado_por bigint REFERENCES seg.usuario (id),
    creado_en timestamptz NOT NULL DEFAULT now(),
    anulada_en timestamptz,
    anulada_por bigint REFERENCES seg.usuario (id),
    anulada_motivo text
);
CREATE UNIQUE INDEX ux_habilitacion_horario ON tel.habilitacion_horario (camion_id, noche) WHERE anulada_en IS NULL;
COMMENT ON TABLE tel.habilitacion_horario IS 'Migración 286: permiso para que un tractor circule fuera del horario de manejo una noche (22:00 a 5:30).';

CREATE TABLE tel.fuera_horario (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    camion_id bigint NOT NULL REFERENCES mae.camion (id),
    chofer_id bigint,
    noche date NOT NULL,
    desde timestamptz NOT NULL,
    ultimo_ts timestamptz NOT NULL,
    velocidad_kmh numeric,
    latitud numeric,
    longitud numeric,
    avisado_en timestamptz,
    escalado_en timestamptz,
    detenido_en timestamptz,
    veces integer NOT NULL DEFAULT 1,
    avisado_veces integer NOT NULL DEFAULT 0,
    habilitado boolean NOT NULL DEFAULT false,
    creado_en timestamptz NOT NULL DEFAULT now(),
    UNIQUE (camion_id, noche)
);
COMMENT ON TABLE tel.fuera_horario IS 'Migración 286: tractor que circuló fuera del horario de manejo (una fila por tractor y noche) con sus avisos.';
REVOKE ALL ON tel.habilitacion_horario, tel.fuera_horario FROM PUBLIC;

-- 4 · El control de cada 10 minutos ---------------------------------------------------
CREATE FUNCTION tel.fn_controlar_horario()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE
    v_noche date := tel.fn_noche_manejo(now());
    v_kmh numeric := ref.fn_parametro_num('tel.fuera_horario_kmh', 10);
    v_escalar interval := make_interval(mins => ref.fn_parametro_num('tel.fuera_horario_escalar_min', 60)::int);
    v_tel bigint[] := ARRAY(SELECT DISTINCT ur.usuario_id FROM seg.usuario_rol ur JOIN seg.usuario u ON u.id = ur.usuario_id AND u.activo
                             WHERE ur.rol_codigo = 'analista_control');
    v_ger bigint[] := ARRAY(SELECT DISTINCT u.id FROM seg.usuario u WHERE u.activo AND (u.habilita_fuera_horario
                             OR EXISTS (SELECT 1 FROM seg.usuario_rol ur WHERE ur.usuario_id = u.id AND ur.rol_codigo = 'gerencia')));
    v_horario text := to_char(tel.fn_hora_parametro('tel.horario_manejo_desde', '05:30'), 'FMHH24:MI') || ' a '
                      || to_char(tel.fn_hora_parametro('tel.horario_manejo_hasta', '22:00'), 'FMHH24:MI');
    r record; e tel.fuera_horario%ROWTYPE; v_hab boolean; v_cho bigint; v_pat text; v_nom text; v_hora text; n integer := 0;
BEGIN
    IF ref.fn_parametro_texto('tel.fuera_horario_activo', 'true') <> 'true' THEN RETURN 0; END IF;
    IF v_noche IS NULL THEN
        -- Dentro del horario: lo que quedó abierto de la noche se da por terminado
        UPDATE tel.fuera_horario SET detenido_en = ultimo_ts WHERE detenido_en IS NULL;
        RETURN 0;
    END IF;

    FOR r IN SELECT DISTINCT ON (l.camion_id) l.camion_id, l.ts, l.velocidad_kmh, l.latitud, l.longitud, l.chofer_id
               FROM tel.lectura l JOIN mae.camion c ON c.id = l.camion_id AND c.eliminado_en IS NULL
              WHERE l.ts > now() - interval '20 minutes' AND l.ts <= now() + interval '5 minutes'
                AND coalesce(l.calidad, 1) > 0 AND l.velocidad_kmh > v_kmh
                AND tel.fn_noche_manejo(l.ts) = v_noche
              ORDER BY l.camion_id, l.ts DESC LOOP
        v_cho := coalesce(r.chofer_id, mae.fn_chofer_de_tractor(r.camion_id, (r.ts AT TIME ZONE 'America/Argentina/Mendoza')::date));
        v_hab := EXISTS (SELECT 1 FROM tel.habilitacion_horario h WHERE h.camion_id = r.camion_id AND h.noche = v_noche AND h.anulada_en IS NULL);
        v_pat := (SELECT patente FROM mae.camion WHERE id = r.camion_id);
        v_nom := coalesce(ops.fn_nombre_chofer(v_cho), 'Chofer sin identificar');
        v_hora := to_char(r.ts AT TIME ZONE 'America/Argentina/Mendoza', 'HH24:MI');

        SELECT * INTO e FROM tel.fuera_horario WHERE camion_id = r.camion_id AND noche = v_noche FOR UPDATE;
        IF e.id IS NULL THEN
            INSERT INTO tel.fuera_horario (camion_id, chofer_id, noche, desde, ultimo_ts, velocidad_kmh, latitud, longitud, habilitado)
            VALUES (r.camion_id, v_cho, v_noche, r.ts, r.ts, r.velocidad_kmh, r.latitud, r.longitud, v_hab)
            RETURNING * INTO e;
        ELSE
            UPDATE tel.fuera_horario
               SET ultimo_ts = greatest(ultimo_ts, r.ts), velocidad_kmh = r.velocidad_kmh, latitud = r.latitud, longitud = r.longitud,
                   chofer_id = coalesce(v_cho, chofer_id), habilitado = v_hab,
                   veces = veces + CASE WHEN detenido_en IS NOT NULL AND avisado_veces >= veces AND NOT v_hab THEN 1 ELSE 0 END,
                   detenido_en = NULL
             WHERE id = e.id
            RETURNING * INTO e;
        END IF;
        CONTINUE WHEN v_hab;

        -- Primer aviso (o vuelve a circular después de haber parado)
        IF e.avisado_veces < e.veces THEN
            PERFORM ops.fn_avisar(
                ARRAY(SELECT u.id FROM seg.usuario u WHERE u.chofer_id = v_cho AND u.activo),
                'fuera_horario:' || e.id || ':aviso:' || e.veces, 'Fuera del horario de manejo',
                'Son las ' || v_hora || ' y el horario de manejo es de ' || v_horario || '. Buscá un lugar seguro para estacionar y pasar la noche.',
                '/mi-viaje', true);
            PERFORM ops.fn_avisar(
                v_tel, 'fuera_horario:' || e.id || ':tel:' || e.veces, 'Fuera de horario · ' || v_pat,
                v_nom || CASE WHEN e.veces > 1 THEN ' volvió a circular' ELSE ' sigue manejando' END || ' (' || round(r.velocidad_kmh) || ' km/h a las ' || v_hora
                    || '). Se le avisó que busque dónde pernoctar.',
                '/telemetria/seguimiento', true);
            UPDATE tel.fuera_horario SET avisado_en = coalesce(avisado_en, now()), avisado_veces = veces WHERE id = e.id RETURNING * INTO e;
            n := n + 1;
        END IF;

        -- Una hora después del aviso sigue (o volvió a) circular: a Gerencia
        IF e.escalado_en IS NULL AND e.avisado_en <= now() - v_escalar THEN
            PERFORM ops.fn_avisar(
                v_ger, 'fuera_horario:' || e.id || ':gerencia', 'Sigue manejando fuera de horario · ' || v_pat,
                v_nom || ' · tractor ' || v_pat || ' · ' || round(r.velocidad_kmh) || ' km/h a las ' || v_hora || '. Se le avisó a las '
                    || to_char(e.avisado_en AT TIME ZONE 'America/Argentina/Mendoza', 'HH24:MI') || '. Para habilitarlo: Seguimiento de viajes.',
                '/telemetria/seguimiento', true);
            UPDATE tel.fuera_horario SET escalado_en = now() WHERE id = e.id;
            n := n + 1;
        END IF;
        e := NULL;
    END LOOP;

    -- El que hace 20 minutos que no circula: detenido
    UPDATE tel.fuera_horario SET detenido_en = ultimo_ts
     WHERE noche = v_noche AND detenido_en IS NULL AND ultimo_ts < now() - interval '20 minutes';
    RETURN n;
END $f$;
REVOKE ALL ON FUNCTION tel.fn_controlar_horario() FROM PUBLIC;

-- 5 · Habilitar y anular (solo con la marca) ------------------------------------------
CREATE FUNCTION tel.fn_exigir_habilita_horario()
RETURNS bigint
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_usr bigint := aud.fn_usuario_actual();
BEGIN
    IF v_usr IS NULL OR NOT EXISTS (SELECT 1 FROM seg.usuario WHERE id = v_usr AND activo AND habilita_fuera_horario) THEN
        RAISE EXCEPTION 'No estás habilitado para dar permiso de manejo fuera de horario: lo marca TI en Configuración › Usuarios' USING ERRCODE = '42501';
    END IF;
    RETURN v_usr;
END $f$;
REVOKE ALL ON FUNCTION tel.fn_exigir_habilita_horario() FROM PUBLIC;

CREATE FUNCTION tel.fn_habilitar_fuera_horario(p_camion bigint, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_usr bigint := tel.fn_exigir_habilita_horario();
        v_noche date := coalesce(tel.fn_noche_manejo(now()), (now() AT TIME ZONE 'America/Argentina/Mendoza')::date);
        v_mot text := btrim(coalesce(p_motivo, '')); v_id bigint; v_cho bigint; v_pat text;
BEGIN
    SELECT patente INTO v_pat FROM mae.camion WHERE id = p_camion AND eliminado_en IS NULL;
    IF v_pat IS NULL THEN RAISE EXCEPTION 'Elegí el tractor' USING ERRCODE = '22023'; END IF;
    IF length(v_mot) < 5 THEN RAISE EXCEPTION 'Escribí el motivo (por ejemplo: entrega con turno a primera hora)' USING ERRCODE = '22023'; END IF;
    IF length(v_mot) > 300 THEN RAISE EXCEPTION 'El motivo es muy largo (hasta 300 letras)' USING ERRCODE = '22023'; END IF;
    IF EXISTS (SELECT 1 FROM tel.habilitacion_horario WHERE camion_id = p_camion AND noche = v_noche AND anulada_en IS NULL) THEN
        RAISE EXCEPTION 'El tractor % ya está habilitado esta noche', v_pat USING ERRCODE = '23505';
    END IF;
    INSERT INTO tel.habilitacion_horario (camion_id, noche, motivo, creado_por) VALUES (p_camion, v_noche, v_mot, v_usr) RETURNING id INTO v_id;
    UPDATE tel.fuera_horario SET habilitado = true WHERE camion_id = p_camion AND noche = v_noche;
    v_cho := mae.fn_chofer_de_tractor(p_camion, (now() AT TIME ZONE 'America/Argentina/Mendoza')::date);
    PERFORM ops.fn_avisar(
        ARRAY(SELECT u.id FROM seg.usuario u WHERE u.chofer_id = v_cho AND u.activo),
        'habilitacion_horario:' || v_id, 'Habilitado a manejar esta noche',
        'Podés circular fuera del horario de manejo esta noche (' || v_mot || '). Manejá con cuidado y descansá cuando puedas.',
        '/mi-viaje', false);
    PERFORM ops.fn_avisar(
        ARRAY(SELECT DISTINCT ur.usuario_id FROM seg.usuario_rol ur WHERE ur.rol_codigo = 'analista_control'),
        'habilitacion_horario:' || v_id || ':tel', 'Habilitado fuera de horario · ' || v_pat,
        coalesce(ops.fn_nombre_chofer(v_cho), 'El chofer') || ' puede circular esta noche. Motivo: ' || v_mot
            || '. Habilitó ' || (SELECT nombre FROM seg.usuario WHERE id = v_usr) || '.',
        '/telemetria/seguimiento', false);
    RETURN jsonb_build_object('id', v_id, 'noche', v_noche, 'patente', v_pat);
END $f$;

CREATE FUNCTION tel.fn_anular_habilitacion_horario(p_id bigint, p_motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_usr bigint := tel.fn_exigir_habilita_horario(); h tel.habilitacion_horario%ROWTYPE;
BEGIN
    SELECT * INTO h FROM tel.habilitacion_horario WHERE id = p_id FOR UPDATE;
    IF h.id IS NULL THEN RAISE EXCEPTION 'Esa habilitación no existe' USING ERRCODE = 'P0002'; END IF;
    IF h.anulada_en IS NOT NULL THEN RAISE EXCEPTION 'Esa habilitación ya estaba anulada' USING ERRCODE = '55000'; END IF;
    UPDATE tel.habilitacion_horario SET anulada_en = now(), anulada_por = v_usr, anulada_motivo = nullif(btrim(coalesce(p_motivo, '')), '')
     WHERE id = p_id;
    UPDATE tel.fuera_horario SET habilitado = false WHERE camion_id = h.camion_id AND noche = h.noche;
END $f$;

-- 6 · La pantalla -----------------------------------------------------------------------
CREATE FUNCTION tel.fn_fuera_horario()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_usr bigint := aud.fn_usuario_actual();
        v_ahora date := tel.fn_noche_manejo(now());
        -- De día se muestra la noche que pasó (y se puede habilitar la de hoy)
        v_noche date := coalesce(v_ahora, (now() AT TIME ZONE 'America/Argentina/Mendoza')::date - 1);
        v_proxima date := coalesce(v_ahora, (now() AT TIME ZONE 'America/Argentina/Mendoza')::date);
        v_puede boolean := EXISTS (SELECT 1 FROM seg.usuario WHERE id = v_usr AND activo AND habilita_fuera_horario);
BEGIN
    IF NOT (v_puede OR EXISTS (SELECT 1 FROM seg.usuario_rol WHERE usuario_id = v_usr
                                AND rol_codigo IN ('gerencia', 'operaciones', 'analista_control', 'ti'))) THEN
        RAISE EXCEPTION 'Sin permiso para ver el horario de manejo' USING ERRCODE = '42501';
    END IF;
    RETURN jsonb_build_object(
        'activo', ref.fn_parametro_texto('tel.fuera_horario_activo', 'true') = 'true',
        'desde', to_char(tel.fn_hora_parametro('tel.horario_manejo_desde', '05:30'), 'FMHH24:MI'),
        'hasta', to_char(tel.fn_hora_parametro('tel.horario_manejo_hasta', '22:00'), 'FMHH24:MI'),
        'en_horario', v_ahora IS NULL,
        'noche', v_noche,
        'proxima', v_proxima,
        'puede_habilitar', v_puede,
        'circulando', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                'id', f.id, 'camion_id', f.camion_id, 'patente', c.patente, 'chofer', ops.fn_nombre_chofer(f.chofer_id),
                'desde', f.desde, 'ultimo_ts', f.ultimo_ts, 'velocidad_kmh', f.velocidad_kmh, 'latitud', f.latitud, 'longitud', f.longitud,
                'avisado_en', f.avisado_en, 'escalado_en', f.escalado_en, 'detenido_en', f.detenido_en, 'veces', f.veces, 'habilitado', f.habilitado)
                ORDER BY f.detenido_en IS NOT NULL, f.desde), '[]'::jsonb)
              FROM tel.fuera_horario f JOIN mae.camion c ON c.id = f.camion_id WHERE f.noche = v_noche),
        'habilitados', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                'id', h.id, 'camion_id', h.camion_id, 'patente', c.patente, 'noche', h.noche, 'motivo', h.motivo,
                'por', (SELECT nombre FROM seg.usuario WHERE id = h.creado_por), 'en', h.creado_en,
                'chofer', ops.fn_nombre_chofer(mae.fn_chofer_de_tractor(h.camion_id, h.noche)))
                ORDER BY c.patente), '[]'::jsonb)
              FROM tel.habilitacion_horario h JOIN mae.camion c ON c.id = h.camion_id
             WHERE h.anulada_en IS NULL AND h.noche IN (v_noche, v_proxima)),
        'tractores', CASE WHEN v_puede THEN (SELECT coalesce(jsonb_agg(jsonb_build_object(
                'id', c.id, 'patente', c.patente,
                'chofer', ops.fn_nombre_chofer(mae.fn_chofer_de_tractor(c.id, (now() AT TIME ZONE 'America/Argentina/Mendoza')::date)))
                ORDER BY c.patente), '[]'::jsonb)
              FROM mae.camion c WHERE c.eliminado_en IS NULL) ELSE '[]'::jsonb END);
END $f$;

SELECT pg_temp.fn_copiar_permisos('tel.fn_avisos_tanque_bajo()', 'tel.fn_fuera_horario()');
SELECT pg_temp.fn_copiar_permisos('tel.fn_avisos_tanque_bajo()', 'tel.fn_habilitar_fuera_horario(bigint,text)');
SELECT pg_temp.fn_copiar_permisos('tel.fn_avisos_tanque_bajo()', 'tel.fn_anular_habilitacion_horario(bigint,text)');

-- 7 · La tarea de cada 10 minutos ------------------------------------------------------
DO $do$
BEGIN
    IF to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL THEN
        PERFORM cron.schedule('horario_de_manejo', '*/10 * * * *', 'SELECT tel.fn_controlar_horario()');
    END IF;
END $do$;

UPDATE ref.parametro SET valor = '286' WHERE codigo = 'web.version_base' AND valor::text::int < 286;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'migración 286 aplicada' AS que, (SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base') AS version_base,
       (SELECT string_agg(nombre, ', ' ORDER BY nombre) FROM seg.usuario WHERE habilita_fuera_horario) AS habilitan_fuera_de_horario;
