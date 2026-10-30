-- ============================================================================
--  GastroMetrik · Convertir tu usuario en administrador (dueño)
--
--  ANTES: crea tu usuario en Supabase → Authentication → Users → "Add user"
--         → "Create new user", con tu correo y contraseña, y marca
--         "Auto Confirm User".
--
--  AHORA: cambia el correo de la línea de abajo por el tuyo (entre comillas
--         simples), pega todo en SQL Editor y presiona "Run".
-- ============================================================================

insert into public.perfiles (id, email, rol, usuario_id, activo)
select id, lower(email), 'dueno', 'u1', true
from auth.users
where lower(email) = lower('tu-correo@ejemplo.com')        -- ← CAMBIA ESTE CORREO
on conflict (id) do update set rol = 'dueno', activo = true, usuario_id = 'u1';

-- Comprobación: debe aparecer una fila con tu correo y el rol "dueno".
-- Si no aparece nada, revisa que el correo esté bien escrito y que el usuario exista.
select email, rol, activo from public.perfiles where rol = 'dueno';
