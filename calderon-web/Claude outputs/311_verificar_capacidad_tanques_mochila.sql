-- =============================================================================
-- IronTrack — Verificación 311 · Cambio 260 (migración 267) · Capacidad de tanques, mochila y total
-- -----------------------------------------------------------------------------
-- Correr DESPUÉS de la migración 267. NO GUARDA NADA y no crea datos.
-- Condición de aceptación de Operaciones: compara CAMIÓN POR CAMIÓN contra la lista confirmada
-- el 13/11 (litros útiles):
--     Renault  830 de tanques + 720 de mochila = 1.550
--     Mercedes 730 + 720 = 1.450      Scania 800 + 720 = 1.520      Volvo 650 + 780 = 1.430
-- y contra la suma directa de los tanques cargados en Flota. Después mira el combustible actual
-- y el pedido de cada viaje en curso. Termina con un error a propósito («VERIFICACIÓN 311 OK …»).
-- Si termina con otro error, copiarlo y mandarlo.
-- =============================================================================
DO $do$
DECLARE
    r record; k jsonb; ca jsonb; b jsonb; v_mal text[] := '{}'; v_ok text[] := '{}';
    v_cam int := 0; v_lista int := 0; v_fuera text[] := '{}'; v_act int := 0; v_ped int := 0; v_ped_m int := 0;
    e_t numeric; e_m numeric;
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 267 THEN
        RAISE EXCEPTION 'Falta aplicar la migración 267';
    END IF;

    -- 1 · Camión por camión: la función contra los tanques de Flota y contra la lista confirmada
    FOR r IN
        SELECT c.id, c.patente, c.marca,
               (SELECT sum(t.capacidad_util_l) FILTER (WHERE t.tipo <> 'mochila') FROM mae.tanque_combustible t
                 WHERE t.camion_id = c.id AND t.eliminado_en IS NULL AND t.vigente_desde <= mae.fn_hoy() AND (t.vigente_hasta IS NULL OR t.vigente_hasta > mae.fn_hoy())) AS t_flota,
               (SELECT sum(t.capacidad_util_l) FILTER (WHERE t.tipo = 'mochila') FROM mae.tanque_combustible t
                 WHERE t.camion_id = c.id AND t.eliminado_en IS NULL AND t.vigente_desde <= mae.fn_hoy() AND (t.vigente_hasta IS NULL OR t.vigente_hasta > mae.fn_hoy())) AS m_flota
          FROM mae.camion c WHERE c.eliminado_en IS NULL AND c.fecha_baja IS NULL ORDER BY c.patente
    LOOP
        k := fue.fn_capacidad_camion(r.id, now());
        IF r.t_flota IS NULL AND r.m_flota IS NULL THEN
            IF (k ->> 'total_l') IS NOT NULL THEN v_mal := v_mal || format('%s: no tiene tanques y la función da %s', r.patente, k ->> 'total_l'); END IF;
            v_fuera := v_fuera || (r.patente || ' (sin tanques)');
            CONTINUE;
        END IF;
        v_cam := v_cam + 1;
        IF (k ->> 'tanques_l')::numeric IS DISTINCT FROM coalesce(r.t_flota, 0) OR (k ->> 'mochila_l')::numeric IS DISTINCT FROM coalesce(r.m_flota, 0)
           OR (k ->> 'total_l')::numeric IS DISTINCT FROM coalesce(r.t_flota, 0) + coalesce(r.m_flota, 0)
           OR (k ->> 'litros')::numeric IS DISTINCT FROM (k ->> 'total_l')::numeric
           OR fue.fn_capacidad_mochila(r.id) IS DISTINCT FROM nullif(coalesce(r.m_flota, 0), 0) THEN
            v_mal := v_mal || format('%s: Flota dice %s + %s y la función %s + %s = %s', r.patente, r.t_flota, r.m_flota, k ->> 'tanques_l', k ->> 'mochila_l', k ->> 'total_l');
        END IF;
        e_t := CASE WHEN r.marca ILIKE '%renault%' THEN 830 WHEN r.marca ILIKE '%mercedes%' THEN 730 WHEN r.marca ILIKE '%scania%' THEN 800 WHEN r.marca ILIKE '%volvo%' THEN 650 END;
        e_m := CASE WHEN r.marca ILIKE '%volvo%' THEN 780 WHEN e_t IS NOT NULL THEN 720 END;
        IF e_t IS NULL THEN
            v_fuera := v_fuera || format('%s (%s: %s + %s)', r.patente, coalesce(r.marca, 'sin marca'), k ->> 'tanques_l', k ->> 'mochila_l');
        ELSIF (k ->> 'tanques_l')::numeric <> e_t OR (k ->> 'mochila_l')::numeric <> e_m THEN
            v_mal := v_mal || format('%s (%s): la lista confirmada dice %s + %s y da %s + %s', r.patente, r.marca, e_t, e_m, k ->> 'tanques_l', k ->> 'mochila_l');
        ELSE
            v_lista := v_lista + 1;
        END IF;

        -- 2 · Combustible actual: el reparto cierra y los tanques nunca pasan de su capacidad
        ca := fue.fn_combustible_actual(r.id);
        IF (ca ->> 'litros') IS NOT NULL THEN
            v_act := v_act + 1;
            IF coalesce((ca ->> 'tractor_l')::numeric, 0) + coalesce((ca ->> 'mochila_l')::numeric, 0) <> (ca ->> 'litros')::numeric
               OR (ca ->> 'tractor_l')::numeric > (ca ->> 'capacidad_tanques_l')::numeric
               OR ((ca ->> 'mochila_l') IS NOT NULL AND (ca ->> 'tractor_l')::numeric < round((ca ->> 'capacidad_tanques_l')::numeric))
               OR (ca ->> 'capacidad_l')::numeric <> round((k ->> 'total_l')::numeric) AND (ca ->> 'capacidad_tanques_l')::numeric = (k ->> 'tanques_l')::numeric THEN
                v_mal := v_mal || format('%s: combustible actual mal repartido (%s tanques + %s mochila = %s, capacidad de tanques %s)', r.patente,
                                         ca ->> 'tractor_l', ca ->> 'mochila_l', ca ->> 'litros', ca ->> 'capacidad_tanques_l');
            END IF;
        END IF;
    END LOOP;
    IF array_length(v_mal, 1) > 0 THEN
        RAISE EXCEPTION 'FALLA (camión por camión): %', left(array_to_string(v_mal, ' | '), 1800);
    END IF;
    v_ok := v_ok || format('1 capacidad igual a Flota en %s camiones; %s coinciden con la lista confirmada', v_cam, v_lista)
                 || format('2 combustible actual bien repartido en %s camiones', v_act);

    -- 3 · El pedido de cada viaje en curso ya no toma la mochila como tanque
    FOR r IN SELECT v.id, v.numero, v.camion_id FROM ops.viaje_chofer v WHERE v.estado = 'abierto' AND v.eliminado_en IS NULL LOOP
        b := tel.fn_preparar_pedido_carga(r.id);
        k := fue.fn_capacidad_camion(r.camion_id, now());
        v_ped := v_ped + 1;
        IF (b ->> 'capacidad_tanques_l')::numeric IS DISTINCT FROM (k ->> 'tanques_l')::numeric
           OR (b ->> 'capacidad_mochila_l')::numeric IS DISTINCT FROM (k ->> 'mochila_l')::numeric
           OR (b ->> 'capacidad_total_l')::numeric IS DISTINCT FROM (k ->> 'total_l')::numeric
           OR (b ->> 'tanques_l')::numeric > (b ->> 'capacidad_tanques_l')::numeric
           OR (b ->> 'inicial_tanques_l')::numeric > (b ->> 'capacidad_tanques_l')::numeric
           OR coalesce((b ->> 'inicial_tanques_l')::numeric, 0) + coalesce((b ->> 'inicial_mochila_l')::numeric, 0) <> coalesce((b ->> 'inicial_l')::numeric, 0)
           OR ((b ->> 'mochila_l')::numeric > 0 AND (b ->> 'tanques_l')::numeric < round((b ->> 'capacidad_tanques_l')::numeric))
           OR ((b ->> 'litros_para_llenar') IS NOT NULL AND (b ->> 'litros_para_llenar')::numeric
                 <> greatest(round((b ->> 'capacidad_total_l')::numeric - (b ->> 'tanques_l')::numeric - coalesce((b ->> 'mochila_l')::numeric, 0)), 0)) THEN
            v_mal := v_mal || format('viaje %s: tanques %s de %s, mochila %s de %s, inicial %s + %s = %s, para llenar %s', r.numero,
                b ->> 'tanques_l', b ->> 'capacidad_tanques_l', b ->> 'mochila_l', b ->> 'capacidad_mochila_l',
                b ->> 'inicial_tanques_l', b ->> 'inicial_mochila_l', b ->> 'inicial_l', b ->> 'litros_para_llenar');
        END IF;
        IF (b ->> 'mochila_l')::numeric > 0 OR (b ->> 'inicial_mochila_l')::numeric > 0 THEN v_ped_m := v_ped_m + 1; END IF;
    END LOOP;
    IF array_length(v_mal, 1) > 0 THEN
        RAISE EXCEPTION 'FALLA (pedidos): %', left(array_to_string(v_mal, ' | '), 1800);
    END IF;
    v_ok := v_ok || format('3 pedido bien repartido en %s viajes en curso (%s con litros en la mochila)', v_ped, v_ped_m);

    -- 4 · Nadie más lee la capacidad por otro lado
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE p.prokind = 'f' AND n.nspname IN ('fue', 'tel', 'ops', 'fin', 'ana') AND p.prosrc LIKE '%mae.fn_capacidad_camion(%') THEN
        RAISE EXCEPTION 'FALLA 4: quedó alguna función leyendo mae.fn_capacidad_camion';
    END IF;
    v_ok := v_ok || '4 una sola fuente de capacidad'::text;

    RAISE EXCEPTION 'VERIFICACIÓN 311 OK (no se guardó nada): % · fuera de la lista confirmada: %',
        array_to_string(v_ok, ' · '), coalesce(nullif(array_to_string(v_fuera, ', '), ''), 'ninguno');
END $do$;
