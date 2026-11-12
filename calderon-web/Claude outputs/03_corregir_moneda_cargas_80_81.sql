-- 03 · Corrige la moneda de las cargas 80 y 81 (de CLP a ARS)
-- Hace lo mismo que fue.fn_editar_carga para un cambio de moneda, sin el control de período cerrado.
-- No toca litros, fecha ni precio: los cierres CV-000019 y CV-000024 quedan como están.
-- El importe en moneda base lo recalcula tg_35_multimoneda y el asiento lo rehace tg_70_contabilizar.
-- Si algo falla, no se cambia nada.

begin;

do $$
declare
    r      record;
    v_tc   bigint;
    n      integer := 0;
    v_mot  constant text := 'Carga editada: moneda corregida de CLP a ARS (estación argentina; período cerrado, no cambia litros)';
begin
    perform set_config('fue.edicion_carga', '1', true);
    perform set_config('app.motivo', v_mot, true);
    perform set_config('app.revaluacion', v_mot, true);

    for r in
        select id, estacion_id, fecha_hora
          from fue.carga_combustible
         where id in (80, 81)
           and moneda = 'CLP'
           and eliminado_en is null
           and estado_validacion <> 'anulada'
         order by id
           for update
    loop
        v_tc := fue.fn_cotizacion_para_carga('ARS', r.estacion_id, r.fecha_hora);
        update fue.carga_combustible
           set moneda = 'ARS', tipo_cambio_id = v_tc
         where id = r.id;
        n := n + 1;
    end loop;

    if n <> 2 then
        raise exception 'Se esperaban 2 cargas en CLP (80 y 81) y se encontraron %: no se cambió nada', n;
    end if;

    perform set_config('fue.edicion_carga', '', true);
    perform set_config('app.motivo', '', true);
    perform set_config('app.revaluacion', '', true);
end $$;

commit;

-- Verificación: tienen que quedar en ARS, con el mismo precio e importe original
select c.id, c.moneda, c.litros, c.precio_unitario, c.importe_original, c.importe_moneda_base,
       t.fecha as cotizacion_fecha, t.tasa as cotizacion
  from fue.carga_combustible c
  left join fin.tipo_cambio t on t.id = c.tipo_cambio_id
 where c.id in (80, 81)
 order by c.id;
