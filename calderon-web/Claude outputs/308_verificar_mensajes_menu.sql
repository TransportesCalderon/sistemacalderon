-- =============================================================================
-- IronTrack — Verificación 308 · Cambio 254 (migración 264) · Mensajes con el menú vigente
-- -----------------------------------------------------------------------------
-- Correr DESPUÉS de la migración 264. NO GUARDA NADA: solo lee los textos de las funciones,
-- prueba un mensaje real y termina con un error a propósito («VERIFICACIÓN 308 OK …»).
-- =============================================================================
DO $do$
DECLARE v_mal text; v_msg text; n int; v_ok text[] := '{}';
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 264 THEN
        RAISE EXCEPTION 'Falta aplicar la migración 264';
    END IF;

    -- 1 · No queda ningún nombre viejo del menú en las funciones
    SELECT string_agg(DISTINCT ns.nspname || '.' || p.proname || ' («' || t.viejo || '»)', ', ') INTO v_mal
      FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
      CROSS JOIN (VALUES ('Ajustes › Usuarios'), ('Ajustes › Líneas'), ('Ajustes › Catálogos'), ('(Configuración › Monedas)'),
                         ('Finanzas > Tipos de cambio'), ('Finanzas › Tipos de cambio'), ('Finanzas › Monedas y tipos de cambio'),
                         ('Flota > Camiones'), ('Flota › Camiones › Tanques'), ('(Flota › Camiones)'),
                         ('Liquidaciones › Tarifas'''), (': Liquidaciones › Datos legales'), ('(Fondos de choferes › Cerrar'),
                         ('(Ventas › Tarifas)'), ('Operación > Viajes'), ('en Cargas › Al genset'), ('Combustible › Ralentí del mes'),
                         ('Finanzas › Bancos y cajas'), ('(Finanzas › Combustible)')) AS t(viejo)
     WHERE ns.nspname IN ('ops', 'fin', 'fue', 'tel', 'mae', 'seg', 'ven', 'ana', 'ia', 'ref', 'aud') AND p.prokind = 'f'
       AND position(t.viejo IN p.prosrc) > 0;
    IF v_mal IS NOT NULL THEN RAISE EXCEPTION 'FALLA 1: quedan nombres viejos del menú en: %', v_mal; END IF;
    v_ok := v_ok || '1 no quedan nombres viejos'::text;

    -- 2 · Los nombres nuevos están donde tienen que estar
    SELECT count(*) INTO n
      FROM (VALUES ('fue', 'fn_exigir_autoriza_cargas', 'Configuración › Usuarios'), ('tel', 'fn_evaluar_seguimiento', 'Datos › Líneas'),
                   ('ref', 'fn_exigir_tipo_carga', 'Configuración › Parámetros y catálogos › Tipos de carga'),
                   ('fin', 'fn_tc_clp', 'Configuración › Monedas y tipos de cambio'), ('fue', 'fn_combustible_actual', 'Flota › Camiones y equipos › Tanques'),
                   ('fin', 'fn_calculo_legal', 'Administración › Liquidaciones › Datos legales'), ('fin', 'fn_preparar_liquidacion', 'Tarifas y conceptos'),
                   ('ven', 'fn_costo_viaje', 'Ventas › Cotizaciones › Tarifas y costos'), ('ops', 'fn_asignar_equipo', 'Pizarra Azul › Viajes'),
                   ('fue', 'fn_movimiento_reglas', 'Cargar nuevo › Carga de combustible › Al genset'),
                   ('fue', 'fn_ralenti_solo_funciones', 'Combustible › Consumo y ralentí › Ralentí del mes'),
                   ('fin', 'fn_guardar_cuenta_contable', 'Finanzas › Conciliación'), ('fin', 'fn_contabilizar_carga', 'Finanzas › Gastos › Combustible')) AS e(esq, nom, texto)
      JOIN pg_namespace ns ON ns.nspname = e.esq JOIN pg_proc p ON p.pronamespace = ns.oid AND p.proname = e.nom
     WHERE position(e.texto IN p.prosrc) > 0;
    IF n <> 13 THEN RAISE EXCEPTION 'FALLA 2: se esperaban 13 funciones con el nombre nuevo y hay %', n; END IF;
    v_ok := v_ok || '2 los nombres nuevos están'::text;

    -- 3 · Un mensaje real sale con el nombre nuevo
    BEGIN
        PERFORM ref.fn_exigir_tipo_carga('ZZ tipo que no existe 308');
        RAISE EXCEPTION 'FALLA 3: aceptó un tipo de carga que no existe';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        IF v_msg LIKE 'FALLA 3%' OR position('Configuración › Parámetros y catálogos › Tipos de carga' IN v_msg) = 0 THEN
            RAISE EXCEPTION 'FALLA 3: el mensaje no nombra el menú vigente: %', v_msg;
        END IF;
    END;
    v_ok := v_ok || '3 el mensaje sale con el nombre nuevo'::text;

    RAISE EXCEPTION 'VERIFICACIÓN 308 OK (no se guardó nada): %', array_to_string(v_ok, ' · ');
END $do$;
