// server.js — servidor Express + socket.io (estado simple en memoria)
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins
    methods: ["GET", "POST"]
  }
});
// Archivo de texto para saldos editables (formato: "usuario saldo")

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Silenciar el error de favicon.ico en la consola del navegador
app.get('/favicon.ico', (req, res) => res.status(204).send());

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '1mb' }));

// === Simple file-based user store (registro) ===
const REG_DIR = path.join(__dirname, 'registro');
const USERS_JSON = path.join(REG_DIR, 'users.json');
const REPORT_CSV = path.join(REG_DIR, 'reporte.csv');
const SALDOS_TXT  = path.join(REG_DIR, 'saldos.txt');
const GOV_JSON    = path.join(REG_DIR, 'government.json');
try {
  if (!fs.existsSync(REG_DIR)) fs.mkdirSync(REG_DIR, { recursive: true });
  if (!fs.existsSync(USERS_JSON)) fs.writeFileSync(USERS_JSON, '[]', 'utf8');
  if (!fs.existsSync(REPORT_CSV)) fs.writeFileSync(REPORT_CSV, 'fecha,evento,usuario,detalle\n', 'utf8');
  if (!fs.existsSync(GOV_JSON)) fs.writeFileSync(GOV_JSON, JSON.stringify({ funds: 10000, placed: [] }, null, 2), 'utf8');
} catch (e) { console.error('Error preparando carpeta registro:', e); }

// ===== Utilidades Saldos TXT =====
// Formato esperado por defecto: "usuario saldo" en cada línea.
// También se aceptan separadores ":" "," o "=" (flexible para edición manual).
function parseLine(line){
  const s = (line||'').trim();
  if(!s || s.startsWith('#')) return null;
  // separar por :,=,coma o espacios múltiples
  const parts = s.split(/\s*[:=,\s]\s*/).filter(Boolean);
  if(parts.length < 2) return null;
  const username = String(parts[0]).trim();
  const money = Number(parts[1]);
  if(!username || !isFinite(money)) return null;
  return { username, money: Math.floor(money) };
}
function readBalancesTxt(){
  if(!fs.existsSync(SALDOS_TXT)) return new Map();
  try{
    const txt = fs.readFileSync(SALDOS_TXT, 'utf8');
    const map = new Map();
    for(const raw of txt.split(/\r?\n/)){
      const rec = parseLine(raw);
      if(rec){ map.set(rec.username.toLowerCase(), rec); }
    }
    return map;
  }catch(e){ console.warn('No pude leer saldos.txt:', e.message); return new Map(); }
}
function writeSaldosTxtFromUsers(){
  try{
    const users = readUsers();
    const lines = [
      '# Formato: usuario saldo',
      '# Edita el saldo (dinero en mano). Guarda el archivo y el cambio se verá en el juego.'
    ];
    for(const u of users){
      const money = Math.floor(u.profile?.stats?.money ?? 0);
      lines.push(`${u.username} ${money}`);
    }
    fs.writeFileSync(SALDOS_TXT, lines.join('\n') + '\n', 'utf8');
  }catch(e){ console.warn('No pude escribir saldos.txt:', e.message); }
}
// Inicializar archivo si no existe
if(!fs.existsSync(SALDOS_TXT)){
  try{ writeSaldosTxtFromUsers(); }catch(e){}
}

// Aplicar saldos del TXT a users.json y jugadores conectados
function applyBalancesToUsersAndState(){
  const bal = readBalancesTxt();
  if(!bal.size) return;
  const users = readUsers();
  let changed = false;
  for(const u of users){
    const b = bal.get(u.username.toLowerCase());
    if(!b) continue;
    const money = Math.floor(Number(b.money)||0);
    if(!u.profile) u.profile = { stats:{ money:0, bank:0 }, assets:{ houses:[], shops:[] } };
    const prevMoney = Math.floor(u.profile?.stats?.money ?? 0);
    if(prevMoney !== money){
      u.profile.stats.money = money;
      changed = true;
      // Actualizar en vivo a jugadores conectados con ese username
      for(const p of Object.values(state.players)){
        if(p.username && p.username.toLowerCase() === u.username.toLowerCase()){
          p.money = money;
          p.updatedAt = now();
        }
      }
    }
  }
  if(changed) writeUsers(users);
}

// Vigilar cambios en el archivo de texto (si existe)
try{
  if(fs.existsSync(SALDOS_TXT)){
    fs.watch(SALDOS_TXT, { persistent:true }, (eventType)=>{
      if(eventType === 'change' || eventType === 'rename'){
        setTimeout(()=>{ applyBalancesToUsersAndState(); }, 250);
      }
    });
  }
}catch(e){ console.warn('fs.watch saldos.xlsx falló:', e.message); }

function readUsers(){
  try { return JSON.parse(fs.readFileSync(USERS_JSON, 'utf8')||'[]'); } catch { return []; }
}
function writeUsers(users){
  fs.writeFileSync(USERS_JSON, JSON.stringify(users, null, 2), 'utf8');
}
function readGovernment(){
  try{ return JSON.parse(fs.readFileSync(GOV_JSON, 'utf8')||'{"funds":10000,"placed":[]}'); }catch{ return { funds:10000, placed:[] }; }
}
function writeGovernment(gov){
  try{ fs.writeFileSync(GOV_JSON, JSON.stringify(gov, null, 2), 'utf8'); }catch(e){ console.warn('writeGovernment fail', e?.message||e); }
}
// Actualiza assets en users.json al comprar/colocar
function upsertUserAsset(username, type, obj){
  try{
    const users = readUsers();
    const idx = users.findIndex(u => (u.username||'').toLowerCase() === String(username||'').toLowerCase());
    if(idx < 0) return false;
    const u = users[idx];
    u.profile = u.profile || { stats:{ money:0, bank:0 }, assets:{ houses:[], shops:[] } };
    u.profile.assets = u.profile.assets || { houses:[], shops:[] };
    if(type === 'house'){
      const item = { x: Math.floor(obj.x||0), y: Math.floor(obj.y||0), w: Math.floor(obj.w||60), h: Math.floor(obj.h||60) };
      const exists = (u.profile.assets.houses||[]).some(h => h.x===item.x && h.y===item.y && h.w===item.w && h.h===item.h);
      if(!exists){ (u.profile.assets.houses ||= []).push(item); }
    } else if(type === 'shop'){
      const item = { kind: String(obj.kind||'shop'), x: Math.floor(obj.x||0), y: Math.floor(obj.y||0), w: Math.floor(obj.w||120), h: Math.floor(obj.h||80), cashbox: Math.floor(obj.cashbox||0) };
      const exists = (u.profile.assets.shops||[]).some(s => s.kind===item.kind && s.x===item.x && s.y===item.y && s.w===item.w && s.h===item.h);
      if(!exists){ (u.profile.assets.shops ||= []).push(item); }
    }
    users[idx] = u; writeUsers(users);
    return true;
  }catch(e){ console.warn('upsertUserAsset fail', e?.message||e); return false; }
}
function csvAppend(evento, usuario, detalle){
  const line = `${new Date().toISOString()},${evento},${usuario},${(detalle||'').toString().replace(/[\n\r,]+/g,' ').slice(0,500)}\n`;
  try { fs.appendFileSync(REPORT_CSV, line, 'utf8'); } catch(e) { console.warn('CSV append fail', e); }
}
function hashPassword(password, salt){
  return crypto.pbkdf2Sync(password, salt, 12000, 32, 'sha256').toString('hex');
}
function newToken(){ return crypto.randomBytes(24).toString('hex'); }
const TOKENS = new Map(); // token -> username (in-memory)

// POST /api/register { username, password }
app.post('/api/register', (req, res)=>{
  const { username, password } = req.body||{};
  if(!username || !password) return res.status(400).json({ ok:false, msg:'Faltan datos' });
  const users = readUsers();
  if(users.find(u=>u.username.toLowerCase()===String(username).toLowerCase())){
    return res.status(409).json({ ok:false, msg:'Usuario existente' });
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);
  const user = { username, salt, hash, profile: null, createdAt: Date.now() };
  users.push(user);
  writeUsers(users);
  try{ writeSaldosTxtFromUsers(); }catch(e){}
  csvAppend('registro', username, 'nuevo usuario');
  return res.json({ ok:true });
});

// POST /api/login { username, password }
app.post('/api/login', (req, res)=>{
  const { username, password } = req.body||{};
  if(!username || !password) return res.status(400).json({ ok:false, msg:'Faltan datos' });
  const users = readUsers();
  const u = users.find(x=>x.username.toLowerCase()===String(username).toLowerCase());
  if(!u) return res.status(404).json({ ok:false, msg:'No existe' });
  const ok = hashPassword(password, u.salt) === u.hash;
  if(!ok) return res.status(401).json({ ok:false, msg:'Credenciales inválidas' });
  const token = newToken();
  TOKENS.set(token, u.username);
  csvAppend('login', u.username, 'inicio de sesión');
  return res.json({ ok:true, token, profile: u.profile||null });
});

// GET /api/profile
app.get('/api/profile', (req, res)=>{
  const token = req.get('x-auth');
  if(!token || !TOKENS.has(token)) return res.status(401).json({ ok:false, msg:'No autorizado' });
  const username = TOKENS.get(token);
  const users = readUsers();
  const u = users.find(x=>x.username===username);
  return res.json({ ok:true, profile: u?.profile||null });
});

// POST /api/save { profile }
app.post('/api/save', (req, res)=>{
  const token = req.get('x-auth');
  if(!token || !TOKENS.has(token)) return res.status(401).json({ ok:false, msg:'No autorizado' });
  const username = TOKENS.get(token);
  const profile = req.body?.profile;
  if(!profile) return res.status(400).json({ ok:false, msg:'Perfil requerido' });
  const users = readUsers();
  const idx = users.findIndex(u=>u.username===username);
  if(idx<0) return res.status(404).json({ ok:false, msg:'Usuario no encontrado' });
  users[idx].profile = { ...profile, savedAt: Date.now() };
  writeUsers(users);
  try{ writeSaldosTxtFromUsers(); }catch(e){}
  try{
    // resumen para CSV
    const money = Math.floor(profile?.stats?.money ?? 0);
    const casas = (profile?.assets?.houses||[]).length;
    const negocios = (profile?.assets?.shops||[]).length;
  const veh = profile?.vehicle ? ` veh=${profile.vehicle}` : '';
    csvAppend('save', username, `money=${money} casas=${casas} negocios=${negocios}`);
  }catch(e){}
  return res.json({ ok:true });
});

// ================= Tesorería: leer/guardar saldos.txt (clave requerida) =================
function isValidTreasury(req){
  try{
    const k = req.get('x-treasury') || req.body?.key || req.query?.key;
    return k === 'RODIVRES';
  }catch{ return false; }
}

// GET /api/treasury -> { content }
app.get('/api/treasury', (req, res)=>{
  if(!isValidTreasury(req)) return res.status(401).json({ ok:false, msg:'Clave inválida' });
  try{
    if(!fs.existsSync(SALDOS_TXT)) writeSaldosTxtFromUsers();
    const content = fs.readFileSync(SALDOS_TXT, 'utf8');
    return res.json({ ok:true, content });
  }catch(e){ return res.status(500).json({ ok:false, msg:'No se pudo leer', err: String(e?.message||e) }); }
});

// POST /api/treasury { content }
app.post('/api/treasury', (req, res)=>{
  if(!isValidTreasury(req)) return res.status(401).json({ ok:false, msg:'Clave inválida' });
  const content = req.body?.content;
  if(typeof content !== 'string') return res.status(400).json({ ok:false, msg:'Contenido requerido' });
  try{
    // Guardar archivo y aplicar balances al sistema y jugadores conectados
    fs.writeFileSync(SALDOS_TXT, content, 'utf8');
    applyBalancesToUsersAndState();
    return res.json({ ok:true });
  }catch(e){ return res.status(500).json({ ok:false, msg:'No se pudo guardar', err: String(e?.message||e) }); }
});

// Listado público de balances (nombres y saldos)
app.get('/api/balances', (req, res) => {
  try{
    const users = readUsers();
    const live = Object.values(state.players || {});
    // Mapa de username -> money en vivo (si existe username)
    const liveMap = new Map();
    for(const p of live){
      if(p && p.username){ liveMap.set(p.username.toLowerCase(), Math.floor(Number(p.money)||0)); }
    }
    // Resumen de propiedades por username
    const housesByUser = new Map();
    const shopsByUser  = new Map();
    for(const h of state.houses){ const u=(h.ownerUsername||'').toLowerCase(); if(!u) continue; housesByUser.set(u, (housesByUser.get(u)||0)+1); }
    for(const s of state.shops){ const u=(s.ownerUsername||'').toLowerCase(); if(!u) continue; shopsByUser.set(u, (shopsByUser.get(u)||0)+1); }
    const out = users.map(u => {
      const key = (u.username||'').toLowerCase();
      const moneyFromUsers = Math.floor(u?.profile?.stats?.money ?? 0);
      const money = liveMap.has(key) ? liveMap.get(key) : moneyFromUsers;
      const displayName = (u?.profile?.name && typeof u.profile.name === 'string' && u.profile.name.trim().length>0) ? u.profile.name : u.username;
      const houses = housesByUser.get(key)||0;
      const shops  = shopsByUser.get(key)||0;
      return { username: u.username, displayName, money, houses, shops };
    });
    return res.json({ ok:true, users: out });
  }catch(e){ return res.status(500).json({ ok:false, msg:'No se pudo listar balances' }); }
});

const state = {
  players: {},
  shops: [],
  houses: [],
  government: readGovernment()
};

function now() { return Date.now(); }

// ===== Restaurar casas y negocios desde users.json al estado del servidor =====
function ensureAssetsLoadedFromUsers(){
  try{
    const users = readUsers();
    const haveHouseIds = new Set(state.houses.map(h=>h.id).filter(Boolean));
    const haveShopIds  = new Set(state.shops.map(s=>s.id).filter(Boolean));
    for(const u of users){
      const username = (u?.username||'').trim();
      if(!username) continue;
      const assets = u?.profile?.assets || {};
      // Casas
      (assets.houses||[]).forEach((h, idx)=>{
        const id = `HU:${username.toLowerCase()}#${idx}`;
        if(haveHouseIds.has(id)) return;
        state.houses.push({
          id,
          x: Math.floor(h.x||0), y: Math.floor(h.y||0),
          w: Math.floor(h.w||60), h: Math.floor(h.h||60),
          ownerId: null, rentedBy: null, ownerUsername: username
        });
        haveHouseIds.add(id);
      });
      // Negocios
      (assets.shops||[]).forEach((s, idx)=>{
        const id = `SH:${username.toLowerCase()}#${idx}`;
        if(haveShopIds.has(id)) return;
        state.shops.push({
          id,
          x: Math.floor(s.x||0), y: Math.floor(s.y||0),
          w: Math.floor(s.w||120), h: Math.floor(s.h||80),
          kind: s.kind || 'shop', like: s.like, price: s.price,
          cashbox: Math.floor(s.cashbox||0),
          ownerId: null, ownerUsername: username
        });
        haveShopIds.add(id);
      });
    }
  }catch(e){ console.warn('ensureAssetsLoadedFromUsers falló:', e?.message||e); }
}

// Vincular ownerId de assets a un jugador conectado por su username
function attachOwnerIdsForUsername(username, playerId){
  if(!username) return;
  const key = String(username).toLowerCase();
  for(const h of state.houses){ if((h.ownerUsername||'').toLowerCase()===key) h.ownerId = playerId||null; }
  for(const s of state.shops){ if((s.ownerUsername||'').toLowerCase()===key) s.ownerId = playerId||null; }
}

setInterval(() => {
  const payload = {
    players: Object.values(state.players),
    shops: state.shops,
    houses: state.houses,
    government: state.government
  };
  io.emit('state', payload);
}, 150);

// Trabajo automático: cada 6s todos ganan +15
setInterval(() => {
  for (const p of Object.values(state.players)) {
    p.money = (p.money || 0) + 15;
    p.updatedAt = now();
  }
}, 6000);

// Bots sencillos que deambulan (para siempre ver agentes)
// Nombres españoles simples
const MALE_NAMES = ['Carlos','Luis','Javier','Miguel','Andrés','José','Pedro','Diego','Sergio','Fernando','Juan','Víctor','Pablo','Eduardo','Hugo','Mario'];
const FEMALE_NAMES = ['María','Ana','Lucía','Sofía','Camila','Valeria','Paula','Elena','Sara','Isabella','Daniela','Carla','Laura','Diana','Andrea','Noelia'];
const LAST_NAMES = ['García','Martínez','López','González','Rodríguez','Pérez','Sánchez','Ramírez','Torres','Flores','Vargas','Castro','Romero','Navarro','Molina','Ortega'];
function randomPersonName(gender){
  const first = (gender==='F' ? FEMALE_NAMES : MALE_NAMES)[Math.floor(Math.random()*(gender==='F'?FEMALE_NAMES.length:MALE_NAMES.length))];
  const last = LAST_NAMES[Math.floor(Math.random()*LAST_NAMES.length)];
  return `${first} ${last}`;
}

function ensureBots(n = 3) {
  const existing = Object.values(state.players).filter(p => p.isBot);
  for (let i = existing.length; i < n; i++) {
    const id = 'B' + (i + 1);
    const gender = Math.random() > 0.5 ? 'M' : 'F';
    const speed = 120 + Math.random()*120; // 120-240
    state.players[id] = {
      id,
      socketId: null,
      code: randomPersonName(gender),
      x: Math.random() * 800 + 50,
  y: Math.random() * 500 + 50,
  money: 200,
      gender,
      avatar: null,
      isBot: true,
      vx: 0,
      vy: 0,
      speed,
      targetX: Math.random()*1800+100,
      targetY: Math.random()*1000+100,
      createdAt: now(),
      updatedAt: now()
    };
  }
}

function tickBots(bounds = { w: 2200, h: 1400 }) {
  const dt = 0.12; // ~120ms por tick
  for (const p of Object.values(state.players)) {
    if (!p.isBot) continue;
    // nuevo objetivo si llegó o por probabilidad
    const dx = (p.targetX ?? p.x) - (p.x || 0);
    const dy = (p.targetY ?? p.y) - (p.y || 0);
    const dist = Math.hypot(dx, dy);
    if (!isFinite(dist) || dist < 20 || Math.random() < 0.02) {
      p.targetX = Math.random() * bounds.w;
      p.targetY = Math.random() * bounds.h;
    }
    // velocidad deseada hacia el objetivo
    const ddx = (p.targetX - p.x);
    const ddy = (p.targetY - p.y);
    const d = Math.hypot(ddx, ddy) || 1;
    const nx = ddx / d, ny = ddy / d;
    const desiredVx = nx * (p.speed || 160);
    const desiredVy = ny * (p.speed || 160);
    // suavizado (lerp) + pequeño jitter para evitar movimiento robótico
    p.vx = (p.vx || 0) * 0.85 + desiredVx * 0.15 + (Math.random()*2-1)*4;
    p.vy = (p.vy || 0) * 0.85 + desiredVy * 0.15 + (Math.random()*2-1)*4;
    // actualizar posición
    p.x = Math.max(0, Math.min((p.x || 0) + p.vx * dt, bounds.w));
    p.y = Math.max(0, Math.min((p.y || 0) + p.vy * dt, bounds.h));
    // rebote en bordes ajustando objetivo
    if (p.x <= 0 || p.x >= bounds.w) { p.vx *= -0.6; p.targetX = Math.random() * bounds.w; }
    if (p.y <= 0 || p.y >= bounds.h) { p.vy *= -0.6; p.targetY = Math.random() * bounds.h; }
    p.updatedAt = now();
  }
}

// Movimiento para jugadores humanos inactivos, para que el mundo se sienta vivo.
function tickIdlePlayers(bounds = { w: 2200, h: 1400 }) {
  const dt = 0.12; // ~120ms por tick
  const idleTimeout = 3000; // 3 segundos de inactividad para empezar a moverse
  const currentTime = now();

  for (const p of Object.values(state.players)) {
    // Omitir bots (manejados por tickBots) y jugadores que han enviado actualizaciones recientemente.
    if (p.isBot || (currentTime - (p.lastUpdateFromClient || 0) < idleTimeout)) {
      continue;
    }

    // Lógica de movimiento aleatorio para jugadores inactivos
    if (typeof p.targetX !== 'number' || typeof p.targetY !== 'number' || Math.random() < 0.02) {
      p.targetX = Math.random() * bounds.w;
      p.targetY = Math.random() * bounds.h;
    }

    const dx = p.targetX - p.x;
    const dy = p.targetY - p.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 20) {
      p.targetX = Math.random() * bounds.w;
      p.targetY = Math.random() * bounds.h;
    }

    const speed = p.speed || 120;
    const nx = dx / (dist || 1);
    const ny = dy / (dist || 1);
    p.vx = (p.vx || 0) * 0.85 + nx * speed * 0.15;
    p.vy = (p.vy || 0) * 0.85 + ny * speed * 0.15;
    p.x = Math.max(0, Math.min((p.x || 0) + p.vx * dt, bounds.w));
    p.y = Math.max(0, Math.min((p.y || 0) + p.vy * dt, bounds.h));
    p.updatedAt = now();
  }
}

// Tick de movimiento automático para todos los jugadores
setInterval(() => {
  ensureBots(5); // Aseguramos que haya 5 bots
  tickBots({ w: 2200, h: 1400 });
  tickIdlePlayers({ w: 2200, h: 1400 });
}, 120);

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);
  socket._lastUpdate = 0;

  socket.on('createPlayer', (data, ack) => {
    const id = 'P' + (Math.random().toString(36).slice(2,9));
    const player = {
      id,
      socketId: socket.id,
      code: data.code || ('Player' + id),
      username: (data.username||'').trim() || null,
      x: data.x || 100,
      y: data.y || 100,
      money: (data.startMoney != null) ? data.startMoney : 200,
      gender: data.gender || 'M',
      avatar: data.avatar || null,
      createdAt: now(),
      updatedAt: now(),
      lastUpdateFromClient: now()
    };
    // Si viene username y hay saldo en TXT/usuarios, aplicarlo
    try{
      const bal = readBalancesTxt();
      const key = (player.username||'').toLowerCase();
      if(key && bal.has(key)){
        const b = bal.get(key);
        player.money = Math.floor(Number(b.money)||player.money||0);
      } else {
        // fallback: si existe en users.json, recuperar perfil
        const users = readUsers();
        const u = users.find(x=>x.username.toLowerCase()===key);
        if(u?.profile?.stats){
          if(typeof u.profile.stats.money === 'number') player.money = Math.floor(u.profile.stats.money);
        }
      }
    }catch(e){ }
    state.players[id] = player;
    socket.playerId = id;
  // Vincular ownerId de assets persistentes si el jugador tiene username
  try{ if(player.username) attachOwnerIdsForUsername(player.username, id); }catch(_){ }
    if (ack) ack({ ok: true, id });
    io.emit('playerJoined', player);
  });

  socket.on('update', (data) => {
    const t = Date.now();
    if (t - socket._lastUpdate < 80) return;
    socket._lastUpdate = t;
    const id = socket.playerId;
    if (!id || !state.players[id]) return;
    const p = state.players[id];
    if ('x' in data) p.x = data.x;
    if ('y' in data) p.y = data.y;
  if ('money' in data) p.money = data.money;
  if ('bank' in data) p.bank = data.bank;
    if ('vehicle' in data) p.vehicle = data.vehicle;
    p.updatedAt = now();
    p.lastUpdateFromClient = t;
  });

  socket.on('placeShop', (payload, ack) => {
    const id = 'S' + (state.shops.length + 1);
  const ownerUsername = (state.players[socket.playerId]?.username) || payload.ownerUsername || null;
  const shop = Object.assign({}, payload, { id, cashbox: 0, createdAt: now(), ownerUsername });
    state.shops.push(shop);
  if(ownerUsername){ try{ upsertUserAsset(ownerUsername, 'shop', shop); csvAppend('comprar_negocio', ownerUsername, `${shop.kind} en (${shop.x},${shop.y})`); }catch(_){} }
    io.emit('shopPlaced', shop);
    if (ack) ack({ ok: true, shop });
  });

  socket.on('placeHouse', (payload, ack) => {
    const id = 'H' + (state.houses.length + 1);
  const ownerUsername = (state.players[socket.playerId]?.username) || payload.ownerUsername || null;
  const house = Object.assign({}, payload, { id, createdAt: now(), ownerUsername });
    state.houses.push(house);
  if(ownerUsername){ try{ upsertUserAsset(ownerUsername, 'house', house); csvAppend('comprar_casa', ownerUsername, `(${house.x},${house.y}) ${house.w}x${house.h}`); }catch(_){} }
    io.emit('housePlaced', house);
    if (ack) ack({ ok: true, house });
  });

  socket.on('placeGov', (payload, ack) => {
    if ((state.government.funds || 0) < (payload.cost || 0)) {
      if (ack) ack({ ok:false, msg: 'Fondos insuficientes' });
      return;
    }
    state.government.funds -= payload.cost || 0;
    state.government.placed.push(payload);
  try{ writeGovernment(state.government); csvAppend('gob_colocar', 'GOBIERNO', `${payload.k||payload.label||'inst'} (${payload.x},${payload.y}) costo=${payload.cost||0}`); }catch(_){}
    io.emit('govPlaced', payload);
    if (ack) ack({ ok:true });
  });

  socket.on('disconnect', () => {
    const id = socket.playerId;
    if (id && state.players[id]) {
      delete state.players[id];
      io.emit('playerLeft', { id });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  // A la subida, aplicar balances del Excel (si existe)
  try{ applyBalancesToUsersAndState(); }catch(e){}
  // Cargar casas y negocios desde users.json
  try{ ensureAssetsLoadedFromUsers(); }catch(e){}
});