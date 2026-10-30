-- =============================================================================
-- IronTrack — 131 · Iris elige sola un modelo vigente de Anthropic
-- -----------------------------------------------------------------------------
-- Falla (30/10/2026): Iris respondía «El modelo configurado no existe». El nombre del modelo
-- (parámetro ia.asistente_modelo) ya no está habilitado en la cuenta de Anthropic.
-- Arreglo: cuando Anthropic responde 404 (modelo inexistente), la base le pide la lista de
-- modelos de la cuenta (GET /v1/models, con la misma clave de Vault y la extensión http),
-- elige el Sonnet más nuevo (o el primero de la lista si no hay Sonnet), lo guarda en
-- ia.asistente_modelo y vuelve a mandar la pregunta: la persona no tiene que hacer nada.
-- Si no se puede (sin extensión http, sin modelos, o el mismo modelo), el error dice qué
-- modelo falló y el motivo que da Anthropic.
-- web.version_base = 131. No crea datos.
-- =============================================================================
SET search_path = public, extensions;
BEGIN;

DO $do$
BEGIN
    IF position('IronTrack' in pg_get_functiondef('ia.fn_instrucciones_asistente()'::regprocedure)) = 0 THEN
        RAISE EXCEPTION 'Falta la migración 130 (115_irontrack.sql): aplicarla antes';
    END IF;
END $do$;

-- Modelos habilitados en la cuenta (los más nuevos primero, como los devuelve Anthropic). Interna.
CREATE OR REPLACE FUNCTION ia.fn_api_modelos()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions AS $$
DECLARE v_clave text; v_status integer; v_cont text;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'http_get') THEN
        RAISE EXCEPTION 'Falta la extensión http en Supabase (Database > Extensions > http)' USING ERRCODE = '55000';
    END IF;
    EXECUTE $q$SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anthropic_api_key' LIMIT 1$q$ INTO v_clave;
    IF nullif(v_clave, '') IS NULL THEN
        RAISE EXCEPTION 'Falta la clave anthropic_api_key en Vault' USING ERRCODE = '55000';
    END IF;
    EXECUTE $q$SELECT r.status, r.content FROM http(('GET', 'https://api.anthropic.com/v1/models?limit=100',
                    ARRAY[http_header('x-api-key', $1), http_header('anthropic-version', '2023-06-01')], NULL, NULL)::http_request) r$q$
       INTO v_status, v_cont USING v_clave;
    IF v_status <> 200 THEN
        RAISE EXCEPTION 'Anthropic no dio la lista de modelos (HTTP %)', v_status USING ERRCODE = '55000';
    END IF;
    RETURN (SELECT coalesce(jsonb_agg(m ->> 'id' ORDER BY o), '[]') FROM jsonb_array_elements(v_cont::jsonb -> 'data') WITH ORDINALITY x(m, o));
END $$;

-- Si el modelo configurado no existe, elige uno vigente y lo guarda. Devuelve el nuevo (o NULL si no cambió).
CREATE OR REPLACE FUNCTION ia.fn_modelo_actualizar()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions AS $$
DECLARE v_lista jsonb; v_actual text; v_nuevo text;
BEGIN
    v_actual := (SELECT valor #>> '{}' FROM ref.parametro WHERE codigo = 'ia.asistente_modelo' AND eliminado_en IS NULL);
    BEGIN
        v_lista := ia.fn_api_modelos();
    EXCEPTION WHEN OTHERS THEN
        RETURN NULL;
    END;
    SELECT x INTO v_nuevo FROM jsonb_array_elements_text(v_lista) WITH ORDINALITY y(x, o) WHERE x LIKE 'claude-sonnet%' ORDER BY o LIMIT 1;
    v_nuevo := coalesce(v_nuevo, v_lista ->> 0);
    IF v_nuevo IS NULL OR v_nuevo = v_actual THEN RETURN NULL; END IF;
    UPDATE ref.parametro SET valor = to_jsonb(v_nuevo) WHERE codigo = 'ia.asistente_modelo' AND eliminado_en IS NULL;
    RAISE LOG 'IronTrack · Iris: el modelo % no existe; se cambió a %', v_actual, v_nuevo;
    RETURN v_nuevo;
END $$;

-- El error claro cuando no se pudo arreglar solo. Interna.
CREATE OR REPLACE FUNCTION ia.fn_texto_modelo(p_contenido text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, extensions AS $$
DECLARE v_msg text;
BEGIN
    BEGIN v_msg := p_contenido::jsonb #>> '{error,message}'; EXCEPTION WHEN OTHERS THEN v_msg := NULL; END;
    RETURN 'El modelo «' || coalesce((SELECT valor #>> '{}' FROM ref.parametro WHERE codigo = 'ia.asistente_modelo' AND eliminado_en IS NULL), '?')
        || '» no está disponible en la cuenta de Anthropic' || coalesce(' (' || left(v_msg, 150) || ')', '')
        || '. TI: revisá el parámetro ia.asistente_modelo.';
END $$;

-- Preguntas: con 404, se elige otro modelo y se vuelve a mandar la misma pregunta
DO $do$
DECLARE v text; n text;
BEGIN
    v := pg_get_functiondef('ia.fn_asistente_leer(bigint)'::regprocedure);
    n := replace(v, $a$    ELSIF r.status <> 200 THEN
        v_err := CASE$a$, $a$    ELSIF r.status = 404 AND ia.fn_modelo_actualizar() IS NOT NULL THEN
        -- Migración 131: el modelo no existía; ya se eligió otro vigente: se manda de nuevo
        UPDATE ia.asistente_turno SET request_id = ia.fn_api_enviar(ia.fn_cuerpo_api(t.mensajes)), paso_en = now() WHERE id = p_turno;
        RETURN jsonb_build_object('estado', 'esperando', 'pendientes', '[]'::jsonb);
    ELSIF r.status <> 200 THEN
        v_err := CASE$a$);
    n := replace(n, $a$WHEN r.status = 404 THEN 'El modelo configurado no existe (revisá el parámetro ia.asistente_modelo)'$a$,
                    $a$WHEN r.status = 404 THEN ia.fn_texto_modelo(r.contenido)$a$);
    IF n = v OR position('fn_modelo_actualizar' in n) = 0 OR position('fn_texto_modelo' in n) = 0 THEN
        RAISE EXCEPTION 'No se pudo ajustar ia.fn_asistente_leer (cambió su texto)';
    END IF;
    EXECUTE n;

    -- Informe semanal: elige otro modelo y avisa que se arme de nuevo
    v := pg_get_functiondef('ia.fn_informe_recoger()'::regprocedure);
    n := replace(v, $a$WHEN r.status = 404 THEN 'El modelo configurado no existe (revisá el parámetro ia.asistente_modelo)'$a$,
                    $a$WHEN r.status = 404 THEN CASE WHEN ia.fn_modelo_actualizar() IS NOT NULL THEN 'Se actualizó el modelo de la IA: armalo de nuevo'
                                                ELSE ia.fn_texto_modelo(r.contenido) END$a$);
    IF n = v THEN RAISE EXCEPTION 'No se pudo ajustar ia.fn_informe_recoger (cambió su texto)'; END IF;
    EXECUTE n;
END $do$;

-- Permisos: internas (solo las usan las funciones con permisos de dueño)
DO $do$
DECLARE g text; f text;
BEGIN
    FOREACH f IN ARRAY ARRAY['ia.fn_api_modelos()', 'ia.fn_modelo_actualizar()', 'ia.fn_texto_modelo(text)'] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
        FOREACH g IN ARRAY ARRAY['anon', 'authenticated'] LOOP
            CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = g);
            EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', f, g);
        END LOOP;
        FOR g IN SELECT DISTINCT pg_get_userbyid(p.proowner) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname IN ('fue','ops','tel','ana','fin','ia','mae','ven') AND p.prosecdef LOOP
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', f, g);
        END LOOP;
    END LOOP;
END $do$;

UPDATE ref.parametro SET valor = '131' WHERE codigo = 'web.version_base' AND valor::text::int < 131;

NOTIFY pgrst, 'reload schema';

COMMIT;
