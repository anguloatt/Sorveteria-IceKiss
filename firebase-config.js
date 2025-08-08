// public/firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-storage.js";

const firebaseConfig = { apiKey: "AIzaSyBqjD-DJm4vn2hV6MbYgQY0MwEmX9ICXVc", authDomain: "sorveteria-ice-kiss.firebaseapp.com", projectId: "sorveteria-ice-kiss", storageBucket: "sorveteria-ice-kiss.appspot.com", messagingSenderId: "694166215226", appId: "1:694166215226:web:81142256ad040b53ab3303", measurementId: "G-11448289854" };

// Inicializo o Firebase com as minhas configurações.
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Eu exporto as instâncias para usar em toda a minha aplicação.
export { app, auth, db, storage };