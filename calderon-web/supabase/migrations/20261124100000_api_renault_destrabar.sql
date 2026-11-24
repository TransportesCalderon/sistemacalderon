-- =====================================================================================
-- Migración 299 · Telemetría Renault trabada (sin datos desde el 23/11 23:15)
-- =====================================================================================
-- Caso (24/11/2026): la importación de Renault corre cada 2 minutos y responde bien (200), pero siempre trae
-- «0 lecturas nuevas, 100 repetidas». La API devuelve los estados de a 100: el sistema pedía «desde el último dato»
-- y, como esa página no traía nada más nuevo que ese momento, el cursor no avanzaba. Pedía las mismas 100 cada vez y
-- los camiones Renault quedaron congelados en el mapa (GCSC92, GCSC93, SDKZ68, SWTB72, SRYR55, SRYR56, RRVF47…).
--
-- Ahora, para las marcas del parámetro tel.api_por_ventanas (por defecto: renault):
--   · pide por ventanas de tiempo (starttime + stoptime, 10 minutos por defecto: tel.api_ventana_min);
--   · si una ventana tiene más de 100 estados, pide las páginas siguientes con lastVin (como dice el estándar rFMS);
--   · al terminar cada ventana el cursor avanza al final de la ventana, aunque todo venga repetido: no se vuelve a trabar.
--   · recupera lo que faltó (hasta 24 h para atrás) en las próximas corridas: unas 4 horas por corrida.
--   · si la API no acepta stoptime, usa el último estado de cada camión (como ya hacía) y lo anota en el registro.
-- Volvo sigue igual (funciona bien). No toca web.version_base.
-- =====================================================================================
BEGIN;

DO $m$
DECLARE
    d text := pg_get_functiondef('tel.fn_importar_api_camiones(text, text)'::regprocedure);
    a_decl text := 'v_desde timestamptz; v_hasta timestamptz;';
    b_decl text := 'v_desde timestamptz; v_hasta timestamptz;'
        || E'\n    v_fin timestamptz; v_ventana interval; v_ult_ant text; v_trabado integer := 0; v_ventanas integer := 0;   -- Migración 299'
        || E'\n    v_vent boolean := p_marca = ANY (string_to_array(replace(coalesce(ref.fn_parametro_texto(''tel.api_por_ventanas'', ''renault''), ''renault''), '' '', ''''), '',''));';
    -- El bloque del historial se busca por su código (sin depender de comentarios, espacios ni saltos de línea)
    a_ini text := 'IF\s+v_hist\s+THEN(\s+SELECT\s+greatest\s*\(\s*c\.hasta)';
    n int;
    b_ini text := $b$        -- Migración 299: por ventanas de tiempo (starttime/stoptime), paginando con lastVin; el cursor avanza al final de cada ventana
        IF v_hist AND v_vent THEN
            SELECT greatest(c.hasta, now() - interval '24 hours') INTO v_desde FROM tel.cursor_api c WHERE c.marca = p_marca;
            v_desde := coalesce(v_desde, now() - interval '1 hour');
            v_ventana := make_interval(mins => greatest(1, coalesce(ref.fn_parametro_num('tel.api_ventana_min', 10), 10))::int);
            <<ventanas>>
            LOOP
                v_fin := least(v_desde + v_ventana, now() - interval '1 minute');
                EXIT WHEN v_fin <= v_desde OR v_pagina >= 25;
                v_ultimo := NULL;
                LOOP
                    v_pagina := v_pagina + 1;
                    v_url := v_base || '/vehiclestatuses?starttime=' || to_char(v_desde AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
                             || '&stoptime=' || to_char(v_fin AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
                             || '&contentFilter=ACCUMULATED,SNAPSHOT,UPTIME'
                             || CASE WHEN v_ultimo IS NOT NULL THEN '&lastVin=' || v_ultimo ELSE '' END;
                    SELECT h.status, h.content INTO v_estado, v_cuerpo FROM tel.fn_http_basico(v_url, v_usr, v_clave, v_accept) h;
                    IF v_estado <> 200 THEN
                        IF v_pagina = 1 THEN
                            v_nota := format('la API no aceptó el pedido por ventanas (%s): se pidió el último estado', v_estado);
                            v_hist := false;
                            EXIT ventanas;
                        END IF;
                        RAISE EXCEPTION 'Estado de los camiones: la API respondió % (%)', v_estado, left(v_cuerpo, 200);
                    END IF;
                    v_json := v_cuerpo::jsonb;
                    r := tel.fn_registrar_estados_rfms(p_marca, v_json);
                    v_total := jsonb_build_object(
                        'nuevas', (v_total ->> 'nuevas')::int + (r ->> 'nuevas')::int,
                        'repetidas', (v_total ->> 'repetidas')::int + (r ->> 'repetidas')::int,
                        'sin_camion', (v_total -> 'sin_camion') || (r -> 'sin_camion'));
                    EXIT WHEN NOT coalesce((v_json ->> 'MoreDataAvailable')::boolean, (v_json ->> 'moreDataAvailable')::boolean, false);
                    -- Hay más en esta ventana: se pide la página siguiente con el último VIN (si no hay tope de páginas)
                    EXIT ventanas WHEN v_pagina >= 25;   -- la ventana queda sin terminar: el cursor no la pasa
                    v_ult_ant := v_ultimo;
                    SELECT coalesce(x ->> 'Vin', x ->> 'VIN') INTO v_ultimo
                      FROM jsonb_array_elements(coalesce(v_json -> 'VehicleStatus', v_json -> 'VehicleStatusResponse' -> 'VehicleStatus', '[]'))
                           WITH ORDINALITY t(x, i) ORDER BY i DESC LIMIT 1;
                    IF v_ultimo IS NULL OR v_ultimo IS NOT DISTINCT FROM v_ult_ant THEN
                        v_trabado := v_trabado + 1;   -- la API no avanza con lastVin: se sigue con la ventana siguiente
                        EXIT;
                    END IF;
                END LOOP;
                v_hasta := v_fin; v_ventanas := v_ventanas + 1;
                v_desde := v_fin;
            END LOOP;
            v_ultimo := NULL;
            IF v_hasta IS NOT NULL THEN
                INSERT INTO tel.cursor_api (marca, hasta) VALUES (p_marca, v_hasta)
                ON CONFLICT (marca) DO UPDATE SET hasta = greatest(tel.cursor_api.hasta, EXCLUDED.hasta), actualizado_en = now();
            END IF;
            IF v_hist THEN
                v_nota := concat_ws('; ', v_nota, format('%s ventanas hasta %s', v_ventanas,
                                    to_char(coalesce(v_hasta, v_desde) AT TIME ZONE 'America/Santiago', 'DD/MM HH24:MI')),
                                    CASE WHEN v_trabado > 0 THEN format('%s con más de 100 estados sin poder paginar', v_trabado) END);
            END IF;
        END IF;

        -- Migración 49: todos los estados desde la consulta anterior, con acumulados (Volvo y demás marcas)
        IF v_hist AND NOT v_vent THEN\1$b$;
BEGIN
    IF position('Migración 299' IN d) > 0 THEN RAISE NOTICE 'La importación ya tenía la migración 299'; RETURN; END IF;
    IF (length(d) - length(replace(d, a_decl, ''))) / length(a_decl) <> 1 THEN
        RAISE EXCEPTION 'No encontré las variables de tel.fn_importar_api_camiones: avisale a TI';
    END IF;
    SELECT count(*) INTO n FROM regexp_matches(d, a_ini, 'g');
    IF n <> 1 THEN
        RAISE EXCEPTION 'No encontré el bloque del historial en tel.fn_importar_api_camiones (% coincidencias). Lo que hay: %',
            n, left(substr(d, greatest(position('v_hist' IN substr(d, position('BEGIN' IN d))) + position('BEGIN' IN d) - 40, 1)), 400);
    END IF;
    EXECUTE regexp_replace(replace(d, a_decl, b_decl), a_ini, b_ini);
END $m$;

COMMIT;

-- Resultado: corre una importación de Renault ahora y muestra cómo quedó
SELECT 'migración 299 aplicada' AS que,
       tel.fn_importar_api_camiones('renault', 'manual') - 'sin_camion' AS importacion_renault,
       (SELECT hasta AT TIME ZONE 'America/Santiago' FROM tel.cursor_api WHERE marca = 'renault') AS renault_leido_hasta;
