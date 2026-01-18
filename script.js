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

// 3. Monitorar Sessão e Pedir Localização
onAuthStateChanged(auth, (user) => {
    const userEmailSpan = document.getElementById('user-email');
    const btnLogout = document.getElementById('logout');

    if (user) {
        usuarioLogado = user;
        if (userEmailSpan) userEmailSpan.innerText = `👤 ${user.email}`;
        
        // --- NOVO: Pedir localização assim que logar ---
        pedirLocalizacao();
        // -----------------------------------------------

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

// Função para solicitar a localização do dispositivo
let markerUsuario = null;

function pedirLocalizacao() {
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                map.setView([latitude, longitude], 15);

                // Criando o ícone do bonequinho (User Pin)
                const bonecoIcon = L.divIcon({
                    html: '<div class="user-div-icon"><i class="fa-solid fa-person-rays"></i></div>',
                    className: 'custom-div-icon',
                    iconSize: [30, 42],
                    iconAnchor: [15, 42]
                });

                if (markerUsuario) {
                    markerUsuario.setLatLng([latitude, longitude]);
                } else {
                    markerUsuario = L.marker([latitude, longitude], { icon: bonecoIcon }).addTo(map);
                    markerUsuario.bindPopup("<b>Você está aqui</b>").openPopup();
                }
            },
            (error) => {
                console.error("Erro:", error);
                // Caso o usuário negue, centralizamos no centro de SLP por segurança
                map.setView([-23.2217, -45.3111], 15);
            },
            { enableHighAccuracy: true }
        );
    }
}

async function atualizarMonitoramento() {
    try {
        const url1Dia = "https://api.open-meteo.com/v1/forecast?latitude=-23.2217&longitude=-45.31&hourly=temperature_2m,precipitation&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=America%2FSao_Paulo&forecast_days=1";
        const url3Dias = "https://api.open-meteo.com/v1/forecast?latitude=-23.2217&longitude=-45.31&daily=precipitation_sum&timezone=America%2FSao_Paulo&forecast_days=3";

        const [res1, res3] = await Promise.all([fetch(url1Dia), fetch(url3Dias)]);
        const data1 = await res1.json();
        const data3 = await res3.json();

        const agora = new Date().getHours();
        const painel = document.getElementById('status-panel');

        // Dados de Chuva
        const chuvaAgora = data1.hourly.precipitation[agora];
        const chuvaHoje = data3.daily.precipitation_sum[0];
        const chuvaAmanha = data3.daily.precipitation_sum[1];
        const chuvaDepois = data3.daily.precipitation_sum[2];

        // Dados de Temperatura (Extraídos da API 1)
        const tempAgora = data1.hourly.temperature_2m[agora];
        const tempMin = data1.daily.temperature_2m_min[0];
        const tempMax = data1.daily.temperature_2m_max[0];

        painel.innerHTML = `
            <div class="monitor-card">
                <header>Monitoramento SLP</header>
                
                <section class="info-agora">
                    <small>Agora (${agora}h)</small>
                    <div class="termometro">${tempAgora}°C</div>
                    <div class="valor">🌧️ ${chuvaAgora} mm</div>
                    <div class="min-max">Mín: ${tempMin}° / Máx: ${tempMax}°</div>
                </section>

                <hr>

                <section class="previsao-3dias">
                    <div class="dia-previsao">
                        <span>Hoje</span>
                        <strong>${chuvaHoje} mm</strong>
                    </div>
                    <div class="dia-previsao">
                        <span>Amanhã</span>
                        <strong>${chuvaAmanha} mm</strong>
                    </div>
                    <div class="dia-previsao">
                        <span>Depois</span>
                        <strong>${chuvaDepois} mm</strong>
                    </div>
                </section>

                <div class="alerta-status ${chuvaHoje + chuvaAmanha + chuvaDepois > 40 ? 'perigo' : ''}">
                    ${chuvaHoje + chuvaAmanha + chuvaDepois > 40 ? '🚨 RISCO DE CHEIA 72h' : '✅ RIO SOB CONTROLE'}
                </div>
            </div>
        `;

    } catch (e) { console.error("Erro ao carregar dados", e); }
}

// 5. Marcar Alagamento no Clique (Firestore)
map.on('click', async (e) => {
    if (!usuarioLogado) return;

    const confirmar = confirm("Deseja marcar um ponto de ALAGAMENTO aqui?");
    if (confirmar) {
        try {
            await addDoc(collection(db, "alagamentos"), {
                lat: e.latlng.lat,
                lng: e.latlng.lng,
                usuario: usuarioLogado.email,
                horario: serverTimestamp()
            });
        } catch (error) {
            console.error("Erro Firestore:", error);
        }
    }
});

// 6. Ler pontos em Tempo Real
onSnapshot(collection(db, "alagamentos"), (snapshot) => {
    snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
            const data = change.doc.data();
            const marcador = L.circle([data.lat, data.lng], {
                color: 'red', fillColor: '#f03', fillOpacity: 0.5, radius: 100
            }).addTo(map);
            marcador.bindPopup(`<b>ALAGAMENTO!</b><br>Relatado por: ${data.usuario}`);
        }
    });
});
