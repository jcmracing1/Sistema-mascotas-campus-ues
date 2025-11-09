// script.js - localStorage version with ThingSpeak polling (real-time-ish)
const THINGSPEAK_CHANNEL = 3146056;
const POLL_MS = 15000; // 15s (ThingSpeak free limit); adjust if needed

// Polygon (6 vertices)
const campusPolygon = [
  [13.7233, -89.2032],
  [13.7224, -89.1994],
  [13.7195, -89.1998],
  [13.7165, -89.2003],
  [13.7152, -89.2060],
  [13.7192, -89.2055]
];

// UI refs
const petSelector = document.getElementById('petSelector');
const petNameEl = document.getElementById('petName');
const petPhotoEl = document.getElementById('petPhoto');
const petDescEl = document.getElementById('petDesc');
const historyList = document.getElementById('historyList');
const lastUpdateEl = document.getElementById('lastUpdate');
const lastLatEl = document.getElementById('lastLat');
const lastLngEl = document.getElementById('lastLng');
const lastStatusEl = document.getElementById('lastStatus');

const newName = document.getElementById('newName');
const newDesc = document.getElementById('newDesc');
const newPhoto = document.getElementById('newPhoto');
const savePetBtn = document.getElementById('savePetBtn');

// Map
const map = L.map('map').setView([13.719, -89.203], 15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
const campusLayer = L.polygon(campusPolygon, { color:'#2b7cff', weight:2, fillOpacity:0.03 }).addTo(map);

let pets = []; // {id, nombre, descripcion, fotoDataUrl}
let visits = []; // {ts, lat, lng, inside}
let markers = [];
let selectedPetId = null;
let lastLocation = null;

// utilities
function saveStorage(){ localStorage.setItem('mascotas_ues_pets', JSON.stringify(pets)); localStorage.setItem('mascotas_ues_visits', JSON.stringify(visits)); }
function loadStorage(){ pets = JSON.parse(localStorage.getItem('mascotas_ues_pets') || '[]'); visits = JSON.parse(localStorage.getItem('mascotas_ues_visits') || '[]'); }

function isInside(lat, lng){
  const pt = turf.point([lng, lat]);
  const poly = turf.polygon([[ 
    [-89.2032, 13.7233], [-89.1994, 13.7224], [-89.1998, 13.7195],
    [-89.2003, 13.7165], [-89.2060, 13.7152], [-89.2055, 13.7192],
    [-89.2032, 13.7233]
  ]]);
  return turf.booleanPointInPolygon(pt, poly);
}

function renderPetSelector(){
  petSelector.innerHTML = '';
  pets.forEach(p=>{
    const item = document.createElement('div');
    item.className = 'pet-item';
    item.innerHTML = `<img src="${p.foto}" alt="${p.nombre}"><div><strong>${p.nombre}</strong><div class="muted">${p.descripcion||''}</div></div>`;
    item.onclick = ()=>{ selectPet(p.id); };
    petSelector.appendChild(item);
  });
  if(pets.length && !selectedPetId) selectPet(pets[0].id);
}

function selectPet(id){
  selectedPetId = id;
  const p = pets.find(x=>x.id===id);
  if(!p) return;
  petNameEl.textContent = p.nombre;
  petPhotoEl.src = p.foto;
  petDescEl.textContent = p.descripcion || '';
  renderHistoryForPet();
}

function renderHistoryForPet(filterDate){
  historyList.innerHTML = '';
  const arr = visits.slice().reverse();
  // if date filter applied
  let filtered = arr;
  if(filterDate){
    const d = new Date(filterDate).toDateString();
    filtered = arr.filter(v=> new Date(v.ts).toDateString() === d );
  }
  if(filtered.length===0){ historyList.innerHTML = '<div class="muted">No hay historial</div>'; return; }
  filtered.forEach(v=>{
    const date = new Date(v.ts);
    const el = document.createElement('div');
    el.className = 'entry';
    el.innerHTML = `<div>${date.toLocaleString()}</div><div style="font-weight:700">${v.lat.toFixed(6)}, ${v.lng.toFixed(6)}</div><div>${v.inside? 'Dentro' : '<strong style="color:var(--danger)'>Fuera</strong>'}</div>`;
    el.onclick = ()=>{ map.setView([v.lat, v.lng], 17); L.popup().setLatLng([v.lat, v.lng]).setContent(`${date.toLocaleString()}<br>${v.lat.toFixed(6)}, ${v.lng.toFixed(6)}`).openOn(map); };
    historyList.appendChild(el);
  });
}

// add pet
savePetBtn.addEventListener('click', ()=>{
  const name = newName.value.trim();
  const desc = newDesc.value.trim();
  const file = newPhoto.files[0];
  if(!name || !file){ alert('Nombre y foto obligatorios'); return; }
  const reader = new FileReader();
  reader.onload = (e)=>{
    const dataUrl = e.target.result;
    const id = 'pet_' + Date.now();
    pets.push({ id, nombre: name, descripcion: desc, foto: dataUrl });
    saveStorage();
    renderPetSelector();
    newName.value=''; newDesc.value=''; newPhoto.value='';
  };
  reader.readAsDataURL(file);
});

// ThingSpeak polling and saving visits only if changed
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
      const inside = isInside(lat, lng);
      lastStatusEl.textContent = inside ? 'Dentro' : 'Fuera';
      // check change
      const changed = !lastLocation || Math.abs(lastLocation.lat - lat) > 1e-6 || Math.abs(lastLocation.lng - lng) > 1e-6;
      lastLocation = { lat, lng };
      // update markers
      markers.forEach(m=>map.removeLayer(m)); markers = [];
      pets.forEach(p=>{
        const mk = L.marker([lat, lng]).addTo(map).bindPopup(`<img src="${p.foto}" width="80"><br><b>${p.nombre}</b><br>${p.descripcion||''}`);
        markers.push(mk);
      });
      map.setView([lat, lng], 16);
      if(!inside){
        const notif = document.createElement('div');
        notif.className = 'entry';
        notif.innerHTML = `<strong style="color:var(--danger)">ALERTA: Fuera del campus</strong> — ${new Date().toLocaleString()} — ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        historyList.prepend(notif);
      }
      if(changed){
        visits.push({ ts: Date.now(), lat, lng, inside });
        // limit visits to last 2000 to avoid huge localStorage
        if(visits.length>2000) visits = visits.slice(visits.length-2000);
        saveStorage();
        renderHistoryForPet();
      }
    }
  }catch(err){ console.warn('ThingSpeak poll error', err); }
}

// search & filter
document.getElementById('searchBtn').addEventListener('click', ()=>{
  const q = document.getElementById('searchInput').value.trim().toLowerCase();
  if(!q){ renderPetSelector(); return; }
  const filtered = pets.filter(p => p.nombre.toLowerCase().includes(q));
  petSelector.innerHTML = '';
  filtered.forEach(p=>{
    const item = document.createElement('div');
    item.className = 'pet-item';
    item.innerHTML = `<img src="${p.foto}"><div><strong>${p.nombre}</strong><div class="muted">${p.descripcion||''}</div></div>`;
    item.onclick = ()=>selectPet(p.id);
    petSelector.appendChild(item);
  });
});

document.getElementById('dateFilter').addEventListener('change', (e)=>{
  renderHistoryForPet(e.target.value);
});

// init
loadStorage();
renderPetSelector();
// start polling frequently to simulate realtime
pollThingSpeak();
setInterval(pollThingSpeak, POLL_MS);
