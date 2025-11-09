// firebase-config.js
// REPLACE the placeholders below with your Firebase project's configuration.
// Save this file in the root of the project.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyDtMppJXy8EX2IBS8r5hiyHuH033xAqKHI",

  authDomain: "mascotas-ues.firebaseapp.com",

  projectId: "mascotas-ues",

  storageBucket: "mascotas-ues.firebasestorage.app",

  messagingSenderId: "1078964321035",

  appId: "1:1078964321035:web:16ae04b6447a234b0e000e",

  measurementId: "G-8L9D3CHBM2"

};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
