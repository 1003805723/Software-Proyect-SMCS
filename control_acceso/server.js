const express = require("express");
const mysql = require("mysql");
const path = require("path");
const bcrypt = require("bcrypt");
const session = require("express-session");
const cors = require("cors");

// (Asumiendo que tienes este archivo de rutas, si no, puedes eliminar estas dos líneas)
// const dispositivosRouter = require('./routes/dispositivos'); 

// Crear la aplicación Express
const app = express();

// --- CONFIGURACIÓN DE MIDDLEWARE ---

// Configurar CORS
app.use(cors());

// Configurar la sesión
app.use(session({
    secret: "clave_secreta_super_segura_123", // Es recomendable usar una clave más segura y guardarla en variables de entorno
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Poner en `true` si usas HTTPS
}));

// Middleware para analizar datos del formulario y JSON
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Servir archivos estáticos (HTML, CSS, imágenes, etc. desde la carpeta 'public')
app.use(express.static(path.join(__dirname, "public")));

// --- CONEXIÓN A LA BASE DE DATOS ---

let conexion = mysql.createConnection({
    host: "localhost",
    database: "sistema",
    user: "root",
    password: "",
});

conexion.connect((err) => {
    if (err) {
        console.error("Error de conexión a la base de datos:", err);
        process.exit(1);
    }
    console.log("Conectado a la base de datos MySQL");
});


// --- RUTAS DE LA APLICACIÓN ---

// 1. PÁGINA DE INICIO -> Sirve el login (index.html)
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// 2. PÁGINA DE REGISTRO DE USUARIOS -> Sirve la página de registro
app.get("/registro", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "registroUsuarios.html"));
});

// 3. PROCESO DE REGISTRO DE USUARIO (POST)
app.post("/registro", async function (req, res) {
    const { ced, nom, correo, pass } = req.body;

    if (!ced || !nom || !correo || !pass) {
        return res.status(400).json({ success: false, message: "Todos los campos son obligatorios." });
    }

    let buscar = "SELECT * FROM usuarios WHERE cedula = ? OR correo = ?";
    conexion.query(buscar, [ced, correo], async function (error, row) {
        if (error) {
            console.error("Error en DB en /registro:", error);
            return res.status(500).json({ success: false, message: "Error en la base de datos." });
        }

        if (row.length > 0) {
            return res.status(409).json({ success: false, message: "La cédula o el correo ya existen." });
        } 
        
        const hashedPassword = await bcrypt.hash(pass, 10);
        let registrar = "INSERT INTO usuarios (cedula, nombre, correo, contrasenia) VALUES (?, ?, ?, ?)";
        conexion.query(registrar, [ced, nom, correo, hashedPassword], function (error) {
            if (error) {
                console.error("Error al registrar usuario:", error);
                return res.status(500).json({ success: false, message: "Error al registrar usuario." });
            }
            console.log("Registro exitoso. Redirigiendo a login...");
            // Redirige al nuevo login (index.html)
            return res.json({ success: true, redirect: "/index.html" });
        });
    });
});

// 4. PROCESO DE LOGIN (POST)
app.post("/login", function (req, res) {
    const { correo, pass } = req.body;
    if (!correo || !pass) {
        return res.status(400).json({ success: false, message: "Correo y contraseña son obligatorios." });
    }

    let buscar = "SELECT * FROM usuarios WHERE correo = ?";
    conexion.query(buscar, [correo], async function (error, row) {
        if (error) {
            console.error("Error en DB en /login:", error);
            return res.status(500).json({ success: false, message: "Error en la base de datos." });
        }
        if (row.length === 0) {
            return res.status(404).json({ success: false, message: "Usuario no encontrado." });
        }

        const usuario = row[0];
        const match = await bcrypt.compare(pass, usuario.contrasenia);
        
        if (!match) {
            return res.status(401).json({ success: false, message: "Contraseña incorrecta." });
        }

        req.session.user = usuario; // Guardar sesión
        console.log("Inicio de sesión exitoso.");
        return res.json({ success: true, redirect: "/dashboard" });
    });
});

// Middleware para proteger rutas que requieren autenticación
function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/index.html'); // Redirige a la página de login
    }
    next();
}

// 5. PÁGINA PRINCIPAL (DASHBOARD)
app.get("/dashboard", requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, "public", "paginaPrincipal.html"));
});

// 6. CERRAR SESIÓN (LOGOUT)
app.post("/logout", (req, res) => {
    req.session.destroy();
    res.redirect("/index.html"); // Redirige a la página de login
});

// 7. PÁGINAS Y RUTAS DE DISPOSITIVOS
app.get("/dispositivos", requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, "public", "registroDispositivos.html"));
});

app.post("/registrarDispositivo", requireLogin, function (req, res) {
    const { tipo, marca, modelo, direccion_ip, puerto, usuario, contrasena, ubicacion } = req.body;
    if (!tipo || !marca || !modelo || !ubicacion) {
        return res.status(400).json({ success: false, message: "Los campos tipo, marca, modelo y ubicación son obligatorios." });
    }
    const query = "INSERT INTO dispositivos (tipo, marca, modelo, direccion_ip, puerto, usuario, contrasena, ubicacion) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
    const parametros = [tipo, marca, modelo, direccion_ip || null, puerto || null, usuario || null, contrasena || null, ubicacion];
    conexion.query(query, parametros, (error) => {
        if (error) {
            console.error("Error al registrar el dispositivo:", error);
            return res.status(500).json({ success: false, message: "Error al registrar el dispositivo." });
        }
        res.json({ success: true, message: "Dispositivo registrado correctamente." });
    });
});

// 8. PÁGINAS Y RUTAS DE SERVICIOS
app.get("/servicios", requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, "public", "registroServicios.html"));
});

app.post("/registrarServicio", requireLogin, function (req, res) {
    const { nombre, descripcion, estado } = req.body;
    let query = "INSERT INTO servicios (nombre, descripcion, estado) VALUES (?, ?, ?)";
    conexion.query(query, [nombre, descripcion, estado], function(error) {
        if (error) {
            console.error("Error al registrar servicio:", error);
            return res.status(500).json({ success: false, message: "Error al registrar el servicio" });
        }
        res.json({ success: true, message: "Servicio registrado con éxito" });
    });
});


// 9. RUTA PARA ACTUALIZAR DATOS
app.post("/actualizar", requireLogin, (req, res) => {
    const { entityType, entityId, updateField, newValue } = req.body;
    if (!entityType || !entityId || !updateField || newValue === undefined) {
        return res.status(400).json({ success: false, message: "Todos los campos son obligatorios." });
    }
    
    // Evitar inyección SQL validando el nombre de la tabla y campo
    const allowedTables = { 'usuario': 'usuarios', 'dispositivo': 'dispositivos', 'servicio': 'servicios' };
    const allowedFields = { /* Aquí deberías listar los campos permitidos por tabla */ };
    
    if (!allowedTables[entityType]) {
        return res.status(400).json({ success: false, message: "Tipo de entidad no válido." });
    }
    const table = allowedTables[entityType];

    // Esta es una validación simple, una más robusta es recomendada.
    if (!/^[a-zA-Z0-9_]+$/.test(updateField)) {
        return res.status(400).json({ success: false, message: "Campo a actualizar no válido."});
    }

    const query = `UPDATE ?? SET ?? = ? WHERE id = ?`; // Usar '??' para identificadores
    conexion.query(query, [table, updateField, newValue, entityId], (error, results) => {
        if (error) {
            console.error("Error al actualizar:", error);
            return res.status(500).json({ success: false, message: "Error en la base de datos." });
        }
        if (results.affectedRows === 0) {
            return res.status(404).json({ success: false, message: "No se encontró la entidad con el ID proporcionado." });
        }
        return res.json({ success: true, message: "Datos actualizados con éxito." });
    });
});

// 10. RUTA PARA ELIMINAR DATOS
app.post('/eliminar', requireLogin, (req, res) => {
    const { deleteEntityType, deleteEntityId } = req.body;
    if (!deleteEntityType || !deleteEntityId) {
        return res.status(400).json({ success: false, message: "Todos los campos son obligatorios." });
    }

    const allowedTables = { 'dispositivo': 'dispositivos', 'servicio': 'servicios' };
    if (!allowedTables[deleteEntityType]) {
        return res.status(400).json({ success: false, message: "Tipo de entidad no válido." });
    }
    const table = allowedTables[deleteEntityType];

    const query = `DELETE FROM ?? WHERE id = ?`;
    conexion.query(query, [table, deleteEntityId], (error, results) => {
        if (error) {
            console.error("Error al eliminar:", error);
            return res.status(500).json({ success: false, message: "Error en la base de datos." });
        }
        if (results.affectedRows === 0) {
            return res.status(404).json({ success: false, message: "No se encontró la entidad con el ID proporcionado." });
        }
        return res.json({ success: true, message: "Datos eliminados con éxito." });
    });
});


// --- INICIAR EL SERVIDOR ---
const PORT = 3000;
app.listen(PORT, function () {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});