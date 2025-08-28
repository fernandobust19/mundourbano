// Este es el código del cliente que se ejecuta en el navegador

// Conexión con Socket.io
const socket = io();

// Variables globales
let gameState = null;
let playerID = null;
let canvas = null;
let ctx = null;
let lastUpdate = 0;

// Inicialización
window.onload = () => {
  canvas = document.getElementById('gameCanvas');
  ctx = canvas.getContext('2d');
  
  // Ajustar tamaño del canvas
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  
  // Eventos de teclado y mouse
  setupInputEvents();
  
  // Iniciar bucle de renderizado
  requestAnimationFrame(gameLoop);
  
  // Manejar cuando se minimiza la ventana
  document.addEventListener('visibilitychange', handleVisibilityChange);
};

// Eventos de Socket.io
socket.on('connect', () => {
  console.log('Conectado al servidor');
});

socket.on('initialState', (state) => {
  console.log('Estado inicial recibido');
  gameState = state;
  // Si no hay un jugador registrado, registrarlo
  if (!playerID) {
    socket.emit('registerPlayer', {
      name: prompt('¿Cuál es tu nombre?', 'Jugador') || 'Jugador'
    });
  }
});

socket.on('playerRegistered', (player) => {
  console.log('Jugador registrado:', player);
  playerID = player.id;
});

socket.on('gameUpdate', (state) => {
  // Actualizar el estado del juego
  gameState = state;
  lastUpdate = performance.now();
});

socket.on('syncResponse', (state) => {
  gameState = state;
  lastUpdate = performance.now();
  console.log('Estado sincronizado con el servidor');
});

// Funciones principales
function gameLoop(timestamp) {
  // Limpiar canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Dibujar el juego si hay estado
  if (gameState) {
    drawGame();
  } else {
    drawLoadingScreen();
  }
  
  // Continuar el bucle
  requestAnimationFrame(gameLoop);
}

function drawGame() {
  // Dibujar el fondo
  ctx.fillStyle = '#87CEEB'; // Color de cielo
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Dibujar elementos del juego
  drawHouses(gameState.houses);
  drawShops(gameState.shops);
  drawFactories(gameState.factories);
  drawAgents(gameState.agents);
  
  // Dibujar UI
  drawUI();
}

function drawHouses(houses) {
  houses.forEach(house => {
    // Dibujar casa
    ctx.fillStyle = '#A52A2A';
    ctx.fillRect(house.x, house.y, house.w, house.h);
    
    // Si es del jugador, resaltarla
    if (house.owner === playerID) {
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 2;
      ctx.strokeRect(house.x, house.y, house.w, house.h);
    }
  });
}

function drawShops(shops) {
  shops.forEach(shop => {
    // Dibujar tienda con imagen si está disponible
    const img = BUILDING_IMAGES[shop.kind];
    if (img) {
      ctx.drawImage(img, shop.x, shop.y, shop.w, shop.h);
    } else {
      // Dibujo de respaldo si no hay imagen
      ctx.fillStyle = '#4682B4';
      ctx.fillRect(shop.x, shop.y, shop.w, shop.h);
    }
    
    // Mostrar información de la tienda
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '12px Arial';
    ctx.fillText(`${shop.kind} ($${shop.price})`, shop.x, shop.y - 5);
    
    // Si hay dinero en caja, mostrarlo
    if (shop.cashbox > 0) {
      ctx.fillStyle = '#4ADE80';
      ctx.fillText(`Caja: ${Math.floor(shop.cashbox)}`, shop.x, shop.y + shop.h + 15);
    }
  });
}

function drawFactories(factories) {
  factories.forEach(factory => {
    // Dibujar fábrica
    ctx.fillStyle = '#708090';
    ctx.fillRect(factory.x, factory.y, factory.w, factory.h);
    
    // Mostrar información
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '12px Arial';
    ctx.fillText(`Fábrica ($${factory.salary}/h)`, factory.x, factory.y - 5);
  });
}

function drawAgents(agents) {
  agents.forEach(agent => {
    // Color diferente para jugadores vs NPCs
    if (agent.isPlayer) {
      ctx.fillStyle = '#FF0000';
    } else {
      ctx.fillStyle = '#333333';
    }
    
    // Dibujar agente como círculo
    ctx.beginPath();
    ctx.arc(agent.x, agent.y, 5, 0, Math.PI * 2);
    ctx.fill();
    
    // Mostrar nombre
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '10px Arial';
    ctx.fillText(agent.name, agent.x - 10, agent.y - 10);
    
    // Si es el jugador actual, resaltarlo
    if (agent.id === playerID) {
      ctx.strokeStyle = '#00FF00';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(agent.x, agent.y, 8, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
}

function drawUI() {
  // Encontrar al jugador actual
  const player = gameState.players[playerID];
  
  if (player) {
    // Mostrar información del jugador
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(10, 10, 200, 80);
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '16px Arial';
    ctx.fillText(`Nombre: ${player.name}`, 20, 30);
    ctx.fillText(`Dinero: $${Math.floor(player.money)}`, 20, 50);
    ctx.fillText(`Estado: ${player.state}`, 20, 70);
  }
  
  // Mostrar tiempo del juego
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(canvas.width - 110, 10, 100, 30);
  
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '14px Arial';
  ctx.fillText(`Tiempo: ${Math.floor(gameState.time)}`, canvas.width - 100, 30);
}

function drawLoadingScreen() {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '24px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Cargando...', canvas.width / 2, canvas.height / 2);
  ctx.textAlign = 'left';
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function setupInputEvents() {
  // Evento de clic en el canvas
  canvas.addEventListener('click', (e) => {
    if (!gameState || !playerID) return;
    
    const player = gameState.players[playerID];
    if (player) {
      // Mover al jugador
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // Enviar acción al servidor
      socket.emit('movePlayer', { x, y });
    }
  });
  
  // Aquí puedes agregar más eventos de interfaz de usuario
}

// Manejo de visibilidad para sincronizar cuando el usuario vuelve
function handleVisibilityChange() {
  if (document.hidden) {
    // Ventana minimizada o cambio de pestaña
    console.log("Ventana minimizada");
  } else {
    // Ventana visible de nuevo - sincronizar con el servidor
    console.log("Ventana visible de nuevo - solicitando sincronización");
    socket.emit('syncRequest');
  }
}