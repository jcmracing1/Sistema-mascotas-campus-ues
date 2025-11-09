# Mascotas UES - Tracker (GitHub Pages)

Proyecto listo para subir a GitHub Pages. Incluye:
- Interfaz web (index.html)
- Conexión a Firebase Firestore + Storage
- Lectura de coordenadas desde ThingSpeak
- Detección si la mascota está fuera del campus UES (polígono de 6 vértices)
- Subida de foto por mascota y persistencia en Firestore

## Pasos para usar

1. Crear un proyecto en Firebase (Console) y activar:
   - Firestore Database
   - Storage
2. Crear una app web en Firebase y copiar la configuración.
3. Reemplazar `firebase-config.js` con tu configuración real.
4. (Opcional) Configurar EmailJS e insertar `service_id` y `template_id` en script.js para notificaciones por correo.
5. Subir todo el contenido del directorio a un repositorio GitHub.
6. Activar GitHub Pages (Settings → Pages → branch `main` → root).
7. Abrir la URL que te provee GitHub Pages.

## Nota
- ThingSpeak: cada ESP32 debe enviar `field1=lat` y `field2=lng` (opcional `field3=alt`).
- Para asignar datos a mascotas automáticamente puedes enviar `field4` con el nombre de la mascota.
