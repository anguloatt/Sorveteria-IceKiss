import { dom } from './domRefs.js'; // Importa o objeto dom centralizado
import { showToast, showCustomConfirm } from './utils.js'; // Importa funções utilitárias
import * as app from './app.js'; // Importa o módulo app para usar o startApp
import { auth } from './firebase-config.js'; // CORREÇÃO: Importa a instância 'auth' diretamente da fonte.
import { logActivity, findEmployeeByName, updateEmployeeLastLogin, resetEmployeePassword } from './firebaseService.js'; // Importa a função de log de atividade
import { signInAnonymously } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

export function switchLoginTab(activeTab) {
    console.log("switchLoginTab: Alternando para aba:", activeTab);
    if (!dom.tabFuncionario || !dom.tabGerencia || !dom.loginFuncionarioDiv || !dom.loginGerenciaDiv) {
        console.error("Elementos da aba de login não encontrados.");
        return;
    }
    if (activeTab === 'funcionario') {
        dom.tabFuncionario.classList.add('bg-white', 'text-blue-600');
        dom.tabFuncionario.classList.remove('bg-gray-200', 'text-gray-500');
        dom.tabGerencia.classList.add('bg-gray-200', 'text-gray-500');
        dom.tabGerencia.classList.remove('bg-white', 'text-orange-500');
        dom.loginFuncionarioDiv.classList.remove('hidden');
        dom.loginGerenciaDiv.classList.add('hidden');
    } else {
        dom.tabGerencia.classList.add('bg-white', 'text-orange-500');
        dom.tabGerencia.classList.remove('bg-gray-200', 'text-gray-500');
        dom.tabFuncionario.classList.add('bg-gray-200', 'text-gray-500');
        dom.tabFuncionario.classList.remove('bg-white', 'text-blue-600');
        dom.loginGerenciaDiv.classList.remove('hidden');
        dom.loginFuncionarioDiv.classList.add('hidden');
    }
}

export async function performFuncionarioLogin() {
    console.log("performFuncionarioLogin: Tentando login de funcionário com usuário e senha.");
    const userName = dom.employeeUserSelect.value;
    const password = dom.employeePassInput.value;

if (!userName) {
        return showToast("Por favor, selecione seu nome na lista.", "error");
    }

try {
        const employee = await findEmployeeByName(userName);

if (!employee) {
            return showToast("Usuário não encontrado.", "error");
        }

const storedPassword = employee.password;
        let loginSuccess = false;

if (storedPassword) {
            if (String(storedPassword) === String(password)) {
                loginSuccess = true;
            }
        } else {
            if (password === '1234') {
                loginSuccess = true;
            }
        }

if (!loginSuccess) {
            return showToast("Senha incorreta.", "error");
        }

const userCredential = await signInAnonymously(auth);
        await logActivity(employee.name, 'login');
        await updateEmployeeLastLogin(employee.id);
        app.startApp('funcionario', { id: employee.id, name: employee.name, uid: userCredential.user.uid, role: employee.role });
        console.log("performFuncionarioLogin: Login de funcionário bem-sucedido.");

} catch (error) {
        console.error("performFuncionarioLogin: Ocorreu um erro durante o login:", error);
        showToast("Ocorreu um erro durante o login. Verifique o console.", "error");
    }
}

export async function performGerenciaLogin() {
    console.log("performGerenciaLogin: Tentando login de gerência.");
    const user = dom.managerUserInput.value.trim();
    const pass = dom.managerPassInput.value;

    // Normalize input and stored credentials to avoid case-sensitivity issues
    const inputUser = user.toLowerCase();

    const storedManagerUser = (app.managerCredentials && app.managerCredentials.user) ? String(app.managerCredentials.user).toLowerCase() : 'gerencia';
    const storedManagerPass = (app.managerCredentials && app.managerCredentials.pass) ? String(app.managerCredentials.pass) : '1234';

    const storedMasterUser = (app.masterCredentials && app.masterCredentials.user) ? String(app.masterCredentials.user).toLowerCase() : 'mestra';
    const storedMasterPass = (app.masterCredentials && app.masterCredentials.pass) ? String(app.masterCredentials.pass) : 'mestra123';

    if (inputUser === storedManagerUser && pass === storedManagerPass) {
        app.startApp('gerente', { name: user });
        console.log("performGerenciaLogin: Login de gerência bem-sucedido.");
    } else if (inputUser === storedMasterUser && pass === storedMasterPass) {
        app.startApp('mestra', { name: user });
        console.log("performGerenciaLogin: Login de mestra bem-sucedido.");
    } else {
        showToast("Usuário ou senha inválidos.", "error");
        console.warn("performGerenciaLogin: Credenciais de gerência inválidas.");
    }
}

async function handleForgotPassword(e) {
    e.preventDefault(); // Eu previno o comportamento padrão do link para não recarregar a página.
    console.log("handleForgotPassword: Iniciando processo de redefinição de senha.");
    const userName = dom.employeeUserSelect.value;

if (!userName) {
        return showToast("Por favor, selecione seu nome na lista para redefinir a senha.", "error");
    }

const confirm = await showCustomConfirm(
        "Redefinir Senha",
        `Para redefinir a senha de "${userName}", é necessária a autorização da gerência.`,
        {
            showInput: true, // Mostra os campos de usuário e senha
            passwordRequired: true // Valida as credenciais da gerência
        }
    );

if (confirm) {
        try {
            const employee = await findEmployeeByName(userName);
            if (!employee) {
                return showToast("Funcionário não encontrado.", "error");
            }

await resetEmployeePassword(employee.id); // Chama a função do serviço para resetar a senha

showToast(`Senha de "${userName}" redefinida para "1234". Você já pode entrar.`, "success", 5000);
            dom.employeePassInput.value = '';
            dom.employeePassInput.focus();

} catch (error) {
            console.error("handleForgotPassword: Erro ao redefinir senha:", error);
        }
    }
}

export function setupAuthListeners() {
    console.log("setupAuthListeners: Configurando listeners de autenticação.");
    if (dom.tabFuncionario) dom.tabFuncionario.addEventListener('click', () => switchLoginTab('funcionario'));
    if (dom.tabGerencia) dom.tabGerencia.addEventListener('click', () => switchLoginTab('gerencia'));
    if (dom.loginBtnFuncionario) dom.loginBtnFuncionario.addEventListener('click', performFuncionarioLogin);
    if (dom.loginBtnGerencia) dom.loginBtnGerencia.addEventListener('click', performGerenciaLogin);
    if (dom.forgotPasswordLink) dom.forgotPasswordLink.addEventListener('click', handleForgotPassword);
    if (dom.employeePassInput) dom.employeePassInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') performFuncionarioLogin(); });
    if (dom.managerPassInput) dom.managerPassInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') performGerenciaLogin(); });
}

