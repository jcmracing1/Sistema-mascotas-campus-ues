# Monitoreo de Mascotas - UES 🐾

Este proyecto muestra la ubicación de mascotas en tiempo real usando un canal de **ThingSpeak** y **Firebase** para almacenar la información de cada mascota.

## 🚀 Características
- Mapa en tiempo real con Leaflet.js
- Lectura de coordenadas GPS desde ThingSpeak (canal 3146056)
- Polígono de validación del campus UES
- Registro de mascotas con nombre, descripción y fotografía (Firebase Firestore + Storage)
- 100% compatible con GitHub Pages

## ⚙️ Configuración
1. Crea un proyecto en [Firebase](https://firebase.google.com).
2. Copia tu configuración en `firebase-config.js`.
3. Sube el contenido del proyecto a GitHub y activa **GitHub Pages**.
4. Asegúrate de tener el canal ThingSpeak 3146056 con `field1 = latitud` y `field2 = longitud`.

---
Hecho con ❤️ para la Universidad de El Salvador.
