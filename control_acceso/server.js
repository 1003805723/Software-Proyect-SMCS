const express = require("express");
const mysql = require("mysql");
const path = require("path");
const bcrypt = require("bcrypt");
const session = require("express-session");
const cors = require("cors");

// Importar el enrutador de dispositivos
const dispositivosRouter = require('./routes/dispositivos');

// Crear la aplicación Express
const app = express();

// Configurar CORS
app.use(cors());

// Configurar la sesión
app.use(session({
    secret: "clave_secreta",
    resave: false,
    saveUninitialized: true
}));

// Conectar a la base de datos MySQL
let conexion = mysql.createConnection({
    host: "localhost",
    database: "sistema",
    user: "root",
    password: "",
});

conexion.connect((err) => {
    if (err) {
        console.error("Error de conexión a la base de datos:", err);
        process.exit(1); // Detener el servidor si no se puede conectar a la base de datos
    }
    console.log("Conectado a la base de datos MySQL");
});

// Middleware para analizar datos del formulario
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Servir archivos estáticos (HTML, CSS, imágenes, etc.)
app.use(express.static(path.join(__dirname, "public")));

// Montar el enrutador de dispositivos
app.use('/dispositivos', dispositivosRouter);

// **1️⃣ Página de inicio: Registro de usuario**
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "registroUsuarios.html"));
});

// **2️⃣ Registro de usuarios**
app.post("/registro", async function (req, res) {
    const { ced, nom, correo, pass } = req.body;

    if (!ced || !nom || !correo || !pass) {
        return res.json({ success: false, message: "Todos los campos son obligatorios." });
    }

    let buscar = "SELECT * FROM usuarios WHERE cedula = ?";
    conexion.query(buscar, [ced], async function (error, row) {
        if (error) {
            return res.json({ success: false, message: "Error en la base de datos." });
        }

        if (row.length > 0) {
            return res.json({ success: false, message: "El usuario ya existe." });
        } else {
            const hashedPassword = await bcrypt.hash(pass, 10); // Encriptar contraseña
            let registrar = "INSERT INTO usuarios (cedula, nombre, correo, contrasenia) VALUES (?, ?, ?, ?)";

            conexion.query(registrar, [ced, nom, correo, hashedPassword], function (error) {
                if (error) {
                    return res.json({ success: false, message: "Error al registrar usuario." });
                } else {
                    console.log("Registro exitoso. Redirigiendo a login...");
                    return res.json({ success: true, redirect: "/login" }); // Redirigir a login
                }
            });
        }
    });
});

// **3️⃣ Página de login**
app.get("/login", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "inicioSesion.html"));
});

// **4️⃣ Validar login**
app.post("/login", function (req, res) {
    const { correo, pass } = req.body;
    if (!correo || !pass) {
        return res.json({ success: false, message: "Correo y contraseña son obligatorios." });
    }

    let buscar = "SELECT * FROM usuarios WHERE correo = ?";
    conexion.query(buscar, [correo], async function (error, row) {
        if (error) {
            return res.json({ success: false, message: "Error en la base de datos." });
        }

        if (row.length === 0) {
            return res.json({ success: false, message: "Usuario no encontrado." });
        }

        const usuario = row[0];
        const match = await bcrypt.compare(pass, usuario.contrasenia);
        
        if (!match) {
            return res.json({ success: false, message: "Contraseña incorrecta." });
        }

        req.session.user = usuario; // Guardar sesión
        console.log("Inicio de sesión exitoso.");
        return res.json({ success: true, redirect: "/dashboard" }); // Redirigir a la página principal
    });
});

// **5️⃣ Página principal (solo accesible si está autenticado)**
app.get("/dashboard", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/login");
    }
    res.sendFile(path.join(__dirname, "public", "paginaPrincipal.html"));
});

// **6️⃣ Cerrar sesión**
app.post("/logout", (req, res) => {
    req.session.destroy();
    res.redirect("/login");
});

// **7️⃣ Registro de dispositivos por el usuario**
app.get("/dispositivos", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/login"); // Verifica si el usuario está logeado
    }
    res.sendFile(path.join(__dirname, "public", "registroDispositivos.html"));
});
app.post("/registrarDispositivo", function (req, res) {
    const { tipo, marca, modelo, direccion_ip, puerto, usuario, contrasena, ubicacion } = req.body;

    // Validar campos obligatorios
    if (!tipo || !marca || !modelo || !ubicacion) {
        return res.status(400).json({
            success: false,
            message: "Los campos tipo, marca, modelo y ubicación son obligatorios.",
        });
    }

    // Insertar en la base de datos
    const query = `
        INSERT INTO dispositivos (tipo, marca, modelo, direccion_ip, puerto, usuario, contrasena, ubicacion)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const parametros = [tipo, marca, modelo, direccion_ip || null, puerto || null, usuario || null, contrasena || null, ubicacion];

    conexion.query(query, parametros, (error, resultados) => {
        if (error) {
            console.error("Error al registrar el dispositivo:", error);
            return res.status(500).json({
                success: false,
                message: "Error al registrar el dispositivo en la base de datos.",
            });
        }

        // Éxito
        res.json({
            success: true,
            message: "Dispositivo registrado correctamente.",
        });
    });
});

// **8️⃣ Ruta para registrar un servicio por el usuario**
app.get("/servicios", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/login"); // Verifica si el usuario está logeado
    }
    res.sendFile(path.join(__dirname, "public", "registroServicios.html"));
});

app.post("/registrarServicio", function (req, res) {
    const { nombre, descripcion, estado } = req.body;

    let query = "INSERT INTO servicios (nombre, descripcion, estado) VALUES (?, ?, ?)";
    conexion.query(query, [nombre, descripcion, estado], function(error) {
        if (error) {
            return res.json({ success: false, message: "Error al registrar el servicio" });
        }
        console.log("Servicio registrado con éxito");
        res.json({ success: true, message: "Servicio registrado con éxito" });
    });
});

// **9️⃣ Ruta para actualizar datos**
app.post("/actualizar", (req, res) => {
    const { entityType, entityId, updateField, newValue } = req.body;

    if (!entityType || !entityId || !updateField || !newValue) {
        return res.json({ success: false, message: "Todos los campos son obligatorios." });
    }

    let query;
    switch (entityType) {
        case 'usuario':
            query = `UPDATE usuarios SET ${updateField} = ? WHERE id = ?`;
            break;
        case 'dispositivo':
            query = `UPDATE dispositivos SET ${updateField} = ? WHERE id = ?`;
            break;
        case 'servicio':
            query = `UPDATE servicios SET ${updateField} = ? WHERE id = ?`;
            break;
        default:
            return res.json({ success: false, message: "Tipo de entidad no válido." });
    }

    conexion.query(query, [newValue, entityId], (error, results) => {
        if (error) {
            console.error("Error al actualizar:", error);
            return res.json({ success: false, message: "Error en la base de datos." });
        }
        if (results.affectedRows === 0) {
            return res.json({ success: false, message: "No se encontró la entidad con el ID proporcionado." });
        }
        return res.json({ success: true, message: "Datos actualizados con éxito." });
    });
});

// **🔟 Ruta para eliminar datos**
app.post('/eliminar', (req, res) => {
    console.log(req.body); // Verifica los datos recibidos
    const { deleteEntityType, deleteEntityId } = req.body;

    if (!deleteEntityType || !deleteEntityId) {
        return res.status(400).json({ success: false, message: "Todos los campos son obligatorios." });
    }

    let query;
    switch (deleteEntityType) {
        case 'dispositivo':
            query = `DELETE FROM dispositivos WHERE id = ?`;
            break;
        case 'servicio':
            query = `DELETE FROM servicios WHERE id = ?`;
            break;
        default:
            return res.status(400).json({ success: false, message: "Tipo de entidad no válido." });
    }

    conexion.query(query, [deleteEntityId], (error, results) => {
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

// Iniciar el servidor en el puerto 3000
app.listen(3000, function () {
    console.log("Servidor corriendo en http://localhost:3000");
});