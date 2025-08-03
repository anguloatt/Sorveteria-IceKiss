// Meu arquivo para gerenciar a lógica de autenticação e login.

import { dom } from './domRefs.js'; // Importa o objeto dom centralizado
import { showToast, showCustomConfirm } from './utils.js'; // Importa funções utilitárias
import * as app from './app.js'; // Importa o módulo app para usar o startApp
import { auth } from './firebase-config.js'; // CORREÇÃO: Importa a instância 'auth' diretamente da fonte.
import { logUserActivity, findEmployeeByName, updateEmployeeLastLogin, resetEmployeePassword } from './firebaseService.js'; // Importa a função de log de atividade
import { signInAnonymously } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";


/**
 * Eu alterno a aba de login visível entre 'Funcionário' e 'Gerência'.
 * @param {'funcionario' | 'gerencia'} activeTab A aba que deve ficar ativa.
 */
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

/**
 * Minha função para realizar o login do funcionário, validando a senha e usando a autenticação anônima do Firebase.
 */
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

        // Minha lógica de senha padrão.
        if (storedPassword) {
            // CORREÇÃO: Compara como string para evitar problemas de tipo (ex: 1234 vs "1234").
            if (String(storedPassword) === String(password)) {
                loginSuccess = true;
            }
        } else {
            // Caso 2: O funcionário NÃO tem senha cadastrada (campo não existe no Firestore).
            // A senha digitada deve ser a padrão "1234".
            if (password === '1234') {
                loginSuccess = true;
            }
        }

        if (!loginSuccess) {
            return showToast("Senha incorreta.", "error");
        }

        // Se o login der certo, eu continuo com a autenticação anônima do Firebase.
        // CORREÇÃO: Usa a instância 'auth' importada diretamente, em vez de 'app.auth' que era undefined.
        const userCredential = await signInAnonymously(auth);
        await logUserActivity(employee.name, 'login');
        await updateEmployeeLastLogin(employee.id);
        app.startApp('funcionario', { id: employee.id, name: employee.name, uid: userCredential.user.uid, role: employee.role });
        console.log("performFuncionarioLogin: Login de funcionário bem-sucedido.");

    } catch (error) {
        console.error("performFuncionarioLogin: Ocorreu um erro durante o login:", error);
        showToast("Ocorreu um erro durante o login. Verifique o console.", "error");
    }
}

/**
 * Minha função para realizar o login da gerência ou da conta mestra.
 */
export async function performGerenciaLogin() { 
    console.log("performGerenciaLogin: Tentando login de gerência.");
    // As credenciais do gerente eu carrego em app.js::loadConfig().
    const user = dom.managerUserInput.value.trim();
    const pass = dom.managerPassInput.value;
    
    // CORREÇÃO: Aqui eu passo o nome de usuário digitado (user) em vez de um texto fixo.
    // Assim, garanto que o nome correto do gerente seja registrado nos pedidos e relatórios.
    if (user.toLowerCase() === app.managerCredentials.user && pass === app.managerCredentials.pass) {
        // Antes eu passava um nome fixo: app.startApp('gerente', { name: 'Gerência' });
        app.startApp('gerente', { name: user });
        console.log("performGerenciaLogin: Login de gerência bem-sucedido.");
    } else if (user.toLowerCase() === app.masterCredentials.user && pass === app.masterCredentials.pass) {
        // Antes: app.startApp('mestra', { name: 'Mestra' });
        app.startApp('mestra', { name: user });
        console.log("performGerenciaLogin: Login de mestra bem-sucedido.");
    } else {
        showToast("Usuário ou senha inválidos.", "error");
        console.warn("performGerenciaLogin: Credenciais de gerência inválidas.");
    }
}

/**
 * Minha função para lidar com a solicitação de redefinição de senha do funcionário.
 * @param {Event} e O evento de clique.
 */
async function handleForgotPassword(e) { 
    e.preventDefault(); // Eu previno o comportamento padrão do link para não recarregar a página.
    console.log("handleForgotPassword: Iniciando processo de redefinição de senha.");
    const userName = dom.employeeUserSelect.value;

    if (!userName) {
        return showToast("Por favor, selecione seu nome na lista para redefinir a senha.", "error");
    }

    // Peço a confirmação e as credenciais da gerência para autorizar o reset.
    const confirm = await showCustomConfirm(
        "Redefinir Senha",
        `Para redefinir a senha de "${userName}", é necessária a autorização da gerência.`,
        {
            showInput: true, // Mostra os campos de usuário e senha
            passwordRequired: true // Valida as credenciais da gerência
        }
    );

    // Se as credenciais da gerência forem válidas, a promise 'confirm' resolverá para true.
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
            // O toast de erro já é mostrado pela função do serviço, não precisa mostrar outro aqui.
        }
    }
}

/**
 * Minha função para configurar todos os event listeners da tela de autenticação.
 */
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