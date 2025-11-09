// script.js - Multi-mascota tracker (ThingSpeak same channel)
const CHANNEL_ID = "3146056";
const READ_API_KEY = "GSRK8SFFHTSPZALK";
const MAX_POINTS = 300;
const REFRESH_MS = 5000;

// Define three pets (keys should match field4/field5 values sent to ThingSpeak)
const PETS = [
  { key: "nessa", name: "Nessa", photo: "img/nessa.jpg", desc: "Perrita pitbull.", color: "#ff6b6b", visible: true },
  { key: "cleo", name: "Cleo", photo: "img/cleo.jpg", desc: "Perrita boxer.", color: "#4dabf7", visible: true },
  { key: "doguie", name: "Doguie", photo: "img/doguie.jpg", desc: "Perrita french.", color: "#ffd166", visible: true }
];

// campus polygon (6 vertices provided previously)
const CAMPUS = [
  [13.7233, -89.2032],
  [13.7224, -89.1994],
  [13.7195, -89.1998],
  [13.7165, -89.2003],
  [13.7152, -89.2060],
  [13.7192, -89.2055]
];

// map init
const map = L.map('map').setView([13.719, -89.203], 15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
const campusLayer = L.polygon(CAMPUS, { color:'#2b7cff', weight:2, fillOpacity:0.03 }).addTo(map);
map.fitBounds(campusLayer.getBounds().pad(0.2));

// state per-pet
let pointsByPet = {}; // key -> [{lat,lng,alt,ts,entry_id},...]
let polyByPet = {};    // key -> L.polyline
let markerByPet = {};  // key -> L.circleMarker
let lastEntryIdByPet = {}; // key -> last entry id recorded
let allPoints = []; // for combined history (includes petKey)

PETS.forEach(p => { pointsByPet[p.key]=[]; lastEntryIdByPet[p.key]=0; });

// utils
function fetchFeeds(results=MAX_POINTS){
  const url = `https://api.thingspeak.com/channels/${CHANNEL_ID}/feeds.json?api_key=${READ_API_KEY}&results=${results}`;
  return fetch(url).then(r=>r.json());
}
function fmt(dt){ if(!dt) return '—'; return new Date(dt).toLocaleString(); }
function playAlert(){ try{ const a=new (window.AudioContext||window.webkitAudioContext)(); const o=a.createOscillator(); o.type='sine'; o.frequency.setValueAtTime(800,a.currentTime); o.connect(a.destination); o.start(); o.stop(a.currentTime+0.35);}catch(e){} }

// UI builders
const petSelector = document.getElementById('petSelector');
const toggles = document.getElementById('toggles');
const historyList = document.getElementById('historyList');
const alertBox = document.getElementById('alertBox');
const petNameEl = document.getElementById('petName');
const petPhotoEl = document.getElementById('petPhoto');
const petDescEl = document.getElementById('petDesc');
const statusInfo = document.getElementById('statusInfo');

function buildUI(){
  petSelector.innerHTML='';
  toggles.innerHTML='';
  PETS.forEach(p=>{
    const div = document.createElement('div');
    div.className='pet-card';
    div.innerHTML = `<img src="${p.photo}" alt="${p.name}"><div><strong>${p.name}</strong><div style="font-size:13px;color:#666">${p.desc}</div></div>`;
    div.onclick = ()=>{ selectPet(p.key); };
    petSelector.appendChild(div);

    const cb = document.createElement('label');
    cb.innerHTML = `<input type="checkbox" data-key="${p.key}" ${p.visible? 'checked':''}/> <span style="display:inline-block;width:12px;height:12px;background:${p.color};margin-right:6px;border-radius:3px;vertical-align:middle;"></span>${p.name}`;
    cb.querySelector('input').addEventListener('change', (e)=>{
      p.visible = e.target.checked;
      updateVisibility(p.key, p.visible);
    });
    toggles.appendChild(cb);
  });
}
function selectPet(key){
  const p = PETS.find(x=>x.key===key);
  if(!p) return;
  petNameEl.textContent = p.name;
  petPhotoEl.src = p.photo;
  petDescEl.textContent = p.desc;
  // update status for last point
  const arr = pointsByPet[key]||[];
  if(arr.length>0){
    const last = arr[arr.length-1];
    statusInfo.textContent = `Última: ${fmt(last.ts)} — ${last.lat.toFixed(6)}, ${last.lng.toFixed(6)}`;
  } else {
    statusInfo.textContent = 'No hay posiciones aún';
  }
}

// Update visibility of markers and polylines
function updateVisibility(key, visible){
  if(markerByPet[key]){ if(visible) map.addLayer(markerByPet[key]); else map.removeLayer(markerByPet[key]); }
  if(polyByPet[key]){ if(visible) map.addLayer(polyByPet[key]); else map.removeLayer(polyByPet[key]); }
  renderHistory(allPoints); // refresh history list to only show visible ones highlighted
}

// parse feeds and assign to pets by field4/field5 (case-insensitive)
function assignFeeds(feeds){
  // feeds: array of TS feed objects
  // reset temp arrays
  const unassigned = [];
  const assignedPoints = {};
  PETS.forEach(p=> assignedPoints[p.key]=[]);

  feeds.forEach(f=>{
    const lat = parseFloat(f.field1);
    const lng = parseFloat(f.field2);
    if(!isFinite(lat) || !isFinite(lng)) return;
    const alt = f.field3 ? parseFloat(f.field3): null;
    const id = (f.field4 || f.field5 || "").trim();
    const entry = { lat, lng, alt, ts: f.created_at, entry_id: f.entry_id };
    if(id){
      const match = PETS.find(p => p.key.toLowerCase()===id.toLowerCase() || p.name.toLowerCase()===id.toLowerCase());
      if(match) assignedPoints[match.key].push(entry);
      else unassigned.push(entry);
    } else {
      unassigned.push(entry);
    }
  });

  // If unassigned exist and some pets have no data, distribute last unassigned to them as fallback
  const petsWithData = PETS.filter(p=>assignedPoints[p.key].length>0);
  if(petsWithData.length===0 && unassigned.length>0){
    // distribute latest among pets: give latest to all to have an initial marker
    const last = unassigned[unassigned.length-1];
    PETS.forEach(p=> assignedPoints[p.key].push(last));
  }

  return assignedPoints;
}

// main update loop
async function updateAll(live=false){
  try{
    const data = await fetchFeeds(MAX_POINTS);
    if(!data || !data.feeds) return;
    const assigned = assignFeeds(data.feeds);
    allPoints = []; // rebuild combined list with petKey
    let anyOut = false;

    PETS.forEach(p=>{
      const arr = assigned[p.key] || [];
      // sort by time asc
      arr.sort((a,b)=> new Date(a.ts) - new Date(b.ts));
      pointsByPet[p.key] = arr;
      // update polyline
      const coords = arr.map(x=>[x.lat,x.lng]);
      if(polyByPet[p.key]) polyByPet[p.key].setLatLngs(coords);
      else polyByPet[p.key] = L.polyline(coords, { color: p.color, weight:3 }).addTo(map);

      // last marker
      if(arr.length>0){
        const last = arr[arr.length-1];
        if(markerByPet[p.key]) markerByPet[p.key].setLatLng([last.lat,last.lng]);
        else {
          markerByPet[p.key] = L.circleMarker([last.lat,last.lng], { radius:8, color:p.color, fillColor:p.color, fillOpacity:1 }).addTo(map);
          markerByPet[p.key].bindPopup(`<strong>${p.name}</strong><br>${fmt(last.ts)}<br>${last.lat.toFixed(6)}, ${last.lng.toFixed(6)}`);
        }
        // check inside campus
        const inside = turf.booleanPointInPolygon(turf.point([last.lng,last.lat]), turf.polygon([[
          [CAMPUS[0][1],CAMPUS[0][0]],[CAMPUS[1][1],CAMPUS[1][0]],[CAMPUS[2][1],CAMPUS[2][0]],
          [CAMPUS[3][1],CAMPUS[3][0]],[CAMPUS[4][1],CAMPUS[4][0]],[CAMPUS[5][1],CAMPUS[5][0]],[CAMPUS[0][1],CAMPUS[0][0]]
        ]]));
        if(!inside) anyOut = true;
        // append to combined history
        allPoints.push({ petKey: p.key, petName: p.name, ...last });
      }
    });

    // update alert box
    if(anyOut){
      alertBox.style.display='block';
      alertBox.style.background='var(--danger)';
      alertBox.textContent = '⚠️ Alerta: una o más mascotas están fuera del campus!';
      playAlert();
    } else {
      alertBox.style.display='block';
      alertBox.style.background='#28a745';
      alertBox.textContent = '✅ Todas las mascotas dentro del campus';
    }

    // update visibility according to toggles
    PETS.forEach(p=> updateVisibility(p.key,p.visible));

    // update history UI (show combined but color-coded and allow filter by pet visibility)
    renderHistory(allPoints);

  }catch(err){
    console.warn('Update error', err);
  }
}

// render combined history (reverse chronological)
definitely_not_valid = True

function renderHistory(list){
  historyList.innerHTML='';
  if(!list || list.length===0){ historyList.innerHTML='<div style="color:#999">No hay historial.</div>'; return; }
  const pts = [...list].reverse();
  pts.forEach(p => {
    const pet = PETS.find(x=>x.key===p.petKey);
    const el = document.createElement('div');
    el.className='entry';
    el.innerHTML = `<div style="display:flex;gap:8px;align-items:center"><span style="width:10px;height:10px;background:${pet.color};display:inline-block;border-radius:3px"></span><div style="margin-left:6px"><strong>${pet.name}</strong><div style="font-size:12px;color:#666">${fmt(p.ts)}</div></div></div><div style="font-weight:700">${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}</div>`;
    el.addEventListener('click', ()=>{ map.setView([p.lat,p.lng],17); });
    if(!pet.visible) el.style.opacity=0.4;
    historyList.appendChild(el);
  });
}

// initial ui build and start loop
buildUI();
selectPet(PETS[0].key);
updateAll(false);
setInterval(()=>updateAll(true), REFRESH_MS);
