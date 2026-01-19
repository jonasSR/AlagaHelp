import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyAs1QzV0ZniAwE9cdpeAY-fJMjJ4WTJsmo",
    authDomain: "alagahelp.firebaseapp.com",
    projectId: "alagahelp",
    storageBucket: "alagahelp.firebasestorage.app",
    messagingSenderId: "41555142663",
    appId: "1:41555142663:web:6306bb0c028dc86f8322a2"
};

// Inicialização
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const emailIn = document.getElementById('email');
const passIn = document.getElementById('password');

// --- SISTEMA DE MENSAGENS NA TELA (TOASTS) ---
function mostrarMensagem(texto, tipo = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${tipo}`;
    toast.innerText = texto;
    
    container.appendChild(toast);

    // Remove do HTML após 3 segundos
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Dicionário de erros traduzidos
const traduzirErro = (code) => {
    switch (code) {
        case 'auth/email-already-in-use': return "Este e-mail já está cadastrado.";
        case 'auth/invalid-email': return "E-mail inválido.";
        case 'auth/weak-password': return "A senha deve ter pelo menos 6 caracteres.";
        case 'auth/invalid-credential': return "E-mail ou senha incorretos.";
        case 'auth/user-not-found': return "Usuário não encontrado.";
        case 'auth/wrong-password': return "Senha incorreta.";
        default: return "Ocorreu um erro inesperado. Tente novamente.";
    }
};

// --- LOGIN ---
document.getElementById('btnLogin').onclick = async (e) => {
    e.preventDefault(); 
    
    const email = emailIn.value.trim();
    const pass = passIn.value.trim();

    if (!email || !pass) {
        mostrarMensagem("Preencha todos os campos para entrar.", "error");
        return;
    }

    mostrarMensagem("Verificando credenciais...", "info");

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, pass);
        if (userCredential.user) {
            mostrarMensagem("Login realizado com sucesso! Entrando...", "success");
            setTimeout(() => {
                window.location.replace("index.html");
            }, 1000);
        }
    } catch (err) {
        console.error("Erro ao logar:", err.code);
        mostrarMensagem(traduzirErro(err.code), "error");
    }
};

// --- CADASTRO ---
document.getElementById('btnCadastro').onclick = async (e) => {
    e.preventDefault();

    const email = emailIn.value.trim();
    const pass = passIn.value.trim();

    if (!email || !pass) {
        mostrarMensagem("Preencha e-mail e senha para criar conta.", "error");
        return;
    }

    mostrarMensagem("Criando sua conta...", "info");

    try {
        await createUserWithEmailAndPassword(auth, email, pass);
        mostrarMensagem("Conta criada com sucesso!", "success");
        
        setTimeout(() => {
            window.location.replace("index.html");
        }, 1500);
    } catch (err) {
        console.error("Erro no cadastro:", err.code);
        mostrarMensagem(traduzirErro(err.code), "error");
    }
};


