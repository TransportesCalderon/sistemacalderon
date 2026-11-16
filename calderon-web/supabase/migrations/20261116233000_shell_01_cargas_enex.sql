-- Shell 01 · Cargas de combustible de Shell Card (Enex) dentro de IronTrack
-- NO cambia web.version_base. Necesita Iris 09 aplicada (suma una lectura a Iris).
-- Qué hace: trae de Enex las cargas hechas con las tarjetas (servicio de solo lectura), las guarda aparte
-- y las compara con las cargas que ya están registradas. NO crea ni cambia cargas de combustible.
-- Queda APAGADO hasta que TI cargue la credencial en Vault y prenda el parámetro fue.enex_activo.

BEGIN;

DO $do$
BEGIN
    IF to_regprocedure('ia.fn_lectura_tipo_cambio(jsonb)') IS NULL THEN
        RAISE EXCEPTION 'Primero hay que correr iris_09_tipo_de_cambio.sql (y las anteriores)';
    END IF;
END $do$;

-- 1) Parámetros (la credencial NO va acá: va en Vault con el nombre enex_unique_id)
INSERT INTO ref.parametro (codigo, valor, descripcion) VALUES
 ('fue.enex_activo',  'false', 'Shell 01: «true» para traer solas las cargas de Shell Card (Enex). Antes hay que cargar la credencial en Vault con el nombre enex_unique_id.'),
 ('fue.enex_url',     '"https://www.tarjeta-empresa.cl/BOptsf/services/ClientWS"', 'Shell 01: dirección del servicio de cargas de Enex (confirmar con Enex cuál es para Shell Card Transporte).'),
 ('fue.enex_usuario', '"IronTrack"', 'Shell 01: nombre del sistema que consulta (campo «username» del servicio de Enex).')
ON CONFLICT (codigo) DO NOTHING;

-- 2) Lo que informa Enex, tal cual (una fila por carga)
CREATE TABLE IF NOT EXISTS fue.enex_transaccion (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    trx             text NOT NULL,
    fecha_hora      timestamptz NOT NULL,
    patente         text NOT NULL,
    litros          numeric(10,3) NOT NULL,
    monto_clp       numeric(14,2),
    precio_clp      numeric(12,3),
    producto        text,
    producto_desc   text,
    estacion_codigo text,
    direccion       text,
    ciudad          text,
    latitud         numeric(9,6),
    longitud        numeric(9,6),
    odometro        numeric(10,1),
    nro_documento   text,
    tarjeta_ult4    text,
    camion_id       bigint REFERENCES mae.camion(id),
    carga_id        bigint REFERENCES fue.carga_combustible(id),
    recibido_en     timestamptz NOT NULL DEFAULT now(),
    revisado_en     timestamptz,
    CONSTRAINT ux_enex_trx UNIQUE (trx, fecha_hora, patente)
);
CREATE INDEX IF NOT EXISTS ix_enex_fecha ON fue.enex_transaccion (fecha_hora);
CREATE INDEX IF NOT EXISTS ix_enex_camion ON fue.enex_transaccion (camion_id, fecha_hora);
COMMENT ON TABLE fue.enex_transaccion IS 'Cargas de combustible informadas por Enex (Shell Card). Solo lectura: se comparan con fue.carga_combustible, no la reemplazan. No guarda el documento del conductor.';
REVOKE ALL ON fue.enex_transaccion FROM PUBLIC;

CREATE TABLE IF NOT EXISTS fue.enex_consulta (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fecha       date NOT NULL,
    ok          boolean NOT NULL,
    recibidas   integer NOT NULL DEFAULT 0,
    nuevas      integer NOT NULL DEFAULT 0,
    mensaje     text,
    creado_en   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE fue.enex_consulta IS 'Registro de cada consulta al servicio de Enex (para saber si anda y cuándo fue la última).';
REVOKE ALL ON fue.enex_consulta FROM PUBLIC;

-- 3) Traer las cargas de un día
CREATE OR REPLACE FUNCTION fue.fn_enex_traer(p_fecha date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
    v_id text; v_url text := ref.fn_parametro_texto('fue.enex_url', ''); v_usr text := ref.fn_parametro_texto('fue.enex_usuario', 'IronTrack');
    v_sobre text; v_status integer; v_body text; x xml; v_cod text; v_msg text; n xml; v_rec integer := 0; v_nue integer := 0; v_fila integer;
    v_coord text; v_err text;
    t CONSTANT text := '(xpath(''/*/*[local-name()="%s"]/text()'', $1))[1]::text';
    r record;
BEGIN
    IF p_fecha IS NULL OR p_fecha > (now() AT TIME ZONE 'America/Santiago')::date OR p_fecha < date '2020-01-01' THEN
        RAISE EXCEPTION 'La fecha no es válida' USING ERRCODE = '22023';
    END IF;
    BEGIN
        EXECUTE $q$SELECT max(decrypted_secret) FROM vault.decrypted_secrets WHERE name = 'enex_unique_id'$q$ INTO v_id;
    EXCEPTION WHEN OTHERS THEN v_id := NULL;
    END;
    IF nullif(btrim(v_id), '') IS NULL THEN v_err := 'Falta la credencial de Enex en Vault (nombre: enex_unique_id)';
    ELSIF nullif(btrim(v_url), '') IS NULL THEN v_err := 'Falta el parámetro fue.enex_url';
    END IF;

    IF v_err IS NULL THEN
        v_sobre := '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ws="http://ws.client.enex.bbr.cl/">'
                || '<soapenv:Header/><soapenv:Body><ws:getTrx><requestGetTrx>'
                || xmlelement(name date, to_char(p_fecha, 'YYYY-MM-DD'))::text || xmlelement(name "uniqueID", btrim(v_id))::text
                || xmlelement(name username, v_usr)::text || '<plate></plate>'
                || '</requestGetTrx></ws:getTrx></soapenv:Body></soapenv:Envelope>';
        BEGIN
            BEGIN EXECUTE $q$SELECT http_set_curlopt('CURLOPT_TIMEOUT', '30')$q$; EXCEPTION WHEN OTHERS THEN NULL; END;
            EXECUTE $q$SELECT r.status, r.content FROM http_post($1, $2, 'text/xml; charset=utf-8') r$q$ INTO v_status, v_body
              USING regexp_replace(btrim(v_url), '\?wsdl$', '', 'i'), v_sobre;
        EXCEPTION WHEN OTHERS THEN v_err := 'No se pudo consultar a Enex: ' || SQLERRM;
        END;
    END IF;
    IF v_err IS NULL AND v_status IS DISTINCT FROM 200 THEN
        v_err := format('Enex respondió %s: %s', coalesce(v_status::text, 'nada'), left(regexp_replace(coalesce(v_body, ''), '<[^>]+>', ' ', 'g'), 200));
    END IF;
    IF v_err IS NULL THEN
        BEGIN x := xmlparse(document v_body); EXCEPTION WHEN OTHERS THEN v_err := 'La respuesta de Enex no se entiende'; END;
    END IF;
    IF v_err IS NULL THEN
        v_cod := (xpath('//*[local-name()="returnCode"]/text()', x))[1]::text;
        v_msg := (xpath('//*[local-name()="message"]/text()', x))[1]::text;
        IF v_cod IS DISTINCT FROM '00' THEN v_err := format('Enex devolvió el código %s: %s', coalesce(v_cod, '(vacío)'), coalesce(v_msg, 'sin mensaje')); END IF;
    END IF;
    IF v_err IS NOT NULL THEN
        INSERT INTO fue.enex_consulta (fecha, ok, mensaje) VALUES (p_fecha, false, v_err);
        RETURN jsonb_build_object('ok', false, 'fecha', p_fecha, 'error', v_err);
    END IF;

    FOREACH n IN ARRAY xpath('//*[local-name()="listado"]', x) LOOP
        EXECUTE 'SELECT ' || format(t, 'trx') || ' AS trx, ' || format(t, 'fecha') || ' AS fecha, ' || format(t, 'patente') || ' AS patente, '
             || format(t, 'litros') || ' AS litros, ' || format(t, 'montocargado') || ' AS monto, ' || format(t, 'preciounitario') || ' AS precio, '
             || format(t, 'producto') || ' AS producto, ' || format(t, 'productodescripcion') || ' AS pdesc, ' || format(t, 'estacion') || ' AS estacion, '
             || format(t, 'direccion') || ' AS direccion, ' || format(t, 'ciudad') || ' AS ciudad, ' || format(t, 'coordenadas') || ' AS coord, '
             || format(t, 'odometro') || ' AS odometro, ' || format(t, 'nrodocumento') || ' AS doc, ' || format(t, 'codigoOrpak') || ' AS tarjeta'
          INTO r USING n;
        v_rec := v_rec + 1;
        BEGIN
            v_coord := regexp_replace(coalesce(r.coord, ''), '\s', '', 'g');
            INSERT INTO fue.enex_transaccion (trx, fecha_hora, patente, litros, monto_clp, precio_clp, producto, producto_desc, estacion_codigo,
                                              direccion, ciudad, latitud, longitud, odometro, nro_documento, tarjeta_ult4)
            VALUES (coalesce(nullif(btrim(r.trx), ''), 's/n'), (btrim(r.fecha))::timestamp AT TIME ZONE 'America/Santiago',
                    upper(regexp_replace(coalesce(r.patente, ''), '[^A-Za-z0-9]', '', 'g')), r.litros::numeric, nullif(r.monto, '')::numeric, nullif(r.precio, '')::numeric,
                    left(r.producto, 40), left(r.pdesc, 120), left(r.estacion, 20), left(r.direccion, 200), left(r.ciudad, 80),
                    CASE WHEN v_coord ~ '^-?\d+(\.\d+)?,-?\d+(\.\d+)?$' THEN round(split_part(v_coord, ',', 1)::numeric, 6) END,
                    CASE WHEN v_coord ~ '^-?\d+(\.\d+)?,-?\d+(\.\d+)?$' THEN round(split_part(v_coord, ',', 2)::numeric, 6) END,
                    CASE WHEN r.odometro ~ '^\d+(\.\d+)?$' AND length(r.odometro) <= 9 THEN r.odometro::numeric END, left(r.doc, 30), right(btrim(r.tarjeta), 4))
            ON CONFLICT (trx, fecha_hora, patente) DO NOTHING;
            GET DIAGNOSTICS v_fila = ROW_COUNT;
            v_nue := v_nue + v_fila;
        EXCEPTION WHEN OTHERS THEN
            v_err := coalesce(v_err || ' · ', '') || format('carga %s no se pudo leer (%s)', coalesce(r.trx, '?'), SQLERRM);
        END;
    END LOOP;
    INSERT INTO fue.enex_consulta (fecha, ok, recibidas, nuevas, mensaje) VALUES (p_fecha, true, v_rec, v_nue, left(v_err, 500));
    PERFORM fue.fn_enex_vincular();
    RETURN jsonb_strip_nulls(jsonb_build_object('ok', true, 'fecha', p_fecha, 'recibidas', v_rec, 'nuevas', v_nue, 'avisos', left(v_err, 500)));
END $function$;

-- 4) Comparar con lo registrado: mismo camión, litros parecidos (2 % o 2 L) y hasta 6 horas de diferencia
CREATE OR REPLACE FUNCTION fue.fn_enex_vincular()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE e record; v_carga bigint; n integer := 0;
BEGIN
    UPDATE fue.enex_transaccion t SET camion_id = c.id
      FROM mae.camion c
     WHERE t.camion_id IS NULL AND c.eliminado_en IS NULL AND upper(regexp_replace(c.patente, '[^A-Za-z0-9]', '', 'g')) = t.patente;
    FOR e IN SELECT * FROM fue.enex_transaccion WHERE carga_id IS NULL AND camion_id IS NOT NULL AND fecha_hora > now() - interval '45 days' ORDER BY fecha_hora LOOP
        SELECT k.id INTO v_carga FROM fue.carga_combustible k
         WHERE k.camion_id = e.camion_id AND k.eliminado_en IS NULL AND coalesce(k.estado_validacion, '') <> 'anulada'
           AND abs(k.litros - e.litros) <= greatest(2, e.litros * 0.02)
           AND k.fecha_hora BETWEEN e.fecha_hora - interval '6 hours' AND e.fecha_hora + interval '6 hours'
           AND NOT EXISTS (SELECT 1 FROM fue.enex_transaccion o WHERE o.carga_id = k.id)
         ORDER BY abs(extract(epoch FROM k.fecha_hora - e.fecha_hora)) LIMIT 1;
        IF v_carga IS NOT NULL THEN
            UPDATE fue.enex_transaccion SET carga_id = v_carga, revisado_en = now() WHERE id = e.id;
            n := n + 1;
        END IF;
        v_carga := NULL;
    END LOOP;
    RETURN n;
END $function$;

-- 5) Lo que corre solo cada hora: hoy y ayer (hora de Chile), si está prendido
CREATE OR REPLACE FUNCTION fue.fn_enex_sincronizar()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE v_hoy date := (now() AT TIME ZONE 'America/Santiago')::date;
BEGIN
    IF ref.fn_parametro_texto('fue.enex_activo', 'false') <> 'true' THEN RETURN jsonb_build_object('ok', false, 'error', 'Apagado (parámetro fue.enex_activo)'); END IF;
    RETURN jsonb_build_object('ayer', fue.fn_enex_traer(v_hoy - 1), 'hoy', fue.fn_enex_traer(v_hoy));
END $function$;

REVOKE ALL ON FUNCTION fue.fn_enex_traer(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION fue.fn_enex_vincular() FROM PUBLIC;
REVOKE ALL ON FUNCTION fue.fn_enex_sincronizar() FROM PUBLIC;

DO $do$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') AND to_regproc('cron.schedule') IS NOT NULL THEN
        PERFORM cron.schedule('enex_cargas_shell', '20 * * * *', 'SELECT fue.fn_enex_sincronizar()');
    END IF;
END $do$;

-- 6) Lectura para Iris: las cargas de Shell y cuáles no están registradas
CREATE OR REPLACE FUNCTION ia.fn_lectura_cargas_shell(p_entrada jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
    e jsonb := coalesce(p_entrada, '{}'); v_hoy date := mae.fn_hoy();
    v_desde date := ia.fn_fecha_entrada(e, 'desde', v_hoy - 7); v_hasta date := ia.fn_fecha_entrada(e, 'hasta', v_hoy);
    v_pat text := nullif(upper(regexp_replace(coalesce(e ->> 'patente', ''), '[^A-Za-z0-9]', '', 'g')), '');
    v_solo boolean := coalesce((e ->> 'solo_sin_registrar')::boolean, false); v_ult record; v_res jsonb; v_lista jsonb;
BEGIN
    IF NOT ia.fn_puede_asistente() THEN RAISE EXCEPTION 'Iris es para Gerencia' USING ERRCODE = '42501'; END IF;
    IF v_hasta < v_desde OR v_hasta - v_desde > 92 THEN RAISE EXCEPTION 'Pedí hasta 3 meses' USING ERRCODE = '22023'; END IF;
    SELECT c.creado_en, c.ok, c.mensaje INTO v_ult FROM fue.enex_consulta c ORDER BY c.id DESC LIMIT 1;
    WITH t AS (
        SELECT x.*, (x.fecha_hora AT TIME ZONE 'America/Argentina/Mendoza') AS local,
               CASE WHEN x.carga_id IS NOT NULL THEN 'registrada' WHEN x.camion_id IS NULL THEN 'patente que no es de un tractor' ELSE 'FALTA REGISTRAR' END AS situacion
          FROM fue.enex_transaccion x
         WHERE (x.fecha_hora AT TIME ZONE 'America/Argentina/Mendoza')::date BETWEEN v_desde AND v_hasta AND (v_pat IS NULL OR x.patente = v_pat))
    SELECT jsonb_build_object('cargas', count(*), 'litros', round(coalesce(sum(litros), 0)), 'pagado_clp', round(coalesce(sum(monto_clp), 0)),
                              'precio_promedio_clp', round(sum(monto_clp) / nullif(sum(litros) FILTER (WHERE monto_clp IS NOT NULL), 0)),
                              'registradas', count(*) FILTER (WHERE situacion = 'registrada'),
                              'faltan_registrar', count(*) FILTER (WHERE situacion = 'FALTA REGISTRAR'),
                              'litros_que_faltan_registrar', round(coalesce(sum(litros) FILTER (WHERE situacion = 'FALTA REGISTRAR'), 0)),
                              'de_otras_patentes', count(*) FILTER (WHERE camion_id IS NULL)),
           (SELECT coalesce(jsonb_agg(jsonb_build_object('fecha', to_char(q.local, 'DD/MM HH24:MI'), 'patente', q.patente, 'litros', round(q.litros, 1),
                        'precio_clp', round(q.precio_clp), 'monto_clp', round(q.monto_clp), 'producto', q.producto, 'donde', coalesce(q.direccion, q.ciudad),
                        'documento', q.nro_documento, 'situacion', q.situacion) ORDER BY q.local DESC), '[]')
              FROM (SELECT * FROM t WHERE NOT v_solo OR situacion = 'FALTA REGISTRAR' ORDER BY local DESC LIMIT 40) q)
      INTO v_res, v_lista FROM t;
    RETURN jsonb_strip_nulls(jsonb_build_object(
        'periodo', jsonb_build_object('desde', to_char(v_desde, 'DD/MM/YYYY'), 'hasta', to_char(v_hasta, 'DD/MM/YYYY')),
        'resumen', v_res, 'cargas', v_lista,
        'ultima_consulta_a_enex', CASE WHEN v_ult.creado_en IS NULL THEN 'Todavía no se consultó nunca a Enex (falta prenderlo)'
                                       ELSE to_char(v_ult.creado_en AT TIME ZONE 'America/Argentina/Mendoza', 'DD/MM HH24:MI') || CASE WHEN v_ult.ok THEN ' · bien' ELSE ' · con error: ' || coalesce(v_ult.mensaje, '') END END,
        'como_se_calcula', 'Cargas informadas por Enex (tarjetas Shell Card, solo Chile). «Registrada» = hay una carga del mismo tractor en IronTrack con litros parecidos (2 %) y hasta 6 horas de diferencia. '
                        || '«Falta registrar» = Enex la cobró y en IronTrack no está: hay que cargarla (o revisar si se registró con otra patente u otros litros).'));
END $function$;

INSERT INTO ia.asistente_herramienta (codigo, orden, descripcion, etiqueta, leyendo, pantalla, entrada, activa)
VALUES ('cargas_shell', 33,
        'Cargas de combustible hechas con las tarjetas Shell Card en Chile, tal como las informa Enex (lo que realmente se cobró): fecha, patente, litros, precio, monto, lugar, '
        || 'y si cada una está registrada en IronTrack o FALTA REGISTRAR. Con resumen de litros, pesos y precio promedio. '
        || 'Usala para: qué cargas de Shell faltan registrar, cuánto se cargó con las tarjetas, a qué precio cobró Shell, o para controlar una carga contra lo que cobró Enex.',
        'Cargas Shell Card (Enex)', 'Mirando lo que informó Shell…', '/combustible/conciliacion',
        '{"type": "object", "properties": {
            "desde": {"type": "string", "description": "Primer día, AAAA-MM-DD. Si no se manda: hace 7 días."},
            "hasta": {"type": "string", "description": "Último día, AAAA-MM-DD. Si no se manda: hoy."},
            "patente": {"type": "string", "description": "Solo las de esa patente."},
            "solo_sin_registrar": {"type": "boolean", "description": "true para listar solo las que faltan registrar."}}}'::jsonb, true)
ON CONFLICT (codigo) DO UPDATE
   SET descripcion = EXCLUDED.descripcion, etiqueta = EXCLUDED.etiqueta, leyendo = EXCLUDED.leyendo, pantalla = EXCLUDED.pantalla,
       entrada = EXCLUDED.entrada, activa = true;

-- El despacho de Iris: se agrega la lectura (con ancla sobre la versión de Iris 09)
DO $do$
DECLARE v_def text := pg_get_functiondef('ia.fn_herramienta(text, jsonb)'::regprocedure);
BEGIN
    IF v_def LIKE '%cargas_shell%' THEN RETURN; END IF;
    IF position('''negocio_clientes'', ''tipo_cambio'')' IN v_def) = 0 OR position('ELSE ia.fn_lectura_tipo_cambio(p_entrada) END);' IN v_def) = 0 THEN
        RAISE EXCEPTION 'ia.fn_herramienta no es la que esperaba esta migración (falta Iris 09): avisar antes de seguir';
    END IF;
    v_def := replace(v_def, '''negocio_clientes'', ''tipo_cambio'')', '''negocio_clientes'', ''tipo_cambio'', ''cargas_shell'')');
    v_def := replace(v_def, 'ELSE ia.fn_lectura_tipo_cambio(p_entrada) END);',
                     'WHEN ''cargas_shell'' THEN ia.fn_lectura_cargas_shell(p_entrada)
                    ELSE ia.fn_lectura_tipo_cambio(p_entrada) END);');
    EXECUTE v_def;
END $do$;

REVOKE ALL ON FUNCTION ia.fn_lectura_cargas_shell(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ia.fn_lectura_cargas_shell(jsonb) TO tc_app, tc_admin, tc_lectura;

COMMIT;
