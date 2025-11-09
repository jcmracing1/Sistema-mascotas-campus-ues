mport { db, storage } from "./firebase-config.js";
import {
  collection, addDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const petsRef = collection(db, "mascotas");

// Inicializar mapa
const map = L.map('map').setView([13.718, -89.203], 15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

// Polígono del campus UES (6 vértices)
const campusPolygon = L.polygon([
  [13.7233, -89.2032],
  [13.7224, -89.1994],
  [13.7195, -89.1998],
  [13.7165, -89.2003],
  [13.7152, -89.2060],
  [13.7192, -89.2055]
], { color: 'green', fillOpacity: 0.1 }).addTo(map);

// Verificar si el punto está dentro del polígono (usando Turf.js)
function puntoEnPoligono(lat, lng) {
  return turf.booleanPointInPolygon(turf.point([lng, lat]), turf.polygon([[ 
    [-89.2032, 13.7233], [-89.1994, 13.7224], [-89.1998, 13.7195],
    [-89.2003, 13.7165], [-89.2060, 13.7152], [-89.2055, 13.7192],
    [-89.2032, 13.7233]
  ]]));
}

// Subir nueva mascota
document.getElementById('addPetBtn').addEventListener('click', async () => {
  const name = document.getElementById('petName').value;
  const channelID = document.getElementById('thingSpeakID').value;
  const desc = document.getElementById('petDesc').value;
  const photoFile = document.getElementById('petPhoto').files[0];

  if (!name || !channelID || !photoFile) {
    alert('Por favor completa todos los campos y selecciona una foto');
    return;
  }

  // Subir imagen a Firebase Storage
  const storageRef = ref(storage, `mascotas/${Date.now()}_${photoFile.name}`);
  await uploadBytes(storageRef, photoFile);
  const photoURL = await getDownloadURL(storageRef);

  // Guardar en Firestore
  await addDoc(petsRef, {
    nombre: name,
    channelID: channelID,
    descripcion: desc,
    foto: photoURL
  });

  alert('Mascota agregada con éxito 🐾');
  document.getElementById('petName').value = "";
  document.getElementById('thingSpeakID').value = "";
  document.getElementById('petDesc').value = "";
  document.getElementById('petPhoto').value = "";
});

// Mostrar mascotas en tiempo real
onSnapshot(petsRef, async (snapshot) => {
  const list = document.getElementById('petsUl');
  list.innerHTML = "";

  snapshot.forEach(async (doc) => {
    const pet = doc.data();
    const li = document.createElement('li');
    li.innerHTML = `
      <img src="${pet.foto}" alt="${pet.nombre}" class="petPhoto">
      <strong>${pet.nombre}</strong><br>
      ${pet.descripcion}<br>
      <em>Canal: ${pet.channelID}</em>
    `;
    list.appendChild(li);

    // Leer coordenadas desde ThingSpeak
    const resp = await fetch(`https://api.thingspeak.com/channels/${pet.channelID}/feeds.json?results=1`);
    const data = await resp.json();

    if (data.feeds.length > 0) {
      const lat = parseFloat(data.feeds[0].field1);
      const lng = parseFloat(data.feeds[0].field2);
      const inside = puntoEnPoligono(lat, lng);
      const color = inside ? 'blue' : 'red';

      L.marker([lat, lng], {
        icon: L.divIcon({ html: `🐾`, className: 'petMarker' })
      }).addTo(map)
      .bindPopup(`
        <img src="${pet.foto}" width="80"><br>
        <b>${pet.nombre}</b><br>
        ${pet.descripcion}<br>
        <b>${inside ? 'Dentro del campus' : 'Fuera del campus'}</b>
      `);
    }
  });
});
