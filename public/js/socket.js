// socket.js - cliente Socket.IO mínimo
(function(){
	'use strict';
	const sock = io({ transports: ['websocket', 'polling'] });
	window.sock = sock;

	// Exponer API sencilla para main.js
	const api = {
		createPlayer(data, cb){
			if(!sock.connected){
				const once = () => { sock.off('connect', once); api.createPlayer(data, cb); };
				sock.on('connect', once);
				return;
			}
			sock.emit('createPlayer', data, (res)=>{
				if(res?.ok && res.id){ window.playerId = res.id; }
				if(typeof cb === 'function') cb(res);
			});
		},
		update(patch){ sock.emit('update', patch); }
	};
	window.sockApi = api;

	sock.on('connect', () => {
		// conectado
		try{ window.__dbgUpdate?.({ connected:true, players:(window.gameState?.players?.length||0), lastState:'connect' }); }catch(e){}
			// modo auto: crea jugador al conectar si no existe
			try{
				const usp = new URLSearchParams(location.search);
				if(usp.get('auto')==='1' && !window.playerId){
					const name = (document.querySelector('#fName')?.value || '').trim() || 'Player';
					const gender = document.querySelector('#fGender')?.value || 'M';
					window.sockApi?.createPlayer({ code:name, gender }, ()=>{});
				}
			}catch(e){}
	});

	sock.on('state', (payload) => {
		try {
		// guarda último estado para el renderer en main.js
		window.gameState = payload;
			// exponer gobierno para helpers y HUD
			window.government = payload?.government || window.government;
			if (typeof window.updateGovDesc === 'function') window.updateGovDesc();
			// Una sola vez: registrar resumen restaurado (negocios/casas y saldo)
			try{
				if(!window.__restoredLogged && window.AUTH){
					const uname = String(window.AUTH.username||'').toLowerCase();
					const shops = Array.isArray(payload?.shops) ? payload.shops : [];
					const houses = Array.isArray(payload?.houses) ? payload.houses : [];
					const myShops = shops.filter(s => String(s.ownerUsername||'').toLowerCase()===uname).length;
					const myHouses= houses.filter(h => String(h.ownerUsername||'').toLowerCase()===uname).length;
					if(typeof window.logActivity === 'function'){
						window.logActivity(`Restaurado: tus casas ${myHouses}, tus negocios ${myShops}`);
					}
					// Si conocemos mi dinero, mostrarlo en el panel del banco
					try{
						const me = Array.isArray(payload?.players) ? payload.players.find(p => p && p.id === window.playerId) : null;
						const money = (me && typeof me.money==='number') ? Math.floor(me.money) : null;
						if(money!=null){
							const el = document.getElementById('bankBody');
							if(el){ el.innerHTML = `Saldo de ${me.code||'tú'}: <span class="balance-amount">${money}</span>`; }
							if(typeof window.logActivity === 'function') window.logActivity(`Saldo restaurado: ${money}`);
						}
					}catch(e){}
					window.__restoredLogged = true;
				}
			}catch(e){}
			// podrías dibujar jugadores/tienda/casas aquí
		try{ window.__dbgUpdate?.({ connected:sock.connected, players:Array.isArray(payload?.players)?payload.players.length:0, lastState:new Date().toLocaleTimeString() }); }catch(e){}
		} catch (e) {}
	});

	// eventos de servidor (opcional por ahora)
	sock.on('playerJoined', () => {});
	sock.on('playerLeft', () => {});
	sock.on('shopPlaced', (shop) => { try{ if(window.logActivity) window.logActivity(`Se colocó un negocio: ${shop?.kind||'negocio'}`); }catch(e){} });
	sock.on('housePlaced', () => { try{ if(window.logActivity) window.logActivity('Se colocó una casa'); }catch(e){} });
	sock.on('govPlaced', (g) => { try{ if(window.updateGovDesc === 'function') window.updateGovDesc(); }catch(e){} try{ if(window.logActivity) window.logActivity(`Gobierno colocó: ${g?.k||g?.label||'instalación'}`); }catch(e){} });
})();
