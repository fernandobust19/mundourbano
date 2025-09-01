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

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Body parsers para API JSON/URL-encoded
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Silenciar el error de favicon.ico en la consola del navegador
app.get('/favicon.ico', (req, res) => res.status(204).send());

app.use(express.static(path.join(__dirname, 'public')));

// === Registro de usuarios (persistencia simple en archivo de texto JSONL) ===
const REG_DIR = path.join(__dirname, 'registro');
const REG_FILE = path.join(REG_DIR, 'usuarios.txt');
const REG_SPACE_FILE = path.join(REG_DIR, 'usuarios_space.txt'); // líneas legibles separadas por espacios

function ensureRegistro() {
  try { fs.mkdirSync(REG_DIR, { recursive: true }); } catch (e) {}
  try { if (!fs.existsSync(REG_FILE)) fs.writeFileSync(REG_FILE, '', 'utf8'); } catch (e) {}
  try { if (!fs.existsSync(REG_SPACE_FILE)) fs.writeFileSync(REG_SPACE_FILE, '', 'utf8'); } catch (e) {}
}
ensureRegistro();

function hashPassword(pw) {
  return crypto.createHash('sha256').update(String(pw)).digest('hex');
}

function appendJsonLine(obj){
  try {
    fs.appendFileSync(REG_FILE, JSON.stringify(obj) + '\n', 'utf8');
  } catch (e) {
    throw e;
  }
}

function appendSpaceLine(fields){
  try {
    const line = fields.map(v=> String(v).replace(/\s+/g,'_')).join(' ');
    fs.appendFileSync(REG_SPACE_FILE, line + '\n', 'utf8');
  } catch (e) {
    // no bloquear por errores del archivo legible
  }
}

function readAllUsersFile(){
  try{ return fs.readFileSync(REG_FILE, 'utf8'); }catch(e){ return ''; }
}

function findUserRecord(username){
  const content = readAllUsersFile();
  let base = null;
  for(const line of content.split(/\r?\n/)){
    if(!line.trim()) continue;
    try{
      const rec = JSON.parse(line);
      if(rec && rec.username === username && rec.passHash){ base = rec; }
    }catch(_){ /* skip */ }
  }
  return base;
}

function findLastProgress(username){
  const content = readAllUsersFile();
  let last = null;
  for(const line of content.split(/\r?\n/)){
    if(!line.trim()) continue;
    try{
      const rec = JSON.parse(line);
      if(rec && rec.type === 'progress' && rec.username === username){ last = rec; }
    }catch(_){ /* skip */ }
  }
  return last;
}

// POST /api/register { username, password }
app.post('/api/register', async (req, res) => {
  try {
    ensureRegistro();
    const username = (req.body?.username || '').trim();
    const password = String(req.body?.password || '');
  const deviceId = (req.body?.deviceId || '').trim() || null;
  const ua = req.headers['user-agent'] || '';

    if (!username || !password) {
      return res.status(400).json({ ok: false, msg: 'Usuario y contraseña son obligatorios.' });
    }
    if (username.length < 3 || username.length > 24) {
      return res.status(400).json({ ok: false, msg: 'El usuario debe tener entre 3 y 24 caracteres.' });
    }
    if (password.length < 4 || password.length > 64) {
      return res.status(400).json({ ok: false, msg: 'La contraseña debe tener entre 4 y 64 caracteres.' });
    }

    // Comprobar si ya existe
    let exists = false;
    try {
      const content = fs.readFileSync(REG_FILE, 'utf8');
      for (const line of content.split(/\r?\n/)) {
        if (!line.trim()) continue;
        try {
          const rec = JSON.parse(line);
          if (rec && rec.username === username) { exists = true; break; }
        } catch (_) {}
      }
    } catch (e) {}

    if (exists) {
      return res.status(409).json({ ok: false, msg: 'El usuario ya existe.' });
    }

    const record = {
      username,
      passHash: hashPassword(password),
      createdAt: new Date().toISOString(),
      ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null,
      deviceId,
      ua
    };
    try {
      appendJsonLine(record);
      appendSpaceLine(['REGISTER', record.createdAt, username, deviceId||'-', record.ip||'-']);
    } catch (e) {
      return res.status(500).json({ ok: false, msg: 'No se pudo guardar el registro.' });
    }

    res.json({ ok: true, username });
  } catch (err) {
    console.error('register error', err);
    res.status(500).json({ ok: false, msg: 'Error interno.' });
  }
});

// POST /api/register-character { username, character: { name, likes[], avatar } }
app.post('/api/register-character', async (req, res) => {
  try {
    ensureRegistro();
    const username = (req.body?.username || '').trim();
    const character = req.body?.character || {};
    const chName = (character?.name || '').trim();
    const likes = Array.isArray(character?.likes) ? character.likes.slice(0, 12) : [];
    const avatar = character?.avatar || null;
    const deviceId = (req.body?.deviceId || '').trim() || null;

    if (!username) {
      return res.status(400).json({ ok: false, msg: 'username requerido.' });
    }
    if (!chName) {
      return res.status(400).json({ ok: false, msg: 'Nombre de personaje requerido.' });
    }

    const record = {
      username,
      character: { name: chName, likes, avatar },
      createdAt: new Date().toISOString(),
      ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null,
      deviceId
    };
    try {
      appendJsonLine(record);
      appendSpaceLine(['CHAR', record.createdAt, username, deviceId||'-', chName, (likes||[]).slice(0,5).join(',')||'-']);
    } catch (e) {
      return res.status(500).json({ ok: false, msg: 'No se pudo guardar el personaje.' });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('register-character error', err);
    res.status(500).json({ ok: false, msg: 'Error interno.' });
  }
});

// POST /api/login { username, password, deviceId? }
app.post('/api/login', async (req, res) => {
  try{
    ensureRegistro();
    const username = (req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    const deviceId = (req.body?.deviceId || '').trim() || null;
    if(!username || !password){ return res.status(400).json({ ok:false, msg:'Usuario y contraseña requeridos.' }); }

    const userRec = findUserRecord(username);
    if(!userRec){ return res.status(404).json({ ok:false, msg:'Usuario no encontrado.' }); }
    const passOk = userRec.passHash === hashPassword(password);
    if(!passOk){ return res.status(401).json({ ok:false, msg:'Credenciales inválidas.' }); }

    const last = findLastProgress(username);
    const payload = { ok:true, username, state: last?.state || null, lastSavedAt: last?.ts || null };
    appendSpaceLine(['LOGIN', new Date().toISOString(), username, deviceId||'-', 'OK']);
    return res.json(payload);
  }catch(err){
    console.error('login error', err);
    return res.status(500).json({ ok:false, msg:'Error interno.' });
  }
});

// POST /api/save { username, deviceId, socketId?, port?, state }
app.post('/api/save', async (req, res) => {
  try{
    ensureRegistro();
    const username = (req.body?.username || '').trim();
    const deviceId = (req.body?.deviceId || '').trim() || null;
    const socketId = (req.body?.socketId || '').trim() || null;
    const port = (req.body?.port || '').toString() || null;
    const state = req.body?.state || null;
    if(!username || !state){ return res.status(400).json({ ok:false, msg:'username y state requeridos.' }); }

    const rec = {
      type: 'progress',
      username,
      deviceId,
      socketId,
      port,
      state,
      ts: new Date().toISOString(),
      ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null
    };
    appendJsonLine(rec);
    const summary = [
      'SAVE', rec.ts, username, deviceId||'-',
      `money=${Math.floor(Number(state?.money||0))}`,
      `shops=${Array.isArray(state?.shopsOwned)?state.shopsOwned.length:0}`,
      `houses=${Array.isArray(state?.housesOwned)?state.housesOwned.length:0}`,
      `vehicle=${state?.vehicle||'-'}`
    ];
    appendSpaceLine(summary);
    return res.json({ ok:true });
  }catch(err){
    console.error('save error', err);
    return res.status(500).json({ ok:false, msg:'Error interno.' });
  }
});

const state = {
  players: {},
  shops: [],
  houses: [],
  government: { funds: 10000, placed: [] }
};

function now() { return Date.now(); }

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
      x: data.x || 100,
      y: data.y || 100,
  money: (data.startMoney != null) ? data.startMoney : 200,
      gender: data.gender || 'M',
      avatar: data.avatar || null,
      createdAt: now(),
      updatedAt: now(),
      lastUpdateFromClient: now()
    };
    state.players[id] = player;
    socket.playerId = id;
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
    const shop = Object.assign({}, payload, { id, cashbox: 0, createdAt: now() });
    state.shops.push(shop);
    io.emit('shopPlaced', shop);
    if (ack) ack({ ok: true, shop });
  });

  socket.on('placeHouse', (payload, ack) => {
    const id = 'H' + (state.houses.length + 1);
    const house = Object.assign({}, payload, { id, createdAt: now() });
    state.houses.push(house);
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
});