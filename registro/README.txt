Esta carpeta guarda los registros de usuarios y sus partidas.

Archivo nuevo: saldos.xlsx
- Se genera automáticamente si no existe.
- Hoja "Saldos" con columnas: Username, Money, Bank.
- Puedes editar Money/Bank en Excel. Al guardar, el servidor actualiza:
	* users.json (perfil.stats.money/bank)
	* jugadores conectados con ese Username (campo username del login)
- No cambies los encabezados. Los nombres de usuario no distinguen mayúsculas.
- users.json: base de datos simple (no compartir).
- reporte.csv: reporte cronológico de registros, logins y guardados.
