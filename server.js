// server.js - Node.js + Express backend for Mascotas UES
import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import multer from "multer";
import fetch from "node-fetch";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import Pet from "./models/pet.js";
import Visit from "./models/visit.js";

dotenv.config();
const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(cors());

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(()=>console.log("MongoDB connected"))
  .catch(err=>{ console.error("MongoDB connection error:", err); process.exit(1); });

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "mascotas_ues",
    allowed_formats: ["jpg","jpeg","png"]
  }
});
const upload = multer({ storage });

// API endpoints
app.post("/api/pets", upload.single("photo"), async (req, res) => {
  try {
    const { name, description } = req.body;
    const photoUrl = req.file?.path || req.body.photoUrl || "";
    const pet = await Pet.create({ name, description, photoUrl, createdAt: Date.now() });
    res.status(201).json(pet);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error creating pet" });
  }
});

app.get("/api/pets", async (req, res) => {
  const pets = await Pet.find().sort({ createdAt: -1 });
  res.json(pets);
});

app.get("/api/pets/:id", async (req, res) => {
  const pet = await Pet.findById(req.params.id);
  if(!pet) return res.status(404).json({ error: "Pet not found" });
  res.json(pet);
});

app.get("/api/visits", async (req, res) => {
  const limit = parseInt(req.query.limit || "200");
  const visits = await Visit.find().sort({ ts: -1 }).limit(limit);
  res.json(visits);
});

app.get("/api/visits/latest", async (req, res) => {
  const v = await Visit.findOne().sort({ ts: -1 });
  res.json(v || {});
});

// Serve static frontend if requested
if(process.env.SERVE_STATIC === "true"){
  app.use(express.static("public"));
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log("Server listening on port", PORT));

// Poll ThingSpeak and store visits (only when changed)
const THINGSPEAK_CHANNEL = process.env.THINGSPEAK_CHANNEL || "3146056";
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || "15000");

const campusPoly = [
  [13.7233, -89.2032],
  [13.7224, -89.1994],
  [13.7195, -89.1998],
  [13.7165, -89.2003],
  [13.7152, -89.2060],
  [13.7192, -89.2055]
];

function pointInPolygon(lat, lng, polygon){
  const x = lng, y = lat;
  let inside = false;
  for(let i=0, j=polygon.length-1; i<polygon.length; j=i++){
    const xi = polygon[i][1], yi = polygon[i][0];
    const xj = polygon[j][1], yj = polygon[j][0];
    const intersect = ((yi>y)!=(yj>y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if(intersect) inside = !inside;
  }
  return inside;
}

let lastLat = null, lastLng = null;

async function pollThingSpeakAndStore(){
  try{
    const url = `https://api.thingspeak.com/channels/${THINGSPEAK_CHANNEL}/feeds.json?results=1`;
    const resp = await fetch(url);
    if(!resp.ok){ console.warn("ThingSpeak fetch failed", resp.status); return; }
    const data = await resp.json();
    if(data && data.feeds && data.feeds.length>0){
      const f = data.feeds[0];
      const lat = parseFloat(f.field1);
      const lng = parseFloat(f.field2);
      if(Number.isFinite(lat) && Number.isFinite(lng)){
        const changed = lastLat === null || Math.abs(lastLat - lat) > 1e-6 || Math.abs(lastLng - lng) > 1e-6;
        if(changed){
          lastLat = lat; lastLng = lng;
          const inside = pointInPolygon(lat, lng, campusPoly);
          await Visit.create({ lat, lng, ts: Date.now(), insideCampus: !!inside });
          console.log("Saved visit", lat, lng, "inside:", inside);
        }
      }
    }
  }catch(err){ console.warn("poll error", err); }
}

setInterval(pollThingSpeakAndStore, POLL_INTERVAL_MS);
pollThingSpeakAndStore();
