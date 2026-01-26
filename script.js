import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, serverTimestamp, doc, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";

const marcadoresAtivos = {};
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

    // ADICIONE ESTA LINHA:
        if (window.innerWidth > 768) {
            carregarPrevisao3Dias();
        }
    } else {
        window.location.href = "login.html";
    }
});

function tentarAtivarGPSAoEntrar() {
    pedirLocalizacao(); // Tenta localizar em silêncio
    setTimeout(() => {
        if (!markerUsuario) {
            // Em vez de mostrarMensagem, apenas faz o botão de alvo brilhar (atenção)
            document.getElementById('btn-recenter').classList.add('attention');
            // Removi o mostrarMensagem daqui
        }
    }, 2500);
}


// --- BOTÃO RECENTRALIZAR ---
const btnRecenter = document.getElementById('btn-recenter');
btnRecenter.addEventListener('click', () => {
    btnRecenter.classList.remove('attention');
    
    if (markerUsuario) {
        // Se já temos o GPS, apenas voamos para lá (sem mensagens)
        map.flyTo(markerUsuario.getLatLng(), 17, { animate: true, duration: 1.5 });
    } else {
        // Se NÃO temos, chamamos a função, mas sem colocar mensagem aqui fora
        pedirLocalizacao();
    }
});

// --- LÓGICA DE LOCALIZAÇÃO MELHORADA ---
let solicitandoGPS = false; // Variável de controle

function pedirLocalizacao() {
    if (!("geolocation" in navigator)) {
        mostrarMensagem("Seu navegador não suporta GPS.", "error");
        return;
    }

    // Se já estivermos tentando, não faz nada para não acumular
    if (solicitandoGPS) return;
    solicitandoGPS = true;

    // Só mostra mensagem se o GPS demorar mais de 1 segundo para responder
    const timeoutMensagem = setTimeout(() => {
        if (!markerUsuario) {
            mostrarMensagem("Buscando sinal do GPS...", "info");
        }
    }, 1000);

    navigator.geolocation.watchPosition(
        (position) => {
            clearTimeout(timeoutMensagem); // Cancela a mensagem se achou rápido
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
            clearTimeout(timeoutMensagem); // Cancela a mensagem de "buscando"
            solicitandoGPS = false;

            if (error.code === error.PERMISSION_DENIED) {
                document.getElementById('btn-recenter').classList.add('attention');
                mostrarMensagem("Ative o GPS para usar o mapa.", "error");
            }
        },
        { enableHighAccuracy: true }
    );
}



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


// --- FUNÇÃO TOAST (MENSAGENS) ATUALIZADA ---
function mostrarMensagem(texto, tipo = 'info', duracao = 5000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${tipo}`;
    toast.innerText = texto;
    container.appendChild(toast);
    
    // Agora o tempo de remoção é dinâmico
    setTimeout(() => { 
        toast.style.opacity = '0'; // Suaviza a saída se tiver transição no CSS
        setTimeout(() => toast.remove(), 500); 
    }, duracao);
}


// --- LÓGICA DE CLIQUE NO MAPA ---
map.on('click', (e) => {
    // Se não estiver logado, não faz nada
    if (!usuarioLogado) return;

    if (modoMarcacao) {
        // Se o modo estiver ativo, abre a confirmação para salvar (seu código atual)
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
    } 
    else {
        // MENSAGEM AJUSTADA: Referenciando o ícone de localização e com 8 segundos
        mostrarMensagem("⚠️ Clique no botão vermelho com ícone de localização para marcar um ponto no mapa.", "info", 8000);
        
        // Faz o botão da imagem piscar e tremer para o usuário achar
        const btnAdd = document.getElementById('btn-add-alagamento');
        if (btnAdd) {
            btnAdd.classList.add('atencao-shake');
            // Remove a animação após 2 segundos para não ficar cansativo
            setTimeout(() => btnAdd.classList.remove('atencao-shake'), 2000);
        }
    }
});
// 6. Ler pontos em Tempo Real
function carregarPontosAlagamento() {
    // O onSnapshot fica "ouvindo" o banco de dados sem parar
    onSnapshot(collection(db, "alagamentos"), (snapshot) => {
        
        snapshot.docChanges().forEach(async (change) => {
            const id = change.doc.id;
            const data = change.doc.data();

            // --- A MÁGICA ACONTECE AQUI: SE FOR REMOVIDO NO ADMIN ---
            if (change.type === "removed") {
                if (marcadoresAtivos[id]) {
                    map.removeLayer(marcadoresAtivos[id]); // Remove a bolinha do mapa na hora
                    delete marcadoresAtivos[id];           // Apaga da memória
                    console.log("Ponto removido automaticamente");
                }
            }

            // --- SE FOR ADICIONADO OU ATUALIZADO (COR MUDOU) ---
            if (change.type === "added" || change.type === "modified") {
                // Se a bolinha já existe, removemos a antiga antes de por a nova (para não duplicar)
                if (marcadoresAtivos[id]) {
                    map.removeLayer(marcadoresAtivos[id]);
                }

                const cor = data.status === "verificado" ? "#3b82f6" : "#ff0000";
                const isMobile = window.innerWidth < 768;

                const marcador = L.circle([data.lat, data.lng], {
                    color: cor,
                    fillColor: cor,
                    fillOpacity: 0.5,
                    radius: isMobile ? 30 : 60,
                    weight: 2
                }).addTo(map);

                const dataHora = data.horario ? data.horario.toDate().toLocaleString('pt-BR') : "Agora";
                
                // Popup com as informações
                marcador.bindPopup(`
                    <div style="text-align:center; font-family: sans-serif; width: 160px;">
                        <b style="color:${cor};">${data.status === 'verificado' ? '✅ VERIFICADO' : '⚠️ RELATO DE ALAGAMENTO'}</b><br>
                        <span id="end-${id}" style="font-size:0.85em;">Buscando endereço...</span><br>
                        <small style="color:#666;">${dataHora}</small>
                        <hr style="margin:8px 0; border:0; border-top:1px solid #eee;">
                        <div style="display:flex; gap:5px; justify-content:center;">
                            <button onclick="confirmarPonto('${id}')" style="background:#2ecc71; color:white; border:none; padding:4px 8px; border-radius:4px; font-size:0.7rem; cursor:pointer;">Ainda está</button>
                            <button onclick="removerPonto('${id}')" style="background:#e74c3c; color:white; border:none; padding:4px 8px; border-radius:4px; font-size:0.7rem; cursor:pointer;">Limpou</button>
                        </div>
                    </div>
                `, { closeButton: false });

                // Guarda a referência da bolinha na nossa lista usando o ID do Firebase
                marcadoresAtivos[id] = marcador;
            }
        });
    });
}

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
        const probAgora = horario.precipitation_probability[horaIndex]; // Pega a probabilidade da hora atual
        
        // --- LÓGICA HÍBRIDA DE STATUS (IGUAL AO ADMIN) ---
        let statusTexto = "CÉU LIMPO";
        let statusClasse = "safe"; 

        if (vol > 0) {
            if (vol >= 5.0) {
                statusTexto = "CHUVA FORTE";
                statusClasse = "danger"; 
            } else {
                statusTexto = vol < 1.0 ? "GAROA FRACA" : "CHUVA MODERADA";
                statusClasse = "warning"; 
            }
        } 
        // Se não chove volume, mas a probabilidade é alta (Acima de 60%)
        else if (probAgora >= 60) {
            statusTexto = "RISCO DE CHUVA";
            statusClasse = "warning";
        }

        const painel = document.getElementById('status-panel');
        if (painel) {
            painel.innerHTML = `
               <div class="monitor-card compact ${statusClasse}" id="main-monitor">
                    <div class="drag-handle" onclick="toggleMonitor()">
                        <i class="fa-solid fa-chevron-up indicador-seta"></i>
                    </div>
                    
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
                            <div class="data-item">
                                <span class="label">SENSAÇÃO</span>
                                <span class="value">${Math.round(horario.apparent_temperature[horaIndex])}°C</span>
                            </div>
                            <div class="data-item">
                                <span class="label">PROB. CHUVA</span>
                                <span class="value">${probAgora}%</span>
                            </div>
                            <div class="data-item">
                                <span class="label">VOLUME</span>
                                <span class="value">${vol} mm</span>
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
                        </div>
                    </div>
                </div>
            `;
        }
    } catch (e) { 
        console.error("Erro ao atualizar monitoramento do usuário:", e); 
    }
}
// Função global para trocar o estado do botão
window.setSwitch = function(tipo) {
    const btnHoje = document.getElementById('sw-hoje');
    const btn3dias = document.getElementById('sw-3dias');
    if (!btnHoje || !btn3dias) return;

    if (tipo === 'hoje') {
        btnHoje.classList.add('ativo');
        btn3dias.classList.remove('ativo');
    } else {
        btn3dias.classList.add('ativo');
        btnHoje.classList.remove('ativo');
    }
};

window.abrirModalAjuda = function() {
    document.getElementById('modal-ajuda').style.display = 'flex';
}

window.fecharModalAjuda = function() {
    document.getElementById('modal-ajuda').style.display = 'none';
}


// Lógica do Switch Mobile
const btnHoje = document.getElementById('btn-ver-hoje');
const btn3Dias = document.getElementById('btn-ver-3dias');

if (btnHoje && btn3Dias) {
    btnHoje.onclick = () => {
        btnHoje.classList.add('ativo');
        btn3Dias.classList.remove('ativo');
        fecharModalPrevisao(); // Volta para a visão do mapa/hoje
    };

    btn3Dias.onclick = () => {
        btn3Dias.classList.add('ativo');
        btnHoje.classList.remove('ativo');
        abrirModalPrevisao(); // Abre a previsão extendida
    };
}

// Centraliza a função de fechar para garantir que o switch sempre mude
window.fecharModalPrevisao = function() {
    const modal = document.getElementById('modal-previsao');
    if (modal) {
        modal.style.display = 'none';
    }
    
    // AÇÃO AUTOMÁTICA: Volta o botão para "Hoje"
    window.setSwitch('hoje');
};

window.abrirModalPrevisao = function() {
    const modal = document.getElementById('modal-previsao');
    if (modal) {
        modal.style.display = 'block';
        carregarPrevisao3Dias();
    }
};

// Fecha a modal se clicar fora dela (no fundo escuro)
window.onclick = function(event) {
    const modal = document.getElementById('modal-previsao');
    const modalAjuda = document.getElementById('modal-ajuda');
    
    if (event.target == modal) {
        window.fecharModalPrevisao(); // Usa a função acima para resetar o switch
    }
    if (event.target == modalAjuda) {
        window.fecharModalAjuda();
    }
};

// Mantenha sua função setSwitch como está, ela já funciona bem
window.setSwitch = function(tipo) {
    const btnHoje = document.getElementById('sw-hoje');
    const btn3dias = document.getElementById('sw-3dias');
    if (!btnHoje || !btn3dias) return;

    if (tipo === 'hoje') {
        btnHoje.classList.add('ativo');
        btn3dias.classList.remove('ativo');
    } else {
        btn3dias.classList.add('ativo');
        btnHoje.classList.remove('ativo');
    }
};

//###########################################################################################################
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
            const dataObj = new Date(dataRaw + 'T00:00');
            const [ano, mes, dia] = dataRaw.split('-');
            const nomeDia = i === 1 ? "Amanhã" : diasSemana[dataObj.getDay()];
            
            const prob = diario.precipitation_probability_max[i] || 0;
            const somaChuva = diario.precipitation_sum[i] || 0;
            const vento = diario.wind_speed_10m_max[i] || 0;

            // --- LÓGICA DE PRECISÃO (MANTIDA) ---
            let statusTexto = "Céu Limpo";
            let statusCor = "#2ecc71";

            if (somaChuva > 0.2) {
                if (somaChuva >= 10 || vento > 30) {
                    statusTexto = "ALERTA: CHUVA";
                    statusCor = "#e67e22";
                } else if (somaChuva < 5 && prob > 70) {
                    statusTexto = "INSTÁVEL";
                    statusCor = "#f1c40f";
                } else {
                    statusTexto = "CHUVA LEVE";
                    statusCor = "#3498db";
                }
            } else if (prob > 50) {
                statusTexto = "MUITO NUBLADO";
                statusCor = "#95a5a6";
            }

            if (somaChuva > 30) {
                statusTexto = "PERIGO: TEMPORAL";
                statusCor = "#e74c3c";
            }

            // --- TEMPLATE COM ALINHAMENTO FIXO ---
        containerPrevisao.innerHTML += `
            <div class="dia-card" style="border-top: 4px solid ${statusCor}; padding: 12px; display: flex; flex-direction: column; min-height: 140px;">
                
                <div style="margin-bottom: 8px;"> 
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap: 4px;">
                        <b style="font-size:0.85rem; line-height: 1.2;">${nomeDia}</b>
                        <span style="font-size:0.6rem; background:${statusCor}; color:white; padding:2px 5px; border-radius:3px; font-weight:bold; white-space: nowrap;">
                            ${statusTexto}
                        </span>
                    </div>
                    <small style="display:block; color: #666;">${dia}/${mes}</small>
                </div>

                <div style="margin-top: 5px;">
                    <div style="display:flex; gap:12px; font-size:0.9rem; margin-bottom:8px; font-weight: bold;">
                        <span style="color:#e53e3e">↑${Math.round(diario.temperature_2m_max[i])}°</span>
                        <span style="color:#3182ce">↓${Math.round(diario.temperature_2m_min[i])}°</span>
                    </div>
                    
                    <div style="font-size:0.75rem; color:#444; display:grid; grid-template-columns: 1fr 1fr; gap:6px; align-items: center;">
                        <div style="display: flex; align-items: center; gap: 4px;">
                            <span>💧</span><b>${prob}%</b>
                        </div>
                        <div style="display: flex; align-items: center; gap: 4px;">
                            <span>📏</span><b>${somaChuva.toFixed(1)}mm</b>
                        </div>
                        <div style="display: flex; align-items: center; gap: 4px; grid-column: span 2;">
                            <span>🌬️</span><span>${Math.round(vento)} km/h</span>
                        </div>
                    </div>
                </div>
            </div>`;
        }
    } catch (error) { 
        console.error("Erro na previsão:", error);
    }
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
            // REMOVI O RELOAD DAQUI. O onSnapshot cuida do resto!
        } catch (e) { mostrarMensagem("Erro ao remover.", "error"); }
    });
}

window.confirmarPonto = async function(id) {
    try {
        await updateDoc(doc(db, "alagamentos", id), { horario: serverTimestamp() });
        mostrarMensagem("Ponto confirmado!", "success");
    } catch (e) { mostrarMensagem("Erro ao confirmar.", "error"); }
}
atualizarMonitoramento();


// A BARRA DE STATUS ABAIXO DO MENU
onAuthStateChanged(auth, (user) => {
    const userDisplay = document.getElementById('user-email');
    
    if (user) {
        // Lógica para detectar se é anônimo ou email
        const nomeParaExibir = user.isAnonymous ? "Visitante" : (user.email ? user.email : "Usuário");
        
        if (userDisplay) {
            userDisplay.innerText = `Logado como: ${nomeParaExibir}`;
        }
        console.log("Login detectado:", nomeParaExibir);
    } else {
        // Se não houver usuário logado, vai para o login
        window.location.replace("login.html");
    }
});




// PWA Logic atualizado
let deferredPrompt;
const installContainer = document.getElementById('install-container');
const btnInstall = document.getElementById('btn-install-pwa');

// 1. Escuta se o app pode ser instalado
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    
    // MOSTRA O BOTÃO na tela mudando o estilo para flex ou block
    if (installContainer) {
        installContainer.style.display = 'block';
    }
    
    console.log('PWA: Pronto para instalação');
});

// 2. Ação ao clicar no botão de instalação
if (btnInstall) {
    btnInstall.addEventListener('click', async () => {
        if (!deferredPrompt) return;

        // Mostra o prompt oficial do navegador
        deferredPrompt.prompt();
        
        const { outcome } = await deferredPrompt.userChoice;
        logEvent(analytics, 'pwa_install_choice', { outcome: outcome });

        if (outcome === 'accepted') {
            console.log('Usuário aceitou a instalação');
            installContainer.style.display = 'none';
        }
        deferredPrompt = null;
    });
}

// 3. Registra sucesso
window.addEventListener('appinstalled', (evt) => {
    logEvent(analytics, 'pwa_install_success');
    if (installContainer) installContainer.style.display = 'none';
    
    // MENSAGEM FOCO NA EXPERIÊNCIA:
    alert("✅ Alaga-Help SLP instalado! Agora feche esta aba do navegador e abra o App pelo ícone na sua tela inicial.");
});

// 4. Registro do Service Worker (Mantido)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(() => console.log('Service Worker: Ativo'))
            .catch(err => console.log('Erro PWA:', err));
    });
}


// 1. Função para MOSTRAR a modal (Limite de 4 vezes por dia)
window.verificarExibicaoAviso = function() {
    const modal = document.getElementById('modal-aviso');
    if (!modal) return;

    const hoje = new Date().toLocaleDateString(); // Ex: "26/01/2026"
    
    // Recupera os dados salvos ou cria um objeto novo
    let dadosAviso = JSON.parse(localStorage.getItem('controleAviso')) || { data: hoje, contagem: 0 };

    // Se mudou o dia, reseta o contador
    if (dadosAviso.data !== hoje) {
        dadosAviso = { data: hoje, contagem: 0 };
    }

    // Só mostra se a contagem for menor que 4
    if (dadosAviso.contagem < 4) {
        setTimeout(() => {
            modal.style.setProperty('display', 'flex', 'important');
            
            // Incrementa e salva que o aviso foi exibido
            dadosAviso.contagem += 1;
            localStorage.setItem('controleAviso', JSON.stringify(dadosAviso));
            console.log(`Aviso exibido ${dadosAviso.contagem}/4 hoje.`);
        }, 800); 
    } else {
        console.log("Limite diário de avisos atingido (4/4).");
    }
};

// 2. Sua função de FECHAR (Atualizada)
window.fecharAviso = function() {
    const modal = document.getElementById('modal-aviso');
    if (modal) {
        modal.style.setProperty('display', 'none', 'important');
        
        // Registra o evento no Analytics
        if (typeof logEvent === "function") {
            logEvent(analytics, 'aviso_responsabilidade_aceito');
        }
    }
};




// Verifica se o usuário está acessando pelo navegador ou pelo App Instalado
function verificarSeEstaNoApp() {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches 
                        || window.navigator.standalone 
                        || document.referrer.includes('android-app://');

    if (!isStandalone && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        // Se estiver no celular mas NÃO for no App, mostra um alerta
        mostrarMensagem("🚀 Para uma experiência melhor, use o App instalado na sua tela inicial!", "info", 10000);
    }
}

// Chama a verificação
verificarSeEstaNoApp();