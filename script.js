import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, serverTimestamp, doc, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

// --- FUNÇÃO TOAST (MENSAGENS) ---
function mostrarMensagem(texto, tipo = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${tipo}`;
    toast.innerText = texto;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3000);
}

// --- FUNÇÃO DE CONFIRMAÇÃO PERSONALIZADA ---
function confirmarAcao(texto, callback) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    // Usamos uma classe específica 'confirmacao-fixa' para diferenciar do toast comum
    toast.className = 'toast info confirmacao-fixa'; 
    
    toast.innerHTML = `
        <div style="margin-bottom: 12px; font-weight:600; line-height: 1.4;">${texto}</div>
        <div style="display: flex; gap: 10px; justify-content: center;">
            <button id="confirm-yes" style="background: #2ecc71; color: white; border: none; padding: 8px 18px; border-radius: 4px; cursor: pointer; font-weight:bold; flex: 1;">Sim</button>
            <button id="confirm-no" style="background: #e74c3c; color: white; border: none; padding: 8px 18px; border-radius: 4px; cursor: pointer; font-weight:bold; flex: 1;">Não</button>
        </div>
    `;
    
    container.appendChild(toast);

    // Botão SIM: Remove o balão e executa o salvamento
    toast.querySelector('#confirm-yes').onclick = (e) => {
        e.stopPropagation();
        toast.remove();
        callback(); 
    };

    // Botão NÃO: Apenas remove o balão
    toast.querySelector('#confirm-no').onclick = (e) => {
        e.stopPropagation();
        toast.remove();
        mostrarMensagem("Ação cancelada", "info");
    };
}

// 2. Configuração do Mapa
const map = L.map('map').setView([-23.2217, -45.3111], 15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
}).addTo(map);

let usuarioLogado = null;
let markerUsuario = null;
let primeiraVez = true;

// 3. Monitorar Sessão
onAuthStateChanged(auth, (user) => {
    const userEmailSpan = document.getElementById('user-email');
    const btnLogout = document.getElementById('logout');

    if (user) {
        usuarioLogado = user;
        if (userEmailSpan) userEmailSpan.innerText = `👤 ${user.email}`;
        
        if (btnLogout) {
            btnLogout.onclick = async () => {
                await signOut(auth);
                window.location.href = "login.html";
            };
        }

        atualizarMonitoramento();
        carregarPontosAlagamento();
        tentarAtivarGPSAoEntrar();

    } else {
        window.location.href = "login.html";
    }
});

function tentarAtivarGPSAoEntrar() {
    pedirLocalizacao();
    setTimeout(() => {
        if (!markerUsuario) {
            document.getElementById('btn-recenter').classList.add('attention');
            mostrarMensagem("Toque no ícone de alvo para ativar seu GPS", "info");
        }
    }, 2500);
}

// 4. Lógica de Localização
function pedirLocalizacao() {
    if ("geolocation" in navigator) {
        navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                const bolinhaIcon = L.divIcon({
                    html: `<div class="user-radar-marker"><div class="dot"></div><div class="pulse"></div></div>`,
                    className: 'custom-div-icon',
                    iconSize: [20, 20],
                    iconAnchor: [10, 10]
                });

                if (markerUsuario) {
                    markerUsuario.setLatLng([latitude, longitude]);
                } else {
                    markerUsuario = L.marker([latitude, longitude], { icon: bolinhaIcon }).addTo(map);
                }

                if (primeiraVez) {
                    map.flyTo([latitude, longitude], 16, { animate: true, duration: 2.0 });
                    primeiraVez = false;
                    document.getElementById('btn-recenter').classList.remove('attention');
                }
            },
            (error) => {
                if (error.code === error.PERMISSION_DENIED) {
                    document.getElementById('btn-recenter').classList.add('attention');
                    mostrarMensagem("Acesso ao GPS negado pelo navegador.", "error");
                }
            },
            { enableHighAccuracy: true }
        );
    } else {
        mostrarMensagem("Seu navegador não suporta geolocalização.", "error");
    }
}

const btnRecenter = document.getElementById('btn-recenter');
btnRecenter.addEventListener('click', () => {
    btnRecenter.classList.remove('attention');
    if (markerUsuario) {
        map.flyTo(markerUsuario.getLatLng(), 17, { animate: true, duration: 1.5 });
    } else {
        pedirLocalizacao();
        mostrarMensagem("Solicitando acesso à sua localização...", "info");
    }
});

let modoMarcacao = false;

// 5. Lógica do Botão de Adicionar
const btnAdd = document.getElementById('btn-add-alagamento');
btnAdd.addEventListener('click', (e) => {
    e.stopPropagation();
    modoMarcacao = !modoMarcacao;
    if (modoMarcacao) {
        btnAdd.classList.add('modo-marcar-ativo');
        mostrarMensagem("MODO ATIVO: Toque no mapa onde está alagado.", "info");
    } else {
        btnAdd.classList.remove('modo-marcar-ativo');
    }
});

// --- CORREÇÃO: Usando confirmarAcao no clique do mapa ---
map.on('click', (e) => {
    if (!usuarioLogado || !modoMarcacao) return;

    confirmarAcao("Deseja registrar um ponto de alagamento nesta localização?", async () => {
        mostrarMensagem("Registrando...", "info");
        try {
            await addDoc(collection(db, "alagamentos"), {
                lat: e.latlng.lat,
                lng: e.latlng.lng,
                usuario: usuarioLogado.email,
                horario: serverTimestamp()
            });
            mostrarMensagem("Ponto registrado com sucesso!", "success");
        } catch (error) {
            console.error("Erro Firestore:", error);
            mostrarMensagem("Erro ao salvar.", "error");
        } finally {
            // Só desativa o modo e o botão após a confirmação/processamento
            modoMarcacao = false;
            btnAdd.classList.remove('modo-marcar-ativo');
        }
    });
});

// 6. Ler pontos em Tempo Real
function carregarPontosAlagamento() {
    onSnapshot(collection(db, "alagamentos"), (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            if (change.type === "added") {
                const data = change.doc.data();
                const isMobile = window.innerWidth < 768;
                const raioAjustado = isMobile ? 30 : 60;

                const marcador = L.circle([data.lat, data.lng], {
                    color: '#ff0000',
                    fillColor: '#ff0000',
                    fillOpacity: 0.5,
                    radius: raioAjustado,
                    weight: 2
                }).addTo(map);

                const dataHora = data.horario ? data.horario.toDate().toLocaleString('pt-BR') : "Agora";
                
                let popupHtml = `
                    <div style="text-align:center; font-family: sans-serif; width: 160px;">
                        <b style="color:red;">⚠️ ALAGAMENTO</b><br>
                        <span id="end-${change.doc.id}" style="font-size:0.85em;">Buscando endereço...</span><br>
                        <small style="color:#666;">${dataHora}</small>
                        <hr style="margin:8px 0; border:0; border-top:1px solid #eee;">
                        <div style="display:flex; gap:5px; justify-content:center;">
                            <button onclick="confirmarPonto('${change.doc.id}')" style="background:#2ecc71; color:white; border:none; padding:4px 8px; border-radius:4px; font-size:0.7rem; cursor:pointer;">Ainda está</button>
                            <button onclick="removerPonto('${change.doc.id}')" style="background:#e74c3c; color:white; border:none; padding:4px 8px; border-radius:4px; font-size:0.7rem; cursor:pointer;">Limpou</button>
                        </div>
                    </div>
                `;

                marcador.bindPopup(popupHtml, { closeButton: false });

                marcador.on('popupopen', async function () {
                    const span = document.getElementById(`end-${change.doc.id}`);
                    if (span && span.innerText === "Buscando endereço...") {
                        try {
                            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${data.lat}&lon=${data.lng}`);
                            const addr = await res.json();
                            const rua = addr.address.road || addr.address.suburb || addr.display_name.split(',')[0];
                            span.innerText = rua;
                        } catch (e) { 
                            span.innerText = "Endereço indisponível"; 
                        }
                    }
                });

                if (!isMobile) {
                    marcador.on('mouseout', function () { this.closePopup(); });
                }
            }
        });
    });
}

// 7. Monitoramento Climático
async function atualizarMonitoramento() {
    try {
        const url = "https://api.open-meteo.com/v1/forecast?latitude=-23.2217&longitude=-45.31&daily=sunrise,sunset,daylight_duration,temperature_2m_max,temperature_2m_min,wind_speed_10m_max&hourly=temperature_2m,rain,precipitation_probability,cloud_cover,is_day,showers,apparent_temperature&models=best_match&current=temperature_2m,is_day,rain,precipitation,showers,cloud_cover&timezone=America%2FSao_Paulo&forecast_days=1";
        const response = await fetch(url);
        const data = await response.json();
        const atual = data.current;
        const diario = data.daily;
        const horario = data.hourly;
        const horaIndex = new Date().getHours();
        const vol = atual.precipitation; 
        
        let statusTexto = "SEM CHUVA";
        let statusClasse = "safe"; // Cor para tempo limpo

        if (vol > 0) {
            statusClasse = "danger"; // Cor para alerta de chuva
            if (vol < 1.0) statusTexto = "GAROA FRACA";
            else if (vol < 5.0) statusTexto = "CHUVA MODERADA";
            else statusTexto = "CHUVA FORTE";
        }

        const painel = document.getElementById('status-panel');
        if (painel) {
            // ADICIONADO: statusClasse na primeira div para mudar a borda
            painel.innerHTML = `
                <div class="monitor-card compact ${statusClasse}" id="main-monitor" onclick="toggleMonitor()">
                    <div class="drag-handle"></div>
                    <div class="header-resumo">
                        <div class="info-principal">
                            <span class="cidade">S.L. Paraitinga</span>
                            <h1>${atual.temperature_2m}°</h1>
                        </div>
                        <div class="alerta-mini ${statusClasse}">
                            ${statusTexto}
                        </div>
                    </div>
                    <div class="detalhes-expansíveis">
                        <div class="data-grid">
                            <div class="data-item"><span class="label">SENSAÇÃO</span><span class="value">${horario.apparent_temperature[horaIndex]}°C</span></div>
                            <div class="data-item"><span class="label">VOLUME AGORA</span><span class="value">${vol} mm</span></div>
                            <div class="data-item"><span class="label">PANCADAS</span><span class="value">${atual.showers} mm</span></div>
                            <div class="data-item"><span class="label">VENTO MÁX</span><span class="value">${diario.wind_speed_10m_max[0]} km/h</span></div>
                        </div>
                        <div class="footer-info">
                            <div class="sun-cycle"><span>🌅 ${diario.sunrise[0].split('T')[1]}</span><span>🌇 ${diario.sunset[0].split('T')[1]}</span></div>
                            <small>Clique para recolher</small>
                        </div>
                    </div>
                </div>
            `;
        }
    } catch (e) { console.error("Erro clima:", e); }
}

export async function carregarPrevisao3Dias() {
    const url = "https://api.open-meteo.com/v1/forecast?latitude=-23.2217&longitude=-45.31&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,showers_sum,rain_sum&timezone=America%2FSao_Paulo&forecast_days=4";
    const containerPrevisao = document.querySelector('.dias-grid');
    if (!containerPrevisao) return;

    try {
        const response = await fetch(url);
        const data = await response.json();
        const diario = data.daily;
        containerPrevisao.innerHTML = ''; 
        const diasSemana = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

        for (let i = 1; i <= 3; i++) {
            const dataRaw = diario.time[i];
            const [ano, mes, dia] = dataRaw.split('-');
            const dataObj = new Date(dataRaw + 'T00:00');
            const nomeDia = i === 1 ? "Amanhã" : diasSemana[dataObj.getDay()];
            const prob = diario.precipitation_probability_max[i] || 0;
            const somaChuva = diario.precipitation_sum[i] || 0;
            let statusTexto = somaChuva > 0 ? "Chuva" : "Céu Limpo";
            let statusCor = somaChuva > 0 ? "#3498db" : "#2ecc71";

            containerPrevisao.innerHTML += `
                <div class="dia-card" style="border-top: 4px solid ${statusCor}; flex: 1;">
                    <b style="font-size:0.8rem;">${nomeDia}</b>
                    <small style="display:block;">${dia}/${mes}</small>
                    <span style="color:${statusCor}; font-weight:bold; font-size:0.7rem;">${statusTexto}</span>
                    <div style="font-size:0.8rem">
                        <span style="color:#e53e3e">↑${Math.round(diario.temperature_2m_max[i])}°</span>
                        <span style="color:#3182ce">↓${Math.round(diario.temperature_2m_min[i])}°</span>
                    </div>
                    <div style="font-size:0.65rem;">💧${prob}% | 📏${somaChuva.toFixed(1)}mm</div>
                </div>`;
        }
    } catch (error) { mostrarMensagem("Erro ao carregar previsão.", "error"); }
}

window.abrirModalPrevisao = function() {
    document.getElementById('modal-previsao').style.display = 'block';
    carregarPrevisao3Dias();
}
window.fecharModalPrevisao = function() {
    document.getElementById('modal-previsao').style.display = 'none';
}
window.onclick = function(event) {
    const modal = document.getElementById('modal-previsao');
    if (event.target == modal) modal.style.display = "none";
}

function toggleMonitor() {
    const el = document.getElementById('main-monitor');
    if (el) {
        el.classList.toggle('compact');
        el.classList.toggle('expanded');
    }
}
window.toggleMonitor = toggleMonitor;

// --- CORREÇÃO: Usando confirmarAcao na remoção de ponto ---
window.removerPonto = async function(id) {
    confirmarAcao("Confirmar que NÃO está mais alagado?", async () => {
        try {
            await deleteDoc(doc(db, "alagamentos", id));
            mostrarMensagem("Mapa atualizado!", "success");
            setTimeout(() => location.reload(), 1000);
        } catch (e) { mostrarMensagem("Erro ao remover.", "error"); }
    });
}

window.confirmarPonto = async function(id) {
    try {
        await updateDoc(doc(db, "alagamentos", id), { horario: serverTimestamp() });
        mostrarMensagem("Ponto confirmado!", "success");
    } catch (e) { mostrarMensagem("Erro ao confirmar.", "error"); }
}

// PWA Logic
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => console.log('Erro PWA:', err));
    });
}

let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
});

window.addEventListener('click', () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt = null;
    }
}, { once: true });

atualizarMonitoramento();


window.abrirModalAjuda = function() {
    document.getElementById('modal-ajuda').style.display = 'flex';
}

window.fecharModalAjuda = function() {
    document.getElementById('modal-ajuda').style.display = 'none';
}