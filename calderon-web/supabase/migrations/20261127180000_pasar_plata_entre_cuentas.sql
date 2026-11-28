-- =====================================================================================
-- Migración 388 · Las cuentas en «Hoy» y transferir entre cuentas (también dólares a pesos)
-- =====================================================================================
-- Pedido (27/11/2026): que Gerencia vea en «Hoy» la cuenta en dólares de Aurea, y que el sistema deje anotar a mano
-- el paso de dólares a pesos y los movimientos entre cuentas.
--
-- Lo que ya había: Bancos › Movimientos › «Otro ingreso, egreso o transferencia» deja pasar plata entre cuentas, pero
-- solo a Finanzas o TI, y «Hoy» muestra un solo número («Plata en bancos y cajas», en pesos).
--
-- Lo nuevo:
--   · fin.fn_cuentas_hoy(): cada banco y caja con su saldo en su moneda (los dólares, en dólares), el cambio del día,
--     si el usuario puede transferir y las últimas transferencias. La ve quien ve Finanzas.
--   · fin.fn_pasar_plata(datos): anota una transferencia entre dos cuentas propias. Si son de monedas distintas
--     pide cuánto llegó (es un cambio de moneda) y la diferencia con el cambio del día va sola a «Diferencia de
--     cambio», como siempre. La usan Finanzas, Gerencia o TI. Controles:
--       - la fecha no puede ser futura, ni anterior al saldo inicial de las dos cuentas, ni anterior al último día
--         que ya trae la cartola de cualquiera de las dos (eso se anota desde la cartola, para no contarlo dos veces);
--       - si el cambio que sale de los montos se aleja más del 30 % del cambio del día, no la deja (monto mal
--         escrito o montos al revés). El tope es el parámetro fin.pasar_plata_desvio_max_pct;
--       - si ya hay una igual ese día (mismas cuentas y montos) no la deja, salvo que la descripción diga en qué
--         se diferencia;
--       - avisa (sin frenar) si la cuenta de salida queda en negativo según el sistema.
--   · fin.fn_pasar_plata_anular(id, motivo): anula una transferencia. Gerencia, solo si todavía no está conciliada
--     con el banco.
--   · fin.fn_confirmar_cambios (Bancos › Cambios de moneda): si el cambio que se confirma ya estaba anotado a mano,
--     concilia las dos líneas de la cartola con esa transferencia en vez de crear otra; y si estaba anotado con un
--     monto distinto al del banco, frena y pide anular el anotado (la de antes queda como
--     fin.fn_confirmar_cambios_sin_pases).
-- No cambia datos ni web.version_base. Se puede correr más de una vez. Antes de terminar prueba la lectura y una
-- transferencia (sin guardarla) con los datos de la base: si falla, no deja nada aplicado.
-- =====================================================================================
BEGIN;

DO $v$
BEGIN
    IF to_regprocedure('fin.fn_registrar_movimiento_interno(jsonb)') IS NULL OR to_regprocedure('fin.fn_cuentas_dinero()') IS NULL
       OR to_regprocedure('fin.fn_saldo_cuenta_dinero(bigint, date)') IS NULL OR to_regprocedure('fin.fn_tc_clp_o_null(text, date)') IS NULL
       OR to_regprocedure('fin.fn_exigir_lectura_finanzas()') IS NULL OR to_regprocedure('fin.fn_exigir_finanzas()') IS NULL
       OR to_regprocedure('fin.fn_por_cobrar()') IS NULL OR to_regclass('fin.cartola_linea') IS NULL THEN
        RAISE EXCEPTION 'Faltan las funciones de Finanzas (bancos y cartolas): avisar antes de seguir';
    END IF;
    IF to_regprocedure('fin.fn_conciliar(bigint, bigint)') IS NULL
       OR (to_regprocedure('fin.fn_confirmar_cambios(jsonb)') IS NULL AND to_regprocedure('fin.fn_confirmar_cambios_sin_pases(jsonb)') IS NULL) THEN
        RAISE EXCEPTION 'Faltan las funciones de «Cambios de moneda» (fin.fn_confirmar_cambios): avisar antes de seguir';
    END IF;
END $v$;

-- Permisos: los mismos que una función vecina (sin PUBLIC)
CREATE OR REPLACE FUNCTION pg_temp.fn_copiar_permisos(p_de regprocedure, p_a regprocedure)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE g text;
BEGIN
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', p_a);
    FOR g IN SELECT r.rolname FROM pg_roles r
              WHERE (r.rolname LIKE 'tc\_%' AND r.rolname <> 'tc_cliente') OR r.rolname = 'authenticated' LOOP
        IF has_function_privilege(g, p_de, 'EXECUTE') THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', p_a, g);
        ELSE
            EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', p_a, g);
        END IF;
    END LOOP;
END $fn$;

-- Funciones internas: solo las usan otras funciones de la base
CREATE OR REPLACE FUNCTION pg_temp.fn_solo_interna(p_fn regprocedure)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE g text;
BEGIN
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', p_fn);
    FOR g IN SELECT r.rolname FROM pg_roles r WHERE r.rolname LIKE 'tc\_%' OR r.rolname IN ('authenticated', 'anon') LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', p_fn, g);
    END LOOP;
END $fn$;

-- ---------------------------------------------------------------------------------
-- 1 · Configuración
-- ---------------------------------------------------------------------------------
INSERT INTO ref.parametro (codigo, valor, descripcion)
SELECT 'fin.pasar_plata_desvio_max_pct', '30'::jsonb,
       'Transferir entre cuentas de monedas distintas: si el cambio que sale de los montos se aleja más de este porcentaje del cambio del día, no se registra (suele ser un monto mal escrito o las cuentas al revés).'
 WHERE NOT EXISTS (SELECT 1 FROM ref.parametro p WHERE p.codigo = 'fin.pasar_plata_desvio_max_pct');

-- ---------------------------------------------------------------------------------
-- 2 · Números y plata como se escriben acá: «1.234,50», «USD 1.234,50», «CLP 950.000»
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fin.fn_num_es(p numeric, p_dec integer DEFAULT 0)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
    SELECT CASE WHEN p IS NULL THEN '—'
                ELSE CASE WHEN round(p, greatest(coalesce(p_dec, 0), 0)) < 0 THEN '-' ELSE '' END
                     || translate(to_char(abs(round(p, greatest(coalesce(p_dec, 0), 0))),
                                          'FM999,999,999,999,990' || CASE WHEN coalesce(p_dec, 0) > 0 THEN '.' || repeat('0', p_dec) ELSE '' END),
                                  ',.', '.,') END
$function$;
COMMENT ON FUNCTION fin.fn_num_es(numeric, integer) IS 'Migración 388: un número con punto de miles y coma decimal, para los mensajes.';

CREATE OR REPLACE FUNCTION fin.fn_plata_es(p numeric, p_moneda text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
    SELECT btrim(coalesce(p_moneda, '') || ' ' || fin.fn_num_es(p, CASE WHEN p_moneda = 'CLP' THEN 0 ELSE 2 END))
$function$;
COMMENT ON FUNCTION fin.fn_plata_es(numeric, text) IS 'Migración 388: un monto con su moneda («USD 1.234,50», «CLP 950.000»), para los mensajes.';

-- ---------------------------------------------------------------------------------
-- 3 · Quién puede transferir entre cuentas
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fin.fn_exigir_pasar_plata()
RETURNS bigint
LANGUAGE plpgsql
STABLE
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE v_usr bigint := aud.fn_usuario_actual();
BEGIN
    IF v_usr IS NULL OR NOT EXISTS (SELECT 1 FROM seg.usuario_rol WHERE usuario_id = v_usr AND rol_codigo IN ('finanzas', 'gerencia', 'ti')) THEN
        RAISE EXCEPTION 'Transferir entre cuentas lo hacen Finanzas, Gerencia o TI' USING ERRCODE = '42501';
    END IF;
    RETURN v_usr;
END $function$;

-- ---------------------------------------------------------------------------------
-- 4 · Las cuentas para «Hoy»: cada una en su moneda, el cambio del día y las últimas transferencias
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fin.fn_cuentas_hoy()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
    v_usr bigint := fin.fn_exigir_lectura_finanzas();
    v_hoy date := mae.fn_hoy();
    cd jsonb := fin.fn_cuentas_dinero();
    v_puede boolean; v_fin boolean;
BEGIN
    v_puede := EXISTS (SELECT 1 FROM seg.usuario_rol WHERE usuario_id = v_usr AND rol_codigo IN ('finanzas', 'gerencia', 'ti'));
    v_fin := EXISTS (SELECT 1 FROM seg.usuario_rol WHERE usuario_id = v_usr AND rol_codigo IN ('finanzas', 'ti'));
    RETURN jsonb_build_object(
        'hoy', v_hoy,
        'puede', v_puede,
        'cuentas', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                               'id', (x ->> 'id')::bigint, 'nombre', x ->> 'nombre', 'tipo', x ->> 'tipo', 'moneda', x ->> 'moneda',
                               'saldo', (x ->> 'saldo')::numeric, 'saldo_clp', (x ->> 'saldo_clp')::numeric,
                               'cartola_fecha', x ->> 'cartola_fecha',
                               'tarjeta', coalesce(jsonb_typeof(x -> 'tarjeta') = 'object', false)) ORDER BY n), '[]'::jsonb)
                      FROM jsonb_array_elements(cd) WITH ORDINALITY q(x, n)
                     WHERE (x ->> 'activa')::boolean),
        -- Cuántos pesos chilenos vale hoy una unidad de cada moneda que hay en las cuentas
        'cambios', (SELECT coalesce(jsonb_object_agg(z.moneda, z.tc), '{}'::jsonb)
                      FROM (SELECT DISTINCT x ->> 'moneda' AS moneda, fin.fn_tc_clp_o_null(x ->> 'moneda', v_hoy) AS tc
                              FROM jsonb_array_elements(cd) x
                             WHERE (x ->> 'activa')::boolean AND x ->> 'moneda' <> 'CLP') z
                     WHERE z.tc IS NOT NULL),
        'desvio_max_pct', coalesce(ref.fn_parametro_num('fin.pasar_plata_desvio_max_pct', 30), 30),
        'ultimas', (SELECT coalesce(jsonb_agg(s.u ORDER BY s.fecha DESC, s.id DESC), '[]'::jsonb)
                      FROM (SELECT m.fecha, m.id,
                                   jsonb_build_object('id', m.id, 'numero', m.numero, 'fecha', m.fecha,
                                       'desde', co.nombre, 'desde_moneda', co.moneda, 'salio', m.monto,
                                       'hacia', cx.nombre, 'hacia_moneda', cx.moneda, 'llego', m.monto_destino,
                                       'descripcion', m.descripcion,
                                       'conciliado', k.conciliado,
                                       'puede_anular', v_puede AND m.origen IS NULL AND (v_fin OR NOT k.conciliado)) AS u
                              FROM fin.movimiento m
                              JOIN fin.cuenta_dinero co ON co.id = m.cuenta_dinero_id
                              JOIN fin.cuenta_dinero cx ON cx.id = m.destino_id
                             CROSS JOIN LATERAL (SELECT EXISTS (SELECT 1 FROM fin.cartola_linea l WHERE l.movimiento_id = m.id) AS conciliado) k
                             WHERE m.tipo = 'transferencia' AND m.estado = 'vigente' AND m.eliminado_en IS NULL AND m.fecha >= v_hoy - 30
                             ORDER BY m.fecha DESC, m.id DESC
                             LIMIT 12) s));
END $function$;
COMMENT ON FUNCTION fin.fn_cuentas_hoy() IS
    'Migración 388: los bancos y cajas activos con su saldo en su moneda, el cambio del día, si el usuario puede transferir entre cuentas y las transferencias de los últimos 30 días. Para «Hoy» y Bancos › Movimientos. La ve quien ve Finanzas.';

-- ---------------------------------------------------------------------------------
-- 5 · Transferir entre dos cuentas propias (si son de monedas distintas, es un cambio de moneda)
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fin.fn_pasar_plata(p_datos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
    v_usr bigint := fin.fn_exigir_pasar_plata();
    v_hoy date := mae.fn_hoy();
    v_tope numeric := coalesce(ref.fn_parametro_num('fin.pasar_plata_desvio_max_pct', 30), 30);
    v_probar boolean := coalesce(p_datos ->> 'solo_probar', '') = 'true';
    o fin.cuenta_dinero%ROWTYPE; d fin.cuenta_dinero%ROWTYPE;
    v_o bigint; v_d bigint; v_fecha date; v_monto numeric; v_llego numeric; v_desc text;
    v_tc_o numeric; v_tc_d numeric; v_tasa numeric; v_del_dia numeric; v_fuerte text; v_debil text; v_dec integer;
    v_cambio text; v_costo numeric; v_cartola date; v_gemelo text; v_gemelo_conc boolean; v_gemelo_cuenta text;
    v_id bigint; v_numero text; v_saldo numeric; v_avisos jsonb := '[]'::jsonb; c record;
BEGIN
    IF p_datos IS NULL OR jsonb_typeof(p_datos) <> 'object' THEN
        RAISE EXCEPTION 'Faltan los datos de la transferencia' USING ERRCODE = '22023';
    END IF;
    BEGIN
        v_o := nullif(p_datos ->> 'cuenta_dinero_id', '')::bigint;
        v_d := nullif(p_datos ->> 'destino_id', '')::bigint;
        v_fecha := nullif(p_datos ->> 'fecha', '')::date;
        v_monto := nullif(p_datos ->> 'monto', '')::numeric;
        v_llego := nullif(p_datos ->> 'monto_destino', '')::numeric;
    EXCEPTION WHEN data_exception THEN
        RAISE EXCEPTION 'Revisá las cuentas, la fecha y los montos: hay un dato mal escrito' USING ERRCODE = '22023';
    END;
    v_desc := nullif(btrim(coalesce(p_datos ->> 'descripcion', '')), '');
    IF length(v_desc) > 200 THEN RAISE EXCEPTION 'La descripción es muy larga (hasta 200 letras)' USING ERRCODE = '22023'; END IF;

    -- Las dos cuentas
    SELECT * INTO o FROM fin.cuenta_dinero WHERE id = v_o AND eliminado_en IS NULL;
    IF NOT FOUND OR NOT o.activa THEN RAISE EXCEPTION 'Elegí de qué cuenta sale la plata' USING ERRCODE = '22023'; END IF;
    SELECT * INTO d FROM fin.cuenta_dinero WHERE id = v_d AND eliminado_en IS NULL;
    IF NOT FOUND OR NOT d.activa THEN RAISE EXCEPTION 'Elegí a qué cuenta llega la plata' USING ERRCODE = '22023'; END IF;
    IF d.id = o.id THEN RAISE EXCEPTION 'Es la misma cuenta: elegí otra para la llegada' USING ERRCODE = '22023'; END IF;

    -- La fecha: ni futura, ni antes del saldo inicial, ni antes de lo que ya trae la cartola de cada cuenta
    IF v_fecha IS NULL THEN RAISE EXCEPTION 'Elegí la fecha' USING ERRCODE = '22023'; END IF;
    IF v_fecha > v_hoy THEN RAISE EXCEPTION 'La fecha no puede ser futura: la transferencia se anota cuando ya se hizo' USING ERRCODE = '22023'; END IF;
    FOR c IN SELECT x.id, x.nombre, x.desde FROM (VALUES (o.id, o.nombre, o.saldo_inicial_fecha), (d.id, d.nombre, d.saldo_inicial_fecha)) x(id, nombre, desde) LOOP
        IF v_fecha < c.desde THEN
            RAISE EXCEPTION 'La fecha es anterior al saldo inicial de % (%)', c.nombre, to_char(c.desde, 'DD/MM/YYYY') USING ERRCODE = '22023';
        END IF;
        SELECT max(l.fecha) INTO v_cartola FROM fin.cartola_linea l WHERE l.cuenta_dinero_id = c.id;
        IF v_cartola IS NOT NULL AND v_fecha < v_cartola THEN
            RAISE EXCEPTION 'La cartola de % ya está cargada hasta el %: lo anterior a ese día se anota desde la cartola (Bancos › Cuentas), para no contarlo dos veces',
                c.nombre, to_char(v_cartola, 'DD/MM/YYYY') USING ERRCODE = '55000';
        END IF;
    END LOOP;

    -- Los montos
    IF v_monto IS NULL OR v_monto <= 0 THEN RAISE EXCEPTION 'Escribí cuánto salió de % (más que cero)', o.nombre USING ERRCODE = '22023'; END IF;
    v_monto := round(v_monto, CASE WHEN o.moneda = 'CLP' THEN 0 ELSE 2 END);
    IF v_monto <= 0 THEN RAISE EXCEPTION 'Escribí cuánto salió de % (más que cero)', o.nombre USING ERRCODE = '22023'; END IF;
    IF d.moneda = o.moneda THEN
        IF v_llego IS NOT NULL AND round(v_llego, CASE WHEN d.moneda = 'CLP' THEN 0 ELSE 2 END) <> v_monto THEN
            RAISE EXCEPTION 'Las dos cuentas están en %: llega lo mismo que sale. Si el banco cobró una comisión, anotala aparte como un egreso', o.moneda
                USING ERRCODE = '22023';
        END IF;
        v_llego := v_monto;
    ELSE
        IF v_llego IS NULL OR v_llego <= 0 THEN
            RAISE EXCEPTION 'Las cuentas son de monedas distintas: escribí cuánto llegó a % (en %)', d.nombre, d.moneda USING ERRCODE = '22023';
        END IF;
        v_llego := round(v_llego, CASE WHEN d.moneda = 'CLP' THEN 0 ELSE 2 END);
        IF v_llego <= 0 THEN
            RAISE EXCEPTION 'Las cuentas son de monedas distintas: escribí cuánto llegó a % (en %)', d.nombre, d.moneda USING ERRCODE = '22023';
        END IF;
        v_tc_o := fin.fn_tc_clp_o_null(o.moneda, v_fecha);
        v_tc_d := fin.fn_tc_clp_o_null(d.moneda, v_fecha);
        IF v_tc_o IS NULL OR v_tc_d IS NULL THEN
            RAISE EXCEPTION 'Falta el tipo de cambio % → CLP al % (cargalo en Configuración › Monedas y tipos de cambio)',
                CASE WHEN v_tc_o IS NULL THEN o.moneda ELSE d.moneda END, to_char(v_fecha, 'DD/MM/YYYY') USING ERRCODE = '55000';
        END IF;
        -- El cambio se dice poniendo adelante la moneda que vale más: «1 USD = 950,12 CLP»
        IF v_tc_o >= v_tc_d THEN
            v_fuerte := o.moneda; v_debil := d.moneda; v_tasa := v_llego / v_monto; v_del_dia := v_tc_o / v_tc_d;
        ELSE
            v_fuerte := d.moneda; v_debil := o.moneda; v_tasa := v_monto / v_llego; v_del_dia := v_tc_d / v_tc_o;
        END IF;
        v_dec := CASE WHEN v_del_dia < 10 THEN 4 ELSE 2 END;
        IF abs(v_tasa / v_del_dia - 1) * 100 > v_tope THEN
            -- Con los dos montos cambiados de lugar cierra: están al revés
            IF abs((1 / v_tasa) / v_del_dia - 1) * 100 <= v_tope THEN
                RAISE EXCEPTION 'Los montos parecen estar al revés: de % sale plata en % y a % llega en %', o.nombre, o.moneda, d.nombre, d.moneda
                    USING ERRCODE = '22023';
            END IF;
            RAISE EXCEPTION 'Con esos montos el cambio da 1 % = % % y el del día es %. Revisá cuánto salió y cuánto llegó (¿falta o sobra un cero?)',
                v_fuerte, fin.fn_num_es(v_tasa, CASE WHEN v_tasa < 10 THEN 4 ELSE 2 END), v_debil, fin.fn_num_es(v_del_dia, v_dec) USING ERRCODE = '22023';
        END IF;
        v_cambio := format('1 %s = %s %s (el del día: %s)', v_fuerte, fin.fn_num_es(v_tasa, v_dec), v_debil, fin.fn_num_es(v_del_dia, v_dec));
        v_costo := round(v_monto * v_tc_o - v_llego * v_tc_d, 0);
    END IF;

    -- ¿Ya está anotado? Mismas cuentas, mismo día y mismos montos. Con una descripción distinta se deja (fueron dos de verdad)
    SELECT m.numero, EXISTS (SELECT 1 FROM fin.cartola_linea l WHERE l.movimiento_id = m.id) INTO v_gemelo, v_gemelo_conc
      FROM fin.movimiento m
     WHERE m.tipo = 'transferencia' AND m.estado = 'vigente' AND m.eliminado_en IS NULL
       AND m.cuenta_dinero_id = o.id AND m.destino_id = d.id AND m.fecha = v_fecha AND m.monto = v_monto AND m.monto_destino = v_llego
       AND (v_desc IS NULL OR lower(btrim(coalesce(m.descripcion, ''))) = lower(v_desc))
     ORDER BY m.id LIMIT 1;
    IF v_gemelo IS NOT NULL THEN
        RAISE EXCEPTION 'Ya hay una transferencia igual ese día: %. Si de verdad fueron dos, escribí en la descripción en qué se diferencia (por ejemplo «segunda del día»)',
            v_gemelo || CASE WHEN v_gemelo_conc THEN ' (ya conciliada con el banco)' ELSE '' END USING ERRCODE = '23505';
    END IF;
    -- Lo mismo si ese día la cartola de una de las dos cuentas ya trae ese monto y está anotado (el otro monto puede estar escrito distinto)
    IF v_desc IS NULL THEN
        SELECT m.numero, cd.nombre INTO v_gemelo, v_gemelo_cuenta
          FROM fin.cartola_linea l
          JOIN fin.movimiento m ON m.id = l.movimiento_id AND m.estado = 'vigente' AND m.eliminado_en IS NULL AND m.tipo = 'transferencia'
          JOIN fin.cuenta_dinero cd ON cd.id = l.cuenta_dinero_id
         WHERE l.fecha = v_fecha
           AND ((l.cuenta_dinero_id = o.id AND l.monto = -v_monto AND m.cuenta_dinero_id = o.id AND m.destino_id = d.id)
             OR (l.cuenta_dinero_id = d.id AND l.monto = v_llego AND m.cuenta_dinero_id = o.id AND m.destino_id = d.id))
         ORDER BY l.id LIMIT 1;
        IF v_gemelo IS NOT NULL THEN
            RAISE EXCEPTION 'Ese día la cartola de % ya trae ese monto y está anotado como %. Si es otra transferencia, escribí en la descripción en qué se diferencia',
                v_gemelo_cuenta, v_gemelo USING ERRCODE = '23505';
        END IF;
    END IF;

    -- Aviso, sin frenar: la cuenta de salida queda en negativo según el sistema
    v_saldo := fin.fn_saldo_cuenta_dinero(o.id) - v_monto;
    IF v_saldo < 0 THEN
        v_avisos := v_avisos || to_jsonb(format('Según el sistema, %s queda en %s: falta anotar plata que entró en esa cuenta (o importar su cartola).',
                                                o.nombre, fin.fn_plata_es(v_saldo, o.moneda)));
    END IF;

    IF NOT v_probar THEN
        v_id := fin.fn_registrar_movimiento_interno(jsonb_build_object(
                    'tipo', 'transferencia', 'fecha', v_fecha, 'cuenta_dinero_id', o.id, 'monto', v_monto,
                    'destino_id', d.id, 'monto_destino', v_llego,
                    'descripcion', coalesce(v_desc, CASE WHEN d.moneda <> o.moneda
                                                         THEN format('Cambio %s → %s', fin.fn_plata_es(v_monto, o.moneda), fin.fn_plata_es(v_llego, d.moneda)) END)));
        SELECT numero INTO v_numero FROM fin.movimiento WHERE id = v_id;
    END IF;

    RETURN jsonb_build_object(
        'id', v_id, 'numero', v_numero, 'probado', v_probar,
        'resumen', format('%s de %s → %s en %s', fin.fn_plata_es(v_monto, o.moneda), o.nombre, fin.fn_plata_es(v_llego, d.moneda), d.nombre)
                   || coalesce(' · ' || v_cambio, ''),
        'cambio', v_cambio, 'costo_clp', v_costo, 'avisos', v_avisos);
END $function$;
COMMENT ON FUNCTION fin.fn_pasar_plata(jsonb) IS
    'Migración 388: anota una transferencia entre dos cuentas propias (cuenta_dinero_id, destino_id, fecha, monto, monto_destino si cambia la moneda, descripcion). Finanzas, Gerencia o TI. Con solo_probar = true valida y no guarda.';

-- ---------------------------------------------------------------------------------
-- 6 · Anular una transferencia
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fin.fn_pasar_plata_anular(p_id bigint, p_motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE v_usr bigint := fin.fn_exigir_pasar_plata(); m fin.movimiento%ROWTYPE; v_fin boolean;
BEGIN
    IF nullif(btrim(p_motivo), '') IS NULL THEN RAISE EXCEPTION 'Escribí por qué se anula' USING ERRCODE = '22023'; END IF;
    IF length(btrim(p_motivo)) > 500 THEN RAISE EXCEPTION 'El motivo es muy largo (hasta 500 letras)' USING ERRCODE = '22023'; END IF;
    SELECT * INTO m FROM fin.movimiento WHERE id = p_id AND eliminado_en IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'El movimiento no existe' USING ERRCODE = 'P0002'; END IF;
    IF m.tipo <> 'transferencia' THEN
        RAISE EXCEPTION 'Desde acá se anulan solo las transferencias entre cuentas: lo demás se anula en Bancos › Movimientos' USING ERRCODE = '22023';
    END IF;
    IF m.estado = 'anulado' THEN RAISE EXCEPTION 'La transferencia ya está anulada' USING ERRCODE = '55000'; END IF;
    IF m.origen IS NOT NULL THEN RAISE EXCEPTION 'Este movimiento lo generó otra pantalla: se anula desde ahí' USING ERRCODE = '55000'; END IF;
    v_fin := EXISTS (SELECT 1 FROM seg.usuario_rol WHERE usuario_id = v_usr AND rol_codigo IN ('finanzas', 'ti'));
    IF NOT v_fin AND EXISTS (SELECT 1 FROM fin.cartola_linea WHERE movimiento_id = p_id) THEN
        RAISE EXCEPTION 'Esta transferencia ya está conciliada con la cartola del banco: la anula Finanzas' USING ERRCODE = '55000';
    END IF;
    PERFORM set_config('fin.cont_fn', '1', true);
    UPDATE fin.cartola_linea SET movimiento_id = NULL WHERE movimiento_id = p_id;
    UPDATE fin.movimiento SET estado = 'anulado', motivo = btrim(p_motivo) WHERE id = p_id;
END $function$;
COMMENT ON FUNCTION fin.fn_pasar_plata_anular(bigint, text) IS
    'Migración 388: anula una transferencia entre cuentas (se borra su asiento y las cuentas vuelven al saldo anterior). Finanzas, Gerencia o TI; Gerencia solo si todavía no está conciliada con la cartola.';

-- ---------------------------------------------------------------------------------
-- 7 · Cambios de moneda: lo que ya se anotó a mano no se vuelve a crear, se concilia
-- ---------------------------------------------------------------------------------
DO $r$
BEGIN
    IF to_regprocedure('fin.fn_confirmar_cambios_sin_pases(jsonb)') IS NULL THEN
        ALTER FUNCTION fin.fn_confirmar_cambios(jsonb) RENAME TO fn_confirmar_cambios_sin_pases;
    END IF;
END $r$;

CREATE OR REPLACE FUNCTION fin.fn_confirmar_cambios(p_pares jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
    v_dias integer := coalesce(ref.fn_parametro_num('fin.cambio_dias', 3), 3)::integer;
    p jsonb; s fin.cartola_linea%ROWTYPE; e fin.cartola_linea%ROWTYPE; v_mov bigint; c record;
    v_resto jsonb := '[]'::jsonb; v_movs bigint[] := '{}'; v_ya integer := 0; n integer := 0; r jsonb;
BEGIN
    PERFORM fin.fn_exigir_finanzas();
    -- Lo que no es una lista válida lo contesta la función de siempre, con su mensaje
    IF p_pares IS NULL OR jsonb_typeof(p_pares) <> 'array' OR jsonb_array_length(p_pares) = 0 OR jsonb_array_length(p_pares) > 500 THEN
        RETURN fin.fn_confirmar_cambios_sin_pases(p_pares);
    END IF;
    FOR p IN SELECT value FROM jsonb_array_elements(p_pares) LOOP
        v_mov := NULL;
        SELECT * INTO s FROM fin.cartola_linea WHERE id = (p ->> 'salida')::bigint FOR UPDATE;
        SELECT * INTO e FROM fin.cartola_linea WHERE id = (p ->> 'entrada')::bigint FOR UPDATE;
        IF s.id IS NOT NULL AND e.id IS NOT NULL AND s.movimiento_id IS NULL AND e.movimiento_id IS NULL AND NOT s.ignorada AND NOT e.ignorada
           AND s.monto < 0 AND e.monto > 0 AND s.cuenta_dinero_id <> e.cuenta_dinero_id THEN
            -- Una transferencia ya anotada entre esas dos cuentas, por esos montos y cerca de esos días, sin conciliar de ningún lado
            SELECT m.id INTO v_mov FROM fin.movimiento m
             WHERE m.tipo = 'transferencia' AND m.estado = 'vigente' AND m.eliminado_en IS NULL
               AND m.cuenta_dinero_id = s.cuenta_dinero_id AND m.destino_id = e.cuenta_dinero_id
               AND m.monto = -s.monto AND m.monto_destino = e.monto
               AND m.fecha BETWEEN s.fecha - v_dias AND e.fecha + v_dias
               AND NOT EXISTS (SELECT 1 FROM fin.cartola_linea z WHERE z.movimiento_id = m.id)
             ORDER BY abs(m.fecha - s.fecha), m.id LIMIT 1;
            -- Anotada a mano con uno de los dos montos distinto al del banco: crear otra la contaría dos veces
            IF v_mov IS NULL THEN
                SELECT m.numero, m.monto, m.monto_destino, co.moneda AS mon_o, cx.moneda AS mon_d INTO c
                  FROM fin.movimiento m
                  JOIN fin.cuenta_dinero co ON co.id = m.cuenta_dinero_id
                  JOIN fin.cuenta_dinero cx ON cx.id = m.destino_id
                 WHERE m.tipo = 'transferencia' AND m.estado = 'vigente' AND m.eliminado_en IS NULL AND m.origen IS NULL
                   AND m.cuenta_dinero_id = s.cuenta_dinero_id AND m.destino_id = e.cuenta_dinero_id
                   AND (m.monto = -s.monto) <> (m.monto_destino = e.monto)
                   AND m.fecha BETWEEN s.fecha - v_dias AND e.fecha + v_dias
                   AND NOT EXISTS (SELECT 1 FROM fin.cartola_linea z WHERE z.movimiento_id = m.id)
                 ORDER BY abs(m.fecha - s.fecha), m.id LIMIT 1;
                IF FOUND THEN
                    RAISE EXCEPTION 'El cambio del % parece estar ya anotado a mano como %, con otro monto (% → %; el banco dice % → %). Si es el mismo, anulalo y volvé a confirmar: queda con los montos del banco. Si es otro, conciliá primero ese con sus líneas de la cartola',
                        to_char(s.fecha, 'DD/MM'), c.numero, fin.fn_plata_es(c.monto, c.mon_o), fin.fn_plata_es(c.monto_destino, c.mon_d),
                        fin.fn_plata_es(-s.monto, c.mon_o), fin.fn_plata_es(e.monto, c.mon_d) USING ERRCODE = '55000';
                END IF;
            END IF;
        END IF;
        IF v_mov IS NULL THEN
            v_resto := v_resto || jsonb_build_array(p);
        ELSE
            PERFORM fin.fn_conciliar(s.id, v_mov);
            PERFORM fin.fn_conciliar(e.id, v_mov);
            v_movs := v_movs || v_mov;
            v_ya := v_ya + 1;
        END IF;
    END LOOP;
    n := v_ya;
    IF jsonb_array_length(v_resto) > 0 THEN
        r := fin.fn_confirmar_cambios_sin_pases(v_resto);
        n := n + coalesce((r ->> 'confirmados')::integer, 0);
        v_movs := v_movs || ARRAY(SELECT x::bigint FROM jsonb_array_elements_text(coalesce(r -> 'movimientos', '[]'::jsonb)) x);
    END IF;
    RETURN jsonb_build_object('confirmados', n, 'movimientos', to_jsonb(v_movs), 'ya_anotados', v_ya);
END $function$;
COMMENT ON FUNCTION fin.fn_confirmar_cambios(jsonb) IS
    'Migración 388 (envoltorio de la 123): confirma los cambios de moneda propuestos. Si el cambio ya estaba anotado a mano (fin.fn_pasar_plata), concilia las dos líneas de la cartola con esa transferencia en vez de crear otra (si la anotada tiene un monto distinto al del banco, frena); el resto lo crea fin.fn_confirmar_cambios_sin_pases.';

-- ---------------------------------------------------------------------------------
-- 8 · Permisos: los de «Por cobrar» (quien ve Finanzas); quién puede transferir lo decide cada función
-- ---------------------------------------------------------------------------------
SELECT pg_temp.fn_copiar_permisos('fin.fn_por_cobrar()', 'fin.fn_cuentas_hoy()');
SELECT pg_temp.fn_copiar_permisos('fin.fn_por_cobrar()', 'fin.fn_pasar_plata(jsonb)');
SELECT pg_temp.fn_copiar_permisos('fin.fn_por_cobrar()', 'fin.fn_pasar_plata_anular(bigint, text)');
SELECT pg_temp.fn_copiar_permisos('fin.fn_confirmar_cambios_sin_pases(jsonb)', 'fin.fn_confirmar_cambios(jsonb)');
SELECT pg_temp.fn_solo_interna('fin.fn_exigir_pasar_plata()');
SELECT pg_temp.fn_solo_interna('fin.fn_num_es(numeric, integer)');
SELECT pg_temp.fn_solo_interna('fin.fn_plata_es(numeric, text)');

-- ---------------------------------------------------------------------------------
-- 9 · Prueba con los datos de esta base (no guarda nada): si falla, no queda nada aplicado
-- ---------------------------------------------------------------------------------
DO $t$
DECLARE v_usr bigint; j jsonb; a jsonb; b jsonb; v_tc numeric; r jsonb;
BEGIN
    SELECT min(ur.usuario_id) INTO v_usr FROM seg.usuario_rol ur JOIN seg.usuario u ON u.id = ur.usuario_id
     WHERE ur.rol_codigo IN ('ti', 'finanzas', 'gerencia') AND u.activo;
    IF v_usr IS NULL THEN RETURN; END IF;       -- sin usuarios no hay con quién probar
    PERFORM set_config('app.usuario_id', v_usr::text, true);
    j := fin.fn_cuentas_hoy();
    IF jsonb_typeof(j -> 'cuentas') <> 'array' OR jsonb_typeof(j -> 'ultimas') <> 'array' OR (j ->> 'puede') IS DISTINCT FROM 'true' THEN
        RAISE EXCEPTION 'la lectura de las cuentas no trae lo esperado';
    END IF;
    -- Una transferencia de prueba (solo_probar: no se guarda) entre dos cuentas, de monedas distintas si las hay
    SELECT x, y INTO a, b
      FROM jsonb_array_elements(j -> 'cuentas') x, jsonb_array_elements(j -> 'cuentas') y
     WHERE x ->> 'id' <> y ->> 'id'
       AND (x ->> 'moneda' = y ->> 'moneda' OR ((j -> 'cambios') ? (x ->> 'moneda') OR x ->> 'moneda' = 'CLP') AND ((j -> 'cambios') ? (y ->> 'moneda') OR y ->> 'moneda' = 'CLP'))
     ORDER BY (x ->> 'moneda' <> y ->> 'moneda') DESC, (x ->> 'moneda' <> 'CLP') DESC, (x ->> 'id')::bigint, (y ->> 'id')::bigint
     LIMIT 1;
    IF a IS NOT NULL THEN
        v_tc := coalesce((j -> 'cambios' ->> (a ->> 'moneda'))::numeric, 1) / coalesce((j -> 'cambios' ->> (b ->> 'moneda'))::numeric, 1);
        BEGIN
            r := fin.fn_pasar_plata(jsonb_build_object('solo_probar', true, 'cuenta_dinero_id', a -> 'id', 'destino_id', b -> 'id',
                     'fecha', mae.fn_hoy(), 'monto', 1000, 'monto_destino', round(1000 * v_tc, 2), 'descripcion', 'prueba de la migración 388'));
            IF (r ->> 'probado') IS DISTINCT FROM 'true' OR r ->> 'id' IS NOT NULL THEN RAISE EXCEPTION 'la transferencia de prueba guardó algo'; END IF;
        EXCEPTION WHEN SQLSTATE '22023' OR SQLSTATE '55000' OR SQLSTATE '23505' THEN
            NULL;   -- una regla de negocio frenó la prueba (cartola de hoy, fechas): la función anda
        END;
    END IF;
    PERFORM set_config('app.usuario_id', '', true);
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'No se pudo probar «transferir entre cuentas» con los datos de esta base (%). No se aplicó nada: avisar antes de seguir.', SQLERRM;
END $t$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Resultado: las cuentas que va a mostrar «Hoy», cada una en su moneda
SELECT 0 AS orden, 'migración 388 aplicada' AS que,
       'Finanzas, Gerencia y TI pueden transferir entre cuentas' AS detalle,
       NULL::text AS moneda, NULL::numeric AS saldo, NULL::text AS cartola_hasta
UNION ALL
SELECT 1, 'cambio de hoy', 'USD → CLP: ' || CASE WHEN fin.fn_tc_clp_o_null('USD', mae.fn_hoy()) IS NULL THEN 'FALTA CARGARLO' ELSE fin.fn_num_es(fin.fn_tc_clp_o_null('USD', mae.fn_hoy()), 2) END, NULL, NULL, NULL
UNION ALL
SELECT 10 + row_number() OVER (ORDER BY c.nombre), 'cuenta en «Hoy»', c.nombre, c.moneda::text, fin.fn_saldo_cuenta_dinero(c.id),
       (SELECT to_char(max(l.fecha), 'DD/MM/YYYY') FROM fin.cartola_linea l WHERE l.cuenta_dinero_id = c.id)
  FROM fin.cuenta_dinero c
 WHERE c.eliminado_en IS NULL AND c.activa
 ORDER BY 1;
