// routes/dispositivos.js
const express = require('express');
const router = express.Router();
const mysql = require('mysql');

// Configuración de la conexión a MySQL
const conexion = mysql.createConnection({
    host: "localhost",
    database: "sistema",
    user: "root",
    password: "",
});

// Ruta para obtener los dispositivos del usuario
router.get('/api/dispositivos', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ message: "No autorizado" });
    }

    const userId = req.session.user.id; // Obtén el ID del usuario desde la sesión

    const query = "SELECT * FROM dispositivos WHERE usuario_id = ?";
    conexion.query(query, [userId], (error, results) => {
        if (error) {
            console.error('Error al obtener los dispositivos:', error);
            return res.status(500).json({ message: 'Error al obtener los dispositivos' });
        }
        res.json(results);
    });
});

module.exports = router;