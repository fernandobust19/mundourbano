// Archivo restaurado: sin <script> ni IIFE innecesario
const $ = s => document.querySelector(s);
const show = (el, on=true)=>{
  if(!el) return;
  try{
    if(el.id === 'uiDock'){
      if(on){ el.classList.remove('collapsed'); el.style.display='flex'; }
      else { el.classList.add('collapsed'); setTimeout(()=>{ if(el.classList.contains('collapsed')) el.style.display='none'; }, 280); }
      return;
    }
    el.style.display = on? 'flex':'none';
  }catch(e){ console.warn('show() error', e); }
};
const toastLimiter = { last: 0, gap: 400 };
const toast = (msg)=>{
  const now = performance.now();
  if (now - toastLimiter.last < toastLimiter.gap) return;
  toastLimiter.last = now;
  const _t = document.querySelector('#toast');
  if(_t){ _t.textContent=msg; _t.style.display='block'; clearTimeout(toast._id); toast._id=setTimeout(()=>_t.style.display='none',2400); }
};

window.addEventListener('error', e => { try{toast('⚠️ Error: '+(e.message||'JS'));}catch(_){} });
window.addEventListener('unhandledrejection', e => { try{toast('⚠️ Promesa: '+(e.reason?.message||'error'));}catch(_){} });

// Red: helpers para multijugador (placeholders; inicialización real más abajo)
const hasNet = () => !!(window.sock && window.sock.connected);
let __lastNetSend = 0;
let __lastSentState = { x: -1, y: -1, money: -1 };

// ====== SUAVIZADO REMOTO (nuevo) ======
const REMOTE = {
  BUFFER: {}, SMOOTH: {}, STATS: {},
  BASE_DELAY: 110, DELAY_MAX: 170, EXTRA_GUARD: 10,
  MAX_BUF: 24, K: 18.0, DEADZONE: 0.18
};

/* ===== FORMULARIO ===== */
const formBar = $("#formBar"), fName=$("#fName"), fUsd=$("#fUsd");
const fGenderPreview = { get src(){ return document.getElementById('uiAvatar')?.src; }, set src(v){ try{ const img=document.getElementById('uiAvatar'); if(img) img.src=v; }catch(e){} } };
const MALE_IMG = 'https://i.postimg.cc/x8cc0drr/20250820-102743.png';
const FEMALE_IMG = 'https://i.postimg.cc/C1vRTqQH/20250820-103145.png';
const MALE_IMG_2 = 'https://i.postimg.cc/vHf2KjGK/20250831_015656.png';
const FEMALE_IMG_2 = 'https://i.postimg.cc/hjZ1J8cT/20250831_015636.png';

// Avatar grid clickable thumbnails
const avatarGrid = document.getElementById('avatarGrid');
function clearAvatarSelection(){ if(!avatarGrid) return; avatarGrid.querySelectorAll('.avatar-option').forEach(b=>b.classList.remove('selected')); }
if(avatarGrid){
  avatarGrid.addEventListener('click', (ev)=>{
    const btn = ev.target.closest('.avatar-option'); if(!btn) return;
    const src = btn.getAttribute('data-src');
    if(!src) return;
    clearAvatarSelection(); btn.classList.add('selected');
    try{ fGenderPreview.src = src; document.getElementById('uiAvatar').src = src; }catch(e){}
  });
  const first = avatarGrid.querySelector('.avatar-option');
  if(first){
    first.classList.add('selected');
    const src = first.getAttribute('data-src');
    if(src){ try{ fGenderPreview.src = src; document.getElementById('uiAvatar').src = src; }catch(e){} }
  }
}
function updateGenderPreview(){
  try{
    const selBtn = document.querySelector('#avatarGrid .avatar-option.selected');
    const chosen = selBtn && selBtn.getAttribute('data-src');
    fGenderPreview.src = chosen || MALE_IMG;
  }catch(e){}
}
updateGenderPreview();

const btnStart=$("#btnStart"), btnRandLikes=$("#btnRandLikes"), errBox=$("#errBox");

// === Registro simple (frontend) ===
const registerModal = document.getElementById('registerModal');
const regUser = document.getElementById('regUser');
const regPass = document.getElementById('regPass');
const regErr = document.getElementById('regErr');
const btnDoRegister = document.getElementById('btnDoRegister');
const LS_KEY = 'mu_registered_user_v1';
const btnDoLogin = document.getElementById('btnDoLogin');
const loginHint = document.getElementById('loginHint');
const LS_PROGRESS = 'mu_progress_v1';
const DEVICE_KEY = 'mu_device_id_v1';
function getDeviceId(){
  try{
    let id = localStorage.getItem(DEVICE_KEY);
    if(!id){ id = 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem(DEVICE_KEY, id); }
    return id;
  }catch(e){ return null; }
}
function isRegistered(){ try{ const raw = localStorage.getItem(LS_KEY); if(!raw) return false; const obj = JSON.parse(raw); return !!obj?.username; }catch(e){ return false; } }
function setRegistered(username){ try{ localStorage.setItem(LS_KEY, JSON.stringify({ username, at: Date.now() })); }catch(e){} }
function getRegistered(){ try{ const raw = localStorage.getItem(LS_KEY); return raw? JSON.parse(raw): null; }catch(e){ return null; } }

async function doRegister(){
  const u = (regUser?.value||'').trim();
  const p = String(regPass?.value||'');
  if(!u || !p){ if(regErr){ regErr.textContent='Ingresa usuario y contraseña.'; regErr.style.display='block'; } return; }
  try{
    if(btnDoRegister) btnDoRegister.disabled = true;
    const resp = await fetch('/api/register', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username: u, password: p, deviceId: getDeviceId() }) });
    const data = await resp.json().catch(()=>({ ok:false, msg:'Respuesta inválida.' }));
    if(!resp.ok || !data?.ok){ throw new Error(data?.msg || 'No se pudo registrar.'); }
    setRegistered(data.username || u);
    if(registerModal) registerModal.style.display = 'none';
    toast('Registro exitoso. ¡Bienvenido!');
  }catch(err){ if(regErr){ regErr.textContent = err.message || 'Error de registro.'; regErr.style.display='block'; } }
  finally{ if(btnDoRegister) btnDoRegister.disabled = false; }
}
if(btnDoRegister) btnDoRegister.addEventListener('click', doRegister);

async function doLogin(){
  const u = (regUser?.value||'').trim();
  const p = String(regPass?.value||'');
  if(!u || !p){ if(regErr){ regErr.textContent='Ingresa usuario y contraseña.'; regErr.style.display='block'; } return; }
  try{
    if(btnDoLogin) btnDoLogin.disabled = true;
    const resp = await fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username: u, password: p, deviceId: getDeviceId() }) });
    const data = await resp.json().catch(()=>({ ok:false, msg:'Respuesta inválida.' }));
    if(!resp.ok || !data?.ok){ throw new Error(data?.msg || 'No se pudo iniciar sesión.'); }
    setRegistered(data.username || u);
    try{ if(data.state){ localStorage.setItem(LS_PROGRESS, JSON.stringify(data.state)); } }catch(e){}
    if(registerModal) registerModal.style.display = 'none';
    if(loginHint){ const when = data.lastSavedAt ? new Date(data.lastSavedAt).toLocaleString() : 'sin guardados previos'; loginHint.textContent = `Inicio de sesión correcto (${when}).`; loginHint.style.display='block'; }
    toast('Inicio de sesión exitoso.');
  }catch(err){ if(regErr){ regErr.textContent = err.message || 'Error al iniciar sesión.'; regErr.style.display='block'; } }
  finally{ if(btnDoLogin) btnDoLogin.disabled = false; }
}
if(btnDoLogin) btnDoLogin.addEventListener('click', doLogin);

// bloquear UI de creación hasta estar registrado
(function initRegisterGate(){
  if(!isRegistered()){
    if(registerModal) registerModal.style.display = 'flex';
    if(btnStart) btnStart.disabled = true;
  } else {
    if(registerModal) registerModal.style.display = 'none';
  }
})();

const likesWrap=$("#likesWrap"), likesCount=$("#likesCount");
const getBoxes=()=> Array.from(likesWrap.querySelectorAll('input[type="checkbox"]'));
const getChecked=()=> getBoxes().filter(x=>x.checked);
function updateLikesUI(){
  const count = getChecked().length;
  likesCount.textContent = count;
  const disableOthers = count >= 5;
  getBoxes().forEach(cb=>{
    if(!cb.checked){
      cb.disabled = disableOthers;
      cb.closest('.chip')?.classList.toggle('disabled', disableOthers);
    }else{
      cb.disabled = false;
      cb.closest('.chip')?.classList.remove('disabled');
    }
  });
  const nameOk = fName && fName.value.trim().length > 0;
  const regOk = isRegistered();
  if (btnStart) btnStart.disabled = !(nameOk && count === 5 && regOk);
}

/* ===== Duplicate block removed to prevent redeclarations ===== */

  function makeBarriosYCasas(totalNeeded, urbanArea, avoidList = []) {
    barrios.length = 0;
    houses.length = 0;
    cityBlocks.length = 0;

    // Casas en 4 barrios organizados simétricamente
    barrios.length = 0; 
    houses.length = 0; 
    cityBlocks.length = 0;

    const barrioMargin = 40; // Margen desde los bordes
    const barrioSize = {
      w: 380, 
      h: 320
    };

    // Posiciones más simétricas para los barrios
    const barriosPos = [
      {x: barrioMargin, y: barrioMargin}, // Noroeste
      {x: WORLD.w - barrioSize.w - barrioMargin, y: barrioMargin}, // Noreste
      {x: barrioMargin, y: WORLD.h - barrioSize.h - barrioMargin}, // Suroeste
      {x: WORLD.w - barrioSize.w - barrioMargin, y: WORLD.h - barrioSize.h - barrioMargin} // Sureste
    ];

    // Crear los barrios equidistantes
    for(let i=0; i<4; i++){
      const b = {
        ...barriosPos[i], 
        w: barrioSize.w, 
        h: barrioSize.h, 
        name: `Barrio ${i+1}`
      };
      barrios.push(b);
      cityBlocks.push(b);
    }
    // Distribuir casas en los 4 barrios con tamaños variables más grandes
    const pad = 24; // Aumentado padding de 18 a 24 para más espacio
    let totalMade = 0;
    const housesPerBarrio = Math.ceil(totalNeeded / barrios.length);
    for (const b of barrios) {
      let madeInThisBarrio = 0;
      // Usar tamaños variables: 60-90 píxeles para variar como otras edificaciones
      const minHouseSize = 60, maxHouseSize = 90;
      const colsH = Math.max(4, Math.floor((b.w - pad * 2) / (maxHouseSize + 15))); // Ajustado para tamaños mayores
      const rowsH = Math.max(3, Math.floor((b.h - pad * 2) / (maxHouseSize + 15)));
      for (let ry = 0; ry < rowsH && madeInThisBarrio < housesPerBarrio && totalMade < totalNeeded; ry++) {
        for (let rx = 0; rx < colsH && madeInThisBarrio < housesPerBarrio && totalMade < totalNeeded; rx++) {
          // Tamaño aleatorio para cada casa (como fábricas o bancos)
          const hsize = srandi(minHouseSize, maxHouseSize);
          const hx = b.x + pad + rx * (maxHouseSize + 15); // Usar max para espaciado consistente
          const hy = b.y + pad + ry * (maxHouseSize + 15);
          const newH = { x: hx, y: hy, w: hsize, h: hsize, ownerId: null, rentedBy: null };
          if ([...avenidas, ...roundabouts].some(av => rectsOverlapWithMargin(av, newH, 8))) continue;
          houses.push(newH);
          totalMade++; madeInThisBarrio++;
        }
      }
    }
  }

  function buildAvenidas(urbanArea, avoidRect = null){
    avenidas.length=0; roundabouts.length=0;
    const avW=26;
    const vDivs = 4, hDivs = 3;
    const vPoints = [], hPoints = [];
    for (let i = 1; i < vDivs; i++) vPoints.push(urbanArea.x + Math.floor(urbanArea.w * i / vDivs));
    for (let i = 1; i < hDivs; i++) hPoints.push(urbanArea.y + Math.floor(urbanArea.h * i / hDivs));
    for (const vx of vPoints) avenidas.push({x:vx-avW/2, y:urbanArea.y, w:avW, h:urbanArea.h});
    for (const hy of hPoints) avenidas.push({x:urbanArea.x, y:hy-avW/2, w:urbanArea.w, h:avW});
    for (const vx of vPoints) for (const hy of hPoints) {
      if (Math.random() > 0.6) continue;
      const rRadius = randi(50, 85);
      const newRoundabout = {x:vx-rRadius, y:hy-rRadius, w:rRadius*2, h:rRadius*2, cx:vx, cy:hy};
      if (avoidRect && rectsOverlap(newRoundabout, avoidRect)) continue;
      roundabouts.push(newRoundabout);
    }
  }

  function regenInfrastructure(preserveHouses=false){
    streets.length=factories.length=banks.length=malls.length=0; government.placed.length=0;
    if(!preserveHouses){ houses.length=0; barrios.length=0; }

    // --- Semilla fija para el mundo ---
    setSeed(20250824);

    // Gobierno en el centro
    const parkW = 220, parkH = 140, parkGap = 24;
    const govComplexW = government.w + 2 * parkW + 2 * parkGap;
    const govComplexH = government.h + 2 * parkH + 2 * parkGap;
    const govComplexRect = {
        x: WORLD.w / 2 - govComplexW / 2,
        y: WORLD.h / 2 - govComplexH / 2,
        w: govComplexW,
        h: govComplexH
    };
    buildAvenidas({x:0, y:0, w:WORLD.w, h:WORLD.h}, govComplexRect);

    // Posicionar el gobierno
    government.x = govComplexRect.x + parkW + parkGap;
    government.y = govComplexRect.y + parkH + parkGap;
    // Agregar el edificio de gobierno como imagen
    government.placed.push({
      k: 'gobierno',
      label: 'Gobierno',
      x: government.x,
      y: government.y,
      w: government.w,
      h: government.h
    });
    
    // Distribuir parques más pequeños por el mapa
    const parkType = GOV_TYPES.find(t=>t.k==='parque');
    if(parkType) {
      const parksCount = (CFG && typeof CFG.PARKS === 'number') ? CFG.PARKS : 4;
      // Definir tamaños más pequeños para los parques
      const smallParkW = 100; // reducido de ~220
      const smallParkH = 70;  // reducido de ~140
      const mediumParkW = 120;
      const mediumParkH = 85;
      
      // Crear lista de áreas a evitar
      const avoidList = [
        government,
        cemetery,
        ...avenidas,
        ...roundabouts,
        ...houses,
        ...barrios,
        // Área de exclusión alrededor del gobierno (margen extra)
        { x: government.x - 160, y: government.y - 160, w: government.w + 320, h: government.h + 320 }
      ];
      const parkLocations = scatterRects(
        parksCount, 
        [smallParkW, mediumParkW], 
        [smallParkH, mediumParkH], 
        avoidList, 
        null, 
        120 // margen entre parques
      );
      
      // Iconos variados para los parques
      const parkIcons = [
        '🌳🌲', '🌲🌳', '🌴🌳', '🌳🌴', 
        '🌲🌴', '🌴🌲', '🌳', '🌲', '🌴'
      ];
      
      // Agregar parques al mapa con variedad de iconos
      parkLocations.forEach((park, i) => {
        const randomIcon = parkIcons[Math.floor(Math.random() * parkIcons.length)];
        
        government.placed.push({
          ...parkType,
          x: park.x,
          y: park.y,
          w: park.w,
          h: park.h,
          icon: randomIcon,
          fill: '#22c55e',
          stroke: '#166534',
          label: `Parque ${i+1}`
        });
      });
  try{
        const bibliotecaType = GOV_TYPES.find(t => t.k === 'biblioteca');
        if (bibliotecaType) {
          const libs = scatterRects(
            4,
            [bibliotecaType.w, bibliotecaType.w],
            [bibliotecaType.h, bibliotecaType.h],
            avoidList,
            null,
            100
          );
          libs.forEach((b, idx) => {
            government.placed.push({ ...bibliotecaType, ...b, label: `Biblioteca ${idx + 1}` });
          });
          // añadir bibliotecas a la lista de evitación
          avoidList.push(...libs);
        }
      } catch (e) {
        console.warn('Error placing bibliotecas', e);
      }
      // Eliminar explícitamente 'Parque 8' si existe
      for (let i = government.placed.length - 1; i >= 0; i--) {
        const it = government.placed[i];
        if (it && typeof it.label === 'string' && it.label.trim() === 'Parque 8') {
          government.placed.splice(i, 1);
        }
      }
      
      // Agregar un parque grande especial en una zona alejada del mapa
      const bigParkLocation = scatterRects(
        1, 
        [160, 160], 
        [120, 120], 
        [...avoidList, ...parkLocations], 
        null, 
        150
      );
      
      if (bigParkLocation.length > 0) {
        government.placed.push({
          ...parkType,
          x: bigParkLocation[0].x,
          y: bigParkLocation[0].y,
          w: bigParkLocation[0].w,
          h: bigParkLocation[0].h,
          icon: '🌳🌲🌴',
          fill: '#15803d', // verde más intenso
          stroke: '#166534',
          label: 'Parque Central'
        });
      }
      
      // Agregar estos parques a la lista de evitación para otras estructuras
      avoidList.push(...parkLocations);
      if (bigParkLocation.length > 0) avoidList.push(bigParkLocation[0]);

      // Eliminar parques situados en la esquina inferior derecha (no queremos parque allí)
      const parkCornerThreshold = 100; // px desde borde
      for (let i = government.placed.length - 1; i >= 0; i--) {
        const g = government.placed[i];
        if (g && g.k === 'parque') {
          if ((g.x + (g.w || 0) > WORLD.w - parkCornerThreshold) && (g.y + (g.h || 0) > WORLD.h - parkCornerThreshold)) {
            government.placed.splice(i, 1);
          }
        }
      }
    }

    // Cementerio alejado (esquina inferior derecha)
    cemetery.x = WORLD.w - cemetery.w - 40;
    cemetery.y = WORLD.h - cemetery.h - 40;

    // Llamar a la función para crear barrios y casas (sin duplicación)
    if (!preserveHouses) {
      makeBarriosYCasas(CFG.N_INIT + 24, {x: 0, y: 0, w: WORLD.w, h: WORLD.h}, []);
    }

    // Crear lista de evitación actualizada (después de crear casas)
    let avoidList = [government, ...avenidas, ...roundabouts, ...government.placed, ...houses, ...barrios];
    // Cementerio ya posicionado
    avoidList.push(cemetery);

    // Eliminar la avenida/calle que cruza por debajo del gobierno (horizontal central)
    // Buscar la avenida horizontal más cercana al centro vertical del gobierno
    const govY = government.y + government.h/2;
    for(let i=avenidas.length-1;i>=0;i--){
      const av = avenidas[i];
      if(av.w > av.h && Math.abs((av.y+av.h/2)-govY) < 40){
        avenidas.splice(i,1);
      }
    }

    // Escuelas y hospitales cerca del centro, iconos grandes
  // Asegurar que no se coloquen más de 1 estadio en total (conteo defensivo)
  // declarar el contador aquí antes de usarlo
  let estadioTotalCount = 0;
  const initialGovTypes = ['escuela', 'hospital', 'policia'];
  for(const typeKey of initialGovTypes) {
  if (typeKey === 'estadio' && estadioTotalCount >= 1) continue;
    const type = GOV_TYPES.find(t => t.k === typeKey);
    if(type) {
      const newBuildings = scatterRects(2, [type.w, type.w], [type.h, type.h], avoidList, null, 50);
      newBuildings.forEach(b => {
        government.placed.push({...type, ...b, icon: type.icon.repeat(3)});
  if (type.k === 'estadio') estadioTotalCount++;
      });
      avoidList.push(...newBuildings);
    }
  }

    // Negocios y fábricas con distribución organizada
    const sameTypeDist = 120; // Aumentado para garantizar más separación
    const urbanZones = [
      {x: 100, y: 100, w: WORLD.w/2 - 200, h: WORLD.h/2 - 200},
      {x: WORLD.w/2 + 100, y: 100, w: WORLD.w/2 - 200, h: WORLD.h/2 - 200},
      {x: 100, y: WORLD.h/2 + 100, w: WORLD.w/2 - 200, h: WORLD.h/2 - 200},
      {x: WORLD.w/2 + 100, y: WORLD.h/2 + 100, w: WORLD.w/2 - 200, h: WORLD.h/2 - 200}
    ];

    // Distribuir fábricas ordenadamente
    const factoryPositions = distributeEvenly(
      CFG.FACTORIES,
      [140, 180],
      [90, 120],
      avoidList,
      urbanZones[0],
      sameTypeDist
    );
    factories.push(...factoryPositions);
    // Filtrar fábricas con tamaño fuera del rango (defensa contra tamaños raros)
    const filteredFactories = factories.filter(f => {
      const wOk = f.w >= 120 && f.w <= 200;
      const hOk = f.h >= 70 && f.h <= 140;
      return wOk && hOk;
    });

    // Asegurar separación entre fábricas (misma clase): no dejar dos fábricas muy cercanas
    const minFactorySeparation = 140; // px
    const finalFactories = [];
    for (const f of filteredFactories) {
      const tooClose = finalFactories.some(existing => rectsOverlapWithMargin(existing, f, minFactorySeparation));
      if (!tooClose) finalFactories.push(f);
    }

    // Reemplazar factories con el set finalizado
    factories.length = 0; factories.push(...finalFactories);
    avoidList.push(...factories);

    // Distribuir bancos ordenadamente
    const bankPositions = distributeEvenly(
      CFG.BANKS,
      [110, 140],
      [70, 90],
      avoidList,
      urbanZones[1],
      sameTypeDist
    );
    if (bankPositions.length > 0) { bankPositions[bankPositions.length - 1].isFuchsia = true; }
    banks.push(...bankPositions);
    avoidList.push(...banks);

    // Distribuir centros comerciales ordenadamente
    const mallPositions = distributeEvenly(
      CFG.MALLS,
      [110, 140],
      [75, 95],
      avoidList,
      urbanZones[2],
      sameTypeDist
    );
    malls.push(...mallPositions);
    avoidList.push(...malls);
    // --- Remove specific items per user request ---
    try{
      // Remove 'Biblioteca 3' if it was added
      for (let i = government.placed.length - 1; i >= 0; i--) {
        const it = government.placed[i];
        if (it && typeof it.label === 'string' && it.label.trim() === 'Biblioteca 3') {
          government.placed.splice(i, 1);
        }
      }

      // Remove any mall located in the bottom-left corner of the world
      const removedMalls = [];
      for (let i = malls.length - 1; i >= 0; i--) {
        const m = malls[i];
        if (!m) continue;
        const c = centerOf(m);
        // bottom-left heuristic: x in left 25% and y in bottom 25%
        if (c.x < WORLD.w * 0.25 && c.y > WORLD.h * 0.75) {
          removedMalls.push(m);
          malls.splice(i, 1);
        }
      }
      // Remove removed malls from avoidList as well
      if (removedMalls.length > 0) {
        for (const rm of removedMalls) {
          const idx = avoidList.indexOf(rm);
          if (idx !== -1) avoidList.splice(idx, 1);
        }
        console.log('Removed malls in bottom-left corner:', removedMalls.length);
      }
    }catch(e){ console.warn('Error removing requested items', e); }

    // Distribuir instituciones gubernamentales uniformemente
  const govTypes = ['escuela', 'hospital', 'policia', 'estadio', 'central_electrica', 'bomberos'];
    const placedGovBuildings = [];
    let zoneIndex = 3; // Comenzamos con la última zona

    for(const typeKey of govTypes) {
      // Si la clave es 'estadio' y ya alcanzamos el límite, saltarla
  if (typeKey === 'estadio' && estadioTotalCount >= 1) continue;
      const type = GOV_TYPES.find(t => t.k === typeKey);
      if(type) {
        // Nota: no incrementamos aún; lo haremos después de colocar realmente el/los estadios
        const zone = urbanZones[zoneIndex % urbanZones.length];
        zoneIndex++;
        
        let positions = [];
        // Si es estadio, intentar ubicar un solo estadio (preferir esquina inferior izquierda)
        if (type.k === 'estadio') {
          const w = type.w, h = type.h;
          const marginCorner = 60; // margen inicial para la esquina

          // helper: probar colocar en rect (con pequeño retroceso interior si colisiona)
          const tryPlaceRect = (x0, y0) => {
            const maxShift = 6; // intentos
            const step = 40; // px por intento
            for (let i = 0; i < maxShift; i++) {
              const x = x0 + i * step; // desplazar hacia el interior a la derecha
              const y = y0 - i * step; // desplazar hacia el interior hacia arriba
              const rect = { x: Math.max(10, Math.min(x, WORLD.w - w - 10)), y: Math.max(10, Math.min(y, WORLD.h - h - 10)), w, h };
              const collides = [...avoidList, ...placedGovBuildings].some(a => rectsOverlapWithMargin(rect, a, 50));
              if (!collides) return rect;
            }
            return null;
          };

          // Intentar forzar el estadio en la esquina inferior izquierda (SW)
          const swX = marginCorner;
          const swY = WORLD.h - h - marginCorner;
          const r = tryPlaceRect(swX, swY);
          if (r) {
            positions = [r];
          } else {
            // fallback: encontrar un solo lugar por distribución
            positions = distributeEvenly(
              1,
              [type.w, type.w],
              [type.h, type.h],
              [...avoidList, ...placedGovBuildings],
              zone,
              sameTypeDist
            );
          }
        } else {
          positions = distributeEvenly(
            2, // Dos de cada tipo
            [type.w, type.w],
            [type.h, type.h],
            [...avoidList, ...placedGovBuildings],
            zone,
            sameTypeDist
          );
        }

        positions.forEach(pos => {
          const govBuilding = {...type, ...pos, icon: type.icon.repeat(3)};
          government.placed.push(govBuilding);
          placedGovBuildings.push(govBuilding);
        });
        // Si hemos colocado estadios, aumentar el contador para evitar más colocaciones
        if (type.k === 'estadio' && positions && positions.length > 0) {
          estadioTotalCount += positions.length;
        }
      }
    }

    // Agregar todos los edificios gubernamentales a la lista de evitación
    avoidList.push(...placedGovBuildings);

    // --- Garantizar que no haya solapamientos entre casas, parques y edificaciones ---
    function tryShiftRect(rect, others, margin) {
      const step = 20;
      const maxRadius = 600;
      for (let r = step; r <= maxRadius; r += step) {
        // probar 8 direcciones alrededor
        const dirs = [[r,0],[-r,0],[0,r],[0,-r],[r,r],[-r,-r],[r,-r],[-r,r]];
        for (const d of dirs) {
          const nx = Math.max(5, Math.min(WORLD.w - rect.w - 5, rect.x + d[0]));
          const ny = Math.max(5, Math.min(WORLD.h - rect.h - 5, rect.y + d[1]));
          const cand = {x: nx, y: ny, w: rect.w, h: rect.h};
          const coll = others.some(o => o !== rect && rectsOverlapWithMargin(cand, o, margin));
          if (!coll) { rect.x = nx; rect.y = ny; return true; }
        }
      }
      return false;
    }

    // Mover un edificio fuera de la calle/avenida si su centro está sobre una vía
    function moveBuildingOffRoad(label){
      try{
        if(!label) return false;
        const needle = (''+label).toString().trim().toLowerCase();
        const lists = [...government.placed, ...shops, ...factories, ...banks, ...malls, ...houses];
        const allOthers = [...government.placed, ...shops, ...factories, ...banks, ...malls, ...houses];
        const isOnAnyRoad = (rect) => {
          const c = centerOf(rect);
          for(const r of [...avenidas, ...roadRects]){ if(inside(c, r)) return true; }
          for(const ra of roundabouts){ const d = Math.hypot(c.x - ra.cx, c.y - ra.cy); if(d < ra.w/2) return true; }
          return false;
        };

        for(const it of lists){
          if(!it) continue;
          const lab = (it.label || it.k || it.kind || it.type || '').toString().trim().toLowerCase();
          if(lab !== needle) continue;
          // if already moved before, skip
          if(it.__movedOffRoad) return true;
          if(!isOnAnyRoad(it)) { it.__movedOffRoad = true; return true; }
          // try simple shifts first
          if(tryShiftRect(it, allOthers, 40)){
            if(!isOnAnyRoad(it)) { it.__movedOffRoad = true; return true; }
          }
          // spiral search for nearest free spot not on road
          const startCx = Math.max(5, Math.min(WORLD.w - it.w - 5, it.x));
          const startCy = Math.max(5, Math.min(WORLD.h - it.h - 5, it.y));
          const step = 20;
          const maxR = Math.max(WORLD.w, WORLD.h);
          for(let r=step; r<=maxR; r+=step){
            const steps = Math.max(8, Math.floor((2*Math.PI*r)/step));
            for(let s=0;s<steps;s++){
              const ang = (s/steps) * Math.PI * 2;
              const nx = Math.round(startCx + Math.cos(ang) * r);
              const ny = Math.round(startCy + Math.sin(ang) * r);
              const cand = { x: Math.max(5, Math.min(WORLD.w - it.w - 5, nx)), y: Math.max(5, Math.min(WORLD.h - it.h - 5, ny)), w: it.w, h: it.h };
              // avoid overlaps
              const coll = allOthers.some(o => o !== it && rectsOverlapWithMargin(cand, o, 6));
              if(coll) continue;
              // ensure not on road
              if(!isOnAnyRoad(cand)){
                it.x = cand.x; it.y = cand.y; it.__movedOffRoad = true; return true;
              }
            }
          }
          // fallback: keep original but mark attempted
          it.__movedOffRoad = true;
          return false;
        }
        return false;
      }catch(e){ console.warn('moveBuildingOffRoad error', e); return false; }
    }

    // Si existen dos hospitales muy juntos, forzarlos a los extremos izquierdo/derecho
    try{
      const hosp = government.placed.filter(g => ((g.k||g.kind||'').toString().toLowerCase().includes('hospital')));
      if(hosp.length >= 2){
        const a = hosp[0], b = hosp[1];
        const ca = centerOf(a), cb = centerOf(b);
        const closeThresh = 220;
        if(Math.hypot(ca.x - cb.x, ca.y - cb.y) < closeThresh){
          const marginEdge = 40;
          // Ubicar uno a la izquierda y otro a la derecha, centrados verticalmente
          a.x = Math.max(10, marginEdge);
          a.y = Math.max(10, Math.min(WORLD.h - a.h - 10, Math.floor(WORLD.h/2 - a.h - 20)));
          b.x = Math.max(10, WORLD.w - b.w - marginEdge);
          b.y = Math.max(10, Math.min(WORLD.h - b.h - 10, Math.floor(WORLD.h/2 + 20)));
          // Intentar desplazar ligeramente si colisionan con otras cosas
          const all = [...government.placed, ...shops, ...factories, ...banks, ...malls, ...houses];
          tryShiftRect(a, all, 60);
          tryShiftRect(b, all, 60);
          console.log('Hospitals repositioned to left/right to reduce clustering');
        }
      }
    }catch(e){ console.warn('hospital reposition error', e); }

    // Intentar separar edificios del mismo tipo para evitar que queden muy cercanos.
    // Soporta distancias por tipo (ej: 'central_electrica' más separada).
    function enforceSameTypeSeparation(minSeparation = 220){
      try{
        const groups = {};
        const gather = (it) => {
          if(!it) return null;
          return it.k || it.kind || (it.label && it.label.toLowerCase());
        };

        // Distancias específicas por tipo (px). Añadir/ajustar según necesidad.
        const perTypeSep = {
          'central_electrica': 320,
          'hospital': 260,
          'biblioteca': 160,
          'escuela': 160
        };

        const candidates = [...government.placed, ...shops, ...factories, ...banks, ...malls, ...houses];
        for(const c of candidates){
          const key = gather(c);
          if(!key) continue;
          const nk = (''+key).toString().toLowerCase();
          (groups[nk] ||= []).push(c);
        }

        const getSepFor = (obj) => {
          const key = (''+(obj.k || obj.kind || (obj.label||'')).toString()).toLowerCase();
          return perTypeSep[key] || minSeparation;
        };

        for(const key in groups){
          const arr = groups[key];
          if(arr.length < 2) continue;
          for(let i=0;i<arr.length;i++){
            for(let j=i+1;j<arr.length;j++){
              const a = arr[i], b = arr[j];
              const ca = centerOf(a), cb = centerOf(b);
              const dist = Math.hypot(ca.x - cb.x, ca.y - cb.y);
              const sepA = getSepFor(a), sepB = getSepFor(b);
              const needed = Math.max(sepA, sepB, minSeparation);
              if(dist < needed){
                const others = [...government.placed, ...shops, ...factories, ...banks, ...malls, ...houses];
                // intentar mover b primero con margen 'needed'
                if(!tryShiftRect(b, others, needed)){
                  // intentar mover a
                  if(!tryShiftRect(a, others, needed)){
                    // intentar mover b con un margen aún mayor como último intento
                    tryShiftRect(b, others, Math.max(needed, 420));
                  }
                }
              }
            }
          }
        }
      }catch(e){ console.warn('enforceSameTypeSeparation error', e); }
    }

    // Forzar unicidad por sector: una sola instancia de cada tipo por sector (excepto casas)
    function enforceSectorUniqueness(nx = 4, ny = 4){
      try{
        const allLists = [...government.placed, ...shops, ...factories, ...banks, ...malls];
        const sectorW = Math.max(1, Math.floor(WORLD.w / nx));
        const sectorH = Math.max(1, Math.floor(WORLD.h / ny));
        const sectorHas = new Map(); // key: sx+','+sy -> Set of type keys

        const getTypeKey = (it) => ('' + (it.k || it.kind || it.label || it.type || '')).toLowerCase();
        const sectorOf = (x,y) => {
          const sx = Math.min(nx-1, Math.max(0, Math.floor(x / sectorW)));
          const sy = Math.min(ny-1, Math.max(0, Math.floor(y / sectorH)));
          return `${sx},${sy}`;
        };

        // populate
        for(const it of allLists){
          if(!it) continue;
          const t = getTypeKey(it);
          if(!t) continue;
          const c = centerOf(it);
          const s = sectorOf(c.x, c.y);
          const set = sectorHas.get(s) || new Set();
          set.add(t);
          sectorHas.set(s, set);
        }

        // Now enforce: for each item, if its sector already had same type more than once,
        // move duplicates to nearest sector without that type.
        const sectors = [];
        for(let sx=0;sx<nx;sx++) for(let sy=0;sy<ny;sy++) sectors.push({sx,sy,x:sx*sectorW,y:sy*sectorH,w:sectorW,h:sectorH});

        const findNearestAvailableSector = (fromS, typeKey) => {
          const [fx,fy] = fromS.split(',').map(Number);
          let best = null; let bestDist = Infinity;
          for(const s of sectors){
            const key = `${s.sx},${s.sy}`;
            const set = sectorHas.get(key);
            if(set && set.has(typeKey)) continue;
            const cx = s.x + s.w/2, cy = s.y + s.h/2;
            const dist = Math.hypot((fx*s.w + s.w/2) - cx, (fy*s.h + s.h/2) - cy);
            if(dist < bestDist){ bestDist = dist; best = s; }
          }
          return best;
        };

        for(const it of allLists.slice()){ // clone to be safe
          if(!it) continue;
          const t = getTypeKey(it);
          if(!t) continue;
          // skip houses
          if(t === 'house' || t === 'houses') continue;
          const c = centerOf(it);
          const sKey = sectorOf(c.x, c.y);
          const set = sectorHas.get(sKey) || new Set();
          // count how many of this type in this sector
          let count = 0;
          for(const o of allLists){ if(getTypeKey(o) === t && sectorOf(centerOf(o).x, centerOf(o).y) === sKey) count++; }
          if(count <= 1) continue; // ok

          // find nearest sector without this type
          const target = findNearestAvailableSector(sKey, t);
          if(target){
            // move item to center of target with small jitter
            const jitter = 20;
            it.x = Math.max(5, Math.min(WORLD.w - it.w - 5, Math.round(target.x + (target.w/2) - it.w/2 + (Math.random()*jitter*2 - jitter))));
            it.y = Math.max(5, Math.min(WORLD.h - it.h - 5, Math.round(target.y + (target.h/2) - it.h/2 + (Math.random()*jitter*2 - jitter))));
            // try to shift if collision
            const others = [...government.placed, ...shops, ...factories, ...banks, ...malls, ...houses];
            tryShiftRect(it, others, 40);
            // update maps
            const oldSet = sectorHas.get(sKey);
            if(oldSet) { oldSet.delete(t); }
            const newKey = `${target.sx},${target.sy}`;
            const newSet = sectorHas.get(newKey) || new Set();
            newSet.add(t); sectorHas.set(newKey, newSet);
          }
        }
      }catch(e){ console.warn('enforceSectorUniqueness error', e); }
    }

    function removeRectFromCollections(r){
      const lists = [houses, government.placed, shops, factories, banks, malls];
      for(const lst of lists){ const idx = lst.indexOf(r); if(idx!==-1){ lst.splice(idx,1); return true; } }
      return false;
    }

    function enforceNoOverlap(margin = 6){
      const all = [...houses, ...government.placed, ...shops, ...factories, ...banks, ...malls];
      for (let i = 0; i < all.length; i++){
        for (let j = i + 1; j < all.length; j++){
          const a = all[i], b = all[j];
          if (rectsOverlapWithMargin(a, b, margin)){
            // intentar mover b primero
            const others = all.slice();
            if (!tryShiftRect(b, others, margin)){
              // intentar mover a si b no pudo
              if (!tryShiftRect(a, others, margin)){
                // como último recurso, eliminar b
                removeRectFromCollections(b);
                // también sacarlo del array 'all' para no seguir comparándolo
                all.splice(j,1); j--; continue;
              }
            }
          }
        }
      }
    }

  // Forzar unicidad por sector antes de separar por tipo
  enforceSectorUniqueness(4,4);
  // Intentar primero separar edificios iguales con una distancia mayor
  enforceSameTypeSeparation(220);
  // Ejecutar la limpieza final con un margen conservador
  enforceNoOverlap(8);
  }

  /* AGREGAR FUNCIÓN PARA DIBUJAR EDIFICIOS CON IMÁGENES */
  function drawBuildingWithImage(rect, type, fallbackFill, fallbackStroke) {
    const key = type.k || type;
    
    try {
      const img = BUILDING_IMAGE_CACHE[key];
      
      // Usar imagen sólo si existe y se cargó correctamente
      if (img && !img.error && img.complete && img.naturalWidth > 0) {
        const {x, y, w, h} = rect;
        const screenPos = toScreen(x, y);
        ctx.drawImage(img, screenPos.x, screenPos.y, w * ZOOM, h * ZOOM);
        return;
      }
    } catch (e) {
      console.warn(`Error al dibujar imagen para ${key}:`, e);
    }
    
    // Fallback: Dibujar rectángulo con color
    const fill = fallbackFill || '#334155';
    const stroke = fallbackStroke || '#94a3b8';
    drawRoundRect(rect, fill, stroke);
    
    // Mostrar ícono si está disponible
    if (rect.icon) {
      const p = toScreen(rect.x, rect.y);
      const w = rect.w * ZOOM, h = rect.h * ZOOM;
      ctx.font = `${Math.max(16, 24 * ZOOM)}px system-ui,Segoe UI,Arial,emoji`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(rect.icon, p.x + w/2, p.y + h/2 + 8 * ZOOM);
    }
  }

  /* ===== DIBUJO ===== */
  function drawRoundRect(r, fill, stroke, rad=10, lw=3){const p=toScreen(r.x,r.y); const w=r.w*ZOOM, h=r.h*ZOOM, rr=Math.min(rad*ZOOM,w/2,h/2);ctx.beginPath(); ctx.moveTo(p.x+rr,p.y);ctx.arcTo(p.x+w,p.y,p.x+w,p.y+h,rr); ctx.arcTo(p.x+w,p.y+h,p.x,p.y+h,rr);ctx.arcTo(p.x,p.y+h,p.x,p.y,rr); ctx.arcTo(p.x,p.y,p.x+w,p.y,rr); ctx.closePath();ctx.fillStyle=fill; ctx.fill(); ctx.strokeStyle=stroke; ctx.lineWidth=lw*ZOOM; ctx.stroke();}
  function drawLabelIcon(rect, label, emoji, iconSize = 32){
    const p = toScreen(rect.x, rect.y);
    ctx.font = `700 ${Math.max(8, 12 * ZOOM)}px system-ui,Segoe UI,Arial`;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 2 * ZOOM;
    ctx.textAlign = 'left'; ctx.fillText(label, p.x + 10 * ZOOM, p.y + 20 * ZOOM);
    ctx.font = `700 ${Math.max(10, iconSize * ZOOM)}px system-ui,Segoe UI,Arial,emoji`;
    ctx.textAlign = 'center';
    const iconX = p.x + (rect.w * ZOOM) - (10 * ZOOM);
    const iconY = p.y + (rect.h * ZOOM) / 2 + (iconSize * 0.18) * ZOOM;
    ctx.fillText(emoji, iconX, iconY);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
  }
  function drawGrid(){
  const step = 120*ZOOM;
  ctx.lineWidth=1; ctx.strokeStyle='#27324c'; ctx.globalAlpha=0.45;
  const xStart = Math.floor((cam.x)/(step/ZOOM))*(step/ZOOM), xEnd = cam.x + canvas.width/ZOOM + step/ZOOM;
  for(let x=xStart; x<=xEnd; x+=step/ZOOM){ 
    const p1=toScreen(x,0); 
    ctx.beginPath(); 
    ctx.moveTo(p1.x,0); 
    ctx.lineTo(p1.x,canvas.height); 
    ctx.stroke(); 
  }
  const yStart = Math.floor((cam.y)/(step/ZOOM))*(step/ZOOM), yEnd = cam.y + canvas.height/ZOOM + step/ZOOM;
  for(let y=yStart; y<=yEnd; y+=step/ZOOM){ 
    const p1=toScreen(0,y); 
    ctx.beginPath(); 
    ctx.moveTo(0,p1.y); 
    ctx.lineTo(canvas.width,p1.y); 
    ctx.stroke(); 
  }
  ctx.globalAlpha=1;
}

  function drawAvenidas(){
    const pat = getStreetPattern(ctx);
    for(const av of avenidas){
      const p = toScreen(av.x, av.y);
      const w = av.w * ZOOM, h = av.h * ZOOM;
      if(pat){
        ctx.save();
        // translate pattern origin so it moves with cam
        ctx.translate(p.x, p.y);
        ctx.fillStyle = pat;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }else{
        ctx.fillStyle = 'rgba(75,85,99,0.95)';
        ctx.fillRect(p.x, p.y, w, h);
      }
      ctx.strokeStyle='rgba(156,163,175,0.95)'; ctx.lineWidth=2*ZOOM; ctx.strokeRect(p.x,p.y,w,h);
    }
  }
  function drawRoundabouts(){
    for(const r of roundabouts){
      const p = toScreen(r.cx, r.cy);
      const radius = r.w/2 * ZOOM;
      ctx.fillStyle = 'rgba(75,85,99,0.95)';
      ctx.strokeStyle = 'rgba(156,163,175,0.95)';
      ctx.lineWidth = 2 * ZOOM;
      ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(12,81,58,0.92)'; ctx.beginPath(); ctx.arc(p.x, p.y, radius * 0.6, 0, Math.PI*2); ctx.fill();
    }
  }
  function drawBarrios(){
    for(const b of barrios){
      const p = toScreen(b.x, b.y);
      const bw = b.w * ZOOM, bh = b.h * ZOOM;
      // Si hay una imagen de fondo global, no rellenamos el barrio (background ya está tileado)
      if (!(BG_IMG && BG_IMG.complete && BG_IMG.naturalWidth > 0)) {
        ctx.fillStyle = 'rgba(12,18,42,0.55)'; ctx.fillRect(p.x, p.y, bw, bh);
      }
      // Borde del barrio: omitir si hay casas dentro (el usuario pidió quitar el recuadro en barrios con casas)
      const hasHouseInBarrio = houses.some(hh => inside(centerOf(hh), b));
      if (!hasHouseInBarrio) {
        ctx.strokeStyle = 'rgba(51,65,85,0.9)'; ctx.lineWidth = 2 * ZOOM; ctx.strokeRect(p.x, p.y, bw, bh);
      }
      // Etiqueta del barrio
      ctx.font = `700 ${Math.max(10, 14 * ZOOM)}px system-ui,Segoe UI`;
      ctx.fillStyle = 'rgba(34,34,34,0.95)';
      // Dar sombra ligera para mejorar legibilidad
      ctx.shadowColor = 'rgba(255,255,255,0.6)'; ctx.shadowBlur = 2 * ZOOM;
      ctx.fillText(b.name, p.x + 8 * ZOOM, p.y + 18 * ZOOM);
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    }
  }

  // Dibuja la imagen de fondo repetida (tile) a lo largo del mundo, ajustándose al zoom/cámara
  function drawTiledBackground(){
    if (!(BG_IMG && BG_IMG.complete && BG_IMG.naturalWidth > 0)) return;
    const tileW = BG_IMG.naturalWidth;
    const tileH = BG_IMG.naturalHeight;
    // Región visible en coordenadas del mundo
    const vx0 = cam.x, vy0 = cam.y;
    const vw = canvas.width / ZOOM, vh = canvas.height / ZOOM;
    // Indices de tiles a dibujar (añadir margen de 1 tile para evitar huecos)
    const i0 = Math.max(Math.floor(vx0 / tileW) - 1, 0);
    const j0 = Math.max(Math.floor(vy0 / tileH) - 1, 0);
    const i1 = Math.min(Math.ceil((vx0 + vw) / tileW) + 1, Math.ceil(WORLD.w / tileW));
    const j1 = Math.min(Math.ceil((vy0 + vh) / tileH) + 1, Math.ceil(WORLD.h / tileH));
    for(let i = i0; i < i1; i++){
      for(let j = j0; j < j1; j++){
        const wx = i * tileW, wy = j * tileH;
        const p = toScreen(wx, wy);
        ctx.drawImage(BG_IMG, p.x, p.y, tileW * ZOOM, tileH * ZOOM);
      }
    }
  }

  // Eliminar por lista de labels (case-insensitive) en todas las colecciones y en window.gameState
  function removeByLabels(labels){
    try{
      const needle = (s) => (s || '').toString().trim().toLowerCase();
      const set = new Set((labels||[]).map(l => (''+l).toString().trim().toLowerCase()));

      const removeFromList = (lst) => {
        for(let i = lst.length - 1; i >= 0; i--){
          const it = lst[i];
          const lab = needle(it && (it.label || it.k || it.kind || it.type));
          if(lab && set.has(lab)) lst.splice(i,1);
        }
      };

      removeFromList(government.placed);
      removeFromList(shops);
      removeFromList(factories);
      removeFromList(banks);
      removeFromList(malls);
      removeFromList(houses);

      // también limpiar estado del servidor si aplica
      if(window.gameState){
        if(Array.isArray(window.gameState.shops)) window.gameState.shops = window.gameState.shops.filter(s => !set.has(needle(s && (s.label || s.k || s.kind || s.type))));
        if(window.gameState.government && Array.isArray(window.gameState.government.placed)) window.gameState.government.placed = window.gameState.government.placed.filter(g => !set.has(needle(g && (g.label || g.k || g.kind || g.type))));
      }
  // Silenciado: esta operación puede ejecutarse muchas veces; evitar ruido en consola.
    }catch(e){ console.warn('removeByLabels error', e); }
  }

  function drawWorld(){
  // Asegurar que las panaderías no compradas se eliminen antes de dibujar
  try{ removeUnownedPanaderias(); }catch(e){}

  // Eliminar etiquetas solicitadas por el usuario (ej: 'Hospital 3', 'Escuela 2', etc.) solo una vez
  if(!window.__labelsRemovedOnce){
    try{
      removeByLabels(['hospital 3','escuela 2','central electrica 2','policia 2','policia 4','central electrica 1','edificio 7','central eléctrica 2','panaderia 4','panaderia 5','panadería 4','panadería 5']);
    }catch(e){ console.warn('Error invoking removeByLabels', e); }
    window.__labelsRemovedOnce = true;
  }

  // Las panaderías solo deben mostrarse cuando tengan ownerId; la función
  // removeUnownedPanaderias() y los filtros en getVisibleShops() se encargan
  // de ocultar las panaderías que no han sido compradas.

  // Fondo base del canvas (claro). Las imágenes de barrio se dibujan por barrio en drawBarrios
  ctx.fillStyle = '#fff8e1'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Dibujar el fondo tileado del mundo (se adapta a cam.x/cam.y y ZOOM)
    drawTiledBackground();
    drawGrid();
    // Dibujar barrios (los barrios ya no necesitan pintar la imagen)
    drawBarrios();
    drawAvenidas(); drawRoundabouts();
    for(const r of roadRects){
      const p = toScreen(r.x, r.y);
      const w = r.w * ZOOM, h = r.h * ZOOM;
      const pat = getStreetPattern(ctx);
      if(pat){
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.fillStyle = pat;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }else{
        ctx.fillStyle='rgba(75,85,99,0.95)';
        ctx.fillRect(p.x, p.y, w, h);
      }
      ctx.strokeStyle='rgba(156,163,175,0.9)';ctx.lineWidth=1*ZOOM; ctx.strokeRect(p.x,p.y,w,h);
    }


  // Preferir arrays sincronizadas desde el servidor cuando estén disponibles
  const renderShopsRaw = (window.gameState && Array.isArray(window.gameState.shops)) ? window.gameState.shops : shops;
  // Mostrar todas las tiendas, incluidas las panaderías
  const renderShops = renderShopsRaw;
    const renderHouses = window.__netHouses || houses;
  const renderGovernmentPlaced = (window.gameState && window.gameState.government && Array.isArray(window.gameState.government.placed) && window.gameState.government.placed.length > 0) ? window.gameState.government.placed : government.placed;
  const usingServerGov = (window.gameState && window.gameState.government && Array.isArray(window.gameState.government.placed) && renderGovernmentPlaced === window.gameState.government.placed);

  // Intento único de mover 'Central Eléctrica 1' fuera de una calle si está sobre ella
  try{ moveBuildingOffRoad('Central Eléctrica 1'); }catch(e){ /* ignore */ }

  // Mantener visible sólo UNA panadería al comienzo (prefiere una con ownerId si existe)
  try{
    if(!window.__keptOnePanaderia){
      (function keepSinglePanaderia(){
        try{
          const allShops = (window.gameState && Array.isArray(window.gameState.shops)) ? window.gameState.shops : shops;
          const isPan = s => (s && (s.k || s.kind || s.label || '').toString().toLowerCase().includes('panader'));
          const panList = allShops.filter(isPan);
          if(panList.length <= 1) return;
          // prefer owned panaderia
          let keeper = panList.find(p=>p.ownerId!=null && p.ownerId!=='' );
          if(!keeper) keeper = panList[0];
          // remove others from shops array
          for(let i = shops.length-1; i>=0; i--){ if(isPan(shops[i]) && shops[i] !== keeper) shops.splice(i,1); }
          // also from server shadow
          if(window.gameState && Array.isArray(window.gameState.shops)){
            window.gameState.shops = window.gameState.shops.filter(s => !isPan(s) || s === keeper);
          }
          window.__keptOnePanaderia = true;
          console.log('keepSinglePanaderia: kept', keeper && (keeper.label||keeper.k||keeper.id||keeper._id)||'unknown');
        }catch(e){ console.warn('keepSinglePanaderia error', e); }
      })();
    }
  }catch(e){ }

    factories.forEach(f => {
      drawBuildingWithImage(f, 'factory', '#44403c', '#fbbf24');
    });

    drawBuildingWithImage(cemetery, 'cemetery', 'rgba(51,65,85,0.92)', 'rgba(148,163,184,0.95)');

    banks.forEach(b => {
      drawBuildingWithImage(b, 'bank', '#2d3748', '#fde68a');
    });
    malls.forEach(m => {
      drawBuildingWithImage(m, 'mall', '#1e293b', '#38bdf8');
    });
    renderShops.forEach(s => {
      drawBuildingWithImage(s, s.kind, '#8B5CF6', '#c4b5fd');
    });

    // ===== Dibujar etiquetas con nombre/label de cada edificio en el mapa grande =====
    try{
      // Reunir todas las entidades que se muestran en el mapa grande
      const allVisible = [...renderGovernmentPlaced, ...renderShops, ...factories, ...banks, ...malls, ...renderHouses];
      // Agrupar por tipo/base para numerar repetidos
      const groups = new Map();
      const getBaseName = (it) => {
        let n = (it && (it.label || it.k || it.kind || it.type) || '').toString();
        n = n.replace(/_+/g, ' ').trim();
        // quitar numeración final si existe (ej: 'Biblioteca 1')
        n = n.replace(/\s+#?\d+$/, '').replace(/\s+\d+$/, '').trim();
        if(!n) n = 'edificio';
        return n.charAt(0).toUpperCase() + n.slice(1);
      };
      for(const ent of allVisible){
        if(!ent) continue;
        const key = getBaseName(ent).toLowerCase();
        const arr = groups.get(key) || [];
        arr.push(ent);
        groups.set(key, arr);
      }

      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      for(const [baseKey, arr] of groups.entries()){
        for(let i=0;i<arr.length;i++){
          const ent = arr[i];
          if(!ent) continue;
          const base = getBaseName(ent);
          const display = (arr.length > 1) ? `${base} ${i+1}` : base;
          const p = toScreen(ent.x, ent.y);
          const w = (ent.w || 60) * ZOOM;
          const tx = p.x + w/2;
          const ty = p.y - 6 * ZOOM; // encima del edificio
          ctx.lineWidth = Math.max(2, 2 * ZOOM);
          ctx.font = `${Math.max(10, 12 * ZOOM)}px system-ui,Segoe UI,Arial`;
          ctx.strokeText(display, tx, ty);
          ctx.fillText(display, tx, ty);
        }
      }
    }catch(e){ console.warn('Error drawing labels', e); }

    for(const inst of renderGovernmentPlaced){
      // Si los datos provienen del servidor, algunos campos (k/key/type) pueden faltar.
      // Asumir que los objetos dentro de government.placed del servidor son instituciones
      // y forzar su tratamiento como 'gobierno' cuando falte la clave.
      const heuristicsGov = (inst.k === 'gobierno') || (inst.key === 'gobierno') || (inst.type === 'gobierno') || (inst.label && typeof inst.label === 'string' && inst.label.toLowerCase().includes('gobierno'));
      const isGov = heuristicsGov || usingServerGov || (inst.kind && (inst.kind === 'gobierno' || inst.kind === 'government'));
      if(isGov){
        const iw = inst.w || (government.w || 240);
        const ih = inst.h || (government.h || 140);
        const p = toScreen(inst.x, inst.y);
        const w = iw * 2 * ZOOM, h = ih * 2 * ZOOM;
        // Centrar la imagen en el mismo punto central
        const px = p.x + (iw * ZOOM)/2 - w/2;
        const py = p.y + (ih * ZOOM)/2 - h/2;

        // Usar la imagen del objeto BUILDING_IMAGES
        const img = BUILDING_IMAGE_CACHE['gobierno'];

        if (img && img.complete && img.naturalWidth !== 0 && !img.error) {
          ctx.drawImage(img, px, py, w, h);
        } else {
          // Fallback si la imagen no está disponible
          ctx.fillStyle = 'rgba(0, 82, 204, 0.8)';
          ctx.fillRect(px, py, w, h);
          ctx.strokeStyle = '#60a5fa';
          ctx.lineWidth = 2;
          ctx.strokeRect(px, py, w, h);
          ctx.fillStyle = 'white';
          ctx.textAlign = 'center';
          ctx.font = `700 ${Math.max(10, 14 * ZOOM)}px system-ui,Segoe UI`;
          ctx.fillText('GOBIERNO', px + w/2, py + h/2);
        }
      } else if(inst.k === 'carcel'){
        const p = toScreen(inst.x, inst.y);
        const w = inst.w * ZOOM, h = inst.h * ZOOM;
        ctx.fillStyle = 'rgba(20,20,20,0.9)';
        ctx.fillRect(p.x, p.y, w, h);
        ctx.fillStyle = 'rgba(220,220,220,0.95)';
        const bars = Math.max(3, Math.floor(inst.w/10));
        for(let i=0;i<bars;i++){ const bx = p.x + 6*ZOOM + i * (w - 12*ZOOM) / Math.max(1,bars-1); ctx.fillRect(bx, p.y+6*ZOOM, 3*ZOOM, h - 12*ZOOM); }
        ctx.fillStyle = '#fff'; ctx.font=`700 ${Math.max(10, 14*ZOOM)}px system-ui`; ctx.textAlign='center'; ctx.fillText('CÁRCEL', p.x + w/2, p.y + 18*ZOOM);
      } else {
        // Usar drawBuildingWithImage en lugar de drawLabelIcon
        drawBuildingWithImage(inst, inst.k, inst.fill, inst.stroke);
        
        // Mantener el nombre encima de la imagen para mayor claridad
        if (ZOOM >= 0.8) {
          const p = toScreen(inst.x, inst.y);
          ctx.font = `700 ${Math.max(8, 10 * ZOOM)}px system-ui,Segoe UI`;
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.fillText(inst.label, p.x + (inst.w * ZOOM)/2, p.y + 12 * ZOOM);
        }
      }
    }

    renderHouses.forEach(h => {
      drawBuildingWithImage(h, 'house', '#334155', h.ownerId ? '#22d3ee' : '#94a3b8');
    });
  }

  function drawSocialLines() {
    if (!SHOW_LINES || !socialConnections.length) return;
    ctx.lineWidth = 1.5 * ZOOM;
    for (const conn of socialConnections) {
      const pa = toScreen(conn.a.x, conn.a.y);
      const pb = toScreen(conn.b.x, conn.b.y);
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y);
      let color = 'rgba(148,163,184,0.55)';
      if (conn.matches === 3) color = 'rgba(252, 165, 165, 0.8)';
      else if (conn.matches === 4) color = 'rgba(244, 63, 94, 0.9)';
      else if (conn.matches >= 5) color = 'rgba(220, 38, 38, 1.0)';
      ctx.strokeStyle = color; ctx.stroke();
    }
  }
  function updateSocialLogic() {
    const newConnections = [];
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      if (a.state === 'child') continue;
      for (let j = i + 1; j < agents.length; j++) {
        const b = agents[j];
        if (b.state === 'child') continue;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < 50) {
          const matches = likeMatches(a, b);
          newConnections.push({ a, b, matches });
          const near = d < 28;
          const aOwnsHouse = a.houseIdx !== null && houses[a.houseIdx] && houses[a.houseIdx].ownerId === a.id;
          const bOwnsHouse = b.houseIdx !== null && houses[b.houseIdx] && houses[b.houseIdx].ownerId === b.id;
          if (near && matches >= 5 && (aOwnsHouse || bOwnsHouse) && a.state === 'single' && b.state === 'single' && a.cooldownSocial <= 0 && b.cooldownSocial <= 0) {
            a.state = 'paired'; b.state = 'paired';
            a.spouseId = b.id; b.spouseId = a.id;
            a.cooldownSocial = 120; b.cooldownSocial = 120;
            a.justMarried = performance.now(); b.justMarried = performance.now();
            toast(`${a.code} y ${b.code} se han casado! 💕`);

            let targetHome = null;
            if (aOwnsHouse) {
                if (b.houseIdx !== null && houses[b.houseIdx] && houses[b.houseIdx].rentedBy === b.id) {
                    houses[b.houseIdx].rentedBy = null;
                }
                b.houseIdx = a.houseIdx;
                targetHome = houses[a.houseIdx];
            } else {
                if (a.houseIdx !== null && houses[a.houseIdx] && houses[a.houseIdx].rentedBy === a.id) {
                    houses[a.houseIdx].rentedBy = null;
                }
                a.houseIdx = b.houseIdx;
                targetHome = houses[b.houseIdx];
            }
            if (targetHome) {
                const homeCenter = centerOf(targetHome);
                a.target = homeCenter; a.targetRole = 'home'; b.target = homeCenter; b.targetRole = 'home';
              }
          }
        }
      }
    } socialConnections = newConnections;
  }

  function payoutChunkToOwner(shop, chunk = CFG.SHOP_PAYOUT_CHUNK){
    if(!shop || !shop.ownerId) return false;
    const owner = agents.find(a => a.id === shop.ownerId);
    if(!owner) return false;
    if((shop.cashbox || 0) < chunk) return false;
    shop.cashbox -= chunk;
    owner.money = (owner.money || 0) + chunk;
    toast(`Se acreditaron ${chunk} al dueño de ${shop.kind}. Caja restante: ${Math.floor(shop.cashbox)}.`);
    return true;
  }

  // ====== DIBUJO DE REMOTOS SUAVIZADO ======
  function renderRemotePlayers(){
    const now = performance.now();
    if (!window.gameState || !Array.isArray(window.gameState.players)) return;

    // Ingesta + delay adaptativo
    for (const p of window.gameState.players) {
      if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') continue;
      const id = p.id;

      const buf = (REMOTE.BUFFER[id] ||= []);
      buf.push({ x: p.x, y: p.y, t: now });
      if (buf.length > REMOTE.MAX_BUF) buf.shift();

      const st = (REMOTE.STATS[id] ||= { delay: REMOTE.BASE_DELAY, iat: [], lastTs: 0 });
      if (st.lastTs) {
        const iat = now - st.lastTs;
        st.iat.push(iat); if (st.iat.length > 20) st.iat.shift();
        const sorted = st.iat.slice().sort((a,b)=>a-b);
        const p80 = sorted.length ? sorted[Math.floor(sorted.length*0.8)-1] || sorted[sorted.length-1] : REMOTE.BASE_DELAY;
        st.delay = Math.min(REMOTE.DELAY_MAX, Math.max(REMOTE.BASE_DELAY, (p80||REMOTE.BASE_DELAY) + REMOTE.EXTRA_GUARD));
      }
      st.lastTs = now;
    }

    // Catmull–Rom
    function catmullRom(p0, p1, p2, p3, u){
      const u2 = u*u, u3 = u2*u;
      const a0 = -0.5, a1 = 1.5, a2 = -1.5, a3 = 0.5;
      const b0 = 1.0,  b1 = -2.5, b2 = 2.0,  b3 = -0.5;
      const c0 = -0.5, c1 = 0.0,  c2 = 0.5,  c3 = 0.0;
      const d0 = 0.0,  d1 = 1.0,  d2 = 0.0,  d3 = 0.0;
      const x = (a0*p0.x + a1*p1.x + a2*p2.x + a3*p3.x)*u3 +
                (b0*p0.x + b1*p1.x + b2*p2.x + b3*p3.x)*u2 +
                (c0*p0.x + c1*p1.x + c2*p2.x + c3*p3.x)*u  +
                (d0*p0.x + d1*p1.x + d2*p2.x + d3*p3.x);
      const y = (a0*p0.y + a1*p1.y + a2*p2.y + a3*p3.y)*u3 +
                (b0*p0.y + b1*p1.y + b2*p2.y + b3*p3.y)*u2 +
                (c0*p0.y + c1*p1.y + c2*p2.y + c3*p3.y)*u  +
                (d0*p0.y + d1*p1.y + d2*p2.y + d3*p3.y);
      return {x,y};
    }

    for (const p of window.gameState.players) {
      // Only render remote players, not the local player
      if (p.id === window.playerId) continue;
      const id  = p.id;
      const buf = REMOTE.BUFFER[id];
      if (!buf || buf.length === 0) continue;

      const st = REMOTE.STATS[id] || { delay: REMOTE.BASE_DELAY };
      const renderTime = now - st.delay;

      let idx = -1;
      for (let i = 0; i < buf.length - 1; i++) {
        if (buf[i].t <= renderTime && renderTime <= buf[i+1].t) { idx = i; break; }
      }

      let target;
      if (idx >= 0) {
        const p1 = buf[idx], p2 = buf[idx+1];
        const p0 = buf[idx-1] || p1, p3 = buf[idx+2] || p2;
        const u  = (renderTime - p1.t) / Math.max(1, (p2.t - p1.t));
        target = catmullRom(p0, p1, p2, p3, Math.max(0, Math.min(1, u)));
      } else {
        const last = buf[buf.length - 1], prev = buf[buf.length - 2] || last;
        const denom = Math.max(1, (last.t - prev.t));
        const vx = (last.x - prev.x) / denom, vy = (last.y - prev.y) / denom;
        const dt = Math.max(0, renderTime - last.t);
        target = { x: last.x + vx * dt, y: last.y + vy * dt };
      }

      const s = (REMOTE.SMOOTH[id] ||= { x: target.x, y: target.y, vx:0, vy:0 });
      let dx = target.x - s.x, dy = target.y - s.y;
      const dist2 = dx*dx + dy*dy;
      if (dist2 > REMOTE.DEADZONE*REMOTE.DEADZONE) {
        const dt = 1/60;
        const k  = REMOTE.K;
        const ax = k*k*dx - 2*k*s.vx;
        const ay = k*k*dy - 2*k*s.vy;
        s.vx += ax * dt; s.vy += ay * dt;
        s.x  += s.vx * dt; s.y  += s.vy * dt;
      } else {
        s.x = target.x; s.y = target.y; s.vx = 0; s.vy = 0;
      }

      const pt = toScreen(s.x, s.y);
      ctx.beginPath();
      const r = (p.state==='child'?CFG.R_CHILD:CFG.R_ADULT)*ZOOM;
      ctx.arc(pt.x, pt.y, r, 0, Math.PI*2);
      ctx.fillStyle = (p.gender==='M') ? '#93c5fd' : '#fda4af';
      ctx.fill();
      if (ZOOM >= 0.7) {
        ctx.font = `700 ${Math.max(8,12*ZOOM)}px ui-monospace,monospace`;
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
  ctx.fillText(`${p.name||p.code||'P'}`, pt.x, pt.y - 8*ZOOM);
      }
    }
  }

  let __lastTime = performance.now();
  function loop(){
    if(!STARTED){ requestAnimationFrame(loop); return; }
    const nowMs = performance.now();
    let dt = (nowMs - __lastTime) / 1000; __lastTime = nowMs; dt = Math.min(dt, 0.05);
    frameCount++;
    updateSocialLogic();
    drawWorld();
    drawSocialLines();

    // ======= Jugadores remotos con smoothing nuevo =======
    try{ renderRemotePlayers(); }catch(e){}

    const nowS = performance.now()/1000;

    for(const a of agents){
      // Only render the local player (not remote ones)
      if (a.id !== USER_ID) continue;
      a.cooldownSocial = Math.max(0, a.cooldownSocial - dt);
      if (a.employedAtShopId) {
        const myWorkplace = shops.find(s => s.id === a.employedAtShopId);
        if (myWorkplace) { a.target = centerOf(myWorkplace); a.targetRole = 'work_shop'; }
      }
  if (!a.forcedShopId && !a.workingUntil && !a.goingToBank && !a.employedAtShopId && (!a.targetRole || a.targetRole==='idle') && nowS >= (a.nextWorkAt || 0)) {
  const myOwnedShops = shops.filter(s => s.ownerId === a.id);
        if (myOwnedShops.length > 0 && Math.random() < CFG.OWNER_MANAGE_VS_WORK_RATIO) {
          const shopToManage = myOwnedShops[(Math.random() * myOwnedShops.length) |  0];
          a.target = centerOf(shopToManage);
         
         
                  
         
         
          a.targetRole = 'manage_shop';
          a._shopTargetId = shopToManage.id;
               } else {
          const f = factories[(Math.random()*factories.length)|0];
          if (f) { a.goingToWork = true; a.workFactoryId = factories.indexOf(f); a.target = centerOf(f); a.targetRole = 'go_work'; }
        }
      }
      if(a.workingUntil && nowS>=a.workingUntil){
        a.workingUntil=null; a.pendingDeposit += CFG.EARN_PER_SHIFT; a.goingToBank=true;
        const b=banks[(Math.random()*banks.length)|0]; if(b){ a.target=centerOf(b); a.targetRole='bank'; }
      }
      if(a.goingToBank && a.target){
        const c=a.target; if(Math.hypot(a.x-c.x,a.y-c.y)<14){
          a.money += a.pendingDeposit; a.pendingDeposit=0; a.goingToBank=false; a.nextWorkAt = nowS + CFG.WORK_COOLDOWN;
          if(a.houseIdx!=null){ const h=houses[a.houseIdx]; if(h) a.target=centerOf(h), a.targetRole='home'; else a.target=null, a.targetRole='idle'; }
          else { a.target=null, a.targetRole='idle'; }
        }
      }
        if(!a.forcedShopId && !a.workingUntil && !a.goingToBank && !a.employedAtShopId && (!a.targetRole || a.targetRole==='idle' || a.targetRole==='home')) {
        if (!a.forcedShopId && Math.random() < CFG.VISIT_RATE) {
          // Sólo considerar negocios que ya tienen dueño (comprados). Las panaderías y otros tipos
          // que no estén comprados no deberían atraer visitas porque no existen físicamente.
          const liked = shops.filter(s => s.ownerId && a.likes.includes(s.like) && s.ownerId !== a.id);
          if(liked.length){



            let best=null, bestD=1e9;
            for(const s of liked){
              const d=Math.hypot(a.x-(s.x+s.w/2), a.y-(s.y+s.h/2));
              if(d<bestD && d<CFG.VISIT_RADIUS){ best=s; bestD=d; }
            }
            if(best){ a.target={x:best.x+best.w/2,y:best.y+best.h/2}; a.targetRole='shop'; a._shopTargetId = best.id; }
          }
        }
      }
      if(a.targetRole==='shop' && a.target){
        const c=a.target;
        if(Math.hypot(a.x-c.x,a.y-c.y)<16){
          const s = shops.find(q=>q.id===a._shopTargetId);
          if(s){ const price = clamp(s.price, CFG.PRICE_MIN, CFG.PRICE_MAX); if(a.money>=price){ a.money-=price; const bonus = Math.round((s.buyCost || 0) * CFG.SHOP_PROFIT_FACTOR); const saleProfit = price + bonus; s.cashbox = (s.cashbox || 0) + saleProfit; } }
          a.target=null; a.targetRole='idle'; a._shopTargetId=null;
        }
      }
      if(a.targetRole==='manage_shop' && a.target){
        const c=a.target;
        if(Math.hypot(a.x-c.x,a.y-c.y)<16){
          const s = shops.find(q => q.id === a._shopTargetId);
          const paid = payoutChunkToOwner(s, CFG.SHOP_PAYOUT_CHUNK);
          if(!paid){ toast(`${a.code} gestionó ${s?.kind ?? 'su negocio'}, pero la caja no alcanza ${CFG.SHOP_PAYOUT_CHUNK}.`); }
          a.nextWorkAt = nowS + CFG.WORK_COOLDOWN; a.target=null; a.targetRole='idle'; a._shopTargetId=null;
        }
      }
      
      let currentSpeed = a.speed;
      let onRoad = null;
      if (a.vehicle) {
        const vehicleData = VEHICLES[a.vehicle];
        if (vehicleData) { currentSpeed = vehicleData.speed; }
        onRoad = getCurrentRoad(a);
      }
      if (a.goingToWork && a.target && a.targetRole === 'go_work') {
        const c = a.target;
        if (Math.hypot(a.x - c.x, a.y - c.y) < 16) {
          a.goingToWork = false; a.workingUntil = nowS + CFG.WORK_DURATION; a.vx = 0; a.vy = 0; a.target = null; a.targetRole = 'work';
        }
      }
      if(a.target){
        const t = a.target;
        let dx = t.x - a.x, dy = t.y - a.y;
        const dd = Math.hypot(dx, dy) || 1;
        const nx = dx / dd, ny = dy / dd;
        a.vx = nx * currentSpeed; a.vy = ny * currentSpeed;
        if (dd < 6) {
          if (['work', 'work_shop', 'home'].includes(a.targetRole)) { a.target = null; a.targetRole = 'idle'; }
        }
      } else {
        const isWorkingInFactory = a.workingUntil && nowS < a.workingUntil;
        const isWorkingInShop = a.employedAtShopId;
        if (isWorkingInFactory || isWorkingInShop) {
          a.vx = 0; a.vy = 0;
        } else {
          const jit = 40;
          a.vx += rand(-jit, jit) * dt; a.vy += rand(-jit, jit) * dt;
          const spd = Math.hypot(a.vx, a.vy) || 1;
          const cap = currentSpeed;
          if (spd > cap) { a.vx = (a.vx/spd)*cap; a.vy = (a.vy/spd)*cap; }
        }
      }
      a.x += a.vx * dt; a.y += a.vy * dt;
      if(a.x<4||a.x>WORLD.w-4){ a.vx*=-1; a.x=clamp(a.x,4,WORLD.w-4); }
      if(a.y<4||a.y>WORLD.h-4){ a.vy*=-1; a.y=clamp(a.y,4,WORLD.h-4); }

      const age = (yearsSince(a.bornEpoch)|0);
      if (a.state === 'paired' && a.cooldownSocial <= 0 && age > 22 && age < 45 && Math.random() < 0.00015) {
          const children = agents.filter(c => c.parents && c.parents.includes(a.id));
          if (children.length < 3) {
              const spouse = agents.find(s => s.id === a.spouseId);
              if (spouse) {
                  const home = a.houseIdx !== null ? houses[a.houseIdx] : null;
                  if (home && home.ownerId) {
                      const baby = makeAgent('child', { parents: [a.id, spouse.id], ageYears: 0 });
                      baby.x = home.x + home.w/2; baby.y = home.y + home.h/2; baby.houseIdx = a.houseIdx;
                      agents.push(baby); toast(`¡Ha nacido un bebé en la familia de ${a.code} y ${spouse.code}!`);
                      a.cooldownSocial = 120; spouse.cooldownSocial = 120;
                  }
              }
          }
      }

      const p=toScreen(a.x,a.y);
      ctx.beginPath(); ctx.arc(p.x,p.y, (a.state==='child'?CFG.R_CHILD:CFG.R_ADULT)*ZOOM, 0, Math.PI*2);
      ctx.fillStyle = (a.gender==='M')?'#93c5fd':'#fda4af';
      ctx.fill();
      if ( a.id === USER_ID) { ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 2 * ZOOM; ctx.stroke(); }
      if (a.justMarried && (performance.now() - a.justMarried < 5000)) {
          ctx.font=`700 ${Math.max(12, 18*ZOOM)}px system-ui,Segoe UI,Arial,emoji`;
          ctx.textAlign='center'; ctx.fillText('💕', p.x, p.y - 25 * ZOOM);
      } else if (a.justMarried) { a.justMarried = null; }
      if (ZOOM >= 0.7) {
        ctx.font=`700 ${Math.max(8,12*ZOOM)}px ui-monospace,monospace`;
        ctx.fillStyle='#fff'; ctx.textAlign='center';
        const age = (yearsSince(a.bornEpoch)|0);
  ctx.fillText(`${a.name||a.code}·${age}`, p.x, p.y-8*ZOOM);
      }
    }
    const total$=Math.round(agents.reduce((s,x)=>s+(x.money||0),0));
    const instCount = government.placed.length;
    stats.textContent = `Pob: ${agents.length} | $ total: ${total$} | 🏛️ Fondo: ${Math.floor(government.funds)} | 🏪 ${shops.length} | Instituciones: ${instCount}/25`;
    drawMiniMap();
    // Enviar mi posición al servidor cada ~120ms
    try{
      if(hasNet() && window.playerId){
        const t = performance.now();
        if(t - __lastNetSend > 120){
          const me = agents.find(a=>a.id===USER_ID);
          if(me){
            const currentMoney = Math.floor(me.money || 0);
            // Solo enviar actualización si el estado ha cambiado para no interferir
            // con la lógica de inactividad del servidor.
            if (me.x !== __lastSentState.x || me.y !== __lastSentState.y || currentMoney !== __lastSentState.money) {
              window.sockApi?.update({ x: me.x, y: me.y, money: currentMoney });
              __lastSentState.x = me.x;
              __lastSentState.y = me.y;
              __lastSentState.money = currentMoney;
            }
          }
          __lastNetSend = t;
        }
      }
    }catch(e){}
    requestAnimationFrame(loop);
  }

  function bankReport(){
    const lines = [];
    const player = agents.find(a => a.id === USER_ID);
    if (player){
      const playerDisplay = player.name || player.fullName || player.code || player.id;
      lines.push(`Jugador: ${playerDisplay} (${player.code || player.id}): $${Math.floor(player.money)}`);
    }
    const otherAgents = agents.filter(a => a.id !== USER_ID && a.state !== 'child');
    if (otherAgents.length > 0) {
        if (player) lines.push('---');
    // Mostrar nombre completo si está disponible, si no mostrar código
    const agentLines = otherAgents.map(a => {
      const display = a.name || a.fullName || a.code || a.id;
      return `${display}: $${Math.floor(a.money)}`;
    });
        lines.push(...agentLines.sort());
    }
    return lines.join('\n') || 'Sin fondos por ahora.';
  }
  // ====== Guardado periódico del progreso ======
  function collectProgress(){
    const me = agents.find(a=>a.id===USER_ID);
    const myShops = shops.filter(s=>s.ownerId === USER_ID).map(s=>({ id: s.id, x:s.x,y:s.y,w:s.w,h:s.h,kind:s.kind, price:s.price, like:s.like, buyCost:s.buyCost, cashbox:s.cashbox||0 }));
    const myHouses = houses.filter(h=>h.ownerId === USER_ID).map(h=>({ x:h.x,y:h.y,w:h.w,h:h.h }));
    return {
      money: Math.floor(me?.money||0),
      bank: Math.floor(me?.bank||0),
      vehicle: me?.vehicle||null,
      shopsOwned: myShops,
      housesOwned: myHouses,
      x: Math.floor(me?.x||0), y: Math.floor(me?.y||0)
    };
  }
  function saveProgressLocal(){ try{ localStorage.setItem(LS_PROGRESS, JSON.stringify(collectProgress())); }catch(e){} }
  async function saveProgressRemote(){
    try{
      const reg = getRegistered(); if(!reg) return;
      const state = collectProgress();
      saveProgressLocal();
      await fetch('/api/save', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username: reg.username, deviceId: getDeviceId(), socketId: (window.sock?.id||null), port: location.port || null, state }) });
    }catch(e){ /* ignorar errores transitorios */ }
  }
  setInterval(()=>{ if(STARTED && USER_ID) saveProgressRemote(); }, 15000);
  function fullDocument(){
    const total$=Math.round(agents.reduce((s,x)=>s+(x.money||0),0));
  const player = agents.find(a => a.id === USER_ID);
  // Mostrar nombre completo cuando esté disponible, si no usar código
  const playerName = player ? (player.name || player.code || '—') : '—';
    const lines=[];
  lines.push('# Documento');
  const playerDisplayName = player ? (player.name || player.fullName || player.code || player.id) : '—';
  lines.push(`Jugador: ${playerDisplayName} (${player ? (player.code || player.id) : '—'})`);
  // Quitar la línea antigua de población, solo mostrar créditos, fondo, negocios e instituciones
  lines.push(`Total créditos: ${total$} — Fondo Gobierno: ${Math.floor(government.funds)} — Negocios: ${shops.length} — Instituciones: ${government.placed.length}`);
    lines.push('');
    lines.push('## Usuarios en el mundo (tiempo real)');
    // Mostrar todos los usuarios conectados en tiempo real (de gameState)
    let users = [];
    if (window.gameState && Array.isArray(window.gameState.players)) {
      // Si hay players desde el servidor, usarlos, pero preferir el nombre local si existe
      users = window.gameState.players.map(p => {
        // intentar casar con agente local por id o código
        const local = agents.find(a => (p.id && a.id === p.id) || (p.code && a.code === p.code));
        if(local){
          return Object.assign({}, p, { _localName: local.name, _localCode: local.code || local.id });
        }
        return p;
      });
    } else {
      users = agents;
    }
    // Filtrar solo humanos (no bots) y no niños si quieres
    const filtered = users.filter(u => !u.isBot && (!u.state || u.state !== 'child'));
  lines.push(`Población conectada: ${filtered.length} — Jugador: ${playerName}`);
    if(filtered.length > 0){
      for(const u of filtered){
        // Si se aportó un nombre local (_localName) usarlo
        let displayName = u._localName || u.name || u.fullName || u.displayName || '';
        // Si el nombre es muy corto o vacío, usar code del objeto o el localCode
        const codeRef = (u._localCode || u.code || u.id || '');
        if(!displayName || displayName.trim().length <= 2){
          displayName = codeRef || 'Usuario';
        }
        lines.push(`- ${displayName}${codeRef ? ' (' + codeRef + ')' : ''}`);
      }
    }else{
      lines.push('No hay usuarios conectados.');
    }
    lines.push('');
    lines.push('## Finanzas por Agente');
    lines.push(bankReport());
    return lines.join('\n') || 'Sin fondos por ahora.';
  }
  function generateMarriedList() {
      const lines = [];
      const processed = new Set();
      const couples = agents.filter(a => a.state === 'paired');
      for (const p1 of couples) {
          if (processed.has(p1.id)) continue;
          const p2 = agents.find(a => a.id === p1.spouseId);
          if (!p2) continue;
          lines.push(`Familia: ${p1.code} ❤ ${p2.code}`);
          processed.add(p1.id); processed.add(p2.id);
          const children = agents.filter(c => c.parents && c.parents.includes(p1.id));
          if (children.length > 0) {
              for (const child of children) {
                  const age = (yearsSince(child.bornEpoch)|0);
                  lines.push(`  - ${child.code} (${age} años)`);
              }
          } else { lines.push(`  (Sin hijos por ahora)`); }
          lines.push('');
      }
      return lines.length > 0 ? lines.join('\n') : "No hay familias casadas todavía.";
  }

  function automaticRoadConstruction() { /* lógica opcional */ }

  btnShowDoc.onclick = ()=>{
    const isVisible = docDock.style.display === 'flex';
    if (!isVisible) {
      // Actualizar el documento cada segundo mientras está abierto
      if(!window.__docInterval){
        window.__docInterval = setInterval(()=>{
          $("#docBody").textContent = fullDocument();
        }, 1000);
      }
      $("#docBody").textContent = fullDocument();
      docDock.style.display = 'flex';
    } else {
      docDock.style.display = 'none';
      if(window.__docInterval){
        clearInterval(window.__docInterval);
        window.__docInterval = null;
      }
    }
  };
  btnShowMarried.onclick = ()=>{ const isVisible = marriedDock.style.display === 'flex'; if (!isVisible) { $("#marriedList").textContent = generateMarriedList(); marriedDock.style.display = 'flex'; } else { marriedDock.style.display = 'none'; } };

  // Gobierno: abrir vía edificio en el mapa (no botón)
  // openGovPanel(target) posiciona el panel sobre el edificio (target en coords del mundo)
  function openGovPanel(target){
    if(!target) { govDock.style.display = 'flex'; populateGovSelect(); return; }
    try{
      const screenPos = toScreen(target.x, target.y);
      const dockW = Math.min(window.innerWidth * 0.9, govDock.offsetWidth || 340);
      const dockH = Math.min(window.innerHeight * 0.8, govDock.offsetHeight || 220);
      // centrar sobre el edificio y desplazar hacia arriba para que quede encima
      let left = screenPos.x + (target.w * ZOOM)/2 - dockW/2;
      let top = screenPos.y - dockH - 10; // 10px de espacio
      // asegurarse de que quede dentro de la ventana
      left = Math.max(6, Math.min(left, window.innerWidth - dockW - 6));
      top = Math.max(6, Math.min(top, window.innerHeight - dockH - 6));
      govDock.style.position = 'fixed';
      govDock.style.left = `${left}px`;
      govDock.style.top = `${top}px`;
      govDock.style.width = `${dockW}px`;
      govDock.style.display = 'flex';
      populateGovSelect();
    }catch(e){ govDock.style.display = 'flex'; populateGovSelect(); }
  }
  function closeGovPanel(){ govDock.style.display = 'none'; }
  document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape') closeGovPanel(); });
  document.addEventListener('pointerdown', (e)=>{
    try{
      if(govDock.style.display !== 'flex') return;
      const gd = govDock.getBoundingClientRect();
      if(e.clientX < gd.left || e.clientX > gd.right || e.clientY < gd.top || e.clientY > gd.bottom){ closeGovPanel(); }
    }catch(e){}
  }, {passive:true});
  $("#uiHideBtn").onclick = ()=>{ show($("#uiDock"), false); show($("#uiShowBtn"), true); };
  $("#uiShowBtn").onclick = ()=>{ show($("#uiDock"), true); show($("#uiShowBtn"), false); };
  panelDepositAll.onclick = ()=>{ if(!USER_ID){ toast('Crea tu persona primero.'); return; } const u=agents.find(a=>a.id===USER_ID); if(!u) return; u.money += (u.pendingDeposit||0); u.pendingDeposit=0; accBankBody.innerHTML = `Saldo de ${u.code}: <span class="balance-amount">${Math.floor(u.money)}</span>`; toast('Depósito realizado.'); };

  function setVisibleWorldUI(on){
    $("#formBar").style.display = on ? 'none' : 'block';
    canvas.style.display = on ? 'block':'none';
    uiDock.style.display = on ? 'flex':'none';
    topBar.style.display = on ? 'flex':'none';
    zoomFab.style.display = on ? 'flex':'none';
    mini.style.display = on ? 'block':'none';
    show($("#uiShowBtn"),false);
    docDock.style.display = 'none'; govDock.style.display = 'none';
  }

  function startWorldWithUser({name,likes}){
    $("#formBar").style.display='none'; 
    setVisibleWorldUI(true); 
    STARTED=true; 
    setWorldSize(); 
    fitCanvas(); 
    regenInfrastructure(false);
  // Mantener las panaderías tal como vienen (no eliminar al iniciar)
    populateGovSelect(); // ← AÑADIR ESTA LÍNEA
    
  let startMoney = 200;
  const gender = 'M'; // neutral default; rendering no longer depends on chosen gender
  const age = 20;
  const user=makeAgent('adult',{name, gender, ageYears:age, likes, startMoney: startMoney});
    // Prefer the selected avatar from grid (fallback to preview/default by gender)
    try{
      const selBtn = document.querySelector('#avatarGrid .avatar-option.selected');
  const chosen = selBtn?.getAttribute('data-src') || fGenderPreview?.src || MALE_IMG;
      user.avatar = chosen;
    }catch(e){}
    agents.push(user); USER_ID=user.id;
  try{ window.sockApi?.createPlayer({ code: user.code, gender: user.gender, avatar: user.avatar, startMoney: Math.floor(user.money||0) }, ()=>{}); }catch(e){}
    // Enviar registro de personaje al backend (apéndice en usuarios.txt)
    try{
      const reg = getRegistered();
      const payload = {
        username: reg?.username || null,
        character: {
          name: user.code,
          likes,
          avatar: user.avatar || null,
          createdAt: new Date().toISOString()
        },
        deviceId: getDeviceId()
      };
      // Usar navigator.sendBeacon si está, sino fetch en background
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      if(navigator.sendBeacon){
        navigator.sendBeacon('/api/register-character', blob);
      }else{
        fetch('/api/register-character', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) }).catch(()=>{});
      }
    }catch(_){}
    if(!hasNet()){
      for(let i=0;i<CFG.N_INIT;i++) {agents.push(makeAgent('adult',{ageYears:rand(18,60)}));}
    }
    agents.forEach(a => { if (assignRental(a)) { const home = houses[a.houseIdx]; if (home) { a.target = centerOf(home); a.targetRole = 'home'; } } });
    const b0=cityBlocks[0]; if(b0){ cam.x = Math.max(0, b0.x - 40); cam.y = Math.max(0, b0.y - 40); clampCam(); }
    updateGovDesc();
    try{
      const uiAvatar = document.getElementById('uiAvatar');
      if(uiAvatar && user.avatar) uiAvatar.src = user.avatar;
      const userName = document.getElementById('userName');
      if(userName){
        const full = user.name || user.code || 'Usuario';
        // Set immediately
        userName.textContent = full;
        userName.setAttribute('data-fullname', full);

        // If something else (CSS/other script) ends up leaving only an initial,
        // retry a few times to ensure the full name is shown (handles race conditions).
        if((userName.textContent || '').length <= 2 && (full || '').length > 2){
          setTimeout(()=>{ try{ document.getElementById('userName').textContent = full; }catch(e){} }, 100);
          setTimeout(()=>{ try{ document.getElementById('userName').textContent = full; }catch(e){} }, 1000);
          let _sync = null;
          _sync = setInterval(()=>{
            try{
              const el = document.getElementById('userName');
              if(!el) return;
              if(el.textContent === full){ clearInterval(_sync); return; }
              el.textContent = full;
            }catch(e){}
          }, 1500);
          setTimeout(()=>{ try{ clearInterval(_sync); }catch(e){} }, 8000);
        }
      }
    }catch(e){}
    loop();
  }
  const startHandler = ()=>{
    if(!isRegistered()){
      if(registerModal) registerModal.style.display = 'flex';
      toast('Debes registrarte primero.');
      return;
    }
    const name=fName.value.trim(),likes=getChecked().map(x=>x.value);
    if(!name || likes.length!==5){ errBox.style.display='inline-block'; toast('Completa nombre y marca 5 gustos.'); return; }
    errBox.style.display='none';
    startWorldWithUser({name,likes});
    // Restaurar progreso local si existe
    try{
      const raw = localStorage.getItem(LS_PROGRESS);
      if(raw){
        const st = JSON.parse(raw);
        const me = agents.find(a=>a.id===USER_ID);
        if(me && st){
          if(typeof st.money === 'number') me.money = st.money;
          if(typeof st.bank === 'number') me.bank = st.bank;
          if(st.vehicle) me.vehicle = st.vehicle;
        }
        if(Array.isArray(st.shopsOwned)){
          for(const s of st.shopsOwned){
            shops.push({ x: s.x, y: s.y, w: s.w||120, h: s.h||80, kind: s.kind, ownerId: USER_ID, id: s.id||('S'+(Math.random().toString(36).slice(2,7))) , price: s.price||2, like: s.like||'comida', buyCost: s.buyCost||1000, cashbox: s.cashbox||0 });
          }
        }
        if(Array.isArray(st.housesOwned)){
          for(const h of st.housesOwned){
            houses.push({ x: h.x, y: h.y, w: h.w||CFG.HOUSE_SIZE, h: h.h||CFG.HOUSE_SIZE, ownerId: USER_ID, rentedBy: null });
          }
        }
      }
    }catch(e){}
  };
  btnStart.addEventListener('click', startHandler);
  $("#formInner").addEventListener('submit',(e)=>{ e.preventDefault(); startHandler(); });

  
  canvas.addEventListener('click', (e)=>{
    if(!STARTED) return;
    const rect = canvas.getBoundingClientRect(); const pt = toWorld(e.clientX-rect.left, e.clientY-rect.top);
    if(isOverUI(e.clientX,e.clientY)) return;
    // Si se hace click en el edificio del gobierno, abrir el panel de gobierno
    try{
      // rect gobierno principal
      if(pt && government && typeof government.x === 'number'){
        if(pt.x >= government.x && pt.x <= government.x + government.w && pt.y >= government.y && pt.y <= government.y + government.h){
          openGovPanel(government); return;
        }
      }
      // también verificar edificaciones gubernamentales colocadas
      for(const inst of government.placed || []){
        if(inst && inst.k === 'gobierno'){
          if(pt.x >= inst.x && pt.x <= inst.x + inst.w && pt.y >= inst.y && pt.y <= inst.y + inst.h){ openGovPanel(inst); return; }
        }
      }
    }catch(e){}

  const allBuildings = [cemetery,government,...banks,...malls,...factories,...houses,...(window.__netHouses||[]),...roadRects,...getVisibleShops(), ...avenidas, ...roundabouts, ...government.placed];
  // Eliminar Edificio 5 y Edificio 6 si existen (petición del usuario)
  try{ removeByLabels(['edificio 5','edificio 6']); }catch(e){ }

    if(placingHouse){
      const u=agents.find(a=>a.id===placingHouse.ownerId); if(!u){ placingHouse=null; return; }
      const newH = {x: pt.x - placingHouse.size.w/2, y: pt.y - placingHouse.size.h/2, w: placingHouse.size.w, h: placingHouse.size.h, ownerId:u.id, rentedBy:null};
      if(allBuildings.some(r=>rectsOverlapWithMargin(r,newH, 8))){ toast('No se puede colocar (muy cerca de otro edificio).'); return; }
      if((u.money||0) < placingHouse.cost){ toast('Saldo insuficiente.'); placingHouse=null; return; }
      if(hasNet()){
        window.sock?.emit('placeHouse', newH, (res)=>{
          if(res?.ok){ u.money -= placingHouse.cost; houses.push(newH); u.houseIdx = houses.length-1; placingHouse=null; toast('Casa propia construida 🏠'); }
          else { toast(res?.msg||'Error al colocar casa'); placingHouse=null; }
        });
        return;
      }
      u.money -= placingHouse.cost;
      if(u.houseIdx !== null && houses[u.houseIdx]) { houses[u.houseIdx].rentedBy = null; }
      houses.push(newH); u.houseIdx = houses.length-1; placingHouse=null;
      toast('Casa propia construida 🏠'); return;
    }

    // Colocación de negocio desde el menú (ej: panadería). Debe aparecer justo donde se hace click.
    if(placingShop){
      const u = agents.find(a => a.id === placingShop.ownerId);
      if(!u){ placingShop = null; return; }
      const size = placingShop.size || {w: CFG.SHOP_W, h: CFG.SHOP_H};
      const newShop = { x: pt.x - size.w/2, y: pt.y - size.h/2, w: size.w, h: size.h, kind: placingShop.kind.k || placingShop.kind, ownerId: u.id };
      // comprobar colisiones
      if(allBuildings.some(r => rectsOverlapWithMargin(r, newShop, 8))){ toast('No se puede colocar el negocio aquí (colisión).'); placingShop = null; return; }
      if((u.money || 0) < (placingShop.price || 0)){ toast('Saldo insuficiente.'); placingShop = null; return; }
      // enviar al servidor si corresponde
      if(hasNet()){
        window.sock?.emit('placeShop', newShop, (res) => {
          if(res?.ok){ u.money -= (placingShop.price || 0); shops.push(newShop); placingShop = null; toast('Negocio colocado.'); }
          else { toast(res?.msg || 'Error al colocar negocio'); placingShop = null; }
        });
      }else{
        u.money -= (placingShop.price || 0);
        shops.push(newShop);
        placingShop = null;
        toast('Negocio colocado (local).');
      }
      return;
    }
    if(placingShop){
      const u=agents.find(a=>a.id===placingShop.ownerId); if(!u){ placingShop=null; return; }
      const rectShop = {x: pt.x - placingShop.size.w/2, y: pt.y - placingShop.size.h/2, w: placingShop.size.w, h: placingShop.size.h};
      if(allBuildings.some(r=>rectsOverlapWithMargin(r,rectShop, 8))){ toast('No se puede colocar aquí (muy cerca).'); return; }
      if((u.money||0) < placingShop.price){ toast('Saldo insuficiente.'); placingShop=null; return; }
      const newShop = { 
  ownerId:u.id, 
  x:rectShop.x, 
  y:rectShop.y, 
  w:rectShop.w, 
  h:rectShop.h, 
  kind:placingShop.kind.k,  // Ahora esto es correcto
  icon:placingShop.kind.icon, 
  like:placingShop.kind.like, 
  price:placingShop.kind.price, 
  buyCost: placingShop.kind.buyCost 
};
      if(hasNet()){
        console.log("Intentando colocar negocio vía red...");
        window.sock?.emit('placeShop', newShop, (res)=>{
          console.log("Respuesta del servidor:", res);
          if(res?.ok){ u.money -= placingShop.price; newShop.id='S'+(shops.length+1); newShop.cashbox=0; shops.push(newShop); placingShop=null; toast('Negocio colocado 🏪'); }
          else { toast(res?.msg||'Error al colocar negocio'); placingShop=null; }
        });
        return;
      }
      u.money -= placingShop.price;
      newShop.id='S'+(shops.length+1); newShop.cashbox=0; shops.push(newShop);
      placingShop=null; toast('Negocio colocado 🏪'); return;
    }
    if(placingGov){
      const rectX = { x: pt.x - placingGov.w/2, y: pt.y - placingGov.h/2, w: placingGov.w, h: placingGov.h, label: placingGov.label, icon: placingGov.icon, fill: placingGov.fill, stroke: placingGov.stroke, k: placingGov.k };
      rectX.x = clamp(rectX.x, 10, WORLD.w - rectX.w - 10);
      rectX.y = clamp(rectX.y, 10, WORLD.h - rectX.h - 10);
      if(allBuildings.some(r=>rectsOverlapWithMargin(r,rectX, 8))){ toast('No se puede colocar aquí (muy cerca).'); return; }
      if(government.funds < placingGov.cost){ toast('Fondos insuficientes.'); placingGov=null; return; }
      if(hasNet()){
        const payload = { ...rectX, cost: placingGov.cost };
        window.sock?.emit('placeGov', payload, (res)=>{
          if(res?.ok){ government.funds -= placingGov.cost; government.placed.push(rectX); updateGovDesc(); placingGov=null; toast('Construcción realizada ✅'); }
          else { toast(res?.msg||'No se pudo construir'); placingGov=null; }
        });
        return;
      }
      government.funds -= placingGov.cost;
      government.placed.push(rectX);
      govFundsEl.textContent = `Fondo: ${Math.floor(government.funds)}`;
      placingGov=null; toast('Construcción realizada ✅');
      updateGovDesc();
      return;
    }

    for(const b of banks){ if(inside(pt,b)){const you = USER_ID? agents.find(a=>a.id===USER_ID) : null; if(you){ const your$ = Math.floor((you.money||0) + (you.pendingDeposit||0)); accBankBody.innerHTML = `Saldo de ${you.code}: <span class="balance-amount">${your$}</span>`; } else { accBankBody.textContent = 'Crea tu persona primero.'; } toast('Banco abierto');return;} }
    for(const s of getVisibleShops()){
      if(inside(pt,s) && s.ownerId === USER_ID){
        if(s.hasEmployee){
          const employee = agents.find(a => a.id === s.employeeId);
          if(employee){ employee.employedAtShopId = null; employee.target = null; employee.targetRole = 'idle'; }
          s.hasEmployee = false; s.employeeId = null; s.wage = 0;
          toast("Empleado despedido.");
        } else {
          const candidate = agents.find(a => a.id !== USER_ID && !a.employedAtShopId && !shops.some(shop => shop.ownerId === a.id));
          if(candidate){
            s.hasEmployee = true; s.employeeId = candidate.id;
            s.wage = Math.ceil(CFG.EARN_PER_SHIFT * 1.25);
            candidate.employedAtShopId = s.id;
            candidate.target = centerOf(s); candidate.targetRole = 'work_shop';
            candidate.workingUntil = null; candidate.goingToBank = false;
            toast(`Empleado ${candidate.code} contratado! 👔`);
          } else {
            toast("No hay personal disponible para contratar.");
          }
        }
        return;
      }
    }
  });
  console.log("Clic en canvas procesado");

  function drawMiniMap(){
    const w=miniCanvas.width, h=miniCanvas.height; mctx.clearRect(0,0,w,h);
    // Mini-mapa: usar la misma imagen de fondo (escalada) si está disponible
    if (BG_IMG && BG_IMG.complete && BG_IMG.naturalWidth > 0) {
      const iw = BG_IMG.naturalWidth, ih = BG_IMG.naturalHeight;
      const scale = Math.max(w / iw, h / ih);
      const iwScaled = iw * scale, ihScaled = ih * scale;
      const dx = (w - iwScaled) / 2, dy = (h - ihScaled) / 2;
      mctx.drawImage(BG_IMG, dx, dy, iwScaled, ihScaled);
    } else {
      mctx.fillStyle='#fff8e1'; mctx.fillRect(0,0,w,h);
    }
    const sx = w / WORLD.w, sy = h / WORLD.h;
    const mrect=(r,fill)=>{ mctx.fillStyle=fill; mctx.fillRect(Math.max(0,r.x*sx), Math.max(0,r.y*sy), Math.max(1,r.w*sx), Math.max(1,r.h*sy)); };
    cityBlocks.forEach(r=>mrect(r,'#334155'));
    roadRects.forEach(r=>mrect(r,'#9ca3af')); factories.forEach(r=>mrect(r,'#8b5cf6'));
  banks.forEach(r=>mrect(r,'#fde047')); malls.forEach(r=>mrect(r,'#ef4444')); getVisibleShops().forEach(r=>mrect(r,'#94a3b8'));
    mrect(cemetery,'#cbd5e1'); mrect(government,'#60a5fa');
    government.placed.forEach(r=>{
      if(r.k === 'carcel'){
        mctx.fillStyle = '#111'; mctx.fillRect(Math.max(0,r.x*sx), Math.max(0,r.y*sy), Math.max(1,r.w*sx), Math.max(1,r.h*sy));
        mctx.fillStyle = '#fff'; const bars = 3; const bx = Math.max(0,r.x*sx), by = Math.max(0,r.y*sy), bw = Math.max(1,r.w*sx), bh = Math.max(1,r.h*sy);
        for(let i=0;i<bars;i++){ const px = bx + 4 + i*(bw-8)/(bars-1); mctx.fillRect(px, by+4, 2, bh-8); }
        mctx.fillStyle = '#fff'; ctx.font=`700 ${Math.max(10, 14*ZOOM)}px system-ui`; ctx.textAlign='center'; ctx.fillText('CÁRCEL', p.x + w/2, p.y + 18*ZOOM);
      } else { mrect(r, r.fill || '#94a3b8'); }
    });
    const vw = canvas.width/ZOOM, vh = canvas.height/ZOOM;
    mctx.strokeStyle='#22d3ee'; mctx.lineWidth=1; mctx.strokeRect(cam.x*sx, cam.y*sy, vw*sx, vh*sy);
    if(USER_ID){
      const u=agents.find(a=>a.id===USER_ID);
      if(u){
        const playerX = u.x * sx;
        const playerY = u.y * sy;
        mctx.fillStyle = 'rgba(255, 255, 0, 0.7)';
        mctx.beginPath(); mctx.arc(playerX, playerY, 6, 0, Math.PI * 2); mctx.fill();
        mctx.fillStyle = '#FFFF00';
        mctx.beginPath(); mctx.arc(playerX, playerY, 2.5, 0, Math.PI * 2); mctx.fill();
      }
    }
  }
  miniCanvas.addEventListener('click', (e)=>{const r=miniCanvas.getBoundingClientRect();const mx=e.clientX-r.left, my=e.clientY-r.top;const sx = mx / miniCanvas.width, sy = my / miniCanvas.height;const vw = canvas.width/ZOOM, vh = canvas.height/ZOOM;cam.x = Math.min(Math.max(0, sx*WORLD.w - vw/2), Math.max(0, WORLD.w - vw));cam.y = Math.min(Math.max(0, sy*WORLD.h - vh/2), Math.max(0, WORLD.h - vh));clampCam();});

  function openBuilderMenu(){if(!STARTED){ toast('Primero inicia el mundo.'); return; }if(!USER_ID){ toast('Crea tu persona primero.'); return; }const u=agents.find(a=>a.id===USER_ID); if(!u){ toast('No encontré tu persona.'); return; }$("#builderMsg").textContent = `Tu saldo: ${Math.floor(u.money)}.`;show(builderModal,true);}
  btnBuilderClose.onclick = ()=> show(builderModal,false);
  btnBuy.onclick = ()=>{const u=agents.find(a=>a.id===USER_ID); if(!u) return;if(u.houseIdx!=null && houses[u.houseIdx]?.ownerId===u.id){ $("#builderMsg").textContent='Ya eres dueño de una casa.'; return; }if(u.money<CFG.HOUSE_BUY_COST){ $("#builderMsg").textContent=`No te alcanza para comprar (${CFG.HOUSE_BUY_COST}).`; return; }placingHouse = {cost: CFG.HOUSE_BUY_COST, size:{w:CFG.HOUSE_SIZE, h:CFG.HOUSE_SIZE}, ownerId: u.id};show(builderModal,false);toast('Modo colocación: toca un espacio libre.');};

  function openShopMenu(){
      if(!STARTED){ toast('Primero inicia el mundo.'); return; }
      if(!USER_ID){ toast('Crea tu persona primero.'); return; }
      const u=agents.find(a=>a.id===USER_ID);
      if(!u){ toast('No encontré tu persona.'); return; }
      shopList.innerHTML='';
      const sortedShops = [...SHOP_TYPES].sort((a, b) => a.buyCost - b.buyCost);
      sortedShops.forEach(t=>{
          const b=document.createElement('button');
          b.className='btn';
          // miniatura de la imagen si existe
          const imgUrl = (BUILDING_IMAGES && BUILDING_IMAGES[t.k]) ? BUILDING_IMAGES[t.k] : null;
          if(imgUrl){
            const img = document.createElement('img'); img.src = imgUrl; img.alt = t.k; img.style.width='40px'; img.style.height='40px'; img.style.objectFit='cover'; img.style.borderRadius='8px'; img.style.marginRight='8px'; img.style.verticalAlign='middle';
            b.appendChild(img);
          }
          const span = document.createElement('span'); span.textContent = `${t.icon} ${t.k} (Costo: ${t.buyCost}, Venta: $${t.price})`;
          b.appendChild(span);
          b.onclick=()=>{
              if(u.money < t.buyCost){ $("#shopMsg").textContent=`No te alcanza. Necesitas ${t.buyCost}.`; return; }
              placingShop = {ownerId:u.id, kind:t, price:t.buyCost, size:{w:CFG.SHOP_W,h:CFG.SHOP_H}};
              show(shopModal,false); toast('Modo colocación: toca el mapa.');
          };
          shopList.appendChild(b);
      });
      $("#shopMsg").textContent = `Tu saldo: ${Math.floor(u.money)}. El precio de venta es la ganancia por cliente.`;
      show(shopModal,true);
  }
  btnShopClose.onclick = ()=> show(shopModal,false);
  btnHouse.onclick = ()=> openBuilderMenu();
  btnShop.onclick  = ()=> openShopMenu();

  // Cerrar sesión: borrar credenciales locales y reabrir el modal de registro
  const btnLogout = document.getElementById('btnLogout');
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      try {
        localStorage.removeItem('mu_registered_user_v1');
        localStorage.removeItem('mu_progress_v1');
        // Nota: conservamos mu_device_id_v1 para reconocer el dispositivo
      } catch (e) {}
      try {
        const modal = document.getElementById('registerModal');
        if (modal) modal.style.display = 'flex';
        const start = document.getElementById('btnStart');
        if (start) start.disabled = true;
      } catch (e) {}
      // Si ya está el mundo iniciado, recargar para limpiar estado
      try { if (typeof STARTED !== 'undefined' && STARTED) location.reload(); } catch (e) {}
    });
  }

  function populateGovSelect(){
    govSelectEl.innerHTML = '';
    GOV_TYPES.forEach(t=>{
      const opt=document.createElement('option');
      opt.value=t.k;
      opt.textContent = `${t.icon} ${t.label} (Costo: ${t.cost})`;
      govSelectEl.appendChild(opt);
    });
  }
  function selectedGovType(){
    const k = govSelectEl.value;
    return GOV_TYPES.find(x=>x.k===k) || GOV_TYPES[0];
  }
  function updateGovDesc(){
    const n = government.placed.length;
    const rate = Math.min(CFG.WEALTH_TAX_MAX, CFG.WEALTH_TAX_BASE + n*CFG.INSTITUTION_TAX_PER);
    govDescEl.textContent = `Instituciones: ${n}/25 · Impuesto actual: ${(rate*100).toFixed(1)}% (Base 1.0% + 0.1% × ${n}).`;
    govFundsEl.textContent = `Fondo: ${Math.floor(government.funds)}`;
  }
  btnGovPlace.onclick = ()=>{
    if(!STARTED){ toast('Inicia el mundo primero.'); return; }
    const typ = selectedGovType();
    if(government.funds < typ.cost){ toast('Fondos insuficientes.'); return; }
    placingGov = {...typ};
    toast(`Modo colocación: ${typ.label}. Haz clic en el mapa.`);
  }

  // (interval moved below after likes UI wiring)

  // Limitar a 5 gustos y enganchar eventos
  function attachLimit(){
    try{
      getBoxes().forEach(cb=>{
        ['click','change','touchend'].forEach(ev=>{
          cb.addEventListener(ev, ()=>{
            const checked=getChecked();
            if(checked.length>5){ cb.checked=false; }
            updateLikesUI();
          }, {passive:true});
        });
      });
    }catch(e){}
  }
  attachLimit(); updateLikesUI();
  if(fName){ try{ fName.addEventListener('input', updateLikesUI); }catch(e){} }
  if(btnRandLikes){
    btnRandLikes.onclick = ()=>{
      try{
        getBoxes().forEach(cb=>{ cb.checked=false; cb.disabled=false; cb.closest('.chip')?.classList.remove('disabled'); });
        const boxes = getBoxes(); let picks = 0;
        while(picks<5){ const i=(Math.random()*boxes.length)|0; if(!boxes[i].checked){ boxes[i].checked=true; picks++; } }
        updateLikesUI();
      }catch(e){}
    };
    // asegurar refresco
    try{ btnRandLikes.addEventListener('click', updateLikesUI); }catch(e){}
  }

  // Recaudación periódica de impuesto a la riqueza (solo en modo local)
  setInterval(()=>{
    if(!STARTED) return; if(hasNet()) return;
    const n = government.placed.length;
    const effRate = Math.min(CFG.WEALTH_TAX_MAX, CFG.WEALTH_TAX_BASE + n*CFG.INSTITUTION_TAX_PER);
    let collected = 0;
    for(const a of agents){
      const taxAmount = (a.money || 0) * effRate;
      if(a.money >= taxAmount){ a.money -= taxAmount; collected += taxAmount; }
    }
    government.funds += collected;
    if(collected > 0){
      govFundsEl.textContent = `Fondo: ${Math.floor(government.funds)} (+${Math.round(collected)})`;
      toast(`Gobierno recaudó ${Math.round(collected)} créditos (tasa ${(effRate*100).toFixed(1)}%).`);
    }
    updateGovDesc();
  }, CFG.GOV_TAX_EVERY*1000);

  setInterval(()=>{if(!STARTED) return; if(hasNet()) return; let rentCollected = 0; let renters = 0;for(const h of houses){if(h.rentedBy){const renter = agents.find(a => a.id === h.rentedBy);if(renter && renter.money >= CFG.GOV_RENT_AMOUNT){renter.money -= CFG.GOV_RENT_AMOUNT; rentCollected += CFG.GOV_RENT_AMOUNT; renters++;}}}government.funds += rentCollected;if(rentCollected > 0){govFundsEl.textContent = `Fondo: ${Math.floor(government.funds)} (+${Math.round(rentCollected)})`;toast(`Gobierno recaudó ${Math.round(rentCollected)} en alquileres de ${renters} personas.`);} }, CFG.GOV_RENT_EVERY*1000);

  setInterval(()=>{ if(!STARTED) return; if(hasNet()) return;
    for(const shop of shops){
      if(shop.hasEmployee && shop.employeeId && shop.ownerId){
        const owner = agents.find(a => a.id === shop.ownerId);
        const employee = agents.find(a => a.id === shop.employeeId);
        if(!owner || !employee) continue;
        if(shop.cashbox >= shop.wage){ shop.cashbox -= shop.wage; employee.money += shop.wage; toast(`Nómina pagada en ${shop.kind}. Caja ahora: ${Math.floor(shop.cashbox)}.`); }
        else { toast(`Caja insuficiente en ${shop.kind}. ¡El empleado ${employee.code} ha renunciado!`); shop.hasEmployee = false; shop.employeeId = null; shop.wage = 0; employee.employedAtShopId = null; employee.target = null; employee.targetRole = 'idle'; }
      }
    }
  }, CFG.SALARY_PAY_EVERY * 1000);

  const carTypeSelect = $('#carTypeSelect'), btnBuyCar = $('#btnBuyCar'), carMsg = $('#carMsg');
  btnBuyCar.addEventListener('click', () => {
      if(!USER_ID) { toast('Debes iniciar la simulación.'); return; }
      const u = agents.find(a => a.id === USER_ID);
      if(!u) { toast('Error: No se encontró a tu agente.'); return; }
      const vType = carTypeSelect.value;
      if (!vType || !VEHICLES[vType]) { carMsg.textContent = 'Por favor, selecciona un vehículo.'; carMsg.style.color = 'var(--warn)'; return; }
      const vehicle = VEHICLES[vType];
      if (u.money >= vehicle.cost){ u.money -= vehicle.cost; u.vehicle = vType; carMsg.textContent = `¡${vehicle.name} comprado!`; carMsg.style.color = 'var(--ok)'; toast(`¡Vehículo comprado! Tu velocidad aumentó.`); }
      else { carMsg.textContent = `Créditos insuficientes. Necesitas ${vehicle.cost}.`; carMsg.style.color = 'var(--bad)'; }
  });

  // Eventos para notificar cuando todas las imágenes estén cargadas
window.addEventListener('load', () => {
  // Esperar un momento para asegurarse que las imágenes se procesen
  setTimeout(() => {
    console.log("Todas las imágenes de edificios han sido precargadas");
  }, 1000);
});

// Función para crear agentes (personas en el mundo)
function makeAgent(state, options = {}) {
  const id = 'A' + (Math.random() * 1000000 | 0);
  const gender = options.gender || (Math.random() < 0.5 ? 'M' : 'F');
  const now = Date.now() / 1000;
  const ageYears = options.ageYears || (state === 'child' ? rand(1, 14) : rand(18, 65));
  const bornEpoch = now - ageYears * 31536000; // años a segundos
  
  // Código de agente (iniciales o letras aleatorias)
  const code = options.name ? 
               options.name.split(' ').map(n => n[0]).join('').toUpperCase() : 
               String.fromCharCode(65 + (Math.random() * 26 | 0)) + 
               String.fromCharCode(65 + (Math.random() * 26 | 0));
  
  // Posición inicial aleatoria
  const x = rand(100, WORLD.w - 100);
  const y = rand(100, WORLD.h - 100);
  
  // Intereses/gustos
  const allInterests = ['pan', 'kiosco', 'jugos', 'café', 'helado', 'pizza', 
                        'libros', 'juguetes', 'yoga', 'baile', 'deporte', 'arte', 
                        'cine', 'videojuegos', 'naturaleza', 'fotografía', 
                        'astronomía', 'comida', 'electrónica', 'tecnología'];
  const likes = options.likes || [];
  while (likes.length < 5) {
    const interest = allInterests[Math.floor(Math.random() * allInterests.length)];
    if (!likes.includes(interest)) likes.push(interest);
  }
  
  return {
    id,
    code,
  name: options.name || code,
    state,
    gender,
    bornEpoch,
    x,
    y,
    vx: 0,
    vy: 0,
    speed: CFG.SPEED,
    money: options.startMoney || rand(100, 500),
    pendingDeposit: 0,
    houseIdx: null,
    likes,
    target: null,
    targetRole: 'idle',
    cooldownSocial: 0,
    parents: options.parents || null,
    spouseId: null
  };
}

// Variables globales que faltan
let STARTED = false;
let USER_ID = null;
let agents = [];
let frameCount = 0;
let SHOW_LINES = true;
let socialConnections = [];

// Función para calcular años desde una fecha
function yearsSince(epochSeconds) {
  return (Date.now() / 1000 - epochSeconds) / 31536000;
}

// Función para contar coincidencias entre gustos
function likeMatches(a, b) {
  if (!a.likes || !b.likes) return 0;
  return a.likes.filter(like => b.likes.includes(like)).length;
}

// Función para asignar alquiler
function assignRental(agent) {
  if (agent.houseIdx !== null) return false;
  const availableHouses = houses.filter(h => h.ownerId !== agent.id && !h.rentedBy);
  if (availableHouses.length === 0) return false;
  const randomHouse = availableHouses[Math.floor(Math.random() * availableHouses.length)];
  randomHouse.rentedBy = agent.id;
  agent.houseIdx = houses.indexOf(randomHouse);
  return true;
}

if(false){ // duplicate disabled
/* === DUPLICADO COMENTADO (bloque repetido a partir de aquí) ===
// (contenido duplicado omitido intencionalmente)
*/
}
// Archivo restaurado duplicado — omitido
btnRandLikes.addEventListener('click', updateLikesUI);

  /* ===== CANVAS / MUNDO ===== */
  const canvas=$("#world"), ctx=canvas.getContext('2d', {alpha: false});
  const uiDock=$("#uiDock"), uiHideBtn=$("#uiHideBtn"), uiShowBtn=$("#uiShowBtn");
  const zoomFab=$("#zoomFab"), zoomIn=$("#zoomIn"), zoomOut=$("#zoomOut"), docDock=$("#docDock"), govDock=$("#govDock"), topBar=$("#top-bar");
  const mini=$("#mini"), miniCanvas=$("#miniCanvas"), mctx=miniCanvas.getContext('2d');
  const stats=$("#stats"), toggleLinesBtn=$("#toggleLines");
  const btnShowDoc=$("#btnShowDoc"), accDocBody=$("#docBody");
  const panelDepositAll=$("#panelDepositAll"), accBankBody=$("#bankBody");
  const btnHouse=$("#btnHouse"), btnShop=$("#btnShop");
  const btnShowMarried = $("#btnShowMarried"), marriedDock = $("#marriedDock"), marriedList = $("#marriedList");
  const builderModal=$("#builderModal"), btnBuy=$("#btnBuy"), btnBuilderClose=$("#btnBuilderClose"), builderMsg=$("#builderMsg");
  const shopModal=$("#shopModal"), shopList=$("#shopList"), shopMsg=$("#shopMsg"), btnShopClose=$("#btnShopClose");
  const govFundsEl=$("#govFunds"), govDescEl = $("#govDesc");
  const govSelectEl=$("#govSelect"), btnGovPlace=$("#btnGovPlace");

  const btnGovClose = $("#btnGovClose");
  if(btnGovClose) btnGovClose.onclick = ()=> closeGovPanel();
  let placingGov = null, placingHouse = null, placingShop = null;

  const isMobile = ()=> innerWidth<=768;
  let ZOOM=1.0, ZMIN=0.6, ZMAX=2.0, ZSTEP=0.15;
  const WORLD={w:0,h:0}; const cam={x:0,y:0};

  // --- Generador de números aleatorios determinista (semilla fija para el mundo) ---
  let _seed = 20250824; // Usa la fecha de hoy como semilla fija
  function seededRandom() {
    // LCG: https://en.wikipedia.org/wiki/Linear_congruential_generator
    _seed = (_seed * 1664525 + 1013904223) % 4294967296;
    return _seed / 4294967296;
  }
  function setSeed(s) { _seed = s >>> 0; }

  // Versiones deterministas de randi y rand para la generación del mundo
  function srandi(a, b) { return (seededRandom() * (b - a) + a) | 0; }
  function srand(a, b) { return a + seededRandom() * (b - a); }
  function setWorldSize(){
    const vw = innerWidth, vh = innerHeight;
    // Doblar la extensión horizontal del mapa grande: multiplicadores duplicados
    WORLD.w = Math.floor(vw * (isMobile() ? 7.2 : 5.6));
    WORLD.h = Math.floor(vh * (isMobile() ? 3.2 : 2.6));
  }

  function fitCanvas(){ canvas.width=innerWidth; canvas.height=innerHeight; clampCam(); }
  function clampCam(){const vw = canvas.width/ZOOM, vh = canvas.height/ZOOM;const maxX = Math.max(0, WORLD.w - vw);const maxY = Math.max(0, WORLD.h - vh);cam.x = Math.max(0, Math.min(cam.x, maxX));cam.y = Math.max(0, Math.min(cam.y, maxY));}
  function toScreen(x,y){ return {x:(x-cam.x)*ZOOM, y:(y-cam.y)*ZOOM}; }
  function toWorld(px,py){ return {x: px/ZOOM + cam.x, y: py/ZOOM + cam.y}; }
  setWorldSize(); fitCanvas();
  addEventListener('resize', fitCanvas, {passive:true});

  /* ===== PAN/ZOOM ===== */
  const activePointers = new Map();let panPointerId = null;let pinchBaseDist = 0, pinchBaseZoom = 1, pinchCx = 0, pinchCy = 0;
  function isOverUI(sx,sy){const rects = [];const addRect = (el)=>{if(!el) return;const cs = getComputedStyle(el);if(cs.display==='none' || cs.visibility==='hidden') return;rects.push(el.getBoundingClientRect());};addRect(uiDock); addRect(docDock); addRect(govDock); addRect(topBar); addRect(mini); addRect(zoomFab); addRect(uiShowBtn); addRect(marriedDock); return rects.some(r => sx>=r.left && sx<=r.right && sy>=r.top && sy<=r.bottom);}
  function setZoom(newZ, anchorX=null, anchorY=null){const before = toWorld(anchorX??(canvas.width/2), anchorY??(canvas.height/2));ZOOM = Math.max(ZMIN, Math.min(ZMAX, newZ));const after  = toWorld(anchorX??(canvas.width/2), anchorY??(canvas.height/2));cam.x += (before.x - after.x); cam.y += (before.y - after.y); clampCam();}
  canvas.addEventListener('wheel', (e)=>{ e.preventDefault();if(isOverUI(e.clientX,e.clientY)) return;setZoom(ZOOM + (Math.sign(e.deltaY)>0?-ZSTEP:ZSTEP), e.clientX, e.clientY);}, {passive:false});
  canvas.addEventListener('pointerdown', (e)=>{if(isOverUI(e.clientX,e.clientY)) return;canvas.setPointerCapture(e.pointerId);activePointers.set(e.pointerId, {x:e.clientX, y:e.clientY});if(activePointers.size===1){panPointerId = e.pointerId;}else if(activePointers.size===2){const pts=[...activePointers.values()];pinchBaseDist = Math.hypot(pts[0].x-pts[1].x, pts[0].y-pts[1].y);pinchBaseZoom = ZOOM;pinchCx = (pts[0].x + pts[1].x)/2;pinchCy = (pts[0].y + pts[1].y)/2;panPointerId = null;}}, {passive:true});
  canvas.addEventListener('pointermove', (e)=>{if(!activePointers.has(e.pointerId)) return;const prev = activePointers.get(e.pointerId);activePointers.set(e.pointerId, {x:e.clientX, y:e.clientY});if(activePointers.size===1 && panPointerId===e.pointerId){const dx = (e.clientX - prev.x)/ZOOM;const dy = (e.clientY - prev.y)/ZOOM;cam.x -= dx; cam.y -= dy; clampCam();}else if(activePointers.size===2){const pts=[...activePointers.values()];const dist = Math.hypot(pts[0].x-pts[1].x, pts[0].y-pts[1].y) || 1;const factor = dist / (pinchBaseDist||dist);setZoom(pinchBaseZoom * factor, pinchCx, pinchCy);}}, {passive:true});
  const clearPointer = (id)=>{if(!activePointers.has(id)) return;activePointers.delete(id);if(panPointerId===id) panPointerId=null;if(activePointers.size<2){ pinchBaseDist=0; }};
  canvas.addEventListener('pointerup',   e=> clearPointer(e.pointerId), {passive:true});
  canvas.addEventListener('pointercancel', e=> clearPointer(e.pointerId), {passive:true});
  $("#zoomIn").onclick = ()=> setZoom(ZOOM+ZSTEP, canvas.width/2, canvas.height/2);
  $("#zoomOut").onclick= ()=> setZoom(ZOOM-ZSTEP, canvas.width/2, canvas.height/2);

  // Mapeo directo de imágenes para edificaciones
const BUILDING_IMAGES = {
  // Instituciones gubernamentales con URLs corregidas
  parque: 'https://i.postimg.cc/2jwdggYM/20250826-110318.png',
  escuela: 'https://i.postimg.cc/x1PTBFPx/escuela.png', // URL alternativa 
  // biblioteca removed
  policia: 'https://i.postimg.cc/YCHr4sgt/policia.png',
  hospital: 'https://i.postimg.cc/y8yV0yXc/hospital.png',
  central_electrica: 'https://i.postimg.cc/8zfXn9dM/electrica.png', // ACTUALIZADA
  cemetery: 'https://i.postimg.cc/0NzPkDMD/20250827-081702.jpg',
  // Edificios generales
  house: 'https://i.postimg.cc/BQpptNmR/20250827-030930.png',
  bank: 'https://i.postimg.cc/4x5TcfRw/banco.png',
  factory: 'https://i.postimg.cc/y8JFgdRC/20250826-102250.png',
  mall: 'https://i.postimg.cc/13ykskVF/mall.png',
  shop: 'https://i.postimg.cc/Bnd2x05L/20250827-071843.png',
  
  // Gobierno
  gobierno: 'https://i.postimg.cc/PJ2mZvKT/20250826-103751.png',
  
  // Tiendas específicas
  bar: 'https://i.postimg.cc/Pqfdyv2c/Bar.png',
  panadería: 'https://i.postimg.cc/sDHYgSvJ/20250827-065353.png',
  biblioteca: 'https://i.postimg.cc/rwmxy3tf/20250831_110133.png',
  
  // Nuevas URLs agregadas para negocios faltantes
  // Nuevas URLs agregadas para negocios faltantes
  kiosco: 'https://i.postimg.cc/xjp7LhNK/kiosco.png',
  juguería: 'https://i.postimg.cc/Y0TbTcQZ/jugo.png',
  cafetería: 'https://i.postimg.cc/J4gfCv11/cafeteria.png',
  heladería: 'https://i.postimg.cc/Bnd2x05L/20250827-071843.png',
  'pizzería': 'https://i.postimg.cc/nhb3kJFQ/pizzeria.png',
  // (se removió la entrada de librería por solicitud)
  // 'librería': '/assets/fondo1.jpg',
  'juguetería': 'https://i.postimg.cc/P5W2VRJV/jugueteria.png',
  'yoga studio': 'https://i.postimg.cc/8Ps23NgK/yoga_estudio.png',
  'dance hall': 'https://i.postimg.cc/Nfj8tbfM/20250827-071830.png',
  'tienda deportes': 'https://i.postimg.cc/XvWDV0t0/deportes.png',
  'arte & galería': 'https://i.postimg.cc/VvZ36HnW/galeria.png',
  'cineclub': 'https://i.postimg.cc/8cz2TVJC/cine_club.png',
  'gamer zone': 'https://i.postimg.cc/c48DwHSS/gamer.png',
  'senderismo': 'https://i.postimg.cc/PrxHj1YM/senderismo.png',
  'foto-lab': 'https://i.postimg.cc/pVkv4shT/foto_club.png',
  'astro club': 'https://i.postimg.cc/c4bS46cG/astro_club.png',
  restaurante: 'https://i.postimg.cc/vHwKPbTd/20250827_070529.png',
  
  // Otras instituciones
  bomberos: 'https://i.postimg.cc/KYzPHMhV/bomberos.png', // ACTUALIZADA
  universidad: 'https://i.imgur.com/hvsZIsB.png', // URL alternativa
  tribunal: 'https://i.imgur.com/zZ8FVOB.png', // URL alternativa
  teatro: 'https://i.postimg.cc/Nfj8tbfM/20250827-071830.png',
  estadio: 'https://i.postimg.cc/tgZKH7hS/20250827-052454.png' // URL solicitada por el usuario
};

// Precarga de imágenes para mejor rendimiento
const BUILDING_IMAGE_CACHE = {};

// Street texture image & pattern cache
const STREET_IMG = new Image();
STREET_IMG.src = '/assets/calle1.jpg';
const STREET_PATTERN_CACHE = { pattern: null, lastZoom: null, lastCam: {x:0,y:0} };

function getStreetPattern(ctx){
  try{
    if(!STREET_IMG || !STREET_IMG.complete || STREET_IMG.naturalWidth === 0) return null;
    // If zoom or cam changed significantly, recreate pattern
    const key = `${Math.round(ZOOM*100)}_${Math.round(cam.x)}_${Math.round(cam.y)}`;
    if(STREET_PATTERN_CACHE.key === key && STREET_PATTERN_CACHE.pattern) return STREET_PATTERN_CACHE.pattern;

    const patternCanvas = document.createElement('canvas');
    const iw = STREET_IMG.naturalWidth, ih = STREET_IMG.naturalHeight;
    // scale image to maintain appearance at current zoom (avoid distortion)
    patternCanvas.width = Math.max(64, Math.round(iw * Math.max(1, ZOOM)));
    patternCanvas.height = Math.max(64, Math.round(ih * Math.max(1, ZOOM)));
    const pc = patternCanvas.getContext('2d');
    pc.clearRect(0,0,patternCanvas.width, patternCanvas.height);
    // draw the source image scaled to canvas size preserving aspect
    pc.drawImage(STREET_IMG, 0, 0, patternCanvas.width, patternCanvas.height);
    const pat = ctx.createPattern(patternCanvas, 'repeat');
    STREET_PATTERN_CACHE.pattern = pat;
    STREET_PATTERN_CACHE.key = key;
    return pat;
  }catch(e){ console.warn('getStreetPattern error', e); return null; }
}

function preloadImages() {
  console.log("Iniciando precarga de imágenes con manejo de errores mejorado...");
  
  for (const key in BUILDING_IMAGES) {
    try {
      const img = new Image();
      
      img.onload = function() {
        console.log(`Imagen cargada: ${key}`);
      };
      
      img.onerror = function() {
        console.warn(`Error al cargar la imagen: ${key}. Usando fallback.`);
        // Crear un fallback simple que no cause errores
        BUILDING_IMAGE_CACHE[key] = { 
          error: true, 
          complete: true,
          naturalWidth: 100
        };
      };
      
      img.src = BUILDING_IMAGES[key];
      BUILDING_IMAGE_CACHE[key] = img;
    } catch(e) {
      console.error(`Error general con imagen ${key}:`, e);
    }
  }
}

// Ejecutar precarga inmediatamente
preloadImages();

// Limpiar cualquier entrada residual de 'librería' en el cache (por versiones antiguas)
if (BUILDING_IMAGE_CACHE['librería']) { delete BUILDING_IMAGE_CACHE['librería']; }

// Imagen de fondo del mundo: usar el JPG local directamente para evitar 404 por PNG
const BG_IMG = new Image();
BG_IMG.onload = () => { console.log('Background image loaded:', BG_IMG.src); };
BG_IMG.onerror = function() { console.warn('Background image not found at /assets/fondo1.jpg — usando color de respaldo'); };
BG_IMG.src = '/assets/fondo1.jpg';

// ... no street texture feature (restored to solid fills)

  /* ===== CONFIGURACIÓN ===== */
  const CFG = {
  LINES_ON:true, PARKS:4, SCHOOLS:4, FACTORIES:6, BANKS:4, MALLS:2, HOUSE_SIZE:70, CEM_W:220, CEM_H:130, N_INIT:10,  // Aumentado HOUSE_SIZE de 22 a 70
    R_ADULT:3.0, R_CHILD:2.4, R_ELDER:3.0, SPEED:60, WORK_DURATION:10, EARN_PER_SHIFT:15, WORK_COOLDOWN:45,
    YEARS_PER_SECOND:1/86400, ADULT_AGE:18, ELDER_AGE:65, DEATH_AGE:90,
    HOUSE_BUY_COST:3000,
    GOV_TAX_EVERY: 20*60,      // cada 20 min
    WEALTH_TAX_BASE: 0.01,     // 1.0% base
    INSTITUTION_TAX_PER: 0.001,// +0.1% por institución
    WEALTH_TAX_MAX: 0.06,      // 6% tope de seguridad
    EMPLOYEE_SALARY: 25, SALARY_PAY_EVERY: 120,
    GOV_RENT_EVERY: 10*60, GOV_RENT_AMOUNT: 5, 
    COST_ROAD: 40,
    COST_PARK: 80, COST_SCHOOL: 120, COST_LIBRARY: 150, COST_POLICE: 200, COST_HOSPITAL: 250, COST_POWER: 350,
    SHOP_W:120, SHOP_H:80, VISIT_RADIUS:220, VISIT_RATE: 0.003, PRICE_MIN:1, PRICE_MAX:3,
    SHOP_DWELL: 5, NEW_SHOP_FORCE_WINDOW: 120,
    SHOP_PAYOUT_CHUNK: 100,
    OWNER_MANAGE_VS_WORK_RATIO: 0.3, // 30% de probabilidad de gestionar negocio vs trabajar
  };

  const VEHICLES = {
    bicicleta:      { name:'Bicicleta',      cost:50,   speed: 100, icon:'🚲' },
    moto:           { name:'Motocicleta',    cost:200,  speed: 180, icon:'🛵' },
    auto_compacto:  { name:'Auto Compacto',  cost:800,  speed: 260, icon:'🚗' },
    auto_deportivo: { name:'Auto Deportivo', cost:2500, speed: 360, icon:'🏎️' }
  };

  /* ===== Tipos de Instituciones (25) ===== */
  const GOV_TYPES = [
    {k:'parque', label:'Parque', cost:CFG.COST_PARK, w:130,h:90, icon:'🌳', fill:'rgba(12,81,58,0.92)', stroke:'rgba(31,122,90,0.95)'},
    {k:'escuela', label:'Escuela', cost:CFG.COST_SCHOOL, w:140,h:95, icon:'📚', fill:'rgba(51,65,85,0.92)', stroke:'rgba(148,163,184,0.95)'},
    {k:'policia', label:'Policía', cost:CFG.COST_POLICE, w:150,h:80, icon:'🚓', fill:'#3b82f6', stroke:'#dbeafe'},
    {k:'hospital', label:'Hospital', cost:CFG.COST_HOSPITAL, w:180,h:100, icon:'🏥', fill:'#f1f5f9', stroke:'#ef4444'},
    {k:'central_electrica', label:'Central Eléctrica', cost:CFG.COST_POWER, w:200,h:120, icon:'⚡', fill:'#475569', stroke:'#facc15'},
    {k:'bomberos', label:'Cuerpo de Bomberos', cost:220, w:160,h:85, icon:'🚒', fill:'#7c2d12', stroke:'#fecaca'},
    {k:'registro_civil', label:'Registro Civil', cost:180, w:150,h:85, icon:'🪪', fill:'#0f172a', stroke:'#94a3b8'},
    {k:'universidad', label:'Universidad Pública', cost:300, w:200,h:120, icon:'🎓', fill:'#1e293b', stroke:'#93c5fd'},
    {k:'tribunal', label:'Tribunal / Corte', cost:260, w:170,h:95, icon:'⚖️', fill:'#111827', stroke:'#9ca3baf'},
    {k:'museo', label:'Museo', cost:200, w:160,h:90, icon:'🏛️', fill:'#3f3f46', stroke:'#cbd5e1'},
  {k:'biblioteca', label:'Biblioteca', cost:CFG.COST_LIBRARY, w:140,h:90, icon:'📖', fill:'#a16207', stroke:'#fde047'},
    {k:'teatro', label:'Teatro', cost:190, w:160,h:90, icon:'🎭', fill:'#1f2937', stroke:'#9ca3baf'},
  {k:'estadio', label:'Estadio', cost:420, w:320,h:220, icon:'🏟️', fill:'#0b3a1e', stroke:'#10b981'},
    {k:'terminal', label:'Terminal Terrestre', cost:260, w:200,h:110, icon:'🚌', fill:'#0c4a6e', stroke:'#7dd3fc'},
    {k:'correos', label:'Correos del Estado', cost:170, w:150,h:85, icon:'📮', fill:'#0b1f3a', stroke:'#60a5fa'},
    {k:'banco_central', label:'Banco Central', cost:300, w:180,h:100, icon:'🏦', fill:'#2d3748', stroke:'#fde68a'},
    {k:'aduana', label:'Aduana', cost:240, w:170,h:95, icon:'🚢', fill:'#1e3a8a', stroke:'#93c5fd'},
    {k:'carcel', label:'Centro de Rehabilitación', cost:280, w:200,h:110, icon:'🗝️', fill:'#111827', stroke:'#64748b'},
    {k:'planta_agua', label:'Planta de Agua', cost:260, w:190,h:110, icon:'🚰', fill:'#0e7490', stroke:'#67e8f9'},
    {k:'reciclaje', label:'Planta de Reciclaje', cost:220, w:180,h:100, icon:'♻️', fill:'#14532d', stroke:'#86efac'},
    {k:'centro_cultural', label:'Centro Cultural', cost:190, w:160,h:90, icon:'🎨', fill:'#3b0764', stroke:'#d8b4fe'},
    {k:'mercado_central', label:'Mercado Central', cost:210, w:180,h:100, icon:'🥚', fill:'#78350f', stroke:'#fde68a'},
    {k:'instituto_tecnologico', label:'Instituto Tecnológico', cost:230, w:180,h:100, icon:'🧪', fill:'#0f172a', stroke:'#60a5fa'},
    {k:'centro_investigacion', label:'Centro de Investigación', cost:260, w:190,h:105, icon:'🔬', fill:'#164e63', stroke:'#a5f3fc'},
    {k:'observatorio', label:'Observatorio', cost:240, w:170,h:95, icon:'🔭', fill:'#1e293b', stroke:'#c7d2fe'}
  ];

// End of primary configuration and types. Duplicate trailing block was removed.

  /* ===== Estructuras almacenadas ===== */
  const streets=[], factories=[], banks=[], malls=[], houses=[], barrios=[], deceased=[], avenidas=[], roundabouts=[], shops=[];

  // helper: lista de negocios visibles en el mapa grande
  function getVisibleShops(){
    // Preferir el estado del servidor si existe, sino usar el array local
  // Devolver todas las tiendas (incluyendo panaderías). El usuario pidió que se muestren todas las panaderías en el mapa grande.
  return (window.gameState && Array.isArray(window.gameState.shops)) ? window.gameState.shops : shops;
  }

  // helper: eliminar panaderías no compradas (robusto)
  function removeUnownedPanaderias(){
  // NO-OP: previously removed unowned panaderias; left empty to keep panaderías visible
  return;
  }
  const SHOP_TYPES = [
  {k:'panadería', icon:'🥖', like:'pan', price:1, buyCost: 400},
      {k:'kiosco', icon:'🏪', like:'kiosco', price:1, buyCost: 450},
      {k:'juguería', icon:'🥣', like:'jugos', price:1, buyCost: 500},
      {k:'cafetería', icon:'☕', like:'café', price:2, buyCost: 800},
      {k:'heladería', icon:'🍨', like:'helado', price:2, buyCost: 850},
      {k:'pizzería', icon:'🍕', like:'pizza', price:2, buyCost: 900},
  // 'librería' removida por solicitud
      {k:'juguetería', icon:'🧸', like:'juguetes', price:2, buyCost: 1000},
      {k:'yoga studio', icon:'🧘', like:'yoga', price:2, buyCost: 1100},
      {k:'dance hall', icon:'💃', like:'baile', price:2, buyCost: 1100},
      {k:'tienda deportes', icon:'🏅', like:'deporte', price:2, buyCost: 1200},
      {k:'arte & galería', icon:'🎨', like:'arte', price:2, buyCost: 1300},
      {k:'cineclub', icon:'🎬', like:'cine', price:2, buyCost: 1400},
      {k:'gamer zone', icon:'🎮', like:'videojuegos', price:2, buyCost: 1400},
      {k:'senderismo', icon:'🧾', like:'naturaleza', price:2, buyCost: 1500},
      {k:'foto-lab', icon:'📷', like:'fotografía', price:2, buyCost: 1500},
      {k:'astro club', icon:'🔭', like:'astronomía', price:2, buyCost: 1600},
      {k:'restaurante', icon:'🍽️', like:'comida', price:3, buyCost: 2500},
      {k:'electrónica', icon:'🔌', like:'electrónica', price:3, buyCost: 3000},
      {k:'tech hub', icon:'🖥️', like:'tecnología', price:3, buyCost: 3500},
      {k:'bar', icon:'🍻', like:'bebidas', price:2, buyCost: 1200},
  ];

  // porcentaje de ganancia adicional por cada venta basado en el costo de compra
  CFG.SHOP_PROFIT_FACTOR = CFG.SHOP_PROFIT_FACTOR || 0.002;

  /* Áreas clave */
  const builder={x:0,y:0,w:220,h:110}, cemetery={x:0,y:0,w:CFG.CEM_W,h:CFG.CEM_H}, government={x:0,y:0,w:240,h:140,funds:0, placed:[]};
  const roadRects=[];
  const cityBlocks = [];
  let urbanZone = {x:0, y:0, w:0, h:0};

  // Aplicar estado del servidor a estructuras locales visibles
  function applyServerState(payload){
    try{
      if(payload?.government){
        if(typeof payload.government.funds === 'number') government.funds = payload.government.funds;
        government.placed.length = 0;
        (payload.government.placed||[]).forEach(g=> government.placed.push({...g}));
        if(typeof window.updateGovDesc === 'function') window.updateGovDesc();
      }
      if(Array.isArray(payload?.houses)){
        window.__netHouses = payload.houses.map(h=> ({...h}));
      }
      if (Array.isArray(payload?.shops)) {
        // Reemplazar el array local de tiendas con los datos del servidor
  // Cargar todas las tiendas tal cual vienen del servidor (incluyendo panaderías)
  shops.length = 0;
  shops.push(...payload.shops);
      }
    }catch(e){ console.warn('applyServerState error', e); }
  }

  /* Utils */
  const randi=(a,b)=> (Math.random()*(b-a)+a)|0, rand=(a,b)=> a + Math.random()*(b-a), clamp=(v,a,b)=> Math.max(a,Math.min(b,v));
  const centerOf=r=> ({x:r.x+r.w/2, y:r.y+r.h/2});
  const rectsOverlap=(a,b)=> !(a.x+a.w<=b.x || b.x+b.w<=a.x || a.y+a.h<=b.y || b.y+b.h<=a.y);
  const inside=(pt,r)=> pt.x>=r.x && pt.x<=r.x+r.w && pt.y>=r.y && pt.y<=r.y+r.h;
  const rectsOverlapWithMargin = (rectA, rectB, margin) => {
    const paddedB = { x: rectB.x - margin, y: rectB.y - margin, w: rectB.w + margin*2, h: rectB.h + margin*2 };
    return rectsOverlap(rectA, paddedB);
  };

  function isOnRoad(agent) {
    const pt = { x: agent.x, y: agent.y };
    if (avenidas.some(r => inside(pt, r))) return true;
    if (roadRects.some(r => inside(pt, r))) return true;
    if (roundabouts.some(r => {
      const dist = Math.hypot(pt.x - r.cx, pt.y - r.cy);
      return dist < r.w / 2;
    })) return true;
    return false;
  }
  function getCurrentRoad(agent) {
    const pt = { x: agent.x, y: agent.y };
    for (const road of [...avenidas, ...roadRects]) { if (inside(pt, road)) return road; }
    for (const r of roundabouts) { const dist = Math.hypot(pt.x - r.cx, pt.y - r.cy); if (dist < r.w / 2) return r; }
    return null;
  }

  function scatterRects(n, [wmin,wmax], [hmin,hmax], avoid=[] , bounds=null, sameTypeMargin = 8){
    const placed=[]; const wr=bounds || {x:0,y:0,w:WORLD.w,h:WORLD.h}; let tries=0; const generalMargin = 8;
    while(placed.length<n && tries<3000){tries++;
      const w = srandi(wmin, wmax), h=srandi(hmin,hmax);
      const x = srandi(wr.x+30, wr.x+wr.w-w-30), y = srandi(wr.y+30, wr.y+wr.h-h-30);
      const rect={x,y,w,h};
      if(placed.some(r=>rectsOverlapWithMargin(r,rect, sameTypeMargin))) continue;
      if(avoid.some(r=>rectsOverlapWithMargin(r,rect, generalMargin))) continue;
      placed.push(rect);
    }
    return placed;
  }

  /**
 * Distribuye edificios uniformemente en una zona dada
 * @param {number} n - Número de edificios a colocar
 * @param {array} widthRange - Rango de anchura [min, max]
 * @param {array} heightRange - Rango de altura [min, max]
 * @param {array} avoid - Edificios a evitar
 * @param {object} zone - Zona donde distribuir (x,y,w,h)
 * @param {number} margin - Margen mínimo entre edificios
 */
function distributeEvenly(n, widthRange, heightRange, avoid, zone, margin) {
  const placed = [];
  const [wmin, wmax] = widthRange;
  const [hmin, hmax] = heightRange;

  const maxAttempts = Math.max(500, n * 400);
  let attempts = 0;

  while (placed.length < n && attempts < maxAttempts) {
    attempts++;
    const w = randi(wmin, wmax);
    const h = randi(hmin, hmax);
    const x = rand(Math.max(zone.x + 8, 0), Math.max(zone.x + 8, zone.x + zone.w - w - 8));
    const y = rand(Math.max(zone.y + 8, 0), Math.max(zone.y + 8, zone.y + zone.h - h - 8));
    const rect = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };

    const collides = [...avoid, ...placed].some(o => rectsOverlapWithMargin(rect, o, margin));
    if (!collides) placed.push(rect);
  }

  if (placed.length < n && typeof scatterRects === 'function') {
    const remaining = scatterRects(n - placed.length, widthRange, heightRange, [...avoid, ...placed], zone, margin);
    placed.push(...remaining);
  }

  return placed;
}

  function makeBarriosYCasas(totalNeeded, urbanArea, avoidList = []) {
    barrios.length = 0;
    houses.length = 0;
    cityBlocks.length = 0;

    // Casas en 4 barrios organizados simétricamente
    barrios.length = 0; 
    houses.length = 0; 
    cityBlocks.length = 0;

    const barrioMargin = 40; // Margen desde los bordes
    const barrioSize = {
      w: 380, 
      h: 320
    };

    // Posiciones más simétricas para los barrios
    const barriosPos = [
      {x: barrioMargin, y: barrioMargin}, // Noroeste
      {x: WORLD.w - barrioSize.w - barrioMargin, y: barrioMargin}, // Noreste
      {x: barrioMargin, y: WORLD.h - barrioSize.h - barrioMargin}, // Suroeste
      {x: WORLD.w - barrioSize.w - barrioMargin, y: WORLD.h - barrioSize.h - barrioMargin} // Sureste
    ];

    // Crear los barrios equidistantes
    for(let i=0; i<4; i++){
      const b = {
        ...barriosPos[i], 
        w: barrioSize.w, 
        h: barrioSize.h, 
        name: `Barrio ${i+1}`
      };
      barrios.push(b);
      cityBlocks.push(b);
    }
    // Distribuir casas en los 4 barrios con tamaños variables más grandes
    const pad = 24; // Aumentado padding de 18 a 24 para más espacio
    let totalMade = 0;
    const housesPerBarrio = Math.ceil(totalNeeded / barrios.length);
    for (const b of barrios) {
      let madeInThisBarrio = 0;
      // Usar tamaños variables: 60-90 píxeles para variar como otras edificaciones
      const minHouseSize = 60, maxHouseSize = 90;
      const colsH = Math.max(4, Math.floor((b.w - pad * 2) / (maxHouseSize + 15))); // Ajustado para tamaños mayores
      const rowsH = Math.max(3, Math.floor((b.h - pad * 2) / (maxHouseSize + 15)));
      for (let ry = 0; ry < rowsH && madeInThisBarrio < housesPerBarrio && totalMade < totalNeeded; ry++) {
        for (let rx = 0; rx < colsH && madeInThisBarrio < housesPerBarrio && totalMade < totalNeeded; rx++) {
          // Tamaño aleatorio para cada casa (como fábricas o bancos)
          const hsize = srandi(minHouseSize, maxHouseSize);
          const hx = b.x + pad + rx * (maxHouseSize + 15); // Usar max para espaciado consistente
          const hy = b.y + pad + ry * (maxHouseSize + 15);
          const newH = { x: hx, y: hy, w: hsize, h: hsize, ownerId: null, rentedBy: null };
          if ([...avenidas, ...roundabouts].some(av => rectsOverlapWithMargin(av, newH, 8))) continue;
          houses.push(newH);
          totalMade++; madeInThisBarrio++;
        }
      }
    }
  }

  function buildAvenidas(urbanArea, avoidRect = null){
    avenidas.length=0; roundabouts.length=0;
    const avW=26;
    const vDivs = 4, hDivs = 3;
    const vPoints = [], hPoints = [];
    for (let i = 1; i < vDivs; i++) vPoints.push(urbanArea.x + Math.floor(urbanArea.w * i / vDivs));
    for (let i = 1; i < hDivs; i++) hPoints.push(urbanArea.y + Math.floor(urbanArea.h * i / hDivs));
    for (const vx of vPoints) avenidas.push({x:vx-avW/2, y:urbanArea.y, w:avW, h:urbanArea.h});
    for (const hy of hPoints) avenidas.push({x:urbanArea.x, y:hy-avW/2, w:urbanArea.w, h:avW});
    for (const vx of vPoints) for (const hy of hPoints) {
      if (Math.random() > 0.6) continue;
      const rRadius = randi(50, 85);
      const newRoundabout = {x:vx-rRadius, y:hy-rRadius, w:rRadius*2, h:rRadius*2, cx:vx, cy:hy};
      if (avoidRect && rectsOverlap(newRoundabout, avoidRect)) continue;
      roundabouts.push(newRoundabout);
    }
  }

  function regenInfrastructure(preserveHouses=false){
    streets.length=factories.length=banks.length=malls.length=0; government.placed.length=0;
    if(!preserveHouses){ houses.length=0; barrios.length=0; }

    // --- Semilla fija para el mundo ---
    setSeed(20250824);

    // Gobierno en el centro
    const parkW = 220, parkH = 140, parkGap = 24;
    const govComplexW = government.w + 2 * parkW + 2 * parkGap;
    const govComplexH = government.h + 2 * parkH + 2 * parkGap;
    const govComplexRect = {
        x: WORLD.w / 2 - govComplexW / 2,
        y: WORLD.h / 2 - govComplexH / 2,
        w: govComplexW,
        h: govComplexH
    };
    buildAvenidas({x:0, y:0, w:WORLD.w, h:WORLD.h}, govComplexRect);

    // Posicionar el gobierno
    government.x = govComplexRect.x + parkW + parkGap;
    government.y = govComplexRect.y + parkH + parkGap;
    // Agregar el edificio de gobierno como imagen
    government.placed.push({
      k: 'gobierno',
      label: 'Gobierno',
      x: government.x,
      y: government.y,
      w: government.w,
      h: government.h
    });
    
    // Distribuir parques más pequeños por el mapa
    const parkType = GOV_TYPES.find(t=>t.k==='parque');
    if(parkType) {
      const parksCount = (CFG && typeof CFG.PARKS === 'number') ? CFG.PARKS : 4;
      // Definir tamaños más pequeños para los parques
      const smallParkW = 100; // reducido de ~220
      const smallParkH = 70;  // reducido de ~140
      const mediumParkW = 120;
      const mediumParkH = 85;
      
      // Crear lista de áreas a evitar
      const avoidList = [
        government,
        cemetery,
        ...avenidas,
        ...roundabouts,
        ...houses,
        ...barrios,
        // Área de exclusión alrededor del gobierno (margen extra)
        { x: government.x - 160, y: government.y - 160, w: government.w + 320, h: government.h + 320 }
      ];
      const parkLocations = scatterRects(
        parksCount, 
        [smallParkW, mediumParkW], 
        [smallParkH, mediumParkH], 
        avoidList, 
        null, 
        120 // margen entre parques
      );
      
      // Iconos variados para los parques
      const parkIcons = [
        '🌳🌲', '🌲🌳', '🌴🌳', '🌳🌴', 
        '🌲🌴', '🌴🌲', '🌳', '🌲', '🌴'
      ];
      
      // Agregar parques al mapa con variedad de iconos
      parkLocations.forEach((park, i) => {
        const randomIcon = parkIcons[Math.floor(Math.random() * parkIcons.length)];
        
        government.placed.push({
          ...parkType,
          x: park.x,
          y: park.y,
          w: park.w,
          h: park.h,
          icon: randomIcon,
          fill: '#22c55e',
          stroke: '#166534',
          label: `Parque ${i+1}`
        });
      });
      