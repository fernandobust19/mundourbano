// brain.js — almacenamiento persistente de usuarios y progreso
// Guarda en un JSON local en la raíz del proyecto.

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'brain.db.json');

let db = {
	users: [], // { id, username, passHash, createdAt, lastLoginAt }
	progress: {}, // userId -> { money, bank, vehicle, shops:[], houses:[] }
	activityLog: [] // { ts, type, userId, details }
};

function saveAtomic(dataStr) {
	const tmp = DB_PATH + '.tmp';
	fs.writeFileSync(tmp, dataStr);
	fs.renameSync(tmp, DB_PATH);
}

function load() {
	try {
		if (fs.existsSync(DB_PATH)) {
			const raw = fs.readFileSync(DB_PATH, 'utf8');
			const parsed = JSON.parse(raw);
			if (parsed && typeof parsed === 'object') db = Object.assign(db, parsed);
		} else {
			persist();
		}
	} catch (e) {
		console.warn('brain load error, starting fresh', e);
	}
}

let _saveTimer = null;
function persist() {
	try {
		const str = JSON.stringify(db, null, 2);
		saveAtomic(str);
	} catch (e) {
		console.warn('brain persist error', e);
	}
}

function schedulePersist() {
	if (_saveTimer) clearTimeout(_saveTimer);
	_saveTimer = setTimeout(() => { _saveTimer = null; persist(); }, 250);
}

function uid() {
	return (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() :
		'u_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function log(type, userId = null, details = null) {
	db.activityLog.push({ ts: Date.now(), type, userId, details });
	if (db.activityLog.length > 5000) db.activityLog.splice(0, db.activityLog.length - 5000);
	schedulePersist();
}

function getUserByUsername(username) {
	return db.users.find(u => u.username.toLowerCase() === String(username || '').toLowerCase());
}

function getUserById(userId) {
	return db.users.find(u => u.id === userId) || null;
}

function ensureProgress(userId) {
	if (!db.progress[userId]) db.progress[userId] = { money: 400, bank: 0, vehicle: null, shops: [], houses: [] };
	return db.progress[userId];
}

function registerUser(username, password) {
	const name = String(username || '').trim();
	if (!name || name.length < 3) return { ok: false, msg: 'Nombre inválido' };
	if (String(password || '').length < 4) return { ok: false, msg: 'Contraseña muy corta' };
	if (getUserByUsername(name)) return { ok: false, msg: 'Usuario ya existe' };

	const passHash = bcrypt.hashSync(String(password), 10);
	const user = { id: uid(), username: name, passHash, createdAt: Date.now(), lastLoginAt: null };
	db.users.push(user);
	ensureProgress(user.id);
	log('register', user.id, { username: name });
	schedulePersist();
	return { ok: true, user: { id: user.id, username: user.username } };
}

function verifyLogin(username, password) {
	const user = getUserByUsername(username);
	if (!user) return { ok: false, msg: 'Usuario o contraseña inválidos' };
	const ok = bcrypt.compareSync(String(password || ''), user.passHash);
	if (!ok) return { ok: false, msg: 'Usuario o contraseña inválidos' };
	user.lastLoginAt = Date.now();
	log('login', user.id, { username: user.username });
	schedulePersist();
	return { ok: true, user: { id: user.id, username: user.username } };
}

function getProgress(userId) {
	if (!userId) return null;
	return ensureProgress(userId);
}

function updateProgress(userId, patch) {
	if (!userId) return { ok: false };
	const p = ensureProgress(userId);
	if (patch == null || typeof patch !== 'object') return { ok: false };
	// Solo campos permitidos
	const allowed = ['money', 'bank', 'vehicle', 'shops', 'houses'];
	for (const k of allowed) {
		if (k in patch) {
			if (k === 'shops' || k === 'houses') {
				if (Array.isArray(patch[k])) p[k] = patch[k];
			} else {
				p[k] = patch[k];
			}
		}
	}
	log('progress_update', userId, { keys: Object.keys(patch || {}) });
	schedulePersist();
	return { ok: true };
}

function addShop(userId, shopObj) {
	const p = ensureProgress(userId);
	p.shops.push(shopObj);
	log('shop_add', userId, { id: shopObj?.id || null });
	schedulePersist();
}

function addHouse(userId, houseObj) {
	const p = ensureProgress(userId);
	p.houses.push(houseObj);
	log('house_add', userId, { id: houseObj?.id || null });
	schedulePersist();
}

function setMoney(userId, money, bank = undefined) {
	const p = ensureProgress(userId);
	if (typeof money === 'number') p.money = Math.max(0, Math.floor(money));
	if (typeof bank === 'number') p.bank = Math.max(0, Math.floor(bank));
	schedulePersist();
}

function setVehicle(userId, vehicle) {
	const p = ensureProgress(userId);
	p.vehicle = vehicle || null;
	schedulePersist();
}

// Cargar al iniciar
load();

module.exports = {
	load,
	persist,
	registerUser,
	verifyLogin,
	getUserById,
	getProgress,
	updateProgress,
	addShop,
	addHouse,
	setMoney,
	setVehicle,
	log
};

