-- =============================================================================
-- IronTrack — 276 · Cambio 270 · Comprobantes sin número (patente + fecha) y «Iris» en vez de «la IA»
-- -----------------------------------------------------------------------------
-- Pedido del usuario (18/11/2026):
--   1. Hay comprobantes chilenos que no traen número (por ejemplo, el comprobante de salida de un
--      parqueadero: tracto, fecha de entrada, fecha de salida y valor pagado). Hoy quedan como
--      «no se encontró el número del comprobante». En esos casos Iris tiene que controlar que la
--      patente del tractor y la fecha del comprobante no estén en otro gasto.
--        · ia.fn_instrucciones('comprobante_gasto'): Iris también devuelve "patente" (la del
--          tractor o camión, si figura) y, en un comprobante con entrada y salida, la fecha y la
--          hora de salida (la del pago).
--        · ia.fn_normalizar: guarda la patente leída (letras y números, en mayúsculas).
--        · fin.movimiento_fondo_chofer: patente_comprobante y clave_patente_fecha
--          («GCSC96:2026-11-03»), con índice. Nueva verificación 'ia_patente'.
--        · fin.fn_subir_gasto_verificado: si Iris no encontró número pero sí la patente, el gasto
--          queda 'ia_patente' y no se deja cargar si otro gasto vigente ya tiene esa misma patente
--          y fecha (mismo aviso a RRHH y Finanzas que un comprobante repetido).
--        · fin.fn_gastos_por_revisar: devuelve la patente del comprobante.
--   2. Erradicar «la IA»: todos los mensajes de la base dicen «Iris» (completa lo que hizo
--      cargas_hora_del_ticket.sql: también «con IA», «por IA», «asistente de IA»). Solo cambia el
--      texto; no se tocan las instrucciones que se le mandan a Iris.
-- No cambia datos guardados. web.version_base = 276.
-- =============================================================================
SET search_path = public, extensions;
BEGIN;

DO $do$
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 275 THEN
        RAISE EXCEPTION 'Falta la migración 275 (recibos de cobranza): aplicarla antes';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'fin' AND table_name = 'movimiento_fondo_chofer' AND column_name = 'clave_patente_fecha') THEN
        RAISE EXCEPTION 'La migración 276 (comprobantes sin número) ya está aplicada';
    END IF;
END $do$;

-- 1 · Columnas y verificación nueva
ALTER TABLE fin.movimiento_fondo_chofer
    ADD COLUMN patente_comprobante text,
    ADD COLUMN clave_patente_fecha text;
CREATE INDEX ix_ff_clave_patente_fecha ON fin.movimiento_fondo_chofer (clave_patente_fecha) WHERE clave_patente_fecha IS NOT NULL;
ALTER TABLE fin.movimiento_fondo_chofer DROP CONSTRAINT movimiento_fondo_chofer_verificacion_check;
ALTER TABLE fin.movimiento_fondo_chofer ADD CONSTRAINT movimiento_fondo_chofer_verificacion_check
    CHECK (verificacion IN ('ia', 'ia_sin_numero', 'ia_patente', 'sin_ia'));
COMMENT ON COLUMN fin.movimiento_fondo_chofer.clave_patente_fecha IS
    'Migración 276: comprobante sin número (estacionamiento): patente leída por Iris y fecha del comprobante, para no cargarlo dos veces.';

-- 2 · Reemplazos por texto exacto (cada uno tiene que aparecer una vez)
CREATE FUNCTION pg_temp.cambiar(p_fn regprocedure, p_ancla text, p_nuevo text) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE v_def text := pg_get_functiondef(p_fn);
BEGIN
    IF (length(v_def) - length(replace(v_def, p_ancla, ''))) / length(p_ancla) <> 1 THEN
        RAISE EXCEPTION 'No encontré el texto esperado en %: avisar antes de seguir («%»)', p_fn, left(p_ancla, 80);
    END IF;
    EXECUTE replace(v_def, p_ancla, p_nuevo);
END $f$;

-- 2a · Iris lee la patente
SELECT pg_temp.cambiar('ia.fn_instrucciones(text)'::regprocedure,
    '"cuit_rut" (CUIT, RUT, CNPJ o RUC del emisor), "hora" (HH:MM, 24 h), ''',
    '"cuit_rut" (CUIT, RUT, CNPJ o RUC del emisor), "hora" (HH:MM, 24 h), '
    || '"patente" (patente del tractor o camión si figura en el comprobante, por ejemplo «TRACTO» en un estacionamiento o parqueadero; '
    || 'solo letras y números. Si el comprobante tiene fecha de entrada y de salida, en "fecha" y "hora" van las de salida, que es cuando se pagó. '
    || 'Si no tiene número de comprobante, "numero_comprobante" va null: no uses la patente ni la fecha como número), ''');
SELECT pg_temp.cambiar('ia.fn_normalizar(text,jsonb)'::regprocedure,
    '''cuit_rut'', ia.fn_texto(p_crudo -> ''cuit_rut'', 30),',
    '''cuit_rut'', ia.fn_texto(p_crudo -> ''cuit_rut'', 30),' || E'\n'
    || '            -- Migración 276: patente del tractor (comprobantes sin número, como los de estacionamiento)' || E'\n'
    || '            ''patente'', nullif(upper(regexp_replace(coalesce(ia.fn_texto(p_crudo -> ''patente'', 20), ''''), ''[^A-Za-z0-9]'', '''', ''g'')), ''''),');

-- 2b · Al subir el gasto: sin número, se controla patente + fecha
SELECT pg_temp.cambiar('fin.fn_subir_gasto_verificado(text,text,numeric,date,text,text,text,text,text,numeric,numeric,bigint)'::regprocedure,
    'DECLARE v_chofer bigint := ops.fn_exigir_mi_chofer();',
    'DECLARE v_chofer bigint := ops.fn_exigir_mi_chofer(); v_pat text; v_clave_pat text; v_rep bigint;');
SELECT pg_temp.cambiar('fin.fn_subir_gasto_verificado(text,text,numeric,date,text,text,text,text,text,numeric,numeric,bigint)'::regprocedure,
    'v_ver := CASE WHEN fin.fn_clave_nro(v_comp) IS NOT NULL OR fin.fn_clave_nro(v_op) IS NOT NULL THEN ''ia'' ELSE ''ia_sin_numero'' END;',
    'v_ver := CASE WHEN fin.fn_clave_nro(v_comp) IS NOT NULL OR fin.fn_clave_nro(v_op) IS NOT NULL THEN ''ia'' ELSE ''ia_sin_numero'' END;
        -- Migración 276: sin número (por ejemplo, un estacionamiento): Iris controla la patente y la fecha
        IF v_ver = ''ia_sin_numero'' THEN
            v_pat := upper(regexp_replace(coalesce(l.propuesta ->> ''patente'', ''''), ''[^A-Za-z0-9]'', '''', ''g''));
            IF length(v_pat) BETWEEN 5 AND 8 THEN
                v_clave_pat := v_pat || '':'' || to_char(CASE WHEN l.propuesta ->> ''fecha'' ~ ''^\d{4}-\d{2}-\d{2}$''
                                                              THEN (l.propuesta ->> ''fecha'')::date ELSE p_fecha END, ''YYYY-MM-DD'');
                v_ver := ''ia_patente'';
            ELSE
                v_pat := NULL;
            END IF;
        END IF;');
SELECT pg_temp.cambiar('fin.fn_subir_gasto_verificado(text,text,numeric,date,text,text,text,text,text,numeric,numeric,bigint)'::regprocedure,
    'ARRAY[p_hash, l.hash_imagen]);',
    'ARRAY[p_hash, l.hash_imagen]);
    -- Migración 276: comprobante sin número: la misma patente y fecha en otro gasto vigente
    IF r.gasto_id IS NULL AND v_clave_pat IS NOT NULL THEN
        SELECT g.id INTO v_rep FROM fin.movimiento_fondo_chofer g
         WHERE g.tipo = ''gasto'' AND g.estado <> ''anulado'' AND g.eliminado_en IS NULL AND g.clave_patente_fecha = v_clave_pat
         ORDER BY g.id LIMIT 1;
        IF v_rep IS NOT NULL THEN
            SELECT v_rep AS gasto_id, ''la misma patente y fecha''::text AS regla INTO r;
        END IF;
    END IF;');
SELECT pg_temp.cambiar('fin.fn_subir_gasto_verificado(text,text,numeric,date,text,text,text,text,text,numeric,numeric,bigint)'::regprocedure,
    'hash_imagen_ia = l.hash_imagen',
    'hash_imagen_ia = l.hash_imagen, patente_comprobante = v_pat, clave_patente_fecha = v_clave_pat');

-- 2c · La lista para revisar muestra la patente del comprobante
SELECT pg_temp.cambiar('fin.fn_gastos_por_revisar()'::regprocedure,
    '''verificacion'', m.verificacion,',
    '''verificacion'', m.verificacion, ''patente_comprobante'', m.patente_comprobante,');

-- 3 · «la IA» → «Iris» en todos los mensajes de la base
DO $do$
DECLARE f record; v_def text; v_nuevo text; v_n int := 0; v_quedan text;
BEGIN
    FOR f IN
        SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE p.prokind IN ('f', 'p')
           AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'extensions', 'graphql', 'graphql_public', 'pgsodium', 'vault',
                                 'auth', 'storage', 'realtime', 'supabase_functions', 'net', 'cron', 'pgbouncer')
           AND n.nspname NOT LIKE 'pg\_%'
           AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
           AND p.prosrc ~ '\mIA\M'
           AND p.proname NOT LIKE 'fn\_instrucciones%'   -- lo que se le pide a Iris (no son mensajes para la gente)
    LOOP
        v_def := pg_get_functiondef(f.oid);
        v_nuevo := v_def;
        v_nuevo := replace(v_nuevo, 'El asistente de IA está apagado', 'Iris está apagada');
        v_nuevo := replace(v_nuevo, 'El asistente de IA es para', 'Iris es para');
        v_nuevo := replace(v_nuevo, 'El modelo de IA', 'El modelo de Iris');
        v_nuevo := replace(v_nuevo, 'lecturas con IA', 'lecturas de Iris');
        v_nuevo := replace(v_nuevo, '''IA: ''', '''Iris: ''');
        v_nuevo := regexp_replace(v_nuevo, '\m(con|por) IA\M', '\1 Iris', 'g');
        v_nuevo := regexp_replace(v_nuevo, '\m[Ll]a IA\M', 'Iris', 'g');
        IF v_nuevo <> v_def THEN
            EXECUTE v_nuevo;
            v_n := v_n + 1;
        END IF;
    END LOOP;
    SELECT string_agg(n.nspname || '.' || p.proname, ', ') INTO v_quedan
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE p.prosrc ~ '\m[Ll]a IA\M' AND n.nspname NOT LIKE 'pg\_%' AND n.nspname <> 'information_schema'
       AND p.proname NOT LIKE 'fn\_instrucciones%';
    IF v_quedan IS NOT NULL THEN RAISE EXCEPTION 'Todavía dicen «la IA»: %', v_quedan; END IF;
    RAISE NOTICE 'Migración 276: % funciones dicen «Iris» en vez de «la IA»', v_n;
END $do$;

UPDATE ref.parametro SET valor = '276' WHERE codigo = 'web.version_base' AND valor::text::int < 276;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'migración 276 aplicada' AS que, (SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base') AS version_base;
