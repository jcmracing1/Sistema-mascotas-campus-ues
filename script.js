// script.js - Arquitectura Firebase/Firestore (Seguro y Escalable)

// 🚨 CONFIGURACIÓN DE SERVICIOS EXTERNOS 🚨

// ⚠️ REEMPLAZA CON TU CLIENT ID DE IMGUR
const IMGUR_CLIENT_ID = "jcmracing"; 
const IMGUR_UPLOAD_URL = "https://api.imgur.com/3/image";

const THINGSPEAK_CHANNEL = 3146056;
const POLL_MS = 5000; // 5 segundos para una actualización más rápida

// --- Inicialización de Mapa y Elementos ---

const map = L.map('map').setView([13.719, -89.203], 15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
const campusPoly = [[13.7233, -89.2032],[13.7224, -89.1994],[13.7195, -89.1998],[13.7165, -89.2003],[13.7152, -89.2060],[13.7192, -89.2055]];
L.polygon(campusPoly, {color:'#2b7cff', weight:2, fillOpacity:0.03}).addTo(map);

// ... (Declaración de constantes DOM petSelector, petNameEl, etc.) ...
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

let pets = []; // {id (de Firestore), nombre, descripcion, foto (URL), visits}
let markers = [];
let lastLocation = null;

// --- Funciones de Utilidad (Imgur) ---

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

// --- Lógica de Creación de Mascotas (Firestore) ---

savePetBtn.addEventListener('click', async ()=>{
    const name = newName.value.trim();
    const desc = newDesc.value.trim();
    const file = newPhoto.files[0];

    if(!name || !file){ alert('Nombre y foto requeridos'); return; }

    // 1. Subir la imagen a Imgur
    let photoUrl = '';
    try {
        savePetBtn.textContent = "Subiendo foto a Imgur...";
        photoUrl = await uploadToImgur(file); 
        savePetBtn.textContent = "Guardando datos en DB...";
    } catch(err) {
        console.error(err); 
        alert('Error subiendo foto a Imgur: ' + err.message); 
        savePetBtn.textContent = "Guardar mascota";
        return;
    }
    
    // 2. Crear el Documento en la Colección 'pets' de Firestore
    try{
        const newPetData = {
            nombre: name,
            descripcion: desc,
            fotoURL: photoUrl, // Guardamos la URL
            activo: true
        };
        
        // addDoc agrega un nuevo documento a la colección "pets"
        const docRef = await window.db_functions.addDoc(window.db_functions.collection(window.db, "pets"), newPetData);
        const petId = docRef.id;

        // 3. Actualizar la UI
        pets.push({ id: petId, nombre: name, descripcion: desc, foto: photoUrl, visits: [] });
        renderPetSelector();
        newName.value=''; newDesc.value=''; newPhoto.value='';
        alert('Mascota creada. ID de Firestore: ' + petId);
        savePetBtn.textContent = "Guardar mascota";
    }catch(err){ 
        console.error(err); 
        alert('Error creando mascota en Firestore: ' + err.message); 
        savePetBtn.textContent = "Guardar mascota";
    }
});

// --- Lógica de Carga y Renderización (Firestore) ---

function renderPetSelector(){
  petSelector.innerHTML = '';
  pets.forEach(p=>{
    const div = document.createElement('div');
    div.className = 'pet-item';
    // p.foto es ahora la URL de Imgur/GitHub Pages
    div.innerHTML = `<img src="${p.foto}" alt="${p.nombre}"><div><strong>${p.nombre}</strong><div class="muted">${p.descripcion||''}</div></div>`;
    div.onclick = ()=>selectPet(p.id); // Usamos el ID de Firestore
    petSelector.appendChild(div);
  });
  if(pets.length>0) selectPet(pets[0].id);
}

// Función para obtener todas las mascotas desde la colección 'pets'
async function loadAllPetsFromDB(){
  try{
    const petsSnapshot = await window.db_functions.getDocs(window.db_functions.collection(window.db, "pets"));
    
    pets = petsSnapshot.docs.map(doc => ({
        id: doc.id,
        nombre: doc.data().nombre,
        descripcion: doc.data().descripcion,
        foto: doc.data().fotoURL, // Usamos fotoURL
        visits: [] // Las visits se cargan por separado
    }));
    
    // Aquí podrías cargar el historial de visits para la mascota seleccionada si fuera necesario
    // Pero por ahora, mantenemos 'visits: []' y se llenan en el polling para mantener la lógica de tu UI.
    
    renderPetSelector();
  } catch(err) {
    console.error("Error cargando mascotas de Firestore:", err);
    alert("Error al cargar la lista de mascotas. Revisa las credenciales y las reglas de Firebase.");
  }
}

async function selectPet(petId){
  let p = pets.find(x=>x.id===petId);
  if(!p) return; // Si no se encuentra, salimos.
  
  petNameEl.textContent = p.nombre;
  petPhotoEl.src = p.foto; 
  petDescEl.textContent = p.descripcion || '';
  
  // TO-DO: Implementar la carga del historial desde la colección 'locations'
  // Por ahora, solo muestra lo que se ha guardado localmente en el polling
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

// --- Lógica de Polling ThingSpeak (Guarda en la colección 'locations') ---

async function pollThingSpeak(){
  try{
    // ... (Lógica de ThingSpeak y cálculo de lat, lng, changed) ...
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

    // BLOQUE OPTIMIZADO CON PROMISE.ALL (para guardar ubicaciones en la colección 'locations')
    if(changed && pets.length > 0){
        const updatePromises = pets.map(async (p) => {
            try {
                // Agregar un nuevo documento a la colección 'locations'
                await window.db_functions.addDoc(window.db_functions.collection(window.db, "locations"), {
                    petId: p.id,
                    lat: lat, 
                    lng: lng,
                    ts: new Date() // Usamos el objeto Date de JS/Firestore
                });

                // Actualizar el historial local (pets.visits) para la UI temporal
                p.visits.push({ lat: lat, lng: lng, ts: Date.now() });
                return true;
            } catch (err) { 
                console.warn('Error saving location for', p.nombre, err); 
                return false;
            }
        });

        await Promise.all(updatePromises); 
        
        // Renderizar el historial de la mascota seleccionada
        const sel = pets.find(p => p.id === petSelector.querySelector('.active')?.dataset.id) || pets[0];
        if(sel) renderHistory(sel.visits || []);
    }
}

// --- Inicio de la Aplicación ---
// Espera a que la BD esté inicializada antes de cargar
if (window.db) {
    loadAllPetsFromDB();
    pollThingSpeak();
    setInterval(pollThingSpeak, POLL_MS);
} else {
    // Si la BD no está lista, espera un poco y luego inicia
    setTimeout(() => {
        loadAllPetsFromDB();
        pollThingSpeak();
        setInterval(pollThingSpeak, POLL_MS);
    }, 500);
}
