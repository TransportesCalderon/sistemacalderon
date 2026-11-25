-- =====================================================================================
-- Iris 18 · El aviso de Gerencia sobre alertas de combustible «confirmadas sin descuento» tiene que ser exacto
-- =====================================================================================
-- La consulta 343 (25/11/2026) mostró que el aviso decía 33 alertas, 30.276 L (unos 49 millones), y no era real:
--   · Sumaba la carga entera en «carga sobre lo sugerido» y «carga imposible» (no el exceso).
--   · Contaba la misma carga dos o tres veces (una carga dispara varias reglas).
--   · Una «carga imposible» de 12.216 L venía de un error de carga del ticket (la carga es de 224 L).
--   · Las 33 cayeron en viajes con el cierre de combustible aprobado. El cierre cuenta litro por litro
--     (todos los tanques y la mochila) y deja a cargo del chofer lo que de verdad falta: ese es el número
--     que se descuenta en la liquidación. Una alerta de carga es un aviso temprano, no la cuenta final.
-- Ahora:
--   · Por alerta se toma lo que la regla de verdad mide (exceso, o lo que bajó el tanque).
--   · Cada carga se cuenta una sola vez (la alerta con más litros).
--   · Las que ya entraron en un cierre aprobado no se cuentan: las resolvió el cierre.
--   · Solo quedan las que todavía no tienen cierre aprobado, y el aviso dice que se definen al cerrar el viaje.
--   · Sin cifra en pesos: los litros de una alerta no son plata perdida.
-- Envuelve ia.fn_lectura_control_gerencia (queda como _sin_18): corrige los dos números de «alertas»
-- y el renglón de «para_decidir_hoy». Sirve sea cual sea el texto anterior. Se puede correr dos veces.
-- No cambia datos. Numeración propia de Iris: no toca web.version_base.
-- =====================================================================================
BEGIN;

-- Las alertas de combustible confirmadas sin descuento, contadas bien
CREATE OR REPLACE FUNCTION ia.fn_combustible_confirmado_sin_descuento(p_desde timestamptz)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    WITH a AS (
        SELECT al.id, al.carga_id, al.camion_id, coalesce(k.fecha_hora, al.ocurrio_desde, al.detectada_en) AS cuando,
               CASE WHEN r.codigo IN ('CARGA_SOBRE_SUGERIDO', 'EXCESO_CAPACIDAD') THEN greatest(al.valor_observado - coalesce(al.valor_esperado, 0), 0)
                    ELSE greatest(al.valor_observado, 0) END AS litros
          FROM ana.alerta al
          JOIN ana.regla_anomalia r ON r.id = al.regla_id
          LEFT JOIN fue.carga_combustible k ON k.id = al.carga_id
         WHERE al.resolucion = 'confirmada' AND al.unidad = 'l' AND al.cerrada_en >= p_desde
           AND r.codigo IN ('DETENIDO_CON_DESCENSO', 'CARGA_VS_TELEMETRIA', 'CARGA_SOBRE_SUGERIDO', 'EXCESO_CAPACIDAD')),
    b AS (
        SELECT a.*, EXISTS (SELECT 1 FROM fue.cierre_viaje cv
                             WHERE cv.camion_id = a.camion_id AND cv.estado = 'aprobado' AND cv.eliminado_en IS NULL
                               AND a.cuando >= cv.salida_ts AND a.cuando <= coalesce(cv.llegada_ts, now())) AS con_cierre
          FROM a),
    -- una carga, una vez (la alerta con más litros); las que no tienen carga (camión detenido) van sueltas
    u AS (
        SELECT DISTINCT ON (coalesce('c' || b.carga_id, 'a' || b.id)) b.*
          FROM b ORDER BY coalesce('c' || b.carga_id, 'a' || b.id), b.litros DESC)
    SELECT jsonb_build_object(
        'alertas', (SELECT count(*) FROM b),
        'resueltas_en_cierre', (SELECT count(*) FROM b WHERE con_cierre),
        'pendientes', (SELECT count(*) FROM u WHERE NOT con_cierre),
        'litros_pendientes', (SELECT round(coalesce(sum(litros), 0)) FROM u WHERE NOT con_cierre));
$f$;
REVOKE ALL ON FUNCTION ia.fn_combustible_confirmado_sin_descuento(timestamptz) FROM PUBLIC;

DO $do$
BEGIN
    IF to_regprocedure('ia.fn_lectura_control_gerencia(jsonb)') IS NULL THEN
        RAISE EXCEPTION 'Primero hay que aplicar iris_14 (control de Gerencia)';
    END IF;
    IF to_regprocedure('ia.fn_lectura_control_gerencia_sin_18(jsonb)') IS NULL THEN
        ALTER FUNCTION ia.fn_lectura_control_gerencia(jsonb) RENAME TO fn_lectura_control_gerencia_sin_18;
    END IF;
END $do$;
REVOKE ALL ON FUNCTION ia.fn_lectura_control_gerencia_sin_18(jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION ia.fn_lectura_control_gerencia(p_entrada jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE
    d jsonb := ia.fn_lectura_control_gerencia_sin_18(p_entrada);
    v_desde timestamptz := now() - make_interval(days => least(greatest(coalesce(nullif(p_entrada ->> 'dias', '')::int, 30), 7), 120));
    c jsonb; v_dec jsonb;
BEGIN
    IF d IS NULL OR jsonb_typeof(d) <> 'object' OR NOT (d ? 'para_decidir_hoy') THEN RETURN d; END IF;
    c := ia.fn_combustible_confirmado_sin_descuento(v_desde);
    IF d ? 'alertas' AND jsonb_typeof(d -> 'alertas') = 'object' THEN
        d := jsonb_set(d, '{alertas}', (d -> 'alertas')
              || jsonb_build_object('combustible_confirmado_sin_descuento', (c ->> 'pendientes')::int,
                                    'litros_confirmados_sin_descuento', (c ->> 'litros_pendientes')::numeric,
                                    'combustible_confirmado_resuelto_en_cierre', (c ->> 'resueltas_en_cierre')::int));
    END IF;
    -- Saca el renglón viejo (el de «confirmada»/«confirmadas») y pone el exacto, solo si queda algo pendiente
    SELECT coalesce(jsonb_agg(x ORDER BY i), '[]'::jsonb) INTO v_dec
      FROM jsonb_array_elements(coalesce(d -> 'para_decidir_hoy', '[]'::jsonb)) WITH ORDINALITY q(x, i)
     WHERE NOT ((x #>> '{}') ILIKE 'Combustible:%' AND (x #>> '{}') ILIKE '%confirmad%');
    IF (c ->> 'pendientes')::int > 0 THEN
        v_dec := v_dec || to_jsonb(format(
            'Combustible: %s alerta(s) confirmadas que todavía no entraron en un cierre de viaje aprobado (%s L de diferencia según la alerta). '
            'No es plata perdida: el cierre del viaje cuenta todos los tanques y define cuánto queda a cargo del chofer.',
            c ->> 'pendientes', translate(to_char((c ->> 'litros_pendientes')::numeric, 'FM999G999G999'), ',', '.')));
    END IF;
    RETURN jsonb_set(d, '{para_decidir_hoy}', v_dec);
END $f$;

-- Los mismos permisos que tenía la lectura
DO $g$
DECLARE g record;
BEGIN
    REVOKE ALL ON FUNCTION ia.fn_lectura_control_gerencia(jsonb) FROM PUBLIC;
    FOR g IN SELECT DISTINCT grantee FROM information_schema.routine_privileges
              WHERE routine_schema = 'ia' AND routine_name = 'fn_lectura_control_gerencia_sin_18' AND privilege_type = 'EXECUTE' AND grantee <> 'PUBLIC' LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION ia.fn_lectura_control_gerencia(jsonb) TO %I', g.grantee);
    END LOOP;
END $g$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Cómo queda (sin nombres): el renglón de combustible de hoy y los números corregidos
SELECT set_config('ia.control_auto', '1', false);
SELECT 'iris 18 aplicada' AS que,
       ia.fn_combustible_confirmado_sin_descuento(now() - interval '30 days') AS alertas_confirmadas,
       (SELECT jsonb_agg(x) FROM jsonb_array_elements(ia.fn_lectura_control_gerencia('{"sin_nombres":true}') -> 'para_decidir_hoy') x) AS para_decidir_hoy;
