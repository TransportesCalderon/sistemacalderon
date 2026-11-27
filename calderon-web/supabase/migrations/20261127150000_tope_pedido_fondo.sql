-- =====================================================================================
-- Migración 386 · El chofer no pide más dinero que lo que va generando de sueldo
-- =====================================================================================
-- Pedido de Gerencia (27/11/2026): antes de dejar que el chofer pida dinero, analizar como un analista financiero cuánto
-- se le entregó, cuánto rindió y cuánto va generando de sueldo; que no pueda pedir si la plata sin rendir supera lo que
-- generó, y que avise cuando está llegando al límite. Si Operaciones pide por el chofer, lo deja.
-- Decisiones del usuario: lo generado = sueldo fijo proporcional + bono de los tramos hechos; se compara contra lo que le
-- queda en mano (descontando un 20 % de cargas legales); avisa al 80 %; Operaciones pide igual y ve el análisis.
--
-- La cuenta (por chofer, en el período de liquidación que corre hoy, todo en pesos chilenos al cambio de hoy):
--   · Generado = sueldo fijo × días que pasaron ÷ días del período + bono de los tramos incluidos + km × precio por km
--     (los mismos tramos que arma la liquidación: el borrador si existe; si no, uno de prueba que se deshace).
--   · En mano = generado × (1 − fin.ff_tope_descuento_pct %), 20 % de entrada.
--   · Comprometido = plata sin rendir (entregado − gastos subidos − devoluciones − cierres, desde fin.ff_control_desde,
--     el mismo corte de la 285) + otros pedidos abiertos + lo que pide ahora.
--   · Pasado: comprometido > en mano. Cerca: comprometido ≥ fin.ff_tope_aviso_pct % (80) de en mano.
--   · Sin datos (no hay tarifa ni tramos para calcular lo generado): no frena, solo avisa.
-- El chofer pasado no puede pedir (trigger); Operaciones sí, y el análisis queda guardado en el pedido
-- (fin.pedido_fondo.analisis) para quien lo revisa y lo autoriza. Se apaga con fin.ff_tope_activo = false.
-- No cambia datos ni web.version_base. Se puede correr más de una vez. Antes de terminar se prueba con los choferes de
-- esta base: si algo falla, no deja nada aplicado.
-- =====================================================================================
BEGIN;

DO $v$
BEGIN
    IF to_regclass('fin.pedido_fondo') IS NULL OR to_regprocedure('fin.fn_trabas_pedido_fondo(bigint)') IS NULL
       OR to_regprocedure('fin.fn_tramos_liquidacion(bigint)') IS NULL OR to_regprocedure('fin.fn_tarifa_en(bigint, date)') IS NULL
       OR to_regprocedure('fin.fn_rango_periodo(date)') IS NULL THEN
        RAISE EXCEPTION 'Faltan los pedidos de fondo (285) o las liquidaciones por tramo: avisar antes de seguir';
    END IF;
END $v$;

INSERT INTO ref.parametro (codigo, valor, descripcion)
SELECT x.codigo, x.valor, x.descripcion
  FROM (VALUES
    ('fin.ff_tope_activo', 'true'::jsonb, 'Migración 386: el chofer no puede pedir dinero si la plata sin rendir supera lo que va generando de sueldo. false = no controla.'),
    ('fin.ff_tope_descuento_pct', '20'::jsonb, 'Migración 386: lo que se descuenta de lo generado (AFP, salud, cesantía) para saber lo que le queda en mano al chofer, en %.'),
    ('fin.ff_tope_aviso_pct', '80'::jsonb, 'Migración 386: desde qué % de lo que le queda en mano se avisa que el chofer está llegando al límite.')
  ) x(codigo, valor, descripcion)
 WHERE NOT EXISTS (SELECT 1 FROM ref.parametro p WHERE p.codigo = x.codigo);

ALTER TABLE fin.pedido_fondo ADD COLUMN IF NOT EXISTS analisis jsonb;
COMMENT ON COLUMN fin.pedido_fondo.analisis IS 'Migración 386: el análisis del tope (generado, en mano, sin rendir, pedidos abiertos) al momento del pedido.';

-- ---------------------------------------------------------------------------------
-- La cuenta. Interna (no la llama la web directo). VOLATILE: arma un borrador de prueba y lo deshace.
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fin.fn_tope_fondo_calcular(p_chofer bigint, p_moneda text DEFAULT NULL, p_importe numeric DEFAULT 0, p_excluir bigint DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE
    v_hoy date := mae.fn_hoy();
    v_per date; r record; v_dias integer; v_pasados integer;
    v_fijo numeric; v_precio_km numeric; v_fijo_gen numeric := 0;
    v_liq bigint; v_n integer := 0; v_bono numeric := 0; v_km numeric := 0; v_fuente text;
    v_gen numeric; v_desc numeric; v_aviso numeric; v_en_mano numeric;
    v_desde date; v_sin jsonb; v_sin_clp numeric; v_abiertos numeric; v_pide numeric := 0; v_tc numeric;
    v_comp numeric; v_estado text; v_texto text; v_sin_cambio text[]; v_liq_fn text := current_setting('fin.liq_fn', true);
    v_moneda text := upper(nullif(btrim(coalesce(p_moneda, '')), ''));
    fmt constant text := 'FM999G999G999G990';
BEGIN
    -- El período de liquidación que corre hoy
    v_per := date_trunc('month', v_hoy)::date;
    SELECT * INTO r FROM fin.fn_rango_periodo(v_per);
    IF v_hoy > r.hasta THEN v_per := (v_per + interval '1 month')::date; SELECT * INTO r FROM fin.fn_rango_periodo(v_per); END IF;
    IF v_hoy < r.desde THEN v_per := (v_per - interval '1 month')::date; SELECT * INTO r FROM fin.fn_rango_periodo(v_per); END IF;
    v_dias := r.hasta - r.desde + 1;
    v_pasados := least(greatest(v_hoy - r.desde + 1, 0), v_dias);

    -- 1 · Lo generado: sueldo fijo proporcional + bono de los tramos + km
    SELECT t.sueldo_fijo, t.precio_km INTO v_fijo, v_precio_km FROM fin.fn_tarifa_en(p_chofer, v_hoy) t;
    v_fijo_gen := round(coalesce(v_fijo, 0) * v_pasados / v_dias);
    SELECT id INTO v_liq FROM fin.liquidacion_mensual
     WHERE chofer_id = p_chofer AND periodo = v_per AND estado = 'borrador' AND eliminado_en IS NULL ORDER BY id LIMIT 1;
    IF v_liq IS NOT NULL THEN
        v_fuente := 'borrador';
        SELECT count(*), coalesce(sum(x.canon_base), 0), coalesce(sum(x.km), 0) INTO v_n, v_bono, v_km
          FROM fin.fn_tramos_liquidacion(v_liq) x WHERE x.estado = 'incluido';
    ELSIF NOT EXISTS (SELECT 1 FROM fin.liquidacion_mensual WHERE chofer_id = p_chofer AND periodo = v_per AND eliminado_en IS NULL AND estado IN ('aprobada', 'pagada')) THEN
        v_fuente := 'estimado';
        BEGIN
            PERFORM set_config('fin.liq_fn', '1', true);
            INSERT INTO fin.liquidacion_mensual (numero, chofer_id, periodo, desde, hasta, moneda)
            VALUES ('TOPE-' || p_chofer, p_chofer, v_per, r.desde, r.hasta, ref.fn_moneda_base()) RETURNING id INTO v_liq;
            SELECT count(*), coalesce(sum(x.canon_base), 0), coalesce(sum(x.km), 0) INTO v_n, v_bono, v_km
              FROM fin.fn_tramos_liquidacion(v_liq) x WHERE x.estado = 'incluido';
            RAISE EXCEPTION 'deshacer' USING ERRCODE = 'ZZ386';   -- deshace el borrador de prueba; las variables quedan
        EXCEPTION
            WHEN SQLSTATE 'ZZ386' THEN NULL;
            WHEN OTHERS THEN v_n := 0; v_bono := 0; v_km := 0; v_fuente := 'sin_tramos';
        END;
        PERFORM set_config('fin.liq_fn', coalesce(v_liq_fn, ''), true);
    ELSE
        v_fuente := 'liquidacion_cerrada';
    END IF;
    v_gen := v_fijo_gen + round(coalesce(v_bono, 0)) + round(coalesce(v_km, 0) * coalesce(v_precio_km, 0));
    v_desc := least(greatest(ref.fn_parametro_num('fin.ff_tope_descuento_pct', 20), 0), 90);
    v_aviso := least(greatest(ref.fn_parametro_num('fin.ff_tope_aviso_pct', 80), 1), 100);
    v_en_mano := round(v_gen * (100 - v_desc) / 100);

    -- 2 · La plata sin rendir, por moneda y en pesos chilenos (desde el mismo corte que la 285)
    BEGIN
        v_desde := (SELECT valor #>> '{}' FROM ref.parametro WHERE codigo = 'fin.ff_control_desde' AND eliminado_en IS NULL)::date;
    EXCEPTION WHEN OTHERS THEN v_desde := NULL;
    END;
    SELECT coalesce(jsonb_agg(jsonb_build_object('moneda', z.moneda, 'saldo', z.saldo, 'clp', z.clp) ORDER BY z.moneda), '[]'::jsonb),
           coalesce(sum(z.clp), 0), array_remove(array_agg(CASE WHEN z.clp IS NULL THEN z.moneda END), NULL)
      INTO v_sin, v_sin_clp, v_sin_cambio
      FROM (SELECT m.moneda::text AS moneda,
                   sum(CASE WHEN m.tipo = 'entrega' AND m.estado = 'registrado' THEN m.importe
                            WHEN m.tipo IN ('devolucion', 'cierre') AND m.estado = 'registrado' THEN -m.importe
                            WHEN m.tipo = 'gasto' AND m.estado IN ('por_revisar', 'aprobado', 'apelado') THEN -m.importe ELSE 0 END) AS saldo,
                   round(sum(CASE WHEN m.tipo = 'entrega' AND m.estado = 'registrado' THEN m.importe
                                  WHEN m.tipo IN ('devolucion', 'cierre') AND m.estado = 'registrado' THEN -m.importe
                                  WHEN m.tipo = 'gasto' AND m.estado IN ('por_revisar', 'aprobado', 'apelado') THEN -m.importe ELSE 0 END)
                         * fin.fn_tc_clp_o_null(m.moneda::text, v_hoy)) AS clp
              FROM fin.movimiento_fondo_chofer m
             WHERE m.chofer_id = p_chofer AND m.eliminado_en IS NULL AND (v_desde IS NULL OR m.fecha >= v_desde)
             GROUP BY m.moneda) z
     WHERE z.saldo <> 0;

    -- 3 · Otros pedidos abiertos (van a ser plata entregada) y lo que pide ahora
    SELECT coalesce(sum(round(p.importe * fin.fn_tc_clp_o_null(p.moneda::text, v_hoy))), 0) INTO v_abiertos
      FROM fin.pedido_fondo p
     WHERE p.chofer_id = p_chofer AND p.estado IN ('solicitado', 'pendiente', 'aprobado') AND p.id IS DISTINCT FROM p_excluir;
    IF coalesce(p_importe, 0) > 0 AND v_moneda IS NOT NULL THEN
        v_tc := fin.fn_tc_clp_o_null(v_moneda, v_hoy);
        IF v_tc IS NULL THEN v_sin_cambio := v_sin_cambio || v_moneda; ELSE v_pide := round(p_importe * v_tc); END IF;
    END IF;
    v_comp := v_sin_clp + v_abiertos + v_pide;

    -- 4 · El veredicto
    v_estado := CASE WHEN v_gen <= 0 THEN 'sin_datos'
                     WHEN v_comp > v_en_mano THEN 'pasado'
                     WHEN v_comp >= v_en_mano * v_aviso / 100 THEN 'cerca'
                     ELSE 'ok' END;
    v_texto := CASE v_estado
        WHEN 'sin_datos' THEN 'No se puede calcular lo que va generando de sueldo (falta la tarifa y no hay tramos en el período): el tope no se controla.'
        WHEN 'pasado' THEN format('Pasado del límite: tiene %s CLP sin rendir%s%s y en lo que va del período generó %s CLP en mano. No puede pedir más hasta rendir sus gastos.',
                                  translate(to_char(v_sin_clp, fmt), ',', '.'),
                                  CASE WHEN v_abiertos > 0 THEN ', ' || translate(to_char(v_abiertos, fmt), ',', '.') || ' CLP en otros pedidos' ELSE '' END,
                                  CASE WHEN v_pide > 0 THEN ', pide ' || translate(to_char(v_pide, fmt), ',', '.') || ' CLP' ELSE '' END,
                                  translate(to_char(v_en_mano, fmt), ',', '.'))
        WHEN 'cerca' THEN format('Está llegando al límite de su liquidación: lo sin rendir%s llega al %s %% de lo que generó en mano (%s CLP). Que rinda sus gastos antes del próximo pedido.',
                                 CASE WHEN v_pide > 0 THEN ' más lo que pide' ELSE '' END,
                                 CASE WHEN v_en_mano > 0 THEN round(v_comp / v_en_mano * 100)::text ELSE '—' END,
                                 translate(to_char(v_en_mano, fmt), ',', '.'))
        ELSE format('Dentro del límite: lo sin rendir%s es el %s %% de lo que generó en mano (%s CLP).',
                    CASE WHEN v_pide > 0 THEN ' más lo que pide' ELSE '' END,
                    CASE WHEN v_en_mano > 0 THEN round(greatest(v_comp, 0) / v_en_mano * 100)::text ELSE '0' END,
                    translate(to_char(v_en_mano, fmt), ',', '.')) END;

    RETURN jsonb_build_object(
        'estado', v_estado, 'texto', v_texto,
        'periodo', v_per, 'desde', r.desde, 'hasta', r.hasta, 'dias', v_dias, 'dias_pasados', v_pasados,
        'sueldo_fijo_mes', v_fijo, 'fijo_generado', v_fijo_gen, 'tramos', v_n, 'bono', round(coalesce(v_bono, 0)),
        'km', round(coalesce(v_km, 0)), 'adicional_km', round(coalesce(v_km, 0) * coalesce(v_precio_km, 0)), 'fuente_tramos', v_fuente,
        'generado', v_gen, 'descuento_pct', v_desc, 'en_mano', v_en_mano, 'aviso_pct', v_aviso,
        'sin_rendir', v_sin, 'sin_rendir_clp', v_sin_clp, 'sin_rendir_desde', v_desde, 'pedidos_abiertos_clp', v_abiertos,
        'pide', CASE WHEN v_pide > 0 THEN jsonb_build_object('moneda', v_moneda, 'importe', p_importe, 'clp', v_pide) END,
        'comprometido_clp', v_comp, 'margen_clp', v_en_mano - v_comp,
        'usado_pct', CASE WHEN v_en_mano > 0 THEN round(greatest(v_comp, 0) / v_en_mano * 100) END,
        'puede_pedir_hasta_clp', greatest(v_en_mano - v_sin_clp - v_abiertos, 0),
        'monedas_sin_cambio', CASE WHEN cardinality(v_sin_cambio) > 0 THEN to_jsonb(v_sin_cambio) END,
        'calculado_en', now());
END $f$;
COMMENT ON FUNCTION fin.fn_tope_fondo_calcular(bigint, text, numeric, bigint) IS
    'Migración 386: análisis del tope de un pedido de dinero: lo generado de sueldo en el período (en mano), lo sin rendir, los pedidos abiertos y lo que pide; estado ok, cerca, pasado o sin_datos. Interna.';

-- ---------------------------------------------------------------------------------
-- El pedido: guarda el análisis y frena al chofer pasado del límite (Operaciones pide igual)
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fin.fn_pedido_fondo_tope()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE a jsonb;
BEGIN
    IF coalesce((SELECT valor::text FROM ref.parametro WHERE codigo = 'fin.ff_tope_activo' AND eliminado_en IS NULL), 'true') <> 'true' THEN
        RETURN NEW;
    END IF;
    a := fin.fn_tope_fondo_calcular(NEW.chofer_id, NEW.moneda::text, NEW.importe, NULL);
    NEW.analisis := a || jsonb_build_object('pedido_por', CASE WHEN NEW.pedido_por_chofer THEN 'chofer' ELSE 'oficina' END);
    IF NEW.pedido_por_chofer AND a ->> 'estado' = 'pasado' THEN
        IF (a ->> 'puede_pedir_hasta_clp')::numeric > 0 THEN
            RAISE EXCEPTION 'Con ese monto te pasás del límite: hoy podés pedir hasta % CLP. Si necesitás más, hablá con Operaciones.',
                  translate(to_char((a ->> 'puede_pedir_hasta_clp')::numeric, 'FM999,999,999,990'), ',', '.')
                USING ERRCODE = '55000', DETAIL = a ->> 'texto';
        END IF;
        RAISE EXCEPTION 'Todavía no podés pedir dinero: la plata que tenés sin rendir supera lo que llevás generado de sueldo este mes. Subí tus gastos o devolvé lo que no usaste. Si es urgente, hablá con Operaciones.'
            USING ERRCODE = '55000', DETAIL = a ->> 'texto';
    END IF;
    RETURN NEW;
END $f$;

DROP TRIGGER IF EXISTS tg_08_tope ON fin.pedido_fondo;
CREATE TRIGGER tg_08_tope BEFORE INSERT ON fin.pedido_fondo FOR EACH ROW EXECUTE FUNCTION fin.fn_pedido_fondo_tope();

-- ---------------------------------------------------------------------------------
-- Lecturas para la web
-- ---------------------------------------------------------------------------------
-- El chofer: cómo está antes de pedir (con el monto que está escribiendo, si lo hay)
CREATE OR REPLACE FUNCTION fin.fn_mi_tope_fondo(p_moneda text DEFAULT NULL, p_importe numeric DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE a jsonb;
BEGIN
    IF coalesce((SELECT valor::text FROM ref.parametro WHERE codigo = 'fin.ff_tope_activo' AND eliminado_en IS NULL), 'true') <> 'true' THEN
        RETURN NULL;
    END IF;
    a := fin.fn_tope_fondo_calcular(ops.fn_exigir_mi_chofer(), p_moneda, coalesce(p_importe, 0), NULL);
    -- El mismo análisis, dicho al chofer
    RETURN a || jsonb_build_object('texto_chofer', CASE a ->> 'estado'
        WHEN 'pasado' THEN CASE WHEN (a ->> 'puede_pedir_hasta_clp')::numeric > 0
            THEN format('Con ese monto te pasás del límite: hoy podés pedir hasta %s CLP (lo que llevás generado de sueldo en mano este mes, menos lo que tenés sin rendir y en pedidos sin cobrar).',
                        translate(to_char((a ->> 'puede_pedir_hasta_clp')::numeric, 'FM999,999,999,990'), ',', '.'))
            ELSE format('Todavía no podés pedir dinero: tenés %s CLP sin rendir%s y en lo que va del mes llevás generado %s CLP de sueldo en mano. Subí tus gastos o devolvé lo que no usaste.',
                                  translate(to_char((a ->> 'sin_rendir_clp')::numeric, 'FM999,999,999,990'), ',', '.'),
                                  CASE WHEN (a ->> 'pedidos_abiertos_clp')::numeric > 0
                                       THEN ', ' || translate(to_char((a ->> 'pedidos_abiertos_clp')::numeric, 'FM999,999,999,990'), ',', '.') || ' CLP en pedidos sin cobrar' ELSE '' END
                                  || CASE WHEN a ? 'pide' AND a -> 'pide' <> 'null' THEN ', estás pidiendo ' || translate(to_char((a #>> '{pide,clp}')::numeric, 'FM999,999,999,990'), ',', '.') || ' CLP' ELSE '' END,
                                  translate(to_char((a ->> 'en_mano')::numeric, 'FM999,999,999,990'), ',', '.')) END
        WHEN 'cerca' THEN format('Ojo: estás llegando al límite de tu liquidación (%s %% de lo que llevás generado en mano). Rendí tus gastos antes del próximo pedido.', a ->> 'usado_pct')
        WHEN 'ok' THEN format('Podés pedir hasta %s CLP sin pasarte de lo que llevás generado este mes.',
                              translate(to_char((a ->> 'puede_pedir_hasta_clp')::numeric, 'FM999,999,999,990'), ',', '.'))
        END);
END $f$;

-- La oficina: el análisis de un chofer (para pedir por él) …
CREATE OR REPLACE FUNCTION fin.fn_tope_fondo_chofer(p_chofer bigint, p_moneda text DEFAULT NULL, p_importe numeric DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
BEGIN
    IF NOT (fin.fn_puedo_aprobar_fondos() OR fin.fn_puedo_depositar_fondos() OR fin.fn_puedo_pedir_fondos()
            OR EXISTS (SELECT 1 FROM seg.usuario_rol WHERE usuario_id = aud.fn_usuario_actual() AND rol_codigo IN ('gerencia', 'auditor'))) THEN
        RAISE EXCEPTION 'No tenés acceso a los pedidos de FF Chofer' USING ERRCODE = '42501';
    END IF;
    IF coalesce((SELECT valor::text FROM ref.parametro WHERE codigo = 'fin.ff_tope_activo' AND eliminado_en IS NULL), 'true') <> 'true' THEN
        RETURN NULL;
    END IF;
    RETURN fin.fn_tope_fondo_calcular(p_chofer, p_moneda, coalesce(p_importe, 0), NULL);
END $f$;

-- … y el análisis guardado de cada pedido sin pagar (el de cuando se pidió)
CREATE OR REPLACE FUNCTION fin.fn_analisis_de_pedidos()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
BEGIN
    IF NOT (fin.fn_puedo_aprobar_fondos() OR fin.fn_puedo_depositar_fondos() OR fin.fn_puedo_pedir_fondos()
            OR EXISTS (SELECT 1 FROM seg.usuario_rol WHERE usuario_id = aud.fn_usuario_actual() AND rol_codigo IN ('gerencia', 'auditor'))) THEN
        RAISE EXCEPTION 'No tenés acceso a los pedidos de FF Chofer' USING ERRCODE = '42501';
    END IF;
    RETURN coalesce((SELECT jsonb_object_agg(p.id::text, p.analisis) FROM fin.pedido_fondo p
                      WHERE p.estado IN ('solicitado', 'pendiente', 'aprobado') AND p.analisis IS NOT NULL), '{}'::jsonb);
END $f$;

-- Permisos: como las lecturas vecinas de la 285 (sin PUBLIC); la cuenta y el trigger, internos
DO $p$
DECLARE g text; x record;
BEGIN
    FOR x IN SELECT * FROM (VALUES ('fin.fn_mi_tope_fondo(text, numeric)', 'fin.fn_mis_trabas_pedido_fondo()'),
                                   ('fin.fn_tope_fondo_chofer(bigint, text, numeric)', 'fin.fn_trabas_de_pedidos()'),
                                   ('fin.fn_analisis_de_pedidos()', 'fin.fn_trabas_de_pedidos()'),
                                   ('fin.fn_tope_fondo_calcular(bigint, text, numeric, bigint)', NULL),
                                   ('fin.fn_pedido_fondo_tope()', NULL)) v(fn, de) LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', x.fn);
        FOR g IN SELECT r.rolname FROM pg_roles r WHERE r.rolname LIKE 'tc\_%' OR r.rolname IN ('authenticated', 'anon') LOOP
            IF x.de IS NOT NULL AND has_function_privilege(g, x.de, 'EXECUTE') THEN
                EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', x.fn, g);
            ELSE
                EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', x.fn, g);
            END IF;
        END LOOP;
    END LOOP;
END $p$;

-- ---------------------------------------------------------------------------------
-- Prueba con los choferes de esta base (solo lee: los borradores de prueba se deshacen)
-- ---------------------------------------------------------------------------------
DO $t$
DECLARE c record; a jsonb; v_liq_antes bigint := (SELECT count(*) FROM fin.liquidacion_mensual);
BEGIN
    FOR c IN SELECT ch.id FROM mae.chofer ch WHERE ch.eliminado_en IS NULL ORDER BY ch.id LIMIT 40 LOOP
        a := fin.fn_tope_fondo_calcular(c.id, 'CLP', 1000, NULL);
        IF a ->> 'estado' NOT IN ('ok', 'cerca', 'pasado', 'sin_datos') THEN RAISE EXCEPTION 'chofer %: estado %', c.id, a ->> 'estado'; END IF;
        IF (a ->> 'comprometido_clp')::numeric <> (a ->> 'sin_rendir_clp')::numeric + (a ->> 'pedidos_abiertos_clp')::numeric + coalesce((a #>> '{pide,clp}')::numeric, 0) THEN
            RAISE EXCEPTION 'chofer %: lo comprometido no cierra', c.id;
        END IF;
    END LOOP;
    IF (SELECT count(*) FROM fin.liquidacion_mensual) <> v_liq_antes THEN RAISE EXCEPTION 'quedó un borrador de prueba guardado'; END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'La migración 386 no pasó su prueba (%). No se aplicó nada: avisar antes de seguir.', SQLERRM;
END $t$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Resultado: cómo están hoy los choferes con plata sin rendir o pedidos abiertos
WITH c AS (
    SELECT fin.fn_tope_fondo_calcular(ch.id, NULL, 0, NULL) AS a
      FROM mae.chofer ch
     WHERE ch.eliminado_en IS NULL AND (ch.fecha_egreso IS NULL OR ch.fecha_egreso >= mae.fn_hoy())
)
SELECT 'migración 386 aplicada' AS que,
       count(*) FILTER (WHERE a ->> 'estado' = 'pasado') AS choferes_pasados_del_limite,
       count(*) FILTER (WHERE a ->> 'estado' = 'cerca') AS choferes_cerca_del_limite,
       count(*) FILTER (WHERE a ->> 'estado' = 'ok') AS choferes_dentro_del_limite,
       count(*) FILTER (WHERE a ->> 'estado' = 'sin_datos') AS choferes_sin_datos_para_calcular,
       coalesce(sum((a ->> 'sin_rendir_clp')::numeric), 0) AS sin_rendir_total_clp
  FROM c;
