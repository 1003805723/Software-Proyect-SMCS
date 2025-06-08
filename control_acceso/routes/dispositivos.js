const express = require('express');
const router = express.Router();

// Ruta para obtener dispositivos
router.get('/dispositivos', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ message: "No autorizado" });
    }

    const query = "SELECT * FROM dispositivos WHERE usuario_id = $1";
    const parametros = [req.session.user.id];

    req.app.locals.pool.query(query, parametros, (error, results) => {
        if (error) {
            console.error('Error al obtener dispositivos:', error);
            return res.status(500).json({ message: 'Error del servidor' });
        }
        res.json(results.rows);
    });
});

// Ruta para registrar dispositivo
router.post('/registrarDispositivo', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ message: "No autorizado" });
    }

    const { tipo, marca, modelo, direccion_ip, puerto, usuario, contrasena, ubicacion } = req.body;
    if (!tipo || !marca || !modelo || !ubicacion) {
        return res.status(400).json({ success: false, message: "Campos obligatorios faltantes." });
    }

    const query = `
        INSERT INTO dispositivos 
        (tipo, marca, modelo, direccion_ip, puerto, usuario, contrasena, ubicacion, usuario_id) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `;
    const parametros = [
        tipo, marca, modelo, 
        direccion_ip || null, 
        puerto || null, 
        usuario || null, 
        contrasena || null, 
        ubicacion, 
        req.session.user.id
    ];

    try {
        await req.app.locals.pool.query(query, parametros);
        res.json({ success: true, message: "Dispositivo registrado correctamente." });
    } catch (error) {
        console.error("Error al registrar dispositivo:", error);
        res.status(500).json({ success: false, message: "Error al registrar el dispositivo." });
    }
});

module.exports = router;