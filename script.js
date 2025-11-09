// script.js
import { db, storage } from './firebase-config.js';
import { collection, addDoc, onSnapshot, doc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';

// CONFIG
const CHANNEL_DEFAULT = "3146056"; // example
const READ_API_KEY = "GSRK8SFFHTSPZALK"; // if private channels, store per pet instead

// Campus polygon (6 vertices)
const campusPolygonCoords = [
  [13.7233, -89.2032],
  [13.7224, -89.1994],
  [13.7195, -89.1998],
  [13.7165, -89.2003],
  [13.7152, -89.2060],
  [13.7192, -89.2055]
];

// Initialize map
const map = L.map('map').setView([13.719, -89.203], 15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
const campusPoly = L.polygon(campusPolygonCoords, { color:'#2b7cff', weight:2, fillOpacity:0.03 }).addTo(map);

const petsCol = collection(db, 'mascotas');

// utility: check point in polygon using turf
function isInsideCampus(lat, lng){
  const pt = turf.point([lng, lat]);
  const poly = turf.polygon([[ 
    [-89.2032, 13.7233], [-89.1994, 13.7224], [-89.1998, 13.7195],
    [-89.2003, 13.7165], [-89.2060, 13.7152], [-89.2055, 13.7192],
    [-89.2032, 13.7233]
  ]]);
  return turf.booleanPointInPolygon(pt, poly);
}

// UI elements
const petListEl = document.getElementById('petList');
const addBtn = document.getElementById('addPetBtn');
const nameIn = document.getElementById('petName');
const tsIn = document.getElementById('thingSpeakID');
const descIn = document.getElementById('petDesc');
const fileIn = document.getElementById('petPhoto');
const historyEl = document.getElementById('historyList');

let markers = {}; // docId -> marker

addBtn.addEventListener('click', async () => {
  const name = nameIn.value.trim();
  const channel = tsIn.value.trim() || CHANNEL_DEFAULT;
  const desc = descIn.value.trim();
  const file = fileIn.files[0];

  if(!name || !file){
    alert('Nombre y foto son obligatorios');
    return;
  }

  // upload image
  const storageRef = ref(storage, `mascotas/${Date.now()}_${file.name}`);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);

  // save doc
  await addDoc(petsCol, {
    nombre: name,
    channelID: channel,
    descripcion: desc,
    foto: url,
    createdAt: Date.now()
  });

  // clear form
  nameIn.value=''; tsIn.value=''; descIn.value=''; fileIn.value='';
});

// realtime listener
onSnapshot(petsCol, async (snapshot) => {
  petListEl.innerHTML = '';
  // clear markers
  for(const m of Object.values(markers)){ map.removeLayer(m); }
  markers = {};

  snapshot.forEach(docSnap => {
    const data = docSnap.data();
    const id = docSnap.id;

    // create list card
    const div = document.createElement('div');
    div.className = 'pet-item';
    div.innerHTML = `<img src="${data.foto}" alt="${data.nombre}"><div><strong>${data.nombre}</strong><div class="muted">${data.descripcion || ''}</div><div class="muted">Canal: ${data.channelID}</div></div>`;
    div.onclick = () => { fetchLatestAndCenter(id, data); };
    petListEl.appendChild(div);

    // fetch latest position and show marker
    (async ()=>{
      try{
        const ch = data.channelID || CHANNEL_DEFAULT;
        const url = `https://api.thingspeak.com/channels/${ch}/feeds.json?results=1`;
        const resp = await fetch(url);
        const txt = await resp.text();
        const json = JSON.parse(txt);
        if(json && json.feeds && json.feeds.length>0){
          const f = json.feeds[0];
          const lat = parseFloat(f.field1);
          const lng = parseFloat(f.field2);
          if(isNaN(lat)||isNaN(lng)) return;
          const inside = isInsideCampus(lat,lng);
          const color = inside ? '#2b7cff' : '#ff4d4f';
          const marker = L.circleMarker([lat,lng], { radius:8, color: color, fillColor: color, fillOpacity:1 }).addTo(map);
          marker.bindPopup(`<img src="${data.foto}" width="80"><br><b>${data.nombre}</b><br>${data.descripcion || ''}<br><b>${inside ? 'Dentro del campus' : 'Fuera del campus'}</b>`);
          markers[id]=marker;

          // optional: if outside, append history notification
          if(!inside){
            const p = document.createElement('div');
            p.innerHTML = `<strong style="color:#c00">${data.nombre} FUERA del campus</strong> — ${new Date().toLocaleString()} — ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
            historyEl.prepend(p);
            // trigger email via EmailJS if configured
            try{
              if(window.emailjs && window.emailjs.send){
                emailjs.send('YOUR_SERVICE_ID','YOUR_TEMPLATE_ID',{
                  mascota: data.nombre,
                  lat: lat.toFixed(6),
                  lng: lng.toFixed(6),
                  fecha: new Date().toLocaleString()
                });
              }
            }catch(e){ console.warn('EmailJS not configured') }
          }
        }
      }catch(err){
        console.warn('THINGSPEAK fetch error', err);
      }
    })();
  });
});

// helper: fetch latest for a pet and center map
async function fetchLatestAndCenter(docId, data){
  try{
    const ch = data.channelID || CHANNEL_DEFAULT;
    const url = `https://api.thingspeak.com/channels/${ch}/feeds.json?results=100`;
    const resp = await fetch(url);
    const json = await resp.json();
    if(!json || !json.feeds) return;
    const feeds = json.feeds.filter(f=>f.field1 && f.field2).map(f=>({lat:parseFloat(f.field1), lng:parseFloat(f.field2), ts: f.created_at}));
    if(feeds.length===0) return;
    const last = feeds[feeds.length-1];
    map.setView([last.lat, last.lng], 17);
    // show polyline
    const coords = feeds.map(f=>[f.lat,f.lng]);
    L.polyline(coords, { color:'#ff6b6b', weight:3 }).addTo(map);
  }catch(err){ console.warn(err); }
}
