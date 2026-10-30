# GastroMetrik · Cómo ponerlo en internet

**Sistema de punto de venta de Notas de Café · Desarrollado por RAMN Software**

Este proyecto es el programa completo. Es una sola aplicación que se adapta sola a la computadora, la tablet y el celular. Además se puede **instalar** como app:
- **En el celular:** abre el sitio en el navegador → menú → "Agregar a la pantalla de inicio".
- **En la computadora (Chrome o Edge):** usa el ícono de instalar en la barra de direcciones.

Vas a usar tres servicios gratuitos:

| Servicio | Para qué sirve |
|---|---|
| **Supabase** | Guarda los datos: productos, ventas, mesas, usuarios. |
| **GitHub** | Guarda el código para que Netlify lo pueda leer. |
| **Netlify** | Publica el sistema en internet con su propia dirección. |

---

## Qué hay en esta carpeta

| Archivo o carpeta | Qué es |
|---|---|
| `supabase/01-esquema.sql` | Crea la base de datos. Se pega una sola vez. |
| `supabase/02-hacer-administrador.sql` | Convierte tu usuario en dueño (administrador). |
| `.env` | Las dos variables de conexión: dirección y clave pública de Supabase. |
| `src/` | El código del programa. No necesitas tocarlo. |
| `public/` | Ícono, logo y archivos para instalar la app. |
| `netlify.toml` | Le dice a Netlify cómo armar el sitio. |

---

## PARTE 1 · Supabase (la base de datos)

### 1. Crea el proyecto
1. Entra a **supabase.com** y crea una cuenta.
2. Toca **New project**.
3. Ponle un nombre (por ejemplo *gastrometrik*) y una contraseña de base de datos. Guárdala.
4. En **Region**, elige **South America (São Paulo)**.
5. Espera unos 2 minutos a que termine de crearse.

### 2. Crea la base de datos (se hace una sola vez)
1. En el menú de la izquierda entra a **SQL Editor** y toca **New query**.
2. Abre el archivo `supabase/01-esquema.sql` con el Bloc de notas. Copia **todo** y pégalo.
3. Toca **Run**.
   - Si Supabase muestra un aviso de "operación destructiva", toca **Run this query**. Es normal: el archivo solo reemplaza sus propias reglas.
4. Debe decir **Success**.

### 3. Crea tu usuario de dueño
1. En el menú de la izquierda entra a **Authentication → Users**.
2. Toca **Add user → Create new user**.
3. Escribe tu correo y una contraseña.
4. Marca **Auto Confirm User** y toca **Create user**.

### 4. Conviértelo en administrador
1. Vuelve a **SQL Editor → New query**.
2. Abre el archivo `supabase/02-hacer-administrador.sql`.
3. Cambia `tu-correo@ejemplo.com` por el correo del paso 3. Deja las comillas simples.
4. Pega todo y toca **Run**.
5. Abajo debe aparecer una fila con tu correo y el rol **dueno**.

### 5. Copia tus dos datos de conexión
1. Entra a **Project Settings** (el engranaje) **→ API**.
   - En algunos proyectos el lugar se llama **Data API** o **API Keys**.
2. Copia estos dos valores:
   - **Project URL**: algo como `https://abcdxyz.supabase.co`.
   - **Clave pública**: se llama **anon public** o **Publishable key**.
     - **Nunca uses** la clave *service_role* ni la *secret*.
3. Abre el archivo `.env` con el Bloc de notas y reemplaza los textos de ejemplo:

```
VITE_SUPABASE_URL=https://abcdxyz.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...   (tu clave pública completa)
```

4. Guarda el archivo.

> **¿Hay que crear "buckets" (carpetas de almacenamiento)?** **No.** El logo, las fotos de los productos y el QR de tu banco se guardan dentro de la misma base de datos, reducidos para que pesen poco. No hay que crear nada más en Supabase.

---

## PARTE 2 · GitHub (guardar el código)

1. Entra a **github.com** y crea una cuenta.
2. Arriba a la derecha toca **+ → New repository**.
3. Ponle el nombre `gastrometrik`, márcalo como **Private** y toca **Create repository**.
4. En la pantalla siguiente toca el enlace **uploading an existing file**.
5. Abre la carpeta `gastrometrik-app` en tu computadora.
   - Selecciona **todo su contenido** (no la carpeta en sí) y arrástralo a la página.
   - Las carpetas `src`, `public` y `supabase` deben quedar adentro.
6. Toca **Commit changes**.

> **Si al final no ves el archivo `netlify.toml`:** arrástralo otra vez solo. Windows a veces oculta los archivos que empiezan con punto (`.env`, `.gitignore`); no importa, porque el `.env` se carga en Netlify en el paso siguiente.

---

## PARTE 3 · Netlify (publicar en internet)

1. Entra a **netlify.com** y crea una cuenta. Lo más fácil es **entrar con tu cuenta de GitHub**.
2. Toca **Add new site → Import an existing project → GitHub** y elige el repositorio `gastrometrik`.
3. Netlify lee solo la configuración: *Build command* `npm run build` y *Publish directory* `dist`. No cambies nada.
4. Antes de publicar, toca **Add environment variables → Import from a .env file**.
   - Pega el contenido de tu archivo `.env`, las dos líneas.
   - También puedes agregarlas una por una con los nombres `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
5. Toca **Deploy**. Tarda 1 o 2 minutos.
6. Netlify te da una dirección como `https://nombre-raro.netlify.app`.
   - La puedes cambiar en **Site configuration → Change site name**.

> **Si cambias las variables después:** ve a **Deploys → Trigger deploy → Deploy site** para que se apliquen.

---

## PARTE 4 · Primer uso

1. Abre la dirección de Netlify y entra con el correo y la contraseña de dueño.
2. **La primera vez** GastroMetrik carga sola la carta de Notas de Café: 29 productos, categorías, mesas, insumos, recetas, proveedores y el equipo de ejemplo. Empieza sin ventas.
3. Revisa y cambia lo que haga falta:
   - **Configuración:** nombre, logo, NIT, dirección y régimen fiscal.
   - **Carta y tienda → Tienda online:**
     - WhatsApp, horario y zonas de delivery;
     - **sube la imagen del QR de cobro de tu banco**.
   - **Usuarios:** cambia los PIN de ejemplo de cada persona, porque **todos son de ejemplo**. Borra o desactiva a quien no trabaje contigo.
4. **Crear más usuarios** se hace desde dentro del sistema, sin volver a Supabase. Entra a **Usuarios → Nuevo usuario**. Hay dos maneras de que una persona entre:
   - **Solo con PIN.** Sirve para un equipo compartido, por ejemplo la tablet de caja: alguien abre la sesión una vez y cada persona cambia de usuario con su PIN de 4 números.
   - **Con su propio correo y contraseña.** Sirve para su propio celular o computadora: abre la persona con **Editar** y usa **Acceso con correo y contraseña → Dar acceso**.
5. **Códigos QR de las mesas:** en **Mesas → Códigos QR** toca **Imprimir**. Cada mesa tiene dos:
   - **"Pide aquí"**, para pedir desde el celular;
   - **"Llama al mesero"**, para llamar al mesero o pedir la cuenta.
6. **Tienda online:** comparte la dirección de tu sitio terminada en `#tienda` (por ejemplo `https://notasdecafe.netlify.app/#tienda`). El QR de la tienda está en **Carta y tienda → Tienda online**.
7. **Pantalla del cliente:** en la tablet que mira al cliente, entra con la cuenta y abre **Portada → Pantalla del cliente**. Se actualiza sola con lo que se cobra en caja.

### Bueno saber
- **Varios equipos a la vez:** caja, cocina, mesero, repartidor y pantalla del cliente se actualizan en vivo.
- **Sin internet:** se puede seguir vendiendo. Los cambios se guardan en el equipo y se envían solos al volver la conexión. Puedes revisarlo en **Configuración → Diagnóstico → Datos en la nube**.
- **Historial:** para que todo siga rápido, cada equipo carga los pedidos, ventas y movimientos de los **últimos 60 días**. Exporta a Excel cada mes si quieres guardar un respaldo.
- **Facturación:** GastroMetrik lleva el registro de tus ventas y de los datos de factura, pero **no envía facturas a Impuestos Nacionales**. La factura oficial se sigue emitiendo en tu sistema del SIN (SIAT). Confirma tu régimen con tu contador.
- **Contraseña olvidada:** el dueño la cambia desde **Usuarios → Editar → Cambiar contraseña**. Si el dueño olvida la suya, se cambia en Supabase → Authentication → Users → (tu usuario) → **Reset password** o **Send magic link**.

---

## Resumen corto

**En Supabase**
1. Crea el proyecto en la región São Paulo.
2. En SQL Editor pega `01-esquema.sql` y toca Run.
3. En Authentication → Users → Add user, crea tu correo y contraseña con **Auto Confirm**.
4. En SQL Editor pega `02-hacer-administrador.sql` con **tu correo** y toca Run.
5. En Project Settings → API copia la **Project URL** y la **clave pública (anon / publishable)** al archivo `.env`.
6. No hace falta crear buckets.

**En GitHub**
7. Crea un repositorio privado y sube todo el contenido de la carpeta `gastrometrik-app`.

**En Netlify**
8. Toca Add new site → Import from GitHub → elige el repositorio.
9. Toca Add environment variables → **Import from a .env file**, pega tu `.env` y toca Deploy.
10. Abre la dirección que te da Netlify, entra con tu correo de dueño y, desde **Usuarios**, crea al resto del equipo.
