// script.js
import { db, storage } from './firebase-config.js';
import {
  collection, addDoc, onSnapshot, query, orderBy, getDocs
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';

// CONFIG
const THINGSPEAK_CHANNEL = 3146056;
const THINGSPEAK_RESULTS = 1; // only need latest
const POLL_MS = 15000; // poll every 15s

// Firestore collections
const petsCol = collection(db, 'mascotas');
const visitsCol = collection(db, 'visitas');

// Map setup
const map = L.map('map').setView([13.719, -89.203], 15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

// Campus polygon (6 vertices as requested)
const campusPolygon = [
  [13.7233, -89.2032],
  [13.7224, -89.1994],
  [13.7195, -89.1998],
  [13.7165, -89.2003],
  [13.7152, -89.2060],
  [13.7192, -89.2055]
];
const campusLayer = L.polygon(campusPolygon, { color:'#2b7cff', weight:2, fillOpacity:0.03 }).addTo(map);

// Utility: check point in polygon using Turf.js
function isInside(lat, lng){
  const pt = turf.point([lng, lat]);
  const poly = turf.polygon([[ 
    [-89.2032, 13.7233], [-89.1994, 13.7224], [-89.1998, 13.7195],
    [-89.2003, 13.7165], [-89.2060, 13.7152], [-89.2055, 13.7192],
    [-89.2032, 13.7233]
  ]]);
  return turf.booleanPointInPolygon(pt, poly);
}

// State
let pets = []; // local copy
let markers = []; // markers for pets (same location)
let lastLocation = null;

// UI elements
const petSelector = document.getElementById('petSelector');
const petNameEl = document.getElementById('petName');
const petPhotoEl = document.getElementById('petPhoto');
const petDescEl = document.getElementById('petDesc');
const historyList = document.getElementById('historyList');
const lastUpdateEl = document.getElementById('lastUpdate');
const lastLatEl = document.getElementById('lastLat');
const lastLngEl = document.getElementById('lastLng');

// Add pet form
const newName = document.getElementById('newName');
const newDesc = document.getElementById('newDesc');
const newPhoto = document.getElementById('newPhoto');
const savePetBtn = document.getElementById('savePetBtn');

savePetBtn.addEventListener('click', async () => {
  const name = newName.value.trim();
  const desc = newDesc.value.trim();
  const file = newPhoto.files[0];
  if(!name || !file){ alert('Nombre y foto son obligatorios'); return; }

  // upload photo
  const storageRef = ref(storage, `mascotas/${Date.now()}_${file.name}`);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);

  await addDoc(petsCol, {
    nombre: name,
    descripcion: desc,
    foto: url,
    createdAt: Date.now()
  });

  newName.value=''; newDesc.value=''; newPhoto.value='';
});

// Real-time pets listener
onSnapshot(petsCol, (snapshot) => {
  pets = [];
  petSelector.innerHTML = '';
  snapshot.forEach(doc => {
    const d = doc.data();
    d._id = doc.id;
    pets.push(d);

    const item = document.createElement('div');
    item.className = 'pet-item';
    item.innerHTML = `<img src="${d.foto}" alt="${d.nombre}"><div><strong>${d.nombre}</strong><div class="muted">${d.descripcion || ''}</div></div>`;
    item.onclick = () => selectPet(d);
    petSelector.appendChild(item);
  });

  // select first pet automatically if any
  if(pets.length>0) selectPet(pets[0]);
});

// Select pet to show details
function selectPet(p){
  petNameEl.textContent = p.nombre;
  petPhotoEl.src = p.foto;
  petDescEl.textContent = p.descripcion || '';
  // render history filtered by pet? Here visits are global; show latest N
  renderHistory();
}

// Render history from Firestore (latest 100)
async function renderHistory(){
  historyList.innerHTML = '<div class="muted">Cargando historial...</div>';
  try{
    const q = query(visitsCol, orderBy('ts', 'desc'));
    const snap = await getDocs(q);
    historyList.innerHTML = '';
    let count=0;
    snap.forEach(doc => {
      if(count>200) return;
      const v = doc.data();
      const el = document.createElement('div');
      el.className = 'entry';
      const date = new Date(v.ts);
      el.innerHTML = `<div>${date.toLocaleString()}</div><div style="font-weight:700">${v.lat.toFixed(6)}, ${v.lng.toFixed(6)}</div>`;
      el.onclick = ()=>{ map.setView([v.lat, v.lng], 17); L.popup().setLatLng([v.lat, v.lng]).setContent(`${date.toLocaleString()}<br>${v.lat.toFixed(6)}, ${v.lng.toFixed(6)}`).openOn(map); };
      historyList.appendChild(el);
      count++;
    });
  }catch(e){ console.error(e); }
}

// Poll ThingSpeak for latest location and save to Firestore if changed
async function pollThingSpeak(){
  try{
    const resp = await fetch(`https://api.thingspeak.com/channels/${THINGSPEAK_CHANNEL}/feeds.json?results=${THINGSPEAK_RESULTS}`);
    const data = await resp.json();
    if(data && data.feeds && data.feeds.length>0){
      const f = data.feeds[data.feeds.length-1];
      const lat = parseFloat(f.field1);
      const lng = parseFloat(f.field2);
      if(isNaN(lat) || isNaN(lng)) return;

      // update UI
      lastUpdateEl.textContent = new Date(f.created_at).toLocaleString();
      lastLatEl.textContent = lat.toFixed(6);
      lastLngEl.textContent = lng.toFixed(6);

      // if changed from lastLocation, store visit
      const changed = !lastLocation || (Math.abs(lastLocation.lat - lat) > 1e-6 || Math.abs(lastLocation.lng - lng) > 1e-6);
      lastLocation = { lat, lng };

      // remove existing markers and add one marker for all pets (same point)
      markers.forEach(m=>map.removeLayer(m));
      markers = [];
      pets.forEach(p=>{
        const mk = L.marker([lat, lng]).addTo(map).bindPopup(`<img src="${p.foto}" width="80"><br><b>${p.nombre}</b><br>${p.descripcion || ''}`);
        markers.push(mk);
      });

      // center map to location
      map.setView([lat, lng]);

      // check inside campus
      const inside = isInside(lat, lng);
      if(!inside){
        // add notification to history area as first element
        const notif = document.createElement('div');
        notif.className = 'entry';
        notif.innerHTML = `<strong style="color:var(--danger)">ALERTA: Fuera del campus</strong> — ${new Date().toLocaleString()} — ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        historyList.prepend(notif);
      }

      if(changed){
        // save visit
        await addDoc(visitsCol, {
          lat: lat,
          lng: lng,
          ts: Date.now()
        });
        // refresh history shown
        renderHistory();
      }
    }
  }catch(err){ console.warn('ThingSpeak poll error', err); }
}

// start polling
pollThingSpeak();
setInterval(pollThingSpeak, POLL_MS);
