// Maneja los eventos de Socket.io

function initSocketHandlers(io, gameState) {
  io.on('connection', (socket) => {
    console.log(`Nuevo cliente conectado: ${socket.id}`);

    // Enviar estado inicial al cliente
    socket.emit('initialState', gameState);

    // Registrar un nuevo jugador
    socket.on('registerPlayer', (data) => {
      const player = addPlayer(socket.id, data.name);
      socket.emit('playerRegistered', player);
    });

    // Manejar movimiento del jugador
    socket.on('movePlayer', (data) => {
      const player = gameState.players[socket.id];
      if (player) {
        player.x = data.x;
        player.y = data.y;
      }
    });

    // Manejar construcción de una casa
    socket.on('buildHouse', (data) => {
      // Verificar si el jugador tiene suficiente dinero
      const player = gameState.players[socket.id];
      if (player && player.money >= data.cost) {
        player.money -= data.cost;
        
        // Agregar nueva casa
        gameState.houses.push({
          x: data.x,
          y: data.y,
          w: data.w || 60,
          h: data.h || 60,
          owner: socket.id
        });
      }
    });

    // Manejar apertura de un negocio
    socket.on('openShop', (data) => {
      // Verificar si el jugador tiene suficiente dinero
      const player = gameState.players[socket.id];
      if (player && player.money >= data.cost) {
        player.money -= data.cost;
        
        // Agregar nuevo negocio
        gameState.shops.push({
          x: data.x,
          y: data.y,
          w: data.w || 80,
          h: data.h || 80,
          kind: data.kind,
          price: data.price,
          owner: socket.id,
          cashbox: 0
        });
      }
    });

    // Desconexión del jugador
    socket.on('disconnect', () => {
      console.log(`Cliente desconectado: ${socket.id}`);
      
      // Mantener al agente en el juego pero marcarlo como inactivo
      const player = gameState.players[socket.id];
      if (player) {
        player.isActive = false;
        player.state = 'idle';
        
        // Opcional: eliminar al jugador después de cierto tiempo
        // delete gameState.players[socket.id];
        // gameState.agents = gameState.agents.filter(a => a.id !== socket.id);
      }
    });
    
    // Solicitud de sincronización (cuando el cliente vuelve de estar inactivo)
    socket.on('syncRequest', () => {
      socket.emit('syncResponse', gameState);
    });
  });
}

// Agregar un jugador al juego (función importada de gameEngine)
function addPlayer(playerID, name) {
  // Esta función vendría de gameEngine.js
  // Pero la definimos aquí también para mantener el código modular
  const newAgent = {
    id: playerID,
    name: name || `Player_${playerID.substring(0, 4)}`,
    x: Math.random() * 800,
    y: Math.random() * 600,
    money: 100,
    state: 'idle',
    isPlayer: true,
    isActive: true
  };
  
  gameState.agents.push(newAgent);
  gameState.players[playerID] = newAgent;
  
  return newAgent;
}

module.exports = { initSocketHandlers };