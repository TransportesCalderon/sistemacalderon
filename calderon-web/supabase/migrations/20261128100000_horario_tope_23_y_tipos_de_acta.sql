-- =====================================================================================
-- Migración 389 · Manejar después de las 23 sin permiso es infracción, y más tipos de acta
-- =====================================================================================
-- Pedido (28/11/2026): «lo permitido como máximo es hasta las 23; luego de eso se debe dar un permiso especial, y si no
-- lo hubo, debe ser sancionable. Desde acá, si no se cumplió, debe existir la posibilidad de labrar el acta de infracción.
-- Además, la selección de actas debe ser más amplia: hoy solo permite 3 tipos.»
--
-- 1 · Tipos de acta: catálogo nuevo ops.tipo_acta (los 3 de antes + fuera de horario, ralentí, faltante de combustible,
--     desvío de la ruta, limpieza, documentación, conducta, procedimiento y «otra»). Gerencia, el jefe de Operaciones y TI
--     pueden agregar tipos. ops.acta_infraccion.tipo pasa del CHECK fijo a una FK al catálogo; ops.fn_crear_acta,
--     ops.fn_actas y la liquidación (el texto del renglón ACTA) leen el catálogo.
-- 2 · Horario: de 22:00 a 23:00 sigue siendo aviso (buscá dónde parar). Circular a más de tel.fuera_horario_kmh después de
--     las 23:00 (tel.horario_tope) o antes de las 5:30, con al menos 2 lecturas y sin permiso para esa noche, es
--     INFRACCIÓN: queda marcada en tel.fuera_horario, se avisa a Gerencia, Telemetría y a quienes habilitan, y desde
--     Seguimiento de viajes se labra el acta (tipo «fuera_horario») o, con motivo, se deja sin sanción.
--     tel.fn_marcar_infracciones_horario corre con el control de cada 10 minutos; al aplicar revisa los últimos 30 días.
-- No cambia web.version_base. Se puede correr más de una vez.
-- =====================================================================================
BEGIN;

DO $v$
BEGIN
    IF to_regclass('ops.acta_infraccion') IS NULL OR to_regprocedure('ops.fn_crear_acta(jsonb)') IS NULL
       OR to_regprocedure('ops.fn_actas(date, date, bigint, text)') IS NULL OR to_regprocedure('ops.fn_roles_acta(text)') IS NULL THEN
        RAISE EXCEPTION 'Faltan las actas de infracción (122): avisar antes de seguir';
    END IF;
    IF to_regclass('tel.fuera_horario') IS NULL OR to_regprocedure('tel.fn_fuera_horario()') IS NULL
       OR to_regprocedure('tel.fn_controlar_horario()') IS NULL OR to_regprocedure('tel.fn_habilitar_fuera_horario(bigint, text)') IS NULL THEN
        RAISE EXCEPTION 'Falta el horario de manejo (286): avisar antes de seguir';
    END IF;
END $v$;

-- =====================================================================================
-- 1 · Tipos de acta
-- =====================================================================================
CREATE TABLE IF NOT EXISTS ops.tipo_acta (
    codigo     text PRIMARY KEY,
    nombre     text NOT NULL,
    orden      integer NOT NULL DEFAULT 100,
    activo     boolean NOT NULL DEFAULT true,
    creado_en  timestamptz NOT NULL DEFAULT now(),
    creado_por bigint,
    CONSTRAINT ck_ta_codigo CHECK (codigo ~ '^[a-z][a-z0-9_]{2,40}$'),
    CONSTRAINT ck_ta_nombre CHECK (length(btrim(nombre)) BETWEEN 3 AND 80)
);
COMMENT ON TABLE ops.tipo_acta IS 'Migración 389: los tipos de acta de infracción (antes eran 3 fijos).';
REVOKE ALL ON ops.tipo_acta FROM PUBLIC;
DO $p$ DECLARE g text; BEGIN
    FOR g IN SELECT r.rolname FROM pg_roles r WHERE r.rolname LIKE 'tc\_%' OR r.rolname IN ('authenticated', 'anon') LOOP
        EXECUTE format('REVOKE ALL ON ops.tipo_acta FROM %I', g);
    END LOOP;
END $p$;

INSERT INTO ops.tipo_acta (codigo, nombre, orden) VALUES
    ('consumo_excesivo',     'Consumo excesivo', 10),
    ('danos_unidad',         'Daños en la unidad', 20),
    ('exceso_velocidad',     'Velocidad excesiva', 30),
    ('fuera_horario',        'Manejo fuera de horario sin permiso', 40),
    ('ralenti_excesivo',     'Ralentí excesivo', 50),
    ('faltante_combustible', 'Faltante de combustible', 60),
    ('desvio_ruta',          'Desvío de la ruta asignada', 70),
    ('limpieza',             'Falta de limpieza e higiene de la unidad', 80),
    ('documentacion',        'Documentación o rendición incompleta', 90),
    ('procedimiento',        'Incumplimiento de un procedimiento', 100),
    ('conducta',             'Conducta o trato inadecuado', 110),
    ('otra',                 'Otra infracción', 999)
ON CONFLICT (codigo) DO NOTHING;

-- El tipo del acta pasa del CHECK fijo al catálogo
ALTER TABLE ops.acta_infraccion DROP CONSTRAINT IF EXISTS ck_ai_tipo;
DO $c$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ai_tipo' AND conrelid = 'ops.acta_infraccion'::regclass) THEN
        ALTER TABLE ops.acta_infraccion ADD CONSTRAINT fk_ai_tipo FOREIGN KEY (tipo) REFERENCES ops.tipo_acta(codigo) ON DELETE RESTRICT;
    END IF;
END $c$;

-- Crear acta: cualquier tipo activo del catálogo
DO $do$
DECLARE v_def text := pg_get_functiondef('ops.fn_crear_acta(jsonb)'::regprocedure);
        v_a constant text := $a$IF a.tipo IS NULL OR a.tipo NOT IN ('consumo_excesivo','danos_unidad','exceso_velocidad') THEN
            RAISE EXCEPTION 'Elegí el tipo: consumo excesivo, daños en la unidad o velocidad excesiva' USING ERRCODE = '22023';$a$;
BEGIN
    IF v_def LIKE '%ops.tipo_acta%' THEN RETURN; END IF;
    IF position(v_a IN v_def) = 0 THEN RAISE EXCEPTION 'ops.fn_crear_acta no es la que esperaba esta migración: avisar antes de seguir'; END IF;
    EXECUTE replace(v_def, v_a, $b$IF a.tipo IS NULL OR NOT EXISTS (SELECT 1 FROM ops.tipo_acta t WHERE t.codigo = a.tipo AND t.activo) THEN
            RAISE EXCEPTION 'Elegí el tipo de acta' USING ERRCODE = '22023';$b$);
END $do$;

-- La lista de actas: filtra y cuenta por los tipos del catálogo
DO $do$
DECLARE v_def text := pg_get_functiondef('ops.fn_actas(date, date, bigint, text)'::regprocedure);
        v_a1 constant text := $a$IF p_tipo IS NOT NULL AND p_tipo NOT IN ('consumo_excesivo','danos_unidad','exceso_velocidad') THEN
        RAISE EXCEPTION 'Elegí el tipo: consumo excesivo, daños en la unidad o velocidad excesiva' USING ERRCODE = '22023';$a$;
        v_a2 constant text := $a$FROM unnest(ARRAY['consumo_excesivo','danos_unidad','exceso_velocidad']) t)$a$;
BEGIN
    IF v_def LIKE '%ops.tipo_acta%' THEN RETURN; END IF;
    IF position(v_a1 IN v_def) = 0 OR position(v_a2 IN v_def) = 0 THEN
        RAISE EXCEPTION 'ops.fn_actas no es la que esperaba esta migración: avisar antes de seguir';
    END IF;
    v_def := replace(v_def, v_a1, $b$IF p_tipo IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ops.tipo_acta ta WHERE ta.codigo = p_tipo) THEN
        RAISE EXCEPTION 'Elegí el tipo de acta' USING ERRCODE = '22023';$b$);
    v_def := replace(v_def, v_a2, $b$FROM (SELECT ta.codigo AS t FROM ops.tipo_acta ta ORDER BY ta.orden) t)$b$);
    EXECUTE v_def;
END $do$;

-- Cada acta trae el nombre de su tipo
DO $do$
DECLARE v_def text := pg_get_functiondef('ops.fn_acta_json(bigint)'::regprocedure);
        v_a constant text := $a$'tipo', a.tipo, 'estado', a.estado,$a$;
BEGIN
    IF v_def LIKE '%tipo_nombre%' THEN RETURN; END IF;
    IF position(v_a IN v_def) = 0 THEN RAISE EXCEPTION 'ops.fn_acta_json no es la que esperaba esta migración: avisar antes de seguir'; END IF;
    EXECUTE replace(v_def, v_a, $b$'tipo', a.tipo, 'tipo_nombre', (SELECT ta.nombre FROM ops.tipo_acta ta WHERE ta.codigo = a.tipo), 'estado', a.estado,$b$);
END $do$;

-- La liquidación: el texto del renglón ACTA sale del catálogo (si la función es la esperada)
DO $do$
DECLARE v_def text; v_a constant text := $a$CASE v.tipo WHEN 'consumo_excesivo' THEN 'consumo excesivo' WHEN 'danos_unidad' THEN 'daños en la unidad' ELSE 'velocidad excesiva' END$a$;
BEGIN
    IF to_regprocedure('fin.fn_preparar_liquidacion_sin_pasos(bigint, date)') IS NULL THEN RETURN; END IF;
    v_def := pg_get_functiondef('fin.fn_preparar_liquidacion_sin_pasos(bigint, date)'::regprocedure);
    IF v_def LIKE '%ops.tipo_acta%' THEN RETURN; END IF;
    IF position(v_a IN v_def) = 0 THEN
        RAISE NOTICE 'La liquidación no tiene el texto esperado del tipo de acta: se deja como está';
        RETURN;
    END IF;
    EXECUTE replace(v_def, v_a, $b$coalesce((SELECT lower(ta.nombre) FROM ops.tipo_acta ta WHERE ta.codigo = v.tipo), v.tipo)$b$);
END $do$;

-- Los tipos para la pantalla, y agregar uno nuevo
CREATE OR REPLACE FUNCTION ops.fn_tipos_acta()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
BEGIN
    PERFORM ops.fn_exigir_rol_acta(ops.fn_roles_acta('ver'), 'Sin permiso para ver las actas');
    RETURN jsonb_build_object(
        'tipos', (SELECT coalesce(jsonb_agg(jsonb_build_object('codigo', t.codigo, 'nombre', t.nombre, 'activo', t.activo) ORDER BY t.orden, t.nombre), '[]')
                    FROM ops.tipo_acta t),
        'puede_agregar', ops.fn_rol_acta(ops.fn_roles_acta('monto')));
END $f$;

CREATE OR REPLACE FUNCTION ops.fn_agregar_tipo_acta(p_nombre text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_nombre text := btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g')); v_cod text; n integer := 1;
BEGIN
    PERFORM ops.fn_exigir_rol_acta(ops.fn_roles_acta('monto'), 'Los tipos de acta los agregan Gerencia, el jefe de Operaciones o TI');
    IF length(v_nombre) < 3 OR length(v_nombre) > 80 THEN RAISE EXCEPTION 'Escribí el nombre del tipo (de 3 a 80 letras)' USING ERRCODE = '22023'; END IF;
    IF EXISTS (SELECT 1 FROM ops.tipo_acta WHERE lower(nombre) = lower(v_nombre)) THEN
        RAISE EXCEPTION 'Ya existe el tipo «%»', v_nombre USING ERRCODE = '23505';
    END IF;
    v_cod := left(regexp_replace(lower(translate(v_nombre, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun')), '[^a-z0-9]+', '_', 'g'), 36);
    v_cod := btrim(v_cod, '_');
    IF v_cod !~ '^[a-z]' THEN v_cod := 'tipo_' || v_cod; END IF;
    IF length(v_cod) < 3 THEN v_cod := v_cod || '_acta'; END IF;
    WHILE EXISTS (SELECT 1 FROM ops.tipo_acta WHERE codigo = CASE WHEN n = 1 THEN v_cod ELSE v_cod || '_' || n END) LOOP n := n + 1; END LOOP;
    IF n > 1 THEN v_cod := v_cod || '_' || n; END IF;
    INSERT INTO ops.tipo_acta (codigo, nombre, orden, creado_por)
    VALUES (v_cod, v_nombre, 500 + (SELECT count(*) FROM ops.tipo_acta)::int, aud.fn_usuario_actual());
    RETURN v_cod;
END $f$;

-- =====================================================================================
-- 2 · Fuera de horario: después de las 23 sin permiso es infracción
-- =====================================================================================
INSERT INTO ref.parametro (codigo, valor, descripcion)
SELECT x.codigo, x.valor, x.descripcion
  FROM (VALUES
    ('tel.horario_tope', '"23:00"'::jsonb, 'Migración 389: hora máxima para circular sin permiso (hora de Mendoza). Después, o antes del inicio del horario, es infracción.'),
    ('tel.fuera_horario_infraccion_lecturas', '2'::jsonb, 'Migración 389: lecturas a más de tel.fuera_horario_kmh fuera del tope que hacen falta para marcar la infracción (evita un salto del GPS).')
  ) x(codigo, valor, descripcion)
 WHERE NOT EXISTS (SELECT 1 FROM ref.parametro p WHERE p.codigo = x.codigo AND p.eliminado_en IS NULL);

ALTER TABLE tel.fuera_horario
    ADD COLUMN IF NOT EXISTS infraccion_desde     timestamptz,
    ADD COLUMN IF NOT EXISTS infraccion_hasta     timestamptz,
    ADD COLUMN IF NOT EXISTS infraccion_lecturas  integer,
    ADD COLUMN IF NOT EXISTS infraccion_vmax      numeric,
    ADD COLUMN IF NOT EXISTS infraccion_avisada_en timestamptz,
    ADD COLUMN IF NOT EXISTS acta_id              bigint REFERENCES ops.acta_infraccion(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS sin_sancion_motivo   text,
    ADD COLUMN IF NOT EXISTS sin_sancion_por      bigint,
    ADD COLUMN IF NOT EXISTS sin_sancion_en       timestamptz;
COMMENT ON COLUMN tel.fuera_horario.infraccion_desde IS 'Migración 389: primera lectura circulando después del tope (23:00) o antes del inicio del horario, sin permiso.';

-- La ventana de la infracción de una noche: de las 23:00 de la noche a las 5:30 del día siguiente (hora de Mendoza)
CREATE OR REPLACE FUNCTION tel.fn_ventana_infraccion(p_noche date, OUT desde timestamptz, OUT hasta timestamptz)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT ((p_noche + tel.fn_hora_parametro('tel.horario_tope', '23:00')) AT TIME ZONE 'America/Argentina/Mendoza'),
           ((p_noche + 1 + tel.fn_hora_parametro('tel.horario_manejo_desde', '05:30')) AT TIME ZONE 'America/Argentina/Mendoza')
$f$;

-- Marca las infracciones de las noches que pasaron o la de ahora, y avisa una vez
CREATE OR REPLACE FUNCTION tel.fn_marcar_infracciones_horario(p_dias integer DEFAULT 2)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE
    v_kmh numeric := ref.fn_parametro_num('tel.fuera_horario_kmh', 10);
    v_min integer := greatest(ref.fn_parametro_num('tel.fuera_horario_infraccion_lecturas', 2)::int, 1);
    v_tope text := to_char(tel.fn_hora_parametro('tel.horario_tope', '23:00'), 'FMHH24:MI');
    v_avisar bigint[] := ARRAY(SELECT DISTINCT u.id FROM seg.usuario u WHERE u.activo AND (u.habilita_fuera_horario
                                 OR EXISTS (SELECT 1 FROM seg.usuario_rol ur WHERE ur.usuario_id = u.id AND ur.rol_codigo IN ('gerencia', 'analista_control'))));
    f record; w record; x record; n integer := 0;
BEGIN
    IF ref.fn_parametro_texto('tel.fuera_horario_activo', 'true') <> 'true' THEN RETURN 0; END IF;
    FOR f IN SELECT fh.*, c.patente FROM tel.fuera_horario fh JOIN mae.camion c ON c.id = fh.camion_id
              WHERE fh.noche >= (now() AT TIME ZONE 'America/Argentina/Mendoza')::date - greatest(p_dias, 1)
                AND fh.sin_sancion_en IS NULL LOOP
        -- Con permiso para esa noche no hay infracción
        IF EXISTS (SELECT 1 FROM tel.habilitacion_horario h WHERE h.camion_id = f.camion_id AND h.noche = f.noche AND h.anulada_en IS NULL) THEN
            IF f.infraccion_desde IS NOT NULL AND f.acta_id IS NULL THEN
                UPDATE tel.fuera_horario SET infraccion_desde = NULL, infraccion_hasta = NULL, infraccion_lecturas = NULL, infraccion_vmax = NULL WHERE id = f.id;
            END IF;
            CONTINUE;
        END IF;
        SELECT * INTO w FROM tel.fn_ventana_infraccion(f.noche);
        SELECT min(l.ts) AS desde, max(l.ts) AS hasta, count(*)::int AS n, max(l.velocidad_kmh) AS vmax INTO x
          FROM tel.lectura l
         WHERE l.camion_id = f.camion_id AND l.ts >= w.desde AND l.ts < w.hasta AND l.ts <= now()
           AND coalesce(l.calidad, 1) > 0 AND l.velocidad_kmh > v_kmh;
        CONTINUE WHEN x.n < v_min;
        UPDATE tel.fuera_horario
           SET infraccion_desde = x.desde, infraccion_hasta = x.hasta, infraccion_lecturas = x.n, infraccion_vmax = round(x.vmax)
         WHERE id = f.id AND (infraccion_desde IS DISTINCT FROM x.desde OR infraccion_hasta IS DISTINCT FROM x.hasta OR infraccion_lecturas IS DISTINCT FROM x.n);
        -- Aviso una sola vez por noche, y solo si es de las últimas horas (no por lo que se revisa hacia atrás)
        IF f.infraccion_avisada_en IS NULL THEN
            IF x.hasta > now() - interval '3 hours' THEN
                PERFORM ops.fn_avisar(v_avisar, 'fuera_horario:' || f.id || ':infraccion', 'Infracción de horario · ' || f.patente,
                    coalesce(ops.fn_nombre_chofer(f.chofer_id), 'Chofer sin identificar') || ' siguió manejando después de las ' || v_tope
                        || ' sin permiso (desde las ' || to_char(x.desde AT TIME ZONE 'America/Argentina/Mendoza', 'HH24:MI') || ', hasta '
                        || round(x.vmax) || ' km/h). Se puede labrar el acta en Seguimiento de viajes.',
                    '/telemetria/seguimiento', true);
            END IF;
            UPDATE tel.fuera_horario SET infraccion_avisada_en = now() WHERE id = f.id;
            n := n + 1;
        END IF;
    END LOOP;
    RETURN n;
END $f$;
COMMENT ON FUNCTION tel.fn_marcar_infracciones_horario(integer) IS
    'Migración 389: marca como infracción las noches en que un tractor circuló después de las 23:00 (o antes de las 5:30) sin permiso, y avisa una vez a Gerencia, Telemetría y a quienes habilitan.';
REVOKE ALL ON FUNCTION tel.fn_marcar_infracciones_horario(integer) FROM PUBLIC;
DO $p$ DECLARE g text; BEGIN
    FOR g IN SELECT r.rolname FROM pg_roles r WHERE r.rolname LIKE 'tc\_%' OR r.rolname IN ('authenticated', 'anon') LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION tel.fn_marcar_infracciones_horario(integer) FROM %I', g);
    END LOOP;
END $p$;

-- Labrar el acta desde la infracción
CREATE OR REPLACE FUNCTION tel.fn_labrar_acta_fuera_horario(p_id bigint, p_descripcion text DEFAULT NULL, p_lugar text DEFAULT NULL, p_chofer bigint DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE f record; v_acta bigint; v_num text; v_desc text; v_tope text := to_char(tel.fn_hora_parametro('tel.horario_tope', '23:00'), 'FMHH24:MI');
BEGIN
    PERFORM ops.fn_exigir_rol_acta(ops.fn_roles_acta('crear'), 'Las actas de infracción las hacen Gerencia, Operaciones, Control o TI');
    SELECT fh.*, c.patente INTO f FROM tel.fuera_horario fh JOIN mae.camion c ON c.id = fh.camion_id WHERE fh.id = p_id FOR UPDATE OF fh;
    IF NOT FOUND THEN RAISE EXCEPTION 'No encuentro esa noche fuera de horario' USING ERRCODE = 'P0002'; END IF;
    IF f.infraccion_desde IS NULL THEN
        RAISE EXCEPTION 'Esa noche no hay infracción: no circuló después de las % sin permiso', v_tope USING ERRCODE = '55000';
    END IF;
    IF f.sin_sancion_en IS NOT NULL THEN RAISE EXCEPTION 'Esa noche ya se dejó sin sanción: %', f.sin_sancion_motivo USING ERRCODE = '55000'; END IF;
    SELECT numero INTO v_num FROM ops.acta_infraccion WHERE id = f.acta_id AND estado <> 'anulada' AND eliminado_en IS NULL;
    IF FOUND THEN RAISE EXCEPTION 'Esa noche ya tiene el acta %', v_num USING ERRCODE = '23505'; END IF;

    v_desc := coalesce(nullif(btrim(p_descripcion), ''),
        format('Circuló fuera del horario de manejo sin permiso: el horario permitido es hasta las %s. Con el tractor %s manejó de %s a %s (hasta %s km/h).%s',
               v_tope, f.patente,
               to_char(f.infraccion_desde AT TIME ZONE 'America/Argentina/Mendoza', 'DD/MM HH24:MI'),
               to_char(f.infraccion_hasta AT TIME ZONE 'America/Argentina/Mendoza', 'DD/MM HH24:MI'), f.infraccion_vmax,
               CASE WHEN f.avisado_en IS NULL THEN '' ELSE ' Se le avisó a las ' || to_char(f.avisado_en AT TIME ZONE 'America/Argentina/Mendoza', 'HH24:MI') || ' que buscara dónde pasar la noche.' END));
    v_acta := ops.fn_crear_acta(jsonb_build_object(
        'tipo', 'fuera_horario', 'chofer_id', coalesce(p_chofer, f.chofer_id), 'camion_id', f.camion_id,
        'fecha', f.infraccion_desde, 'descripcion', v_desc, 'lugar', nullif(btrim(p_lugar), '')));
    UPDATE ops.acta_infraccion
       SET evidencia = evidencia || jsonb_strip_nulls(jsonb_build_object(
               'regla', 'Horario de manejo (máximo ' || v_tope || ' sin permiso)', 'noche', f.noche,
               'desde', f.infraccion_desde, 'hasta', f.infraccion_hasta, 'lecturas', f.infraccion_lecturas, 'velocidad_maxima_kmh', f.infraccion_vmax,
               'avisado_en', f.avisado_en, 'gerencia_avisada_en', f.escalado_en, 'latitud', f.latitud, 'longitud', f.longitud))
     WHERE id = v_acta
    RETURNING numero INTO v_num;
    UPDATE tel.fuera_horario SET acta_id = v_acta WHERE id = p_id;
    RETURN jsonb_build_object('id', v_acta, 'numero', v_num);
END $f$;

-- Dejar la infracción sin sanción (con motivo): Gerencia, el jefe de Operaciones o TI
CREATE OR REPLACE FUNCTION tel.fn_sin_sancion_fuera_horario(p_id bigint, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE f tel.fuera_horario%ROWTYPE;
BEGIN
    PERFORM ops.fn_exigir_rol_acta(ops.fn_roles_acta('monto'), 'Dejar una infracción sin sanción lo deciden Gerencia, el jefe de Operaciones o TI');
    IF length(btrim(coalesce(p_motivo, ''))) < 5 THEN RAISE EXCEPTION 'Escribí por qué no corresponde sanción' USING ERRCODE = '22023'; END IF;
    SELECT * INTO f FROM tel.fuera_horario WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'No encuentro esa noche fuera de horario' USING ERRCODE = 'P0002'; END IF;
    IF f.infraccion_desde IS NULL THEN RAISE EXCEPTION 'Esa noche no hay infracción' USING ERRCODE = '55000'; END IF;
    IF EXISTS (SELECT 1 FROM ops.acta_infraccion WHERE id = f.acta_id AND estado <> 'anulada' AND eliminado_en IS NULL) THEN
        RAISE EXCEPTION 'Esa noche ya tiene acta: si no corresponde, anulala en Actas' USING ERRCODE = '55000';
    END IF;
    UPDATE tel.fuera_horario SET sin_sancion_motivo = left(btrim(p_motivo), 300), sin_sancion_por = aud.fn_usuario_actual(), sin_sancion_en = now()
     WHERE id = p_id;
END $f$;

-- La pantalla: cada noche con su infracción y su acta, y las infracciones de 30 días que siguen sin resolver
DO $do$
DECLARE v_def text := pg_get_functiondef('tel.fn_fuera_horario()'::regprocedure);
        v_a1 constant text := $a$'avisado_en', f.avisado_en, 'escalado_en', f.escalado_en, 'detenido_en', f.detenido_en, 'veces', f.veces, 'habilitado', f.habilitado)$a$;
        v_a2 constant text := $a$'puede_habilitar', v_puede,$a$;
BEGIN
    IF v_def LIKE '%infracciones_pendientes%' THEN RETURN; END IF;
    IF position(v_a1 IN v_def) = 0 OR position(v_a2 IN v_def) = 0 THEN
        RAISE EXCEPTION 'tel.fn_fuera_horario no es la que esperaba esta migración: avisar antes de seguir';
    END IF;
    v_def := replace(v_def, v_a1, $b$'avisado_en', f.avisado_en, 'escalado_en', f.escalado_en, 'detenido_en', f.detenido_en, 'veces', f.veces, 'habilitado', f.habilitado)
                || tel.fn_infraccion_json(f.id)$b$);
    v_def := replace(v_def, v_a2, $b$'puede_habilitar', v_puede,
        'tope', to_char(tel.fn_hora_parametro('tel.horario_tope', '23:00'), 'FMHH24:MI'),
        'puede_acta', ops.fn_rol_acta(ops.fn_roles_acta('crear')),
        'puede_sin_sancion', ops.fn_rol_acta(ops.fn_roles_acta('monto')),
        'infracciones_pendientes', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                'id', f.id, 'camion_id', f.camion_id, 'patente', c.patente, 'chofer', ops.fn_nombre_chofer(f.chofer_id), 'noche', f.noche,
                'desde', f.desde, 'ultimo_ts', f.ultimo_ts, 'avisado_en', f.avisado_en, 'escalado_en', f.escalado_en) || tel.fn_infraccion_json(f.id)
                ORDER BY f.noche DESC, c.patente), '[]'::jsonb)
              FROM tel.fuera_horario f JOIN mae.camion c ON c.id = f.camion_id
             WHERE f.noche <> v_noche AND f.noche >= v_noche - 30 AND f.infraccion_desde IS NOT NULL AND f.sin_sancion_en IS NULL
               AND NOT EXISTS (SELECT 1 FROM ops.acta_infraccion a WHERE a.id = f.acta_id AND a.estado <> 'anulada' AND a.eliminado_en IS NULL)),$b$);
    -- La función nueva que usa el reemplazo
    EXECUTE $s$
    CREATE OR REPLACE FUNCTION tel.fn_infraccion_json(p_id bigint)
     RETURNS jsonb
     LANGUAGE sql
     STABLE SECURITY DEFINER
     SET search_path TO 'pg_catalog', 'public', 'extensions'
    AS $q$
        SELECT jsonb_build_object(
                   'infraccion', f.infraccion_desde IS NOT NULL AND NOT f.habilitado,
                   'infraccion_desde', f.infraccion_desde, 'infraccion_hasta', f.infraccion_hasta,
                   'infraccion_lecturas', f.infraccion_lecturas, 'infraccion_vmax', f.infraccion_vmax,
                   'acta', (SELECT jsonb_build_object('id', a.id, 'numero', a.numero, 'estado', a.estado)
                              FROM ops.acta_infraccion a WHERE a.id = f.acta_id AND a.estado <> 'anulada' AND a.eliminado_en IS NULL),
                   'sin_sancion', CASE WHEN f.sin_sancion_en IS NOT NULL THEN jsonb_build_object(
                       'motivo', f.sin_sancion_motivo, 'por', (SELECT nombre FROM seg.usuario WHERE id = f.sin_sancion_por), 'en', f.sin_sancion_en) END)
          FROM tel.fuera_horario f WHERE f.id = p_id
    $q$ $s$;
    EXECUTE v_def;
END $do$;
REVOKE ALL ON FUNCTION tel.fn_infraccion_json(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION tel.fn_ventana_infraccion(date) FROM PUBLIC;
DO $p$ DECLARE g text; BEGIN
    FOR g IN SELECT r.rolname FROM pg_roles r WHERE r.rolname LIKE 'tc\_%' OR r.rolname IN ('authenticated', 'anon') LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION tel.fn_infraccion_json(bigint) FROM %I', g);
        EXECUTE format('REVOKE ALL ON FUNCTION tel.fn_ventana_infraccion(date) FROM %I', g);
    END LOOP;
END $p$;

-- Permisos: las de actas como ops.fn_crear_acta; las del horario como tel.fn_habilitar_fuera_horario
DO $p$
DECLARE g text; x record;
BEGIN
    FOR x IN SELECT * FROM (VALUES ('ops.fn_tipos_acta()', 'ops.fn_crear_acta(jsonb)'),
                                   ('ops.fn_agregar_tipo_acta(text)', 'ops.fn_crear_acta(jsonb)'),
                                   ('tel.fn_labrar_acta_fuera_horario(bigint, text, text, bigint)', 'tel.fn_habilitar_fuera_horario(bigint, text)'),
                                   ('tel.fn_sin_sancion_fuera_horario(bigint, text)', 'tel.fn_habilitar_fuera_horario(bigint, text)')) v(f, modelo) LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', x.f);
        FOR g IN SELECT r.rolname FROM pg_roles r WHERE r.rolname LIKE 'tc\_%' OR r.rolname IN ('authenticated', 'anon') LOOP
            IF has_function_privilege(g, x.modelo, 'EXECUTE') THEN
                EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', x.f, g);
            ELSE
                EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', x.f, g);
            END IF;
        END LOOP;
    END LOOP;
END $p$;

-- El aviso al chofer dice hasta qué hora tiene para parar
DO $do$
DECLARE v_def text := pg_get_functiondef('tel.fn_controlar_horario()'::regprocedure);
        v_a constant text := $a$'. Buscá un lugar seguro para estacionar y pasar la noche.'$a$;
BEGIN
    IF v_def LIKE '%tel.horario_tope%' THEN RETURN; END IF;
    IF position(v_a IN v_def) = 0 THEN RAISE NOTICE 'El aviso al chofer no es el esperado: se deja como está'; RETURN; END IF;
    EXECUTE replace(v_def, v_a, $b$'. Buscá un lugar seguro para estacionar y pasar la noche: tenés hasta las '
                || to_char(tel.fn_hora_parametro('tel.horario_tope', '23:00'), 'FMHH24:MI') || '. Después, sin permiso, es infracción.'$b$);
END $do$;

-- El control de cada 10 minutos también marca las infracciones
DO $c$
BEGIN
    IF to_regclass('cron.job') IS NOT NULL AND EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'horario_de_manejo') THEN
        PERFORM cron.schedule('horario_de_manejo', '*/10 * * * *', 'SELECT tel.fn_controlar_horario(); SELECT tel.fn_marcar_infracciones_horario(2);');
    ELSE
        RAISE NOTICE 'No está la tarea programada horario_de_manejo: las infracciones se marcan al abrir la pantalla solo si alguien corre tel.fn_marcar_infracciones_horario';
    END IF;
END $c$;

-- Revisa los últimos 30 días (sin avisar por lo viejo)
SELECT tel.fn_marcar_infracciones_horario(30);

-- Prueba: un tractor que circula a las 23:30 sin permiso queda en infracción; con permiso, no (datos ZZ que se deshacen)
DO $t$
DECLARE v_cam bigint; v_noche date := (now() AT TIME ZONE 'America/Argentina/Mendoza')::date - 3; v_id bigint; w record; f tel.fuera_horario%ROWTYPE;
BEGIN
    SELECT id INTO v_cam FROM mae.camion WHERE eliminado_en IS NULL ORDER BY id LIMIT 1;
    IF v_cam IS NULL THEN RETURN; END IF;
    BEGIN
        SELECT * INTO w FROM tel.fn_ventana_infraccion(v_noche);
        IF w.hasta - w.desde <> interval '6 hours 30 minutes' THEN RAISE EXCEPTION 'la ventana de la noche está mal: % a %', w.desde, w.hasta; END IF;
        DELETE FROM tel.fuera_horario WHERE camion_id = v_cam AND noche = v_noche;
        INSERT INTO tel.fuera_horario (camion_id, noche, desde, ultimo_ts, habilitado)
        VALUES (v_cam, v_noche, w.desde - interval '50 minutes', w.desde + interval '40 minutes', false) RETURNING id INTO v_id;
        INSERT INTO tel.lectura (camion_id, ts, velocidad_kmh, latitud, longitud)
        SELECT v_cam, w.desde + make_interval(mins => m), 40, -32.9, -68.8 FROM unnest(ARRAY[-30, 20, 30, 40]) m;
        PERFORM tel.fn_marcar_infracciones_horario(5);
        SELECT * INTO f FROM tel.fuera_horario WHERE id = v_id;
        IF f.infraccion_desde IS DISTINCT FROM w.desde + interval '20 minutes' OR f.infraccion_lecturas <> 3 THEN
            RAISE EXCEPTION 'no marcó bien la infracción: % (% lecturas)', f.infraccion_desde, f.infraccion_lecturas;
        END IF;
        INSERT INTO tel.habilitacion_horario (camion_id, noche, motivo) VALUES (v_cam, v_noche, 'ZZ prueba');
        PERFORM tel.fn_marcar_infracciones_horario(5);
        SELECT * INTO f FROM tel.fuera_horario WHERE id = v_id;
        IF f.infraccion_desde IS NOT NULL THEN RAISE EXCEPTION 'con permiso no debería haber infracción'; END IF;
        RAISE EXCEPTION 'deshacer' USING ERRCODE = 'ZZ389';
    EXCEPTION WHEN SQLSTATE 'ZZ389' THEN NULL;
    END;
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'La migración 389 no pasó su prueba (%). No se aplicó nada: avisar antes de seguir.', SQLERRM;
END $t$;

COMMIT;

NOTIFY pgrst, 'reload schema';

SELECT 'migración 389 aplicada' AS que,
       (SELECT count(*) FROM ops.tipo_acta WHERE activo) AS tipos_de_acta,
       (SELECT count(*) FROM tel.fuera_horario WHERE infraccion_desde IS NOT NULL AND noche >= current_date - 30) AS noches_con_infraccion_30_dias,
       (SELECT count(*) FROM tel.fuera_horario WHERE infraccion_desde IS NOT NULL AND noche >= current_date - 30 AND acta_id IS NULL AND sin_sancion_en IS NULL) AS sin_acta_todavia;
