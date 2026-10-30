import { createClient } from '@supabase/supabase-js';

/* Las dos variables de conexión vienen del archivo .env (y en Netlify, de sus variables de entorno). */
const url = import.meta.env.VITE_SUPABASE_URL;
const clave = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const conectado = Boolean(url && clave && /^https?:\/\//.test(url));
export const supabase = conectado ? createClient(url, clave, { auth: { persistSession: true, autoRefreshToken: true } }) : null;
