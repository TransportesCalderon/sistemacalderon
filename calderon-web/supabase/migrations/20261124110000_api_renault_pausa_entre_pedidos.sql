-- =====================================================================================
-- Migración 300 · Renault: una pausa entre pedidos y no perder lo ya traído
-- =====================================================================================
-- Resultado de la 299 (24/11/2026): trajo 227 lecturas nuevas, pero en una página siguiente la API respondió
-- 429 «Too frequent requests… The limit is 1 seconds». Ese error deshacía toda la corrida (también lo ya traído) y
-- el cursor quedaba en 23/11 23:15:59.
--   · Espera 1,1 segundos entre un pedido y el siguiente (el límite de Renault es 1 por segundo).
--   · Si igual responde 429 u otro error después de la primera página, corta ahí sin error: guarda lo traído, el cursor
--     queda al final de la última ventana completa y la próxima corrida sigue desde ahí.
--   · Hasta 15 páginas por corrida (unos 20 segundos; con 10 minutos por ventana, unas 2,5 h por corrida).
-- Solo cambia la parte nueva de la 299. Volvo sigue igual. No toca web.version_base.
-- =====================================================================================
BEGIN;

DO $m$
DECLARE
    d text := pg_get_functiondef('tel.fn_importar_api_camiones(text, text)'::regprocedure); n int;
    a1 text := '                    SELECT h.status, h.content INTO v_estado, v_cuerpo FROM tel.fn_http_basico(v_url, v_usr, v_clave, v_accept) h;
                    IF v_estado <> 200 THEN
                        IF v_pagina = 1 THEN
                            v_nota := format(''la API no aceptó el pedido por ventanas';
    b1 text := '                    IF v_pagina > 1 THEN PERFORM pg_sleep(1.1); END IF;   -- Migración 300: Renault acepta 1 pedido por segundo
                    SELECT h.status, h.content INTO v_estado, v_cuerpo FROM tel.fn_http_basico(v_url, v_usr, v_clave, v_accept) h;
                    IF v_estado <> 200 THEN
                        -- Migración 300: con 429 (muy seguido) o después de la primera página, se corta sin perder lo traído
                        IF v_estado = 429 OR v_pagina > 1 THEN
                            v_nota := format(''la API respondió %s: sigue desde acá en la próxima corrida'', v_estado);
                            EXIT ventanas;
                        END IF;
                        IF v_pagina = 1 THEN
                            v_nota := format(''la API no aceptó el pedido por ventanas';
BEGIN
    IF position('Migración 300' IN d) > 0 THEN RAISE NOTICE 'La importación ya tenía la migración 300'; RETURN; END IF;
    IF position('Migración 299' IN d) = 0 THEN RAISE EXCEPTION 'Primero hay que aplicar la migración 299'; END IF;
    n := (length(d) - length(replace(d, a1, ''))) / length(a1);
    IF n <> 1 THEN RAISE EXCEPTION 'No encontré el pedido por ventanas de la 299 (% coincidencias): avisale a TI', n; END IF;
    n := (length(d) - length(replace(d, 'v_pagina >= 25', ''))) / length('v_pagina >= 25');
    IF n <> 2 THEN RAISE EXCEPTION 'No encontré el tope de páginas de la 299 (% coincidencias): avisale a TI', n; END IF;
    EXECUTE replace(replace(d, a1, b1), 'v_pagina >= 25', 'v_pagina >= 15');
END $m$;

COMMIT;

-- Resultado: corre una importación de Renault ahora (espera unos segundos) y muestra hasta dónde quedó leído
SELECT pg_sleep(2);
SELECT 'migración 300 aplicada' AS que,
       tel.fn_importar_api_camiones('renault', 'manual') - 'sin_camion' AS importacion_renault,
       (SELECT hasta AT TIME ZONE 'America/Santiago' FROM tel.cursor_api WHERE marca = 'renault') AS renault_leido_hasta;
