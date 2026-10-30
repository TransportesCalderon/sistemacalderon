-- =============================================================================
-- IronTrack — 133 · Cierres de viaje obligatorios
-- -----------------------------------------------------------------------------
-- Pedido de Gerencia (30/10/2026): muchos cierres de viaje no se hicieron. Desde ahora:
--   · Sin tolerancia: fue.cierre_tolerancia_camion_l = 0 (toda diferencia sin justificar se
--     descuenta al chofer) y nada se aprueba solo: cada cierre lo revisa una persona.
--   · Plazo: 24 h desde que el camión llega (fue.cierre_plazo_horas). Pasado el plazo, el
--     cierre está VENCIDO: primero en «Cierres por hacer», en «Hoy» y en el informe de Iris.
--   · Bloqueos (desde fue.cierre_bloqueo_desde, para dar tiempo a ponerse al día):
--       - A un tractor con cierres vencidos no se le asigna equipo para otra operación ni se le
--         inicia otro viaje de chofer a mano (Gerencia puede igual; el viaje automático por la
--         carga a tanque lleno y la importación de RedLine no se frenan).
--       - No se aprueba la liquidación de un chofer con viajes sin cierre hasta fin de ese mes.
--   · «Cierres por hacer» muestra también los viajes que no tienen viaje de chofer (por ejemplo,
--     los de antes de los viajes automáticos), con el botón para armar su cierre.
-- Cuentan los viajes que llegaron desde fue.cierre_obligatorio_desde (01/10/2026).
-- Los parámetros nuevos son configuración (no datos de ejemplo). web.version_base = 133.
-- =============================================================================
SET search_path = public, extensions;
BEGIN;

DO $do$
BEGIN
    IF position('numero_operacion DESC' in pg_get_functiondef('ven.fn_por_facturar()'::regprocedure)) = 0 THEN
        RAISE EXCEPTION 'Falta la migración 132 (117_operaciones_por_numero.sql): aplicarla antes';
    END IF;
    IF to_regprocedure('fue.fn_cierres_pendientes()') IS NOT NULL THEN
        RAISE EXCEPTION 'La migración 133 ya está aplicada (existe fue.fn_cierres_pendientes)';
    END IF;
END $do$;

-- -----------------------------------------------------------------------------
-- Configuración
-- -----------------------------------------------------------------------------
UPDATE ref.parametro SET valor = '0' WHERE codigo = 'fue.cierre_tolerancia_camion_l';
INSERT INTO ref.parametro (codigo, valor, descripcion)
SELECT 'fue.cierre_tolerancia_camion_l', '0'::jsonb, 'Litros de diferencia del camión que no se descuentan al chofer. 0 = sin tolerancia (Gerencia, 30/10/2026).'
 WHERE NOT EXISTS (SELECT 1 FROM ref.parametro WHERE codigo = 'fue.cierre_tolerancia_camion_l');
INSERT INTO ref.parametro (codigo, valor, descripcion) VALUES
    ('fue.cierre_plazo_horas', '24'::jsonb,
     'Migración 133: horas desde que llega el camión (carga a tanque lleno de llegada) para hacer el cierre del viaje. Después queda vencido.'),
    ('fue.cierre_obligatorio_desde', '"2026-10-01"'::jsonb,
     'Migración 133: los viajes que llegaron desde esta fecha tienen que tener cierre (plazo, vencidos y bloqueos).'),
    ('fue.cierre_bloqueo_desde', '"2026-11-02T00:00:00-03:00"'::jsonb,
     'Migración 133: desde cuándo se bloquean el equipo/viaje de un tractor con cierres vencidos y la liquidación de un chofer con viajes sin cierre. Antes, solo avisa.');

-- -----------------------------------------------------------------------------
-- Viajes terminados que todavía no tienen el cierre aprobado (desde la fecha obligatoria)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fue.fn_cierres_pendientes()
RETURNS TABLE (camion_id bigint, patente text, chofer_id bigint, carga_salida_id bigint, salida_ts timestamptz, llegada_ts timestamptz,
               cierre_id bigint, cierre_numero text, situacion text, viaje_chofer_id bigint, horas numeric, vencido boolean)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, extensions AS $$
    SELECT w.camion_id, w.patente::text, coalesce(vc.chofer_id, cv.chofer_responsable_id, cs.chofer_id), w.carga_salida_id, w.salida_ts, w.llegada_ts,
           w.cierre_id, w.cierre_numero::text, w.situacion, vc.id,
           round((extract(epoch FROM (now() - w.llegada_ts)) / 3600)::numeric, 1),
           now() - w.llegada_ts > make_interval(hours => coalesce((SELECT (valor #>> '{}')::integer FROM ref.parametro
                                                                     WHERE codigo = 'fue.cierre_plazo_horas' AND eliminado_en IS NULL), 24))
      FROM fue.v_viaje w
      LEFT JOIN fue.cierre_viaje cv ON cv.id = w.cierre_id
      LEFT JOIN fue.carga_combustible cs ON cs.id = w.carga_salida_id
      LEFT JOIN LATERAL (SELECT x.id, x.chofer_id FROM ops.viaje_chofer x
                          WHERE x.carga_salida_id = w.carga_salida_id AND x.eliminado_en IS NULL AND x.estado <> 'anulado'
                          ORDER BY x.id DESC LIMIT 1) vc ON true
     WHERE w.llegada_ts IS NOT NULL
       AND w.situacion IN ('sin_cierre', 'borrador', 'cierre_desactualizado')
       AND w.llegada_ts >= coalesce((SELECT (valor #>> '{}')::date FROM ref.parametro
                                      WHERE codigo = 'fue.cierre_obligatorio_desde' AND eliminado_en IS NULL), DATE '2026-10-01')
$$;

-- ¿Ya rigen los bloqueos?
CREATE OR REPLACE FUNCTION fue.fn_bloqueo_cierres_activo()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, extensions AS $$
    SELECT now() >= coalesce((SELECT (valor #>> '{}')::timestamptz FROM ref.parametro
                               WHERE codigo = 'fue.cierre_bloqueo_desde' AND eliminado_en IS NULL), '-infinity'::timestamptz)
$$;

-- Un tractor con cierres vencidos no sale a otro viaje (salvo Gerencia, el viaje automático y RedLine)
CREATE OR REPLACE FUNCTION ops.fn_exigir_cierres_al_dia(p_camion bigint)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, extensions AS $$
DECLARE v_n integer; v_lista text; v_pat text;
BEGIN
    IF p_camion IS NULL OR NOT fue.fn_bloqueo_cierres_activo()
       OR current_setting('ops.viaje_automatico', true) = '1' OR current_setting('ops.importando_redline', true) = '1'
       OR EXISTS (SELECT 1 FROM seg.usuario_rol WHERE usuario_id = aud.fn_usuario_actual() AND rol_codigo = 'gerencia') THEN
        RETURN;
    END IF;
    SELECT count(*), string_agg(to_char(p.salida_ts AT TIME ZONE 'America/Argentina/Mendoza', 'DD/MM') || ' → '
                                || to_char(p.llegada_ts AT TIME ZONE 'America/Argentina/Mendoza', 'DD/MM'), ', ' ORDER BY p.salida_ts),
           max(p.patente)
      INTO v_n, v_lista, v_pat
      FROM fue.fn_cierres_pendientes() p WHERE p.camion_id = p_camion AND p.vencido;
    IF v_n > 0 THEN
        RAISE EXCEPTION 'El tractor % tiene % cierre(s) de viaje vencido(s) (%): hacelos en Viajes › Cierres por hacer antes de darle otro viaje',
            v_pat, v_n, v_lista USING ERRCODE = '55000';
    END IF;
END $$;

-- «Cierres por hacer»: plazo, vencidos primero y los viajes sin viaje de chofer
CREATE OR REPLACE FUNCTION ops.fn_cierres_por_hacer(p_dias integer DEFAULT 120)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
    x record; k record; cv record; res jsonb; v_falta text[]; v_falta_viaje text[]; v_etapa text; v_imp numeric; v_out jsonb := '[]';
    v_cands integer; p record; v_plazo numeric := ref.fn_parametro_num('fue.cierre_plazo_horas', 24);
    v_pmap jsonb := (SELECT coalesce(jsonb_object_agg(q.carga_salida_id::text, jsonb_build_object('horas', q.horas, 'vencido', q.vencido)), '{}')
                       FROM fue.fn_cierres_pendientes() q);
BEGIN
    FOR x IN
        SELECT v.*, c.patente
          FROM ops.viaje_chofer v
          JOIN mae.camion c ON c.id = v.camion_id
         WHERE v.eliminado_en IS NULL AND v.estado IN ('abierto','cerrado')
           AND v.salida_ts > now() - make_interval(days => greatest(coalesce(p_dias, 120), 7))
           AND NOT EXISTS (SELECT 1 FROM fue.cierre_viaje z WHERE z.carga_salida_id = v.carga_salida_id
                             AND z.estado = 'aprobado' AND z.eliminado_en IS NULL)
         ORDER BY v.salida_ts
    LOOP
        v_falta := '{}'; res := NULL; v_imp := NULL;
        SELECT * INTO k FROM ops.fn_corte_siguiente(x.camion_id, x.salida_ts);
        SELECT z.id, z.numero, z.estado INTO cv FROM fue.cierre_viaje z
         WHERE z.carga_salida_id = x.carga_salida_id AND z.estado <> 'anulado' AND z.eliminado_en IS NULL;
        -- Migración 82: lo del viaje del chofer (operaciones, canon, km) se informa aparte; el cierre es solo combustible
        v_falta_viaje := '{}';
        IF x.estado = 'abierto' THEN
            v_falta_viaje := array_remove(ops.fn_pendientes_viaje_chofer(x.id), 'Falta la carga a tanque lleno de llegada (corte de viaje) del tractor');
            IF k.carga_id IS NULL THEN
                v_falta := ARRAY['Falta la carga a tanque lleno de llegada (corte de viaje) del tractor'];
            END IF;
        END IF;
        IF k.carga_id IS NULL AND x.estado = 'abierto' THEN
            v_etapa := 'en_viaje';
            v_falta := array_remove(v_falta, 'Falta la carga a tanque lleno de llegada (corte de viaje) del tractor');
        ELSE
            IF cv.id IS NULL THEN
                v_falta := v_falta || 'Falta armar el cierre de combustible: abrí el viaje'::text;
            ELSE
                res := fue.fn_resultado_cierre(cv.id);
                v_falta := v_falta || ARRAY(SELECT e ->> 'mensaje' FROM jsonb_array_elements(coalesce(res -> 'pendientes', '[]')) e);
                v_imp := (res ->> 'imputable_total_l')::numeric;
            END IF;
            v_etapa := CASE WHEN cardinality(v_falta) > 0 THEN 'faltan_datos'
                            WHEN coalesce(v_imp, 0) > 0 THEN 'con_diferencia' ELSE 'listo' END;
        END IF;
        v_cands := CASE WHEN x.estado = 'abierto' AND NOT EXISTS (SELECT 1 FROM ops.viaje_chofer_item i WHERE i.viaje_id = x.id)
                        THEN (SELECT count(*) FROM ops.fn_operaciones_del_viaje(x.id))::integer ELSE 0 END;
        v_out := v_out || jsonb_build_object(
            'viaje_id', x.id, 'numero', x.numero, 'version', x.version_fila, 'estado_viaje', x.estado,
            'camion_id', x.camion_id, 'patente', x.patente, 'chofer', ops.fn_nombre_chofer(x.chofer_id),
            'salida', x.salida_ts, 'llegada', coalesce(x.llegada_ts, k.fecha_hora),
            'dias', round(extract(epoch FROM (coalesce(x.llegada_ts, k.fecha_hora, now()) - x.salida_ts)) / 86400, 1),
            'etapa', v_etapa, 'faltan', to_jsonb(v_falta), 'faltan_viaje', to_jsonb(v_falta_viaje), 'operaciones_para_agregar', v_cands,
            'cierre_id', cv.id, 'cierre_numero', cv.numero,
            'a_descontar_l', v_imp, 'diferencia_l', res #>> '{camion,diferencia_l}', 'tolerancia_l', res #>> '{camion,tolerancia_l}',
            'km', res #>> '{camion,km_recorridos}', 'consumo_l', res #>> '{camion,consumo_plataforma_l}',
            -- Migración 133: plazo para cerrar desde la llegada
            'carga_salida_id', x.carga_salida_id,
            'horas', v_pmap #> ARRAY[x.carga_salida_id::text, 'horas'],
            'vencido', coalesce((v_pmap #>> ARRAY[x.carga_salida_id::text, 'vencido'])::boolean, false), 'plazo_horas', v_plazo);
    END LOOP;
    -- Migración 133: viajes terminados que no tienen viaje de chofer (por ejemplo, de antes de los viajes
    -- automáticos): también se tienen que cerrar
    FOR p IN SELECT q.* FROM fue.fn_cierres_pendientes() q
              WHERE q.viaje_chofer_id IS NULL AND q.salida_ts > now() - make_interval(days => greatest(coalesce(p_dias, 120), 7))
              ORDER BY q.salida_ts
    LOOP
        v_out := v_out || jsonb_build_object(
            'viaje_id', NULL, 'numero', NULL, 'version', NULL, 'estado_viaje', 'cerrado', 'sin_viaje_chofer', true,
            'camion_id', p.camion_id, 'patente', p.patente, 'chofer', ops.fn_nombre_chofer(p.chofer_id),
            'salida', p.salida_ts, 'llegada', p.llegada_ts,
            'dias', round(extract(epoch FROM (p.llegada_ts - p.salida_ts)) / 86400, 1),
            'etapa', 'faltan_datos',
            'faltan', jsonb_build_array(CASE WHEN p.cierre_id IS NULL THEN 'Falta armar el cierre de combustible: tocá «Armar el cierre»'
                                             WHEN p.situacion = 'cierre_desactualizado' THEN 'El cierre quedó desactualizado (cambió la carga de llegada): anulalo y armalo de nuevo'
                                             ELSE 'El cierre está en borrador: abrilo, completalo y aprobalo' END),
            'faltan_viaje', '[]'::jsonb, 'operaciones_para_agregar', 0,
            'cierre_id', p.cierre_id, 'cierre_numero', p.cierre_numero,
            'carga_salida_id', p.carga_salida_id, 'horas', p.horas, 'vencido', p.vencido, 'plazo_horas', v_plazo);
    END LOOP;
    -- Primero los vencidos (migración 133)
    RETURN (SELECT coalesce(jsonb_agg(e ORDER BY (e ->> 'vencido')::boolean DESC NULLS LAST, CASE e ->> 'etapa' WHEN 'listo' THEN 0 WHEN 'con_diferencia' THEN 1 WHEN 'faltan_datos' THEN 2 ELSE 3 END,
                                       e ->> 'salida'), '[]'::jsonb)
              FROM jsonb_array_elements(v_out) e);
END $function$;

-- -----------------------------------------------------------------------------
-- Bloqueos y avisos en las funciones existentes
-- -----------------------------------------------------------------------------
DO $do$
DECLARE v text; n text;
BEGIN
    -- 1 · Asignar equipo a una operación
    v := pg_get_functiondef('ops.fn_asignar_equipo(bigint,bigint,bigint,bigint,text)'::regprocedure);
    n := replace(v, $a$    PERFORM ops.fn_validar_equipo(p_semi, p_camion, p_chofer);
$a$, $a$    PERFORM ops.fn_validar_equipo(p_semi, p_camion, p_chofer);
    PERFORM ops.fn_exigir_cierres_al_dia(p_camion);   -- Migración 133
$a$);
    IF n = v THEN RAISE EXCEPTION 'No se pudo ajustar ops.fn_asignar_equipo (cambió su texto)'; END IF;
    EXECUTE n;

    -- 2 · Iniciar un viaje de chofer a mano
    v := pg_get_functiondef('ops.fn_iniciar_viaje_chofer(bigint,bigint,bigint,jsonb,text)'::regprocedure);
    n := replace(v, $a$        RAISE EXCEPTION 'El tractor % está en el viaje %: primero tiene que registrar la carga a tanque lleno de llegada', c.patente, v_otro
            USING ERRCODE = '55000';
    END IF;
$a$, $a$        RAISE EXCEPTION 'El tractor % está en el viaje %: primero tiene que registrar la carga a tanque lleno de llegada', c.patente, v_otro
            USING ERRCODE = '55000';
    END IF;
    PERFORM ops.fn_exigir_cierres_al_dia(p_camion);   -- Migración 133
$a$);
    IF n = v THEN RAISE EXCEPTION 'No se pudo ajustar ops.fn_iniciar_viaje_chofer (cambió su texto)'; END IF;
    EXECUTE n;

    -- 3 · El viaje automático (carga a tanque lleno) no se frena: el camión ya salió
    v := pg_get_functiondef('ops.fn_iniciar_viaje_automatico(bigint)'::regprocedure);
    n := replace(v, $a$    v_id := ops.fn_iniciar_viaje_chofer($a$, $a$    PERFORM set_config('ops.viaje_automatico', '1', true);   -- Migración 133: no lo frenan los cierres vencidos
    v_id := ops.fn_iniciar_viaje_chofer($a$);
    n := replace(n, $a$    RETURN (SELECT numero FROM ops.viaje_chofer WHERE id = v_id);$a$,
                    $a$    PERFORM set_config('ops.viaje_automatico', '', true);
    RETURN (SELECT numero FROM ops.viaje_chofer WHERE id = v_id);$a$);
    IF n = v OR position('ops.viaje_automatico'', '''',' in n) = 0 THEN RAISE EXCEPTION 'No se pudo ajustar ops.fn_iniciar_viaje_automatico (cambió su texto)'; END IF;
    EXECUTE n;

    -- 4 · Liquidación del chofer
    v := pg_get_functiondef('fin.fn_aprobar_liquidacion(bigint,integer)'::regprocedure);
    n := replace(v, $a$    IF l.estado <> 'borrador' THEN RAISE EXCEPTION 'Solo se aprueba un borrador (está %)', l.estado USING ERRCODE = '55000'; END IF;
$a$, $a$    IF l.estado <> 'borrador' THEN RAISE EXCEPTION 'Solo se aprueba un borrador (está %)', l.estado USING ERRCODE = '55000'; END IF;
    -- Migración 133: sin cierres de viaje pendientes del chofer hasta fin del mes liquidado
    IF fue.fn_bloqueo_cierres_activo() THEN
        SELECT count(*) INTO v_n FROM fue.fn_cierres_pendientes() p
         WHERE p.chofer_id = l.chofer_id AND p.llegada_ts < ((date_trunc('month', l.periodo) + interval '1 month')::date)::timestamp AT TIME ZONE 'America/Argentina/Mendoza';
        IF v_n > 0 THEN
            RAISE EXCEPTION 'El chofer tiene % viaje(s) sin cierre de combustible aprobado: hacelos en Viajes › Cierres por hacer antes de aprobar la liquidación', v_n
                USING ERRCODE = '55000';
        END IF;
    END IF;
$a$);
    IF n = v THEN RAISE EXCEPTION 'No se pudo ajustar fin.fn_aprobar_liquidacion (cambió su texto)'; END IF;
    EXECUTE n;

    -- 5 · «Hoy»: los vencidos, con el plazo
    v := pg_get_functiondef('fue.fn_mis_pendientes()'::regprocedure);
    n := replace(v, $a$    SELECT count(*) INTO v_n FROM fue.v_viaje WHERE situacion IN ('sin_cierre', 'cierre_desactualizado');
    IF v_n > 0 THEN
        RETURN QUERY SELECT 'revisar', 'viajes_sin_cierre', NULL::bigint, NULL::timestamptz,
            format('%s viaje(s) terminado(s) sin cierre al día', v_n), 'Armá el cierre del viaje',
            '/combustible/viajes', 'combustible.cierre_viaje', v_n;
    END IF;$a$, $a$    -- Migración 133: los vencidos (más del plazo desde la llegada) van primero y avisan del bloqueo
    SELECT count(*) INTO v_n FROM fue.fn_cierres_pendientes() p WHERE p.vencido;
    IF v_n > 0 THEN
        RETURN QUERY SELECT 'revisar', 'cierres_vencidos', NULL::bigint, (SELECT min(p.llegada_ts) FROM fue.fn_cierres_pendientes() p WHERE p.vencido),
            format('%s cierre(s) de viaje vencido(s)', v_n),
            format('Pasaron más de %s h desde que llegó el camión. Con cierres vencidos el tractor no puede salir a otro viaje', ref.fn_parametro_num('fue.cierre_plazo_horas', 24)),
            '/analisis/cierres/por-hacer', 'combustible.cierre_viaje', v_n;
    END IF;
    SELECT count(*) INTO v_n FROM fue.fn_cierres_pendientes() p WHERE NOT p.vencido;
    IF v_n > 0 THEN
        RETURN QUERY SELECT 'revisar', 'viajes_sin_cierre', NULL::bigint, NULL::timestamptz,
            format('%s viaje(s) terminado(s) sin cierre', v_n),
            format('Hacelo dentro de las %s h desde que llegó el camión', ref.fn_parametro_num('fue.cierre_plazo_horas', 24)),
            '/analisis/cierres/por-hacer', 'combustible.cierre_viaje', v_n;
    END IF;$a$);
    IF n = v THEN RAISE EXCEPTION 'No se pudo ajustar fue.fn_mis_pendientes (cambió su texto)'; END IF;
    EXECUTE n;

    -- 6 · Informe semanal de Iris: los vencidos, primero en «Para hacer esta semana»
    v := pg_get_functiondef('ia.fn_instrucciones_informe(date,date)'::regprocedure);
    n := replace(v, $a$'«Para hacer esta semana» (lista corta de acciones concretas, máximo 6). '$a$,
                    $a$'«Para hacer esta semana» (lista corta de acciones concretas, máximo 6). '
        || 'Si en «cierres_por_hacer» hay viajes con vencido = true, lo primero de esa lista es hacerlos: decí cuántos son y nombrá patente, chofer y horas desde la llegada (el tractor no puede salir a otro viaje hasta cerrarlos). '$a$);
    IF n = v THEN RAISE EXCEPTION 'No se pudo ajustar ia.fn_instrucciones_informe (cambió su texto)'; END IF;
    EXECUTE n;
END $do$;

-- -----------------------------------------------------------------------------
-- Permisos
-- -----------------------------------------------------------------------------
DO $do$
DECLARE g text; f text;
BEGIN
    FOREACH f IN ARRAY ARRAY['fue.fn_cierres_pendientes()', 'fue.fn_bloqueo_cierres_activo()', 'ops.fn_exigir_cierres_al_dia(bigint)'] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
        FOREACH g IN ARRAY ARRAY['anon', 'authenticated'] LOOP
            CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = g);
            EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', f, g);
        END LOOP;
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

UPDATE ref.parametro SET valor = '133' WHERE codigo = 'web.version_base' AND valor::text::int < 133;

NOTIFY pgrst, 'reload schema';

COMMIT;
