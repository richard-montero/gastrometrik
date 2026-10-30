/* ============================================================================
   Datos de GastroMetrik en Supabase
   - Cada colección (productos, mesas, pedidos…) se guarda fila por fila en la
     tabla "registros". Solo se envía lo que cambió.
   - Los cambios de otros equipos llegan en vivo (Realtime).
   - Sin internet se sigue trabajando: los cambios esperan en una cola y se
     envían solos al volver la conexión.
   ============================================================================ */
import { useState, useEffect, useRef } from 'react';
import { supabase } from './supabase';

/* Lo que vive solo en este equipo (carritos, borradores, quién está en caja). */
const LOCALES = new Set(['cart', 'borradorMesero', 'meseroMesa', 'carritoWeb', 'miPedidoWeb', 'carritoMesa', 'sesion']);
/* Lo que es un solo registro (no una lista). */
const OBJETOS = new Set(['config', 'caja', 'menuDia', 'pantalla', 'ticketNo', 'perms', 'zonas']);
/* Historial: se cargan los últimos 62 días para que la app siga rápida con los años. */
const HISTORIAL = ['pedidos', 'ventas', 'log', 'movs', 'cobrosQR', 'llamadas', 'solicitudes'];
const CLAVES = { pedidos: x => String(x.uid || x.no), mesas: x => String(x.n), recetas: x => String(x.prod) };
const claveDe = (col, x) => (CLAVES[col] || (y => String(y.id)))(x);

const PL = 'gm:';           // datos locales
const PC = 'gm-cache:';     // copia de los datos para arrancar sin internet
const PQ = 'gm-cola';       // cambios pendientes de enviar

export const ORIGEN = (() => { try { return crypto.randomUUID(); } catch (e) { return 'e' + Date.now() + Math.random().toString(16).slice(2); } })();
export const REGISTRO = {};

const leer = (k, d) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : d; } catch (e) { return d; } };
const escribir = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

const est = {};             // colección → valor actual
const subs = {};            // colección → funciones que escuchan
const oyentesEstado = new Set();
let cola = leer(PQ, []);
let enviando = false;
let canal = null;
let sembrado = false;
let ultimoError = '';

const avisarEstado = () => oyentesEstado.forEach(f => { try { f(estadoSync()); } catch (e) {} });
export const estadoSync = () => ({ pendientes: cola.length, error: ultimoError });
export const escucharEstado = f => { oyentesEstado.add(f); return () => oyentesEstado.delete(f); };

const emitir = col => { escribir(PC + col, est[col]); (subs[col] || new Set()).forEach(f => f(est[col])); };

/* ---------- Carga inicial ---------- */
async function traerTodo() {
  const filas = [];
  const desde = new Date(Date.now() - 62 * 864e5).toISOString();
  const pedir = async filtro => {
    for (let i = 0; ; i += 1000) {
      let q = supabase.from('registros').select('coleccion,id,datos,orden').order('coleccion').order('orden').order('id').range(i, i + 999);
      q = filtro(q);
      const { data, error } = await q;
      if (error) throw error;
      filas.push(...data);
      if (data.length < 1000) break;
    }
  };
  await pedir(q => q.not('coleccion', 'in', `(${HISTORIAL.join(',')})`));
  await pedir(q => q.in('coleccion', HISTORIAL).gte('actualizado', desde));
  return filas;
}

function armar(filas) {
  const r = {};
  for (const f of filas) {
    if (OBJETOS.has(f.coleccion)) r[f.coleccion] = f.datos;
    else (r[f.coleccion] = r[f.coleccion] || []).push(f.datos);
  }
  return r;
}

/* Aplica encima lo que este equipo todavía no pudo enviar. */
function conPendientes(r) {
  for (const o of cola) {
    if (OBJETOS.has(o.c)) { if (o.t === 'u') r[o.c] = o.d; continue; }
    const lista = r[o.c] = r[o.c] || [];
    const i = lista.findIndex(x => claveDe(o.c, x) === o.i);
    if (o.t === 'd') { if (i >= 0) lista.splice(i, 1); }
    else if (i >= 0) lista[i] = o.d; else lista.push(o.d);
  }
  return r;
}

/* Devuelve: 'ok' (hay datos), 'vacio' (base nueva, falta cargar el negocio) o 'sin-red' (se usa la copia local). */
export async function cargar() {
  try {
    const filas = await traerTodo();
    const r = conPendientes(armar(filas));
    sembrado = !!r.config;
    Object.keys(est).forEach(k => delete est[k]);
    Object.assign(est, r);
    Object.keys(r).forEach(k => escribir(PC + k, r[k]));
    escribir(PC + '_sembrado', sembrado);
    return sembrado ? 'ok' : 'vacio';
  } catch (e) {
    sembrado = leer(PC + '_sembrado', false);
    if (!sembrado) throw e;
    return 'sin-red';
  }
}
export const cacheLocal = key => leer(PC + key, undefined);

/* Primera vez: sube los datos iniciales del negocio. */
export async function sembrar(inicial) {
  for (const [col, val] of Object.entries(inicial)) {
    est[col] = val;
    if (OBJETOS.has(col)) encolar({ t:'u', c:col, i:'_', d:val, o:0 });
    else val.forEach((x, idx) => encolar({ t:'u', c:col, i:claveDe(col, x), d:x, o:idx }));
    escribir(PC + col, val);
  }
  sembrado = true;
  escribir(PC + '_sembrado', true);
  await vaciarCola(true);
}

export const valor = (key, init) => {
  if (key in est) return est[key];
  if (sembrado) return OBJETOS.has(key) ? init : [];
  const c = cacheLocal(key);
  return c !== undefined ? c : init;
};

/* ---------- Envío de cambios ---------- */
function encolar(op) { cola.push({ ...op, s: Date.now() + Math.random() }); escribir(PQ, cola); avisarEstado(); }

export function cambio(col, antes, despues) {
  est[col] = despues;
  escribir(PC + col, despues);
  if (OBJETOS.has(col)) {
    if (JSON.stringify(antes) !== JSON.stringify(despues)) encolar({ t:'u', c:col, i:'_', d:despues, o:0 });
  } else {
    const prev = new Map((antes || []).map(x => [claveDe(col, x), x]));
    const vistos = new Set();
    (despues || []).forEach((x, idx) => {
      const k = claveDe(col, x); vistos.add(k);
      const p = prev.get(k);
      if (p !== x && JSON.stringify(p) !== JSON.stringify(x)) encolar({ t:'u', c:col, i:k, d:x, o:idx });
    });
    prev.forEach((_, k) => { if (!vistos.has(k)) encolar({ t:'d', c:col, i:k }); });
  }
  programar();
}

let temporizador = null;
const programar = (ms = 120) => { clearTimeout(temporizador); temporizador = setTimeout(() => vaciarCola(), ms); };

const esPermanente = e => e && e.code && /^(22|23|42|P0|PGRST)/.test(String(e.code));

export async function vaciarCola(esperar) {
  if (enviando) { if (!esperar) return; while (enviando) await new Promise(r => setTimeout(r, 150)); }
  if (!cola.length || !supabase) return;
  enviando = true;
  let fallo = false, tam = 150;
  try {
    while (cola.length) {
      const lote = cola.slice(0, tam);
      const ultimo = new Map();
      lote.forEach(o => ultimo.set(o.c + '\u0000' + o.i, o));
      const ops = [...ultimo.values()];
      const subir = ops.filter(o => o.t === 'u').map(o => ({ coleccion:o.c, id:o.i, datos:o.d, orden:o.o || 0, origen:ORIGEN }));
      const borrar = ops.filter(o => o.t === 'd');
      try {
        if (subir.length) { const { error } = await supabase.from('registros').upsert(subir, { onConflict:'coleccion,id' }); if (error) throw error; }
        const porCol = {};
        borrar.forEach(o => (porCol[o.c] = porCol[o.c] || []).push(o.i));
        for (const [c, ids] of Object.entries(porCol)) { const { error } = await supabase.from('registros').delete().eq('coleccion', c).in('id', ids); if (error) throw error; }
        const hechos = new Set(lote.map(o => o.s));
        cola = cola.filter(o => !hechos.has(o.s));
        ultimoError = '';
      } catch (e) {
        if (esPermanente(e) && tam > 1) { tam = 1; continue; }      // se reintenta de a uno para encontrar el cambio rechazado
        if (esPermanente(e)) {
          /* Un dato que la base no acepta (por ejemplo, sin permiso): se descarta para no trabar la cola. */
          ultimoError = e.message || String(e);
          console.warn('GastroMetrik: cambio rechazado por la base de datos', e);
          const malo = lote[0].s;
          cola = cola.filter(o => o.s !== malo);
        } else { fallo = true; ultimoError = 'Sin conexión'; break; }
      }
      escribir(PQ, cola); avisarEstado();
    }
  } finally {
    enviando = false;
    if (fallo) programar(5000);
  }
}
if (typeof window !== 'undefined') window.addEventListener('online', () => { programar(300); recargar(); });

/* ---------- Cambios que llegan de otros equipos ---------- */
function aplicar(col, id, datos) {
  if (OBJETOS.has(col)) { if (datos) { est[col] = datos; emitir(col); } return; }
  const lista = est[col] || [];
  const i = lista.findIndex(x => claveDe(col, x) === id);
  let nueva;
  if (!datos) { if (i < 0) return; nueva = lista.filter((_, j) => j !== i); }
  else if (i >= 0) { nueva = lista.slice(); nueva[i] = datos; }
  else nueva = [...lista, datos];
  est[col] = nueva;
  emitir(col);
}

export function tiempoReal(alReconectar) {
  if (canal) return;
  let primera = true;
  canal = supabase.channel('gm-registros')
    .on('postgres_changes', { event:'*', schema:'public', table:'registros' }, p => {
      const fila = p.eventType === 'DELETE' ? p.old : p.new;
      if (!fila || !fila.coleccion) return;
      if (fila.origen === ORIGEN) {
        /* Nuestro propio pedido nuevo: la base le dio su número oficial. */
        if (p.eventType === 'INSERT' && fila.coleccion === 'pedidos' && fila.datos) {
          const l = est.pedidos || [], i = l.findIndex(x => claveDe('pedidos', x) === fila.id);
          if (i >= 0 && l[i].no !== fila.datos.no) { const n = l.slice(); n[i] = { ...n[i], no: fila.datos.no }; est.pedidos = n; emitir('pedidos'); }
          const t = est.ticketNo; if (typeof t === 'number' && fila.datos.no > t) { est.ticketNo = fila.datos.no; emitir('ticketNo'); }
        }
        return;
      }
      if (cola.some(o => o.c === fila.coleccion && o.i === fila.id)) return;   // tenemos un cambio más nuevo esperando
      aplicar(fila.coleccion, fila.id, p.eventType === 'DELETE' ? null : fila.datos);
      if (fila.coleccion === 'pedidos' && p.eventType === 'INSERT' && fila.datos && typeof est.ticketNo === 'number' && fila.datos.no > est.ticketNo) { est.ticketNo = fila.datos.no; emitir('ticketNo'); }
    })
    .subscribe(estado => {
      if (estado === 'SUBSCRIBED') { if (!primera) { recargar(); alReconectar && alReconectar(); } primera = false; }
    });
}

/* Al volver la conexión se vuelve a leer todo, por si algo cambió mientras tanto. */
let recargando = false;
export async function recargar() {
  if (recargando || !supabase) return;
  recargando = true;
  try {
    await vaciarCola(true);
    const r = conPendientes(armar(await traerTodo()));
    const cols = new Set([...Object.keys(r), ...Object.keys(est)]);
    cols.forEach(c => {
      const v = c in r ? r[c] : (OBJETOS.has(c) ? est[c] : []);
      if (JSON.stringify(v) !== JSON.stringify(est[c])) { est[c] = v; emitir(c); }
    });
  } catch (e) { /* seguimos con lo que hay */ }
  recargando = false;
}

export function detener() { if (canal) { supabase.removeChannel(canal); canal = null; } }

/* ---------- Hook que usa toda la app ---------- */
export function usePersist(key, init) {
  const local = LOCALES.has(key);
  const [v, setV] = useState(() => local ? leer(PL + key, init) : valor(key, init));
  const previo = useRef(v);
  const remoto = useRef(undefined);
  useEffect(() => {
    if (v === remoto.current) { previo.current = v; return; }
    if (previo.current !== v) {
      const antes = previo.current; previo.current = v;
      if (local) escribir(PL + key, v); else cambio(key, antes, v);
    }
  }, [v]);
  useEffect(() => {
    if (local) return;
    const f = nv => { remoto.current = nv; setV(nv); };
    (subs[key] = subs[key] || new Set()).add(f);
    return () => subs[key].delete(f);
  }, [key]);
  REGISTRO[key] = { set: setV, init };
  return [v, setV];
}
