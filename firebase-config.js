// public/firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-storage.js";

const firebaseConfig = { apiKey: "AIzaSyBqjD-DJm4vn2hV6MbYgQY0MwEmX9ICXVc", authDomain: "sorveteria-ice-kiss.firebaseapp.com", projectId: "sorveteria-ice-kiss", storageBucket: "sorveteria-ice-kiss.firebasestorage.app", messagingSenderId: "694166215226", appId: "1:694166215226:web:81142256ad040b53ab3303", measurementId: "G-11448289854" };

// Inicialização
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Exporta as instâncias para serem usadas em toda a aplicação
export { app, auth, db, storage };