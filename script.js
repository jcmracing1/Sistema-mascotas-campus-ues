// script.js (Realtime DB)
import { rtdb, storage } from './firebase-config.js';
import { ref as dbRef, push, set, onValue, get, child, query, orderByChild } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';

// CONFIG
const THINGSPEAK_CHANNEL = 3146056;
const POLL_MS = 15000; // 15s

const mascotasRef = dbRef(rtdb, 'mascotas');
const visitasRef = dbRef(rtdb, 'visitas');

// Map
const map = L.map('map').setView([13.719, -89.203], 15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

// polygon
const campusPoly = [
  [13.7233, -89.2032],
  [13.7224, -89.1994],
  [13.7195, -89.1998],
  [13.7165, -89.2003],
  [13.7152, -89.2060],
  [13.7192, -89.2055]
];
L.polygon(campusPoly, { color:'#2b7cff', weight:2, fillOpacity:0.03 }).addTo(map);

function isInside(lat,lng){
  const pt = turf.point([lng, lat]);
  const poly = turf.polygon([[ 
    [-89.2032, 13.7233], [-89.1994, 13.7224], [-89.1998, 13.7195],
    [-89.2003, 13.7165], [-89.2060, 13.7152], [-89.2055, 13.7192],
    [-89.2032, 13.7233]
  ]]);
  return turf.booleanPointInPolygon(pt, poly);
}

// UI
const petSelector = document.getElementById('petSelector');
const petNameEl = document.getElementById('petName');
const petPhotoEl = document.getElementById('petPhoto');
const petDescEl = document.getElementById('petDesc');
const historyList = document.getElementById('historyList');
const lastUpdateEl = document.getElementById('lastUpdate');
const lastLatEl = document.getElementById('lastLat');
const lastLngEl = document.getElementById('lastLng');

const newName = document.getElementById('newName');
const newDesc = document.getElementById('newDesc');
const newPhoto = document.getElementById('newPhoto');
const savePetBtn = document.getElementById('savePetBtn');

let pets = {};
let markers = [];
let lastLocation = null;

savePetBtn.addEventListener('click', async () => {
  const name = newName.value.trim();
  const desc = newDesc.value.trim();
  const file = newPhoto.files[0];
  if(!name || !file){ alert('Nombre y foto son obligatorios'); return; }

  const sref = storageRef(storage, `mascotas/${Date.now()}_${file.name}`);
  await uploadBytes(sref, file);
  const url = await getDownloadURL(sref);

  const nref = push(mascotasRef);
  await set(nref, { nombre: name, descripcion: desc, foto: url, createdAt: Date.now() });

  newName.value=''; newDesc.value=''; newPhoto.value='';
});

onValue(mascotasRef, (snap) => {
  petSelector.innerHTML = '';
  pets = {};
  snap.forEach(childSnap => {
    const key = childSnap.key;
    const val = childSnap.val();
    pets[key] = val;
    const div = document.createElement('div');
    div.className = 'pet-item';
    div.innerHTML = `<img src="${val.foto}" alt="${val.nombre}"><div><strong>${val.nombre}</strong><div class="muted">${val.descripcion || ''}</div></div>`;
    div.onclick = () => selectPet(key);
    petSelector.appendChild(div);
  });
  const keys = Object.keys(pets);
  if(keys.length>0) selectPet(keys[0]);
});

function selectPet(key){
  const p = pets[key];
  if(!p) return;
  petNameEl.textContent = p.nombre;
  petPhotoEl.src = p.foto;
  petDescEl.textContent = p.descripcion || '';
  renderHistory();
}

async function renderHistory(){
  historyList.innerHTML = '<div class="muted">Cargando historial...</div>';
  try{
    const q = query(visitasRef, orderByChild('ts'));
    const snap = await get(q);
    historyList.innerHTML = '';
    if(!snap.exists()){ historyList.innerHTML = '<div class="muted">No hay historial</div>'; return; }
    const arr = [];
    snap.forEach(childSnap => arr.push(childSnap.val()));
    arr.reverse();
    arr.slice(0,200).forEach(v=>{
      const date = new Date(v.ts);
      const el = document.createElement('div');
      el.className = 'entry';
      el.innerHTML = `<div>${date.toLocaleString()}</div><div style="font-weight:700">${v.lat.toFixed(6)}, ${v.lng.toFixed(6)}</div>`;
      el.onclick = ()=>{ map.setView([v.lat, v.lng], 17); L.popup().setLatLng([v.lat, v.lng]).setContent(`${date.toLocaleString()}<br>${v.lat.toFixed(6)}, ${v.lng.toFixed(6)}`).openOn(map); };
      historyList.appendChild(el);
    });
  }catch(e){ console.error(e); }
}

async function pollThingSpeak(){
  try{
    const resp = await fetch(`https://api.thingspeak.com/channels/${THINGSPEAK_CHANNEL}/feeds.json?results=1`);
    const data = await resp.json();
    if(data && data.feeds && data.feeds.length>0){
      const f = data.feeds[0];
      const lat = parseFloat(f.field1);
      const lng = parseFloat(f.field2);
      if(isNaN(lat) || isNaN(lng)) return;

      lastUpdateEl.textContent = new Date(f.created_at).toLocaleString();
      lastLatEl.textContent = lat.toFixed(6);
      lastLngEl.textContent = lng.toFixed(6);

      const changed = !lastLocation || (Math.abs(lastLocation.lat - lat) > 1e-6 || Math.abs(lastLocation.lng - lng) > 1e-6);
      lastLocation = { lat, lng };

      markers.forEach(m=>map.removeLayer(m));
      markers = [];
      Object.values(pets).forEach(p=>{
        const mk = L.marker([lat, lng]).addTo(map).bindPopup(`<img src="${p.foto}" width="80"><br><b>${p.nombre}</b><br>${p.descripcion || ''}`);
        markers.push(mk);
      });
      map.setView([lat, lng]);

      const inside = isInside(lat, lng);
      if(!inside){
        const notif = document.createElement('div');
        notif.className = 'entry';
        notif.innerHTML = `<strong style="color:var(--danger)">ALERTA: Fuera del campus</strong> — ${new Date().toLocaleString()} — ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        historyList.prepend(notif);
      }

      if(changed){
        const nref = push(visitasRef);
        await set(nref, { lat: lat, lng: lng, ts: Date.now() });
        renderHistory();
      }
    }
  }catch(err){ console.warn('ThingSpeak poll error', err); }
}

pollThingSpeak();
setInterval(pollThingSpeak, POLL_MS);
