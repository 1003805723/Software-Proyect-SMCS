// Cargar variables de entorno del archivo .env
require('dotenv').config(); 

const express = require("express");
const { Pool } = require('pg');
const path = require("path");
const bcrypt = require("bcrypt");
const session = require("express-session");
const cors = require("cors");
const pgSession = require('connect-pg-simple')(session); // Para sesiones en DB

const app = express();

// --- CONEXIÓN A LA BASE DE DATOS POSTGRESQL ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

pool.connect((err) => {
    if (err) {
        console.error("Error de conexión a la base de datos PostgreSQL:", err);
        process.exit(1);
    }
    console.log("Conectado a la base de datos PostgreSQL");
});

// --- CONFIGURACIÓN DE MIDDLEWARE ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// *** INICIO DE LA MODIFICACIÓN IMPORTANTE ***
// Esto es para que express-session confíe en el proxy de Railway
app.set('trust proxy', 1); 

// --- CONFIGURACIÓN DE SESIÓN PERSISTENTE Y SEGURA PARA PRODUCCIÓN ---
app.use(session({
    store: new pgSession({
      pool : pool,                // Pool de conexión existente
      tableName : 'session'       // Nombre de la tabla para las sesiones
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 días
        secure: process.env.NODE_ENV === 'production', // Solo https en producción
        httpOnly: true, // Previene acceso desde JS en el cliente
        sameSite: 'lax' // Configuración de seguridad moderna
    }
}));
// *** FIN DE LA MODIFICACIÓN IMPORTANTE ***

// Servir archivos estáticos DESPUÉS de la sesión
app.use(express.static(path.join(__dirname, "public")));

// --- RUTAS DE LA APLICACIÓN ---

// Middleware para proteger rutas que requieren autenticación
function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/index.html');
    }
    next();
}

// 1. PÁGINA DE INICIO -> Sirve el login (index.html)
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// 2. PÁGINA DE REGISTRO DE USUARIOS -> Sirve la página de registro
app.get("/registro", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "registroUsuarios.html"));
});

// 3. PROCESO DE REGISTRO DE USUARIO (POST)
app.post("/registro", async (req, res) => {
    const { ced, nom, correo, pass } = req.body;
    if (!ced || !nom || !correo || !pass) {
        return res.status(400).json({ success: false, message: "Todos los campos son obligatorios." });
    }

    const buscarQuery = "SELECT * FROM usuarios WHERE cedula = $1 OR correo = $2";
    try {
        const { rows } = await pool.query(buscarQuery, [ced, correo]);
        if (rows.length > 0) {
            return res.status(409).json({ success: false, message: "La cédula o el correo ya existen." });
        }

        const hashedPassword = await bcrypt.hash(pass, 10);
        const registrarQuery = "INSERT INTO usuarios (cedula, nombre, correo, contrasena) VALUES ($1, $2, $3, $4)";
        await pool.query(registrarQuery, [ced, nom, correo, hashedPassword]);
        
        console.log("Registro exitoso.");
        return res.json({ success: true, redirect: "/index.html" });
    } catch (error) {
        console.error("Error en DB en /registro:", error);
        return res.status(500).json({ success: false, message: "Error en la base de datos." });
    }
});

// 4. PROCESO DE LOGIN (POST)
app.post("/login", async (req, res) => {
    const { correo, pass } = req.body;
    if (!correo || !pass) {
        return res.status(400).json({ success: false, message: "Correo y contraseña son obligatorios." });
    }

    const buscarQuery = "SELECT * FROM usuarios WHERE correo = $1";
    try {
        const { rows } = await pool.query(buscarQuery, [correo]);
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: "Usuario no encontrado." });
        }
        
        const usuario = rows[0];
        const { contrasena, ...usuarioSinPass } = usuario;
        
        const match = await bcrypt.compare(pass, contrasena);
        
        if (!match) {
            return res.status(401).json({ success: false, message: "Contraseña incorrecta." });
        }

        req.session.user = usuarioSinPass;
        
        req.session.save(err => {
            if(err){
                console.error("Error al guardar la sesión:", err);
                return res.status(500).json({ success: false, message: "Error al iniciar sesión."});
            }
            console.log("Inicio de sesión exitoso y sesión guardada.");
            return res.json({ success: true, redirect: "/dashboard" });
        });

    } catch (error) {
        console.error("Error en DB en /login:", error);
        return res.status(500).json({ success: false, message: "Error en la base de datos." });
    }
});

// 5. PÁGINA PRINCIPAL (DASHBOARD)
app.get("/dashboard", requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, "public", "paginaPrincipal.html"));
});

// 6. CERRAR SESIÓN (LOGOUT)
app.post("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error("Error al cerrar la sesión:", err);
            return res.status(500).send("No se pudo cerrar la sesión.");
        }
        res.redirect("/index.html");
    });
});

// 7. RUTAS DE DISPOSITIVOS
app.get("/dispositivos", requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, "public", "registroDispositivos.html"));
});

app.post("/registrarDispositivo", requireLogin, async (req, res) => {
    const { tipo, marca, modelo, direccion_ip, puerto, usuario, contrasena, ubicacion } = req.body;
    if (!tipo || !marca || !modelo || !ubicacion) {
        return res.status(400).json({ success: false, message: "Campos obligatorios faltantes." });
    }
    const query = "INSERT INTO dispositivos (tipo, marca, modelo, direccion_ip, puerto, usuario, contrasena, ubicacion, usuario_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)";
    const parametros = [tipo, marca, modelo, direccion_ip || null, puerto || null, usuario || null, contrasena || null, ubicacion, req.session.user.id];
    try {
        await pool.query(query, parametros);
        res.json({ success: true, message: "Dispositivo registrado correctamente." });
    } catch (error) {
        console.error("Error al registrar el dispositivo:", error);
        return res.status(500).json({ success: false, message: "Error al registrar el dispositivo." });
    }
});

// 8. RUTAS DE SERVICIOS
app.get("/servicios", requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, "public", "registroServicios.html"));
});

app.post("/registrarServicio", requireLogin, async (req, res) => {
    const { nombre, descripcion, estado } = req.body;
    const query = "INSERT INTO servicios (nombre, descripcion, estado) VALUES ($1, $2, $3)";
    try {
        await pool.query(query, [nombre, descripcion, estado]);
        res.json({ success: true, message: "Servicio registrado con éxito" });
    } catch (error) {
        console.error("Error al registrar servicio:", error);
        return res.status(500).json({ success: false, message: "Error al registrar el servicio" });
    }
});


// --- INICIAR EL SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});