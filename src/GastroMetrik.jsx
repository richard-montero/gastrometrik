import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { supabase } from './supabase';
import { usePersist, REGISTRO, estadoSync, escucharEstado, cargar, sembrar, tiempoReal, detener } from './datos';
import { LOGO_SRC } from './logo';

/* Valores de la versión con base de datos (van arriba: se usan desde el inicio) */
let REPARTIDOR = 'Repartidor';
let QR_BANCO = null;
const BASE_URL = (() => { try { return location.origin + location.pathname; } catch (e) { return '/'; } })();
const nuevoId = () => { try { return crypto.randomUUID(); } catch (e) { return 'x' + Date.now() + Math.random().toString(16).slice(2); } };

/* ============ Datos de ejemplo (menú de notasdecafe) ============ */
let CATEGORIAS = [
  { id:'cafe', nombre:'Café' },
  { id:'frias', nombre:'Bebidas frías' },
  { id:'tes', nombre:'Tés y matcha' },
  { id:'sincafe', nombre:'Sin cafeína' },
  { id:'temporada', nombre:'De temporada' },
  { id:'limonadas', nombre:'Limonadas' },
  { id:'reposteria', nombre:'Repostería' },
];
let CAT = Object.fromEntries(CATEGORIAS.map(c => [c.id, c.nombre]));
const PRESENTACIONES = { taza:'Taza caliente', vaso:'Vaso frío', masa:'Repostería', shot:'Extra o agregado' };
const mk = (id, cat, nombre, precio, pres, color, extra = {}) => ({ id, cat, nombre, precio, pres, color, disponible:true, eliminado:false, stockCtl:false, stock:0, min:0, desc:'', foto:null, ...extra });
const CAFE = ['tam','leche','jarabe','shot','dulce'];
const LATTE = ['tam','leche','jarabe','dulce'];
const PRODUCTOS0 = [
  mk('p01','cafe','Espresso',12,'taza','#3E2416', { mods:['shot','dulce'] }),
  mk('p02','cafe','Latte',18,'taza','#C49A6C', { mods:CAFE }),
  mk('p03','cafe','Mocha',20,'taza','#7A4A2E', { mods:CAFE }),
  mk('p04','cafe','Hazelnut cold foam latte',24,'vaso','#B88A5E', { mods:CAFE }),
  mk('p05','cafe','Dirty matcha',24,'vaso','#8DA64E', { mods:['tam','leche','dulce'] }),
  mk('p06','cafe','Cold brew',20,'vaso','#4A2C1B', { mods:['tam','leche','jarabe','dulce'] }),
  mk('p07','cafe','Honey cinnamon americano',18,'taza','#5A3420', { mods:['tam','shot','dulce'] }),
  mk('p16','frias','Iced latte',20,'vaso','#C9A37C', { mods:CAFE }),
  mk('p17','frias','Iced caramel macchiato',24,'vaso','#C68A45', { mods:CAFE }),
  mk('p18','frias','Chocolate frío con espresso',22,'vaso','#6A3B22', { mods:['tam','leche','shot','dulce'] }),
  mk('p19','frias','Iced matcha latte',24,'vaso','#9BBF5E', { mods:LATTE }),
  mk('p20','tes','Matcha latte',22,'taza','#8DB255', { desc:'Caliente o frío', mods:['temp','tam','leche','jarabe','dulce'] }),
  mk('p21','tes','Chai latte',20,'taza','#B98457', { mods:['temp','tam','leche','dulce'] }),
  mk('p22','tes','London fog',20,'taza','#A89A8E', { desc:'Té Earl Grey con vainilla', mods:['tam','leche','dulce'] }),
  mk('p23','tes','Té en hebras',12,'taza','#B5652F', { desc:'Verde, negro, manzanilla o frutos rojos', mods:['te','dulce'] }),
  mk('p08','sincafe','Lavender latte',22,'taza','#B9A3CF', { mods:LATTE }),
  mk('p09','sincafe','Golden milk',20,'taza','#E8B53C', { mods:['tam','leche','dulce'] }),
  mk('p10','sincafe','Caramel brown sugar latte',22,'taza','#C8894A', { mods:['tam','leche','dulce'] }),
  mk('p11','sincafe','Limonada del día',14,'vaso','#E6E36A', { mods:['dulce'] }),
  mk('p12','temporada','Pumpkin spice latte',25,'taza','#D9822E', { desc:'Otoño', mods:CAFE }),
  mk('p13','temporada','Gingerbread latte',25,'taza','#A86A3C', { desc:'Invierno', disponible:false, mods:CAFE }),
  mk('p14','temporada','Fresa con crema latte',24,'taza','#EBA3AE', { desc:'Primavera', disponible:false, mods:LATTE }),
  mk('p15','temporada','Cold brew de coco',24,'vaso','#6B4A33', { desc:'Verano', disponible:false, mods:['tam','dulce'] }),
  mk('p24','limonadas','Soda italiana',18,'vaso','#E25A6C', { desc:'Frutos rojos, durazno o guayaba', mods:['sabor'] }),
  mk('p25','limonadas','Limonada de lavanda',16,'vaso','#C9B6E4', { mods:['dulce'] }),
  mk('p26','limonadas','Limonada natural o mineral',12,'vaso','#DDE873', { mods:['agua','dulce'] }),
  mk('p27','limonadas','Naranjada natural o mineral',12,'vaso','#F29A33', { mods:['agua','dulce'] }),
  mk('p28','reposteria','Croissant de mantequilla',14,'masa','#E0A552', { stockCtl:true, stock:9, min:6 }),
  mk('p29','reposteria','Rosca de canela',12,'masa','#D49040', { stockCtl:true, stock:4, min:5 }),
];

/* Modificadores: opciones que se eligen al vender */
const MODS = {
  temp:   { l:'Temperatura', tipo:'uno', def:0, ops:[{ l:'Caliente', p:0 }, { l:'Frío', p:0, t:'Frío' }] },
  tam:    { l:'Tamaño', tipo:'uno', def:0, ops:[{ l:'Regular', p:0 }, { l:'Grande', p:5, t:'Grande' }] },
  leche:  { l:'Leche', tipo:'uno', def:0, ops:[{ l:'Entera', p:0 }, { l:'Deslactosada', p:0, t:'Leche deslactosada' }, { l:'Avena', p:5, t:'Leche de avena' }, { l:'Almendra', p:5, t:'Leche de almendra' }, { l:'Coco', p:5, t:'Leche de coco' }] },
  jarabe: { l:'Jarabe', tipo:'varios', max:2, ops:['Vainilla','Avellana','Caramelo','Almendra','Canela','Lavanda','Rosa'].map(x => ({ l:x, p:4, t:'Jarabe de ' + x.toLowerCase() })) },
  shot:   { l:'Extra', tipo:'varios', max:1, ops:[{ l:'Shot de espresso', p:6, t:'Shot extra' }] },
  dulce:  { l:'Endulzante', tipo:'uno', def:0, ops:[{ l:'Normal', p:0 }, { l:'Poco dulce', p:0, t:'Poco dulce' }, { l:'Sin azúcar', p:0, t:'Sin azúcar' }, { l:'Stevia', p:0, t:'Con stevia' }] },
  sabor:  { l:'Sabor', tipo:'uno', def:null, ops:['Frutos rojos','Durazno','Guayaba'].map(x => ({ l:x, p:0, t:x })) },
  te:     { l:'Té', tipo:'uno', def:null, ops:['Verde','Negro','Manzanilla','Frutos rojos'].map(x => ({ l:x, p:0, t:'Té ' + x.toLowerCase() })) },
  agua:   { l:'Preparada con', tipo:'uno', def:0, ops:[{ l:'Agua natural', p:0 }, { l:'Agua mineral', p:0, t:'Con agua mineral' }] },
};
const modsDef = p => Object.fromEntries((p.mods || []).map(g => [g, MODS[g].tipo === 'varios' ? [] : MODS[g].def]));
const lineKey = (id, mods) => id + '|' + JSON.stringify(mods || {});
const faltaObligatorio = (p, mods) => (p.mods || []).some(g => MODS[g].tipo === 'uno' && (mods[g] === null || mods[g] === undefined));
const P0 = Object.fromEntries(PRODUCTOS0.map(p => [p.id, p]));
const ln = (id, q, sel = {}, nota) => { const mods = { ...modsDef(P0[id]), ...sel }; return { key: lineKey(id, mods), id, q, mods, nota, listo:false }; };
const ins = (id, n, u, s, min, costo) => ({ id, n, u, s, min, costo });
const INSUMOS0 = [
  ins('caf','Café en grano','kg',4.2,3,160), ins('lec','Leche entera','L',22,15,7),
  ins('alm','Leche de almendra','L',3,4,30), ins('ave','Leche de avena','L',5,4,28),
  ins('mat','Matcha','kg',0.35,0.25,600), ins('cha','Concentrado de chai','L',1.5,1,80),
  ins('ear','Té Earl Grey (bolsitas)','u',40,30,1), ins('cac','Cacao en polvo','kg',1.2,1,60),
  ins('jvn','Jarabe de vainilla','L',1.4,1,70), ins('jav','Jarabe de avellana','L',0.6,1,70),
  ins('jla','Jarabe de lavanda','L',0.9,0.5,80), ins('jca','Jarabe de caramelo','L',1.8,1,70),
  ins('azm','Azúcar morena','kg',6,3,9), ins('mie','Miel','kg',1.5,1,40),
  ins('can','Canela molida','kg',0.3,0.2,80), ins('cur','Cúrcuma','kg',0.2,0.1,60),
  ins('lim','Limón','u',60,40,0.5), ins('hie','Hielo','kg',12,10,3),
  ins('vas','Vasos para llevar','u',140,100,1.2),
];
const RECETAS0 = [
  { prod:'p02', rinde:1, ing:[['caf',.018],['lec',.22]] },
  { prod:'p03', rinde:1, ing:[['caf',.018],['lec',.2],['cac',.02],['azm',.01]] },
  { prod:'p04', rinde:1, ing:[['caf',.018],['lec',.18],['jav',.02],['hie',.15],['vas',1]] },
  { prod:'p07', rinde:1, ing:[['caf',.018],['mie',.015],['can',.001]] },
  { prod:'p08', rinde:1, ing:[['lec',.24],['jla',.02]] },
  { prod:'p09', rinde:1, ing:[['lec',.24],['cur',.003],['mie',.01],['can',.001]] },
  { prod:'p16', rinde:1, ing:[['caf',.018],['lec',.18],['hie',.15],['vas',1]] },
  { prod:'p20', rinde:1, ing:[['mat',.004],['lec',.22]] },
  { prod:'p22', rinde:1, ing:[['ear',1],['lec',.15],['jvn',.015]] },
  { prod:'p26', rinde:1, ing:[['lim',3],['azm',.03],['hie',.15]] },
];
const MOVS0 = [
  { id:1, h:'08:05', tipo:'ingreso', item:'lec', q:20, costo:140, nota:'Lácteos Pil · factura 4521', user:'Daniela Toledo' },
  { id:2, h:'10:15', tipo:'merma', item:'lec', q:1, nota:'Leche cortada', user:'Montse Azpiazu' },
  { id:3, h:'11:40', tipo:'ingreso', item:'p28', q:12, costo:96, nota:'Horneado de la mañana', user:'Dani Aguirre' },
  { id:4, h:'14:40', tipo:'ajuste', item:'hie', q:12, antes:9, nota:'Conteo del freezer', user:'Daniela Toledo' },
];
const MESAS0 = [
  { n:1, zona:'Salón', sillas:4, estado:'ocupada', personas:3, min:18, pagadoC:0, items:[ln('p02',2,{ leche:2 }), ln('p28',1), ln('p16',1)] },
  { n:2, zona:'Salón', sillas:2, estado:'libre', pagadoC:0, items:[] },
  { n:3, zona:'Salón', sillas:4, estado:'cobrar', personas:4, min:46, pagadoC:0, items:[ln('p03',2), ln('p20',1,{ temp:1 }), ln('p24',2,{ sabor:0 }), ln('p29',1)] },
  { n:4, zona:'Salón', sillas:4, estado:'ocupada', personas:2, min:7, pagadoC:0, items:[ln('p01',1,{ shot:[0] }), ln('p07',1)] },
  { n:5, zona:'Salón', sillas:6, estado:'libre', pagadoC:0, items:[] },
  { n:6, zona:'Salón', sillas:2, estado:'cobrar', personas:2, min:32, pagadoC:0, items:[ln('p08',1), ln('p26',1,{ agua:1 })] },
  { n:7, zona:'Escenario', sillas:4, estado:'ocupada', personas:4, min:12, pagadoC:0, items:[ln('p06',2), ln('p17',2,{ tam:1 }), ln('p28',2)] },
  { n:8, zona:'Escenario', sillas:2, estado:'libre', pagadoC:0, items:[] },
];
const CAJA0 = {
  abierta:true, apertura:30000, por:'Daniela Toledo', hora:'07:30', tickets:214, descuentos:0, ultimo:null,
  ventas:{ efectivo:294000, qr:261000, tarjeta:93000 }, propinas:{ efectivo:0, qr:0, tarjeta:0 },
  movs:[{ id:1, tipo:'egreso', k:'Compra de leche entera', h:'08:05', v:18000, por:'Daniela Toledo' }, { id:2, tipo:'egreso', k:'Bolsa de hielo', h:'14:40', v:2500, por:'Montse Azpiazu' }],
};
const T0 = Date.now();
const PEDIDOS0 = [
  { no:141, origen:'Mesa 3', tipo:'mesa', estado:'listo', creado:T0-14*6e4, items:[ln('p03',2), ln('p20',1,{ temp:1 }), ln('p24',2,{ sabor:0 })].map(x => ({ ...x, listo:true })) },
  { no:142, origen:'Delivery', dir:'Av. Cañoto #812', rep: REPARTIDOR, tipo:'delivery', estado:'camino', creado:T0-24*6e4, items:[ln('p16',2), ln('p04',1)].map(x => ({ ...x, listo:true })) },
  { no:143, origen:'Mesa 7', tipo:'mesa', estado:'prep', creado:T0-11*6e4, items:[{ ...ln('p06',2, {}, 'Uno sin hielo'), listo:true }, ln('p17',2,{ tam:1 })] },
  { no:144, origen:'Mostrador · Karen', tipo:'mostrador', estado:'prep', creado:T0-4*6e4, items:[ln('p20',1,{ leche:2 }), ln('p29',1)] },
  { no:145, origen:'Delivery', dir:'Calle Sucre #245', rep: REPARTIDOR, tipo:'delivery', estado:'recibido', creado:T0-2*6e4, items:[ln('p02',2,{ leche:2, jarabe:[0] }), ln('p28',2)] },
  { no:146, origen:'Mesa 4', tipo:'mesa', estado:'recibido', creado:T0-1*6e4, items:[ln('p01',1,{ shot:[0] }, 'Espresso doble'), ln('p07',1)] },
];
const ESTADO_MESA = {
  libre:   { label:'Libre',      cls:'pill-green', c:'var(--green)', soft:'var(--green-soft)' },
  ocupada: { label:'Ocupada',    cls:'pill-gold',  c:'var(--gold)',  soft:'var(--gold-soft)' },
  cobrar:  { label:'Por cobrar', cls:'pill-red',   c:'var(--red)',   soft:'var(--red-soft)' },
  reservada: { label:'Reservada', cls:'pill-blue', c:'var(--blue)', soft:'var(--blue-soft)' },
};
const VISTAS = [
  { id:'inicio', grupo:'Operación', full:'Resumen del día', nav:'Resumen', short:'Inicio', icon:'dash', perm:'reportes' },
  { id:'venta', grupo:'Operación', full:'Punto de venta', nav:'Punto de venta', short:'Venta', icon:'venta' },
  { id:'pedidos', grupo:'Operación', full:'Pedidos', nav:'Pedidos', short:'Pedidos', icon:'pedidos', perm:'pedidos' },
  { id:'mesas', grupo:'Operación', full:'Mapa de mesas', nav:'Mesas', short:'Mesas', icon:'mesas' },
  { id:'cocina', grupo:'Operación', full:'Cocina y barra', nav:'Cocina', short:'Cocina', icon:'cocina' },
  { id:'eventos', grupo:'Operación', full:'Eventos y reservas', nav:'Eventos', short:'Eventos', icon:'note' },
  { id:'caja', grupo:'Operación', full:'Cierre de caja', nav:'Caja', short:'Caja', icon:'caja' },
  { id:'productos', grupo:'Catálogo', full:'Productos y precios', nav:'Productos', short:'Productos', icon:'tag' },
  { id:'carta', grupo:'Catálogo', full:'Carta y tienda online', nav:'Carta y tienda', short:'Carta', icon:'libro', perm:'productos' },
  { id:'inventario', grupo:'Catálogo', full:'Inventario y recetas', nav:'Inventario', short:'Inventario', icon:'inventario' },
  { id:'compras', grupo:'Finanzas', full:'Compras y proveedores', nav:'Compras', short:'Compras', icon:'camion' },
  { id:'finanzas', grupo:'Finanzas', full:'Finanzas', nav:'Gastos y cobros', short:'Finanzas', icon:'recibo' },
  { id:'reportes', grupo:'Finanzas', full:'Reportes', nav:'Reportes', short:'Reportes', icon:'reportes' },
  { id:'usuarios', grupo:'Ajustes', full:'Usuarios y roles', nav:'Usuarios', short:'Usuarios', icon:'usuarios' },
  { id:'config', grupo:'Ajustes', full:'Configuración', nav:'Configuración', short:'Ajustes', icon:'gear' },
];

/* Usuarios, roles y permisos */
const ROLES = {
  dueno:  { label:'Dueño',  bg:'var(--gold-soft)',  fg:'var(--gold-text)', desc:'Acceso total al sistema.' },
  cajero: { label:'Cajero', bg:'var(--green-soft)', fg:'var(--green-text)', desc:'Vende, cobra, maneja mesas y cierra caja.' },
  cocina: { label:'Cocina y barra', bg:'var(--red-soft)', fg:'var(--red-text)', desc:'Prepara pedidos y controla insumos.' },
  mozo:   { label:'Mesero', bg:'var(--blue-soft)',  fg:'var(--blue-text)', desc:'Toma pedidos y atiende mesas desde su celular.' },
  repartidor: { label:'Repartidor', bg:'var(--teal-soft)', fg:'var(--teal-text)', desc:'Lleva los pedidos de delivery.' },
};
const PERMISOS = [
  { k:'pedidos', l:'Tomar pedidos', vista:'venta' },
  { k:'cobrar', l:'Cobrar' },
  { k:'mesas', l:'Ver y mover mesas', vista:'mesas' },
  { k:'cocina', l:'Pantalla de cocina y barra', vista:'cocina' },
  { k:'eventos', l:'Eventos y reservas', vista:'eventos' },
  { k:'caja', l:'Cierre de caja', vista:'caja' },
  { k:'productos', l:'Editar productos y precios', vista:'productos' },
  { k:'inventario', l:'Inventario y recetas', vista:'inventario' },
  { k:'reportes', l:'Ver reportes', vista:'reportes' },
  { k:'usuarios', l:'Gestionar usuarios', vista:'usuarios' },
  { k:'config', l:'Configuración del negocio', vista:'config' },
  { k:'descuentos', l:'Descuentos y cortesías' },
  { k:'anular', l:'Anular productos enviados' },
  { k:'compras', l:'Compras y proveedores', vista:'compras' },
  { k:'finanzas', l:'Gastos, cobros QR y facturación', vista:'finanzas' },
  { k:'delivery', l:'App del repartidor' },
];
const PERM0 = {
  dueno: PERMISOS.map(p => p.k),
  cajero: ['pedidos','cobrar','mesas','cocina','eventos','caja'],
  cocina: ['cocina','inventario'],
  mozo: ['pedidos','mesas','cocina','eventos'],
  repartidor: ['delivery'],
};
const TURNOS = ['Mañana', 'Tarde', 'Noche', 'Todo el día'];
const USUARIOS0 = [
  { id:'u1', nombre:'Administrador', puesto:'Dueño del negocio', rol:'dueno', tel:'', email:'', turno:'Todo el día', pin:'1234', activo:true, ultimo:'Hoy 07:20' },
  { id:'u2', nombre:'Daniela Toledo', puesto:'Experiencia del cliente', rol:'cajero', tel:'70012345', email:'', turno:'Tarde', pin:'2580', activo:true, ultimo:'Hoy 14:02' },
  { id:'u3', nombre:'Montse Azpiazu', puesto:'Barista', rol:'cocina', tel:'76543210', email:'', turno:'Tarde', pin:'1111', activo:true, ultimo:'Hoy 14:10' },
  { id:'u4', nombre:'Dani Aguirre', puesto:'Repostería', rol:'cocina', tel:'', email:'', turno:'Mañana', pin:'2222', activo:true, ultimo:'Hoy 06:45' },
  { id:'u5', nombre:'Lidia Fernanda', puesto:'Salón · mesas 1 a 6', rol:'mozo', tel:'69011223', email:'', turno:'Tarde', pin:'3333', activo:true, ultimo:'Hoy 14:30' },
  { id:'u6', nombre:'Dany Martínez', puesto:'Escenario · noches de música', rol:'mozo', tel:'', email:'', turno:'Noche', pin:'4444', activo:true, ultimo:'Ayer 23:40' },
  { id:'u8', nombre:'Jhonny Vaca', puesto:'Delivery en moto', rol:'repartidor', tel:'75566778', email:'', turno:'Tarde', pin:'6666', activo:true, ultimo:'Hoy 14:00' },
  { id:'u7', nombre:'Karen Suárez', puesto:'Mostrador', rol:'cajero', tel:'71234567', email:'', turno:'Mañana', pin:'5555', activo:false, ultimo:'12 oct.' },
];
const LOG0 = [
  { id:1, h:'Ayer 22:10', quien:'Administrador', que:'Cambió el precio de Latte a Bs 18' },
  { id:2, h:'Hoy 07:20', quien:'Administrador', que:'Inició sesión' },
  { id:3, h:'Hoy 07:31', quien:'Administrador', que:'Desactivó la cuenta de Karen Suárez' },
  { id:4, h:'Hoy 14:02', quien:'Daniela Toledo', que:'Inició sesión' },
];
const CONFIG0 = { nombre:'Notas de Café', eslogan:'Café · arte · música', logo:null, razon:'Notas de Café', nit:'', dir:'Santa Cruz de la Sierra, Bolivia', tel:'', pie:'Gracias por tu visita. Te esperamos en la próxima noche de música.', simplificado:false, rtsActividad:'vivandero', rtsCapital:'' };
const IVA = 0.13;
/* Régimen Tributario Simplificado (RTS) · DS 24484, 27924 y 3698 */
const RTS_CATEGORIAS = [
  { cat:1, desde:12001, hasta:15000, cuota:47 },
  { cat:2, desde:15001, hasta:18700, cuota:90 },
  { cat:3, desde:18701, hasta:23500, cuota:147 },
  { cat:4, desde:23501, hasta:29500, cuota:158 },
  { cat:5, desde:29501, hasta:37000, cuota:200 },
  { cat:6, desde:37001, hasta:60000, cuota:350 },
];
const RTS_ACTIVIDADES = {
  vivandero:{ l:'Vivandero', d:'Vende comidas, bebidas y alimentos en kioscos y pequeños locales.', pmax:148 },
  minorista:{ l:'Comerciante minorista', d:'Compra y vende mercadería o presta servicios en mercados, ferias, kioscos o pequeñas tiendas.', pmax:480 },
  artesano:{ l:'Artesano', d:'Ejerce un arte u oficio manual por cuenta propia.', pmax:640 },
};
const RTS_VENTAS_MAX = 184000;
let VENTAS_HOY = 1;
const rtsCategoria = cap => RTS_CATEGORIAS.find(c => cap >= c.desde && cap <= c.hasta) || null;
let FISCAL = { simplificado:false };
let NEGOCIO = 'Notas de Café';
const precioNeto = precio => FISCAL.simplificado ? precio : precio * (1 - IVA);
const iniciales = n => n.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const leerImagen = (file, max, cb) => {
  const r = new FileReader();
  r.onload = () => { const img = new Image(); img.onload = () => {
    const s = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas');
    c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    cb(c.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', .85));
  }; img.src = r.result; };
  r.readAsDataURL(file);
};

/* ============ Utilidades ============ */
let P = Object.fromEntries(PRODUCTOS0.map(p => [p.id, p]));
const bs = n => 'Bs ' + Number(n).toLocaleString('es-BO', { minimumFractionDigits: Math.round(n * 100) % 100 ? 2 : 0, maximumFractionDigits: 2 });
const r2 = n => Math.round(n * 100) / 100;
const lineUnit = it => lineUnitC(it) / 100;
const modsTxt = it => Object.entries(it.mods || {}).flatMap(([g, v]) => { const M = MODS[g]; if (!M) return []; if (Array.isArray(v)) return v.map(i => M.ops[i].t || M.ops[i].l); if (v === null || v === undefined || v === M.def) return []; return [M.ops[v].t || M.ops[v].l]; }).join(' · ');
const total = items => totalC(items) / 100;
const unidades = items => items.reduce((s, it) => s + it.q, 0);
const leerHash = () => { const h = (location.hash || '').slice(1).split('/')[0]; return VISTAS.some(v => v.id === h) || APPS.includes(h) ? h : 'portada'; };
const mezclar = (a, b) => { const r = a.map(x => ({...x})); b.forEach(it => { const f = r.find(x => (x.key || x.id) === (it.key || it.id)); if (f) { f.q += it.q; if (it.nota) f.nota = f.nota && f.nota !== it.nota ? f.nota + ' · ' + it.nota : it.nota; } else r.push({...it}); }); return r; };
const numTxt = v => String(r2(v)).replace('.', ',');
const cant = (v, u) => `${numTxt(v)} ${u}`;
const chica = u => u === 'kg' ? 'g' : u === 'L' ? 'ml' : 'u';
const factor = u => u === 'u' ? 1 : 1000;
const hora = () => new Date().toLocaleTimeString('es-BO', { hour:'2-digit', minute:'2-digit', hour12:false });
const costoReceta = (r, I) => r.ing.reduce((s, [id, c]) => s + (I[id] ? I[id].costo * c : 0), 0) / (r.rinde || 1);

/* ============ Cálculos de dinero: centavos enteros, funciones puras ============ */
const aC = n => Math.round(Number(n || 0) * 100);
const bsC = c => bs(c / 100);
const leerMontoC = txt => aC(Number(String(txt || '').replace(',', '.')) || 0);
const lineUnitC = it => { const p = P[it.id]; if (!p) return 0; return aC(p.precio) + Object.entries(it.mods || {}).reduce((s, [g, v]) => { const M = MODS[g]; if (!M) return s; return s + (Array.isArray(v) ? v.reduce((a, i) => a + aC(M.ops[i].p), 0) : v === null || v === undefined ? 0 : aC(M.ops[v].p)); }, 0); };
const totalC = items => items.reduce((s, it) => s + lineUnitC(it) * it.q, 0);
const partesC = (tC, n) => { const base = Math.floor(tC / n), resto = tC - base * n; return Array.from({ length: n }, (_, i) => base + (i < resto ? 1 : 0)); };
const descuentoC = (baseC, tipo, valor) => tipo === 'cortesia' ? baseC : tipo === 'monto' ? Math.min(baseC, Math.max(0, aC(valor))) : Math.round(baseC * Number(valor) / 100);
const propinaC = (netoC, tipo, valor) => tipo === 'otro' ? Math.max(0, aC(valor)) : Math.round(netoC * Number(tipo) / 100);
const ivaC = c => Math.round(c * 13 / 100);
const cambioC = (recibidoC, cobrarC) => Math.max(0, recibidoC - cobrarC);
const contadoC = cnt => Object.entries(cnt).reduce((s, [v, n]) => s + aC(v) * n, 0);
const esperadoC = caja => { const mov = caja.movs.reduce((s, x) => s + (TIPOS_MOV[x.tipo].s < 0 ? -x.v : x.v), 0); return caja.apertura + caja.ventas.efectivo + caja.propinas.efectivo + mov; };

/* Pruebas de las funciones de cálculo (se ven en Configuración → Diagnóstico) */
const PRUEBAS = () => {
  const L = (id, q, sel) => { const p = P[id]; const mods = { ...modsDef(p), ...(sel || {}) }; return { key: lineKey(id, mods), id, q, mods }; };
  const casos = [
    ['Latte base cuesta Bs 18', () => lineUnitC(L('p02', 1)) === 1800],
    ['Latte grande + avena + vainilla cuesta Bs 32', () => lineUnitC(L('p02', 1, { tam:1, leche:2, jarabe:[0] })) === 3200],
    ['Dos jarabes suman Bs 8', () => lineUnitC(L('p02', 1, { jarabe:[0, 1] })) - 1800 === 800],
    ['Total de 2 Latte + 1 Croissant = Bs 50', () => totalC([L('p02', 2), L('p28', 1)]) === 5000],
    ['Bs 110 entre 3 = 36,67 + 36,67 + 36,66', () => partesC(11000, 3).join() === '3667,3667,3666'],
    ['Las partes siempre suman el total (200 casos)', () => Array.from({ length: 200 }, (_, i) => [1003 + i * 137, 2 + i % 11]).every(([t, n]) => partesC(t, n).reduce((a, b) => a + b, 0) === t)],
    ['Descuento 10 % de Bs 128 = Bs 12,80', () => descuentoC(12800, '10', 10) === 1280],
    ['Descuento fijo no supera la cuenta', () => descuentoC(5000, 'monto', 80) === 5000],
    ['Cortesía descuenta todo', () => descuentoC(4550, 'cortesia') === 4550],
    ['Propina 10 % de Bs 115,20 = Bs 11,52', () => propinaC(11520, '10') === 1152],
    ['IVA 13 % de Bs 115,20 = Bs 14,98', () => ivaC(11520) === 1498],
    ['Cambio de Bs 200 para Bs 126,72 = Bs 73,28', () => cambioC(20000, 12672) === 7328],
    ['Sin cambio negativo', () => cambioC(1000, 2000) === 0],
    ['Monto escrito con coma: "12,5" = Bs 12,50', () => leerMontoC('12,5') === 1250],
    ['0,1 + 0,2 sin error de redondeo', () => aC(0.1) + aC(0.2) === 30],
    ['Conteo de caja de ejemplo = Bs 3.026', () => contadoC({ 200:8, 100:9, 50:6, 20:8, 10:5, 5:2, 2:3, 1:0, 0.5:0 }) === 302600],
    ['Moneda de 50 centavos cuenta bien', () => contadoC({ 0.5:3 }) === 150],
    ['RTS: Bs 15.000 es categoría 1', () => rtsCategoria(15000).cat === 1],
    ['RTS: Bs 15.001 es categoría 2', () => rtsCategoria(15001).cat === 2],
    ['RTS: más de Bs 60.000 no tiene categoría', () => rtsCategoria(60001) === null],
    ['Misma bebida y opciones se juntan en una línea', () => mezclar([L('p02', 1, { leche:2 })], [L('p02', 2, { leche:2 })]).length === 1],
    ['Distintas opciones quedan en líneas separadas', () => mezclar([L('p02', 1)], [L('p02', 1, { leche:2 })]).length === 2],
    ['Soda italiana exige elegir sabor', () => faltaObligatorio(P.p24, modsDef(P.p24)) === true],
  ];
  return casos.map(([n, f]) => { let ok = false; try { ok = !!f(); } catch (e) { ok = false; } return { n, ok }; });
};

const ICONS = {
  venta:'M3 7h18l-1.6 11.2a2 2 0 0 1-2 1.8H6.6a2 2 0 0 1-2-1.8L3 7Z M8.5 7V5.5a3.5 3.5 0 0 1 7 0V7 M9 12h6',
  mesas:'M3 9h18 M5 9 4 20 M19 9l1 11 M12 9v5 M8 14h8 M7 5h10',
  cocina:'M6 13.5A4 4 0 0 1 7.6 6a5 5 0 0 1 8.8 0A4 4 0 0 1 18 13.5V20H6v-6.5Z M6 16.5h12',
  caja:'M3 10h18v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9Z M6 10V5h12v5 M12 14v2 M9 7.5h6',
  inventario:'M21 8 12 3 3 8v8l9 5 9-5V8Z M3 8l9 5 9-5 M12 13v8 M7.5 5.5l9 5',
  reportes:'M4 4v16h16 M8 16v-4 M12 16V8 M16 16v-6',
  usuarios:'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M2 21a7 7 0 0 1 14 0 M16 3.5a4 4 0 0 1 0 7.5 M18.5 14.5A6 6 0 0 1 22 21',
  tag:'M3 12.2V4h8.2l9.3 9.3a1.5 1.5 0 0 1 0 2.1l-6.1 6.1a1.5 1.5 0 0 1-2.1 0L3 12.2Z M7.5 8.5h.01',
  edit:'M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z M14.5 7.5l3 3',
  plus:'M12 5v14 M5 12h14', minus:'M5 12h14', x:'M6 6l12 12 M18 6 6 18',
  search:'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z M20 20l-4-4',
  check:'M5 12.5l4.5 4.5L19 7.5', clock:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 7v5l3 2',
  moto:'M5.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z M18.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z M8 15.5h6l3.5-6.5H13 M14.5 5H17l1.5 8',
  alert:'M12 3 2 20h20L12 3Z M12 10v4 M12 17h.01',
  cash:'M2 7h20v10H2z M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z M5.5 10v4 M18.5 10v4',
  qr:'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h2.5v2.5H14z M18 18h2v2h-2z M14 19h2 M19 14v2',
  card:'M2 6h20v12H2z M2 10h20 M6 15h4',
  store:'M4 10v10h16V10 M3 4h18l-1 6H4L3 4Z M9 20v-5h6v5',
  bag:'M5 8h14l-1 12H6L5 8Z M9 8V6a3 3 0 0 1 6 0v2',
  arrow:'M5 12h14 M13 6l6 6-6 6', lock:'M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4',
  flame:'M12 21c-4 0-6.5-2.6-6.5-6.2 0-3.6 3.2-5.6 3.8-9.8 2.5 1.6 3.4 3.6 3.4 5.4 1.1-.6 1.7-1.7 1.9-2.9 2 1.8 3.4 4.3 3.4 7.3 0 3.6-2.5 6.2-6 6.2Z',
  bell:'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16Z M10 21h4',
  inbox:'M3 13h5l1.5 3h5L16 13h5 M5 5h14l2 8v6H3v-6l2-8Z',
  trash:'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
  camera:'M3 8h4l2-3h6l2 3h4v11H3V8Z M12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
  down:'M12 4v13 M6 11l6 6 6-6', up:'M12 20V7 M6 13l6-6 6 6', scale:'M12 3v18 M5 21h14 M4 8h16 M4 8l-2.5 6a3 3 0 0 0 5 0L4 8Z M20 8l-2.5 6a3 3 0 0 0 5 0L20 8Z',
  note:'M9 18V5l11-2v13 M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z M20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  gear:'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
  key:'M14.5 9.5a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z M13.3 12.3 21 20 M18 17l2-2 M16 15l1.5-1.5',
  logout:'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
  shield:'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z M9 12l2 2 4-4',
  back:'M15 18l-6-6 6-6',
  excel:'M4 3h11l5 5v13H4z M14 3v5h6 M8 12l5 6 M13 12l-5 6',
  sol:'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z M12 1v2 M12 21v2 M4.2 4.2l1.4 1.4 M18.4 18.4l1.4 1.4 M1 12h2 M21 12h2 M4.2 19.8l1.4-1.4 M18.4 5.6l1.4-1.4',
  luna:'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z',
  auto:'M12 3a9 9 0 1 0 0 18Z M12 3a9 9 0 0 1 0 18',
  lista:'M8 6h13 M8 12h13 M8 18h13 M3.5 6h.01 M3.5 12h.01 M3.5 18h.01',
  cuadros:'M3 3h8v8H3z M13 3h8v8h-8z M3 13h8v8H3z M13 13h8v8h-8z',
  ayuda:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3 M12 17h.01',
  letra:'M4 19l5-14 5 14 M5.8 14h6.4 M15 19l3-8 3 8 M16 16.5h4',
  deshacer:'M9 14L4 9l5-5 M4 9h10.5a5.5 5.5 0 0 1 0 11H11', print:'M7 9V3h10v6 M6 18H4v-8h16v8h-2 M7 14h10v7H7z', wifi:'M2 8.5a15 15 0 0 1 20 0 M5 12a10 10 0 0 1 14 0 M8.5 15.5a5 5 0 0 1 7 0 M12 19h.01 M3 3l18 18', cal:'M4 5h16v16H4z M4 9.5h16 M8.5 3v4 M15.5 3v4 M8 13.5h3', ticket:'M3 7h18v3.2a1.8 1.8 0 0 0 0 3.6V17H3v-3.2a1.8 1.8 0 0 0 0-3.6V7Z M15 7v10', mas:'M5 12h.01 M12 12h.01 M19 12h.01', del:'M21 5H9l-7 7 7 7h12V5Z M17 9l-6 6 M11 9l6 6',
};
const Icon = ({ n, s = 22, w = 1.9 }) => (
  <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={ICONS[n]} />
  </svg>
);

/* Ilustración del producto o su foto real */
function Art({ p }) {
  if (p.foto) return <img src={p.foto} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />;
  const c = p.color;
  if (p.pres === 'entrada') return (
    <svg viewBox="0 0 120 90">
      <path d="M14 24h92v13a8 8 0 0 0 0 16v13H14V53a8 8 0 0 0 0-16V24Z" fill={c} transform="rotate(-6 60 45)" />
      <path d="M80 26v38" stroke="#fff" strokeWidth="2" strokeDasharray="3 4" transform="rotate(-6 60 45)" />
      <g transform="rotate(-6 60 45)" fill="#fff"><circle cx="40" cy="52" r="5" /><rect x="44" y="30" width="3" height="22" /><path d="M47 30c6 2 9 5 9 10-2-3-5-4-9-4Z" /></g>
    </svg>
  );
  const hi = { fill:'rgba(255,255,255,.38)' };
  if (p.pres === 'masa') return (
    <svg viewBox="0 0 120 90">
      <ellipse cx="60" cy="76" rx="48" ry="9" style={{ fill:'var(--plate)' }} />
      {/rosca/i.test(p.nombre) ? (<g><circle cx="60" cy="54" r="21" fill="none" stroke={c} strokeWidth="15" /><path d="M48 42 q12 8 24 0 M42 58 q18 -6 36 0" stroke="rgba(110,55,10,.35)" strokeWidth="2.5" fill="none" /></g>) : (
        <g><path d="M18 64 Q30 30 60 30 Q90 30 102 64 Q92 70 84 62 Q74 72 60 66 Q46 72 36 62 Q28 70 18 64 Z" fill={c} />
          <path d="M42 36 L48 62 M60 31 V64 M78 36 L72 62" stroke="rgba(110,55,10,.35)" strokeWidth="2.5" strokeLinecap="round" />
          <ellipse cx="52" cy="38" rx="12" ry="3.5" style={hi} /></g>)}
    </svg>
  );
  if (p.pres === 'taza') {
    const arte = !/espresso|americano|té |chai/i.test(p.nombre + ' ');
    return (
      <svg viewBox="0 0 120 90">
        <ellipse cx="58" cy="78" rx="42" ry="8" style={{ fill:'var(--plate)' }} />
        <path d="M86 44 a11 11 0 0 1 0 20" fill="none" style={{ stroke:'var(--cup)' }} strokeWidth="7" />
        <path d="M30 38 h56 v12 a28 27 0 0 1 -56 0 Z" style={{ fill:'var(--cup)' }} />
        <ellipse cx="58" cy="38" rx="28" ry="6" fill={c} />
        {arte && <path d="M58 41 C50 37 50 33 54 33 C56 33 58 35 58 36 C58 35 60 33 62 33 C66 33 66 37 58 41 Z" fill="#FBF3E6" />}
        <g fill="none" stroke={c} strokeOpacity=".5" strokeWidth="2.6" strokeLinecap="round">
          <path d="M48 26 q-4 -6 0 -12 q4 -6 0 -10" /><path d="M60 24 q-4 -6 0 -12 q4 -6 0 -10" /><path d="M72 26 q-4 -6 0 -12" />
        </g>
      </svg>
    );
  }
  if (p.pres === 'shot') return (
    <svg viewBox="0 0 120 90">
      <ellipse cx="60" cy="80" rx="30" ry="6" style={{ fill:'var(--plate)' }} />
      <path d="M44 34 h32 l-4 44 h-24 Z" style={{ fill:'var(--glass)' }} />
      <path d="M45.5 46 h29 l-3 31 h-23 Z" fill={c} />
      <path d="M45.5 46 h29 l-.6 6 h-27.8 Z" fill="rgba(255,255,255,.35)" />
    </svg>
  );
  return (
    <svg viewBox="0 0 120 90">
      <ellipse cx="60" cy="84" rx="22" ry="4" fill="rgba(0,0,0,.1)" />
      <path d="M40 18 L80 18 L74 84 L46 84 Z" style={{ fill:'var(--glass)' }} />
      <path d="M41.5 32 L78.5 32 L74 82 L46 82 Z" fill={c} />
      <rect x="48" y="38" width="12" height="12" rx="3" fill="rgba(255,255,255,.45)" transform="rotate(-12 54 44)" />
      <rect x="61" y="46" width="11" height="11" rx="3" fill="rgba(255,255,255,.4)" transform="rotate(10 66 51)" />
      <path d="M68 6 L60 52" stroke="#2F9E5C" strokeWidth="4" strokeLinecap="round" />
      {p.cat === 'limonadas' && <g><circle cx="82" cy="22" r="11" fill={c} stroke="#fff" strokeWidth="2.5" /><path d="M82 13v18 M74 22h16" stroke="#fff" strokeWidth="1.4" opacity=".8" /></g>}
    </svg>
  );
}
function Logo({ src, nombre, cls = 'brand-mark' }) { return <img className={cls} src={src || LOGO_SRC} alt={`Logo de ${nombre || 'la cafetería'}`} />; }

/* ============ Excel (.xlsx) sin librerías: XML + ZIP sin compresión ============ */
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
const zipStore = archivos => {
  const enc = new TextEncoder(); const partes = []; const central = []; let off = 0;
  const u16 = n => [n & 255, (n >>> 8) & 255], u32 = n => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
  archivos.forEach(([nombre, texto]) => {
    const nb = enc.encode(nombre), data = enc.encode(texto), crc = crc32(data);
    const loc = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nb.length), ...u16(0)]);
    partes.push(loc, nb, data);
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nb.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), nb);
    off += loc.length + nb.length + data.length;
  });
  const tamCentral = central.reduce((s, x) => s + x.length, 0);
  const fin = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(archivos.length), ...u16(archivos.length), ...u32(tamCentral), ...u32(off), ...u16(0)]);
  const todo = [...partes, ...central, fin]; const out = new Uint8Array(todo.reduce((s, x) => s + x.length, 0)); let p = 0; todo.forEach(x => { out.set(x, p); p += x.length; });
  return out;
};
const xesc = v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const colL = i => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
/* Celda: texto, número, { bs: centavos } para montos, { pct: 0.42 } para porcentajes, { int: n } enteros */
const celdaXML = (v, ref, estiloTexto) => {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'object' && 'bs' in v) return `<c r="${ref}" s="2"><v>${(v.bs / 100).toFixed(2)}</v></c>`;
  if (typeof v === 'object' && 'pct' in v) return `<c r="${ref}" s="4"><v>${v.pct}</v></c>`;
  if (typeof v === 'object' && 'int' in v) return `<c r="${ref}" s="3"><v>${v.int}</v></c>`;
  if (typeof v === 'number') return `<c r="${ref}" s="3"><v>${v}</v></c>`;
  return `<c r="${ref}" s="${estiloTexto}" t="inlineStr"><is><t xml:space="preserve">${xesc(v)}</t></is></c>`;
};
const hojaXML = h => {
  const filas = []; let r = 1;
  if (h.titulo) { filas.push(`<row r="${r}" ht="24" customHeight="1">${celdaXML(h.titulo, 'A' + r, 5)}</row>`); r++; }
  const sub = [h.sub, 'Generado con GastroMetrik · Desarrollado por RAMN Software'].filter(Boolean).join(' · ');
  filas.push(`<row r="${r}">${celdaXML(sub, 'A' + r, 6)}</row>`); r++;
  r++;
  const filaEnc = r;
  filas.push(`<row r="${r}">${h.columnas.map((c, i) => celdaXML(c, colL(i) + r, 1)).join('')}</row>`); r++;
  h.filas.forEach(f => { filas.push(`<row r="${r}">${f.map((c, i) => celdaXML(c, colL(i) + r, 0)).join('')}</row>`); r++; });
  if (h.total) { filas.push(`<row r="${r}">${h.total.map((c, i) => celdaXML(c, colL(i) + r, 7).replace(' s="2"', ' s="8"').replace(' s="3"', ' s="9"')).join('')}</row>`); r++; }
  const anchos = h.columnas.map((c, i) => Math.min(48, Math.max(10, String(c).length + 2, ...h.filas.map(f => { const v = f[i]; return v && typeof v === 'object' ? 14 : String(v === undefined || v === null ? '' : v).length + 2; }))));
  const ultima = colL(h.columnas.length - 1);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="${filaEnc}" topLeftCell="A${filaEnc + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${filas.join('')}</sheetData>${h.filas.length ? `<autoFilter ref="A${filaEnc}:${ultima}${filaEnc + h.filas.length}"/>` : ''}</worksheet>`;
};
const crearXlsx = hojas => {
  const nombres = hojas.map((h, i) => (h.nombre || 'Hoja ' + (i + 1)).replace(/[\\\/\?\*\[\]:]/g, ' ').slice(0, 31));
  const estilos = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;Bs&quot; #,##0.00"/><numFmt numFmtId="165" formatCode="0%"/></numFmts><fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="15"/><color rgb="FF0B4A2A"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0A6B3A"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDAEEDF"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border/><border><top style="thin"><color rgb="FF0A6B3A"/></top></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="10"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="164" fontId="3" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="3" fontId="3" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const archivos = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${nombres.map((n, i) => `<sheet name="${xesc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${hojas.map((h, i) => h.filas.length ? '' : '').join('')}</workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', estilos],
    ...hojas.map((h, i) => [`xl/worksheets/sheet${i + 1}.xml`, hojaXML(h)]),
  ];
  return zipStore(archivos);
};
const nombreArchivo = (negocio, que) => `${(negocio || 'cafe').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}_${que}_${hoyISO()}.xlsx`;

/* Botón de exportar: aparece solo si este visor permite guardar archivos */
let DESCARGAS = { save: async ({ filename, data }) => {
  const blob = data instanceof Blob ? new Blob([data], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }) : new Blob([data]);
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return { status:'saved' };
} };
function BotonExcel({ onExport, etiqueta = 'Exportar a Excel', compacto }) {
  const [estado, setEstado] = useState('listo');
  if (!DESCARGAS) return null;
  const clic = async () => {
    if (estado === 'trabajando') return;
    setEstado('trabajando');
    try { await onExport(); setEstado('listo'); }
    catch (e) { setEstado('listo'); }
  };
  return <button className={'btn btn-ghost btn-excel' + (compacto ? ' btn-sm' : '')} onClick={clic} disabled={estado === 'trabajando'} aria-busy={estado === 'trabajando'}><Icon n="excel" s={20} />{estado === 'trabajando' ? 'Preparando…' : etiqueta}</button>;
}
const guardarExcel = async (archivo, hojas, aviso) => {
  if (!DESCARGAS) return;
  const bytes = crearXlsx(hojas);
  try {
    const r = await DESCARGAS.save({ filename: archivo, data: new Blob([bytes]) });
    if (r && r.status === 'saved') aviso(`Excel guardado: ${archivo}`, 'excel');
  } catch (e) {
    if (e && e.code === 'declined') return;
    if (e && e.code === 'rate_limited') aviso('Ya hay una descarga esperando tu confirmación.', 'alert');
    else aviso('No se pudo guardar el Excel en este equipo. Intenta desde el navegador.', 'alert');
  }
};

/* ============ Preferencias de pantalla (por equipo) ============ */
const PREF = 'notasdecafe-pref:';
function usePref(key, init) {
  const [v, setV] = useState(() => { try { const r = localStorage.getItem(PREF + key); return r ? JSON.parse(r) : init; } catch (e) { return init; } });
  useEffect(() => { try { localStorage.setItem(PREF + key, JSON.stringify(v)); } catch (e) {} }, [key, v]);
  return [v, setV];
}
const sinTildes = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const turnoDe = d => { const h = d.getHours(); return h < 12 ? 'Turno mañana' : h < 18 ? 'Turno tarde' : 'Turno noche'; };

function Preferencias({ letra, setLetra, tema, setTema, vistaProd, setVistaProd, onGuia, onClose }) {
  useEscape(onClose);
  const Op = ({ val, cur, set, children, label }) => <button type="button" aria-pressed={cur === val} aria-label={label} onClick={() => set(val)}>{children}</button>;
  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal prefs" role="dialog" aria-modal="true" aria-labelledby="pf2-t" onClick={e => e.stopPropagation()}>
        <div className="between"><div><div className="eyebrow">Solo en este equipo</div><h2 id="pf2-t">Preferencias de pantalla</h2></div><button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icon n="x" s={20} /></button></div>
        <div className="pref-row">
          <div><b>Tamaño de letra</b><span className="muted">Agranda todo: textos, botones y precios.</span></div>
          <div className="seg seg-3 seg-letra" role="group" aria-label="Tamaño de letra">
            <Op val="normal" cur={letra} set={setLetra} label="Letra normal"><span style={{ fontSize:16 }}>A</span>Normal</Op>
            <Op val="grande" cur={letra} set={setLetra} label="Letra grande"><span style={{ fontSize:21 }}>A</span>Grande</Op>
            <Op val="xl" cur={letra} set={setLetra} label="Letra muy grande"><span style={{ fontSize:26 }}>A</span>Muy grande</Op>
          </div>
        </div>
        <div className="pref-row">
          <div><b>Colores</b><span className="muted">Oscuro descansa la vista de noche.</span></div>
          <div className="seg seg-3" role="group" aria-label="Colores">
            <Op val="auto" cur={tema} set={setTema}><Icon n="auto" s={20} />Automático</Op>
            <Op val="light" cur={tema} set={setTema}><Icon n="sol" s={20} />Claro</Op>
            <Op val="dark" cur={tema} set={setTema}><Icon n="luna" s={20} />Oscuro</Op>
          </div>
        </div>
        <div className="pref-row">
          <div><b>Productos en caja</b><span className="muted">Fotos grandes son más fáciles de reconocer.</span></div>
          <div className="seg" style={{ gridTemplateColumns:'repeat(2,1fr)' }} role="group" aria-label="Vista de productos">
            <Op val="lista" cur={vistaProd} set={setVistaProd}><Icon n="lista" s={20} />Lista rápida</Op>
            <Op val="cuadros" cur={vistaProd} set={setVistaProd}><Icon n="cuadros" s={20} />Fotos grandes</Op>
          </div>
        </div>
        <div className="form-actions"><button className="btn btn-ghost" onClick={() => { onClose(); onGuia(); }}><Icon n="ayuda" s={20} />Ver la guía rápida</button><span style={{ flex:1 }} /><button className="btn btn-primary" onClick={onClose}>Listo</button></div>
      </div>
    </div>
  );
}

/* ============ Guía rápida: pasos sobre la pantalla real ============ */
const PASOS_GUIA = [
  { sel: '.pos-tools', telSel: '.pos-tools', t: 'Busca o elige una categoría', d: 'Toca "Más pedidos" para lo que más se vende, o escribe el nombre de una bebida.' },
  { sel: '.plist-pos > :first-child', telSel: '.plist-pos > :first-child', t: 'Toca un producto', d: 'Se agrega al pedido. Con el botón + lo agregas sin cambios; tocando el nombre eliges tamaño, leche o jarabe.' },
  { sel: '.ticket .ctx-line', telSel: '.cart-bar', t: 'Revisa el pedido', d: 'Aquí eliges la mesa o si es para llevar, y cambias cantidades con − y +.' },
  { sel: '.ticket .foot-actions', telSel: '.cart-bar', t: 'Cobra con el botón grande', d: 'Elige efectivo, QR o tarjeta. El sistema te dice cuánto cambio entregar.' },
  { sel: '.topbar-right .user-menu', telSel: '.topbar-right .user-menu', t: '¿Letra más grande?', d: 'En tu nombre, arriba a la derecha, encuentras Preferencias para agrandar la letra o ver fotos grandes.' },
];
function Guia({ onClose }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const tel = typeof window !== 'undefined' && window.innerWidth < 900;
  const paso = PASOS_GUIA[i];
  useEscape(onClose);
  useEffect(() => {
    const medir = () => { const el = document.querySelector(tel ? paso.telSel : paso.sel); if (!el) { setRect(null); return; } el.scrollIntoView({ block:'nearest' }); const r = el.getBoundingClientRect(); setRect({ x: r.left, y: r.top, w: r.width, h: r.height }); };
    medir(); const t = setTimeout(medir, 120);
    window.addEventListener('resize', medir); return () => { clearTimeout(t); window.removeEventListener('resize', medir); };
  }, [i]);
  const pad = 8;
  const abajo = rect ? rect.y + rect.h + 16 < window.innerHeight - 220 : true;
  const tarjeta = rect ? { left: Math.max(12, Math.min(window.innerWidth - 352, rect.x)), top: abajo ? rect.y + rect.h + pad + 10 : Math.max(12, rect.y - pad - 10 - 200) } : { left:'50%', top:'50%', transform:'translate(-50%,-50%)' };
  return (
    <div className="guia" role="dialog" aria-modal="true" aria-labelledby="gu-t">
      {rect ? <div className="guia-luz" style={{ left: rect.x - pad, top: rect.y - pad, width: rect.w + pad * 2, height: rect.h + pad * 2 }} /> : <div className="guia-fondo" />}
      <div className="guia-card" style={tarjeta}>
        <div className="between"><span className="eyebrow">Paso {i + 1} de {PASOS_GUIA.length}</span><button className="link-btn" onClick={onClose}>Saltar guía</button></div>
        <h2 id="gu-t">{paso.t}</h2>
        <p>{paso.d}</p>
        <div className="guia-dots" aria-hidden="true">{PASOS_GUIA.map((_, k) => <i key={k} className={k === i ? 'on' : ''} />)}</div>
        <div className="row">
          {i > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setI(i - 1)}>Atrás</button>}
          <span style={{ flex:1 }} />
          <button className="btn btn-primary btn-sm" autoFocus onClick={() => (i < PASOS_GUIA.length - 1 ? setI(i + 1) : onClose())}>{i < PASOS_GUIA.length - 1 ? 'Siguiente' : 'Entendido'}</button>
        </div>
      </div>
    </div>
  );
}

/* Firma del desarrollador: discreta, siempre en el mismo formato */
const VERSION_APP = '1.0';
function MarcaRamn({ s = 16 }) {
  return (
    <svg className="ramn-ico" viewBox="0 0 20 20" width={s} height={s} aria-hidden="true">
      <rect x="1" y="1" width="18" height="18" rx="5.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 14.5V5.5h3.6a2.6 2.6 0 0 1 0 5.2H7 M10.4 10.7l3 3.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function Creditos({ variante }) {
  return <span className={'creditos' + (variante ? ' ' + variante : '')}><MarcaRamn />Desarrollado por <b>RAMN Software</b></span>;
}

/* ============ Guardado local, foco y movimiento ============ */
const menosMovimiento = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
/* El producto "vuela" desde la lista hasta el total del pedido */
const volar = (origen, destinoSel) => {
  try {
    if (!origen || menosMovimiento()) return;
    const destino = document.querySelector(destinoSel); if (!destino) return;
    const a = origen.getBoundingClientRect(), b = destino.getBoundingClientRect();
    if (!b.width) return;
    const g = origen.cloneNode(true); g.className = 'fly';
    Object.assign(g.style, { left: a.left + 'px', top: a.top + 'px', width: a.width + 'px', height: a.height + 'px' });
    document.body.appendChild(g);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
    const an = g.animate([{ transform:'translate(0,0) scale(1)', opacity:1 }, { transform:`translate(${dx * .55}px, ${dy * .55 - 60}px) scale(.8)`, opacity:1, offset:.55 }, { transform:`translate(${dx}px, ${dy}px) scale(.3)`, opacity:.2 }], { duration:520, easing:'cubic-bezier(.3,.7,.4,1)' });
    an.onfinish = () => { g.remove(); destino.classList.remove('pulse'); void destino.offsetWidth; destino.classList.add('pulse'); };
  } catch (e) {}
};
/* Número que cuenta hasta su nuevo valor */
function AnimNum({ value, fmt, desde }) {
  const [v, setV] = useState(desde !== undefined && !menosMovimiento() ? desde : value);
  const prev = React.useRef(desde !== undefined ? desde : value);
  useEffect(() => {
    const desde = prev.current, hasta = value; prev.current = value;
    if (desde === hasta || menosMovimiento()) { setV(hasta); return; }
    let raf, t0;
    const dur = desde !== undefined ? 700 : 320;
    const paso = t => { if (!t0) t0 = t; const k = Math.min(1, (t - t0) / dur); const e = 1 - Math.pow(1 - k, 3); setV(Math.round(desde + (hasta - desde) * e)); if (k < 1) raf = requestAnimationFrame(paso); };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{fmt(v)}</>;
}
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
/* Foco dentro de ventanas: entra al abrir, queda atrapado con Tab, vuelve al cerrar */
function useFocoDialogos() {
  useEffect(() => {
    const pila = [];
    const visibles = () => [...document.querySelectorAll('[role=dialog]')];
    const obs = new MutationObserver(() => {
      const ds = visibles();
      ds.forEach(d => { if (!d.dataset.foco) { d.dataset.foco = '1'; pila.push({ d, volver: document.activeElement }); setTimeout(() => { if (!d.contains(document.activeElement)) { const f = d.querySelector('[autofocus]') || d.querySelector('input:not([type=file]):not([type=hidden]), select, textarea') || d.querySelector(FOCUSABLE); f && f.focus({ preventScroll:true }); } }, 30); } });
      for (let i = pila.length - 1; i >= 0; i--) if (!document.body.contains(pila[i].d)) { const v = pila[i].volver; pila.splice(i, 1); if (v && document.body.contains(v)) v.focus({ preventScroll:true }); }
    });
    obs.observe(document.body, { childList:true, subtree:true });
    const tab = e => {
      if (e.key !== 'Tab') return;
      const ds = visibles(); if (!ds.length) return;
      const d = ds[ds.length - 1];
      const fs = [...d.querySelectorAll(FOCUSABLE)].filter(x => x.offsetParent !== null || x === document.activeElement);
      if (!fs.length) return;
      const i = fs.indexOf(document.activeElement);
      if (e.shiftKey && (i <= 0)) { e.preventDefault(); fs[fs.length - 1].focus(); }
      else if (!e.shiftKey && (i === -1 || i === fs.length - 1)) { e.preventDefault(); fs[0].focus(); }
    };
    document.addEventListener('keydown', tab);
    return () => { obs.disconnect(); document.removeEventListener('keydown', tab); };
  }, []);
}

/* Pantalla de cobro exitoso */
function Exito({ r, impresora, onClose }) {
  useEscape(onClose);
  useEffect(() => { const t = setTimeout(onClose, r.cambioC > 0 ? 9000 : 4500); return () => clearTimeout(t); }, []);
  return (
    <div className="scrim exito-scrim" onClick={onClose}>
      <div className="modal exito" role="dialog" aria-modal="true" aria-labelledby="ex-t" onClick={e => e.stopPropagation()}>
        <svg className="exito-check" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24" /><path d="M15 27l7.5 7.5L38 19" /></svg>
        <div className="eyebrow">{r.titulo} · {r.met}</div>
        <h2 id="ex-t" className="num">Cobrado {bsC(r.totalC)}</h2>
        {r.cambioC > 0 && <div className="exito-cambio num" aria-live="assertive"><span>Entrega de cambio</span><b>{bsC(r.cambioC)}</b></div>}
        <div className="muted num" style={{ fontSize:14 }}>{[r.descuentoC > 0 && `${r.cortesia ? 'Cortesía' : 'Descuento'} ${bsC(r.descuentoC)}`, r.propinaC > 0 && `Propina ${bsC(r.propinaC)}`, r.extra].filter(Boolean).join(' · ')}</div>
        {impresora !== 'ok' && <div className="fiscal-warn" style={{ textAlign:'left' }}><Icon n="alert" s={20} /><span>No se imprimió el ticket: {impresora === 'papel' ? 'la impresora no tiene papel' : 'la impresora está desconectada'}. Reimprímelo cuando la arregles.</span></div>}
        <button className="btn btn-primary" style={{ minWidth:220 }} onClick={onClose} autoFocus>Nuevo pedido</button>
      </div>
    </div>
  );
}

function Ayuda({ onClose, onGuia }) {
  useEscape(onClose);
  const filas = [['Ctrl + K', 'Buscar en todo el sistema'], ['/', 'Buscar en el menú'], ['1 a 9', 'Elegir la mesa del pedido'], ['Enter', 'Cobrar el pedido actual'], ['Esc', 'Cerrar la ventana abierta'], ['?', 'Mostrar u ocultar esta ayuda']];
  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" style={{ maxWidth:440 }} role="dialog" aria-modal="true" aria-labelledby="ay-t" onClick={e => e.stopPropagation()}>
        <div className="between"><h2 id="ay-t">Atajos de teclado</h2><button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icon n="x" s={20} /></button></div>
        <span className="muted">Atajos para caja en computadora. Funcionan en el punto de venta cuando no estás escribiendo en un campo.</span>
        <div>{filas.map(([k, l]) => <div className="kv" key={k}><span>{l}</span><kbd>{k}</kbd></div>)}</div>
        <button className="btn btn-primary" onClick={onGuia}><Icon n="ayuda" s={20} />Ver la guía rápida paso a paso</button>
        <div className="acerca"><span className="app-marca-claro">Gastro<b>Metrik</b> · versión {VERSION_APP}</span><Creditos /></div>
      </div>
    </div>
  );
}

/* Configuración → Diagnóstico */
function Diagnostico({ simOffline, setSimOffline, impresora, setImpresora, offline, aviso, registrar }) {
  const [res, setRes] = useState(() => PRUEBAS());
  const [confirmar, setConfirmar] = useState(false);
  const ok = res.filter(x => x.ok).length;
  return (
    <section className="card stack" style={{ gap:16, marginTop:18 }}>
      <div className="between" style={{ flexWrap:'wrap' }}>
        <div><h2>Diagnóstico</h2><span className="muted">Pruebas de los cálculos de dinero y estados del equipo.</span></div>
        <span className={'pill num ' + (ok === res.length ? 'pill-green' : 'pill-red')} style={{ fontSize:14, padding:'7px 14px' }}><Icon n={ok === res.length ? 'check' : 'alert'} s={15} />{ok} de {res.length} pruebas correctas</span>
      </div>
      <details className="tests">
        <summary>Ver las {res.length} pruebas</summary>
        <ul>{res.map(t => <li key={t.n} className={t.ok ? 'ok' : 'bad'}><Icon n={t.ok ? 'check' : 'x'} s={15} w={2.6} />{t.n}</li>)}</ul>
        <button className="btn btn-ghost btn-sm" onClick={() => { setRes(PRUEBAS()); aviso('Pruebas ejecutadas de nuevo'); }}>Volver a probar</button>
      </details>
      <div className="form-grid">
        <div className="field">Conexión a internet
          <div className="tabs" role="group" aria-label="Conexión"><button aria-pressed={!simOffline} onClick={() => setSimOffline(false)}>Real</button><button aria-pressed={simOffline} onClick={() => setSimOffline(true)}>Simular sin conexión</button></div>
          <span style={{ fontWeight:500 }}>{offline ? 'Sin conexión: las ventas se guardan y se sincronizan al volver.' : 'En línea.'}</span>
        </div>
        <div className="field">Impresora de tickets
          <div className="tabs" role="group" aria-label="Impresora">{[['ok','Lista'],['papel','Sin papel'],['desconectada','Desconectada']].map(([k, l]) => <button key={k} aria-pressed={impresora === k} onClick={() => setImpresora(k)}>{l}</button>)}</div>
          <span style={{ fontWeight:500 }}>Marca aquí si la impresora tiene un problema, para que todos lo vean.</span>
        </div>
      </div>
      <EstadoNube />
      <div className="acerca"><span className="app-marca-claro">Gastro<b>Metrik</b> · versión {VERSION_APP}</span><Creditos /></div>
    </section>
  );
}

/* ============ App ============ */
function useMedia(q) {
  const get = () => { try { return window.matchMedia(q).matches; } catch (e) { return false; } };
  const [m, setM] = useState(get);
  useEffect(() => { let mq; try { mq = window.matchMedia(q); } catch (e) { return; } const f = () => setM(mq.matches); f(); mq.addEventListener ? mq.addEventListener('change', f) : mq.addListener(f); return () => { mq.removeEventListener ? mq.removeEventListener('change', f) : mq.removeListener(f); }; }, [q]);
  return m;
}

function App() {
  const [vista, setVista] = useState(leerHash);
  const [cat, setCat] = useState('frecuentes');
  const [buscar, setBuscar] = useState('');
  const [cart, setCart] = usePersist('cart', [ln('p02', 2, { leche:2 }), ln('p28', 1), ln('p24', 1, { sabor:2 })]);
  const [tipo, setTipo] = useState('mesa');
  const [mesaSel, setMesaSel] = useState(2);
  const [cliente, setCliente] = useState('');
  const [nota, setNota] = useState('');
  const [ticketNo, setTicketNo] = usePersist('ticketNo', 146);
  const [mesas, setMesas] = usePersist('mesas', MESAS0);
  const [pedidos, setPedidos] = usePersist('pedidos', PEDIDOS0);
  const [productos, setProductos] = usePersist('productos', PRODUCTOS0);
  const [insumos, setInsumos] = usePersist('insumos', INSUMOS0);
  const [recetas, setRecetas] = usePersist('recetas', RECETAS0);
  const [movs, setMovs] = usePersist('movs', MOVS0);
  const [cobro, setCobro] = useState(null);
  const [sheet, setSheet] = useState(false);
  const [toast, setToast] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [usuarios, setUsuarios] = usePersist('usuarios', USUARIOS0);
  const [perms, setPerms] = usePersist('perms', PERM0);
  const [sesion, setSesion] = usePersist('sesion', 'u1');
  const [bloqueo, setBloqueo] = useState(false);
  const [menuU, setMenuU] = useState(false);
  const [log, setLog] = usePersist('log', LOG0);
  const [config0, setConfig] = usePersist('config', { ...CONFIG0, ...LOCAL0 });
  const config = { ...LOCAL0, ...config0 };
  const [cats, setCats] = usePersist('cats', CATS0);
  const [menuDia, setMenuDia] = usePersist('menuDia', MENU_DIA0);
  const [banners, setBanners] = usePersist('banners', BANNERS0);
  const [proveedores, setProveedores] = usePersist('proveedores', PROVEEDORES0);
  const [compras, setCompras] = usePersist('compras', COMPRAS0);
  const [gastos, setGastos] = usePersist('gastos', GASTOS0);
  const [cobrosQR, setCobrosQR] = usePersist('cobrosQR', COBROS_QR0);
  const [ventas, setVentas] = usePersist('ventas', VENTAS0);
  const [llamadas, setLlamadas] = usePersist('llamadas', LLAMADAS0);
  const [solicitudes, setSolicitudes] = usePersist('solicitudes', SOLICITUDES0);
  const [pantalla, setPantalla] = usePersist('pantalla', { cobro:null, gracias:null });
  const [paleta, setPaleta] = useState(false);
  const [abrirNo, setAbrirNo] = useState(null);
  const [qrMesas, setQrMesas] = useState(false);
  const [param, setParam] = useState(hashParam);
  const telefono = useMedia('(max-width: 699px)');
  const [mas, setMas] = useState(false);
  const [zonas, setZonas] = usePersist('zonas', ['Salón', 'Escenario']);
  const [custom, setCustom] = useState(null);
  const [auth, setAuth] = useState(null);
  const [sonido, setSonido] = useState(true);
  const [caja, setCaja] = usePersist('caja', CAJA0);
  const [eventos, setEventos] = usePersist('eventos', EVENTOS0);
  const [reservas, setReservas] = usePersist('reservas', RESERVAS0);
  const [simOffline, setSimOffline] = useState(false);
  const [redOk, setRedOk] = useState(() => { try { return navigator.onLine !== false; } catch (e) { return true; } });
  const [pendSync, setPendSync] = useState(0);
  const [impresora, setImpresora] = useState('ok');
  const [exito, setExito] = useState(null);
  const [ayuda, setAyuda] = useState(false);
  const [letra, setLetra] = usePref('letra', 'normal');
  const [tema, setTema] = usePref('tema', 'auto');
  const [vistaProd, setVistaProd] = usePref('vistaProd', 'lista');
  const [guiaVista, setGuiaVista] = usePref('guiaVista', false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [guia, setGuia] = useState(false);
  const [, setDl] = useState(false);
  useEffect(() => { try { const r = document.documentElement; if (letra === 'normal') r.removeAttribute('data-letra'); else r.setAttribute('data-letra', letra); } catch (e) {} }, [letra]);
  useEffect(() => { try { const r = document.documentElement; if (tema === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', tema); } catch (e) {} }, [tema]);
  useEffect(() => { let vivo = true; try { if (window.claude && window.claude.use) window.claude.use('downloads').then(x => { if (vivo && x) { DESCARGAS = x; setDl(true); } }).catch(() => {}); } catch (e) {} return () => { vivo = false; }; }, []);
  const offline = simOffline || !redOk;
  useFocoDialogos();
  useEffect(() => { if (!guiaVista && vista === 'venta' && !bloqueo) { const t = setTimeout(() => { setGuia(true); setGuiaVista(true); }, 700); return () => clearTimeout(t); } }, [vista]);
  useEffect(() => { const on = () => setRedOk(true), off = () => setRedOk(false); window.addEventListener('online', on); window.addEventListener('offline', off); return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); }; }, []);
  const prevOff = React.useRef(offline);
  useEffect(() => { if (prevOff.current && !offline) setVentas(vs => vs.some(v => v.estado === 'pendiente') ? vs.map(v => v.estado === 'pendiente' ? { ...v, estado:'valida' } : v) : vs); }, [offline]);
  useEffect(() => { if (prevOff.current && !offline && pendSync > 0) { aviso(`Conexión recuperada: ${pendSync} venta${pendSync > 1 ? 's' : ''} sincronizada${pendSync > 1 ? 's' : ''}`, 'check'); setPendSync(0); } prevOff.current = offline; }, [offline]);
  const [escenario, setEscenario] = useState('auto');
  const entradasTodas = eventos.filter(e => e.precio > 0).map(e => ({ id:'ev' + e.id, cat:'eventos', nombre:`Entrada · ${e.nombre}`, precio:e.precio, pres:'entrada', color:'#C98A3E', disponible:true, eliminado:false, stockCtl:true, stock: Math.max(0, e.aforo - ocupadosEvento(e, reservas)), min:3, desc:`${e.fecha === hoyISO() ? 'Hoy' : fechaTxt(e.fecha)} · ${e.hora}`, mods:[], evento:e.id, foto:null }));
  const entradas = entradasTodas.filter(x => { const e = eventos.find(y => y.id === x.evento); return e.estado === 'publicado' && estadoEvento(e, reservas) !== 'finalizado'; });
  const mdiaProd = { id:'mdia', cat:'mdia', nombre:`Menú del día · ${menuDia.titulo}`, precio:menuDia.precio, pres:'masa', color:'#C98A3E', disponible:true, eliminado:false, stockCtl:false, stock:0, min:0, desc:menuDia.desc, mods:[], foto:null };
  P = Object.fromEntries([...productos, ...entradasTodas, mdiaProd].map(p => [p.id, p]));
  CATEGORIAS = [...cats].sort((a, b) => a.orden - b.orden);
  CAT = Object.fromEntries(CATEGORIAS.map(c => [c.id, c.nombre]));
  const visCat = new Set(cats.filter(c => c.visible).map(c => c.id));
  const productosVenta = [...productos.filter(p => visCat.has(p.cat)), ...(menuDia.activo ? [mdiaProd] : []), ...entradas];
  const productosCliente = [...productos, ...(menuDia.activo ? [mdiaProd] : [])];
  const esApp = APPS.includes(vista);
  useEffect(() => { const t = setTimeout(() => setPantalla(p => JSON.stringify((p && p.carrito) || []) === JSON.stringify(cart) ? p : { ...p, carrito: cart }), 250); return () => clearTimeout(t); }, [cart]);
  const evHoy = eventos.filter(e => e.fecha === hoyISO() && e.estado === 'publicado').sort((a, b) => a.hora.localeCompare(b.hora))[0];
  const ahora = hora();
  const escenarioOn = !!evHoy && (escenario === 'on' || (escenario === 'auto' && ahora >= restarMin(evHoy.hora, 30) && ahora < evHoy.fin));
  const ocHoy = evHoy ? ocupadosEvento(evHoy, reservas) : 0;
  const mesasVista = mesas.map(m => { const r = m.estado === 'libre' && reservaDeMesa(m.n, reservas); return r ? { ...m, estado:'reservada', res:r } : m; });
  NEGOCIO = config.nombre;
  FISCAL = { simplificado: !!config.simplificado, pmax: (RTS_ACTIVIDADES[config.rtsActividad] || RTS_ACTIVIDADES.vivandero).pmax, cat: rtsCategoria(Number(config.rtsCapital)) };
  calcularReportes(ventas, pedidos);
  REPARTIDOR = ((usuarios.find(u => u.rol === 'repartidor' && u.activo) || {}).nombre || 'Repartidor').split(' ')[0];
  QR_BANCO = config.qrBanco || null;
  const yo = usuarios.find(u => u.id === sesion) || usuarios.find(u => u.rol === 'dueno') || usuarios[0];
  const puede = k => (perms[yo.rol] || []).includes(k);
  const visibles = VISTAS.filter(x => { const k = x.perm || (PERMISOS.find(q => q.vista === x.id) || {}).k; return !k || puede(k); });
  const registrar = que => setLog(l => [...l, { id: Date.now() + Math.random(), h: 'Hoy ' + hora(), quien: yo.nombre, que }]);
  useEffect(() => { if (APPS.includes(vista)) return; if (!visibles.length) { ir(puede('delivery') ? 'reparto' : 'portada'); return; } if (!visibles.some(x => x.id === vista)) ir(visibles[0].id); }, [vista, sesion, perms]);
  useEffect(() => { if (mesas.length && !mesas.some(m => m.n === mesaSel)) setMesaSel(mesas[0].n); }, [mesas]);
  useEffect(() => { try { if (escenarioOn) document.documentElement.setAttribute('data-escenario', 'on'); else document.documentElement.removeAttribute('data-escenario'); } catch (e) {} }, [escenarioOn]);
  useEffect(() => { try { document.title = `GastroMetrik · ${config.nombre}`; } catch (e) {} }, [config.nombre]);
  const entrar = u => { setSesion(u.id); setBloqueo(false); setUsuarios(us => us.map(x => x.id === u.id ? { ...x, ultimo: 'Hoy ' + hora() } : x)); setLog(l => [...l, { id: Date.now(), h: 'Hoy ' + hora(), quien: u.nombre, que: 'Inició sesión' }]); aviso(`Hola, ${u.nombre.split(' ')[0]}. Sesión iniciada.`, 'key'); };

  useEffect(() => { const f = () => { setVista(leerHash()); setParam(hashParam()); }; window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  /* Cada cambio de estado de un pedido queda en su línea de tiempo */
  useEffect(() => { if (pedidos.some(p => !p.hist || p.hist[p.hist.length - 1].e !== p.estado)) setPedidos(ps => ps.map(p => !p.hist ? { ...p, hist:[{ e:'recibido', t:p.creado }, ...(p.estado !== 'recibido' ? [{ e:p.estado, t:Date.now() }] : [])] } : p.hist[p.hist.length - 1].e !== p.estado ? { ...p, hist:[...p.hist, { e:p.estado, t:Date.now(), q: p.estado === 'anulado' ? p.motivo : undefined }] } : p)); }, [pedidos]);
  useEffect(() => { const k = e => { if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); if (!bloqueo) setPaleta(p => !p); } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [bloqueo]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 20000); return () => clearInterval(t); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), toast.deshacer ? 6500 : 3400); return () => clearTimeout(t); }, [toast]);

  const ir = (v, prm) => { setVista(v); setSheet(false); setMas(false); setParam(prm ? String(prm) : ''); try { location.hash = v + (prm ? '/' + prm : ''); } catch (e) {} try { window.scrollTo(0, 0); } catch (e) {} };
  const aviso = (msg, icon = 'check', deshacer) => setToast({ msg, icon, deshacer, k: Date.now() });

  /* Atajos de teclado */
  useEffect(() => {
    const k = e => {
      const t = e.target; const escribiendo = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if (escribiendo || e.ctrlKey || e.metaKey || e.altKey || APPS.includes(vista)) return;
      const dialogo = document.querySelector('[role=dialog]');
      if (e.key === '?') { e.preventDefault(); setAyuda(a => !a); return; }
      if (dialogo || bloqueo) return;
      if (e.key === '/') { e.preventDefault(); if (vista !== 'venta') ir('venta'); setTimeout(() => { const b = document.getElementById('buscar'); b && b.focus(); }, 60); return; }
      if (vista !== 'venta') return;
      if (/^[1-9]$/.test(e.key)) { const n = Number(e.key); if (mesas.some(m => m.n === n)) { setTipo('mesa'); setMesaSel(n); aviso(`Pedido para la Mesa ${n}`, 'mesas'); } return; }
      if (e.key === 'Enter' && cart.length && puede('cobrar') && caja.abierta && !(t && t.tagName === 'BUTTON' && !t.closest('.plist-pos, .cats'))) { e.preventDefault(); abrirCobro(); }
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });

  /* Autorización: si el usuario no tiene el permiso, pide el PIN de alguien que sí lo tenga */
  const pedirAuth = (perm, desc, fn) => {
    if (puede(perm)) { fn(yo.nombre); return; }
    setAuth({ perm, desc, fn });
  };

  /* Carrito por combinación de producto + opciones */
  const enCarro = id => cart.filter(x => x.id === id).reduce((s, x) => s + x.q, 0);
  const hayStock = (id, extra = 1) => { const p = P[id]; return !p.stockCtl || p.stock - enCarro(id) >= extra; };
  const sinStock = id => aviso(`No queda stock de ${P[id].nombre}. Registra un ingreso en Inventario.`, 'alert');
  const addLine = (id, mods, q = 1, nota, reemplaza) => {
    if (!hayStock(id, q - (reemplaza ? (cart.find(x => x.key === reemplaza) || {}).q || 0 : 0))) { sinStock(id); return; }
    const key = lineKey(id, mods);
    setCart(c => {
      let base = reemplaza ? c.filter(x => x.key !== reemplaza) : c;
      const f = base.find(x => x.key === key);
      if (f) return base.map(x => x.key === key ? { ...x, q: x.q + q, nota: nota !== undefined ? (nota || x.nota) : x.nota } : x);
      const nuevo = { key, id, q, mods, nota: nota || undefined, listo:false };
      if (reemplaza) { const i = c.findIndex(x => x.key === reemplaza); const r = [...base]; r.splice(Math.max(0, i), 0, nuevo); return r; }
      return [...base, nuevo];
    });
  };
  const addRapido = id => {
    const p = P[id];
    if (faltaObligatorio(p, modsDef(p))) { setCustom({ id }); return; }
    if (!hayStock(id)) { sinStock(id); return; }
    addLine(id, modsDef(p));
  };
  const incKey = key => { const l = cart.find(x => x.key === key); if (!l) return; if (!hayStock(l.id)) { sinStock(l.id); return; } setCart(c => c.map(x => x.key === key ? { ...x, q: x.q + 1 } : x)); };
  const decKey = key => {
    const l = cart.find(x => x.key === key); if (!l) return;
    if (l.q > 1) { setCart(c => c.map(x => x.key === key ? { ...x, q: x.q - 1 } : x)); return; }
    const prev = cart; setCart(c => c.filter(x => x.key !== key));
    aviso(`${P[l.id].nombre} quitado del pedido`, 'trash', () => setCart(prev));
  };
  const vaciarPedido = () => { const prev = cart; setCart([]); aviso(`Pedido vaciado (${unidades(prev)} productos)`, 'trash', () => setCart(prev)); };
  const setNotaKey = (key, v) => setCart(c => c.map(x => x.key === key ? { ...x, nota: v } : x));

  const origenTxt = () => tipo === 'mesa' ? `Mesa ${mesaSel}` : tipo === 'mostrador' ? `Mostrador${cliente ? ' · ' + cliente : ''}` : tipo === 'llevar' ? `Para llevar${cliente ? ' · ' + cliente : ''}` : 'Delivery';
  const crearPedido = (aCuenta = false) => {
    const no = ticketNo + 1;
    setTicketNo(no);
    const items = cart.map(x => ({ ...x, listo:false }));
    const barra = items.filter(x => !String(x.id).startsWith('ev'));
    const ent = items.filter(x => String(x.id).startsWith('ev'));
    if (ent.length) setEventos(es => es.map(e => { const q = ent.filter(x => x.id === 'ev' + e.id).reduce((s, x) => s + x.q, 0); return q ? { ...e, vendidas: e.vendidas + q } : e; }));
    if (barra.length) setPedidos(ps => [...ps, { uid: nuevoId(), no, origen: origenTxt(), tipo: tipo === 'llevar' ? 'mostrador' : tipo, dir: tipo === 'delivery' ? (cliente || 'Calle Sucre #245') : undefined, rep: REPARTIDOR, estado:'recibido', creado: Date.now(), items: barra }]);
    descontarStock(items);
    if (tipo === 'mesa' && aCuenta) setMesas(ms => ms.map(m => m.n === mesaSel ? { ...m, estado: m.estado === 'libre' ? 'ocupada' : m.estado, personas: m.personas || 2, min: m.min || 0, items: mezclar(m.items, items) } : m));
    setCart([]); setNota(''); setCliente(''); setSheet(false);
    return no;
  };
  const descontarStock = items => setProductos(ps => ps.map(p => { const q = items.filter(x => x.id === p.id).reduce((s, x) => s + x.q, 0); return q && p.stockCtl ? { ...p, stock: Math.max(0, p.stock - q) } : p; }));
  /* Pedido que llega a una mesa desde la app del mesero o desde el QR */
  const enviarMesa = (n, items0, quien, extra = {}) => {
    const no = ticketNo + 1; setTicketNo(no);
    const items = items0.map(x => ({ ...x, listo:false }));
    setPedidos(ps => [...ps, { uid: nuevoId(), no, origen:`Mesa ${n}`, tipo:'mesa', estado:'recibido', creado: Date.now(), por: quien, items, ...extra }]);
    descontarStock(items);
    setMesas(ms => ms.map(m => m.n === n ? { ...m, estado: m.estado === 'libre' ? 'ocupada' : m.estado, personas: m.personas || 2, min: m.min || 0, items: mezclar(m.items, items) } : m));
    aviso(`Pedido N° ${no} enviado a barra · Mesa ${n}`, 'flame');
    return no;
  };
  const crearSolicitud = (n, items, nombre) => { setSolicitudes(ss => [...ss, { id:'s' + Date.now(), mesa:n, t: Date.now(), nombre, items: items.map(x => ({ ...x })) }]); };
  const confirmarSolicitud = s => { setSolicitudes(ss => ss.filter(x => x.id !== s.id)); const no = enviarMesa(s.mesa, s.items, yo.nombre, { qr:true }); registrar(`Confirmó el pedido por QR de la Mesa ${s.mesa} · N° ${no}`); };
  const rechazarSolicitud = s => { setSolicitudes(ss => ss.filter(x => x.id !== s.id)); registrar(`Rechazó un pedido por QR de la Mesa ${s.mesa}`); aviso(`Pedido por QR de la Mesa ${s.mesa} rechazado`, 'x'); };
  const llamar = (n, tipoL, pago) => {
    setLlamadas(ls => ls.some(l => l.mesa === n && l.tipo === tipoL && l.estado === 'pendiente') ? ls : [...ls, { id:'l' + Date.now(), mesa:n, tipo:tipoL, pago, t: Date.now(), estado:'pendiente' }]);
    if (tipoL === 'cuenta') setMesas(ms => ms.map(m => m.n === n && m.items.length ? { ...m, estado:'cobrar' } : m));
  };
  const atenderLlamada = l => { setLlamadas(ls => ls.map(x => x.id === l.id ? { ...x, estado:'atendida', por: yo.nombre } : x)); aviso(`Vas a la Mesa ${l.mesa}${l.tipo === 'cuenta' ? ' con la cuenta' : ''}`, 'bell'); };
  const cancelarLlamada = l => setLlamadas(ls => ls.filter(x => x.id !== l.id));
  const pedirCuentaMesa = n => { setMesas(ms => ms.map(m => m.n === n ? { ...m, estado:'cobrar' } : m)); aviso(`Mesa ${n} lista para cobrar en caja`, 'cash'); };
  const servir = p => { setPedidos(ps => ps.map(x => x.no === p.no ? { ...x, estado:'entregado' } : x)); aviso(`Pedido N° ${p.no} servido en ${p.origen}`); };
  const avanzar = (p, estado) => { setPedidos(ps => ps.map(x => x.no === p.no ? { ...x, estado, items: estado === 'listo' ? x.items.map(i => ({ ...i, listo:true })) : x.items } : x)); aviso(`Pedido N° ${p.no} · ${ESTADO_PED[estado].l.toLowerCase()}`); };
  const avanzarEntrega = p => {
    if (p.estado === 'listo') { setPedidos(ps => ps.map(x => x.no === p.no ? { ...x, estado:'camino', enRuta:false } : x)); aviso(`Recogiste el pedido N° ${p.no}`, 'bag'); return; }
    if (p.estado === 'camino' && !p.enRuta) { setPedidos(ps => ps.map(x => x.no === p.no ? { ...x, enRuta:true } : x)); aviso(`En camino a ${p.dir}`, 'moto'); return; }
    const cobra = p.pago === 'efectivo' && !p.pagado;
    if (cobra) registrarCobro({ met:'efectivo', netoC: totalPedC(p), propinaC:0, descuentoC:0, titulo:`Delivery N° ${p.no}` });
    setPedidos(ps => ps.map(x => x.no === p.no ? { ...x, estado:'entregado', pagado: x.pagado || cobra } : x));
    aviso(`Delivery N° ${p.no} entregado${cobra ? ` · ${bsC(totalPedC(p))} en efectivo a la caja` : ''}`);
  };
  const crearPedidoWeb = d => {
    const no = ticketNo + 1; setTicketNo(no);
    const items = d.items.map(x => ({ ...x, listo:false }));
    const del = d.entrega === 'delivery'; const z = config.zonas[d.zona] || config.zonas[0];
    const envioC = del ? aC(z.c) : 0;
    setPedidos(ps => [...ps, { uid: nuevoId(), no, web:true, origen: del ? `Tienda online · ${d.nombre}` : `Para recoger · ${d.nombre}`, tipo: del ? 'delivery' : 'mostrador', cliente:d.nombre, tel:d.tel, dir: del ? d.dir : undefined, ref: d.ref || undefined, zona: del ? z.n : undefined, envioC, pago:d.pago, conCuanto: d.conCuanto || undefined, rep: del ? REPARTIDOR : undefined, estado:'recibido', creado: Date.now(), items: d.nota ? items.map((x, i) => i === 0 ? { ...x, nota: [x.nota, d.nota].filter(Boolean).join(' · ') } : x) : items }]);
    descontarStock(items);
    if (d.pago === 'qr') setCobrosQR(c => [...c, { id:'q' + Date.now(), h: hora(), ref:'QR-' + (49000 + no), origen:`Pedido web N° ${no}`, montoC: totalC(items) + envioC, estado:'pendiente', pedido:no }]);
    setLog(l => [...l, { id: Date.now() + Math.random(), h:'Hoy ' + hora(), quien:'Tienda online', que:`Recibió el pedido N° ${no} de ${d.nombre} por ${bsC(totalC(items) + envioC)}` }]);
    return no;
  };
  const confirmarQR = c => {
    setCobrosQR(cs => cs.map(x => x.id === c.id ? { ...x, estado:'confirmado', h: hora() } : x));
    registrarCobro({ met:'QR', netoC: c.montoC, propinaC:0, descuentoC:0, titulo: c.origen, sinQR:true });
    if (c.pedido) setPedidos(ps => ps.map(x => x.no === c.pedido ? { ...x, pagado:true } : x));
    registrar(`Confirmó el pago QR ${c.ref} de ${bsC(c.montoC)}`); aviso(`Pago QR de ${bsC(c.montoC)} confirmado y sumado a la caja`, 'qr');
  };
  const cobrarPedido = p => setCobro({
    titulo:`Pedido N° ${p.no}`, items:p.items, pagadoC:0, dividir:false,
    onConfirm: r => { registrarCobro({ ...r, titulo:`Pedido N° ${p.no}` }); setPedidos(ps => ps.map(x => x.no === p.no ? { ...x, estado:'entregado', pagado:true } : x)); exitoCobro(r, `Pedido N° ${p.no}`); },
  });
  const enviarCocina = () => { const o = origenTxt(); const no = crearPedido(true); aviso(`Pedido N° ${no} enviado a barra · ${o}`, 'flame'); };

  /* Cobros: registra la venta en la caja del turno */
  const metKey = { efectivo:'efectivo', QR:'qr', tarjeta:'tarjeta' };
  const registrarCobro = r => {
    const k = metKey[r.met];
    setCaja(c => ({ ...c, tickets: c.tickets + 1, ventas: { ...c.ventas, [k]: c.ventas[k] + r.netoC }, propinas: { ...c.propinas, [k]: c.propinas[k] + r.propinaC }, descuentos: c.descuentos + r.descuentoC }));
    if (r.descuentoC > 0) registrar(`Aplicó ${r.cortesia ? 'cortesía' : 'descuento'} de ${bsC(r.descuentoC)} en ${r.titulo} · ${r.motivo}${r.autorizo && r.autorizo !== yo.nombre ? ' · autorizado por ' + r.autorizo : ''}`);
    if (offline) setPendSync(n => n + 1);
    setVentas(vs => [...vs, { id:'v' + nuevoId(), t: Date.now(), nf: (vs.length ? Math.max(...vs.map(v => v.nf)) : 0) + 1, h: hora(), titulo: r.titulo, totalC: r.netoC, met: r.met, nit: r.nit || '0', rs: r.rs || 'Sin nombre', estado: offline ? 'pendiente' : 'valida' }]);
    if (k === 'qr' && !r.sinQR) setCobrosQR(c => [...c, { id:'q' + nuevoId(), t: Date.now(), h: hora(), ref:'QR-' + (49000 + c.length * 37), origen: r.titulo, montoC: r.netoC + r.propinaC, estado:'confirmado' }]);
  };
  const exitoCobro = (r, titulo, extra) => { setExito({ ...r, titulo, extra, k: Date.now() }); setPantalla(p => ({ ...p, cobro:null, gracias: Date.now() })); };
  const abrirCobro = () => setCobro({
    titulo: origenTxt(), items: cart, pagadoC: 0, dividir: false,
    onConfirm: r => { const no = crearPedido(); registrarCobro({ ...r, titulo: `Ticket N° ${no}` }); exitoCobro(r, `Ticket N° ${no}`); },
  });
  const cobrarMesa = (m, modo = 'todo') => setCobro({
    titulo: `Mesa ${m.n}`, items: m.items, pagadoC: m.pagadoC || 0, split: m.split || null, dividir: true, modo,
    onConfirm: r => {
      registrarCobro({ ...r, titulo: `Mesa ${m.n}` });
      let libre = false, falta = 0;
      const base = { estado:'libre', items:[], personas:0, min:0, pagadoC:0, split:null };
      setMesas(ms => ms.map(x => {
        if (x.n !== m.n) return x;
        if (r.modo === 'producto') {
          const items = x.items.flatMap(it => { const q = it.q - (r.sel[it.key] || 0); return q > 0 ? [{ ...it, q }] : []; });
          libre = !items.length; falta = totalC(items);
          return libre ? { ...x, ...base } : { ...x, items };
        }
        const pagadoC = (x.pagadoC || 0) + r.baseC;
        falta = totalC(x.items) - pagadoC;
        libre = r.modo === 'todo' || falta <= 0;
        return libre ? { ...x, ...base } : { ...x, pagadoC, split: r.modo === 'partes' ? { n: r.partes, pagadas: ((x.split && x.split.pagadas) || 0) + 1 } : x.split };
      }));
      setTimeout(() => exitoCobro(r, `Mesa ${m.n}`, libre ? 'Mesa libre' : `Queda saldo de ${bsC(falta)}`), 0);
    },
  });
  const tomarPedidoMesa = n => { setTipo('mesa'); setMesaSel(n); setCart([]); ir('venta'); };
  const irVenderEntrada = () => { setCat('eventos'); setBuscar(''); ir('venta'); };
  const llegoReserva = r => {
    setReservas(rs => rs.map(x => x.id === r.id ? { ...x, estado:'llego' } : x));
    const ev = eventos.find(e => e.id === r.evento && e.precio > 0);
    const entradaLn = ev ? [{ key: lineKey('ev' + ev.id, {}), id: 'ev' + ev.id, q: r.personas, mods:{}, listo:true }] : [];
    if (r.mesa) setMesas(ms => ms.map(m => m.n === r.mesa ? { ...m, estado: m.estado === 'libre' ? 'ocupada' : m.estado, personas: (m.estado === 'libre' ? 0 : m.personas || 0) + r.personas, min: m.min || 0, items: mezclar(m.items, entradaLn) } : m));
    registrar(`Marcó la reserva de ${r.nombre} como "Llegó"${ev && r.mesa ? ` · ${r.personas} entradas a la cuenta de la Mesa ${r.mesa}` : ''}`);
    aviso(`${r.nombre} llegó${r.mesa ? ` · Mesa ${r.mesa} ocupada` : ''}${ev && r.mesa ? ` · ${r.personas} entradas sumadas a la cuenta` : ev ? ` · cobra ${r.personas} entradas en caja` : ''}`);
  };

  /* Aviso sonoro cuando entra un pedido nuevo a barra */
  const nLl = React.useRef(llamadas.length);
  useEffect(() => { if (llamadas.length > nLl.current && sonido) { try { const ctx = new (window.AudioContext || window.webkitAudioContext)(); [0, .2, .4].forEach(t => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 1318; o.connect(g); g.connect(ctx.destination); g.gain.setValueAtTime(.0001, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(.14, ctx.currentTime + t + .02); g.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + t + .16); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + .2); }); } catch (e) {} } nLl.current = llamadas.length; }, [llamadas.length]);
  const nPed = React.useRef(pedidos.length);
  useEffect(() => {
    if (pedidos.length > nPed.current && sonido) {
      try { const ctx = new (window.AudioContext || window.webkitAudioContext)(); [0, .18].forEach((t, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = i ? 1046 : 784; o.connect(g); g.connect(ctx.destination); g.gain.setValueAtTime(.0001, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(.18, ctx.currentTime + t + .02); g.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + t + .25); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + .3); }); } catch (e) {}
    }
    nPed.current = pedidos.length;
  }, [pedidos.length]);

  const activos = pedidos.filter(p => p.estado !== 'entregado' && p.estado !== 'anulado').length;
  const v = VISTAS.find(x => x.id === vista) || visibles[0] || VISTAS[1];
  const incid = incidenciasDe({ insumos, productos, pedidos, llamadas, solicitudes, cobrosQR, compras, caja, config, impresora, now });
  const mesaParam = Number(param) && mesas.some(m => m.n === Number(param)) ? Number(param) : (mesas[0] ? mesas[0].n : 1);
  const onPortada = () => ir('portada');
  const contadores = { cocina: activos, mesero: llamadas.filter(l => l.estado === 'pendiente').length + solicitudes.length || 0, reparto: pedidos.filter(p => p.tipo === 'delivery' && !['entregado', 'anulado'].includes(p.estado)).length, inicio: incid.length };
  const appView = !esApp ? null
    : vista === 'portada' ? <Portada config={config} yo={yo} contadores={contadores} irA={id => ir(id)} />
    : vista === 'mesero' ? <MeseroApp {...{ mesas: mesasVista, llamadas, atenderLlamada, solicitudes, confirmarSolicitud, rechazarSolicitud, enviarMesa, pedirCuentaMesa, productos: [...productos, ...(menuDia.activo ? [mdiaProd] : [])], cats, menuDia, pedidos, servir, yo, now, config, onPortada, offline }} />
    : vista === 'reparto' ? <RepartoApp {...{ pedidos, avanzarEntrega, yo, config, now, onPortada }} />
    : vista === 'tienda' ? <Tienda {...{ productos: productosCliente, cats, config, banners, menuDia, crearPedidoWeb, pedidos, onPortada }} />
    : vista === 'mesa' ? <PedidoMesa {...{ n: mesaParam, setN: n => ir('mesa', n), mesas, productos: productosCliente, cats, menuDia, solicitudes, crearSolicitud, llamadas, llamar, pedidos, config, onPortada }} />
    : vista === 'llamar' ? <LlamarMesero {...{ n: mesaParam, setN: n => ir('llamar', n), mesas, llamadas, llamar, cancelarLlamada, config, now, onPortada }} irCarta={() => ir('mesa', mesaParam)} />
    : <PantallaCliente {...{ cart: (pantalla && pantalla.carrito) || [], pantalla, config, banners, menuDia, eventos, onPortada }} />;
  const fecha = new Date().toLocaleDateString('es-BO', { weekday:'long', day:'numeric', month:'long' });
  const rolU = ROLES[yo.rol];

  return (<>
    {esApp ? <div className="app-full" key={vista}>{appView}</div> : (
    <div className="shell">
      <nav className="side" aria-label="Pantallas">
        <div className="brand"><Logo src={config.logo} nombre={config.nombre} /><div className="brand-text"><div className="brand-name">{config.nombre}</div><div className="brand-sub">{config.eslogan}</div></div></div>
        <button className="nav-btn nav-portada" onClick={() => ir('portada')}><Icon n="portada" s={22} /><span className="full">Portada · módulos</span><span className="short">Portada</span></button>
        {(telefono && visibles.length > 5 ? visibles.slice(0, 4) : visibles).map((x, i, arr) => (<React.Fragment key={x.id}>
          {(i === 0 || arr[i - 1].grupo !== x.grupo) && <span className="nav-grupo" aria-hidden="true">{x.grupo}</span>}
          <button className="nav-btn" aria-current={vista === x.id ? 'page' : undefined} onClick={() => ir(x.id)}>
            <Icon n={x.icon} s={24} />
            <span className="full">{x.nav}</span><span className="short">{x.short}</span>
            {x.id === 'cocina' && <span className="badge num">{activos}</span>}
            {x.id === 'inicio' && incid.length > 0 && <span className="badge badge-alerta num">{incid.length}</span>}
            {x.id === 'finanzas' && cobrosQR.some(c => c.estado === 'pendiente') && <span className="badge badge-alerta num">{cobrosQR.filter(c => c.estado === 'pendiente').length}</span>}
          </button>
        </React.Fragment>))}
        {telefono && visibles.length > 5 && (
          <button className="nav-btn" aria-current={visibles.slice(4).some(x => x.id === vista) ? 'page' : undefined} onClick={() => setMas(true)} aria-haspopup="dialog">
            <Icon n="mas" s={24} /><span className="short">Más</span>
          </button>
        )}
        <div className="side-foot"><i className="dot" style={caja.abierta ? undefined : { background:'var(--red)' }} /><span>{caja.abierta ? `Caja abierta desde ${caja.hora}` : 'Caja cerrada'}</span></div>
        <div className="app-firma"><span className="app-marca">Gastro<b>Metrik</b></span><Creditos variante="en-menu" /></div>
      </nav>

      <main className="main">
        <header className="topbar">
          <div>
            <div className="eyebrow topbar-fecha num"><span>{fecha.charAt(0).toUpperCase() + fecha.slice(1)}</span><span className="reloj">{new Date(now).toLocaleTimeString('es-BO', { hour:'2-digit', minute:'2-digit', hour12:false })}</span><span className="hide-sm">{turnoDe(new Date(now))}</span></div>
            <h1>{v.full}</h1>
          </div>
          <div className="topbar-right">
            {evHoy && <button className="pill pill-gold hide-sm num" style={{ border:0 }} onClick={() => ir('eventos')}><Icon n="note" s={15} />Hoy {evHoy.hora} · {evHoy.genero} · {ocHoy}/{evHoy.aforo}</button>}
            {offline && <span className="pill pill-red"><Icon n="wifi" s={14} />Sin conexión{pendSync ? ` · ${pendSync} por sincronizar` : ''}</span>}
            {impresora !== 'ok' && <button className="pill pill-red" style={{ border:0 }} onClick={() => ir('config')}><Icon n="print" s={14} />{impresora === 'papel' ? 'Impresora sin papel' : 'Impresora desconectada'}</button>}
            <button className="buscar-global hide-sm" onClick={() => setPaleta(true)} aria-label="Buscar en todo el sistema (Ctrl + K)"><Icon n="search" s={18} /><span>Buscar</span><kbd>Ctrl K</kbd></button>
            <button className="icon-btn kbd-btn solo-sm" onClick={() => setPaleta(true)} aria-label="Buscar en todo el sistema"><Icon n="search" s={20} /></button>
            <Campana incidencias={incid} ir={ir} atenderLlamada={atenderLlamada} llamadas={llamadas} />
            <button className="icon-btn kbd-btn letra-btn" onClick={() => setPrefsOpen(true)} aria-label="Tamaño de letra y colores" title="Tamaño de letra y colores"><Icon n="letra" s={20} /></button>
            <button className="icon-btn hide-sm kbd-btn" onClick={() => setAyuda(true)} aria-label="Ayuda y atajos de teclado" title="Ayuda (?)"><Icon n="ayuda" s={20} /></button>
            {caja.abierta ? <span className="pill pill-green hide-sm"><i className="dot" style={{ background:'var(--green)' }} />Caja abierta</span> : <button className="pill pill-red hide-sm" style={{ border:0 }} onClick={() => ir('caja')}><Icon n="lock" s={14} />Caja cerrada</button>}
            <div className="user-menu">
              <button className="chip-user" onClick={() => setMenuU(m => !m)} aria-expanded={menuU} aria-haspopup="menu">
                <span className="avatar" style={{ width:34, height:34, borderRadius:11, fontSize:13, background:rolU.bg, color:rolU.fg }}>{iniciales(yo.nombre)}</span>
                <span>{yo.nombre.split(' ')[0]} <span className="muted hide-sm">· {rolU.label}</span></span>
              </button>
              {menuU && (<>
                <div className="menu-scrim" onClick={() => setMenuU(false)} />
                <div className="menu" role="menu">
                  <div className="menu-head"><b>{yo.nombre}</b><span className="muted">{rolU.label} · turno {yo.turno.toLowerCase()}</span></div>
                  <button role="menuitem" onClick={() => { setMenuU(false); setPrefsOpen(true); }}><Icon n="letra" s={19} />Preferencias de pantalla</button>
                  <button role="menuitem" onClick={() => { setMenuU(false); ir('venta'); setTimeout(() => setGuia(true), 150); }}><Icon n="ayuda" s={19} />Guía rápida</button>
                  <button role="menuitem" onClick={() => { setMenuU(false); setBloqueo(true); }}><Icon n="usuarios" s={19} />Cambiar de usuario</button>
                  <button role="menuitem" onClick={() => { setMenuU(false); registrar('Cerró sesión'); setBloqueo(true); }}><Icon n="lock" s={19} />Bloquear (pedir PIN)</button>
                  <button role="menuitem" onClick={() => { setMenuU(false); salir(); }}><Icon n="logout" s={19} />Salir de esta cuenta</button>
                </div>
              </>)}
            </div>
          </div>
        </header>

        {offline && <div className="net-bar" role="status"><Icon n="wifi" s={20} /><span><b>Sin conexión.</b> Puedes seguir vendiendo: las ventas se guardan en este equipo y se sincronizan al volver internet{FISCAL.simplificado ? '' : '. Las facturas quedan pendientes de envío'}.</span></div>}
        {escenarioOn && evHoy && (
          <div className="stage-bar" role="status">
            <span className="eq" aria-hidden="true"><i /><i /><i /><i /></span>
            <span className="stage-txt"><span className="stage-k">En escena</span><b className="hand">{evHoy.artista}</b><span className="stage-sub num">{evHoy.nombre} · {evHoy.hora} a {evHoy.fin}</span></span>
            <span className="stage-aforo num"><b>{ocHoy}</b>/{evHoy.aforo} lugares</span>
            {evHoy.precio > 0 && <button className="btn btn-sm stage-btn" onClick={irVenderEntrada} disabled={ocHoy >= evHoy.aforo}><Icon n="ticket" s={18} />{ocHoy >= evHoy.aforo ? 'Agotado' : `Entrada ${bs(evHoy.precio)}`}</button>}
          </div>
        )}
        <div className={'content' + (vista === 'venta' ? ' content--fixed' : '')}><div className="vista" key={vista}>
          {vista === 'inicio' && <Inicio {...{ caja, pedidos, mesas, config, setConfig, eventos, reservas, ir, now, aviso, registrar }} incidencias={incid} />}
          {vista === 'pedidos' && <PedidosAdm {...{ pedidos, setPedidos, now, aviso, pedirAuth, registrar, avanzar, cobrarPedido, abrirNo, setAbrirNo }} />}
          {vista === 'carta' && <Carta {...{ cats, setCats, productos, setProductos, menuDia, setMenuDia, banners, setBanners, config, setConfig, aviso, registrar, ir }} />}
          {vista === 'compras' && <Compras {...{ compras, setCompras, proveedores, setProveedores, insumos, setInsumos, setMovs, setCaja, yo, aviso, registrar }} />}
          {vista === 'finanzas' && <Finanzas {...{ gastos, setGastos, cobrosQR, confirmarQR, ventas, setVentas, caja, setCaja, compras, config, yo, aviso, registrar, pedirAuth }} />}
          {vista === 'venta' && <Venta {...{ productos: productosVenta, mesas: mesasVista, cat, setCat, buscar, setBuscar, cart, addRapido, setCustom, incKey, decKey, setNotaKey, setCart, tipo, setTipo, mesaSel, setMesaSel, cliente, setCliente, ticketNo, sheet, setSheet, abrirCobro, enviarCocina, ir, vaciarPedido, vistaProd, setVistaProd }} cajaAbierta={caja.abierta} puedeCobrar={puede('cobrar')} />}
          {vista === 'mesas' && <Mesas zonas={zonas} onEditar={puede('config') ? () => { ir('config'); setTimeout(() => { try { document.getElementById('mesas-config').scrollIntoView({ behavior:'smooth' }); } catch (e) {} }, 80); } : null} mesas={mesas} setMesas={setMesas} cobrarMesa={cobrarMesa} tomarPedido={tomarPedidoMesa} aviso={aviso} puedeCobrar={puede('cobrar')} cajaAbierta={caja.abierta} pedirAuth={pedirAuth} registrar={registrar} reservas={reservas} onLlego={llegoReserva} llamadas={llamadas} onQR={() => setQrMesas(true)} />}
          {vista === 'eventos' && <Eventos {...{ eventos, setEventos, reservas, setReservas, mesas, setMesas, zonas, escenario, setEscenario, escenarioOn, aviso, registrar, irVenderEntrada }} onLlego={llegoReserva} />}
          {vista === 'cocina' && <Cocina pedidos={pedidos} setPedidos={setPedidos} now={now} aviso={aviso} sonido={sonido} setSonido={setSonido} />}
          {vista === 'caja' && <Caja {...{ caja, setCaja, aviso, registrar, yo }} />}
          {vista === 'productos' && <Productos {...{ productos, setProductos, recetas, aviso, ir }} />}
          {vista === 'inventario' && <Inventario {...{ productos, setProductos, insumos, setInsumos, recetas, setRecetas, movs, setMovs, aviso }} />}
          {vista === 'reportes' && <Reportes offline={offline} aviso={aviso} />}
          {vista === 'usuarios' && <Usuarios {...{ usuarios, setUsuarios, perms, setPerms, yo, log, registrar, aviso }} />}
          {vista === 'config' && <Configuracion {...{ config, setConfig, registrar, aviso }} />}
          {vista === 'config' && <MesasConfig {...{ mesas, setMesas, zonas, setZonas, registrar, aviso }} />}
          {vista === 'config' && <Diagnostico {...{ simOffline, setSimOffline, impresora, setImpresora, offline, aviso, registrar }} />}
        </div></div>
      </main>
    </div>)}

      {mas && (
        <div className="scrim" onClick={() => setMas(false)}>
          <div className="modal mas-sheet" role="dialog" aria-modal="true" aria-label="Más pantallas" onClick={e => e.stopPropagation()}>
            <div className="between"><h2>Más pantallas</h2><button className="icon-btn" onClick={() => setMas(false)} aria-label="Cerrar"><Icon n="x" s={20} /></button></div>
            <div className="mas-grid">
              {visibles.slice(4).map(x => (
                <button key={x.id} className="mas-item" aria-current={vista === x.id ? 'page' : undefined} onClick={() => { setMas(false); ir(x.id); }}>
                  <Icon n={x.icon} s={26} /><span>{x.full}</span>
                </button>
              ))}
            </div>
            <div className="mas-user"><span className="avatar" style={{ width:40, height:40, borderRadius:12, fontSize:14, background:rolU.bg, color:rolU.fg }}>{iniciales(yo.nombre)}</span><span style={{ flex:1, minWidth:0 }}><b>{yo.nombre}</b><span className="muted" style={{ display:'block', fontSize:13 }}>{rolU.label}</span></span><button className="btn btn-ghost btn-sm" onClick={() => { setMas(false); setBloqueo(true); }}>Cambiar</button></div>
            <button className="btn btn-ghost" onClick={() => { setMas(false); ir('portada'); }}><Icon n="portada" s={20} />Portada · todos los módulos</button>
            <button className="btn btn-ghost" onClick={() => { setMas(false); setPrefsOpen(true); }}><Icon n="letra" s={20} />Letra grande y colores</button>
            <div className="acerca-mini"><span className="app-marca-claro">Gastro<b>Metrik</b> {VERSION_APP}</span><Creditos /></div>
          </div>
        </div>
      )}
      {bloqueo && <Bloqueo usuarios={usuarios.filter(u => u.activo)} config={config} onEntrar={entrar} onCancel={() => setBloqueo(false)} />}
      {cobro && <Cobro {...cobro} pedirAuth={pedirAuth} onEstado={e => setPantalla(p => ({ ...p, cobro: e }))} onClose={() => setCobro(null)} />}
      {paleta && <Paleta visibles={visibles} productos={productosVenta} mesas={mesasVista} pedidos={pedidos} puedeVender={puede('pedidos')} onIr={id => ir(id)} onProducto={id => { ir('venta'); addRapido(id); }} onPedido={no => { setAbrirNo(no); ir('pedidos'); }} onClose={() => setPaleta(false)} />}
      {qrMesas && <QRMesas mesas={mesas} config={config} onClose={() => setQrMesas(false)} />}
      {custom && <Personalizar id={custom.id} linea={custom.linea} onAdd={addLine} onClose={() => setCustom(null)} />}
      {exito && <Exito key={exito.k} r={exito} impresora={impresora} onClose={() => setExito(null)} />}
      {ayuda && <Ayuda onClose={() => setAyuda(false)} onGuia={() => { setAyuda(false); ir('venta'); setTimeout(() => setGuia(true), 150); }} />}
      {prefsOpen && <Preferencias {...{ letra, setLetra, tema, setTema, vistaProd, setVistaProd }} onGuia={() => { ir('venta'); setTimeout(() => setGuia(true), 150); }} onClose={() => setPrefsOpen(false)} />}
      {guia && <Guia onClose={() => setGuia(false)} />}
      {auth && <Autorizar {...auth} usuarios={usuarios} perms={perms} onOk={auth.fn} onClose={() => setAuth(null)} />}
      {toast && <div className={'toast' + (toast.deshacer ? ' con-accion' : '')} key={toast.k} role="status"><Icon n={toast.icon} s={20} /><span>{toast.msg}</span>{toast.deshacer && <button className="toast-btn" onClick={() => { toast.deshacer(); setToast({ msg:'Listo, se deshizo', icon:'deshacer', k: Date.now() }); }}><Icon n="deshacer" s={17} />Deshacer</button>}<i className="toast-bar" style={{ animationDuration: toast.deshacer ? '6.5s' : '3.4s' }} /></div>}
  </>);
}

/* ============ 1. Punto de venta ============ */
const MAS_PEDIDOS = ['p02', 'p16', 'p03', 'p20', 'p24', 'p28', 'p06', 'p01', 'p29', 'p26', 'p21', 'p04'];
const destinoVuelo = () => (window.innerWidth < 900 ? '.cart-bar' : '.ticket .tot-num');
const TIPOS_PEDIDO = [['mesa','Mesa','mesas'],['mostrador','Mostrador','store'],['llevar','Para llevar','bag'],['delivery','Delivery','moto']];
function Venta(props) {
  const { productos, cat, setCat, buscar, setBuscar, cart, addRapido, setCustom, incKey, decKey, setNotaKey, setCart, tipo, setTipo, mesaSel, setMesaSel, mesas, cliente, setCliente, ticketNo, sheet, setSheet, abrirCobro, enviarCocina, puedeCobrar, cajaAbierta, ir, vaciarPedido, vistaProd, setVistaProd } = props;
  const [ctxAbierto, setCtxAbierto] = useState(false);
  const [notaDe, setNotaDe] = useState(null);
  const vendibles = productos.filter(p => !p.eliminado && p.disponible);
  const cats = [{ id:'mdia', nombre:'Menú del día' }, ...CATEGORIAS, { id:'eventos', nombre:'Entradas' }].filter(c => vendibles.some(p => p.cat === c.id));
  const qBus = sinTildes(buscar.trim());
  const lista = qBus
    ? vendibles.filter(p => sinTildes(p.nombre + ' ' + (p.desc || '') + ' ' + (CAT[p.cat] || '')).includes(qBus)).map(p => { const n = sinTildes(p.nombre); return [n.startsWith(qBus) ? 0 : n.split(/\s+/).some(w => w.startsWith(qBus)) ? 1 : n.includes(qBus) ? 2 : 3, p]; }).sort((a, b) => a[0] - b[0]).map(x => x[1])
    : cat === 'frecuentes' ? MAS_PEDIDOS.map(id => vendibles.find(p => p.id === id)).filter(Boolean)
    : vendibles.filter(p => cat === 'todo' || p.cat === cat);
  const qty = id => cart.filter(x => x.id === id).reduce((s, x) => s + x.q, 0);
  const t = total(cart);
  const tipoInfo = TIPOS_PEDIDO.find(x => x[0] === tipo);
  const mesa = mesas.find(m => m.n === mesaSel);
  const ctxTexto = tipo === 'mesa' ? `Mesa ${mesaSel}` : tipo === 'delivery' ? (cliente ? `Delivery · ${cliente}` : 'Delivery · falta dirección') : `${tipoInfo[1]}${cliente ? ' · ' + cliente : ''}`;

  return (
    <div className="pos">
      <section className="pos-left" aria-label="Productos">
        <div className="pos-tools">
          <div className="cats" role="group" aria-label="Categorías">
            <button className="cat cat-top" aria-pressed={cat === 'frecuentes' && !buscar} onClick={() => { setCat('frecuentes'); setBuscar(''); }}><Icon n="flame" s={18} />Más pedidos</button>
            <button className="cat" aria-pressed={cat === 'todo' && !buscar} onClick={() => { setCat('todo'); setBuscar(''); }}>Todo</button>
            {cats.map(c => <button key={c.id} className="cat" aria-pressed={cat === c.id && !buscar} onClick={() => { setCat(c.id); setBuscar(''); }}>{c.nombre}</button>)}
          </div>
          <div className="row search-row">
            <label className="search"><Icon n="search" s={20} /><input id="buscar" className="input" placeholder="Buscar: latte, matcha, limonada…" value={buscar} onChange={e => setBuscar(e.target.value)} autoComplete="off" />{buscar && <button type="button" className="search-x" onClick={() => setBuscar('')} aria-label="Borrar búsqueda"><Icon n="x" s={16} /></button>}</label>
            <div className="vista-toggle" role="group" aria-label="Cómo ver los productos">
              <button aria-pressed={vistaProd === 'lista'} onClick={() => setVistaProd('lista')} aria-label="Lista rápida" title="Lista rápida"><Icon n="lista" s={20} /></button>
              <button aria-pressed={vistaProd === 'cuadros'} onClick={() => setVistaProd('cuadros')} aria-label="Fotos grandes" title="Fotos grandes"><Icon n="cuadros" s={20} /></button>
            </div>
          </div>
          {qBus && <span className="muted num" style={{ fontSize:13.5 }}>{lista.length} resultado{lista.length === 1 ? '' : 's'} para "{buscar.trim()}"</span>}
        </div>
        <div className={'plist-pos' + (vistaProd === 'cuadros' ? ' cuadros' : '')}>
          {lista.map(p => {
            const agotado = p.stockCtl && p.stock <= 0;
            const q = qty(p.id);
            const lineas = cart.filter(x => x.id === p.id);
            const directo = lineas.length === 1 && !(p.mods && p.mods.length) ? lineas[0] : null;
            return (
              <div key={p.id} className={'pitem' + (q ? ' in' : '') + (agotado ? ' off' : '') + (directo ? ' con-stepper' : '')}>
                <button className="pitem-main" onClick={e => { if (p.mods && p.mods.length) { setCustom({ id: p.id }); return; } if (!agotado) volar(e.currentTarget.querySelector('.pitem-img'), destinoVuelo()); addRapido(p.id); }} aria-label={`${p.mods && p.mods.length ? 'Personalizar' : 'Agregar'} ${p.nombre}, ${bs(p.precio)}${q ? `, ${q} en el pedido` : ''}`}>
                  <span className="pitem-img" style={{ background:`color-mix(in srgb, ${p.color} 22%, var(--surface))` }}><Art p={p} />{q ? <span className="pitem-q num" key={q}>{q}</span> : null}</span>
                  <span className="pitem-txt">
                    <span className="pitem-name">{p.nombre}</span>
                    {directo && <span className="pitem-price-in num">{bs(p.precio)} c/u</span>}
                    {(agotado || p.stockCtl || p.desc || (p.mods && p.mods.length)) && <span className={'pitem-desc' + (agotado ? ' agotado' : p.stockCtl && p.stock <= p.min ? ' bajo' : '')}>{agotado ? 'Agotado' : p.stockCtl ? `Quedan ${p.stock}${p.desc ? ' · ' + p.desc : ''}` : (p.desc || (p.mods.length > 2 ? `${MODS[p.mods[0]].l}, ${MODS[p.mods[1]].l.toLowerCase()} y más` : p.mods.map(g => MODS[g].l).join(' y ')))}</span>}
                  </span>
                  <span className="pitem-price num">{bs(p.precio)}</span>
                </button>
                {directo ? (
                  <div className="pitem-stepper" role="group" aria-label={`Cantidad de ${p.nombre}`}>
                    <button onClick={() => decKey(directo.key)} aria-label={`Quitar un ${p.nombre}`}><Icon n={directo.q === 1 ? 'trash' : 'minus'} s={18} /></button>
                    <span className="num" aria-live="polite">{directo.q}</span>
                    <button onClick={e => { volar(e.currentTarget.closest('.pitem').querySelector('.pitem-img'), destinoVuelo()); incKey(directo.key); }} aria-label={`Agregar un ${p.nombre}`}><Icon n="plus" s={18} /></button>
                  </div>
                ) : <button className="pitem-add" onClick={e => { if (!agotado && !faltaObligatorio(p, modsDef(p))) volar(e.currentTarget.parentNode.querySelector('.pitem-img'), destinoVuelo()); addRapido(p.id); }} aria-label={`Agregar ${p.nombre} ${p.mods && p.mods.length ? 'sin cambios' : ''}`}><Icon n="plus" s={20} w={2.2} /></button>}
              </div>
            );
          })}
          {!lista.length && <div className="empty" style={{ gridColumn:'1 / -1' }}><Icon n="search" s={32} w={1.5} /><b>No hay productos con "{buscar}"</b><button className="btn btn-ghost btn-sm" onClick={() => setBuscar('')}>Ver todo el menú</button></div>}
        </div>
      </section>

      <div className={'sheet-scrim' + (sheet ? ' open' : '')} onClick={() => setSheet(false)} />
      <aside className={'ticket' + (sheet ? ' open' : '')} aria-label="Pedido actual">
        <div className="ticket-head">
          <div className="between">
            <div><div className="eyebrow">Pedido actual</div><h2 className="num">Ticket N° {String(ticketNo + 1).padStart(4, '0')}</h2></div>
            <div className="row">
              {cart.length > 0 && <button className="btn btn-ghost btn-sm" onClick={vaciarPedido} aria-label="Vaciar pedido"><Icon n="trash" s={18} />Vaciar</button>}
              <button className="icon-btn sheet-close" onClick={() => setSheet(false)} aria-label="Cerrar pedido"><Icon n="x" s={20} /></button>
            </div>
          </div>
          <button className={'ctx-line' + (ctxAbierto ? ' open' : '')} onClick={() => setCtxAbierto(o => !o)} aria-expanded={ctxAbierto} aria-controls="ctx-panel">
            <span className="ctx-ico"><Icon n={tipoInfo[2]} s={20} /></span>
            <span className="ctx-main"><b>{ctxTexto}</b><span className="muted">{tipo === 'mesa' && mesa ? `${mesa.zona} · ${ESTADO_MESA[mesa.estado].label.toLowerCase()}` : tipoInfo[1]}</span></span>
            <span className="ctx-cambiar">Cambiar<Icon n="down" s={16} /></span>
          </button>
          {ctxAbierto && (
            <div className="ctx-panel" id="ctx-panel">
              <div className="seg" role="group" aria-label="Tipo de pedido">
                {TIPOS_PEDIDO.map(([id, l, ic]) => <button key={id} aria-pressed={tipo === id} onClick={() => setTipo(id)}><Icon n={ic} s={20} />{l}</button>)}
              </div>
              {tipo === 'mesa' && (
                <div className="mesa-chips" role="group" aria-label="Mesa">
                  {mesas.map(m => (
                    <button key={m.n} className="mesa-chip num" aria-pressed={mesaSel === m.n} onClick={() => { setMesaSel(m.n); setCtxAbierto(false); }} aria-label={`Mesa ${m.n}, ${ESTADO_MESA[m.estado].label}`}>
                      {m.n}<i className="dot" style={{ background: ESTADO_MESA[m.estado].c }} />
                    </button>
                  ))}
                </div>
              )}
              {(tipo === 'mostrador' || tipo === 'llevar') && <input id="cliente" className="input" placeholder="Nombre para llamar (ej. Karen)" value={cliente} onChange={e => setCliente(e.target.value)} />}
              {tipo === 'delivery' && (<>
                <input id="dir" className="input" placeholder="Dirección (ej. Calle Sucre #245)" value={cliente} onChange={e => setCliente(e.target.value)} />
                <div className="row muted" style={{ fontSize:13.5 }}><Icon n="moto" s={18} />Repartidor: Jhonny · tarifa Bs 7 cobrada aparte</div>
              </>)}
              {tipo !== 'mesa' && <button className="btn btn-ghost btn-sm" onClick={() => setCtxAbierto(false)}>Listo</button>}
            </div>
          )}
        </div>

        <div className="ticket-items">
          {cart.length === 0 ? (
            <div className="empty"><Icon n="inbox" s={36} w={1.5} /><b>Pedido vacío</b><span>Toca un producto para agregarlo.</span></div>
          ) : cart.map(it => {
            const p = P[it.id];
            const mt = modsTxt(it);
            const editable = p.mods && p.mods.length;
            return (
              <div className="line" key={it.key}>
                <div style={{ minWidth:0 }}>
                  {editable ? <button className="line-name line-edit" onClick={() => setCustom({ id: it.id, linea: it })}>{p.nombre}<Icon n="edit" s={14} /></button> : <div className="line-name">{p.nombre}</div>}
                  {mt && <div className="line-mods">{mt}</div>}
                  <div className="line-sub num">{bs(lineUnit(it))} c/u</div>
                  {it.nota && notaDe !== it.key && <button className="line-note" onClick={() => setNotaDe(it.key)}>{it.nota}</button>}
                </div>
                <div className="line-total num">{bs(lineUnit(it) * it.q)}</div>
                {notaDe === it.key ? (
                  <form className="line-note-edit" onSubmit={e => { e.preventDefault(); setNotaDe(null); }}>
                    <input id={'nota-' + it.key} className="input" autoFocus value={it.nota || ''} onChange={e => setNotaKey(it.key, e.target.value)} placeholder="Ej. bien caliente, sin canela" aria-label={`Nota para ${p.nombre}`} />
                    <button type="submit" className="btn btn-primary btn-sm">Listo</button>
                  </form>
                ) : (
                  <div className="line-actions">
                    <div className="stepper">
                      <button onClick={() => decKey(it.key)} aria-label={`Quitar un ${p.nombre}`}><Icon n={it.q === 1 ? 'trash' : 'minus'} s={18} /></button>
                      <span className="num">{it.q}</span>
                      <button onClick={() => incKey(it.key)} aria-label={`Agregar un ${p.nombre}`}><Icon n="plus" s={18} /></button>
                    </div>
                    {!it.nota && <button className="note-btn" onClick={() => setNotaDe(it.key)}><Icon n="edit" s={16} />Nota</button>}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="ticket-foot">
          <div className="tot-big">
            <span><span className="muted" style={{ fontWeight:700 }}>Total</span><span className="tot-meta num">{unidades(cart)} productos · {FISCAL.simplificado ? 'RTS · sin factura' : 'IVA incluido'}</span></span>
            <strong className="num tot-num"><AnimNum value={totalC(cart)} fmt={bsC} /></strong>
            <span className="sr-only" aria-live="polite">{cart.length ? `Total ${bsC(totalC(cart))}, ${unidades(cart)} productos` : 'Pedido vacío'}</span>
          </div>
          <div className={'foot-actions' + (puedeCobrar && tipo === 'mesa' ? ' two' : '')}>
            {(tipo === 'mesa' || !puedeCobrar) && (
              <button className={'btn ' + (puedeCobrar ? 'btn-ghost' : 'btn-primary btn-cobrar')} disabled={!cart.length} onClick={enviarCocina}>
                <Icon n="flame" s={20} />{puedeCobrar ? (<span className="stack" style={{ gap:0, alignItems:'center' }}><span>A barra</span><small className="muted" style={{ fontWeight:600, fontSize:13 }}>cobrar luego</small></span>) : 'Enviar a barra'}
              </button>
            )}
            {puedeCobrar && (cajaAbierta
              ? <button className="btn btn-primary btn-cobrar" disabled={!cart.length} onClick={abrirCobro}><span>Cobrar</span><span className="num">{bs(t)}</span></button>
              : <button className="btn btn-ghost btn-cobrar" onClick={() => ir('caja')}><span className="row" style={{ gap:8 }}><Icon n="lock" s={20} />Abrir caja</span><span className="muted" style={{ fontSize:13 }}>para cobrar</span></button>)}
          </div>
          {!puedeCobrar && <span className="muted" style={{ fontSize:13, textAlign:'center' }}>Tu rol no cobra. La cuenta la cobra caja.</span>}
        </div>
      </aside>

      <button className="btn btn-primary cart-bar" onClick={() => setSheet(true)}>
        <span className="row"><Icon n="venta" s={22} />Ver pedido · <span key={unidades(cart)} className="bump">{unidades(cart)}</span></span><span className="num"><AnimNum value={totalC(cart)} fmt={bsC} /></span>
      </button>
    </div>
  );
}

/* ============ Personalizar bebida (modificadores) ============ */
function Personalizar({ id, linea, onAdd, onClose }) {
  const p = P[id];
  const [mods, setMods] = useState(linea ? JSON.parse(JSON.stringify(linea.mods)) : modsDef(p));
  const [q, setQ] = useState(linea ? linea.q : 1);
  const [nota, setNota] = useState(linea ? linea.nota || '' : '');
  const [err, setErr] = useState(false);
  useEscape(onClose);
  const unit = lineUnit({ id, mods });
  const elegir = (g, i) => {
    const M = MODS[g];
    setErr(false);
    setMods(m => {
      if (M.tipo === 'uno') return { ...m, [g]: i };
      const cur = m[g] || [];
      if (cur.includes(i)) return { ...m, [g]: cur.filter(x => x !== i) };
      return { ...m, [g]: (cur.length >= M.max ? cur.slice(1) : cur).concat(i) };
    });
  };
  const agregar = () => {
    if (faltaObligatorio(p, mods)) { setErr(true); return; }
    onAdd(id, mods, q, nota.trim(), linea && linea.key);
    onClose();
  };
  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal custom-modal" role="dialog" aria-modal="true" aria-labelledby="cm-t" onClick={e => e.stopPropagation()}>
        <div className="custom-head row" style={{ gap:14, alignItems:'center' }}>
          <span className="pitem-img" style={{ width:64, height:64, background:`color-mix(in srgb, ${p.color} 22%, var(--surface))` }}><Art p={p} /></span>
          <div style={{ flex:1, minWidth:0 }}><div className="eyebrow">{linea ? 'Editar' : 'Personalizar'}</div><h2 id="cm-t" style={{ fontSize:22 }}>{p.nombre}</h2><span className="muted num">Desde {bs(p.precio)}</span></div>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icon n="x" s={20} /></button>
        </div>
        <div className="custom-body">
        <div className="mod-groups">
          {(p.mods || []).map(g => {
            const M = MODS[g];
            const oblig = M.tipo === 'uno' && M.def === null;
            const falta = err && oblig && (mods[g] === null || mods[g] === undefined);
            return (
              <fieldset key={g} className={'mod-group' + (falta ? ' falta' : '')}>
                <legend><b>{M.l}</b><span className="muted">{oblig ? 'Elige una' : M.tipo === 'varios' ? `Opcional · hasta ${M.max}` : ''}</span></legend>
                <div className="mod-ops">
                  {M.ops.map((o, i) => {
                    const on = M.tipo === 'uno' ? mods[g] === i : (mods[g] || []).includes(i);
                    return (
                      <button key={i} type="button" className="mod-op" aria-pressed={on} onClick={() => elegir(g, i)}>
                        <span>{o.l}</span>{o.p > 0 && <span className="num mod-p">+ {bs(o.p)}</span>}
                      </button>
                    );
                  })}
                </div>
                {falta && <span className="err">Elige {M.l.toLowerCase()} para continuar.</span>}
              </fieldset>
            );
          })}
        </div>
        <label className="field">Nota para barra <span className="opt">opcional</span>
          <input id="cm-nota" className="input" value={nota} onChange={e => setNota(e.target.value)} placeholder="Ej. bien caliente, sin canela" />
        </label>
        </div>
        <div className="custom-foot">
          <div className="stepper">
            <button onClick={() => setQ(x => Math.max(1, x - 1))} aria-label="Una menos"><Icon n="minus" s={18} /></button>
            <span className="num">{q}</span>
            <button onClick={() => setQ(x => x + 1)} aria-label="Una más"><Icon n="plus" s={18} /></button>
          </div>
          <button className="btn btn-primary btn-cobrar" style={{ flex:1, minHeight:60 }} onClick={agregar}>
            <span>{linea ? 'Guardar' : 'Agregar'}</span><span className="num">{bs(unit * q)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============ Autorización con PIN ============ */
function Autorizar({ perm, desc, usuarios, perms, onOk, onClose }) {
  const quienes = usuarios.filter(u => u.activo && (perms[u.rol] || []).includes(perm));
  const [uid, setUid] = useState(quienes[0] ? quienes[0].id : null);
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  useEscape(onClose);
  const u = quienes.find(x => x.id === uid);
  const enviar = e => {
    e.preventDefault();
    if (!u) return;
    if (pin === u.pin) { onOk(u.nombre); onClose(); }
    else { setErr('PIN incorrecto. Pide a la persona que lo escriba de nuevo.'); setPin(''); }
  };
  return (
    <div className="scrim" style={{ zIndex:65 }} onClick={onClose}>
      <form className="modal" style={{ maxWidth:440 }} role="dialog" aria-modal="true" aria-labelledby="au-t" onClick={e => e.stopPropagation()} onSubmit={enviar} noValidate>
        <div className="between"><div className="row" style={{ gap:12 }}><span className="ctx-ico" style={{ background:'var(--gold-soft)', color:'var(--gold-text)' }}><Icon n="shield" s={20} /></span><div><div className="eyebrow">Necesita autorización</div><h2 id="au-t">{desc}</h2></div></div><button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icon n="x" s={20} /></button></div>
        {quienes.length ? (<>
          <span className="muted">Tu rol no tiene este permiso. Alguien con permiso debe escribir su PIN.</span>
          <div className="auth-users">
            {quienes.map(x => <button type="button" key={x.id} aria-pressed={uid === x.id} onClick={() => { setUid(x.id); setErr(''); }}><span className="avatar" style={{ width:34, height:34, borderRadius:10, fontSize:13, background:ROLES[x.rol].bg, color:ROLES[x.rol].fg }}>{iniciales(x.nombre)}</span>{x.nombre}</button>)}
          </div>
          <label className="field">PIN de {u ? u.nombre.split(' ')[0] : ''}
            <input id="au-pin" className="input num pin-in" type="password" inputMode="numeric" maxLength={4} autoComplete="off" autoFocus value={pin} onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setErr(''); }} aria-invalid={!!err} />
            {err && <span className="err">{err}</span>}
          </label>
          <div className="form-actions"><span style={{ flex:1 }} /><button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={pin.length !== 4}>Autorizar</button></div>
        </>) : <div className="fiscal-warn"><Icon n="alert" s={20} /><span>Nadie activo tiene este permiso. Actívalo en Usuarios → Roles y permisos.</span></div>}
      </form>
    </div>
  );
}

/* ============ Modal de cobro ============ */
function QR({ size = 160, valor, pago }) {
  const [src, setSrc] = useState(null);
  useEffect(() => { let vivo = true; if (valor) QRCode.toDataURL(valor, { margin:1, width: size * 2, color:{ dark:'#0B2A18', light:'#FFFFFF' } }).then(u => { if (vivo) setSrc(u); }).catch(() => {}); return () => { vivo = false; }; }, [valor, size]);
  if (valor) return src ? <img src={src} width={size} height={size} alt={`Código QR que abre ${valor}`} style={{ borderRadius:14, background:'#fff', flex:'none' }} /> : <div className="sk" style={{ width:size, height:size, borderRadius:14, flex:'none' }} />;
  if (pago && QR_BANCO) return <img src={QR_BANCO} width={size} height={size} alt="QR de cobro del banco" style={{ objectFit:'contain', borderRadius:14, background:'#fff', flex:'none' }} />;
  return <div className="qr-falta" style={{ width:size, height:size }}><Icon n="qr" s={Math.max(22, size / 4)} /><span>{pago ? 'Sube el QR de tu banco en Carta y tienda → Tienda online' : 'QR'}</span></div>;
}
function useEscape(fn) { useEffect(() => { const k = e => e.key === 'Escape' && fn(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []); }

const MOTIVOS_DESC = ['Cliente frecuente', 'Promoción del día', 'Error en el pedido', 'Demora en la atención', 'Cortesía de la casa', 'Artista o invitado del evento'];
function Cobro({ titulo, items, pagadoC = 0, split, dividir, modo: modoIni = 'todo', onConfirm, onClose, pedirAuth, onEstado }) {
  const cuentaC = totalC(items);
  const saldoC = cuentaC - pagadoC;
  const [modo, setModo] = useState(split ? 'partes' : modoIni);
  const [partes, setPartes] = useState(split ? split.n : 2);
  const [sel, setSel] = useState({});
  const [desc, setDesc] = useState(null);
  const [descAbierto, setDescAbierto] = useState(false);
  const [dTipo, setDTipo] = useState('10');
  const [dMonto, setDMonto] = useState('');
  const [dMotivo, setDMotivo] = useState(MOTIVOS_DESC[0]);
  const [prop, setProp] = useState('0');
  const [propOtro, setPropOtro] = useState('');
  const [met, setMet] = useState('efectivo');
  const [recTxt, setRecTxt] = useState(null);
  const rec = recTxt === null ? null : leerMontoC(recTxt);
  const setRec = v => setRecTxt(v === null ? null : String(v / 100).replace('.', ','));
  const [nit, setNit] = useState('');
  const [rs, setRs] = useState('');
  useEscape(onClose);

  const pagadas = split ? split.pagadas : 0;
  const reparto = partesC(cuentaC, partes);
  const parteN = Math.min(partes, pagadas + 1);
  const baseC = modo === 'todo' ? saldoC : modo === 'partes' ? (parteN === partes ? saldoC : reparto[parteN - 1]) : items.reduce((s, it) => s + lineUnitC(it) * (sel[it.key] || 0), 0);
  const dC = modo === 'todo' && desc ? Math.min(baseC, desc.montoC) : 0;
  const netoC = baseC - dC;
  const pC = propinaC(netoC, prop, propOtro);
  const cobrarC = netoC + pC;
  const recibidoC = rec === null ? cobrarC : rec;
  const vueltoC = cambioC(recibidoC, cobrarC);
  const ok = baseC > 0 && (met !== 'efectivo' || recibidoC >= cobrarC);
  const sugeridos = [...new Set([cobrarC, ...[2000, 5000, 10000, 20000].filter(v => v > cobrarC)])].slice(0, 5);
  const nombres = { efectivo:'efectivo', qr:'QR', tarjeta:'tarjeta' };
  useEffect(() => { onEstado && onEstado({ cobrarC, met, titulo, items: items.map(i => ({ key:i.key, id:i.id, q:i.q, mods:i.mods })) }); }, [cobrarC, met]);
  useEffect(() => () => { onEstado && onEstado(null); }, []);

  const calcDesc = () => {
    const tipo = dTipo === 'cortesia' ? 'cortesia' : dTipo === 'monto' ? 'monto' : 'pct';
    const montoC = descuentoC(baseC, tipo, tipo === 'monto' ? String(dMonto).replace(',', '.') : dTipo);
    return { montoC, etiqueta: tipo === 'cortesia' ? 'Cortesía' : tipo === 'monto' ? bsC(montoC) : dTipo + ' %', cortesia: tipo === 'cortesia' };
  };
  const aplicarDesc = () => {
    const d = calcDesc();
    if (!(d.montoC > 0)) return;
    pedirAuth('descuentos', d.cortesia ? 'Cortesía de la casa' : `Descuento de ${bsC(d.montoC)}`, quien => { setDesc({ ...d, motivo: dMotivo, autorizo: quien }); setDescAbierto(false); setRec(null); });
  };
  const confirmar = () => {
    onConfirm({ met: nombres[met], modo, partes, baseC, descuentoC: dC, netoC, propinaC: pC, totalC: cobrarC, cambioC: met === 'efectivo' ? vueltoC : 0, motivo: desc ? desc.motivo : '', cortesia: desc && desc.cortesia, autorizo: desc && desc.autorizo, sel, nit: nit.trim(), rs: rs.trim() });
    onClose();
  };
  const setSelQ = (k, v, max) => setSel(s => ({ ...s, [k]: Math.max(0, Math.min(max, v)) }));

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal modal-lg cobro" role="dialog" aria-modal="true" aria-labelledby="cobro-t" onClick={e => e.stopPropagation()}>
        <div className="between">
          <div><div className="eyebrow">Cobrar · {titulo}</div><h2 id="cobro-t" className="num" style={{ fontSize:34, fontWeight:800 }}>{bsC(cobrarC)}</h2>{pagadoC > 0 && <span className="muted num">Cuenta {bsC(cuentaC)} · ya pagado {bsC(pagadoC)} · saldo {bsC(saldoC)}</span>}</div>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icon n="x" s={20} /></button>
        </div>

        {dividir && (
          <div className="tabs" role="group" aria-label="Cómo cobrar" style={{ alignSelf:'flex-start', flexWrap:'wrap' }}>
            <button aria-pressed={modo === 'todo'} onClick={() => setModo('todo')}>{pagadoC > 0 ? 'Todo el saldo' : 'Toda la cuenta'}</button>
            <button aria-pressed={modo === 'partes'} onClick={() => { setModo('partes'); setDesc(null); setRec(null); }}>Partes iguales</button>
            <button aria-pressed={modo === 'producto'} disabled={pagadoC > 0} title={pagadoC > 0 ? 'Ya se cobraron partes iguales' : ''} onClick={() => { setModo('producto'); setDesc(null); setRec(null); }}>Por producto</button>
          </div>
        )}

        {modo === 'partes' && (
          <div className="split-box">
            <div className="row" style={{ gap:12, flexWrap:'wrap' }}>
              <span style={{ fontWeight:700 }}>Dividir entre</span>
              <div className="stepper" style={{ gridColumn:'auto' }}>
                <button onClick={() => { setPartes(x => Math.max(2, x - 1)); setRec(null); }} aria-label="Menos personas" disabled={!!split}><Icon n="minus" s={18} /></button>
                <span className="num" aria-live="polite">{partes}</span>
                <button onClick={() => { setPartes(x => Math.min(12, x + 1)); setRec(null); }} aria-label="Más personas" disabled={!!split}><Icon n="plus" s={18} /></button>
              </div>
              <span className="muted num">personas · {reparto[0] === reparto[partes - 1] ? `${bsC(reparto[0])} c/u` : `${bsC(reparto[0])} o ${bsC(reparto[partes - 1])}`}</span>
            </div>
            <div className="parts num">{reparto.map((c, i) => <span key={i} className={i < parteN - 1 ? 'paid' : i === parteN - 1 ? 'now' : ''}>{i < parteN - 1 ? `Pagada · ${bsC(c)}` : `Parte ${i + 1} · ${bsC(c)}`}</span>)}</div>
            {reparto[0] !== reparto[partes - 1] && <span className="muted" style={{ fontSize:13 }}>El centavo que sobra se reparte en las primeras partes para que la suma sea exacta.</span>}
          </div>
        )}

        {modo === 'producto' && (
          <div className="split-box">
            <span className="muted" style={{ fontSize:13.5 }}>Elige qué productos paga esta persona.</span>
            {items.map(it => (
              <div className="split-line" key={it.key}>
                <div style={{ minWidth:0 }}><b>{P[it.id].nombre}</b>{modsTxt(it) && <div className="muted" style={{ fontSize:13 }}>{modsTxt(it)}</div>}<div className="muted num" style={{ fontSize:13 }}>{it.q} en la cuenta · {bsC(lineUnitC(it))} c/u</div></div>
                <div className="stepper" style={{ gridColumn:'auto' }}>
                  <button onClick={() => setSelQ(it.key, (sel[it.key] || 0) - 1, it.q)} aria-label={`Quitar ${P[it.id].nombre}`}><Icon n="minus" s={16} /></button>
                  <span className="num">{sel[it.key] || 0}</span>
                  <button onClick={() => setSelQ(it.key, (sel[it.key] || 0) + 1, it.q)} aria-label={`Agregar ${P[it.id].nombre}`}><Icon n="plus" s={16} /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        {modo === 'todo' && !dividir && <div className="muted" style={{ fontSize:14 }}>{items.map(i => `${i.q}× ${P[i.id].nombre}`).join(' · ')}</div>}

        <div className="cobro-grid">
          <div className="stack" style={{ gap:14 }}>
            <div className="methods" role="group" aria-label="Método de pago">
              {[['efectivo','Efectivo','cash'],['qr','QR','qr'],['tarjeta','Tarjeta','card']].map(([id, l, ic]) => (
                <button key={id} className="method" aria-pressed={met === id} onClick={() => setMet(id)}><Icon n={ic} s={26} />{l}</button>
              ))}
            </div>
            {met === 'efectivo' && (<>
              <div className="field">Monto recibido
                <div className="quick">{sugeridos.map((v, i) => <button key={v} aria-pressed={recibidoC === v} className="num" onClick={() => setRec(v)}>{i === 0 ? 'Exacto' : bsC(v)}</button>)}</div>
                <div className="input-pre"><span>Bs</span><input id="recibido" className="input num" inputMode="decimal" value={recTxt === null ? String(cobrarC / 100).replace('.', ',') : recTxt} onChange={e => setRecTxt(e.target.value)} aria-label="Monto recibido en bolivianos" /></div>
              </div>
              <div className="diff" style={{ background: recibidoC >= cobrarC ? 'var(--green-soft)' : 'var(--red-soft)', color: recibidoC >= cobrarC ? 'var(--green-text)' : 'var(--red-text)' }} aria-live="polite">
                <b>{recibidoC >= cobrarC ? 'Cambio a entregar' : 'Falta'}</b><b className="num" style={{ fontSize:24, fontFamily:'var(--f-display)' }}>{bsC(recibidoC >= cobrarC ? vueltoC : cobrarC - recibidoC)}</b>
              </div>
            </>)}
            {met === 'qr' && (
              <div className="row" style={{ gap:16, flexWrap:'wrap' }}>
                <QR pago />
                <div style={{ flex:'1 1 160px', display:'flex', flexDirection:'column', gap:6 }}>
                  <b>QR de cobro por {bsC(cobrarC)}</b>
                  <span className="muted">El cliente lo escanea con la app de su banco. Confirma cuando veas el pago acreditado.</span>
                  <span className="pill pill-gold" style={{ alignSelf:'flex-start', marginTop:6 }}><Icon n="clock" s={14} />Esperando pago</span>
                </div>
              </div>
            )}
            {met === 'tarjeta' && <div className="diff" style={{ background:'var(--blue-soft)', color:'var(--blue-text)' }}><span>Pasa la tarjeta por el datáfono del banco y confirma cuando salga aprobada.</span><Icon n="card" s={28} /></div>}
            {FISCAL.simplificado ? (<>
              <div className="fiscal-note"><Icon n="note" s={18} /><span>Régimen Tributario Simplificado (RTS): se entrega ticket de venta, sin factura ni crédito fiscal.</span></div>
              <label className="field">Nombre en el ticket <span className="opt">opcional</span><input id="rs" className="input" placeholder="Ej. Karen" value={rs} onChange={e => setRs(e.target.value)} /></label>
            </>) : (
              <div className="row" style={{ gap:10, flexWrap:'wrap' }}>
                <label className="field" style={{ flex:'1 1 140px' }}>NIT / CI (factura)<input id="nit" className="input num" inputMode="numeric" placeholder="0 = sin nombre" value={nit} onChange={e => setNit(e.target.value)} /></label>
                <label className="field" style={{ flex:'2 1 180px' }}>Razón social<input id="rs" className="input" placeholder="Ej. Toledo Azpiazu" value={rs} onChange={e => setRs(e.target.value)} /></label>
              </div>
            )}
          </div>

          <div className="stack" style={{ gap:12 }}>
            <div className="sum-box num">
              <div className="kv"><span>{modo === 'todo' ? (pagadoC > 0 ? 'Saldo' : 'Subtotal') : modo === 'partes' ? `Parte ${parteN} de ${partes}` : 'Productos elegidos'}</span><b>{bsC(baseC)}</b></div>
              {dC > 0 && <div className="kv" style={{ color:'var(--red-text)' }}><span>{desc.cortesia ? 'Cortesía' : `Descuento ${desc.etiqueta}`} · {desc.motivo}</span><b>− {bsC(dC)}</b></div>}
              {pC > 0 && <div className="kv"><span>Propina</span><b>+ {bsC(pC)}</b></div>}
              <div className="kv" style={{ fontSize:17 }}><b>Total a cobrar</b><b style={{ fontFamily:'var(--f-display)', fontSize:22 }}>{bsC(cobrarC)}</b></div>
              {!FISCAL.simplificado && netoC > 0 && <span className="muted" style={{ fontSize:13 }}>Incluye IVA (13 %): {bsC(ivaC(netoC))}. La propina no lleva IVA.</span>}
            </div>

            {modo === 'todo' && (desc ? (
              <button className="btn btn-ghost btn-sm" onClick={() => { setDesc(null); setRec(null); }}><Icon n="x" s={16} />Quitar {desc.cortesia ? 'cortesía' : 'descuento'}</button>
            ) : descAbierto ? (
              <div className="desc-box">
                <b>Descuento o cortesía</b>
                <div className="quick">
                  {[['10','10 %'],['15','15 %'],['20','20 %'],['monto','Monto fijo'],['cortesia','Cortesía']].map(([k, l]) => <button key={k} aria-pressed={dTipo === k} onClick={() => setDTipo(k)}>{l}</button>)}
                </div>
                {dTipo === 'monto' && <div className="input-pre"><span>Bs</span><input id="d-monto" className="input num" inputMode="decimal" value={dMonto} onChange={e => setDMonto(e.target.value)} placeholder="0" aria-label="Monto del descuento" /></div>}
                <label className="field">Motivo<select id="d-motivo" className="input" value={dMotivo} onChange={e => setDMotivo(e.target.value)}>{MOTIVOS_DESC.map(m => <option key={m}>{m}</option>)}</select></label>
                <div className="row"><button className="btn btn-ghost btn-sm" style={{ flex:1 }} onClick={() => setDescAbierto(false)}>Cancelar</button><button className="btn btn-primary btn-sm" style={{ flex:1 }} onClick={aplicarDesc} disabled={!(calcDesc().montoC > 0)}>Aplicar {calcDesc().montoC > 0 ? '− ' + bsC(calcDesc().montoC) : ''}</button></div>
              </div>
            ) : <button className="btn btn-ghost btn-sm" onClick={() => setDescAbierto(true)}><Icon n="tag" s={17} />Descuento o cortesía</button>)}

            <div className="field">Propina <span className="opt">opcional</span>
              <div className="quick">
                {[['0','Sin propina'],['5','5 %'],['10','10 %'],['otro','Otro monto']].map(([k, l]) => <button key={k} aria-pressed={prop === k} onClick={() => { setProp(k); setRec(null); }}>{l}</button>)}
              </div>
              {prop === 'otro' && <div className="input-pre"><span>Bs</span><input id="prop-otro" className="input num" inputMode="decimal" value={propOtro} onChange={e => { setPropOtro(e.target.value); setRec(null); }} placeholder="0" aria-label="Monto de la propina" /></div>}
            </div>
          </div>
        </div>

        <button className="btn btn-primary btn-cobrar" disabled={!ok} onClick={confirmar}>
          <span>{baseC <= 0 ? 'Elige qué cobrar' : met === 'qr' ? 'Pago recibido' : 'Confirmar cobro'}</span><span className="num">{bsC(cobrarC)}</span>
        </button>
      </div>
    </div>
  );
}

/* ============ Eventos y reservas ============ */
const GENEROS = ['Jazz y blues', 'Jazz', 'Blues', 'Trova', 'Lectura', 'Arte', 'Micrófono abierto', 'Otro'];
const RES_ESTADOS = {
  pendiente:  { l:'Pendiente',  cls:'pill-gold' },
  confirmada: { l:'Confirmada', cls:'pill-blue' },
  llego:      { l:'Llegó',      cls:'pill-green' },
  novino:     { l:'No vino',    cls:'pill-red' },
  cancelada:  { l:'Cancelada',  cls:'pill-gray' },
};
const EV_ESTADOS = {
  borrador:   { l:'Borrador',   cls:'pill-gray' },
  publicado:  { l:'Publicado',  cls:'pill-green' },
  agotado:    { l:'Agotado',    cls:'pill-red' },
  encurso:    { l:'En curso',   cls:'pill-gold' },
  finalizado: { l:'Finalizado', cls:'pill-gray' },
};
const isoDia = d => { const z = new Date(d); z.setMinutes(z.getMinutes() - z.getTimezoneOffset()); return z.toISOString().slice(0, 10); };
const hoyISO = () => isoDia(new Date());
const diaMas = n => { const d = new Date(); d.setDate(d.getDate() + n); return isoDia(d); };
const fechaTxt = (iso, largo) => { const d = new Date(iso + 'T12:00:00'); return d.toLocaleDateString('es-BO', largo ? { weekday:'long', day:'numeric', month:'long' } : { weekday:'short', day:'numeric', month:'short' }); };
const ahoraHM = () => hora();
const reservaActiva = r => r.estado === 'pendiente' || r.estado === 'confirmada';
const cuentaAforo = r => r.estado === 'pendiente' || r.estado === 'confirmada' || r.estado === 'llego';
const ocupadosEvento = (ev, reservas) => ev.vendidas + reservas.filter(r => r.evento === ev.id && cuentaAforo(r)).reduce((s, r) => s + r.personas, 0);
const estadoEvento = (ev, reservas) => {
  if (ev.estado === 'borrador') return 'borrador';
  const h = hoyISO();
  if (ev.fecha < h || (ev.fecha === h && ahoraHM() >= ev.fin)) return 'finalizado';
  if (ev.fecha === h && ahoraHM() >= ev.hora) return 'encurso';
  if (ocupadosEvento(ev, reservas) >= ev.aforo) return 'agotado';
  return 'publicado';
};
const EVENTOS0 = [
  { id:'e1', nombre:'Noche de jazz y blues', artista:'Aldo Franco', fecha: diaMas(0), hora:'20:00', fin:'23:00', genero:'Jazz y blues', aforo:40, precio:30, consumo:0, estado:'publicado', vendidas:9, desc:'El concertista Aldo Franco con un repertorio de jazz y blues con estilo único.', foto:null },
  { id:'e2', nombre:'Lectura en voz alta: poesía cruceña', artista:'Club de lectura Notas', fecha: diaMas(2), hora:'18:30', fin:'20:00', genero:'Lectura', aforo:25, precio:0, consumo:20, estado:'publicado', vendidas:0, desc:'Trae tu poema favorito o escucha. Consumo mínimo Bs 20.', foto:null },
  { id:'e3', nombre:'Micrófono abierto', artista:'Talentos emergentes', fecha: diaMas(4), hora:'20:30', fin:'23:30', genero:'Micrófono abierto', aforo:35, precio:20, consumo:0, estado:'publicado', vendidas:14, desc:'Cinco artistas nuevos, quince minutos cada uno.', foto:null },
  { id:'e4', nombre:'Retratos de la Chiquitania', artista:'Exposición colectiva', fecha: diaMas(8), hora:'17:00', fin:'21:00', genero:'Arte', aforo:60, precio:0, consumo:0, estado:'borrador', vendidas:0, desc:'Fotografía y pintura de artistas locales.', foto:null },
  { id:'e0', nombre:'Trova en la terraza', artista:'Dúo Ñembiguasu', fecha: diaMas(-4), hora:'20:00', fin:'22:30', genero:'Trova', aforo:35, precio:25, consumo:0, estado:'publicado', vendidas:33, desc:'', foto:null },
];
const RESERVAS0 = [
  { id:'r1', nombre:'Familia Rivero', tel:'70012399', personas:5, fecha: diaMas(0), hora:'19:45', zona:'Salón', mesa:5, evento:'e1', estado:'confirmada', nota:'Cumpleaños, traen torta' },
  { id:'r2', nombre:'Marcelo Áñez', tel:'76540012', personas:2, fecha: diaMas(0), hora:'19:50', zona:'Escenario', mesa:8, evento:'e1', estado:'confirmada', nota:'Lo más cerca del escenario' },
  { id:'r3', nombre:'Paola Justiniano', tel:'69088120', personas:2, fecha: diaMas(0), hora:'20:00', zona:'Salón', mesa:2, evento:'e1', estado:'pendiente', nota:'' },
  { id:'r4', nombre:'Ana Suárez', tel:'71122334', personas:3, fecha: diaMas(0), hora:'20:15', zona:'Salón', mesa:null, evento:'e1', estado:'pendiente', nota:'Sin mesa asignada todavía' },
  { id:'r5', nombre:'Lucía Vaca', tel:'70203040', personas:2, fecha: diaMas(0), hora:'10:30', zona:'Salón', mesa:6, evento:null, estado:'llego', nota:'' },
  { id:'r6', nombre:'Jorge Paz', tel:'77001122', personas:4, fecha: diaMas(4), hora:'20:15', zona:'Escenario', mesa:7, evento:'e3', estado:'confirmada', nota:'' },
];

/* Reserva visible en el mapa: hoy, activa, con mesa */
const reservaDeMesa = (n, reservas) => reservas.filter(r => r.fecha === hoyISO() && r.mesa === n && reservaActiva(r)).sort((a, b) => a.hora.localeCompare(b.hora))[0];

function Eventos({ eventos, setEventos, reservas, setReservas, mesas, setMesas, zonas, escenario, setEscenario, escenarioOn, aviso, registrar, irVenderEntrada, onLlego }) {
  const [tab, setTab] = useState('agenda');
  const [agendaVista, setAgendaVista] = useState('semana');
  const [evEdit, setEvEdit] = useState(null);
  const [resEdit, setResEdit] = useState(null);
  const [resDia, setResDia] = useState('hoy');
  const h = hoyISO();
  const evHoy = eventos.filter(e => e.fecha === h && e.estado !== 'borrador').sort((a, b) => a.hora.localeCompare(b.hora))[0];
  const proximos = [...eventos].sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
  const guardarEv = (ev, nuevo) => { setEventos(es => nuevo ? [...es, ev] : es.map(x => x.id === ev.id ? ev : x)); registrar(`${nuevo ? 'Creó' : 'Editó'} el evento "${ev.nombre}" (${fechaTxt(ev.fecha)})`); aviso(nuevo ? `Evento "${ev.nombre}" creado` : `Evento "${ev.nombre}" actualizado`); setEvEdit(null); };
  const borrarEv = ev => { setEventos(es => es.filter(x => x.id !== ev.id)); setReservas(rs => rs.map(r => r.evento === ev.id ? { ...r, evento:null } : r)); registrar(`Eliminó el evento "${ev.nombre}"`); aviso(`Evento "${ev.nombre}" eliminado`, 'trash'); setEvEdit(null); };
  const guardarRes = (r, nuevo) => { setReservas(rs => nuevo ? [...rs, r] : rs.map(x => x.id === r.id ? r : x)); registrar(`${nuevo ? 'Registró' : 'Editó'} la reserva de ${r.nombre} · ${r.personas} personas · ${fechaTxt(r.fecha)} ${r.hora}`); aviso(nuevo ? `Reserva de ${r.nombre} registrada` : `Reserva de ${r.nombre} actualizada`, 'cal'); setResEdit(null); };
  const estadoRes = (r, estado) => {
    if (estado === 'llego') { onLlego(r); return; }
    if (estado === 'cancelada') { const antes = r.estado; setReservas(rs => rs.map(x => x.id === r.id ? { ...x, estado } : x)); registrar(`Canceló la reserva de ${r.nombre}`); aviso(`Reserva de ${r.nombre} cancelada`, 'cal', () => setReservas(rs => rs.map(x => x.id === r.id ? { ...x, estado: antes } : x))); return; }
    setReservas(rs => rs.map(x => x.id === r.id ? { ...x, estado } : x));
    if (estado === 'llego' && r.mesa) setMesas(ms => ms.map(m => m.n === r.mesa && m.estado === 'libre' ? { ...m, estado:'ocupada', personas: r.personas, min:0 } : m));
    registrar(`Marcó la reserva de ${r.nombre} como "${RES_ESTADOS[estado].l}"`);
    aviso(estado === 'llego' ? `${r.nombre} llegó${r.mesa ? ` · Mesa ${r.mesa} ocupada` : ''}` : `Reserva de ${r.nombre}: ${RES_ESTADOS[estado].l.toLowerCase()}`, estado === 'llego' ? 'check' : 'cal');
  };
  const listaRes = reservas.filter(r => resDia === 'todas' ? r.fecha >= h : r.fecha === (resDia === 'hoy' ? h : diaMas(1))).sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
  const semana = Array.from({ length: 7 }, (_, i) => diaMas(i));
  const exportar = () => guardarExcel(nombreArchivo(NEGOCIO, 'eventos-y-reservas'), [
    { nombre:'Agenda', titulo:`${NEGOCIO} · Agenda de eventos`, sub: fechaTxt(hoyISO(), true), columnas:['Fecha', 'Hora', 'Evento', 'Artista', 'Género', 'Entrada', 'Consumo mínimo', 'Aforo', 'Lugares ocupados', 'Estado'],
      filas: proximos.map(e => [fechaTxt(e.fecha), `${e.hora} a ${e.fin}`, e.nombre, e.artista, e.genero, e.precio > 0 ? { bs: aC(e.precio) } : 'Libre', e.consumo > 0 ? { bs: aC(e.consumo) } : '', { int: e.aforo }, { int: ocupadosEvento(e, reservas) }, EV_ESTADOS[estadoEvento(e, reservas)].l]) },
    { nombre:'Reservas', titulo:'Reservas', columnas:['Fecha', 'Hora', 'A nombre de', 'Celular', 'Personas', 'Zona', 'Mesa', 'Evento', 'Estado', 'Nota'],
      filas: [...reservas].sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora)).map(r => [fechaTxt(r.fecha), r.hora, r.nombre, r.tel, { int: r.personas }, r.zona, r.mesa ? { int: r.mesa } : 'Sin mesa', (eventos.find(e => e.id === r.evento) || {}).nombre || '', RES_ESTADOS[r.estado].l, r.nota || '']) },
  ], aviso);

  return (<>
    {evHoy ? (() => {
      const oc = ocupadosEvento(evHoy, reservas); const est = estadoEvento(evHoy, reservas);
      return (
        <section className="ev-hero">
          <div className="ev-hero-txt">
            <div className="row" style={{ gap:8, flexWrap:'wrap' }}><span className="pill pill-gold"><Icon n="note" s={14} />Hoy · {evHoy.hora} a {evHoy.fin}</span><span className={'pill ' + EV_ESTADOS[est].cls}>{EV_ESTADOS[est].l}</span><span className="pill pill-gray">{evHoy.genero}</span></div>
            <h2 className="ev-name">{evHoy.nombre}</h2>
            <span className="ev-artist">{evHoy.artista}</span>
            <div className="ev-aforo num">
              <div className="between"><b>{oc} de {evHoy.aforo} lugares</b><span className="muted">{evHoy.vendidas} entradas · {oc - evHoy.vendidas} reservados</span></div>
              <div className="bar" style={{ height:10 }}><i style={{ width: Math.min(100, oc / evHoy.aforo * 100) + '%', background: oc >= evHoy.aforo ? 'var(--red)' : oc / evHoy.aforo >= .8 ? 'var(--gold)' : 'var(--green)' }} /></div>
            </div>
            <div className="row" style={{ flexWrap:'wrap' }}>
              {evHoy.precio > 0 && <button className="btn btn-primary" onClick={irVenderEntrada} disabled={oc >= evHoy.aforo}><Icon n="ticket" s={20} />Vender entrada · {bs(evHoy.precio)}</button>}
              <button className="btn btn-ghost" onClick={() => setResEdit({ nuevo:true, evento: evHoy.id, fecha: evHoy.fecha })}><Icon n="cal" s={20} />Nueva reserva</button>
              <button className="btn btn-ghost" onClick={() => setEvEdit(evHoy)}><Icon n="edit" s={18} />Editar</button>
            </div>
          </div>
          <div className="ev-stage">
            <div className="eyebrow" style={{ color:'inherit', opacity:.8 }}>Modo escenario</div>
            <p>A la hora del evento la pantalla pasa a un tema oscuro y cálido, más cómodo con poca luz, y muestra el aforo arriba.</p>
            <div className="seg seg-3 seg-stage" role="group" aria-label="Modo escenario">
              {[['auto','Automático'],['on','Activado'],['off','Apagado']].map(([k, l]) => <button key={k} aria-pressed={escenario === k} onClick={() => { setEscenario(k); aviso(k === 'on' ? 'Modo escenario activado' : k === 'off' ? 'Modo escenario apagado' : `Modo escenario automático: se activa a las ${evHoy.hora}`, 'note'); }}>{l}</button>)}
            </div>
            <span style={{ fontSize:13, opacity:.85 }}>{escenarioOn ? 'Activo ahora.' : escenario === 'auto' ? `Se activará solo a las ${restarMin(evHoy.hora, 30)}.` : 'Apagado.'}</span>
          </div>
        </section>
      );
    })() : (
      <div className="empty card" style={{ marginBottom:18 }}><span className="hand" style={{ fontSize:30 }}>Hoy no hay evento</span><span>Programa una noche de música, lectura o arte.</span><button className="btn btn-primary btn-sm" onClick={() => setEvEdit('nuevo')}><Icon n="plus" s={18} />Nuevo evento</button></div>
    )}

    <div className="page-head" style={{ marginTop:18 }}>
      <div className="tabs" role="group" aria-label="Sección">
        <button aria-pressed={tab === 'agenda'} onClick={() => setTab('agenda')}>Agenda</button>
        <button aria-pressed={tab === 'reservas'} onClick={() => setTab('reservas')}>Reservas · {reservas.filter(r => r.fecha === h && reservaActiva(r)).length} hoy</button>
      </div>
      {tab === 'agenda'
        ? <div className="row" style={{ flexWrap:'wrap' }}><div className="tabs" role="group" aria-label="Vista de agenda"><button aria-pressed={agendaVista === 'semana'} onClick={() => setAgendaVista('semana')}>Semana</button><button aria-pressed={agendaVista === 'lista'} onClick={() => setAgendaVista('lista')}>Lista</button></div><BotonExcel onExport={exportar} etiqueta="Exportar agenda" /><button className="btn btn-primary" onClick={() => setEvEdit('nuevo')}><Icon n="plus" s={20} />Nuevo evento</button></div>
        : <div className="row head-actions"><BotonExcel onExport={exportar} etiqueta="Exportar reservas" /><button className="btn btn-primary" onClick={() => setResEdit({ nuevo:true })}><Icon n="plus" s={20} />Nueva reserva</button></div>}
    </div>

    {tab === 'agenda' && agendaVista === 'semana' && (
      <div className="week">
        {semana.map((d, i) => {
          const evs = eventos.filter(e => e.fecha === d).sort((a, b) => a.hora.localeCompare(b.hora));
          const nRes = reservas.filter(r => r.fecha === d && reservaActiva(r)).length;
          return (
            <div key={d} className={'day' + (i === 0 ? ' today' : '')}>
              <div className="day-head"><span className="day-w">{i === 0 ? 'Hoy' : new Date(d + 'T12:00:00').toLocaleDateString('es-BO', { weekday:'short' })}</span><b className="num">{new Date(d + 'T12:00:00').getDate()}</b></div>
              {evs.map(e => { const est = estadoEvento(e, reservas); return (
                <button key={e.id} className={'ev-chip' + (e.estado === 'borrador' ? ' draft' : '')} onClick={() => setEvEdit(e)}>
                  <span className="num ev-chip-h">{e.hora}</span>
                  <span className="ev-chip-n">{e.nombre}</span>
                  <span className={'pill ' + EV_ESTADOS[est].cls}>{EV_ESTADOS[est].l}</span>
                </button>
              ); })}
              {nRes > 0 && <span className="day-res"><Icon n="cal" s={14} />{nRes} reserva{nRes > 1 ? 's' : ''}</span>}
              {!evs.length && !nRes && <span className="day-empty">Libre</span>}
            </div>
          );
        })}
      </div>
    )}

    {tab === 'agenda' && agendaVista === 'lista' && (
      <section className="card">
        <div className="plist">
          {proximos.map(e => {
            const oc = ocupadosEvento(e, reservas); const est = estadoEvento(e, reservas);
            return (
              <div className="evrow" key={e.id} style={est === 'finalizado' ? { opacity:.6 } : undefined}>
                <div className="ev-date num"><b>{new Date(e.fecha + 'T12:00:00').getDate()}</b><span>{new Date(e.fecha + 'T12:00:00').toLocaleDateString('es-BO', { month:'short' })}</span></div>
                <div style={{ minWidth:0 }}>
                  <b className="ev-row-name">{e.nombre}</b>
                  <div className="muted" style={{ fontSize:13.5 }}>{e.artista} · {fechaTxt(e.fecha)} · {e.hora} a {e.fin} · {e.genero}</div>
                </div>
                <div className="ev-row-meta num"><span>{e.precio > 0 ? bs(e.precio) : 'Entrada libre'}{e.consumo > 0 ? ` · mín. ${bs(e.consumo)}` : ''}</span><span className="muted">{oc} de {e.aforo} lugares</span></div>
                <span className={'pill ' + EV_ESTADOS[est].cls}>{EV_ESTADOS[est].l}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setEvEdit(e)}><Icon n="edit" s={18} />Editar</button>
              </div>
            );
          })}
        </div>
      </section>
    )}

    {tab === 'reservas' && (
      <section className="card">
        <div className="tabs" role="group" aria-label="Día" style={{ marginBottom:10 }}>
          {[['hoy','Hoy'],['manana','Mañana'],['todas','Próximas']].map(([k, l]) => <button key={k} aria-pressed={resDia === k} onClick={() => setResDia(k)}>{l}</button>)}
        </div>
        {listaRes.length ? listaRes.map(r => {
          const ev = eventos.find(e => e.id === r.evento);
          return (
            <div className="resrow" key={r.id}>
              <div className="res-h num"><b>{r.hora}</b>{resDia === 'todas' && <span>{fechaTxt(r.fecha)}</span>}</div>
              <div style={{ minWidth:0 }}>
                <b>{r.nombre}</b> <span className="muted num">· {r.personas} personas</span>
                <div className="muted num" style={{ fontSize:13 }}>{r.mesa ? `Mesa ${r.mesa} · ${r.zona}` : `${r.zona} · sin mesa`}{ev ? ` · ${ev.nombre}` : ''} · {r.tel}</div>
                {r.nota && <span className="item-note" style={{ display:'inline-block', marginTop:4 }}>{r.nota}</span>}
              </div>
              <span className={'pill ' + RES_ESTADOS[r.estado].cls}>{RES_ESTADOS[r.estado].l}</span>
              <div className="res-actions">
                {r.estado === 'pendiente' && <button className="btn btn-ghost btn-sm" onClick={() => estadoRes(r, 'confirmada')}>Confirmar</button>}
                {reservaActiva(r) && r.fecha === h && <button className="btn btn-primary btn-sm" onClick={() => estadoRes(r, 'llego')}><Icon n="check" s={17} />Llegó</button>}
                {reservaActiva(r) && r.fecha === h && <button className="btn btn-ghost btn-sm" onClick={() => estadoRes(r, 'novino')}>No vino</button>}
                {reservaActiva(r) && <button className="icon-btn" style={{ width:44, height:44 }} onClick={() => setResEdit(r)} aria-label={`Editar reserva de ${r.nombre}`}><Icon n="edit" s={17} /></button>}
                {reservaActiva(r) && <button className="icon-btn" style={{ width:44, height:44 }} onClick={() => estadoRes(r, 'cancelada')} aria-label={`Cancelar reserva de ${r.nombre}`}><Icon n="x" s={17} /></button>}
              </div>
            </div>
          );
        }) : <div className="empty"><Icon n="cal" s={34} w={1.5} /><b>Sin reservas {resDia === 'hoy' ? 'para hoy' : resDia === 'manana' ? 'para mañana' : 'próximas'}</b><button className="btn btn-ghost btn-sm" onClick={() => setResEdit({ nuevo:true })}>Registrar una reserva</button></div>}
      </section>
    )}

    {evEdit && <EventoForm inicial={evEdit === 'nuevo' ? null : evEdit} reservas={reservas} onSave={guardarEv} onDelete={borrarEv} onClose={() => setEvEdit(null)} />}
    {resEdit && <ReservaForm inicial={resEdit.nuevo ? null : resEdit} pre={resEdit.nuevo ? resEdit : {}} eventos={eventos} reservas={reservas} mesas={mesas} zonas={zonas} onSave={guardarRes} onClose={() => setResEdit(null)} />}
  </>);
}
const restarMin = (hm, m) => { const [a, b] = hm.split(':').map(Number); const t = a * 60 + b - m; return `${String(Math.floor(((t % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(((t % 60) + 60) % 60).padStart(2, '0')}`; };

function EventoForm({ inicial, reservas, onSave, onDelete, onClose }) {
  const nuevo = !inicial;
  const [f, setF] = useState(inicial ? { ...inicial, precio: String(inicial.precio), consumo: String(inicial.consumo || ''), aforo: String(inicial.aforo), pagada: inicial.precio > 0 } : { id:'e' + Date.now(), nombre:'', artista:'', fecha: diaMas(7), hora:'20:00', fin:'22:30', genero:'Jazz y blues', aforo:'40', precio:'25', pagada:true, consumo:'', estado:'borrador', vendidas:0, desc:'', foto:null });
  const [err, setErr] = useState({});
  const [borrar, setBorrar] = useState(false);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  useEscape(onClose);
  const ocupados = inicial ? ocupadosEvento(inicial, reservas) : 0;
  const enviar = e => {
    e.preventDefault();
    const er = {};
    if (!f.nombre.trim()) er.nombre = 'Escribe el nombre del evento.';
    if (!f.fecha) er.fecha = 'Elige la fecha.';
    else if (nuevo && f.fecha < hoyISO()) er.fecha = 'La fecha ya pasó. Elige hoy o un día futuro.';
    if (!f.hora || !f.fin) er.hora = 'Indica la hora de inicio y de fin.';
    else if (f.fin <= f.hora) er.hora = 'La hora de fin debe ser después del inicio.';
    const aforo = parseInt(f.aforo, 10);
    if (!(aforo > 0)) er.aforo = 'El aforo debe ser mayor a 0.';
    else if (aforo < ocupados) er.aforo = `Ya hay ${ocupados} lugares ocupados. El aforo no puede ser menor.`;
    const precio = f.pagada ? Number(String(f.precio).replace(',', '.')) : 0;
    if (f.pagada && !(precio > 0)) er.precio = 'Escribe el precio de la entrada.';
    if (FISCAL.simplificado && precio > FISCAL.pmax) er.precio = `Supera el precio unitario máximo del RTS (Bs ${FISCAL.pmax}).`;
    setErr(er);
    if (Object.keys(er).length) return;
    const { pagada, ...rest } = f;
    onSave({ ...rest, nombre: f.nombre.trim(), artista: f.artista.trim(), aforo, precio: r2(precio), consumo: r2(Number(String(f.consumo).replace(',', '.')) || 0) }, nuevo);
  };
  const subirFoto = e => { const file = e.target.files && e.target.files[0]; if (file) leerImagen(file, 640, url => set('foto', url)); };
  return (
    <div className="scrim" onClick={onClose}>
      <form className="modal modal-lg" role="dialog" aria-modal="true" aria-labelledby="ef-t" onClick={e => e.stopPropagation()} onSubmit={enviar} noValidate>
        <div className="between">
          <div><div className="eyebrow">{nuevo ? 'Nuevo evento' : 'Editar evento'}</div><h2 id="ef-t" className="hand" style={{ fontSize:32 }}>{f.nombre.trim() || 'Nombre del evento'}</h2></div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icon n="x" s={20} /></button>
        </div>
        <div className="form-grid">
          <label className="field span-2">Nombre del evento<input id="ef-nombre" className="input" value={f.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Ej. Noche de jazz y blues" aria-invalid={!!err.nombre} />{err.nombre && <span className="err">{err.nombre}</span>}</label>
          <label className="field">Artista o invitado<input id="ef-artista" className="input" value={f.artista} onChange={e => set('artista', e.target.value)} placeholder="Ej. Aldo Franco" /></label>
          <label className="field">Género<select id="ef-genero" className="input" value={f.genero} onChange={e => set('genero', e.target.value)}>{GENEROS.map(g => <option key={g}>{g}</option>)}</select></label>
          <label className="field">Fecha<input id="ef-fecha" className="input" type="date" value={f.fecha} onChange={e => set('fecha', e.target.value)} aria-invalid={!!err.fecha} />{err.fecha && <span className="err">{err.fecha}</span>}</label>
          <div className="field">Horario
            <div className="row"><input id="ef-hora" className="input num" type="time" value={f.hora} onChange={e => set('hora', e.target.value)} aria-label="Hora de inicio" aria-invalid={!!err.hora} /><span className="muted">a</span><input id="ef-fin" className="input num" type="time" value={f.fin} onChange={e => set('fin', e.target.value)} aria-label="Hora de fin" aria-invalid={!!err.hora} /></div>
            {err.hora && <span className="err">{err.hora}</span>}
          </div>
          <label className="field">Aforo (personas)<input id="ef-aforo" className="input num" type="number" min="1" value={f.aforo} onChange={e => set('aforo', e.target.value)} aria-invalid={!!err.aforo} />{err.aforo && <span className="err">{err.aforo}</span>}{!err.aforo && inicial && <span style={{ fontWeight:500 }}>{ocupados} lugares ocupados ({inicial.vendidas} entradas vendidas)</span>}</label>
          <div className="field">Entrada
            <div className="tabs" role="group" aria-label="Tipo de entrada"><button type="button" aria-pressed={!f.pagada} onClick={() => set('pagada', false)}>Libre</button><button type="button" aria-pressed={f.pagada} onClick={() => set('pagada', true)}>Con precio</button></div>
            {f.pagada && <div className="input-pre"><span>Bs</span><input id="ef-precio" className="input num" inputMode="decimal" value={f.precio} onChange={e => set('precio', e.target.value)} aria-invalid={!!err.precio} /></div>}
            {err.precio && <span className="err">{err.precio}</span>}
          </div>
          <label className="field">Consumo mínimo <span className="opt">opcional</span><div className="input-pre"><span>Bs</span><input id="ef-consumo" className="input num" inputMode="decimal" value={f.consumo} onChange={e => set('consumo', e.target.value)} placeholder="0" /></div></label>
          <div className="field">Estado
            <div className="tabs" role="group" aria-label="Estado"><button type="button" aria-pressed={f.estado === 'borrador'} onClick={() => set('estado', 'borrador')}>Borrador</button><button type="button" aria-pressed={f.estado === 'publicado'} onClick={() => set('estado', 'publicado')}>Publicado</button></div>
            <span style={{ fontWeight:500 }}>{f.estado === 'borrador' ? 'No se venden entradas ni aparece en la barra superior.' : 'Se venden entradas en caja y se aceptan reservas.'}</span>
          </div>
          <label className="field span-2">Descripción <span className="opt">opcional</span><textarea id="ef-desc" className="input" rows={2} value={f.desc} onChange={e => set('desc', e.target.value)} placeholder="Qué va a pasar esa noche" /></label>
          <div className="field span-2">Foto o afiche <span className="opt">opcional</span>
            <div className="row" style={{ flexWrap:'wrap' }}>
              {f.foto && <img src={f.foto} alt="" style={{ width:64, height:64, objectFit:'cover', borderRadius:12 }} />}
              <label className="btn btn-ghost btn-sm" style={{ cursor:'pointer' }}><Icon n="camera" s={18} />{f.foto ? 'Cambiar' : 'Subir imagen'}<input id="ef-foto" type="file" accept="image/*" onChange={subirFoto} style={{ display:'none' }} /></label>
              {f.foto && <button type="button" className="btn btn-ghost btn-sm" onClick={() => set('foto', null)}>Quitar</button>}
            </div>
          </div>
        </div>
        {borrar ? (
          <div className="confirm">
            {inicial.vendidas > 0
              ? (<><b>No se puede eliminar "{inicial.nombre}"</b><span>Ya se vendieron {inicial.vendidas} entradas. Pásalo a Borrador para dejar de venderlo.</span><div className="row"><button type="button" className="btn btn-ghost" style={{ flex:1 }} onClick={() => setBorrar(false)}>Entendido</button></div></>)
              : (<><b>¿Eliminar "{inicial.nombre}"?</b><span>Las reservas de ese día se conservan, pero ya no estarán ligadas al evento.</span><div className="row"><button type="button" className="btn btn-ghost" style={{ flex:1 }} onClick={() => setBorrar(false)}>Cancelar</button><button type="button" className="btn btn-danger" style={{ flex:1 }} onClick={() => onDelete(inicial)}>Sí, eliminar</button></div></>)}
          </div>
        ) : (
          <div className="form-actions">
            {!nuevo && <button type="button" className="btn btn-ghost danger-text" onClick={() => setBorrar(true)}><Icon n="trash" s={18} />Eliminar</button>}
            <span style={{ flex:1 }} />
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary">{nuevo ? 'Crear evento' : 'Guardar cambios'}</button>
          </div>
        )}
      </form>
    </div>
  );
}

function ReservaForm({ inicial, pre, eventos, reservas, mesas, zonas, onSave, onClose }) {
  const nuevo = !inicial;
  const [f, setF] = useState(inicial ? { ...inicial } : { id:'r' + Date.now(), nombre:'', tel:'', personas:2, fecha: pre.fecha || hoyISO(), hora: '20:00', zona: zonas[0], mesa:null, evento: pre.evento || null, estado:'confirmada', nota:'' });
  const [err, setErr] = useState({});
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  useEscape(onClose);
  const evDia = eventos.find(e => e.fecha === f.fecha && e.estado === 'publicado');
  useEffect(() => { setF(x => ({ ...x, evento: evDia ? evDia.id : null })); }, [f.fecha]);
  const mesasZona = mesas.filter(m => m.zona === f.zona);
  const choque = m => reservas.some(r => r.id !== f.id && r.fecha === f.fecha && r.mesa === m.n && reservaActiva(r) && Math.abs(minutos(r.hora) - minutos(f.hora)) < 120);
  const ev = eventos.find(e => e.id === f.evento);
  const libres = ev ? ev.aforo - ocupadosEvento(ev, reservas.filter(r => r.id !== f.id)) : null;
  const enviar = e => {
    e.preventDefault();
    const er = {};
    if (!f.nombre.trim()) er.nombre = 'Escribe a nombre de quién es la reserva.';
    if (!/^[67]\d{7}$/.test(f.tel.replace(/\s/g, ''))) er.tel = 'Usa un celular boliviano de 8 dígitos que empiece con 6 o 7.';
    if (!f.fecha) er.fecha = 'Elige la fecha.';
    else if (f.fecha < hoyISO()) er.fecha = 'La fecha ya pasó.';
    if (!f.hora) er.fecha = 'Elige la hora.';
    if (f.mesa) { const m = mesas.find(x => x.n === f.mesa); if (m && choque(m)) er.mesa = `La Mesa ${m.n} ya tiene una reserva cerca de esa hora. Elige otra o deja sin mesa.`; }
    if (ev && libres !== null && f.personas > libres) er.personas = `Solo quedan ${Math.max(0, libres)} lugares para "${ev.nombre}".`;
    setErr(er);
    if (Object.keys(er).length) return;
    onSave({ ...f, nombre: f.nombre.trim(), tel: f.tel.replace(/\s/g, ''), nota: f.nota.trim() }, nuevo);
  };
  return (
    <div className="scrim" onClick={onClose}>
      <form className="modal modal-lg" role="dialog" aria-modal="true" aria-labelledby="rv-t" onClick={e => e.stopPropagation()} onSubmit={enviar} noValidate>
        <div className="between">
          <div><div className="eyebrow">{nuevo ? 'Nueva reserva' : 'Editar reserva'}</div><h2 id="rv-t" style={{ fontSize:24 }}>{f.nombre.trim() || 'Reserva'}</h2></div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icon n="x" s={20} /></button>
        </div>
        <div className="form-grid">
          <label className="field">A nombre de<input id="rv-nombre" className="input" value={f.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Ej. Familia Rivero" aria-invalid={!!err.nombre} />{err.nombre && <span className="err">{err.nombre}</span>}</label>
          <label className="field">Celular<input id="rv-tel" className="input num" inputMode="tel" value={f.tel} onChange={e => set('tel', e.target.value)} placeholder="Ej. 70012345" aria-invalid={!!err.tel} />{err.tel && <span className="err">{err.tel}</span>}</label>
          <label className="field">Fecha<input id="rv-fecha" className="input" type="date" value={f.fecha} onChange={e => set('fecha', e.target.value)} aria-invalid={!!err.fecha} />{err.fecha && <span className="err">{err.fecha}</span>}</label>
          <label className="field">Hora<input id="rv-hora" className="input num" type="time" value={f.hora} onChange={e => set('hora', e.target.value)} /></label>
          <div className="field">Personas
            <div className="stepper" style={{ gridColumn:'auto' }}><button type="button" onClick={() => set('personas', Math.max(1, f.personas - 1))} aria-label="Menos personas"><Icon n="minus" s={18} /></button><span className="num">{f.personas}</span><button type="button" onClick={() => set('personas', Math.min(30, f.personas + 1))} aria-label="Más personas"><Icon n="plus" s={18} /></button></div>
            {err.personas && <span className="err">{err.personas}</span>}
          </div>
          <div className="field">Estado
            <div className="tabs" role="group" aria-label="Estado"><button type="button" aria-pressed={f.estado === 'pendiente'} onClick={() => set('estado', 'pendiente')}>Pendiente</button><button type="button" aria-pressed={f.estado === 'confirmada'} onClick={() => set('estado', 'confirmada')}>Confirmada</button></div>
          </div>
          {ev ? <div className="span-2 fiscal-note" style={{ background:'var(--gold-soft)', color:'var(--gold-text)' }}><Icon n="note" s={18} /><span>Ese día hay "{ev.nombre}" a las {ev.hora}. Quedan {Math.max(0, libres)} de {ev.aforo} lugares{ev.consumo > 0 ? ` · consumo mínimo ${bs(ev.consumo)}` : ''}{ev.precio > 0 ? ` · entrada ${bs(ev.precio)} por persona, se suma a la cuenta de la mesa al llegar` : ''}.</span></div> : null}
          <label className="field">Zona<select id="rv-zona" className="input" value={f.zona} onChange={e => { set('zona', e.target.value); set('mesa', null); }}>{zonas.map(z => <option key={z}>{z}</option>)}</select></label>
          <div className="field span-2">Mesa <span className="opt">opcional</span>
            <div className="mesa-chips">
              <button type="button" className="mesa-chip" style={{ fontSize:13 }} aria-pressed={!f.mesa} onClick={() => set('mesa', null)}>Sin mesa</button>
              {mesasZona.map(m => { const c = choque(m); const chica = m.sillas < f.personas; return (
                <button type="button" key={m.n} className="mesa-chip num" aria-pressed={f.mesa === m.n} onClick={() => set('mesa', m.n)} title={c ? 'Ya reservada cerca de esa hora' : chica ? `Tiene ${m.sillas} sillas` : ''} style={c || chica ? { opacity:.5 } : undefined}>{m.n}<span style={{ fontSize:13, fontWeight:600, display:'block', color:'var(--muted)' }}>{m.sillas} sillas</span></button>
              ); })}
            </div>
            {err.mesa && <span className="err">{err.mesa}</span>}
            {!err.mesa && f.mesa && mesas.find(m => m.n === f.mesa).sillas < f.personas && <span style={{ fontWeight:600, color:'var(--gold-text)' }}>La Mesa {f.mesa} tiene {mesas.find(m => m.n === f.mesa).sillas} sillas para {f.personas} personas. Agrega sillas o junta mesas.</span>}
          </div>
          <label className="field span-2">Nota <span className="opt">opcional</span><input id="rv-nota" className="input" value={f.nota} onChange={e => set('nota', e.target.value)} placeholder="Ej. cumpleaños, cerca del escenario" /></label>
        </div>
        <div className="form-actions"><span style={{ flex:1 }} /><button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button><button type="submit" className="btn btn-primary">{nuevo ? 'Registrar reserva' : 'Guardar cambios'}</button></div>
      </form>
    </div>
  );
}
const minutos = hm => { const [a, b] = (hm || '0:0').split(':').map(Number); return a * 60 + b; };

/* ============ 2. Mesas ============ */
function MesaDibujo({ m }) {
  const e = ESTADO_MESA[m.estado];
  const n = m.sillas, larga = n >= 5;
  const sillas = [];
  if (larga) { const top = Math.ceil(n / 2), bot = n - top; const pos = (k, i) => 16 + (88 / k) * (i + .5); for (let i = 0; i < top; i++) sillas.push([pos(top, i), 14]); for (let i = 0; i < bot; i++) sillas.push([pos(bot, i), 86]); }
  else for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / n; sillas.push([60 + 40 * Math.cos(a), 50 + 36 * Math.sin(a)]); }
  const w = larga ? Math.min(18, 88 / Math.ceil(n / 2) - 3) : 18;
  return (
    <svg viewBox="0 0 120 100" aria-hidden="true">
      {sillas.map(([x, y], i) => <rect key={i} x={x - w / 2} y={y - 7} width={w} height="14" rx="5" style={{ fill: m.estado === 'libre' ? 'var(--line)' : e.c }} opacity={m.estado === 'libre' ? 1 : .55} />)}
      {larga ? <rect x="16" y="26" width="88" height="48" rx="14" style={{ fill:e.soft, stroke:e.c }} strokeWidth="2.5" />
             : <circle cx="60" cy="50" r="28" style={{ fill:e.soft, stroke:e.c }} strokeWidth="2.5" />}
      <text x="60" y="58" textAnchor="middle" style={{ fill:'var(--ink)', fontFamily:'var(--f-display)', fontWeight:800, fontSize:24 }}>{m.n}</text>
    </svg>
  );
}
const MOTIVOS_ANULAR = ['Error al tomar el pedido', 'El cliente cambió de opinión', 'Producto mal preparado', 'Demora en la entrega', 'Otro'];
function Mesas({ mesas, setMesas, zonas, onEditar, cobrarMesa, tomarPedido, aviso, puedeCobrar, cajaAbierta, pedirAuth, registrar, reservas = [], onLlego, llamadas = [], onQR }) {
  const vis = x => { const r = x.estado === 'libre' && reservaDeMesa(x.n, reservas); return r ? { ...x, estado:'reservada', res:r } : x; };
  const [sel, setSel] = useState(null);
  const [panel, setPanel] = useState(null);
  const [destino, setDestino] = useState(null);
  const [anula, setAnula] = useState(null);
  const m = mesas.find(x => x.n === sel);
  const cuenta = k => mesas.map(vis).filter(x => x.estado === k).length;
  const cerrar = () => { setSel(null); setPanel(null); setDestino(null); setAnula(null); };
  const mres = m && vis(m).res;
  const pedirCuenta = () => { setMesas(ms => ms.map(x => x.n === m.n ? { ...x, estado:'cobrar' } : x)); aviso(`Mesa ${m.n} pidió la cuenta`, 'bell'); cerrar(); };
  const moverJuntar = () => {
    const d = mesas.find(x => x.n === destino); if (!d) return;
    const juntar = d.estado !== 'libre' || d.items.length;
    setMesas(ms => ms.map(x => {
      if (x.n === m.n) return { ...x, estado:'libre', items:[], personas:0, min:0, pagadoC:0, split:null };
      if (x.n === d.n) return juntar
        ? { ...x, items: mezclar(x.items, m.items), personas:(x.personas || 0) + (m.personas || 0), min: Math.max(x.min || 0, m.min || 0), pagadoC: (x.pagadoC || 0) + (m.pagadoC || 0), split:null, estado: x.estado === 'cobrar' || m.estado === 'cobrar' ? 'cobrar' : 'ocupada' }
        : { ...x, items: m.items, personas: m.personas, min: m.min, pagadoC: m.pagadoC || 0, split: m.split || null, estado: m.estado };
      return x;
    }));
    registrar(juntar ? `Juntó la Mesa ${m.n} con la Mesa ${d.n}` : `Movió la cuenta de la Mesa ${m.n} a la Mesa ${d.n}`);
    aviso(juntar ? `Mesa ${m.n} juntada con la Mesa ${d.n}` : `Cuenta movida a la Mesa ${d.n}. La Mesa ${m.n} quedó libre.`);
    setSel(d.n); setPanel(null); setDestino(null);
  };
  const confirmarAnular = () => {
    const it = m.items.find(x => x.key === anula.key); if (!it) return;
    const nombre = P[it.id].nombre;
    pedirAuth('anular', `Anular ${anula.q}× ${nombre}`, quien => {
      setMesas(ms => ms.map(x => x.n !== m.n ? x : { ...x, items: x.items.flatMap(y => y.key !== it.key ? [y] : y.q - anula.q > 0 ? [{ ...y, q: y.q - anula.q }] : []) }));
      registrar(`Anuló ${anula.q}× ${nombre} de la Mesa ${m.n} · ${anula.motivo}${quien ? ' · autorizado por ' + quien : ''}`);
      aviso(`${anula.q}× ${nombre} anulado en la Mesa ${m.n}`, 'trash');
      setAnula(null);
    });
  };
  const saldo = m ? (totalC(m.items) - (m.pagadoC || 0)) / 100 : 0;
  return (<>
    <div className="page-head">
      <div className="legend">
        {Object.entries(ESTADO_MESA).map(([k, e]) => <span key={k} className={'pill ' + e.cls} style={{ fontSize:14, padding:'7px 14px' }}><i className="dot" style={{ background:e.c }} />{e.label} · {cuenta(k)}</span>)}
      </div>
      <div className="row head-actions">{onQR && <button className="btn btn-ghost" onClick={onQR}><Icon n="qr" s={19} />Códigos QR</button>}{onEditar ? <button className="btn btn-ghost" onClick={onEditar}><Icon n="gear" s={19} />Editar mesas y zonas</button> : <span className="muted">Toca una mesa para ver su cuenta</span>}</div>
    </div>
    {zonas.filter(z => mesas.some(x => x.zona === z)).map(z => (
      <section className="zone" key={z}>
        <div className="zone-head"><h2>{z}</h2><span className="muted">{mesas.filter(x => x.zona === z).length} mesas{z === 'Escenario' ? ' · frente a la música en vivo' : ''} · {mesas.filter(x => x.zona === z).reduce((s, x) => s + x.sillas, 0)} sillas</span></div>
        <div className="mesas">
          {mesas.filter(x => x.zona === z).map(x0 => {
            const x = vis(x0);
            const e = ESTADO_MESA[x.estado];
            const sx = (totalC(x.items) - (x.pagadoC || 0)) / 100;
            return (
              <button key={x.n} className={'mesa' + (llamadas.some(l => l.mesa === x.n && l.estado === 'pendiente') ? ' llama' : '')} onClick={() => setSel(x.n)} aria-label={`Mesa ${x.n}, ${e.label}${llamadas.some(l => l.mesa === x.n && l.estado === 'pendiente') ? ', llama al mesero' : ''}`}>
                {llamadas.some(l => l.mesa === x.n && l.estado === 'pendiente') && <span className="mesa-llama"><Icon n="bell" s={15} />{llamadas.find(l => l.mesa === x.n && l.estado === 'pendiente').tipo === 'cuenta' ? 'Pide la cuenta' : 'Llama'}</span>}
                <MesaDibujo m={x} />
                <div className="between"><span className={'pill ' + e.cls}>{e.label}</span><b className="num">{x.items.length ? bs(sx) : '—'}</b></div>
                <div className="mesa-meta num">
                  <span>{x.estado === 'reservada' ? `${x.res.nombre} · ${x.res.personas}` : x.estado === 'libre' ? `${x.sillas} sillas` : x.pagadoC > 0 ? `Pagado ${bsC(x.pagadoC)}` : `${x.personas} personas`}</span>
                  {x.estado === 'reservada' ? <span className="row" style={{ gap:4, color:'var(--blue-text)', fontWeight:700 }}><Icon n="cal" s={15} />{x.res.hora}</span> : x.estado !== 'libre' && <span className="row" style={{ gap:4 }}><Icon n="clock" s={15} />{x.min} min</span>}
                </div>
              </button>
            );
          })}
        </div>
      </section>
    ))}
    {m && (
      <div className="scrim" onClick={cerrar}>
        <div className="modal" style={{ maxWidth:600 }} role="dialog" aria-modal="true" aria-labelledby="mesa-t" onClick={e => e.stopPropagation()}>
          <div className="between">
            <div><div className="eyebrow">{m.zona} · {m.sillas} sillas{m.personas ? ` · ${m.personas} personas` : ''}</div><h2 id="mesa-t" style={{ fontSize:28 }}>Mesa {m.n}</h2></div>
            <div className="row"><span className={'pill ' + ESTADO_MESA[m.estado].cls}>{ESTADO_MESA[m.estado].label}</span><button className="icon-btn" onClick={cerrar} aria-label="Cerrar"><Icon n="x" s={20} /></button></div>
          </div>
          {m.items.length ? (<div>
            {m.items.map(it => (
              <div key={it.key}>
                <div className="kv num" style={{ alignItems:'flex-start' }}>
                  <span style={{ minWidth:0 }}><b>{it.q}×</b> {P[it.id].nombre}
                    {modsTxt(it) && <span className="muted" style={{ display:'block', fontSize:13 }}>{modsTxt(it)}</span>}
                    {it.nota && <span className="item-note" style={{ display:'inline-block', marginTop:4 }}>{it.nota}</span>}
                  </span>
                  <span className="row" style={{ gap:6 }}>{bs(lineUnit(it) * it.q)}<button className="icon-btn" style={{ width:40, height:40 }} onClick={() => setAnula({ key: it.key, q: 1, motivo: MOTIVOS_ANULAR[0] })} aria-label={`Anular ${P[it.id].nombre}`}><Icon n="trash" s={16} /></button></span>
                </div>
                {anula && anula.key === it.key && (
                  <div className="confirm" style={{ margin:'4px 0 10px' }}>
                    <b>Anular {P[it.id].nombre}</b>
                    <div className="row" style={{ flexWrap:'wrap', gap:10 }}>
                      {it.q > 1 && <div className="stepper" style={{ gridColumn:'auto' }}><button onClick={() => setAnula(a => ({ ...a, q: Math.max(1, a.q - 1) }))} aria-label="Menos"><Icon n="minus" s={16} /></button><span className="num">{anula.q}</span><button onClick={() => setAnula(a => ({ ...a, q: Math.min(it.q, a.q + 1) }))} aria-label="Más"><Icon n="plus" s={16} /></button></div>}
                      <select id="anula-motivo" className="input" style={{ flex:'1 1 200px', minHeight:44 }} value={anula.motivo} onChange={e => setAnula(a => ({ ...a, motivo: e.target.value }))} aria-label="Motivo">{MOTIVOS_ANULAR.map(x => <option key={x}>{x}</option>)}</select>
                    </div>
                    <span style={{ color:'var(--muted)' }}>Queda registrado en Actividad con el motivo y quién lo autorizó.</span>
                    <div className="row"><button className="btn btn-ghost btn-sm" style={{ flex:1 }} onClick={() => setAnula(null)}>Cancelar</button><button className="btn btn-danger btn-sm" style={{ flex:1 }} onClick={confirmarAnular}>Anular {anula.q}</button></div>
                  </div>
                )}
              </div>
            ))}
            {m.pagadoC > 0 && <div className="kv num"><span className="muted">Ya pagado{m.split ? ` · ${m.split.pagadas} de ${m.split.n} partes` : ''}</span><span>− {bsC(m.pagadoC)}</span></div>}
            <div className="tot-big" style={{ paddingTop:12 }}><span className="muted" style={{ fontWeight:700 }}>{m.pagadoC > 0 ? 'Saldo' : 'Total de la mesa'}</span><strong className="num">{bs(saldo)}</strong></div>
          </div>) : mres ? (
            <div className="desc-box" style={{ background:'var(--blue-soft)' }}>
              <span className="row" style={{ gap:8, color:'var(--blue-text)', fontWeight:700 }}><Icon n="cal" s={18} />Reservada a las {mres.hora}</span>
              <b style={{ fontSize:17 }}>{mres.nombre} · {mres.personas} personas</b>
              <span className="muted num">{mres.tel}{mres.nota ? ` · ${mres.nota}` : ''}</span>
              <button className="btn btn-primary" onClick={() => { onLlego(mres); }}><Icon n="check" s={20} />Llegó · ocupar mesa</button>
            </div>
          ) : <div className="empty"><Icon n="mesas" s={36} w={1.5} /><b>Mesa libre</b><span>Lista para recibir clientes.</span></div>}

          {panel === 'mover' ? (
            <div className="desc-box">
              <b>Mover o juntar la Mesa {m.n}</b>
              <span className="muted" style={{ fontSize:13.5 }}>Una mesa libre recibe la cuenta completa. Una ocupada se junta con esta.</span>
              <div className="mesa-chips">
                {mesas.filter(x => x.n !== m.n).map(x => <button key={x.n} className="mesa-chip num" aria-pressed={destino === x.n} onClick={() => setDestino(x.n)} aria-label={`Mesa ${x.n}, ${ESTADO_MESA[x.estado].label}`}>{x.n}<i className="dot" style={{ background: ESTADO_MESA[x.estado].c }} /></button>)}
              </div>
              <div className="row"><button className="btn btn-ghost btn-sm" style={{ flex:1 }} onClick={() => { setPanel(null); setDestino(null); }}>Cancelar</button>
                <button className="btn btn-primary btn-sm" style={{ flex:1.4 }} disabled={!destino} onClick={moverJuntar}>{!destino ? 'Elige una mesa' : (mesas.find(x => x.n === destino).estado === 'libre' ? `Mover a la Mesa ${destino}` : `Juntar con la Mesa ${destino}`)}</button></div>
            </div>
          ) : (
            <div className="row" style={{ flexWrap:'wrap' }}>
              <button className="btn btn-ghost" style={{ flex:'1 1 150px' }} onClick={() => tomarPedido(m.n)}><Icon n="plus" s={20} />{m.items.length ? 'Agregar al pedido' : 'Tomar pedido'}</button>
              {m.estado === 'ocupada' && <button className="btn btn-ghost" style={{ flex:'1 1 150px' }} onClick={pedirCuenta}><Icon n="bell" s={20} />Pidió la cuenta</button>}
              {m.items.length > 0 && <button className="btn btn-ghost" style={{ flex:'1 1 150px' }} onClick={() => setPanel('mover')}><Icon n="arrow" s={20} />Mover o juntar</button>}
            </div>
          )}
          {m.items.length > 0 && puedeCobrar && (cajaAbierta ? (
            <div className="foot-actions two">
              <button className="btn btn-ghost" onClick={() => { const mm = m; cerrar(); cobrarMesa(mm, 'partes'); }}><Icon n="usuarios" s={20} />Dividir</button>
              <button className="btn btn-primary btn-cobrar" onClick={() => { const mm = m; cerrar(); cobrarMesa(mm); }}><span>Cobrar</span><span className="num">{bs(saldo)}</span></button>
            </div>
          ) : <div className="fiscal-warn"><Icon n="lock" s={20} /><span>La caja está cerrada. Ábrela en Caja para cobrar.</span></div>)}
        </div>
      </div>
    )}
  </>);
}

/* ============ 5. Cocina y barra ============ */
const COLS = [
  { id:'recibido', label:'Recibido', icon:'inbox', c:'var(--blue)', pill:'pill-blue' },
  { id:'prep', label:'En preparación', icon:'flame', c:'var(--gold)', pill:'pill-gold' },
  { id:'listo', label:'Listo', icon:'check', c:'var(--green)', pill:'pill-green' },
  { id:'camino', label:'En camino', icon:'moto', c:'var(--red)', pill:'pill-red' },
];
function Cocina({ pedidos, setPedidos, now, aviso, sonido, setSonido }) {
  const [vistaK, setVistaK] = useState('pedido');
  const avanzarSiCompleto = ps => ps.map(p => (p.estado === 'recibido' || p.estado === 'prep') && p.items.length && p.items.every(i => i.listo) ? { ...p, estado:'listo', auto:true } : p);
  const mover = (no, estado, msg) => { setPedidos(ps => ps.map(p => p.no === no ? { ...p, estado, items: estado === 'listo' ? p.items.map(i => ({ ...i, listo:true })) : p.items } : p)); if (msg) aviso(msg); };
  const toggleItem = (no, key) => {
    let completo = null;
    setPedidos(ps => {
      const r = ps.map(p => p.no !== no ? p : { ...p, estado: p.estado === 'recibido' ? 'prep' : p.estado, items: p.items.map(i => i.key === key ? { ...i, listo: !i.listo } : i) });
      const f = avanzarSiCompleto(r);
      const ped = f.find(p => p.no === no); if (ped && ped.estado === 'listo') completo = ped;
      return f;
    });
    setTimeout(() => completo && aviso(`Pedido N° ${completo.no} listo · ${completo.origen}`), 0);
  };
  const marcarGrupo = g => {
    setPedidos(ps => avanzarSiCompleto(ps.map(p => !g.nos.includes(p.no) ? p : { ...p, estado: p.estado === 'recibido' ? 'prep' : p.estado, items: p.items.map(i => g.keys.includes(p.no + '#' + i.key) ? { ...i, listo:true } : i) })));
    aviso(`${g.q}× ${P[g.id].nombre} listos`);
  };
  const accion = p => {
    if (p.estado === 'recibido') return ['Empezar', () => mover(p.no, 'prep')];
    if (p.estado === 'prep') return ['Marcar todo listo', () => mover(p.no, 'listo', `Pedido N° ${p.no} listo · ${p.origen}`)];
    if (p.estado === 'listo') return p.tipo === 'delivery' ? ['Enviar con ' + p.rep, () => mover(p.no, 'camino', `Pedido N° ${p.no} en camino`)] : ['Entregado', () => mover(p.no, 'entregado', `Pedido N° ${p.no} entregado`)];
    return ['Entregado al cliente', () => mover(p.no, 'entregado', `Delivery N° ${p.no} entregado`)];
  };
  const activos = pedidos.filter(p => p.estado === 'recibido' || p.estado === 'prep');
  const grupos = Object.values(activos.reduce((acc, p) => {
    p.items.filter(i => !i.listo).forEach(i => {
      const k = i.id + '|' + modsTxt(i);
      acc[k] = acc[k] || { k, id: i.id, mods: modsTxt(i), q:0, nos:[], keys:[], origenes:[], notas:[] };
      const g = acc[k]; g.q += i.q; if (!g.nos.includes(p.no)) g.nos.push(p.no); g.keys.push(p.no + '#' + i.key); g.origenes.push(`${i.q}× ${p.origen}`); if (i.nota) g.notas.push(i.nota);
    });
    return acc;
  }, {})).sort((a, b) => b.q - a.q);
  return (<>
    <div className="page-head">
      <div className="tabs" role="group" aria-label="Vista">
        <button aria-pressed={vistaK === 'pedido'} onClick={() => setVistaK('pedido')}>Por pedido</button>
        <button aria-pressed={vistaK === 'producto'} onClick={() => setVistaK('producto')}>Por producto · {grupos.reduce((s, g) => s + g.q, 0)}</button>
      </div>
      <div className="row" style={{ flexWrap:'wrap' }}>
        <button className="btn btn-ghost btn-sm" aria-pressed={sonido} onClick={() => setSonido(s => !s)}><Icon n="bell" s={18} />{sonido ? 'Sonido activado' : 'Sonido apagado'}</button>
        <span className="pill pill-gray num" style={{ fontSize:14, padding:'7px 14px' }}>{pedidos.filter(p => p.estado !== 'entregado' && p.estado !== 'anulado').length} pedidos activos</span>
      </div>
    </div>
    {vistaK === 'pedido' ? (
      <div className="kds">
        {COLS.map(col => {
          const lista = pedidos.filter(p => p.estado === col.id);
          return (
            <section className="kcol" key={col.id} aria-label={col.label}>
              <div className="kcol-head"><h2><span style={{ color:col.c }}><Icon n={col.icon} s={22} /></span>{col.label}</h2><span className={'pill num ' + col.pill}>{lista.length}</span></div>
              {lista.length === 0 && <div className="empty" style={{ padding:'24px 8px' }}><span>Sin pedidos aquí</span></div>}
              {lista.map(p => {
                const min = Math.max(0, Math.floor((now - p.creado) / 6e4));
                const tc = min > 15 ? 'pill-red' : min >= 8 ? 'pill-gold' : 'pill-gray';
                const [txt, fn] = accion(p);
                const hechos = p.items.filter(i => i.listo).length;
                const editable = p.estado === 'recibido' || p.estado === 'prep';
                return (
                  <article className="order" key={p.no} style={{ '--state': col.c }}>
                    <div className="between"><h3 className="num">N° {p.no}</h3><span className={'pill num ' + tc}><Icon n="clock" s={14} />{min} min</span></div>
                    <div className="row" style={{ gap:6, fontWeight:700, fontSize:14 }}><Icon n={p.tipo === 'mesa' ? 'mesas' : p.tipo === 'delivery' ? 'moto' : 'store'} s={18} />{p.origen}</div>
                    {p.dir && <div className="muted" style={{ fontSize:13.5, marginTop:-6 }}>{p.dir}</div>}
                    <ul className="order-items">
                      {p.items.map(it => (
                        <li key={it.key}>
                          <button className={'oi' + (it.listo ? ' done' : '')} disabled={!editable} onClick={() => toggleItem(p.no, it.key)} aria-pressed={it.listo} aria-label={`${it.q} ${P[it.id].nombre}${it.listo ? ', listo' : ''}`}>
                            <span className="oi-check" aria-hidden="true">{it.listo && <Icon n="check" s={14} w={3} />}</span>
                            <span className="oi-txt"><span><b className="num">{it.q}×</b> {P[it.id].nombre}</span>{modsTxt(it) && <span className="oi-mods">{modsTxt(it)}</span>}{it.nota && <span className="item-note">{it.nota}</span>}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    {editable && <div className="oi-progress"><span className="bar" style={{ flex:1, height:6 }}><i style={{ width: (hechos / p.items.length * 100) + '%' }} /></span><span className="muted num" style={{ fontSize:13 }}>{hechos} de {p.items.length} listos</span></div>}
                    <button className={'btn ' + (p.estado === 'listo' || p.estado === 'camino' ? 'btn-primary' : 'btn-ghost')} onClick={fn}>{txt}<Icon n="arrow" s={18} /></button>
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>
    ) : (
      <section className="card">
        <div className="between" style={{ marginBottom:6, flexWrap:'wrap' }}><h2>Todo lo pendiente</h2><span className="muted" style={{ fontSize:13.5 }}>Agrupado para preparar en tanda · de pedidos recibidos y en preparación</span></div>
        {grupos.length ? grupos.map(g => (
          <div className="grp" key={g.k}>
            <span className="grp-q num">{g.q}×</span>
            <div style={{ minWidth:0, flex:1 }}>
              <b style={{ fontSize:16.5 }}>{P[g.id].nombre}</b>
              {g.mods && <div className="oi-mods">{g.mods}</div>}
              {g.notas.length > 0 && <div className="row" style={{ gap:6, flexWrap:'wrap', marginTop:4 }}>{g.notas.map((n, i) => <span key={i} className="item-note">{n}</span>)}</div>}
              <div className="muted" style={{ fontSize:13, marginTop:4 }}>{g.origenes.join(' · ')}</div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => marcarGrupo(g)}><Icon n="check" s={18} />Listos</button>
          </div>
        )) : <div className="empty"><Icon n="check" s={36} w={1.5} /><b>Nada pendiente</b><span>Todo lo que entró a barra ya está listo.</span></div>}
      </section>
    )}
  </>);
}

/* ============ 3. Caja: apertura, movimientos y cierre ============ */
const DENOMS = [
  { v:200, t:'billete' }, { v:100, t:'billete' }, { v:50, t:'billete' }, { v:20, t:'billete' }, { v:10, t:'billete' },
  { v:5, t:'moneda' }, { v:2, t:'moneda' }, { v:1, t:'moneda' }, { v:0.5, t:'moneda' },
];
const TIPOS_MOV = {
  egreso:  { l:'Egreso o compra', s:-1, ej:'Ej. Bolsa de hielo, compra de leche' },
  retiro:  { l:'Retiro a caja fuerte', s:-1, ej:'Ej. Retiro de mitad de turno' },
  ingreso: { l:'Ingreso de efectivo', s:1, ej:'Ej. Cambio adicional en monedas' },
};
function Caja({ caja, setCaja, aviso, registrar, yo }) {
  const [cnt, setCnt] = useState({ 200:8, 100:9, 50:6, 20:8, 10:5, 5:2, 2:3, 1:0, 0.5:0 });
  const [paso, setPaso] = useState('contar');
  const [movForm, setMovForm] = useState(null);
  const [apMonto, setApMonto] = useState('300');
  const [err, setErr] = useState('');
  const set = (v, d) => setCnt(c => ({ ...c, [v]: Math.max(0, (c[v] || 0) + d) }));

  if (!caja.abierta) {
    const abrir = e => {
      e.preventDefault();
      const m = leerMontoC(apMonto);
      if (apMonto === '' || isNaN(Number(String(apMonto).replace(',', '.')))) { setErr('Escribe el monto inicial en efectivo (puede ser 0).'); return; }
      setCaja(c => ({ ...c, abierta:true, apertura: m, por: yo.nombre, hora: hora(), movs:[], ventas:{ efectivo:0, qr:0, tarjeta:0 }, propinas:{ efectivo:0, qr:0, tarjeta:0 }, descuentos:0, tickets:0 }));
      registrar(`Abrió la caja con ${bsC(m)}`);
      aviso(`Caja abierta con ${bsC(m)}`, 'cash'); setPaso('contar');
    };
    return (
      <div className="apertura">
        <form className="card stack" style={{ gap:16 }} onSubmit={abrir} noValidate>
          <span className="ctx-ico" style={{ width:56, height:56, borderRadius:16 }}><Icon n="cash" s={28} /></span>
          <div><h2 style={{ fontSize:24 }}>Abrir caja</h2><span className="muted">Cuenta el efectivo con el que empieza el turno.</span></div>
          <label className="field">Monto inicial en efectivo
            <div className="input-pre"><span>Bs</span><input id="ap-monto" className="input num" inputMode="decimal" value={apMonto} onChange={e => { setApMonto(e.target.value); setErr(''); }} aria-invalid={!!err} style={{ fontSize:22, fontWeight:700 }} /></div>
            {err && <span className="err">{err}</span>}
          </label>
          <div className="quick">{[200, 300, 500].map(v => <button type="button" key={v} aria-pressed={String(v) === apMonto} onClick={() => setApMonto(String(v))}>{bs(v)}</button>)}</div>
          <div className="kv"><span className="muted">Abre</span><b>{yo.nombre}</b></div>
          <button type="submit" className="btn btn-primary btn-cobrar"><span>Abrir caja</span><span className="num">{bsC(leerMontoC(apMonto))}</span></button>
        </form>
        {caja.ultimo && (
          <section className="card stack" style={{ gap:6 }}>
            <div className="eyebrow">Último cierre</div>
            <div className="kv num"><span>Cerrada</span><b>{caja.ultimo.hora} · {caja.ultimo.por}</b></div>
            <div className="kv num"><span>Ventas del turno</span><b>{bsC(caja.ultimo.ventas)}</b></div>
            <div className="kv num"><span>Efectivo contado</span><b>{bsC(caja.ultimo.contado)}</b></div>
            <div className="kv num"><span>Diferencia</span><b style={{ color: caja.ultimo.dif === 0 ? 'var(--green-text)' : caja.ultimo.dif < 0 ? 'var(--red-text)' : 'var(--gold-text)' }}>{caja.ultimo.dif === 0 ? 'Cuadra exacto' : (caja.ultimo.dif < 0 ? 'Faltante ' : 'Sobrante ') + bsC(Math.abs(caja.ultimo.dif))}</b></div>
          </section>
        )}
      </div>
    );
  }

  const ventas = [{ k:'Efectivo', v:caja.ventas.efectivo, icon:'cash' }, { k:'QR', v:caja.ventas.qr, icon:'qr' }, { k:'Tarjeta', v:caja.ventas.tarjeta, icon:'card' }];
  const totV = ventas.reduce((s, x) => s + x.v, 0);
  const totProp = caja.propinas.efectivo + caja.propinas.qr + caja.propinas.tarjeta;
  const esperado = esperadoC(caja);
  const contado = contadoC(cnt);
  const dif = contado - esperado;
  const estadoDif = dif === 0 ? ['Cuadra exacto', 'var(--green-soft)', 'var(--green-text)'] : dif < 0 ? ['Faltante', 'var(--red-soft)', 'var(--red-text)'] : ['Sobrante', 'var(--gold-soft)', 'var(--gold-text)'];
  const guardarMov = e => {
    e.preventDefault();
    const v = leerMontoC(movForm.v);
    if (!(v > 0)) return setMovForm(f => ({ ...f, err:'Escribe un monto mayor a 0.' }));
    if (!movForm.k.trim()) return setMovForm(f => ({ ...f, err:'Escribe el motivo del movimiento.' }));
    if (TIPOS_MOV[movForm.tipo].s < 0 && v > esperado) return setMovForm(f => ({ ...f, err:`En la caja debería haber ${bsC(esperado)}. No puedes sacar más.` }));
    setCaja(c => ({ ...c, movs:[...c.movs, { id: Date.now(), tipo: movForm.tipo, k: movForm.k.trim(), h: hora(), v, por: yo.nombre }] }));
    registrar(`Registró ${TIPOS_MOV[movForm.tipo].l.toLowerCase()} de ${bsC(v)} · ${movForm.k.trim()}`);
    aviso(`${TIPOS_MOV[movForm.tipo].l} de ${bsC(v)} registrado`, 'cash');
    setMovForm(null);
  };
  const cerrarCaja = () => {
    setCaja(c => ({ ...c, abierta:false, ultimo:{ hora: hora(), por: yo.nombre, ventas: totV, contado, dif } }));
    registrar(`Cerró la caja · contado ${bsC(contado)} · ${estadoDif[0].toLowerCase()}${dif !== 0 ? ' ' + bsC(Math.abs(dif)) : ''}`);
    aviso('Caja cerrada. Resumen guardado.', 'lock');
  };
  const exportar = () => guardarExcel(nombreArchivo(NEGOCIO, 'cierre-de-caja'), [
    { nombre:'Resumen', titulo:`${NEGOCIO} · Cierre de caja`, sub:`${fechaTxt(hoyISO(), true)} · abrió ${caja.por} a las ${caja.hora}`, columnas:['Concepto', 'Monto', 'Detalle'], filas:[
      ['Apertura', { bs: caja.apertura }, caja.por],
      ...ventas.map(x => [`Ventas con ${x.k === 'QR' ? 'QR' : x.k.toLowerCase()}`, { bs: x.v }, totV ? `${Math.round(x.v / totV * 100)} %` : '']),
      ['Total vendido', { bs: totV }, `${caja.tickets} tickets`],
      ['Descuentos y cortesías', { bs: caja.descuentos }, ''],
      ['Propinas', { bs: totProp }, `En efectivo ${bsC(caja.propinas.efectivo)}`],
      ...(FISCAL.simplificado ? [['Régimen', 'RTS', FISCAL.cat ? `Categoría ${FISCAL.cat.cat} · pago bimestral ${bsC(aC(FISCAL.cat.cuota))}` : '']] : [['IVA incluido (13 %)', { bs: ivaC(totV) }, ''], ['Ventas sin IVA', { bs: totV - ivaC(totV) }, '']]),
      ['Efectivo esperado', { bs: esperado }, 'Apertura + efectivo + propinas ± movimientos'],
      ['Efectivo contado', { bs: contado }, ''],
      ['Diferencia', { bs: dif }, estadoDif[0]],
    ] },
    { nombre:'Movimientos', titulo:'Movimientos de caja', columnas:['Hora', 'Tipo', 'Motivo', 'Monto', 'Registró'], filas: caja.movs.map(x => [x.h, TIPOS_MOV[x.tipo].l, x.k, { bs: TIPOS_MOV[x.tipo].s * x.v }, x.por || '']) },
    { nombre:'Conteo', titulo:'Conteo de billetes y monedas', columnas:['Denominación', 'Tipo', 'Cantidad', 'Subtotal'], filas: DENOMS.map(dn => [{ bs: aC(dn.v) }, dn.t, { int: cnt[dn.v] || 0 }, { bs: aC(dn.v) * (cnt[dn.v] || 0) }]), total:['Total', '', '', { bs: contado }] },
  ], aviso);
  return (<>
    <div className="page-head"><span className="muted">Turno abierto por {caja.por} a las {caja.hora}</span><BotonExcel onExport={exportar} etiqueta="Exportar cierre" /></div>
    <div className="kpis">
      <div className="card kpi"><div className="eyebrow">Ventas del turno</div><div className="kpi-val num">{bsC(totV)}</div><span className="muted num">{caja.tickets} tickets{caja.descuentos > 0 ? ` · descuentos ${bsC(caja.descuentos)}` : ''}</span></div>
      <div className="card kpi"><div className="eyebrow">Apertura</div><div className="kpi-val num">{bsC(caja.apertura)}</div><span className="muted">{caja.hora} · {caja.por}</span></div>
      <div className="card kpi"><div className="eyebrow">Propinas</div><div className="kpi-val num">{bsC(totProp)}</div><span className="muted num">En efectivo {bsC(caja.propinas.efectivo)}</span></div>
      <div className="card kpi"><div className="eyebrow">Efectivo esperado</div><div className="kpi-val num" style={{ color:'var(--green-text)' }}>{bsC(esperado)}</div><span className="muted">Apertura + efectivo + propinas ± movimientos</span></div>
    </div>
    <div className="grid-2">
      <div className="stack">
        <section className="card">
          <h2 style={{ marginBottom:10 }}>Ventas por método de pago</h2>
          {ventas.map(x => (
            <div key={x.k} style={{ padding:'10px 0' }}>
              <div className="between" style={{ marginBottom:8 }}><span className="row" style={{ fontWeight:700 }}><Icon n={x.icon} s={20} />{x.k}</span><span className="num" style={{ fontWeight:700 }}>{bsC(x.v)} <span className="muted" style={{ fontWeight:500 }}>· {totV ? Math.round(x.v / totV * 100) : 0}%</span></span></div>
              <div className="bar"><i style={{ width: (totV ? x.v / totV * 100 : 0) + '%' }} /></div>
            </div>
          ))}
          <div className="kv" style={{ borderTop:'1px solid var(--line)', marginTop:6 }}><b>Total vendido</b><b className="num">{bsC(totV)}</b></div>
          {caja.descuentos > 0 && <div className="kv num"><span className="muted">Descuentos y cortesías</span><span style={{ color:'var(--red-text)' }}>− {bsC(caja.descuentos)}</span></div>}
          {FISCAL.simplificado
            ? <div className="fiscal-note" style={{ marginTop:8 }}><Icon n="note" s={18} /><span>RTS: estas ventas no generan factura. El IVA, IUE e IT se pagan en la cuota fija bimestral{FISCAL.cat ? ` (categoría ${FISCAL.cat.cat}: ${bs(FISCAL.cat.cuota)})` : ''}.</span></div>
            : (<>
              <div className="kv num"><span className="muted">IVA incluido en ventas (13 %)</span><span>{bsC(ivaC(totV))}</span></div>
              <div className="kv num"><span className="muted">Ventas sin IVA</span><span>{bsC(totV - ivaC(totV))}</span></div>
            </>)}
        </section>
        <section className="card">
          <div className="between" style={{ marginBottom:6, flexWrap:'wrap' }}><h2>Movimientos de caja</h2>{!movForm && <button className="btn btn-ghost btn-sm" onClick={() => setMovForm({ tipo:'egreso', v:'', k:'', err:'' })}><Icon n="plus" s={18} />Registrar movimiento</button>}</div>
          {movForm && (
            <form className="desc-box" onSubmit={guardarMov} noValidate style={{ marginBottom:10 }}>
              <div className="seg seg-3" role="group" aria-label="Tipo de movimiento">{Object.entries(TIPOS_MOV).map(([k, t]) => <button type="button" key={k} aria-pressed={movForm.tipo === k} onClick={() => setMovForm(f => ({ ...f, tipo:k, err:'' }))}>{t.l}</button>)}</div>
              <div className="form-grid">
                <label className="field">Monto<div className="input-pre"><span>Bs</span><input id="mov-v" className="input num" inputMode="decimal" value={movForm.v} onChange={e => setMovForm(f => ({ ...f, v:e.target.value, err:'' }))} placeholder="0" /></div></label>
                <label className="field">Motivo<input id="mov-k" className="input" value={movForm.k} onChange={e => setMovForm(f => ({ ...f, k:e.target.value, err:'' }))} placeholder={TIPOS_MOV[movForm.tipo].ej} /></label>
              </div>
              {movForm.err && <span className="err">{movForm.err}</span>}
              <div className="row"><button type="button" className="btn btn-ghost btn-sm" style={{ flex:1 }} onClick={() => setMovForm(null)}>Cancelar</button><button type="submit" className="btn btn-primary btn-sm" style={{ flex:1 }}>Registrar</button></div>
            </form>
          )}
          {caja.movs.length ? caja.movs.map(x => (
            <div className="kv num" key={x.id}><span><b>{x.k}</b><br /><span className="muted">{TIPOS_MOV[x.tipo].l} · {x.h}{x.por ? ' · ' + x.por : ''}</span></span><span style={{ color: TIPOS_MOV[x.tipo].s < 0 ? 'var(--red-text)' : 'var(--green-text)', fontWeight:700, whiteSpace:'nowrap' }}>{TIPOS_MOV[x.tipo].s < 0 ? '− ' : '+ '}{bsC(x.v)}</span></div>
          )) : <span className="muted">Sin movimientos en este turno.</span>}
        </section>
      </div>
      <section className="card stack" style={{ gap:16 }}>
        <div><h2>Conteo de efectivo</h2><span className="muted">Cuenta los billetes y monedas del cajón</span></div>
        <div className="denoms">
          {DENOMS.map(d => (
            <div className="denom" key={d.v}>
              <div className="between"><span className="bill num">{bs(d.v)}</span><span className="muted" style={{ fontSize:13 }}>{d.t}</span></div>
              <div className="stepper">
                <button onClick={() => set(d.v, -1)} aria-label={`Quitar ${d.t} de ${bs(d.v)}`}><Icon n="minus" s={16} /></button>
                <span className="num">{cnt[d.v] || 0}</span>
                <button onClick={() => set(d.v, 1)} aria-label={`Agregar ${d.t} de ${bs(d.v)}`}><Icon n="plus" s={16} /></button>
              </div>
            </div>
          ))}
        </div>
        <div className="kv num"><span>Efectivo contado</span><b style={{ fontSize:20 }}>{bsC(contado)}</b></div>
        <div className="kv num" style={{ paddingTop:0 }}><span>Efectivo esperado</span><b>{bsC(esperado)}</b></div>
        <div className="diff" style={{ background: estadoDif[1], color: estadoDif[2] }}>
          <b>{estadoDif[0]}</b><b className="num" style={{ fontSize:26, fontFamily:'var(--f-display)' }}>{dif === 0 ? bsC(0) : (dif > 0 ? '+ ' : '− ') + bsC(Math.abs(dif))}</b>
        </div>
        {paso === 'confirmar' ? (
          <div className="stack" style={{ gap:10 }}>
            <b>¿Cerrar la caja{dif !== 0 ? ` con ${estadoDif[0].toLowerCase()} de ${bsC(Math.abs(dif))}` : ''}? No se podrá cobrar hasta abrir un nuevo turno.</b>
            <div className="row"><button className="btn btn-ghost" style={{ flex:1 }} onClick={() => setPaso('contar')}>Volver</button><button className="btn btn-primary" style={{ flex:1 }} onClick={cerrarCaja}>Sí, cerrar caja</button></div>
          </div>
        ) : <button className="btn btn-primary btn-cobrar" onClick={() => setPaso('confirmar')}><span>Cerrar caja</span><Icon n="lock" s={26} /></button>}
      </section>
    </div>
  </>);
}

/* ============ Productos y precios (formulario) ============ */
function Productos({ productos, setProductos, recetas, aviso, ir }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('todo');
  const [edit, setEdit] = useState(null);
  const vivos = productos.filter(p => !p.eliminado);
  const lista = vivos.filter(p => (cat === 'todo' || p.cat === cat) && p.nombre.toLowerCase().includes(q.toLowerCase()));
  const conReceta = id => recetas.some(r => r.prod === id);
  const guardar = (p, nuevo) => {
    setProductos(ps => nuevo ? [...ps, p] : ps.map(x => x.id === p.id ? p : x));
    aviso(nuevo ? `${p.nombre} creado a ${bs(p.precio)}` : `${p.nombre} actualizado`);
    setEdit(null);
  };
  const eliminar = p => { setProductos(ps => ps.map(x => x.id === p.id ? { ...x, eliminado:true } : x)); aviso(`${p.nombre} eliminado del menú`, 'trash', () => setProductos(ps => ps.map(x => x.id === p.id ? { ...x, eliminado:false } : x))); setEdit(null); };
  const exportar = () => guardarExcel(nombreArchivo(NEGOCIO, 'productos-y-precios'), [
    { nombre:'Productos', titulo:`${NEGOCIO} · Lista de productos y precios`, sub:`${fechaTxt(hoyISO(), true)} · ${FISCAL.simplificado ? 'Régimen Tributario Simplificado' : 'precios con IVA incluido'}`, columnas:['Producto', 'Categoría', 'Precio', 'A la venta', 'Stock', 'Opciones al vender', 'Descripción'],
      filas: vivos.map(p => [p.nombre, CAT[p.cat] || p.cat, { bs: aC(p.precio) }, p.disponible ? 'Sí' : 'No', p.stockCtl ? { int: p.stock } : '', (p.mods || []).map(g => MODS[g].l).join(', '), p.desc || '']) },
    { nombre:'Opciones', titulo:'Opciones y su precio', columnas:['Grupo', 'Opción', 'Precio extra'], filas: Object.values(MODS).flatMap(M => M.ops.map(o => [M.l, o.l, { bs: aC(o.p) }])) },
  ], aviso);
  const toggle = p => { setProductos(ps => ps.map(x => x.id === p.id ? { ...x, disponible: !x.disponible } : x)); aviso(`${p.nombre} ${p.disponible ? 'oculto del punto de venta' : 'disponible para la venta'}`); };
  return (<>
    <div className="page-head">
      <div className="row" style={{ flexWrap:'wrap' }}>
        <span className="pill pill-gray num" style={{ fontSize:14, padding:'7px 14px' }}>{vivos.length} productos</span>
        <span className="pill pill-green num" style={{ fontSize:14, padding:'7px 14px' }}>{vivos.filter(p => p.disponible).length} a la venta</span>
      </div>
      <div className="row head-actions"><BotonExcel onExport={exportar} etiqueta="Exportar lista" /><button className="btn btn-primary" onClick={() => setEdit('nuevo')}><Icon n="plus" s={20} />Nuevo producto</button></div>
    </div>
    <section className="card">
      <div className="toolbar">
        <label className="search" style={{ margin:0, flex:'1 1 240px' }}><Icon n="search" s={20} /><input id="buscar-prod" className="input" placeholder="Buscar producto…" value={q} onChange={e => setQ(e.target.value)} /></label>
        <select id="filtro-cat" className="input" style={{ flex:'0 1 220px' }} value={cat} onChange={e => setCat(e.target.value)} aria-label="Filtrar por categoría">
          <option value="todo">Todas las categorías</option>
          {CATEGORIAS.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>
      <div className="plist">
        <div className="prow prow-head" aria-hidden="true"><span /><span>Producto</span><span>Precio</span><span>Receta</span><span>A la venta</span><span /></div>
        {lista.map(p => (
          <div className="prow" key={p.id}>
            <div className="thumb" style={{ background:`color-mix(in srgb, ${p.color} 20%, var(--surface))` }}><Art p={p} /></div>
            <div style={{ minWidth:0 }}>
              <b className="prow-name">{p.nombre}</b>
              <div className="muted" style={{ fontSize:13 }}>{CAT[p.cat]}{p.stockCtl ? ` · stock ${p.stock}` : ''}{p.desc ? ` · ${p.desc}` : ''}</div>
            </div>
            <b className="num prow-price">{p.cat === 'extras' ? '+ ' : ''}{bs(p.precio)}</b>
            <span className="prow-rec">{p.stockCtl ? <span className="pill pill-blue">Se compra hecho</span> : conReceta(p.id) ? <span className="pill pill-green"><Icon n="check" s={14} />Con receta</span> : <button className="pill pill-gold" style={{ border:0 }} onClick={() => ir('inventario')}>Sin receta</button>}</span>
            <span className="prow-sw"><button className="switch" role="switch" aria-checked={p.disponible} aria-label={`${p.nombre} a la venta`} onClick={() => toggle(p)} /></span>
            <button className="btn btn-ghost btn-sm prow-edit" onClick={() => setEdit(p)}><Icon n="edit" s={18} />Editar</button>
          </div>
        ))}
        {!lista.length && <div className="empty"><b>No hay productos con ese filtro.</b><button className="btn btn-ghost btn-sm" onClick={() => { setQ(''); setCat('todo'); }}>Ver todos</button></div>}
      </div>
    </section>
    {edit && <ProductoForm inicial={edit === 'nuevo' ? null : edit} productos={vivos} onSave={guardar} onDelete={eliminar} onClose={() => setEdit(null)} />}
  </>);
}

function ProductoForm({ inicial, productos, onSave, onDelete, onClose }) {
  const nuevo = !inicial;
  const [f, setF] = useState(inicial ? { ...inicial } : { id:'p' + Date.now(), cat:'cafe', nombre:'', precio:'', pres:'taza', color:'#C49A6C', disponible:true, eliminado:false, stockCtl:false, stock:0, min:0, desc:'', foto:null, mods:[] });
  const [err, setErr] = useState({});
  const [borrar, setBorrar] = useState(false);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  useEscape(onClose);
  const subirFoto = e => {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    const r = new FileReader();
    r.onload = () => { const img = new Image(); img.onload = () => {
      const s = Math.min(1, 520 / Math.max(img.width, img.height)); const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      set('foto', c.toDataURL('image/jpeg', .82));
    }; img.src = r.result; };
    r.readAsDataURL(file);
  };
  const enviar = e => {
    e.preventDefault();
    const er = {};
    const nombre = f.nombre.trim();
    if (!nombre) er.nombre = 'Escribe el nombre del producto.';
    else if (productos.some(p => p.id !== f.id && p.nombre.toLowerCase() === nombre.toLowerCase())) er.nombre = 'Ya existe un producto con ese nombre.';
    const precio = Number(String(f.precio).replace(',', '.'));
    if (!(precio > 0)) er.precio = 'Ingresa un precio mayor a 0.';
    if (f.stockCtl && Number(f.stock) < 0) er.stock = 'El stock no puede ser negativo.';
    setErr(er);
    if (Object.keys(er).length) return;
    onSave({ ...f, nombre, precio: r2(precio), stock: Number(f.stock) || 0, min: Number(f.min) || 0 }, nuevo);
  };
  const vista = { ...f, nombre: f.nombre || 'Nombre del producto', precio: Number(String(f.precio).replace(',', '.')) || 0 };
  return (
    <div className="scrim" onClick={onClose}>
      <form className="modal modal-lg" role="dialog" aria-modal="true" aria-labelledby="pf-t" onClick={e => e.stopPropagation()} onSubmit={enviar} noValidate>
        <div className="between">
          <div><div className="eyebrow">{nuevo ? 'Nuevo producto' : 'Editar producto'}</div><h2 id="pf-t" style={{ fontSize:24 }}>{nuevo ? 'Agregar al menú' : inicial.nombre}</h2></div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icon n="x" s={20} /></button>
        </div>
        <div className="form-split">
          <div className="form-grid">
            <label className="field span-2">Nombre
              <input id="pf-nombre" className="input" value={f.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Ej. Latte de vainilla" aria-invalid={!!err.nombre} />
              {err.nombre && <span className="err">{err.nombre}</span>}
            </label>
            <label className="field">Categoría
              <select id="pf-cat" className="input" value={f.cat} onChange={e => set('cat', e.target.value)}>{CATEGORIAS.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
            </label>
            <label className="field">Precio de venta (Bs)
              <div className="input-pre"><span>Bs</span><input id="pf-precio" className="input num" inputMode="decimal" value={f.precio} onChange={e => set('precio', e.target.value)} placeholder="0" aria-invalid={!!err.precio} /></div>
              {err.precio && <span className="err">{err.precio}</span>}
              {!err.precio && <span style={{ fontWeight:500 }}>{FISCAL.simplificado ? (Number(String(f.precio).replace(',', '.')) > FISCAL.pmax ? `Supera el precio unitario máximo del RTS para tu actividad (Bs ${FISCAL.pmax}).` : 'Precio final al cliente. RTS, sin IVA desglosado.') : `Precio final con IVA incluido${Number(String(f.precio).replace(',', '.')) > 0 ? ` · sin IVA ${bs(r2(Number(String(f.precio).replace(',', '.')) * (1 - IVA)))}` : ''}`}</span>}
            </label>
            <label className="field span-2">Descripción corta <span className="opt">opcional</span>
              <input id="pf-desc" className="input" value={f.desc} onChange={e => set('desc', e.target.value)} placeholder="Ej. Caliente o frío · con leche de avena" />
            </label>
            <label className="field">Presentación
              <select id="pf-pres" className="input" value={f.pres} onChange={e => set('pres', e.target.value)}>{Object.entries(PRESENTACIONES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            </label>
            <label className="field">Color de la ilustración
              <div className="row"><input id="pf-color" type="color" className="color-in" value={f.color} onChange={e => set('color', e.target.value)} /><span className="muted num" style={{ fontSize:13 }}>{f.color.toUpperCase()}</span></div>
            </label>
            <div className="field span-2">Foto del producto <span className="opt">opcional</span>
              <div className="row" style={{ flexWrap:'wrap' }}>
                <label className="btn btn-ghost btn-sm" style={{ cursor:'pointer' }}><Icon n="camera" s={18} />{f.foto ? 'Cambiar foto' : 'Subir foto'}<input id="pf-foto" type="file" accept="image/*" onChange={subirFoto} style={{ display:'none' }} /></label>
                {f.foto && <button type="button" className="btn btn-ghost btn-sm" onClick={() => set('foto', null)}>Quitar foto</button>}
                <span className="muted" style={{ fontSize:13 }}>Mejor cuadrada, tomada desde arriba y con luz natural.</span>
              </div>
            </div>
            <div className="field span-2">Opciones al vender <span className="opt">se eligen al tocar el producto en caja</span>
              <div className="quick">{Object.entries(MODS).map(([g, M]) => { const on = (f.mods || []).includes(g); return <button type="button" key={g} aria-pressed={on} onClick={() => set('mods', on ? f.mods.filter(x => x !== g) : Object.keys(MODS).filter(k => k === g || (f.mods || []).includes(k)))}>{M.l}{M.ops.some(o => o.p > 0) ? ' · con costo' : ''}</button>; })}</div>
            </div>
            <div className="field span-2 toggle-row">
              <div><b style={{ color:'var(--ink)' }}>A la venta</b><div style={{ fontWeight:500 }}>Si está apagado, no aparece en el punto de venta.</div></div>
              <button type="button" className="switch" role="switch" aria-checked={f.disponible} aria-label="A la venta" onClick={() => set('disponible', !f.disponible)} />
            </div>
            <div className="field span-2 toggle-row">
              <div><b style={{ color:'var(--ink)' }}>Controlar stock por unidad</b><div style={{ fontWeight:500 }}>Para productos que se compran o hornean listos, como la repostería.</div></div>
              <button type="button" className="switch" role="switch" aria-checked={f.stockCtl} aria-label="Controlar stock" onClick={() => set('stockCtl', !f.stockCtl)} />
            </div>
            {f.stockCtl && (<>
              <label className="field">Stock actual (unidades)
                <input id="pf-stock" className="input num" type="number" min="0" value={f.stock} onChange={e => set('stock', e.target.value)} aria-invalid={!!err.stock} />
                {err.stock && <span className="err">{err.stock}</span>}
              </label>
              <label className="field">Avisar cuando queden
                <input id="pf-min" className="input num" type="number" min="0" value={f.min} onChange={e => set('min', e.target.value)} />
              </label>
            </>)}
          </div>
          <div className="preview">
            <div className="eyebrow" style={{ marginBottom:8 }}>Así se verá en caja</div>
            <div className="prod" style={{ pointerEvents:'none' }} aria-hidden="true">
              <div className="prod-art" style={{ background:`color-mix(in srgb, ${f.color} 20%, var(--surface))` }}><Art p={vista} /></div>
              <div className="prod-body"><span className="prod-name">{vista.nombre}</span>{f.desc && <span className="muted" style={{ fontSize:13 }}>{f.desc}</span>}<span className="prod-price num">{bs(vista.precio)}</span></div>
            </div>
            {!f.disponible && <span className="pill pill-gray" style={{ marginTop:10 }}>Oculto del punto de venta</span>}
          </div>
        </div>
        {borrar ? (
          <div className="confirm">
            <b>¿Eliminar {inicial.nombre} del menú?</b>
            <span>Dejará de aparecer en caja y en reportes nuevos. Las ventas pasadas se conservan.</span>
            <div className="row"><button type="button" className="btn btn-ghost" style={{ flex:1 }} onClick={() => setBorrar(false)}>Cancelar</button><button type="button" className="btn btn-danger" style={{ flex:1 }} onClick={() => onDelete(inicial)}>Sí, eliminar</button></div>
          </div>
        ) : (
          <div className="form-actions">
            {!nuevo && <button type="button" className="btn btn-ghost danger-text" onClick={() => setBorrar(true)}><Icon n="trash" s={18} />Eliminar</button>}
            <span style={{ flex:1 }} />
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary">{nuevo ? 'Crear producto' : 'Guardar cambios'}</button>
          </div>
        )}
      </form>
    </div>
  );
}

/* ============ 4. Inventario, movimientos y recetas ============ */
function Inventario({ productos, setProductos, insumos, setInsumos, recetas, setRecetas, movs, setMovs, aviso }) {
  const [tab, setTab] = useState('insumos');
  const [q, setQ] = useState('');
  const [movTipo, setMovTipo] = useState('ingreso');
  const [recEdit, setRecEdit] = useState(null);
  const I = Object.fromEntries(insumos.map(x => [x.id, x]));
  const estado = x => x.s < x.min * .5 ? ['Crítico', 'pill-red', 'var(--red)'] : x.s < x.min ? ['Bajo', 'pill-gold', 'var(--gold)'] : ['Suficiente', 'pill-green', 'var(--green)'];
  const bajos = insumos.filter(x => x.s < x.min);
  const prodStock = productos.filter(p => !p.eliminado && p.stockCtl);
  const vivos = productos.filter(p => !p.eliminado);
  const sinReceta = vivos.filter(p => !p.stockCtl && p.cat !== 'extras' && !recetas.some(r => r.prod === p.id));
  const abrirMov = t => { setMovTipo(t); setTab('movimientos'); };
  const exportar = () => guardarExcel(nombreArchivo(NEGOCIO, 'inventario'), [
    { nombre:'Insumos', titulo:`${NEGOCIO} · Inventario de insumos`, sub: fechaTxt(hoyISO(), true), columnas:['Insumo', 'Unidad', 'Stock', 'Mínimo', 'Costo por unidad', 'Valor en stock', 'Estado'],
      filas: insumos.map(x => [x.n, x.u, x.s, x.min, { bs: aC(x.costo) }, { bs: Math.round(aC(x.costo) * x.s) }, estado(x)[0]]), total:['Total', '', '', '', '', { bs: insumos.reduce((s, x) => s + Math.round(aC(x.costo) * x.s), 0) }, ''] },
    { nombre:'Productos con stock', titulo:'Productos con stock por unidad', columnas:['Producto', 'Stock', 'Avisar con'], filas: prodStock.map(p => [p.nombre, { int: p.stock }, { int: p.min }]) },
    { nombre:'Movimientos', titulo:'Ingresos, mermas y ajustes de hoy', columnas:['Hora', 'Tipo', 'Insumo o producto', 'Cantidad', 'Costo', 'Nota', 'Registró'],
      filas: movs.map(m => { const esP = m.item.startsWith('p'); return [m.h, { ingreso:'Ingreso', merma:'Merma', ajuste:'Ajuste' }[m.tipo], esP ? (P[m.item] || {}).nombre : (I[m.item] || {}).n, m.q, m.costo ? { bs: aC(m.costo) } : '', m.nota || '', m.user]; }) },
    { nombre:'Recetas', titulo:'Costo y margen por receta', sub: FISCAL.simplificado ? 'Margen sobre el precio de venta (RTS)' : 'Margen sobre el precio sin IVA (13 %)', columnas:['Producto', 'Rinde', 'Costo por porción', 'Precio de venta', 'Margen'],
      filas: recetas.filter(r => P[r.prod] && !P[r.prod].eliminado).map(r => { const p = P[r.prod]; const cu = costoReceta(r, I); return [p.nombre, { int: r.rinde }, { bs: aC(cu) }, { bs: aC(p.precio) }, { pct: Math.round((1 - cu / precioNeto(p.precio)) * 100) / 100 }]; }) },
  ], aviso);
  const guardarReceta = (r, nueva) => { setRecetas(rs => nueva ? [...rs, r] : rs.map(x => x.prod === r.prod ? r : x)); aviso(`Receta de ${P[r.prod].nombre} ${nueva ? 'creada' : 'actualizada'}`); setRecEdit(null); };
  const borrarReceta = r => { setRecetas(rs => rs.filter(x => x.prod !== r.prod)); aviso(`Receta de ${P[r.prod].nombre} eliminada`, 'trash'); setRecEdit(null); };

  return (<>
    <div className="page-head">
      <div className="tabs" role="group" aria-label="Sección">
        <button aria-pressed={tab === 'insumos'} onClick={() => setTab('insumos')}>Insumos</button>
        <button aria-pressed={tab === 'movimientos'} onClick={() => setTab('movimientos')}>Ingresos y ajustes</button>
        <button aria-pressed={tab === 'recetas'} onClick={() => setTab('recetas')}>Recetas y costos</button>
      </div>
      <div className="row head-actions"><BotonExcel onExport={exportar} etiqueta="Exportar inventario" />
      {tab === 'recetas' ? <button className="btn btn-primary" onClick={() => setRecEdit('nueva')} disabled={!sinReceta.length}><Icon n="plus" s={20} />Nueva receta</button>
        : tab === 'insumos' ? <button className="btn btn-primary" onClick={() => abrirMov('ingreso')}><Icon n="down" s={20} />Registrar ingreso</button> : null}</div>
    </div>

    {tab === 'insumos' && (<div className="stack">
      {bajos.length > 0 && (
        <div className="diff" style={{ background:'var(--gold-soft)', color:'var(--gold-text)', justifyContent:'flex-start' }}>
          <Icon n="alert" s={24} /><span><b>{bajos.length} insumos por debajo del mínimo:</b> {bajos.map(x => x.n).join(', ')}. Conviene comprar antes de la noche de música.</span>
        </div>
      )}
      <section className="card">
        <label className="search" style={{ marginBottom:4 }}><Icon n="search" s={20} /><input id="buscar-insumo" className="input" placeholder="Buscar insumo…" value={q} onChange={e => setQ(e.target.value)} /></label>
        <div className="inv">
          {insumos.filter(x => x.n.toLowerCase().includes(q.toLowerCase())).map(x => {
            const [lbl, cls, c] = estado(x);
            const pct = Math.min(100, x.s / (x.min * 2.5) * 100);
            return (
              <div className="inv-row" key={x.id}>
                <div><b>{x.n}</b><div className="muted num" style={{ fontSize:13 }}>{bs(x.costo)} / {x.u} · mínimo {cant(x.min, x.u)}</div></div>
                <div className="inv-bar"><div className="bar" style={{ height:12 }}><i style={{ width: pct + '%', background:c }} /></div></div>
                <b className="num" style={{ textAlign:'right', fontSize:17 }}>{cant(x.s, x.u)}</b>
                <span className={'pill ' + cls}>{lbl}</span>
              </div>
            );
          })}
        </div>
      </section>
      {prodStock.length > 0 && (
        <section className="card">
          <h2 style={{ marginBottom:6 }}>Productos con stock por unidad</h2>
          <div className="inv">
            {prodStock.map(p => (
              <div className="inv-row" key={p.id}>
                <div><b>{p.nombre}</b><div className="muted num" style={{ fontSize:13 }}>{CAT[p.cat]} · avisar con {p.min} u</div></div>
                <div className="inv-bar"><div className="bar" style={{ height:12 }}><i style={{ width: Math.min(100, p.stock / (Math.max(p.min, 1) * 2.5) * 100) + '%', background: p.stock < p.min ? 'var(--gold)' : 'var(--green)' }} /></div></div>
                <b className="num" style={{ textAlign:'right', fontSize:17 }}>{p.stock} u</b>
                <span className={'pill ' + (p.stock <= 0 ? 'pill-red' : p.stock < p.min ? 'pill-gold' : 'pill-green')}>{p.stock <= 0 ? 'Agotado' : p.stock < p.min ? 'Bajo' : 'Suficiente'}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>)}

    {tab === 'movimientos' && (
      <div className="grid-2">
        <MovForm key={movTipo} tipoInicial={movTipo} {...{ insumos, setInsumos, productos: prodStock, setProductos, setMovs, aviso }} />
        <section className="card">
          <h2 style={{ marginBottom:6 }}>Movimientos de hoy</h2>
          {[...movs].reverse().map(m => {
            const esP = m.item.startsWith('p');
            const nombre = esP ? (P[m.item] || {}).nombre : (I[m.item] || {}).n;
            const u = esP ? 'u' : (I[m.item] || {}).u;
            const meta = { ingreso:['Ingreso','pill-green','down','+ '], merma:['Merma','pill-red','up','− '], ajuste:['Ajuste','pill-blue','scale',''] }[m.tipo];
            return (
              <div className="kv" key={m.id} style={{ alignItems:'flex-start' }}>
                <div className="row" style={{ alignItems:'flex-start', gap:12, minWidth:0 }}>
                  <span className={'pill ' + meta[1]} style={{ padding:7 }}><Icon n={meta[2]} s={16} /></span>
                  <div style={{ minWidth:0 }}><b>{nombre}</b><div className="muted" style={{ fontSize:13 }}>{m.h} · {m.user}{m.nota ? ' · ' + m.nota : ''}</div></div>
                </div>
                <div className="num" style={{ textAlign:'right', whiteSpace:'nowrap' }}>
                  <b>{m.tipo === 'ajuste' ? `${numTxt(m.antes)} → ${cant(m.q, u)}` : meta[3] + cant(m.q, u)}</b>
                  {m.costo ? <div className="muted" style={{ fontSize:13 }}>{bs(m.costo)}</div> : null}
                </div>
              </div>
            );
          })}
        </section>
      </div>
    )}

    {tab === 'recetas' && (<div className="stack">
      {sinReceta.length > 0 && <div className="diff" style={{ background:'var(--surface-2)', color:'var(--muted)', justifyContent:'flex-start' }}><Icon n="alert" s={22} /><span><b style={{ color:'var(--ink)' }}>{sinReceta.length} productos sin receta.</b> Sin receta no se descuentan insumos ni se calcula el margen.</span></div>}
      <div className="recipes">
        {recetas.filter(r => P[r.prod] && !P[r.prod].eliminado).map(r => {
          const p = P[r.prod];
          const cu = costoReceta(r, I);
          const margen = Math.round((1 - cu / precioNeto(p.precio)) * 100);
          return (
            <article className="card recipe stack" key={r.prod} style={{ gap:12 }}>
              <div className="row" style={{ gap:14 }}>
                <div className="thumb" style={{ width:72, height:56, background:`color-mix(in srgb, ${p.color} 20%, var(--surface))` }}><Art p={p} /></div>
                <div style={{ flex:1, minWidth:0 }}><h2>{p.nombre}</h2><span className="muted num">Rinde {r.rinde} {r.rinde === 1 ? 'porción' : 'porciones'}</span></div>
                <button className="icon-btn" onClick={() => setRecEdit(r)} aria-label={`Editar receta de ${p.nombre}`}><Icon n="edit" s={19} /></button>
              </div>
              <table><tbody>
                {r.ing.map(([id, c]) => I[id] && <tr key={id}><td>{I[id].n}</td><td className="num muted">{numTxt(c * factor(I[id].u))} {chica(I[id].u)}</td><td className="num">{bs(r2(I[id].costo * c))}</td></tr>)}
              </tbody></table>
              <div className="between num"><span className="muted">Costo por porción</span><b>{bs(r2(cu))}</b></div>
              <div className="between num"><span className="muted">Precio de venta</span><b>{bs(p.precio)}</b></div>
              {!FISCAL.simplificado && <div className="between num"><span className="muted">Precio sin IVA</span><b>{bs(r2(precioNeto(p.precio)))}</b></div>}
              <div className="margin-meter" aria-label={`Margen ${margen}%`}><span style={{ width:Math.max(0, 100 - margen) + '%', background:'var(--gold)' }} /><span style={{ flex:1, background:'var(--green)' }} /></div>
              <div className="between"><span className="row" style={{ gap:6, fontSize:13 }}><i className="dot" style={{ background:'var(--gold)' }} />Costo<i className="dot" style={{ background:'var(--green)', marginLeft:8 }} />Ganancia</span><span className={'pill num ' + (margen >= 60 ? 'pill-green' : margen >= 40 ? 'pill-gold' : 'pill-red')}>Margen {margen}%</span></div>
            </article>
          );
        })}
      </div>
    </div>)}

    {recEdit && <RecetaForm inicial={recEdit === 'nueva' ? null : recEdit} opciones={sinReceta} insumos={insumos} onSave={guardarReceta} onDelete={borrarReceta} onClose={() => setRecEdit(null)} />}
  </>);
}

function MovForm({ tipoInicial, insumos, setInsumos, productos, setProductos, setMovs, aviso }) {
  const [tipo, setTipo] = useState(tipoInicial);
  const [item, setItem] = useState(insumos[0].id);
  const [q, setQ] = useState('');
  const [costo, setCosto] = useState('');
  const [nota, setNota] = useState('');
  const [err, setErr] = useState({});
  const esP = item.startsWith('p');
  const obj = esP ? productos.find(p => p.id === item) : insumos.find(x => x.id === item);
  const u = esP ? 'u' : obj.u;
  const actual = esP ? obj.stock : obj.s;
  const n = Number(String(q).replace(',', '.'));
  const nuevo = tipo === 'ingreso' ? actual + (n || 0) : tipo === 'merma' ? actual - (n || 0) : (q === '' ? actual : n);
  const enviar = e => {
    e.preventDefault();
    const er = {};
    if (q === '' || isNaN(n) || n < 0 || (tipo !== 'ajuste' && n === 0)) er.q = tipo === 'ajuste' ? 'Escribe la cantidad que contaste.' : 'Escribe una cantidad mayor a 0.';
    else if (tipo === 'merma' && n > actual) er.q = `Solo hay ${cant(actual, u)} en stock.`;
    if (tipo === 'merma' && !nota.trim()) er.nota = 'Indica el motivo de la merma.';
    setErr(er);
    if (Object.keys(er).length) return;
    const c = Number(String(costo).replace(',', '.')) || 0;
    const val = r2(Math.max(0, nuevo));
    if (esP) setProductos(ps => ps.map(p => p.id === item ? { ...p, stock: val } : p));
    else setInsumos(xs => xs.map(x => x.id === item ? { ...x, s: val, costo: tipo === 'ingreso' && c > 0 ? r2(c / n) : x.costo } : x));
    setMovs(ms => [...ms, { id: Date.now(), h: hora(), tipo, item, q: tipo === 'ajuste' ? val : n, antes: actual, costo: tipo === 'ingreso' && c ? c : undefined, nota: nota.trim(), user:'Daniela Toledo' }]);
    aviso(`${tipo === 'ingreso' ? 'Ingreso' : tipo === 'merma' ? 'Merma' : 'Ajuste'} registrado · ${esP ? obj.nombre : obj.n}: ${cant(val, u)}`);
    setQ(''); setCosto(''); setNota('');
  };
  const T = { ingreso:['Ingreso o compra','down','Registrar ingreso'], merma:['Merma','up','Registrar merma'], ajuste:['Ajuste por conteo','scale','Guardar ajuste'] };
  return (
    <form className="card stack" style={{ gap:14 }} onSubmit={enviar} noValidate>
      <h2>Nuevo movimiento</h2>
      <div className="seg seg-3" role="group" aria-label="Tipo de movimiento">
        {Object.entries(T).map(([k, [l, ic]]) => <button type="button" key={k} aria-pressed={tipo === k} onClick={() => { setTipo(k); setErr({}); }}><Icon n={ic} s={20} />{l}</button>)}
      </div>
      <label className="field">Insumo o producto
        <select id="mov-item" className="input" value={item} onChange={e => { setItem(e.target.value); setErr({}); }}>
          <optgroup label="Insumos">{insumos.map(x => <option key={x.id} value={x.id}>{x.n} ({x.u})</option>)}</optgroup>
          {productos.length > 0 && <optgroup label="Productos con stock">{productos.map(p => <option key={p.id} value={p.id}>{p.nombre} (u)</option>)}</optgroup>}
        </select>
      </label>
      <div className="form-grid">
        <label className="field">{tipo === 'ajuste' ? 'Cantidad contada' : 'Cantidad'}
          <div className="input-pre input-post"><input id="mov-q" className="input num" inputMode="decimal" value={q} onChange={e => setQ(e.target.value)} placeholder="0" aria-invalid={!!err.q} /><span>{u}</span></div>
          {err.q && <span className="err">{err.q}</span>}
        </label>
        {tipo === 'ingreso' && (
          <label className="field">Costo total <span className="opt">opcional</span>
            <div className="input-pre"><span>Bs</span><input id="mov-costo" className="input num" inputMode="decimal" value={costo} onChange={e => setCosto(e.target.value)} placeholder="0" /></div>
          </label>
        )}
      </div>
      <label className="field">{tipo === 'ingreso' ? 'Proveedor o nota' : tipo === 'merma' ? 'Motivo' : 'Nota'} {tipo !== 'merma' && <span className="opt">opcional</span>}
        <input id="mov-nota" className="input" value={nota} onChange={e => setNota(e.target.value)} placeholder={tipo === 'ingreso' ? 'Ej. Lácteos Pil · factura 4530' : tipo === 'merma' ? 'Ej. Leche cortada, vaso roto' : 'Ej. Conteo de fin de semana'} aria-invalid={!!err.nota} />
        {err.nota && <span className="err">{err.nota}</span>}
      </label>
      <div className="diff num" style={{ background:'var(--surface-2)' }}>
        <span className="muted" style={{ fontWeight:600 }}>Stock</span>
        <b style={{ fontSize:18 }}>{cant(actual, u)} <span className="muted" style={{ fontWeight:500 }}>→</span> <span style={{ color: nuevo < actual ? 'var(--red-text)' : nuevo > actual ? 'var(--green-text)' : 'var(--ink)' }}>{cant(Math.max(0, r2(nuevo)), u)}</span></b>
      </div>
      {tipo === 'ingreso' && Number(costo) > 0 && n > 0 && !esP && <span className="muted num" style={{ fontSize:13.5 }}>El costo del insumo se actualizará a {bs(r2(Number(costo) / n))} por {u}, y con él el costo de las recetas.</span>}
      <button type="submit" className="btn btn-primary"><Icon n={T[tipo][1]} s={20} />{T[tipo][2]}</button>
    </form>
  );
}

function RecetaForm({ inicial, opciones, insumos, onSave, onDelete, onClose }) {
  const nueva = !inicial;
  const I = Object.fromEntries(insumos.map(x => [x.id, x]));
  const [prod, setProd] = useState(inicial ? inicial.prod : (opciones[0] || {}).id);
  const [rinde, setRinde] = useState(inicial ? inicial.rinde : 1);
  const [ing, setIng] = useState(inicial ? inicial.ing.map(([id, c], k) => ({ k, id, v: r2(c * factor(I[id].u)) })) : [{ k:0, id: insumos[0].id, v:'' }]);
  const [err, setErr] = useState('');
  const [borrar, setBorrar] = useState(false);
  useEscape(onClose);
  const p = P[prod];
  const setRow = (k, campo, val) => setIng(xs => xs.map(x => x.k === k ? { ...x, [campo]: val } : x));
  const filas = ing.map(x => ({ ...x, c: (Number(String(x.v).replace(',', '.')) || 0) / factor(I[x.id].u) }));
  const lote = filas.reduce((s, x) => s + I[x.id].costo * x.c, 0);
  const cu = lote / (Number(rinde) || 1);
  const margen = p ? Math.round((1 - cu / precioNeto(p.precio)) * 100) : 0;
  const enviar = e => {
    e.preventDefault();
    const usados = filas.map(x => x.id);
    if (!p) return setErr('Elige el producto.');
    if (!(Number(rinde) >= 1)) return setErr('El rendimiento debe ser al menos 1 porción.');
    if (!filas.some(x => x.c > 0)) return setErr('Agrega al menos un ingrediente con cantidad.');
    if (new Set(usados).size !== usados.length) return setErr('Hay un insumo repetido. Junta las cantidades en una sola fila.');
    onSave({ prod, rinde: Number(rinde), ing: filas.filter(x => x.c > 0).map(x => [x.id, x.c]) }, nueva);
  };
  return (
    <div className="scrim" onClick={onClose}>
      <form className="modal modal-lg" role="dialog" aria-modal="true" aria-labelledby="rf-t" onClick={e => e.stopPropagation()} onSubmit={enviar} noValidate>
        <div className="between">
          <div><div className="eyebrow">{nueva ? 'Nueva receta' : 'Editar receta'}</div><h2 id="rf-t" style={{ fontSize:24 }}>{p ? p.nombre : 'Receta'}</h2></div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icon n="x" s={20} /></button>
        </div>
        <div className="form-grid">
          <label className="field">Producto
            <select id="rf-prod" className="input" value={prod} disabled={!nueva} onChange={e => setProd(e.target.value)}>
              {(nueva ? opciones : [p]).map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
            </select>
          </label>
          <label className="field">Rinde (porciones)
            <input id="rf-rinde" className="input num" type="number" min="1" value={rinde} onChange={e => setRinde(e.target.value)} />
          </label>
        </div>
        <div className="stack" style={{ gap:8 }}>
          <div className="ing-row ing-head" aria-hidden="true"><span>Insumo</span><span>Cantidad</span><span>Costo</span><span /></div>
          {filas.map(x => (
            <div className="ing-row" key={x.k}>
              <select className="input" value={x.id} onChange={e => setRow(x.k, 'id', e.target.value)} aria-label="Insumo">{insumos.map(o => <option key={o.id} value={o.id}>{o.n}</option>)}</select>
              <div className="input-pre input-post"><input className="input num" inputMode="decimal" value={x.v} onChange={e => setRow(x.k, 'v', e.target.value)} placeholder="0" aria-label={`Cantidad de ${I[x.id].n}`} /><span>{chica(I[x.id].u)}</span></div>
              <span className="num ing-cost">{bs(r2(I[x.id].costo * x.c))}</span>
              <button type="button" className="icon-btn" onClick={() => setIng(xs => xs.filter(y => y.k !== x.k))} aria-label={`Quitar ${I[x.id].n}`} disabled={ing.length === 1}><Icon n="trash" s={18} /></button>
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf:'flex-start' }} onClick={() => setIng(xs => [...xs, { k: Date.now(), id: insumos.find(o => !xs.some(y => y.id === o.id))?.id || insumos[0].id, v:'' }])}><Icon n="plus" s={18} />Agregar ingrediente</button>
        </div>
        <div className="recipe-sum num">
          <div><span className="muted">Costo del lote</span><b>{bs(r2(lote))}</b></div>
          <div><span className="muted">Costo por porción</span><b>{bs(r2(cu))}</b></div>
          <div><span className="muted">{FISCAL.simplificado ? 'Precio de venta' : 'Precio sin IVA'}</span><b>{p ? bs(r2(precioNeto(p.precio))) : '—'}</b></div>
          <div><span className="muted">Margen</span><b><span className={'pill ' + (margen >= 60 ? 'pill-green' : margen >= 40 ? 'pill-gold' : 'pill-red')}>{margen}%</span></b></div>
        </div>
        <span className="muted" style={{ fontSize:13 }}>{FISCAL.simplificado ? 'Margen calculado sobre el precio de venta (RTS: el impuesto es una cuota fija bimestral).' : 'Margen calculado sobre el precio sin IVA (13 %).'}</span>
        {err && <div className="err" role="alert">{err}</div>}
        {borrar ? (
          <div className="confirm">
            <b>¿Eliminar la receta de {p.nombre}?</b>
            <span>El producto sigue en el menú, pero ya no descontará insumos.</span>
            <div className="row"><button type="button" className="btn btn-ghost" style={{ flex:1 }} onClick={() => setBorrar(false)}>Cancelar</button><button type="button" className="btn btn-danger" style={{ flex:1 }} onClick={() => onDelete(inicial)}>Sí, eliminar</button></div>
          </div>
        ) : (
          <div className="form-actions">
            {!nueva && <button type="button" className="btn btn-ghost danger-text" onClick={() => setBorrar(true)}><Icon n="trash" s={18} />Eliminar receta</button>}
            <span style={{ flex:1 }} />
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary">{nueva ? 'Crear receta' : 'Guardar receta'}</button>
          </div>
        )}
      </form>
    </div>
  );
}

/* ============ 6. Reportes ============ */
function Reportes({ offline, aviso }) {
  const [cargando, setCargando] = useState(true);
  useEffect(() => { const t = setTimeout(() => setCargando(false), 650); return () => clearTimeout(t); }, []);
  if (cargando) return (
    <div aria-busy="true" aria-label="Cargando reportes">
      <div className="kpis">{[0, 1, 2, 3].map(i => <div key={i} className="card kpi"><div className="sk" style={{ width:'45%', height:12 }} /><div className="sk" style={{ width:'70%', height:30, marginTop:12 }} /><div className="sk" style={{ width:'55%', height:12, marginTop:10 }} /></div>)}</div>
      <div className="grid-2"><div className="card"><div className="sk" style={{ height:230 }} /></div><div className="card"><div className="sk" style={{ height:230 }} /></div></div>
    </div>
  );
  return (<>
    {offline && <div className="fiscal-warn" style={{ marginBottom:14 }}><Icon n="wifi" s={20} /><span>Sin conexión: muestras los datos guardados en este equipo. Se actualizarán al volver internet.</span></div>}
    <ReportesContenido aviso={aviso} />
  </>);
}
let REP = { horas:[], semana:[], v30:[], top:[], cats:[], kpi:{ ventasC:0, tickets:0, promedioC:0, picoH:null, pico:'—', antC:0, ant7C:0, ant30C:0, tickets7:0, tickets30:0 } };
/* ============ 7. Usuarios y roles ============ */
function reglaCuenta(u, yo, usuarios, accion) {
  if (u.id === yo.id) return accion === 'eliminar' ? 'No puedes eliminar tu propia cuenta.' : 'No puedes desactivar tu propia cuenta.';
  if (u.rol === 'dueno' && u.activo && usuarios.filter(x => x.rol === 'dueno' && x.activo).length <= 1) return 'Debe quedar al menos un dueño activo.';
  return null;
}
function Usuarios({ usuarios, setUsuarios, perms, setPerms, yo, log, registrar, aviso }) {
  const [tab, setTab] = useState('personal');
  const [q, setQ] = useState('');
  const [fr, setFr] = useState('todos');
  const [fe, setFe] = useState('activos');
  const [edit, setEdit] = useState(null);
  const lista = usuarios.filter(u => (fr === 'todos' || u.rol === fr) && (fe === 'todos' || (fe === 'activos') === u.activo) && (u.nombre + ' ' + u.puesto).toLowerCase().includes(q.toLowerCase()));
  const guardar = (u, nuevo) => {
    setUsuarios(us => nuevo ? [...us, u] : us.map(x => x.id === u.id ? u : x));
    registrar(nuevo ? `Creó el usuario ${u.nombre} (${ROLES[u.rol].label})` : `Editó el usuario ${u.nombre}`);
    aviso(nuevo ? `${u.nombre} creado. Ya puede entrar con su PIN.` : `${u.nombre} actualizado`);
    setEdit(null);
  };
  const eliminar = u => { setUsuarios(us => us.filter(x => x.id !== u.id)); registrar(`Eliminó el usuario ${u.nombre}`); aviso(`${u.nombre} eliminado`, 'trash'); setEdit(null); };
  const toggleActivo = u => {
    const r = reglaCuenta(u, yo, usuarios, 'desactivar');
    if (u.activo && r) { aviso(r, 'alert'); return; }
    setUsuarios(us => us.map(x => x.id === u.id ? { ...x, activo: !x.activo } : x));
    registrar(`${u.activo ? 'Desactivó' : 'Activó'} la cuenta de ${u.nombre}`);
    aviso(u.activo ? `${u.nombre} ya no puede entrar al sistema` : `${u.nombre} puede volver a entrar`);
  };
  const togglePerm = (r, k) => {
    const tiene = perms[r].includes(k);
    setPerms(p => ({ ...p, [r]: tiene ? p[r].filter(x => x !== k) : [...p[r], k] }));
    registrar(`${tiene ? 'Quitó' : 'Dio'} el permiso "${PERMISOS.find(x => x.k === k).l}" al rol ${ROLES[r].label}`);
  };
  const activos = usuarios.filter(u => u.activo).length;
  return (<>
    <div className="page-head">
      <div className="tabs" role="group" aria-label="Sección">
        <button aria-pressed={tab === 'personal'} onClick={() => setTab('personal')}>Personal · {activos}</button>
        <button aria-pressed={tab === 'roles'} onClick={() => setTab('roles')}>Roles y permisos</button>
        <button aria-pressed={tab === 'actividad'} onClick={() => setTab('actividad')}>Actividad</button>
      </div>
      <div className="row head-actions"><BotonExcel onExport={() => guardarExcel(nombreArchivo(NEGOCIO, 'usuarios-y-actividad'), [
        { nombre:'Personal', titulo:`${NEGOCIO} · Personal`, sub:'Los PIN no se exportan', columnas:['Nombre', 'Puesto', 'Rol', 'Turno', 'Celular', 'Estado', 'Último acceso'], filas: usuarios.map(u => [u.nombre, u.puesto || '', ROLES[u.rol].label, u.turno, u.tel || '', u.activo ? 'Activo' : 'Inactivo', u.ultimo]) },
        { nombre:'Permisos', titulo:'Permisos por rol', columnas:['Permiso', ...Object.values(ROLES).map(r => r.label)], filas: PERMISOS.map(p => [p.l, ...Object.keys(ROLES).map(r => perms[r].includes(p.k) ? 'Sí' : 'No')]) },
        { nombre:'Actividad', titulo:'Actividad registrada', columnas:['Cuándo', 'Quién', 'Qué hizo'], filas: [...log].reverse().map(l => [l.h, l.quien, l.que]) },
      ], aviso)} etiqueta="Exportar" />
      {tab === 'personal' && <button className="btn btn-primary" onClick={() => setEdit('nuevo')}><Icon n="plus" s={20} />Nuevo usuario</button>}</div>
    </div>

    {tab === 'personal' && (
      <section className="card">
        <div className="toolbar">
          <label className="search" style={{ margin:0, flex:'1 1 220px' }}><Icon n="search" s={20} /><input id="buscar-user" className="input" placeholder="Buscar por nombre o puesto…" value={q} onChange={e => setQ(e.target.value)} /></label>
          <select id="f-rol" className="input" style={{ flex:'0 1 190px' }} value={fr} onChange={e => setFr(e.target.value)} aria-label="Filtrar por rol">
            <option value="todos">Todos los roles</option>{Object.entries(ROLES).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}
          </select>
          <select id="f-estado" className="input" style={{ flex:'0 1 170px' }} value={fe} onChange={e => setFe(e.target.value)} aria-label="Filtrar por estado">
            <option value="activos">Activos</option><option value="inactivos">Inactivos</option><option value="todos">Todos</option>
          </select>
        </div>
        <div className="plist">
          <div className="urow prow-head" aria-hidden="true"><span /><span>Nombre</span><span>Rol</span><span>Turno</span><span>Último acceso</span><span>Activo</span><span /></div>
          {lista.map(u => {
            const r = ROLES[u.rol];
            return (
              <div className="urow" key={u.id} style={u.activo ? undefined : { opacity:.62 }}>
                <div className="avatar" style={{ width:48, height:48, borderRadius:14, fontSize:16, background:r.bg, color:r.fg }}>{iniciales(u.nombre)}</div>
                <div style={{ minWidth:0 }}>
                  <b className="prow-name">{u.nombre} {u.id === yo.id && <span className="pill pill-gray" style={{ marginLeft:4 }}>Tú</span>}</b>
                  <div className="muted" style={{ fontSize:13 }}>{u.puesto || '—'}{u.tel ? ` · ${u.tel}` : ''}</div>
                </div>
                <span className="u-rol"><span className="pill" style={{ background:r.bg, color:r.fg }}>{r.label}</span></span>
                <span className="u-turno muted">{u.turno}</span>
                <span className="u-ult muted num">{u.ultimo}</span>
                <span className="prow-sw"><button className="switch" role="switch" aria-checked={u.activo} aria-label={`Cuenta de ${u.nombre} activa`} onClick={() => toggleActivo(u)} /></span>
                <button className="btn btn-ghost btn-sm prow-edit" onClick={() => setEdit(u)}><Icon n="edit" s={18} />Editar</button>
              </div>
            );
          })}
          {!lista.length && <div className="empty"><b>No hay usuarios con ese filtro.</b><button className="btn btn-ghost btn-sm" onClick={() => { setQ(''); setFr('todos'); setFe('todos'); }}>Ver todos</button></div>}
        </div>
      </section>
    )}

    {tab === 'roles' && (<div className="stack">
      <div className="roles">
        {Object.entries(ROLES).map(([k, r]) => (
          <article className="card" key={k} style={{ padding:16 }}>
            <div className="between"><span className="pill" style={{ background:r.bg, color:r.fg, fontSize:13.5 }}>{r.label}</span><span className="muted num" style={{ fontSize:13 }}>{usuarios.filter(u => u.rol === k && u.activo).length} activos</span></div>
            <p className="muted" style={{ margin:'10px 0 4px', fontSize:14 }}>{r.desc}</p>
            <b className="num" style={{ fontSize:13.5 }}>{perms[k].length} de {PERMISOS.length} permisos</b>
          </article>
        ))}
      </div>
      <section className="card">
        <div className="between" style={{ marginBottom:8, flexWrap:'wrap' }}><h2>Permisos por rol</h2><span className="muted" style={{ fontSize:13.5 }}>Los cambios se aplican al instante. El dueño siempre tiene acceso total.</span></div>
        <div className="matrix-wrap">
          <table className="matrix">
            <thead><tr><th>Permiso</th>{Object.entries(ROLES).map(([k, r]) => <th key={k}><span className="pill" style={{ background:r.bg, color:r.fg }}>{r.label}</span></th>)}</tr></thead>
            <tbody>
              {PERMISOS.map(p => (
                <tr key={p.k}><td style={{ fontWeight:600 }}>{p.l}</td>
                  {Object.keys(ROLES).map(r => (
                    <td key={r}><button className="switch" role="switch" aria-checked={perms[r].includes(p.k)} aria-label={`${p.l} para ${ROLES[r].label}`} disabled={r === 'dueno'} onClick={() => togglePerm(r, p.k)} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>)}

    {tab === 'actividad' && (
      <section className="card">
        <div className="between" style={{ marginBottom:6 }}><h2>Actividad reciente</h2><span className="muted" style={{ fontSize:13.5 }}>Accesos y cambios en usuarios, permisos y configuración</span></div>
        {[...log].reverse().map(l => (
          <div className="kv" key={l.id}>
            <div className="row" style={{ gap:12, minWidth:0 }}>
              <div className="avatar" style={{ width:38, height:38, borderRadius:12, fontSize:13, background:'var(--surface-2)', color:'var(--muted)' }}>{iniciales(l.quien)}</div>
              <div style={{ minWidth:0 }}><b>{l.quien}</b><div className="muted" style={{ fontSize:13.5 }}>{l.que}</div></div>
            </div>
            <span className="muted num" style={{ whiteSpace:'nowrap', fontSize:13 }}>{l.h}</span>
          </div>
        ))}
      </section>
    )}

    {edit && <UserForm inicial={edit === 'nuevo' ? null : edit} {...{ usuarios, yo, perms }} onSave={guardar} onDelete={eliminar} onClose={() => setEdit(null)} />}
  </>);
}

function UserForm({ inicial, usuarios, yo, perms, onSave, onDelete, onClose }) {
  const nuevo = !inicial;
  const [f, setF] = useState(inicial ? { ...inicial } : { id:'u' + Date.now(), nombre:'', puesto:'', rol:'mozo', tel:'', email:'', turno:'Tarde', pin:'', activo:true, ultimo:'Nunca' });
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [cambiarPin, setCambiarPin] = useState(nuevo);
  const [err, setErr] = useState({});
  const [borrar, setBorrar] = useState(false);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  useEscape(onClose);
  const reglaBorrar = inicial ? reglaCuenta(inicial, yo, usuarios, 'eliminar') : null;
  const reglaActivo = inicial ? reglaCuenta(inicial, yo, usuarios, 'desactivar') : null;
  const enviar = e => {
    e.preventDefault();
    const er = {};
    const nombre = f.nombre.trim().replace(/\s+/g, ' ');
    if (!nombre) er.nombre = 'Escribe el nombre de la persona.';
    else if (usuarios.some(u => u.id !== f.id && u.nombre.toLowerCase() === nombre.toLowerCase())) er.nombre = 'Ya existe un usuario con ese nombre. Agrega el apellido.';
    if (f.tel && !/^[67]\d{7}$/.test(f.tel.replace(/\s/g, ''))) er.tel = 'Usa un celular boliviano de 8 dígitos que empiece con 6 o 7.';
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) er.email = 'Revisa el correo, falta algo (ej. nombre@gmail.com).';
    if (cambiarPin) {
      if (!/^\d{4}$/.test(pin)) er.pin = 'El PIN debe tener exactamente 4 números.';
      else if (/^(\d)\1{3}$/.test(pin) || pin === '1234') er.pin = 'Ese PIN es muy fácil de adivinar. Elige otro.';
      else if (pin !== pin2) er.pin2 = 'Los dos PIN no coinciden.';
    }
    if (inicial && inicial.rol === 'dueno' && f.rol !== 'dueno' && usuarios.filter(u => u.rol === 'dueno' && u.activo).length <= 1) er.rol = 'Debe quedar al menos un dueño activo.';
    if (inicial && inicial.id === yo.id && f.rol !== inicial.rol) er.rol = 'No puedes cambiar tu propio rol. Pídeselo a otro dueño.';
    setErr(er);
    if (Object.keys(er).length) return;
    onSave({ ...f, nombre, tel: f.tel.replace(/\s/g, ''), pin: cambiarPin ? pin : f.pin }, nuevo);
  };
  const r = ROLES[f.rol];
  return (
    <div className="scrim" onClick={onClose}>
      <form className="modal modal-lg" role="dialog" aria-modal="true" aria-labelledby="uf-t" onClick={e => e.stopPropagation()} onSubmit={enviar} noValidate>
        <div className="between">
          <div className="row" style={{ gap:14 }}>
            <div className="avatar" style={{ background:r.bg, color:r.fg }}>{f.nombre.trim() ? iniciales(f.nombre) : '?'}</div>
            <div><div className="eyebrow">{nuevo ? 'Nuevo usuario' : 'Editar usuario'}</div><h2 id="uf-t" style={{ fontSize:24 }}>{f.nombre.trim() || 'Persona del equipo'}</h2></div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icon n="x" s={20} /></button>
        </div>
        <div className="form-grid">
          <label className="field">Nombre y apellido
            <input id="uf-nombre" className="input" value={f.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Ej. Karen Suárez" aria-invalid={!!err.nombre} />
            {err.nombre && <span className="err">{err.nombre}</span>}
          </label>
          <label className="field">Puesto <span className="opt">opcional</span>
            <input id="uf-puesto" className="input" value={f.puesto} onChange={e => set('puesto', e.target.value)} placeholder="Ej. Barista, Salón, Repostería" />
          </label>
          <div className="field span-2">Rol
            <div className="seg" role="group" aria-label="Rol">
              {Object.entries(ROLES).map(([k, x]) => <button type="button" key={k} aria-pressed={f.rol === k} onClick={() => set('rol', k)}>{x.label}</button>)}
            </div>
            <span style={{ fontWeight:500 }}>{r.desc} Podrá usar: {PERMISOS.filter(p => perms[f.rol].includes(p.k)).map(p => p.l.toLowerCase()).join(', ')}.</span>
            {err.rol && <span className="err">{err.rol}</span>}
          </div>
          <label className="field">Turno
            <select id="uf-turno" className="input" value={f.turno} onChange={e => set('turno', e.target.value)}>{TURNOS.map(t => <option key={t}>{t}</option>)}</select>
          </label>
          <label className="field">Celular <span className="opt">opcional</span>
            <input id="uf-tel" className="input num" inputMode="tel" value={f.tel} onChange={e => set('tel', e.target.value)} placeholder="Ej. 70012345" aria-invalid={!!err.tel} />
            {err.tel && <span className="err">{err.tel}</span>}
          </label>
          <label className="field span-2">Correo de contacto <span className="opt">opcional</span>
            <input id="uf-email" className="input" type="email" value={f.email} onChange={e => set('email', e.target.value)} placeholder="nombre@gmail.com" aria-invalid={!!err.email} />
            {err.email && <span className="err">{err.email}</span>}
          </label>
          <div className="field span-2 pin-box">
            <div className="between" style={{ flexWrap:'wrap' }}>
              <span className="row" style={{ gap:8 }}><Icon n="key" s={19} /><b style={{ color:'var(--ink)' }}>PIN de acceso</b></span>
              {!nuevo && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setCambiarPin(c => !c); setPin(''); setPin2(''); setErr({}); }}>{cambiarPin ? 'Mantener PIN actual' : 'Cambiar PIN'}</button>}
            </div>
            {cambiarPin ? (
              <div className="form-grid">
                <label className="field">PIN nuevo (4 números)
                  <input id="uf-pin" className="input num pin-in" type="password" inputMode="numeric" maxLength={4} autoComplete="new-password" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} aria-invalid={!!err.pin} />
                  {err.pin && <span className="err">{err.pin}</span>}
                </label>
                <label className="field">Repite el PIN
                  <input id="uf-pin2" className="input num pin-in" type="password" inputMode="numeric" maxLength={4} autoComplete="new-password" value={pin2} onChange={e => setPin2(e.target.value.replace(/\D/g, ''))} aria-invalid={!!err.pin2} />
                  {err.pin2 && <span className="err">{err.pin2}</span>}
                </label>
              </div>
            ) : <span style={{ fontWeight:500 }}>El PIN actual sigue igual. Dáselo a la persona en privado.</span>}
          </div>
          {!nuevo ? <AccesoApp usuario={inicial} rol={f.rol} /> : <div className="field span-2 fiscal-note"><Icon n="shield" s={18} /><span>Después de crear a la persona, ábrela otra vez con "Editar" si quieres darle un correo y una contraseña para su propio equipo.</span></div>}
          <div className="field span-2 toggle-row">
            <div><b style={{ color:'var(--ink)' }}>Cuenta activa</b><div style={{ fontWeight:500 }}>{reglaActivo && f.activo ? reglaActivo : 'Si la apagas, la persona no podrá entrar, pero su historial se conserva.'}</div></div>
            <button type="button" className="switch" role="switch" aria-checked={f.activo} aria-label="Cuenta activa" disabled={!!reglaActivo && f.activo} onClick={() => set('activo', !f.activo)} />
          </div>
        </div>
        {borrar ? (
          <div className="confirm">
            <b>¿Eliminar a {inicial.nombre}?</b>
            <span>Ya no aparecerá en la lista. Si solo dejó de trabajar por un tiempo, mejor desactiva su cuenta.</span>
            <div className="row"><button type="button" className="btn btn-ghost" style={{ flex:1 }} onClick={() => setBorrar(false)}>Cancelar</button><button type="button" className="btn btn-danger" style={{ flex:1 }} onClick={() => onDelete(inicial)}>Sí, eliminar</button></div>
          </div>
        ) : (
          <div className="form-actions">
            {!nuevo && <button type="button" className="btn btn-ghost danger-text" disabled={!!reglaBorrar} title={reglaBorrar || ''} onClick={() => setBorrar(true)}><Icon n="trash" s={18} />Eliminar</button>}
            {!nuevo && reglaBorrar && <span className="muted" style={{ fontSize:13 }}>{reglaBorrar}</span>}
            <span style={{ flex:1 }} />
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary">{nuevo ? 'Crear usuario' : 'Guardar cambios'}</button>
          </div>
        )}
      </form>
    </div>
  );
}

/* Pantalla de cambio de usuario con PIN */
function Bloqueo({ usuarios, config, onEntrar, onCancel }) {
  const [sel, setSel] = useState(null);
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const teclear = d => {
    if (!sel) return;
    if (d === 'del') { setPin(p => p.slice(0, -1)); setErr(''); return; }
    setPin(p => {
      if (p.length >= 4) return p;
      const np = p + d;
      if (np.length === 4) {
        if (np === sel.pin) setTimeout(() => onEntrar(sel), 120);
        else { setErr('PIN incorrecto. Intenta de nuevo.'); setTimeout(() => setPin(''), 400); }
      } else setErr('');
      return np;
    });
  };
  useEffect(() => {
    const k = e => { if (/^\d$/.test(e.key)) teclear(e.key); else if (e.key === 'Backspace') teclear('del'); else if (e.key === 'Escape') sel ? (setSel(null), setPin('')) : onCancel(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [sel]);
  return (
    <div className="lock" role="dialog" aria-modal="true" aria-label="Elegir usuario">
      <button className="icon-btn lock-close" onClick={onCancel} aria-label="Volver"><Icon n="x" s={20} /></button>
      <div className="lock-inner">
        <Logo src={config.logo} nombre={config.nombre} cls="lock-logo" />
        <h1 style={{ color:'var(--side-ink)' }}>{config.nombre}</h1>
        <span className="lock-app">GastroMetrik</span>
        {!sel ? (<>
          <p className="lock-sub">¿Quién eres?</p>
          <div className="lock-users">
            {usuarios.map(u => { const r = ROLES[u.rol]; return (
              <button key={u.id} className="lock-user" onClick={() => { setSel(u); setPin(''); setErr(''); }}>
                <span className="avatar" style={{ background:r.bg, color:r.fg }}>{iniciales(u.nombre)}</span>
                <b>{u.nombre}</b><span>{r.label}</span>
              </button>
            ); })}
          </div>
        </>) : (<>
          <p className="lock-sub">Hola, {sel.nombre.split(' ')[0]}. Ingresa tu PIN</p>
          <div className={'pin-dots' + (err ? ' shake' : '')} aria-label={`${pin.length} de 4 números`}>{[0,1,2,3].map(i => <i key={i} className={i < pin.length ? 'on' : ''} />)}</div>
          <div className="lock-err" role="alert">{err}</div>
          <div className="keypad">
            {['1','2','3','4','5','6','7','8','9'].map(d => <button key={d} onClick={() => teclear(d)}>{d}</button>)}
            <button onClick={() => { setSel(null); setPin(''); }} aria-label="Elegir otro usuario"><Icon n="back" s={24} /></button>
            <button onClick={() => teclear('0')}>0</button>
            <button onClick={() => teclear('del')} aria-label="Borrar"><Icon n="del" s={24} /></button>
          </div>
        </>)}
        <Creditos variante="en-acceso" />
      </div>
    </div>
  );
}

/* ============ Configuración del negocio ============ */
function Configuracion({ config, setConfig, registrar, aviso }) {
  const [f, setF] = useState(config);
  const [err, setErr] = useState({});
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const sucio = JSON.stringify(f) !== JSON.stringify(config);
  const subirLogo = e => {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    if (!file.type.startsWith('image/')) { setErr(x => ({ ...x, logo:'El archivo debe ser una imagen (PNG o JPG).' })); return; }
    setErr(x => ({ ...x, logo:null }));
    leerImagen(file, 400, url => set('logo', url));
    e.target.value = '';
  };
  const guardar = e => {
    e.preventDefault();
    const er = {};
    if (!f.nombre.trim()) er.nombre = 'Escribe el nombre de la cafetería.';
    else if (f.nombre.trim().length > 32) er.nombre = 'Usa 32 caracteres o menos para que se lea bien en el menú.';
    if (f.simplificado && f.rtsCapital !== '' && !(Number(f.rtsCapital) > 0)) er.rtsCapital = 'Escribe el capital declarado en bolivianos, solo números.';
    if (f.nit && !/^\d{6,13}$/.test(f.nit)) er.nit = 'El NIT solo lleva números (entre 6 y 13).';
    if (f.tel && !/^\d{7,8}$/.test(f.tel.replace(/\s/g, ''))) er.tel = 'Usa 7 u 8 dígitos (ej. 33445566 o 70012345).';
    setErr(er);
    if (Object.keys(er).length) return;
    const nuevo = { ...f, nombre: f.nombre.trim(), eslogan: f.eslogan.trim() };
    const cambios = [];
    if (nuevo.nombre !== config.nombre) cambios.push(`el nombre a "${nuevo.nombre}"`);
    if (nuevo.logo !== config.logo) cambios.push('el logo');
    if (['rtsActividad','rtsCapital'].some(k => nuevo[k] !== config[k])) cambios.push('los datos del RTS');
    if (['eslogan','razon','nit','dir','tel','pie'].some(k => nuevo[k] !== config[k])) cambios.push('los datos del negocio');
    if (nuevo.simplificado !== config.simplificado) cambios.push(nuevo.simplificado ? 'el régimen fiscal a Régimen Tributario Simplificado (RTS)' : 'el régimen fiscal a Régimen General con factura');
    setConfig(nuevo); setF(nuevo);
    registrar(`Cambió ${cambios.join(', ') || 'la configuración'}`);
    aviso('Configuración guardada');
  };
  return (
    <form onSubmit={guardar} noValidate>
      <div className="grid-2 cfg">
        <div className="stack">
          <section className="card stack" style={{ gap:16 }}>
            <div><h2>Identidad</h2><span className="muted">Se usa en el menú lateral, la pantalla de acceso y los tickets.</span></div>
            <div className="logo-edit">
              <Logo src={f.logo} nombre={f.nombre} cls="logo-big" />
              <div className="stack" style={{ gap:8 }}>
                <b>Logo</b>
                <span className="muted" style={{ fontSize:13.5 }}>Imagen cuadrada en PNG o JPG, de 400 × 400 px o más. Se recorta en círculo.</span>
                <div className="row" style={{ flexWrap:'wrap' }}>
                  <label className="btn btn-ghost btn-sm" style={{ cursor:'pointer' }}><Icon n="camera" s={18} />Subir logo<input id="cfg-logo" type="file" accept="image/png,image/jpeg,image/webp" onChange={subirLogo} style={{ display:'none' }} /></label>
                  {f.logo && <button type="button" className="btn btn-ghost btn-sm" onClick={() => set('logo', null)}>Restaurar logo original</button>}
                </div>
                {err.logo && <span className="err">{err.logo}</span>}
              </div>
            </div>
            <div className="form-grid">
              <label className="field">Nombre de la cafetería
                <input id="cfg-nombre" className="input" value={f.nombre} onChange={e => set('nombre', e.target.value)} aria-invalid={!!err.nombre} />
                {err.nombre && <span className="err">{err.nombre}</span>}
              </label>
              <label className="field">Frase corta <span className="opt">opcional</span>
                <input id="cfg-eslogan" className="input" value={f.eslogan} onChange={e => set('eslogan', e.target.value)} placeholder="Ej. Café · arte · música" maxLength={40} />
              </label>
            </div>
          </section>
          <section className="card stack" style={{ gap:16 }}>
            <div><h2>{f.simplificado ? 'Datos para tickets' : 'Datos para tickets y facturas'}</h2><span className="muted">Aparecen en la cabecera de cada ticket impreso.</span></div>
            <div className="form-grid">
              <label className="field">Razón social
                <input id="cfg-razon" className="input" value={f.razon} onChange={e => set('razon', e.target.value)} />
              </label>
              <label className="field">{f.simplificado ? 'NIT o CI (RTS)' : 'NIT'}
                <input id="cfg-nit" className="input num" inputMode="numeric" value={f.nit} onChange={e => set('nit', e.target.value.replace(/\D/g, ''))} placeholder="Ej. 1023456027" aria-invalid={!!err.nit} />
                {err.nit && <span className="err">{err.nit}</span>}
              </label>
              <label className="field span-2">Dirección
                <input id="cfg-dir" className="input" value={f.dir} onChange={e => set('dir', e.target.value)} placeholder="Calle, número, zona" />
              </label>
              <label className="field">Teléfono
                <input id="cfg-tel" className="input num" inputMode="tel" value={f.tel} onChange={e => set('tel', e.target.value)} placeholder="Ej. 33445566" aria-invalid={!!err.tel} />
                {err.tel && <span className="err">{err.tel}</span>}
              </label>
              <label className="field span-2">Mensaje al pie del ticket
                <textarea id="cfg-pie" className="input" rows={2} value={f.pie} onChange={e => set('pie', e.target.value)} maxLength={120} />
              </label>
            </div>
          </section>
          <section className="card stack" style={{ gap:14 }}>
            <div><h2>Régimen fiscal</h2><span className="muted">Define si el sistema muestra IVA y pide datos de factura.</span></div>
            <label className={'check-row' + (f.simplificado ? ' on' : '')} htmlFor="cfg-simple">
              <input id="cfg-simple" type="checkbox" checked={!!f.simplificado} onChange={e => set('simplificado', e.target.checked)} />
              <span className="check-box" aria-hidden="true"><Icon n="check" s={18} w={2.6} /></span>
              <span><b>Régimen Tributario Simplificado (RTS)</b><span className="muted" style={{ display:'block', fontSize:13.5 }}>Márcalo si pagas el monotributo bimestral y no emites factura con IVA.</span></span>
            </label>
            {f.simplificado && <RtsDetalle f={f} set={set} err={err} />}
            <div className="fiscal-list">
              <b>{f.simplificado ? 'Con RTS el sistema:' : 'Con Régimen General el sistema:'}</b>
              {(f.simplificado ? [
                'Muestra los precios sin la leyenda "IVA incluido".',
                'No pide NIT ni razón social al cobrar; entrega ticket de venta.',
                'Imprime "Sin derecho a crédito fiscal" en el ticket.',
                'Calcula márgenes sobre el precio completo; el impuesto es la cuota fija.',
                'Avisa si un precio supera el máximo unitario de tu actividad.',
              ] : [
                'Indica que los precios incluyen IVA (13 %).',
                'Pide NIT o CI y razón social para emitir factura.',
                'Muestra el IVA incluido en el ticket y en el cierre de caja.',
                'Calcula márgenes sobre el precio sin IVA.',
              ]).map(x => <span key={x} className="row" style={{ gap:8, alignItems:'flex-start' }}><span style={{ color:'var(--green-text)', marginTop:2 }}><Icon n="check" s={16} w={2.4} /></span>{x}</span>)}
            </div>
            <span className="muted" style={{ fontSize:13 }}>Confirma tu régimen y tu categoría con tu contador o en el SIN antes de cambiarlos. Los montos de esta pantalla son de referencia.</span>
          </section>
        </div>
        <aside className="stack cfg-prev">
          <section className="card stack" style={{ gap:12 }}>
            <div className="eyebrow">Vista previa · menú lateral</div>
            <div className="brand-prev"><Logo src={f.logo} nombre={f.nombre} /><div style={{ minWidth:0 }}><div className="brand-name">{f.nombre || 'Nombre'}</div><div className="brand-sub">{f.eslogan}</div></div></div>
          </section>
          <section className="card stack" style={{ gap:12 }}>
            <div className="eyebrow">Vista previa · ticket de 80 mm</div>
            <div className="paper num">
              <Logo src={f.logo} nombre={f.nombre} cls="paper-logo" />
              <b style={{ fontSize:15 }}>{f.nombre || 'Nombre'}</b>
              <span>{f.razon}{f.nit ? ` · ${f.simplificado ? 'NIT/CI' : 'NIT'} ${f.nit}` : ''}</span>
              {f.simplificado && <span>Régimen Tributario Simplificado{rtsCategoria(Number(f.rtsCapital)) ? ` · Cat. ${rtsCategoria(Number(f.rtsCapital)).cat}` : ''}</span>}
              <span>{f.dir}</span>
              {f.tel && <span>Tel. {f.tel}</span>}
              <span className="paper-rule" />
              <span className="paper-line"><span>Ticket N° 0147 · Mesa 2</span><span>{hora()}</span></span>
              <span className="paper-line"><span>2 × Latte</span><span>36,00</span></span>
              <span className="paper-line"><span>1 × Croissant de mantequilla</span><span>14,00</span></span>
              <span className="paper-rule" />
              <span className="paper-line" style={{ fontWeight:800, fontSize:14 }}><span>TOTAL Bs</span><span>50,00</span></span>
              {f.simplificado ? <span style={{ fontWeight:700 }}>SIN DERECHO A CRÉDITO FISCAL</span> : <span className="paper-line"><span>Incluye IVA 13 %</span><span>6,50</span></span>}
              <span className="paper-rule" />
              <span style={{ fontStyle:'italic' }}>{f.pie}</span>
            </div>
          </section>
        </aside>
      </div>
      {sucio && (
        <div className="savebar" role="status">
          <span><b>Tienes cambios sin guardar</b></span>
          <div className="row">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setF(config); setErr({}); }}>Descartar</button>
            <button type="submit" className="btn btn-primary btn-sm">Guardar cambios</button>
          </div>
        </div>
      )}
    </form>
  );
}


/* Detalle del RTS en Configuración */
function RtsDetalle({ f, set, err }) {
  const act = RTS_ACTIVIDADES[f.rtsActividad] || RTS_ACTIVIDADES.vivandero;
  const cap = Number(f.rtsCapital);
  const cat = rtsCategoria(cap);
  const caros = Object.values(P).filter(p => !p.eliminado && p.precio > act.pmax);
  const dias = Math.ceil(RTS_VENTAS_MAX / VENTAS_HOY);
  const capAlto = cap > 60000, capBajo = f.rtsCapital !== '' && cap > 0 && cap < 12001;
  return (
    <div className="stack" style={{ gap:14 }}>
      <div className="form-grid">
        <label className="field">Actividad en el RTS
          <select id="cfg-rts-act" className="input" value={f.rtsActividad} onChange={e => set('rtsActividad', e.target.value)}>
            {Object.entries(RTS_ACTIVIDADES).map(([k, a]) => <option key={k} value={k}>{a.l}</option>)}
          </select>
          <span style={{ fontWeight:500 }}>{act.d}</span>
        </label>
        <label className="field">Capital declarado en el RNC
          <div className="input-pre"><span>Bs</span><input id="cfg-rts-cap" className="input num" inputMode="numeric" value={f.rtsCapital} onChange={e => set('rtsCapital', e.target.value.replace(/\D/g, ''))} placeholder="Ej. 25000" aria-invalid={!!err.rtsCapital} /></div>
          {err.rtsCapital && <span className="err">{err.rtsCapital}</span>}
        </label>
      </div>
      <div className="rts-cats" role="table" aria-label="Categorías del RTS">
        <div className="rts-row rts-head" role="row"><span>Cat.</span><span>Capital desde</span><span>Hasta</span><span>Pago bimestral</span></div>
        {RTS_CATEGORIAS.map(c => (
          <div key={c.cat} role="row" className={'rts-row num' + (cat && cat.cat === c.cat ? ' on' : '')}>
            <span>{c.cat}</span><span>{bs(c.desde)}</span><span>{bs(c.hasta)}</span><b>{bs(c.cuota)}</b>
          </div>
        ))}
      </div>
      {cat && <div className="diff num" style={{ background:'var(--green-soft)', color:'var(--green-text)' }}><span><b>Categoría {cat.cat}</b> · pago bimestral</span><b style={{ fontSize:22, fontFamily:'var(--f-display)' }}>{bs(cat.cuota)}</b></div>}
      {capAlto && <div className="fiscal-warn"><Icon n="alert" s={20} /><span>Con un capital mayor a Bs 60.000 no corresponde el RTS: pertenecerías al Régimen General.</span></div>}
      {capBajo && <div className="fiscal-note"><Icon n="note" s={18} /><span>Tu capital está por debajo de la categoría 1 (Bs 12.001). Consulta en el SIN si debes inscribirte.</span></div>}
      <div className="fiscal-list">
        <b>Límites del RTS para revisar</b>
        <span className="between num"><span>Capital máximo</span><b>{bs(60000)}</b></span>
        <span className="between num"><span>Precio unitario máximo · {act.l.toLowerCase()}</span><b>{bs(act.pmax)}</b></span>
        <span className="between num"><span>Ventas anuales máximas</span><b>{bs(RTS_VENTAS_MAX)}</b></span>
        <span className="muted" style={{ fontSize:13 }}>El capital y las categorías vienen de la tabla vigente del SIN que compartiste. El precio unitario y las ventas anuales son de fuentes secundarias: confírmalos.</span>
      </div>
      {caros.length > 0
        ? <div className="fiscal-warn"><Icon n="alert" s={20} /><span>{caros.length} productos superan el precio unitario máximo de Bs {act.pmax}: {caros.map(p => p.nombre).join(', ')}.</span></div>
        : <div className="fiscal-note"><Icon n="check" s={18} /><span>Todos tus productos están por debajo del precio unitario máximo de Bs {act.pmax}.</span></div>}
      <div className="fiscal-warn"><Icon n="alert" s={20} /><span>Con ventas como las de hoy ({bs(VENTAS_HOY)}), el tope anual de {bs(RTS_VENTAS_MAX)} se alcanzaría en unos {dias} días de venta. Revisa con tu contador si el RTS te corresponde.</span></div>
    </div>
  );
}
/* Mesas y zonas (dentro de Configuración) */
function MesasConfig({ mesas, setMesas, zonas, setZonas, registrar, aviso }) {
  const [nuevaZona, setNuevaZona] = useState('');
  const [renombrar, setRenombrar] = useState(null);
  const [errZ, setErrZ] = useState('');
  const ocupada = m => m.estado !== 'libre' || m.items.length > 0;
  const sig = () => Math.max(0, ...mesas.map(m => m.n)) + 1;
  const agregar = z => { const n = sig(); setMesas(ms => [...ms, { n, zona:z, sillas:4, estado:'libre', items:[] }]); registrar(`Agregó la mesa ${n} en ${z}`); aviso(`Mesa ${n} agregada en ${z}`); };
  const quitar = m => {
    if (ocupada(m)) { aviso(`La mesa ${m.n} tiene una cuenta abierta. Cóbrala antes de quitarla.`, 'alert'); return; }
    setMesas(ms => ms.filter(x => x.n !== m.n)); registrar(`Quitó la mesa ${m.n} de ${m.zona}`); aviso(`Mesa ${m.n} quitada`, 'trash');
  };
  const quitarUltima = z => {
    const libres = mesas.filter(m => m.zona === z && !ocupada(m));
    if (!libres.length) { aviso(`Todas las mesas de ${z} tienen cuentas abiertas. No se puede quitar ninguna.`, 'alert'); return; }
    quitar(libres.reduce((a, b) => b.n > a.n ? b : a));
  };
  const setSillas = (n, d) => setMesas(ms => ms.map(m => m.n === n ? { ...m, sillas: Math.min(10, Math.max(1, m.sillas + d)) } : m));
  const mover = (m, z) => { setMesas(ms => ms.map(x => x.n === m.n ? { ...x, zona:z } : x)); registrar(`Movió la mesa ${m.n} a ${z}`); aviso(`Mesa ${m.n} movida a ${z}`); };
  const crearZona = e => {
    e.preventDefault();
    const z = nuevaZona.trim();
    if (!z) return setErrZ('Escribe el nombre de la zona.');
    if (zonas.some(x => x.toLowerCase() === z.toLowerCase())) return setErrZ('Ya existe una zona con ese nombre.');
    setZonas(zs => [...zs, z]); setNuevaZona(''); setErrZ(''); registrar(`Creó la zona ${z}`); aviso(`Zona ${z} creada. Ahora agrégale mesas.`);
  };
  const guardarNombre = () => {
    const v = renombrar.valor.trim(); const z = renombrar.zona;
    if (!v) return setErrZ('El nombre de la zona no puede quedar vacío.');
    if (v !== z && zonas.some(x => x.toLowerCase() === v.toLowerCase())) return setErrZ('Ya existe una zona con ese nombre.');
    setZonas(zs => zs.map(x => x === z ? v : x)); setMesas(ms => ms.map(m => m.zona === z ? { ...m, zona:v } : m));
    setRenombrar(null); setErrZ('');
    if (v !== z) { registrar(`Renombró la zona ${z} a ${v}`); aviso(`Zona renombrada a ${v}`); }
  };
  const borrarZona = z => {
    if (zonas.length <= 1) { aviso('Debe quedar al menos una zona.', 'alert'); return; }
    setZonas(zs => zs.filter(x => x !== z)); registrar(`Eliminó la zona ${z}`); aviso(`Zona ${z} eliminada`, 'trash');
  };
  const totalSillas = mesas.reduce((s, m) => s + m.sillas, 0);
  return (
    <section className="card stack" style={{ gap:18, marginTop:18 }} id="mesas-config">
      <div className="between" style={{ flexWrap:'wrap' }}>
        <div><h2>Mesas y zonas del local</h2><span className="muted">Los cambios se aplican al instante en el mapa de mesas y en caja.</span></div>
        <span className="pill pill-gray num" style={{ fontSize:14, padding:'7px 14px' }}>{mesas.length} mesas · {totalSillas} sillas</span>
      </div>
      {zonas.map(z => {
        const ms = mesas.filter(m => m.zona === z).sort((a, b) => a.n - b.n);
        return (
          <div className="zona-cfg" key={z}>
            <div className="between" style={{ flexWrap:'wrap', gap:12 }}>
              {renombrar && renombrar.zona === z ? (
                <div className="row" style={{ flexWrap:'wrap' }}>
                  <input id={'zona-' + z} className="input" style={{ minHeight:44, maxWidth:220 }} value={renombrar.valor} onChange={e => setRenombrar({ zona:z, valor:e.target.value })} aria-label="Nombre de la zona" autoFocus />
                  <button type="button" className="btn btn-primary btn-sm" onClick={guardarNombre}>Guardar</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setRenombrar(null); setErrZ(''); }}>Cancelar</button>
                </div>
              ) : (
                <div className="row">
                  <h3 style={{ fontSize:18 }}>{z}</h3>
                  <button type="button" className="icon-btn" style={{ width:40, height:40 }} onClick={() => setRenombrar({ zona:z, valor:z })} aria-label={`Renombrar ${z}`}><Icon n="edit" s={17} /></button>
                  {!ms.length && <button type="button" className="icon-btn" style={{ width:40, height:40 }} onClick={() => borrarZona(z)} aria-label={`Eliminar zona ${z}`}><Icon n="trash" s={17} /></button>}
                </div>
              )}
              <div className="row">
                <span className="muted" style={{ fontWeight:600, fontSize:14 }}>Cantidad de mesas</span>
                <div className="stepper" style={{ gridColumn:'auto' }}>
                  <button type="button" onClick={() => quitarUltima(z)} aria-label={`Quitar una mesa de ${z}`} disabled={!ms.length}><Icon n="minus" s={18} /></button>
                  <span className="num">{ms.length}</span>
                  <button type="button" onClick={() => agregar(z)} aria-label={`Agregar una mesa en ${z}`} disabled={mesas.length >= 40}><Icon n="plus" s={18} /></button>
                </div>
              </div>
            </div>
            {ms.length ? (
              <div className="mesa-cfg-list">
                {ms.map(m => (
                  <div className="mesa-cfg" key={m.n}>
                    <div className="mesa-cfg-n num" style={{ boxShadow:`inset 0 0 0 2.5px ${ESTADO_MESA[m.estado].c}` }}>{m.n}</div>
                    <div className="stack" style={{ gap:6, minWidth:0 }}>
                      <div className="row" style={{ gap:8, flexWrap:'wrap' }}>
                        <span className="muted" style={{ fontSize:13, fontWeight:600 }}>Sillas</span>
                        <div className="stepper mini" style={{ gridColumn:'auto' }}>
                          <button type="button" onClick={() => setSillas(m.n, -1)} disabled={m.sillas <= 1} aria-label={`Quitar una silla a la mesa ${m.n}`}><Icon n="minus" s={15} /></button>
                          <span className="num">{m.sillas}</span>
                          <button type="button" onClick={() => setSillas(m.n, 1)} disabled={m.sillas >= 10} aria-label={`Agregar una silla a la mesa ${m.n}`}><Icon n="plus" s={15} /></button>
                        </div>
                      </div>
                      {zonas.length > 1 && <select id={'zona-mesa-' + m.n} className="input" style={{ minHeight:40, fontSize:14 }} value={m.zona} onChange={e => mover(m, e.target.value)} aria-label={`Zona de la mesa ${m.n}`}>{zonas.map(x => <option key={x}>{x}</option>)}</select>}
                    </div>
                    <button type="button" className="icon-btn" onClick={() => quitar(m)} aria-label={`Quitar la mesa ${m.n}`} style={ocupada(m) ? { opacity:.4 } : undefined}><Icon n="trash" s={17} /></button>
                    {ocupada(m) && <span className={'pill ' + ESTADO_MESA[m.estado].cls} style={{ gridColumn:'1 / -1', justifySelf:'start' }}>{ESTADO_MESA[m.estado].label} · no se puede quitar</span>}
                  </div>
                ))}
              </div>
            ) : <div className="empty" style={{ padding:'14px 8px' }}><span>Esta zona no tiene mesas. Usa el botón + para agregar.</span></div>}
          </div>
        );
      })}
      <form className="row" style={{ flexWrap:'wrap', alignItems:'flex-end' }} onSubmit={crearZona} noValidate>
        <label className="field" style={{ flex:'1 1 220px' }}>Nueva zona<input id="nueva-zona" className="input" value={nuevaZona} onChange={e => { setNuevaZona(e.target.value); setErrZ(''); }} placeholder="Ej. Terraza, Segundo piso" /></label>
        <button type="submit" className="btn btn-ghost"><Icon n="plus" s={18} />Crear zona</button>
      </form>
      {errZ && <span className="err" role="alert">{errZ}</span>}
    </section>
  );
}

/* ============ Módulos completos · datos de ejemplo y piezas compartidas ============ */
Object.assign(ICONS, {
  portada:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M17.5 14v7 M14 17.5h7',
  dash:'M3 14a9 9 0 0 1 18 0 M12 14l4.5-4.5 M5 19h14 M12 5v1.5 M5.6 7.6l1 1 M18.4 7.6l-1 1',
  pedidos:'M8 3h8v3.5H8z M6 4.5H4V21h16V4.5h-2 M8 11h8 M8 15h8 M8 19h4',
  phone:'M5 3h3.5l2 5-2.5 1.5a11 11 0 0 0 6.5 6.5L16 13.5l5 2V19a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2Z',
  pin:'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  mano:'M7 11.5V6a1.5 1.5 0 0 1 3 0v4.5 M10 10V4.5a1.5 1.5 0 0 1 3 0V10 M13 10V5.5a1.5 1.5 0 0 1 3 0V11 M16 11V8.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-2.7L3.6 14.6a1.6 1.6 0 0 1 2.6-1.9L7 14',
  pantalla:'M3 4h18v12H3z M8 20h8 M12 16v4',
  camion:'M2 6h12v10H2z M14 9h4l3 3.5V16h-7 M6.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z M17.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  recibo:'M5 3h14v18l-2.3-1.5L14.3 21 12 19.5 9.7 21l-2.4-1.5L5 21V3Z M9 8h6 M9 12h6 M9 16h3',
  chat:'M4 20l1.3-3.9A8.5 8.5 0 1 1 8.2 19L4 20Z M9 10.5h.01 M12 10.5h.01 M15 10.5h.01',
  carrito:'M3 4h2.2l2.3 11h10.3L20 7.5H6.3 M9.5 20h.01 M17 20h.01',
  libro:'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5',
  power:'M12 3v8 M6.3 6.8a8 8 0 1 0 11.4 0',
  puntos:'M5 12h.01 M12 12h.01 M19 12h.01',
  estrella:'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z',
  imagen:'M3 5h18v14H3z M3 16l5-5 4 4 3-3 6 6 M15.5 9.5h.01',
  ruta:'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z M18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z M8 17h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7',
  orden:'M8 4v16 M4 8l4-4 4 4 M16 20V4 M12 16l4 4 4-4',
  link:'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7L11.5 6.8 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5',
});

const APPS = ['portada', 'mesero', 'reparto', 'tienda', 'mesa', 'llamar', 'pantalla'];
const ROL_COLOR = { admin:'var(--rol-admin)', cajero:'var(--rol-cajero)', cocina:'var(--rol-cocina)', mesero:'var(--rol-mesero)', tienda:'var(--rol-tienda)', delivery:'var(--rol-delivery)', cliente:'var(--rol-cliente)' };
const MODULOS = [
  { grupo:'Operación', sub:'Para el equipo del local', items:[
    { id:'venta', t:'Caja y punto de venta', d:'Vende, cobra y cierra la caja del turno.', rol:'cajero', icon:'venta' },
    { id:'cocina', t:'Cocina y barra', d:'Los pedidos llegan solos, con su tiempo.', rol:'cocina', icon:'cocina' },
    { id:'mesero', t:'App del mesero', d:'Mesas, llamadas y pedidos desde el celular.', rol:'mesero', icon:'mano' },
    { id:'reparto', t:'App del repartidor', d:'Entregas del día paso a paso.', rol:'delivery', icon:'moto' },
  ]},
  { grupo:'Cliente', sub:'Lo que ve quien nos visita', items:[
    { id:'tienda', t:'Tienda online', d:'La carta para pedir delivery o para recoger.', rol:'tienda', icon:'store' },
    { id:'mesa', t:'Pedido desde la mesa', d:'Escanea el QR de la mesa y pide.', rol:'cliente', icon:'qr' },
    { id:'llamar', t:'Llamar al mesero', d:'Un botón para llamar o pedir la cuenta.', rol:'cliente', icon:'bell' },
    { id:'pantalla', t:'Pantalla del cliente', d:'La segunda pantalla junto a la caja.', rol:'cliente', icon:'pantalla' },
  ]},
  { grupo:'Gestión', sub:'Para el dueño y administración', items:[
    { id:'inicio', t:'Panel de administración', d:'Resumen, pedidos, carta, compras, finanzas y reportes.', rol:'admin', icon:'dash' },
  ]},
];

/* Fechas y tiempos */
const fechaDMA = iso => { const [a, m, d] = String(iso).split('-'); return `${d}/${m}/${a}`; };
const haceTxt = (t, ahora = Date.now()) => { const m = Math.floor((ahora - t) / 6e4); return m < 1 ? 'recién' : m < 60 ? `hace ${m} min` : `hace ${Math.floor(m / 60)} h`; };
const hmDe = t => new Date(t).toLocaleTimeString('es-BO', { hour:'2-digit', minute:'2-digit', hour12:false });
const soloDigitos = t => String(t || '').replace(/\D/g, '');
const waLink = (num, texto) => `https://wa.me/${soloDigitos(num)}?text=${encodeURIComponent(texto)}`;
const mapaLink = dir => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dir + ', Santa Cruz de la Sierra, Bolivia')}`;
function useDebounce(v, ms = 300) { const [d, setD] = useState(v); useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v]); return d; }
const hashParam = () => { const p = (location.hash || '').split('/')[1]; return p ? decodeURIComponent(p) : ''; };

/* Estados de un pedido, en el orden del flujo */
const ESTADO_PED = {
  recibido:  { l:'Recibido', pill:'pill-blue', icon:'inbox' },
  prep:      { l:'En preparación', pill:'pill-gold', icon:'flame' },
  listo:     { l:'Listo', pill:'pill-green', icon:'check' },
  camino:    { l:'En camino', pill:'pill-red', icon:'moto' },
  entregado: { l:'Entregado', pill:'pill-gray', icon:'check' },
  anulado:   { l:'Anulado', pill:'pill-gray', icon:'x' },
};
const totalPedC = p => totalC(p.items) + (p.envioC || 0);
const tipoPedTxt = p => p.web ? 'Tienda online' : p.qr ? 'QR de mesa' : { mesa:'Mesa', mostrador:'Mostrador', delivery:'Delivery' }[p.tipo] || p.tipo;

/* Datos de ejemplo de los módulos nuevos */
const CATS0 = CATEGORIAS.map((c, i) => ({ ...c, visible:true, orden:i }));
const ZONAS_ENVIO0 = [{ n:'Centro · dentro del 1.er anillo', c:8 }, { n:'Del 2.º al 4.º anillo', c:12 }, { n:'Del 5.º anillo afuera', c:18 }];
const LOCAL0 = { abierto:true, horario:'Lun a sáb 08:00 a 23:00 · dom 15:00 a 22:00', whatsapp:'+591 70000000', instagram:'@notasdelcafe', tiempo:'35 a 45 min', minimo:30, zonas:ZONAS_ENVIO0, demora:15 };
const MENU_DIA0 = { activo:true, titulo:'Desayuno de notas', desc:'Café americano, croissant de mantequilla y limonada de la casa', precio:30, hasta:'11:30', items:['p01', 'p28', 'p26'] };
const BANNERS0 = [
  { id:'b1', titulo:'Jueves de jazz en vivo', texto:'Desde las 20:00 · reserva tu mesa frente al escenario', tono:'verde', donde:'ambos', activo:true },
  { id:'b2', titulo:'Latte de temporada', texto:'Lavanda y miel de los valles · solo este mes', tono:'caramelo', donde:'tienda', activo:true },
  { id:'b3', titulo:'Trae tu libro, llévate otro', texto:'Intercambio de libros todos los sábados', tono:'crema', donde:'pantalla', activo:true },
];
const PROVEEDORES0 = [
  { id:'pv1', nombre:'Tostadora Yungas', rubro:'Café en grano', contacto:'Marcelo Quispe', tel:'+591 71011223', dias:'Lunes y jueves', nota:'Café de altura de Caranavi' },
  { id:'pv2', nombre:'Lácteos del Oriente', rubro:'Leche y lácteos', contacto:'Paola Rivero', tel:'+591 76055443', dias:'Todos los días', nota:'' },
  { id:'pv3', nombre:'Frutas El Abasto', rubro:'Frutas y limón', contacto:'Don Ramiro', tel:'+591 69088776', dias:'Martes y viernes', nota:'Pagar al contado' },
  { id:'pv4', nombre:'Distribuidora Piraí', rubro:'Vasos, servilletas y limpieza', contacto:'Lucía Méndez', tel:'+591 72233445', dias:'Miércoles', nota:'' },
];
const COMPRAS0 = [
  { id:'C-0041', fecha:diaMas(-9), prov:'pv1', items:[['caf', 5, 155]], estado:'pagada', met:'transferencia' },
  { id:'C-0042', fecha:diaMas(-6), prov:'pv4', items:[['vas', 200, 1.1]], estado:'pagada', met:'efectivo' },
  { id:'C-0043', fecha:diaMas(-4), prov:'pv3', items:[['lim', 80, 0.5]], estado:'pagada', met:'efectivo' },
  { id:'C-0044', fecha:diaMas(-2), prov:'pv1', items:[['caf', 3, 160]], estado:'por pagar', met:'transferencia' },
  { id:'C-0045', fecha:hoyISO(), prov:'pv2', items:[['lec', 20, 7], ['ave', 4, 28]], estado:'pagada', met:'efectivo' },
];
const compraTotalC = c => c.items.reduce((s, [, q, cu]) => s + aC(q * cu), 0);
const CATS_GASTO = ['Alquiler', 'Servicios básicos', 'Sueldos', 'Músicos y eventos', 'Mantenimiento', 'Publicidad', 'Otros'];
const GASTOS0 = [
  { id:'g1', fecha:diaMas(-20), cat:'Alquiler', desc:'Alquiler del local', montoC:650000, met:'transferencia' },
  { id:'g2', fecha:diaMas(-14), cat:'Servicios básicos', desc:'Luz del mes', montoC:92000, met:'transferencia' },
  { id:'g3', fecha:diaMas(-14), cat:'Servicios básicos', desc:'Agua del mes', montoC:18000, met:'transferencia' },
  { id:'g4', fecha:diaMas(-12), cat:'Servicios básicos', desc:'Internet de fibra', montoC:35000, met:'qr' },
  { id:'g5', fecha:diaMas(-8), cat:'Músicos y eventos', desc:'Trío de jazz · jueves', montoC:80000, met:'efectivo' },
  { id:'g6', fecha:diaMas(-5), cat:'Mantenimiento', desc:'Limpieza de la cafetera espresso', montoC:45000, met:'efectivo' },
  { id:'g7', fecha:diaMas(-3), cat:'Publicidad', desc:'Publicación pagada en Instagram', montoC:21000, met:'tarjeta' },
  { id:'g8', fecha:diaMas(-1), cat:'Otros', desc:'Garrafa de gas', montoC:2250, met:'efectivo' },
];
/* Cobros QR del día: suman exactamente lo que la caja tiene en QR (Bs 2.610) */
const COBROS_QR0 = (() => {
  const montos = [4800, 3600, 6200, 2400, 9800, 5200, 3600, 12400, 7000, 4400, 8800, 3600, 15600, 6000, 9600, 5800, 11000];
  let s = 0; const hs = ['08:12','08:40','09:05','09:31','10:02','10:48','11:20','12:15','13:02','14:10','15:22','16:05','16:48','17:30','18:15','19:40','20:20'];
  const r = montos.map((m, i) => { s += m; return { id:'q' + (i + 1), h:hs[i], ref:'QR-' + (48210 + i * 37), origen: i % 3 === 0 ? `Mesa ${(i % 8) + 1}` : i % 3 === 1 ? 'Mostrador' : `Ticket N° ${100 + i * 6}`, montoC:m, estado:'confirmado' }; });
  r.push({ id:'q18', h:'21:05', ref:'QR-48839', origen:'Mesa 7', montoC:261000 - s, estado:'confirmado' });
  return r;
})();
const VENTAS0 = [
  { id:'v1', nf:1201, h:'19:42', titulo:'Mesa 2', totalC:6800, met:'QR', nit:'4567812', rs:'Gutiérrez', estado:'valida' },
  { id:'v2', nf:1202, h:'19:58', titulo:'Ticket N° 139', totalC:2400, met:'efectivo', nit:'0', rs:'Sin nombre', estado:'valida' },
  { id:'v3', nf:1203, h:'20:15', titulo:'Mesa 5', totalC:11200, met:'tarjeta', nit:'1023456027', rs:'Arte Oriente SRL', estado:'valida' },
  { id:'v4', nf:1204, h:'20:31', titulo:'Ticket N° 140', totalC:3600, met:'QR', nit:'7781230', rs:'Suárez', estado:'valida' },
];
const LLAMADAS0 = [{ id:'l1', mesa:6, tipo:'cuenta', t:T0 - 2 * 6e4, estado:'pendiente', pago:'QR' }];
const SOLICITUDES0 = [{ id:'s1', mesa:1, t:T0 - 3 * 6e4, nombre:'Andrea', nota:'', items:[ln('p26', 2, { agua:1 }), ln('p29', 1)] }];
/* Pedidos de ejemplo: línea de tiempo y datos de delivery */
PEDIDOS0.forEach(p => { const F = ['recibido', 'prep', 'listo', 'camino']; p.hist = F.slice(0, F.indexOf(p.estado) + 1).map((e, i) => ({ e, t: p.creado + i * 4 * 6e4 })); });
Object.assign(PEDIDOS0.find(p => p.no === 142), { cliente:'Mariana Justiniano', tel:'+591 70011223', zona:ZONAS_ENVIO0[1].n, ref:'Edificio azul, piso 3', pago:'qr', pagado:true, envioC:1200, enRuta:true });
Object.assign(PEDIDOS0.find(p => p.no === 145), { cliente:'Carlos Rojas', tel:'+591 76543219', zona:ZONAS_ENVIO0[0].n, pago:'efectivo', conCuanto:'100', envioC:800 });
/* 30 días de ventas de ejemplo (Bs) para el panel */
let VENTAS_30 = (() => { const base = [5900, 6120, 6880, 8240, 9310, 7450, 6480]; let s = 11; return Array.from({ length:30 }, (_, i) => { s = (s * 9301 + 49297) % 233280; const d = new Date(); d.setDate(d.getDate() - 29 + i); return [d, i === 29 ? 6480 : Math.round(base[d.getDay() === 0 ? 5 : (d.getDay() + 5) % 7] * (0.86 + (s / 233280) * 0.26) / 10) * 10]; }); })();

/* ---------- Piezas compartidas ---------- */
function useCerrarConEsc(abierto, cerrar) { useEffect(() => { if (!abierto) return; const k = e => { if (e.key === 'Escape') { e.stopPropagation(); cerrar(); } }; window.addEventListener('keydown', k, true); return () => window.removeEventListener('keydown', k, true); }, [abierto]); }
function MenuAcciones({ items, etiqueta = 'Más acciones' }) {
  const [abierto, setAbierto] = useState(false);
  useCerrarConEsc(abierto, () => setAbierto(false));
  return (
    <span className="acc">
      <button type="button" className="icon-btn acc-btn" aria-haspopup="menu" aria-expanded={abierto} aria-label={etiqueta} onClick={e => { e.stopPropagation(); setAbierto(a => !a); }}><Icon n="puntos" s={22} w={3} /></button>
      {abierto && (<>
        <div className="menu-scrim" onClick={e => { e.stopPropagation(); setAbierto(false); }} />
        <div className="menu acc-menu" role="menu" onClick={e => e.stopPropagation()}>
          {items.filter(Boolean).map(it => (
            <button key={it.l} role="menuitem" className={it.danger ? 'danger-text' : ''} disabled={it.disabled} title={it.title || ''} onClick={() => { setAbierto(false); it.fn(); }}><Icon n={it.icon || 'arrow'} s={18} />{it.l}</button>
          ))}
        </div>
      </>)}
    </span>
  );
}
function Confirmar({ titulo, texto, si = 'Sí, eliminar', onSi, onClose }) {
  useEscape(onClose);
  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" style={{ maxWidth:440 }} role="alertdialog" aria-modal="true" aria-labelledby="cf-t" onClick={e => e.stopPropagation()}>
        <h2 id="cf-t">{titulo}</h2>
        <p className="muted" style={{ margin:0 }}>{texto}</p>
        <div className="row" style={{ justifyContent:'flex-end', flexWrap:'wrap' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-danger" onClick={() => { onSi(); onClose(); }}><Icon n="trash" s={18} />{si}</button>
        </div>
      </div>
    </div>
  );
}
function Drawer({ titulo, eyebrow, onClose, children, pie }) {
  useEscape(onClose);
  return (
    <div className="scrim drawer-scrim" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="dr-t" onClick={e => e.stopPropagation()}>
        <div className="drawer-head">
          <div style={{ minWidth:0 }}>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h2 id="dr-t">{titulo}</h2></div>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icon n="x" s={20} /></button>
        </div>
        <div className="drawer-body">{children}</div>
        {pie && <div className="drawer-pie">{pie}</div>}
      </aside>
    </div>
  );
}
function Pestanas({ valor, set, ops, etiqueta }) {
  return (
    <div className="tabs" role="tablist" aria-label={etiqueta}>
      {ops.map(([k, l, n]) => <button key={k} role="tab" aria-selected={valor === k} aria-pressed={valor === k} onClick={() => set(k)}>{l}{n !== undefined && n !== null && <span className="tab-n num">{n}</span>}</button>)}
    </div>
  );
}
/* Barras simples para el panel */
function Barras({ datos, alto = 200, fmt = v => bs(v), etiqueta }) {
  const max = Math.max(...datos.map(d => d[1]), 1);
  const paso = datos.length > 14 ? Math.ceil(datos.length / 8) : 1;
  return (
    <div className="barras" style={{ height:alto }} role="img" aria-label={etiqueta}>
      {datos.map(([k, v, destacado], i) => (
        <div key={i} className={'barra' + (destacado ? ' on' : '')} title={`${k} · ${fmt(v)}`}>
          <i style={{ height: Math.max(2, v / max * 100) + '%' }} />
          <span className="num">{i % paso === 0 || destacado ? k : ''}</span>
        </div>
      ))}
    </div>
  );
}

/* ============ Portada y módulos de pantalla completa ============ */
function useCarrito(key) {
  const [items, setItems] = usePersist(key, []);
  const add = (id, mods, q = 1, nota, reemplaza) => setItems(c => {
    const base = reemplaza ? c.filter(x => x.key !== reemplaza) : c;
    const k = lineKey(id, mods); const f = base.find(x => x.key === k);
    if (f) return base.map(x => x.key === k ? { ...x, q: x.q + q, nota: nota || x.nota } : x);
    const nuevo = { key:k, id, q, mods, nota: nota || undefined, listo:false };
    if (reemplaza) { const i = c.findIndex(x => x.key === reemplaza); const r = [...base]; r.splice(Math.max(0, i), 0, nuevo); return r; }
    return [...base, nuevo];
  });
  const inc = k => setItems(c => c.map(x => x.key === k ? { ...x, q: x.q + 1 } : x));
  const dec = k => setItems(c => c.flatMap(x => x.key !== k ? [x] : x.q > 1 ? [{ ...x, q: x.q - 1 }] : []));
  return { items: items.filter(x => P[x.id]), setItems, add, inc, dec, vaciar: () => setItems([]) };
}
const vendiblesDe = (productos, cats) => { const vis = new Set(cats.filter(c => c.visible).map(c => c.id).concat(['mdia'])); return productos.filter(p => !p.eliminado && p.disponible && vis.has(p.cat) && !(p.stockCtl && p.stock <= 0)); };

function AppTop({ titulo, sub, rol, onPortada, config, derecha }) {
  return (
    <header className="app-top" style={{ '--rol': ROL_COLOR[rol] }}>
      {onPortada && <button className="app-volver" onClick={onPortada} aria-label="Volver a la portada"><Icon n="back" s={20} /><span className="hide-xs">Portada</span></button>}
      <div className="app-tit"><Logo src={config.logo} nombre={config.nombre} cls="app-logo" /><div style={{ minWidth:0 }}><b>{titulo}</b>{sub && <span>{sub}</span>}</div></div>
      <div className="app-der">{derecha}</div>
    </header>
  );
}

function Portada({ config, yo, contadores, irA }) {
  const abierto = config.abierto !== false;
  return (
    <div className="portada">
      <header className="portada-head">
        <div className="row" style={{ gap:14, minWidth:0 }}>
          <Logo src={config.logo} nombre={config.nombre} cls="portada-logo" />
          <div style={{ minWidth:0 }}><div className="portada-neg">{config.nombre}</div><div className="muted">{config.eslogan}</div></div>
        </div>
        <div className="row" style={{ flexWrap:'wrap', justifyContent:'flex-end' }}>
          <span className={'pill ' + (abierto ? 'pill-green' : 'pill-red')} style={{ fontSize:14, padding:'7px 14px' }}><i className="dot" style={{ background: abierto ? 'var(--green)' : 'var(--red)' }} />{abierto ? 'Local abierto' : 'Local cerrado'}</span>
          <span className="app-marca-claro portada-marca">Gastro<b>Metrik</b></span>
        </div>
      </header>
      <div className="portada-intro">
        <h1>¿Qué vas a usar hoy?</h1>
        <p className="muted">Todo está conectado: lo que pide el mesero, la mesa o la tienda online llega a cocina, a caja y a la pantalla del cliente.</p>
      </div>
      {MODULOS.map(g => (
        <section className="portada-grupo" key={g.grupo} aria-labelledby={'pg-' + g.grupo}>
          <div className="portada-gh"><h2 id={'pg-' + g.grupo}>{g.grupo}</h2><span className="muted">{g.sub}</span></div>
          <div className="portada-grid">
            {g.items.map(m => (
              <button key={m.id} className="mod-card" style={{ '--rol': ROL_COLOR[m.rol] }} onClick={() => irA(m.id)}>
                <span className="mod-ico"><Icon n={m.icon} s={28} /></span>
                <span className="mod-txt"><b>{m.t}</b><span>{m.d}</span></span>
                {contadores[m.id] ? <span className="mod-n num">{contadores[m.id]}</span> : null}
                <span className="mod-ir" aria-hidden="true"><Icon n="arrow" s={20} /></span>
              </button>
            ))}
          </div>
        </section>
      ))}
      <footer className="portada-pie"><span className="muted">Sesión abierta: <b>{yo.nombre}</b> · {ROLES[yo.rol].label}</span><Creditos /></footer>
    </div>
  );
}

/* Lista de productos para pedir (mesero, mesa y tienda) */
function ListaPedir({ productos, cats, carro, onPersonalizar, compacta, menuDia }) {
  const [cat, setCat] = useState('todo');
  const [q, setQ] = useState('');
  const qd = sinTildes(q.trim());
  const visibles = cats.filter(c => c.visible && productos.some(p => p.cat === c.id)).sort((a, b) => a.orden - b.orden);
  const lista = productos.filter(p => p.cat !== 'mdia' && (qd ? sinTildes(p.nombre + ' ' + (p.desc || '')).includes(qd) : cat === 'todo' || p.cat === cat));
  const en = id => carro.items.filter(x => x.id === id).reduce((s, x) => s + x.q, 0);
  const tocar = p => { if ((p.mods || []).length && (!compacta || faltaObligatorio(p, modsDef(p)))) onPersonalizar(p.id); else carro.add(p.id, modsDef(p)); };
  const md = productos.find(p => p.cat === 'mdia');
  return (<>
    <label className="search lp-buscar"><Icon n="search" s={20} /><input className="input" placeholder="Buscar en la carta…" value={q} onChange={e => setQ(e.target.value)} aria-label="Buscar en la carta" /></label>
    {!qd && <div className="lp-cats" role="group" aria-label="Categorías">
      <button aria-pressed={cat === 'todo'} onClick={() => setCat('todo')}>Todo</button>
      {visibles.map(c => <button key={c.id} aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>{c.nombre}</button>)}
    </div>}
    {md && !qd && cat === 'todo' && menuDia && (
      <button className="md-card" onClick={() => carro.add('mdia', {})}>
        <span className="md-k">Menú del día · hasta las {menuDia.hasta}</span>
        <b>{menuDia.titulo}</b><span className="md-d">{menuDia.desc}</span>
        <span className="md-p num">{bs(menuDia.precio)}<span className="md-add"><Icon n="plus" s={18} />{en('mdia') ? `${en('mdia')} en el pedido` : 'Agregar'}</span></span>
      </button>
    )}
    <ul className={'lp' + (compacta ? ' lp-compacta' : '')}>
      {lista.map(p => (
        <li key={p.id}>
          <button className="lp-item" onClick={() => tocar(p)} aria-label={`${p.nombre}, ${bs(p.precio)}${en(p.id) ? `, ${en(p.id)} en el pedido` : ''}`}>
            {!compacta && <span className="lp-img" style={{ background:`color-mix(in srgb, ${p.color} 22%, var(--surface))` }}><Art p={p} /></span>}
            <span className="lp-txt"><b>{p.nombre}</b>{p.desc && <span>{p.desc}</span>}<span className="lp-precio num">{bs(p.precio)}</span></span>
            <span className={'lp-mas' + (en(p.id) ? ' con' : '')} aria-hidden="true">{en(p.id) ? <b className="num">{en(p.id)}</b> : <Icon n="plus" s={20} w={2.4} />}</span>
          </button>
        </li>
      ))}
      {!lista.length && <li className="empty"><b>No encontramos “{q}”.</b><span>Prueba con otra palabra.</span></li>}
    </ul>
  </>);
}
function LineasCarro({ carro, onEditar }) {
  return (
    <ul className="lc">
      {carro.items.map(it => (
        <li key={it.key}>
          <button className="lc-txt" onClick={() => onEditar && (P[it.id].mods || []).length && onEditar(it)} disabled={!onEditar || !(P[it.id].mods || []).length}>
            <b>{P[it.id].nombre}</b>{modsTxt(it) && <span>{modsTxt(it)}</span>}{it.nota && <span className="item-note">{it.nota}</span>}
          </button>
          <div className="stepper lc-st">
            <button onClick={() => carro.dec(it.key)} aria-label={`Quitar un ${P[it.id].nombre}`}><Icon n={it.q > 1 ? 'minus' : 'trash'} s={16} /></button>
            <span className="num">{it.q}</span>
            <button onClick={() => carro.inc(it.key)} aria-label={`Agregar un ${P[it.id].nombre}`}><Icon n="plus" s={16} /></button>
          </div>
          <b className="num lc-t">{bsC(lineUnitC(it) * it.q)}</b>
        </li>
      ))}
    </ul>
  );
}

/* ---------- App del mesero ---------- */
function MeseroApp({ mesas, llamadas, atenderLlamada, solicitudes, confirmarSolicitud, rechazarSolicitud, enviarMesa, pedirCuentaMesa, productos, cats, menuDia, pedidos, servir, yo, now, config, onPortada, offline }) {
  const [tab, setTab] = useState('mesas');
  const [mesaSel, setMesaSel] = usePersist('meseroMesa', null);
  const carro = useCarrito('borradorMesero');
  const [custom, setCustom] = useState(null);
  const [ver, setVer] = useState(null);
  const [verDraft, setVerDraft] = useState(false);
  const pendLl = llamadas.filter(l => l.estado === 'pendiente').sort((a, b) => a.t - b.t);
  const listos = pedidos.filter(p => p.tipo === 'mesa' && p.estado === 'listo');
  const nAvisos = pendLl.length + solicitudes.length + listos.length;
  const vend = vendiblesDe(productos, cats);
  const m = mesas.find(x => x.n === ver);
  const llDe = n => pendLl.filter(l => l.mesa === n);
  const enviar = () => { if (!mesaSel || !carro.items.length) return; enviarMesa(mesaSel, carro.items, yo.nombre); carro.vaciar(); setVerDraft(false); setTab('mesas'); };
  const llTxt = l => l.tipo === 'cuenta' ? `pide la cuenta${l.pago ? ' · paga con ' + l.pago : ''}` : 'te llama';
  return (
    <div className="app-movil" style={{ '--rol': ROL_COLOR.mesero }}>
      <AppTop titulo="App del mesero" sub={`${yo.nombre.split(' ')[0]} · ${offline ? 'sin conexión, se guarda el borrador' : 'en línea'}`} rol="mesero" onPortada={onPortada} config={config} />
      <div className="app-cuerpo">
        {tab === 'mesas' && (<>
          {pendLl.length > 0 && <button className="aviso-tira" onClick={() => setTab('avisos')}><Icon n="bell" s={22} /><span><b>{pendLl.length === 1 ? `Mesa ${pendLl[0].mesa} ${llTxt(pendLl[0])}` : `${pendLl.length} mesas te llaman`}</b><span className="num">{haceTxt(pendLl[0].t, now)}</span></span><Icon n="arrow" s={18} /></button>}
          <div className="mm-grid">
            {mesas.map(x => {
              const e = ESTADO_MESA[x.estado];
              const ll = llDe(x.n).length, qr = solicitudes.some(s => s.mesa === x.n);
              return (
                <button key={x.n} className={'mm' + (ll ? ' llama' : '')} style={{ '--e': e.c, '--es': e.soft }} onClick={() => setVer(x.n)} aria-label={`Mesa ${x.n}, ${e.label}${ll ? ', te está llamando' : ''}`}>
                  <span className="mm-n num">{x.n}</span>
                  <span className="mm-e">{e.label}</span>
                  <span className="mm-t num">{x.items.length ? bsC(totalC(x.items) - (x.pagadoC || 0)) : `${x.sillas} sillas`}</span>
                  {(ll > 0 || qr) && <span className="mm-ic">{ll > 0 && <Icon n="bell" s={16} />}{qr && <Icon n="qr" s={16} />}</span>}
                </button>
              );
            })}
          </div>
        </>)}

        {tab === 'avisos' && (<div className="stack" style={{ gap:16 }}>
          <section>
            <h2 className="sec-h">Llamadas <span className="pill pill-gray num">{pendLl.length}</span></h2>
            {pendLl.length ? pendLl.map(l => (
              <div className="av-card" key={l.id}>
                <span className="av-ico" style={{ background:'var(--gold-soft)', color:'var(--gold-text)' }}><Icon n={l.tipo === 'cuenta' ? 'cash' : 'bell'} s={22} /></span>
                <div style={{ flex:1, minWidth:0 }}><b>Mesa {l.mesa} {llTxt(l)}</b><div className="muted num" style={{ fontSize:13.5 }}>{haceTxt(l.t, now)}</div></div>
                <button className="btn btn-primary btn-sm" onClick={() => atenderLlamada(l)}>Voy</button>
              </div>
            )) : <p className="muted av-vacio">Nadie te está llamando.</p>}
          </section>
          <section>
            <h2 className="sec-h">Pedidos desde el QR <span className="pill pill-gray num">{solicitudes.length}</span></h2>
            {solicitudes.length ? solicitudes.map(s => (
              <div className="av-card av-col" key={s.id}>
                <div className="between" style={{ width:'100%' }}><b>Mesa {s.mesa}{s.nombre ? ` · ${s.nombre}` : ''}</b><span className="muted num" style={{ fontSize:13.5 }}>{haceTxt(s.t, now)}</span></div>
                <ul className="av-items">{s.items.map(it => <li key={it.key}><b className="num">{it.q}×</b> {P[it.id] ? P[it.id].nombre : ''}{modsTxt(it) ? <span className="muted"> · {modsTxt(it)}</span> : ''}</li>)}</ul>
                {s.nota && <span className="item-note">{s.nota}</span>}
                <div className="row" style={{ width:'100%' }}>
                  <button className="btn btn-ghost btn-sm" style={{ flex:1 }} onClick={() => rechazarSolicitud(s)}>Rechazar</button>
                  <button className="btn btn-primary btn-sm" style={{ flex:2 }} onClick={() => confirmarSolicitud(s)}><Icon n="flame" s={18} />Confirmar · {bsC(totalC(s.items))}</button>
                </div>
              </div>
            )) : <p className="muted av-vacio">No hay pedidos por confirmar.</p>}
          </section>
          <section>
            <h2 className="sec-h">Listos para servir <span className="pill pill-gray num">{listos.length}</span></h2>
            {listos.length ? listos.map(p => (
              <div className="av-card" key={p.no}>
                <span className="av-ico" style={{ background:'var(--green-soft)', color:'var(--green-text)' }}><Icon n="check" s={22} /></span>
                <div style={{ flex:1, minWidth:0 }}><b>{p.origen} · N° {p.no}</b><div className="muted" style={{ fontSize:13.5 }}>{p.items.map(i => `${i.q}× ${P[i.id] ? P[i.id].nombre : ''}`).join(' · ')}</div></div>
                <button className="btn btn-primary btn-sm" onClick={() => servir(p)}>Servido</button>
              </div>
            )) : <p className="muted av-vacio">Nada listo por ahora.</p>}
          </section>
        </div>)}

        {tab === 'pedido' && (<>
          <div className="mm-chips" role="group" aria-label="Mesa del pedido">
            {mesas.map(x => <button key={x.n} aria-pressed={mesaSel === x.n} onClick={() => setMesaSel(x.n)} className="num">Mesa {x.n}</button>)}
          </div>
          {!mesaSel && <div className="fiscal-note" style={{ marginBottom:10 }}><Icon n="mesas" s={18} /><span>Elige la mesa antes de enviar el pedido.</span></div>}
          <ListaPedir productos={vend} cats={cats} carro={carro} onPersonalizar={id => setCustom({ id })} compacta menuDia={menuDia && menuDia.activo ? menuDia : null} />
        </>)}
      </div>

      {tab === 'pedido' && carro.items.length > 0 && (
        <div className={'draft-bar' + (verDraft ? ' abierta' : '')}>
          {verDraft && <div className="draft-lista"><div className="between"><b>Borrador · {mesaSel ? `Mesa ${mesaSel}` : 'sin mesa'}</b><button className="link-btn" onClick={carro.vaciar}>Vaciar</button></div><LineasCarro carro={carro} onEditar={it => setCustom({ id: it.id, linea: it })} /><span className="muted" style={{ fontSize:12.5 }}>El borrador queda guardado en este celular aunque se corte internet.</span></div>}
          <div className="row" style={{ gap:8 }}>
            <button className="btn btn-ghost" onClick={() => setVerDraft(v => !v)} aria-expanded={verDraft}><b className="num">{unidades(carro.items)}</b>{verDraft ? 'Ocultar' : 'Ver'}</button>
            <button className="btn btn-primary" style={{ flex:1 }} disabled={!mesaSel} onClick={enviar}><Icon n="flame" s={19} />Enviar a cocina · <span className="num">{bsC(totalC(carro.items))}</span></button>
          </div>
        </div>
      )}

      <nav className="app-nav" aria-label="Secciones del mesero">
        {[['mesas', 'Mesas', 'mesas', 0], ['avisos', 'Avisos', 'bell', nAvisos], ['pedido', 'Tomar pedido', 'plus', carro.items.length ? unidades(carro.items) : 0]].map(([k, l, ic, n]) => (
          <button key={k} aria-current={tab === k ? 'page' : undefined} onClick={() => setTab(k)}><Icon n={ic} s={24} /><span>{l}</span>{n > 0 && <i className="num">{n}</i>}</button>
        ))}
      </nav>

      {m && (
        <div className="scrim sheet-scrim-b" onClick={() => setVer(null)}>
          <div className="modal bsheet" role="dialog" aria-modal="true" aria-labelledby="mm-t" onClick={e => e.stopPropagation()}>
            <div className="between"><div><div className="eyebrow">{m.zona} · {ESTADO_MESA[m.estado].label}</div><h2 id="mm-t">Mesa {m.n}</h2></div><button className="icon-btn" onClick={() => setVer(null)} aria-label="Cerrar"><Icon n="x" s={20} /></button></div>
            {llDe(m.n).map(l => <div className="aviso-tira" key={l.id} style={{ margin:0 }}><Icon n="bell" s={20} /><span><b>Te llama: {llTxt(l)}</b><span className="num">{haceTxt(l.t, now)}</span></span><button className="btn btn-sm btn-primary" onClick={() => atenderLlamada(l)}>Voy</button></div>)}
            {m.items.length ? (<>
              <ul className="av-items">{m.items.map(it => <li key={it.key}><b className="num">{it.q}×</b> {P[it.id] ? P[it.id].nombre : ''}<span className="num" style={{ marginLeft:'auto' }}>{bsC(lineUnitC(it) * it.q)}</span></li>)}</ul>
              <div className="kv" style={{ fontSize:17 }}><b>Por cobrar</b><b className="num">{bsC(totalC(m.items) - (m.pagadoC || 0))}</b></div>
            </>) : <p className="muted" style={{ margin:0 }}>Mesa libre · {m.sillas} sillas.</p>}
            <div className="row" style={{ flexWrap:'wrap' }}>
              {m.items.length > 0 && m.estado !== 'cobrar' && <button className="btn btn-ghost" style={{ flex:'1 1 140px' }} onClick={() => { pedirCuentaMesa(m.n); setVer(null); }}><Icon n="cash" s={19} />Pedir la cuenta</button>}
              <button className="btn btn-primary" style={{ flex:'1 1 140px' }} onClick={() => { setMesaSel(m.n); setVer(null); setTab('pedido'); }}><Icon n="plus" s={19} />Agregar productos</button>
            </div>
          </div>
        </div>
      )}
      {custom && <Personalizar id={custom.id} linea={custom.linea} onAdd={carro.add} onClose={() => setCustom(null)} />}
    </div>
  );
}

/* ---------- App del repartidor ---------- */
const PASOS_ENTREGA = ['Asignado', 'Recogido', 'En camino', 'Entregado'];
const pasoEntrega = p => p.estado === 'entregado' ? 3 : p.estado === 'camino' ? (p.enRuta ? 2 : 1) : 0;
function MapaRuta({ zona, dir }) {
  const zi = Math.max(0, ZONAS_ENVIO0.findIndex(z => z.n === zona));
  const ang = ((soloDigitos(dir).slice(-2) || 37) * 7) % 360 * Math.PI / 180;
  const r = [36, 64, 92][zi] || 64;
  const cx = 160, cy = 92, dx = cx + Math.cos(ang) * r * 1.4, dy = cy + Math.sin(ang) * r * .82;
  return (
    <svg className="mapa" viewBox="0 0 320 184" role="img" aria-label={`Ruta del local a ${dir}`}>
      <rect width="320" height="184" rx="16" style={{ fill:'var(--surface-2)' }} />
      {[30, 52, 74, 96, 118].map((rr, i) => <ellipse key={rr} cx={cx} cy={cy} rx={rr * 1.4} ry={rr * .82} fill="none" style={{ stroke:'var(--line)' }} strokeWidth={i === 0 ? 5 : 3} />)}
      {[0, 45, 90, 135].map(a => <line key={a} x1={cx - Math.cos(a * Math.PI / 180) * 200} y1={cy - Math.sin(a * Math.PI / 180) * 120} x2={cx + Math.cos(a * Math.PI / 180) * 200} y2={cy + Math.sin(a * Math.PI / 180) * 120} style={{ stroke:'var(--line)' }} strokeWidth="3" />)}
      <path d={`M${cx},${cy} Q${(cx + dx) / 2 + 18},${(cy + dy) / 2 - 22} ${dx},${dy}`} fill="none" style={{ stroke:'var(--rol-delivery)' }} strokeWidth="4" strokeDasharray="8 6" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="9" style={{ fill:'var(--green)' }} /><circle cx={cx} cy={cy} r="3.5" fill="#fff" />
      <path d={`M${dx},${dy + 2} c-9,-11 -9,-21 0,-21 c9,0 9,10 0,21Z`} style={{ fill:'var(--red)' }} /><circle cx={dx} cy={dy - 11} r="3.4" fill="#fff" />
      <text x="12" y="172" style={{ fill:'var(--muted)', fontSize:11 }}>Los anillos de Santa Cruz · mapa de referencia</text>
    </svg>
  );
}
function RepartoApp({ pedidos, avanzarEntrega, yo, config, now, onPortada }) {
  const mios = pedidos.filter(p => p.tipo === 'delivery' && p.estado !== 'anulado');
  const activos = mios.filter(p => p.estado !== 'entregado').sort((a, b) => a.creado - b.creado);
  const hechos = mios.filter(p => p.estado === 'entregado');
  const [abierto, setAbierto] = useState(activos[0] ? activos[0].no : null);
  const boton = p => {
    if (p.estado === 'recibido' || p.estado === 'prep') return [`En cocina · ${ESTADO_PED[p.estado].l.toLowerCase()}`, null];
    if (p.estado === 'listo') return ['Recogí el pedido', 'recogido'];
    if (!p.enRuta) return ['Salir a entregar', 'camino'];
    return [p.pago === 'efectivo' && !p.pagado ? `Entregado y cobré ${bsC(totalPedC(p))}` : 'Entregado', 'entregado'];
  };
  return (
    <div className="app-movil" style={{ '--rol': ROL_COLOR.delivery }}>
      <AppTop titulo="App del repartidor" sub={`${activos.length} por entregar · ${hechos.length} entregados hoy`} rol="delivery" onPortada={onPortada} config={config} />
      <div className="app-cuerpo">
        {!activos.length && <div className="empty"><Icon n="moto" s={40} w={1.5} /><b>Sin entregas pendientes</b><span>Cuando cocina marque un delivery como listo aparece aquí.</span></div>}
        {activos.map(p => {
          const paso = pasoEntrega(p); const [txt, accion] = boton(p); const open = abierto === p.no;
          const min = Math.floor((now - p.creado) / 6e4);
          return (
            <article className={'ent' + (open ? ' open' : '')} key={p.no}>
              <button className="ent-head" onClick={() => setAbierto(open ? null : p.no)} aria-expanded={open}>
                <span className="ent-no num">N° {p.no}</span>
                <span className="ent-dir"><b>{p.dir}</b><span>{p.cliente || 'Cliente'}{p.zona ? ` · ${p.zona}` : ''}</span></span>
                <span className={'pill num ' + (min > 30 ? 'pill-red' : 'pill-gray')}>{min} min</span>
              </button>
              <ol className="pasos" aria-label="Avance de la entrega">
                {PASOS_ENTREGA.map((s, i) => <li key={s} className={i < paso ? 'hecho' : i === paso ? 'ahora' : ''} aria-current={i === paso ? 'step' : undefined}><i>{i < paso ? <Icon n="check" s={13} w={3} /> : i + 1}</i><span>{s}</span></li>)}
              </ol>
              {open && (<div className="ent-body">
                <MapaRuta zona={p.zona} dir={p.dir || ''} />
                {p.ref && <div className="muted" style={{ fontSize:14 }}>Referencia: {p.ref}</div>}
                <ul className="av-items">{p.items.map(it => <li key={it.key}><b className="num">{it.q}×</b> {P[it.id] ? P[it.id].nombre : ''}</li>)}</ul>
                <div className="ent-pago">
                  {p.pago === 'efectivo' && !p.pagado
                    ? <><Icon n="cash" s={22} /><span><b>Cobrar en efectivo {bsC(totalPedC(p))}</b>{p.conCuanto ? <span className="muted"> · paga con Bs {p.conCuanto}, lleva {bsC(Math.max(0, aC(p.conCuanto) - totalPedC(p)))} de cambio</span> : ''}</span></>
                    : p.pagado || p.pago !== 'qr' ? <><Icon n="check" s={22} /><span><b>Pagado{p.pago === 'qr' ? ' con QR' : ''}</b><span className="muted"> · no cobres nada</span></span></>
                    : <><Icon n="qr" s={22} /><span><b>Pagó con QR</b><span className="muted"> · caja lo está confirmando, no cobres</span></span></>}
                </div>
                <div className="row" style={{ flexWrap:'wrap' }}>
                  {p.tel && <a className="btn btn-ghost btn-sm" href={`tel:${soloDigitos(p.tel)}`}><Icon n="phone" s={18} />Llamar</a>}
                  {p.tel && <a className="btn btn-ghost btn-sm" href={waLink(p.tel, `Hola ${p.cliente || ''}, soy de ${config.nombre}. Estoy en camino con tu pedido N° ${p.no}.`)} target="_blank" rel="noopener noreferrer"><Icon n="chat" s={18} />WhatsApp</a>}
                  <a className="btn btn-ghost btn-sm" href={mapaLink(p.dir || '')} target="_blank" rel="noopener noreferrer"><Icon n="pin" s={18} />Abrir en mapa</a>
                </div>
              </div>)}
              <button className={'btn ' + (accion ? 'btn-primary' : 'btn-ghost')} disabled={!accion} onClick={() => accion && avanzarEntrega(p)}>{txt}{accion && <Icon n="arrow" s={18} />}</button>
            </article>
          );
        })}
        {hechos.length > 0 && <section style={{ marginTop:8 }}><h2 className="sec-h">Entregados hoy</h2>{hechos.map(p => <div className="av-card" key={p.no}><span className="av-ico" style={{ background:'var(--green-soft)', color:'var(--green-text)' }}><Icon n="check" s={20} /></span><div style={{ flex:1, minWidth:0 }}><b>N° {p.no} · {p.dir}</b><div className="muted num" style={{ fontSize:13.5 }}>{bsC(totalPedC(p))}{p.pago === 'efectivo' ? ' · cobrado en efectivo' : ' · pagado'}</div></div></div>)}</section>}
      </div>
    </div>
  );
}

/* ---------- Tienda online ---------- */
const TONOS = { verde:['#0B5A33', '#fff'], caramelo:['#8A5222', '#fff'], crema:['var(--gold-soft)', 'var(--gold-text)'] };
function BannerRota({ banners, donde }) {
  const lista = banners.filter(b => b.activo && (b.donde === 'ambos' || b.donde === donde));
  const [i, setI] = useState(0);
  useEffect(() => { if (lista.length < 2 || menosMovimiento()) return; const t = setInterval(() => setI(x => (x + 1) % lista.length), 5200); return () => clearInterval(t); }, [lista.length]);
  if (!lista.length) return null;
  const b = lista[i % lista.length]; const [bg, fg] = TONOS[b.tono] || TONOS.verde;
  return (
    <div className="banner" style={{ background:bg, color:fg }} aria-live="polite">
      <div key={b.id} className="banner-in"><b>{b.titulo}</b><span>{b.texto}</span></div>
      {lista.length > 1 && <div className="banner-dots">{lista.map((x, k) => <button key={x.id} aria-label={`Ver aviso ${k + 1}`} aria-pressed={k === i % lista.length} onClick={() => setI(k)} />)}</div>}
    </div>
  );
}
function Tienda({ productos, cats, config, banners, menuDia, crearPedidoWeb, pedidos, onPortada }) {
  const carro = useCarrito('carritoWeb');
  const [custom, setCustom] = useState(null);
  const [checkout, setCheckout] = useState(false);
  const [segui, setSegui] = usePersist('miPedidoWeb', null);
  const [verCarro, setVerCarro] = useState(false);
  const abierto = config.abierto !== false;
  const vend = vendiblesDe(productos, cats).filter(p => p.cat !== 'eventos');
  const ped = segui && pedidos.find(p => p.no === segui);
  const totC = totalC(carro.items);
  const resumen = (<div className="tc">
    {ped ? <Seguimiento p={ped} config={config} onNuevo={() => setSegui(null)} /> : (<>
      <div className="between"><h2>Tu pedido</h2>{carro.items.length > 0 && <button className="link-btn" onClick={carro.vaciar}>Vaciar</button>}</div>
      {carro.items.length ? (<>
        <LineasCarro carro={carro} onEditar={it => setCustom({ id: it.id, linea: it })} />
        <div className="kv" style={{ fontSize:17 }}><b>Subtotal</b><b className="num">{bsC(totC)}</b></div>
        <span className="muted" style={{ fontSize:13 }}>El costo de envío se suma al elegir tu zona.</span>
        <button className="btn btn-primary btn-cobrar" disabled={!abierto} onClick={() => { setCheckout(true); setVerCarro(false); }}><span>{abierto ? 'Continuar' : 'Ahora estamos cerrados'}</span><span className="num">{bsC(totC)}</span></button>
      </>) : <div className="empty" style={{ padding:'22px 6px' }}><Icon n="carrito" s={34} w={1.5} /><b>Todavía no elegiste nada</b><span>Toca un producto para agregarlo.</span></div>}
    </>)}
  </div>);
  return (
    <div className="tienda" style={{ '--rol': ROL_COLOR.tienda }}>
      <AppTop titulo={config.nombre} sub={config.eslogan} rol="tienda" onPortada={onPortada} config={config}
        derecha={<span className={'pill ' + (abierto ? 'pill-green' : 'pill-red')}><i className="dot" style={{ background: abierto ? 'var(--green)' : 'var(--red)' }} />{abierto ? 'Abierto' : 'Cerrado'}</span>} />
      <div className="tienda-in">
        <main className="tienda-main">
          <section className="t-hero">
            <div><div className="eyebrow">Pide en línea · delivery o para recoger</div><h1 className="t-h1">Café de especialidad, con música de fondo.</h1>
              <p className="muted" style={{ margin:'6px 0 0' }}><Icon n="clock" s={15} /> {config.horario} · entrega en {config.tiempo}</p></div>
            {!abierto && <div className="fiscal-warn"><Icon n="clock" s={20} /><span>Ahora estamos cerrados. Puedes ver la carta y pedir cuando abramos.</span></div>}
          </section>
          <BannerRota banners={banners} donde="tienda" />
          <ListaPedir productos={vend} cats={cats} carro={carro} onPersonalizar={id => setCustom({ id })} menuDia={menuDia && menuDia.activo ? menuDia : null} />
          <footer className="t-pie">
            <a className="btn btn-ghost btn-sm" href={waLink(config.whatsapp, `Hola ${config.nombre}, tengo una consulta.`)} target="_blank" rel="noopener noreferrer"><Icon n="chat" s={18} />WhatsApp {config.whatsapp}</a>
            <span className="muted">{config.instagram} · {config.dir}</span>
            <Creditos />
          </footer>
        </main>
        <aside className="tienda-carro" aria-label="Tu pedido">{resumen}</aside>
      </div>
      {(carro.items.length > 0 || ped) && (
        <button className="t-barra" onClick={() => setVerCarro(true)}>
          <span className="num"><b>{ped ? `Pedido N° ${ped.no}` : `${unidades(carro.items)} productos`}</b></span>
          <span>{ped ? ESTADO_PED[ped.estado].l : 'Ver pedido'}</span>
          {!ped && <b className="num">{bsC(totC)}</b>}
        </button>
      )}
      {verCarro && <div className="scrim sheet-scrim-b" onClick={() => setVerCarro(false)}><div className="modal bsheet" role="dialog" aria-modal="true" aria-label="Tu pedido" onClick={e => e.stopPropagation()}><div className="between"><span /><button className="icon-btn" onClick={() => setVerCarro(false)} aria-label="Cerrar"><Icon n="x" s={20} /></button></div>{resumen}</div></div>}
      {custom && <Personalizar id={custom.id} linea={custom.linea} onAdd={carro.add} onClose={() => setCustom(null)} />}
      {checkout && <CheckoutWeb items={carro.items} config={config} onClose={() => setCheckout(false)} onConfirm={d => Promise.resolve(crearPedidoWeb({ ...d, items: carro.items })).then(no => { setSegui(no); carro.vaciar(); setCheckout(false); }).catch(() => {})} />}
    </div>
  );
}
function CheckoutWeb({ items, config, onConfirm, onClose }) {
  const [f, setF] = useState({ nombre:'', tel:'', entrega:'delivery', zona:0, dir:'', ref:'', pago:'qr', conCuanto:'', nota:'' });
  const [err, setErr] = useState({});
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  useEscape(onClose);
  const subC = totalC(items);
  const envioC = f.entrega === 'delivery' ? aC(config.zonas[f.zona] ? config.zonas[f.zona].c : 0) : 0;
  const totC = subC + envioC;
  const enviar = e => {
    e.preventDefault();
    const er = {};
    if (!f.nombre.trim()) er.nombre = 'Escribe tu nombre.';
    if (soloDigitos(f.tel).length < 8) er.tel = 'Escribe un celular de 8 números.';
    if (f.entrega === 'delivery' && f.dir.trim().length < 6) er.dir = 'Escribe la calle y el número.';
    if (f.entrega === 'delivery' && subC < aC(config.minimo)) er.min = `El pedido mínimo para delivery es ${bs(config.minimo)}.`;
    if (f.pago === 'efectivo' && f.conCuanto && aC(String(f.conCuanto).replace(',', '.')) < totC) er.conCuanto = 'Ese monto no alcanza para el total.';
    setErr(er);
    if (Object.keys(er).length) { const k = Object.keys(er)[0]; setTimeout(() => { const el = document.getElementById('ck-' + k); el && el.focus(); }, 0); return; }
    onConfirm({ ...f, nombre: f.nombre.trim(), conCuanto: f.conCuanto ? String(f.conCuanto).replace(',', '.') : '' });
  };
  return (
    <div className="scrim" onClick={onClose}>
      <form className="modal modal-lg" role="dialog" aria-modal="true" aria-labelledby="ck-t" onClick={e => e.stopPropagation()} onSubmit={enviar} noValidate>
        <div className="between"><div><div className="eyebrow">Último paso</div><h2 id="ck-t" style={{ fontSize:24 }}>¿A dónde lo llevamos?</h2></div><button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icon n="x" s={20} /></button></div>
        <div className="seg seg-2" role="group" aria-label="Forma de entrega">
          <button type="button" aria-pressed={f.entrega === 'delivery'} onClick={() => set('entrega', 'delivery')}><Icon n="moto" s={20} />Delivery</button>
          <button type="button" aria-pressed={f.entrega === 'retiro'} onClick={() => set('entrega', 'retiro')}><Icon n="bag" s={20} />Paso a recoger</button>
        </div>
        <div className="form-grid">
          <label className="field">Tu nombre<input id="ck-nombre" className="input" value={f.nombre} onChange={e => set('nombre', e.target.value)} autoComplete="name" aria-invalid={!!err.nombre} />{err.nombre && <span className="err">{err.nombre}</span>}</label>
          <label className="field">Celular<input id="ck-tel" className="input num" inputMode="tel" value={f.tel} onChange={e => set('tel', e.target.value)} placeholder="Ej. 70012345" autoComplete="tel" aria-invalid={!!err.tel} />{err.tel && <span className="err">{err.tel}</span>}</label>
          {f.entrega === 'delivery' && (<>
            <label className="field span-2">Zona de entrega
              <select id="ck-zona" className="input" value={f.zona} onChange={e => set('zona', Number(e.target.value))}>{config.zonas.map((z, i) => <option key={i} value={i}>{z.n} · envío {bs(z.c)}</option>)}</select>
            </label>
            <label className="field span-2">Dirección<input id="ck-dir" className="input" value={f.dir} onChange={e => set('dir', e.target.value)} placeholder="Ej. Calle Sucre #245" autoComplete="street-address" aria-invalid={!!err.dir} />{err.dir && <span className="err">{err.dir}</span>}</label>
            <label className="field span-2">Referencia <span className="opt">opcional</span><input id="ck-ref" className="input" value={f.ref} onChange={e => set('ref', e.target.value)} placeholder="Ej. Portón verde, frente a la plaza" /></label>
          </>)}
          <div className="field span-2">¿Cómo pagas?
            <div className="seg seg-2" role="group" aria-label="Forma de pago">
              <button type="button" aria-pressed={f.pago === 'qr'} onClick={() => set('pago', 'qr')}><Icon n="qr" s={20} />QR ahora</button>
              <button type="button" aria-pressed={f.pago === 'efectivo'} onClick={() => set('pago', 'efectivo')}><Icon n="cash" s={20} />{f.entrega === 'delivery' ? 'Efectivo al recibir' : 'Al recoger'}</button>
            </div>
          </div>
          {f.pago === 'efectivo' && f.entrega === 'delivery' && <label className="field span-2">¿Con cuánto pagas? <span className="opt">para llevarte cambio</span><div className="input-pre"><span>Bs</span><input id="ck-conCuanto" className="input num" inputMode="decimal" value={f.conCuanto} onChange={e => set('conCuanto', e.target.value)} placeholder={String(Math.ceil(totC / 5000) * 50)} aria-invalid={!!err.conCuanto} /></div>{err.conCuanto && <span className="err">{err.conCuanto}</span>}</label>}
          <label className="field span-2">Nota para el local <span className="opt">opcional</span><input id="ck-nota" className="input" value={f.nota} onChange={e => set('nota', e.target.value)} placeholder="Ej. sin azúcar, tocar el timbre" /></label>
        </div>
        <div className="sum-box num">
          <div className="kv"><span>Productos</span><b>{bsC(subC)}</b></div>
          {f.entrega === 'delivery' && <div className="kv"><span>Envío · {config.zonas[f.zona] ? config.zonas[f.zona].n : ''}</span><b>{bsC(envioC)}</b></div>}
          <div className="kv" style={{ fontSize:17 }}><b>Total</b><b style={{ fontFamily:'var(--f-display)', fontSize:22 }}>{bsC(totC)}</b></div>
          {err.min && <span className="err">{err.min}</span>}
        </div>
        <button className="btn btn-primary btn-cobrar" type="submit"><span>Hacer el pedido</span><span className="num">{bsC(totC)}</span></button>
      </form>
    </div>
  );
}
function Seguimiento({ p, config, onNuevo }) {
  const pasos = p.tipo === 'delivery' ? ['recibido', 'prep', 'camino', 'entregado'] : ['recibido', 'prep', 'listo', 'entregado'];
  const idx = p.estado === 'anulado' ? -1 : Math.max(pasos.indexOf(p.estado), p.estado === 'listo' && p.tipo === 'delivery' ? 1 : 0);
  const txt = `Hola ${config.nombre}, hice el pedido N° ${p.no} en la tienda online:\n${p.items.map(i => `• ${i.q}× ${P[i.id] ? P[i.id].nombre : ''}`).join('\n')}\nTotal ${bsC(totalPedC(p))} · ${p.tipo === 'delivery' ? 'delivery a ' + p.dir : 'paso a recoger'}.`;
  return (<div className="stack" style={{ gap:12 }}>
    <div><div className="eyebrow">Pedido N° {p.no}</div><h2>{p.estado === 'entregado' ? '¡Que lo disfrutes!' : p.estado === 'anulado' ? 'Pedido anulado' : '¡Recibimos tu pedido!'}</h2></div>
    <ol className="pasos pasos-v">
      {pasos.map((s, i) => <li key={s} className={i < idx ? 'hecho' : i === idx ? 'ahora' : ''} aria-current={i === idx ? 'step' : undefined}><i>{i < idx ? <Icon n="check" s={13} w={3} /> : i + 1}</i><span>{s === 'listo' ? 'Listo para recoger' : ESTADO_PED[s].l}</span></li>)}
    </ol>
    {p.pago === 'qr' && !p.pagado && p.estado !== 'anulado' && <div className="row" style={{ gap:12, alignItems:'center' }}><QR size={110} pago /><span className="muted" style={{ fontSize:14 }}>Escanea y paga <b className="num">{bsC(totalPedC(p))}</b> con la app de tu banco. El local confirma tu pago.</span></div>}
    {p.pagado && <span className="pill pill-green" style={{ alignSelf:'flex-start' }}><Icon n="check" s={14} />Pago confirmado</span>}
    <span className="muted" style={{ fontSize:14 }}>{p.tipo === 'delivery' ? `Llega en ${config.tiempo} a ${p.dir}.` : `Te avisamos cuando esté listo · ${config.dir}.`}</span>
    <a className="btn btn-ghost" href={waLink(config.whatsapp, txt)} target="_blank" rel="noopener noreferrer"><Icon n="chat" s={19} />Enviar el pedido por WhatsApp</a>
    {(p.estado === 'entregado' || p.estado === 'anulado') && <button className="btn btn-primary" onClick={onNuevo}>Hacer otro pedido</button>}
  </div>);
}

/* ---------- Pedido desde la mesa (QR) ---------- */
function ElegirMesa({ mesas, n, setN, etiqueta = 'Ver como la mesa' }) {
  if (!setN) return null;
  return <label className="demo-mesa"><span>{etiqueta}</span><select className="input" value={n || ''} onChange={e => setN(Number(e.target.value))}>{mesas.map(m => <option key={m.n} value={m.n}>Mesa {m.n}</option>)}</select></label>;
}
function PedidoMesa({ n, setN, mesas, productos, cats, menuDia, solicitudes, crearSolicitud, llamadas, llamar, pedidos, config, onPortada }) {
  const carro = useCarrito('carritoMesa');
  const [tab, setTab] = useState('carta');
  const [custom, setCustom] = useState(null);
  const [nombre, setNombre] = useState('');
  const [listo, setListo] = useState(false);
  const [cuenta, setCuenta] = useState(false);
  const m = mesas.find(x => x.n === n) || mesas[0];
  const vend = vendiblesDe(productos, cats).filter(p => p.cat !== 'eventos');
  const misSol = solicitudes.filter(s => s.mesa === m.n);
  const misPed = pedidos.filter(p => p.origen === `Mesa ${m.n}` && p.estado !== 'entregado' && p.estado !== 'anulado');
  const llamando = llamadas.find(l => l.mesa === m.n && l.estado === 'pendiente');
  const enviar = () => { crearSolicitud(m.n, carro.items, nombre.trim()); carro.vaciar(); setListo(true); };
  return (
    <div className="app-movil cliente" style={{ '--rol': ROL_COLOR.cliente }}>
      <AppTop titulo={config.nombre} sub={`Mesa ${m.n} · pide desde tu celular`} rol="cliente" onPortada={onPortada} config={config} />
      <div className="app-cuerpo">
        <ElegirMesa mesas={mesas} n={m.n} setN={setN} />
        {config.abierto === false && <div className="fiscal-warn"><Icon n="clock" s={20} /><span>El local no está recibiendo pedidos por QR ahora. Llama al mesero y te atiende en persona.</span></div>}
        {listo && <div className="ok-tira" role="status"><Icon n="check" s={22} /><span><b>¡Listo! Tu pedido llegó al mesero.</b><span>Lo confirma en un momento y pasa a la barra.</span></span><button className="icon-btn" onClick={() => setListo(false)} aria-label="Cerrar aviso"><Icon n="x" s={18} /></button></div>}
        {(misSol.length > 0 || misPed.length > 0) && <div className="estado-mesa">
          {misSol.map(s => <span key={s.id} className="pill pill-gold"><Icon n="clock" s={14} />{unidades(s.items)} productos · esperando al mesero</span>)}
          {misPed.map(p => <span key={p.no} className={'pill ' + ESTADO_PED[p.estado].pill}><Icon n={ESTADO_PED[p.estado].icon} s={14} />N° {p.no} · {ESTADO_PED[p.estado].l}</span>)}
        </div>}
        {tab === 'carta' ? <ListaPedir productos={vend} cats={cats} carro={carro} onPersonalizar={id => setCustom({ id })} menuDia={menuDia && menuDia.activo ? menuDia : null} /> : (
          <section className="card stack" style={{ gap:12 }}>
            <h2>Cuenta de la Mesa {m.n}</h2>
            {m.items.length ? (<>
              <ul className="av-items">{m.items.map(it => <li key={it.key}><b className="num">{it.q}×</b> {P[it.id] ? P[it.id].nombre : ''}<span className="num" style={{ marginLeft:'auto' }}>{bsC(lineUnitC(it) * it.q)}</span></li>)}</ul>
              {m.pagadoC > 0 && <div className="kv"><span>Ya pagado</span><b className="num">− {bsC(m.pagadoC)}</b></div>}
              <div className="kv" style={{ fontSize:18 }}><b>Total</b><b className="num" style={{ fontFamily:'var(--f-display)' }}>{bsC(totalC(m.items) - (m.pagadoC || 0))}</b></div>
              {llamando && llamando.tipo === 'cuenta' ? <span className="pill pill-gold" style={{ alignSelf:'flex-start' }}><Icon n="clock" s={14} />Ya pediste la cuenta · el mesero viene</span>
                : cuenta ? <div className="stack" style={{ gap:8 }}><b>¿Cómo vas a pagar?</b><div className="seg seg-3">{['Efectivo', 'QR', 'Tarjeta'].map(x => <button key={x} onClick={() => { llamar(m.n, 'cuenta', x); setCuenta(false); }}>{x}</button>)}</div></div>
                : <button className="btn btn-primary" onClick={() => setCuenta(true)}><Icon n="cash" s={19} />Pedir la cuenta</button>}
            </>) : <p className="muted" style={{ margin:0 }}>Todavía no hay nada en la cuenta de esta mesa.</p>}
          </section>
        )}
      </div>
      {tab === 'carta' && carro.items.length > 0 && (
        <div className="draft-bar abierta">
          <div className="draft-lista"><LineasCarro carro={carro} onEditar={it => setCustom({ id: it.id, linea: it })} />
            <label className="field" style={{ fontSize:14 }}>Tu nombre <span className="opt">opcional</span><input className="input" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Así el mesero sabe de quién es" /></label></div>
          <button className="btn btn-primary" onClick={enviar} disabled={config.abierto === false}><Icon n="arrow" s={19} />Enviar al mesero · <span className="num">{bsC(totalC(carro.items))}</span></button>
        </div>
      )}
      <nav className="app-nav" aria-label="Secciones">
        <button aria-current={tab === 'carta' ? 'page' : undefined} onClick={() => setTab('carta')}><Icon n="libro" s={24} /><span>Carta</span>{carro.items.length > 0 && <i className="num">{unidades(carro.items)}</i>}</button>
        <button onClick={() => llamar(m.n, 'mesero')} disabled={!!llamando} className="nav-llamar"><Icon n="bell" s={24} /><span>{llamando ? 'Ya viene' : 'Llamar'}</span></button>
        <button aria-current={tab === 'cuenta' ? 'page' : undefined} onClick={() => setTab('cuenta')}><Icon n="cash" s={24} /><span>Mi cuenta</span></button>
      </nav>
      {custom && <Personalizar id={custom.id} linea={custom.linea} onAdd={carro.add} onClose={() => setCustom(null)} />}
    </div>
  );
}

/* ---------- Llamar al mesero (segundo QR de la mesa) ---------- */
function LlamarMesero({ n, setN, mesas, llamadas, llamar, cancelarLlamada, config, now, onPortada, irCarta }) {
  const m = mesas.find(x => x.n === n) || mesas[0];
  const act = llamadas.filter(l => l.mesa === m.n && l.estado === 'pendiente');
  const [pago, setPago] = useState(false);
  return (
    <div className="app-movil cliente" style={{ '--rol': ROL_COLOR.cliente }}>
      <AppTop titulo={config.nombre} sub={`Mesa ${m.n}`} rol="cliente" onPortada={onPortada} config={config} />
      <div className="app-cuerpo llamar">
        <ElegirMesa mesas={mesas} n={m.n} setN={setN} />
        <h1 className="llamar-h">¿En qué te ayudamos?</h1>
        {act.length > 0 ? act.map(l => (
          <div className="ok-tira" key={l.id} role="status"><Icon n="bell" s={24} /><span><b>{l.tipo === 'cuenta' ? 'Pediste la cuenta' : 'Llamaste al mesero'}</b><span className="num">Ya le avisamos · {haceTxt(l.t, now)}</span></span><button className="btn btn-ghost btn-sm" onClick={() => cancelarLlamada(l)}>Cancelar</button></div>
        )) : null}
        <button className="llamar-btn" disabled={act.some(l => l.tipo === 'mesero')} onClick={() => llamar(m.n, 'mesero')}><Icon n="mano" s={44} w={1.6} /><b>Llamar al mesero</b><span>Viene a tu mesa</span></button>
        {pago ? (
          <div className="card stack" style={{ gap:10 }}><b>¿Cómo vas a pagar?</b><div className="seg seg-3">{['Efectivo', 'QR', 'Tarjeta'].map(x => <button key={x} onClick={() => { llamar(m.n, 'cuenta', x); setPago(false); }}>{x}</button>)}</div></div>
        ) : <button className="llamar-btn llamar-alt" disabled={act.some(l => l.tipo === 'cuenta') || !m.items.length} onClick={() => setPago(true)}><Icon n="cash" s={44} w={1.6} /><b>Pedir la cuenta</b><span className="num">{m.items.length ? `Tu cuenta: ${bsC(totalC(m.items) - (m.pagadoC || 0))}` : 'Aún no hay consumo'}</span></button>}
        <button className="btn btn-ghost" onClick={irCarta}><Icon n="libro" s={19} />Ver la carta y pedir desde aquí</button>
      </div>
    </div>
  );
}

/* ---------- Pantalla del cliente (segunda pantalla de la caja) ---------- */
function PantallaCliente({ cart, pantalla, config, banners, menuDia, eventos, onPortada }) {
  const [, setTic] = useState(0);
  useEffect(() => { const t = setInterval(() => setTic(x => x + 1), 1000); return () => clearInterval(t); }, []);
  const cobro = pantalla && pantalla.cobro;
  const gracias = pantalla && pantalla.gracias && Date.now() - pantalla.gracias < 7000;
  const items = (cobro ? cobro.items : cart).filter(it => P[it.id]);
  const ev = eventos.filter(e => e.estado === 'publicado' && e.fecha >= hoyISO()).sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora))[0];
  const totC = cobro ? cobro.cobrarC : totalC(items);
  return (
    <div className="pantalla">
      {onPortada && <button className="pantalla-volver" onClick={onPortada} aria-label="Volver a la portada"><Icon n="back" s={18} />Portada</button>}
      {gracias ? (
        <div className="pc-gracias"><Logo src={config.logo} nombre={config.nombre} cls="pc-logo" /><h1>¡Gracias por tu visita!</h1><p>{config.pie}</p></div>
      ) : !items.length && !cobro ? (
        <div className="pc-bienvenida">
          <Logo src={config.logo} nombre={config.nombre} cls="pc-logo" />
          <h1>Bienvenido a {config.nombre}</h1>
          <p className="pc-esl">{config.eslogan}</p>
          <BannerRota banners={banners} donde="pantalla" />
          <div className="pc-promos">
            {menuDia && menuDia.activo && <div className="pc-promo"><span className="eyebrow">Menú del día · hasta las {menuDia.hasta}</span><b>{menuDia.titulo}</b><span>{menuDia.desc}</span><b className="num pc-precio">{bs(menuDia.precio)}</b></div>}
            {ev && <div className="pc-promo"><span className="eyebrow">{ev.fecha === hoyISO() ? 'Hoy' : fechaDMA(ev.fecha)} · {ev.hora}</span><b>{ev.nombre}</b><span>{ev.artista} · {ev.genero}</span>{ev.precio > 0 && <b className="num pc-precio">Entrada {bs(ev.precio)}</b>}</div>}
          </div>
          <p className="pc-ig">Síguenos en {config.instagram}</p>
        </div>
      ) : (
        <div className="pc-pedido">
          <section className="pc-lista">
            <div className="row" style={{ gap:14 }}><Logo src={config.logo} nombre={config.nombre} cls="pc-logo-s" /><h1>{cobro ? cobro.titulo : 'Tu pedido'}</h1></div>
            <ul>{items.map(it => <li key={it.key}><b className="num">{it.q}×</b><span><b>{P[it.id].nombre}</b>{modsTxt(it) && <small>{modsTxt(it)}</small>}</span><b className="num">{bsC(lineUnitC(it) * it.q)}</b></li>)}</ul>
          </section>
          <section className="pc-total">
            <span className="eyebrow">{cobro ? 'Total a pagar' : 'Total'}</span>
            <b className="pc-monto num">{bsC(totC)}</b>
            {!FISCAL.simplificado && <span className="pc-iva">IVA incluido</span>}
            {cobro && cobro.met === 'qr' ? <div className="pc-qr"><QR size={220} pago /><b>Escanea con la app de tu banco</b></div>
              : cobro && cobro.met === 'tarjeta' ? <div className="pc-met"><Icon n="card" s={48} w={1.5} /><b>Acerca tu tarjeta al datáfono</b></div>
              : cobro ? <div className="pc-met"><Icon n="cash" s={48} w={1.5} /><b>Pago en efectivo</b></div>
              : <span className="pc-iva">Tu pedido se arma en caja</span>}
          </section>
        </div>
      )}
    </div>
  );
}

/* ============ Administración: panel, pedidos, carta, compras y finanzas ============ */
function incidenciasDe({ insumos, productos, pedidos, llamadas, solicitudes, cobrosQR, compras, caja, config, impresora, now }) {
  const r = [];
  const ll = llamadas.filter(l => l.estado === 'pendiente');
  if (ll.length) r.push({ k:'ll', tono:'gold', icon:'bell', t: ll.length === 1 ? `Mesa ${ll[0].mesa} ${ll[0].tipo === 'cuenta' ? 'pide la cuenta' : 'llama al mesero'}` : `${ll.length} mesas llaman al mesero`, d: haceTxt(Math.min(...ll.map(l => l.t)), now), ir:'mesero', b:'Abrir app del mesero' });
  if (solicitudes.length) r.push({ k:'sol', tono:'blue', icon:'qr', t:`${solicitudes.length} pedido${solicitudes.length > 1 ? 's' : ''} por QR esperando al mesero`, d:'El mesero los confirma antes de pasar a barra', ir:'mesero', b:'Confirmar' });
  const qrp = cobrosQR.filter(c => c.estado === 'pendiente');
  if (qrp.length) r.push({ k:'qr', tono:'gold', icon:'qr', t:`${qrp.length} pago${qrp.length > 1 ? 's' : ''} QR por confirmar`, d: bsC(qrp.reduce((s, c) => s + c.montoC, 0)), ir:'finanzas', b:'Revisar' });
  const lento = pedidos.filter(p => (p.estado === 'recibido' || p.estado === 'prep') && now - p.creado > (config.demora || 15) * 6e4);
  if (lento.length) r.push({ k:'lento', tono:'red', icon:'clock', t:`${lento.length} pedido${lento.length > 1 ? 's' : ''} con más de ${config.demora || 15} min en barra`, d: lento.map(p => `N° ${p.no}`).join(' · '), ir:'cocina', b:'Ver cocina' });
  const web = pedidos.filter(p => p.web && p.estado === 'recibido');
  if (web.length) r.push({ k:'web', tono:'blue', icon:'store', t:`${web.length} pedido${web.length > 1 ? 's' : ''} nuevo${web.length > 1 ? 's' : ''} de la tienda online`, d: web.map(p => `N° ${p.no}`).join(' · '), ir:'pedidos', b:'Ver pedidos' });
  const bajos = insumos.filter(i => i.s <= i.min);
  if (bajos.length) r.push({ k:'stock', tono:'red', icon:'inventario', t:`${bajos.length} insumo${bajos.length > 1 ? 's' : ''} con stock bajo`, d: bajos.slice(0, 3).map(i => i.n).join(', ') + (bajos.length > 3 ? '…' : ''), ir:'compras', b:'Registrar compra' });
  const agot = productos.filter(p => !p.eliminado && p.stockCtl && p.stock <= 0);
  if (agot.length) r.push({ k:'agot', tono:'red', icon:'tag', t:`${agot.length} producto${agot.length > 1 ? 's' : ''} agotado${agot.length > 1 ? 's' : ''}`, d: agot.map(p => p.nombre).join(', '), ir:'inventario', b:'Ver inventario' });
  const pp = compras.filter(c => c.estado === 'por pagar');
  if (pp.length) r.push({ k:'pp', tono:'gold', icon:'camion', t:`${pp.length} compra${pp.length > 1 ? 's' : ''} por pagar a proveedores`, d: bsC(pp.reduce((s, c) => s + compraTotalC(c), 0)), ir:'compras', b:'Ver compras' });
  if (!caja.abierta) r.push({ k:'caja', tono:'red', icon:'lock', t:'La caja está cerrada', d:'No se pueden cobrar ventas', ir:'caja', b:'Abrir caja' });
  if (impresora !== 'ok') r.push({ k:'imp', tono:'red', icon:'print', t: impresora === 'papel' ? 'La impresora no tiene papel' : 'La impresora está desconectada', d:'Los tickets no salen impresos', ir:'config', b:'Revisar' });
  return r;
}

function Inicio({ caja, pedidos, mesas, config, setConfig, eventos, reservas, ir, incidencias, now, aviso, registrar }) {
  const [per, setPer] = useState('hoy');
  const hoyC = (caja.ventas.efectivo + caja.ventas.qr + caja.ventas.tarjeta) || 1;
  const datos = per === 'hoy' ? REP.horas.map(([h, v]) => [String(h), v, h === REP.kpi.picoH]) : per === '7' ? REP.semana.map(([d, v]) => [d, v, d === 'Hoy']) : VENTAS_30.map(([d, v], i) => [String(d.getDate()), v, i === 29]);
  const ventasC = per === 'hoy' ? REP.kpi.ventasC : Math.round(datos.reduce((s, d) => s + d[1], 0) * 100);
  const antC = per === 'hoy' ? REP.kpi.antC : per === '7' ? REP.kpi.ant7C : REP.kpi.ant30C;
  const tickets = per === 'hoy' ? REP.kpi.tickets : per === '7' ? REP.kpi.tickets7 : REP.kpi.tickets30;
  const delta = antC ? Math.round((ventasC - antC) / antC * 100) : 0;
  const activos = pedidos.filter(p => !['entregado', 'anulado'].includes(p.estado));
  const camino = pedidos.filter(p => p.estado === 'camino').length;
  const ocupadas = mesas.filter(m => m.estado !== 'libre').length;
  const abierto = config.abierto !== false;
  const met = [['Efectivo', caja.ventas.efectivo, 'var(--series-1)'], ['QR', caja.ventas.qr, 'var(--series-2)'], ['Tarjeta', caja.ventas.tarjeta, 'var(--series-3)']];
  const ev = eventos.filter(e => e.estado === 'publicado' && e.fecha >= hoyISO()).sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora))[0];
  const toggleLocal = () => { setConfig(c => ({ ...c, abierto: !abierto })); registrar(abierto ? 'Cerró el local para pedidos en línea' : 'Abrió el local para pedidos en línea'); aviso(abierto ? 'Local cerrado: la tienda online y el QR de mesa no reciben pedidos' : 'Local abierto: ya se reciben pedidos en línea', 'power'); };
  const exportar = () => guardarExcel(nombreArchivo(NEGOCIO, 'resumen'), [
    { nombre:'Resumen', titulo:`${NEGOCIO} · Resumen ${per === 'hoy' ? 'de hoy' : `de los últimos ${per} días`}`, sub:`${fechaDMA(hoyISO())} · montos en bolivianos`, columnas:['Indicador', 'Valor'], filas:[['Ventas', { bs: ventasC }], ['Tickets', { int: tickets }], ['Ticket promedio', { bs: Math.round(ventasC / (tickets || 1)) }], ['Pedidos activos', { int: activos.length }], ['Mesas ocupadas', { int: ocupadas }]] },
    { nombre:'Ventas', titulo:'Ventas del periodo', columnas:[per === 'hoy' ? 'Hora' : 'Día', 'Ventas'], filas: datos.map(([k, v]) => [per === 'hoy' ? `${k.padStart(2, '0')}:00` : k, { bs: v * 100 }]) },
    { nombre:'Incidencias', titulo:'Incidencias abiertas', columnas:['Incidencia', 'Detalle'], filas: incidencias.length ? incidencias.map(i => [i.t, i.d]) : [['Sin incidencias', '']] },
  ], aviso);
  return (<>
    <div className="page-head">
      <Pestanas valor={per} set={setPer} etiqueta="Periodo" ops={[['hoy', 'Hoy'], ['7', '7 días'], ['30', '30 días']]} />
      <div className="row head-actions">
        <button className={'local-sw' + (abierto ? ' on' : '')} role="switch" aria-checked={abierto} onClick={toggleLocal}><span className="switch" aria-hidden="true" /><span><b>{abierto ? 'Local abierto' : 'Local cerrado'}</b><small>{abierto ? 'Recibe pedidos en línea' : 'Tienda y QR pausados'}</small></span></button>
        <BotonExcel onExport={exportar} etiqueta="Exportar resumen" />
      </div>
    </div>
    <div className="kpis">
      <div className="card kpi"><div className="eyebrow">Ventas</div><div className="kpi-val num"><AnimNum value={ventasC} fmt={bsC} desde={0} /></div>{antC ? <span className={'pill num ' + (delta >= 0 ? 'pill-green' : 'pill-red')}>{delta >= 0 ? '+' : ''}{delta} % vs. periodo anterior</span> : <span className="muted">Sin datos del periodo anterior</span>}</div>
      <div className="card kpi"><div className="eyebrow">Tickets</div><div className="kpi-val num">{tickets.toLocaleString('es-BO')}</div><span className="muted num">Promedio {bsC(Math.round(ventasC / (tickets || 1)))}</span></div>
      <div className="card kpi"><div className="eyebrow">Pedidos en curso</div><div className="kpi-val num">{activos.length}</div><span className="muted num">{camino} delivery en camino</span></div>
      <div className="card kpi"><div className="eyebrow">Mesas ocupadas</div><div className="kpi-val num">{ocupadas}<small className="muted"> / {mesas.length}</small></div><span className="muted">{ev ? `${ev.fecha === hoyISO() ? 'Hoy' : fechaDMA(ev.fecha)} ${ev.hora} · ${ev.genero}` : 'Sin eventos próximos'}</span></div>
    </div>
    <div className="grid-dash">
      <section className="card">
        <div className="between" style={{ marginBottom:14, flexWrap:'wrap' }}><h2>{per === 'hoy' ? 'Ventas por hora' : `Ventas de los últimos ${per} días`}</h2><span className="muted">En Bs</span></div>
        <Barras datos={datos} etiqueta={per === 'hoy' ? 'Ventas por hora de hoy, pico a las 20:00' : 'Ventas por día'} />
      </section>
      <section className="card inc-card">
        <div className="between" style={{ marginBottom:6 }}><h2>Incidencias</h2><span className={'pill num ' + (incidencias.length ? 'pill-red' : 'pill-green')}>{incidencias.length || 'Todo bien'}</span></div>
        {incidencias.length ? incidencias.map(i => (
          <div className="inc" key={i.k}>
            <span className="av-ico" style={{ background:`var(--${i.tono}-soft)`, color:`var(--${i.tono}-text)` }}><Icon n={i.icon} s={20} /></span>
            <div style={{ flex:1, minWidth:0 }}><b>{i.t}</b><div className="muted num" style={{ fontSize:13 }}>{i.d}</div></div>
            <button className="btn btn-ghost btn-sm" onClick={() => ir(i.ir)}>{i.b}</button>
          </div>
        )) : <div className="empty" style={{ padding:'20px 6px' }}><Icon n="check" s={34} w={1.5} /><b>Sin incidencias</b><span>Todo está funcionando.</span></div>}
      </section>
    </div>
    <div className="grid-2">
      <section className="card">
        <h2 style={{ marginBottom:14 }}>Cómo pagan en este turno</h2>
        <div className="stacked">{met.map(([k, v, c]) => <span key={k} style={{ width: (v / hoyC * 100) + '%', background:c }} title={`${k} ${bsC(v)}`} />)}</div>
        <div style={{ marginTop:12 }}>{met.map(([k, v, c]) => <div className="kv num" key={k}><span className="row"><i className="dot" style={{ background:c, width:12, height:12 }} /><b>{k}</b></span><span>{bsC(v)} <span className="muted">· {Math.round(v / hoyC * 100)} %</span></span></div>)}</div>
      </section>
      <section className="card">
        <div className="between" style={{ marginBottom:10 }}><h2>Ir a un módulo</h2><button className="link-btn" onClick={() => ir('portada')}>Ver todos</button></div>
        <div className="atajos">
          {[['mesero', 'App del mesero', 'mano', 'mesero'], ['reparto', 'Repartidor', 'moto', 'delivery'], ['tienda', 'Tienda online', 'store', 'tienda'], ['pantalla', 'Pantalla del cliente', 'pantalla', 'cliente']].map(([id, l, ic, rol]) => (
            <button key={id} className="atajo" style={{ '--rol': ROL_COLOR[rol] }} onClick={() => ir(id)}><Icon n={ic} s={22} /><span>{l}</span></button>
          ))}
        </div>
      </section>
    </div>
  </>);
}

/* ---------- Pedidos: tabla con filtros, orden, selección y detalle ---------- */
const POR_PAG = 10;
function PedidosAdm({ pedidos, setPedidos, now, aviso, pedirAuth, registrar, avanzar, cobrarPedido, abrirNo, setAbrirNo }) {
  const telefono = useMedia('(max-width: 699px)');
  const [q, setQ] = useState('');
  const qd = sinTildes(useDebounce(q.trim()));
  const [est, setEst] = useState('todos');
  const [tipo, setTipo] = useState('todos');
  const [orden, setOrden] = useState(['no', -1]);
  const [pag, setPag] = useState(1);
  const [sel, setSel] = useState([]);
  const [det, setDet] = useState(null);
  const [anular, setAnular] = useState(null);
  useEffect(() => { if (abrirNo) { setDet(abrirNo); setAbrirNo(null); } }, [abrirNo]);
  useEffect(() => setPag(1), [qd, est, tipo]);
  const base = pedidos.filter(p => tipo === 'todos' || (tipo === 'web' ? p.web : tipo === 'qr' ? p.qr : p.tipo === tipo && !p.web));
  const cuenta = k => base.filter(p => k === 'todos' || p.estado === k).length;
  const lista = base.filter(p => (est === 'todos' || p.estado === est) && (!qd || sinTildes(`${p.no} ${p.origen} ${p.cliente || ''} ${p.dir || ''} ${p.items.map(i => P[i.id] ? P[i.id].nombre : '').join(' ')}`).includes(qd)))
    .sort((a, b) => { const [k, d] = orden; const va = k === 'total' ? totalPedC(a) : k === 'hora' ? a.creado : a.no, vb = k === 'total' ? totalPedC(b) : k === 'hora' ? b.creado : b.no; return (va - vb) * d; });
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAG));
  const pagina = lista.slice((pag - 1) * POR_PAG, pag * POR_PAG);
  const ordenar = k => setOrden(([ok, d]) => [k, ok === k ? -d : -1]);
  const ariaSort = k => orden[0] === k ? (orden[1] > 0 ? 'ascending' : 'descending') : 'none';
  const p = det && pedidos.find(x => x.no === det);
  const selListos = sel.filter(no => { const x = pedidos.find(y => y.no === no); return x && x.estado === 'listo' && x.tipo !== 'delivery' && !(x.pago === 'efectivo' && x.web && !x.pagado); });
  const exportar = (filas, que) => guardarExcel(nombreArchivo(NEGOCIO, que), [{ nombre:'Pedidos', titulo:`${NEGOCIO} · Pedidos`, sub:`${fechaDMA(hoyISO())} · ${filas.length} pedidos`, columnas:['N°', 'Hora', 'Origen', 'Tipo', 'Productos', 'Estado', 'Total'],
    filas: filas.map(x => [{ int:x.no }, hmDe(x.creado), x.origen, tipoPedTxt(x), x.items.map(i => `${i.q}× ${P[i.id] ? P[i.id].nombre : ''}`).join(', '), ESTADO_PED[x.estado].l, { bs: totalPedC(x) }]), total:['Total', '', '', '', '', '', { bs: filas.reduce((s, x) => s + totalPedC(x), 0) }] }], aviso);
  const entregarSel = () => { setPedidos(ps => ps.map(x => selListos.includes(x.no) ? { ...x, estado:'entregado' } : x)); aviso(`${selListos.length} pedidos marcados como entregados`); setSel([]); };
  const accionDe = x => {
    if (x.estado === 'anulado' || x.estado === 'entregado') return null;
    if (x.estado === 'listo' && x.web && x.tipo !== 'delivery' && x.pago === 'efectivo' && !x.pagado) return ['Cobrar y entregar', () => cobrarPedido(x)];
    if (x.estado === 'recibido') return ['Empezar a preparar', () => avanzar(x, 'prep')];
    if (x.estado === 'prep') return ['Marcar listo', () => avanzar(x, 'listo')];
    if (x.estado === 'listo') return x.tipo === 'delivery' ? [`Enviar con ${x.rep || 'el repartidor'}`, () => avanzar(x, 'camino')] : ['Entregado', () => avanzar(x, 'entregado')];
    return ['Entregado al cliente', () => avanzar(x, 'entregado')];
  };
  const fila = x => {
    const e = ESTADO_PED[x.estado];
    const marcado = sel.includes(x.no);
    const check = <input type="checkbox" className="chk" checked={marcado} onChange={() => setSel(s => marcado ? s.filter(n => n !== x.no) : [...s, x.no])} aria-label={`Seleccionar pedido ${x.no}`} onClick={e2 => e2.stopPropagation()} />;
    if (telefono) return (
      <li key={x.no} className={'pc' + (marcado ? ' sel' : '')} onClick={() => setDet(x.no)}>
        <div className="between">{check}<b className="num" style={{ flex:1, marginLeft:10 }}>N° {x.no} · {hmDe(x.creado)}</b><span className={'pill ' + e.pill}>{e.l}</span></div>
        <div className="pc-o">{x.origen}</div>
        <div className="between"><span className="muted" style={{ fontSize:13.5 }}>{unidades(x.items)} productos · {tipoPedTxt(x)}</span><b className="num">{bsC(totalPedC(x))}</b></div>
      </li>
    );
    return (
      <tr key={x.no} className={marcado ? 'sel' : ''} onClick={() => setDet(x.no)} tabIndex={0} onKeyDown={ev => ev.key === 'Enter' && setDet(x.no)}>
        <td>{check}</td><td className="num"><b>{x.no}</b></td><td className="num">{hmDe(x.creado)}</td>
        <td className="td-o">{x.origen}</td><td>{tipoPedTxt(x)}</td>
        <td className="td-prod">{x.items.map(i => `${i.q}× ${P[i.id] ? P[i.id].nombre : ''}`).join(', ')}</td>
        <td><span className={'pill ' + e.pill}>{e.l}</span></td><td className="num td-r"><b>{bsC(totalPedC(x))}</b></td>
        <td onClick={ev => ev.stopPropagation()}><MenuAcciones etiqueta={`Acciones del pedido ${x.no}`} items={[{ l:'Ver detalle', icon:'pedidos', fn: () => setDet(x.no) }, accionDe(x) && { l: accionDe(x)[0], icon:'arrow', fn: accionDe(x)[1] }, !['entregado', 'anulado'].includes(x.estado) && { l:'Anular pedido', icon:'trash', danger:true, fn: () => setAnular({ no:x.no, motivo:MOTIVOS_ANULAR[0] }) }]} /></td>
      </tr>
    );
  };
  return (<>
    <div className="page-head">
      <div className="chips" role="group" aria-label="Filtrar por estado">
        {['todos', 'recibido', 'prep', 'listo', 'camino', 'entregado', 'anulado'].map(k => <button key={k} aria-pressed={est === k} onClick={() => setEst(k)}>{k === 'todos' ? 'Todos' : ESTADO_PED[k].l}<span className="num">{cuenta(k)}</span></button>)}
      </div>
      <div className="row head-actions"><BotonExcel onExport={() => exportar(lista, 'pedidos')} etiqueta="Exportar" /></div>
    </div>
    <section className="card">
      <div className="toolbar">
        <label className="search" style={{ margin:0, flex:'1 1 240px' }}><Icon n="search" s={20} /><input className="input" placeholder="Buscar por N°, mesa, cliente o producto…" value={q} onChange={e => setQ(e.target.value)} aria-label="Buscar pedidos" /></label>
        <select className="input" style={{ flex:'0 1 200px' }} value={tipo} onChange={e => setTipo(e.target.value)} aria-label="Filtrar por tipo">
          <option value="todos">Todos los tipos</option><option value="mesa">Mesa</option><option value="mostrador">Mostrador</option><option value="delivery">Delivery</option><option value="web">Tienda online</option><option value="qr">QR de mesa</option>
        </select>
      </div>
      {sel.length > 0 && <div className="bulk" role="region" aria-label="Acciones con la selección"><b className="num">{sel.length} seleccionados</b><button className="btn btn-sm btn-primary" disabled={!selListos.length} onClick={entregarSel} title={selListos.length ? '' : 'Solo se entregan pedidos listos de mesa o mostrador'}><Icon n="check" s={17} />Marcar entregados{selListos.length ? ` (${selListos.length})` : ''}</button><button className="btn btn-sm btn-ghost" onClick={() => exportar(pedidos.filter(x => sel.includes(x.no)), 'pedidos-seleccionados')}><Icon n="excel" s={17} />Exportar selección</button><button className="link-btn" onClick={() => setSel([])}>Quitar selección</button></div>}
      {!lista.length ? <div className="empty"><Icon n="pedidos" s={36} w={1.5} /><b>No hay pedidos con ese filtro.</b><button className="btn btn-ghost btn-sm" onClick={() => { setQ(''); setEst('todos'); setTipo('todos'); }}>Ver todos</button></div>
        : telefono ? <ul className="pcs">{pagina.map(fila)}</ul> : (
        <div className="dt-wrap">
          <table className="dt">
            <thead><tr>
              <th style={{ width:44 }}><input type="checkbox" className="chk" aria-label="Seleccionar esta página" checked={pagina.every(x => sel.includes(x.no))} onChange={e => setSel(s => e.target.checked ? [...new Set([...s, ...pagina.map(x => x.no)])] : s.filter(n => !pagina.some(x => x.no === n)))} /></th>
              <th aria-sort={ariaSort('no')}><button onClick={() => ordenar('no')}>N°<Icon n="orden" s={14} /></button></th>
              <th aria-sort={ariaSort('hora')}><button onClick={() => ordenar('hora')}>Hora<Icon n="orden" s={14} /></button></th>
              <th>Origen</th><th>Tipo</th><th>Productos</th><th>Estado</th>
              <th aria-sort={ariaSort('total')} className="td-r"><button onClick={() => ordenar('total')}>Total<Icon n="orden" s={14} /></button></th><th style={{ width:52 }}><span className="sr-only">Acciones</span></th>
            </tr></thead>
            <tbody>{pagina.map(fila)}</tbody>
          </table>
        </div>
      )}
      {lista.length > 0 && <div className="pag"><span className="muted num">Mostrando {(pag - 1) * POR_PAG + 1}–{Math.min(pag * POR_PAG, lista.length)} de {lista.length}</span><div className="row"><button className="btn btn-ghost btn-sm" disabled={pag <= 1} onClick={() => setPag(x => x - 1)}><Icon n="back" s={16} />Anterior</button><button className="btn btn-ghost btn-sm" disabled={pag >= paginas} onClick={() => setPag(x => x + 1)}>Siguiente<Icon n="arrow" s={16} /></button></div></div>}
    </section>
    {p && <Drawer eyebrow={`${tipoPedTxt(p)} · ${hmDe(p.creado)}`} titulo={`Pedido N° ${p.no}`} onClose={() => setDet(null)}
      pie={(() => { const a = accionDe(p); return (<>{!['entregado', 'anulado'].includes(p.estado) && <button className="btn btn-ghost" onClick={() => setAnular({ no:p.no, motivo:MOTIVOS_ANULAR[0] })}><Icon n="trash" s={18} />Anular</button>}{a && <button className="btn btn-primary" style={{ flex:1 }} onClick={a[1]}>{a[0]}<Icon n="arrow" s={18} /></button>}</>); })()}>
      <div className="row" style={{ flexWrap:'wrap' }}><span className={'pill ' + ESTADO_PED[p.estado].pill}>{ESTADO_PED[p.estado].l}</span><b>{p.origen}</b></div>
      {(p.cliente || p.dir) && <div className="dr-box">{p.cliente && <div><b>{p.cliente}</b>{p.tel && <> · <a href={`tel:${soloDigitos(p.tel)}`}>{p.tel}</a></>}</div>}{p.dir && <div className="muted">{p.dir}{p.zona ? ` · ${p.zona}` : ''}{p.ref ? ` · ${p.ref}` : ''}</div>}{p.pago && <div className="muted">Pago: {p.pago === 'qr' ? 'QR' : 'efectivo'}{p.pagado ? ' · pagado' : ' · pendiente'}{p.conCuanto ? ` · paga con Bs ${p.conCuanto}` : ''}</div>}</div>}
      <h3 className="dr-h">Línea de tiempo</h3>
      <ol className="tl">{(p.hist || [{ e:'recibido', t:p.creado }]).map((h, i) => <li key={i}><i style={{ background: h.e === 'anulado' ? 'var(--red)' : 'var(--green)' }} /><span><b>{ESTADO_PED[h.e] ? ESTADO_PED[h.e].l : h.e}</b>{h.q && <span className="muted"> · {h.q}</span>}</span><span className="muted num">{hmDe(h.t)}</span></li>)}</ol>
      <h3 className="dr-h">Productos</h3>
      <ul className="av-items">{p.items.map(it => <li key={it.key}><b className="num">{it.q}×</b><span style={{ minWidth:0 }}>{P[it.id] ? P[it.id].nombre : ''}{modsTxt(it) && <span className="muted"> · {modsTxt(it)}</span>}{it.nota && <span className="item-note" style={{ marginLeft:6 }}>{it.nota}</span>}</span><span className="num" style={{ marginLeft:'auto' }}>{bsC(lineUnitC(it) * it.q)}</span></li>)}</ul>
      {p.envioC > 0 && <div className="kv num"><span>Envío</span><b>{bsC(p.envioC)}</b></div>}
      <div className="kv num" style={{ fontSize:18 }}><b>Total</b><b>{bsC(totalPedC(p))}</b></div>
      {p.motivo && <div className="fiscal-warn"><Icon n="alert" s={18} /><span>Anulado: {p.motivo}</span></div>}
    </Drawer>}
    {anular && (
      <div className="scrim" onClick={() => setAnular(null)}>
        <div className="modal" style={{ maxWidth:460 }} role="alertdialog" aria-modal="true" aria-labelledby="an-t" onClick={e => e.stopPropagation()}>
          <h2 id="an-t">¿Anular el pedido N° {anular.no}?</h2>
          <p className="muted" style={{ margin:0 }}>Sale de cocina y no se cobra. Queda registrado con tu nombre y el motivo. Pide el PIN de un encargado.</p>
          <label className="field">Motivo<select className="input" value={anular.motivo} onChange={e => setAnular(a => ({ ...a, motivo:e.target.value }))}>{MOTIVOS_ANULAR.map(m => <option key={m}>{m}</option>)}</select></label>
          <div className="row" style={{ justifyContent:'flex-end' }}><button className="btn btn-ghost" onClick={() => setAnular(null)}>Cancelar</button><button className="btn btn-danger" onClick={() => pedirAuth('anular', `Anular el pedido N° ${anular.no}`, quien => { setPedidos(ps => ps.map(x => x.no === anular.no ? { ...x, estado:'anulado', motivo: anular.motivo } : x)); registrar(`Anuló el pedido N° ${anular.no} · ${anular.motivo}${quien ? ' · autorizado por ' + quien : ''}`); aviso(`Pedido N° ${anular.no} anulado`, 'trash'); setAnular(null); })}><Icon n="key" s={18} />Anular con PIN</button></div>
        </div>
      </div>
    )}
  </>);
}

/* ---------- Carta y tienda: categorías, menú del día, banners y tienda online ---------- */
function Carta({ cats, setCats, productos, setProductos, menuDia, setMenuDia, banners, setBanners, config, setConfig, aviso, registrar, ir }) {
  const [tab, setTab] = useState('cats');
  return (<>
    <div className="page-head">
      <Pestanas valor={tab} set={setTab} etiqueta="Secciones" ops={[['cats', 'Categorías', cats.length], ['mdia', 'Menú del día'], ['banners', 'Banners', banners.filter(b => b.activo).length], ['tienda', 'Tienda online']]} />
      <button className="btn btn-ghost" onClick={() => ir('tienda')}><Icon n="store" s={19} />Ver la tienda</button>
    </div>
    {tab === 'cats' && <Categorias {...{ cats, setCats, productos, setProductos, aviso, registrar }} />}
    {tab === 'mdia' && <MenuDia {...{ menuDia, setMenuDia, productos, aviso, registrar }} />}
    {tab === 'banners' && <Banners {...{ banners, setBanners, aviso }} />}
    {tab === 'tienda' && <TiendaConfig {...{ config, setConfig, aviso, registrar, ir }} />}
  </>);
}
function Categorias({ cats, setCats, productos, aviso, registrar }) {
  const [nueva, setNueva] = useState('');
  const [borrar, setBorrar] = useState(null);
  const orden = [...cats].sort((a, b) => a.orden - b.orden);
  const n = id => productos.filter(p => !p.eliminado && p.cat === id).length;
  const mover = (c, d) => { const i = orden.findIndex(x => x.id === c.id), j = i + d; if (j < 0 || j >= orden.length) return; const o = orden.map(x => x.id); [o[i], o[j]] = [o[j], o[i]]; setCats(cs => cs.map(x => ({ ...x, orden: o.indexOf(x.id) }))); };
  const renombrar = (c, v) => { const t = v.trim(); if (!t || t === c.nombre) return; setCats(cs => cs.map(x => x.id === c.id ? { ...x, nombre:t } : x)); registrar(`Cambió el nombre de la categoría ${c.nombre} a ${t}`); aviso(`Categoría renombrada a ${t}`); };
  const agregar = e => { e.preventDefault(); const t = nueva.trim(); if (!t) return; if (cats.some(c => sinTildes(c.nombre) === sinTildes(t))) { aviso('Ya existe una categoría con ese nombre', 'alert'); return; } setCats(cs => [...cs, { id:'c' + Date.now(), nombre:t, visible:true, orden:cs.length }]); setNueva(''); aviso(`Categoría ${t} creada`); };
  return (<section className="card">
    <div className="between" style={{ marginBottom:10, flexWrap:'wrap' }}><div><h2>Categorías de la carta</h2><span className="muted">El orden de aquí es el orden en caja, en la tienda y en el QR de mesa.</span></div></div>
    <ul className="cat-list">
      {orden.map((c, i) => (
        <li key={c.id} className={c.visible ? '' : 'oculta'}>
          <span className="cat-ord"><button className="icon-btn" disabled={i === 0} onClick={() => mover(c, -1)} aria-label={`Subir ${c.nombre}`}><Icon n="up" s={16} /></button><button className="icon-btn" disabled={i === orden.length - 1} onClick={() => mover(c, 1)} aria-label={`Bajar ${c.nombre}`}><Icon n="down" s={16} /></button></span>
          <input className="input cat-in" defaultValue={c.nombre} key={c.nombre} onBlur={e => renombrar(c, e.target.value)} onKeyDown={e => e.key === 'Enter' && e.target.blur()} aria-label={`Nombre de la categoría ${c.nombre}`} />
          <span className="muted num cat-n">{n(c.id)} productos</span>
          <button className="switch" role="switch" aria-checked={c.visible} aria-label={`${c.nombre} visible`} onClick={() => { setCats(cs => cs.map(x => x.id === c.id ? { ...x, visible: !x.visible } : x)); aviso(`${c.nombre} ${c.visible ? 'oculta en caja y tienda' : 'visible otra vez'}`); }} />
          <MenuAcciones etiqueta={`Acciones de ${c.nombre}`} items={[{ l:'Eliminar categoría', icon:'trash', danger:true, disabled: n(c.id) > 0, title: n(c.id) ? `Mueve primero sus ${n(c.id)} productos a otra categoría` : '', fn: () => setBorrar(c) }]} />
        </li>
      ))}
    </ul>
    <form className="row" style={{ marginTop:14, flexWrap:'wrap' }} onSubmit={agregar}><input className="input" style={{ flex:'1 1 220px' }} value={nueva} onChange={e => setNueva(e.target.value)} placeholder="Nueva categoría, ej. Sándwiches" aria-label="Nombre de la nueva categoría" /><button className="btn btn-primary" disabled={!nueva.trim()}><Icon n="plus" s={19} />Agregar</button></form>
    {borrar && <Confirmar titulo={`¿Eliminar ${borrar.nombre}?`} texto="La categoría no tiene productos. Puedes volver a crearla cuando quieras." onSi={() => { setCats(cs => cs.filter(x => x.id !== borrar.id)); aviso(`Categoría ${borrar.nombre} eliminada`, 'trash'); }} onClose={() => setBorrar(null)} />}
  </section>);
}
function MenuDia({ menuDia, setMenuDia, productos, aviso, registrar }) {
  const [f, setF] = useState({ ...menuDia, precio: String(menuDia.precio) });
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const precio = Number(String(f.precio).replace(',', '.')) || 0;
  const suelto = f.items.reduce((s, id) => s + (P[id] ? P[id].precio : 0), 0);
  const guardar = () => { if (!f.titulo.trim() || !(precio > 0)) { aviso('Escribe el nombre y un precio mayor a 0', 'alert'); return; } setMenuDia({ ...f, titulo:f.titulo.trim(), precio }); registrar(`Actualizó el menú del día: ${f.titulo.trim()} a ${bs(precio)}`); aviso('Menú del día guardado: ya aparece en caja, tienda y QR de mesa'); };
  const vivos = productos.filter(p => !p.eliminado && p.cat !== 'mdia');
  return (<div className="split-2">
    <section className="card stack" style={{ gap:14 }}>
      <div className="between"><h2>Menú del día</h2><button className="switch" role="switch" aria-checked={f.activo} aria-label="Menú del día activo" onClick={() => set('activo', !f.activo)} /></div>
      <div className="form-grid">
        <label className="field span-2">Nombre<input className="input" value={f.titulo} onChange={e => set('titulo', e.target.value)} placeholder="Ej. Desayuno de notas" /></label>
        <label className="field span-2">Qué incluye<input className="input" value={f.desc} onChange={e => set('desc', e.target.value)} placeholder="Ej. Café, croissant y jugo" /></label>
        <label className="field">Precio<div className="input-pre"><span>Bs</span><input className="input num" inputMode="decimal" value={f.precio} onChange={e => set('precio', e.target.value)} /></div>{suelto > 0 && precio > 0 && <span className="muted num" style={{ fontWeight:500 }}>Por separado cuesta {bs(suelto)} · ahorro {bs(Math.max(0, suelto - precio))}</span>}</label>
        <label className="field">Disponible hasta<input className="input num" type="time" value={f.hasta} onChange={e => set('hasta', e.target.value)} /></label>
      </div>
      <div className="field">Productos incluidos <span className="opt">para la receta y el inventario</span>
        <div className="chip-sel">{vivos.map(p => <button type="button" key={p.id} aria-pressed={f.items.includes(p.id)} onClick={() => set('items', f.items.includes(p.id) ? f.items.filter(x => x !== p.id) : [...f.items, p.id])}>{p.nombre}</button>)}</div>
      </div>
      <div className="row" style={{ justifyContent:'flex-end' }}><button className="btn btn-primary" onClick={guardar}><Icon n="check" s={19} />Guardar menú del día</button></div>
    </section>
    <section className="card stack" style={{ gap:10 }}>
      <div className="eyebrow">Así se ve en la tienda y en el QR</div>
      <div className="md-card" style={{ cursor:'default', opacity: f.activo ? 1 : .55 }}><span className="md-k">Menú del día · hasta las {f.hasta}</span><b>{f.titulo || 'Nombre del menú'}</b><span className="md-d">{f.desc}</span><span className="md-p num">{bs(precio)}</span></div>
      {!f.activo && <span className="muted">Está apagado: no aparece en ningún lado.</span>}
    </section>
  </div>);
}
function Banners({ banners, setBanners, aviso }) {
  const [edit, setEdit] = useState(null);
  const [borrar, setBorrar] = useState(null);
  const guardar = b => { setBanners(bs0 => bs0.some(x => x.id === b.id) ? bs0.map(x => x.id === b.id ? b : x) : [...bs0, b]); aviso('Banner guardado'); setEdit(null); };
  return (<section className="card">
    <div className="between" style={{ marginBottom:12, flexWrap:'wrap' }}><div><h2>Banners</h2><span className="muted">Avisos que rotan en la tienda online y en la pantalla del cliente.</span></div><button className="btn btn-primary" onClick={() => setEdit({ id:'b' + Date.now(), titulo:'', texto:'', tono:'verde', donde:'ambos', activo:true })}><Icon n="plus" s={19} />Nuevo banner</button></div>
    <div className="ban-list">
      {banners.map(b => { const [bg, fg] = TONOS[b.tono] || TONOS.verde; return (
        <div key={b.id} className={'ban-row' + (b.activo ? '' : ' oculta')}>
          <div className="banner banner-mini" style={{ background:bg, color:fg }}><div className="banner-in"><b>{b.titulo}</b><span>{b.texto}</span></div></div>
          <div className="row ban-acc"><span className="muted" style={{ fontSize:13 }}>{b.donde === 'ambos' ? 'Tienda y pantalla' : b.donde === 'tienda' ? 'Solo tienda' : 'Solo pantalla'}</span>
            <button className="switch" role="switch" aria-checked={b.activo} aria-label={`${b.titulo} activo`} onClick={() => setBanners(x => x.map(y => y.id === b.id ? { ...y, activo: !y.activo } : y))} />
            <button className="btn btn-ghost btn-sm" onClick={() => setEdit(b)}><Icon n="edit" s={17} />Editar</button>
            <MenuAcciones etiqueta={`Acciones de ${b.titulo}`} items={[{ l:'Eliminar banner', icon:'trash', danger:true, fn: () => setBorrar(b) }]} /></div>
        </div>
      ); })}
      {!banners.length && <div className="empty"><Icon n="imagen" s={36} w={1.5} /><b>Sin banners</b><span>Crea uno para anunciar un evento o una promoción.</span></div>}
    </div>
    {edit && <BannerForm inicial={edit} onSave={guardar} onClose={() => setEdit(null)} />}
    {borrar && <Confirmar titulo="¿Eliminar este banner?" texto={`“${borrar.titulo}” deja de mostrarse en la tienda y en la pantalla.`} onSi={() => { const prev = banners; setBanners(x => x.filter(y => y.id !== borrar.id)); aviso('Banner eliminado', 'trash', () => setBanners(prev)); }} onClose={() => setBorrar(null)} />}
  </section>);
}
function BannerForm({ inicial, onSave, onClose }) {
  const [f, setF] = useState({ ...inicial });
  const [err, setErr] = useState('');
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  useEscape(onClose);
  const [bg, fg] = TONOS[f.tono] || TONOS.verde;
  return (
    <div className="scrim" onClick={onClose}>
      <form className="modal" style={{ maxWidth:560 }} role="dialog" aria-modal="true" aria-labelledby="bf-t" onClick={e => e.stopPropagation()} onSubmit={e => { e.preventDefault(); if (!f.titulo.trim()) { setErr('Escribe el título.'); return; } onSave({ ...f, titulo:f.titulo.trim() }); }} noValidate>
        <div className="between"><h2 id="bf-t">{inicial.titulo ? 'Editar banner' : 'Nuevo banner'}</h2><button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icon n="x" s={20} /></button></div>
        <div className="banner" style={{ background:bg, color:fg }}><div className="banner-in"><b>{f.titulo || 'Título del banner'}</b><span>{f.texto || 'Texto corto'}</span></div></div>
        <label className="field">Título<input className="input" value={f.titulo} onChange={e => set('titulo', e.target.value)} maxLength={48} aria-invalid={!!err} />{err && <span className="err">{err}</span>}</label>
        <label className="field">Texto <span className="opt">opcional</span><input className="input" value={f.texto} onChange={e => set('texto', e.target.value)} maxLength={80} /></label>
        <div className="field">Color<div className="seg seg-3" role="group" aria-label="Color">{Object.keys(TONOS).map(k => <button type="button" key={k} aria-pressed={f.tono === k} onClick={() => set('tono', k)}><i className="dot" style={{ background: TONOS[k][0], width:14, height:14, border:'1px solid var(--line)' }} />{k[0].toUpperCase() + k.slice(1)}</button>)}</div></div>
        <div className="field">Dónde se muestra<div className="seg seg-3" role="group" aria-label="Dónde se muestra">{[['ambos', 'Los dos'], ['tienda', 'Tienda'], ['pantalla', 'Pantalla']].map(([k, l]) => <button type="button" key={k} aria-pressed={f.donde === k} onClick={() => set('donde', k)}>{l}</button>)}</div></div>
        <div className="row" style={{ justifyContent:'flex-end' }}><button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary"><Icon n="check" s={19} />Guardar</button></div>
      </form>
    </div>
  );
}
function TiendaConfig({ config, setConfig, aviso, registrar, ir }) {
  const [f, setF] = useState({ abierto: config.abierto !== false, horario:config.horario, whatsapp:config.whatsapp, instagram:config.instagram, tiempo:config.tiempo, minimo:String(config.minimo), demora:String(config.demora), zonas: config.zonas.map(z => ({ ...z, c:String(z.c) })) });
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const setZ = (i, k, v) => setF(x => ({ ...x, zonas: x.zonas.map((z, j) => j === i ? { ...z, [k]: v } : z) }));
  const guardar = () => {
    if (soloDigitos(f.whatsapp).length < 8) { aviso('Revisa el número de WhatsApp', 'alert'); return; }
    const zonas = f.zonas.filter(z => z.n.trim()).map(z => ({ n:z.n.trim(), c: Number(String(z.c).replace(',', '.')) || 0 }));
    if (!zonas.length) { aviso('Agrega al menos una zona de envío', 'alert'); return; }
    setConfig(c => ({ ...c, ...f, minimo: Number(f.minimo) || 0, demora: Math.max(5, Number(f.demora) || 15), zonas }));
    registrar('Actualizó los datos de la tienda online'); aviso('Tienda online actualizada');
  };
  return (<div className="split-2">
    <section className="card stack" style={{ gap:14 }}>
      <div className="between"><div><h2>Tienda online y QR de mesa</h2><span className="muted">Datos que ve el cliente al pedir.</span></div></div>
      <button className={'local-sw' + (f.abierto ? ' on' : '')} role="switch" aria-checked={f.abierto} onClick={() => set('abierto', !f.abierto)}><span className="switch" aria-hidden="true" /><span><b>{f.abierto ? 'Local abierto' : 'Local cerrado'}</b><small>{f.abierto ? 'Se reciben pedidos en línea y por QR' : 'Nadie puede pedir en línea'}</small></span></button>
      <div className="form-grid">
        <label className="field span-2">Horario de atención<input className="input" value={f.horario} onChange={e => set('horario', e.target.value)} /></label>
        <label className="field">WhatsApp del local<input className="input num" inputMode="tel" value={f.whatsapp} onChange={e => set('whatsapp', e.target.value)} /><span className="opt">Con código de país, ej. 59170000000</span></label>
        <label className="field">Instagram<input className="input" value={f.instagram} onChange={e => set('instagram', e.target.value)} /></label>
        <label className="field">Tiempo de entrega<input className="input" value={f.tiempo} onChange={e => set('tiempo', e.target.value)} /></label>
        <label className="field">Pedido mínimo para delivery<div className="input-pre"><span>Bs</span><input className="input num" inputMode="decimal" value={f.minimo} onChange={e => set('minimo', e.target.value)} /></div></label>
        <label className="field span-2">Avisar demora en barra después de<div className="input-pre"><span>min</span><input className="input num" inputMode="numeric" value={f.demora} onChange={e => set('demora', e.target.value)} /></div></label>
      </div>
      <div className="field">Zonas y costo de envío
        <div className="stack" style={{ gap:8 }}>{f.zonas.map((z, i) => (
          <div className="row" key={i}><input className="input" style={{ flex:'2 1 160px' }} value={z.n} onChange={e => setZ(i, 'n', e.target.value)} aria-label={`Zona ${i + 1}`} /><div className="input-pre" style={{ flex:'1 1 100px' }}><span>Bs</span><input className="input num" inputMode="decimal" value={z.c} onChange={e => setZ(i, 'c', e.target.value)} aria-label={`Costo de envío zona ${i + 1}`} /></div><button className="icon-btn" onClick={() => setF(x => ({ ...x, zonas: x.zonas.filter((_, j) => j !== i) }))} aria-label={`Quitar zona ${i + 1}`} disabled={f.zonas.length < 2}><Icon n="trash" s={17} /></button></div>
        ))}<button className="btn btn-ghost btn-sm" style={{ alignSelf:'flex-start' }} onClick={() => setF(x => ({ ...x, zonas:[...x.zonas, { n:'', c:'10' }] }))}><Icon n="plus" s={17} />Agregar zona</button></div>
      </div>
      <div className="row" style={{ justifyContent:'flex-end' }}><button className="btn btn-primary" onClick={guardar}><Icon n="check" s={19} />Guardar</button></div>
    </section>
    <section className="card stack" style={{ gap:12, alignItems:'flex-start' }}>
      <h2>QR de la tienda</h2>
      <QR size={150} valor={BASE_URL + '#tienda'} />
      <span className="muted">Imprímelo en la puerta, en los vasos para llevar o compártelo en Instagram. Lleva directo a la tienda online.</span>
      <button className="btn btn-ghost" onClick={() => ir('tienda')}><Icon n="store" s={19} />Abrir la tienda</button>
      <span className="muted num" style={{ fontSize:13, wordBreak:'break-all' }}>{BASE_URL}#tienda</span>
      <QRBancoEditor config={config} setConfig={setConfig} aviso={aviso} />
    </section>
  </div>);
}

/* ---------- QR de las mesas ---------- */
function QRMesas({ mesas, config, onClose }) {
  useEscape(onClose);
  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal modal-lg" role="dialog" aria-modal="true" aria-labelledby="qrm-t" onClick={e => e.stopPropagation()}>
        <div className="between"><div><div className="eyebrow">Para imprimir y pegar en cada mesa</div><h2 id="qrm-t">Códigos QR de las mesas</h2></div><button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icon n="x" s={20} /></button></div>
        <p className="muted" style={{ margin:0 }}>Cada mesa lleva dos códigos: uno para pedir desde el celular y otro para llamar al mesero o pedir la cuenta.</p>
        <div className="qrm-grid">
          {mesas.map(m => (
            <div className="qrm" key={m.n}>
              <div className="qrm-h"><Logo src={config.logo} nombre={config.nombre} cls="app-logo" /><b>Mesa {m.n}</b><span className="muted">{m.zona}</span></div>
              <div className="qrm-par">
                <a href={`#mesa/${m.n}`} onClick={onClose}><QR size={96} valor={`${BASE_URL}#mesa/${m.n}`} /><span>Pide aquí</span></a>
                <a href={`#llamar/${m.n}`} onClick={onClose}><QR size={96} valor={`${BASE_URL}#llamar/${m.n}`} /><span>Llama al mesero</span></a>
              </div>
            </div>
          ))}
        </div>
        <div className="row" style={{ justifyContent:'flex-end', flexWrap:'wrap' }}><span className="muted" style={{ fontSize:13, flex:'1 1 200px' }}>Cada código abre la carta o el botón de llamada de esa mesa en el celular del cliente.</span><button className="btn btn-primary" onClick={() => { try { window.print(); } catch (e) {} }}><Icon n="print" s={19} />Imprimir</button></div>
      </div>
    </div>
  );
}

/* ---------- Compras y proveedores ---------- */
function Compras({ compras, setCompras, proveedores, setProveedores, insumos, setInsumos, setMovs, setCaja, yo, aviso, registrar }) {
  const [tab, setTab] = useState('compras');
  const [nueva, setNueva] = useState(false);
  const [prov, setProv] = useState(null);
  const [borrar, setBorrar] = useState(null);
  const I = Object.fromEntries(insumos.map(i => [i.id, i]));
  const PV = Object.fromEntries(proveedores.map(p => [p.id, p]));
  const mes = compras.filter(c => c.fecha.slice(0, 7) === hoyISO().slice(0, 7));
  const porPagar = compras.filter(c => c.estado === 'por pagar');
  const orden = [...compras].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id));
  const guardarCompra = c => {
    setCompras(cs => [...cs, c]);
    setInsumos(is => is.map(i => { const l = c.items.find(x => x[0] === i.id); return l ? { ...i, s: r2(i.s + l[1]), costo: l[2] } : i; }));
    setMovs(ms => [...ms, ...c.items.map(([id, q, cu], k) => ({ id: Date.now() + k, h: hora(), tipo:'ingreso', item:id, q, costo: r2(q * cu), nota:`Compra ${c.id} · ${PV[c.prov] ? PV[c.prov].nombre : ''}`, user: yo.nombre }))]);
    if (c.estado === 'pagada' && c.met === 'efectivo' && c.deCaja) setCaja(k => ({ ...k, movs:[...k.movs, { id: Date.now(), tipo:'egreso', k:`Compra ${c.id} · ${PV[c.prov].nombre}`, h: hora(), v: compraTotalC(c), por: yo.nombre }] }));
    registrar(`Registró la compra ${c.id} a ${PV[c.prov].nombre} por ${bsC(compraTotalC(c))}`);
    aviso(`Compra ${c.id} registrada · el stock ya se actualizó`, 'camion');
    setNueva(false);
  };
  const pagar = c => { setCompras(cs => cs.map(x => x.id === c.id ? { ...x, estado:'pagada' } : x)); registrar(`Marcó como pagada la compra ${c.id}`); aviso(`Compra ${c.id} pagada`); };
  const exportar = () => guardarExcel(nombreArchivo(NEGOCIO, 'compras'), [
    { nombre:'Compras', titulo:`${NEGOCIO} · Compras`, sub:`Al ${fechaDMA(hoyISO())}`, columnas:['N°', 'Fecha', 'Proveedor', 'Detalle', 'Estado', 'Total'], filas: orden.map(c => [c.id, fechaDMA(c.fecha), PV[c.prov] ? PV[c.prov].nombre : '', c.items.map(([id, q]) => `${cant(q, I[id] ? I[id].u : '')} ${I[id] ? I[id].n : id}`).join(', '), c.estado === 'pagada' ? 'Pagada' : 'Por pagar', { bs: compraTotalC(c) }]), total:['Total', '', '', '', '', { bs: orden.reduce((s, c) => s + compraTotalC(c), 0) }] },
    { nombre:'Proveedores', titulo:'Proveedores', columnas:['Proveedor', 'Rubro', 'Contacto', 'Teléfono', 'Entrega'], filas: proveedores.map(p => [p.nombre, p.rubro, p.contacto, p.tel, p.dias]) },
  ], aviso);
  return (<>
    <div className="page-head">
      <Pestanas valor={tab} set={setTab} etiqueta="Secciones" ops={[['compras', 'Compras', compras.length], ['prov', 'Proveedores', proveedores.length]]} />
      <div className="row head-actions"><BotonExcel onExport={exportar} etiqueta="Exportar" />{tab === 'compras' ? <button className="btn btn-primary" onClick={() => setNueva(true)}><Icon n="plus" s={20} />Nueva compra</button> : <button className="btn btn-primary" onClick={() => setProv({ id:'pv' + Date.now(), nombre:'', rubro:'', contacto:'', tel:'', dias:'', nota:'' })}><Icon n="plus" s={20} />Nuevo proveedor</button>}</div>
    </div>
    {tab === 'compras' ? (<>
      <div className="kpis kpis-3">
        <div className="card kpi"><div className="eyebrow">Compras del mes</div><div className="kpi-val num">{bsC(mes.reduce((s, c) => s + compraTotalC(c), 0))}</div><span className="muted num">{mes.length} compras</span></div>
        <div className="card kpi"><div className="eyebrow">Por pagar</div><div className="kpi-val num">{bsC(porPagar.reduce((s, c) => s + compraTotalC(c), 0))}</div><span className="muted num">{porPagar.length} a proveedores</span></div>
        <div className="card kpi"><div className="eyebrow">Insumos por reponer</div><div className="kpi-val num">{insumos.filter(i => i.s <= i.min).length}</div><span className="muted">{insumos.filter(i => i.s <= i.min).slice(0, 2).map(i => i.n).join(', ') || 'Todo en orden'}</span></div>
      </div>
      <section className="card">
        <div className="dt-wrap"><table className="dt dt-cards">
          <thead><tr><th>N°</th><th>Fecha</th><th>Proveedor</th><th>Detalle</th><th>Estado</th><th className="td-r">Total</th><th style={{ width:52 }}><span className="sr-only">Acciones</span></th></tr></thead>
          <tbody>{orden.map(c => (
            <tr key={c.id}>
              <td data-l="N°" className="num"><b>{c.id}</b></td><td data-l="Fecha" className="num">{fechaDMA(c.fecha)}</td><td data-l="Proveedor">{PV[c.prov] ? PV[c.prov].nombre : '—'}</td>
              <td data-l="Detalle" className="td-prod">{c.items.map(([id, q]) => `${cant(q, I[id] ? I[id].u : '')} ${I[id] ? I[id].n.toLowerCase() : id}`).join(', ')}</td>
              <td data-l="Estado"><span className={'pill ' + (c.estado === 'pagada' ? 'pill-green' : 'pill-gold')}>{c.estado === 'pagada' ? 'Pagada' : 'Por pagar'}</span></td>
              <td data-l="Total" className="num td-r"><b>{bsC(compraTotalC(c))}</b></td>
              <td>{c.estado === 'por pagar' ? <MenuAcciones etiqueta={`Acciones de la compra ${c.id}`} items={[{ l:'Marcar como pagada', icon:'check', fn: () => pagar(c) }]} /> : null}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </section>
    </>) : (
      <div className="prov-grid">
        {proveedores.map(p => { const cs = compras.filter(c => c.prov === p.id); const ult = cs.map(c => c.fecha).sort().pop(); return (
          <section className="card prov" key={p.id}>
            <div className="between"><div style={{ minWidth:0 }}><h2>{p.nombre}</h2><span className="muted">{p.rubro}</span></div><MenuAcciones etiqueta={`Acciones de ${p.nombre}`} items={[{ l:'Editar', icon:'edit', fn: () => setProv(p) }, { l:'Eliminar proveedor', icon:'trash', danger:true, disabled: cs.length > 0, title: cs.length ? 'Tiene compras registradas' : '', fn: () => setBorrar(p) }]} /></div>
            <div className="kv"><span>Contacto</span><b>{p.contacto || '—'}</b></div>
            <div className="kv"><span>Entrega</span><b>{p.dias || '—'}</b></div>
            <div className="kv num"><span>Comprado</span><b>{bsC(cs.reduce((s, c) => s + compraTotalC(c), 0))}{ult ? ` · última ${fechaDMA(ult)}` : ''}</b></div>
            {p.nota && <span className="muted" style={{ fontSize:13.5 }}>{p.nota}</span>}
            <div className="row" style={{ marginTop:'auto' }}>
              {p.tel && <a className="btn btn-ghost btn-sm" style={{ flex:1 }} href={`tel:${soloDigitos(p.tel)}`}><Icon n="phone" s={17} />Llamar</a>}
              {p.tel && <a className="btn btn-ghost btn-sm" style={{ flex:1 }} href={waLink(p.tel, `Hola ${p.contacto || ''}, le escribo de ${NEGOCIO} para hacer un pedido.`)} target="_blank" rel="noopener noreferrer"><Icon n="chat" s={17} />WhatsApp</a>}
            </div>
          </section>
        ); })}
      </div>
    )}
    {nueva && <CompraForm proveedores={proveedores} insumos={insumos} numero={`C-${String(41 + compras.length).padStart(4, '0')}`} onSave={guardarCompra} onClose={() => setNueva(false)} />}
    {prov && <ProveedorForm inicial={prov} onSave={p => { setProveedores(ps => ps.some(x => x.id === p.id) ? ps.map(x => x.id === p.id ? p : x) : [...ps, p]); aviso(`Proveedor ${p.nombre} guardado`); setProv(null); }} onClose={() => setProv(null)} />}
    {borrar && <Confirmar titulo={`¿Eliminar a ${borrar.nombre}?`} texto="Se quita de la lista de proveedores." onSi={() => { setProveedores(ps => ps.filter(x => x.id !== borrar.id)); aviso('Proveedor eliminado', 'trash'); }} onClose={() => setBorrar(null)} />}
  </>);
}
function CompraForm({ proveedores, insumos, numero, onSave, onClose }) {
  const bajos = insumos.filter(i => i.s <= i.min);
  const [prov, setProv] = useState(proveedores[0] ? proveedores[0].id : '');
  const [filas, setFilas] = useState(bajos.length ? bajos.slice(0, 2).map(i => ({ id:i.id, q:'', cu:String(i.costo) })) : [{ id: insumos[0].id, q:'', cu:String(insumos[0].costo) }]);
  const [estado, setEstado] = useState('pagada');
  const [met, setMet] = useState('efectivo');
  const [deCaja, setDeCaja] = useState(true);
  const [err, setErr] = useState('');
  useEscape(onClose);
  const I = Object.fromEntries(insumos.map(i => [i.id, i]));
  const num = v => Number(String(v).replace(',', '.')) || 0;
  const totC = filas.reduce((s, f) => s + aC(num(f.q) * num(f.cu)), 0);
  const setF = (i, k, v) => setFilas(fs => fs.map((f, j) => j !== i ? f : k === 'id' ? { ...f, id:v, cu:String(I[v].costo) } : { ...f, [k]: v }));
  const guardar = e => { e.preventDefault(); const ok = filas.filter(f => num(f.q) > 0 && num(f.cu) > 0); if (!prov) { setErr('Elige el proveedor.'); return; } if (!ok.length) { setErr('Escribe la cantidad y el costo de al menos un insumo.'); return; } onSave({ id:numero, fecha:hoyISO(), prov, items: ok.map(f => [f.id, num(f.q), num(f.cu)]), estado, met, deCaja: estado === 'pagada' && met === 'efectivo' && deCaja }); };
  return (
    <div className="scrim" onClick={onClose}>
      <form className="modal modal-lg" role="dialog" aria-modal="true" aria-labelledby="co-t" onClick={e => e.stopPropagation()} onSubmit={guardar} noValidate>
        <div className="between"><div><div className="eyebrow">Compra {numero} · {fechaDMA(hoyISO())}</div><h2 id="co-t" style={{ fontSize:24 }}>Nueva compra</h2></div><button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icon n="x" s={20} /></button></div>
        <label className="field">Proveedor<select className="input" value={prov} onChange={e => setProv(e.target.value)}>{proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre} · {p.rubro}</option>)}</select></label>
        <div className="field">Qué compraste {bajos.length > 0 && <span className="opt">sugerimos lo que tiene stock bajo</span>}
          <div className="stack" style={{ gap:8 }}>
            {filas.map((f, i) => (
              <div className="compra-fila" key={i}>
                <select className="input" value={f.id} onChange={e => setF(i, 'id', e.target.value)} aria-label={`Insumo ${i + 1}`}>{insumos.map(x => <option key={x.id} value={x.id}>{x.n}</option>)}</select>
                <div className="input-pre"><span>{I[f.id].u}</span><input className="input num" inputMode="decimal" placeholder="Cant." value={f.q} onChange={e => setF(i, 'q', e.target.value)} aria-label={`Cantidad en ${I[f.id].u}`} /></div>
                <div className="input-pre"><span>Bs/{I[f.id].u}</span><input className="input num" inputMode="decimal" value={f.cu} onChange={e => setF(i, 'cu', e.target.value)} aria-label={`Costo por ${I[f.id].u}`} /></div>
                <b className="num compra-sub">{bsC(aC(num(f.q) * num(f.cu)))}</b>
                <button type="button" className="icon-btn" disabled={filas.length < 2} onClick={() => setFilas(fs => fs.filter((_, j) => j !== i))} aria-label={`Quitar insumo ${i + 1}`}><Icon n="trash" s={17} /></button>
              </div>
            ))}
            <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf:'flex-start' }} onClick={() => setFilas(fs => [...fs, { id: insumos[0].id, q:'', cu:String(insumos[0].costo) }])}><Icon n="plus" s={17} />Agregar insumo</button>
          </div>
        </div>
        <div className="row" style={{ flexWrap:'wrap', gap:14 }}>
          <div className="field" style={{ flex:'1 1 200px' }}>Estado<div className="seg seg-2" role="group" aria-label="Estado del pago"><button type="button" aria-pressed={estado === 'pagada'} onClick={() => setEstado('pagada')}>Pagada</button><button type="button" aria-pressed={estado === 'por pagar'} onClick={() => setEstado('por pagar')}>Por pagar</button></div></div>
          {estado === 'pagada' && <div className="field" style={{ flex:'1 1 200px' }}>Cómo se pagó<select className="input" value={met} onChange={e => setMet(e.target.value)}><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="qr">QR</option></select></div>}
        </div>
        {estado === 'pagada' && met === 'efectivo' && <label className={'check-row' + (deCaja ? ' on' : '')}><input type="checkbox" checked={deCaja} onChange={e => setDeCaja(e.target.checked)} /><span className="check-box" aria-hidden="true">{deCaja && <Icon n="check" s={16} w={3} />}</span><span>Salió de la caja del turno <span className="muted">· se registra como egreso en el cierre</span></span></label>}
        {err && <span className="err">{err}</span>}
        <button className="btn btn-primary btn-cobrar" type="submit"><span>Registrar compra y sumar al stock</span><span className="num">{bsC(totC)}</span></button>
      </form>
    </div>
  );
}
function ProveedorForm({ inicial, onSave, onClose }) {
  const [f, setF] = useState({ ...inicial });
  const [err, setErr] = useState({});
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  useEscape(onClose);
  const enviar = e => { e.preventDefault(); const er = {}; if (!f.nombre.trim()) er.nombre = 'Escribe el nombre.'; if (f.tel && soloDigitos(f.tel).length < 8) er.tel = 'Revisa el teléfono.'; setErr(er); if (Object.keys(er).length) return; onSave({ ...f, nombre:f.nombre.trim() }); };
  return (
    <div className="scrim" onClick={onClose}>
      <form className="modal" style={{ maxWidth:560 }} role="dialog" aria-modal="true" aria-labelledby="pv-t" onClick={e => e.stopPropagation()} onSubmit={enviar} noValidate>
        <div className="between"><h2 id="pv-t">{inicial.nombre ? 'Editar proveedor' : 'Nuevo proveedor'}</h2><button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icon n="x" s={20} /></button></div>
        <div className="form-grid">
          <label className="field span-2">Nombre<input className="input" value={f.nombre} onChange={e => set('nombre', e.target.value)} aria-invalid={!!err.nombre} />{err.nombre && <span className="err">{err.nombre}</span>}</label>
          <label className="field">Qué vende<input className="input" value={f.rubro} onChange={e => set('rubro', e.target.value)} placeholder="Ej. Leche y lácteos" /></label>
          <label className="field">Contacto<input className="input" value={f.contacto} onChange={e => set('contacto', e.target.value)} /></label>
          <label className="field">Teléfono o WhatsApp<input className="input num" inputMode="tel" value={f.tel} onChange={e => set('tel', e.target.value)} aria-invalid={!!err.tel} />{err.tel && <span className="err">{err.tel}</span>}</label>
          <label className="field">Días de entrega<input className="input" value={f.dias} onChange={e => set('dias', e.target.value)} placeholder="Ej. Lunes y jueves" /></label>
          <label className="field span-2">Nota <span className="opt">opcional</span><input className="input" value={f.nota} onChange={e => set('nota', e.target.value)} /></label>
        </div>
        <div className="row" style={{ justifyContent:'flex-end' }}><button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary"><Icon n="check" s={19} />Guardar</button></div>
      </form>
    </div>
  );
}

/* ---------- Finanzas: gastos, cobros QR y facturación ---------- */
function Finanzas({ gastos, setGastos, cobrosQR, confirmarQR, ventas, caja, setCaja, compras, config, yo, aviso, registrar, pedirAuth, setVentas }) {
  const [tab, setTab] = useState('gastos');
  const [nuevo, setNuevo] = useState(false);
  const [filtroQR, setFiltroQR] = useState('todos');
  const [borrar, setBorrar] = useState(null);
  const mesG = gastos.filter(g => g.fecha.slice(0, 7) === hoyISO().slice(0, 7));
  const totG = mesG.reduce((s, g) => s + g.montoC, 0);
  const porCat = CATS_GASTO.map((c, i) => [c, mesG.filter(g => g.cat === c).reduce((s, g) => s + g.montoC, 0), `var(--series-${(i % 4) + 1})`]).filter(x => x[1] > 0);
  const ventasMesC = aC(VENTAS_30.reduce((s, d) => s + d[1], 0));
  const comprasMesC = compras.filter(c => c.fecha.slice(0, 7) === hoyISO().slice(0, 7)).reduce((s, c) => s + compraTotalC(c), 0);
  const qrConf = cobrosQR.filter(c => c.estado === 'confirmado');
  const qrLista = cobrosQR.filter(c => filtroQR === 'todos' || c.estado === filtroQR).slice().reverse();
  const qrSum = qrConf.reduce((s, c) => s + c.montoC, 0);
  const guardarGasto = g => {
    setGastos(gs => [...gs, g]);
    if (g.met === 'efectivo' && g.deCaja) setCaja(k => ({ ...k, movs:[...k.movs, { id: Date.now(), tipo:'egreso', k: g.desc, h: hora(), v: g.montoC, por: yo.nombre }] }));
    registrar(`Registró un gasto de ${bsC(g.montoC)} · ${g.desc}`); aviso(`Gasto de ${bsC(g.montoC)} registrado`); setNuevo(false);
  };
  const exportar = () => guardarExcel(nombreArchivo(NEGOCIO, 'finanzas'), [
    { nombre:'Gastos', titulo:`${NEGOCIO} · Gastos del mes`, sub:fechaDMA(hoyISO()), columnas:['Fecha', 'Categoría', 'Descripción', 'Pago', 'Monto'], filas: mesG.map(g => [fechaDMA(g.fecha), g.cat, g.desc, g.met, { bs: g.montoC }]), total:['Total', '', '', '', { bs: totG }] },
    { nombre:'Cobros QR', titulo:'Cobros con QR de hoy', columnas:['Hora', 'Referencia', 'Origen', 'Estado', 'Monto'], filas: cobrosQR.map(c => [c.h, c.ref, c.origen, c.estado === 'confirmado' ? 'Confirmado' : 'Por confirmar', { bs: c.montoC }]), total:['Total confirmado', '', '', '', { bs: qrSum }] },
    { nombre: FISCAL.simplificado ? 'Notas de venta' : 'Facturas', titulo: FISCAL.simplificado ? 'Notas de venta' : 'Facturas emitidas', columnas:['N°', 'Hora', 'Venta', 'NIT/CI', 'Razón social', 'Pago', 'Estado', 'Total', 'IVA'], filas: ventas.slice().reverse().map(v => [{ int:v.nf }, v.h, v.titulo, v.nit || '0', v.rs || 'Sin nombre', v.met, v.estado === 'valida' ? 'Válida' : v.estado === 'anulada' ? 'Anulada' : 'Pendiente de envío', { bs: v.totalC }, FISCAL.simplificado ? '' : { bs: ivaC(v.totalC) }]) },
  ], aviso);
  return (<>
    <div className="page-head">
      <Pestanas valor={tab} set={setTab} etiqueta="Secciones" ops={[['gastos', 'Gastos'], ['qr', 'Cobros QR', cobrosQR.filter(c => c.estado === 'pendiente').length || null], ['fact', FISCAL.simplificado ? 'Notas de venta' : 'Facturación']]} />
      <div className="row head-actions"><BotonExcel onExport={exportar} etiqueta="Exportar" />{tab === 'gastos' && <button className="btn btn-primary" onClick={() => setNuevo(true)}><Icon n="plus" s={20} />Nuevo gasto</button>}</div>
    </div>
    {tab === 'gastos' && (<>
      <div className="kpis kpis-3">
        <div className="card kpi"><div className="eyebrow">Gastos del mes</div><div className="kpi-val num">{bsC(totG)}</div><span className="muted num">{mesG.length} registros</span></div>
        <div className="card kpi"><div className="eyebrow">Compras a proveedores</div><div className="kpi-val num">{bsC(comprasMesC)}</div><span className="muted">Desde el módulo de compras</span></div>
        <div className="card kpi"><div className="eyebrow">Resultado estimado del mes</div><div className="kpi-val num" style={{ color: ventasMesC - totG - comprasMesC >= 0 ? 'var(--green-text)' : 'var(--red-text)' }}>{bsC(ventasMesC - totG - comprasMesC)}</div><span className="muted num">Ventas {bsC(ventasMesC)} − gastos − compras</span></div>
      </div>
      <section className="card" style={{ marginBottom:18 }}>
        <h2 style={{ marginBottom:12 }}>En qué se va el dinero</h2>
        <div className="stacked">{porCat.map(([k, v, c]) => <span key={k} style={{ width: (v / totG * 100) + '%', background:c }} title={`${k} ${bsC(v)}`} />)}</div>
        <div className="legend-grid">{porCat.map(([k, v, c]) => <div className="kv num" key={k}><span className="row"><i className="dot" style={{ background:c, width:12, height:12 }} /><b>{k}</b></span><span>{bsC(v)} <span className="muted">· {Math.round(v / totG * 100)} %</span></span></div>)}</div>
      </section>
      <section className="card"><div className="dt-wrap"><table className="dt dt-cards">
        <thead><tr><th>Fecha</th><th>Categoría</th><th>Descripción</th><th>Pago</th><th className="td-r">Monto</th><th style={{ width:52 }}><span className="sr-only">Acciones</span></th></tr></thead>
        <tbody>{[...gastos].sort((a, b) => b.fecha.localeCompare(a.fecha)).map(g => <tr key={g.id}><td data-l="Fecha" className="num">{fechaDMA(g.fecha)}</td><td data-l="Categoría">{g.cat}</td><td data-l="Descripción">{g.desc}</td><td data-l="Pago">{g.met[0].toUpperCase() + g.met.slice(1)}</td><td data-l="Monto" className="num td-r"><b>{bsC(g.montoC)}</b></td><td><MenuAcciones etiqueta={`Acciones del gasto ${g.desc}`} items={[{ l:'Eliminar gasto', icon:'trash', danger:true, fn: () => setBorrar(g) }]} /></td></tr>)}</tbody>
      </table></div></section>
    </>)}
    {tab === 'qr' && (<>
      <div className="kpis kpis-3">
        <div className="card kpi"><div className="eyebrow">Confirmados hoy</div><div className="kpi-val num">{bsC(qrSum)}</div><span className="muted num">{qrConf.length} cobros</span></div>
        <div className="card kpi"><div className="eyebrow">En la caja (QR)</div><div className="kpi-val num">{bsC(caja.ventas.qr + caja.propinas.qr)}</div>{qrSum === caja.ventas.qr + caja.propinas.qr ? <span className="pill pill-green"><Icon n="check" s={14} />Cuadra con la caja</span> : <span className="pill pill-gold num">Diferencia {bsC(Math.abs(qrSum - caja.ventas.qr - caja.propinas.qr))}</span>}</div>
        <div className="card kpi"><div className="eyebrow">Por confirmar</div><div className="kpi-val num">{bsC(cobrosQR.filter(c => c.estado === 'pendiente').reduce((s, c) => s + c.montoC, 0))}</div><span className="muted">Revisa la app del banco antes de confirmar</span></div>
      </div>
      <section className="card">
        <div className="chips" role="group" aria-label="Filtrar cobros QR" style={{ marginBottom:12 }}>{[['todos', 'Todos'], ['pendiente', 'Por confirmar'], ['confirmado', 'Confirmados']].map(([k, l]) => <button key={k} aria-pressed={filtroQR === k} onClick={() => setFiltroQR(k)}>{l}<span className="num">{cobrosQR.filter(c => k === 'todos' || c.estado === k).length}</span></button>)}</div>
        <div className="dt-wrap"><table className="dt dt-cards">
          <thead><tr><th>Hora</th><th>Referencia</th><th>Origen</th><th>Estado</th><th className="td-r">Monto</th><th><span className="sr-only">Acción</span></th></tr></thead>
          <tbody>{qrLista.map(c => <tr key={c.id}><td data-l="Hora" className="num">{c.h}</td><td data-l="Referencia" className="num">{c.ref}</td><td data-l="Origen">{c.origen}</td><td data-l="Estado"><span className={'pill ' + (c.estado === 'confirmado' ? 'pill-green' : 'pill-gold')}>{c.estado === 'confirmado' ? 'Confirmado' : 'Por confirmar'}</span></td><td data-l="Monto" className="num td-r"><b>{bsC(c.montoC)}</b></td><td>{c.estado === 'pendiente' && <button className="btn btn-primary btn-sm" onClick={() => confirmarQR(c)}><Icon n="check" s={17} />Confirmar</button>}</td></tr>)}</tbody>
        </table></div>
        {!qrLista.length && <div className="empty"><b>Sin cobros en este filtro.</b></div>}
      </section>
    </>)}
    {tab === 'fact' && (<>
      {FISCAL.simplificado ? <div className="fiscal-note" style={{ marginBottom:14 }}><Icon n="note" s={18} /><span>Estás en el Régimen Tributario Simplificado (RTS): no se emiten facturas, se entregan notas de venta. La cuota es fija y bimestral{FISCAL.cat ? ` (categoría ${FISCAL.cat.cat}: ${bs(FISCAL.cat.cuota)})` : ''}.</span></div> : (
        <div className="kpis kpis-3">
          <div className="card kpi"><div className="eyebrow">Facturas de hoy</div><div className="kpi-val num">{caja.tickets}</div><span className="muted">Una por cada cobro</span></div>
          <div className="card kpi"><div className="eyebrow">IVA de las ventas de hoy</div><div className="kpi-val num">{bsC(ivaC(caja.ventas.efectivo + caja.ventas.qr + caja.ventas.tarjeta))}</div><span className="muted">13 % incluido en los precios</span></div>
          <div className="card kpi"><div className="eyebrow">Pendientes de envío</div><div className="kpi-val num">{ventas.filter(v => v.estado === 'pendiente').length}</div><span className="muted">Se envían solas al volver internet</span></div>
        </div>
      )}
      <section className="card">
        <div className="between" style={{ marginBottom:10, flexWrap:'wrap' }}><h2>{FISCAL.simplificado ? 'Últimas notas de venta' : 'Últimas facturas'}</h2>{!FISCAL.simplificado && <span className="muted" style={{ fontSize:13 }}>Registro interno de GastroMetrik. La facturación electrónica con Impuestos Nacionales (SIAT) no está conectada: emite la factura oficial en tu sistema del SIN.</span>}</div>
        <div className="dt-wrap"><table className="dt dt-cards">
          <thead><tr><th>N°</th><th>Hora</th><th>Venta</th><th>NIT / CI</th><th>Razón social</th><th>Estado</th><th className="td-r">Total</th>{!FISCAL.simplificado && <th className="td-r">IVA</th>}<th><span className="sr-only">Acciones</span></th></tr></thead>
          <tbody>{ventas.slice().reverse().map(v => <tr key={v.id} className={v.estado === 'anulada' ? 'anulada' : ''}><td data-l="N°" className="num"><b>{v.nf}</b></td><td data-l="Hora" className="num">{v.h}</td><td data-l="Venta">{v.titulo}</td><td data-l="NIT / CI" className="num">{v.nit || '0'}</td><td data-l="Razón social">{v.rs || 'Sin nombre'}</td><td data-l="Estado"><span className={'pill ' + (v.estado === 'valida' ? 'pill-green' : v.estado === 'anulada' ? 'pill-gray' : 'pill-gold')}>{v.estado === 'valida' ? 'Válida' : v.estado === 'anulada' ? 'Anulada' : 'Pendiente de envío'}</span></td><td data-l="Total" className="num td-r"><b>{bsC(v.totalC)}</b></td>{!FISCAL.simplificado && <td data-l="IVA" className="num td-r">{bsC(ivaC(v.totalC))}</td>}<td>{v.estado !== 'anulada' && <MenuAcciones etiqueta={`Acciones de la ${FISCAL.simplificado ? 'nota' : 'factura'} ${v.nf}`} items={[{ l: FISCAL.simplificado ? 'Anular nota de venta' : 'Anular factura', icon:'trash', danger:true, fn: () => pedirAuth('anular', `Anular ${FISCAL.simplificado ? 'la nota' : 'la factura'} N° ${v.nf}`, quien => { setVentas(vs => vs.map(x => x.id === v.id ? { ...x, estado:'anulada' } : x)); registrar(`Anuló ${FISCAL.simplificado ? 'la nota de venta' : 'la factura'} N° ${v.nf}${quien ? ' · autorizado por ' + quien : ''}`); aviso(`${FISCAL.simplificado ? 'Nota' : 'Factura'} N° ${v.nf} anulada`, 'trash'); }) }]} />}</td></tr>)}</tbody>
        </table></div>
      </section>
    </>)}
    {nuevo && <GastoForm onSave={guardarGasto} onClose={() => setNuevo(false)} />}
    {borrar && <Confirmar titulo="¿Eliminar este gasto?" texto={`${borrar.desc} · ${bsC(borrar.montoC)}`} onSi={() => { const prev = gastos; setGastos(gs => gs.filter(x => x.id !== borrar.id)); aviso('Gasto eliminado', 'trash', () => setGastos(prev)); }} onClose={() => setBorrar(null)} />}
  </>);
}
function GastoForm({ onSave, onClose }) {
  const [f, setF] = useState({ fecha:hoyISO(), cat:CATS_GASTO[1], desc:'', monto:'', met:'efectivo', deCaja:true });
  const [err, setErr] = useState({});
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  useEscape(onClose);
  const enviar = e => { e.preventDefault(); const er = {}; if (!f.desc.trim()) er.desc = 'Escribe en qué se gastó.'; const m = leerMontoC(f.monto); if (!(m > 0)) er.monto = 'Escribe un monto mayor a 0.'; setErr(er); if (Object.keys(er).length) return; onSave({ id:'g' + Date.now(), fecha:f.fecha, cat:f.cat, desc:f.desc.trim(), montoC:m, met:f.met, deCaja: f.met === 'efectivo' && f.deCaja }); };
  return (
    <div className="scrim" onClick={onClose}>
      <form className="modal" style={{ maxWidth:560 }} role="dialog" aria-modal="true" aria-labelledby="ga-t" onClick={e => e.stopPropagation()} onSubmit={enviar} noValidate>
        <div className="between"><h2 id="ga-t">Nuevo gasto</h2><button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icon n="x" s={20} /></button></div>
        <div className="form-grid">
          <label className="field span-2">En qué se gastó<input className="input" value={f.desc} onChange={e => set('desc', e.target.value)} placeholder="Ej. Luz del mes" aria-invalid={!!err.desc} />{err.desc && <span className="err">{err.desc}</span>}</label>
          <label className="field">Categoría<select className="input" value={f.cat} onChange={e => set('cat', e.target.value)}>{CATS_GASTO.map(c => <option key={c}>{c}</option>)}</select></label>
          <label className="field">Monto<div className="input-pre"><span>Bs</span><input className="input num" inputMode="decimal" value={f.monto} onChange={e => set('monto', e.target.value)} aria-invalid={!!err.monto} /></div>{err.monto && <span className="err">{err.monto}</span>}</label>
          <label className="field">Fecha<input className="input num" type="date" value={f.fecha} onChange={e => set('fecha', e.target.value)} /></label>
          <label className="field">Cómo se pagó<select className="input" value={f.met} onChange={e => set('met', e.target.value)}><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="qr">QR</option><option value="tarjeta">Tarjeta</option></select></label>
        </div>
        {f.met === 'efectivo' && <label className={'check-row' + (f.deCaja ? ' on' : '')}><input type="checkbox" checked={f.deCaja} onChange={e => set('deCaja', e.target.checked)} /><span className="check-box" aria-hidden="true">{f.deCaja && <Icon n="check" s={16} w={3} />}</span><span>Salió de la caja del turno <span className="muted">· se descuenta en el cierre</span></span></label>}
        <div className="row" style={{ justifyContent:'flex-end' }}><button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary"><Icon n="check" s={19} />Guardar gasto</button></div>
      </form>
    </div>
  );
}

/* ---------- Búsqueda global (Ctrl + K) ---------- */
function Paleta({ visibles, productos, mesas, pedidos, puedeVender, onIr, onProducto, onPedido, onClose }) {
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  useEscape(onClose);
  const qd = sinTildes(q.trim());
  const mods = MODULOS.flatMap(g => g.items).filter(m => !visibles.some(v => v.id === m.id));
  const res = [
    ...visibles.map(v => ({ g:'Pantallas', l:v.full, icon:v.icon, fn: () => onIr(v.id) })),
    ...mods.map(m => ({ g:'Módulos', l:m.t, icon:m.icon, fn: () => onIr(m.id) })),
    { g:'Módulos', l:'Portada · todos los módulos', icon:'portada', fn: () => onIr('portada') },
    ...(puedeVender ? productos.filter(p => !p.eliminado && p.disponible).map(p => ({ g:'Agregar al pedido', l:p.nombre, d:bs(p.precio), icon:'plus', fn: () => onProducto(p.id) })) : []),
    ...mesas.map(m => ({ g:'Mesas', l:`Mesa ${m.n}`, d:ESTADO_MESA[m.estado].label, icon:'mesas', fn: () => onIr('mesas') })),
    ...pedidos.slice().reverse().map(p => ({ g:'Pedidos', l:`Pedido N° ${p.no}`, d:`${p.origen} · ${ESTADO_PED[p.estado].l}`, icon:'pedidos', fn: () => onPedido(p.no) })),
  ].filter(r => !qd || sinTildes(r.l + ' ' + (r.d || '')).includes(qd)).slice(0, qd ? 30 : 12);
  useEffect(() => setI(0), [qd]);
  const elegir = r => { onClose(); setTimeout(r.fn, 0); };
  const tecla = e => { if (e.key === 'ArrowDown') { e.preventDefault(); setI(x => Math.min(res.length - 1, x + 1)); } else if (e.key === 'ArrowUp') { e.preventDefault(); setI(x => Math.max(0, x - 1)); } else if (e.key === 'Enter' && res[i]) { e.preventDefault(); elegir(res[i]); } };
  useEffect(() => { const el = document.getElementById('pal-' + i); el && el.scrollIntoView({ block:'nearest' }); }, [i]);
  return (
    <div className="scrim paleta-scrim" onClick={onClose}>
      <div className="modal paleta" role="dialog" aria-modal="true" aria-label="Buscar en todo el sistema" onClick={e => e.stopPropagation()}>
        <label className="search paleta-in"><Icon n="search" s={22} /><input className="input" autoFocus value={q} onChange={e => setQ(e.target.value)} onKeyDown={tecla} placeholder="Busca una pantalla, un producto, una mesa o un pedido…" role="combobox" aria-expanded="true" aria-controls="pal-lista" aria-activedescendant={res[i] ? 'pal-' + i : undefined} /><kbd>Esc</kbd></label>
        <ul className="paleta-lista" id="pal-lista" role="listbox">
          {res.map((r, k) => (<React.Fragment key={k}>
            {(k === 0 || res[k - 1].g !== r.g) && <li className="paleta-g" role="presentation">{r.g}</li>}
            <li id={'pal-' + k} role="option" aria-selected={k === i} className={k === i ? 'on' : ''} onMouseEnter={() => setI(k)} onClick={() => elegir(r)}><Icon n={r.icon} s={19} /><span>{r.l}</span>{r.d && <small className="num">{r.d}</small>}</li>
          </React.Fragment>))}
          {!res.length && <li className="paleta-vacio">Sin resultados para “{q}”.</li>}
        </ul>
        <div className="paleta-pie muted"><span><kbd>↑</kbd><kbd>↓</kbd> moverse</span><span><kbd>Enter</kbd> abrir</span><span><kbd>Ctrl</kbd>+<kbd>K</kbd> desde cualquier pantalla</span></div>
      </div>
    </div>
  );
}

/* ---------- Campana de avisos ---------- */
function Campana({ incidencias, ir, atenderLlamada, llamadas }) {
  const [abierto, setAbierto] = useState(false);
  useCerrarConEsc(abierto, () => setAbierto(false));
  const n = incidencias.length;
  return (
    <div className="user-menu">
      <button className="icon-btn kbd-btn campana" onClick={() => setAbierto(a => !a)} aria-expanded={abierto} aria-haspopup="menu" aria-label={`Avisos${n ? `, ${n} sin revisar` : ''}`} title="Avisos"><Icon n="bell" s={20} />{n > 0 && <i className="num">{n}</i>}</button>
      {abierto && (<>
        <div className="menu-scrim" onClick={() => setAbierto(false)} />
        <div className="menu campana-menu" role="menu">
          <div className="menu-head"><b>Avisos</b><span className="muted">{n ? `${n} para revisar` : 'Nada pendiente'}</span></div>
          {incidencias.map(i => (
            <button key={i.k} role="menuitem" onClick={() => { setAbierto(false); ir(i.ir); }}>
              <span className="av-ico" style={{ width:34, height:34, background:`var(--${i.tono}-soft)`, color:`var(--${i.tono}-text)` }}><Icon n={i.icon} s={17} /></span>
              <span style={{ minWidth:0, flex:1 }}><b style={{ display:'block' }}>{i.t}</b><span className="muted num" style={{ fontSize:12.5 }}>{i.d}</span></span>
            </button>
          ))}
          {llamadas.filter(l => l.estado === 'pendiente').map(l => <button key={l.id} role="menuitem" onClick={() => { atenderLlamada(l); }}><Icon n="check" s={18} />Marcar atendida · Mesa {l.mesa}</button>)}
          {!n && <div className="empty" style={{ padding:'16px 8px' }}><Icon n="check" s={28} w={1.5} /><span>Todo en orden.</span></div>}
        </div>
      </>)}
    </div>
  );
}


/* ============================================================================
   Versión con base de datos (Supabase)
   ============================================================================ */
const CAJA_VACIA = { abierta:false, apertura:0, por:'', hora:'', tickets:0, descuentos:0, ultimo:null, ventas:{ efectivo:0, qr:0, tarjeta:0 }, propinas:{ efectivo:0, qr:0, tarjeta:0 }, movs:[] };

/* Datos con los que nace la base del negocio (la ficha de Notas de Café, sin ventas de ejemplo). */
function datosIniciales(email) {
  return {
    config: { ...CONFIG0, ...LOCAL0 },
    cats: CATS0,
    productos: PRODUCTOS0,
    insumos: INSUMOS0,
    recetas: RECETAS0,
    mesas: MESAS0.map(m => ({ ...m, estado:'libre', personas:0, min:0, pagadoC:0, items:[], split:null })),
    zonas: ['Salón', 'Escenario'],
    usuarios: USUARIOS0.map(u => u.id === 'u1' ? { ...u, email: email || '', ultimo:'Nunca' } : { ...u, ultimo:'Nunca' }),
    perms: PERM0,
    menuDia: MENU_DIA0,
    banners: BANNERS0,
    proveedores: PROVEEDORES0,
    eventos: EVENTOS0.filter(e => e.fecha >= hoyISO()).map(e => ({ ...e, vendidas:0 })),
    caja: CAJA_VACIA,
    ticketNo: 0,
    pantalla: { cobro:null, gracias:null, carrito:[] },
    log: [{ id: Date.now(), h:'Hoy ' + hora(), quien:'GastroMetrik', que:'Se creó la base de datos del negocio' }],
  };
}

/* ---------- Reportes con las ventas reales ---------- */
function calcularReportes(ventas, pedidos) {
  const val = (ventas || []).filter(v => v.t && v.estado !== 'anulada');
  const porDia = {}, cntDia = {}, horasMap = {};
  const hoy = hoyISO();
  val.forEach(v => { const d = isoDia(new Date(v.t)); porDia[d] = (porDia[d] || 0) + v.totalC; cntDia[d] = (cntDia[d] || 0) + 1; if (d === hoy) { const h = new Date(v.t).getHours(); horasMap[h] = (horasMap[h] || 0) + v.totalC; } });
  const diaN = n => { const d = new Date(); d.setDate(d.getDate() - n); return isoDia(d); };
  const suma = (a, b, m = porDia) => { let s = 0; for (let i = a; i <= b; i++) s += m[diaN(i)] || 0; return s; };
  const hs = Object.keys(horasMap).map(Number);
  const hMin = Math.min(8, ...hs), hMax = Math.min(23, Math.max(21, ...hs));
  const horas = []; for (let h = hMin; h <= hMax; h++) horas.push([h, (horasMap[h] || 0) / 100]);
  const picoH = hs.length ? horas.reduce((a, b) => b[1] > a[1] ? b : a)[0] : null;
  const DS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const semana = Array.from({ length:7 }, (_, i) => { const n = 6 - i; const d = new Date(); d.setDate(d.getDate() - n); return [n === 0 ? 'Hoy' : DS[d.getDay()], (porDia[isoDia(d)] || 0) / 100]; });
  const v30 = Array.from({ length:30 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (29 - i)); return [d, (porDia[isoDia(d)] || 0) / 100]; });
  const unidadesP = {}, porCat = {};
  (pedidos || []).filter(p => p.estado !== 'anulado' && p.creado && isoDia(new Date(p.creado)) === hoy).forEach(p => p.items.forEach(it => {
    if (!P[it.id]) return;
    unidadesP[it.id] = (unidadesP[it.id] || 0) + it.q;
    const c = P[it.id].cat; porCat[c] = (porCat[c] || 0) + lineUnitC(it) * it.q;
  }));
  const colores = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)'];
  const ventasC = porDia[hoy] || 0;
  REP = {
    horas, semana, v30,
    top: Object.entries(unidadesP).sort((a, b) => b[1] - a[1]).slice(0, 5),
    cats: Object.entries(porCat).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c, v], i) => [CAT[c] || (c === 'mdia' ? 'Menú del día' : c === 'eventos' ? 'Entradas' : c), v / 100, colores[i]]),
    kpi: {
      ventasC, tickets: cntDia[hoy] || 0, promedioC: cntDia[hoy] ? Math.round(ventasC / cntDia[hoy]) : 0, picoH,
      pico: picoH !== null ? String(picoH).padStart(2, '0') + ':00' : '—',
      antC: porDia[diaN(7)] || 0, ant7C: suma(7, 13), ant30C: suma(30, 59),
      tickets7: suma(0, 6, cntDia), tickets30: suma(0, 29, cntDia),
    },
  };
  VENTAS_30 = v30;
  VENTAS_HOY = Math.max(1, ventasC / 100);
}
const exportarReportes = aviso => {
  const { horas, semana, top, cats, kpi } = REP;
  const totC = cats.reduce((s, c) => s + c[1], 0) || 1;
  guardarExcel(nombreArchivo(NEGOCIO, 'reportes'), [
    { nombre:'Resumen', titulo:`${NEGOCIO} · Reporte del día`, sub:`${fechaDMA(hoyISO())} · montos en bolivianos`, columnas:['Indicador', 'Valor'], filas:[
      ['Ventas de hoy', { bs: kpi.ventasC }], ['Tickets', { int: kpi.tickets }], ['Ticket promedio', { bs: kpi.promedioC }], ['Hora pico', kpi.pico], ['Mismo día de la semana pasada', { bs: kpi.antC }]] },
    { nombre:'Ventas por hora', titulo:'Ventas por hora', columnas:['Hora', 'Ventas'], filas: horas.map(([h, v]) => [`${String(h).padStart(2, '0')}:00`, { bs: Math.round(v * 100) }]), total:['Total', { bs: kpi.ventasC }] },
    { nombre:'Últimos 7 días', titulo:'Ventas de los últimos 7 días', columnas:['Día', 'Ventas'], filas: semana.map(([d, v]) => [d, { bs: Math.round(v * 100) }]), total:['Total', { bs: Math.round(semana.reduce((s, x) => s + x[1], 0) * 100) }] },
    { nombre:'Más vendidos', titulo:'Productos más vendidos hoy', columnas:['Producto', 'Unidades'], filas: top.length ? top.map(([id, n]) => [P[id] ? P[id].nombre : id, { int: n }]) : [['Sin ventas todavía', '']] },
    { nombre:'Por categoría', titulo:'Ventas por categoría', columnas:['Categoría', 'Ventas', 'Porcentaje'], filas: cats.map(([k, v]) => [k, { bs: Math.round(v * 100) }, { pct: Math.round(v / totC * 100) / 100 }]) },
  ], aviso);
};
function ReportesContenido({ aviso }) {
  const { horas, semana, top, cats, kpi } = REP;
  const totC = cats.reduce((s, c) => s + c[1], 0);
  const redondo = m => { const p = Math.pow(10, Math.floor(Math.log10(Math.max(1, m)))); return Math.ceil(m / p) * p || 100; };
  const maxH = redondo(Math.max(...horas.map(h => h[1]), 1));
  const max = redondo(Math.max(...semana.map(d => d[1]), 1));
  const W = 600, H = 230, L = 52, R = 24, Tp = 26, B = 32;
  const x = i => L + i * (W - L - R) / (semana.length - 1);
  const y = v => Tp + (1 - v / max) * (H - Tp - B);
  const pts = semana.map((d, i) => `${x(i)},${y(d[1])}`).join(' ');
  const area = `M${x(0)},${y(0)} L${pts.split(' ').join(' L')} L${x(semana.length - 1)},${y(0)} Z`;
  const delta = kpi.antC ? Math.round((kpi.ventasC - kpi.antC) / kpi.antC * 100) : null;
  const mejor = semana.reduce((a, b, i) => b[1] > semana[a][1] ? i : a, 0);
  return (<>
    <div className="page-head">
      <div className="tabs" role="group" aria-label="Periodo"><button aria-pressed="true">Hoy</button></div>
      <BotonExcel onExport={() => exportarReportes(aviso)} />
    </div>
    <div className="kpis">
      <div className="card kpi"><div className="eyebrow">Ventas de hoy</div><div className="kpi-val num"><AnimNum value={kpi.ventasC} fmt={bsC} desde={0} /></div>{delta === null ? <span className="muted">Sin datos de la semana pasada</span> : <span className={'pill num ' + (delta >= 0 ? 'pill-green' : 'pill-red')}>{delta >= 0 ? '+' : ''}{delta} % vs. el mismo día de la semana pasada</span>}</div>
      <div className="card kpi"><div className="eyebrow">Tickets</div><div className="kpi-val num"><AnimNum value={kpi.tickets} fmt={n => n} desde={0} /></div><span className="muted">Cobros registrados hoy</span></div>
      <div className="card kpi"><div className="eyebrow">Ticket promedio</div><div className="kpi-val num"><AnimNum value={kpi.promedioC} fmt={bsC} desde={0} /></div><span className="muted">Ventas ÷ tickets</span></div>
      <div className="card kpi"><div className="eyebrow">Hora pico</div><div className="kpi-val num">{kpi.pico}</div><span className="muted">La hora con más ventas hoy</span></div>
    </div>
    {!kpi.tickets && <div className="fiscal-note" style={{ marginBottom:18 }}><Icon n="reportes" s={18} /><span>Todavía no hay cobros hoy. Los gráficos se llenan solos con cada venta.</span></div>}
    <div className="grid-2" style={{ marginBottom:18 }}>
      <section className="card">
        <div className="between" style={{ marginBottom:18 }}><h2>Ventas por hora</h2><span className="muted">Hoy, en Bs</span></div>
        <div className="hours" role="img" aria-label={`Ventas por hora de hoy${kpi.pico !== '—' ? ', pico a las ' + kpi.pico : ''}`}>
          {[.25, .5, .75, 1].map(g => <div key={g} className="grid" style={{ bottom: `calc(26px + ${g} * (100% - 26px))` }}><span className="gl num" style={{ left:-34 }}>{Math.round(maxH * g)}</span></div>)}
          {horas.map(([h, v]) => { const peak = h === kpi.picoH && v > 0; return <div key={h} className={'hcol' + (peak ? ' peak' : '')} title={`${h}:00 · ${bs(v)}`}>{peak && <em className="num">{Math.round(v)}</em>}<i style={{ height: (v / maxH * 100) + '%' }} /><span className="num">{h}</span></div>; })}
        </div>
      </section>
      <section className="card">
        <div className="between" style={{ marginBottom:8 }}><h2>Últimos 7 días</h2><span className="muted num">Total {bs(semana.reduce((s, d) => s + d[1], 0))}</span></div>
        <div className="chart-wrap">
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', minWidth:340, height:'auto', display:'block' }} role="img" aria-label="Ventas de los últimos 7 días">
            {[0, .25, .5, .75, 1].map(g => <g key={g}><line x1={L} x2={W - R} y1={y(max * g)} y2={y(max * g)} style={{ stroke:'var(--line)' }} strokeDasharray={g ? '4 5' : ''} /><text x={L - 10} y={y(max * g) + 4} textAnchor="end" style={{ fill:'var(--muted)', fontSize:13 }}>{g ? (max * g >= 1000 ? String(Math.round(max * g / 100) / 10).replace('.', ',') + 'k' : Math.round(max * g)) : '0'}</text></g>)}
            <path d={area} style={{ fill:'var(--green-soft)' }} />
            <polyline points={pts} fill="none" style={{ stroke:'var(--green)' }} strokeWidth="3" strokeLinejoin="round" />
            {semana.map((d, i) => <g key={i}>
              <circle cx={x(i)} cy={y(d[1])} r={i === 6 ? 7 : 4} style={{ fill: i === 6 ? 'var(--green)' : 'var(--surface)', stroke:'var(--green)' }} strokeWidth="2.5" />
              <text x={x(i)} y={H - 10} textAnchor="middle" style={{ fill: i === 6 ? 'var(--ink)' : 'var(--muted)', fontSize:13, fontWeight: i === 6 ? 700 : 400 }}>{d[0]}</text>
            </g>)}
            {semana[mejor][1] > 0 && mejor !== 6 && <text x={x(mejor)} y={y(semana[mejor][1]) - 12} textAnchor="middle" style={{ fill:'var(--ink)', fontSize:13, fontWeight:700 }}>{semana[mejor][0]} {bs(semana[mejor][1])}</text>}
          </svg>
        </div>
      </section>
    </div>
    <div className="grid-2">
      <section className="card">
        <div className="between" style={{ marginBottom:10 }}><h2>Más vendidos hoy</h2><span className="muted">Unidades</span></div>
        {top.length ? top.map(([id, n]) => (
          <div className="hbar" key={id}>
            <span style={{ fontWeight:600, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{P[id] ? P[id].nombre : id}</span>
            <div className="bar" style={{ height:14 }}><i style={{ width: (n / top[0][1] * 100) + '%' }} /></div>
            <b className="num" style={{ textAlign:'right' }}>{n}</b>
          </div>
        )) : <div className="empty" style={{ padding:'20px 6px' }}><span>Aparecen cuando entren pedidos.</span></div>}
      </section>
      <section className="card">
        <h2 style={{ marginBottom:16 }}>Ventas por categoría</h2>
        {totC > 0 ? (<>
          <div className="stacked">{cats.map(([k, v, c]) => <span key={k} style={{ width: (v / totC * 100) + '%', background:c }} title={`${k} ${bs(v)}`} />)}</div>
          <div style={{ marginTop:12 }}>{cats.map(([k, v, c]) => <div className="kv num" key={k}><span className="row"><i className="dot" style={{ background:c, width:12, height:12 }} /><b>{k}</b></span><span>{bs(v)} <span className="muted">· {Math.round(v / totC * 100)} %</span></span></div>)}</div>
        </>) : <div className="empty" style={{ padding:'20px 6px' }}><span>Aparecen cuando entren pedidos.</span></div>}
      </section>
    </div>
  </>);
}

/* ---------- QR del banco para cobrar ---------- */
function QRBancoEditor({ config, setConfig, aviso }) {
  const subir = e => {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    const r = new FileReader();
    r.onload = () => { const img = new Image(); img.onload = () => {
      const s = Math.min(1, 700 / Math.max(img.width, img.height)); const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      setConfig(x => ({ ...x, qrBanco: c.toDataURL('image/png') })); aviso('QR de cobro guardado: ya aparece al cobrar con QR');
    }; img.src = r.result; };
    r.readAsDataURL(file);
    e.target.value = '';
  };
  return (
    <div className="stack" style={{ gap:10, width:'100%', borderTop:'1px solid var(--line)', paddingTop:14, marginTop:4 }}>
      <h2>QR de cobro de tu banco</h2>
      <span className="muted">Sube la imagen del QR fijo de tu cuenta (la que te da la app de tu banco). Se muestra al cobrar con QR, en la pantalla del cliente y en la tienda online.</span>
      {config.qrBanco && <img src={config.qrBanco} alt="QR de cobro actual" style={{ width:150, height:150, objectFit:'contain', background:'#fff', borderRadius:14 }} />}
      <div className="row" style={{ flexWrap:'wrap' }}>
        <label className="btn btn-ghost btn-sm" style={{ cursor:'pointer' }}><Icon n="camera" s={17} />{config.qrBanco ? 'Cambiar imagen' : 'Subir imagen del QR'}<input type="file" accept="image/*" onChange={subir} style={{ display:'none' }} /></label>
        {config.qrBanco && <button type="button" className="btn btn-ghost btn-sm danger-text" onClick={() => setConfig(x => ({ ...x, qrBanco:null }))}><Icon n="trash" s={17} />Quitar</button>}
      </div>
    </div>
  );
}

/* ---------- Acceso con correo y contraseña (Usuarios → Editar) ---------- */
function AccesoApp({ usuario, rol }) {
  const [perfil, setPerfil] = useState(undefined);
  const [email, setEmail] = useState(usuario.email || '');
  const [clave, setClave] = useState('');
  const [msg, setMsg] = useState(null);
  const [trabajando, setTrabajando] = useState(false);
  const [cambiar, setCambiar] = useState(false);
  const [quitar, setQuitar] = useState(false);
  const cargarPerfil = () => supabase.from('perfiles').select('email,rol,activo').eq('usuario_id', usuario.id).maybeSingle().then(({ data }) => setPerfil(data || null), () => setPerfil(null));
  useEffect(() => { cargarPerfil(); }, []);
  const correr = async (fn, ok) => {
    setTrabajando(true); setMsg(null);
    const { error } = await fn();
    setTrabajando(false);
    if (error) setMsg({ err:true, t: error.message || 'No se pudo completar. Revisa la conexión.' });
    else { setMsg({ t: ok }); setClave(''); setCambiar(false); setQuitar(false); cargarPerfil(); }
  };
  const darAcceso = () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setMsg({ err:true, t:'Revisa el correo.' }); return; }
    if (clave.length < 6) { setMsg({ err:true, t:'La contraseña debe tener al menos 6 caracteres.' }); return; }
    correr(() => supabase.rpc('crear_acceso', { p_email: email.trim(), p_clave: clave, p_usuario_id: usuario.id, p_rol: rol }), `Listo: ${usuario.nombre.split(' ')[0]} ya puede entrar con ${email.trim()} y su contraseña.`);
  };
  return (
    <div className="field span-2 pin-box">
      <span className="row" style={{ gap:8 }}><Icon n="shield" s={19} /><b style={{ color:'var(--ink)' }}>Acceso con correo y contraseña</b></span>
      {perfil === undefined ? <span className="muted">Revisando…</span> : perfil ? (<>
        <span style={{ fontWeight:500 }}>Entra con <b>{perfil.email}</b>{perfil.activo ? '' : ' · acceso pausado porque la cuenta está desactivada'}. Sirve para abrir GastroMetrik en su propio celular o computadora.</span>
        {cambiar ? (
          <div className="row" style={{ flexWrap:'wrap' }}>
            <input className="input" type="password" autoComplete="new-password" placeholder="Nueva contraseña (6 o más)" value={clave} onChange={e => setClave(e.target.value)} style={{ flex:'1 1 200px' }} />
            <button type="button" className="btn btn-primary btn-sm" disabled={trabajando || clave.length < 6} onClick={() => correr(() => supabase.rpc('cambiar_clave', { p_usuario_id: usuario.id, p_clave: clave }), 'Contraseña cambiada.')}>Guardar contraseña</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCambiar(false)}>Cancelar</button>
          </div>
        ) : quitar ? (
          <div className="row" style={{ flexWrap:'wrap' }}><span style={{ fontWeight:600 }}>¿Quitarle el acceso? Ya no podrá entrar con su correo.</span>
            <button type="button" className="btn btn-danger btn-sm" disabled={trabajando} onClick={() => correr(() => supabase.rpc('quitar_acceso', { p_usuario_id: usuario.id }), 'Acceso quitado.')}>Sí, quitar</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setQuitar(false)}>Cancelar</button></div>
        ) : (
          <div className="row" style={{ flexWrap:'wrap' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCambiar(true)}><Icon n="key" s={17} />Cambiar contraseña</button>
            <button type="button" className="btn btn-ghost btn-sm danger-text" onClick={() => setQuitar(true)}><Icon n="trash" s={17} />Quitar acceso</button>
          </div>
        )}
      </>) : (<>
        <span style={{ fontWeight:500 }}>Opcional. Dale un correo y una contraseña si va a usar GastroMetrik en su propio equipo. En un equipo compartido basta con su PIN.</span>
        <div className="form-grid">
          <label className="field">Correo<input className="input" type="email" autoComplete="off" value={email} onChange={e => setEmail(e.target.value)} placeholder="nombre@gmail.com" /></label>
          <label className="field">Contraseña<input className="input" type="password" autoComplete="new-password" value={clave} onChange={e => setClave(e.target.value)} placeholder="6 o más caracteres" /></label>
        </div>
        <button type="button" className="btn btn-primary btn-sm" style={{ alignSelf:'flex-start' }} disabled={trabajando} onClick={darAcceso}><Icon n="shield" s={17} />{trabajando ? 'Creando…' : 'Dar acceso'}</button>
      </>)}
      {msg && <span className={msg.err ? 'err' : ''} style={msg.err ? undefined : { color:'var(--green-text)', fontWeight:700 }} role="status">{msg.t}</span>}
    </div>
  );
}

/* ---------- Estado de la sincronización (Configuración → Diagnóstico) ---------- */
function EstadoNube() {
  const [e, setE] = useState(estadoSync());
  useEffect(() => escucharEstado(setE), []);
  return (
    <div className="toggle-row field">
      <div><b style={{ color:'var(--ink)' }}>Datos en la nube</b><div style={{ fontWeight:500 }}>{e.pendientes ? `${e.pendientes} cambio${e.pendientes > 1 ? 's' : ''} esperando conexión para guardarse.` : 'Todo guardado en Supabase y sincronizado con los demás equipos.'}{e.error && e.error !== 'Sin conexión' ? ` Último aviso: ${e.error}` : ''}</div></div>
      <span className={'pill ' + (e.pendientes ? 'pill-gold' : 'pill-green')}><Icon n={e.pendientes ? 'clock' : 'check'} s={14} />{e.pendientes ? 'Pendiente' : 'Al día'}</span>
    </div>
  );
}

/* ---------- Pantallas de arranque ---------- */
function PantallaVerde({ children, config }) {
  return (
    <div className="lock" role="main">
      <div className="lock-inner">
        <Logo src={config && config.logo} nombre={(config && config.nombre) || 'Notas de Café'} cls="lock-logo" />
        <h1 style={{ color:'var(--side-ink)' }}>{(config && config.nombre) || 'Notas de Café'}</h1>
        <span className="lock-app">GastroMetrik</span>
        {children}
        <Creditos variante="en-acceso" />
      </div>
    </div>
  );
}
function Ingreso({ onEntrar }) {
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [err, setErr] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const enviar = async e => {
    e.preventDefault(); setErr(''); setTrabajando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: clave });
    setTrabajando(false);
    if (error) setErr(/invalid/i.test(error.message) ? 'Correo o contraseña incorrectos.' : /fetch|network/i.test(error.message) ? 'No hay conexión con el servidor. Revisa internet.' : error.message);
    else onEntrar && onEntrar();
  };
  return (
    <PantallaVerde>
      <form className="ingreso" onSubmit={enviar}>
        <p className="lock-sub">Entra con tu cuenta</p>
        <label className="field">Correo<input className="input" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required /></label>
        <label className="field">Contraseña<input className="input" type="password" autoComplete="current-password" value={clave} onChange={e => setClave(e.target.value)} required /></label>
        <div className="lock-err" role="alert">{err}</div>
        <button className="btn btn-primary btn-cobrar" disabled={trabajando}><span>{trabajando ? 'Entrando…' : 'Entrar'}</span><Icon n="arrow" s={20} /></button>
        <a className="ingreso-link" href="#tienda">¿Eres cliente? Ver la tienda online</a>
      </form>
    </PantallaVerde>
  );
}
function Mensaje({ titulo, texto, accion, onAccion, secundaria, onSecundaria }) {
  return (
    <PantallaVerde>
      <div className="ingreso">
        <p className="lock-sub" style={{ fontWeight:800 }}>{titulo}</p>
        <div className="ingreso-msg">{texto}</div>
        {accion && <button className="btn btn-primary" onClick={onAccion}>{accion}</button>}
        {secundaria && <button className="btn btn-ghost" onClick={onSecundaria}>{secundaria}</button>}
      </div>
    </PantallaVerde>
  );
}

const RUTAS_PUBLICAS = ['tienda', 'mesa', 'llamar'];
const salir = async () => { try { detener(); await supabase.auth.signOut(); } catch (e) {} try { localStorage.removeItem('gm:sesion'); } catch (e) {} location.hash = ''; location.reload(); };

function Arranque() {
  const [fase, setFase] = useState('inicio');   // inicio, ingreso, sin-perfil, sin-base, error, publico, app
  const [detalle, setDetalle] = useState('');
  const [hash, setHash] = useState(() => (location.hash || '').slice(1).split('/')[0]);
  useEffect(() => { const f = () => setHash((location.hash || '').slice(1).split('/')[0]); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  const iniciar = async () => {
    if (!supabase) { setFase('sin-conexion'); return; }
    setFase('inicio');
    let sesion = null;
    try { const { data } = await supabase.auth.getSession(); sesion = data.session; } catch (e) {}
    if (!sesion) { setFase(RUTAS_PUBLICAS.includes((location.hash || '').slice(1).split('/')[0]) ? 'publico' : 'ingreso'); return; }
    const email = sesion.user.email;
    let perfil = null;
    try {
      const { data, error } = await supabase.from('perfiles').select('rol,usuario_id,activo,email').eq('id', sesion.user.id).maybeSingle();
      if (error) throw error;
      perfil = data;
      try { localStorage.setItem('gm-perfil', JSON.stringify(perfil)); } catch (e) {}
    } catch (e) { try { perfil = JSON.parse(localStorage.getItem('gm-perfil')); } catch (er) {} }
    if (!perfil || !perfil.activo) { setDetalle(email); setFase('sin-perfil'); return; }
    let r;
    try { r = await cargar(); } catch (e) { setDetalle(e.message || String(e)); setFase('error'); return; }
    if (r === 'vacio') {
      if (perfil.rol !== 'dueno') { setFase('sin-base'); return; }
      await sembrar(datosIniciales(email));
    }
    try { if (perfil.usuario_id && !localStorage.getItem('gm:sesion')) localStorage.setItem('gm:sesion', JSON.stringify(perfil.usuario_id)); } catch (e) {}
    tiempoReal();
    setFase('app');
  };
  useEffect(() => {
    iniciar();
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') setFase(RUTAS_PUBLICAS.includes((location.hash || '').slice(1).split('/')[0]) ? 'publico' : 'ingreso'); });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => { if (fase === 'publico' && !RUTAS_PUBLICAS.includes(hash)) setFase('ingreso'); if (fase === 'ingreso' && RUTAS_PUBLICAS.includes(hash)) setFase('publico'); }, [hash, fase]);

  if (fase === 'sin-conexion') return <Mensaje titulo="Falta conectar Supabase" texto={<>Agrega las variables <b>VITE_SUPABASE_URL</b> y <b>VITE_SUPABASE_ANON_KEY</b> en Netlify (Site configuration → Environment variables) y vuelve a publicar el sitio.</>} />;
  if (fase === 'inicio') return <PantallaVerde><p className="lock-sub">Abriendo GastroMetrik…</p></PantallaVerde>;
  if (fase === 'ingreso') return <Ingreso onEntrar={iniciar} />;
  if (fase === 'publico') return <PublicApp />;
  if (fase === 'sin-perfil') return <Mensaje titulo="Tu cuenta todavía no tiene acceso" texto={<>Entraste como <b>{detalle}</b>, pero esta cuenta no está habilitada. Si eres el dueño, corre el archivo <b>02-hacer-administrador.sql</b> en Supabase con este correo. Si eres del equipo, pídele acceso al dueño.</>} accion="Volver a intentar" onAccion={iniciar} secundaria="Salir" onSecundaria={salir} />;
  if (fase === 'sin-base') return <Mensaje titulo="Falta preparar el negocio" texto="El dueño debe entrar primero una vez para cargar los datos del negocio. Después podrás usar GastroMetrik." accion="Volver a intentar" onAccion={iniciar} secundaria="Salir" onSecundaria={salir} />;
  if (fase === 'error') return <Mensaje titulo="No se pudieron leer los datos" texto={<>Revisa tu conexión a internet y que el archivo <b>01-esquema.sql</b> se haya corrido en Supabase. Detalle: {detalle}</>} accion="Volver a intentar" onAccion={iniciar} secundaria="Salir" onSecundaria={salir} />;
  return <App />;
}

/* ---------- Tienda online y QR de mesa para clientes sin cuenta ---------- */
function PublicApp() {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [vista, setVista] = useState(() => (location.hash || '').slice(1).split('/')[0] || 'tienda');
  const [param, setParam] = useState(hashParam);
  const [mesaInfo, setMesaInfo] = useState(null);
  const [seguido, setSeguido] = useState(null);
  const [aviso, setAviso] = useState(null);
  const cargarDatos = () => supabase.rpc('datos_publicos').then(({ data, error: e }) => { if (e) setError(e.message); else { setDatos(data); setError(''); } });
  useEffect(() => { cargarDatos(); const t = setInterval(cargarDatos, 60000); const f = () => { setVista((location.hash || '').slice(1).split('/')[0] || 'tienda'); setParam(hashParam()); }; window.addEventListener('hashchange', f); return () => { clearInterval(t); window.removeEventListener('hashchange', f); }; }, []);
  const n = Number(param) || (datos && datos.mesas[0] ? datos.mesas[0].n : 1);
  const refrescarMesa = () => supabase.rpc('estado_mesa', { p_n: n }).then(({ data }) => data && setMesaInfo(data));
  const refrescarPedido = () => { let no = null, uids = {}; try { no = JSON.parse(localStorage.getItem('gm:miPedidoWeb')); uids = JSON.parse(localStorage.getItem('gm-web-uid') || '{}'); } catch (e) {} if (!no || !uids[no]) { setSeguido(null); return; } supabase.rpc('estado_pedido', { p_uid: uids[no] }).then(({ data }) => setSeguido(data || null)); };
  useEffect(() => { if (vista === 'mesa' || vista === 'llamar') { refrescarMesa(); const t = setInterval(refrescarMesa, 5000); return () => clearInterval(t); } }, [vista, n]);
  useEffect(() => { if (vista === 'tienda') { refrescarPedido(); const t = setInterval(refrescarPedido, 6000); return () => clearInterval(t); } }, [vista]);
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(null), 4500); return () => clearTimeout(t); }, [aviso]);
  useEffect(() => { try { if (datos && datos.config) document.title = datos.config.nombre; } catch (e) {} }, [datos]);
  if (error) return <Mensaje titulo="No pudimos abrir la carta" texto="Revisa tu conexión a internet e intenta de nuevo." accion="Reintentar" onAccion={cargarDatos} />;
  if (!datos || !datos.config) return <PantallaVerde><p className="lock-sub">Abriendo la carta…</p></PantallaVerde>;

  const config = { ...LOCAL0, ...CONFIG0, ...Object.fromEntries(Object.entries(datos.config).filter(([, v]) => v !== null)) };
  const menuDia = datos.menuDia || { ...MENU_DIA0, activo:false };
  const mdiaProd = { id:'mdia', cat:'mdia', nombre:`Menú del día · ${menuDia.titulo}`, precio:menuDia.precio, pres:'masa', color:'#C98A3E', disponible:true, eliminado:false, stockCtl:false, stock:0, min:0, desc:menuDia.desc, mods:[], foto:null };
  P = Object.fromEntries([...datos.productos, mdiaProd].map(p => [p.id, p]));
  CATEGORIAS = [...datos.cats].sort((a, b) => a.orden - b.orden);
  CAT = Object.fromEntries(CATEGORIAS.map(c => [c.id, c.nombre]));
  NEGOCIO = config.nombre;
  FISCAL = { simplificado: !!config.simplificado };
  QR_BANCO = config.qrBanco || null;
  const productos = [...datos.productos, ...(menuDia.activo ? [mdiaProd] : [])];
  const fallo = e => setAviso((e && e.message) || 'No se pudo enviar. Revisa tu conexión.');
  const irMesa = (v, x) => { location.hash = v + '/' + x; };
  const mesasBase = datos.mesas.map(m => mesaInfo && mesaInfo.mesa && m.n === mesaInfo.mesa.n ? { ...m, ...mesaInfo.mesa } : { ...m, items: m.items || [], pagadoC: 0 });
  const llamadas = mesaInfo ? mesaInfo.llamadas : [];
  const solicitudes = mesaInfo ? mesaInfo.solicitudes : [];
  const pedidosMesa = mesaInfo ? mesaInfo.pedidos : [];
  const llamar = (mesa, tipo, pago) => supabase.rpc('llamar_mesero', { p_mesa: mesa, p_tipo: tipo, p_pago: pago || null }).then(({ error: e }) => { if (e) fallo(e); else refrescarMesa(); });
  const cancelarLlamada = l => supabase.rpc('cancelar_llamada', { p_id: l.id }).then(() => refrescarMesa());
  const crearSolicitud = (mesa, items, nombre) => supabase.rpc('crear_solicitud', { p_mesa: mesa, p_items: items, p_nombre: nombre || '' }).then(({ error: e }) => { if (e) fallo(e); refrescarMesa(); });
  const crearPedidoWeb = async d => {
    const { data, error: e } = await supabase.rpc('crear_pedido_web', { p: { ...d, totalC: totalC(d.items) } });
    if (e) { fallo(e); throw e; }
    try { const u = JSON.parse(localStorage.getItem('gm-web-uid') || '{}'); u[data.no] = data.uid; localStorage.setItem('gm-web-uid', JSON.stringify(u)); } catch (er) {}
    setTimeout(refrescarPedido, 400);
    return data.no;
  };
  return (<>
    <div className="app-full">
      {vista === 'mesa' ? <PedidoMesa {...{ n, setN: null, mesas: mesasBase, productos, cats: datos.cats, menuDia, solicitudes, crearSolicitud, llamadas, llamar, pedidos: pedidosMesa, config, onPortada: null }} />
        : vista === 'llamar' ? <LlamarMesero {...{ n, setN: null, mesas: mesasBase, llamadas, llamar, cancelarLlamada, config, now: Date.now(), onPortada: null }} irCarta={() => irMesa('mesa', n)} />
        : <Tienda {...{ productos, cats: datos.cats, config, banners: datos.banners, menuDia, crearPedidoWeb, pedidos: seguido ? [seguido] : [], onPortada: null }} />}
    </div>
    {aviso && <div className="toast" role="status"><Icon n="alert" s={20} /><span>{aviso}</span></div>}
  </>);
}

export { Arranque };

