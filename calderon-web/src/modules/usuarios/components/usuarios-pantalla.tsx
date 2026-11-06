'use client';

import { Fragment, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Pencil, UserPlus, Users } from 'lucide-react';
import { Panel, TD, TH, useEnvio } from '@/modules/catalogos/components/comun';
import { Cargando, Chip, Encabezado, ErrorLectura, Seccion, Vacio } from '@/modules/combustible/components/comun/ui';
import { ETIQUETA_ROL, ROLES_APP, type RolApp } from '@/modules/core/permissions/roles';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { FRESCURA } from '@/shared/query/frescura';
import { browserDb } from '@/shared/supabase/browser';
import { Campo } from '@/shared/ui/campo';
import { useChoferesCombustible } from '@/modules/combustible/queries/hooks';
import {
  crearUsuario,
  guardarUsuario,
  marcarAprobadorCierre,
  marcarAprobadorSegundoNivel,
  marcarAvisoTanqueBajo,
  marcarRecibeEscalamiento,
  restablecerClave,
} from '../usuarios.actions';
import { BOTON_PRIMARIO } from '@/shared/ui/clases';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { usuariosRepository, type Usuario } from '../usuarios.repository';
import { invalidar } from '@/shared/query/invalidar';

/** Roles que se asignan desde acá. Migración 60: el chofer entra al celular (Mi carga, Mis gastos), vinculado a su ficha. */
const ROLES_ASIGNABLES = ROLES_APP;

/** Migración 150: desde esta versión TI crea la cuenta de acceso desde acá. */
const VERSION_CREAR = 150;
const VERSION_APROBADORES = 170;

/**
 * Configuración > Usuarios y roles (migración 34). Migración 150: «Nuevo usuario» crea la cuenta de
 * acceso (email y contraseña) y el usuario con sus roles, sin entrar a Supabase. Acá también se
 * vinculan las cuentas creadas en Supabase, se cambian los roles o se desactiva.
 */
export function UsuariosPantalla() {
  const { zonaHoraria, usuarioId } = useSesion();
  const db = browserDb();
  const usuarios = useQuery({
    queryKey: ['usuarios', 'lista'],
    queryFn: () => usuariosRepository(db).listar(),
    staleTime: FRESCURA.maestro,
  });
  const cuentas = useQuery({
    queryKey: ['usuarios', 'sin-vincular'],
    queryFn: () => usuariosRepository(db).sinVincular(),
    staleTime: FRESCURA.maestro,
  });
  const [abierto, setAbierto] = useState<string | null>(null);
  const puedeCrear = useBaseTiene(VERSION_CREAR);
  // Migración 192: TI pone una contraseña provisoria
  const puedeRestablecer = useBaseTiene(192);
  // Migración 170: quién aprueba cierres de viaje
  const hayAprobadores = useBaseTiene(VERSION_APROBADORES);
  const aprobadores = useQuery({
    queryKey: ['usuarios', 'aprobadores-cierre'],
    queryFn: () => usuariosRepository(db).aprobadoresCierre(),
    enabled: hayAprobadores,
    staleTime: FRESCURA.maestro,
  });
  // Migración 200: quién da la segunda aprobación de cierres
  const haySegundoNivel = useBaseTiene(200);
  const segundoNivel = useQuery({
    queryKey: ['usuarios', 'segundo-nivel'],
    queryFn: () => usuariosRepository(db).aprobadoresSegundoNivel(),
    enabled: haySegundoNivel,
    staleTime: FRESCURA.maestro,
  });
  // Migración 177: quién recibe el aviso de tanque bajo
  const hayAvisoTanque = useBaseTiene(177);
  const avisados = useQuery({
    queryKey: ['usuarios', 'aviso-tanque-bajo'],
    queryFn: () => usuariosRepository(db).avisadosTanqueBajo(),
    enabled: hayAvisoTanque,
    staleTime: FRESCURA.maestro,
  });
  // Migración 189: quién recibe las alertas vencidas y resuelve las prórrogas
  const hayEscalamiento = useBaseTiene(189);
  const escalamiento = useQuery({
    queryKey: ['usuarios', 'escalamiento'],
    queryFn: () => usuariosRepository(db).recibenEscalamiento(),
    enabled: hayEscalamiento,
    staleTime: FRESCURA.maestro,
  });
  const columnas = 5 + (hayAprobadores ? 1 : 0) + (haySegundoNivel ? 1 : 0) + (hayAvisoTanque ? 1 : 0) + (hayEscalamiento ? 1 : 0);

  return (
    <div className="space-y-5">
      <Encabezado titulo="Usuarios y roles" subtitulo="Configuración">
        {puedeCrear && abierto !== 'nuevo' && (
          <button type="button" className={BOTON_PRIMARIO} onClick={() => setAbierto('nuevo')}>
            <UserPlus className="size-4" /> Nuevo usuario
          </button>
        )}
      </Encabezado>
      <p className="text-sm text-tinta-suave">
        {puedeCrear ? (
          <>
            Para sumar a alguien: <span className="font-medium">Nuevo usuario</span>, con su email, nombre y roles. Los roles nuevos rigen
            cuando la persona vuelve a entrar (hasta 1 hora); desactivar corta el acceso en el momento.
          </>
        ) : (
          <>
            Para sumar a alguien: en Supabase, <span className="font-medium">Authentication → Users → Add user</span> (email y contraseña, o
            invitación por email). Después aparece abajo en «Cuentas sin vincular» para darle nombre y roles. Los roles nuevos rigen cuando la
            persona vuelve a entrar (hasta 1 hora); desactivar corta el acceso en el momento.
          </>
        )}
      </p>

      {abierto === 'nuevo' && <FormUsuario nuevo onCerrar={() => setAbierto(null)} />}

      {cuentas.data && cuentas.data.length > 0 && (
        <Seccion titulo={`Cuentas sin vincular (${cuentas.data.length})`}>
          <ul className="divide-y divide-borde text-sm">
            {cuentas.data.map((c) => (
              <li key={c.email} className="py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="font-medium text-tinta">{c.email}</span>
                    <span className="ml-2 text-xs text-tinta-suave">creada {formatearFechaHora(c.creadaEn, zonaHoraria)}</span>
                  </span>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-marca hover:underline"
                    onClick={() => setAbierto(`n:${c.email}`)}
                  >
                    <UserPlus className="size-4" /> Vincular
                  </button>
                </div>
                {abierto === `n:${c.email}` && (
                  <div className="mt-2">
                    <FormUsuario email={c.email} onCerrar={() => setAbierto(null)} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Seccion>
      )}

      <section className="overflow-hidden rounded-xl border border-borde bg-panel">
        {usuarios.isPending ? (
          <Cargando texto="Cargando usuarios…" />
        ) : usuarios.isError ? (
          <ErrorLectura
            texto={usuarios.error instanceof Error ? usuarios.error.message : 'No se pudieron cargar los usuarios.'}
            onReintentar={() => usuarios.refetch()}
          />
        ) : usuarios.data.length === 0 ? (
          <Vacio icono={<Users className="size-6" />} texto="Todavía no hay usuarios." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-sm">
              <thead className="border-b border-borde bg-fondo">
                <tr>
                  <th className={TH}>Nombre</th>
                  <th className={TH}>Roles</th>
                  <th className={TH}>Último ingreso</th>
                  <th className={TH}>Estado</th>
                  {hayAprobadores && <th className={TH}>Aprueba cierres de viaje</th>}
                  {haySegundoNivel && (
                    <th className={TH} title="Cuando se descuenta al chofer menos que la diferencia (o se quita un descuento)">
                      Segunda aprobación de cierres
                    </th>
                  )}
                  {hayAvisoTanque && <th className={TH} title="Además de Telemetría">Aviso de tanque bajo</th>}
                  {hayEscalamiento && (
                    <th className={TH} title="Le llegan las alertas vencidas con su historial y resuelve los pedidos de prórroga">
                      Recibe escalamientos
                    </th>
                  )}
                  <th className={TH} />
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {usuarios.data.map((u) => (
                  <Fragment key={u.id}>
                    <tr className={cn(!u.activo && 'text-tinta-suave')}>
                      <td className={TD}>
                        <span className="font-medium">{u.nombre}</span>
                        <span className="block text-xs text-tinta-suave">{u.email ?? '—'}</span>
                      </td>
                      <td className={TD}>
                        <div className="flex flex-wrap gap-1">
                          {u.roles.map((r) => (
                            <Chip key={r} tono={r === 'ti' ? 'marca' : 'neutro'}>
                              {ETIQUETA_ROL[r]}
                            </Chip>
                          ))}
                        </div>
                      </td>
                      <td className={cn(TD, 'tabular-nums')}>
                        {u.ultimoIngreso ? formatearFechaHora(u.ultimoIngreso, zonaHoraria) : 'Nunca'}
                      </td>
                      <td className={TD}>{u.activo ? <Chip tono="exito">Activo</Chip> : <Chip tono="neutro">Desactivado</Chip>}</td>
                      {hayAprobadores && (
                        <td className={TD}>
                          <AprobadorCierre usuario={u.id} marcado={(aprobadores.data ?? []).includes(u.id)} cargando={aprobadores.isPending} />
                        </td>
                      )}
                      {haySegundoNivel && (
                        <td className={TD}>
                          <AprobadorCierre
                            usuario={u.id}
                            marcado={(segundoNivel.data ?? []).includes(u.id)}
                            cargando={segundoNivel.isPending}
                            accion={marcarAprobadorSegundoNivel}
                          />
                        </td>
                      )}
                      {hayAvisoTanque && (
                        <td className={TD}>
                          <AprobadorCierre
                            usuario={u.id}
                            marcado={(avisados.data ?? []).includes(u.id)}
                            cargando={avisados.isPending}
                            accion={marcarAvisoTanqueBajo}
                          />
                        </td>
                      )}
                      {hayEscalamiento && (
                        <td className={TD}>
                          <AprobadorCierre
                            usuario={u.id}
                            marcado={(escalamiento.data ?? []).includes(u.id)}
                            cargando={escalamiento.isPending}
                            accion={marcarRecibeEscalamiento}
                          />
                        </td>
                      )}
                      <td className={cn(TD, 'text-right')}>
                        {u.email && (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-xs text-marca hover:underline"
                            onClick={() => setAbierto(`u:${u.id}`)}
                          >
                            <Pencil className="size-3.5" /> Editar
                          </button>
                        )}
                        {puedeRestablecer && u.email && u.id !== usuarioId && (
                          <button
                            type="button"
                            className="ml-3 inline-flex items-center gap-1 text-xs text-marca hover:underline"
                            onClick={() => setAbierto(`c:${u.id}`)}
                          >
                            <KeyRound className="size-3.5" /> Contraseña
                          </button>
                        )}
                      </td>
                    </tr>
                    {abierto === `u:${u.id}` && u.email && (
                      <tr>
                        <td colSpan={columnas} className="px-3 pb-3">
                          <FormUsuario email={u.email} usuario={u} onCerrar={() => setAbierto(null)} />
                        </td>
                      </tr>
                    )}
                    {abierto === `c:${u.id}` && (
                      <tr>
                        <td colSpan={columnas} className="px-3 pb-3">
                          <FormClave usuario={u} onCerrar={() => setAbierto(null)} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/** Migración 170: TI marca quién aprueba cierres de viaje (quien lo preparó nunca lo aprueba: lo controla la base). */
/** Migración 177: la misma casilla sirve para «Aviso de tanque bajo» (otra acción). */
function AprobadorCierre({
  usuario,
  marcado,
  cargando,
  accion = marcarAprobadorCierre,
}: {
  usuario: number;
  marcado: boolean;
  cargando: boolean;
  accion?: typeof marcarAprobadorCierre;
}) {
  const qc = useQueryClient();
  const envio = useEnvio();
  const marcar = useMutation({
    mutationFn: accion,
    onSuccess: (r) => (r.ok ? invalidar(qc, 'usuario') : undefined),
  });
  return (
    <span className="inline-flex flex-col">
      <label className="inline-flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          className="size-4 accent-marca"
          checked={marcado}
          disabled={cargando || marcar.isPending}
          onChange={(e) => void envio.enviar(marcar.mutateAsync({ usuario, aprueba: e.target.checked }), () => undefined)}
        />
        {marcado ? 'Sí' : 'No'}
      </label>
      {envio.error && <span className="text-xs text-error">{envio.error.mensaje}</span>}
    </span>
  );
}

function FormUsuario({ email: emailFijo = '', usuario, nuevo = false, onCerrar }: { email?: string; usuario?: Usuario; nuevo?: boolean; onCerrar: () => void }) {
  const qc = useQueryClient();
  const guardar = useMutation({
    mutationFn: guardarUsuario,
    onSuccess: (r) => (r.ok ? invalidar(qc, 'usuario') : undefined),
  });
  // Migración 150: alta completa (cuenta de acceso + usuario)
  const crear = useMutation({
    mutationFn: crearUsuario,
    onSuccess: (r) => (r.ok ? invalidar(qc, 'usuario') : undefined),
  });
  const [email, setEmail] = useState(emailFijo);
  const [clave, setClave] = useState('');
  const { error, enviar, campo } = useEnvio();
  const [nombre, setNombre] = useState(usuario?.nombre ?? '');
  const [roles, setRoles] = useState<RolApp[]>(usuario?.roles ?? []);
  const [activo, setActivo] = useState(usuario?.activo ?? true);
  const [choferId, setChoferId] = useState<number | null>(usuario?.choferId ?? null);
  const choferes = useChoferesCombustible();
  const alternar = (r: RolApp) => setRoles(roles.includes(r) ? roles.filter((x) => x !== r) : [...roles, r]);

  return (
    <Panel
      titulo={nuevo ? 'Nuevo usuario' : usuario ? `Editar ${usuario.nombre}` : `Vincular ${email}`}
      explicacion={
        nuevo
          ? 'Se crea su cuenta para entrar (email y contraseña) y el usuario con sus roles. Si dejás la contraseña vacía, la persona entra con «¿Olvidaste tu contraseña?» y elige la suya.'
          : 'Con varios roles, el usuario suma los permisos de todos. Las aprobaciones las hacen Administración de combustible, Finanzas y TI (parámetro fue.correccion_roles_aprobadores).'
      }
      error={error}
      ocupado={guardar.isPending || crear.isPending}
      textoBoton={nuevo ? 'Crear usuario' : usuario ? 'Guardar cambios' : 'Vincular'}
      onCerrar={onCerrar}
      onConfirmar={() =>
        nuevo
          ? enviar(crear.mutateAsync({ email, nombre, roles, choferId: roles.includes('chofer') ? choferId : null, clave }), onCerrar)
          : enviar(guardar.mutateAsync({ email, nombre, roles, activo, choferId: roles.includes('chofer') ? choferId : null }), onCerrar)
      }
    >
      {nuevo && (
        <>
          <Campo label="Email *" error={campo('email')}>
            <input type="email" autoComplete="off" maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} />
          </Campo>
          <Campo label="Contraseña inicial" error={campo('clave')} ayuda="Mínimo 8 letras. Pasásela a la persona; la puede cambiar en su perfil.">
            <input type="text" autoComplete="new-password" maxLength={72} value={clave} onChange={(e) => setClave(e.target.value)} />
          </Campo>
        </>
      )}
      <Campo label="Nombre *" error={campo('nombre')}>
        <input maxLength={200} value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </Campo>
      <fieldset className="space-y-1.5 sm:col-span-2">
        <legend className="text-sm font-medium text-tinta">Roles *</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {ROLES_ASIGNABLES.map((r) => (
            <label key={r} className="flex items-center gap-2 text-sm text-tinta">
              <input type="checkbox" className="size-4 accent-marca" checked={roles.includes(r)} onChange={() => alternar(r)} />
              {ETIQUETA_ROL[r]}
            </label>
          ))}
        </div>
        {campo('roles') && <p className="text-xs text-error">{campo('roles')}</p>}
      </fieldset>
      {roles.includes('chofer') && (
        <Campo label="Es el chofer *" ayuda="Ve solo su carga asignada y sus gastos, desde el celular.">
          <select value={choferId ?? ''} onChange={(e) => setChoferId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Elegí…</option>
            {(choferes.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </Campo>
      )}
      {usuario && (
        <label className="flex items-center gap-2 text-sm text-tinta">
          <input type="checkbox" className="size-4 accent-marca" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
          Activo (si lo desactivás, deja de entrar en el momento)
        </label>
      )}
    </Panel>
  );
}

/** Una contraseña provisoria fácil de dictar (sin letras que se confunden). */
function claveAlAzar(): string {
  const letras = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const v = new Uint32Array(12);
  crypto.getRandomValues(v);
  return Array.from(v, (n) => letras[n % letras.length]).join('');
}

/** Migración 192: TI restablece la contraseña con una provisoria; el usuario elige la suya al entrar. */
function FormClave({ usuario, onCerrar }: { usuario: Usuario; onCerrar: () => void }) {
  const envio = useEnvio();
  const [clave, setClave] = useState(claveAlAzar);
  const [lista, setLista] = useState(false);
  const restablecer = useMutation({ mutationFn: restablecerClave });
  if (lista)
    return (
      <div className="space-y-2 rounded-lg border border-exito/40 bg-fondo/40 p-4 text-sm">
        <p className="font-medium text-tinta">Listo. Pasale esta contraseña provisoria a {usuario.nombre}:</p>
        <p className="font-mono text-lg tracking-wider text-tinta select-all">{clave}</p>
        <p className="text-tinta-suave">Cuando entre, la plataforma le va a pedir que elija su propia contraseña. Esta no se vuelve a mostrar.</p>
        <button type="button" className={BOTON_PRIMARIO} onClick={onCerrar}>
          Cerrar
        </button>
      </div>
    );
  return (
    <Panel
      titulo={`Restablecer la contraseña de ${usuario.nombre}`}
      explicacion="Se le pone una contraseña provisoria (mínimo 10 letras). Al entrar, tiene que elegir la suya. Si tiene email, también puede usar «¿Olvidaste tu contraseña?» en el inicio de sesión."
      error={envio.error}
      ocupado={restablecer.isPending}
      textoBoton="Restablecer"
      onConfirmar={() => void envio.enviar(restablecer.mutateAsync({ usuario: usuario.id, clave }), () => setLista(true))}
      onCerrar={onCerrar}
    >
      <Campo label="Contraseña provisoria">
        <input value={clave} onChange={(e) => setClave(e.target.value)} className="font-mono" autoComplete="off" />
      </Campo>
    </Panel>
  );
}
