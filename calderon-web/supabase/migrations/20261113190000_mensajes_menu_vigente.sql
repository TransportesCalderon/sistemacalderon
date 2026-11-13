-- =============================================================================
-- IronTrack — 264 · Cambio 254 · Los mensajes de la base nombran el menú como está hoy (backlog B1)
-- -----------------------------------------------------------------------------
-- Varios mensajes de error y avisos mandaban a un lugar del menú con un nombre viejo o
-- escrito de dos formas («Ajustes › Usuarios» y «Configuración › Usuarios», «Flota > Camiones»).
-- Este cambio corrige solo ese texto en 25 funciones, con el nombre real del menú:
--   · Usuarios                → Configuración › Usuarios
--   · Líneas                  → Datos › Líneas
--   · Tipos de carga          → Configuración › Parámetros y catálogos › Tipos de carga
--   · Monedas, tipos de cambio→ Configuración › Monedas y tipos de cambio
--   · Tanques del camión      → Flota › Camiones y equipos › Tanques
--   · Tarifas y datos legales → Administración › Liquidaciones › Tarifas y conceptos / Datos legales
--   · Cierre del fondo        → Administración › Fondos de choferes › Cerrar el período
--   · Tarifas de venta        → Ventas › Cotizaciones › Tarifas y costos
--   · Viajes (pasos y relevo) → Pizarra Azul › Viajes
--   · Carga al genset         → Cargar nuevo › Carga de combustible › Al genset
--   · Ralentí del mes         → Combustible › Consumo y ralentí › Ralentí del mes
--   · Bancos y cajas          → Finanzas › Conciliación
--   · Medios de pago          → Finanzas › Gastos › Combustible
-- No cambia ninguna regla ni ningún cálculo: se toma cada función como está en la base y se
-- reemplaza únicamente el texto. Si un texto no aparece la cantidad de veces esperada, frena
-- sin tocar nada. web.version_base = 264.
-- =============================================================================
SET search_path = public, extensions;
BEGIN;

DO $do$
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 263 THEN
        RAISE EXCEPTION 'Falta la migración 263 (cambio 253): aplicarla antes';
    END IF;
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) >= 264 THEN
        RAISE EXCEPTION 'La migración 264 (mensajes con el menú vigente) ya está aplicada';
    END IF;
END $do$;

DO $do$
DECLARE
    r record; c record; v_oid oid; v_def text; n int; v_func int := 0; v_textos int := 0;
BEGIN
    CREATE TEMP TABLE zz_cambios_264 (esq text, nom text, viejo text, nuevo text, veces int) ON COMMIT DROP;
    INSERT INTO zz_cambios_264 VALUES
        ('fin', 'fn_resolver_pedido_fondo', 'Ajustes › Usuarios', 'Configuración › Usuarios', 1),
        ('fue', 'fn_exigir_autoriza_cargas', 'Ajustes › Usuarios', 'Configuración › Usuarios', 1),
        ('tel', 'fn_evaluar_seguimiento', 'Ajustes › Líneas', 'Datos › Líneas', 1),
        ('ref', 'fn_exigir_tipo_carga', 'Ajustes › Catálogos › Tipos de carga', 'Configuración › Parámetros y catálogos › Tipos de carga', 1),
        ('fin', 'fn_preparar_liquidacion', '(Configuración › Monedas)', '(Configuración › Monedas y tipos de cambio)', 1),
        ('fin', 'fn_preparar_liquidacion', 'Administración › Liquidaciones › Tarifas''', 'Administración › Liquidaciones › Tarifas y conceptos''', 1),
        ('fin', 'fn_preparar_liquidacion', '(Fondos de choferes › Cerrar el período)', '(Administración › Fondos de choferes › Cerrar el período)', 1),
        ('fue', 'fn_carga_cotizacion_del_dia', 'Finanzas > Tipos de cambio', 'Configuración › Monedas y tipos de cambio', 1),
        ('fue', 'fn_cotizacion_para_carga', 'Finanzas > Tipos de cambio', 'Configuración › Monedas y tipos de cambio', 1),
        ('ven', 'fn_emitir_sii', 'Finanzas › Tipos de cambio', 'Configuración › Monedas y tipos de cambio', 1),
        ('ven', 'fn_sii_vista_previa', 'Finanzas › Tipos de cambio', 'Configuración › Monedas y tipos de cambio', 1),
        ('fin', 'fn_tc_clp', 'Finanzas › Monedas y tipos de cambio', 'Configuración › Monedas y tipos de cambio', 1),
        ('fue', 'fn_carga_faltante', 'Flota > Camiones > Tanques', 'Flota › Camiones y equipos › Tanques', 1),
        ('fue', 'fn_combustible_actual', 'Flota › Camiones › Tanques', 'Flota › Camiones y equipos › Tanques', 1),
        ('fue', 'fn_detalle_orden', 'Flota › Camiones › Tanques', 'Flota › Camiones y equipos › Tanques', 1),
        ('fue', 'fn_estimar_llenado', 'Flota › Camiones › Tanques', 'Flota › Camiones y equipos › Tanques', 1),
        ('fue', 'fn_revisar_combustible_actual', 'Flota › Camiones › Tanques', 'Flota › Camiones y equipos › Tanques', 1),
        ('fue', 'fn_mis_pendientes', 'Flota > Camiones''', 'Flota › Camiones y equipos''', 1),
        ('fue', 'fn_tanque_cierre', '(Flota › Camiones)', '(Flota › Camiones y equipos › Tanques)', 1),
        ('fin', 'fn_calculo_legal', ': Liquidaciones › Datos legales', ': Administración › Liquidaciones › Datos legales', 3),
        ('ven', 'fn_costo_viaje', '(Ventas › Tarifas)', '(Ventas › Cotizaciones › Tarifas y costos)', 1),
        ('ops', 'fn_asignar_equipo', 'Operación > Viajes', 'Pizarra Azul › Viajes', 1),
        ('ops', 'fn_servicio_hito_reglas', 'Operación > Viajes', 'Pizarra Azul › Viajes', 1),
        ('fue', 'fn_movimiento_reglas', 'Cargas › Al genset', 'Cargar nuevo › Carga de combustible › Al genset', 1),
        ('fue', 'fn_ralenti_solo_funciones', 'Combustible › Ralentí del mes', 'Combustible › Consumo y ralentí › Ralentí del mes', 1),
        ('fin', 'fn_guardar_cuenta_contable', 'Finanzas › Bancos y cajas', 'Finanzas › Conciliación', 1),
        ('fin', 'fn_contabilizar_carga', '(Finanzas › Combustible)', '(Finanzas › Gastos › Combustible)', 1);

    FOR r IN SELECT DISTINCT esq, nom FROM zz_cambios_264 ORDER BY 1, 2 LOOP
        SELECT count(*), min(p.oid) INTO n, v_oid FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
         WHERE ns.nspname = r.esq AND p.proname = r.nom;
        IF n <> 1 THEN
            RAISE EXCEPTION '%.%: se esperaba una sola función con ese nombre y hay %: avisar antes de seguir', r.esq, r.nom, n;
        END IF;
        v_def := pg_get_functiondef(v_oid);
        FOR c IN SELECT * FROM zz_cambios_264 x WHERE x.esq = r.esq AND x.nom = r.nom LOOP
            n := (length(v_def) - length(replace(v_def, c.viejo, ''))) / length(c.viejo);
            IF n <> c.veces THEN
                RAISE EXCEPTION '%.%: se esperaba % vez/veces el texto «%» y aparece %: avisar antes de seguir', r.esq, r.nom, c.veces, c.viejo, n;
            END IF;
            v_def := replace(v_def, c.viejo, c.nuevo);
            v_textos := v_textos + c.veces;
        END LOOP;
        EXECUTE v_def;
        v_func := v_func + 1;
    END LOOP;
    RAISE NOTICE 'Migración 264: % textos corregidos en % funciones', v_textos, v_func;
END $do$;

UPDATE ref.parametro SET valor = '264' WHERE codigo = 'web.version_base' AND valor::text::int < 264;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'migración 264 aplicada' AS que, (SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base') AS version_base;
