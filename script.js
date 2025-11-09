// script.js - Arquitectura JSONBin con Base64, Bin Maestro y optimización Promise.all

// 🚨 CONFIGURACIÓN REQUERIDA 🚨
// 1. REEMPLAZA CON TU Access Key de JSONBin
const JSONBIN_MASTER_KEY = "$2a$10$.4D97bG7TmCMHK2IxDIbAekq00vrpkCEmQafbQ8MaJWxBcj8KQ9Le"; 
const JSONBIN_BASE = "https://api.jsonbin.io/v3/b";

// 2. REEMPLAZA CON EL ID DE TU BIN MAESTRO (creado con { "pet_ids": [] })
const MASTER_BIN_ID = "6910195c43b1c97be9a1d645"; 

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

let pets = []; // {binId, nombre, descripcion, foto (Base64), visits}
let markers = [];
let lastLocation = null;

// --- Funciones de Utilidad (JSONBin) ---

// Función modificada para guardar la cadena Base64
async function createPetBin(name, desc, base64Data) { 
  const payload = { meta: { nombre: name, descripcion: desc }, foto: base64Data, visits: [] }; 
  const res = await fetch(JSONBIN_BASE, { 
    method:'POST', 
    headers: { 
        'Content-Type':'application/json', 
        'X-Master-Key': JSONBIN_MASTER_KEY 
    }, 
    body: JSON.stringify({ data: payload, private: true }) 
  });
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
  // Devuelve el objeto record completo (Bin Maestro: { pet_ids: [] } o Bin Mascota: { meta: {}, foto: "", visits: [] })
  return j.record ? j.record : j; 
}

async function updateBin(binId, data) {
  const url = `${JSONBIN_BASE}/${binId}`;
  const res = await fetch(url, { method:'PUT', headers: { 'Content-Type':'application/json', 'X-Master-Key': JSONBIN_MASTER_KEY }, body: JSON.stringify({ data: data }) });
  return res.ok;
}

// --- Lógica de Creación de Mascotas (Usa FileReader) ---

savePetBtn.addEventListener('click', async ()=>{
    const name = newName.value.trim();
    const desc = newDesc.value.trim();
    const file = newPhoto.files[0];

    if(!name || !file){ 
      alert('Nombre y foto requeridos'); 
      return; 
    }

    // 1. Lector de archivos para convertir la foto a Base64
    const reader = new FileReader();

    reader.onload = async (e) => {
        const base64Data = e.target.result; // <-- Foto en Base64
        savePetBtn.textContent = "Guardando datos...";

        // 2. Crear el Bin individual de la Mascota
        let binId;
        try{
            binId = await createPetBin(name, desc, base64Data);
        }catch(err){ 
            console.error(err); 
            alert('Error creando Bin de mascota: ' + err.message); 
            savePetBtn.textContent = "Guardar mascota";
            return;
        }

        // 3. Añadir el nuevo Bin ID al Bin Maestro ({ pet_ids: [] })
        try{
            const masterData = await readBin(MASTER_BIN_ID) || { pet_ids: [] }; 
            if (!Array.isArray(masterData.pet_ids)) { masterData.pet_ids = []; } // Protección
            masterData.pet_ids.push(binId);
            await updateBin(MASTER_BIN_ID, masterData);
        } catch(err) {
            console.error("Error al actualizar Bin Maestro. La mascota fue creada pero podría no aparecer:", err);
            alert("Mascota creada, pero no se pudo registrar en la lista principal. Revisar Bin Maestro.");
        }
        
        // 4. Actualizar la UI
        pets.push({ binId: binId, nombre: name, descripcion: desc, foto: base64Data, visits: [] });
        localStorage.setItem('jsonbin_pet_bins', JSON.stringify(pets.map(p => ({ binId: p.binId, nombre: p.nombre, descripcion: p.descripcion, foto: p.foto }))));
        renderPetSelector();
        newName.value=''; newDesc.value=''; newPhoto.value='';
        alert('Mascota creada. Bin ID: ' + binId);
        savePetBtn.textContent = "Guardar mascota";
    };

    reader.onerror = (e) => {
        alert("Error al leer el archivo de la imagen.");
        savePetBtn.textContent = "Guardar mascota";
    };

    reader.readAsDataURL(file); // Inicia la lectura del archivo
    savePetBtn.textContent = "Leyendo archivo...";
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

// Función modificada para leer el Bin Maestro
async function loadAllBins(){
  const masterData = await readBin(MASTER_BIN_ID); 
  
  // Asegurarse de que el Bin Maestro tenga la estructura { pet_ids: [] }
  if(!masterData || !masterData.pet_ids || masterData.pet_ids.length === 0){
    console.log("No hay IDs en el Bin Maestro o la estructura es incorrecta.");
    renderPetSelector();
    return;
  }
  
  const masterList = masterData.pet_ids;
  
  // Leer cada Bin individualmente (concurrente con Promise.all)
  const petPromises = masterList.map(async binId => {
    const rec = await readBin(binId);
    if(rec){
      return { 
        binId: binId, 
        nombre: rec.meta.nombre, 
        descripcion: rec.meta.descripcion, 
        foto: rec.foto, // Base64
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
    // Caso de respaldo si el bin no estaba en la lista local
    const rec = await readBin(binId);
    if(!rec) return;
    p = { binId: binId, nombre: rec.meta.nombre, descripcion: rec.meta.descripcion, foto: rec.foto, visits: rec.visits || [] };
  }
  petNameEl.textContent = p.nombre;
  petPhotoEl.src = p.foto; // Muestra la Base64
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

// --- Lógica de Polling ThingSpeak (Optimizada con Promise.all) ---

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
    pets.forEach(p=>{ const mk = L.marker([lat, lng]).addTo(map).bindPopup(`<img src=\"${p.foto}\" width=\"80\"><br><b>${p.nombre}</b><br>${p.descripcion||''}`); markers.push(mk); });
    map.setView([lat, lng]);

    const inside = turf.booleanPointInPolygon(turf.point([lng, lat]), turf.polygon([[ [-89.2032,13.7233],[-89.1994,13.7224],[-89.1998,13.7195],[-89.2003,13.7165],[-89.2060,13.7152],[-89.2055,13.7192],[-89.2032,13.7233] ]]));
    if(!inside){ const n = document.createElement('div'); n.className='entry'; n.innerHTML=`<strong style="color:var(--danger)">ALERTA: Fuera del campus</strong> — ${new Date().toLocaleString()} — ${lat.toFixed(6)}, ${lng.toFixed(6)}`; historyList.prepend(n); }

    // BLOQUE OPTIMIZADO CON PROMISE.ALL (para actualizar cada 3 segundos)
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
        const sel = pets.find(p => p.binId === petSelector.querySelector('.active')?.dataset.binid) || pets[0];
        if(sel) renderHistory(sel.visits || []);
    }
    // FIN DEL BLOQUE OPTIMIZADO
  }catch(err){ console.warn('ThingSpeak poll error', err); }
}

// --- Inicio de la Aplicación ---
loadAllBins();
pollThingSpeak();
setInterval(pollThingSpeak, POLL_MS);
