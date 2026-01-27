import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, serverTimestamp, doc, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";

// --- ESTADO GLOBAL ---
const marcadoresAtivos = {};
let usuarioLogado = null;
let markerUsuario = null;
let primeiraVez = true;
let modoMarcacao = false;
let solicitandoGPS = false;

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
const analytics = getAnalytics(app);

// --- CENTRAL DE MENSAGENS E INTERAÇÃO (TOASTS) ---

function mostrarMensagem(texto, tipo = 'info', duracao = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    // Limpeza: remove mensagens anteriores para não encavalar
    const antigas = container.querySelectorAll('.toast');
    antigas.forEach(m => {
        m.style.opacity = '0';
        setTimeout(() => m.remove(), 300);
    });

    const toast = document.createElement('div');
    toast.className = `toast ${tipo}`;
    toast.innerText = texto;
    toast.style.opacity = '1';
    
    container.appendChild(toast);
    
    setTimeout(() => { 
        toast.style.opacity = '0';
        setTimeout(() => { if (toast.parentNode === container) toast.remove(); }, 500); 
    }, duracao);
}

function confirmarAcao(texto, callback) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    // Limpa toasts comuns antes de abrir confirmação
    mostrarMensagem("", "limpar", 0); 

    const toast = document.createElement('div');
    toast.className = 'toast info confirmacao-fixa'; 
    toast.innerHTML = `
        <div style="margin-bottom: 12px; font-weight:600; line-height: 1.4;">${texto}</div>
        <div style="display: flex; gap: 10px; justify-content: center;">
            <button id="confirm-yes" style="background: #2ecc71; color: white; border: none; padding: 8px 18px; border-radius: 4px; cursor: pointer; font-weight:bold; flex: 1;">Sim</button>
            <button id="confirm-no" style="background: #e74c3c; color: white; border: none; padding: 8px 18px; border-radius: 4px; cursor: pointer; font-weight:bold; flex: 1;">Não</button>
        </div>
    `;
    
    container.appendChild(toast);

    toast.querySelector('#confirm-yes').onclick = (e) => {
        e.stopPropagation();
        toast.remove();
        callback(); 
    };

    toast.querySelector('#confirm-no').onclick = (e) => {
        e.stopPropagation();
        toast.remove();
        mostrarMensagem("Ação cancelada", "info");
    };
}

// --- CONFIGURAÇÃO DO MAPA ---
const map = L.map('map').setView([-23.2217, -45.3111], 15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
}).addTo(map);

// --- LÓGICA DE CLIQUE NO MAPA (REESCRITA) ---
map.on('click', (e) => {
    if (!usuarioLogado) return;

    if (modoMarcacao) {
        confirmarAcao("Deseja registrar um ponto de alagamento nesta localização?", async () => {
            mostrarMensagem("Registrando...", "info");
            try {
                await addDoc(collection(db, "alagamentos"), {
                    lat: e.latlng.lat,
                    lng: e.latlng.lng,
                    usuario: usuarioLogado.email || "Acesso Rápido",
                    uid: usuarioLogado.uid,
                    horario: serverTimestamp(),
                    cidade: "São Luiz do Paraitinga",
                    status: "pendente"
                });
                mostrarMensagem("Ponto registrado com sucesso!", "success");
            } catch (error) {
                console.error("Erro Firestore:", error);
                mostrarMensagem("Erro ao salvar.", "error");
            } finally {
                modoMarcacao = false;
                const btnAdd = document.getElementById('btn-add-alagamento');
                if (btnAdd) btnAdd.classList.remove('modo-marcar-ativo');
            }
        });
    } else {
        // Verifica se clicou no mapa vazio (evita alertas ao clicar em botões/popups)
        const target = e.originalEvent.target;
        if (target.classList.contains('leaflet-container') || target.id === 'map') {
            mostrarMensagem("⚠️ Clique no botão vermelho com ícone de localização para marcar um ponto.", "info", 5000);
            const btnAdd = document.getElementById('btn-add-alagamento');
            if (btnAdd) {
                btnAdd.classList.add('atencao-shake');
                setTimeout(() => btnAdd.classList.remove('atencao-shake'), 2000);
            }
        }
    }
});

// --- MONITORAMENTO DE SESSÃO ---
onAuthStateChanged(auth, (user) => {
    const userEmailSpan = document.getElementById('user-email');
    const btnLogout = document.getElementById('logout');

    if (user) {
        usuarioLogado = user;
        const nomeParaExibir = user.isAnonymous ? "Visitante" : (user.email ? user.email : "Usuário");
        if (userEmailSpan) userEmailSpan.innerText = `Logado como: ${nomeParaExibir}`;
        
        if (btnLogout) {
            btnLogout.onclick = async () => {
                await signOut(auth);
                window.location.href = "login.html";
            };
        }

        atualizarMonitoramento();
        carregarPontosAlagamento();
        tentarAtivarGPSAoEntrar();

        if (window.innerWidth > 768) {
            carregarPrevisao3Dias();
        }
        window.verificarExibicaoAviso();
    } else {
        window.location.href = "login.html";
    }
});

// --- GPS E LOCALIZAÇÃO ---
function tentarAtivarGPSAoEntrar() {
    pedirLocalizacao();
    setTimeout(() => {
        if (!markerUsuario) {
            document.getElementById('btn-recenter').classList.add('attention');
        }
    }, 2500);
}

function pedirLocalizacao() {
    if (!("geolocation" in navigator)) {
        mostrarMensagem("Seu navegador não suporta GPS.", "error");
        return;
    }
    if (solicitandoGPS) return;
    solicitandoGPS = true;

    const timeoutMensagem = setTimeout(() => {
        if (!markerUsuario) mostrarMensagem("Buscando sinal do GPS...", "info");
    }, 1000);

    navigator.geolocation.watchPosition(
        (position) => {
            clearTimeout(timeoutMensagem);
            solicitandoGPS = false; 
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
            clearTimeout(timeoutMensagem);
            solicitandoGPS = false;
            if (error.code === error.PERMISSION_DENIED) {
                document.getElementById('btn-recenter').classList.add('attention');
                mostrarMensagem("Ative o GPS para usar o mapa.", "error");
            }
        },
        { enableHighAccuracy: true }
    );
}

document.getElementById('btn-recenter').addEventListener('click', function() {
    this.classList.remove('attention');
    if (markerUsuario) {
        map.flyTo(markerUsuario.getLatLng(), 17, { animate: true, duration: 1.5 });
    } else {
        pedirLocalizacao();
    }
});

// --- PONTOS DE ALAGAMENTO (FIRESTORE) ---
function carregarPontosAlagamento() {
    onSnapshot(collection(db, "alagamentos"), (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            const id = change.doc.id;
            const data = change.doc.data();

            if (change.type === "removed") {
                if (marcadoresAtivos[id]) {
                    map.removeLayer(marcadoresAtivos[id]); 
                    delete marcadoresAtivos[id]; 
                }
            }

            if (change.type === "added" || change.type === "modified") {
                if (marcadoresAtivos[id]) map.removeLayer(marcadoresAtivos[id]);

                const cor = data.status === "verificado" ? "#3b82f6" : "#ff0000";
                const isMobile = window.innerWidth < 768;

                const marcador = L.circle([data.lat, data.lng], {
                    color: cor, fillColor: cor, fillOpacity: 0.5,
                    radius: isMobile ? 30 : 60, weight: 2
                }).addTo(map);

                const dataHora = data.horario ? data.horario.toDate().toLocaleString('pt-BR') : "Agora";
                
                marcador.bindPopup(`
                    <div style="text-align:center; font-family: sans-serif; width: 160px; padding: 5px 0;">
                        <b style="color:${cor};">${data.status === 'verificado' ? '✅ VERIFICADO' : '⚠️ RELATO DE ALAGAMENTO'}</b><br>
                        <span id="end-${id}" style="font-size:0.85em;">Buscando endereço...</span><br>
                        <small style="color:#666;">${dataHora}</small>
                        <hr style="margin:8px 0; border:0; border-top:1px solid #eee;">
                        <div style="display:flex; gap:5px; justify-content:center;">
                            <button onclick="confirmarPonto('${id}')" style="background:#2ecc71; color:white; border:none; padding:4px 8px; border-radius:4px; font-size:0.7rem; cursor:pointer;">Ainda está</button>
                            <button onclick="removerPonto('${id}')" style="background:#e74c3c; color:white; border:none; padding:4px 8px; border-radius:4px; font-size:0.7rem; cursor:pointer;">Limpou</button>
                        </div>
                    </div>
                `, { closeOnClick: false, autoClose: false });

                marcador.on('click', function(ev) {
                    L.DomEvent.stopPropagation(ev); // IMPEDE MENSAGEM DO MAPA AO CLICAR NO PONTO
                    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${data.lat}&lon=${data.lng}&zoom=18`)
                        .then(r => r.json())
                        .then(geoData => {
                            const el = document.getElementById(`end-${id}`);
                            if (el) el.innerText = geoData.address.road || geoData.address.suburb || "Endereço não identificado";
                        });
                });

                marcadoresAtivos[id] = marcador;
            }
        });
    });
}

// --- CLIQUE BOTÃO ADICIONAR ---
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

// --- FUNÇÕES GLOBAIS (BOTÕES POPUP) ---
window.removerPonto = async function(id) {
    confirmarAcao("Confirmar que NÃO está mais alagado?", async () => {
        try {
            await deleteDoc(doc(db, "alagamentos", id));
            mostrarMensagem("Mapa atualizado!", "success");
        } catch (e) { mostrarMensagem("Erro ao remover.", "error"); }
    });
}

window.confirmarPonto = async function(id) {
    try {
        await updateDoc(doc(db, "alagamentos", id), { horario: serverTimestamp() });
        mostrarMensagem("Ponto confirmado!", "success");
    } catch (e) { mostrarMensagem("Erro ao confirmar.", "error"); }
}

// --- MONITORAMENTO CLIMÁTICO ---
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
        const probAgora = horario.precipitation_probability[horaIndex];
        
        let statusTexto = "CÉU LIMPO", statusClasse = "safe"; 

        if (vol > 0) {
            if (vol >= 5.0) { statusTexto = "CHUVA FORTE"; statusClasse = "danger"; }
            else { statusTexto = vol < 1.0 ? "GAROA FRACA" : "CHUVA MODERADA"; statusClasse = "warning"; }
        } else if (probAgora >= 60) {
            statusTexto = "RISCO DE CHUVA"; statusClasse = "warning";
        }

        const painel = document.getElementById('status-panel');
        if (painel) {
            painel.innerHTML = `
               <div class="monitor-card compact ${statusClasse}" id="main-monitor">
                    <div class="drag-handle" onclick="toggleMonitor()"><i class="fa-solid fa-chevron-up indicador-seta"></i></div>
                    <div class="header-resumo" onclick="toggleMonitor()">
                        <div class="info-principal">
                            <span class="cidade">S.L. Paraitinga</span>
                            <h1>${Math.round(atual.temperature_2m)}°</h1>
                            <div class="alerta-mini ${statusClasse}">${statusTexto}</div>
                        </div>
                        <div class="mobile-selector-container">
                            <div class="mobile-switch">
                                <button class="btn-switch ativo" id="sw-hoje" onclick="event.stopPropagation(); fecharModalPrevisao(); window.setSwitch('hoje')">Hoje</button>
                                <button class="btn-switch" id="sw-3dias" onclick="event.stopPropagation(); abrirModalPrevisao(); window.setSwitch('3dias')">3 Dias</button>
                            </div>
                        </div>
                    </div>
                    <div class="detalhes-expansíveis">
                        <div class="data-grid">
                            <div class="data-item"><span class="label">SENSAÇÃO</span><span class="value">${Math.round(horario.apparent_temperature[horaIndex])}°C</span></div>
                            <div class="data-item"><span class="label">PROB. CHUVA</span><span class="value">${probAgora}%</span></div>
                            <div class="data-item"><span class="label">VOLUME</span><span class="value">${vol} mm</span></div>
                            <div class="data-item"><span class="label">VENTO MÁX</span><span class="value">${diario.wind_speed_10m_max[0]} km/h</span></div>
                        </div>
                        <div class="footer-info">
                            <div class="sun-cycle"><span>🌅 ${diario.sunrise[0].split('T')[1]}</span><span>🌇 ${diario.sunset[0].split('T')[1]}</span></div>
                        </div>
                    </div>
                </div>
            `;
        }
    } catch (e) { console.error("Erro no monitoramento:", e); }
}

// --- PREVISÃO 3 DIAS ---
export async function carregarPrevisao3Dias() {
    const url = "https://api.open-meteo.com/v1/forecast?latitude=-23.2217&longitude=-45.31&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,showers_sum,rain_sum&timezone=America%2FSao_Paulo&forecast_days=4";
    const container = document.querySelector('.dias-grid');
    if (!container) return;

    try {
        const response = await fetch(url);
        const data = await response.json();
        const diario = data.daily;
        container.innerHTML = ''; 
        const diasSemana = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

        for (let i = 1; i <= 3; i++) {
            const dataRaw = diario.time[i];
            const dataObj = new Date(dataRaw + 'T00:00');
            const [ano, mes, dia] = dataRaw.split('-');
            const nomeDia = i === 1 ? "Amanhã" : diasSemana[dataObj.getDay()];
            const prob = diario.precipitation_probability_max[i] || 0;
            const somaChuva = diario.precipitation_sum[i] || 0;
            const vento = diario.wind_speed_10m_max[i] || 0;

            let statusTexto = "Céu Limpo", statusCor = "#2ecc71";
            if (somaChuva > 0.2) {
                if (somaChuva >= 10 || vento > 30) { statusTexto = "ALERTA: CHUVA"; statusCor = "#e67e22"; }
                else { statusTexto = "CHUVA LEVE"; statusCor = "#3498db"; }
            }
            if (somaChuva > 30) { statusTexto = "PERIGO: TEMPORAL"; statusCor = "#e74c3c"; }

            container.innerHTML += `
                <div class="dia-card" style="border-top: 4px solid ${statusCor}; padding: 12px; min-height: 140px;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <b>${nomeDia}</b>
                        <span style="font-size:0.6rem; background:${statusCor}; color:white; padding:2px 5px; border-radius:3px;">${statusTexto}</span>
                    </div>
                    <small style="color: #666;">${dia}/${mes}</small>
                    <div style="margin-top: 10px; font-weight: bold;">
                        <span style="color:#e53e3e">↑${Math.round(diario.temperature_2m_max[i])}°</span>
                        <span style="color:#3182ce">↓${Math.round(diario.temperature_2m_min[i])}°</span>
                    </div>
                    <div style="font-size:0.75rem; color:#444; margin-top:8px;">
                        <span>💧 <b>${prob}%</b></span> | <span>📏 <b>${somaChuva.toFixed(1)}mm</b></span>
                    </div>
                </div>`;
        }
    } catch (e) { console.error("Erro na previsão:", e); }
}

// --- MODAIS E CONTROLES DE INTERFACE ---
window.toggleMonitor = function() {
    const el = document.getElementById('main-monitor');
    if (el) { el.classList.toggle('compact'); el.classList.toggle('expanded'); }
}

window.setSwitch = function(tipo) {
    const btnHoje = document.getElementById('sw-hoje');
    const btn3dias = document.getElementById('sw-3dias');
    if (!btnHoje || !btn3dias) return;
    if (tipo === 'hoje') { btnHoje.classList.add('ativo'); btn3dias.classList.remove('ativo'); }
    else { btn3dias.classList.add('ativo'); btnHoje.classList.remove('ativo'); }
};

window.fecharModalPrevisao = function() {
    const modal = document.getElementById('modal-previsao');
    if (modal) modal.style.display = 'none';
    window.setSwitch('hoje');
};

window.abrirModalPrevisao = function() {
    const modal = document.getElementById('modal-previsao');
    if (modal) { modal.style.display = 'block'; carregarPrevisao3Dias(); }
};

window.abrirModalAjuda = () => document.getElementById('modal-ajuda').style.display = 'flex';
window.fecharModalAjuda = () => document.getElementById('modal-ajuda').style.display = 'none';

window.onclick = function(event) {
    if (event.target == document.getElementById('modal-previsao')) window.fecharModalPrevisao();
    if (event.target == document.getElementById('modal-ajuda')) window.fecharModalAjuda();
};

// --- PWA E INSTALAÇÃO ---
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const inst = document.getElementById('install-container');
    if (inst) inst.style.display = 'block';
});

document.getElementById('btn-install-pwa')?.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') document.getElementById('install-container').style.display = 'none';
    deferredPrompt = null;
});

window.addEventListener('appinstalled', () => {
    document.getElementById('install-container').style.display = 'none';
    const overlay = document.getElementById('overlay-pwa-sucesso');
    if (overlay) overlay.style.display = 'flex';
    setTimeout(() => { window.close(); window.location.href = "about:blank"; }, 4000);
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => console.log('Erro PWA:', err));
    });
}

// --- AVISO DE RESPONSABILIDADE (CONTROLE DIÁRIO) ---
window.verificarExibicaoAviso = function() {
    const modal = document.getElementById('modal-aviso');
    if (!modal) return;

    const hoje = new Date().toLocaleDateString('pt-BR');
    const dadosSalvos = localStorage.getItem('controleAviso');
    let dadosAviso = dadosSalvos ? JSON.parse(dadosSalvos) : { data: "", contagem: 0 };

    // Se já apareceu hoje, encerra aqui e não faz nada
    if (dadosAviso.data === hoje && dadosAviso.contagem >= 1) {
        console.log("Aviso já exibido hoje. Mantendo oculto.");
        return; 
    }

    // Se chegou aqui, é porque precisa mostrar
    setTimeout(() => {
        modal.style.display = 'flex'; // Mostra a modal
        
        // Atualiza o registro imediatamente
        dadosAviso.data = hoje;
        dadosAviso.contagem += 1;
        localStorage.setItem('controleAviso', JSON.stringify(dadosAviso));
    }, 1000);
};

// Certifique-se de que a função fecharAviso apenas esconda
window.fecharAviso = function() {
    const modal = document.getElementById('modal-aviso');
    if (modal) modal.style.display = 'none';
};

window.fecharAviso = function() {
    const modal = document.getElementById('modal-aviso');
    if (modal) {
        modal.style.setProperty('display', 'none', 'important');
        if (typeof logEvent === "function") logEvent(analytics, 'aviso_responsabilidade_aceito');
    }
};

// --- INICIALIZAÇÃO ---
verificarSeEstaNoApp();
function verificarSeEstaNoApp() {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (!isStandalone && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        mostrarMensagem("🚀 Para uma melhor experiência, instale o App na tela inicial!", "info", 8000);
    }
}

