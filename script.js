// script.js - Arquitectura JSONBin con Bin Maestro e Imgur Upload.

// 🚨 CONFIGURACIÓN DE SEGURIDAD Y SERVICIOS 🚨
const JSONBIN_MASTER_KEY = "$2a$10$47T9xhBr26hDgtu1jHZvaelzxRaNGjjmJn2w44bksqkRj.q6OvR2W"; 
const JSONBIN_BASE = "https://api.jsonbin.io/v3/b";
const MASTER_BIN_ID = "6910195c43b1c97be9a1d645"; // Bin con un arreglo de IDs: ["id1", "id2", ...]

const IMGUR_CLIENT_ID = "jcmracing"; 
const IMGUR_UPLOAD_URL = "https://api.imgur.com/3/image";

const THINGSPEAK_CHANNEL = 3146056;
const POLL_MS = 3000; // 3 segundos para una actualización más rápida

// --- Inicialización de Mapa y Elementos ---

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

let pets = []; // {binId, nombre, descripcion, foto, visits}
let markers = [];
let lastLocation = null;

// --- Funciones de Utilidad (JSONBin y Imgur) ---

async function uploadToImgur(file) {
    const formData = new FormData();
    formData.append('image', file);
    
    const res = await fetch(IMGUR_UPLOAD_URL, {
        method: 'POST',
        headers: { 'Authorization': `Client-ID ${IMGUR_CLIENT_ID}` },
        body: formData
    });

    if (!res.ok) throw new Error('Fallo al subir a Imgur: ' + res.statusText);
    const json = await res.json();
    if (!json.success || !json.data.link) throw new Error('Respuesta de Imgur inválida.');
    return json.data.link;
}

async function createPetBin(name, desc, photoUrl) {
  // Guarda solo la URL de Imgur, NO Base64
  const payload = { meta: { nombre: name, descripcion: desc }, foto: photoUrl, visits: [] }; 
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

// --- Lógica de Creación de Mascotas ---

savePetBtn.addEventListener('click', async ()=>{
  const name = newName.value.trim();
  const desc = newDesc.value.trim();
  const file = newPhoto.files[0];

  if(!name || !file){ alert('Nombre y foto requeridos'); return; }

  // 1. Subir la imagen a Imgur y obtener la URL
  let photoUrl = '';
  try {
    savePetBtn.textContent = "Subiendo foto a Imgur...";
    photoUrl = await uploadToImgur(file);
    savePetBtn.textContent = "Guardando datos...";
  } catch(err) {
    console.error(err); 
    alert('Error subiendo foto a Imgur: ' + err.message); 
    savePetBtn.textContent = "Guardar mascota";
    return;
  }
  
  // 2. Crear el Bin individual de la Mascota
  let binId;
  try{
    binId = await createPetBin(name, desc, photoUrl); 
  }catch(err){ 
    console.error(err); 
    alert('Error creando Bin de mascota: ' + err.message); 
    savePetBtn.textContent = "Guardar mascota";
    return;
  }

  // 3. Añadir el nuevo Bin ID al Bin Maestro
  try{
    const masterList = await readBin(MASTER_BIN_ID) || [];
    masterData.pet_ids.push(binId);
    await updateBin(MASTER_BIN_ID, masterData);
  } catch(err) {
     console.error("Error al actualizar Bin Maestro. La mascota fue creada pero podría no aparecer:", err);
     alert("Mascota creada, pero no se pudo registrar en la lista principal. Revisar Bin Maestro.");
  }
  
  // 4. Actualizar la UI
  pets.push({ binId: binId, nombre: name, descripcion: desc, foto: photoUrl, visits: [] });
  localStorage.setItem('jsonbin_pet_bins', JSON.stringify(pets.map(p => ({ binId: p.binId, nombre: p.nombre, descripcion: p.descripcion, foto: p.foto }))));
  renderPetSelector();
  newName.value=''; newDesc.value=''; newPhoto.value='';
  alert('Mascota creada. Bin ID: ' + binId);
  savePetBtn.textContent = "Guardar mascota";
});

// --- Lógica de Carga y Renderización ---

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
  // Intenta cargar la lista de Bin IDs del Bin Maestro
  const const masterData = await readBin(MASTER_BIN_ID); 
  if(!masterData || const masterList = masterData.pet_ids;){
    console.log("No hay IDs en el Bin Maestro.");
    renderPetSelector();
    return;
  }
  
  // Leer cada Bin individualmente (concurrente)
  const petPromises = masterList.map(async binId => {
    const rec = await readBin(binId);
    if(rec){
      return { 
        binId: binId, 
        nombre: rec.meta.nombre, 
        descripcion: rec.meta.descripcion, 
        foto: rec.foto, 
        visits: rec.visits || [] 
      };
    }
    return null;
  });

  pets = (await Promise.all(petPromises)).filter(p => p !== null);
  
  // Actualiza el caché local (solo metadatos)
  localStorage.setItem('jsonbin_pet_bins', JSON.stringify(pets.map(p => ({
    binId: p.binId, nombre: p.nombre, descripcion: p.descripcion, foto: p.foto
  }))));

  renderPetSelector();
}

async function selectPet(binId){
  let p = pets.find(x=>x.binId===binId);
  if(!p){
    // Este caso solo ocurriría si el loadAllBins falló o si se intenta leer un bin no listado
    const rec = await readBin(binId);
    if(!rec) return;
    p = { binId: binId, nombre: rec.meta.nombre, descripcion: rec.meta.descripcion, foto: rec.foto, visits: rec.visits || [] };
    // No añadimos al array 'pets' global para no duplicar si loadAllBins fue parcial. Solo lo mostramos.
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

// --- Lógica de Polling ThingSpeak (Optimizada) ---

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

    // BLOQUE OPTIMIZADO CON PROMISE.ALL
    if(changed && pets.length > 0){
        const updatePromises = pets.map(async (p) => {
            try {
                const rec = await readBin(p.binId);
                const visits = (rec && rec.visits) ? rec.visits : [];
                visits.push({ lat: lat, lng: lng, ts: Date.now() });
                
                const newData = { meta: rec.meta, foto: rec.foto, visits: visits };
                const success = await updateBin(p.binId, newData);

                if (success) {
                    p.visits = visits;
                    return true;
                }
                return false;
            } catch (err) { 
                console.warn('Error updating bin for', p.binId, err); 
                return false;
            }
        });

        await Promise.all(updatePromises); 
        
        localStorage.setItem('jsonbin_pet_bins', JSON.stringify(pets.map(p => ({ binId: p.binId, nombre: p.nombre, descripcion: p.descripcion, foto: p.foto }))));
        const sel = pets[0]; 
        if(sel) renderHistory(sel.visits || []);
    }
    // FIN DEL BLOQUE OPTIMIZADO
  }catch(err){ console.warn('ThingSpeak poll error', err); }
}

// --- Inicio de la Aplicación ---
loadAllBins();
pollThingSpeak();
setInterval(pollThingSpeak, POLL_MS);
