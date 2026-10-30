-- ============================================================================
--  GastroMetrik · Base de datos para Supabase
--  Desarrollado por RAMN Software
--
--  CÓMO USARLO: copia TODO este archivo, pégalo en Supabase → SQL Editor →
--  "New query" y presiona "Run". Se hace una sola vez. Si lo vuelves a correr
--  no borra nada: solo actualiza las funciones.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ----------------------------------------------------------------------------
-- 1. Tablas
-- ----------------------------------------------------------------------------

-- Quién puede entrar al sistema con correo y contraseña, y con qué rol.
create table if not exists public.perfiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  rol         text not null default 'cajero',      -- dueno, cajero, cocina, mozo, repartidor
  usuario_id  text,                                -- persona del equipo dentro de GastroMetrik
  activo      boolean not null default true,
  creado      timestamptz not null default now()
);

-- Todos los datos del negocio. Cada fila es un registro de una colección:
-- productos, mesas, pedidos, caja, inventario, compras, gastos, eventos, etc.
create table if not exists public.registros (
  coleccion    text not null,
  id           text not null,
  datos        jsonb not null,
  orden        double precision not null default 0,
  origen       text,                               -- qué equipo hizo el último cambio
  actualizado  timestamptz not null default now(),
  primary key (coleccion, id)
);
create index if not exists registros_coleccion_actualizado on public.registros (coleccion, actualizado);
alter table public.registros replica identity full;

-- Números de pedido correlativos para todos los equipos.
create sequence if not exists public.numero_pedido start 1;

-- ----------------------------------------------------------------------------
-- 2. ¿Quién es quién?
-- ----------------------------------------------------------------------------
create or replace function public.es_personal() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and activo);
$$;

create or replace function public.es_dueno() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and activo and rol = 'dueno');
$$;

create or replace function public.ahora_ms() returns bigint
language sql stable as $$ select (extract(epoch from clock_timestamp()) * 1000)::bigint $$;

create or replace function public.hora_bolivia() returns text
language sql stable as $$ select to_char(now() at time zone 'America/La_Paz', 'HH24:MI') $$;

-- ----------------------------------------------------------------------------
-- 3. Seguridad: solo el personal con cuenta activa lee y escribe los datos
-- ----------------------------------------------------------------------------
alter table public.registros enable row level security;
alter table public.perfiles  enable row level security;

drop policy if exists registros_leer      on public.registros;
drop policy if exists registros_crear     on public.registros;
drop policy if exists registros_cambiar   on public.registros;
drop policy if exists registros_borrar    on public.registros;
create policy registros_leer    on public.registros for select to authenticated using (public.es_personal());
create policy registros_crear   on public.registros for insert to authenticated with check (public.es_personal());
create policy registros_cambiar on public.registros for update to authenticated using (public.es_personal()) with check (public.es_personal());
create policy registros_borrar  on public.registros for delete to authenticated using (public.es_personal());

drop policy if exists perfiles_leer on public.perfiles;
create policy perfiles_leer on public.perfiles for select to authenticated
  using (id = auth.uid() or public.es_dueno());

revoke all on public.registros from anon;
revoke all on public.perfiles  from anon;
grant select, insert, update, delete on public.registros to authenticated;
grant select on public.perfiles to authenticated;
grant usage on sequence public.numero_pedido to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Automatismos
-- ----------------------------------------------------------------------------

-- Fecha del último cambio y número de pedido correlativo al crear un pedido.
create or replace function public.antes_de_guardar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.actualizado := now();
  if tg_op = 'INSERT' and new.coleccion = 'pedidos'
     and not exists (select 1 from public.registros r where r.coleccion = 'pedidos' and r.id = new.id) then
    new.datos := jsonb_set(new.datos, '{no}', to_jsonb(nextval('public.numero_pedido')));
  end if;
  if tg_op = 'UPDATE' and new.coleccion = 'pedidos' and old.datos ? 'no' then
    new.datos := jsonb_set(new.datos, '{no}', old.datos->'no');   -- el número nunca cambia
  end if;
  return new;
end $$;

drop trigger if exists registros_antes on public.registros;
create trigger registros_antes before insert or update on public.registros
  for each row execute function public.antes_de_guardar();

-- Si el dueño cambia el rol de una persona o la desactiva, su acceso cambia igual.
create or replace function public.sincronizar_acceso() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.es_dueno() then
    return null;
  end if;
  if tg_op = 'DELETE' then
    if old.coleccion = 'usuarios' then
      update public.perfiles set activo = false where usuario_id = old.id;
    end if;
    return null;
  end if;
  if new.coleccion = 'usuarios' then
    update public.perfiles
       set rol = coalesce(new.datos->>'rol', rol),
           activo = coalesce((new.datos->>'activo')::boolean, activo)
     where usuario_id = new.id
       and id is distinct from auth.uid();          -- nadie se cambia a sí mismo
  end if;
  return null;
end $$;

drop trigger if exists registros_acceso on public.registros;
create trigger registros_acceso after insert or update or delete on public.registros
  for each row execute function public.sincronizar_acceso();

-- Cambios en vivo entre equipos (caja, cocina, mesero, pantalla del cliente).
do $$ begin
  alter publication supabase_realtime add table public.registros;
exception when duplicate_object then null;
          when undefined_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- 5. Cuentas del personal, creadas desde dentro de GastroMetrik (solo el dueño)
-- ----------------------------------------------------------------------------
create or replace function public.crear_acceso(p_email text, p_clave text, p_usuario_id text, p_rol text)
returns uuid
language plpgsql security definer set search_path = public, extensions, auth as $$
declare
  v_id uuid := gen_random_uuid();
  v_email text := lower(trim(p_email));
begin
  if not public.es_dueno() then raise exception 'Solo el dueño puede dar acceso a otras personas.'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Revisa el correo.'; end if;
  if length(coalesce(p_clave, '')) < 6 then raise exception 'La contraseña debe tener al menos 6 caracteres.'; end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then raise exception 'Ese correo ya tiene una cuenta.'; end if;
  if exists (select 1 from public.perfiles where usuario_id = p_usuario_id) then raise exception 'Esta persona ya tiene acceso.'; end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, email_change, email_change_token_new, recovery_token)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
          crypt(p_clave, gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text,
          jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
          'email', now(), now(), now());

  insert into public.perfiles (id, email, rol, usuario_id, activo)
  values (v_id, v_email, coalesce(nullif(p_rol, ''), 'cajero'), p_usuario_id, true);
  return v_id;
end $$;

create or replace function public.cambiar_clave(p_usuario_id text, p_clave text)
returns void
language plpgsql security definer set search_path = public, extensions, auth as $$
begin
  if not public.es_dueno() then raise exception 'Solo el dueño puede cambiar contraseñas.'; end if;
  if length(coalesce(p_clave, '')) < 6 then raise exception 'La contraseña debe tener al menos 6 caracteres.'; end if;
  update auth.users set encrypted_password = crypt(p_clave, gen_salt('bf')), updated_at = now()
   where id = (select id from public.perfiles where usuario_id = p_usuario_id);
end $$;

create or replace function public.quitar_acceso(p_usuario_id text)
returns void
language plpgsql security definer set search_path = public, auth as $$
declare v_id uuid;
begin
  if not public.es_dueno() then raise exception 'Solo el dueño puede quitar accesos.'; end if;
  select id into v_id from public.perfiles where usuario_id = p_usuario_id;
  if v_id is null then return; end if;
  if v_id = auth.uid() then raise exception 'No puedes quitarte el acceso a ti mismo.'; end if;
  delete from auth.users where id = v_id;
end $$;

-- ----------------------------------------------------------------------------
-- 6. Lo que ven y hacen los clientes sin cuenta (tienda online y QR de mesa)
-- ----------------------------------------------------------------------------
create or replace function public.datos_publicos() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'config', (select jsonb_build_object(
                 'nombre', datos->'nombre', 'eslogan', datos->'eslogan', 'logo', datos->'logo',
                 'dir', datos->'dir', 'horario', datos->'horario', 'whatsapp', datos->'whatsapp',
                 'instagram', datos->'instagram', 'tiempo', datos->'tiempo', 'minimo', datos->'minimo',
                 'zonas', datos->'zonas', 'abierto', datos->'abierto', 'simplificado', datos->'simplificado',
                 'pie', datos->'pie', 'qrBanco', datos->'qrBanco')
               from public.registros where coleccion = 'config' and id = '_'),
    'productos', coalesce((select jsonb_agg(datos order by orden, id) from public.registros
                           where coleccion = 'productos' and coalesce((datos->>'eliminado')::boolean, false) = false), '[]'::jsonb),
    'cats',      coalesce((select jsonb_agg(datos order by orden, id) from public.registros where coleccion = 'cats'), '[]'::jsonb),
    'banners',   coalesce((select jsonb_agg(datos order by orden, id) from public.registros where coleccion = 'banners'), '[]'::jsonb),
    'eventos',   coalesce((select jsonb_agg(datos order by orden, id) from public.registros
                           where coleccion = 'eventos' and datos->>'estado' = 'publicado'), '[]'::jsonb),
    'menuDia',   (select datos from public.registros where coleccion = 'menuDia' and id = '_'),
    'mesas',     coalesce((select jsonb_agg(jsonb_build_object('n', datos->'n', 'zona', datos->'zona',
                           'sillas', datos->'sillas', 'estado', datos->'estado') order by orden, id)
                           from public.registros where coleccion = 'mesas'), '[]'::jsonb)
  );
$$;

create or replace function public.estado_mesa(p_n int) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'mesa', (select jsonb_build_object('n', datos->'n', 'zona', datos->'zona', 'sillas', datos->'sillas',
                    'estado', datos->'estado', 'items', coalesce(datos->'items', '[]'::jsonb), 'pagadoC', coalesce(datos->'pagadoC', '0'::jsonb))
             from public.registros where coleccion = 'mesas' and id = p_n::text),
    'llamadas', coalesce((select jsonb_agg(datos) from public.registros
                          where coleccion = 'llamadas' and datos->>'mesa' = p_n::text and datos->>'estado' = 'pendiente'), '[]'::jsonb),
    'solicitudes', coalesce((select jsonb_agg(jsonb_build_object('id', datos->'id', 'mesa', datos->'mesa', 't', datos->'t', 'items', datos->'items'))
                             from public.registros where coleccion = 'solicitudes' and datos->>'mesa' = p_n::text), '[]'::jsonb),
    'pedidos', coalesce((select jsonb_agg(jsonb_build_object('no', datos->'no', 'estado', datos->'estado', 'origen', datos->'origen'))
                         from public.registros where coleccion = 'pedidos' and datos->>'origen' = 'Mesa ' || p_n
                         and datos->>'estado' not in ('entregado', 'anulado')), '[]'::jsonb)
  );
$$;

create or replace function public.estado_pedido(p_uid text) returns jsonb
language sql stable security definer set search_path = public as $$
  select datos - 'tel' from public.registros where coleccion = 'pedidos' and id = p_uid;
$$;

create or replace function public.local_abierto() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (datos->>'abierto')::boolean from public.registros where coleccion = 'config' and id = '_'), false);
$$;

create or replace function public.siguiente_orden(p_coleccion text) returns double precision
language sql stable security definer set search_path = public as $$
  select coalesce(max(orden), 0) + 1 from public.registros where coleccion = p_coleccion;
$$;

create or replace function public.crear_pedido_web(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cfg jsonb;
  z jsonb;
  v_uid text := gen_random_uuid()::text;
  v_no bigint;
  v_ahora bigint := public.ahora_ms();
  v_del boolean := (p->>'entrega') = 'delivery';
  v_envio bigint := 0;
  v_nombre text := left(trim(coalesce(p->>'nombre', '')), 60);
  v_rep text;
  ped jsonb;
begin
  select datos into cfg from public.registros where coleccion = 'config' and id = '_';
  if cfg is null or not coalesce((cfg->>'abierto')::boolean, false) then
    raise exception 'El local no está recibiendo pedidos en este momento.';
  end if;
  if jsonb_typeof(p->'items') is distinct from 'array' or jsonb_array_length(p->'items') = 0 or jsonb_array_length(p->'items') > 60 then
    raise exception 'El pedido está vacío.';
  end if;
  if v_nombre = '' or length(regexp_replace(coalesce(p->>'tel', ''), '\D', '', 'g')) < 8 then
    raise exception 'Falta tu nombre o tu celular.';
  end if;
  if v_del then
    z := cfg->'zonas'->coalesce((p->>'zona')::int, 0);
    v_envio := round(coalesce((z->>'c')::numeric, 0) * 100);
    select split_part(datos->>'nombre', ' ', 1) into v_rep from public.registros
     where coleccion = 'usuarios' and datos->>'rol' = 'repartidor' and coalesce((datos->>'activo')::boolean, true) limit 1;
  end if;

  ped := jsonb_build_object(
    'uid', v_uid, 'no', 0, 'web', true,
    'origen', case when v_del then 'Tienda online · ' else 'Para recoger · ' end || v_nombre,
    'tipo', case when v_del then 'delivery' else 'mostrador' end,
    'cliente', v_nombre, 'tel', left(p->>'tel', 20),
    'estado', 'recibido', 'creado', v_ahora, 'envioC', v_envio,
    'pago', case when p->>'pago' = 'qr' then 'qr' else 'efectivo' end,
    'items', p->'items',
    'hist', jsonb_build_array(jsonb_build_object('e', 'recibido', 't', v_ahora)));
  if v_del then
    ped := ped || jsonb_build_object('dir', left(p->>'dir', 140), 'zona', z->>'n', 'rep', coalesce(v_rep, 'Repartidor'));
  end if;
  if coalesce(p->>'ref', '') <> '' then ped := ped || jsonb_build_object('ref', left(p->>'ref', 140)); end if;
  if coalesce(p->>'conCuanto', '') <> '' then ped := ped || jsonb_build_object('conCuanto', left(p->>'conCuanto', 12)); end if;

  insert into public.registros (coleccion, id, datos, orden, origen)
  values ('pedidos', v_uid, ped, public.siguiente_orden('pedidos'), 'tienda')
  returning (datos->>'no')::bigint into v_no;

  if p->>'pago' = 'qr' then
    insert into public.registros (coleccion, id, datos, orden, origen)
    values ('cobrosQR', 'q' || v_uid, jsonb_build_object(
      'id', 'q' || v_uid, 'h', public.hora_bolivia(), 't', v_ahora, 'ref', 'QR-' || (49000 + v_no),
      'origen', 'Pedido web N° ' || v_no, 'montoC', coalesce((p->>'totalC')::bigint, 0) + v_envio,
      'estado', 'pendiente', 'pedido', v_no), public.siguiente_orden('cobrosQR'), 'tienda');
  end if;

  insert into public.registros (coleccion, id, datos, orden, origen)
  values ('log', 'w' || v_uid, jsonb_build_object('id', 'w' || v_uid, 'h', 'Hoy ' || public.hora_bolivia(),
          'quien', 'Tienda online', 'que', 'Recibió el pedido N° ' || v_no || ' de ' || v_nombre),
          public.siguiente_orden('log'), 'tienda');

  return jsonb_build_object('no', v_no, 'uid', v_uid);
end $$;

create or replace function public.crear_solicitud(p_mesa int, p_items jsonb, p_nombre text) returns text
language plpgsql security definer set search_path = public as $$
declare v_id text := 's' || gen_random_uuid()::text;
begin
  if not public.local_abierto() then raise exception 'El local no está recibiendo pedidos por QR ahora.'; end if;
  if not exists (select 1 from public.registros where coleccion = 'mesas' and id = p_mesa::text) then raise exception 'Esa mesa no existe.'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 40 then
    raise exception 'El pedido está vacío.';
  end if;
  insert into public.registros (coleccion, id, datos, orden, origen)
  values ('solicitudes', v_id, jsonb_build_object('id', v_id, 'mesa', p_mesa, 't', public.ahora_ms(),
          'nombre', left(coalesce(p_nombre, ''), 40), 'items', p_items), public.siguiente_orden('solicitudes'), 'mesa');
  return v_id;
end $$;

create or replace function public.llamar_mesero(p_mesa int, p_tipo text, p_pago text) returns text
language plpgsql security definer set search_path = public as $$
declare v_id text;
begin
  if not exists (select 1 from public.registros where coleccion = 'mesas' and id = p_mesa::text) then raise exception 'Esa mesa no existe.'; end if;
  if p_tipo not in ('mesero', 'cuenta') then raise exception 'Llamada no válida.'; end if;
  select id into v_id from public.registros where coleccion = 'llamadas'
     and datos->>'mesa' = p_mesa::text and datos->>'tipo' = p_tipo and datos->>'estado' = 'pendiente' limit 1;
  if v_id is not null then return v_id; end if;
  v_id := 'l' || gen_random_uuid()::text;
  insert into public.registros (coleccion, id, datos, orden, origen)
  values ('llamadas', v_id, jsonb_build_object('id', v_id, 'mesa', p_mesa, 'tipo', p_tipo, 'pago', p_pago,
          't', public.ahora_ms(), 'estado', 'pendiente'), public.siguiente_orden('llamadas'), 'mesa');
  if p_tipo = 'cuenta' then
    update public.registros set datos = jsonb_set(datos, '{estado}', '"cobrar"'), origen = 'mesa'
     where coleccion = 'mesas' and id = p_mesa::text and jsonb_array_length(coalesce(datos->'items', '[]'::jsonb)) > 0;
  end if;
  return v_id;
end $$;

create or replace function public.cancelar_llamada(p_id text) returns void
language sql security definer set search_path = public as $$
  delete from public.registros where coleccion = 'llamadas' and id = p_id and datos->>'estado' = 'pendiente';
$$;

-- ----------------------------------------------------------------------------
-- 7. Permisos para usar las funciones
-- ----------------------------------------------------------------------------
revoke execute on function public.crear_acceso(text, text, text, text) from public, anon;
revoke execute on function public.cambiar_clave(text, text) from public, anon;
revoke execute on function public.quitar_acceso(text) from public, anon;
grant execute on function public.crear_acceso(text, text, text, text) to authenticated;
grant execute on function public.cambiar_clave(text, text) to authenticated;
grant execute on function public.quitar_acceso(text) to authenticated;
grant execute on function public.es_personal(), public.es_dueno() to authenticated;
grant execute on function public.datos_publicos(), public.estado_mesa(int), public.estado_pedido(text),
                         public.crear_pedido_web(jsonb), public.crear_solicitud(int, jsonb, text),
                         public.llamar_mesero(int, text, text), public.cancelar_llamada(text) to anon, authenticated;

-- Listo. Ahora corre el archivo 02-hacer-administrador.sql con tu correo.
