// script.js - Lógica Totalmente Local (localStorage)

// ... (configuración y constantes al inicio) ...

let pets = []; // {id, nombre, descripcion, foto (URL), visits: []}
let markers = [];
let lastLocation = null;
let petCounter = 0; // Contador local para generar IDs

// --- Funciones de Lógica LocalStorage ---

function savePetsAndHistoryLocal() {
    // Guardamos todo el array 'pets' (incluyendo el historial 'visits') en localStorage
    localStorage.setItem('localPetsData', JSON.stringify(pets));
    localStorage.setItem('petIdCounter', petCounter.toString());
}

function loadPetsAndHistoryLocal() {
    const data = localStorage.getItem('localPetsData');
    const counter = localStorage.getItem('petIdCounter');
    
    if (data) {
        try {
            pets = JSON.parse(data);
            petCounter = counter ? parseInt(counter) : pets.length;
            console.log('Mascotas y historial cargados desde localStorage.');
            return true;
        } catch (e) {
            console.error('Error al cargar datos de localStorage:', e);
        }
    }
    // Si no hay datos, inicializamos con un ejemplo si es necesario, pero aquí mantenemos el array vacío
    return false;
}

// ... (uploadToImgur, sin cambios) ...

// --- Lógica de Creación de Mascotas (Totalmente Local) ---

savePetBtn.addEventListener('click', async ()=>{
    const name = newName.value.trim();
    const desc = newDesc.value.trim();
    const file = newPhoto.files[0];

    if(!name || !file){ alert('Nombre y foto requeridos'); return; }

    // 1. Subir la imagen a Imgur (SIN CAMBIOS)
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
    
    // 2. Crear el registro LOCAL
    try{
        petCounter++;
        const newPetId = 'local-' + petCounter; // ID local único
        
        const newPet = {
            id: newPetId,
            nombre: name,
            descripcion: desc,
            foto: photoUrl, 
            visits: []
        };
        
        // 3. Actualizar el array y Guardar Localmente
        pets.push(newPet);
        savePetsAndHistoryLocal(); // ⬅️ Guardar todo en localStorage
        
        renderPetSelector();
        // Seleccionamos la nueva mascota
        selectPet(newPetId);
        newName.value=''; newDesc.value=''; newPhoto.value='';
        alert('Mascota creada y guardada localmente. ID: ' + newPetId);
        savePetBtn.textContent = "Guardar mascota";
    }catch(err){ 
        console.error(err); 
        alert('Error creando mascota localmente: ' + err.message); 
        savePetBtn.textContent = "Guardar mascota";
    }
});

// --- Lógica de Carga y Renderización (Totalmente Local) ---

function renderPetSelector(){
  // ... (Lógica de renderización, SIN CAMBIOS, ya que 'pets' es el array global) ...
}

// Función de carga ahora solo intenta cargar desde localStorage
async function loadAllPetsFromDB(){
    loadPetsAndHistoryLocal();
    renderPetSelector();
    // No hay base de datos, la carga termina aquí.
}

async function selectPet(petId){
  // ... (Lógica de selección, SIN CAMBIOS) ...
}

function renderHistory(arr){
  // ... (Lógica de renderización de historial, SIN CAMBIOS) ...
}


// --- Lógica de Polling ThingSpeak (Guarda en la memoria local) ---

async function pollThingSpeak(){
  try{
    // ... (Lógica de ThingSpeak y cálculo de lat, lng, changed, SIN CAMBIOS) ...

    const res = await fetch(`https://api.thingspeak.com/channels/${THINGSPEAK_CHANNEL}/feeds.json?results=1`);
    // ... (Procesamiento de datos de ThingSpeak) ...

    // Bloque modificado para guardar ubicaciones LOCALMENTE
    if(changed && pets.length > 0){
        // No hay necesidad de Promise.all, ya que todas las actualizaciones son locales
        pets.forEach((p) => {
            // Actualizar el historial local (pets.visits) para la UI
            p.visits.push({ lat: lat, lng: lng, ts: Date.now() });
        });

        // Guardamos el historial actualizado en localStorage
        savePetsAndHistoryLocal(); 
        
        // Renderizar el historial de la mascota seleccionada
        const sel = pets.find(p => p.id === petSelector.querySelector('.active')?.dataset.id) || pets[0];
        if(sel) renderHistory(sel.visits || []);
    }
}

// --- Inicio de la Aplicación (Simplificado) ---
// Ya no necesitamos esperar por Firebase, cargamos y empezamos inmediatamente.

loadAllPetsFromDB(); // Carga las mascotas y el historial del localStorage
pollThingSpeak();
setInterval(pollThingSpeak, POLL_MS);
