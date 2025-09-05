// server.js — servidor Express + socket.io (estado simple en memoria)
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const brain = require('./brain');

const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Silenciar el error de favicon.ico en la consola del navegador
app.get('/favicon.ico', (req, res) => res.status(204).send());

app.use(express.static(path.join(__dirname, 'public')));
// Exponer carpeta 'login' para imágenes de UI de autenticación
app.use('/login', express.static(path.join(__dirname, 'login')));
// Servir assets descargados
app.use('/game-assets', express.static(path.join(__dirname, 'game-assets')));
app.use(express.json());
app.use(cookieParser());

// Sesión simple via cookie firmada manualmente (sin exponer datos)
const SESS_COOKIE = 'sid';
const SESS_SECRET = process.env.SESS_SECRET || 'dev-secret-change-me';
function sign(val){ return val + '.' + crypto.createHmac('sha256', SESS_SECRET).update(val).digest('hex'); }
function unsign(signed){
  if(!signed || typeof signed !== 'string') return null;
  const i = signed.lastIndexOf('.'); if(i<0) return null; const val = signed.slice(0, i); const mac = signed.slice(i+1);
  const ok = crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(crypto.createHmac('sha256', SESS_SECRET).update(val).digest('hex')));
  return ok ? val : null;
}
function setSession(res, userId){ const v = sign(userId); res.cookie(SESS_COOKIE, v, { httpOnly:true, sameSite:'lax', maxAge: 1000*60*60*24*30 }); }
function clearSession(res){ res.clearCookie(SESS_COOKIE); }
function getSessionUserId(req){ const raw = req.cookies?.[SESS_COOKIE]; const uid = unsign(raw); return uid; }

// API de autenticación
app.post('/api/register', (req, res) => {
  try{
    const { username, password } = req.body || {};
    const out = brain.registerUser(username, password);
    if(!out.ok) return res.status(400).json(out);
    setSession(res, out.user.id);
    return res.json({ ok: true, user: out.user, progress: brain.getProgress(out.user.id) });
  }catch(e){ return res.status(500).json({ ok:false, msg:'Error' }); }
});

app.post('/api/login', (req, res) => {
  try{
    const { username, password } = req.body || {};
    const out = brain.verifyLogin(username, password);
    if(!out.ok) return res.status(401).json(out);
    setSession(res, out.user.id);
  // Restaurar saldo desde ledger (si existe snapshot)
  try{ brain.restoreMoneyFromLedger(out.user.id); }catch(e){}
  return res.json({ ok:true, user: out.user, progress: brain.getProgress(out.user.id) });
  }catch(e){ return res.status(500).json({ ok:false, msg:'Error' }); }
});

app.post('/api/logout', (req, res) => { try{ const uid = getSessionUserId(req); if(uid){ try{ brain.saveMoneySnapshot(uid, 'logout'); }catch(e){} } clearSession(res); return res.json({ ok:true }); }catch(e){ return res.status(500).json({ ok:false }); } });

app.get('/api/me', (req, res) => {
  const uid = getSessionUserId(req);
  if(!uid) return res.status(401).json({ ok:false });
  const user = brain.getUserById(uid);
  if(!user) return res.status(401).json({ ok:false });
  return res.json({ ok:true, user: { id:user.id, username:user.username }, progress: brain.getProgress(uid) });
});


app.post('/api/change-password', (req, res) => {
  const uid = getSessionUserId(req);
  if(!uid) return res.status(401).json({ ok:false, msg:'No autenticado' });
  const { newPassword } = req.body || {};
  if(typeof newPassword !== 'string' || newPassword.length < 8) return res.status(400).json({ ok:false, msg:'Contraseña inválida' });
  const out = brain.changePassword(uid, newPassword);
  if(!out.ok) return res.status(400).json(out);
  return res.json({ ok:true });
});

app.post('/api/progress', (req, res) => {
  const uid = getSessionUserId(req);
  if(!uid) return res.status(401).json({ ok:false });
  const out = brain.updateProgress(uid, req.body || {});
  return res.json(out);
});

// Proxy/cache sencillo de imágenes remotas (evita CORS/404 externos).
// GET /img/:key -> mapea por images.json; GET /img?url=...
const IMG_MAP = (()=>{ try{ return require('./images.json'); }catch(e){ return {}; } })();
const LOCAL_MAP = (()=>{ try{ return require('./game-assets/map.json'); }catch(e){ return {}; } })();
const fetch = (...args) => globalThis.fetch(...args);
app.get('/img/:key', async (req, res) => {
  try{
    const key = req.params.key;
    // Si existe localmente, servir archivo local
    const localPath = LOCAL_MAP[key] ? path.join(__dirname, LOCAL_MAP[key]) : null;
    if(localPath && fs.existsSync(localPath)){
      return res.sendFile(localPath);
    }
    const url = IMG_MAP[key];
    if(!url) return res.status(404).send('not found');
    const r = await fetch(url);
    if(!r.ok) return res.status(502).send('bad upstream');
    res.set('Cache-Control','public, max-age=86400');
    res.set('Content-Type', r.headers.get('content-type')||'image/png');
    r.body.pipe(res);
  }catch(e){ res.status(500).send('error'); }
});
app.get('/img', async (req, res) => {
  try{
    const url = req.query.url;
    if(!url) return res.status(400).send('missing url');
    const r = await fetch(url);
    if(!r.ok) return res.status(502).send('bad upstream');
    res.set('Cache-Control','public, max-age=86400');
    res.set('Content-Type', r.headers.get('content-type')||'image/png');
    r.body.pipe(res);
  }catch(e){ res.status(500).send('error'); }
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
      money: 400,
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
  // Asociar sesión si existe (sólo lectura de cookies del handshake)
  try{
    const cookie = socket.handshake.headers.cookie || '';
    const m = cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith(SESS_COOKIE+'='));
    if(m){
      const raw = decodeURIComponent(m.split('=')[1]||'');
      const uid = unsign(raw);
      if(uid){ socket.userId = uid; }
    }
  }catch(e){}

  socket.on('createPlayer', (data, ack) => {
    const id = 'P' + (Math.random().toString(36).slice(2,9));
    const player = {
      id,
      socketId: socket.id,
      code: data.code || ('Player' + id),
      x: data.x || 100,
      y: data.y || 100,
      money: (data.startMoney != null) ? data.startMoney : 400,
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
    if ('money' in data) {
      p.money = data.money;
  if(socket.userId){ try{ brain.setMoney(socket.userId, p.money, p.bank); brain.recordMoneyChange(socket.userId, brain.getUserById(socket.userId)?.username || null, 0, p.money, p.bank, 'tick'); }catch(e){} }
    }
  if ('bank' in data) p.bank = data.bank;
    if ('vehicle' in data) {
      p.vehicle = data.vehicle;
      if(socket.userId){
        try{
          brain.setVehicle(socket.userId, p.vehicle);
          // registrar vehículo como adquirido si no existía
          brain.addOwnedVehicle(socket.userId, p.vehicle);
        }catch(e){}
      }
    }
    p.updatedAt = now();
    p.lastUpdateFromClient = t;
  });

  socket.on('placeShop', (payload, ack) => {
    const id = 'S' + (state.shops.length + 1);
    const shop = Object.assign({}, payload, { id, cashbox: 0, createdAt: now() });
  state.shops.push(shop);
  // Persistir si el socket tiene usuario logueado
  if(socket.userId){ try{ brain.addShop(socket.userId, shop); }catch(e){} }
    io.emit('shopPlaced', shop);
    if (ack) ack({ ok: true, shop });
  });

  socket.on('placeHouse', (payload, ack) => {
    const id = 'H' + (state.houses.length + 1);
    const house = Object.assign({}, payload, { id, createdAt: now() });
  state.houses.push(house);
  if(socket.userId){ try{ brain.addHouse(socket.userId, house); }catch(e){} }
    io.emit('housePlaced', house);
    if (ack) ack({ ok: true, house });
  });

  // Restaurar ítems del progreso (coloca en el estado del servidor si faltan)
  socket.on('restoreItems', (payload, ack) => {
    try{
      const shops = Array.isArray(payload?.shops) ? payload.shops : [];
      const houses = Array.isArray(payload?.houses) ? payload.houses : [];
      const near = (a,b,eps=8)=> Math.abs((a||0)-(b||0))<=eps;
      const findShopSimilar = (s)=> state.shops.find(o => o && o.kind===s.kind && near(o.x,s.x,16) && near(o.y,s.y,16) && near(o.w,s.w,12) && near(o.h,s.h,12));
      const findHouseSimilar = (h)=> state.houses.find(o => o && near(o.x,h.x,16) && near(o.y,h.y,16) && near(o.w,h.w,12) && near(o.h,h.h,12));
      const ownerId = socket.playerId || null;

      for(const s of shops){
        if(!s) continue;
        if(findShopSimilar(s)) continue;
        const id = 'S' + (state.shops.length + 1);
        const shop = Object.assign({}, s, { id, ownerId: ownerId || s.ownerId || null, cashbox: s.cashbox || 0, createdAt: now() });
        state.shops.push(shop);
        io.emit('shopPlaced', shop);
      }
      for(const h of houses){
        if(!h) continue;
        if(findHouseSimilar(h)) continue;
        const id = 'H' + (state.houses.length + 1);
        const house = Object.assign({}, h, { id, ownerId: ownerId || h.ownerId || null, createdAt: now() });
        state.houses.push(house);
        io.emit('housePlaced', house);
      }
      if(ack) ack({ ok:true, shops: state.shops, houses: state.houses });
    }catch(e){ if(ack) ack({ ok:false }); }
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