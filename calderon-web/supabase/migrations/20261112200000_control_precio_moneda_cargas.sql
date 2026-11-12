-- =============================================================================
-- IronTrack — 258 · Control de precio y moneda de las cargas de combustible
-- -----------------------------------------------------------------------------
-- Pedido de Gerencia (12/11/2026): la carga 110 entró con 95.288 por litro (era el total del
-- ticket) y tres cargas de estaciones argentinas entraron en CLP. Desde ahora:
--   · Moneda: una carga en estación va en la moneda del país de la estación (ref.pais).
--     Si no coincide, NO se guarda (mensaje para la persona).
--   · Precio: se compara con el precio habitual = mediana de las cargas de ese país, en esa
--     moneda, de los 30 días alrededor de la carga (mínimo 3 cargas).
--       - Imposible (más del doble o menos de la mitad): NO se guarda.
--       - Dudoso (más de 20 % de diferencia): se guarda y queda una alerta para revisar.
--   · Cierre de viaje: no se aprueba (nivel 1 ni final) con cargas del viaje en esa situación,
--     salvo que la carga se corrija o su alerta esté resuelta por una persona.
--   · Iris: lectura nueva «cargas_precio_dudoso»; además las alertas abiertas ya entran en el
--     informe semanal por la lectura «alertas».
--   · Lo ya cargado: se revisa todo al aplicar (quedan alertas; no se toca ninguna carga).
-- No aplica al surtidor propio ni a las cargas desde depósito.
-- Los umbrales son los parámetros de la regla PRECIO_FUERA_RANGO (Alertas > Reglas):
--   dias, min_cargas, pct_aviso, factor_bloqueo, exigir_moneda_pais (1 = sí, 0 = no).
-- web.version_base = 258.
-- =============================================================================
SET search_path = public, extensions;
BEGIN;

DO $do$
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 257 THEN
        RAISE EXCEPTION 'Falta la migración 257: aplicarla antes';
    END IF;
    IF to_regprocedure('fue.fn_regla_precio()') IS NOT NULL
       OR EXISTS (SELECT 1 FROM ana.regla_anomalia WHERE codigo = 'PRECIO_FUERA_RANGO') THEN
        RAISE EXCEPTION 'La migración 258 (control de precio y moneda) ya está aplicada';
    END IF;
END $do$;

-- -----------------------------------------------------------------------------
-- 1 · Tipo de alerta, regla y responsable (copiando la forma de una regla de combustible)
-- -----------------------------------------------------------------------------
CREATE FUNCTION pg_temp.fn_clonar(p_tabla regclass, p_modelo jsonb, p_cambios jsonb, p_titulo text, p_desc text)
RETURNS jsonb LANGUAGE plpgsql AS $fn$
DECLARE
    j jsonb := p_modelo; k text; v jsonb; c record; v_cols text[] := '{}'; v_fila jsonb;
BEGIN
    FOR k, v IN SELECT * FROM jsonb_each(p_modelo) LOOP
        IF p_cambios ? k THEN
            j := j || jsonb_build_object(k, p_cambios->k);
        ELSIF k ~ '(_en$|hasta|eliminad)' THEN
            j := j - k;                                   -- fechas: las pone la base
        ELSIF jsonb_typeof(v) = 'string' AND k ~ '(descrip|detalle|explica|ayuda|accion|que_hacer|criterio)' THEN
            j := j || jsonb_build_object(k, p_desc);
        ELSIF jsonb_typeof(v) = 'string' AND k ~ '(nombre|titulo|etiqueta|texto)' THEN
            j := j || jsonb_build_object(k, p_titulo);
        END IF;
    END LOOP;
    FOR c IN SELECT a.attname::text AS col, a.attidentity = 'a' AS con_defecto
               FROM pg_attribute a
              WHERE a.attrelid = p_tabla AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
              ORDER BY a.attnum LOOP
        IF c.col = 'id' THEN
            CONTINUE WHEN c.con_defecto;
            EXECUTE format('SELECT coalesce(max(id), 0) + 1 FROM %s', p_tabla) INTO v;
            j := j || jsonb_build_object('id', v);
        END IF;
        CONTINUE WHEN NOT j ? c.col;
        v_cols := v_cols || quote_ident(c.col);
    END LOOP;
    EXECUTE format('INSERT INTO %1$s AS t (%2$s) SELECT %2$s FROM jsonb_populate_record(NULL::%1$s, $1) RETURNING to_jsonb(t)',
                   p_tabla, array_to_string(v_cols, ', ')) USING j INTO v_fila;
    RETURN v_fila;
END $fn$;

DO $do$
DECLARE
    v_regla jsonb; v_tipo jsonb; v_resp jsonb; v_nuevo jsonb;
    v_titulo constant text := 'Precio por litro fuera de lo habitual';
    v_desc   constant text := 'El precio por litro o la moneda de la carga no coincide con lo que se viene pagando en ese país. Hay que revisar el ticket y corregir la carga.';
BEGIN
    SELECT to_jsonb(r) INTO v_regla FROM ana.regla_anomalia r
     ORDER BY (r.categoria = 'combustible') DESC, (r.alcance = 'por_camion') DESC, r.id DESC LIMIT 1;
    IF v_regla IS NULL THEN RAISE EXCEPTION 'No hay reglas en ana.regla_anomalia para tomar de modelo'; END IF;

    SELECT to_jsonb(t) INTO v_tipo FROM ref.tipo_alerta t
     ORDER BY (to_jsonb(t)->>'codigo' = v_regla->>'codigo') DESC, (to_jsonb(t)->>'categoria' = 'combustible') DESC, t.id DESC LIMIT 1;
    IF v_tipo IS NULL THEN RAISE EXCEPTION 'No hay tipos en ref.tipo_alerta para tomar de modelo'; END IF;

    v_nuevo := pg_temp.fn_clonar('ref.tipo_alerta', v_tipo, jsonb_build_object(
        'codigo', 'PRECIO_FUERA_RANGO', 'regla_codigo', 'PRECIO_FUERA_RANGO', 'categoria', 'combustible',
        'numero', (SELECT coalesce(max(numero), 0) + 1 FROM ref.tipo_alerta), 'severidad', 'media',
        'activa', true, 'activo', true, 'version', 1), v_titulo, v_desc);

    PERFORM pg_temp.fn_clonar('ana.regla_anomalia', v_regla, jsonb_build_object(
        'codigo', 'PRECIO_FUERA_RANGO', 'version', 1, 'categoria', 'combustible', 'alcance', 'por_camion',
        'modo', 'productivo', 'severidad', 'media', 'vigente_desde', current_date, 'activa', true,
        'tipo_alerta_id', v_nuevo->'id', 'tipo_id', v_nuevo->'id', 'tipo_alerta_codigo', 'PRECIO_FUERA_RANGO',
        'parametros', jsonb_build_object('dias', 30, 'min_cargas', 3, 'pct_aviso', 20, 'factor_bloqueo', 2, 'exigir_moneda_pais', 1)),
        v_titulo, v_desc);

    -- Responsable: el mismo equipo que revisa las otras alertas de combustible
    SELECT to_jsonb(x) INTO v_resp FROM ana.responsable_alerta x
     ORDER BY (x.rol_codigo = 'adm_combustible') DESC, (x.regla_codigo = v_regla->>'codigo') DESC LIMIT 1;
    IF v_resp IS NOT NULL THEN
        PERFORM pg_temp.fn_clonar('ana.responsable_alerta', v_resp, jsonb_build_object(
            'regla_codigo', 'PRECIO_FUERA_RANGO', 'usuario_id', NULL), v_titulo, v_desc);
    END IF;
END $do$;

-- -----------------------------------------------------------------------------
-- 2 · La evaluación (una sola, la usan el formulario, los triggers, el cierre e Iris)
-- -----------------------------------------------------------------------------
CREATE FUNCTION fue.fn_regla_precio() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, extensions AS $fn$
    SELECT jsonb_build_object('id', r.id, 'p', r.parametros)
      FROM ana.regla_anomalia r
     WHERE r.codigo = 'PRECIO_FUERA_RANGO' AND r.vigente_desde <= current_date
     ORDER BY r.vigente_desde DESC, r.version DESC LIMIT 1;
$fn$;

CREATE FUNCTION fue.fn_evaluar_precio(p_estacion bigint, p_fecha timestamptz, p_moneda text, p_precio numeric,
                                      p_litros numeric, p_medio text, p_deposito bigint, p_excluir bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, extensions AS $fn$
DECLARE
    r jsonb := fue.fn_regla_precio();
    v_dias integer; v_min integer; v_pct numeric; v_factor numeric; v_exigir boolean;
    e record; v_mon text; v_ref numeric; v_n integer; v_desvio numeric; v_unit numeric;
    j jsonb;
BEGIN
    IF r IS NULL OR p_estacion IS NULL OR p_medio = 'surtidor_propio' OR p_deposito IS NOT NULL THEN
        RETURN jsonb_build_object('resultado', 'no_aplica');
    END IF;
    v_dias   := greatest(coalesce((r->'p'->>'dias')::numeric, 30), 1)::integer;
    v_min    := greatest(coalesce((r->'p'->>'min_cargas')::numeric, 3), 1)::integer;
    v_pct    := greatest(coalesce((r->'p'->>'pct_aviso')::numeric, 20), 1);
    v_factor := greatest(coalesce((r->'p'->>'factor_bloqueo')::numeric, 2), 1.1);
    v_exigir := coalesce((r->'p'->>'exigir_moneda_pais')::numeric, 1) <> 0;

    SELECT s.nombre, btrim(s.pais) AS pais, s.es_tanque_propio, pa.nombre AS pais_nombre, btrim(pa.moneda_defecto) AS moneda
      INTO e
      FROM mae.estacion_servicio s LEFT JOIN ref.pais pa ON btrim(pa.iso2) = btrim(s.pais)
     WHERE s.id = p_estacion;
    IF NOT FOUND OR e.es_tanque_propio OR e.moneda IS NULL THEN
        RETURN jsonb_build_object('resultado', 'no_aplica');
    END IF;

    j := jsonb_build_object('estacion', e.nombre, 'pais', e.pais, 'pais_nombre', e.pais_nombre, 'moneda_esperada', e.moneda,
                            'moneda', p_moneda, 'precio', p_precio, 'pct_aviso', v_pct, 'factor_bloqueo', v_factor);

    IF v_exigir AND p_moneda IS NOT NULL AND btrim(p_moneda) <> e.moneda THEN
        RETURN j || jsonb_build_object('resultado', 'moneda', 'mensaje',
            format('La estación %s está en %s: la carga va en %s, no en %s. Cambiá la moneda y poné el precio por litro del ticket (en %s).',
                   e.nombre, coalesce(e.pais_nombre, e.pais), e.moneda, btrim(p_moneda), e.moneda));
    END IF;

    -- Precio habitual: mediana de las cargas de ese país en esa moneda, alrededor de la fecha
    v_mon := coalesce(btrim(p_moneda), e.moneda);
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY c.precio_unitario), count(*)
      INTO v_ref, v_n
      FROM fue.carga_combustible c JOIN mae.estacion_servicio s ON s.id = c.estacion_id
     WHERE btrim(s.pais) = e.pais AND NOT s.es_tanque_propio
       AND btrim(c.moneda) = v_mon AND c.precio_unitario > 0
       AND c.eliminado_en IS NULL AND c.estado_validacion <> 'anulada'
       AND c.deposito_id IS NULL AND c.medio_pago IS DISTINCT FROM 'surtidor_propio'
       AND c.fecha_hora BETWEEN coalesce(p_fecha, now()) - make_interval(days => v_dias)
                            AND coalesce(p_fecha, now()) + make_interval(days => v_dias)
       AND c.id IS DISTINCT FROM p_excluir;
    IF v_n < v_min OR v_ref IS NULL OR v_ref <= 0 THEN
        RETURN j || jsonb_build_object('resultado', 'sin_referencia', 'cargas_referencia', v_n);
    END IF;
    v_ref := round(v_ref, 2);
    j := j || jsonb_build_object('referencia', v_ref, 'cargas_referencia', v_n, 'dias', v_dias);
    IF p_precio IS NULL OR p_precio <= 0 THEN
        RETURN j || jsonb_build_object('resultado', 'sin_precio');
    END IF;

    v_desvio := round((p_precio / v_ref - 1) * 100, 1);
    j := j || jsonb_build_object('desvio_pct', v_desvio);
    IF p_precio > v_ref * v_factor OR p_precio < v_ref / v_factor THEN
        v_unit := CASE WHEN p_litros > 0 THEN p_precio / p_litros END;
        RETURN j || jsonb_build_object('resultado', 'imposible', 'mensaje',
            format('El precio por litro (%s %s) no puede ser: en %s se viene pagando alrededor de %s %s por litro. ',
                   tel.fn_num_ar(p_precio, 2), v_mon, coalesce(e.pais_nombre, e.pais), tel.fn_num_ar(v_ref, 2), v_mon)
            || CASE WHEN v_unit BETWEEN v_ref / v_factor AND v_ref * v_factor
                    THEN format('Parece el importe total del ticket: el precio por litro sería %s.', tel.fn_num_ar(v_unit, 2))
                    ELSE 'Revisá el ticket: va el precio de un litro, no el total.' END);
    END IF;
    IF abs(v_desvio) > v_pct THEN
        RETURN j || jsonb_build_object('resultado', 'dudoso', 'mensaje',
            format('Precio por litro %s %s: %s %% %s de lo habitual en %s (%s %s).',
                   tel.fn_num_ar(p_precio, 2), v_mon, tel.fn_num_ar(abs(v_desvio), 0),
                   CASE WHEN v_desvio > 0 THEN 'por encima' ELSE 'por debajo' END,
                   coalesce(e.pais_nombre, e.pais), tel.fn_num_ar(v_ref, 2), v_mon));
    END IF;
    RETURN j || jsonb_build_object('resultado', 'normal');
END $fn$;

COMMENT ON FUNCTION fue.fn_evaluar_precio(bigint, timestamptz, text, numeric, numeric, text, bigint, bigint) IS
    'Migración 258: compara moneda y precio por litro de una carga con lo habitual del país de la estación. resultado: normal, dudoso, imposible, moneda, sin_referencia, sin_precio, no_aplica.';

-- Para el formulario: qué moneda corresponde y cuánto se viene pagando (antes de guardar)
CREATE FUNCTION fue.fn_referencia_carga(p_estacion bigint, p_fecha timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, extensions AS $fn$
    SELECT fue.fn_evaluar_precio(p_estacion, p_fecha, NULL, NULL, NULL, NULL, NULL, NULL);
$fn$;

-- -----------------------------------------------------------------------------
-- 3 · Al guardar la carga: bloquea moneda equivocada y precio imposible
-- -----------------------------------------------------------------------------
CREATE FUNCTION fue.fn_tg_carga_moneda_precio() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, extensions AS $fn$
DECLARE v jsonb;
BEGIN
    IF NEW.eliminado_en IS NOT NULL OR NEW.estado_validacion = 'anulada'
       OR coalesce(current_setting('fue.sin_control_precio', true), '') = '1' THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE'
       AND NEW.moneda IS NOT DISTINCT FROM OLD.moneda AND NEW.precio_unitario IS NOT DISTINCT FROM OLD.precio_unitario
       AND NEW.estacion_id IS NOT DISTINCT FROM OLD.estacion_id AND NEW.medio_pago IS NOT DISTINCT FROM OLD.medio_pago
       AND NEW.deposito_id IS NOT DISTINCT FROM OLD.deposito_id THEN
        RETURN NEW;                                       -- no cambió nada de esto: no se revisa de nuevo
    END IF;
    v := fue.fn_evaluar_precio(NEW.estacion_id, NEW.fecha_hora, NEW.moneda, NEW.precio_unitario, NEW.litros,
                               NEW.medio_pago, NEW.deposito_id, NEW.id);
    IF v->>'resultado' IN ('moneda', 'imposible') THEN
        RAISE EXCEPTION '%', v->>'mensaje' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END $fn$;

CREATE TRIGGER tg_31_moneda_precio BEFORE INSERT OR UPDATE ON fue.carga_combustible
    FOR EACH ROW EXECUTE FUNCTION fue.fn_tg_carga_moneda_precio();

-- -----------------------------------------------------------------------------
-- 4 · Alerta para lo dudoso (y para lo ya cargado). Nunca frena la carga.
-- -----------------------------------------------------------------------------
CREATE FUNCTION fue.fn_revisar_precio_carga(p_carga bigint) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, extensions AS $fn$
DECLARE
    r jsonb := fue.fn_regla_precio(); c fue.carga_combustible; v jsonb; a jsonb; v_cols text; v_huella text;
BEGIN
    IF r IS NULL THEN RETURN 'no_aplica'; END IF;
    SELECT * INTO c FROM fue.carga_combustible WHERE id = p_carga;
    IF NOT FOUND OR c.eliminado_en IS NOT NULL OR c.estado_validacion = 'anulada' THEN RETURN 'no_aplica'; END IF;
    v := fue.fn_evaluar_precio(c.estacion_id, c.fecha_hora, c.moneda, c.precio_unitario, c.litros, c.medio_pago, c.deposito_id, c.id);
    IF v->>'resultado' NOT IN ('dudoso', 'imposible', 'moneda') THEN RETURN v->>'resultado'; END IF;

    v_huella := md5('PRECIO_FUERA_RANGO|' || c.id);
    IF EXISTS (SELECT 1 FROM ana.alerta WHERE huella = v_huella) THEN RETURN v->>'resultado'; END IF;
    a := jsonb_build_object(
        'regla_id', (r->>'id')::bigint,
        'severidad', CASE WHEN v->>'resultado' = 'dudoso' THEN 'media' ELSE 'alta' END,
        'huella', v_huella, 'camion_id', c.camion_id, 'chofer_id', c.chofer_id, 'carga_id', c.id,
        'valor_observado', c.precio_unitario, 'valor_esperado', v->'referencia',
        'ocurrio_desde', c.fecha_hora, 'ocurrio_hasta', c.fecha_hora,
        'evidencia', v || jsonb_build_object('carga_id', c.id, 'litros', c.litros, 'importe', c.importe));
    -- Solo las columnas que la tabla tiene (el resto las completa la base)
    SELECT string_agg(quote_ident(t.attname), ', ') INTO v_cols
      FROM pg_attribute t
     WHERE t.attrelid = 'ana.alerta'::regclass AND t.attnum > 0 AND NOT t.attisdropped AND a ? t.attname::text;
    EXECUTE format('INSERT INTO ana.alerta (%1$s) SELECT %1$s FROM jsonb_populate_record(NULL::ana.alerta, $1)', v_cols) USING a;
    RETURN v->>'resultado';
END $fn$;

CREATE FUNCTION fue.fn_tg_carga_precio_alerta() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, extensions AS $fn$
BEGIN
    BEGIN
        PERFORM fue.fn_revisar_precio_carga(NEW.id);
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'fue.fn_revisar_precio_carga(%): %', NEW.id, SQLERRM;   -- la carga se guarda igual
    END;
    RETURN NULL;
END $fn$;

CREATE TRIGGER tg_98_precio AFTER INSERT OR UPDATE OF moneda, precio_unitario, estacion_id, medio_pago, deposito_id
    ON fue.carga_combustible FOR EACH ROW EXECUTE FUNCTION fue.fn_tg_carga_precio_alerta();

-- -----------------------------------------------------------------------------
-- 5 · Cierre de viaje: no se aprueba con cargas del viaje sin resolver
-- -----------------------------------------------------------------------------
CREATE FUNCTION fue.fn_cargas_precio_cierre(p_cierre bigint) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, extensions AS $fn$
    SELECT coalesce(jsonb_agg(jsonb_build_object('carga_id', x.id, 'fecha_hora', x.fecha_hora, 'resultado', x.ev->>'resultado',
                                                 'mensaje', x.ev->>'mensaje') ORDER BY x.fecha_hora), '[]'::jsonb)
      FROM (SELECT c.id, c.fecha_hora,
                   fue.fn_evaluar_precio(c.estacion_id, c.fecha_hora, c.moneda, c.precio_unitario, c.litros, c.medio_pago, c.deposito_id, c.id) AS ev
              FROM fue.cierre_viaje v JOIN fue.carga_combustible c
                ON c.camion_id = v.camion_id AND c.fecha_hora > v.salida_ts AND c.fecha_hora <= v.llegada_ts
             WHERE v.id = p_cierre AND c.eliminado_en IS NULL AND c.estado_validacion <> 'anulada') x
     WHERE x.ev->>'resultado' IN ('dudoso', 'imposible', 'moneda')
       AND NOT EXISTS (SELECT 1 FROM ana.alerta a
                        WHERE a.huella = md5('PRECIO_FUERA_RANGO|' || x.id)
                          AND a.estado IN ('explicada', 'descartada', 'confirmada_operativa'));
$fn$;

CREATE FUNCTION fue.fn_tg_cierre_precio() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, extensions AS $fn$
DECLARE p jsonb; v_lista text;
BEGIN
    IF NOT ((NEW.estado = 'aprobado' AND OLD.estado IS DISTINCT FROM 'aprobado') OR (NEW.n1_por IS NOT NULL AND OLD.n1_por IS NULL)) THEN
        RETURN NEW;
    END IF;
    p := fue.fn_cargas_precio_cierre(NEW.id);
    IF jsonb_array_length(p) = 0 THEN RETURN NEW; END IF;
    SELECT string_agg(format('carga %s del %s: %s', x->>'carga_id', to_char((x->>'fecha_hora')::timestamptz, 'DD/MM'), x->>'mensaje'), ' · ')
      INTO v_lista FROM jsonb_array_elements(p) x;
    RAISE EXCEPTION 'No se puede aprobar el cierre: % carga(s) del viaje con precio o moneda para revisar (%). Corregí la carga, o resolvé su alerta en Alertas si el dato está bien.',
        jsonb_array_length(p), v_lista USING ERRCODE = '55000';
END $fn$;

CREATE TRIGGER tg_45_precio_cargas BEFORE UPDATE OF estado, n1_por ON fue.cierre_viaje
    FOR EACH ROW EXECUTE FUNCTION fue.fn_tg_cierre_precio();

-- -----------------------------------------------------------------------------
-- 6 · Iris: lectura «cargas_precio_dudoso»
-- -----------------------------------------------------------------------------
CREATE FUNCTION ia.fn_lectura_cargas_precio(p_desde date DEFAULT NULL, p_hasta date DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, extensions AS $fn$
DECLARE
    v_hasta date := coalesce(p_hasta, current_date);
    v_desde date := coalesce(p_desde, coalesce(p_hasta, current_date) - 60);
    v jsonb;
BEGIN
    IF NOT ia.fn_puede_asistente() THEN RAISE EXCEPTION 'Iris es para Gerencia' USING ERRCODE = '42501'; END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'carga_id', x.id, 'fecha_hora', x.fecha_hora, 'patente', x.patente, 'estacion', x.ev->>'estacion', 'pais', x.ev->>'pais',
               'litros', x.litros, 'precio_por_litro', x.precio_unitario, 'moneda', x.moneda, 'importe', x.importe,
               'precio_habitual', x.ev->'referencia', 'desvio_pct', x.ev->'desvio_pct',
               'problema', CASE x.ev->>'resultado' WHEN 'moneda' THEN 'moneda equivocada' WHEN 'imposible' THEN 'precio imposible' ELSE 'precio dudoso' END,
               'detalle', x.ev->>'mensaje',
               'alerta', coalesce((SELECT a.estado FROM ana.alerta a WHERE a.huella = md5('PRECIO_FUERA_RANGO|' || x.id) ORDER BY a.id DESC LIMIT 1), 'sin alerta')
           ) ORDER BY x.fecha_hora DESC), '[]'::jsonb)
      INTO v
      FROM (SELECT c.id, c.fecha_hora, c.litros, c.precio_unitario, c.moneda, c.importe, k.patente,
                   fue.fn_evaluar_precio(c.estacion_id, c.fecha_hora, c.moneda, c.precio_unitario, c.litros, c.medio_pago, c.deposito_id, c.id) AS ev
              FROM fue.carga_combustible c LEFT JOIN mae.camion k ON k.id = c.camion_id
             WHERE c.eliminado_en IS NULL AND c.estado_validacion <> 'anulada'
               AND c.fecha_hora >= v_desde AND c.fecha_hora < v_hasta + 1) x
     WHERE x.ev->>'resultado' IN ('dudoso', 'imposible', 'moneda');
    RETURN jsonb_build_object('desde', v_desde, 'hasta', v_hasta, 'cantidad', jsonb_array_length(v), 'cargas', v,
        'nota', 'Cargas cuyo precio por litro o moneda no coincide con lo habitual del país de la estación. Las que tienen alerta explicada, descartada o confirmada ya las revisó una persona.');
END $fn$;

-- La herramienta se agrega envolviendo ia.fn_herramienta (la original queda como fn_herramienta_base).
-- Si su firma no es la esperada, esta parte se saltea: Iris igual ve estas cargas por la lectura «alertas».
DO $do$
DECLARE f record; v_n integer; g record;
BEGIN
    BEGIN
        SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'ia' AND p.proname = 'fn_herramienta';
        IF v_n <> 1 THEN RAISE EXCEPTION 'hay % funciones ia.fn_herramienta', v_n; END IF;
        SELECT p.oid, pg_get_function_identity_arguments(p.oid) AS ident, pg_get_function_arguments(p.oid) AS args,
               pg_get_function_result(p.oid) AS res, p.prosecdef, p.provolatile, p.proacl, pg_get_userbyid(p.proowner) AS dueno
          INTO f FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'ia' AND p.proname = 'fn_herramienta';
        IF f.ident <> 'p_codigo text, p_entrada jsonb' OR f.res <> 'jsonb' THEN
            RAISE EXCEPTION 'firma distinta: (%) → %', f.ident, f.res;
        END IF;
        ALTER FUNCTION ia.fn_herramienta(text, jsonb) RENAME TO fn_herramienta_base;
        EXECUTE format($sql$
            CREATE FUNCTION ia.fn_herramienta(%s) RETURNS jsonb LANGUAGE plpgsql %s %s
            SET search_path = pg_catalog, public, extensions AS $w$
            BEGIN
                -- Migración 258: lectura nueva; el resto lo resuelve la función original
                IF p_codigo = 'cargas_precio_dudoso' THEN
                    RETURN ia.fn_lectura_cargas_precio(nullif(p_entrada->>'desde', '')::date, nullif(p_entrada->>'hasta', '')::date);
                END IF;
                RETURN ia.fn_herramienta_base(p_codigo, p_entrada);
            END $w$ $sql$,
            f.args,
            CASE f.provolatile WHEN 'i' THEN 'STABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END,
            CASE WHEN f.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END);
        -- Mismos permisos que la original
        REVOKE ALL ON FUNCTION ia.fn_herramienta(text, jsonb) FROM PUBLIC;
        FOR g IN SELECT DISTINCT CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(x.grantee)) END AS rol
                   FROM aclexplode(f.proacl) x WHERE x.privilege_type = 'EXECUTE' LOOP
            EXECUTE format('GRANT EXECUTE ON FUNCTION ia.fn_herramienta(text, jsonb) TO %s', g.rol);
        END LOOP;
        IF f.proacl IS NULL THEN GRANT EXECUTE ON FUNCTION ia.fn_herramienta(text, jsonb) TO PUBLIC; END IF;

        INSERT INTO ia.asistente_herramienta (codigo, orden, descripcion, etiqueta, leyendo, pantalla, entrada, activa)
        SELECT 'cargas_precio_dudoso', (SELECT coalesce(max(orden), 0) + 1 FROM ia.asistente_herramienta),
               'Cargas de combustible con precio por litro o moneda fuera de lo habitual: moneda que no es la del país de la estación, precio imposible (más del doble o menos de la mitad de lo que se viene pagando) o dudoso (más de 20 % de diferencia). Usala cuando pregunten por errores de carga, precios raros, cargas mal cargadas o qué revisar antes de cerrar un viaje o un mes. Por defecto mira los últimos 60 días.',
               'Cargas con precio o moneda para revisar', 'Revisando precios y monedas de las cargas…', '/combustible/cargas',
               '{"type": "object", "properties": {"desde": {"type": "string", "description": "Fecha desde, AAAA-MM-DD (opcional)"}, "hasta": {"type": "string", "description": "Fecha hasta, AAAA-MM-DD (opcional)"}}}'::jsonb,
               true;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Iris: no se agregó la herramienta cargas_precio_dudoso (%). Las cargas igual quedan como alertas.', SQLERRM;
    END;
END $do$;

-- -----------------------------------------------------------------------------
-- 7 · Lo ya cargado: una pasada por todas las cargas (solo crea alertas)
-- -----------------------------------------------------------------------------
DO $do$
DECLARE c record;
BEGIN
    FOR c IN SELECT id FROM fue.carga_combustible WHERE eliminado_en IS NULL AND estado_validacion <> 'anulada' ORDER BY id LOOP
        PERFORM fue.fn_revisar_precio_carga(c.id);
    END LOOP;
END $do$;

-- -----------------------------------------------------------------------------
-- Permisos
-- -----------------------------------------------------------------------------
DO $do$
DECLARE g text; f text;
BEGIN
    FOREACH f IN ARRAY ARRAY['fue.fn_regla_precio()', 'fue.fn_evaluar_precio(bigint, timestamptz, text, numeric, numeric, text, bigint, bigint)',
                             'fue.fn_referencia_carga(bigint, timestamptz)', 'fue.fn_revisar_precio_carga(bigint)',
                             'fue.fn_cargas_precio_cierre(bigint)', 'ia.fn_lectura_cargas_precio(date, date)',
                             'fue.fn_tg_carga_moneda_precio()', 'fue.fn_tg_carga_precio_alerta()', 'fue.fn_tg_cierre_precio()'] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
        FOREACH g IN ARRAY ARRAY['anon', 'authenticated'] LOOP
            CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = g);
            EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', f, g);
        END LOOP;
        CONTINUE WHEN f LIKE '%fn_tg_%' OR f = 'fue.fn_revisar_precio_carga(bigint)';   -- solo las usa la base
        FOREACH g IN ARRAY ARRAY['tc_admin', 'tc_app', 'tc_lectura', 'tc_auditor'] LOOP
            CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = g);
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', f, g);
        END LOOP;
        FOR g IN SELECT DISTINCT pg_get_userbyid(p.proowner) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname IN ('fue','ops','tel','ana','fin','ia','mae','ven','seg') AND p.prosecdef LOOP
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', f, g);
        END LOOP;
    END LOOP;
END $do$;

UPDATE ref.parametro SET valor = '258' WHERE codigo = 'web.version_base' AND valor::text::int < 258;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- -----------------------------------------------------------------------------
-- Resultado: lo que quedó configurado y las cargas ya cargadas que hay que revisar
-- -----------------------------------------------------------------------------
SELECT 'configuración' AS que, NULL::bigint AS carga, NULL::text AS gravedad,
       format('tipo de alerta: %s · regla: %s · Iris: %s',
              (SELECT to_jsonb(t) - 'id' FROM ref.tipo_alerta t WHERE to_jsonb(t)->>'codigo' = 'PRECIO_FUERA_RANGO' LIMIT 1),
              (SELECT r.parametros FROM ana.regla_anomalia r WHERE r.codigo = 'PRECIO_FUERA_RANGO' LIMIT 1),
              CASE WHEN to_regprocedure('ia.fn_herramienta_base(text, jsonb)') IS NOT NULL THEN 'herramienta agregada' ELSE 'NO se agregó la herramienta (avisar)' END) AS detalle
UNION ALL
SELECT * FROM (
    SELECT 'carga para revisar', a.carga_id, a.severidad::text, a.evidencia->>'mensaje'
      FROM ana.alerta a
     WHERE a.huella IN (SELECT md5('PRECIO_FUERA_RANGO|' || c.id) FROM fue.carga_combustible c)
     ORDER BY a.carga_id) x;
