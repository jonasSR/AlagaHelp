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
const msg = document.getElementById('error-msg');

// Função auxiliar para mensagens amigáveis
const traduzirErro = (code) => {
    switch (code) {
        case 'auth/email-already-in-use': return "Este e-mail já está cadastrado.";
        case 'auth/invalid-email': return "E-mail inválido.";
        case 'auth/weak-password': return "A senha deve ter pelo menos 6 caracteres.";
        case 'auth/invalid-credential': return "E-mail ou senha incorretos.";
        default: return "Ocorreu um erro inesperado. Tente novamente.";
    }
};

// LOGIN
document.getElementById('btnLogin').onclick = async (e) => {
    e.preventDefault(); // IMPORTANTE: impede o reload da página
    
    msg.innerText = "Verificando..."; // Feedback visual

    if (!emailIn.value || !passIn.value) {
        msg.innerText = "Preencha todos os campos.";
        return;
    }

    try {
        // Tenta fazer o login
        const userCredential = await signInWithEmailAndPassword(auth, emailIn.value, passIn.value);
        
        if (userCredential.user) {
            console.log("Login realizado com sucesso!");
            // Usamos replace para que o usuário não possa voltar para a tela de login pelo botão "voltar"
            window.location.replace("index.html");
        }
    } catch (err) {
        console.error("Erro ao logar:", err.code);
        msg.innerText = traduzirErro(err.code);
    }
};

// CADASTRO
document.getElementById('btnCadastro').onclick = async () => {
    if (!emailIn.value || !passIn.value) {
        msg.innerText = "Preencha todos os campos.";
        return;
    }

    try {
        await createUserWithEmailAndPassword(auth, emailIn.value, passIn.value);
        alert("Conta criada com sucesso!");
        window.location.href = "index.html";
    } catch (err) {
        console.error(err);
        msg.innerText = traduzirErro(err.code);
    }
};


