// Constantes compartidas entre cliente y servidor

// Tipos de negocios disponibles
const SHOP_TYPES = [
  {k:'panaderia', like:'pan', price:1, buyCost: 400},
  {k:'cafeteria', like:'café', price:2, buyCost: 800},
  {k:'libreria', like:'libros', price:2, buyCost: 1000},
  {k:'restaurante', like:'comida', price:3, buyCost: 2500}
];

// Imágenes de edificios
const BUILDING_IMAGES = {
  // Imágenes para negocios
  panaderia: 'https://i.postimg.cc/Bnd2x05L/20250827-071843.png',
  cafeteria: 'https://i.postimg.cc/example-cafeteria.png', 
  libreria: 'https://i.postimg.cc/example-libreria.png',
  restaurante: 'https://i.postimg.cc/example-restaurante.png',
  
  // Imágenes para casas
  casa: 'https://i.postimg.cc/example-casa.png',
  
  // Imágenes para fábricas
  fabrica: 'https://i.postimg.cc/example-fabrica.png'
};

// Configuraciones del juego
const CFG = {
  HOUSE_W: 60,
  HOUSE_H: 60,
  SHOP_W: 80,
  SHOP_H: 80,
  FACTORY_W: 100,
  FACTORY_H: 100
};

// Si estamos en el navegador, exponemos las constantes al global
if (typeof window !== 'undefined') {
  window.SHOP_TYPES = SHOP_TYPES;
  window.BUILDING_IMAGES = BUILDING_IMAGES;
  window.CFG = CFG;
}

// Si estamos en Node.js, exportamos las constantes
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SHOP_TYPES,
    BUILDING_IMAGES,
    CFG
  };
}