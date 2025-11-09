// script.js - JSONBin per-pet (master key embedded).
// Note: embedding master key in client code allows anyone to create bins using your key.

const JSONBIN_MASTER_KEY = "$2a$10$.4D97bG7TmCMHK2IxDIbAekq00vrpkCEmQafbQ8MaJWxBcj8KQ9Le";
const JSONBIN_BASE = "https://api.jsonbin.io/v3/b";

const THINGSPEAK_CHANNEL = 3146056;
const POLL_MS = 15000; // 15s

const map = L.map('map').setView([13.719, -89.203], 15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
const campusPoly = [[13.7233, -89.2032],[13.7224, -89.1994],[13.7195, -89.1998],[13.7165, -89.2003],[13.7152, -89.2060],[13.7192, -89.2055]];
L.polygon(campusPoly, {color:'#2b7cff', weight:2, fillOpacity:0.03}).addTo(map);

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

let pets = []; // {binId, nombre, descripcion, foto}
let markers = [];
let lastLocation = null;

async function createPetBin(name, desc, photoDataUrl) {
  const payload = { meta: { nombre: name, descripcion: desc }, foto: photoDataUrl, visits: [] };
  const res = await fetch(JSONBIN_BASE, { method:'POST', headers: { 'Content-Type':'application/json', 'X-Master-Key': JSONBIN_MASTER_KEY }, body: JSON.stringify({ data: payload, private: true }) });
  if(!res.ok) throw new Error('Create bin failed: ' + res.status);
  const j = await res.json();
  const id = j.metadata && j.metadata.id ? j.metadata.id : (j.record && j.record.id ? j.record.id : null);
  return id;
}

async function readBin(binId) {
  const url = `${JSONBIN_BASE}/${binId}/latest`;
  const res = await fetch(url, { headers: { 'X-Master-Key': JSONBIN_MASTER_KEY } });
  if(!res.ok) return null;
  const j = await res.json();
  return j.record ? j.record : j;
}

async function updateBin(binId, data) {
  const url = `${JSONBIN_BASE}/${binId}`;
  const res = await fetch(url, { method:'PUT', headers: { 'Content-Type':'application/json', 'X-Master-Key': JSONBIN_MASTER_KEY }, body: JSON.stringify({ data: data }) });
  return res.ok;
}

savePetBtn.addEventListener('click', async ()=>{
  const name = newName.value.trim();
  const desc = newDesc.value.trim();
  const file = newPhoto.files[0];
  if(!name || !file){ alert('Nombre y foto requeridos'); return; }
  const reader = new FileReader();
  reader.onload = async (e)=>{
    const dataUrl = e.target.result;
    try{
      const binId = await createPetBin(name, desc, dataUrl);
      pets.push({ binId: binId, nombre: name, descripcion: desc, foto: dataUrl, visits: [] });
      localStorage.setItem('jsonbin_pet_bins', JSON.stringify(pets));
      renderPetSelector();
      newName.value=''; newDesc.value=''; newPhoto.value='';
      alert('Mascota creada. Bin ID: ' + binId);
    }catch(err){ console.error(err); alert('Error creando mascota: ' + err.message); }
  };
  reader.readAsDataURL(file);
});

function renderPetSelector(){
  petSelector.innerHTML = '';
  pets.forEach(p=>{
    const div = document.createElement('div');
    div.className = 'pet-item';
    div.innerHTML = `<img src="${p.foto}" alt="${p.nombre}"><div><strong>${p.nombre}</strong><div class="muted">${p.descripcion||''}</div></div>`;
    div.onclick = ()=>selectPet(p.binId);
    petSelector.appendChild(div);
  });
  if(pets.length>0) selectPet(pets[0].binId);
}

async function loadAllBins(){
  const cache = localStorage.getItem('jsonbin_pet_bins');
  if(cache){ pets = JSON.parse(cache); renderPetSelector(); return; }
}

async function selectPet(binId){
  let p = pets.find(x=>x.binId===binId);
  if(!p){
    const rec = await readBin(binId);
    if(!rec) return;
    p = { binId: binId, nombre: rec.meta.nombre, descripcion: rec.meta.descripcion, foto: rec.foto, visits: rec.visits || [] };
    pets.push(p); localStorage.setItem('jsonbin_pet_bins', JSON.stringify(pets));
  }
  petNameEl.textContent = p.nombre;
  petPhotoEl.src = p.foto;
  petDescEl.textContent = p.descripcion || '';
  renderHistory(p.visits || []);
}

function renderHistory(arr){
  historyList.innerHTML = '';
  if(!arr || arr.length===0){ historyList.innerHTML = '<div class="muted">No hay historial</div>'; return; }
  arr.slice().reverse().forEach(v=>{
    const d = new Date(v.ts);
    const el = document.createElement('div');
    el.className = 'entry';
    el.innerHTML = `<div>${d.toLocaleString()}</div><div style="font-weight:700">${v.lat.toFixed(6)}, ${v.lng.toFixed(6)}</div>`;
    el.onclick = ()=>{ map.setView([v.lat, v.lng], 17); L.popup().setLatLng([v.lat, v.lng]).setContent(`${d.toLocaleString()}<br>${v.lat.toFixed(6)}, ${v.lng.toFixed(6)}`).openOn(map); };
    historyList.appendChild(el);
  });
}

async function pollThingSpeak(){
  try{
    const res = await fetch(`https://api.thingspeak.com/channels/${THINGSPEAK_CHANNEL}/feeds.json?results=1`);
    const j = await res.json();
    if(!j || !j.feeds || j.feeds.length===0) return;
    const f = j.feeds[0];
    const lat = parseFloat(f.field1);
    const lng = parseFloat(f.field2);
    if(isNaN(lat) || isNaN(lng)) return;
    lastUpdateEl.textContent = new Date(f.created_at).toLocaleString();
    lastLatEl.textContent = lat.toFixed(6);
    lastLngEl.textContent = lng.toFixed(6);

    const changed = !lastLocation || (Math.abs(lastLocation.lat - lat) > 1e-6 || Math.abs(lastLocation.lng - lng) > 1e-6);
    lastLocation = {lat, lng};

    markers.forEach(m=>map.removeLayer(m)); markers = [];
    pets.forEach(p=>{ const mk = L.marker([lat, lng]).addTo(map).bindPopup(`<img src="${p.foto}" width="80"><br><b>${p.nombre}</b><br>${p.descripcion||''}`); markers.push(mk); });
    map.setView([lat, lng]);

    const inside = turf.booleanPointInPolygon(turf.point([lng, lat]), turf.polygon([[ [-89.2032,13.7233],[-89.1994,13.7224],[-89.1998,13.7195],[-89.2003,13.7165],[-89.2060,13.7152],[-89.2055,13.7192],[-89.2032,13.7233] ]]));
    if(!inside){ const n = document.createElement('div'); n.className='entry'; n.innerHTML=`<strong style="color:var(--danger)">ALERTA: Fuera del campus</strong> — ${new Date().toLocaleString()} — ${lat.toFixed(6)}, ${lng.toFixed(6)}`; historyList.prepend(n); }

    if(changed){
      for(const p of pets){
        try{
          const rec = await readBin(p.binId);
          const visits = (rec && rec.visits) ? rec.visits : [];
          visits.push({ lat: lat, lng: lng, ts: Date.now() });
          const newData = { meta: rec.meta, foto: rec.foto, visits: visits };
          await updateBin(p.binId, newData);
          p.visits = visits;
          localStorage.setItem('jsonbin_pet_bins', JSON.stringify(pets));
        }catch(err){ console.warn('Error updating bin for', p.binId, err); }
      }
      const sel = pets[0]; if(sel) renderHistory(sel.visits || []);
    }
  }catch(err){ console.warn('ThingSpeak poll error', err); }
}

loadAllBins();
pollThingSpeak();
setInterval(pollThingSpeak, POLL_MS);
