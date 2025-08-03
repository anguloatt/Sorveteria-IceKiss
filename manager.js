// manager.js - Lógica e funcionalidades do Painel Gerencial

import { loadOrderIntoForm } from './pdv.js'; // NOVO: Importa função para carregar pedido no PDV
import { dom } from './domRefs.js'; // Importa o objeto dom centralizado
import { 
    showToast, showCustomConfirm, formatCurrency, parseCurrency,
    getTodayDateString, formatDateToBR, formatDateTimeToBR, getProductInfoById,
    generateTicketText,
    getSalgadosCountFromItems, formatInputAsCurrency
} from './utils.js'; // Importa funções utilitárias
import { 
    db, currentUser, productsConfig, storeSettings, charts,
    managerCredentials, masterCredentials, productionSettings
} from './app.js'; // Importa variáveis globais do app.js
import {
    // Funções importadas de firebaseService.js - NÃO DEVEM SER REDECLARADAS AQUI
    fetchAllOrders, reactivateOrder, releaseOrderForEdit, fetchClients,
    saveTicketSettings as firebaseSaveTicketSettings, serverTimestamp,
    saveSystemSettings as firebaseSaveSystemSettings, saveManagerPassword as firebaseSaveManagerPassword, 
    updateProductStock, // Importado
    clearDatabase as firebaseClearDatabase, 
    fetchTeamActivityLogs, // Importado
    fetchTeamActivityOrders, // Importado
    fetchAllProductsWithStock, // Importado,
    fetchExpiredPendingOrders, // NOVO: Para buscar alertas
    updateOrderAlertStatus, // NOVO: Para arquivar/resolver alertas
    resolveExpiredOrder, // NOVO: Para liquidar alertas
    fetchStockLogs, // Importado
    getMonthlyProfitMargin, // Importado para o relatório de margem
    fetchProductPriceHistory, // Importado para o histórico de preços
} from './firebaseService.js'; // Importa funções de serviço Firebase
// CORREÇÃO: Importar mais funções do Firestore para salvar o cardápio
import { doc, getDoc, writeBatch, collection, query, where, getDocs, increment, deleteDoc, updateDoc as firestoreUpdateDoc } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { loadEmployees, renderEmployeesManagerTab, addEmployee as employeeManagementAddEmployee, editEmployee as employeeManagementEditEmployee, deleteEmployee as employeeManagementDeleteEmployee, resetEmployeePassword, saveProductionSettings } from './employeeManagement.js'; // Importa funções de gerenciamento de funcionários

// NOVO: Importa o serviço de IA e a biblioteca para renderizar Markdown
import { generateFinancialAnalysis } from './aiService.js';
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";

// Importa funções de gráficos do novo módulo charts.js
import { createOrUpdatePieChart, renderMainSalesChart, createOrUpdateLineChart, createOrUpdateBarChart } from './charts.js';

// Variáveis locais para o módulo do gerente
let allManagerOrders = []; // Armazena todos os pedidos para a tabela de gestão de pedidos
let stockLogs = []; // Armazena os logs de estoque para a view de histórico
let allClients = []; // Armazena a lista de clientes para a view de clientes
let managerAlerts = []; // NOVO: Armazena os alertas para a view do gerente

// NOVO: Variável para armazenar horários adicionados manualmente por data
// A chave será a data (YYYY-MM-DD) e o valor será um Set de horários (HH:MM)
let manuallyAddedTimeSlotsByDate = new Map();
let currentSelectedDeliveryDate = ''; // Para rastrear a data atualmente selecionada no PDV

// Função para exibir o modal de histórico de preços
async function showPriceHistoryModal(productId, productName) {
    console.log(`showPriceHistoryModal: Abrindo histórico para o produto: ${productName}`);
    if (!dom.priceHistoryModal.modal || !dom.priceHistoryModal.productName || !dom.priceHistoryModal.tableBody || !dom.priceHistoryModal.closeBtn) {
        console.error("Elementos do modal de histórico de preços não encontrados.");
        return;
    }
    dom.priceHistoryModal.productName.textContent = productName;
    dom.priceHistoryModal.tableBody.innerHTML = '<tr><td colspan="4" class="text-center p-4">Carregando histórico...</td></tr>';
    
    try {
        const history = await fetchProductPriceHistory(productId);
        if (history.length === 0) {
            dom.priceHistoryModal.tableBody.innerHTML = '<tr><td colspan="4" class="text-center p-4">Nenhum histórico encontrado.</td></tr>';
        } else {
            dom.priceHistoryModal.tableBody.innerHTML = history.map(h => {
                const newPrice = formatCurrency(h.newPrice);
                const oldPrice = h.oldPrice ? formatCurrency(h.oldPrice) : '---';
                const newCost = formatCurrency(h.newCost);
                const oldCost = h.oldCost ? formatCurrency(h.oldCost) : '---';
                const timestamp = formatDateTimeToBR(h.timestamp);
                const changedBy = h.changedBy || 'N/A';
                return `
                    <tr class="border-b">
                        <td class="py-2 px-3">${timestamp}</td>
                        <td class="py-2 px-3 text-right font-semibold">${oldPrice} &rarr; ${newPrice}</td>
                        <td class="py-2 px-3 text-right font-semibold">${oldCost} &rarr; ${newCost}</td>
                        <td class="py-2 px-3">${changedBy}</td>
                    </tr>
                `;
            }).join('');
        }
    } catch (error) {
        console.error("Erro ao buscar histórico de preços:", error);
        dom.priceHistoryModal.tableBody.innerHTML = '<tr><td colspan="4" class="text-center p-4 text-red-500">Erro ao carregar histórico.</td></tr>';
    }

    dom.priceHistoryModal.modal.classList.add('active');
    dom.priceHistoryModal.closeBtn.addEventListener('click', () => {
        dom.priceHistoryModal.modal.classList.remove('active');
    }, { once: true });
}

// NOVA FUNÇÃO: Aplica permissões de visualização com base no cargo do usuário
export function applyRolePermissions(user) {
    console.log(`applyRolePermissions: Aplicando permissões para o cargo: ${user.role}`);

    // Define as views permitidas para cada cargo de funcionário
    const permissions = {
        estoquista: ['dashboard', 'estoque', 'impressao'],
        gerente: ['dashboard', 'pedidos', 'relatorios', 'estoque', 'cardapio', 'clientes', 'equipe', 'impressao', 'sistema', 'log-atividades'],
        mestra: ['dashboard', 'pedidos', 'relatorios', 'estoque', 'cardapio', 'clientes', 'equipe', 'impressao', 'sistema', 'log-atividades', 'master-reset']
    };

    const userPermissions = permissions[user.role];

    // Se não for um cargo com permissões definidas, esconde tudo por segurança, exceto o logout.
    if (!userPermissions) {
        dom.manager.sidebar.querySelectorAll('.sidebar-link').forEach(link => {
            if (link.id !== 'manager-logout-btn') link.style.display = 'none';
        });
        if (dom.manager.goToPdvBtn) dom.manager.goToPdvBtn.style.display = 'none';
        console.warn(`applyRolePermissions: Nenhuma permissão definida para o cargo '${user.role}'. Acesso negado.`);
        return;
    }

    // Aplica permissões para os cargos definidos (estoquista, gerente)
    dom.manager.sidebar.querySelectorAll('.sidebar-link').forEach(link => {
        const view = link.dataset.view;
        link.style.display = userPermissions.includes(view) || link.id === 'manager-logout-btn' ? 'flex' : 'none';
    });

    // Mostra ou esconde o botão "Ir para PDV" com base no cargo
    if (dom.manager.goToPdvBtn) {
        dom.manager.goToPdvBtn.style.display = user.role === 'gerente' || user.role === 'mestra' ? 'block' : 'none';
    }

    // A área de risco é visível apenas para o 'mestra'
    if (dom.manager.riskZone) {
        dom.manager.riskZone.style.display = user.role === 'mestra' ? 'block' : 'none';
    }

    console.log(`applyRolePermissions: Permissões para '${user.role}' aplicadas.`);
}


/**
 * NOVO: Aciona a animação do sino de notificação.
 * Esta função é exportada para ser chamada pelo listener de notificações no app.js.
 */
export function triggerNotificationAnimation() {
    const bellBtn = dom.notifications.bellBtn;
    if (!bellBtn) return;

    bellBtn.classList.add('animate-shake');

    // Remove a classe após a animação terminar para que possa ser acionada novamente
    setTimeout(() => {
        bellBtn.classList.remove('animate-shake');
    }, 1000); // Duração um pouco maior que a animação para garantir
}

// Navega para uma view específica no painel do gerente
export async function navigateToManagerView(view) {
    console.log("navigateToManagerView: Navegando para a view:", view);
    if (!dom.manager || !dom.manager.sidebar) {
        console.error("Elementos da sidebar do gerente não encontrados.");
        return;
    }
    dom.manager.sidebar.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
    const link = dom.manager.sidebar.querySelector(`[data-view="${view}"]`);
    if(link) link.classList.add('active');

    document.querySelectorAll('#manager-main-content > div').forEach(v => {
        v.classList.add('hidden');
        v.style.display = 'none';
    });

    const viewEl = document.getElementById(`view-${view}`);
    if(viewEl) {
        viewEl.classList.remove('hidden');
        viewEl.style.display = '';
    } else {
        console.error(`View element with ID 'view-${view}' not found.`);
    }

    const titles = {
        dashboard: { title: "Data Board", subtitle: "Análise completa do seu negócio em tempo real." },
        pedidos: { title: "Gestão de Pedidos", subtitle: "Visualize e gerencie todos os pedidos." },
        relatorios: { title: "Análise Detalhada", subtitle: "Explore o desempenho de vendas e produtos." },
        estoque: { title: "Controle de Estoque", subtitle: "Adicione novas quantidades e visualize o estoque atual." },
        cardapio: { title: "Gestão de Cardápio", subtitle: "Adicione, edite e defina preços dos produtos." },
        clientes: { title: "Base de Clientes", subtitle: "Gerencie seus clientes e o relacionamento." },
        equipe: { title: "Desempenho da Equipe", subtitle: "Acompanhe a produtividade e os registros da equipe." },
        impressao: { title: "Configurações de Impressão", subtitle: "Personalize o cabeçalho e rodapé dos tickets." },
        sistema: { title: "Configurações do Sistema", subtitle: "Gerencie a segurança e os dados do aplicativo." },
        'master-reset': { title: "Acesso Mestra", subtitle: "Redefina a senha do usuário gerencial."}
    };
    if(dom.manager && dom.manager.pageTitle && dom.manager.pageSubtitle && titles[view]) {
        dom.manager.pageTitle.textContent = titles[view].title;
        dom.manager.pageSubtitle.textContent = titles[view].subtitle;
    }

    // Ações específicas ao navegar para uma view
    if (view === 'dashboard') updateDashboard();
    if (view === 'pedidos') loadAllOrders();
    if (view === 'relatorios') {
        switchManagerReportTab('rel-financeiro');
    }
    if (view === 'estoque') {
        // Ao navegar para a view de estoque, sempre começa na aba de reposição
        switchStockTab('repo');
    }
    if (view === 'cardapio') {
        console.log("navigateToManagerView (cardapio): productsConfig ANTES de loadManagerCardapio:", productsConfig);
        switchManagerCardapioTab('assados');
        loadAndRenderManagerAlerts(); // NOVO: Atualiza o contador de alertas ao navegar
    }
    if (view === 'clientes') loadClients();
    if (view === 'equipe') { // MODIFICADO: Carrega os pedidos para obter a última atividade
        console.log("navigateToManagerView: Navegando para a view 'equipe'.");
        if (dom.manager && dom.manager.equipeMonthPicker) {
            dom.manager.equipeMonthPicker.value = getTodayDateString('yyyy-mm-dd').substring(0, 7);
        }
        switchTeamReportTab('equipe-diario');
        // Carrega todos os pedidos para que a última atividade de cada funcionário possa ser determinada
        const allOrders = await fetchAllOrders();
        renderEmployeesManagerTab(allOrders); // Passa os pedidos para a função de renderização
    }
    if (view === 'impressao') loadTicketSettings();
    if (view === 'sistema') loadSystemSettings();
    if (view === 'alertas') loadAndRenderManagerAlerts(); // NOVO: Carrega os alertas ao entrar na view

    // Fecha a sidebar em mobile após a navegação
    if (window.innerWidth < 1024 && dom.manager && dom.manager.sidebar && dom.manager.sidebar.classList.contains('open')) {
        toggleManagerSidebar();
    }
}

// Configura os event listeners específicos do painel do gerente
export function setupManagerDashboardListeners() {
    console.log("setupManagerDashboardListeners: Configurando listeners de eventos do painel do gerente.");

    // AÇÃO CORRETIVA: Adiciona uma verificação de segurança para o elemento 'dashPedidosMes'.
    // Se o elemento não foi encontrado pelo domRefs.js, esta linha tenta recuperá-lo diretamente.
    // Isso torna o código mais robusto contra possíveis falhas no carregamento inicial das referências.
    if (dom.manager && !dom.manager.dashPedidosMes) {
        console.warn("manager.js: A referência para 'dashPedidosMes' não foi encontrada. Tentando buscar diretamente no DOM para corrigir.");
        dom.manager.dashPedidosMes = document.getElementById('dash-pedidos-mes');
    }

    const essentialManagerElements = [
        dom.manager.sidebar, dom.manager.menuBtn, dom.manager.overlay,
        dom.manager.saveNewPassBtn, dom.manager.saveProductsBtn, dom.manager.addProductBtn,
        dom.manager.managerProductsList, dom.manager.saveTicketBtn,
        dom.manager.saveNewPassSystemBtn, dom.manager.clearDataConfirmInput, dom.manager.clearDataBtn,
        dom.manager.goToPdvBtn, dom.manager.filterSearchAll, dom.manager.clearFiltersBtn,
        dom.manager.tabRelFinanceiro, dom.manager.tabRelProdutos, dom.manager.tabRelMargem,
        dom.manager.tabCardapioAssadosManager,
        dom.manager.tabCardapioFritosManager, dom.manager.tabCardapioRevendaManager,
        dom.manager.tabCardapioOutrosManager,
        dom.manager.tabEquipeDiario, dom.manager.tabEquipeMensal, dom.whatsapp.cancelBtn,
        dom.whatsapp.sendBtn, dom.manager.selectAllClientsCheckbox, dom.manager.clientsTableBody,
        dom.manager.sendGroupWhatsappBtn, dom.manager.teamMemberDetailCloseBtn, dom.manager.storeNameInput,
        dom.manager.storePhoneInput, dom.manager.footerMsgInput, dom.manager.printUnitPriceCheckbox,
        dom.manager.equipeMonthPicker,
        dom.manager.whatsappGroupMessage,
        dom.manager.newEmployeeNameInput,
        dom.manager.addEmployeeBtn,
        dom.manager.employeeListTableBody,
        dom.manager.changePassNew,
        dom.manager.changePassConfirm,
        // Elementos de Estoque
        dom.manager.stockManagementTableBody,
        dom.manager.tabStockRepo,
        dom.manager.tabStockHistory,
        dom.manager.contentStockRepo,
        dom.manager.contentStockHistory,
        dom.manager.stockHistoryTableBody,
        dom.manager.stockHistoryFilter,
        dom.manager.dashLowStockCard,
        dom.manager.dashPedidosMes
    ];

    // NOVO: Adiciona os elementos da IA à verificação
    if (dom.manager.aiAnalysis) {
        essentialManagerElements.push(dom.manager.aiAnalysis.generateBtn);
    }
    // NOVO: Adiciona os elementos das configs do sistema
    essentialManagerElements.push(dom.manager.monthlyGoalInput);
    essentialManagerElements.push(dom.manager.saveGoalBtn);
    // NOVO: Adiciona os elementos da tela de alertas
    essentialManagerElements.push(document.getElementById('manager-alerts-table-body'));

    const allManagerElementsFound = essentialManagerElements.every(el => el !== null && el !== undefined);

    if (!allManagerElementsFound) {
        console.error("setupManagerDashboardListeners: Um ou mais elementos DOM essenciais do Painel Gerencial não foram encontrados. Event listeners não serão configurados.");
        essentialManagerElements.forEach(el => {
            if (el === null || el === undefined) {
                console.error(`Elemento Gerencial essencial não encontrado: dom.manager.${Object.keys(dom.manager).find(key => dom.manager[key] === el) || 'N/A (pode ser sub-propriedade)'}`);
            }
        });
        return;
    }

    dom.manager.sidebar.addEventListener('click', async (e) => {
        const link = e.target.closest('.sidebar-link');
        if (!link) return;
        e.preventDefault();
        if(link.id === 'manager-logout-btn') {
            window.location.reload();
            return;
        }
        const view = link.dataset.view;
        await navigateToManagerView(view);
    });

    dom.manager.menuBtn.addEventListener('click', toggleManagerSidebar);
    dom.manager.overlay.addEventListener('click', toggleManagerSidebar);

    dom.manager.saveNewPassBtn.addEventListener('click', async () => {
        const newPass = dom.manager.newManagerPassInput.value;
        if(newPass.length < 4) { return showToast("A nova senha deve ter pelo menos 4 caracteres.", "error"); }
        try {
            await firebaseSaveManagerPassword(newPass);
            setTimeout(() => window.location.reload(), 2000);
        }
        catch (error) { console.error("Erro ao salvar nova senha:", error); showToast("Falha ao salvar a nova senha.", "error"); }
    });

    dom.manager.saveProductsBtn.addEventListener('click', saveManagerConfig);
    dom.manager.addProductBtn.addEventListener('click', () => {
        const activeTab = document.querySelector('.manager-cardapio-tab.active-tab-manager');
        if (activeTab) {
            const category = activeTab.dataset.category;
            dom.manager.managerProductsList.appendChild(createProductConfigRow({ id: "prod_" + Date.now(), name: "", price: 0, category: category }, category));
        }
    });

    // NOVO: Listener para salvar as configurações de produção
    const saveProdSettingsBtn = document.getElementById('manager-save-overload-btn');
    if (saveProdSettingsBtn) {
        saveProdSettingsBtn.addEventListener('click', () => {
            const limitInput = document.getElementById('overload-limit-input');
            const windowInput = document.getElementById('overload-window-input');
            const limit = limitInput.value;
            const windowMinutes = windowInput.value;
            saveProductionSettings(limit, windowMinutes);
        });
    }

    dom.manager.managerProductsList.addEventListener('click', e => {
        const removeBtn = e.target.closest(".remove-product-btn");
        if (removeBtn) {
            removeBtn.closest(".product-config-row-wrapper").remove(); // CORREÇÃO: Remove o wrapper
            return; // Evita que o listener continue
        }

        const historyBtn = e.target.closest(".price-history-btn");
        if (historyBtn) {
            const productId = historyBtn.dataset.productId;
            const productName = historyBtn.dataset.productName;
            showPriceHistoryModal(productId, productName);
        }
    });

    dom.manager.saveTicketBtn.addEventListener('click', saveTicketSettings);
    dom.manager.saveGoalBtn.addEventListener('click', saveSystemSettings);

    // NOVO: Listener para salvar a nova senha da gerência a partir da tela "Sistema"
    dom.manager.saveNewPassSystemBtn.addEventListener('click', async () => {
        const newPass = dom.manager.changePassNew.value;
        const confirmPass = dom.manager.changePassConfirm.value;

        if (newPass.length < 4) {
            return showToast("A nova senha deve ter pelo menos 4 caracteres.", "error");
        }
        if (newPass !== confirmPass) {
            return showToast("As senhas não coincidem.", "error");
        }

        await firebaseSaveManagerPassword(newPass);
        // Limpa os campos após salvar com sucesso
        dom.manager.changePassNew.value = '';
        dom.manager.changePassConfirm.value = '';
    });

    // NOVO: Adiciona a verificação de senha para a função clearDatabase
    dom.manager.clearDataBtn.addEventListener('click', async () => {
        const confirmText = dom.manager.clearDataConfirmInput.value;
        if (confirmText !== 'APAGAR TUDO') {
            showToast("Digite 'APAGAR TUDO' para confirmar.", "error");
            return;
        }

        const confirmed = await showCustomConfirm(
            "Confirmação de Segurança",
            "Para limpar o banco de dados, você deve confirmar sua senha de gerência.",
            { showInput: true, passwordRequired: true } // Exige input e validação de senha
        );

        if (confirmed) {
            firebaseClearDatabase(); // Chama a função de limpeza se a senha for confirmada
        } else {
            showToast("Operação cancelada.", "info");
        }
    });

    dom.manager.clearDataConfirmInput.addEventListener('input', () => {
        dom.manager.clearDataBtn.disabled = dom.manager.clearDataConfirmInput.value !== 'APAGAR TUDO';
    });

    dom.manager.goToPdvBtn.addEventListener('click', goToPdv);

    dom.manager.filterSearchAll.addEventListener('input', filterManagerOrdersTable);
    dom.manager.clearFiltersBtn.addEventListener('click', () => {
        dom.manager.filterSearchAll.value = '';
        filterManagerOrdersTable();
    });

    dom.manager.tabRelFinanceiro.addEventListener('click', () => switchManagerReportTab('rel-financeiro'));
    dom.manager.tabRelProdutos.addEventListener('click', () => switchManagerReportTab('rel-produtos'));
    dom.manager.tabRelMargem.addEventListener('click', () => switchManagerReportTab('rel-margem'));

    dom.manager.tabCardapioAssadosManager.addEventListener('click', () => switchManagerCardapioTab('assados'));
    dom.manager.tabCardapioFritosManager.addEventListener('click', () => switchManagerCardapioTab('fritos'));
    dom.manager.tabCardapioRevendaManager.addEventListener('click', () => switchManagerCardapioTab('revenda'));
    dom.manager.tabCardapioOutrosManager.addEventListener('click', () => switchManagerCardapioTab('outros'));

    dom.manager.tabEquipeDiario.addEventListener('click', () => switchTeamReportTab('equipe-diario'));
    dom.manager.tabEquipeMensal.addEventListener('click', () => switchTeamReportTab('equipe-mensal'));
    dom.manager.equipeMonthPicker.addEventListener('change', loadTeamMonthlyActivity);

    dom.whatsapp.cancelBtn.addEventListener('click', () => dom.whatsapp.modal.classList.remove('active'));
    dom.whatsapp.sendBtn.addEventListener('click', handleSendWhatsapp);

    dom.manager.selectAllClientsCheckbox.addEventListener('change', (e) => {
        document.querySelectorAll('.client-checkbox').forEach(cb => cb.checked = e.target.checked);
        updateGroupWhatsappUI();
    });
    dom.manager.clientsTableBody.addEventListener('change', (e) => {
        if (e.target.classList.contains('client-checkbox')) {
            updateGroupWhatsappUI();
        }
    });
    dom.manager.sendGroupWhatsappBtn.addEventListener('click', sendGroupWhatsapp);
    dom.manager.teamMemberDetailCloseBtn.addEventListener('click', () => dom.manager.teamMemberDetailModal.classList.remove('active'));

    dom.manager.storeNameInput.addEventListener('input', updateTicketPreview);
    dom.manager.storePhoneInput.addEventListener('input', updateTicketPreview);
    dom.manager.ticketTitleInput.addEventListener('input', updateTicketPreview);
    dom.manager.ticketSubtitleInput.addEventListener('input', updateTicketPreview);
    dom.manager.footerMsgInput.addEventListener('input', updateTicketPreview);
    dom.manager.printUnitPriceCheckbox.addEventListener('change', updateTicketPreview);

    if (dom.manager.firebaseAccessBtn) {
        dom.manager.firebaseAccessBtn.addEventListener('click', () => {
            window.open("https://console.firebase.google.com/u/0/project/sorveteria-ice-kiss/overview", "_blank");
        });
    }

    dom.manager.addEmployeeBtn.addEventListener('click', async () => {
        const nameInput = document.getElementById('new-employee-name');
        const roleSelect = document.getElementById('new-employee-role');
        if (nameInput && roleSelect) {
            await employeeManagementAddEmployee(nameInput.value, roleSelect.value);
            // A renderização já é chamada dentro da função addEmployee
        }
    });
    dom.manager.employeeListTableBody.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.edit-employee-btn');
        const deleteBtn = e.target.closest('.delete-employee-btn');
        const resetBtn = e.target.closest('.reset-password-btn');

        if (editBtn) {
            const { employeeId, employeeName } = editBtn.dataset;
            const newName = prompt(`Editar nome do funcionário:`, employeeName);
            const newRole = prompt(`Editar cargo (caixa, estoquista, gerente):`, editBtn.dataset.employeeRole); // Pega o cargo atual
            if ((newName && newName.trim() !== employeeName) || (newRole && newRole.trim() !== editBtn.dataset.employeeRole)) {
                await employeeManagementEditEmployee(employeeId, newName || employeeName, newRole || editBtn.dataset.employeeRole);
            } else if (newName !== null || newRole !== null) {
                showToast("Nenhuma alteração detectada.", "info");
            }
        } else if (resetBtn) {
            const { employeeId, employeeName } = resetBtn.dataset;
            await resetEmployeePassword(employeeId, employeeName);
        } else if (deleteBtn) {
            const { employeeId, employeeName } = deleteBtn.dataset;
            await employeeManagementDeleteEmployee(employeeId, employeeName);
        }
    });

    if (dom.manager.stockManagementTableBody) {
        dom.manager.stockManagementTableBody.addEventListener('click', async (e) => {
            if (e.target.classList.contains('save-stock-btn')) {
                const row = e.target.closest('tr');
                const productId = row.dataset.productId;
                const input = row.querySelector('.stock-add-input');
                const quantityToAdd = parseInt(input.value, 10);

                if (isNaN(quantityToAdd) || quantityToAdd <= 0) {
                    showToast("Por favor, insira uma quantidade válida para adicionar.", "error");
                    return;
                }

                e.target.disabled = true;
                e.target.textContent = 'Salvando...';

                try {
                    await updateProductStock(productId, quantityToAdd, 'Reposição Manual');
                    showToast("Estoque atualizado com sucesso!", "success");
                    loadStockManagementView(); // Recarrega a view para mostrar o novo estoque
                } catch (error) {
                    showToast("Falha ao atualizar o estoque.", "error");
                    console.error("Erro ao salvar estoque:", error);
                    e.target.disabled = false;
                    e.target.textContent = 'Adicionar';
                }
            }
        });
    }

    if (dom.manager && dom.manager.detailCloseBtn) dom.manager.detailCloseBtn.addEventListener('click', () => dom.manager.orderDetailModal.classList.remove('active'));
    if (dom.manager && dom.manager.monthlyGoalInput) dom.manager.monthlyGoalInput.addEventListener('blur', (e) => formatInputAsCurrency(e.target));
    if (dom.manager && dom.manager.whatsappGroupMessage) dom.manager.whatsappGroupMessage.addEventListener('input', updateGroupWhatsappUI);

    // NOVO: Listener para a tabela de alertas do gerente
    const alertsTableBody = document.getElementById('manager-alerts-table-body');
    if (alertsTableBody) {
        alertsTableBody.addEventListener('click', handleManagerAlertAction);
    }

    // Listeners para os botões de ação do modal de detalhes do pedido
    if (dom.manager.detailReactivateBtn) {
        dom.manager.detailReactivateBtn.addEventListener('click', async (e) => {
            const orderId = e.currentTarget.dataset.orderId;
            const confirm = await showCustomConfirm("Reativar Pedido", "Tem certeza que deseja reativar este pedido?");
            if (confirm) {
                try {
                    await reactivateOrder(orderId);
                    dom.manager.orderDetailModal.classList.remove('active');
                    loadAllOrders(); // Recarrega a lista de pedidos
                } catch (error) {
                    console.error("Erro ao reativar pedido:", error);
                }
            }
        });
    }
    if (dom.manager.detailReleaseEditBtn) {
        dom.manager.detailReleaseEditBtn.addEventListener('click', async (e) => {
            const orderId = e.currentTarget.dataset.orderId;
            const confirm = await showCustomConfirm("Liberar Edição", "Tem certeza que deseja liberar este pedido para edição no PDV?");
            if (confirm) {
                try {
                    await releaseOrderForEdit(orderId);
                    dom.manager.orderDetailModal.classList.remove('active');
                    loadAllOrders(); // Recarrega a lista de pedidos
                } catch (error) {
                    console.error("Erro ao liberar edição:", error);
                }
            }
        });
    }

    // Listeners para as abas de estoque
    if (dom.manager.tabStockRepo) {
        dom.manager.tabStockRepo.addEventListener('click', () => switchStockTab('repo'));
    }
    if (dom.manager.tabStockHistory) {
        dom.manager.tabStockHistory.addEventListener('click', () => switchStockTab('history'));
    }
    if (dom.manager.stockHistoryFilter) {
        dom.manager.stockHistoryFilter.addEventListener('change', renderStockHistoryTable);
    }

    // Listener para o botão de gerar análise da IA
    if (dom.manager.aiAnalysis.generateBtn) {
        dom.manager.aiAnalysis.generateBtn.addEventListener('click', handleGenerateAIAnalysis);
    }

    // Novo listener para o campo de meta mensal
    if (dom.manager.monthlyGoalInput) {
        dom.manager.monthlyGoalInput.addEventListener('input', (e) => {
            e.target.value = formatInputAsCurrency(e.target.value);
        });
        dom.manager.monthlyGoalInput.addEventListener('blur', (e) => {
            e.target.value = formatInputAsCurrency(e.target.value, { keepThousands: true, keepCents: true });
        });
    }
}

// Nova função: Alterna a visibilidade da sidebar do gerente e o overlay
function toggleManagerSidebar() {
    console.log("toggleManagerSidebar: Alternando sidebar do gerente.");
    if (!dom.manager || !dom.manager.sidebar || !dom.manager.overlay) {
        console.error("Elementos da sidebar do gerente ou overlay não encontrados.");
        return;
    }
    dom.manager.sidebar.classList.toggle('open');
    dom.manager.overlay.classList.toggle('active');
    document.body.classList.toggle('overflow-hidden', dom.manager.sidebar.classList.contains('open'));
}

// NOVO: Função para lidar com a geração de análise da IA
async function handleGenerateAIAnalysis() {
    const { generateBtn, loader, placeholder, result } = dom.manager.aiAnalysis;

    // Desabilita o botão e mostra o loader
    generateBtn.disabled = true;
    generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Analisando...';
    placeholder.classList.add('hidden');
    result.classList.add('hidden');
    result.innerHTML = ''; // Limpa o resultado anterior
    loader.classList.remove('hidden');
    loader.style.display = 'flex'; // Garante que o flexbox seja aplicado

    try {
        // 1. Coleta os dados do dashboard
        const financialData = {
            faturamentoMensal: dom.manager.dashFaturamentoMes.textContent,
            metaMensal: dom.manager.dashMetaValor.textContent,
            vendidoHoje: dom.manager.dashVendidoHoje.textContent,
            ticketMedio: dom.manager.dashTicketMedio.textContent,
            pedidosHoje: dom.manager.dashPedidosHoje.textContent,
            aReceber: dom.manager.dashAReceber.textContent,
            mostSoldProduct: dom.manager.cardapioMaisVendido.textContent,
            novosClientes: dom.manager.dashNovosClientes.textContent,
        };

        // 2. Chama o serviço da IA
        const analysisText = await generateFinancialAnalysis(financialData);

        // 3. Renderiza o resultado (convertendo Markdown para HTML)
        result.innerHTML = marked.parse(analysisText);
        result.classList.remove('hidden');

    } catch (error) {
        console.error("Erro ao gerar análise da IA:", error);
        result.innerHTML = `<p class="text-red-300">Ocorreu um erro ao gerar a análise. Tente novamente. Detalhes: ${error.message}</p>`;
        result.classList.remove('hidden');
    } finally {
        // Reabilita o botão e esconde o loader
        loader.classList.add('hidden');
        loader.style.display = 'none';
        generateBtn.disabled = false;
        generateBtn.innerHTML = '<i class="fas fa-magic mr-2"></i>Gerar Nova Análise';
    }
}

// Atualiza o dashboard com dados recentes
async function updateDashboard() {
    console.log("updateDashboard: Atualizando dashboard.");
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    startOfDay.setHours(0,0,0,0);
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));
    startOfWeek.setHours(0,0,0,0);
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    startOfMonth.setHours(0,0,0,0);

    console.log(`Dashboard: Data de início do dia: ${startOfDay.toLocaleString()}`);
    console.log(`Dashboard: Data de início da semana: ${startOfWeek.toLocaleString()}`);
    console.log(`Dashboard: Data de início do mês: ${startOfMonth.toLocaleString()}`);

    const allOrders = await fetchAllOrders(); // Busca todos os pedidos via serviço
    console.log(`Dashboard: Total de pedidos carregados: ${allOrders.length}`);

    let vendidoHoje = 0, pedidosHoje = 0, aReceber = 0, faturamentoMensal = 0, pedidosMes = 0;
    let vendasSemana = {};
    const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    weekDays.forEach(day => vendasSemana[day] = 0);

    const allClientsMap = new Map();
    const monthlyNewClients = new Set();
    const allClientsEver = new Set();
    let productSales = {}; // Total de vendas por produto (quantidade)
    let productRevenue = {}; // Total de faturamento por produto
    let productSalesToday = {}; // Vendas de produtos hoje
    let productSalesMonth = {}; // Vendas de produtos no mês

    allOrders.forEach(order => {
        const orderDate = order.createdAt.toDate();
        const clientName = order.customer?.name?.trim().toLowerCase();

        if (clientName) {
            if (!allClientsEver.has(clientName)) {
                allClientsEver.add(clientName);
                allClientsMap.set(clientName, orderDate);
            }
        }

        if (order.status !== 'cancelado') {
            if (orderDate >= startOfDay) {
                vendidoHoje += order.total;
                pedidosHoje++;
            }
            if (order.paymentStatus === 'devedor') {
                aReceber += order.restante;
            }
            if (orderDate >= startOfWeek) {
                const dayOfWeek = orderDate.getDay();
                const displayDay = weekDays[dayOfWeek === 0 ? 6 : dayOfWeek];
                vendasSemana[displayDay] += order.total;
            }
            if (orderDate >= startOfMonth) {
                faturamentoMensal += order.total;
                pedidosMes++;
                if (allClientsMap.get(clientName) && allClientsMap.get(clientName) >= startOfMonth) {
                    monthlyNewClients.add(clientName);
                }
                const allItems = [...(order.items || [])];
                allItems.forEach(item => {
                    const productName = item.isManual ? item.name : getProductInfoById(item.id)?.name; // Usa getProductInfoById
                    if (productName) {
                        productSales[productName] = (productSales[productName] || 0) + item.quantity;
                        productRevenue[productName] = (productRevenue[productName] || 0) + item.subtotal;

                        if (orderDate >= startOfDay) {
                            productSalesToday[productName] = (productSalesToday[productName] || 0) + item.quantity;
                        }
                        if (orderDate >= startOfMonth) {
                            productSalesMonth[productName] = (productSalesMonth[productName] || 0) + item.quantity;
                        }
                    }
                });
            }
        }
    });

    console.log(`Dashboard: Vendido Hoje: ${vendidoHoje}, Pedidos Hoje: ${pedidosHoje}`);
    console.log(`Dashboard: A Receber: ${aReceber}`);
    console.log(`Dashboard: Faturamento Mensal: ${faturamentoMensal}, Pedidos Mês: ${pedidosMes}`);
    console.log(`Dashboard: Vendas Semana:`, vendasSemana);

    const ticketMedio = pedidosHoje > 0 ? vendidoHoje / pedidosHoje : 0;
    const mostSoldProduct = Object.keys(productSales).length > 0 ? Object.entries(productSales).reduce((a, b) => a[1] > b[1] ? a : b)[0] : '--';
    const leastSoldProduct = Object.keys(productSales).length > 0 ? Object.entries(productSales).filter(([, qty]) => qty > 0).reduce((a, b) => a[1] < b[1] ? a : b)[0] : '--';
    const totalQtySoldToday = Object.values(productSalesToday).reduce((sum, qty) => sum + qty, 0);
    const totalQtySoldMonth = Object.values(productSalesMonth).reduce((sum, qty) => sum + qty, 0);

    const pendingOrders = allOrders.filter(o => o.status === 'ativo' || o.status === 'alterado').length;

    if (dom.manager.dashVendidoHoje) { dom.manager.dashVendidoHoje.textContent = formatCurrency(vendidoHoje); }
    if (dom.manager.dashTicketMedio) { dom.manager.dashTicketMedio.textContent = formatCurrency(ticketMedio); }
    if (dom.manager.dashAReceber) { dom.manager.dashAReceber.textContent = formatCurrency(aReceber); }
    if (dom.manager.dashPedidosHoje) { dom.manager.dashPedidosHoje.textContent = pedidosHoje; }
    if (dom.manager.dashNovosClientes) { dom.manager.dashNovosClientes.textContent = monthlyNewClients.size; }
    if (dom.manager.dashTotalClientes) { dom.manager.dashTotalClientes.textContent = allClientsEver.size; }
    if (dom.manager.dashPedidosMes) { dom.manager.dashPedidosMes.textContent = pedidosMes; }
    if (dom.manager.dashFaturamentoMes) { dom.manager.dashFaturamentoMes.textContent = formatCurrency(faturamentoMensal); }
    if (dom.manager.dashPedidosPendentes) { dom.manager.dashPedidosPendentes.textContent = pendingOrders; }

    const monthlyGoal = storeSettings.monthlyGoal || 0;
    const goalProgress = monthlyGoal > 0 ? (faturamentoMensal / monthlyGoal) * 100 : 0;
    const remainingToGoal = monthlyGoal > faturamentoMensal ? monthlyGoal - faturamentoMensal : 0;

    if (dom.manager.dashMetaValor) { dom.manager.dashMetaValor.textContent = formatCurrency(monthlyGoal); }
    if (dom.manager.dashMetaProgresso) { dom.manager.dashMetaProgresso.textContent = `${Math.min(100, goalProgress).toFixed(0)}%`; }
    if (dom.manager.dashMetaProgressbar) { dom.manager.dashMetaProgressbar.style.width = `${Math.min(100, goalProgress)}%`; }
    if (dom.manager.dashMetaRestante) { dom.manager.dashMetaRestante.textContent = formatCurrency(remainingToGoal); }

    const weekSalesArray = Object.entries(vendasSemana).filter(([day]) => day !== 'Dom');
    const totalSemana = weekSalesArray.reduce((acc, [, val]) => acc + val, 0);
    if (dom.manager.dashWeeklyTotal) { dom.manager.dashWeeklyTotal.textContent = formatCurrency(totalSemana); }

    if (weekSalesArray.length > 0 && totalSemana > 0) {
        const dayValues = weekSalesArray.map(d => d[1]);
        const maxSale = Math.max(0, ...dayValues);
        const minSale = dayValues.length > 0 ? Math.min(...dayValues.filter(v => v > 0), Infinity) : 0;
        const bestDayEntry = weekSalesArray.find(d => d[1] === maxSale);
        const worstDayEntry = weekSalesArray.find(d => d[1] === minSale);

        if (dom.manager.dashBestDay && bestDayEntry) {
            dom.manager.dashBestDay.textContent = `${bestDayEntry[0]} - ${formatCurrency(bestDayEntry[1])}`;
        } else if (dom.manager.dashBestDay) {
            dom.manager.dashBestDay.textContent = 'Nenhum dado';
        }
        if (dom.manager.dashWorstDay && worstDayEntry && minSale !== Infinity) {
            dom.manager.dashWorstDay.textContent = `${worstDayEntry[0]} - ${formatCurrency(minSale)}`;
        } else if (dom.manager.dashWorstDay) {
            dom.manager.dashWorstDay.textContent = 'Nenhum dado';
        }
    } else {
        if (dom.manager.dashBestDay) { dom.manager.dashBestDay.textContent = 'Nenhum dado'; }
        if (dom.manager.dashWorstDay) { dom.manager.dashWorstDay.textContent = 'Nenhum dado'; }
    }

    // NOVO: Lógica para o card de estoque baixo
    if (dom.manager.dashLowStockCard) {
        try {
            const allProducts = await fetchAllProductsWithStock();
            const lowStockProducts = allProducts.filter(p => typeof p.stock === 'number' && p.stock <= 5 && p.stock > 0);
            const outOfStockProducts = allProducts.filter(p => typeof p.stock === 'number' && p.stock <= 0);

            const lowStockCount = lowStockProducts.length + outOfStockProducts.length;
            dom.manager.dashLowStockCount.textContent = lowStockCount;

            let listHtml = outOfStockProducts.map(p => `<div class="text-red-700 font-bold">${p.name} (0)</div>`).join('');
            listHtml += lowStockProducts.map(p => `<div class="text-yellow-700">${p.name} (${p.stock})</div>`).join('');

            dom.manager.dashLowStockList.innerHTML = listHtml || '<p class="text-center text-gray-500">Nenhum item com estoque baixo.</p>';

        } catch (error) {
            console.error("Erro ao atualizar card de estoque baixo:", error);
        }
    }

    createOrUpdatePieChart('chart-vendido-hoje', [vendidoHoje, aReceber], ['Vendido', 'A Receber'], ['#22c55e', '#f97316']);
    createOrUpdatePieChart('chart-ticket-medio', [ticketMedio, 50], ['Ticket Médio', 'Meta'], ['#3b82f6', '#e5e7eb']);
    createOrUpdatePieChart('chart-a-receber', [aReceber], ['A Receber'], ['#f97316']);
    createOrUpdatePieChart('chart-pedidos-hoje', [pedidosHoje], ['Pedidos'], ['#8b5cf6']);
    createOrUpdatePieChart('chart-novos-clientes', [monthlyNewClients.size], ['Novos'], ['#14b8a6']);
    createOrUpdatePieChart('chart-total-clientes', [allClientsEver.size], ['Clientes'], ['#0891b2']);
    createOrUpdatePieChart('chart-pedidos-mes', [pedidosMes], ['Pedidos'], ['#be185d']);
    createOrUpdatePieChart('chart-faturamento-mes', [faturamentoMensal], ['Faturamento'], ['#65a30d']);
    createOrUpdatePieChart('chart-pedidos-pendentes', [pendingOrders], ['Pendentes'], ['#d97706']);

    if (dom.manager.cardapioMaisVendido) { dom.manager.cardapioMaisVendido.textContent = mostSoldProduct; }
    if (dom.manager.cardapioMenosVendido) { dom.manager.cardapioMenosVendido.textContent = leastSoldProduct; }
    if (dom.manager.cardapioQtdVendidaHoje) { dom.manager.cardapioQtdVendidaHoje.textContent = totalQtySoldToday; }
    if (dom.manager.cardapioQtdVendidaMes) { dom.manager.cardapioQtdVendidaMes.textContent = totalQtySoldMonth; }

    renderMainSalesChart(vendasSemana);
    console.log("updateDashboard: Dashboard atualizado.");
}

// Carrega e exibe todos os pedidos no painel do gerente
async function loadAllOrders() {
    console.log("loadAllOrders: Carregando todos os pedidos.");
    try {
        allManagerOrders = await fetchAllOrders(); // Busca via serviço Firebase
        renderManagerOrdersTable(allManagerOrders);
        console.log("loadAllOrders: Pedidos carregados com sucesso.");
    } catch (error) {
        console.error("loadAllOrders: Erro ao carregar todos os pedidos:", error);
        showToast("Falha ao carregar pedidos.", "error");
    }
}

// Renderiza a tabela de pedidos do gerente
function renderManagerOrdersTable(ordersToRender) {
    console.log("renderManagerOrdersTable: Renderizando tabela de pedidos.");
    if (!dom.manager || !dom.manager.ordersTableBody) {
        console.error("Elemento dom.manager.ordersTableBody não encontrado.");
        return;
    }
    dom.manager.ordersTableBody.innerHTML = '';
    ordersToRender.forEach(order => {
        const row = dom.manager.ordersTableBody.insertRow();
        row.className = `border-b hover:bg-gray-50 cursor-pointer`;
        row.dataset.orderId = order.id;
        row.innerHTML = `
            <td class="py-2 px-3">${order.orderNumber}</td>
            <td class="py-2 px-3">${formatDateToBR(order.createdAt)}</td>
            <td class="py-2 px-3">${order.customer?.name || 'N/A'}</td>
            <td class="py-2 px-3">${formatCurrency(order.total)}</td>
            <td class="py-2 px-3"><span class="px-2 py-1 text-xs rounded-full ${order.status === 'cancelado' ? 'bg-red-200 text-red-800' : 'bg-blue-200 text-blue-800'}">${order.status}</span></td>
            <td class="py-2 px-3">${order.createdBy?.name || 'N/A'}</td>
            <td class="py-2 px-3">${order.settledBy?.name || '---'}</td>
        `;
        row.addEventListener('dblclick', () => showOrderDetailModal(row.dataset.orderId));
    });
    console.log("renderManagerOrdersTable: Tabela de pedidos renderizada.");
}

// Filtra os pedidos na tabela do gerente
function filterManagerOrdersTable() {
    console.log("filterManagerOrdersTable: Filtrando tabela de pedidos.");
    if (!dom.manager || !dom.manager.filterSearchAll) {
        console.error("Elemento dom.manager.filterSearchAll não encontrado.");
        return;
    }
    const searchTerm = dom.manager.filterSearchAll.value.toLowerCase();

    const filteredOrders = allManagerOrders.filter(order => {
        const searchString = [
            String(order.orderNumber),
            order.customer?.name || '',
            order.status || '',
            order.createdBy?.name || '',
            order.settledBy?.name || ''
        ].join(' ').toLowerCase();

        return searchString.includes(searchTerm);
    });

    renderManagerOrdersTable(filteredOrders);
}

// Mostra o modal de detalhes de um pedido no painel do gerente
async function showOrderDetailModal(orderId) {
    console.log("showOrderDetailModal: Exibindo detalhes do pedido:", orderId);
    if (!dom.manager || !dom.manager.detailOrderNumber || !dom.manager.detailOrderContent || !dom.manager.detailReactivateBtn || !dom.manager.detailReleaseEditBtn || !dom.manager.orderDetailModal) {
        console.error("Elementos do modal de detalhes do pedido não encontrados.");
        return;
    }
    const orderRef = doc(db, "orders", orderId);
    const orderSnap = await getDoc(orderRef);
    if (!orderSnap.exists()) {
        return showToast("Pedido não encontrado.", "error");
    }
    const order = orderSnap.data();
    dom.manager.detailOrderNumber.textContent = `#${order.orderNumber}`;

    let itemsHtml = (order.items || []).map(item => {
        const itemName = item.isManual ? item.name : getProductInfoById(item.id).name;
        return `<div class="flex justify-between text-sm"><p>${item.quantity} ${itemName}</p><p>${formatCurrency(item.subtotal)}</p></div>`;
    }).join('');

    dom.manager.detailOrderContent.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-gray-700">
            <div><p class="font-semibold">Cliente:</p><p>${order.customer?.name}</p></div>
            <div><p class="font-semibold">Telefone:</p><p>${order.customer?.phone}</p></div>
            <div><p class="font-semibold">Data da Solicitação:</p><p>${formatDateTimeToBR(order.createdAt)}</p></div>
            <div><p class="font-semibold">Data da Retirada:</p><p>${order.delivery?.date} às ${order.delivery?.time}</p></div>
            <div><p class="font-semibold">Vendedor:</p><p>${order.createdBy?.name || 'N/A'}</p></div>
            <div><p class="font-semibold">Recebedor:</p><p>${order.settledBy?.name || '---'}</p></div>
            <div><p class="font-semibold">Status Dívida:</p><p class="font-bold ${order.paymentStatus === 'pago' ? 'text-green-600' : 'text-orange-600'}">${order.paymentStatus === 'pago' ? 'SALDO TOTAL PAGO' : 'SALDO EM ABERTO'}</p></div>
        </div>
        <hr class="my-4">
        <h3 class="font-bold mb-2">Itens do Pedido:</h3>
        <div class="space-y-1">${itemsHtml}</div>
        <hr class="my-4">
        <div class="text-right space-y-2 text-lg">
            <div class="flex justify-end gap-4"><p class="font-semibold">Valor a Pagar:</p><p>${formatCurrency(order.total)}</p></div>
            <div class="flex justify-end gap-4"><p class="font-semibold">Sinal:</p><p>${formatCurrency(order.sinal)}</p></div>
            <div class="flex justify-end gap-4 font-bold text-red-600"><p>Valor em Aberto:</p><p>${formatCurrency(order.restante)}</p></div>
        </div>
    `;

    const isManager = currentUser.role === 'gerente' || currentUser.role === 'manager_in_pdv';
    dom.manager.detailReactivateBtn.classList.toggle('hidden', order.status !== 'cancelado' || !isManager);
    dom.manager.detailReactivateBtn.dataset.orderId = orderId;

    dom.manager.detailReleaseEditBtn.classList.toggle('hidden', !isManager);
    dom.manager.detailReleaseEditBtn.dataset.orderId = orderId;

    dom.manager.orderDetailModal.classList.add('active');
}

// Carrega e exibe a lista de clientes
async function loadClients() {
    console.log("loadClients: Carregando clientes.");
    if (!dom.manager || !dom.manager.clientsTableBody) {
        console.error("Elemento dom.manager.clientsTableBody não encontrado.");
        return;
    }
    allClients = await fetchClients(); // Busca clientes via serviço Firebase

    dom.manager.clientsTableBody.innerHTML = '';
    allClients.sort((a,b) => a.name.localeCompare(b.name)).forEach(client => {
        const rank = calculateClientRank(client);
        const row = dom.manager.clientsTableBody.insertRow();
        row.className = 'border-b hover:bg-gray-50';
        row.innerHTML = `
            <td class="p-2 text-center"><input type="checkbox" class="highlight-checkbox client-checkbox" data-phone="${client.phone}"></td>
            <td class="py-2 px-3">${client.name}</td>
            <td class="py-2 px-3">${client.phone}</td>
            <td class="py-2 px-3 text-right font-semibold ${client.totalDebt > 0.01 ? 'text-red-600' : 'text-green-600'}">${client.totalDebt > 0.01 ? formatCurrency(client.totalDebt) : 'Não tem débito'}</td>
            <td class="py-2 px-3 text-center align-middle">
                <span class="inline-block bg-blue-100 text-blue-800 text-base font-bold px-3 py-1 rounded-full">${client.orderCount}</span>
            </td>
            <td class="py-2 px-3">${formatDateToBR(client.firstOrderDate)}</td>
            <td class="py-2 px-3"><span class="px-2 py-1 text-xs font-bold rounded-full text-white ${rank.color}">${rank.text}</span></td>
            <td class="py-2 px-3 text-center">
                <button class="text-green-500 hover:text-green-700 text-lg client-whatsapp-btn" data-phone="${client.phone}" data-name="${client.name}" title="Enviar mensagem para ${client.name}">
                    <i class="fab fa-whatsapp"></i>
                </button>
            </td>
        `;
    });

    document.querySelectorAll('.client-whatsapp-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const { name, phone } = e.currentTarget.dataset;
            openWhatsappModal(phone, name);
        });
    });
    updateGroupWhatsappUI();
    console.log("loadClients: Clientes carregados e renderizados.");
}

function calculateClientRank(client) {
    if (client.totalDebt > 50) return { text: 'Ruim', color: 'bg-red-500' };
    if (client.totalDebt > 0) return { text: 'Devedor', color: 'bg-yellow-500' };
    if (client.orderCount > 5) return { text: 'Bom', color: 'bg-green-500' };
    return { text: 'Médio', color: 'bg-blue-500' };
}

// Carrega e exibe a atividade da equipe (diário)
async function loadTeamDailyActivity() {
    console.log("loadTeamDailyActivity: Carregando atividade diária da equipe.");
    if (!dom.manager || !dom.manager.equipeDiarioData || !dom.manager.teamDailyStatsContainer) {
        console.error("loadTeamDailyActivity: Elementos do relatório diário da equipe não encontrados.");
        return;
    }
    dom.manager.teamDailyStatsContainer.innerHTML = '<p class="text-center text-gray-500 col-span-full">Carregando atividades diárias...</p>';

    const today = new Date();
    dom.manager.equipeDiarioData.textContent = today.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    endOfDay.setHours(23, 59, 59, 999);

    console.log(`loadTeamDailyActivity: Buscando logs e pedidos entre ${startOfDay.toLocaleString()} e ${endOfDay.toLocaleString()}`);

    try {
        const [logs, orders] = await Promise.all([
            fetchTeamActivityLogs(startOfDay, endOfDay),
            fetchTeamActivityOrders(startOfDay, endOfDay)
        ]);

        console.log(`loadTeamDailyActivity: Promise.all concluída. Logs: ${logs.length}, Pedidos: ${orders.length}`);

        const teamStats = {};
        console.log("loadTeamDailyActivity: Processando logs...");
        logs.forEach(log => {
            if (!teamStats[log.userName]) teamStats[log.userName] = { sessions: [], sales: 0, orderCount: 0, loginTime: null, logoutTime: null, loginsToday: 0 };
            teamStats[log.userName].sessions.push({ type: log.type, time: log.timestamp.toDate() });
            if (log.type === 'login') {
                teamStats[log.userName].loginsToday++;
            }
        });
        console.log("loadTeamDailyActivity: Processamento de logs concluído. teamStats após logs:", teamStats);

        console.log("loadTeamDailyActivity: Processando pedidos...");
        orders.forEach(order => {
            const creator = order.createdBy?.name;
            if (creator) {
                if (!teamStats[creator]) {
                    teamStats[creator] = { sessions: [], sales: 0, orderCount: 0, loginTime: null, logoutTime: null, loginsToday: 0 };
                }
                if (order.status !== 'cancelado') {
                    teamStats[creator].sales += order.total;
                    teamStats[creator].orderCount++;
                }
            }
        });
        console.log("loadTeamDailyActivity: Processamento de pedidos concluído. teamStats final:", teamStats);

        dom.manager.teamDailyStatsContainer.innerHTML = '';
        Object.entries(teamStats).forEach(([name, stats]) => {
            let totalLoggedInTimeMs = 0;
            let lastLoginTime = null;
            const logins = stats.sessions.filter(s => s.type === 'login').sort((a,b) => a.time - b.time);
            const logouts = stats.sessions.filter(s => s.type === 'logout').sort((a,b) => a.time - b.time);
            stats.loginTime = logins.length > 0 ? logins[0].time : null;
            stats.logoutTime = logouts.length > 0 ? logouts[logouts.length - 1].time : null;

            stats.sessions.forEach(session => {
                if (session.type === 'login') {
                    lastLoginTime = session.time;
                } else if (session.type === 'logout' && lastLoginTime) {
                    totalLoggedInTimeMs += session.time - lastLoginTime;
                    lastLoginTime = null;
                }
            });
            if (lastLoginTime) {
                totalLoggedInTimeMs += new Date() - lastLoginTime;
            }
            const hours = Math.floor(totalLoggedInTimeMs / 3600000);
            const minutes = Math.floor((totalLoggedInTimeMs % 3600000) / 60000);
            const timeString = `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`;

            const card = document.createElement('div');
            card.className = 'bg-white p-6 rounded-2xl shadow-lg transform hover:scale-105 transition-transform duration-300 flex flex-col items-center text-center';
            const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500'];
            const color = colors[Object.keys(teamStats).indexOf(name) % colors.length];

            card.innerHTML = `
                <div class="${color} text-white rounded-full h-20 w-20 flex items-center justify-center mb-4">
                    <i class="fas fa-user fa-2x"></i>
                </div>
                <h4 class="font-bold text-xl text-gray-800">${name}</h4>
                <div class="mt-4 w-full space-y-3">
                    <div class="bg-gray-100 p-3 rounded-lg flex justify-between items-center text-sm">
                        <span><i class="fas fa-sign-in-alt text-green-500 mr-2"></i>Logins:</span>
                        <span class="font-bold">${stats.loginsToday}</span>
                    </div>
                    <div class="bg-gray-100 p-3 rounded-lg flex justify-between items-center text-sm">
                        <span><i class="fas fa-clock text-blue-500 mr-2"></i>Tempo Logado:</span>
                        <span class="font-bold">${timeString}</span>
                    </div>
                    <div class="bg-gray-100 p-3 rounded-lg flex justify-between items-center"><span class="text-sm font-medium">Vendas</span><span class="font-bold text-lg">${stats.orderCount}</span></div>
                    <div class="bg-gray-100 p-3 rounded-lg flex justify-between items-center"><span class="text-sm font-medium">Faturamento</span><span class="font-bold text-lg">${formatCurrency(stats.sales)}</span></div>
                </div>
            `;
            dom.manager.teamDailyStatsContainer.appendChild(card);
        });
        if (Object.keys(teamStats).length === 0) {
            dom.manager.teamDailyStatsContainer.innerHTML = '<p class="text-center text-gray-500 col-span-full">Nenhuma atividade registrada para hoje.</p>';
        }
        console.log("loadTeamDailyActivity: Atividade diária da equipe carregada.");
    } catch (error) {
        console.error("loadTeamDailyActivity: Erro ao carregar atividade diária da equipe:", error);
        dom.manager.teamDailyStatsContainer.innerHTML = '<p class="text-center text-red-500 col-span-full">Erro ao carregar dados da equipe. Verifique o console para mais detalhes.</p>';
        showToast("Erro ao carregar atividade da equipe.", "error");
    }
}

// Carrega e exibe a atividade da equipe (mensal)
async function loadTeamMonthlyActivity() {
    console.log("loadTeamMonthlyActivity: Carregando atividade mensal da equipe.");
    if (!dom.manager || !dom.manager.equipeMonthPicker || !dom.manager.teamMonthlyStatsContainer) {
        console.error("Elementos do relatório mensal da equipe não encontrados.");
        return;
    }
    dom.manager.teamMonthlyStatsContainer.innerHTML = '<p class="text-center text-gray-500 col-span-full">Carregando atividades mensais...</p>';

    const monthInput = dom.manager.equipeMonthPicker.value;
    if (!monthInput) {
        console.warn("loadTeamMonthlyActivity: Input de mês vazio.");
        dom.manager.teamMonthlyStatsContainer.innerHTML = '<p class="text-center text-gray-500 col-span-full">Selecione um mês para ver o desempenho.</p>';
        return;
    }

    const [year, month] = monthInput.split('-');
    const startOfMonth = new Date(year, month - 1, 1);
    startOfMonth.setHours(0,0,0,0);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);
    console.log(`loadTeamMonthlyActivity: Buscando pedidos entre ${startOfMonth.toLocaleString()} e ${endOfMonth.toLocaleString()}`);

    try {
        const orders = await fetchTeamActivityOrders(startOfMonth, endOfMonth);
        console.log(`loadTeamMonthlyActivity: ${orders.length} pedidos encontrados para o mês.`);

        const teamStats = {};
        orders.forEach(order => {
             const creator = order.createdBy?.name;
            if (creator && order.status !== 'cancelado') {
                if (!teamStats[creator]) teamStats[creator] = { sales: 0, products: 0, orders: 0 };
                teamStats[creator].sales += order.total;
                const allItems = [...(order.items || [])];
                teamStats[creator].products += allItems.reduce((sum, item) => sum + item.quantity, 0);
                teamStats[creator].orders++;
            }
        });
        console.log("loadTeamMonthlyActivity: teamStats após processamento de pedidos:", teamStats);

        dom.manager.teamMonthlyStatsContainer.innerHTML = '';
        Object.entries(teamStats).sort((a,b) => b[1].sales - a[1].sales).forEach(([name, stats]) => {
            const card = document.createElement('div');
            card.className = 'bg-white p-6 rounded-2xl shadow-lg transform hover:scale-105 transition-transform duration-300';
            card.innerHTML = `
                <div class="flex justify-between items-start">
                    <h4 class="font-bold text-xl text-gray-800">${name}</h4>
                    <button class="bg-blue-500 text-white px-3 py-1 rounded-lg text-xs view-monthly-detail-btn" data-name="${name}" data-month="${monthInput}">Detalhes</button>
                </div>
                <div class="mt-4 grid grid-cols-1 gap-3 text-left">
                    <div class="bg-blue-50 p-3 rounded-lg flex justify-between items-center"><span class="text-sm font-medium text-blue-800">Faturamento Total</span><p class="font-bold text-xl text-blue-900">${formatCurrency(stats.sales)}</p></div>
                    <div class="bg-green-50 p-3 rounded-lg flex justify-between items-center"><span class="text-sm font-medium text-green-800">Produtos Vendidos</span><p class="font-bold text-xl text-green-900">${stats.products}</p></div>
                    <div class="bg-indigo-50 p-3 rounded-lg flex justify-between items-center"><span class="text-sm font-medium text-indigo-800">Pedidos Realizados</span><p class="font-bold text-xl text-indigo-900">${stats.orders}</p></div>
                </div>
            `;
            dom.manager.teamMonthlyStatsContainer.appendChild(card);
        });

        document.querySelectorAll('.view-monthly-detail-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const { name, month } = e.currentTarget.dataset;
                showEmployeeMonthlyDetail(name, month);
            });
        });

         if (Object.keys(teamStats).length === 0) {
            dom.manager.teamMonthlyStatsContainer.innerHTML = '<p class="text-center text-gray-500 col-span-full">Nenhuma venda registrada para este mês.</p>';
        }
        console.log("loadTeamMonthlyActivity: Atividade mensal da equipe carregada.");
    } catch (error) {
        console.error("loadTeamMonthlyActivity: Erro ao carregar atividade mensal da equipe:", error);
        dom.manager.teamMonthlyStatsContainer.innerHTML = '<p class="text-center text-red-500 col-span-full">Erro ao carregar dados da equipe. Verifique o console para mais detalhes.</p>';
        showToast("Erro ao carregar atividade mensal da equipe.", "error");
    }
}

// Funções de WhatsApp
function openWhatsappModal(phone, name) {
    console.log("openWhatsappModal: Abrindo modal WhatsApp para:", name);
    if (!dom.whatsapp || !dom.whatsapp.modal || !dom.whatsapp.clientName || !dom.whatsapp.messageInput) {
        console.error("Elementos do modal WhatsApp não encontrados.");
        return;
    }
    dom.whatsapp.modal.dataset.phone = phone;
    dom.whatsapp.clientName.textContent = name;
    dom.whatsapp.messageInput.value = `Olá ${name}, tudo bem?`;
    dom.whatsapp.modal.classList.add('active');
}

function handleSendWhatsapp() {
    console.log("handleSendWhatsapp: Iniciando envio de mensagem WhatsApp do modal.");
    if (!dom.whatsapp || !dom.whatsapp.modal || !dom.whatsapp.messageInput) {
        console.error("Elementos do modal WhatsApp não encontrados para envio.");
        return;
    }
    const phoneRaw = dom.whatsapp.modal.dataset.phone;
    if (!phoneRaw) {
        showToast("Telefone do cliente não informado no modal.", "error");
        console.error("handleSendWhatsapp: Telefone do cliente não encontrado no dataset do modal.");
        return;
    }
    const phone = phoneRaw.replace(/\D/g, '');
    if (phone.length < 10) {
        showToast("Número de telefone inválido. Verifique o DDD e o número.", "error");
        console.error("handleSendWhatsapp: Número de telefone inválido:", phoneRaw);
        return;
    }

    const message = dom.whatsapp.messageInput.value;
    if (!message.trim()) {
        showToast("Por favor, digite uma mensagem para enviar.", "error");
        console.error("handleSendWhatsapp: Mensagem para envio está vazia.");
        return;
    }

    const whatsappUrl = `https://wa.me/55${phone}?text=${encodeURIComponent(message)}`;
    console.log("handleSendWhatsapp: Abrindo URL do WhatsApp:", whatsappUrl);

    try {
        window.open(whatsappUrl, '_blank');
        dom.whatsapp.modal.classList.remove('active');
    } catch (e) {
        console.error("handleSendWhatsapp: Erro ao abrir janela do WhatsApp:", e);
        showToast("Não foi possível abrir o WhatsApp. Verifique as permissões do navegador.", "error");
    }
}

function updateGroupWhatsappUI() {
    if (!dom.manager || !dom.manager.selectedClientsCount || !dom.manager.sendGroupWhatsappBtn || !dom.manager.whatsappGroupMessage) {
        console.error("Elementos do grupo WhatsApp UI não encontrados.");
        return;
    }
    const selectedCheckboxes = document.querySelectorAll('.client-checkbox:checked');
    const count = selectedCheckboxes.length;
    dom.manager.selectedClientsCount.textContent = count;
    dom.manager.sendGroupWhatsappBtn.disabled = count === 0 || !dom.manager.whatsappGroupMessage.value.trim();
}

/**
 * NOVO: Função auxiliar para criar um atraso (delay).
 * @param {number} ms - O tempo de atraso em milissegundos.
 * @returns {Promise<void>}
 */
const delay = ms => new Promise(res => setTimeout(res, ms));

async function sendGroupWhatsapp() {
    console.log("sendGroupWhatsapp: Iniciando envio de mensagem em grupo WhatsApp.");
    const { whatsappGroupMessage, sendGroupWhatsappBtn } = dom.manager;

    if (!whatsappGroupMessage || !sendGroupWhatsappBtn) {
        console.error("Elementos de envio de grupo WhatsApp não encontrados.");
        return;
    }

    const message = whatsappGroupMessage.value;
    if (!message.trim()) {
        return showToast("Por favor, digite uma mensagem para enviar.", "error");
    }

    const selectedCheckboxes = document.querySelectorAll('.client-checkbox:checked');
    if (selectedCheckboxes.length === 0) {
        return showToast("Nenhum cliente selecionado.", "error");
    }

    sendGroupWhatsappBtn.disabled = true;
    const originalButtonText = sendGroupWhatsappBtn.innerHTML;

    try {
        for (let i = 0; i < selectedCheckboxes.length; i++) {
            const cb = selectedCheckboxes[i];
            const phoneRaw = cb.dataset.phone;
            const phone = phoneRaw ? phoneRaw.replace(/\D/g, '') : '';

            if (phone.length >= 10) {
                sendGroupWhatsappBtn.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i> Enviando ${i + 1} de ${selectedCheckboxes.length}`;
                const whatsappUrl = `https://wa.me/55${phone}?text=${encodeURIComponent(message)}`;
                window.open(whatsappUrl, '_blank');
                await delay(3000); // Espera 3 segundos antes de abrir a próxima aba
            } else {
                console.warn(`Número de telefone inválido ou ausente para um cliente selecionado: ${phoneRaw}`);
            }
        }
        showToast("Envio em massa concluído!", "success");
    } catch (error) {
        console.error("Erro durante o envio em massa:", error);
        showToast("Ocorreu um erro durante o envio.", "error");
    } finally {
        sendGroupWhatsappBtn.disabled = false;
        sendGroupWhatsappBtn.innerHTML = originalButtonText;
    }
}

// Funções de Gerenciamento do Sistema
export function goToPdv() {
    console.log("goToPdv: Navegando para o PDV.");
    if (!dom.managerDashboard || !dom.mainContent || !dom.returnToManagerBtn || !dom.managerAccessBtn) {
        console.error("Elementos de navegação para PDV não encontrados.");
        return;
    }
    dom.managerDashboard.style.display = 'none';
    dom.mainContent.style.display = 'flex';
    dom.returnToManagerBtn.classList.remove('hidden');
    dom.managerAccessBtn.style.display = 'none';
    currentUser.role = 'manager_in_pdv';

    if (dom.employeeSwitcherSelect) {
        dom.employeeSwitcherSelect.value = "Gerência";
        dom.employeeSwitcherSelect.disabled = true;
        dom.employeeSwitcherSelect.classList.add('employee-switcher-selected');
    }
    if (dom.pdvEmployeeOnlineStatus) dom.pdvEmployeeOnlineStatus.classList.remove('hidden');

    // As funções de renderização do PDV e início de novo pedido são chamadas no app.js::startApp
    // quando o tipo de usuário é 'funcionario' ou 'manager_in_pdv'.
    // Aqui, apenas garantimos a transição de tela.
}
async function saveManagerConfig() {
    console.log("saveManagerConfig: Iniciando salvamento do cardápio.");
    const saveBtn = dom.manager.saveProductsBtn;
    if (!saveBtn) return;

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Salvando...';

    const batch = writeBatch(db);
    const productRows = document.querySelectorAll('#manager-products-list .product-config-row-wrapper'); // CORREÇÃO: Seleciona o wrapper
    const activeTab = document.querySelector('.manager-cardapio-tab.active-tab-manager');
    const activeCategory = activeTab ? activeTab.dataset.category : null;

    if (!activeCategory) {
        showToast("Erro: Categoria ativa não encontrada.", "error");
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save mr-2"></i>Salvar Todas as Alterações';
        return;
    }

    // Array para armazenar os novos dados da categoria para o sistema antigo
    const newItemsForOldSystem = [];

    const promises = productRows.map(async (row) => {
        const id = row.dataset.productId;
        const name = row.querySelector('[data-field="name"]').value.trim();
        const price = parseFloat(row.querySelector('[data-field="price-unico"]').value);
        const cost = parseFloat(row.querySelector('[data-field="cost"]').value);
        const stock = parseInt(row.querySelector('[data-field="stock"]').value, 10);
        const category = row.dataset.category;

        if (!name || isNaN(price)) {
            console.warn(`Linha de produto inválida (nome ou preço) ignorada: ID ${id}. Pulando.`);
            return; // Pula linhas inválidas
        }

        // Adiciona os dados do produto ao array para atualizar o sistema antigo
        // O sistema antigo espera um objeto mais simples
        newItemsForOldSystem.push({
            id, name, price, category
        });

        // Lógica para salvar no NOVO sistema (coleção 'products')
        const productRef = doc(db, "products", id);
        const productSnap = await getDoc(productRef);

        const productData = {
            name,
            price,
            cost: isNaN(cost) ? 0 : cost,
            stock: isNaN(stock) ? 0 : stock,
            category
        };

        if (productSnap.exists()) { // Produto existente
            const oldData = productSnap.data();
            const hasPriceChanged = oldData.price !== price;
            const hasCostChanged = oldData.cost !== productData.cost;

            if (hasPriceChanged || hasCostChanged) {
                const historyRef = doc(collection(db, `products/${id}/priceHistory`));
                const historyData = {
                    newPrice: price,
                    oldPrice: oldData.price,
                    newCost: productData.cost,
                    oldCost: oldData.cost || null,
                    timestamp: serverTimestamp(),
                    changedBy: currentUser.name
                };
                batch.set(historyRef, historyData);
            }
            batch.update(productRef, productData);

        } else { // Produto novo
            batch.set(productRef, { ...productData, createdAt: serverTimestamp() });

            const historyRef = doc(collection(db, `products/${id}/priceHistory`));
            const historyData = {
                newPrice: price,
                oldPrice: null,
                newCost: productData.cost,
                oldCost: null,
                timestamp: serverTimestamp(),
                changedBy: currentUser.name,
                reason: 'Criação do Produto'
            };
            batch.set(historyRef, historyData);
        }
    });

    try {
        await Promise.all(promises);

        // Lógica para atualizar também o documento config/main (sistema antigo)
        const configDocRef = doc(db, "config", "main");
        const configSnap = await getDoc(configDocRef);

        if (configSnap.exists()) {
            const configData = configSnap.data();
            // Faz uma cópia do array de produtos existente para evitar mutação direta
            const updatedProductsArray = Array.isArray(configData.products) ? [...configData.products] : [];
            const categoryIndex = updatedProductsArray.findIndex(cat => cat.id === activeCategory);

            if (categoryIndex > -1) {
                // Se a categoria já existe no array, atualiza seus itens
                updatedProductsArray[categoryIndex].items = newItemsForOldSystem;
            } else {
                // Se for uma nova categoria, adiciona ao array
                updatedProductsArray.push({ id: activeCategory, items: newItemsForOldSystem });
            }

            // Adiciona a atualização do documento config/main ao mesmo batch
            batch.update(configDocRef, { products: updatedProductsArray });
        }

        await batch.commit();

        showToast("Cardápio salvo com sucesso!", "success");

        // Recarrega a configuração global e a view atual
        const { loadConfig } = await import('./app.js');
        await loadConfig();
        switchManagerCardapioTab(activeCategory);

    } catch (error) {
        console.error("saveManagerConfig: Erro ao salvar cardápio em lote:", error);
        showToast("Falha ao salvar o cardápio. Verifique o console.", "error");
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save mr-2"></i>Salvar Todas as Alterações';
    }
}

// Função para carregar e exibir os produtos na aba de gestão de cardápio do gerente
function loadManagerCardapio(category) {
    console.log("loadManagerCardapio: Carregando cardápio para categoria:", category);
    if (!dom.manager || !dom.manager.managerProductsList) {
        console.error("Elemento dom.manager.managerProductsList não encontrado.");
        return;
    }
    dom.manager.managerProductsList.innerHTML = '';
    const productsToRender = productsConfig[category] || [];
    console.log(`loadManagerCardapio: Produtos para renderizar na categoria ${category}:`, productsToRender);

    productsToRender.forEach(p => {
        dom.manager.managerProductsList.appendChild(createProductConfigRow(p, category));
    });
    console.log("loadManagerCardapio: Cardápio renderizado para categoria:", category);
}

// CORREÇÃO DE LAYOUT: A função foi reescrita para usar flexbox e garantir o alinhamento em colunas.
function createProductConfigRow(product, category) {
    const row = document.createElement('div');
    row.className = `product-config-row-wrapper`; // Div externa para espaçamento
    row.dataset.productId = product.id || "prod_" + Date.now();
    row.dataset.category = category;

    // Adiciona classes de destaque com base no estoque
    let stockClass = '';
    if (typeof product.stock === 'number') {
        if (product.stock <= 0) {
            stockClass = 'bg-red-100 border-l-4 border-red-400';
        } else if (product.stock <= 5) {
            stockClass = 'bg-yellow-100 border-l-4 border-yellow-400';
        }
    }

    let priceValue = product.price || 0;
    if (category === 'fritos' && product.prices && typeof product.prices.frito === 'number') {
        priceValue = product.prices.frito;
    }

    const costValue = typeof product.cost === 'number' ? product.cost : 0;
    const stockValue = typeof product.stock === 'number' ? product.stock : '';

    row.innerHTML = `
        <div class="product-config-row p-4 rounded-lg shadow-sm bg-white ${stockClass} flex items-center gap-4">
            <input type="text" value="${product.name}" placeholder="Nome do Produto" class="flex-grow min-w-0 p-2 border rounded" data-field="name">
            <input type="number" step="0.01" value="${priceValue.toFixed(2)}" placeholder="Preço Venda" class="w-28 p-2 border rounded text-right" data-field="price-unico">
            <input type="number" step="0.01" value="${costValue.toFixed(2)}" placeholder="Custo" class="w-28 p-2 border rounded text-right" data-field="cost">
            <input type="number" value="${stockValue}" placeholder="Estoque" class="w-28 p-2 border rounded text-right" data-field="stock">
            <span class="text-xs text-gray-500 truncate flex-1 min-w-[150px]" title="${product.id}">${product.id}</span>
            <div class="flex gap-2">
                <button class="text-blue-500 hover:text-blue-700 price-history-btn text-center p-2 text-lg" data-product-id="${product.id}" data-product-name="${product.name}" title="Histórico de Preços"><i class="fas fa-history"></i></button>
                <button class="text-red-500 hover:text-red-700 remove-product-btn text-center p-2 text-lg" title="Remover Produto"><i class="fa fa-trash"></i></button>
            </div>
        </div>
    `;
    return row;
}


// Função para alternar entre as abas do cardápio do gerente
function switchManagerCardapioTab(category) {
    console.log("switchManagerCardapioTab: Alternando para categoria do cardápio:", category);
    if (!dom.manager || !dom.manager.tabCardapioAssadosManager || !dom.manager.tabCardapioFritosManager || !dom.manager.tabCardapioRevendaManager || !dom.manager.tabCardapioOutrosManager) {
        console.error("Elementos da aba do cardápio do gerente não encontrados.");
        return;
    }
    const tabs = {
        assados: dom.manager.tabCardapioAssadosManager,
        fritos: dom.manager.tabCardapioFritosManager,
        revenda: dom.manager.tabCardapioRevendaManager,
        outros: dom.manager.tabCardapioOutrosManager
    };

    Object.values(tabs).forEach(tab => {
        tab.classList.remove('active-tab-manager');
    });

    tabs[category].classList.add('active-tab-manager');

    loadManagerCardapio(category);
}

// Função para alternar entre as abas de estoque (Reposição / Histórico)
function switchStockTab(tabId) {
    console.log("switchStockTab: Alternando para aba de estoque:", tabId);
    if (!dom.manager || !dom.manager.tabStockRepo || !dom.manager.tabStockHistory || !dom.manager.contentStockRepo || !dom.manager.contentStockHistory) {
        console.error("Elementos da aba de estoque não encontrados.");
        return;
    }
    dom.manager.tabStockRepo.classList.remove('text-blue-600', 'border-blue-500');
    dom.manager.tabStockHistory.classList.remove('text-blue-600', 'border-blue-500');
    dom.manager.tabStockRepo.classList.add('text-gray-500', 'border-transparent');
    dom.manager.tabStockHistory.classList.add('text-gray-500', 'border-transparent');
    dom.manager.contentStockRepo.classList.add('hidden');
    dom.manager.contentStockHistory.classList.add('hidden');

    if (tabId === 'repo') {
        dom.manager.tabStockRepo.classList.remove('text-gray-500', 'border-transparent');
        dom.manager.tabStockRepo.classList.add('text-blue-600', 'border-blue-500');
        dom.manager.contentStockRepo.classList.remove('hidden');
        loadStockManagementView();
    } else { // 'history'
        dom.manager.tabStockHistory.classList.remove('text-gray-500', 'border-transparent');
        dom.manager.tabStockHistory.classList.add('text-blue-600', 'border-blue-500');
        dom.manager.contentStockHistory.classList.remove('hidden');
        loadStockHistoryView();
    }
}

// Carrega a view de gerenciamento de estoque
async function loadStockManagementView() {
    console.log("loadStockManagementView: Carregando view de gerenciamento de estoque.");
    if (!dom.manager || !dom.manager.stockManagementTableBody) {
        console.error("Elemento dom.manager.stockManagementTableBody não encontrado.");
        return;
    }
    const tableBody = dom.manager.stockManagementTableBody;
    tableBody.innerHTML = '<tr><td colspan="4" class="text-center p-4">Carregando produtos...</td></tr>';

    try {
        const allProducts = await fetchAllProductsWithStock();
        tableBody.innerHTML = ''; // Limpa o "Carregando..."

        if (allProducts.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4" class="text-center p-4">Nenhum produto encontrado. Cadastre produtos na aba "Cardápio".</td></tr>';
            return;
        }

        allProducts.forEach(product => {
            const row = tableBody.insertRow();
            row.dataset.productId = product.id;
            row.innerHTML = `
                <td class="py-2 px-3 border-b">${product.name} <span class="text-xs text-gray-500">(${product.category})</span></td>
                <td class="py-2 px-3 border-b text-center font-bold text-lg ${product.stock <= 5 ? 'text-red-500' : 'text-green-600'}">${product.stock ?? 'N/A'}</td>
                <td class="py-2 px-3 border-b text-center"><input type="number" min="0" class="w-24 text-center border rounded-lg p-1 stock-add-input" placeholder="0"></td>
                <td class="py-2 px-3 border-b text-center"><button class="bg-green-500 text-white px-4 py-1 rounded-lg hover:bg-green-600 save-stock-btn text-xs">Adicionar</button></td>
            `;
        });
    } catch (error) {
        console.error("Erro ao carregar produtos para gerenciamento de estoque:", error);
        tableBody.innerHTML = '<tr><td colspan="4" class="text-center p-4 text-red-500">Erro ao carregar produtos.</td></tr>';
    }
}

// Carrega os dados para a view de histórico de estoque (só executa uma vez)
async function loadStockHistoryView() {
    console.log("loadStockHistoryView: Carregando view de histórico de estoque.");
    const { stockHistoryFilter, stockHistoryTableBody } = dom.manager;

    // Se os logs já foram carregados, apenas renderiza a tabela
    if (stockLogs.length > 0) {
        renderStockHistoryTable();
        return;
    }

    stockHistoryTableBody.innerHTML = '<tr><td colspan="6" class="text-center p-4">Carregando histórico...</td></tr>';

    try {
        const [products, logs] = await Promise.all([
            fetchAllProductsWithStock(),
            fetchStockLogs()
        ]);

        // Popula o filtro
        stockHistoryFilter.innerHTML = '<option value="all">Todos os Produtos</option>';
        products.forEach(p => {
            const option = document.createElement('option');
            option.value = p.id;
            option.textContent = p.name;
            stockHistoryFilter.appendChild(option);
        });

        // Armazena os logs em cache
        stockLogs = logs;
        renderStockHistoryTable();

    } catch (error) {
        console.error("Erro ao carregar histórico de estoque:", error);
        stockHistoryTableBody.innerHTML = '<tr><td colspan="6" class="text-center p-4 text-red-500">Erro ao carregar histórico.</td></tr>';
    }
}

// Renderiza a tabela de histórico de estoque com base nos filtros
function renderStockHistoryTable() {
    const { stockHistoryFilter, stockHistoryTableBody } = dom.manager;
    const selectedProductId = stockHistoryFilter.value;

    const filteredLogs = selectedProductId === 'all'
        ? stockLogs
        : stockLogs.filter(log => log.productId === selectedProductId);

    if (filteredLogs.length === 0) {
        stockHistoryTableBody.innerHTML = '<tr><td colspan="6" class="text-center p-4">Nenhuma movimentação encontrada para este filtro.</td></tr>';
        return;
    }

    stockHistoryTableBody.innerHTML = filteredLogs.map(log => {
        const change = log.quantityChange;
        const changeClass = change > 0 ? 'text-green-600' : 'text-red-600';
        const changeSign = change > 0 ? '+' : '';
        const reasonText = log.reason === 'Venda' || log.reason === 'Cancelamento' || log.reason === 'Reativação'
            ? `${log.reason} (Pedido #${log.orderNumber})`
            : log.reason;

        return `
            <tr class="border-b">
                <td class="py-2 px-3 text-xs">${formatDateTimeToBR(log.timestamp)}</td>
                <td class="py-2 px-3">${log.productName}</td>
                <td class="py-2 px-3 text-center font-bold ${changeClass}">${changeSign}${change}</td>
                <td class="py-2 px-3 text-center">${log.stockBefore} &rarr; ${log.stockAfter}</td>
                <td class="py-2 px-3">${reasonText}</td>
                <td class="py-2 px-3 text-xs">${log.user}</td>
            </tr>
        `;
    }).join('');
}

function loadTicketSettings() {
    console.log("loadTicketSettings: Carregando configurações de ticket.");
    if (!dom.manager || !dom.manager.storeNameInput || !dom.manager.storePhoneInput || !dom.manager.footerMsgInput || !dom.manager.printUnitPriceCheckbox || !dom.manager.ticketPreviewContainer || !dom.manager.ticketTitleInput || !dom.manager.ticketSubtitleInput) {
        console.error("Elementos de configuração de ticket não encontrados.");
        return;
    }
    dom.manager.storeNameInput.value = storeSettings.name || '';
    dom.manager.storePhoneInput.value = storeSettings.phone || '';
    // Carrega os novos campos ou usa um valor padrão
    dom.manager.ticketTitleInput.value = storeSettings.ticketTitle || 'COMPROVANTE DE PEDIDO';
    dom.manager.ticketSubtitleInput.value = storeSettings.ticketSubtitle || '(NAO E DOCUMENTO FISCAL)';
    dom.manager.footerMsgInput.value = storeSettings.footerMessage || '';
    dom.manager.printUnitPriceCheckbox.checked = storeSettings.printUnitPrice || false;
    updateTicketPreview();
}
async function saveTicketSettings() {
    console.log("saveTicketSettings: Salvando configurações de ticket.");
    if (!dom.manager || !dom.manager.storeNameInput || !dom.manager.storePhoneInput || !dom.manager.footerMsgInput || !dom.manager.printUnitPriceCheckbox || !dom.manager.ticketTitleInput || !dom.manager.ticketSubtitleInput) {
        console.error("Elementos de configuração de ticket não encontrados para salvar.");
        return;
    }
    const newStoreSettings = {
        ...storeSettings,
        name: dom.manager.storeNameInput.value,
        phone: dom.manager.storePhoneInput.value,
        // Salva os novos campos
        ticketTitle: dom.manager.ticketTitleInput.value,
        ticketSubtitle: dom.manager.ticketSubtitleInput.value,
        footerMessage: dom.manager.footerMsgInput.value,
        printUnitPrice: dom.manager.printUnitPriceCheckbox.checked
    };
    try {
        await firebaseSaveTicketSettings(newStoreSettings); // Chama o serviço Firebase
        // Atualiza a variável global para refletir a mudança imediatamente
        Object.assign(storeSettings, newStoreSettings);
        updateTicketPreview();
        console.log("saveTicketSettings: Configurações de ticket salvas com sucesso.");
    } catch (error) {
        console.error("saveTicketSettings: Erro ao salvar configurações de ticket:", error);
    }
}

function updateTicketPreview() {
    console.log("updateTicketPreview: Atualizando pré-visualização do ticket.");
    if (!dom.manager || !dom.manager.storeNameInput || !dom.manager.storePhoneInput || !dom.manager.footerMsgInput || !dom.manager.printUnitPriceCheckbox || !dom.manager.ticketPreviewContainer || !dom.manager.ticketTitleInput || !dom.manager.ticketSubtitleInput) {
        console.error("Elementos de pré-visualização de ticket não encontrados.");
        return;
    }
    const previewSettings = {
        name: dom.manager.storeNameInput.value || 'Nome da Loja',
        phone: dom.manager.storePhoneInput.value || '(XX) XXXX-XXXX',
        // Usa os valores dos novos campos na pré-visualização
        ticketTitle: dom.manager.ticketTitleInput.value || 'COMPROVANTE DE PEDIDO',
        ticketSubtitle: dom.manager.ticketSubtitleInput.value || '(NAO E DOCUMENTO FISCAL)',
        footerMessage: dom.manager.footerMsgInput.value || 'Obrigado(a) pela preferência!',
        printUnitPrice: dom.manager.printUnitPriceCheckbox.checked
    };

    const exampleOrder = {
        orderNumber: 123,
        customer: { name: 'Cliente Exemplo', phone: '(11) 98765-4321' },
        delivery: { date: '01/01/2024', time: '12:00' },
        createdBy: { name: 'Funcionário Teste' },
        createdAt: { toDate: () => new Date() },
        items: [
            { id: 'coxinha_frita', name: 'Coxinha (Frita)', quantity: 10, unitPrice: 0.70, subtotal: 7.00, category: 'fritos' },
            { id: 'esfiha_carne', name: 'Esfiha Carne', quantity: 5, unitPrice: 1.50, subtotal: 7.50, category: 'assados' },
            { id: 'picole_chocolate', name: 'Picolé Chocolate', quantity: 2, unitPrice: 3.00, subtotal: 6.00, category: 'revenda' },
            { id: 'manual_1', name: 'Refrigerante 2L', quantity: 1, unitPrice: 10.00, subtotal: 10.00, isManual: true, category: 'manual' }
        ],
        total: 30.50,
        sinal: 10.00,
        restante: 20.50
    };

    const originalStoreSettings = { ...storeSettings }; // Cria uma cópia para restaurar
    // Temporariamente sobrescreve storeSettings para gerar o preview
    Object.assign(storeSettings, previewSettings); // Atualiza storeSettings diretamente
    dom.manager.ticketPreviewContainer.textContent = generateTicketText(exampleOrder);
    Object.assign(storeSettings, originalStoreSettings); // Restaura as configurações originais
}

function loadSystemSettings() {
    console.log("loadSystemSettings: Carregando configurações do sistema.");
    if (!dom.manager || !dom.manager.monthlyGoalInput) {
        console.error("Elementos do manager.monthlyGoalInput não encontrado.");
        return;
    }
    const goalValue = storeSettings.monthlyGoal || 10000;
    dom.manager.monthlyGoalInput.value = formatInputAsCurrency(String(goalValue).replace('.',','), { keepThousands: true, keepCents: true });

    // NOVO: Carrega as configurações de produção
    const limitInput = document.getElementById('overload-limit-input');
    const windowInput = document.getElementById('overload-window-input');
    if (limitInput && windowInput && productionSettings) {
        limitInput.value = productionSettings.limit || 1200;
        windowInput.value = productionSettings.windowMinutes || 30;
    }
}
async function saveSystemSettings() {
    console.log("saveSystemSettings: Salvando configurações do sistema.");
    if (!dom.manager || !dom.manager.monthlyGoalInput) {
        console.error("Elementos do manager.monthlyGoalInput não encontrado para salvar.");
        return;
    }
    const newStoreSettings = {
        ...storeSettings,
        monthlyGoal: parseCurrency(dom.manager.monthlyGoalInput.value)
    };
     try {
        await firebaseSaveSystemSettings(newStoreSettings); // Chama o serviço Firebase
        // loadConfig(); // O app.js deve ter uma forma de recarregar a config global
        console.log("saveSystemSettings: Configurações do sistema salvas com sucesso.");
    } catch (error) {
        console.error("saveSystemSettings: Erro ao salvar meta.", error);
        // showToast já é chamado pelo firebaseSaveSystemSettings
    }
}

// Função para limpar o banco de dados (agora com verificação de senha)
async function clearDatabase() {
    console.log("clearDatabase: Iniciando processo de limpeza do banco de dados.");
    // A validação 'APAGAR TUDO' e a senha já foram feitas no event listener.
    try {
        await firebaseClearDatabase(); // Chama o serviço Firebase
        setTimeout(() => window.location.reload(), 3000); // Recarrega após a limpeza
    } catch (error) {
        console.error("clearDatabase: Erro ao limpar banco de dados.", error);
        // showToast já é chamado pelo firebaseClearDatabase
    }
}

// --- Funções de Relatórios do Gerente ---
function switchManagerReportTab(tabId) {
    console.log("switchManagerReportTab: Alternando para aba de relatório:", tabId);
    if (!dom.manager || !dom.manager.tabRelFinanceiro || !dom.manager.tabRelProdutos || !dom.manager.tabRelMargem || !dom.manager.contentRelFinanceiro || !dom.manager.contentRelProdutos || !dom.manager.contentRelMargem) {
        console.error("Elementos da aba de relatório do gerente não encontrados.");
        return;
    }
    const tabs = ['rel-financeiro', 'rel-produtos', 'rel-margem'];
    tabs.forEach(t => {
        const tabEl = document.getElementById(`tab-${t}`);
        const contentEl = document.getElementById(`content-${t}`);
        if (tabEl) {
            tabEl.classList.remove('text-blue-600', 'border-blue-500');
            tabEl.classList.add('text-gray-500', 'border-transparent');
        }
        if (contentEl) contentEl.classList.add('hidden');
    });
    document.getElementById(`tab-${tabId}`).classList.remove('text-gray-500', 'border-transparent');
    document.getElementById(`tab-${tabId}`).classList.add('text-blue-600', 'border-blue-500');
    document.getElementById(`content-${tabId}`).classList.remove('hidden');

    if (tabId === 'rel-financeiro') loadFinancialReport();
    if (tabId === 'rel-produtos') loadProductReport();
    if (tabId === 'rel-margem') loadProfitMarginReport();
}

async function loadFinancialReport() {
    console.log("loadFinancialReport: Carregando relatório financeiro.");
    if (!dom.manager || !dom.manager.contentRelFinanceiro) {
        console.error("Elemento dom.manager.contentRelFinanceiro não encontrado.");
        return;
    }
    const container = dom.manager.contentRelFinanceiro;
    container.innerHTML = '<p class="text-center">Carregando dados financeiros...</p>';
    const orders = await fetchAllOrders(); // Busca todos os pedidos via serviço

    const today = new Date();
    const currentMonthName = today.toLocaleString('pt-BR', { month: 'long' });
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    let faturamentoMensal = 0, totalPedidosMes = 0, totalAReceber = 0, totalPago = 0;
    const dailyRevenue = {};

    orders.forEach(order => {
        const orderDate = order.createdAt.toDate();
        if (orderDate >= startOfMonth && order.status !== 'cancelado') {
            faturamentoMensal += order.total;
            totalPedidosMes++;
            const day = orderDate.getDate();
            dailyRevenue[day] = (dailyRevenue[day] || 0) + order.total;
        }
        if(order.paymentStatus === 'devedor') totalAReceber += order.restante;
        if(order.paymentStatus === 'pago') totalPago += order.total;
    });

    const salesArray = Object.values(dailyRevenue);
    const maxSale = Math.max(0, ...salesArray);
    const minSale = salesArray.length > 0 ? Math.min(...salesArray.filter(v => v > 0), Infinity) : 0;
    const melhorDia = Object.keys(dailyRevenue).find(day => dailyRevenue[day] === maxSale);
    const piorDia = Object.keys(dailyRevenue).find(day => dailyRevenue[day] === minSale);

    container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-center">
            <div class="bg-white p-4 rounded-lg shadow"><p class="text-sm font-medium text-gray-500">Faturamento (${currentMonthName})</p><p class="text-2xl font-bold text-blue-600">${formatCurrency(faturamentoMensal)}</p><div class="chart-container mt-2"><canvas id="chart-fin-faturamento"></canvas></div></div> <!-- Card "Faturamento no Mês" -->
            <div class="bg-white p-4 rounded-lg shadow"><p class="text-sm font-medium text-gray-500">Total Pago (Geral)</p><p class="text-2xl font-bold text-green-600">${formatCurrency(totalPago)}</p><div class="chart-container mt-2"><canvas id="chart-fin-pago"></canvas></div></div> <!-- Card "Total Pago" -->
            <div class="bg-white p-4 rounded-lg shadow"><p class="text-sm font-medium text-gray-500">Total a Receber (Geral)</p><p class="text-2xl font-bold text-orange-500">${formatCurrency(totalAReceber)}</p><div class="chart-container mt-2"><canvas id="chart-fin-areceber"></canvas></div></div> <!-- Card "Total a Receber" -->
            <div class="bg-white p-4 rounded-lg shadow"><p class="text-sm font-medium text-gray-500">Pedidos (${currentMonthName})</p><p class="text-2xl font-bold text-indigo-600">${totalPedidosMes}</p><div class="chart-container mt-2"><canvas id="chart-fin-pedidos"></canvas></div></div> <!-- Card "Pedidos no Mês" -->
        </div>
         <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-center mt-4">
                     <div class="bg-green-100 p-4 rounded-lg shadow"><p class="text-sm font-medium text-green-700">Melhor Dia do Mês</p><p class="text-xl font-bold text-green-800">${melhorDia ? `Dia ${melhorDia} (${formatCurrency(maxSale)})` : '--'}</p></div>
                    <div class="bg-red-100 p-4 rounded-lg shadow"><p class="text-sm font-medium text-red-700">Pior Dia do Mês</p><p class="text-xl font-bold text-red-800">${piorDia && minSale !== Infinity ? `Dia ${piorDia} (${formatCurrency(minSale)})` : '--'}</p></div>
                </div>
                <div class="bg-white p-6 rounded-xl shadow-lg mt-8 h-[500px]"><canvas id="financial-unified-chart"></canvas></div>
            `;

            renderUnifiedFinancialChart(dailyRevenue, new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate());
            createOrUpdatePieChart('chart-fin-faturamento', [faturamentoMensal, storeSettings.monthlyGoal - faturamentoMensal], ['Faturado', 'Faltando'], ['#3b82f6', '#e5e7eb']);
            createOrUpdatePieChart('chart-fin-pago', [totalPago, totalAReceber], ['Pago', 'A Receber'], ['#22c55e', '#f97316']);
            createOrUpdatePieChart('chart-fin-areceber', [totalAReceber, totalPago], ['A Receber', 'Pago'], ['#f97316', '#22c55e']);
            createOrUpdatePieChart('chart-fin-pedidos', [totalPedidosMes], ['Pedidos'], ['#8b5cf6']);
            console.log("loadFinancialReport: Relatório financeiro carregado.");
        }

        function renderUnifiedFinancialChart(salesByDay, daysInMonth) {
            const labels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));
            const data = labels.map(day => salesByDay[day] || 0);

            let maxSale = 0;
            let minSale = Infinity;
            let bestDayLabel = '';
            let worstDayLabel = '';

            data.forEach((value, index) => {
                if(value > maxSale) {
                    maxSale = value;
                    bestDayLabel = labels[index];
                }
                if(value > 0 && value < minSale) {
                    minSale = value;
                    worstDayLabel = labels[index];
                }
            });

            const pointColors = {};
            if(bestDayLabel) pointColors[bestDayLabel] = '#22c55e';
            if(worstDayLabel && minSale !== Infinity) pointColors[worstDayLabel] = '#ef4444';

            const canvasElement = document.getElementById('financial-unified-chart');
            if (canvasElement) {
                createOrUpdateLineChart('financial-unified-chart', labels, data, 'Faturamento Diário (R$)', pointColors);
            } else {
                console.error("Canvas 'financial-unified-chart' não encontrado para renderizar o gráfico.");
            }
        }

        async function loadProductReport() {
            console.log("loadProductReport: Carregando relatório de produtos.");
            if (!dom.manager || !dom.manager.contentRelProdutos) {
                console.error("Elemento dom.manager.contentRelProdutos não encontrado.");
                return;
            }
            const container = dom.manager.contentRelProdutos;
            container.innerHTML = '<p class="text-center">Carregando dados de produtos...</p>';
            const orders = await fetchAllOrders(); // Busca todos os pedidos via serviço

            const productStats = {};
            const allProductsKnown = [
                ...(productsConfig.assados || []),
                ...(productsConfig.fritos || []),
                ...(productsConfig.revenda || []),
                ...(productsConfig.outros || [])
            ];
            allProductsKnown.forEach(p => {
                productStats[p.name] = { sold: 0, revenue: 0, dailySales: {} };
            });

            orders.forEach(order => {
                const orderDate = order.createdAt.toDate();
                const day = orderDate.toISOString().split('T')[0];
                const allItems = [...(order.items || [])];
                allItems.forEach(item => {
                    const name = item.isManual ? item.name : getProductInfoById(item.id).name;
                    if (!productStats[name]) {
                        productStats[name] = { sold: 0, revenue: 0, dailySales: {} };
                    }
                    productStats[name].sold += item.quantity;
                    productStats[name].revenue += item.subtotal;
                    productStats[name].dailySales[day] = (productStats[name].dailySales[day] || 0) + item.quantity;
                });
            });

            let productCardsHtml = '';
            Object.entries(productStats).sort((a,b) => b[1].revenue - a[1].revenue).forEach(([name, stats]) => {
                if (stats.sold > 0) {
                    productCardsHtml += `
                        <div class="bg-white p-4 rounded-lg shadow">
                            <h4 class="font-bold text-lg">${name}</h4>
                            <div class="grid grid-cols-2 gap-4 mt-2">
                                <div><p class="text-sm">Qtd. Vendida:</p><p class="font-bold">${stats.sold}</p></div>
                                <div><p class="text-sm">Faturado:</p><p class="font-bold">${formatCurrency(stats.revenue)}</p></div>
                            </div>
                            <div class="h-40 mt-4"><canvas id="chart-prod-${name.replace(/[\s/()]/g, '')}"></canvas></div>
                        </div>
                    `;
                }
            });

            container.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">${productCardsHtml}</div>`;

            Object.entries(productStats).forEach(([name, stats]) => {
                if (stats.sold > 0) {
                    const dailyData = Object.entries(stats.dailySales).sort((a,b) => new Date(a[0]) - new Date(b[0]));
                    const labels = dailyData.map(d => new Date(d[0]).toLocaleDateString('pt-BR'));
                    const data = dailyData.map(d => d[1]);
                    const canvasElement = document.getElementById(`chart-prod-${name.replace(/[\s/()]/g, '')}`);
                    if (canvasElement) {
                        createOrUpdateLineChart(`chart-prod-${name.replace(/[\s/()]/g, '')}`, labels, data, 'Vendas');
                    } else {
                        console.error(`Canvas 'chart-prod-${name.replace(/[\s/()]/g, '')}' não encontrado para renderizar o gráfico.`);
                    }
                }
            });
            console.log("loadProductReport: Relatório de produtos carregado.");
        }
        
        async function loadProfitMarginReport() {
            console.log("loadProfitMarginReport: Carregando relatório de margem de lucro.");
            const { profitMarginProductSelect, profitMarginPlaceholder, profitMarginChartContainer } = dom.manager;
            if (!profitMarginProductSelect || !profitMarginPlaceholder || !profitMarginChartContainer) {
                console.error("Elementos do relatório de margem de lucro não encontrados.");
                return;
            }

            // Limpa o conteúdo anterior
            profitMarginPlaceholder.classList.remove('hidden');
            profitMarginChartContainer.querySelector('canvas').classList.add('hidden');
            profitMarginProductSelect.innerHTML = '<option value="">-- Carregando produtos --</option>';

            try {
                // Preenche o seletor de produtos
                const allProducts = await fetchAllProductsWithStock();
                profitMarginProductSelect.innerHTML = '<option value="">-- Escolha um produto --</option>';
                allProducts.forEach(product => {
                    const option = document.createElement('option');
                    option.value = product.id;
                    option.textContent = product.name;
                    profitMarginProductSelect.appendChild(option);
                });

                // Adiciona o listener para o seletor
                profitMarginProductSelect.addEventListener('change', async (e) => {
                    const productId = e.target.value;
                    if (!productId) {
                        profitMarginPlaceholder.classList.remove('hidden');
                        profitMarginChartContainer.querySelector('canvas').classList.add('hidden');
                        return;
                    }
                    
                    profitMarginPlaceholder.textContent = 'Calculando margem de lucro...';
                    profitMarginPlaceholder.classList.remove('hidden');
                    profitMarginChartContainer.querySelector('canvas').classList.add('hidden');

                    try {
                        const monthlyData = await getMonthlyProfitMargin(productId);
                        if (monthlyData.length > 0) {
                            profitMarginPlaceholder.classList.add('hidden');
                            profitMarginChartContainer.querySelector('canvas').classList.remove('hidden');

                            const labels = monthlyData.map(d => d.month);
                            const profitData = monthlyData.map(d => d.profit);
                            const revenueData = monthlyData.map(d => d.revenue);

                            createOrUpdateBarChart('profit-margin-chart', labels, [
                                { label: 'Lucro Líquido', data: profitData, backgroundColor: '#22c55e' },
                                { label: 'Faturamento Bruto', data: revenueData, backgroundColor: '#3b82f6' }
                            ], 'Margem de Lucro Mensal (R$)', 'left');

                        } else {
                            profitMarginPlaceholder.textContent = 'Nenhum dado de venda encontrado para este produto.';
                            profitMarginPlaceholder.classList.remove('hidden');
                            profitMarginChartContainer.querySelector('canvas').classList.add('hidden');
                        }
                    } catch (error) {
                        console.error("Erro ao carregar dados de margem de lucro:", error);
                        profitMarginPlaceholder.textContent = 'Erro ao carregar dados. Verifique o console.';
                        profitMarginPlaceholder.classList.remove('hidden');
                        profitMarginChartContainer.querySelector('canvas').classList.add('hidden');
                    }
                });

            } catch (error) {
                console.error("Erro ao carregar lista de produtos para o relatório de margem:", error);
                profitMarginPlaceholder.textContent = 'Erro ao carregar a lista de produtos.';
                profitMarginPlaceholder.classList.remove('hidden');
            }
        }


        // --- Funções de Equipe ---
        function switchTeamReportTab(tabId) {
            console.log("switchTeamReportTab: Alternando aba do relatório da equipe:", tabId);
            if (!dom.manager || !dom.manager.tabEquipeDiario || !dom.manager.tabEquipeMensal || !dom.manager.contentEquipeDiario || !dom.manager.contentEquipeMensal) {
                console.error("Elementos da aba do relatório da equipe não encontrados.");
                return;
            }
            dom.manager.tabEquipeDiario.classList.remove('text-blue-600', 'border-blue-500');
            dom.manager.tabEquipeMensal.classList.remove('text-blue-600', 'border-blue-500');
            dom.manager.tabEquipeDiario.classList.add('text-gray-500', 'border-transparent');
            dom.manager.tabEquipeMensal.classList.add('text-gray-500', 'border-transparent');
            dom.manager.contentEquipeDiario.classList.add('hidden');
            dom.manager.contentEquipeMensal.classList.add('hidden');

            if (tabId === 'equipe-diario') {
                dom.manager.tabEquipeDiario.classList.remove('text-gray-500', 'border-transparent');
                dom.manager.tabEquipeDiario.classList.add('text-blue-600', 'border-blue-500');
                dom.manager.contentEquipeDiario.classList.remove('hidden');
                loadTeamDailyActivity();
            } else {
                dom.manager.tabEquipeMensal.classList.remove('text-gray-500', 'border-transparent');
                dom.manager.tabEquipeMensal.classList.add('text-blue-600', 'border-blue-500');
                dom.manager.contentEquipeMensal.classList.remove('hidden');
                loadTeamMonthlyActivity();
            }
        }

        async function showEmployeeMonthlyDetail(employeeName, monthInput) {
            console.log(`showEmployeeMonthlyDetail: Exibindo detalhes mensais para ${employeeName} em ${monthInput}.`);
            if (!dom.manager || !dom.manager.teamMemberDetailName || !dom.manager.teamMemberDetailContent || !dom.manager.teamMemberDetailModal) {
                console.error("Elementos do modal de detalhes mensais da equipe não encontrados.");
                return;
            }
            dom.manager.teamMemberDetailName.textContent = employeeName;
            const contentDiv = dom.manager.teamMemberDetailContent;
            contentDiv.innerHTML = '<p>Carregando detalhes...</p>';
            dom.manager.teamMemberDetailModal.classList.add('active');

            const [year, month] = monthInput.split('-');
            const startOfMonth = new Date(year, month - 1, 1);
            startOfMonth.setHours(0,0,0,0);
            const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);
            const daysInMonth = endOfMonth.getDate();

            const dailyStats = {};
            for (let i = 1; i <= daysInMonth; i++) {
                dailyStats[i] = { sales: 0, loggedInTimeMs: 0 };
            }

            console.log(`showEmployeeMonthlyDetail: Buscando pedidos para ${employeeName} entre ${startOfMonth.toLocaleString()} e ${endOfMonth.toLocaleString()}`);
            const orders = await fetchTeamActivityOrders(startOfMonth, endOfMonth, employeeName);
            console.log(`showEmployeeMonthlyDetail: ${orders.length} pedidos encontrados para ${employeeName} no mês.`);
            orders.forEach(order => {
                if (order.status !== 'cancelado') {
                    const day = order.createdAt.toDate().getDate();
                    dailyStats[day].sales += order.total;
                }
            });

            console.log(`showEmployeeMonthlyDetail: Buscando logs para ${employeeName} entre ${startOfMonth.toLocaleString()} e ${endOfMonth.toLocaleString()}`);
            const logs = await fetchTeamActivityLogs(startOfMonth, endOfMonth, employeeName);
            console.log(`showEmployeeMonthlyDetail: ${logs.length} logs encontrados para ${employeeName} no mês.`);
            const logsByDay = {};
            logs.forEach(log => {
                const day = log.timestamp.toDate().getDate();
                if (!logsByDay[day]) logsByDay[day] = [];
                logsByDay[day].push({ type: log.type, time: log.timestamp.toDate() });
            });
            console.log("showEmployeeMonthlyDetail: logsByDay:", logsByDay);

            Object.keys(logsByDay).forEach(day => {
                let totalLoggedInTimeMs = 0;
                let lastLoginTime = null;
                logsByDay[day].forEach(session => {
                    if (session.type === 'login') {
                        lastLoginTime = session.time;
                    } else if (session.type === 'logout' && lastLoginTime) {
                        totalLoggedInTimeMs += session.time - lastLoginTime;
                        lastLoginTime = null;
                    }
                });
                if (lastLoginTime && new Date(lastLoginTime).getDate() === new Date().getDate()) {
                    totalLoggedInTimeMs += new Date() - lastLoginTime;
                }
                dailyStats[day].loggedInTimeMs = totalLoggedInTimeMs;
            });
            console.log("showEmployeeMonthlyDetail: dailyStats final:", dailyStats);

            let tableHtml = `<table class="min-w-full bg-white text-sm">
                <thead class="bg-gray-200">
                    <tr>
                        <th class="py-2 px-3 text-left">Dia</th>
                        <th class="py-2 px-3 text-left">Tempo Logado</th>
                        <th class="py-2 px-3 text-left">Vendas Realizadas</th>
                    </tr>
                </thead><tbody>`;

            let hasDataToDisplay = false;
            for (let day = 1; day <= daysInMonth; day++) {
                const stats = dailyStats[day];
                const hours = Math.floor(stats.loggedInTimeMs / 3600000);
                const minutes = Math.floor((stats.loggedInTimeMs % 3600000) / 60000);
                const timeString = `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`;

                if (stats.sales > 0 || stats.loggedInTimeMs > 0) {
                    tableHtml += `<tr class="border-b">
                        <td class="py-2 px-3">${String(day).padStart(2, '0')}/${month}</td>
                        <td class="py-2 px-3">${timeString}</td>
                        <td class="py-2 px-3">${formatCurrency(stats.sales)}</td>
                    </tr>`;
                    hasDataToDisplay = true;
                }
            }
            tableHtml += '</tbody></table>';

            if (!hasDataToDisplay) {
                contentDiv.innerHTML = '<p class="text-center text-gray-500">Nenhum dado de atividade para este mês.</p>';
            } else {
                contentDiv.innerHTML = tableHtml;
            }
            console.log("showEmployeeMonthlyDetail: Detalhes mensais exibidos.");
        }

        export async function handleManagerAccess() {
            console.log("handleManagerAccess: Tentando acesso gerencial.");
            if (currentUser.role === 'funcionario') {
                const creds = await showCustomConfirm('Acesso Gerencial', 'Digite o usuário e senha da gerência.', { showInput: true });
                if (creds && creds.user.toLowerCase() === managerCredentials.user && creds.pass === managerCredentials.pass) {
                    if (dom.mainContent) { dom.mainContent.style.display = 'none'; }
                    if (dom.managerDashboard) { dom.managerDashboard.style.display = 'flex'; }
                    navigateToManagerView('dashboard');
                    console.log("handleManagerAccess: Acesso gerencial concedido.");
                } else if (creds) {
                    showToast('Credenciais incorretas.', 'error');
                    console.warn("handleManagerAccess: Credenciais gerenciais incorretas.");
                }
            }
        }

// --- NOVAS FUNÇÕES PARA A GESTÃO DE ALERTAS DO GERENTE ---

/**
 * Carrega e renderiza os alertas de dívidas na tela do gerente.
 */
async function loadAndRenderManagerAlerts() {
    console.log("manager.js: Carregando alertas para o gerente...");
    const tableBody = document.getElementById('manager-alerts-table-body');
    const sidebarBadge = document.getElementById('sidebar-alert-badge');

    if (!tableBody || !sidebarBadge) {
        console.error("Elementos da tabela de alertas ou badge não encontrados.");
        return;
    }

    tableBody.innerHTML = '<tr><td colspan="7" class="text-center p-4">Carregando alertas...</td></tr>';

    try {
        // fetchExpiredPendingOrders busca todos os pedidos com status 'devedor' e alerta não 'resolvido'
        const allPendingOrders = await fetchExpiredPendingOrders();
        
        // Filtramos para o gerente ver apenas os que foram encaminhados ou estão expirados
        managerAlerts = allPendingOrders.filter(order => 
            order.alertStatus === 'encaminhado_gerencia' || order.alertStatus === 'expirado'
        );

        // Atualiza o contador no menu lateral
        sidebarBadge.textContent = managerAlerts.length;
        sidebarBadge.classList.toggle('hidden', managerAlerts.length === 0);

        if (managerAlerts.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" class="text-center p-4">Nenhum alerta de dívida pendente.</td></tr>';
            return;
        }

        tableBody.innerHTML = managerAlerts.map(createManagerAlertRowHTML).join('');

    } catch (error) {
        console.error("Erro ao carregar alertas do gerente:", error);
        tableBody.innerHTML = '<tr><td colspan="7" class="text-center p-4 text-red-500">Falha ao carregar alertas.</td></tr>';
    }
}

/**
 * Cria o HTML para uma linha da tabela de alertas do gerente.
 * @param {object} order O objeto do pedido/alerta.
 * @returns {string} O HTML da linha da tabela.
 */
function createManagerAlertRowHTML(order) {
    const statusText = {
        'encaminhado_gerencia': 'Encaminhado',
        'expirado': 'Expirado'
    };
    const statusColor = {
        'encaminhado_gerencia': 'bg-blue-100 text-blue-800',
        'expirado': 'bg-yellow-100 text-yellow-800'
    };

    return `
        <tr class="border-b hover:bg-gray-50" data-order-id="${order.id}">
            <td class="py-2 px-3 font-mono">#${order.orderNumber}</td>
            <td class="py-2 px-3">${order.customer.name}</td>
            <td class="py-2 px-3">${order.createdBy?.name || 'N/A'}</td>
            <td class="py-2 px-3 text-right font-bold text-red-600">${formatCurrency(order.restante)}</td>
            <td class="py-2 px-3">${order.delivery.date}</td>
            <td class="py-2 px-3">
                <span class="px-2 py-1 text-xs font-semibold rounded-full ${statusColor[order.alertStatus] || 'bg-gray-200'}">
                    ${statusText[order.alertStatus] || order.alertStatus}
                </span>
            </td>
            <td class="py-2 px-3 text-center space-x-1">
                <button class="manager-alert-action-btn text-green-600 hover:text-green-800" title="Liquidar Dívida" data-action="liquidate"><i class="fas fa-dollar-sign pointer-events-none"></i></button>
                <button class="manager-alert-action-btn text-blue-600 hover:text-blue-800" title="Ver Pedido" data-action="view"><i class="fas fa-eye pointer-events-none"></i></button>
                <button class="manager-alert-action-btn text-gray-500 hover:text-gray-800" title="Arquivar Alerta" data-action="archive"><i class="fas fa-archive pointer-events-none"></i></button>
            </td>
        </tr>
    `;
}

/**
 * Manipula os cliques nos botões de ação na tabela de alertas do gerente.
 * @param {Event} e O objeto do evento de clique.
 */
async function handleManagerAlertAction(e) {
    const button = e.target.closest('.manager-alert-action-btn');
    if (!button) return;

    const row = button.closest('tr');
    const orderId = row.dataset.orderId;
    const action = button.dataset.action;

    const orderData = managerAlerts.find(o => o.id === orderId);
    if (!orderData) {
        return showToast("Erro: Dados do pedido não encontrados.", "error");
    }

    switch (action) {
        case 'liquidate': {
            const confirmedResult = await showCustomConfirm("Liquidar Dívida", `Confirmar a liquidação total do débito de ${formatCurrency(orderData.restante)} para o pedido #${orderData.orderNumber}?`);
            if (confirmedResult) { // CORREÇÃO: A confirmação simples retorna 'true', não um objeto.
                // CORREÇÃO: Chamando a função correta que liquida a dívida e resolve o alerta.
                await resolveExpiredOrder(orderId, orderData, currentUser);
                loadAndRenderManagerAlerts(); // Recarrega a lista
            }
            break;
        }
        case 'view': {
            // Abre o modal de detalhes do pedido, mantendo o gerente no painel.
            await showOrderDetailModal(orderId);
            break;
        }
        case 'archive': {
            const confirmed = await showCustomConfirm("Arquivar Alerta", `Tem certeza que deseja arquivar este alerta? Ele será removido da lista de pendências, mas o pedido continuará como devedor.`);
            if (confirmed && confirmed.confirmed) {
                await updateOrderAlertStatus(orderId, 'arquivado', currentUser);
                loadAndRenderManagerAlerts(); // Recarrega a lista
            }
            break;
        }
    }
}


// NOVO: Cria o HTML para um item de alerta de pedido expirado na Central de Alertas do PDV
export function createExpiredOrderAlertHTML(order) {
    const debito = formatCurrency(order.restante || 0);
    const vendedor = order.createdBy?.name || 'N/A'; // Pega o nome do vendedor

    return `
    <div class="bg-white p-4 rounded-lg shadow-md border border-gray-200" data-order-id="${order.id}">
        <div class="flex justify-between items-start">
            <div>
                <p class="font-bold text-gray-800">Pedido #${order.orderNumber} - ${order.customer.name}</p>
                <p class="text-sm text-gray-600">
                    Retirada: ${order.delivery.date} | 
                    Débito: <span class="font-semibold text-red-600">${debito}</span>
                </p>
                <p class="text-sm text-gray-500 mt-1">
                    Vendedor: <span class="font-medium">${vendedor}</span>
                </p>
            </div>
        </div>
        <div class="mt-3 flex justify-end gap-2">
            <button class="alert-action-btn bg-green-500 text-white text-xs px-3 py-1 rounded-md hover:bg-green-600" data-action="liquidate">
                <i class="fas fa-dollar-sign mr-1"></i>LIQUIDAR
            </button>
            <button class="alert-action-btn bg-blue-500 text-white text-xs px-3 py-1 rounded-md hover:bg-blue-600" data-action="view">
                <i class="fas fa-eye mr-1"></i>VER
            </button>
            <button class="alert-action-btn bg-orange-500 text-white text-xs px-3 py-1 rounded-md hover:bg-orange-600" data-action="send-manager">
                <i class="fas fa-user-shield mr-1"></i>ENVIAR GERENTE
            </button>
        </div>
    </div>
    `;
}

// --- FASE 2: SELETOR DE HORÁRIO INTERATIVO ---

/**
 * Busca os pedidos para uma data de retirada específica, sempre consultando o banco de dados.
 * @param {string} dateStringYYYYMMDD - A data no formato 'YYYY-MM-DD'.
 * @returns {Promise<Array>} - Uma lista de pedidos para a data.
 */
async function getOrdersForDate(dateStringYYYYMMDD) {
    // AÇÃO CORRETIVA DEFINITIVA: O cache (memória de pedidos) foi completamente removido.
    // A função agora SEMPRE busca os dados mais recentes do banco de dados para garantir
    // que pedidos recém-criados apareçam imediatamente na agenda.

    const [year, month, day] = dateStringYYYYMMDD.split('-');
    const dateStringDDMMYYYY = `${day}/${month}/${year}`;
    
    console.log(`BUSCA FORÇADA NO FIREBASE: Buscando pedidos para a data de retirada: ${dateStringDDMMYYYY}`);
    const ordersRef = collection(db, "orders");
    const q = query(ordersRef, where("delivery.date", "==", dateStringDDMMYYYY));
    
    const querySnapshot = await getDocs(q);
    const orders = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    return orders;
}

/**
 * Gera uma lista de horários em intervalos definidos.
 * @param {string} start - Hora de início (HH:MM).
 * @param {string} end - Hora de fim (HH:MM).
 * @param {number} intervalMinutes - Intervalo em minutos.
 * @returns {Array<string>} - Lista de horários.
 */
function generateTimeSlots(start, end, intervalMinutes) {
    const slots = [];
    let [startHour, startMin] = start.split(':').map(Number);
    const [endHour, endMin] = end.split(':').map(Number); // Corrigido aqui

    const currentTime = new Date();
    currentTime.setHours(startHour, startMin, 0, 0);

    const endTime = new Date();
    endTime.setHours(endHour, endMin, 0, 0);

    while (currentTime <= endTime) {
        slots.push(currentTime.toTimeString().substring(0, 5));
        currentTime.setMinutes(currentTime.getMinutes() + intervalMinutes);
    }
    return slots;
}

/**
 * Abre o seletor de horário interativo, opcionalmente adicionando um horário personalizado à lista.
 * @param {string|null} customTime - Um horário personalizado para adicionar (ex: "17:45").
 */
export async function openInteractiveTimeSelector(customTime = null) {
    const modal = document.getElementById('interactive-time-selector-modal');
    const container = document.getElementById('time-slots-container');
    const warningMessage = document.getElementById('time-selector-warning-message');
    const dateInput = dom.deliveryDate;
    // Novos elementos para data e total diário
    const selectedDateEl = document.getElementById('time-selector-selected-date');
    const dailyTotalEl = document.getElementById('time-selector-daily-total');

    if (!dateInput || !dateInput.value) {
        showToast("Por favor, selecione primeiro a data de retirada.", "info");
        return;
    }

    modal.classList.add('active');
    container.innerHTML = '<p class="text-center col-span-full">Calculando carga horária...</p>';

    // Pega a data e hora atuais para desabilitar horários passados
    const now = new Date();
    const todayString = getTodayDateString('yyyy-mm-dd');
    const isToday = dateInput.value === todayString;
    
    // ATUALIZA A DATA SELECIONADA GLOBALMENTE NO MANAGER.JS
    // Se a data mudou, limpa a lista de horários manuais para a data anterior
    if (currentSelectedDeliveryDate !== dateInput.value) {
        manuallyAddedTimeSlotsByDate.set(currentSelectedDeliveryDate, new Set()); // Limpa a entrada antiga
        currentSelectedDeliveryDate = dateInput.value; // Atualiza a data de referência
    }

    const ordersForDay = await getOrdersForDate(dateInput.value);

    // --- LÓGICA PARA EXIBIR DATA E TOTAL DE SALGADOS DO DIA ---
    // 1. Formata a data para exibição amigável (DD/MM/YYYY)
    const [year, month, day] = dateInput.value.split('-');
    const formattedDate = `${day}/${month}/${year}`;
    if (selectedDateEl) {
        selectedDateEl.innerHTML = `<span class="text-blue-600">${formattedDate}</span>`;
    }

    // 2. Calcula o total de salgados já finalizados para o dia inteiro
    const totalSalgadosDoDia = ordersForDay.reduce((total, order) => {
        if (order.status !== 'cancelado') {
            return total + getSalgadosCountFromItems(order.items);
        }
        return total;
    }, 0);
    // ATUALIZADO: Cor do total de salgados do dia para laranja e posição.
    dailyTotalEl.className = 'bg-orange-100 text-orange-800 text-sm font-bold px-4 py-2 rounded-full';
    dailyTotalEl.innerHTML = `<i class="fas fa-cookie-bite mr-2"></i> ${totalSalgadosDoDia} salgados`;
    // --- FIM DA LÓGICA ---

    const productionLimit = productionSettings.limit || 1200;
    const windowMinutes = productionSettings.windowMinutes || 30;
    const baseTimeSlots = generateTimeSlots('09:00', '19:00', 30);

    // Adiciona o horário personalizado à lista de horários manuais para a data atual, se não estiver lá
    if (customTime) { // Só adiciona se um customTime foi passado
        if (!manuallyAddedTimeSlotsByDate.has(currentSelectedDeliveryDate)) {
            manuallyAddedTimeSlotsByDate.set(currentSelectedDeliveryDate, new Set());
        }
        manuallyAddedTimeSlotsByDate.get(currentSelectedDeliveryDate).add(customTime);
    }

    // Combina os horários base com os horários adicionados manualmente para A DATA ATUAL
    const currentManualSlotsSet = manuallyAddedTimeSlotsByDate.get(currentSelectedDeliveryDate) || new Set();
    const allSlots = Array.from(new Set([...baseTimeSlots, ...Array.from(currentManualSlotsSet)]))
                          .filter(Boolean) // Remove valores nulos/vazios
                          .sort(); // Ordena cronologicamente (funciona para "HH:MM")

    let isAnySlotOverloaded = false;

    container.innerHTML = ''; // Limpa o "Carregando..."

    // Itera sobre a lista de horários combinada (padrão + personalizado)
    allSlots.forEach(slot => {
        let slotEl = document.createElement('button'); // Alterado para button para consistência
        slotEl.dataset.time = slot; // Garante que o dataset.time esteja sempre presente
        
        // Calcula a janela de tempo (ex: 30 min antes e 30 min depois)
        const slotTime = new Date(`${dateInput.value}T${slot}`);
        // Verifica se o horário já passou (apenas se a data selecionada for hoje)
        const isPast = isToday && slotTime < now;

        // Define a janela de contagem para este slot
        let countWindowStart = slotTime;
        let countWindowEnd = new Date(slotTime.getTime() + windowMinutes * 60000); // 30 minutos à frente

        // Se o slot for manual e não for um slot padrão (ex: 17:45), ajusta a janela para ser "focada" nele
        // Isso garante que 17:45 conte apenas pedidos em 17:45, e não se sobreponha ao 17:30
        const isStandardSlot = baseTimeSlots.includes(slot);
        if (!isStandardSlot) {
            // Para horários manuais, a janela de contagem é mais precisa em torno do próprio horário
            // Consideramos 15 minutos antes e 15 minutos depois para capturar pedidos próximos
            countWindowStart = new Date(slotTime.getTime() - (windowMinutes / 2) * 60000);
            countWindowEnd = new Date(slotTime.getTime() + (windowMinutes / 2) * 60000);
        }


        // Calcula a quantidade de salgados JÁ AGENDADOS para essa janela
        const existingSalgadosInWindow = ordersForDay.reduce((total, order) => {
            if (order.status !== 'cancelado' && order.delivery?.time) {
                const deliveryDateTime = new Date(`${dateInput.value}T${order.delivery.time.trim()}`);
                // Verifica se o horário do pedido está dentro da janela de contagem do slot.
                if (deliveryDateTime >= countWindowStart && deliveryDateTime < countWindowEnd) {
                    return total + getSalgadosCountFromItems(order.items); // Função utilitária para contar salgados
                }
            }
            return total;
        }, 0);

        const isOverloaded = existingSalgadosInWindow >= productionLimit;
        if (isOverloaded) isAnySlotOverloaded = true;

        // LÓGICA COMBINADA: Barra de progresso + Cores personalizadas (sem o limitador X/Y)
        const loadPercentage = Math.min(100, (existingSalgadosInWindow / productionLimit) * 100);
        let quantityColorClass = 'text-gray-500';
        let progressBarColor = 'bg-green-500'; // Verde para baixo
        let slotBgClass = 'bg-white border-gray-200 hover:bg-green-50 hover:border-green-400'; // Padrão para horários livres
        let slotCursorClass = 'cursor-pointer';
        let customIndicator = '';
        let title = `Selecionar ${slot}`;

        // 1. Define a cor de fundo com base na carga
        if (isOverloaded) {
            quantityColorClass = 'text-red-600 font-bold';
            progressBarColor = 'bg-red-500'; // Vermelho para lotado
            slotBgClass = 'bg-red-100 border-red-500';
        } else if (loadPercentage >= 50) { // A partir de 50% de ocupação
            quantityColorClass = 'text-orange-600 font-semibold'; // Laranja para texto
            progressBarColor = 'bg-orange-500'; // Laranja para barra
            slotBgClass = 'bg-orange-50 border-orange-300 hover:bg-orange-100';
        } else if (existingSalgadosInWindow > 0) { // Ocupação baixa
            quantityColorClass = 'text-blue-700 font-semibold'; // Azul para texto
            progressBarColor = 'bg-blue-500'; // Azul para barra
            slotBgClass = 'bg-blue-50 border-blue-300 hover:bg-blue-100';
        }

        // 2. Adiciona o destaque para o horário personalizado, sem sobrescrever a cor de fundo
        if (currentManualSlotsSet.has(slot) && !isPast) { // Verifica se é um horário manual para a data atual
            slotBgClass += ' highlight-slot'; // Usa a classe CSS para o destaque
            customIndicator = '<span class="absolute top-1 right-1 text-xs bg-indigo-500 text-white rounded-full px-1.5 py-0.5" title="Horário Personalizado"><i class="fas fa-star"></i></span>';
            // Adiciona um ID único para permitir o scroll automático
            slotEl.id = 'custom-time-slot';
        }

        // 3. Sobrescreve tudo se o horário já passou
        if (isPast) {
            slotBgClass = 'bg-gray-200 border-gray-300 text-gray-400';
            slotCursorClass = 'cursor-not-allowed';
            progressBarColor = 'bg-gray-400';
            quantityColorClass = 'text-gray-400';
            title = 'Este horário já passou.';
        }

        slotEl.className = `time-slot-btn flex flex-col items-center justify-center p-3 border rounded-lg transition-all duration-200 ${slotBgClass} ${slotCursorClass}`;
        slotEl.title = title;
        slotEl.innerHTML = `
            <div class="flex justify-between items-center mb-1.5 w-full">
                <div class="font-bold text-lg mr-2">${slot}</div> <!-- Adicionado mr-2 para espaçamento -->
                <strong class="${quantityColorClass} text-xl flex-shrink-0">${existingSalgadosInWindow}</strong> <!-- Adicionado flex-shrink-0 -->
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2.5">
                <div class="h-2.5 rounded-full ${progressBarColor}" style="width: ${loadPercentage}%"></div>
            </div>
            ${customIndicator}
        `;
        slotEl.addEventListener('click', () => {
            // Impede a seleção de horários passados
            if (isPast) {
                showToast('Este horário já passou e não pode ser selecionado.', 'info');
                return;
            }
            if (dom.deliveryTime) {
                dom.deliveryTime.value = slot;
                // Dispara um evento para que outras partes da UI (como o botão de limpar) possam reagir.
                dom.deliveryTime.dispatchEvent(new Event('input', { bubbles: true }));
            }
            modal.classList.remove('active');
            // Limpa o campo manual ao selecionar um horário
            document.getElementById('manual-time-input').value = '';
        });
        container.appendChild(slotEl);
    });

    // NOVO: Rola a visualização para o horário personalizado, se houver um.
    if (customTime) {
        const customSlotElement = document.getElementById('custom-time-slot');
        if (customSlotElement) {
            // A função é chamada dentro de um setTimeout para garantir que o DOM foi renderizado
            // e o scroll seja suave após a abertura do modal.
            setTimeout(() => {
                customSlotElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100); // Um pequeno delay ajuda na transição visual
        }
    }

    if (isAnySlotOverloaded) {
        const totalWindow = windowMinutes * 2;
        warningMessage.innerHTML = `
            <div class="flex items-start">
                <i class="fas fa-exclamation-triangle mr-3 text-xl text-amber-600 mt-1"></i>
                <div class="text-amber-900">
                    <strong class="block">Atenção: Alguns horários já estão com alta demanda.</strong>
                    <span class="block text-base mt-1">
                        O limite para a janela de ${totalWindow} min é de <strong class="text-lg">${productionLimit}</strong> salgados.
                    </span>
                    <span class="block mt-1">Considere sugerir um horário alternativo para o cliente.</span>
                </div>
            </div>
        `;
    }
    warningMessage.classList.toggle('hidden', !isAnySlotOverloaded);
}

/**
 * Calcula a carga total de salgados (existentes + atuais) para uma janela de horário específica.
 * Usado para a verificação final antes de salvar/atualizar um pedido.
 * @param {string} deliveryDateStr - A data de retirada no formato 'YYYY-MM-DD'.
 * @param {string} deliveryTimeStr - A hora da retirada no formato 'HH:MM'.
 * @param {Array} currentOrderItems - A lista de itens do pedido atual.
 * @param {string|null} orderIdToExclude - O ID do pedido a ser excluído da contagem (para edições).
 * @returns {Promise<{totalLoad: number, existingLoad: number, currentLoad: number, limit: number}>}
 */
export async function calculateWindowLoad(deliveryDateStr, deliveryTimeStr, currentOrderItems, orderIdToExclude = null) {
    const ordersForDay = await getOrdersForDate(deliveryDateStr);
    const limit = productionSettings.limit || 1200;
    const windowMinutes = productionSettings.windowMinutes || 30;

    const targetTime = new Date(`${deliveryDateStr}T${deliveryTimeStr.trim()}`);
    const windowStart = new Date(targetTime.getTime() - windowMinutes * 60000);
    const windowEnd = new Date(targetTime.getTime() + windowMinutes * 60000);

    // 1. Calcula salgados existentes na janela, excluindo o pedido atual se for uma edição.
    const existingLoad = ordersForDay.reduce((total, order) => {
        if (order.id === orderIdToExclude) return total; // Exclui o próprio pedido da contagem

        if (order.status !== 'cancelado' && order.delivery?.time) {
            const deliveryDateTime = new Date(`${deliveryDateStr}T${order.delivery.time.trim()}`);
            if (deliveryDateTime >= windowStart && deliveryDateTime < windowEnd) {
                return total + getSalgadosCountFromItems(order.items);
            }
        }
        return total;
    }, 0);

    // 2. Calcula salgados do pedido atual
    const currentLoad = getSalgadosCountFromItems(currentOrderItems);

    // 3. Soma tudo
    const totalLoad = existingLoad + currentLoad;

    return { totalLoad, existingLoad, currentLoad, limit };
}
