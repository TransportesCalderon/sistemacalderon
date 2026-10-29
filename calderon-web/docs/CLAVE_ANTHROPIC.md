# Clave de Anthropic para el asistente (IA-2)

La clave **nunca** va en Vercel, en el navegador, en el repositorio ni en el chat. Vive solo en Supabase Vault.
El asistente (IA-2) la lee desde la base. La Rentabilidad (IA-1) **no** la necesita.

## Nombre del secreto

`anthropic_api_key` (exactamente así, en minúsculas).

## Dónde cargarla

1. Entrá a https://console.anthropic.com › API Keys › Create Key. Copiá la clave (empieza con `sk-ant-`).
2. En Supabase: **Project Settings › Vault › Secrets › Add new secret** (en algunas versiones está en
   **Database › Vault**).
3. Name: `anthropic_api_key`. Secret: la clave. Guardar.

No hace falta tocar nada más hasta IA-2. La lectura de tickets usa su propio proveedor (`ia.proveedor`,
por defecto Google con `gemini_api_key`); cargar esta clave no la cambia.

## Cómo validar que quedó operativa (SQL Editor de Supabase)

Ninguna de estas consultas muestra la clave.

**1. ¿Está cargada?** Tiene que dar `true`.

```sql
select exists (select 1 from vault.decrypted_secrets
                where name = 'anthropic_api_key' and coalesce(decrypted_secret, '') <> '') as hay_clave;
```

**2. ¿Anthropic la acepta?** Pide la lista de modelos (no gasta tokens). Devuelve un número de pedido.

```sql
select net.http_get(
  url     := 'https://api.anthropic.com/v1/models',
  headers := jsonb_build_object(
    'x-api-key', (select decrypted_secret from vault.decrypted_secrets where name = 'anthropic_api_key'),
    'anthropic-version', '2023-06-01')
) as pedido;
```

**3. A los 5 segundos**, con el número que dio el paso 2:

```sql
select status_code,
       case status_code when 200 then 'Clave operativa'
                        when 401 then 'Clave inválida: revisala o creá otra'
                        when 403 then 'La clave no tiene permiso'
                        else left(content, 200) end as resultado
  from net._http_response where id = 123;  -- reemplazá 123 por el número del paso 2
```

`200` = lista para IA-2. Si el paso 2 da error de `net`, falta la extensión **pg_net**
(Database › Extensions › pg_net › Enable); ya la usa la lectura de tickets.
