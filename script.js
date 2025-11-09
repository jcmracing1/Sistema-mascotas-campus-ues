// public/script.js - frontend for Mascotas UES (connects to backend API)
const API_BASE = https://sistema-mascotas-campus-ues.onrender.com/; // if served by same server; otherwise replace with your backend URL

// map init
const map = L.map('map').setView([13.719, -89.203], 15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
const campusPoly = [[13.7233, -89.2032],[13.7224, -89.1994],[13.7195, -89.1998],[13.7165, -89.2003],[13.7152, -89.2060],[13.7192, -89.2055]];
L.polygon(campusPoly, { color: 'green', fillOpacity: 0.06 }).addTo(map);

let pets = [];
let markers = [];

async function loadPets(){
  const res = await fetch(API_BASE + '/api/pets');
  pets = await res.json();
  renderSelector();
}

function renderSelector(){
  const sel = document.getElementById('petSelector');
  sel.innerHTML = '';
  pets.forEach(p=>{
    const div = document.createElement('div');
    div.className = 'pet-item';
    div.innerHTML = `<img src="${p.photoUrl||'img/placeholder_pet.png'}"><div><strong>${p.name}</strong><div>${p.description||''}</div></div>`;
    div.onclick = ()=>selectPet(p);
    sel.appendChild(div);
  });
  if(pets.length) selectPet(pets[0]);
}

function selectPet(p){
  document.getElementById('petName').textContent = p.name;
  document.getElementById('petDesc').textContent = p.description || '';
  document.getElementById('photo').src = p.photoUrl || 'img/placeholder_pet.png';
}

document.getElementById('addPetForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const fd = new FormData();
  fd.append('name', document.getElementById('name').value);
  fd.append('description', document.getElementById('description').value);
  fd.append('photo', document.getElementById('photoFile').files[0]);
  const res = await fetch(API_BASE + '/api/pets', { method: 'POST', body: fd });
  if(res.ok){ alert('Mascota creada'); document.getElementById('addPetForm').reset(); loadPets(); } else { alert('Error al crear mascota'); }
});

async function loadLatestVisit(){
  const res = await fetch(API_BASE + '/api/visits/latest');
  const v = await res.json();
  if(!v || !v.lat) return;
  markers.forEach(m=>map.removeLayer(m)); markers = [];
  pets.forEach(p=>{
    const mk = L.marker([v.lat, v.lng]).addTo(map).bindPopup(`<img src="${p.photoUrl||'img/placeholder_pet.png'}" width="80"><br><b>${p.name}</b>`);
    markers.push(mk);
  });
  map.setView([v.lat, v.lng], 16);
  // load recent visits
  const visitsRes = await fetch(API_BASE + '/api/visits?limit=50');
  const visits = await visitsRes.json();
  const hist = document.getElementById('history');
  hist.innerHTML = visits.map(h=>`<div>${new Date(h.ts).toLocaleString()} — ${h.lat.toFixed(6)}, ${h.lng.toFixed(6)} — ${h.insideCampus ? 'Dentro' : 'Fuera'}</div>`).join('');
}

loadPets();
loadLatestVisit();
setInterval(loadLatestVisit, 15000);
