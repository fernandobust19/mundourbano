// Archivo restaurado: sin <script> ni IIFE innecesario
  const $ = s => document.querySelector(s);
  const show = (el, on=true)=> el.style.display = on? 'flex':'none';
  const toastLimiter = { last: 0, gap: 400 }; // ms
  const toast = (msg)=>{
    const now = performance.now();
    if (now - toastLimiter.last < toastLimiter.gap) return;
    toastLimiter.last = now;
    const t=("#toast"); 
    const _t = document.querySelector(t);
    if(_t){ _t.textContent=msg; _t.style.display='block'; clearTimeout(toast._id); toast._id=setTimeout(()=>_t.style.display='none',2400); }
  };

  window.addEventListener('error', e => { try{toast('⚠️ Error: '+(e.message||'JS'));}catch(_){} });
  window.addEventListener('unhandledrejection', e => { try{toast('⚠️ Promesa: '+(e.reason?.message||'error'));}catch(_){} });

  // Red: helpers para multijugador
  const hasNet = () => !!(window.sock && window.sock.connected);
  let __lastNetSend = 0;

  // ====== SUAVIZADO REMOTO (nuevo) ======
  const REMOTE = {
    BUFFER: {},     // id -> [{x,y,t}, ...]
    SMOOTH: {},     // id -> {x,y,vx,vy}
    STATS: {},      // id -> {delay, iat:[], lastTs:0}
    BASE_DELAY: 110,     // ms mínimo (sube a 120 si ves micro-tirón)
    DELAY_MAX: 170,      // ms tope
    EXTRA_GUARD: 10,     // ms sobre p80
    MAX_BUF: 24,         // snapshots guardados
    K: 18.0,             // rigidez del filtro crítico (12–24)
    DEADZONE: 0.18       // px: evita microtemblores
  };

    /* ===== FORMULARIO ===== */
  const formBar = $("#formBar"), fGender=$("#fGender"), fName=$("#fName"), fAge=$("#fAge"), fUsd=$("#fUsd");
  const fGenderPreview = document.getElementById('fGenderPreview');
  const MALE_IMG = 'https://i.postimg.cc/x8cc0drr/20250820-102743.png';
  const FEMALE_IMG = 'https://i.postimg.cc/C1vRTqQH/20250820-103145.png';
  function updateGenderPreview(){ try{ if(!fGender || !fGender.value) return; fGenderPreview.src = fGender.value === 'M' ? MALE_IMG : FEMALE_IMG; }catch(e){} }
  if(fGender){ fGender.addEventListener('change', updateGenderPreview); updateGenderPreview(); }
  const btnStart=$("#btnStart"), btnRandLikes=$("#btnRandLikes"), errBox=$("#errBox");
  const likesWrap=$("#likesWrap"), likesCount=$("#likesCount");
  const getBoxes=()=> Array.from(likesWrap.querySelectorAll('input[type="checkbox"]'));
  const getChecked=()=> getBoxes().filter(x=>x.checked);
  function updateLikesUI(){const count = getChecked().length;likesCount.textContent = count;const disableOthers = count >= 5;getBoxes().forEach(cb=>{if(!cb.checked){cb.disabled = disableOthers;cb.closest('.chip')?.classList.toggle('disabled', disableOthers);}else{cb.disabled = false;cb.closest('.chip')?.classList.remove('disabled');}});}
  function attachLimit(){getBoxes().forEach(cb=>{['click','change','touchend'].forEach(ev=>{cb.addEventListener(ev, ()=>{const checked=getChecked();if(checked.length>5){cb.checked=false;}updateLikesUI();},{passive:true});});});}
  attachLimit(); updateLikesUI();
  btnRandLikes.onclick = ()=>{getBoxes().forEach(cb=>{ cb.checked=false; cb.disabled=false; cb.closest('.chip')?.classList.remove('disabled'); });const boxes = getBoxes(); let picks = 0;while(picks<5){ const i=(Math.random()*boxes.length)|0; if(!boxes[i].checked){ boxes[i].checked=true; picks++; } }updateLikesUI();};

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
  let placingGov = null, placingHouse = null, placingShop = null;

  const isMobile = ()=> innerWidth<=768;
  let ZOOM=1.0, ZMIN=0.6, ZMAX=2.0, ZSTEP=0.15;
  const WORLD={w:0,h:0}; const cam={x:0,y:0};
  function setWorldSize(){const vw=innerWidth, vh=innerHeight;WORLD.w = Math.floor(vw * (isMobile()? 3.6 : 2.8));WORLD.h = Math.floor(vh * (isMobile()? 3.2 : 2.6));}
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

  /* ===== CONFIGURACIÓN ===== */
  const CFG = {
  LINES_ON:true, PARKS:4, SCHOOLS:4, FACTORIES:6, BANKS:4, MALLS:2, HOUSE_SIZE:22, CEM_W:220, CEM_H:130, N_INIT:10,
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
    {k:'biblioteca', label:'Biblioteca', cost:CFG.COST_LIBRARY, w:140,h:90, icon:'📖', fill:'#a16207', stroke:'#fde047'},
    {k:'policia', label:'Policía', cost:CFG.COST_POLICE, w:150,h:80, icon:'🚓', fill:'#3b82f6', stroke:'#dbeafe'},
    {k:'hospital', label:'Hospital', cost:CFG.COST_HOSPITAL, w:180,h:100, icon:'🏥', fill:'#f1f5f9', stroke:'#ef4444'},
    {k:'central_electrica', label:'Central Eléctrica', cost:CFG.COST_POWER, w:200,h:120, icon:'⚡', fill:'#475569', stroke:'#facc15'},
    {k:'bomberos', label:'Cuerpo de Bomberos', cost:220, w:160,h:85, icon:'🚒', fill:'#7c2d12', stroke:'#fecaca'},
    {k:'registro_civil', label:'Registro Civil', cost:180, w:150,h:85, icon:'🪪', fill:'#0f172a', stroke:'#94a3b8'},
    {k:'universidad', label:'Universidad Pública', cost:300, w:200,h:120, icon:'🎓', fill:'#1e293b', stroke:'#93c5fd'},
    {k:'tribunal', label:'Tribunal / Corte', cost:260, w:170,h:95, icon:'⚖️', fill:'#111827', stroke:'#9ca3af'},
    {k:'museo', label:'Museo', cost:200, w:160,h:90, icon:'🏛️', fill:'#3f3f46', stroke:'#cbd5e1'},
    {k:'teatro', label:'Teatro', cost:190, w:160,h:90, icon:'🎭', fill:'#1f2937', stroke:'#9ca3af'},
    {k:'estadio', label:'Estadio', cost:350, w:230,h:140, icon:'🏟️', fill:'#0b3a1e', stroke:'#10b981'},
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

  /* ===== Estructuras almacenadas ===== */
  const streets=[], factories=[], banks=[], malls=[], houses=[], barrios=[], deceased=[], avenidas=[], roundabouts=[], shops=[];
  const SHOP_TYPES = [
      {k:'panadería', icon:'🥖', like:'pan', price:1, buyCost: 400},
      {k:'kiosco', icon:'🏪', like:'kiosco', price:1, buyCost: 450},
      {k:'juguería', icon:'🥣', like:'jugos', price:1, buyCost: 500},
      {k:'cafetería', icon:'☕', like:'café', price:2, buyCost: 800},
      {k:'heladería', icon:'🍨', like:'helado', price:2, buyCost: 850},
      {k:'pizzería', icon:'🍕', like:'pizza', price:2, buyCost: 900},
      {k:'librería', icon:'📚', like:'libros', price:2, buyCost: 1000},
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
      if(Array.isArray(payload?.shops)){
        shops.length = 0; payload.shops.forEach(s=> shops.push({...s}));
      }
      if(Array.isArray(payload?.houses)){
        window.__netHouses = payload.houses.map(h=> ({...h}));
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
      const w = randi(wmin, wmax), h=randi(hmin,hmax);
      const x = randi(wr.x+30, wr.x+wr.w-w-30), y = randi(wr.y+30, wr.y+wr.h-h-30);
      const rect={x,y,w,h};
      if(placed.some(r=>rectsOverlapWithMargin(r,rect, sameTypeMargin))) continue;
      if(avoid.some(r=>rectsOverlapWithMargin(r,rect, generalMargin))) continue;
      placed.push(rect);
    }
    return placed;
  }

  function makeBarriosYCasas(totalNeeded, urbanArea, avoidList = []) {
    barrios.length = 0; houses.length = 0; cityBlocks.length = 0;
    const nBarrios = 4;
    const barriosTemp = scatterRects(nBarrios, [400, 550], [300, 450], avoidList, urbanArea);
    barrios.push(...barriosTemp.map((b, i) => ({...b, name: `Barrio ${i+1}`})));
    cityBlocks.push(...barrios);

    const hsize = CFG.HOUSE_SIZE, pad = 18;
    let totalMade = 0;
    const housesPerBarrio = Math.ceil(totalNeeded / (barrios.length || 1));

    for (const b of barrios) {
      if (totalMade >= totalNeeded) break;
      let madeInThisBarrio = 0;
      const colsH = Math.max(5, Math.floor((b.w - pad * 2) / (hsize + 10)));
      const rowsH = Math.max(4, Math.floor((b.h - pad * 2) / (hsize + 10)));

      for (let ry = 0; ry < rowsH && madeInThisBarrio < housesPerBarrio && totalMade < totalNeeded; ry++) {
        for (let rx = 0; rx < colsH && madeInThisBarrio < housesPerBarrio && totalMade < totalNeeded; rx++) {
          const hx = b.x + pad + rx * (hsize + 10), hy = b.y + pad + ry * (hsize + 10);
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
    // ubicar complejo de gobierno centrado
    const parkW = 180, parkH = 110, parkGap = 15;
    const govComplexW = government.w + 2 * parkW + 2 * parkGap;
    const govComplexH = government.h + 2 * parkH + 2 * parkGap;
    const govComplexRect = {
        x: WORLD.w / 2 - govComplexW / 2,
        y: WORLD.h / 2 - govComplexH / 2,
        w: govComplexW,
        h: govComplexH
    };
    buildAvenidas({x:0, y:0, w:WORLD.w, h:WORLD.h}, govComplexRect);

    const originalAvenidas = [...avenidas];
    avenidas.length = 0;
    for (const av of originalAvenidas) {
        if (rectsOverlap(av, govComplexRect)) {
            if (av.w > av.h) {
                const leftW = govComplexRect.x - av.x;
                if (leftW > 10) avenidas.push({ x: av.x, y: av.y, w: leftW, h: av.h });
                const rightX = govComplexRect.x + govComplexRect.w;
                const rightW = (av.x + av.w) - rightX;
                if (rightW > 10) avenidas.push({ x: rightX, y: av.y, w: rightW, h: av.h });
            } else {
                const topH = govComplexRect.y - av.y;
                if (topH > 10) avenidas.push({ x: av.x, y: av.y, w: av.w, h: topH });
                const bottomY = govComplexRect.y + govComplexRect.h;
                const bottomH = (av.y + av.h) - bottomY;
                if (bottomH > 10) avenidas.push({ x: av.x, y: bottomY, w: av.w, h: bottomH });
            }
        } else {
            avenidas.push(av);
        }
    }

    government.x = govComplexRect.x + parkW + parkGap;
    government.y = govComplexRect.y + parkH + parkGap;
    
    const parkType = GOV_TYPES.find(t=>t.k==='parque');
    if(parkType){
      government.placed.push({...parkType, x: government.x + government.w/2 - parkW/2, y: government.y - parkH - parkGap, w: parkW, h: parkH});
      government.placed.push({...parkType, x: government.x + government.w/2 - parkW/2, y: government.y + government.h + parkGap, w: parkW, h: parkH});
      government.placed.push({...parkType, x: government.x - parkW - parkGap, y: government.y + government.h/2 - parkH/2, w: parkW, h: parkH});
      government.placed.push({...parkType, x: government.x + government.w + parkGap, y: government.y + government.h/2 - parkH/2, w: parkW, h: parkH});
    }

    let avoidList = [government, ...avenidas, ...roundabouts, ...government.placed];
    if(!preserveHouses){ makeBarriosYCasas(CFG.N_INIT + 24, null, avoidList); }
    avoidList.push(...houses, ...barrios);

    const builderRect = scatterRects(1, [builder.w, builder.w], [builder.h, builder.h], avoidList, null)[0];
    if(builderRect) { Object.assign(builder, builderRect); avoidList.push(builder); }
    const cemeteryRect = scatterRects(1, [cemetery.w, cemetery.w], [cemetery.h, cemetery.h], avoidList, null)[0];
    if(cemeteryRect) { Object.assign(cemetery, cemeteryRect); avoidList.push(cemetery); }

    const initialGovTypes = ['escuela', 'hospital', 'policia', 'biblioteca'];
    for(const typeKey of initialGovTypes) {
        const type = GOV_TYPES.find(t => t.k === typeKey);
        if(type) {
            const newBuildings = scatterRects(2, [type.w, type.w], [type.h, type.h], avoidList, null, 50);
            newBuildings.forEach(b => government.placed.push({...type, ...b}));
            avoidList.push(...newBuildings);
        }
    }

    const sameTypeDist = 50;
    factories.push(...scatterRects(CFG.FACTORIES,[140,180],[90,120], avoidList, null, sameTypeDist)); avoidList.push(...factories);
    const newBanks = scatterRects(CFG.BANKS,[110,140],[70,90], avoidList, null, sameTypeDist);
    if (newBanks.length > 0) { newBanks[newBanks.length - 1].isFuchsia = true; }
    banks.push(...newBanks); avoidList.push(...banks);
    malls.push(...scatterRects(CFG.MALLS,[110,140],[75,95], avoidList, null, sameTypeDist));
  }

  /* ===== AGENTES Y ECONOMÍA ===== */
  let agents=[], nextId=1, STARTED=false, USER_ID=null, frameCount = 0, socialConnections = [];
  const yearsSince=(epoch)=> (performance.now()/1000 - epoch) * CFG.YEARS_PER_SECOND;
  function someLikes(nMin=6, nMax=9){const pool = ['música','arte','deporte','naturaleza','lectura','cocina','baile','tecnología','cine','viajes','jardinería','fotografía','animales','playa','montaña','videojuegos','yoga','meditación','correr','ciclismo','fútbol','baloncesto','natación','astronomía','historia','poesía','teatro','idiomas','programación','pintura','café','helado','pan','pizza','libros','electrónica','juguetes','comida','jugos','kiosco'];const n = randi(nMin,nMax+1); const set=new Set(); while(set.size<n) set.add(pool[(Math.random()*pool.length)|0]); return [...set];}
  const freeHouseForRent=()=> houses.findIndex(h=>!h.ownerId && !h.rentedBy);
  function assignRental(a){ const idx=freeHouseForRent(); if(idx>=0){ houses[idx].rentedBy=a.id; a.houseIdx=idx; return true;} return false; }
  let SHOW_LINES = true; toggleLinesBtn.onclick = ()=>{ SHOW_LINES = !SHOW_LINES; toast('Líneas ' + (SHOW_LINES?'ON':'OFF')); };
  function likeMatches(a,b){const set = new Set(a.likes);let m=0; for(const l of b.likes){ if(set.has(l)) m++; }return m;}

  function makeAgent(kind='adult', opts={}){
    const pos={x: rand(40, WORLD.w-40), y: rand(40, WORLD.h-40)};
    const gender=opts.gender || ((Math.random()<0.5)?'M':'F');
    const ageYears = (typeof opts.ageYears==='number')? opts.ageYears : rand(18,60);
    const bornEpoch = performance.now()/1000 - (ageYears/CFG.YEARS_PER_SECOND);
    const likes = (opts.likes && opts.likes.length)? opts.likes.slice() : someLikes();
    const id = nextId++;
    const codeName = (opts.name && opts.name.trim())? opts.name.trim().slice(0,12) : (gender==='M'?('M'+((Math.random()*90+10)|0)):('F'+((Math.random()*90+10)|0)));
    return { id, x:pos.x, y:pos.y, vx:0, vy:0, speed: CFG.SPEED, vehicle: null, isDriving: false, gender, code: codeName,
      state: kind==='child'?'child':'single', spouseId:null, houseIdx:null, bornEpoch, likes, money: (opts.startMoney!=null?opts.startMoney:100),
        workingUntil:null, nextWorkAt: performance.now()/1000 + rand(0, 1), pendingDeposit:0, goingToBank:false, target:null, targetRole:null,
        cooldownSocial:0, parents: opts.parents || null, employedAtShopId: null, forcedShopId: null, _shopDwellStarted: false, shopDwellEnds: null,
        visitedNewShops: {}, justMarried: null, goingToWork: false, workFactoryId: null
    };
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
  function drawGrid(){const step = 120*ZOOM;ctx.lineWidth=1; ctx.strokeStyle='#27324c'; ctx.globalAlpha=0.45;const xStart = Math.floor((cam.x)/(step/ZOOM))*(step/ZOOM), xEnd = cam.x + canvas.width/ZOOM + step/ZOOM;for(let x=xStart; x<=xEnd; x+=step/ZOOM){ const p1=toScreen(x,0); ctx.beginPath(); ctx.moveTo(p1.x,0); ctx.lineTo(p1.x,canvas.height); ctx.stroke(); }const yStart = Math.floor((cam.y)/(step/ZOOM))*(step/ZOOM), yEnd = cam.y + canvas.height/ZOOM + step/ZOOM;for(let y=yStart; y<=yEnd; y+=step/ZOOM){ const p1=toScreen(0,y); ctx.beginPath(); ctx.moveTo(0,p1.y); ctx.lineTo(canvas.width,p1.y); ctx.stroke(); }ctx.globalAlpha=1;}

  function drawAvenidas(){
    for(const av of avenidas){
      const p=toScreen(av.x,av.y);
      ctx.fillStyle='rgba(75,85,99,0.95)'; ctx.fillRect(p.x,p.y,av.w*ZOOM,av.h*ZOOM);
      ctx.strokeStyle='rgba(156,163,175,0.95)'; ctx.lineWidth=2*ZOOM; ctx.strokeRect(p.x,p.y,av.w*ZOOM,av.h*ZOOM);
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
      const p=toScreen(b.x,b.y);
      ctx.fillStyle='rgba(12,18,42,0.55)'; ctx.fillRect(p.x,p.y,b.w*ZOOM,b.h*ZOOM);
      ctx.strokeStyle='rgba(51,65,85,0.9)'; ctx.lineWidth=2*ZOOM; ctx.strokeRect(p.x,p.y,b.w*ZOOM,b.h*ZOOM);
      ctx.font=`700 ${Math.max(10,14*ZOOM)}px system-ui,Segoe UI`; ctx.fillStyle='rgba(147,197,253,0.95)';
      ctx.fillText(b.name, p.x+8*ZOOM, p.y+18*ZOOM);
    }
  }

  function drawWorld(){
    ctx.fillStyle = '#0b1220';ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawGrid(); drawAvenidas(); drawRoundabouts();
    for(const r of roadRects){const p=toScreen(r.x,r.y);ctx.fillStyle='rgba(75,85,99,0.95)';ctx.fillRect(p.x,p.y,r.w*ZOOM,r.h*ZOOM);ctx.strokeStyle='rgba(156,163,175,0.9)';ctx.lineWidth=1*ZOOM; ctx.strokeRect(p.x,p.y,r.w*ZOOM,r.h*ZOOM);}

    for(const f of factories){ drawRoundRect(f,'rgba(63,51,81,0.92)','rgba(167,139,250,0.95)',8,3); drawLabelIcon(f,'Fábrica','🏭'); }

    drawRoundRect(builder,'rgba(58,74,47,0.92)','rgba(163,230,53,0.95)',10,3); drawLabelIcon(builder,'Constructora','🏗️');
    drawRoundRect(cemetery,'rgba(51,65,85,0.92)','rgba(148,163,184,0.95)',10,3); drawLabelIcon(cemetery,'Cementerio','✝');
    drawRoundRect(government,'rgba(34,40,80,0.95)','rgba(147,197,253,0.95)',10,3);
    try{
      const pg = toScreen(government.x, government.y);
      const gw = government.w * ZOOM, gh = government.h * ZOOM;
      ctx.font = `900 ${Math.max(28, 48 * ZOOM)}px system-ui,Segoe UI,Arial,emoji`;
      ctx.textAlign = 'center'; ctx.fillStyle = 'white';
      ctx.fillText('🏛️', pg.x + gw/2, pg.y + gh/2 + (18 * ZOOM));
    }catch(e){ drawLabelIcon(government,'Gobierno','🏛️'); }

    for(const b of banks){
      const fill = b.isFuchsia ? 'fuchsia' : 'rgba(250,204,21,0.95)';
      const stroke = b.isFuchsia ? '#f5d0fe' : 'rgba(202,138,4,0.95)';
      drawRoundRect(b, fill, stroke, 8, 3);
      drawLabelIcon(b,'Banco','💰');
    }
    for(const m of malls){ drawRoundRect(m,'rgba(239,68,68,0.92)','rgba(254,202,202,0.95)',8,3); drawLabelIcon(m,'Mall','🛍️'); }

    for(const s of shops){
      drawRoundRect(s,'rgba(17,24,39,0.92)','rgba(148,163,184,0.95)',8,2);
      const p = toScreen(s.x, s.y);
      const labelFontSize = Math.max(8, 16 * ZOOM);
      ctx.font = `700 ${labelFontSize}px system-ui,Segoe UI,Arial,emoji`;
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 4 * ZOOM;
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.textAlign = 'left';
      const label = `${s.kind} ($${s.price}) ${s.hasEmployee ? '👔' : ''}`;
      ctx.fillText(label, p.x + 10 * ZOOM, p.y + 20 * ZOOM);
      ctx.textAlign = 'right';
      ctx.fillText(s.icon, p.x + s.w * ZOOM - 10 * ZOOM, p.y + 45 * ZOOM);
      if (s.cashbox > 0) {
        const fontSize = Math.max(8, 14 * ZOOM);
        ctx.font = `700 ${fontSize}px system-ui,Segoe UI,Arial`;
        ctx.fillStyle = 'var(--ok)';
        ctx.textAlign = 'center';
        ctx.fillText(`Caja: ${Math.floor(s.cashbox)}`, p.x + (s.w * ZOOM) / 2, p.y + s.h * ZOOM - 12 * ZOOM);
      }
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    }

    for(const inst of government.placed){
      drawRoundRect(inst, inst.fill, inst.stroke, 10, 3);
      if(inst.k === 'carcel'){
        const p = toScreen(inst.x, inst.y);
        const w = inst.w * ZOOM, h = inst.h * ZOOM;
        ctx.fillStyle = 'rgba(20,20,20,0.9)';
        ctx.fillRect(p.x, p.y, w, h);
        ctx.fillStyle = 'rgba(220,220,220,0.95)';
        const bars = Math.max(3, Math.floor(inst.w/10));
        for(let i=0;i<bars;i++){ const bx = p.x + 6*ZOOM + i * (w - 12*ZOOM) / Math.max(1,bars-1); ctx.fillRect(bx, p.y+6*ZOOM, 3*ZOOM, h - 12*ZOOM); }
        ctx.fillStyle = '#fff'; ctx.font=`700 ${Math.max(10, 14*ZOOM)}px system-ui`; ctx.textAlign='center'; ctx.fillText('CÁRCEL', p.x + w/2, p.y + 18*ZOOM);
      } else {
        drawLabelIcon(inst, inst.label, inst.icon);
      }
    }

    for(const h of houses){
      const p=toScreen(h.x,h.y);
      ctx.fillStyle=h.ownerId?'#65a30d':'#b45309';
      ctx.fillRect(p.x,p.y,h.w*ZOOM,h.h*ZOOM);
      ctx.fillStyle=h.ownerId?'#4d7c0f':'#92400e';
      ctx.beginPath();ctx.moveTo(p.x-2*ZOOM,p.y); ctx.lineTo(p.x+h.w*ZOOM+2*ZOOM,p.y);ctx.lineTo(p.x+h.w*ZOOM-3*ZOOM,p.y-5*ZOOM); ctx.lineTo(p.x+3*ZOOM,p.y-5*ZOOM); ctx.closePath(); ctx.fill();
      ctx.fillStyle='#111827'; ctx.fillRect(p.x+h.w*ZOOM/2-3*ZOOM, p.y+h.h*ZOOM-8*ZOOM, 6*ZOOM, 8*ZOOM);
    }
    if(Array.isArray(window.__netHouses)){
      for(const h of window.__netHouses){
        const p=toScreen(h.x,h.y);
        ctx.fillStyle='#4ade80';
        ctx.fillRect(p.x,p.y,h.w*ZOOM,h.h*ZOOM);
        ctx.fillStyle='#166534';
        ctx.beginPath();ctx.moveTo(p.x-2*ZOOM,p.y); ctx.lineTo(p.x+h.w*ZOOM+2*ZOOM,p.y);ctx.lineTo(p.x+h.w*ZOOM-3*ZOOM,p.y-5*ZOOM); ctx.lineTo(p.x+3*ZOOM,p.y-5*ZOOM); ctx.closePath(); ctx.fill();
        ctx.fillStyle='#0a0a0a'; ctx.fillRect(p.x+h.w*ZOOM/2-3*ZOOM, p.y+h.h*ZOOM-8*ZOOM, 6*ZOOM, 8*ZOOM);
      }
    }
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
          if (near && matches >= 5 && (aOwnsHouse || bOwnsHouse) && a.state === 'single' && b.state === 'single' && a.gender !== b.gender && a.cooldownSocial <= 0 && b.cooldownSocial <= 0) {
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
        ctx.fillText(`${p.code||'P'}`, pt.x, pt.y - 8*ZOOM);
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
          const shopToManage = myOwnedShops[(Math.random() * myOwnedShops.length) | 0];
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
          else { a.target=null; a.targetRole='idle'; }
        }
      }
      if(!a.forcedShopId && !a.workingUntil && !a.goingToBank && !a.employedAtShopId && (!a.targetRole || a.targetRole==='idle' || a.targetRole==='home')) {
        if (!a.forcedShopId && Math.random() < CFG.VISIT_RATE) {
          const liked = shops.filter(s=> a.likes.includes(s.like) && s.ownerId !== a.id);
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
      if (a.id === USER_ID) { ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 2 * ZOOM; ctx.stroke(); }
      if (a.justMarried && (performance.now() - a.justMarried < 5000)) {
          ctx.font=`700 ${Math.max(12, 18*ZOOM)}px system-ui,Segoe UI,Arial,emoji`;
          ctx.textAlign='center'; ctx.fillText('💕', p.x, p.y - 25 * ZOOM);
      } else if (a.justMarried) { a.justMarried = null; }
      if (ZOOM >= 0.7) {
        ctx.font=`700 ${Math.max(8,12*ZOOM)}px ui-monospace,monospace`;
        ctx.fillStyle='#fff'; ctx.textAlign='center';
        const age = (yearsSince(a.bornEpoch)|0);
        ctx.fillText(`${a.code}·${age}`, p.x, p.y-8*ZOOM);
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
          if(me){ window.sockApi?.update({ x: me.x, y: me.y, money: Math.floor(me.money||0) }); }
          __lastNetSend = t;
        }
      }
    }catch(e){}
    requestAnimationFrame(loop);
  }

  function bankReport(){
    const lines = [];
    const player = agents.find(a => a.id === USER_ID);
    if (player) lines.push(`Jugador (${player.code}): $${Math.floor(player.money)}`);
    const otherAgents = agents.filter(a => a.id !== USER_ID && a.state !== 'child');
    if (otherAgents.length > 0) {
        if (player) lines.push('---');
        const agentLines = otherAgents.map(a => `${a.code}: $${Math.floor(a.money)}`);
        lines.push(...agentLines.sort());
    }
    return lines.join('\n') || 'Sin fondos por ahora.';
  }
  function fullDocument(){
    const total$=Math.round(agents.reduce((s,x)=>s+(x.money||0),0));
    const player = agents.find(a => a.id === USER_ID);
    const playerName = player ? player.code : '—';
    const lines=[];
    lines.push('# Documento');
    lines.push(`Jugador: ${playerName}`);
    lines.push(`Población: ${agents.length} — Total créditos: ${total$} — Fondo Gobierno: ${Math.floor(government.funds)} — Negocios: ${shops.length} — Instituciones: ${government.placed.length}`);
    lines.push('');
    lines.push('## Usuarios en el mundo (tiempo real)');
    // Mostrar todos los usuarios conectados en tiempo real (de gameState)
    let users = [];
    if (window.gameState && Array.isArray(window.gameState.players)) {
      users = window.gameState.players;
    } else {
      users = agents;
    }
    // Filtrar solo humanos (no bots) y no niños si quieres
    const filtered = users.filter(u => !u.isBot && (!u.state || u.state !== 'child'));
    if(filtered.length > 0){
      for(const u of filtered){
        lines.push(`- ${u.code || u.name || u.id}`);
      }
    }else{
      lines.push('No hay usuarios conectados.');
    }
    lines.push('');
    lines.push('## Finanzas por Agente');
    lines.push(bankReport());
    return lines.join('\n');
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
  $("#btnShowGov").onclick = ()=>{ const isVisible = govDock.style.display === 'flex'; if (!isVisible) { govDock.style.display = 'flex'; } else { govDock.style.display = 'none'; } };
  $("#uiHideBtn").onclick = ()=>{ $("#uiDock").style.transform='translateY(-130%)'; show($("#uiShowBtn"),true); };
  $("#uiShowBtn").onclick = ()=>{ $("#uiDock").style.transform='translateY(0)'; show($("#uiShowBtn"),false); };
  panelDepositAll.onclick = ()=>{ if(!USER_ID){ toast('Crea tu persona primero.'); return; } const u=agents.find(a=>a.id===USER_ID); if(!u) return; u.money += (u.pendingDeposit||0); u.pendingDeposit=0; accBankBody.innerHTML = `Saldo de ${u.code}: <span class="balance-amount">${Math.floor(u.money)}</span>`; toast('Depósito realizado.'); };

  function setVisibleWorldUI(on){
    $("#formBar").style.display = on ? 'none' : 'block';
    canvas.style.display = on ? 'block':'none';
    uiDock.style.display = on ? 'flex':'none';
    topBar.style.display = on ? 'flex':'none';
    zoomFab.style.display = on ? 'flex':'none';
    mini.style.display = on ? 'block':'none';
    show($("#uiShowBtn"),false);
    docDock.style.display = 'none';
    govDock.style.display = 'none';
  }

  function startWorldWithUser({name,gender,age,likes,usd}){
    $("#formBar").style.display='none'; setVisibleWorldUI(true); STARTED=true; setWorldSize(); fitCanvas(); regenInfrastructure(false);
    const addCredits = Math.max(0, parseInt(usd||'0',10))*100;
    let startMoney = 100 + addCredits;
    const user=makeAgent('adult',{name, gender, ageYears:age, likes, startMoney});
    try{ user.avatar = (gender === 'M') ? 'https://i.postimg.cc/x8cc0drr/20250820-102743.png' : 'https://i.postimg.cc/C1vRTqQH/20250820-103145.png'; }catch(e){}
    agents.push(user); USER_ID=user.id;
    try{ window.sockApi?.createPlayer({ code: user.code, gender: user.gender, avatar: user.avatar, startMoney: Math.floor(user.money||0) }, ()=>{}); }catch(e){}
    if(!hasNet()){
      for(let i=0;i<CFG.N_INIT;i++) {agents.push(makeAgent('adult',{ageYears:rand(18,60)}));}
    }
    agents.forEach(a => { if (assignRental(a)) { const home = houses[a.houseIdx]; if (home) { a.target = centerOf(home); a.targetRole = 'home'; } } });
    const b0=cityBlocks[0]; if(b0){ cam.x = Math.max(0, b0.x - 40); cam.y = Math.max(0, b0.y - 40); clampCam(); }
    updateGovDesc();
    try{ const uiAvatar = document.getElementById('uiAvatar'); if(uiAvatar && user.avatar) uiAvatar.src = user.avatar; const userName = document.getElementById('userName'); if(userName) userName.textContent = user.code || user.name || 'Usuario'; }catch(e){}
    loop();
  }
  const startHandler = ()=>{const name=fName.value.trim(),gender=fGender.value,age=Math.max(0, Math.min(120, parseInt(fAge.value||'0',10))),likes=getChecked().map(x=>x.value),usd=fUsd.value;if(!name || likes.length!==5){ errBox.style.display='inline-block'; toast('Completa nombre y marca 5 gustos.'); return; }errBox.style.display='none';startWorldWithUser({name,gender,age,likes,usd});};
  btnStart.addEventListener('click', startHandler);
  $("#formInner").addEventListener('submit',(e)=>{ e.preventDefault(); startHandler(); });

  canvas.addEventListener('click', (e)=>{
    if(!STARTED) return;
    const rect = canvas.getBoundingClientRect(); const pt = toWorld(e.clientX-rect.left, e.clientY-rect.top);
    if(isOverUI(e.clientX,e.clientY)) return;

  const allBuildings = [builder,cemetery,government,...banks,...malls,...factories,...houses,...(window.__netHouses||[]),...roadRects,...shops, ...avenidas, ...roundabouts, ...government.placed];

    if(placingHouse){
      const u=agents.find(a=>a.id===placingHouse.ownerId); if(!u){ placingHouse=null; return; }
      const newH = {x: pt.x - placingHouse.size.w/2, y: pt.y - placingHouse.size.h/2, w: placingHouse.size.w, h: placingHouse.size.h, ownerId:u.id, rentedBy:null};
      if(allBuildings.some(r=>rectsOverlapWithMargin(r,newH, 8))){ toast('No se puede colocar (muy cerca de otro edificio).'); return; }
      if((u.money||0) < placingHouse.cost){ toast('Saldo insuficiente.'); placingHouse=null; return; }
      if(hasNet()){
        window.sock?.emit('placeHouse', newH, (res)=>{
          if(res?.ok){ u.money -= placingHouse.cost; placingHouse=null; toast('Casa propia construida 🏠'); }
          else { toast(res?.msg||'Error al colocar casa'); placingHouse=null; }
        });
        return;
      }
      u.money -= placingHouse.cost;
      if(u.houseIdx !== null && houses[u.houseIdx]) { houses[u.houseIdx].rentedBy = null; }
      houses.push(newH); u.houseIdx = houses.length-1; placingHouse=null;
      toast('Casa propia construida 🏠'); return;
    }
    if(placingShop){
      const u=agents.find(a=>a.id===placingShop.ownerId); if(!u){ placingShop=null; return; }
      const rectShop = {x: pt.x - placingShop.size.w/2, y: pt.y - placingShop.size.h/2, w: placingShop.size.w, h: placingShop.size.h};
      if(allBuildings.some(r=>rectsOverlapWithMargin(r,rectShop, 8))){ toast('No se puede colocar aquí (muy cerca).'); return; }
      if((u.money||0) < placingShop.price){ toast('Saldo insuficiente.'); placingShop=null; return; }
      const newShop = { ownerId:u.id, x:rectShop.x, y:rectShop.y, w:rectShop.w, h:rectShop.h, kind:placingShop.kind.k, icon:placingShop.kind.icon, like:placingShop.kind.like, price:placingShop.kind.price, buyCost: placingShop.kind.buyCost };
      if(hasNet()){
        window.sock?.emit('placeShop', newShop, (res)=>{
          if(res?.ok){ u.money -= placingShop.price; placingShop=null; toast('Negocio colocado 🏪'); }
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
          if(res?.ok){ placingGov=null; toast('Construcción realizada ✅'); }
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
    if(inside(pt,builder)){ openBuilderMenu(); return; }
    for(const s of shops){
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

  function drawMiniMap(){
    const w=miniCanvas.width, h=miniCanvas.height; mctx.clearRect(0,0,w,h);
    mctx.fillStyle='#0b142b'; mctx.fillRect(0,0,w,h);
    const sx = w / WORLD.w, sy = h / WORLD.h;
    const mrect=(r,fill)=>{ mctx.fillStyle=fill; mctx.fillRect(Math.max(0,r.x*sx), Math.max(0,r.y*sy), Math.max(1,r.w*sx), Math.max(1,r.h*sy)); };
    cityBlocks.forEach(r=>mrect(r,'#334155'));
    roadRects.forEach(r=>mrect(r,'#9ca3af')); factories.forEach(r=>mrect(r,'#8b5cf6'));
    banks.forEach(r=>mrect(r,'#fde047')); malls.forEach(r=>mrect(r,'#ef4444')); shops.forEach(r=>mrect(r,'#94a3b8'));
    mrect(cemetery,'#cbd5e1'); mrect(builder,'#84cc16'); mrect(government,'#60a5fa');
    government.placed.forEach(r=>{
      if(r.k === 'carcel'){
        mctx.fillStyle = '#111'; mctx.fillRect(Math.max(0,r.x*sx), Math.max(0,r.y*sy), Math.max(1,r.w*sx), Math.max(1,r.h*sy));
        mctx.fillStyle = '#fff'; const bars = 3; const bx = Math.max(0,r.x*sx), by = Math.max(0,r.y*sy), bw = Math.max(1,r.w*sx), bh = Math.max(1,r.h*sy);
        for(let i=0;i<bars;i++){ const px = bx + 4 + i*(bw-8)/(bars-1); mctx.fillRect(px, by+4, 2, bh-8); }
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
          b.textContent=`${t.icon} ${t.k} (Costo: ${t.buyCost}, Venta: $${t.price})`;
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

  setInterval(()=>{if(!STARTED) return; if(hasNet()) return;
    const n = government.placed.length;
    const effRate = Math.min(CFG.WEALTH_TAX_MAX, CFG.WEALTH_TAX_BASE + n*CFG.INSTITUTION_TAX_PER);
    let collected = 0;
    for(const a of agents){
      const taxAmount = (a.money || 0) * effRate;
      if(a.money >= taxAmount){ a.money -= taxAmount; collected += taxAmount; }
    }
    government.funds += collected;
    if(collected > 0){ govFundsEl.textContent = `Fondo: ${Math.floor(government.funds)} (+${Math.round(collected)})`; toast(`Gobierno recaudó ${Math.round(collected)} créditos (tasa ${(effRate*100).toFixed(1)}%).`); }
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

  function isVisible(el){ return getComputedStyle(el).display!=='none'; }
  function ready(){
    setVisibleWorldUI(false);
    populateGovSelect();
    govFundsEl.textContent = `Fondo: ${Math.floor(government.funds)}`;
    updateGovDesc();
    // Integración de red: escuchar estado de servidor
    try{
      if(window.sock){
        window.sock.on('state', applyServerState);
        window.sock.on('govPlaced', ()=>{ try{ if(typeof window.updateGovDesc==='function') window.updateGovDesc(); }catch(e){} });
      }
    }catch(e){}
  }
  ready();
  // setInterval(automaticRoadConstruction, 60_000);
