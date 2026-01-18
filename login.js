import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// 1. Configuração do Firebase
const firebaseConfig = {
    apiKey: "AIzaSyAs1QzV0ZniAwE9cdpeAY-fJMjJ4WTJsmo",
    authDomain: "alagahelp.firebaseapp.com",
    projectId: "alagahelp",
    storageBucket: "alagahelp.firebasestorage.app",
    messagingSenderId: "41555142663",
    appId: "1:41555142663:web:6306bb0c028dc86f8322a2"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// 2. Configuração do Mapa
const map = L.map('map').setView([-23.2217, -45.3111], 15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
}).addTo(map);

let usuarioLogado = null;

// --- FUNÇÃO DE GPS PRIORITÁRIA ---
function solicitarGPS() {
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                // Centraliza o mapa no usuário se ele permitir
                map.setView([latitude, longitude], 16);
                L.marker([latitude, longitude]).addTo(map)
                    .bindPopup("Sua localização atual").openPopup();
                console.log("GPS Ativado");
            },
            (error) => {
                alert("Para melhor funcionamento do Alaga-Help, ative o GPS do seu dispositivo.");
            }
        );
    }
}

// 3. Monitorar Sessão e Botão Sair
onAuthStateChanged(auth, (user) => {
    const userEmailSpan = document.getElementById('user-email');
    const btnLogout = document.getElementById('logout');

    if (user) {
        usuarioLogado = user;
        if (userEmailSpan) userEmailSpan.innerText = `👤 ${user.email}`;
        
        // EXECUTA O GPS ASSIM QUE LOGAR
        solicitarGPS();
        
        if (btnLogout) {
            btnLogout.onclick = async () => {
                await signOut(auth);
                window.location.href = "login.html";
            };
        }
        atualizarMonitoramento();
    } else {
        window.location.href = "login.html";
    }
});

// ... (Mantenha sua função atualizarMonitoramento igual aqui)

// 4. Funções de Marcação (GPS e Endereço)
// Adicione os event listeners para os botões que você criou no HTML

// Botão GPS
const btnGps = document.getElementById('btn-gps');
if (btnGps) {
    btnGps.onclick = () => {
        navigator.geolocation.getCurrentPosition((position) => {
            if(confirm("Confirmar alagamento na sua posição atual?")) {
                salvarPonto(position.coords.latitude, position.coords.longitude);
            }
        });
    };
}

// Botão Busca Endereço
const btnSearch = document.getElementById('btn-search');
if (btnSearch) {
    btnSearch.onclick = async () => {
        const endereco = document.getElementById('address-input').value;
        if (!endereco) return;
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${endereco}, São Luiz do Paraitinga`);
        const data = await response.json();
        if (data[0]) {
            const { lat, lon } = data[0];
            if(confirm(`Confirmar alagamento em: ${data[0].display_name}?`)) {
                salvarPonto(parseFloat(lat), parseFloat(lon));
            }
        }
    };
}

// Função auxiliar para salvar
async function salvarPonto(lat, lng) {
    try {
        await addDoc(collection(db, "alagamentos"), {
            lat: lat,
            lng: lng,
            usuario: usuarioLogado.email,
            horario: serverTimestamp()
        });
        alert("Ponto registrado!");
    } catch (e) { console.error(e); }
}

// 5. Clique no Mapa (Manual)
map.on('click', async (e) => {
    if (!usuarioLogado) return;
    if (confirm("Deseja marcar um ponto de ALAGAMENTO aqui?")) {
        salvarPonto(e.latlng.lat, e.latlng.lng);
    }
});

// 6. Snapshot (Ler pontos)
onSnapshot(collection(db, "alagamentos"), (snapshot) => {
    snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
            const data = change.doc.data();
            L.circle([data.lat, data.lng], {
                color: 'red', fillColor: '#f03', fillOpacity: 0.5, radius: 100
            }).addTo(map)
            .bindPopup(`<b>ALAGAMENTO!</b><br>Relatado por: ${data.usuario}`);
        }
    });
});