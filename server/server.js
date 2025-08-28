const express = require('express');
const http = require('http');
const path = require('path');
const socketIO = require('socket.io');
const { initSocketHandlers } = require('./socketHandlers');
const { initGameEngine, updateGame } = require('./gameEngine');

// Configuración del servidor
const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const PORT = process.env.PORT || 3000;

// Servir archivos estáticos desde la carpeta client
app.use(express.static(path.join(__dirname, '../client')));

// Rutas
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// Inicializar el motor del juego
const gameState = initGameEngine();

// Configurar Socket.io
initSocketHandlers(io, gameState);

// Actualizar el juego cada 100ms (10 veces por segundo)
setInterval(() => {
  updateGame(gameState);
  // Emitir actualizaciones de estado a todos los clientes
  io.emit('gameUpdate', gameState);
}, 100);

// Iniciar el servidor
server.listen(PORT, () => {
  console.log(`Servidor ejecutándose en el puerto ${PORT}`);
});