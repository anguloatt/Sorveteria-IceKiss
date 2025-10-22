import {
    getDocs, collection, query, where, onSnapshot, doc, getDoc, writeBatch,
    collection as firestoreCollection, updateDoc as firestoreUpdateDoc, increment, deleteDoc
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { db } from './firebase-config.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';

import { loadOrderIntoForm } from './pdv.js'; // Importo a função para carregar um pedido diretamente no formulário do PDV.
import { dom } from './domRefs.js'; // Importo o meu objeto centralizado de referências do DOM.
import {
    showCustomConfirm, showToast,
    formatCurrency, parseCurrency, getTodayDateString,
    formatDateToBR, formatDateTimeToBR, getProductInfoById, generatePrintableTicketText,
    generateTicketText, getSalgadosCountFromItems, formatInputAsCurrency,
    printTomorrowReminderList,
    openWhatsappModal,
    sendGroupWhatsapp
} from './utils.js';
import {
    currentUser, productsConfig, storeSettings, charts, setCategoryConfig, categoryConfig,
    managerCredentials, masterCredentials, productionSettings,
    setManagerEconomyMode, getManagerEconomyMode
} from './app.js'; // Importo as variáveis globais do app.js.
import {
    fetchAllOrders, reactivateOrder, releaseOrderForEdit, fetchClients,
    saveTicketSettings as firebaseSaveTicketSettings, serverTimestamp, logActivity,
    saveSystemSettings as firebaseSaveSystemSettings, saveManagerPassword as firebaseSaveManagerPassword,
    updateProductStock,
    clearDatabase as firebaseClearDatabase,
    fetchTeamActivityLogs,
    fetchTeamActivityOrders,
    fetchAllProductsWithStock,
    fetchExpiredPendingOrders,
    updateOrderAlertStatus,
    resolveExpiredOrder,
    fetchStockLogs,
    getMonthlyProfitMargin,
    fetchProductPriceHistory,
    addClient as addClientSvc,
    updateClientByPhone as updateClientByPhoneSvc,
    deleteClientByPhone as deleteClientByPhoneSvc,
} from './firebaseService.js';

import { loadEmployees, renderEmployeesManagerTab, addEmployee as employeeManagementAddEmployee, editEmployee as employeeManagementEditEmployee, deleteEmployee as employeeManagementDeleteEmployee, resetEmployeePassword, saveProductionSettings } from './employeeManagement.js';

import { initActivityLogView } from './activityLog.js';

import { initializeOrdersView, stopOrdersListener, renderGerencialDashboard, onManagerEconomyModeChanged } from './manager-realtime.js';

import { createClientGrowthChart, createClientSegmentationChart } from './charts.js';
import { toggleManagerSidebar, filterManagerOrdersTable } from './manager-ui.js';
import { saveManagerConfig, renderManagerCardapioTabs, switchManagerCardapioTab, loadManagerCardapio, openCategoryManager, saveCategoryConfig } from './manager-products.js';
import * as clientsModule from './manager-clients.js';
let stockLogs = []; // Faço cache dos logs de estoque para a view de histórico.
let managerAlerts = []; // Armazeno os alertas para a view do gerente.
let customerAnalysisDataLoaded = false; // Flag para controlar o carregamento sob demanda.
let draggedItem = null; // Para a funcionalidade de arrastar e soltar (drag-and-drop)

let currentManagerView = null; // NOVO: Rastreia a view atual para gerenciar listeners.

let manuallyAddedTimeSlotsByDate = new Map();
let currentSelectedDeliveryDate = ''; // Uso para rastrear a data atualmente selecionada no PDV.

function updateEconomyModeUI(enabled) {
    if (!dom.manager) return;
    const statusBadge = dom.manager.economyStatusBadge;
    const toggleBtn = dom.manager.economyToggleBtn;
    if (statusBadge) {
        const baseClasses = 'inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide';
        statusBadge.className = `${baseClasses} ${enabled ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`;
        statusBadge.textContent = enabled ? 'ATIVO' : 'DESATIVADO';
    }
    if (toggleBtn) {
        toggleBtn.textContent = enabled ? 'Desativar Modo Economia' : 'Ativar Modo Economia';
        toggleBtn.className = `w-full md:w-auto px-5 py-2 rounded-lg font-semibold transition-colors text-white ${enabled ? 'bg-amber-600 hover:bg-amber-700' : 'bg-green-600 hover:bg-green-700'}`;
        toggleBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    }
}

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

export function applyRolePermissions(user) {
    console.log(`applyRolePermissions: Aplicando permissões para o cargo: ${user.role}`);

const permissions = {
        estoquista: ['estoque', 'impressao'],
        gerente: ['gerencial-dashboard', 'pedidos', 'estoque', 'cardapio', 'clientes', 'equipe', 'impressao', 'sistema', 'log-atividades', 'alertas'],
        mestra: ['gerencial-dashboard', 'pedidos', 'estoque', 'cardapio', 'clientes', 'equipe', 'impressao', 'sistema', 'log-atividades', 'master-reset', 'alertas']
    };

const userPermissions = permissions[user.role];

if (!userPermissions) {
        dom.manager.sidebar.querySelectorAll('.sidebar-link').forEach(link => {
            if (link.id !== 'manager-logout-btn') link.style.display = 'none';
        });
        if (dom.manager.goToPdvBtn) dom.manager.goToPdvBtn.style.display = 'none';
        console.warn(`applyRolePermissions: Nenhuma permissão definida para o cargo '${user.role}'. Acesso negado.`);
        return;
    }

dom.manager.sidebar.querySelectorAll('.sidebar-link').forEach(link => {
        const view = link.dataset.view;
        link.style.display = userPermissions.includes(view) || link.id === 'manager-logout-btn' ? 'flex' : 'none';
    });

if (dom.manager.goToPdvBtn) {
        dom.manager.goToPdvBtn.style.display = user.role === 'gerente' || user.role === 'mestra' ? 'block' : 'none';
    }

if (dom.manager.riskZone) {
        dom.manager.riskZone.style.display = user.role === 'mestra' ? 'block' : 'none';
    }

console.log(`applyRolePermissions: Permissões para '${user.role}' aplicadas.`);
}

export function triggerNotificationAnimation() {
    const bellBtn = dom.notifications.bellBtn;
    if (!bellBtn) return;

bellBtn.classList.add('animate-shake');

setTimeout(() => {
        bellBtn.classList.remove('animate-shake');
    }, 1000);
}

export async function navigateToManagerView(view) {
    if (currentManagerView === 'pedidos') {
        stopOrdersListener();
    }

console.log("navigateToManagerView: Navegando para a view:", view);
    if (!dom.manager || !dom.manager.sidebar) {
        console.error("Elementos da sidebar do gerente não encontrados.");
        return;
    }
    dom.manager.sidebar.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
    const link = dom.manager.sidebar.querySelector(`[data-view="${view}"]`);
    if(link) link.classList.add('active');

document.querySelectorAll('#manager-main-content > div, #gerencial-dashboard-screen').forEach(v => {
        v.classList.add('hidden');
        v.style.display = 'none';
    });

const viewEl = document.getElementById(`view-${view}`) || document.getElementById(`${view}-screen`);
    if(viewEl) {
        viewEl.classList.remove('hidden');
        viewEl.style.display = '';
    } else {
        console.error(`Elemento da view com ID 'view-${view}' ou '${view}-screen' não encontrado.`);
    }

const titles = {
        'gerencial-dashboard': { title: "Análise e Dashboards", subtitle: "Visão completa do seu negócio com KPIs, gráficos e IA." },
        pedidos: { title: "Gestão de Pedidos", subtitle: "Visualize e gerencie todos os pedidos." },
        alertas: { title: "Alertas de Dívidas", subtitle: "Gerencie pedidos com pagamentos pendentes ou expirados." },
        estoque: { title: "Controle de Estoque", subtitle: "Adicione novas quantidades e visualize o estoque atual." },
        cardapio: { title: "Gestão de Cardápio", subtitle: "Adicione, edite e defina preços dos produtos." },
        clientes: { title: "Base de Clientes", subtitle: "Gerencie seus clientes e o relacionamento." },
        equipe: { title: "Desempenho da Equipe", subtitle: "Acompanhe a produtividade e os registros da equipe." },
        impressao: { title: "Configurações de Impressão", subtitle: "Personalize o cabeçalho e rodapé dos tickets." },
        sistema: { title: "Configurações do Sistema", subtitle: "Gerencie a segurança e os dados do aplicativo." },
        'master-reset': { title: "Acesso Mestra", subtitle: "Redefina a senha do usuário gerencial."}
    };

if (view === 'log-atividades') {
        initActivityLogView();
    }
    if(dom.manager && dom.manager.pageTitle && dom.manager.pageSubtitle && titles[view]) {
        dom.manager.pageTitle.textContent = titles[view].title;
        dom.manager.pageSubtitle.textContent = titles[view].subtitle;
    }

if (view === 'pedidos') {
        initializeOrdersView();
    }
    if (view === 'estoque') {
        switchStockTab('repo');
    }
    if (view === 'gerencial-dashboard') {
        renderGerencialDashboard();
    }
    if (view === 'cardapio') {
        renderManagerCardapioTabs(); // Renderiza as abas dinamicamente
        const firstVisibleCategory = Array.isArray(categoryConfig) ? [...categoryConfig].sort((a,b) => (a.order||0)-(b.order||0)).find(c => c.visible) : null;
        if (firstVisibleCategory) {
            switchManagerCardapioTab(firstVisibleCategory.id);
        } else {
            dom.manager.managerProductsList.innerHTML = '<div class="text-center p-8 text-gray-500">Nenhuma categoria visível. Gerencie as categorias para exibir produtos.</div>';
        }
        loadAndRenderManagerAlerts();
    }
    if (view === 'clientes') {
        const clientsModule = await import('./manager-clients.js');
        await clientsModule.loadClients();
    }
    if (view === 'equipe') {
        console.log("navigateToManagerView: Navegando para a view 'equipe'.");
        if (dom.manager && dom.manager.equipeMonthPicker) {
            dom.manager.equipeMonthPicker.value = getTodayDateString('yyyy-mm-dd').substring(0, 7);
        }
        switchTeamReportTab('equipe-diario');
        const allOrders = await fetchAllOrders();
        renderEmployeesManagerTab(allOrders);
    }
    if (view === 'impressao') loadTicketSettings();
    if (view === 'sistema') loadSystemSettings();
    if (view === 'alertas') loadAndRenderManagerAlerts();

if (window.innerWidth < 1024 && dom.manager && dom.manager.sidebar && dom.manager.sidebar.classList.contains('open')) {
        toggleManagerSidebar();
    }

currentManagerView = view; // Atualiza a view atual no final da navegação.
}

export function setupManagerDashboardListeners() {
    console.log("setupManagerDashboardListeners: Configurando listeners de eventos do painel do gerente.");

const essentialManagerElements = [
        dom.manager.sidebar, dom.manager.menuBtn, dom.manager.overlay,
        dom.manager.saveNewPassBtn, dom.manager.saveProductsBtn, dom.manager.addProductBtn,
        dom.manager.managerProductsList, dom.manager.saveTicketBtn,
        dom.manager.saveNewPassSystemBtn, dom.manager.clearDataConfirmInput, dom.manager.clearDataBtn,
        dom.manager.goToPdvBtn, dom.manager.filterSearchAll, dom.manager.clearFiltersBtn,
        dom.manager.tabEquipeDiario, dom.manager.tabEquipeMensal, dom.manager.selectAllClientsCheckbox, dom.manager.clientsTableBody,
        dom.manager.teamMemberDetailCloseBtn,
        dom.manager.equipeMonthPicker,
        dom.manager.addEmployeeBtn,
        dom.manager.employeeListTableBody,
        dom.manager.changePassNew,
        dom.manager.changePassConfirm,
        dom.manager.stockManagementTableBody,
        dom.manager.tabStockRepo,
        dom.manager.tabStockHistory,
        dom.manager.contentStockRepo,
        dom.manager.contentStockHistory,
        dom.manager.stockHistoryTableBody
    ];
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
        const activeTab = document.getElementById('manager-cardapio-tab-container')?.querySelector('.active-tab-manager');
        if (activeTab) {
            const category = activeTab.dataset.category;
            dom.manager.managerProductsList.appendChild(createProductConfigRow({ id: "prod_" + Date.now(), name: "", price: 0, category: category }, category));
        }
    });

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
            removeBtn.closest(".product-config-row-wrapper").remove();
            return;
        }

const historyBtn = e.target.closest(".price-history-btn");
        if (historyBtn) {
            const productId = historyBtn.dataset.productId;
            const productName = historyBtn.dataset.productName;
            showPriceHistoryModal(productId, productName);
        }
    });

dom.manager.managerProductsList.addEventListener('click', e => {
        const toggleBtn = e.target.closest(".toggle-active-btn");
        if (!toggleBtn) return;

const rowWrapper = toggleBtn.closest('.product-config-row-wrapper');
        const rowDiv = toggleBtn.closest('.product-config-row');
        const icon = toggleBtn.querySelector('i');

const wasActive = rowWrapper.dataset.active === 'true';
        const isActive = !wasActive;

rowWrapper.dataset.active = isActive;
        rowDiv.classList.toggle('product-inactive', !isActive);
        rowDiv.classList.toggle('opacity-60', !isActive);

toggleBtn.classList.toggle('text-green-500', isActive);
        toggleBtn.classList.toggle('hover:text-green-700', isActive);
        toggleBtn.classList.toggle('text-gray-400', !isActive);
        toggleBtn.classList.toggle('hover:text-gray-600', !isActive);

icon.classList.toggle('fa-eye', isActive);
        icon.classList.toggle('fa-eye-slash', !isActive);

toggleBtn.title = isActive ? 'Desativar Produto' : 'Ativar Produto';
    });

dom.manager.saveTicketBtn.addEventListener('click', saveTicketSettings);
    dom.manager.saveGoalBtn.addEventListener('click', saveSystemSettings);

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
        await logActivity(currentUser.name, 'Alterou Senha da Gerência');
        dom.manager.changePassNew.value = '';
        dom.manager.changePassConfirm.value = '';
    });

    if (dom.manager.economyToggleBtn) {
        dom.manager.economyToggleBtn.addEventListener('click', () => {
            setManagerEconomyMode(!getManagerEconomyMode());
        });

        updateEconomyModeUI(getManagerEconomyMode());
    }

    if (typeof window !== 'undefined' && !window.__icekissEconomyListenerBound) {
        window.addEventListener('manager-economy-mode-changed', (event) => {
            const enabled = event?.detail?.enabled ?? getManagerEconomyMode();
            updateEconomyModeUI(enabled);
            onManagerEconomyModeChanged(enabled);

            if (currentManagerView === 'pedidos') {
                stopOrdersListener();
                initializeOrdersView();
            } else if (currentManagerView === 'gerencial-dashboard') {
                renderGerencialDashboard();
            }

            showToast(enabled ? 'Modo economia ativado: o painel agora evita leituras desnecessárias.' : 'Modo economia desativado: o painel voltará a carregar dados completos.', enabled ? 'info' : 'success');
        });
        window.__icekissEconomyListenerBound = true;
    }

dom.manager.clearDataBtn.addEventListener('click', async () => {
        const confirmText = dom.manager.clearDataConfirmInput.value;
        if (confirmText !== 'APAGAR TUDO') {
            showToast("Digite 'APAGAR TUDO' para confirmar.", "error");
            return;
        }

const confirmed = await showCustomConfirm(
            "Confirmação de Segurança",
            "Para limpar o banco de dados, você deve confirmar sua senha de gerência.",
            { showInput: true, passwordRequired: true }
        );

if (confirmed) {
            firebaseClearDatabase();
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
        try { filterManagerOrdersTable(); } catch (e) { console.warn('filterManagerOrdersTable não disponível no momento.'); }
    });

dom.manager.selectAllClientsCheckbox.addEventListener('change', (e) => {
        document.querySelectorAll('.client-checkbox').forEach(cb => cb.checked = e.target.checked);
    });

dom.manager.teamMemberDetailCloseBtn.addEventListener('click', () => dom.manager.teamMemberDetailModal.classList.remove('active'));

dom.manager.storeNameInput.addEventListener('input', updateTicketPreview);
    dom.manager.storePhoneInput.addEventListener('input', updateTicketPreview);
    dom.manager.ticketTitleInput.addEventListener('input', updateTicketPreview);
    dom.manager.ticketSubtitleInput.addEventListener('input', updateTicketPreview);
    dom.manager.footerMsgInput.addEventListener('input', updateTicketPreview);
    dom.manager.printUnitPriceCheckbox.addEventListener('change', updateTicketPreview);
    document.getElementById('manager-kibe-print-size').addEventListener('change', updateTicketPreview);

if (dom.manager.firebaseAccessBtn) {
        dom.manager.firebaseAccessBtn.addEventListener('click', () => {
            window.open("https://console.firebase.google.com/u/0/project/sorveteria-ice-kiss/overview", "_blank");
        });
    }

const manageCategoriesBtn = document.getElementById('manage-categories-btn');
    if (manageCategoriesBtn) {
        manageCategoriesBtn.addEventListener('click', openCategoryManager);
    }
    const categoryManagerSaveBtn = document.getElementById('category-manager-save-btn');
    if (categoryManagerSaveBtn) {
        categoryManagerSaveBtn.addEventListener('click', saveCategoryConfig);
    }
    const categoryManagerCancelBtn = document.getElementById('category-manager-cancel-btn');
    if (categoryManagerCancelBtn) {
        categoryManagerCancelBtn.addEventListener('click', () => {
            const modal = document.getElementById('category-manager-modal');
            if (modal) modal.classList.remove('active');
        });
    }

dom.manager.addEmployeeBtn.addEventListener('click', async () => {
        const nameInput = document.getElementById('new-employee-name');
        const roleSelect = document.getElementById('new-employee-role');
        if (nameInput && roleSelect) {
            await employeeManagementAddEmployee(nameInput.value, roleSelect.value);
        }
    });
    dom.manager.employeeListTableBody.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.edit-employee-btn');
        const deleteBtn = e.target.closest('.delete-employee-btn');
        const resetBtn = e.target.closest('.reset-password-btn');

if (editBtn) {
            const { employeeId, employeeName } = editBtn.dataset;
            const newName = prompt(`Editar nome do funcionário:`, employeeName);
            const newRole = prompt(`Editar cargo (caixa, estoquista, gerente):`, editBtn.dataset.employeeRole);
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
                    loadStockManagementView();
                } catch (error) {
                    showToast("Falha ao atualizar o estoque.", "error");
                    console.error("Erro ao salvar estoque:", error);
                    e.target.disabled = false;
                    e.target.textContent = 'Adicionar';
                }
            }
        });
    }

if (dom.manager.detailCloseBtn) dom.manager.detailCloseBtn.addEventListener('click', () => dom.manager.orderDetailModal.classList.remove('active'));

const alertsTableBody = document.getElementById('manager-alerts-table-body');
    if (alertsTableBody) {
        alertsTableBody.addEventListener('click', handleManagerAlertAction);
    }

    if (dom.manager.detailReactivateBtn) {
        dom.manager.detailReactivateBtn.addEventListener('click', async (e) => {
            const orderId = e.currentTarget.dataset.orderId;
            const confirmed = await showCustomConfirm("Reativar Pedido", "Tem certeza que deseja reativar este pedido?");
            if (confirmed) {
                try {
                    await reactivateOrder(orderId, currentUser);
                    dom.manager.orderDetailModal.classList.remove('active');
                    // Atualização em tempo real já lida pelo listener; remoção de chamada inexistente loadAllOrders().
                } catch (error) {
                    console.error("Erro ao reativar pedido:", error);
                }
            }
        });
    }
    if (dom.manager.detailReleaseEditBtn) {
        dom.manager.detailReleaseEditBtn.addEventListener('click', async (e) => {
            const orderId = e.currentTarget.dataset.orderId;
            const confirmed = await showCustomConfirm("Liberar Edição", "Tem certeza que deseja liberar este pedido para edição no PDV?");
            if (confirmed) {
                try {
                    await releaseOrderForEdit(orderId, currentUser);
                    dom.manager.orderDetailModal.classList.remove('active');
                    // Removido loadAllOrders() inexistente.
                } catch (error) {
                    console.error("Erro ao liberar edição:", error);
                }
            }
        });
    }

if (dom.manager.tabStockRepo) {
        dom.manager.tabStockRepo.addEventListener('click', () => switchStockTab('repo'));
    }
    if (dom.manager.tabStockHistory) {
        dom.manager.tabStockHistory.addEventListener('click', () => switchStockTab('history'));
    }
    if (dom.manager.stockHistoryFilter) {
        dom.manager.stockHistoryFilter.addEventListener('change', renderStockHistoryTable);
    }

if (dom.alerts.modal) {
        dom.alerts.modal.addEventListener('click', async (e) => {
            const button = e.target.closest('button');
            if (!button) return;

const alertItem = button.closest('[data-order-id]');
            if (!alertItem) {
                return;
            }

const orderId = alertItem.dataset.orderId;
            const orderData = managerAlerts.find(o => o.id === orderId);

if (!orderData) {
                showToast("Erro: Dados do pedido não encontrados.", "error");
                return;
            }

switch(button.dataset.action) {
                case 'liquidate': {
                    const confirmed = await showCustomConfirm(
                        "Liquidar Dívida",
                        `Confirmar a liquidação total do débito de ${formatCurrency(orderData.restante)} para o pedido #${orderData.orderNumber}?`
                    );
                    if (confirmed) {
                        try {
                            await resolveExpiredOrder(orderId, orderData, currentUser);
                            await logActivity(currentUser.name, 'Liquidou Dívida (Alerta)', {
                                pedido: orderData.orderNumber,
                                cliente: orderData.customer.name,
                                valor: formatCurrency(orderData.restante)
                            });
                            loadAndRenderManagerAlerts();
                            showToast("Dívida liquidada com sucesso!", "success");
                        } catch (error) {
                            console.error("Erro ao liquidar dívida do alerta:", error);
                            showToast("Falha ao liquidar dívida.", "error");
                        }
                    }
                    break;
                }
                case 'view': {
                    goToPdv();
                    loadOrderIntoForm(orderData);
                    dom.alerts.modal.classList.remove('active');
                    break;
                }
                case 'send-manager': {
                     const confirmed = await showCustomConfirm(
                        "Encaminhar para Gerente",
                        `Encaminhar o alerta do pedido #${orderData.orderNumber} para a gerência?`
                    );
                    if (confirmed) {
                        try {
                            await updateOrderAlertStatus(orderId, 'encaminhado_gerencia', currentUser);
                            loadAndRenderManagerAlerts();
                            showToast("Alerta encaminhado para a gerência!", "info");
                        } catch (error) {
                            console.error("Erro ao encaminhar alerta:", error);
                            showToast("Falha ao encaminhar alerta.", "error");
                        }
                    }
                    break;
                }
            }
        });
    }

}

export async function showOrderDetailModal(orderId) {
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
        const itemName = item.isManual ? item.name : getProductInfoById(item.id)?.name || 'Produto Desconhecido';
        return `<div class="flex justify-between text-sm"><p>${item.quantity} ${itemName}</p><p>${formatCurrency(item.subtotal)}</p></div>`;
    }).join('');

let observationsHtml = '';
    if (order.observations) {
        observationsHtml = `
            <hr class="my-4">
            <div><p class="font-semibold">Observações:</p><p class="bg-yellow-50 p-2 rounded border border-yellow-200 text-gray-700 whitespace-pre-wrap">${order.observations}</p></div>
        `;
    }

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
        ${observationsHtml}
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

async function loadClients() {
    // Delegate loading to the centralized clients module to avoid duplicate state.
    if (clientsModule && typeof clientsModule.loadClients === 'function') {
        return clientsModule.loadClients();
    }
    console.warn('manager.js: clientsModule.loadClients not available; skipping loadClients.');
}

// --- Delegators to centralized client module (manager-clients.js) ---
// Guarded delegators: call exported function if present, otherwise log a warning
// so the UI doesn't throw when a specific helper wasn't exported yet.
function _callClientFn(name, args) {
    const fn = clientsModule && clientsModule[name];
    if (typeof fn === 'function') return fn(...args);
    console.warn(`manager.js: clientsModule.${name} is not exported; call skipped.`);
    return undefined;
}

function renderAlphaTabs(...args) { return _callClientFn('renderAlphaTabs', args); }
function renderClientsTable(...args) { return _callClientFn('renderClientsTable', args); }
function renderClientsTableWithFilters(...args) { return _callClientFn('renderClientsTableWithFilters', args); }
function getClientStatus(...args) { return _callClientFn('getClientStatus', args); }
function getClientStatusType(...args) { return _callClientFn('getClientStatusType', args); }
function getClientFrequency(...args) { return _callClientFn('getClientFrequency', args); }
function getClientPhones(...args) { return _callClientFn('getClientPhones', args); }
function formatPhone(...args) { return _callClientFn('formatPhone', args); }
function setupClientsEvents(...args) { return _callClientFn('setupClientsEvents', args); }
function sendToGoodClients(...args) { return _callClientFn('sendToGoodClients', args); }
function applyAdvancedFilters(...args) { return _callClientFn('applyAdvancedFilters', args); }
function clearAdvancedFilters(...args) { return _callClientFn('clearAdvancedFilters', args); }
function openClientEditModal(...args) { return _callClientFn('openClientEditModal', args); }
function setupMarketingModalsEvents(...args) { return _callClientFn('setupMarketingModalsEvents', args); }
function openWhatsappSendModal(...args) { return _callClientFn('openWhatsappSendModal', args); }
function setupWhatsappSendModalEvents(...args) { return _callClientFn('setupWhatsappSendModalEvents', args); }
function updateWhatsappClientCount(...args) { return _callClientFn('updateWhatsappClientCount', args); }
function sendWhatsappMessages(...args) { return _callClientFn('sendWhatsappMessages', args); }
function calculateClientRank(...args) { return _callClientFn('calculateClientRank', args); }
function sendBulkMessages(...args) { return _callClientFn('sendBulkMessages', args); }
function saveCampaignToHistory(...args) { return _callClientFn('saveCampaignToHistory', args); }
function openMarketingReportsModal(...args) { return _callClientFn('openMarketingReportsModal', args); }
function populateMarketingReports(...args) { return _callClientFn('populateMarketingReports', args); }
function exportMarketingReport(...args) { return _callClientFn('exportMarketingReport', args); }


// calculateClientRank is provided by manager-clients.js; use delegator above.

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
            const creatorName = String(order?.createdBy?.name || '').trim();
            if (!creatorName || creatorName.toLowerCase() === 'undefined' || order.status === 'cancelado') {
                return;
            }
            if (!teamStats[creatorName]) teamStats[creatorName] = { sales: 0, products: 0, orders: 0 };
            teamStats[creatorName].sales += Number(order.total || 0);
            const allItems = [...(order.items || [])];
            teamStats[creatorName].products += allItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
            teamStats[creatorName].orders++;
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

const delay = ms => new Promise(res => setTimeout(res, ms));

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
}


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
    } else {
        dom.manager.tabStockHistory.classList.remove('text-gray-500', 'border-transparent');
        dom.manager.tabStockHistory.classList.add('text-blue-600', 'border-blue-500');
        dom.manager.contentStockHistory.classList.remove('hidden');
        loadStockHistoryView();
    }
}

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
        tableBody.innerHTML = '';

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

async function loadStockHistoryView() {
    console.log("loadStockHistoryView: Carregando view de histórico de estoque.");
    const { stockHistoryFilter, stockHistoryTableBody } = dom.manager;

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

stockHistoryFilter.innerHTML = '<option value="all">Todos os Produtos</option>';
        products.forEach(p => {
            const option = document.createElement('option');
            option.value = p.id;
            option.textContent = p.name;
            stockHistoryFilter.appendChild(option);
        });

stockLogs = logs;
        renderStockHistoryTable();

} catch (error) {
        console.error("Erro ao carregar histórico de estoque:", error);
        stockHistoryTableBody.innerHTML = '<tr><td colspan="6" class="text-center p-4 text-red-500">Erro ao carregar histórico.</td></tr>';
    }
}

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
    dom.manager.ticketTitleInput.value = storeSettings.ticketTitle || 'COMPROVANTE DE PEDIDO';
    dom.manager.ticketSubtitleInput.value = storeSettings.ticketSubtitle || '(NAO E DOCUMENTO FISCAL)';
    dom.manager.footerMsgInput.value = storeSettings.footerMessage || '';
    dom.manager.printUnitPriceCheckbox.checked = storeSettings.printUnitPrice || false;
    document.getElementById('manager-kibe-print-size').value = storeSettings.kibePrintSize || '3x';
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
        ticketTitle: dom.manager.ticketTitleInput.value,
        ticketSubtitle: dom.manager.ticketSubtitleInput.value,
        footerMessage: dom.manager.footerMsgInput.value,
        printUnitPrice: dom.manager.printUnitPriceCheckbox.checked,
        kibePrintSize: document.getElementById('manager-kibe-print-size').value
    };
    try {
        await firebaseSaveTicketSettings(newStoreSettings);
        await logActivity(currentUser.name, 'Salvou Configurações de Impressão');
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
        ticketTitle: dom.manager.ticketTitleInput.value || 'COMPROVANTE DE PEDIDO',
        ticketSubtitle: dom.manager.ticketSubtitleInput.value || '(NAO E DOCUMENTO FISCAL)',
        footerMessage: dom.manager.footerMsgInput.value || 'Obrigado(a) pela preferência!',
        printUnitPrice: dom.manager.printUnitPriceCheckbox.checked,
        kibePrintSize: document.getElementById('manager-kibe-print-size').value
    };

const exampleOrder = {
        orderNumber: 123,
        customer: { name: 'Cliente Exemplo', phone: '(11) 98765-4321' },
        delivery: { date: '01/01/2024', time: '12:00' },
        createdBy: { name: 'Funcionário Teste' },
        createdAt: { toDate: () => new Date() },
        items: [
            { id: 'coxinha_frita', name: 'Coxinha (Frita)', quantity: 10, unitPrice: 0.70, subtotal: 7.00, category: 'fritos' },
            { id: 'kibe_frito', name: 'Kibe (Frito)', quantity: 15, unitPrice: 0.70, subtotal: 10.50, category: 'fritos' },
            { id: 'esfiha_carne', name: 'Esfiha Carne', quantity: 5, unitPrice: 1.50, subtotal: 7.50, category: 'assados' },
            { id: 'picole_chocolate', name: 'Picolé Chocolate', quantity: 2, unitPrice: 3.00, subtotal: 6.00, category: 'revenda' },
            { id: 'manual_1', name: 'Refrigerante 2L', quantity: 1, unitPrice: 10.00, subtotal: 10.00, isManual: true, category: 'manual' }
        ],
        total: 44.00,
        sinal: 10.00,
        restante: 34.00
    };

const originalStoreSettings = { ...storeSettings };
    Object.assign(storeSettings, previewSettings);
    dom.manager.ticketPreviewContainer.innerHTML = generatePrintableTicketText(exampleOrder); // Usa a função de impressão/preview com HTML
    Object.assign(storeSettings, originalStoreSettings);
}

async function clearDatabase() {
    console.log("clearDatabase: Iniciando processo de limpeza do banco de dados.");
    try {
        await firebaseClearDatabase();
        setTimeout(() => window.location.reload(), 3000);
    } catch (error) {
        console.error("clearDatabase: Erro ao limpar banco de dados.", error);
    }
}

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
    if (!employeeName || String(employeeName).trim() === '' || String(employeeName).toLowerCase() === 'undefined') {
        console.warn('showEmployeeMonthlyDetail: employeeName inválido recebido, usando currentUser como fallback.');
        try {
            if (typeof currentUser !== 'undefined' && currentUser && currentUser.name) {
                employeeName = currentUser.name;
            } else {
                employeeName = 'Desconhecido';
            }
        } catch (e) {
            employeeName = 'Desconhecido';
        }
    }
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
            if (dom.managerDashboard) { dom.managerDashboard.style.display = 'flex'; dom.managerDashboard.classList.remove('hidden'); }
            navigateToManagerView('gerencial-dashboard');
            console.log("handleManagerAccess: Acesso gerencial concedido.");
        } else if (creds) {
            showToast('Credenciais incorretas.', 'error');
            console.warn("handleManagerAccess: Credenciais gerenciais incorretas.");
        }
    }
}

if (dom.manager.tabEquipeDiario) dom.manager.tabEquipeDiario.addEventListener('click', () => switchTeamReportTab('equipe-diario'));
    if (dom.manager.tabEquipeMensal) dom.manager.tabEquipeMensal.addEventListener('click', () => switchTeamReportTab('equipe-mensal'));

if (dom.manager.equipeMonthPicker) dom.manager.equipeMonthPicker.addEventListener('change', () => {
        if (!dom.manager.contentEquipeMensal.classList.contains('hidden')) {
            loadTeamMonthlyActivity();
        }
    });

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
        const allPendingOrders = await fetchExpiredPendingOrders();
        managerAlerts = allPendingOrders;

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

function createManagerAlertRowHTML(order) {
    const [day, month, year] = order.delivery.date.split('/');
    const deliveryDate = new Date(year, month - 1, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

const isExpired = deliveryDate < today;

let statusText, statusColor;
    if (isExpired) {
        statusText = 'Expirado';
        statusColor = 'bg-yellow-100 text-yellow-800';
    } else {
        statusText = 'Pendente';
        statusColor = 'bg-blue-100 text-blue-800';
    }

const areActionsDisabled = !isExpired;
    const disabledAttribute = areActionsDisabled ? 'disabled' : '';
    const disabledClass = areActionsDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:text-green-800';
    const disabledArchiveClass = areActionsDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:text-gray-800';
    const disabledTitle = areActionsDisabled ? 'Ações disponíveis apenas para pedidos expirados' : '';

return `
        <tr class="border-b hover:bg-gray-50" data-order-id="${order.id}">
            <td class="py-2 px-3 font-mono">#${order.orderNumber}</td>
            <td class="py-2 px-3">${order.customer.name}</td>
            <td class="py-2 px-3">${order.createdBy?.name || 'N/A'}</td>
            <td class="py-2 px-3 text-right font-bold text-red-600">${formatCurrency(order.restante)}</td>
            <td class="py-2 px-3">${order.delivery.date}</td>
            <td class="py-2 px-3">
                <span class="px-2 py-1 text-xs font-semibold rounded-full ${statusColor}">
                    ${statusText}
                </span>
            </td>
            <td class="py-2 px-3 text-center space-x-1">
                <button class="manager-alert-action-btn text-green-600 ${disabledClass}" title="${disabledTitle || 'Liquidar Dívida'}" data-action="liquidate" ${disabledAttribute}><i class="fas fa-dollar-sign pointer-events-none"></i></button>
                <button class="manager-alert-action-btn text-blue-600 hover:text-blue-800" title="Ver Pedido" data-action="view"><i class="fas fa-eye pointer-events-none"></i></button>
                <button class="manager-alert-action-btn text-gray-500 ${disabledArchiveClass}" title="${disabledTitle || 'Arquivar Alerta'}" data-action="archive" ${disabledAttribute}><i class="fas fa-archive pointer-events-none"></i></button>
            </td>
        </tr>
    `;
}

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
            if (confirmedResult) {
                await resolveExpiredOrder(orderId, orderData, currentUser);
                loadAndRenderManagerAlerts();
            }
            break;
        }
        case 'view': {
            await showOrderDetailModal(orderId);
            break;
        }
        case 'archive': {
            const confirmed = await showCustomConfirm("Arquivar Alerta", `Tem certeza que deseja arquivar este alerta? Ele será removido da lista de pendências, mas o pedido continuará como devedor.`);
            if (confirmed) {
                await updateOrderAlertStatus(orderId, 'arquivado', currentUser);
                loadAndRenderManagerAlerts();
            }
            break;
        }
    }
}

export async function populateCustomerAnalysisData(startDate = null, endDate = null) {
    console.log("Iniciando a população da aba de Análise de Clientes.");
    const kpiTotal = document.getElementById('kpi-total-clientes');
    const kpiNovos = document.getElementById('kpi-novos-clientes');
    const kpiRecorrentes = document.getElementById('kpi-clientes-recorrentes');
    const kpiRetencao = document.getElementById('kpi-taxa-retencao');
    const topClientsTable = document.getElementById('top-clients-table-body');
    const clientGrowthCanvas = document.getElementById('client-growth-chart');
    const clientSegmentationCanvas = document.getElementById('client-segmentation-chart');

if (!kpiTotal || !topClientsTable || !clientGrowthCanvas || !clientSegmentationCanvas) {
        console.log("Elementos da aba de Análise de Clientes não encontrados. Pulando a população de dados.");
        const contentPanel = document.getElementById('tab-content-clientes');
        if (contentPanel) {
            contentPanel.innerHTML = `<div class="text-center p-8 bg-red-50 text-red-700 rounded-lg">
                <p class="font-bold">Erro ao carregar o painel.</p>
                <p>Não foi possível encontrar os elementos necessários para exibir a análise de clientes.</p>
            </div>`;
        }
        return;
    }

kpiTotal.textContent = '...';
    kpiNovos.textContent = '...';
    kpiRecorrentes.textContent = '...';
    kpiRetencao.textContent = '...%';
    topClientsTable.innerHTML = '<tr><td colspan="5" class="text-center p-4">Carregando dados...</td></tr>';

try {
    // Ensure centralized clients data is loaded and use the shared array.
    if (clientsModule && typeof clientsModule.loadClients === 'function') {
        await clientsModule.loadClients();
    }
    const allClients = (clientsModule && Array.isArray(clientsModule.allClients)) ? clientsModule.allClients : await fetchClients();

if (allClients.length === 0) {
            kpiTotal.textContent = '0';
            kpiNovos.textContent = '0';
            kpiRecorrentes.textContent = '0';
            kpiRetencao.textContent = '0%';
            topClientsTable.innerHTML = '<tr><td colspan="5" class="text-center p-4">Nenhum cliente encontrado.</td></tr>';
            return;
        }

const now = new Date();
        const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

const sDate = startDate instanceof Date ? startDate : defaultStart;
        const eDate = endDate instanceof Date ? endDate : defaultEnd;

const totalClientes = allClients.length;

const novosClientesMes = allClients.filter(c => {
            if (!c.firstOrderDate) return false;
            const fod = c.firstOrderDate instanceof Date ? c.firstOrderDate : new Date(c.firstOrderDate);
            return fod >= sDate && fod <= eDate;
        }).length;

const clientesRecorrentes = allClients.filter(c => {
            if (!c.orders || !Array.isArray(c.orders)) return false;
            const ordersInPeriod = c.orders.filter(o => {
                const od = o.createdAt instanceof Date ? o.createdAt : new Date(o.createdAt);
                return od >= sDate && od <= eDate && o.status !== 'cancelado';
            });
            return ordersInPeriod.length > 1;
        }).length;

const taxaRetencao = totalClientes > 0 ? ((clientesRecorrentes / totalClientes) * 100).toFixed(1) : 0;

kpiTotal.textContent = totalClientes;
        kpiNovos.textContent = novosClientesMes;
        kpiRecorrentes.textContent = clientesRecorrentes;
        kpiRetencao.textContent = `${taxaRetencao}%`;

const clientsWithPeriodTotals = allClients.map(c => {
            const ordersInPeriod = (c.orders || []).filter(o => {
                const od = o.createdAt instanceof Date ? o.createdAt : new Date(o.createdAt);
                return od >= sDate && od <= eDate && o.status !== 'cancelado';
            });
            const periodTotal = ordersInPeriod.reduce((s, o) => s + (Number(o.total) || 0), 0);
            return { ...c, periodTotal, periodOrdersCount: ordersInPeriod.length };
        });

const topClients = clientsWithPeriodTotals.filter(c => c.periodOrdersCount > 0).sort((a, b) => b.periodTotal - a.periodTotal).slice(0, 10);

topClientsTable.innerHTML = topClients.map((client, index) => `
            <tr class="border-b hover:bg-gray-50">
                <td class="py-2 px-3 font-bold text-gray-600">${index + 1}</td>
                <td class="py-2 px-3 font-semibold">${client.name}</td>
                <td class="py-2 px-3">${client.phone}</td>
                <td class="py-2 px-3 text-right font-bold text-green-600">${formatCurrency(client.periodTotal)}</td>
                <td class="py-2 px-3 text-center font-semibold">${client.periodOrdersCount}</td>
            </tr>
        `).join('');

const growthChartLabels = [];
    const newClientsData = new Array(6).fill(0);

for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            growthChartLabels.push(new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(d).replace('.', ''));
            const year = d.getFullYear();
            const month = d.getMonth();

const clientsInMonth = allClients.filter(client => {
                if (!client.firstOrderDate) return false;
                const firstOrderDate = client.firstOrderDate instanceof Date ? client.firstOrderDate : new Date(client.firstOrderDate);
                return firstOrderDate.getFullYear() === year && firstOrderDate.getMonth() === month;
            });
            newClientsData[5 - i] = clientsInMonth.length;
        }

createClientGrowthChart('client-growth-chart', { labels: growthChartLabels, data: newClientsData });

const segmentation = {
            'Ouro': { count: 0, color: '#FBBF24' },
            'Prata': { count: 0, color: '#94A3B8' },
            'Bronze': { count: 0, color: '#FB923C' },
            'Devedor': { count: 0, color: '#EAB308' },
            'Péssimo': { count: 0, color: '#B91C1C' }
        };

allClients.forEach(client => {
            const rank = calculateClientRank(client);
            if (segmentation[rank.text]) {
                segmentation[rank.text].count++;
            }
        });

const segmentationLabels = Object.keys(segmentation).filter(key => segmentation[key].count > 0);
        const segmentationData = segmentationLabels.map(key => segmentation[key].count);
        const segmentationColors = segmentationLabels.map(key => segmentation[key].color);

createClientSegmentationChart('client-segmentation-chart', {
            labels: segmentationLabels,
            data: segmentationData,
            colors: segmentationColors
        });

try {
            const showClientsListModal = (clientsArray, title) => {
                const modal = document.getElementById('client-history-modal');
                const modalTitle = document.getElementById('client-history-client-name');
                const tableBody = document.getElementById('client-history-orders-list');
                if (!modal || !modalTitle || !tableBody) {
                    console.warn('Modal de lista de clientes não encontrado.');
                    return;
                }

modalTitle.textContent = title;
                tableBody.innerHTML = clientsArray.length === 0 ? '<tr><td colspan="5" class="text-center p-4">Nenhum cliente encontrado.</td></tr>' :
                    clientsArray.map(c => {
                        const firstOrder = c.firstOrderDate ? (c.firstOrderDate instanceof Date ? c.firstOrderDate : new Date(c.firstOrderDate)) : null;
                        return `
                            <tr class="border-b hover:bg-gray-50">
                                <td class="py-2 px-3 font-semibold">${c.name || '-'}<br><span class="text-xs text-gray-500">${c.phone || ''}</span></td>
                                <td class="py-2 px-3">${firstOrder ? formatDateToBR(firstOrder) : '--'}</td>
                                <td class="py-2 px-3 text-right font-bold text-green-600">${formatCurrency(c.totalSpent || 0)}</td>
                                <td class="py-2 px-3 text-center font-semibold">${c.orderCount || 0}</td>
                                <td class="py-2 px-3 text-center"><button class="bg-blue-500 text-white px-3 py-1 rounded text-sm" data-phone="${c.phone || ''}">Ver</button></td>
                            </tr>
                        `;
                    }).join('');

setTimeout(() => {
                    tableBody.querySelectorAll('button[data-phone]').forEach(btn => {
                        btn.addEventListener('click', async (ev) => {
                            const phone = btn.dataset.phone;
                            if (!phone) return;
                            try {
                                if (typeof findClientByPhone === 'function') {
                                    const cliente = await findClientByPhone(phone);
                                    if (cliente && cliente.id) {
                                        if (typeof window.showClientHistoryModal === 'function') {
                                            window.showClientHistoryModal(cliente.id, cliente.name || phone);
                                            return;
                                        }
                                        import('./app.js').then(mod => {
                                            if (mod.showClientHistoryModal) mod.showClientHistoryModal(cliente.id, cliente.name || phone);
                                        }).catch(err => console.warn('Não foi possível abrir histórico do cliente:', err));
                                    } else {
                                        showToast('Cliente não encontrado para abrir histórico.', 'error');
                                    }
                                } else {
                                    showToast('Função de busca de cliente não disponível.', 'error');
                                }
                            } catch (err) {
                                console.error('Erro ao localizar cliente por telefone:', err);
                                showToast('Erro ao localizar cliente.', 'error');
                            }
                        });
                    });
                }, 50);

modal.classList.add('active');
                const closeBtn = document.getElementById('client-history-close-btn');
                if (closeBtn) {
                    const closeFn = () => {
                        modal.classList.remove('active');
                        closeBtn.removeEventListener('click', closeFn);
                    };
                    closeBtn.addEventListener('click', closeFn);
                }
            };

kpiNovos.style.cursor = 'pointer';
            kpiNovos.addEventListener('click', () => {
                const clients = allClients.filter(c => {
                    if (!c.firstOrderDate) return false;
                    const fod = c.firstOrderDate instanceof Date ? c.firstOrderDate : new Date(c.firstOrderDate);
                    return fod >= sDate && fod <= eDate;
                });
                showClientsListModal(clients, `Novos Clientes — ${new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(sDate)}`);
            });

kpiTotal.style.cursor = 'pointer';
            kpiTotal.addEventListener('click', () => {
                showClientsListModal(allClients, 'Todos os Clientes');
            });

kpiRecorrentes.style.cursor = 'pointer';
            kpiRecorrentes.addEventListener('click', () => {
                const recurrents = allClients.filter(c => c.orderCount > 1);
                showClientsListModal(recurrents, 'Clientes Recorrentes');
            });
        } catch (err) {
            console.warn('Não foi possível habilitar interatividade dos KPIs:', err);
        }

} catch (error) {
        console.error("Erro ao popular dados de análise de clientes:", error);
        topClientsTable.innerHTML = '<tr><td colspan="5" class="text-center p-4 text-red-500">Erro ao carregar dados dos clientes.</td></tr>';
    }
}

export function createExpiredOrderAlertHTML(order) {
    const debito = formatCurrency(order.restante || 0);
    const vendedor = order.createdBy?.name || 'N/A';

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

async function getOrdersForDate(dateStringYYYYMMDD) {
    const [year, month, day] = dateStringYYYYMMDD.split('-');
    const dateStringDDMMYYYY = `${day}/${month}/${year}`;

console.log(`BUSCA FORÇADA NO FIREBASE: Buscando pedidos para a data de retirada: ${dateStringDDMMYYYY}`);
    const ordersRef = collection(db, "orders");
    const q = query(ordersRef, where("delivery.date", "==", dateStringDDMMYYYY));

const querySnapshot = await getDocs(q);
    const orders = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

return orders;
}

function calculateSlotLoad(slot, dateStringYYYYMMDD, ordersForDay, windowMinutes) {
    const slotTime = new Date(`${dateStringYYYYMMDD}T${slot}`);
    const windowStart = slotTime;
    const windowEnd = new Date(slotTime.getTime() + windowMinutes * 60000);

return ordersForDay.reduce((total, order) => {
        if (order.status !== 'cancelado' && order.delivery?.time) {
            const deliveryDateTime = new Date(`${dateStringYYYYMMDD}T${order.delivery.time.trim()}`);
            if (deliveryDateTime >= windowStart && deliveryDateTime < windowEnd) {
                return total + getSalgadosCountFromItems(order.items);
            }
        }
        return total;
    }, 0);
}

function generateTimeSlots(start, end, intervalMinutes) {
    const slots = [];
    let [startHour, startMin] = start.split(':').map(Number);
    const [endHour, endMin] = end.split(':').map(Number);

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

export async function openInteractiveTimeSelector(customTime = null) {
    const modal = document.getElementById('interactive-time-selector-modal');
    const container = document.getElementById('time-slots-container');
    const warningMessage = document.getElementById('time-selector-warning-message');
    const dateInput = dom.deliveryDate;
    const selectedDateEl = document.getElementById('time-selector-selected-date');
    const dailyTotalEl = document.getElementById('time-selector-daily-total');

if (!dateInput || !dateInput.value) {
        showToast("Por favor, selecione primeiro a data de retirada.", "info");
        return;
    }

modal.classList.add('active');
    container.innerHTML = '<p class="text-center col-span-full">Calculando carga horária...</p>';
    if (warningMessage) warningMessage.classList.add('hidden');

const now = new Date();
    const todayString = getTodayDateString('yyyy-mm-dd');
    const isToday = dateInput.value === todayString;

if (currentSelectedDeliveryDate !== dateInput.value) {
        manuallyAddedTimeSlotsByDate.set(currentSelectedDeliveryDate, new Set());
        currentSelectedDeliveryDate = dateInput.value;
    }

const ordersForDay = await getOrdersForDate(dateInput.value);

if (selectedDateEl && dailyTotalEl) {
        const [year, month, day] = dateInput.value.split('-');
        const formattedDate = `${day}/${month}/${year}`;
        selectedDateEl.innerHTML = `<span class="text-blue-600">${formattedDate}</span>`;

const totalSalgadosDoDia = ordersForDay.reduce((total, order) => {
            if (order.status !== 'cancelado') {
                return total + getSalgadosCountFromItems(order.items);
            }
            return total;
        }, 0);

dailyTotalEl.className = 'bg-orange-100 text-orange-800 text-sm font-bold px-4 py-2 rounded-full';
        dailyTotalEl.innerHTML = `<i class="fas fa-cookie-bite mr-2"></i> ${totalSalgadosDoDia} salgados`;
    }

const productionLimit = productionSettings.limit || 1200;
    const windowMinutes = productionSettings.windowMinutes || 30;
    const baseTimeSlots = generateTimeSlots('09:00', '19:00', 30);

if (customTime) {
        if (!manuallyAddedTimeSlotsByDate.has(currentSelectedDeliveryDate)) {
            manuallyAddedTimeSlotsByDate.set(currentSelectedDeliveryDate, new Set());
        }
        manuallyAddedTimeSlotsByDate.get(currentSelectedDeliveryDate).add(customTime);
    }

const currentManualSlotsSet = manuallyAddedTimeSlotsByDate.get(currentSelectedDeliveryDate) || new Set();
    const allSlots = Array.from(new Set([...baseTimeSlots, ...Array.from(currentManualSlotsSet)]))
                          .filter(Boolean)
                          .sort();

const handleSlotSelection = async (selectedSlot) => {
        const dateStr = dateInput.value;

const selectedIndex = allSlots.indexOf(selectedSlot);
        const prevSlot = selectedIndex > 0 ? allSlots[selectedIndex - 1] : null;
        const nextSlot = selectedIndex < allSlots.length - 1 ? allSlots[selectedIndex + 1] : null;

let warnings = [];

if (prevSlot) {
            const prevLoad = calculateSlotLoad(prevSlot, dateStr, ordersForDay, windowMinutes);
            if (prevLoad >= productionLimit) {
                warnings.push(`O horário anterior (<strong>${prevSlot}</strong>) já está lotado.`);
            }
        }

if (nextSlot) {
            const nextLoad = calculateSlotLoad(nextSlot, dateStr, ordersForDay, windowMinutes);
            if (nextLoad >= productionLimit) {
                warnings.push(`O horário seguinte (<strong>${nextSlot}</strong>) já está lotado.`);
            }
        }

if (warnings.length > 0) {
            const message = `Atenção! Você está agendando um pedido próximo a um horário sobrecarregado.<br><br><ul class="list-disc list-inside text-left">${warnings.map(w => `<li>${w}</li>`).join('')}</ul><br>Deseja continuar mesmo assim?`;

const confirmed = await showCustomConfirm(
                "Horário Próximo Lotado",
                message,
                {
                    okButtonText: "Sim, Continuar",
                    okButtonClass: "bg-orange-500 hover:bg-orange-600",
                    cancelButtonText: "Escolher Outro"
                }
            );

if (!confirmed) {
                return;
            }
        }

if (dom.deliveryTime) {
            dom.deliveryTime.value = selectedSlot;
            dom.deliveryTime.dispatchEvent(new Event('input', { bubbles: true }));
        }
        modal.classList.remove('active');
        document.getElementById('manual-time-input').value = '';
    };

let isAnySlotOverloaded = false;

container.innerHTML = '';

allSlots.forEach(slot => {
        const slotEl = document.createElement('button');
        slotEl.dataset.time = slot;

const slotTime = new Date(`${dateInput.value}T${slot}`);
        const isPast = isToday && slotTime < now;

const existingSalgadosInWindow = calculateSlotLoad(slot, dateInput.value, ordersForDay, windowMinutes);

const isOverloaded = existingSalgadosInWindow >= productionLimit;
        if (isOverloaded) {
            isAnySlotOverloaded = true;
        }

const loadPercentage = Math.min(100, (existingSalgadosInWindow / productionLimit) * 100);
        let quantityColorClass = 'text-gray-500';
        let progressBarColor = 'bg-green-500';
        let slotBgClass = 'bg-white border-gray-200 hover:bg-green-50 hover:border-green-400';
        let slotCursorClass = 'cursor-pointer';
        let customIndicator = '';
        let title = `Selecionar ${slot}`;

if (isOverloaded) {
            quantityColorClass = 'text-red-600 font-bold';
            progressBarColor = 'bg-red-500';
            slotBgClass = 'bg-red-100 border-red-500';
        } else if (loadPercentage >= 50) {
            quantityColorClass = 'text-orange-600 font-semibold';
            progressBarColor = 'bg-orange-500';
            slotBgClass = 'bg-orange-50 border-orange-300 hover:bg-orange-100';
        } else if (existingSalgadosInWindow > 0) {
            quantityColorClass = 'text-blue-700 font-semibold';
            progressBarColor = 'bg-blue-500';
            slotBgClass = 'bg-blue-50 border-blue-300 hover:bg-blue-100';
        }

if (currentManualSlotsSet.has(slot) && !isPast) {
            slotBgClass += ' highlight-slot';
            customIndicator = '<span class="absolute top-1 right-1 text-xs bg-indigo-500 text-white rounded-full px-1.5 py-0.5" title="Horário Personalizado"><i class="fas fa-star"></i></span>';
            slotEl.id = 'custom-time-slot';
        }

if (isPast) {
            slotBgClass = 'bg-gray-200 border-gray-300 text-gray-400';
            slotCursorClass = 'cursor-not-allowed';
            progressBarColor = 'bg-gray-400';
            quantityColorClass = 'text-gray-400';
            title = 'Este horário já passou.';
            slotEl.disabled = true;
        }

slotEl.className = `time-slot-btn relative flex flex-col items-center justify-center p-3 border rounded-lg transition-all duration-200 ${slotBgClass} ${slotCursorClass}`;
        slotEl.title = title;
        slotEl.innerHTML = `
            <div class="flex justify-between items-baseline w-full mb-1.5">
                <div class="font-bold text-lg">${slot}</div>
                <div class="flex items-center gap-1">
                    <strong class="${quantityColorClass} text-xl">${existingSalgadosInWindow}</strong>
                    <span class="text-xs text-gray-400">salg.</span>
                </div>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2.5">
                <div class="h-2.5 rounded-full ${progressBarColor}" style="width: ${loadPercentage}%"></div>
            </div>
            ${customIndicator}
        `;

slotEl.addEventListener('click', () => handleSlotSelection(slot));
        container.appendChild(slotEl);
    });

if (customTime) {
        const customSlotElement = document.getElementById('custom-time-slot');
        if (customSlotElement) {
            setTimeout(() => {
                customSlotElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
        }
    }

if (isAnySlotOverloaded) {
        warningMessage.innerHTML = `
            <div class="flex items-start">
                <i class="fas fa-exclamation-triangle mr-3 text-xl text-amber-600 mt-1"></i>
                <div class="text-amber-900">
                    <strong class="block">Atenção: Alguns horários já estão com alta demanda.</strong>
                    <span class="block text-base mt-1">
                        O limite para a janela de ${windowMinutes} min é de <strong class="text-lg">${productionLimit}</strong> salgados.
                    </span>
                    <span class="block mt-1">Considere sugerir um horário alternativo para o cliente.</span>
                </div>
            </div>
        `;
        warningMessage.classList.remove('hidden');
    }

}

export async function calculateWindowLoad(deliveryDateStr, deliveryTimeStr, currentOrderItems, orderIdToExclude = null) {
    const ordersForDay = await getOrdersForDate(deliveryDateStr);
    const limit = productionSettings.limit || 1200;
    const windowMinutes = productionSettings.windowMinutes || 30;

const targetTime = new Date(`${deliveryDateStr}T${deliveryTimeStr.trim()}`);
    const windowStart = new Date(targetTime.getTime() - windowMinutes * 60000);
    const windowEnd = new Date(targetTime.getTime() + windowMinutes * 60000);

const existingLoad = ordersForDay.reduce((total, order) => {
        if (order.id === orderIdToExclude) return total;

if (order.status !== 'cancelado' && order.delivery?.time) {
            const deliveryDateTime = new Date(`${deliveryDateStr}T${order.delivery.time.trim()}`);
            if (deliveryDateTime >= windowStart && deliveryDateTime < windowEnd) {
                return total + getSalgadosCountFromItems(order.items);
            }
        }
        return total;
    }, 0);

const currentLoad = getSalgadosCountFromItems(currentOrderItems);

const totalLoad = existingLoad + currentLoad;

return { totalLoad, existingLoad, currentLoad, limit };
}

function loadSystemSettings() {

console.log("loadSystemSettings: Carregando configurações do sistema.");

if (!dom.manager || !dom.manager.monthlyGoalInput) {

console.error("Elementos do manager.monthlyGoalInput não encontrado.");

return;

}

const goalValue = storeSettings.monthlyGoal || 10000;

dom.manager.monthlyGoalInput.value = new Intl.NumberFormat('pt-BR', {

minimumFractionDigits: 2,

maximumFractionDigits: 2

}).format(goalValue);

const limitInput = document.getElementById('overload-limit-input');

const windowInput = document.getElementById('overload-window-input');

if (limitInput && windowInput && productionSettings) {

limitInput.value = productionSettings.limit || 1200;

windowInput.value = productionSettings.windowMinutes || 30;

}

updateEconomyModeUI(getManagerEconomyMode());

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

await firebaseSaveSystemSettings(newStoreSettings);

await logActivity(currentUser.name, 'Salvou Configurações do Sistema', { metaMensal: formatCurrency(newStoreSettings.monthlyGoal) });

console.log("saveSystemSettings: Configurações do sistema salvas com sucesso.");

} catch (error) {

console.error("saveSystemSettings: Erro ao salvar meta.", error);

}

}

if (dom.manager.tabEquipeDiario) dom.manager.tabEquipeDiario.addEventListener('click', () => switchTeamReportTab('equipe-diario'));

if (dom.manager.tabEquipeMensal) dom.manager.tabEquipeMensal.addEventListener('click', () => switchTeamReportTab('equipe-mensal'));

if (dom.manager.equipeMonthPicker) dom.manager.equipeMonthPicker.addEventListener('change', () => {

if (!dom.manager.contentEquipeMensal.classList.contains('hidden')) {

loadTeamMonthlyActivity();

}

});

