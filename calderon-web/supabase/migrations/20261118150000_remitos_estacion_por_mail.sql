-- =============================================================================
-- IronTrack — 277 · Cambio 271 · Remitos de estaciones que llegan por mail (Shell Rodríguez Peña)
-- -----------------------------------------------------------------------------
-- Pedido del usuario (18/11/2026): SOMOS AB (Shell Rodríguez Peña) manda por mail un remito en PDF por cada carga.
-- Que el sistema lo lea solo y lo cuadre con la carga que registró el chofer, sobre todo litros y precio por litro.
-- Decisiones del usuario: si difiere, se PROPONE «Corregir con el remito» (una persona confirma); si no hay carga, se
-- PROPONE «Registrar» con los datos del remito. La casilla es la misma que manda las órdenes (SMTP de operaciones).
--   · Cada 10 minutos (pg_cron «remitos_estaciones») la base le pide a la ruta de Vercel /api/publico/mail/leer los
--     mails nuevos de los remitentes de fue.remitos_remitentes (por IMAP, con la cuenta y la clave del SMTP: la clave
--     sale del Vault en el momento, como el SMTP). Solo trae los PDF; no marca los mails como leídos.
--   · Iris lee cada PDF (fue.fn_remitos_leer / fue.fn_remitos_recoger): número, fecha y hora, patente, chofer, CUIT,
--     producto, litros con sus decimales y precio por litro (final, con impuestos; el «Subtotal» del remito es neto).
--   · fue.fn_remitos_vincular: lo une con la carga del mismo tractor (±6 h) y marca la diferencia de litros (desde
--     0,02 L), de precio por litro o de moneda.
--   · Para resolver (los mismos que resuelven Shell Card): ops.fn_remitos_pendientes / registrar / corregir / descartar
--     y ops.fn_remito_pdf (ver el PDF). Corregir usa fue.fn_editar_carga (reglas, cierres aprobados y auditoría).
--   · La estación se reconoce por el CUIT del remito (fue.remito_estacion_cuit); SOMOS AB queda unida a la estación
--     «Shell Rodriguez Peña». Otra estación se aprende la primera vez que alguien la elige.
-- No cambia cargas por su cuenta. web.version_base = 277.
-- =============================================================================
SET search_path = public, extensions;
BEGIN;

DO $do$
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 276 THEN
        RAISE EXCEPTION 'Falta la migración 276 (comprobantes sin número): aplicarla antes';
    END IF;
    IF to_regclass('fue.remito_estacion') IS NOT NULL THEN
        RAISE EXCEPTION 'La migración 277 (remitos por mail) ya está aplicada';
    END IF;
    IF to_regprocedure('fue.fn_editar_carga(bigint,integer,jsonb,text)') IS NULL OR to_regprocedure('fue.fn_puede_registrar_cargas()') IS NULL
       OR to_regprocedure('fue.fn_chofer_actual(bigint)') IS NULL OR to_regprocedure('ops.fn_http(text,text,jsonb,text,text)') IS NULL
       OR to_regprocedure('ia.fn_json_de_texto(text)') IS NULL OR to_regprocedure('ia.fn_nombre_clave(text)') IS NULL THEN
        RAISE EXCEPTION 'Faltan funciones que esta migración usa (cargas, mail o Iris): avisar antes de seguir';
    END IF;
END $do$;

-- 1 · Parámetros
INSERT INTO ref.parametro (codigo, valor, descripcion) VALUES
 ('fue.remitos_activo', 'true', 'Migración 277: «true» = leer solos los remitos que mandan las estaciones por mail (cada 10 minutos).'),
 ('fue.remitos_remitentes', '["clientesab@somosab.com.ar"]', 'Migración 277: direcciones que mandan remitos de combustible (lista). Solo se leen los PDF de estos mails.'),
 ('fue.remitos_espera_horas', '12', 'Migración 277: horas que se espera a que el chofer registre la carga antes de proponer «Registrar» con el remito.'),
 ('fue.remitos_max_dia', '150', 'Migración 277: tope de remitos que Iris lee por día.'),
 ('mail.imap_servidor', '""', 'Migración 277: servidor IMAP para leer la casilla (vacío = el mismo del SMTP).'),
 ('mail.imap_puerto', '993', 'Migración 277: puerto IMAP (993 = seguro).'),
 ('mail.imap_url', '""', 'Migración 277: dirección de la ruta que lee la casilla (vacío = la del SMTP + /leer).')
ON CONFLICT (codigo) DO NOTHING;

-- 2 · Lo que mandó la estación (una fila por PDF)
CREATE TABLE fue.remito_estacion (
    id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    mensaje_id         text NOT NULL,
    remitente          text NOT NULL,
    asunto             text,
    recibido_en        timestamptz,
    archivo            text NOT NULL,
    pdf                bytea NOT NULL,
    hash               text NOT NULL,
    -- lectura de Iris
    lectura            text NOT NULL DEFAULT 'pendiente' CHECK (lectura IN ('pendiente', 'enviada', 'lista', 'error')),
    request_id         bigint,
    enviado_en         timestamptz,
    leido              jsonb,
    error              text,
    -- lo que dice el remito
    numero             text,
    cuit               text,
    emisor             text,
    fecha_hora         timestamptz,
    patente            text,
    chofer_nombre      text,
    producto           text,
    litros             numeric(12,4),
    precio             numeric(12,4),
    total              numeric(14,2),
    moneda             character(3),
    avisos             text,
    -- cruce
    camion_id          bigint REFERENCES mae.camion (id),
    estacion_id        bigint REFERENCES mae.estacion_servicio (id),
    carga_id           bigint REFERENCES fue.carga_combustible (id),
    difiere            boolean NOT NULL DEFAULT false,
    diferencia         text,
    corregida_en       timestamptz,
    registrada_por_remito boolean NOT NULL DEFAULT false,
    descartada_en      timestamptz,
    descartada_motivo  text,
    resuelta_por       bigint,
    creado_en          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ux_remito_mail_archivo UNIQUE (mensaje_id, archivo)
);
CREATE INDEX ix_remito_lectura ON fue.remito_estacion (lectura) WHERE lectura IN ('pendiente', 'enviada');
CREATE INDEX ix_remito_camion ON fue.remito_estacion (camion_id, fecha_hora);
CREATE INDEX ix_remito_carga ON fue.remito_estacion (carga_id) WHERE carga_id IS NOT NULL;
CREATE INDEX ix_remito_numero ON fue.remito_estacion (cuit, numero) WHERE numero IS NOT NULL;
COMMENT ON TABLE fue.remito_estacion IS 'Migración 277: remitos de combustible que mandan las estaciones por mail, leídos por Iris y cruzados con fue.carga_combustible. No reemplaza la carga.';
REVOKE ALL ON fue.remito_estacion FROM PUBLIC;

CREATE TABLE fue.remito_estacion_cuit (
    cuit        text PRIMARY KEY CHECK (cuit ~ '^\d{11}$'),
    estacion_id bigint NOT NULL REFERENCES mae.estacion_servicio (id),
    creado_en   timestamptz NOT NULL DEFAULT now(),
    creado_por  bigint
);
REVOKE ALL ON fue.remito_estacion_cuit FROM PUBLIC;
-- SOMOS AB (CUIT 30-71608518-6) = Shell Rodríguez Peña
INSERT INTO fue.remito_estacion_cuit (cuit, estacion_id)
SELECT '30716085186', s.id FROM mae.estacion_servicio s
 WHERE s.eliminado_en IS NULL AND s.pais = 'AR' AND s.nombre ILIKE '%rodr%gue%pe%a%'
 ORDER BY s.id LIMIT 1
ON CONFLICT DO NOTHING;

CREATE TABLE fue.remito_consulta (
    id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ok        boolean NOT NULL,
    nuevos    integer NOT NULL DEFAULT 0,
    mensaje   text,
    creado_en timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON fue.remito_consulta FROM PUBLIC;

-- 3 · Traer los mails nuevos (por la ruta de Vercel, con la cuenta del SMTP)
CREATE FUNCTION fue.fn_remitos_traer()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE
    v_url text := nullif(ref.fn_parametro_texto('mail.imap_url', ''), '');
    v_smtp text := nullif(ref.fn_parametro_texto('mail.smtp_url', ''), '');
    v_rem jsonb := coalesce((SELECT valor FROM ref.parametro WHERE codigo = 'fue.remitos_remitentes' AND eliminado_en IS NULL), '[]'::jsonb);
    v_clave text := ops.fn_secreto('mail_smtp_clave');
    v_usuario text := nullif(ref.fn_parametro_texto('mail.smtp_usuario', ''), '');
    v_servidor text := coalesce(nullif(ref.fn_parametro_texto('mail.imap_servidor', ''), ''), nullif(ref.fn_parametro_texto('mail.smtp_servidor', ''), ''));
    h record; v_res jsonb; m jsonb; a jsonb; v_n integer := 0; v_esq text; v_pdf bytea;
BEGIN
    v_url := coalesce(v_url, CASE WHEN v_smtp IS NOT NULL THEN rtrim(v_smtp, '/') || '/leer' END);
    IF v_url IS NULL OR v_clave IS NULL OR v_usuario IS NULL OR v_servidor IS NULL THEN
        INSERT INTO fue.remito_consulta (ok, mensaje) VALUES (false, 'Falta la cuenta de mail (SMTP) o la dirección de la ruta');
        RETURN jsonb_build_object('ok', false, 'mensaje', 'Falta la cuenta de mail (SMTP) o la dirección de la ruta');
    END IF;
    IF jsonb_typeof(v_rem) <> 'array' OR jsonb_array_length(v_rem) = 0 THEN
        RETURN jsonb_build_object('ok', true, 'nuevos', 0, 'mensaje', 'No hay remitentes configurados');
    END IF;
    BEGIN
        SELECT n.nspname INTO v_esq FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'http';
        EXECUTE format('SELECT %I.http_set_curlopt(%L, %L)', v_esq, 'CURLOPT_TIMEOUT', '50');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
        SELECT * INTO h FROM ops.fn_http('POST', v_url, '{}'::jsonb, 'application/json',
            jsonb_build_object('servidor', v_servidor, 'puerto', ref.fn_parametro_num('mail.imap_puerto', 993), 'usuario', v_usuario, 'clave', v_clave,
                               'remitentes', v_rem, 'desde', to_char(now() - interval '3 days', 'YYYY-MM-DD'), 'max', 8,
                               'conocidos', (SELECT coalesce(jsonb_agg(DISTINCT r.mensaje_id), '[]') FROM fue.remito_estacion r WHERE r.creado_en > now() - interval '5 days'))::text);
        v_res := CASE WHEN h.contenido ~ '^\s*\{' THEN h.contenido::jsonb END;
    EXCEPTION WHEN OTHERS THEN
        h := ROW(0, SQLERRM); v_res := NULL;
    END;
    IF h.codigo <> 200 OR NOT coalesce((v_res ->> 'ok')::boolean, false) THEN
        INSERT INTO fue.remito_consulta (ok, mensaje) VALUES (false, left('(' || h.codigo || ') ' || coalesce(v_res ->> 'error', h.contenido, ''), 400));
        RETURN jsonb_build_object('ok', false, 'mensaje', left(coalesce(v_res ->> 'error', h.contenido, ''), 400));
    END IF;
    FOR m IN SELECT * FROM jsonb_array_elements(coalesce(v_res -> 'mensajes', '[]')) LOOP
        FOR a IN SELECT * FROM jsonb_array_elements(coalesce(m -> 'adjuntos', '[]')) LOOP
            CONTINUE WHEN coalesce(a ->> 'base64', '') !~ '^[A-Za-z0-9+/=]+$';
            v_pdf := decode(a ->> 'base64', 'base64');
            CONTINUE WHEN length(v_pdf) > 4000000;
            INSERT INTO fue.remito_estacion (mensaje_id, remitente, asunto, recibido_en, archivo, pdf, hash)
            VALUES (left(m ->> 'id', 300), lower(left(m ->> 'de', 200)), left(m ->> 'asunto', 300), nullif(m ->> 'fecha', '')::timestamptz,
                    left(coalesce(a ->> 'nombre', 'remito.pdf'), 200), v_pdf, encode(digest(v_pdf, 'sha256'), 'hex'))
            ON CONFLICT (mensaje_id, archivo) DO NOTHING;
            IF FOUND THEN v_n := v_n + 1; END IF;
        END LOOP;
    END LOOP;
    INSERT INTO fue.remito_consulta (ok, nuevos, mensaje) VALUES (true, v_n, (v_res ->> 'revisados') || ' mails revisados');
    RETURN jsonb_build_object('ok', true, 'nuevos', v_n);
END $f$;

-- 4 · Iris lee el PDF (pedido sin esperar; la respuesta se recoge en la vuelta siguiente)
CREATE FUNCTION fue.fn_remitos_instrucciones()
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
SELECT 'Es un remito de una estación de servicio de Argentina por combustible cargado a un camión de una empresa de transporte. '
    || 'Devolvé SOLO un objeto JSON, sin texto antes ni después, con estas claves (null si el dato no está o no se lee con seguridad): '
    || '"numero" (número del remito tal cual figura, por ejemplo 0001-00025327), "fecha" (fecha de emisión, AAAA-MM-DD), "hora" (hora de emisión, HH:MM:SS, 24 h), '
    || '"patente" (patente del vehículo, solo letras y números), "chofer" (nombre del chofer), "cuit_emisor" (CUIT de la estación que emite, solo los 11 números), '
    || '"emisor" (nombre de la estación o de la empresa que emite, si figura), '
    || '"renglones" (lista de los renglones del remito, cada uno {"descripcion": texto, "cantidad": número con TODOS sus decimales tal cual figura, por ejemplo 11.992, '
    || '"precio": número de la columna «Precio» (precio por litro), "subtotal": número de la columna «Subtotal», "es_combustible": true si es gasoil, diésel o nafta}), '
    || '"subtotal", "iva", "percepciones", "itc", "tasas", "tasa_vial" (números del pie, si figuran), '
    || '"observacion" (una frase corta si algo no se lee). '
    || 'Números con punto decimal y sin separadores de miles (en el remito «2.609,00» es 2609.00 y «11,9920» es 11.992). No inventes datos: si dudás, poné null.'
$f$;

CREATE FUNCTION fue.fn_remitos_leer(p_max integer DEFAULT 6)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE
    r record; v_req bigint; v_n integer := 0; v_clave text;
    v_modelo text := ref.fn_parametro_texto('ia.asistente_modelo', 'claude-sonnet-4-5');
BEGIN
    IF ia.fn_proveedor() <> 'anthropic' OR to_regproc('net.http_post') IS NULL THEN RETURN 0; END IF;
    EXECUTE $q$SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1 LIMIT 1$q$ INTO v_clave USING ia.fn_nombre_clave('anthropic');
    IF v_clave IS NULL THEN RETURN 0; END IF;
    FOR r IN SELECT id, pdf FROM fue.remito_estacion WHERE lectura = 'pendiente' ORDER BY id LIMIT p_max LOOP
        EXIT WHEN (SELECT count(*) FROM fue.remito_estacion WHERE enviado_en > now() - interval '1 day') >= ref.fn_parametro_num('fue.remitos_max_dia', 150);
        -- El mismo PDF ya leído (reenvío del mail): se copia la lectura
        IF EXISTS (SELECT 1 FROM fue.remito_estacion o WHERE o.hash = (SELECT hash FROM fue.remito_estacion WHERE id = r.id) AND o.id <> r.id AND o.lectura = 'lista') THEN
            UPDATE fue.remito_estacion x SET lectura = 'lista', enviado_en = now(),
                   leido = (SELECT o.leido FROM fue.remito_estacion o WHERE o.hash = x.hash AND o.id <> x.id AND o.lectura = 'lista' ORDER BY o.id LIMIT 1)
             WHERE x.id = r.id;
            PERFORM fue.fn_remito_completar(r.id);
            CONTINUE;
        END IF;
        EXECUTE 'SELECT net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 90000)' INTO v_req
          USING 'https://api.anthropic.com/v1/messages',
                jsonb_build_object('model', v_modelo, 'max_tokens', 1500,
                    'system', 'Sos Iris, la asistente de una empresa de transporte. Leés comprobantes y respondés solo con JSON válido.',
                    'messages', jsonb_build_array(jsonb_build_object('role', 'user', 'content', jsonb_build_array(
                        jsonb_build_object('type', 'document', 'source', jsonb_build_object('type', 'base64', 'media_type', 'application/pdf', 'data', encode(r.pdf, 'base64'))),
                        jsonb_build_object('type', 'text', 'text', fue.fn_remitos_instrucciones()))))),
                jsonb_build_object('content-type', 'application/json', 'x-api-key', v_clave, 'anthropic-version', '2023-06-01');
        UPDATE fue.remito_estacion SET lectura = 'enviada', request_id = v_req, enviado_en = now(), error = NULL WHERE id = r.id;
        v_n := v_n + 1;
    END LOOP;
    RETURN v_n;
END $f$;

-- Pasa lo leído a las columnas (números, fecha y hora de Mendoza, patente, CUIT) y deja avisos
CREATE FUNCTION fue.fn_remito_completar(p_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE
    j jsonb; v_lit numeric; v_pre numeric; v_sub numeric; v_prod text; v_total numeric; v_av text[] := '{}'; v_pie numeric; v_n integer;
    v_fecha date; v_hora time; v_cuit text;
    v_num CONSTANT text := '^-?\d+(\.\d+)?$';
BEGIN
    SELECT leido INTO j FROM fue.remito_estacion WHERE id = p_id;
    IF j IS NULL THEN RETURN; END IF;
    -- Renglones de combustible: litros sumados; precio del primero (si hay varios precios, aviso)
    SELECT sum((x ->> 'cantidad')::numeric), min((x ->> 'precio')::numeric), sum((x ->> 'subtotal')::numeric), string_agg(DISTINCT x ->> 'descripcion', ' + '),
           count(DISTINCT (x ->> 'precio')::numeric)
      INTO v_lit, v_pre, v_sub, v_prod, v_n
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(j -> 'renglones') = 'array' THEN j -> 'renglones' ELSE '[]' END) x
     WHERE coalesce((x ->> 'es_combustible')::boolean, true) AND (x ->> 'cantidad') ~ v_num AND (x ->> 'precio') ~ v_num;
    IF v_n > 1 THEN v_av := v_av || 'el remito tiene renglones de combustible con precios distintos'; END IF;
    IF v_lit IS NULL THEN v_av := v_av || 'Iris no encontró los litros en el remito'; END IF;
    IF v_lit IS NOT NULL AND v_pre IS NOT NULL THEN
        v_total := round(v_lit * v_pre, 2);
        -- El total con impuestos (subtotal + IVA + percepciones + ITC + tasas) tiene que dar litros × precio
        IF (j ->> 'subtotal') ~ v_num THEN
            v_pie := (j ->> 'subtotal')::numeric
                   + coalesce(CASE WHEN (j ->> 'iva') ~ v_num THEN (j ->> 'iva')::numeric END, 0)
                   + coalesce(CASE WHEN (j ->> 'percepciones') ~ v_num THEN (j ->> 'percepciones')::numeric END, 0)
                   + coalesce(CASE WHEN (j ->> 'itc') ~ v_num THEN (j ->> 'itc')::numeric END, 0)
                   + coalesce(CASE WHEN (j ->> 'tasas') ~ v_num THEN (j ->> 'tasas')::numeric END, 0)
                   + coalesce(CASE WHEN (j ->> 'tasa_vial') ~ v_num THEN (j ->> 'tasa_vial')::numeric END, 0);
            IF abs(v_pie - v_total) > greatest(1, v_total * 0.005) THEN
                v_av := v_av || format('litros × precio da %s pero el pie del remito suma %s', v_total, round(v_pie, 2));
            END IF;
        END IF;
    END IF;
    v_fecha := CASE WHEN (j ->> 'fecha') ~ '^\d{4}-\d{2}-\d{2}$' THEN (j ->> 'fecha')::date END;
    v_hora := CASE WHEN (j ->> 'hora') ~ '^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$' THEN (j ->> 'hora')::time END;
    v_cuit := nullif(regexp_replace(coalesce(j ->> 'cuit_emisor', ''), '\D', '', 'g'), '');
    UPDATE fue.remito_estacion SET
        numero = left(nullif(btrim(j ->> 'numero'), ''), 40),
        cuit = CASE WHEN length(v_cuit) = 11 THEN v_cuit END,
        emisor = left(nullif(btrim(j ->> 'emisor'), ''), 120),
        fecha_hora = CASE WHEN v_fecha IS NOT NULL THEN (v_fecha + coalesce(v_hora, time '12:00')) AT TIME ZONE 'America/Argentina/Mendoza' END,
        patente = nullif(upper(regexp_replace(coalesce(j ->> 'patente', ''), '[^A-Za-z0-9]', '', 'g')), ''),
        chofer_nombre = left(nullif(btrim(j ->> 'chofer'), ''), 120),
        producto = left(v_prod, 120),
        litros = v_lit, precio = v_pre, total = v_total, moneda = 'ARS',
        avisos = nullif(array_to_string(v_av || CASE WHEN v_fecha IS NULL THEN ARRAY['Iris no encontró la fecha'] ELSE '{}' END
                                              || CASE WHEN v_hora IS NULL AND v_fecha IS NOT NULL THEN ARRAY['sin hora: se toma el mediodía'] ELSE '{}' END, ' · '), '')
     WHERE id = p_id;
END $f$;

CREATE FUNCTION fue.fn_remitos_recoger()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE r record; v_hay boolean; v_status integer; v_content text; v_err text; v_to boolean; v_body jsonb; v_texto text; v_j jsonb; v_n integer := 0;
BEGIN
    IF to_regclass('net._http_response') IS NULL THEN RETURN 0; END IF;
    FOR r IN SELECT id, request_id, enviado_en FROM fue.remito_estacion WHERE lectura = 'enviada' ORDER BY id LOOP
        v_hay := false; v_status := NULL; v_content := NULL; v_err := NULL; v_to := false;
        EXECUTE 'SELECT true, status_code, content, error_msg, timed_out FROM net._http_response WHERE id = $1'
           INTO v_hay, v_status, v_content, v_err, v_to USING r.request_id;
        IF NOT coalesce(v_hay, false) OR (v_status IS NULL AND v_err IS NULL AND NOT coalesce(v_to, false)) THEN
            -- Sin respuesta después de 30 minutos: se vuelve a pedir
            IF r.enviado_en < now() - interval '30 minutes' THEN
                UPDATE fue.remito_estacion SET lectura = 'pendiente', request_id = NULL WHERE id = r.id;
            END IF;
            CONTINUE;
        END IF;
        IF coalesce(v_to, false) OR v_err IS NOT NULL OR v_status IN (429, 500, 502, 503, 529) THEN
            -- Iris ocupada o sin conexión: se reintenta en la vuelta siguiente
            UPDATE fue.remito_estacion SET lectura = 'pendiente', request_id = NULL,
                   error = 'Iris no respondió (' || coalesce(v_status::text, v_err, 'tardó demasiado') || '): se reintenta' WHERE id = r.id;
            CONTINUE;
        END IF;
        IF v_status <> 200 THEN
            UPDATE fue.remito_estacion SET lectura = 'error', error = 'Iris respondió con un error (' || v_status || ')' || coalesce(': ' || left(v_content, 200), '') WHERE id = r.id;
            CONTINUE;
        END IF;
        BEGIN
            v_body := v_content::jsonb;
            SELECT string_agg(c ->> 'text', '') INTO v_texto FROM jsonb_array_elements(v_body -> 'content') c WHERE c ->> 'type' = 'text';
            v_j := ia.fn_json_de_texto(v_texto);
        EXCEPTION WHEN OTHERS THEN v_j := NULL;
        END;
        IF v_j IS NULL THEN
            UPDATE fue.remito_estacion SET lectura = 'error', error = 'No se entendió la respuesta de Iris' WHERE id = r.id;
            CONTINUE;
        END IF;
        UPDATE fue.remito_estacion SET lectura = 'lista', leido = v_j, error = NULL WHERE id = r.id;
        PERFORM fue.fn_remito_completar(r.id);
        v_n := v_n + 1;
    END LOOP;
    RETURN v_n;
END $f$;

-- 5 · El cruce con las cargas
CREATE FUNCTION fue.fn_remitos_vincular()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE e record; k fue.carga_combustible%ROWTYPE; n integer := 0; v_dif text;
BEGIN
    UPDATE fue.remito_estacion t SET camion_id = c.id
      FROM mae.camion c
     WHERE t.camion_id IS NULL AND t.patente IS NOT NULL AND c.eliminado_en IS NULL
       AND upper(regexp_replace(c.patente, '[^A-Za-z0-9]', '', 'g')) = t.patente;
    UPDATE fue.remito_estacion t SET estacion_id = m.estacion_id
      FROM fue.remito_estacion_cuit m
     WHERE t.estacion_id IS NULL AND t.cuit = m.cuit;
    -- Remito repetido (mismo número y CUIT en otro mail): se descarta solo el nuevo
    UPDATE fue.remito_estacion t SET descartada_en = now(), descartada_motivo = 'Remito repetido: ya llegó en otro mail'
     WHERE t.descartada_en IS NULL AND t.carga_id IS NULL AND t.numero IS NOT NULL
       AND EXISTS (SELECT 1 FROM fue.remito_estacion o WHERE o.id < t.id AND o.numero = t.numero AND o.cuit IS NOT DISTINCT FROM t.cuit AND o.descartada_en IS NULL);
    FOR e IN SELECT * FROM fue.remito_estacion WHERE lectura = 'lista' AND carga_id IS NULL AND camion_id IS NOT NULL AND descartada_en IS NULL
                AND fecha_hora IS NOT NULL AND litros IS NOT NULL AND fecha_hora > now() - interval '60 days' ORDER BY fecha_hora LOOP
        SELECT x.* INTO k FROM fue.carga_combustible x
         WHERE x.camion_id = e.camion_id AND x.eliminado_en IS NULL AND coalesce(x.estado_validacion, '') <> 'anulada'
           AND x.tanque_reefer_id IS NULL AND x.deposito_id IS NULL
           AND x.fecha_hora BETWEEN e.fecha_hora - interval '6 hours' AND e.fecha_hora + interval '6 hours'
           AND (e.estacion_id IS NULL OR x.estacion_id IS NULL OR x.estacion_id = e.estacion_id)
           AND NOT EXISTS (SELECT 1 FROM fue.remito_estacion o WHERE o.carga_id = x.id AND o.descartada_en IS NULL)
         ORDER BY (abs(x.litros - e.litros) <= greatest(2, e.litros * 0.02)) DESC, abs(x.litros - e.litros), abs(extract(epoch FROM x.fecha_hora - e.fecha_hora)) LIMIT 1;
        IF k.id IS NOT NULL THEN
            UPDATE fue.remito_estacion SET carga_id = k.id WHERE id = e.id;
            n := n + 1;
        END IF;
        k := NULL;
    END LOOP;
    -- ¿La carga dice lo mismo que el remito? Litros desde 0,02 L, precio por litro, moneda y estación
    FOR e IN SELECT t.id, t.litros, t.precio, t.estacion_id, x.litros AS k_litros, x.precio_unitario AS k_precio, x.moneda AS k_moneda, x.estacion_id AS k_est
               FROM fue.remito_estacion t JOIN fue.carga_combustible x ON x.id = t.carga_id
              WHERE t.descartada_en IS NULL AND t.fecha_hora > now() - interval '60 days' LOOP
        v_dif := concat_ws(' · ',
            CASE WHEN abs(e.k_litros - round(e.litros, 2)) >= 0.02 THEN format('litros: registrado %s, remito %s', e.k_litros, round(e.litros, 3)) END,
            CASE WHEN e.k_moneda <> 'ARS' THEN format('moneda: registrado %s, remito ARS', e.k_moneda)
                 WHEN e.precio IS NOT NULL AND abs(e.k_precio - e.precio) > 0.01 THEN format('precio por litro: registrado %s, remito %s', round(e.k_precio, 2), round(e.precio, 2)) END,
            CASE WHEN e.estacion_id IS NOT NULL AND e.k_est IS DISTINCT FROM e.estacion_id
                 THEN 'estación: registrada ' || coalesce((SELECT nombre FROM mae.estacion_servicio WHERE id = e.k_est), 'sin estación')
                      || ', remito ' || (SELECT nombre FROM mae.estacion_servicio WHERE id = e.estacion_id) END);
        UPDATE fue.remito_estacion SET difiere = (v_dif <> ''), diferencia = nullif(v_dif, '')
         WHERE id = e.id AND (difiere IS DISTINCT FROM (v_dif <> '') OR diferencia IS DISTINCT FROM nullif(v_dif, ''));
    END LOOP;
    RETURN n;
END $f$;

-- 6 · La vuelta de cada 10 minutos
CREATE FUNCTION fue.fn_remitos_sincronizar()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_traer jsonb; v_rec integer; v_env integer; v_vin integer;
BEGIN
    IF NOT coalesce((SELECT valor::text::boolean FROM ref.parametro WHERE codigo = 'fue.remitos_activo' AND eliminado_en IS NULL), false) THEN
        RETURN jsonb_build_object('activo', false);
    END IF;
    v_rec := fue.fn_remitos_recoger();
    v_traer := fue.fn_remitos_traer();
    v_env := fue.fn_remitos_leer();
    v_vin := fue.fn_remitos_vincular();
    RETURN jsonb_build_object('traer', v_traer, 'leidos', v_rec, 'enviados_a_iris', v_env, 'unidos', v_vin);
END $f$;

-- 7 · Resolver (los mismos que resuelven las cargas de Shell Card)
CREATE FUNCTION fue.fn_remitos_exigir()
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
BEGIN
    IF NOT fue.fn_puede_registrar_cargas() THEN
        RAISE EXCEPTION 'Los remitos de las estaciones los resuelven Adm. de combustible, Base Mendoza o TI' USING ERRCODE = '42501';
    END IF;
END $f$;

CREATE FUNCTION fue.fn_remito_registrar(p_id bigint, p_estacion bigint DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE t fue.remito_estacion%ROWTYPE; v_est bigint; v_id bigint;
BEGIN
    PERFORM fue.fn_remitos_exigir();
    SELECT * INTO t FROM fue.remito_estacion WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Ese remito no existe' USING ERRCODE = 'P0002'; END IF;
    IF t.carga_id IS NOT NULL THEN RAISE EXCEPTION 'Ese remito ya tiene su carga' USING ERRCODE = '55000'; END IF;
    IF t.descartada_en IS NOT NULL THEN RAISE EXCEPTION 'Ese remito fue descartado' USING ERRCODE = '55000'; END IF;
    IF t.lectura <> 'lista' OR t.litros IS NULL OR t.precio IS NULL OR t.fecha_hora IS NULL THEN
        RAISE EXCEPTION 'Iris todavía no leyó bien ese remito (faltan litros, precio o fecha)' USING ERRCODE = '55000';
    END IF;
    IF t.camion_id IS NULL THEN RAISE EXCEPTION 'La patente % no es de un tractor del sistema', coalesce(t.patente, '(sin patente)') USING ERRCODE = '22023'; END IF;
    v_est := coalesce(p_estacion, t.estacion_id);
    IF v_est IS NULL THEN
        RAISE EXCEPTION 'Elegí la estación de servicio (la primera vez; después el sistema la recuerda por el CUIT)' USING ERRCODE = '23502';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM mae.estacion_servicio s WHERE s.id = v_est AND s.eliminado_en IS NULL AND s.pais = 'AR') THEN
        RAISE EXCEPTION 'La estación elegida no existe o no es de Argentina' USING ERRCODE = '22023';
    END IF;
    INSERT INTO fue.carga_combustible (camion_id, chofer_id, estacion_id, fecha_hora, tipo_combustible_id, litros, precio_unitario, moneda,
                                       importe_original, medio_pago, odometro_km, origen_dato, tanque_lleno, es_frontera, motivo_observacion)
    VALUES (t.camion_id, fue.fn_chofer_actual(t.camion_id), v_est, t.fecha_hora, (SELECT tipo_combustible_id FROM mae.camion WHERE id = t.camion_id),
            round(t.litros, 2), t.precio, 'ARS', round(round(t.litros, 2) * t.precio, 2), 'cuenta_corriente', NULL, 'manual', false, false,
            'Remito ' || coalesce(t.numero, '?') || ' de la estación (llegó por mail)')
    RETURNING id INTO v_id;
    IF t.cuit IS NOT NULL THEN
        INSERT INTO fue.remito_estacion_cuit (cuit, estacion_id, creado_por) VALUES (t.cuit, v_est, aud.fn_usuario_actual())
        ON CONFLICT (cuit) DO UPDATE SET estacion_id = EXCLUDED.estacion_id;
    END IF;
    UPDATE fue.remito_estacion SET carga_id = v_id, estacion_id = v_est, registrada_por_remito = true, difiere = false, diferencia = NULL,
           resuelta_por = aud.fn_usuario_actual() WHERE id = p_id;
    RETURN jsonb_build_object('carga_id', v_id);
END $f$;

CREATE FUNCTION fue.fn_remito_una(p_id bigint)
RETURNS SETOF fue.remito_estacion
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$ SELECT * FROM fue.remito_estacion WHERE id = p_id AND fue.fn_puede_registrar_cargas() $f$;

CREATE FUNCTION fue.fn_remito_marcar_corregido(p_id bigint)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
BEGIN
    PERFORM fue.fn_remitos_exigir();
    UPDATE fue.remito_estacion SET corregida_en = now(), resuelta_por = aud.fn_usuario_actual() WHERE id = p_id;
    PERFORM fue.fn_remitos_vincular();
END $f$;

-- Corregir la carga con el remito: usa la edición de cargas de siempre (con el usuario que confirma)
CREATE FUNCTION fue.fn_remito_corregir(p_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE t record; v_ver integer;
BEGIN
    PERFORM fue.fn_remitos_exigir();
    SELECT x.* INTO t FROM fue.fn_remito_una(p_id) x;
    IF t.id IS NULL THEN RAISE EXCEPTION 'Ese remito no existe' USING ERRCODE = 'P0002'; END IF;
    IF t.carga_id IS NULL THEN RAISE EXCEPTION 'Ese remito todavía no tiene carga: registrala primero' USING ERRCODE = '55000'; END IF;
    IF NOT t.difiere THEN RAISE EXCEPTION 'La carga ya coincide con el remito' USING ERRCODE = '55000'; END IF;
    SELECT k.version_fila INTO v_ver FROM fue.carga_combustible k WHERE k.id = t.carga_id;
    PERFORM fue.fn_editar_carga(t.carga_id, v_ver,
                jsonb_strip_nulls(jsonb_build_object('litros', round(t.litros, 2), 'precio_unitario', t.precio, 'moneda', 'ARS',
                                                     'estacion_id', t.estacion_id)),
                'Corregido con el remito ' || coalesce(t.numero, '') || ' de la estación: ' || coalesce(t.diferencia, ''));
    PERFORM fue.fn_remito_marcar_corregido(p_id);
    RETURN jsonb_build_object('carga_id', t.carga_id, 'antes', t.diferencia);
END $f$;

CREATE FUNCTION fue.fn_remito_descartar(p_id bigint, p_motivo text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
BEGIN
    PERFORM fue.fn_remitos_exigir();
    IF length(btrim(coalesce(p_motivo, ''))) < 5 THEN RAISE EXCEPTION 'Escribí por qué no corresponde' USING ERRCODE = '23502'; END IF;
    UPDATE fue.remito_estacion SET descartada_en = now(), descartada_motivo = btrim(p_motivo), resuelta_por = aud.fn_usuario_actual()
     WHERE id = p_id AND descartada_en IS NULL AND (carga_id IS NULL OR difiere OR lectura = 'error');
    IF NOT FOUND THEN RAISE EXCEPTION 'Ese remito no existe, ya coincide con su carga o ya fue descartado' USING ERRCODE = '55000'; END IF;
END $f$;

CREATE FUNCTION fue.fn_remitos_pendientes()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
BEGIN
    IF NOT (fue.fn_puede_registrar_cargas() OR EXISTS (SELECT 1 FROM seg.usuario_rol WHERE usuario_id = aud.fn_usuario_actual() AND rol_codigo = 'gerencia')) THEN
        RAISE EXCEPTION 'Sin permiso para ver los remitos de las estaciones' USING ERRCODE = '42501';
    END IF;
    RETURN jsonb_build_object(
        'puede_resolver', fue.fn_puede_registrar_cargas(),
        'activo', coalesce((SELECT valor::text::boolean FROM ref.parametro WHERE codigo = 'fue.remitos_activo' AND eliminado_en IS NULL), false),
        'ultima_consulta', (SELECT jsonb_build_object('cuando', c.creado_en, 'ok', c.ok, 'mensaje', c.mensaje) FROM fue.remito_consulta c ORDER BY c.id DESC LIMIT 1),
        'coinciden_30_dias', (SELECT count(*) FROM fue.remito_estacion t WHERE t.carga_id IS NOT NULL AND NOT t.difiere AND t.descartada_en IS NULL AND t.fecha_hora > now() - interval '30 days'),
        'leyendo', (SELECT count(*) FROM fue.remito_estacion t WHERE t.lectura IN ('pendiente', 'enviada')),
        'esperando_chofer', (SELECT count(*) FROM fue.remito_estacion t WHERE t.lectura = 'lista' AND t.carga_id IS NULL AND t.descartada_en IS NULL
                                AND t.fecha_hora >= now() - make_interval(hours => ref.fn_parametro_num('fue.remitos_espera_horas', 12)::int)),
        'estaciones', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'nombre', s.nombre) ORDER BY s.nombre), '[]') FROM mae.estacion_servicio s WHERE s.eliminado_en IS NULL AND s.pais = 'AR'),
        'remitos', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                'id', t.id, 'numero', t.numero, 'fecha_hora', t.fecha_hora, 'patente', t.patente, 'es_tractor', t.camion_id IS NOT NULL,
                'chofer', t.chofer_nombre, 'producto', t.producto, 'litros', t.litros, 'precio', t.precio, 'total', t.total, 'moneda', t.moneda,
                'estacion_id', t.estacion_id, 'estacion', (SELECT nombre FROM mae.estacion_servicio WHERE id = t.estacion_id),
                'situacion', CASE WHEN t.lectura = 'error' THEN 'no_se_leyo' WHEN t.carga_id IS NULL THEN 'falta_registrar' ELSE 'difiere' END,
                'carga_id', t.carga_id, 'diferencia', t.diferencia, 'avisos', t.avisos, 'error', t.error, 'archivo', t.archivo)
                ORDER BY coalesce(t.fecha_hora, t.recibido_en, t.creado_en) DESC), '[]')
              FROM fue.remito_estacion t
             WHERE t.descartada_en IS NULL AND coalesce(t.fecha_hora, t.creado_en) > now() - interval '60 days'
               -- Sin carga: recién después de la espera (el chofer registra la carga al cerrar la orden)
               AND (t.lectura = 'error' OR (t.lectura = 'lista' AND (t.difiere OR (t.carga_id IS NULL
                    AND coalesce(t.fecha_hora, t.creado_en) < now() - make_interval(hours => ref.fn_parametro_num('fue.remitos_espera_horas', 12)::int)))))));
END $f$;

-- El PDF del remito, para verlo desde la pantalla
CREATE FUNCTION fue.fn_remito_pdf(p_id bigint)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE t record;
BEGIN
    IF NOT (fue.fn_puede_registrar_cargas() OR EXISTS (SELECT 1 FROM seg.usuario_rol WHERE usuario_id = aud.fn_usuario_actual() AND rol_codigo = 'gerencia')) THEN
        RAISE EXCEPTION 'Sin permiso para ver los remitos de las estaciones' USING ERRCODE = '42501';
    END IF;
    SELECT archivo, pdf INTO t FROM fue.remito_estacion WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Ese remito no existe' USING ERRCODE = 'P0002'; END IF;
    RETURN jsonb_build_object('nombre', t.archivo, 'base64', encode(t.pdf, 'base64'));
END $f$;

-- Lo que llama la web
CREATE FUNCTION ops.fn_remitos_pendientes() RETURNS jsonb LANGUAGE sql SET search_path TO 'pg_catalog', 'public', 'extensions' AS $f$ SELECT fue.fn_remitos_pendientes() $f$;
CREATE FUNCTION ops.fn_remito_registrar(p_id bigint, p_estacion bigint DEFAULT NULL) RETURNS jsonb LANGUAGE sql SET search_path TO 'pg_catalog', 'public', 'extensions' AS $f$ SELECT fue.fn_remito_registrar(p_id, p_estacion) $f$;
CREATE FUNCTION ops.fn_remito_corregir(p_id bigint) RETURNS jsonb LANGUAGE sql SET search_path TO 'pg_catalog', 'public', 'extensions' AS $f$ SELECT fue.fn_remito_corregir(p_id) $f$;
CREATE FUNCTION ops.fn_remito_descartar(p_id bigint, p_motivo text) RETURNS void LANGUAGE sql SET search_path TO 'pg_catalog', 'public', 'extensions' AS $f$ SELECT fue.fn_remito_descartar(p_id, p_motivo) $f$;
CREATE FUNCTION ops.fn_remito_pdf(p_id bigint) RETURNS jsonb LANGUAGE sql SET search_path TO 'pg_catalog', 'public', 'extensions' AS $f$ SELECT fue.fn_remito_pdf(p_id) $f$;

-- 8 · Permisos: los mismos roles que resuelven las cargas de Shell Card (tc_admin y tc_app); la tarea interna, nadie
DO $do$
DECLARE r record; f text;
BEGIN
    FOREACH f IN ARRAY ARRAY['fue.fn_remitos_traer()', 'fue.fn_remitos_instrucciones()', 'fue.fn_remitos_leer(integer)', 'fue.fn_remito_completar(bigint)',
                             'fue.fn_remitos_recoger()', 'fue.fn_remitos_vincular()', 'fue.fn_remitos_sincronizar()'] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    END LOOP;
    FOREACH f IN ARRAY ARRAY['fue.fn_remitos_exigir()', 'fue.fn_remito_registrar(bigint, bigint)', 'fue.fn_remito_una(bigint)', 'fue.fn_remito_marcar_corregido(bigint)',
                             'fue.fn_remito_corregir(bigint)', 'fue.fn_remito_descartar(bigint, text)', 'fue.fn_remitos_pendientes()', 'fue.fn_remito_pdf(bigint)',
                             'ops.fn_remitos_pendientes()', 'ops.fn_remito_registrar(bigint, bigint)', 'ops.fn_remito_corregir(bigint)',
                             'ops.fn_remito_descartar(bigint, text)', 'ops.fn_remito_pdf(bigint)'] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
        FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('tc_admin', 'tc_app') LOOP
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', f, r.rolname);
        END LOOP;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tc_app') AND NOT has_function_privilege('tc_app', 'ops.fn_remito_registrar(bigint, bigint)', 'EXECUTE') THEN
        RAISE EXCEPTION 'Faltó el permiso de la web';
    END IF;
    -- Si están las de Shell Card, los permisos tienen que ser los mismos
    IF to_regprocedure('ops.fn_enex_pendientes()') IS NOT NULL THEN
        SELECT string_agg(ro.rolname, ', ') INTO f FROM pg_roles ro
         WHERE ro.rolname IN (SELECT rol_bd FROM seg.rol_aplicacion WHERE rol_bd IS NOT NULL)
           AND has_function_privilege(ro.rolname, 'ops.fn_enex_pendientes()', 'EXECUTE')
               IS DISTINCT FROM has_function_privilege(ro.rolname, 'ops.fn_remitos_pendientes()', 'EXECUTE');
        IF f IS NOT NULL THEN RAISE EXCEPTION 'Los permisos de los remitos no quedaron como los de Shell Card para: %', f; END IF;
    END IF;
END $do$;

-- 9 · La tarea de cada 10 minutos
DO $do$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') AND to_regproc('cron.schedule') IS NOT NULL THEN
        PERFORM cron.schedule('remitos_estaciones', '*/10 * * * *', 'SELECT fue.fn_remitos_sincronizar()');
    END IF;
END $do$;

UPDATE ref.parametro SET valor = '277' WHERE codigo = 'web.version_base' AND valor::text::int < 277;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'migración 277 aplicada' AS que, (SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base') AS version_base,
       (SELECT s.nombre FROM fue.remito_estacion_cuit m JOIN mae.estacion_servicio s ON s.id = m.estacion_id WHERE m.cuit = '30716085186') AS somos_ab_es;
