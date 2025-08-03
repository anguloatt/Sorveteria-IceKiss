// employeeManagement.js - Gerencia as operações relacionadas aos funcionários

import { dom } from './domRefs.js'; // Importa o objeto dom centralizado
import { showToast, showCustomConfirm, formatNameToTitleCase, formatDateTimeToBR } from './utils.js'; // Importa funções utilitárias
import { employees, db, productionSettings as globalProductionSettings, currentUser } from './app.js'; // Importa a variável global 'employees' e 'db' do app.js
// NOVO: Importa funções do Firestore para salvar as configurações
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { fetchEmployees, addEmployee as firebaseAddEmployee, editEmployee as firebaseEditEmployee, deleteEmployee as firebaseDeleteEmployee, resetEmployeePassword as firebaseResetEmployeePassword } from './firebaseService.js'; // Importa funções de serviço Firebase

// Função para carregar os funcionários do Firebase e atualizar a lista global
export async function loadEmployees() {
    console.log("employeeManagement: Carregando funcionários...");
    try {
        const fetchedEmployees = await fetchEmployees();
        // Atualiza a referência global 'employees' no app.js
        employees.splice(0, employees.length, ...fetchedEmployees); // Limpa e adiciona novos funcionários
        console.log("employeeManagement: Funcionários carregados e atualizados:", employees);
    } catch (error) {
        console.error("employeeManagement: Erro ao carregar funcionários:", error);
        showToast("Erro ao carregar lista de funcionários.", "error");
    }
}

// Função para popular o seletor de funcionários no cabeçalho do PDV
export function populatePdvEmployeeSwitcher() {
    console.log("populatePdvEmployeeSwitcher: Populando seletor de funcionários no PDV.");
    if (!dom.employeeSwitcherSelect) {
        console.error("populatePdvEmployeeSwitcher: Elemento dom.employeeSwitcherSelect não encontrado.");
        return;
    }
    dom.employeeSwitcherSelect.innerHTML = ''; // Limpa o seletor
    employees.forEach(employee => {
        const option = document.createElement('option');
        option.value = employee.name;
        option.textContent = employee.name;
        dom.employeeSwitcherSelect.appendChild(option);
    });
    // A seleção do funcionário logado será feita no app.js::startApp
    console.log("populatePdvEmployeeSwitcher: Seletor de funcionários do PDV populado.");
}

// Função para popular o seletor de funcionários na tela de login
export function populateLoginEmployeeSelect() {
    console.log("populateLoginEmployeeSelect: Populando seletor de funcionários na tela de login.");
    if (!dom.employeeUserSelect) {
        console.error("populateLoginEmployeeSelect: Elemento dom.employeeUserSelect não encontrado.");
        return;
    }
    // Limpa o seletor e adiciona a opção padrão
    dom.employeeUserSelect.innerHTML = '<option value="">-- Selecione seu nome --</option>';
    employees.forEach(employee => {
        const option = document.createElement('option');
        option.value = employee.name;
        option.textContent = employee.name;
        dom.employeeUserSelect.appendChild(option);
    });
    console.log("populateLoginEmployeeSelect: Seletor de login de funcionário populado.");
}

// Função para adicionar um novo funcionário
export async function addEmployee(name, role) {
    if (!name || name.trim() === '') {
        showToast("O nome do funcionário não pode ser vazio.", "error");
        return;
    }
    if (!role) {
        showToast("Selecione um cargo para o funcionário.", "error");
        return;
    }
    const formattedName = formatNameToTitleCase(name);
    const confirmAdd = await showCustomConfirm("Adicionar Funcionário", `Adicionar "${formattedName}" com o cargo de "${role}"? A senha inicial será "123".`);
    if (!confirmAdd) return;

    try {
        const newEmployee = await firebaseAddEmployee(formattedName, role); // Chama a função de serviço Firebase
        if (newEmployee) {
            await loadEmployees(); // Recarrega a lista de funcionários do banco
            renderEmployeesManagerTab(); // Atualiza a tabela no painel
            populatePdvEmployeeSwitcher(); // Atualiza o seletor do PDV
            if (dom.manager.newEmployeeNameInput) dom.manager.newEmployeeNameInput.value = ''; // Limpa o input
        }
    } catch (error) {
        console.error("employeeManagement: Erro ao adicionar funcionário:", error);
        // showToast já é chamado dentro do serviço
    }
}

// Função para editar um funcionário
export async function editEmployee(employeeId, newName, newRole) {
    if (!newName || newName.trim() === '') {
        showToast("O nome do funcionário não pode ser vazio.", "error");
        return;
    }
    const formattedName = formatNameToTitleCase(newName);
    const confirmEdit = await showCustomConfirm("Editar Funcionário", `Deseja alterar os dados do funcionário?`);
    if (!confirmEdit) return;

    try {
        await firebaseEditEmployee(employeeId, formattedName, newRole); // Chama a função de serviço Firebase
        await loadEmployees();
        renderEmployeesManagerTab(); // Atualiza a tabela no painel
        populatePdvEmployeeSwitcher(); // Atualiza o seletor do PDV
    } catch (error) {
        console.error("employeeManagement: Erro ao editar funcionário:", error);
        // showToast já é chamado dentro do serviço
    }
}

// Função para resetar a senha de um funcionário
export async function resetEmployeePassword(employeeId, employeeName) {
    const confirmReset = await showCustomConfirm("Resetar Senha", `Tem certeza que deseja resetar a senha de "${employeeName}" para "123"?`);
    if (!confirmReset) return;

    try {
        await firebaseResetEmployeePassword(employeeId, employeeName);
    } catch (error) {
        console.error("employeeManagement: Erro ao resetar senha:", error);
    }
}

// Função para deletar um funcionário
export async function deleteEmployee(employeeId, employeeName) {
    const confirmDelete = await showCustomConfirm("Excluir Funcionário", `Tem certeza que deseja excluir o funcionário "${employeeName}"? Esta ação é irreversível.`);
    if (!confirmDelete) return;

    try {
        await firebaseDeleteEmployee(employeeId, employeeName); // Chama a função de serviço Firebase
        await loadEmployees();
        renderEmployeesManagerTab(); // Atualiza a tabela no painel
        populatePdvEmployeeSwitcher(); // Atualiza o seletor do PDV
    } catch (error) {
        console.error("employeeManagement: Erro ao excluir funcionário:", error);
        // showToast já é chamado dentro do serviço
    }
}

// Função para carregar e exibir a lista de funcionários na aba "Equipe" do gerente
export function renderEmployeesManagerTab(allOrders = []) {
    console.log("renderEmployeesManagerTab: Carregando lista de funcionários para o painel de gerência.");
    if (!dom.manager || !dom.manager.employeeListTableBody) {
        console.error("renderEmployeesManagerTab: Elemento dom.manager.employeeListTableBody não encontrado.");
        return;
    }

    // Cria um mapa para armazenar a data da última atividade (pedido) de cada funcionário
    const lastActivityMap = new Map();
    if (allOrders.length > 0) {
        allOrders.forEach(order => {
            const employeeName = order.createdBy?.name;
            if (employeeName) {
                const orderDate = order.createdAt.toDate();
                // Se o funcionário não está no mapa ou a data do pedido atual é mais recente, atualiza o mapa
                if (!lastActivityMap.has(employeeName) || orderDate > lastActivityMap.get(employeeName)) {
                    lastActivityMap.set(employeeName, orderDate);
                }
            }
        });
    }
    console.log("renderEmployeesManagerTab: Mapa de última atividade criado:", lastActivityMap);

    dom.manager.employeeListTableBody.innerHTML = ''; // Limpa a tabela
    employees.forEach(employee => {
        dom.manager.employeeListTableBody.appendChild(createEmployeeRow(employee, lastActivityMap));
    });
    if (employees.length === 0) {
        const row = dom.manager.employeeListTableBody.insertRow();
        row.innerHTML = `<td colspan="4" class="py-2 px-3 text-center text-gray-500">Nenhum funcionário cadastrado.</td>`;
    }
    console.log("renderEmployeesManagerTab: Lista de funcionários renderizada.");
}

// Função auxiliar para criar uma linha de funcionário na tabela
function createEmployeeRow(employee, lastActivityMap) {
    const row = document.createElement('tr');
    row.className = 'border-b hover:bg-gray-50';
    row.dataset.employeeId = employee.id;
    const roleMap = { 'caixa': 'Caixa', 'estoquista': 'Estoquista', 'gerente': 'Gerente' };
    const roleText = roleMap[employee.role] || employee.role;

    // Determina a data da atividade mais recente, comparando o último login com o último pedido
    const lastLoginDate = employee.lastLogin ? employee.lastLogin.toDate() : null;
    const lastOrderDate = lastActivityMap.get(employee.name);

    const mostRecentActivityDate = (lastLoginDate && lastOrderDate) ? (lastLoginDate > lastOrderDate ? lastLoginDate : lastOrderDate) : (lastLoginDate || lastOrderDate);
    const lastActivityText = mostRecentActivityDate ? formatDateTimeToBR(mostRecentActivityDate) : 'Nunca';

    // Lógica de permissão para botões de ação
    const isMestra = currentUser.role === 'mestra';
    const isGerente = currentUser.role === 'gerente';

    // Um gerente só pode editar a si mesmo ou a funcionários de cargo inferior. Não pode editar outro gerente.
    const canEdit = isMestra || (isGerente && (employee.role !== 'gerente' || employee.id === currentUser.id));

    const editBtnHtml = canEdit ? `
        <button class="text-blue-500 hover:text-blue-700 edit-employee-btn" data-employee-id="${employee.id}" data-employee-name="${employee.name}" data-employee-role="${employee.role}" title="Editar Funcionário">
            <i class="fas fa-edit"></i>
        </button>` : '';

    // Mestra pode resetar qualquer senha. Gerente pode resetar a própria senha ou de cargos inferiores, mas não de outro gerente.
    const canReset = isMestra || (isGerente && (employee.role !== 'gerente' || employee.id === currentUser.id));
    const resetBtnHtml = canReset ? `
        <button class="text-blue-600 hover:text-blue-800 p-2 reset-password-btn" data-employee-id="${employee.id}" data-employee-name="${employee.name}" title="Redefinir Senha para '1234'">
            <i class="fas fa-key"></i>
        </button>` : '';

    // Mestra pode deletar qualquer um. Gerente pode deletar qualquer um, exceto a si mesmo e a Mestra.
    const canDelete = isMestra || (isGerente && employee.role !== 'mestra' && employee.id !== currentUser.id);
    const deleteBtnHtml = canDelete ? `
        <button class="text-red-500 hover:text-red-700 delete-employee-btn" data-employee-id="${employee.id}" data-employee-name="${employee.name}" title="Excluir Funcionário">
            <i class="fas fa-trash"></i>
        </button>` : '';

    row.innerHTML = `
        <td class="py-2 px-3 font-semibold">${employee.name}</td>
        <td class="py-2 px-3">${roleText}</td>
        <td class="py-2 px-3 text-xs text-gray-500">${lastActivityText}</td>
        <td class="py-2 px-3 text-center space-x-4">
            ${editBtnHtml}
            ${resetBtnHtml}
            ${deleteBtnHtml}
        </td>
    `;
    return row;
}

// NOVA FUNÇÃO: Salva as configurações de produção no Firebase
export async function saveProductionSettings(limit, windowMinutes) {
    console.log("saveProductionSettings: Salvando configurações de produção...", { limit, windowMinutes });
    if (isNaN(limit) || isNaN(windowMinutes) || limit <= 0 || windowMinutes <= 0) {
        showToast("Valores inválidos para limite ou janela de tempo.", "error");
        return;
    }

    const settings = {
        limit: Number(limit),
        windowMinutes: Number(windowMinutes)
    };

    try {
        const prodConfigRef = doc(db, "config", "producao");
        await setDoc(prodConfigRef, settings);
        
        // Atualiza a variável global para refletir a mudança imediatamente, sem recarregar tudo
        if (globalProductionSettings) {
            Object.assign(globalProductionSettings, settings);
        }

        showToast("Configurações de produção salvas com sucesso!", "success");

    } catch (error) {
        console.error("Erro ao salvar configurações de produção:", error);
        showToast("Falha ao salvar configurações de produção.", "error");
    }
}
