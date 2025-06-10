// Cargar variables de entorno del archivo .env
require('dotenv').config(); 

const express = require("express");
const { Pool } = require('pg');
const path = require("path");
const bcrypt = require("bcrypt");
const session = require("express-session");
const cors = require("cors");
const pgSession = require('connect-pg-simple')(session);
const nodemailer = require('nodemailer'); // <-- AÑADIDO: para enviar correos
const crypto = require('crypto'); // <-- AÑADIDO: para generar códigos seguros

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

// --- CONFIGURACIÓN DEL SERVICIO DE CORREO (NODEMAILER) ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS // La contraseña de aplicación de 16 letras
    }
});

// --- CONFIGURACIÓN DE MIDDLEWARE ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.set('trust proxy', 1); 
app.use(session({
    store: new pgSession({
      pool : pool,
      tableName : 'session'
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 30 * 24 * 60 * 60 * 1000,
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'lax'
    }
}));
app.use(express.static(path.join(__dirname, "public")));

// --- RUTAS DE LA APLICACIÓN ---

// Middleware para proteger rutas
function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/index.html');
    }
    next();
}

// ---- RUTAS EXISTENTES ----
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/registro", (req, res) => res.sendFile(path.join(__dirname, "public", "registroUsuarios.html")));
app.post("/registro", async (req, res) => {
    const { ced, nom, correo, pass } = req.body;
    if (!ced || !nom || !correo || !pass) return res.status(400).json({ success: false, message: "Todos los campos son obligatorios." });
    const buscarQuery = "SELECT * FROM usuarios WHERE cedula = $1 OR correo = $2";
    try {
        const { rows } = await pool.query(buscarQuery, [ced, correo]);
        if (rows.length > 0) return res.status(409).json({ success: false, message: "La cédula o el correo ya existen." });
        const hashedPassword = await bcrypt.hash(pass, 10);
        const registrarQuery = "INSERT INTO usuarios (cedula, nombre, correo, contrasena) VALUES ($1, $2, $3, $4)";
        await pool.query(registrarQuery, [ced, nom, correo, hashedPassword]);
        return res.json({ success: true, redirect: "/index.html" });
    } catch (error) {
        console.error("Error en DB en /registro:", error);
        return res.status(500).json({ success: false, message: "Error en la base de datos." });
    }
});
app.post("/login", async (req, res) => {
    const { correo, pass } = req.body;
    if (!correo || !pass) return res.status(400).json({ success: false, message: "Correo y contraseña son obligatorios." });
    const buscarQuery = "SELECT * FROM usuarios WHERE correo = $1";
    try {
        const { rows } = await pool.query(buscarQuery, [correo]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: "Usuario no encontrado." });
        const usuario = rows[0];
        const { contrasena, ...usuarioSinPass } = usuario;
        const match = await bcrypt.compare(pass, contrasena);
        if (!match) return res.status(401).json({ success: false, message: "Contraseña incorrecta." });
        req.session.user = usuarioSinPass;
        req.session.save(err => {
            if(err) return res.status(500).json({ success: false, message: "Error al iniciar sesión."});
            return res.json({ success: true, redirect: "/dashboard" });
        });
    } catch (error) {
        console.error("Error en DB en /login:", error);
        return res.status(500).json({ success: false, message: "Error en la base de datos." });
    }
});
app.get("/dashboard", requireLogin, (req, res) => res.sendFile(path.join(__dirname, "public", "paginaPrincipal.html")));
app.post("/logout", (req, res) => {
    req.session.destroy(err => {
        if (err) return res.status(500).send("No se pudo cerrar la sesión.");
        res.redirect("/index.html");
    });
});
// ... (resto de tus rutas existentes como /dispositivos, /servicios, etc.)


// ---- INICIO DE LAS NUEVAS RUTAS PARA RESTABLECER CONTRASEÑA ----

// 1. Sirve la página para solicitar el reseteo
app.get('/solicitar-reset', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'solicitar_reset.html'));
});

// 2. Procesa la solicitud, genera el token y envía el correo
app.post('/solicitar-reset', async (req, res) => {
    const { correo } = req.body;
    try {
        const { rows } = await pool.query("SELECT * FROM usuarios WHERE correo = $1", [correo]);
        if (rows.length === 0) {
            // Respondemos con éxito aunque no se encuentre el usuario para no revelar información
            return res.json({ success: true, message: "Si existe una cuenta con ese correo, se ha enviado un enlace para restablecer la contraseña." });
        }
        const usuario = rows[0];
        
        // Generar un token seguro y único
        const token = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 3600000); // El token expira en 1 hora

        // Guardar el token y la fecha de expiración en la base de datos
        await pool.query(
            "UPDATE usuarios SET reset_token = $1, reset_token_expires = $2 WHERE id = $3",
            [token, expires, usuario.id]
        );

        // Enviar el correo electrónico
        const resetLink = `${process.env.BASE_URL}/reestablecer-pass/${token}`;
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: usuario.correo,
            subject: 'Restablecimiento de Contraseña - SMCS',
            html: `
                <p>Hola ${usuario.nombre},</p>
                <p>Has solicitado restablecer tu contraseña. Haz clic en el siguiente enlace para continuar:</p>
                <a href="${resetLink}">Restablecer mi contraseña</a>
                <p>Este enlace expirará en 1 hora.</p>
                <p>Si no solicitaste esto, por favor ignora este correo.</p>
            `
        };

        await transporter.sendMail(mailOptions);
        
        return res.json({ success: true, message: "Si existe una cuenta con ese correo, se ha enviado un enlace para restablecer la contraseña." });

    } catch (error) {
        console.error("Error en /solicitar-reset:", error);
        return res.status(500).json({ success: false, message: "Error interno del servidor." });
    }
});

// 3. Muestra la página para ingresar la nueva contraseña, validando el token
app.get('/reestablecer-pass/:token', async (req, res) => {
    const { token } = req.params;
    try {
        const { rows } = await pool.query(
            "SELECT * FROM usuarios WHERE reset_token = $1 AND reset_token_expires > NOW()",
            [token]
        );

        if (rows.length === 0) {
            // El token es inválido o ha expirado
            return res.status(400).send("El enlace de restablecimiento es inválido o ha expirado. Por favor, solicita uno nuevo.");
        }
        
        // Si el token es válido, sirve la página para que el usuario ponga su nueva contraseña
        res.sendFile(path.join(__dirname, 'public', 'reestablecer_pass.html'));

    } catch (error) {
        console.error("Error en /reestablecer-pass/:token:", error);
        return res.status(500).send("Error interno del servidor.");
    }
});

// 4. Procesa y guarda la nueva contraseña
app.post('/reestablecer-pass', async (req, res) => {
    const { token, password } = req.body;

    if (!token || !password || password.length < 6) {
        return res.status(400).json({ success: false, message: "Token o contraseña no válidos. La contraseña debe tener al menos 6 caracteres." });
    }

    try {
        // Busca el usuario con el token válido y que no haya expirado
        const { rows } = await pool.query(
            "SELECT * FROM usuarios WHERE reset_token = $1 AND reset_token_expires > NOW()",
            [token]
        );

        if (rows.length === 0) {
            return res.status(400).json({ success: false, message: "El enlace de restablecimiento es inválido o ha expirado." });
        }

        const usuario = rows[0];
        
        // Encriptar la nueva contraseña
        const hashedPassword = await bcrypt.hash(password, 10);

        // Actualizar la contraseña y limpiar el token para que no se pueda reutilizar
        await pool.query(
            "UPDATE usuarios SET contrasena = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2",
            [hashedPassword, usuario.id]
        );

        return res.json({ success: true, message: "¡Contraseña actualizada con éxito! Ya puedes iniciar sesión." });

    } catch (error) {
        console.error("Error al guardar la nueva contraseña:", error);
        return res.status(500).json({ success: false, message: "Error interno del servidor." });
    }
});

// ---- FIN DE LAS NUEVAS RUTAS ----


// --- INICIAR EL SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});