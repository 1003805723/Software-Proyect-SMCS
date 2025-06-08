// Cargar variables de entorno del archivo .env
require('dotenv').config(); 

const express = require("express");
const { Pool } = require('pg');
const path = require("path");
const bcrypt = require("bcrypt");
const session = require("express-session");
const cors = require("cors");
const pgSession = require('connect-pg-simple')(session);

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
app.use(cors({
    origin: true,
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, "public")));

// --- CONFIGURACIÓN DE SESIÓN PERSISTENTE ---
app.use(session({
    store: new pgSession({
      pool: pool,
      tableName: 'session'
    }),
    secret: process.env.SESSION_SECRET || 'secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 30 * 24 * 60 * 60 * 1000,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    }
}));

// --- RUTAS DE LA APLICACIÓN ---

// Middleware para proteger rutas
function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/index.html');
    }
    next();
}

// 1. PÁGINA DE INICIO
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// 2. PÁGINA DE REGISTRO
app.get("/registro", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "registroUsuarios.html"));
});

// 3. PROCESO DE REGISTRO
app.post("/registro", async (req, res) => {
    const { ced, nom, correo, pass } = req.body;
    if (!ced || !nom || !correo || !pass) {
        return res.status(400).json({ success: false, message: "Todos los campos son obligatorios." });
    }

    try {
        const { rows } = await pool.query(
            "SELECT * FROM usuarios WHERE cedula = $1 OR correo = $2", 
            [ced, correo]
        );
        
        if (rows.length > 0) {
            return res.status(409).json({ success: false, message: "La cédula o el correo ya existen." });
        }

        const hashedPassword = await bcrypt.hash(pass, 10);
        await pool.query(
            "INSERT INTO usuarios (cedula, nombre, correo, contrasena) VALUES ($1, $2, $3, $4)",
            [ced, nom, correo, hashedPassword]
        );
        
        return res.json({ success: true, redirect: "/index.html" });
    } catch (error) {
        console.error("Error en registro:", error);
        return res.status(500).json({ success: false, message: "Error en el servidor." });
    }
});

// 4. PROCESO DE LOGIN (CORREGIDO)
app.post("/login", async (req, res) => {
    const { correo, pass } = req.body;
    if (!correo || !pass) {
        return res.status(400).json({ success: false, message: "Correo y contraseña son obligatorios." });
    }

    try {
        const { rows } = await pool.query(
            "SELECT * FROM usuarios WHERE correo = $1", 
            [correo]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: "Usuario no encontrado." });
        }
        
        const usuario = rows[0];
        const match = await bcrypt.compare(pass, usuario.contrasena);
        
        if (!match) {
            return res.status(401).json({ success: false, message: "Contraseña incorrecta." });
        }

        const { contrasena, ...usuarioSinPass } = usuario;
        req.session.user = usuarioSinPass;
        
        req.session.save(err => {
            if(err) {
                console.error("Error al guardar sesión:", err);
                return res.status(500).json({ success: false, message: "Error al iniciar sesión."});
            }
            return res.json({ 
                success: true, 
                redirect: "/dashboard",
                user: usuarioSinPass
            });
        });
    } catch (error) {
        console.error("Error en login:", error);
        return res.status(500).json({ success: false, message: "Error en el servidor." });
    }
});

// 5. DASHBOARD (CORREGIDO)
app.get("/dashboard", requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, "public", "paginaPrincipal.html"));
});

// 6. LOGOUT (CORREGIDO)
app.post("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error("Error al cerrar sesión:", err);
            return res.status(500).send("No se pudo cerrar la sesión.");
        }
        res.json({ success: true, redirect: "/" });
    });
});

// 7. RUTAS DE DISPOSITIVOS
const dispositivosRouter = require('./routes/dispositivos');
app.use(dispositivosRouter);

// --- INICIAR SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});