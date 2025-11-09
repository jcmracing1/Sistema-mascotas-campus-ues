Mascotas UES - Server + Frontend (Node.js + Express + MongoDB Atlas + Cloudinary)

Estructura de archivos:
- server.js
- package.json
- .env.example
- models/pet.js, models/visit.js
- public/ (frontend: index.html, script.js, style.css, img/)

Pasos rápidos para desplegar (resumen):
1. Crear cluster en MongoDB Atlas (gratis M0). Crear usuario DB. Copiar URI y pegar en .env (MONGODB_URI).
2. Crear cuenta en Cloudinary (gratis). Copiar cloud name, api key y api secret en .env.
3. Configurar variables de entorno (usa .env a partir de .env.example) y set SERVE_STATIC=true si quieres que el servidor sirva el frontend.
4. Subir este repo a GitHub.
5. Desplegar en Render.com / Railway / Heroku:
   - En Render: New Web Service -> conectar repo -> build command: npm install -> start command: npm start.
   - Agregar environment variables (MONGODB_URI, CLOUDINARY_..., THINGSPEAK_CHANNEL).
6. Abrir la URL de tu servicio (o usar GitHub Pages si prefieres servir public/ por separado).

Notas:
- El servidor hace polling a ThingSpeak (canal por defecto 3146056) cada 15s y guarda visitas solo cuando cambia la ubicación.
- Puedes agregar alertas por correo/SMS, autenticación y filtros adicionales (te ayudo a integrar).
