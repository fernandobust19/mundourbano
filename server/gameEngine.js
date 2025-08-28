const { SHOP_TYPES, BUILDING_IMAGES } = require('../shared/constants');

// Estado global del juego
let gameState = {
  agents: [],         // Personas
  houses: [],         // Casas
  shops: [],          // Negocios
  factories: [],      // Fábricas
  government: {
    funds: 1000,
    placed: []
  },
  time: 0,            // Tiempo de juego
  players: {},        // Jugadores conectados
  tick: 0             // Contador de ciclos
};

// Inicializa el motor del juego
function initGameEngine() {
  console.log("Inicializando motor del juego...");
  return gameState;
}

// Actualiza el estado del juego (se ejecuta en cada ciclo)
function updateGame(state) {
  state.tick++;
  state.time += 0.1; // Incremento de tiempo

  // Actualizar agentes
  for (const agent of state.agents) {
    updateAgent(agent, state);
  }

  // Actualizar negocios
  for (const shop of state.shops) {
    updateShop(shop, state);
  }

  // Actualizar fábricas
  for (const factory of state.factories) {
    updateFactory(factory, state);
  }

  // Actualizar tiempo, clima, etc.
  // ...
}

// Actualizar un agente individual
function updateAgent(agent, state) {
  // Mover agente según su estado
  if (agent.state === 'goingToShop') {
    // Lógica de movimiento hacia la tienda
  } else if (agent.state === 'goingToWork') {
    // Lógica de movimiento hacia el trabajo
  } else if (agent.state === 'goingHome') {
    // Lógica de movimiento hacia casa
  } else if (agent.state === 'idle') {
    // Decidir nueva actividad
    // ...
  }
  
  // Actualizar economía del agente
  if (agent.workplace && agent.state === 'working') {
    agent.money += agent.salary || 1;
  }
}

// Actualizar un negocio
function updateShop(shop, state) {
  // Lógica de actualización de negocios
  // ...
}

// Actualizar una fábrica
function updateFactory(factory, state) {
  // Lógica de actualización de fábricas
  // ...
}

// Añadir un jugador al juego
function addPlayer(playerID, name) {
  // Crear un nuevo agente para el jugador
  const newAgent = {
    id: playerID,
    name: name || `Player_${playerID.substring(0, 4)}`,
    x: Math.random() * 800,
    y: Math.random() * 600,
    money: 100,
    state: 'idle',
    isPlayer: true
  };
  
  gameState.agents.push(newAgent);
  gameState.players[playerID] = newAgent;
  
  return newAgent;
}

// Exportar funciones para ser usadas en server.js
module.exports = {
  initGameEngine,
  updateGame,
  addPlayer,
  gameState
};