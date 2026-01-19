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
        
        // TENTA LIGAR AUTOMATICAMENTE AO LOGAR (Estilo Maps)
        tentarAtivarGPSAoEntrar();

    } else {
        window.location.href = "login.html";
    }
});

// Lógica de ativação automática
function tentarAtivarGPSAoEntrar() {
    // Tenta iniciar a localização silenciosamente
    pedirLocalizacao();
    
    // Se o navegador bloquear o início automático, destacamos o botão
    setTimeout(() => {
        if (!markerUsuario) {
            document.getElementById('btn-recenter').classList.add('attention');
            console.warn("GPS bloqueado pelo navegador. Aguardando clique do usuário.");
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

                // Efeito Estilo Maps: Zoom e Deslize na primeira vez que encontra
                if (primeiraVez) {
                    map.flyTo([latitude, longitude], 16, {
                        animate: true,
                        duration: 2.0 // Segundos de animação
                    });
                    primeiraVez = false;
                    document.getElementById('btn-recenter').classList.remove('attention');
                }
            },
            (error) => {
                // Se der erro, avisa o usuário para ligar o GPS manualmente
                if (error.code === error.PERMISSION_DENIED) {
                    console.error("Usuário negou o acesso ao GPS.");
                    document.getElementById('btn-recenter').classList.add('attention');
                }
            },
            { enableHighAccuracy: true }
        );
    } else {
        alert("Seu navegador não suporta geolocalização.");
    }
}

// Evento do Botão de Recentralizar (Gatilho Manual e de Zoom)
const btnRecenter = document.getElementById('btn-recenter');
btnRecenter.addEventListener('click', () => {
    btnRecenter.classList.remove('attention');
    
    // Se já tiver a posição, apenas voa para lá
    if (markerUsuario) {
        map.flyTo(markerUsuario.getLatLng(), 17, { animate: true, duration: 1.5 });
    } else {
        // Se não tiver, tenta forçar o pedido de permissão de novo
        pedirLocalizacao();
        alert("Ative a localização no seu navegador para continuar.");
    }
});

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

// 6. Ler pontos em Tempo Real (Ajustado para Mobile)
function carregarPontosAlagamento() {
    onSnapshot(collection(db, "alagamentos"), (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            if (change.type === "added") {
                const data = change.doc.data();

                // DETECÇÃO DE DISPOSITIVO: Se a tela for menor que 768px, é mobile
                const isMobile = window.innerWidth < 768;
                
                // AJUSTE DE TAMANHO: 30 metros para mobile, 60 para PC
                const raioAjustado = isMobile ? 30 : 60;

                const marcador = L.circle([data.lat, data.lng], {
                    color: '#ff0000',
                    fillColor: '#ff0000',
                    fillOpacity: 0.5,
                    radius: raioAjustado,
                    weight: 2 // Espessura da borda
                }).addTo(map);

                // Conteúdo do Popup
                const dataHora = data.horario ? data.horario.toDate().toLocaleString('pt-BR') : "Agora";
                let popupHtml = `
                    <div style="text-align:center; font-family: sans-serif; width: 160px;">
                        <b style="color:red;">⚠️ ALAGAMENTO</b><br>
                        <span id="end-${change.doc.id}" style="font-size:0.85em;">Buscando...</span><br>
                        <small style="color:#666;">${dataHora}</small>
                        <hr style="margin:8px 0; border:0; border-top:1px solid #eee;">
                        <div style="display:flex; gap:5px; justify-content:center;">
                            <button onclick="confirmarPonto('${change.doc.id}')" style="background:#2ecc71; color:white; border:none; padding:4px 8px; border-radius:4px; font-size:0.7rem; cursor:pointer;">Ainda está</button>
                            <button onclick="removerPonto('${change.doc.id}')" style="background:#e74c3c; color:white; border:none; padding:4px 8px; border-radius:4px; font-size:0.7rem; cursor:pointer;">Limpou</button>
                        </div>
                    </div>
                `;

                marcador.bindPopup(popupHtml, { closeButton: false });

                // Evento Mouseover (funciona como clique no mobile)
                marcador.on('mouseover', async function () {
                    this.openPopup();
                    const span = document.getElementById(`end-${change.doc.id}`);
                    if (span && span.innerText === "Buscando endereço...") {
                        try {
                            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${data.lat}&lon=${data.lng}`);
                            const addr = await res.json();
                            const rua = addr.display_name.split(',')[0] || "Localizado";
                            span.innerText = rua;
                        } catch (e) { span.innerText = "Endereço indisponível"; }
                    }
                });

                marcador.on('mouseout', function () { this.closePopup(); });
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

        // Volume de chuva atual
        const vol = atual.precipitation; 
        let statusTexto = "SEM CHUVA";
        let statusClasse = "safe";

        // Lógica de intensidade para o Alerta
        if (vol > 0) {
            statusClasse = "danger";
            if (vol < 1.0) statusTexto = "GAROA FRACA";
            else if (vol < 5.0) statusTexto = "CHUVA MODERADA";
            else statusTexto = "CHUVA FORTE";
        }

        const painel = document.getElementById('status-panel');
        
        if (painel) {
            // Injetamos o conteúdo mantendo a classe 'compact' inicial
            painel.innerHTML = `
                <div class="monitor-card compact" id="main-monitor" onclick="toggleMonitor()">
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
                            <div class="data-item">
                                <span class="label">SENSAÇÃO</span>
                                <span class="value">${horario.apparent_temperature[horaIndex]}°C</span>
                            </div>
                            <div class="data-item">
                                <span class="label">VOLUME AGORA</span>
                                <span class="value">${vol} mm</span>
                            </div>
                            <div class="data-item">
                                <span class="label">PANCADAS</span>
                                <span class="value">${atual.showers} mm</span>
                            </div>
                            <div class="data-item">
                                <span class="label">VENTO MÁX</span>
                                <span class="value">${diario.wind_speed_10m_max[0]} km/h</span>
                            </div>
                        </div>

                        <div class="footer-info">
                            <div class="sun-cycle">
                                <span>🌅 ${diario.sunrise[0].split('T')[1]}</span>
                                <span>🌇 ${diario.sunset[0].split('T')[1]}</span>
                            </div>
                            <small>Clique para recolher</small>
                            <div style="font-size: 10px; color: #999; margin-top: 5px;">
                                Luz do dia: ${diario.daylight_duration[0]}s
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
    } catch (e) { 
        console.error("Erro ao carregar dados climáticos:", e); 
    }
}


// clima_3dias.js
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
            // Formatação da Data (dia/mes/ano)
            const dataRaw = diario.time[i]; // Formato "2026-01-19"
            const [ano, mes, dia] = dataRaw.split('-');
            const dataFormatada = `${dia}/${mes}/${ano}`;

            const dataObj = new Date(dataRaw + 'T00:00');
            const nomeDia = i === 1 ? "Amanhã" : diasSemana[dataObj.getDay()];
            
            const prob = diario.precipitation_probability_max[i] || 0;
            const somaChuva = diario.precipitation_sum[i] || 0;
            const showers = diario.showers_sum[i] || 0; 
            const rain = diario.rain_sum[i] || 0;       

            let statusTexto = "Céu Limpo";
            let statusCor = "#2ecc71"; 

            if (prob > 20) {
                if (somaChuva === 0) {
                    statusTexto = "Nublado";
                    statusCor = "#95a5a6";
                } else if (showers > rain) {
                    statusTexto = "Pancadas";
                    statusCor = "#3498db";
                } else if (somaChuva > 10) {
                    statusTexto = "Chuva Forte";
                    statusCor = "#e74c3c";
                } else {
                    statusTexto = "Chuva Leve";
                    statusCor = "#3498db";
                }
            }

            containerPrevisao.innerHTML += `
                <div class="dia-card" style="border-top: 4px solid ${statusCor}; flex: 1;">
                    <b style="font-size:0.8rem; color:#333; display:block;">${nomeDia}</b>
                    <small style="font-size:0.6rem; color:#888; display:block; margin-bottom:2px;">${dataFormatada}</small>
                    
                    <span style="font-size:0.65rem; font-weight:bold; color:${statusCor}; display:block; margin-bottom:5px;">
                        ${statusTexto}
                    </span>

                    <div style="margin-bottom:8px; font-size:0.8rem">
                        <span style="color:#e53e3e">↑${Math.round(diario.temperature_2m_max[i])}°</span>
                        <span style="color:#3182ce">↓${Math.round(diario.temperature_2m_min[i])}°</span>
                    </div>

                    <div style="font-size:0.7rem; background:#fff; padding:5px; border-radius:8px; width:100%; box-sizing:border-box;">
                        <div style="color:#2b6cb0; margin-bottom:2px;">💧 <b>${prob}%</b></div>
                        <div style="color:#4a5568; margin-bottom:2px;">📏 <b>${somaChuva.toFixed(1)}mm</b></div>
                        <div style="color:#718096; font-size:0.6rem">💨 ${Math.round(diario.wind_speed_10m_max[i])}km/h</div>
                    </div>
                </div>
            `;
        }
    } catch (error) {
        console.error("Erro na previsão:", error);
    }
}
// Funções para o Modal de 3 Dias
window.abrirModalPrevisao = function() {
    const modal = document.getElementById('modal-previsao');
    modal.style.display = 'block';
    // Chama a função da outra API para carregar os dados
    carregarPrevisao3Dias();
}

window.fecharModalPrevisao = function() {
    document.getElementById('modal-previsao').style.display = 'none';
}

// Fecha o modal se clicar fora dele
window.onclick = function(event) {
    const modal = document.getElementById('modal-previsao');
    if (event.target == modal) {
        modal.style.display = "none";
    }
}

function toggleMonitor() {
    const el = document.getElementById('main-monitor');
    if (el) {
        el.classList.toggle('compact');
        el.classList.toggle('expanded');
    }
}


// Função para remover o ponto (O alagamento acabou)
window.removerPonto = async function(id) {
    if (confirm("Você confirma que este local NÃO está mais alagado?")) {
        try {
            const { doc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
            await deleteDoc(doc(db, "alagamentos", id));
            alert("Obrigado! O mapa foi atualizado.");
            location.reload(); 
        } catch (e) { alert("Erro ao atualizar."); }
    }
}

// Função para confirmar (Dá mais "sobrevida" ao ponto)
window.confirmarPonto = async function(id) {
    try {
        const { doc, updateDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
        // Atualiza o horário para o momento atual, impedindo que ele expire por tempo
        await updateDoc(doc(db, "alagamentos", id), {
            horario: serverTimestamp(),
            confirmacoes: Number((data.confirmacoes || 0) + 1)
        });
        alert("Obrigado por confirmar!");
    } catch (e) { console.error(e); }
}

// Adicione esta linha:
window.toggleMonitor = toggleMonitor;
// Chamar a função ao carregar a página
atualizarMonitoramento();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('PWA Ativo!', reg))
      .catch(err => console.log('Erro PWA:', err));
  });
}

let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // Previne o banner padrão
    deferredPrompt = e; // Guarda o evento
    console.log("PWA: Evento capturado. O popup aparecerá no próximo clique na tela.");
});

// DISPARO AUTOMÁTICO NO PRIMEIRO CLIQUE
window.addEventListener('click', () => {
    if (deferredPrompt) {
        deferredPrompt.prompt(); // Abre o popup nativo de instalação
        
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('Usuário instalou o app');
            }
            deferredPrompt = null;
        });
    }
}, { once: true }); // Executa apenas uma vez