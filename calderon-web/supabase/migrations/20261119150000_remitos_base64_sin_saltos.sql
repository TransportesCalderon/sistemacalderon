-- =============================================================================
-- IronTrack — 280 · Cambio 275 · Remitos de estaciones: Iris no podía leer ningún PDF
-- -----------------------------------------------------------------------------
-- Aviso del usuario (19/11/2026): los 13 remitos de Shell Rodríguez Peña quedaron «Iris no pudo leer este
-- remito… (400) Invalid base64 data».
-- Causa: fue.fn_remitos_leer mandaba el PDF con encode(pdf, 'base64'), que en PostgreSQL corta el texto con un
-- salto de línea cada 76 caracteres; Iris rechaza el base64 con saltos. No es un problema del mail ni de la estación.
--   · fue.fn_remitos_leer y fue.fn_remito_pdf: el base64 va sin saltos de línea.
--   · Los remitos que quedaron con ese error vuelven a «pendiente» para que Iris los lea en la próxima pasada
--     (no toca los descartados ni los que fallaron por otro motivo).
-- web.version_base = 280.
-- =============================================================================
SET search_path = public, extensions;
BEGIN;

DO $do$
DECLARE v_fn regprocedure; v_def text; v_viejo text; v_nuevo text;
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 277 THEN
        RAISE EXCEPTION 'Falta la migración 277 (remitos de estaciones por mail): aplicarla antes';
    END IF;
    IF to_regprocedure('fue.fn_remitos_leer(integer)') IS NULL OR to_regprocedure('fue.fn_remito_pdf(bigint)') IS NULL THEN
        RAISE EXCEPTION 'No encontré las funciones de remitos que se esperan: avisar antes de seguir';
    END IF;
    IF pg_get_functiondef('fue.fn_remitos_leer(integer)'::regprocedure) LIKE '%translate(encode(r.pdf, ''base64'')%' THEN
        RAISE EXCEPTION 'La migración 280 (remitos: base64 sin saltos) ya está aplicada';
    END IF;
    -- Reemplazo por texto exacto: cada uno tiene que aparecer una vez
    FOR v_fn, v_viejo, v_nuevo IN SELECT * FROM (VALUES
        ('fue.fn_remitos_leer(integer)'::regprocedure, 'encode(r.pdf, ''base64'')', 'translate(encode(r.pdf, ''base64''), E''\n\r'', '''')'),
        ('fue.fn_remito_pdf(bigint)'::regprocedure,   'encode(t.pdf, ''base64'')', 'translate(encode(t.pdf, ''base64''), E''\n\r'', '''')')) x LOOP
        v_def := pg_get_functiondef(v_fn);
        IF (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo) <> 1 THEN
            RAISE EXCEPTION 'No encontré el texto esperado en %: avisar antes de seguir', v_fn;
        END IF;
        EXECUTE replace(v_def, v_viejo, v_nuevo);
    END LOOP;
END $do$;

-- Los que fallaron por esto se vuelven a leer
UPDATE fue.remito_estacion SET lectura = 'pendiente', request_id = NULL, error = NULL
 WHERE lectura = 'error' AND error LIKE '%Invalid base64%' AND descartada_en IS NULL;

UPDATE ref.parametro SET valor = '280' WHERE codigo = 'web.version_base' AND valor::text::int < 280;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'migración 280 aplicada' AS que, (SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base') AS version_base,
       (SELECT count(*) FROM fue.remito_estacion WHERE lectura = 'pendiente') AS remitos_para_leer_de_nuevo;
