// app.js - Ponto de entrada principal da aplicação

// Importações do Firebase SDK
// CORREÇÃO: Remove a inicialização direta e importa de um módulo centralizado para quebrar a dependência circular.
import { db, auth } from './firebase-config.js';
import { getFirestore, doc, getDoc, setDoc, addDoc, updateDoc, collection, query, where, getDocs, serverTimestamp, orderBy, limit, runTransaction, Timestamp, writeBatch, deleteDoc, deleteField, onSnapshot } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";


// Importa o objeto dom centralizado (agora um módulo separado)
import { dom } from './domRefs.js';

// Importa funções utilitárias (agora um módulo separado)
// Garante que todas as funções auxiliares necessárias sejam importadas.
import { showToast, showCustomConfirm, formatCurrency, parseCurrency, getTodayDateString, formatDateToBR, formatDateTimeToBR, formatNameToTitleCase, formatPhone, formatTime, roundSinal, getProductInfoById, generateTicketText, generatePrintableReminderText, printTicket, sendWhatsAppMessage, updateWeekdayDisplay, printReminderList, centerText, rightAlignText, leftAlignText, twoColumns, playSound } from './utils.js';

// Importa funções do serviço Firebase (agora um módulo separado)
import { fetchEmployees, logUserActivity, createNotification, fetchAllProductsWithStock, checkForDailyDeliveries, fetchExpiredPendingOrders, findOrderByDocId, updateOrderAlertStatus } from './firebaseService.js';

// Importa funções de autenticação (agora um módulo separado)
/* import { setupAuthListeners } from './auth.js'; */

// Importa funções do PDV (agora um módulo separado)
import { setupPdvEventListeners, startNewOrder, renderProducts, showReminderModal, loadOrderIntoForm } from './pdv.js';

// Importa funções do Gerente (agora um módulo separado)
// IMPORTANTE: Adicionado openInteractiveTimeSelector aqui para resolver o ReferenceError
import { setupManagerDashboardListeners, navigateToManagerView, applyRolePermissions, openInteractiveTimeSelector, triggerNotificationAnimation, createExpiredOrderAlertHTML } from './manager.js';

// Importa o novo módulo de tempo real para o painel do gerente
import { setupRealtimeOrderListener } from './manager-realtime.js';

// Importa funções de gerenciamento de funcionários (agora um módulo separado)
import { populatePdvEmployeeSwitcher, populateLoginEmployeeSelect, addEmployee, editEmployee, deleteEmployee, loadEmployees, saveProductionSettings } from './employeeManagement.js';

// Importa funções do Relatório do Funcionário (agora um módulo separado)
import { setupEmployeeReportListeners, openEmployeeReport } from './employeeReport.js';

// NOVO: Importa funções do Log de Atividades
import { initActivityLogView, setupActivityLogListeners } from './activityLog.js';

// Importa o estado compartilhado de alertas
import { pendingAlerts } from './alertState.js';


// Variáveis globais da aplicação (agora exportadas para outros módulos)
// CORREÇÃO: Remove as instâncias do Firebase das variáveis globais. Elas agora são importadas de 'firebase-config.js'.
export let currentUser, currentOrder, productsConfig, storeSettings, productionSettings;
export let managerCredentials = { user: 'gerencia', pass: '1234' };
export const masterCredentials = { user: 'mestra', pass: 'mestra123' };
export let charts = {}; // Objeto para armazenar todas as instâncias de gráficos
export let employees = []; // Array para armazenar os funcionários
export let currentReminderOrders = []; // Variável global para armazenar os pedidos do lembrete
export let employeeReportData = { all: [] }; // Dados para o relatório do funcionário
export let notificationListenerCallback = null; // Callback para a UI de notificações
let unsubscribeNotifications = null; // Função para parar o listener de notificações
let isFirstNotificationLoad = true; // NOVO: Flag para controlar o som/animação na carga inicial
let showPasswordChangeModal; // Função para exibir o modal de alteração de senha (definida em setupPasswordChangeListeners)
// CORREÇÃO: Re-exporta 'db' para manter a compatibilidade com outros módulos que ainda o importam de 'app.js' durante a refatoração.
export { db };

/**
 * NOVO: Define o usuário globalmente.
 * @param {object} newUser O novo objeto de usuário.
 */
export function setCurrentUser(newUser) {
    currentUser = newUser;
    console.log("setCurrentUser: Usuário atual alterado para:", currentUser);
}

// Função para carregar configurações iniciais do Firebase
export async function loadConfig() {
    console.log("loadConfig: Iniciando carregamento das configurações...");
    try {
        // Carrega configurações gerais, como de ticket e senhas, do documento 'main'
        const configDocRef = doc(db, "config", "main");
        const docSnap = await getDoc(configDocRef);
        
        let loadedProducts = {}; // Objeto temporário para construir productsConfig

        // Carrega configurações da loja
        if (docSnap.exists()) {
            const configData = docSnap.data();
            storeSettings = configData.settings || { monthlyGoal: 10000 };
            if(configData.manager) { managerCredentials = configData.manager; }
            console.log("loadConfig: Configurações de sistema e credenciais carregadas.");

            // Prioriza o carregamento da estrutura antiga de produtos se ela existir
            if (Array.isArray(configData.products) && configData.products.length > 0) {
                console.log("loadConfig: Carregando produtos da estrutura antiga (config/main.products).");
                configData.products.forEach(categoryObj => {
                    if (categoryObj.id && Array.isArray(categoryObj.items)) {
                        loadedProducts[categoryObj.id] = categoryObj.items;
                    }
                });
            } else {
                console.log("loadConfig: Estrutura antiga de produtos não encontrada ou vazia. Carregando da coleção 'products'.");
                // Fallback para a nova coleção 'products' se a antiga não existir ou estiver vazia
                const allProducts = await fetchAllProductsWithStock();
                allProducts.forEach(product => {
                    const category = product.category || 'outros';
                    if (!loadedProducts[category]) {
                        loadedProducts[category] = [];
                    }
                    loadedProducts[category].push(product);
                });
            }

        } else {
            console.log("loadConfig: Configuração não encontrada. Tentando criar padrão...");
            const confirmCreate = await showCustomConfirm("Configuração Não Encontrada", "Nenhuma configuração encontrada. Deseja criar o cardápio padrão?");
            if (confirmCreate) {
                await createDefaultConfig();
                // Após criar, recarrega para garantir que os dados recém-criados sejam usados
                return await loadConfig(); 
            } else {
                showToast("Nenhuma configuração carregada. Algumas funcionalidades podem não funcionar.", "error", 5000);
            }
        }

        // NOVO: Carrega configurações de produção
        const prodConfigRef = doc(db, "config", "producao");
        const prodDocSnap = await getDoc(prodConfigRef);
        if (prodDocSnap.exists()) {
            productionSettings = prodDocSnap.data();
            console.log("loadConfig: Configurações de produção carregadas:", productionSettings);
        } else {
            console.log("loadConfig: Configurações de produção não encontradas, usando e salvando padrão.");
            productionSettings = { limit: 1200, windowMinutes: 30 }; // Valores padrão
            await setDoc(prodConfigRef, productionSettings);
        }

        // Garante que as categorias padrão existam, mesmo que vazias, para evitar erros na UI
        const defaultCategories = ['assados', 'fritos', 'revenda', 'outros'];
        defaultCategories.forEach(cat => {
            if (!loadedProducts[cat]) {
                loadedProducts[cat] = [];
            }
        });

        // Ordena os produtos por nome dentro de cada categoria
        Object.keys(loadedProducts).forEach(category => {
            loadedProducts[category].sort((a, b) => a.name.localeCompare(b.name));
        });

        productsConfig = loadedProducts; // Atribui a configuração construída à variável global
        console.log("loadConfig: Configurações de produtos carregadas:", productsConfig);
    }
    catch (error) {
        console.error("loadConfig: Erro ao carregar configurações:", error);
        showToast("Erro ao carregar configurações.", "error");
    }
}

// Cria configurações padrão se não existirem
async function createDefaultConfig() {
    console.log("createDefaultConfig: Criando configuração padrão...");
    const defaultConfig = {
        products: { // Esta é a estrutura antiga que será salva em config/main
            fritos: [
                { id: 'bolinha_queijo_frita', name: 'Bolinha de Queijo (Frita)', price: 0.70, category: 'fritos' },
                { id: 'bolinha_queijo_crua', name: 'Bolinha de Queijo (Crua)', price: 0.60, category: 'fritos' },
                { id: 'risoles_frito', name: 'Risoles (Frito)', price: 0.70, category: 'fritos' },
                { id: 'risoles_cru', name: 'Risoles (Cru)', price: 0.60, category: 'fritos' },
                { id: 'coxinha_frita', name: 'Coxinha (Frita)', price: 0.70, category: 'fritos' },
                { id: 'coxinha_crua', name: 'Coxinha (Crua)', price: 0.60, category: 'fritos' },
                { id: 'kibe_frito', name: 'Kibe (Frito)', price: 0.70, category: 'fritos' },
                { id: 'kibe_cru', name: 'Kibe (Cru)', price: 0.60, category: 'fritos' }
            ],
            assados: [
                { id: 'esfiha_carne', name: 'Esfiha Carne', price: 1.50, category: 'assados' },
                { id: 'esfiha_frango', name: 'Esfiha Frango', price: 1.50, category: 'assados' },
                { id: 'hamburguinho', name: 'Hamburguinho', price: 1.50, category: 'assados' },
                { id: 'doguinho', name: 'Doguinho', price: 1.50, category: 'assados' }
            ],
            revenda: [
                { id: 'picole_chocolate', name: 'Picolé Chocolate', price: 3.00, category: 'revenda' },
                { id: 'sorvete_massa_morango', name: 'Sorvete Massa Morango (1L)', price: 15.00, category: 'revenda' }
            ],
            outros: [
                { id: 'coca_lata', name: 'Coca-Cola Lata', price: 5.00, category: 'outros' },
                { id: 'guarana_lata', name: 'Guaraná Lata', price: 5.00, category: 'outros' },
                { id: 'bolo_fatia', name: 'Bolo (Fatia)', price: 8.00, category: 'outros' }
            ]
        },
        settings: { name: "Sorveteria Ice Kiss", phone: "(11) 4242-2702", footerMessage: "Obrigado(a) pela preferência! VOLTE SEMPRE!", printUnitPrice: false, monthlyGoal: 10000 },
        manager: { user: 'gerencia', pass: '1234' },
        production: { limit: 1200, windowMinutes: 30 } // NOVO: Configuração de produção padrão
    };
    try {
        // 1. Salva as configurações gerais e de gerente no documento 'main'
        // Inclui a estrutura de produtos antiga aqui
        const productsArrayForOldConfig = Object.keys(defaultConfig.products).map(key => ({
            id: key,
            items: defaultConfig.products[key]
        }));

        await setDoc(doc(db, "config", "main"), {
            settings: defaultConfig.settings,
            manager: defaultConfig.manager,
            // lastOrderNumber: 0, // REMOVIDO: O contador de pedidos será gerenciado em 'counters/orders'
            products: productsArrayForOldConfig // Salva a estrutura antiga aqui
        });

        // Salva a configuração de produção padrão
        await setDoc(doc(db, "config", "producao"), defaultConfig.production);

        // 2. Salva cada produto individualmente na coleção 'products' usando um batch (nova estrutura)
        const batch = writeBatch(db);
        const productsCol = collection(db, "products");

        Object.values(defaultConfig.products).flat().forEach(product => {
            const productRef = doc(productsCol, product.id);
            // Adiciona custo e estoque iniciais para funcionalidade completa do painel gerencial
            const productData = {
                ...product,
                cost: product.price * 0.5, // Custo de exemplo: 50% do preço de venda
                stock: 100 // Estoque inicial de exemplo
            };
            batch.set(productRef, productData);
        });

        await batch.commit(); // Executa todas as operações de escrita de uma vez

        console.log("createDefaultConfig: Configuração padrão criada com sucesso!");
        showToast("Configuração padrão criada!", "success");
    } catch (error) {
        console.error("createDefaultConfig: Erro ao criar config padrão:", error);
        showToast("Falha ao criar config.", "error");
    }
}

// Usando a coleção 'counters' e o documento 'orders'
export async function getNextOrderNumber() { 
    console.log("getNextOrderNumber: Obtendo próximo número de pedido.");
    const counterRef = doc(db, "counters", "orders"); // Referência ao contador de pedidos
    const ordersColRef = collection(db, "orders"); // Referência à coleção de pedidos

    try { 
        // Usa uma transação para garantir que o número seja único e incrementado corretamente
        const newOrderNumber = await runTransaction(db, async (transaction) => {
            // 1. Busca o último pedido REAL salvo para garantir a sequência correta.
            const lastOrderQuery = query(ordersColRef, orderBy("orderNumber", "desc"), limit(1));
            const lastOrderSnap = await transaction.get(lastOrderQuery); // Usa a transação para ler

            let lastSavedOrderNumber = 0;
            if (!lastOrderSnap.empty) {
                lastSavedOrderNumber = Number(lastOrderSnap.docs[0].data().orderNumber) || 0;
            }

            // 2. Busca o contador atual para comparar.
            const counterDoc = await transaction.get(counterRef);
            const currentCounterNumber = counterDoc.exists() ? (Number(counterDoc.data().count) || 0) : 0;

            // 3. Determina o próximo número correto, usando o maior valor entre o último pedido e o contador.
            // Isso auto-orrige o contador se ele estiver dessincronizado.
            const nextOrderNumber = Math.max(lastSavedOrderNumber, currentCounterNumber) + 1;

            // 4. Atualiza o contador com o número correto.
            transaction.set(counterRef, { count: nextOrderNumber }); // Usa set para criar se não existir

            console.log(`getNextOrderNumber: Último pedido salvo: ${lastSavedOrderNumber}, Contador atual: ${currentCounterNumber}. Próximo número definido como: ${nextOrderNumber}`);
            return nextOrderNumber;
        }); 
        // Formata o número para ter pelo menos 4 dígitos (ex: 0039, 1478)
        return String(newOrderNumber).padStart(4, '0');
    } catch (error) { 
        console.error("getNextOrderNumber: Erro ao obter número do pedido.", error); 
        showToast("Erro ao obter número do pedido. Tente novamente.", "error"); 
        // Fallback para um número aleatório de 4 dígitos em caso de erro crítico, como no seu código antigo
        return String(Math.floor(1000 + Math.random() * 9000)).padStart(4, '0');
    } 
}

// NOVA FUNÇÃO: Apenas LÊ o próximo número para exibição, SEM incrementar.
export async function peekNextOrderNumber() {
    console.log("peekNextOrderNumber: Verificando próximo número de pedido para exibição.");
    // TORNA A FUNÇÃO MAIS ROBUSTA: Busca o último pedido REAL salvo para garantir a sequência correta.
    // Isso evita "pulos" na numeração se o contador estiver dessincronizado.
    const ordersColRef = collection(db, "orders");

    try {
        // Busca o pedido com o maior número de 'orderNumber'
        const lastOrderQuery = query(ordersColRef, orderBy("orderNumber", "desc"), limit(1));
        const lastOrderSnap = await getDocs(lastOrderQuery);

        let lastSavedOrderNumber = 0;
        if (!lastOrderSnap.empty) {
            // Garante que o valor lido seja um número. Usa 0 como padrão se for inválido.
            lastSavedOrderNumber = Number(lastOrderSnap.docs[0].data().orderNumber) || 0;
        }

        const nextNumber = lastSavedOrderNumber > 0 ? lastSavedOrderNumber + 1 : 1001; // Se não houver pedidos, começa em 1001

        const formattedNumber = String(nextNumber).padStart(4, '0');
        console.log(`peekNextOrderNumber: Último pedido salvo foi ${lastSavedOrderNumber}. Próximo para exibição: ${formattedNumber}`);
        return formattedNumber;
    } catch (error) {
        console.error("peekNextOrderNumber: Erro ao verificar próximo número:", error);
        showToast("Erro ao carregar número do pedido.", "error");
        return "ERRO"; // Retorna um erro claro na UI
    }
}

// NOVA FUNÇÃO: Exibe o modal com o histórico de preços de um produto
export async function showPriceHistoryModal(productId, productName) {
    const modal = document.getElementById('price-history-modal');
    const modalTitle = document.getElementById('history-product-name');
    const tableBody = document.getElementById('price-history-table-body');

    if (!modal || !modalTitle || !tableBody) {
        console.error("Elementos do modal de histórico de preços não encontrados no DOM.");
        return;
    }

    modalTitle.textContent = productName;
    tableBody.innerHTML = '<tr><td colspan="4" class="text-center p-4">Carregando histórico...</td></tr>';
    modal.classList.add('active');

    try {
        const historyColRef = collection(db, `products/${productId}/priceHistory`);
        const q = query(historyColRef, orderBy("timestamp", "desc"));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            tableBody.innerHTML = '<tr><td colspan="4" class="text-center p-4">Nenhuma alteração de preço registrada para este produto.</td></tr>';
            return;
        }

        tableBody.innerHTML = ''; // Limpa o "Carregando..."
        querySnapshot.forEach(doc => {
            const history = doc.data();
            const date = history.timestamp ? history.timestamp.toDate().toLocaleString('pt-BR') : 'Data não registrada';
            const price = typeof history.newPrice === 'number' ? `R$ ${history.newPrice.toFixed(2).replace('.', ',')}` : 'N/A';
            const cost = typeof history.newCost === 'number' ? `R$ ${history.newCost.toFixed(2).replace('.', ',')}` : 'N/A';
            const user = history.changedBy || 'Sistema';

            const row = `
                <tr class="border-b hover:bg-gray-50">
                    <td class="py-2 px-4">${date}</td>
                    <td class="py-2 px-4 text-right font-mono">${price}</td>
                    <td class="py-2 px-4 text-right font-mono">${cost}</td>
                    <td class="py-2 px-4">${user}</td>
                </tr>
            `;
            tableBody.innerHTML += row;
        });

    } catch (error) {
        console.error("Erro ao buscar histórico de preços:", error);
        tableBody.innerHTML = '<tr><td colspan="4" class="text-center p-4 text-red-500">Ocorreu um erro ao carregar o histórico.</td></tr>';
        showToast("Erro ao carregar histórico de preços.", "error");
    }
}

// NOVO: Função para exibir o modal de histórico de pedidos do cliente
export async function showClientHistoryModal(clienteId, clientName) {
    const modal = document.getElementById('client-history-modal');
    const modalTitle = document.getElementById('client-history-client-name');
    const tableBody = document.getElementById('client-history-orders-list');

    if (!modal || !modalTitle || !tableBody) {
        console.error("Elementos do modal de histórico de cliente não encontrados.");
        return;
    }

    modalTitle.textContent = clientName;
    tableBody.innerHTML = '<tr><td colspan="5" class="text-center p-4">Carregando histórico...</td></tr>';
    modal.classList.add('active');

    try {
        const ordersRef = collection(db, "orders");
        const q = query(ordersRef, where("cliente.id", "==", clienteId), orderBy("timestamp", "desc"));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            tableBody.innerHTML = '<tr><td colspan="5" class="text-center p-4">Nenhum pedido encontrado para este cliente.</td></tr>';
            return;
        }

        let rowsHtml = '';
        querySnapshot.forEach(doc => {
            const order = doc.data();
            const paymentStatusClass = order.paymentStatus === 'pago' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
            const orderStatusClass = `status-${order.status}`;

            rowsHtml += `
                <tr class="border-b hover:bg-gray-50">
                    <td class="py-2 px-4 font-mono">${order.orderNumber}</td>
                    <td class="py-2 px-4">${formatDateToBR(order.deliveryDate)}</td>
                    <td class="py-2 px-4 text-right font-mono">${formatCurrency(order.totalValue)}</td>
                    <td class="py-2 px-4 text-center"><span class="px-2 py-1 text-xs font-semibold rounded-full ${paymentStatusClass}">${order.paymentStatus}</span></td>
                    <td class="py-2 px-4 text-center"><span class="status-label ${orderStatusClass}">${order.status}</span></td>
                </tr>
            `;
        });
        tableBody.innerHTML = rowsHtml;

    } catch (error) {
        console.error("Erro ao buscar histórico de pedidos do cliente:", error);
        tableBody.innerHTML = '<tr><td colspan="5" class="text-center p-4 text-red-500">Erro ao carregar histórico.</td></tr>';
        showToast("Erro ao carregar histórico do cliente.", "error");
    }
}

// NOVO: Função para buscar dados e atualizar o "Selo do Cliente"
export async function updateClientSeal(clienteId) {
    const sealContainer = document.getElementById('client-seal-container');
    if (!sealContainer) return;

    try {
        const clientDocRef = doc(db, "clients", clienteId);
        const clientSnap = await getDoc(clientDocRef);

        if (!clientSnap.exists()) {
            sealContainer.classList.add('hidden');
            return;
        }

        const clientData = clientSnap.data();

        // Atualiza os elementos do selo com os dados do cliente
        document.getElementById('seal-order-count').textContent = clientData.totalOrders || 0;
        document.getElementById('seal-payment-status').textContent = (clientData.totalDebt > 0) ? 'Devedor' : 'Em dia';
        document.getElementById('seal-payment-icon').className = (clientData.totalDebt > 0) ? 'fas fa-thumbs-down text-xl mb-1 text-red-500' : 'fas fa-thumbs-up text-xl mb-1 text-green-500';
        document.getElementById('seal-client-since').textContent = clientData.firstOrderDate ? formatDateToBR(clientData.firstOrderDate) : '--';

        // Adiciona o listener de clique para abrir o histórico
        sealContainer.onclick = () => showClientHistoryModal(clienteId, clientData.name);

        sealContainer.classList.remove('hidden');

    } catch (error) {
        console.error("Erro ao atualizar o selo do cliente:", error);
        sealContainer.classList.add('hidden');
    }
}

// NOVO: Helper para encontrar um cliente no banco de dados
// ATENÇÃO: Esta função está duplicada com findClientByPhone e findClientByName no firebaseService.js
// Ela será removida daqui e a chamada será feita diretamente para firebaseService.js
/*
async function findClient(queryData) {
    const clientsRef = collection(db, "clients");
    let q;

    if (queryData.phone) {
        q = query(clientsRef, where("phone", "==", queryData.phone), limit(1));
    } else if (queryData.name) {
        // A busca por nome é case-sensitive. Uma melhoria futura seria armazenar o nome em minúsculas para busca.
        q = query(clientsRef, where("name", "==", queryData.name), limit(1));
    } else {
        return null;
    }

    try {
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            const doc = querySnapshot.docs[0];
            return { id: doc.id, ...doc.data() };
        }
    } catch (error) {
        console.error("Erro ao buscar cliente:", error);
    }
    return null;
}
*/

// NOVO: Função para configurar os listeners do Selo do Cliente
// ATENÇÃO: Esta função está duplicada e será removida, pois a lógica foi movida para pdv.js
/*
function setupClientSealListeners() {
    const nameInput = document.getElementById('customer-name');
    const phoneInput = document.getElementById('customer-phone');
    const sealContainer = document.getElementById('client-seal-container');

    if (!nameInput || !phoneInput || !sealContainer) {
        console.warn("Elementos para o Selo do Cliente não encontrados. A funcionalidade não será ativada.");
        return;
    }

    const handleBlur = async (event) => {
        const value = event.target.value.trim();
        // Se o campo for limpo, esconde o selo. Se for muito curto, não faz nada.
        if (value.length === 0) sealContainer.classList.add('hidden');
        if (value.length < 3) return;

        const query = event.target.id === 'customer-name' ? { name: formatNameToTitleCase(value) } : { phone: formatPhone(value) };
        const client = await findClient(query);
        
        client ? updateClientSeal(client.id) : sealContainer.classList.add('hidden');
    };

    nameInput.addEventListener('blur', handleBlur);
    phoneInput.addEventListener('blur', handleBlur);
}
*/

// NOVO: Função para renderizar a tabela de clientes com destaques visuais
export async function renderClientsTable() {
    const tableBody = document.getElementById('manager-clients-table-body');
    if (!tableBody) {
        console.error("Elemento 'manager-clients-table-body' não encontrado.");
        return;
    }

    tableBody.innerHTML = '<tr><td colspan="8" class="text-center p-4">Carregando clientes...</td></tr>';

    try {
        const clientsRef = collection(db, "clients");
        const q = query(clientsRef, orderBy("totalOrders", "desc")); // Ordena por mais compras
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            tableBody.innerHTML = '<tr><td colspan="8" class="text-center p-4">Nenhum cliente cadastrado.</td></tr>';
            return;
        }

        let rowsHtml = '';
        querySnapshot.forEach(doc => {
            const client = doc.data();
            const clientId = doc.id;
            const clientName = client.name || 'N/A';
            const totalOrders = client.totalOrders || 0;

            // Lógica para definir a classe do selo com base no número de compras
            let badgeClass = 'low'; // Padrão
            if (totalOrders >= 30) badgeClass = 'very-high';
            else if (totalOrders >= 15) badgeClass = 'high';
            else if (totalOrders >= 5) badgeClass = 'medium';

            rowsHtml += `
                <tr class="border-b hover:bg-gray-50" data-client-id="${clientId}" data-client-name="${clientName}">
                    <td class="p-2 text-center w-12"><input type="checkbox" class="client-checkbox highlight-checkbox" data-phone="${client.phone || ''}"></td>
                    <td class="py-2 px-3 font-semibold">${clientName}</td>
                    <td class="py-2 px-3">${client.phone || 'N/A'}</td>
                    <td class="py-2 px-3 text-right font-mono ${client.totalDebt > 0 ? 'text-red-500 font-bold' : ''}">${formatCurrency(client.totalDebt || 0)}</td>
                    <td class="py-2 px-3 text-center"><span class="purchase-count-badge ${badgeClass}" title="${totalOrders} compras">${totalOrders}</span></td>
                    <td class="py-2 px-3">${client.firstOrderDate ? formatDateToBR(client.firstOrderDate) : '--'}</td>
                    <td class="py-2 px-3">${client.ranking || '--'}</td>
                    <td class="py-2 px-3 text-center"><button class="text-blue-600 hover:text-blue-800 view-client-history-btn" title="Ver histórico de pedidos"><i class="fas fa-history pointer-events-none"></i></button></td>
                </tr>
            `;
        });

        tableBody.innerHTML = rowsHtml;

    } catch (error) {
        console.error("Erro ao carregar e renderizar clientes:", error);
        tableBody.innerHTML = '<tr><td colspan="8" class="text-center p-4 text-red-500">Erro ao carregar clientes.</td></tr>';
        showToast("Erro ao carregar a lista de clientes.", "error");
    }
}

// --- LÓGICA DE CONTROLE DE PRODUÇÃO ---

/**
 * Verifica se adicionar o pedido atual a um determinado horário excederá o limite de produção.
 * @param {object} orderToCheck - O objeto do pedido que está sendo verificado.
 * @param {string} deliveryDateStr - A data de retirada no formato 'YYYY-MM-DD'.
 * @param {string} deliveryTimeStr - A hora da retirada no formato 'HH:MM'.
 * @returns {Promise<{isOverloaded: boolean, currentCount: number, limit: number}>} - Um objeto indicando se está sobrecarregado, a contagem total e o limite.
 */
export async function checkProductionOverload(orderToCheck, deliveryDateStr, deliveryTimeStr) {
	try {
		// Se as configurações de produção não estiverem carregadas, pulpa a verificação.
		if (!productionSettings) {
			console.warn("checkProductionOverload: Configurações de produção não disponíveis. Pulando verificação.");
			return { isOverloaded: false, currentCount: 0, limit: 99999 };
		}
		const { limit, windowMinutes } = productionSettings;

		// 1. Validar e parsear data/hora
		if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDateStr) || !/^\d{2}:\d{2}$/.test(deliveryTimeStr)) {
			console.error("checkProductionOverload: Formato de data ou hora inválido.", { deliveryDateStr, deliveryTimeStr });
			return { isOverloaded: false, currentCount: 0, limit: limit };
		}

		const [year, month, day] = deliveryDateStr.split('-').map(Number);
		const [hours, minutes] = deliveryTimeStr.split(':').map(Number);
		const targetDateTime = new Date(year, month - 1, day, hours, minutes);

		// 2. Calcular a janela de tempo para verificação
		const startTime = new Date(targetDateTime.getTime() - windowMinutes * 60000);
		const endTime = new Date(targetDateTime.getTime() + windowMinutes * 60000);

		// 3. Fazer a query no Firebase para buscar pedidos na mesma data e janela de tempo
		const ordersRef = collection(db, "orders");
		const q = query(ordersRef,
			where("deliveryDate", "==", deliveryDateStr),
			where("deliveryTimestamp", ">=", Timestamp.fromDate(startTime)),
			where("deliveryTimestamp", "<=", Timestamp.fromDate(endTime)),
			where("status", "!=", "cancelado") // Ignora pedidos cancelados
		);

		const querySnapshot = await getDocs(q);

		// 4. Calcular o total de salgados (fritos + assados) dos pedidos existentes, EXCLUINDO o pedido atual se estiver sendo editado.
		let totalSalgados = 0;
		querySnapshot.forEach(doc => {
			// Se estivermos editando um pedido existente, não conte seus próprios salgados aqui.
			if (orderToCheck.id && doc.id === orderToCheck.id) {
				return;
			}
			const order = doc.data();
			if (order.items) {
				order.items.forEach(item => {
					if (item.category === 'fritos' || item.category === 'assados') {
						totalSalgados += item.quantity || 0;
					}
				});
			}
		});

		// 5. Adicionar os salgados do pedido ATUAL (que está sendo criado/editado) à contagem.
		(orderToCheck.items || []).forEach(item => {
			if (item.category === 'fritos' || item.category === 'assados') {
				totalSalgados += item.quantity || 0;
			}
		});

		console.log(`Verificação de Sobrecarga: ${totalSalgados} salgados encontrados para a janela de ${deliveryTimeStr}. Limite é ${limit}.`);

		// 6. Comparar com o limite e retornar o resultado
		return {
			isOverloaded: totalSalgados > limit,
			currentCount: totalSalgados,
			limit: limit
		};
	} catch (error) {
		console.error("Erro ao verificar sobrecarga de produção:", error);
		showToast("Erro ao verificar horário. Tente novamente.", "error");
		return { isOverloaded: false, currentCount: 0, limit: productionSettings?.limit || 99999 };
	}
}

/**
 * Carrega as configurações de sobrecarga para a UI do painel do gerente.
 * Esta função deve ser chamada quando a view 'sistema' do gerente é exibida.
 */
export function loadOverloadSettingsToUI() {
    const limitInput = document.getElementById('overload-limit-input');
    const windowInput = document.getElementById('overload-window-input');

    if (limitInput && windowInput && productionSettings) {
        limitInput.value = productionSettings.limit || 1200;
        windowInput.value = productionSettings.windowMinutes || 30;
        console.log("Configurações de sobrecarga carregadas na UI.");
    } else {
        console.warn("Não foi possível carregar as configurações de sobrecarga na UI. Elementos ou configurações não encontrados.");
    }
}

// --- LÓGICA DE AUTENTICAÇÃO ---

/**
 * Alterna a aba de login visível (Funcionário ou Gerência).
 * @param {'funcionario' | 'gerencia'} activeTab O nome da aba a ser ativada.
 */
function switchLoginTab(activeTab) {
    const isFuncionario = activeTab === 'funcionario';

    // Atualiza as classes das abas para o feedback visual
    dom.tabFuncionario.classList.toggle('active-tab-login', isFuncionario);
    dom.tabGerencia.classList.toggle('active-tab-login', !isFuncionario);

    // Mostra/esconde os formulários correspondentes
    dom.loginFuncionarioDiv.classList.toggle('hidden', !isFuncionario);
    dom.loginGerenciaDiv.classList.toggle('hidden', isFuncionario);

    // Foca no campo apropriado
    if (isFuncionario) {
        dom.employeeUserSelect.focus();
    } else {
        dom.managerUserInput.focus();
    }
}

/**
 * Lida com a tentativa de login do funcionário.
 */
async function handleFuncionarioLogin() {
    const selectedName = dom.employeeUserSelect.value;
    const password = dom.employeePassInput.value;

    if (!selectedName) return showToast("Por favor, selecione seu nome.", "error");
    if (!password) return showToast("Por favor, digite sua senha.", "error");

    const employee = employees.find(e => e.name === selectedName);
    if (employee && String(employee.password) === password) {
        // Se a senha for a padrão "1234", força a alteração
        if (password === '1234') {
            showToast("Por segurança, você deve alterar sua senha inicial.", "info", 4000);
            // Define o usuário atual para que o modal de senha saiba quem está logado
            currentUser = { id: employee.id, name: employee.name, role: employee.role };
            showPasswordChangeModal(true); // O 'true' indica que a alteração é forçada
        } else {
            // Login normal
            showToast(`Bem-vindo(a), ${selectedName}!`, "success");
            await logUserActivity(selectedName, 'login');
            startApp('funcionario', employee);
        }
    } else {
        showToast("Senha incorreta. Tente novamente.", "error");
    }
}

/**
 * Lida com a tentativa de login da gerência.
 */
async function handleGerenciaLogin() {
    const userInput = dom.managerUserInput.value.trim();
    const pass = dom.managerPassInput.value;

    if (!userInput || !pass) {
        return showToast("Usuário e senha são obrigatórios.", "error");
    }

    // 1. Check for Master User first
    if (userInput.toLowerCase() === masterCredentials.user && pass === masterCredentials.pass) {
        showToast("Acesso Mestra concedido.", "info");
        startApp('mestra', { name: 'Mestra', role: 'mestra' });
        return;
    }

    // 2. Find a manager in the employees list whose name matches (case-insensitive)
    const manager = employees.find(e => e.name.toLowerCase() === userInput.toLowerCase() && e.role === 'gerente');

    if (manager && String(manager.password) === String(pass)) {
        showToast(`Bem-vindo(a), ${manager.name}!`, "success");
        await logUserActivity(manager.name, 'login'); // Log the specific manager's login
        startApp('gerente', manager); // Pass the full manager object
    } else {
        showToast("Usuário ou senha de gerência incorretos ou sem permissão.", "error");
    }
}

/**
 * Configura os listeners de eventos para a tela de autenticação.
 */
export function setupAuthListeners() {
    dom.tabFuncionario.addEventListener('click', () => switchLoginTab('funcionario'));
    dom.tabGerencia.addEventListener('click', () => switchLoginTab('gerencia'));
    dom.loginBtnFuncionario.addEventListener('click', handleFuncionarioLogin);
    dom.loginBtnGerencia.addEventListener('click', handleGerenciaLogin);
    dom.employeePassInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleFuncionarioLogin(); });
    dom.managerPassInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleGerenciaLogin(); });

    // Listener para o link "Esqueci minha senha"
    const forgotPasswordLink = document.getElementById('forgot-password-link');
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', async (e) => {
            e.preventDefault();
            const employeeSelect = dom.employeeUserSelect;
            const selectedEmployeeName = employeeSelect.value;

            if (!selectedEmployeeName) {
                showToast('Por favor, selecione seu nome na lista primeiro.', 'error');
                return;
            }

            const employee = employees.find(e => e.name === selectedEmployeeName);
            if (!employee) {
                showToast('Funcionário não encontrado na lista carregada.', 'error');
                return;
            }

            // Confirmação para o usuário
            const userConfirmed = confirm(`Você tem certeza que deseja solicitar a redefinição de senha para "${selectedEmployeeName}"?\nUm gerente será notificado.`);

            if (userConfirmed) {
                try {
                    // Adiciona uma notificação no Firebase para os gerentes
                    const notificationsRef = collection(db, 'notifications');
                    await addDoc(notificationsRef, {
                        type: 'password_reset_request',
                        message: `O funcionário ${selectedEmployeeName} solicitou a redefinição de senha.`,
                        employeeName: selectedEmployeeName,
                        employeeId: employee.id, // ID para facilitar a redefinição
                        timestamp: serverTimestamp(),
                        read: false
                    });
                    showToast('Sua solicitação foi enviada a um gerente.', 'success');
                } catch (error) {
                    console.error("Erro ao solicitar redefinição de senha:", error);
                    showToast('Ocorreu um erro ao enviar a solicitação. Tente novamente.', 'error');
                }
            }
        });
    }
}

// --- LÓGICA DE NOTIFICAÇÕES ---

// Registra a função que será chamada quando novas notificações chegarem
export function registerNotificationListener(callback) {
    notificationListenerCallback = callback;
    console.log("Notification callback registered.");
}

// Inicia o listener de notificações em tempo real
export function startNotificationListener() {
    if (unsubscribeNotifications) {
        console.log("Notification listener já está ativo.");
        return;
    }

    isFirstNotificationLoad = true; // Reseta a flag sempre que o listener é iniciado

    console.log("Iniciando o listener de notificações...");
    const notificationsRef = collection(db, "notifications");
    const q = query(notificationsRef, orderBy("timestamp", "desc"), limit(50)); // Pega as 50 mais recentes

    unsubscribeNotifications = onSnapshot(q, (snapshot) => {
        const notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Lógica para tocar som e animar o sino APENAS para novas notificações
        // A flag `isFirstNotificationLoad` impede que isso aconteça na primeira vez que os dados são carregados.
        if (!isFirstNotificationLoad) {
            snapshot.docChanges().forEach((change) => {
                // Reage apenas a documentos recém-adicionados.
                if (change.type === "added") {
                    const notificationData = change.doc.data();
                    // Toca o som apenas se a notificação não estiver marcada como lida.
                    if (!notificationData.read) {
                        console.log("Nova notificação recebida, tocando som e animando.");
                        playSound('sounds/notification.mp3');
                        triggerNotificationAnimation();
                    }
                }
            });
        }

        if (notificationListenerCallback) {
            notificationListenerCallback(notifications);
        }

        // Após o primeiro carregamento, define a flag como false para que as próximas notificações acionem o som.
        isFirstNotificationLoad = false;
    }, (error) => {
        console.error("Erro no listener de notificações:", error);
        showToast("Erro ao receber notificações em tempo real.", "error");
    });
}

// Para o listener de notificações (ex: ao fazer logout)
export function stopNotificationListener() {
    if (unsubscribeNotifications) {
        unsubscribeNotifications();
        unsubscribeNotifications = null;
        console.log("Listener de notificações parado.");
    }
}

// Função para iniciar a aplicação com base no tipo de usuário
export async function startApp(userType, user) {
    console.log("startApp: Iniciando aplicação para tipo de usuário:", userType, "com dados:", user);
    
    // Log do estado atual dos elementos antes de qualquer mudança
    console.log("startApp: Estado inicial - dom.authScreen:", dom.authScreen ? 'presente' : 'ausente', 'display:', dom.authScreen?.style.display);
    console.log("startApp: Estado inicial - dom.mainContent:", dom.mainContent ? 'presente' : 'ausente', 'display:', dom.mainContent?.style.display);
    console.log("startApp: Estado inicial - dom.managerDashboard:", dom.managerDashboard ? 'presente' : 'ausente', 'display:', dom.managerDashboard?.style.display);

    if (dom.authScreen) {
        // Força a ocultação e garante que fique atrás de tudo
        dom.authScreen.style.display = 'none'; 
        dom.authScreen.style.zIndex = '-1'; 
        console.log("startApp: dom.authScreen forçado para display: none e zIndex: -1.");
    } else {
        console.error("startApp: dom.authScreen não encontrado!");
    }
    
    await loadConfig(); // Garante que as configurações sejam carregadas antes de renderizar produtos
    
    currentUser = { id: user.id, name: user.name, role: user.role || userType, uid: user.uid };
    console.log("startApp: Usuário atual definido como:", currentUser);

    // Se o login foi feito como 'funcionario', o usuário vai para o PDV.
    if (userType === 'funcionario') {
        console.log("startApp: Modo funcionário. Tentando exibir PDV.");
        if (dom.mainContent) { 
            // Força a exibição e garante que esteja na frente
            dom.mainContent.style.display = 'flex'; 
            dom.mainContent.style.zIndex = '1'; 
            console.log("startApp: dom.mainContent.style.display definido para 'flex' e zIndex: '1'.");
        } else {
            console.error("startApp: dom.mainContent não encontrado!");
        }
        if (dom.managerDashboard) { 
            dom.managerDashboard.style.display = 'none'; 
            console.log("startApp: dom.managerDashboard.style.display definido para 'none'.");
        } else {
            console.warn("startApp: dom.managerDashboard não encontrado (pode ser normal se não estiver no HTML).");
        }

        renderProducts(); // Renderiza produtos após carregar as configurações

        // A chamada a startNewOrder() já obtém o próximo número e configura o pdvCurrentOrder
        await startNewOrder(); 
        
        setupPdvEventListeners(); // Configura listeners do PDV
        setupEmployeeReportListeners(); // Configura listeners do Relatório do Funcionário
        // setupClientSealListeners(); // REMOVIDO: Lógica movida para pdv.js
        
        if (dom.reportBtn) { dom.reportBtn.style.display = 'block'; } // Botão de relatório sempre visível no PDV

        // Lógica para exibir botões de acordo com o cargo do usuário logado no PDV
        if (currentUser.role === 'gerente' || currentUser.role === 'mestra') {
            // Se for gerente/mestra, mostra o botão para voltar ao painel
            if (dom.returnToManagerBtn) dom.returnToManagerBtn.classList.remove('hidden');
            if (dom.managerAccessBtn) dom.managerAccessBtn.style.display = 'none'; // Esconde o acesso rápido, pois já está logado
        } else {
            // Se for funcionário comum, esconde o botão de voltar e mostra o de acesso rápido
            if (dom.returnToManagerBtn) dom.returnToManagerBtn.classList.add('hidden');
            if (dom.managerAccessBtn) dom.managerAccessBtn.style.display = 'block';
        }
        
        populatePdvEmployeeSwitcher(); // Popula o seletor de funcionários no PDV
        if (dom.employeeSwitcherSelect) {
            dom.employeeSwitcherSelect.value = currentUser.name;
            dom.employeeSwitcherSelect.classList.add('employee-switcher-selected');
        }
        if (dom.pdvEmployeeOnlineStatus) dom.pdvEmployeeOnlineStatus.classList.remove('hidden');

        // CORREÇÃO: Ordem dos pop-ups
        // 1. Verifica lembretes de produção PRIMEIRO
        const dailyDeliveries = await checkForDailyDeliveries();
        if (dailyDeliveries && dailyDeliveries.length > 0) {
            currentReminderOrders = dailyDeliveries; // Atualiza a variável global
            showReminderModal(dailyDeliveries); // Chama o modal de lembrete do PDV
        }
        
        // 2. Verifica a Central de Alertas DEPOIS
        console.log("startApp: Verificando alertas de pedidos expirados...");
        const allPendingOrders = await fetchExpiredPendingOrders();
        const now = new Date();
        now.setHours(0, 0, 0, 0); // Define para o início do dia para comparação

        const expiredOrders = allPendingOrders.filter(order => {
            if (!order.delivery || !order.delivery.date) return false;
            const [day, month, year] = order.delivery.date.split('/');
            const deliveryDate = new Date(year, month - 1, day);
            return deliveryDate < now;
        });

        // Limpa e preenche o estado global de alertas
        pendingAlerts.splice(0, pendingAlerts.length, ...expiredOrders);
        
        if (pendingAlerts.length > 0) {
            console.log(`startApp: ${pendingAlerts.length} alertas de pedidos expirados encontrados.`);
            showExpiredOrdersAlert(pendingAlerts); // Mostra o modal
            if (dom.alerts.badge) {
                dom.alerts.badge.textContent = pendingAlerts.length;
                dom.alerts.badge.classList.remove('hidden');
            }
            playSound('sounds/notification.mp3'); // Toca o som de notificação
        } else {
            console.log("startApp: Nenhum alerta de pedido expirado.");
            if (dom.alerts.badge) {
                dom.alerts.badge.classList.add('hidden');
            }
        }
    }
    // Se o login foi feito como 'gerente' ou 'mestra', o usuário vai para o painel gerencial.
    else {
        console.log("startApp: Modo gerente/mestra. Tentando exibir Painel Gerencial.");
        if (dom.manager && dom.manager.nameDisplay) { dom.manager.nameDisplay.textContent = user.name; }
        if (dom.managerDashboard) { 
            // Força a exibição e garante que esteja na frente
            dom.managerDashboard.style.display = 'flex'; 
            dom.managerDashboard.style.zIndex = '1'; 
            console.log("startApp: dom.managerDashboard.style.display definido para 'flex' e zIndex: '1'.");
        } else {
            console.error("startApp: dom.managerDashboard não encontrado!");
        }
        if (dom.mainContent) { 
            dom.mainContent.style.display = 'none'; 
            console.log("startApp: dom.mainContent.style.display definido para 'none'.");
        } else {
            console.warn("startApp: dom.mainContent não encontrado (pode ser normal se não estiver no HTML).");
        }
        
        setupManagerDashboardListeners(); // Configura listeners do Gerente
        setupEmployeeReportListeners(); // Configura listeners do Relatório do Funcionário (para acesso via gerente)

        applyRolePermissions(currentUser); // Aplica as permissões com base no cargo

        // INÍCIO DA LÓGICA DE PERMISSÃO ADICIONAL PARA GERENTE E MASTER
        const equipeLink = document.getElementById('sidebar-link-equipe');
        const sistemaLink = document.getElementById('sidebar-link-sistema');
        const passwordSection = document.getElementById('manager-password-change-section');
        const riskZone = document.getElementById('manager-risk-zone');
        const firebaseSection = document.getElementById('firebase-access-section');

        // Garante que os elementos existam antes de manipulá-los
        if (equipeLink && sistemaLink && passwordSection && riskZone && firebaseSection) {
            // Permissões para o usuário 'gerente'
            if (currentUser.role === 'gerente') {
                equipeLink.style.display = 'flex'; // Mostra o link 'Equipe'
                sistemaLink.style.display = 'flex'; // Mostra o link 'Sistema'
                passwordSection.style.display = 'none'; // Esconde a alteração de senha
                riskZone.style.display = 'none'; // Esconde a área de risco
                firebaseSection.style.display = 'none'; // Esconde a seção de acesso ao Firebase
            } 
            // Permissões para o usuário 'mestra' (acesso total)
            else if (currentUser.role === 'mestra') {
                equipeLink.style.display = 'flex';
                sistemaLink.style.display = 'flex';
                passwordSection.style.display = 'block'; // Garante que a alteração de senha esteja visível
                riskZone.style.display = 'block'; // Garante que a área de risco esteja visível
                firebaseSection.style.display = 'block'; // Garante que a seção de acesso ao Firebase esteja visível
            }
        }
        // FIM DA LÓGICA DE PERMISSÃO ADICIONAL

        if (currentUser.role === 'mestra') {
            navigateToManagerView('master-reset');
        } else {
            navigateToManagerView('gerencial-dashboard');
        }
        startNotificationListener(); // Inicia o listener para o gerente

        // NOVO: Inicia o listener de pedidos em tempo real para a tabela de pedidos
        setupRealtimeOrderListener();
    }
    console.log("startApp: Aplicação iniciada.");
}

// NOVO: Lógica para o modal de alteração de senha do funcionário
export function setupPasswordChangeListeners() {
    const changePassBtn = document.getElementById('change-password-btn');
    const changePassModal = document.getElementById('change-password-modal');
    const cancelBtn = document.getElementById('change-password-cancel-btn');
    const saveBtn = document.getElementById('change-password-save-btn');
    const currentPassInput = document.getElementById('current-password-input');
    const newPassInput = document.getElementById('new-password-input');
    const confirmPassInput = document.getElementById('confirm-password-input');
    const modalTitle = changePassModal.querySelector('h2');

    if (!changePassModal || !changePassBtn || !cancelBtn || !saveBtn) {
        console.warn("Elementos do modal de alteração de senha não encontrados.");
        return;
    }

    const hideModal = () => {
        changePassModal.classList.remove('active');
        // Garante que o modal volte ao estado padrão ao ser fechado
        modalTitle.textContent = "Alterar Minha Senha";
        cancelBtn.classList.remove('hidden');
        currentPassInput.disabled = false;
        currentPassInput.classList.remove('bg-gray-100');
    };

    // Atribui a função à variável global para que possa ser chamada de outros locais (como o login)
    showPasswordChangeModal = (isForced = false) => {
        currentPassInput.value = '';
        newPassInput.value = '';
        confirmPassInput.value = '';

        if (isForced) {
            modalTitle.textContent = "Crie uma Nova Senha";
            cancelBtn.classList.add('hidden'); // Esconde o botão de cancelar
            currentPassInput.value = '1234';
            currentPassInput.disabled = true; // Desabilita o campo de senha atual
            currentPassInput.classList.add('bg-gray-100');
            newPassInput.focus();
        } else {
            modalTitle.textContent = "Alterar Minha Senha";
            cancelBtn.classList.remove('hidden');
            currentPassInput.disabled = false;
            currentPassInput.classList.remove('bg-gray-100');
            currentPassInput.focus();
        }
        changePassModal.classList.add('active');
    };

    changePassBtn.addEventListener('click', () => {
        if (!currentUser || !currentUser.id) {
            showToast("Faça login para alterar sua senha.", "error");
            return;
        }
        showPasswordChangeModal(false); // Chamada para alteração voluntária
    });

    cancelBtn.addEventListener('click', hideModal);

    saveBtn.addEventListener('click', async () => {
        const newPass = newPassInput.value;
        const confirmPass = confirmPassInput.value;

        if (!currentUser || !currentUser.id) return showToast("Sessão expirada. Faça login novamente.", "error");

        const employee = employees.find(e => e.id === currentUser.id);
        const isForcedChange = currentPassInput.disabled;

        // Só valida a senha atual se NÃO for uma alteração forçada
        if (!isForcedChange && (!employee || String(employee.password) !== currentPassInput.value)) {
            return showToast("Senha atual incorreta.", "error");
        }
        if (newPass.length < 4) return showToast("A nova senha deve ter no mínimo 4 caracteres.", "error");
        if (newPass !== confirmPass) return showToast("As novas senhas não coincidem.", "error");
        if (newPass === '1234') return showToast("Você não pode usar a senha padrão.", "error");

        try {
            const employeeDocRef = doc(db, `employees/${currentUser.id}`);
            await updateDoc(employeeDocRef, { password: newPass });

            // Atualiza a senha no objeto local para futuras verificações na mesma sessão
            if (employee) employee.password = newPass;

            showToast("Senha alterada com sucesso!", "success");
            hideModal();

            // Se foi uma alteração forçada, completa o processo de login
            if (isForcedChange) {
                showToast("Entrando no sistema...", "info");
                await logUserActivity(currentUser.name, 'login');
                await startApp('funcionario', currentUser);
            }
        } catch (error) {
            console.error("Erro ao alterar senha:", error);
            showToast("Falha ao alterar a senha. Tente novamente.", "error");
        }
    });
}

// NOVO: Função para configurar os listeners do seletor de horário interativo
/**
 * Configura a funcionalidade de entrada manual de horário no modal seletor.
 * Inclui máscara de input, validação, inserção ordenada e rolagem automática com destaque.
 */
function setupTimeSelectorListeners() {
    // 1. Seleção dos Elementos do DOM
    const manualTimeInput = document.getElementById('manual-time-input');
    const confirmBtn = document.getElementById('confirm-manual-time-btn');
    const timeSlotsContainer = document.getElementById('time-slots-container');
    const deliveryTimeInput = document.getElementById('delivery-time');
    const timeSelectorModal = document.getElementById('interactive-time-selector-modal');

    // Validação para garantir que todos os elementos existem
    if (!manualTimeInput || !confirmBtn || !timeSlotsContainer || !deliveryTimeInput || !timeSelectorModal) {
        console.warn("Um ou mais elementos do seletor de horário não foram encontrados. A funcionalidade não será ativada.");
        return;
    }

    // 2. Máscara de Horário (HH:MM)
    manualTimeInput.addEventListener('input', (e) => {
        let value = e.target.value.replace(/\D/g, ''); // Remove não-dígitos
        if (value.length > 2) {
            value = `${value.substring(0, 2)}:${value.substring(2, 4)}`;
        }
        e.target.value = value;
    });

    // 3. Lógica de Confirmação (Botão e Tecla Enter)
    const handleConfirm = async () => { // Adicionado 'async' aqui
        const timeValue = manualTimeInput.value;
        const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/; // Valida o formato HH:MM

        if (!timeRegex.test(timeValue)) {
            showToast('Formato de hora inválido. Use HH:MM.', 'error');
            manualTimeInput.focus();
            return;
        }

        // Validação de intervalo de horário (09:00 a 19:00)
        const [hours, minutes] = timeValue.split(':').map(Number);
        if (hours < 9 || (hours >= 19 && minutes > 0)) {
            showToast('O horário de retirada deve ser entre 09:00 e 19:00.', 'error');
            manualTimeInput.focus();
            return;
        }

        // Chama openInteractiveTimeSelector para re-renderizar a lista com o novo horário
        await openInteractiveTimeSelector(timeValue); // Chama a função com o horário manual

        // Após a re-renderização, encontra o elemento e rola para ele
        // Usamos um pequeno atraso para garantir que o DOM foi atualizado
        setTimeout(() => {
            const targetSlot = timeSlotsContainer.querySelector(`[data-time="${timeValue}"]`);
            if (targetSlot) {
                scrollToAndHighlight(targetSlot);
            }
        }, 100); // Pequeno atraso para garantir que o elemento foi renderizado

        manualTimeInput.value = ''; // Limpa o input manual
    };

    confirmBtn.addEventListener('click', handleConfirm);
    manualTimeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleConfirm();
        }
    });

    // 4. Função para Selecionar o Horário e Fechar o Modal
    const selectTimeAndCloseModal = (time) => {
        deliveryTimeInput.value = time;
        // Dispara um evento de 'input' para garantir que outras lógicas (como mostrar o botão 'limpar') sejam acionadas
        deliveryTimeInput.dispatchEvent(new Event('input', { bubbles: true }));
        timeSelectorModal.classList.remove('active');
    };

    // 5. Função para Rolar e Destacar o Elemento
    const scrollToAndHighlight = (element) => {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Usa a classe CSS definida na Parte 2
        element.classList.add('highlight-slot');
        setTimeout(() => {
            element.classList.remove('highlight-slot');
        }, 2500);
    };

    // 6. Função Auxiliar para Criar o Botão de Horário (Ajustada para consistência visual)
    const createTimeSlotButtonForManualEntry = (time) => {
        const button = document.createElement('button');
        // Classes para manter a consistência visual com outros botões de horário.
        // Inclui classes para a barra de progresso (vazia inicialmente)
        button.className = 'time-slot-btn flex flex-col items-center justify-center p-3 border rounded-lg bg-gray-50 hover:bg-blue-100 hover:border-blue-400 transition-all duration-200';
        button.dataset.time = time;
        // Adiciona o horário e uma pequena tag "Manual" para identificação
        button.innerHTML = `
            <div class="flex justify-between items-center mb-1.5">
                <div class="font-bold text-lg">${time}</div>
                <strong class="text-gray-500 text-xl">0</strong>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2.5 mt-1">
                <div class="h-2.5 rounded-full bg-blue-500" style="width: 0%"></div>
            </div>
            <span class="absolute top-1 right-1 text-xs bg-indigo-500 text-white rounded-full px-1.5 py-0.5" title="Horário Personalizado"><i class="fas fa-star"></i></span>
        `;
        // Adiciona o evento de clique para selecionar o horário e fechar o modal
        button.addEventListener('click', () => {
            selectTimeAndCloseModal(time);
        });
        return button;
    };

    // 7. Listener de Eventos para os Slots de Horário (Corrigido e movido para o escopo correto)
    // Este listener delega o evento de clique para qualquer botão de horário dentro do contêiner.
    timeSlotsContainer.addEventListener('click', (e) => {
        const button = e.target.closest('.time-slot-btn');
        if (button && button.dataset.time) {
            // --- CORREÇÃO CRÍTICA: Validação de horário expirado ---
            // A lógica anterior tinha um bug de fuso horário (UTC). Esta nova versão usa
            // date-fns para uma comparação segura e precisa.

            const dateInput = dom.deliveryDate;

            // 1. Constrói a data/hora do slot de forma segura.
            const combinedStr = `${dateInput.value} ${button.dataset.time}`;
            const slotDateTime = dateFns.parse(combinedStr, 'yyyy-MM-dd HH:mm', new Date());

            // 2. Compara com o horário atual (com uma pequena tolerância).
            const nowWithTolerance = dateFns.subMinutes(new Date(), 1);
            if (dateFns.isBefore(slotDateTime, nowWithTolerance)) {
                showToast('Este horário já passou e não pode ser selecionado.', 'info');
                return;
            }
            selectTimeAndCloseModal(button.dataset.time);
        }
    });
}

// --- LÓGICA DA CENTRAL DE ALERTAS (MOVIMOS PARA CÁ PARA FACILITAR A CUSTOMIZAÇÃO) ---

/**
 * Exibe o modal da Central de Alertas com os pedidos expirados e pendentes.
 * @param {Array} expiredOrders - A lista de pedidos a serem exibidos.
 */
function showExpiredOrdersAlert(expiredOrders) {
    const modal = dom.alerts.modal;
    const listContainer = dom.alerts.list;
    const closeBtn = dom.alerts.closeBtn;

    if (!modal || !listContainer || !closeBtn) {
        console.error("Elementos do modal da Central de Alertas não encontrados.");
        return;
    }

    if (expiredOrders.length === 0) {
        listContainer.innerHTML = '<p class="text-center text-gray-500 p-8">Nenhum alerta de pedido expirado encontrado.</p>';
    } else {
        listContainer.innerHTML = expiredOrders.map(order => createExpiredOrderAlertHTML(order)).join('');
    }

    modal.classList.add('active');

    // Adiciona o listener para fechar o modal
    closeBtn.addEventListener('click', () => modal.classList.remove('active'), { once: true });

    // Adiciona listeners para os botões de ação (usando delegação de eventos)
    listContainer.addEventListener('click', handleAlertAction);
}

/**
 * Manipula os cliques nos botões de ação dentro da Central de Alertas.
 * @param {Event} e - O objeto do evento de clique.
 */
async function handleAlertAction(e) {
    const button = e.target.closest('.alert-action-btn');
    if (!button) return;

    const alertItem = button.closest('[data-order-id]');
    const orderId = alertItem.dataset.orderId;
    const action = button.dataset.action;

    console.log(`Ação de Alerta: ${action}, Pedido ID: ${orderId}`);

    // Busca o pedido no estado global de alertas para evitar parsing de HTML e ter dados à mão
    const orderFromState = pendingAlerts.find(o => o.id === orderId);

    switch (action) {
        case 'liquidate':
            // Simula a busca e liquidação do pedido
            try {
                const orderRef = doc(db, "orders", orderId);
                const orderSnap = await getDoc(orderRef);
                if (orderSnap.exists()) {
                    const orderData = { id: orderSnap.id, ...orderSnap.data() };
                    // Simula o fluxo de liquidação
                    const confirmedResult = await showCustomConfirm("Liquidar Saldo", `Confirmar a liquidação total do débito de ${formatCurrency(orderData.restante)} para o pedido #${orderData.orderNumber}?`);
                    if (confirmedResult) { // CORREÇÃO: A confirmação simples retorna 'true', não um objeto.
                        await updateDoc(orderRef, {
                            paymentStatus: 'pago',
                            restante: 0,
                            settledBy: { name: currentUser.name, id: currentUser.id }, // CORREÇÃO: Usar 'id' em vez de 'uid'
                            settledAt: serverTimestamp(),
                            alertStatus: 'resolvido',
                            alertHandledBy: { name: currentUser.name, id: currentUser.id },
                            alertHandledAt: serverTimestamp()
                        });
                        showToast("Pedido liquidado com sucesso!", "success");
                        alertItem.remove(); // Remove o item da lista visualmente
                        // Remove também do estado global para manter a consistência
                        const index = pendingAlerts.findIndex(p => p.id === orderId);
                        if (index > -1) pendingAlerts.splice(index, 1);
                        if (dom.alerts.badge) dom.alerts.badge.textContent = pendingAlerts.length;
                        if (pendingAlerts.length === 0) dom.alerts.badge.classList.add('hidden');
                    }
                } else {
                    showToast("Pedido não encontrado.", "error");
                }
            } catch (error) {
                console.error("Erro ao liquidar pedido do alerta:", error);
                showToast("Falha ao liquidar pedido.", "error");
            }
            break;

        case 'view':
            // Busca o pedido diretamente pelo ID do documento e o carrega no formulário do PDV.
            try {
                const orderData = await findOrderByDocId(orderId);
                if (orderData) {
                    loadOrderIntoForm(orderData);
                    showToast(`Pedido #${orderData.orderNumber} carregado!`, "success");
                    dom.alerts.modal.classList.remove('active'); // Fecha o modal de alertas
                }
                // A função findOrderByDocId já mostra um toast de erro se não encontrar.
            } catch (error) {
                console.error("Erro ao carregar pedido do alerta:", error);
                showToast("Falha ao carregar pedido do alerta.", "error");
            }
            break;

        case 'send-manager':
            if (!orderFromState) {
                return showToast("Dados do pedido não encontrados para notificar.", "error");
            }
            const confirmed = await showCustomConfirm("Enviar para Gerente", "Tem certeza que deseja notificar a gerência sobre este pedido? Uma notificação será criada.");
            if (confirmed && confirmed.confirmed) {
                await createNotification('manager_attention', `Funcionário ${currentUser.name} solicita atenção para o pedido #${orderFromState.orderNumber}`, { orderId: orderId });
                await updateOrderAlertStatus(orderId, 'encaminhado_gerencia', currentUser);
                showToast("Gerência notificada com sucesso!", "success");

                // Remove o item da UI do funcionário, pois agora é responsabilidade do gerente
                alertItem.remove();
                const index = pendingAlerts.findIndex(p => p.id === orderId);
                if (index > -1) pendingAlerts.splice(index, 1);
                if (dom.alerts.badge) {
                    dom.alerts.badge.textContent = pendingAlerts.length;
                    if (pendingAlerts.length === 0) dom.alerts.badge.classList.add('hidden');
                }
            }
            break;
    }
}

// Função principal de inicialização
function main() {
    console.log("main: Iniciando a aplicação...");
    try { // CORREÇÃO: A inicialização do Firebase foi movida para 'firebase-config.js' para evitar dependência circular.
        console.log("main: Firebase inicializado a partir do módulo de configuração.");

        // Configura os listeners de autenticação
        setupAuthListeners();

        // NOVO: Configura os listeners para os filtros do Log de Atividades
        setupActivityLogListeners();

        // NOVO: Configura listeners para o modal de alteração de senha
        setupPasswordChangeListeners();

        // NOVO: Configura os listeners do seletor de horário
        setupTimeSelectorListeners();

        // Carrega os funcionários e popula o dropdown no início
        fetchEmployees().then(fetchedEmployees => {
            employees = fetchedEmployees; // Atualiza a variável global employees
            populateLoginEmployeeSelect(); // Popula o seletor de nomes na tela de login
            // Torna a página visível agora que os dados essenciais foram carregados
            document.body.classList.remove('invisible');
            console.log("main: Aplicação pronta e visível.");
        }).catch(error => {
            console.error("Erro ao carregar funcionários na inicialização:", error);
            showToast("Erro ao carregar lista de funcionários.", "error");
            // Mesmo com erro, torna a página visível para que o usuário não fique preso em uma tela em branco.
            document.body.classList.remove('invisible');
        });

        // Adiciona listener para o evento beforeunload para registrar logout
        window.addEventListener('beforeunload', () => {
            if (currentUser && currentUser.role === 'funcionario') {
                 logUserActivity(currentUser.name, 'logout');
            }
            stopNotificationListener(); // Para o listener ao fechar a aba
        });

        // NOVO: Listeners para o modal de histórico de preços
        const priceHistoryModal = document.getElementById('price-history-modal');
        const priceHistoryCloseBtn = document.getElementById('price-history-close-btn');

        if (priceHistoryCloseBtn && priceHistoryModal) {
            priceHistoryCloseBtn.addEventListener('click', () => {
                priceHistoryModal.classList.remove('active');
            });
        }

        // NOVO: Listeners para o modal de histórico de cliente
        const clientHistoryModal = document.getElementById('client-history-modal');
        const clientHistoryCloseBtn = document.getElementById('client-history-close-btn');

        if (clientHistoryCloseBtn && clientHistoryModal) {
            clientHistoryCloseBtn.addEventListener('click', () => {
                clientHistoryModal.classList.remove('active');
            });
        }

        // NOVO: Listener para o botão de histórico na tabela de clientes (usando delegação de eventos)
        const clientsTableBody = document.getElementById('manager-clients-table-body');
        if (clientsTableBody) {
            clientsTableBody.addEventListener('click', (e) => {
                const historyButton = e.target.closest('.view-client-history-btn');
                if (historyButton) {
                    const row = historyButton.closest('tr');
                    const clientId = row.dataset.clientId;
                    const clientName = row.dataset.clientName;
                    if (clientId && clientName) {
                        showClientHistoryModal(clientId, clientName);
                    }
                }
            });
        }

        // NOVO: Listeners para o modal de aviso de sobrecarga
        const overloadModal = document.getElementById('overload-warning-modal');
        const changeTimeBtn = document.getElementById('overload-change-time-btn');
        const continueAnywayBtn = document.getElementById('overload-continue-anyway-btn');

        if (overloadModal && changeTimeBtn && continueAnywayBtn) {
            // Botão para fechar o modal e focar no campo de hora para alteração
            changeTimeBtn.addEventListener('click', () => {
                overloadModal.classList.remove('active');
                if (dom.deliveryTime) {
                    dom.deliveryTime.focus();
                    dom.deliveryTime.select();
                }
            });
            // O listener do botão "Continuar Mesmo Assim" será adicionado dinamicamente no fluxo de finalização do pedido
            // para garantir que a função de salvar seja chamada corretamente.
        }

        // CORREÇÃO CRÍTICA: Adiciona o listener para o botão de fechar do modal de lembrete.
        // O bug que retorna para a tela de login ao fechar este modal indica que um listener
        // incorreto (provavelmente em outro arquivo) está sendo acionado.
        // Adicionar este listener aqui garante o comportamento correto e previne o bug.
        const reminderModal = document.getElementById('reminder-modal');
        const reminderCloseBtn = document.getElementById('reminder-close-btn');

        if (reminderModal && reminderCloseBtn) {
            reminderCloseBtn.addEventListener('click', (e) => {
                e.preventDefault(); // Previne qualquer comportamento padrão do botão.
                e.stopPropagation(); // Impede que o evento se propague para outros listeners.
                
                console.log("Botão 'Fechar' do lembrete clicado. Escondendo o modal.");
                reminderModal.classList.remove('active'); // Apenas esconde o modal.
            });
        }

        // NOVO: Listener para o botão de fechar do modal da Central de Alertas
        const expiredOrdersAlertCloseBtn = document.getElementById('expired-orders-alert-close-btn');
        if (expiredOrdersAlertCloseBtn) {
            expiredOrdersAlertCloseBtn.addEventListener('click', () => dom.alerts.modal.classList.remove('active'));
        }

        // NOVO: Listener para o botão de ABRIR a Central de Alertas (movido do pdv.js)
        const openAlertsBtn = dom.alerts.openBtn;
        if (openAlertsBtn && !openAlertsBtn.dataset.listenerAttached) {
            openAlertsBtn.addEventListener('click', () => {
                showExpiredOrdersAlert(pendingAlerts); // Chama a função correta que está neste arquivo
            });
            openAlertsBtn.dataset.listenerAttached = 'true'; // Previne múltiplos listeners
        }

        // NOVO: Listener para salvar as configurações de sobrecarga no painel do gerente
        const saveOverloadBtn = document.getElementById('manager-save-overload-btn');
        if (saveOverloadBtn) {
            saveOverloadBtn.addEventListener('click', async () => {
                const overloadLimitInput = document.getElementById('overload-limit-input');
                const overloadWindowInput = document.getElementById('overload-window-input');

                const limit = parseInt(overloadLimitInput.value, 10);
                const windowMinutes = parseInt(overloadWindowInput.value, 10);

                if (isNaN(limit) || isNaN(windowMinutes) || limit <= 0 || windowMinutes <= 0) {
                    showToast("Por favor, insira valores numéricos válidos e positivos.", "error");
                    return;
                }

                try {
                    const prodConfigRef = doc(db, "config", "producao");
                    await setDoc(prodConfigRef, { limit, windowMinutes }, { merge: true });
                    
                    // Atualiza a variável global
                    productionSettings = { limit, windowMinutes };

                    showToast("Configurações de sobrecarga salvas com sucesso!", "success");
                    console.log("Configurações de sobrecarga salvas:", productionSettings);
                } catch (error) {
                    console.error("Erro ao salvar configurações de sobrecarga:", error);
                    showToast("Falha ao salvar as configurações.", "error");
                }
            });
        }

        // NOVO: Lógica para o menu lateral moderno do painel gerencial
        const managerMenuBtn = document.getElementById('manager-menu-btn');
        const sidebar = document.getElementById('manager-sidebar');
        const overlay = document.getElementById('manager-overlay');

        if (managerMenuBtn && sidebar && overlay) {
            const toggleSidebar = () => {
                sidebar.classList.toggle('sidebar-expanded');
                sidebar.classList.toggle('sidebar-collapsed');
                overlay.classList.toggle('hidden');
            };

            managerMenuBtn.addEventListener('click', toggleSidebar);
            overlay.addEventListener('click', toggleSidebar);
        } else {
            console.warn("Elementos do menu lateral do gerente não foram encontrados. A funcionalidade de toggle não funcionará.");
        }

        // NOVO: Listener para inicializar views específicas do painel gerencial.
        // Isso complementa a navegação principal que está em manager.js, garantindo
        // que as funções de inicialização de dados sejam chamadas no momento certo.
        if (sidebar) {
            sidebar.addEventListener('click', (e) => {
                const link = e.target.closest('.sidebar-link');
                if (link && link.dataset.view) {
                    const view = link.dataset.view;
                    if (view === 'log-atividades') {
                        initActivityLogView(db); // Passa a variável 'db'
                    } else if (view === 'clientes') {
                        renderClientsTable(); // Chama a função para renderizar a tabela de clientes
                    }
                }
            });
        }

        // NOVO: Listener para o botão "Ir para PDV" no painel do gerente
        const goToPdvBtn = document.getElementById('go-to-pdv-btn');
        if (goToPdvBtn) {
            goToPdvBtn.addEventListener('click', async () => {
                console.log("Botão 'Ir para PDV' clicado.");
                if (currentUser && (currentUser.role === 'gerente' || currentUser.role === 'mestra')) {
                    showToast("Carregando PDV...", "info");
                    // Reinicia a aplicação na visão de funcionário, mas mantendo os dados do gerente
                    await startApp('funcionario', currentUser);
                } else {
                    console.error("Tentativa de acesso ao PDV por um usuário não autorizado:", currentUser);
                    showToast("Ação não permitida.", "error");
                }
            });
        }

        // NOVO: Listener para redefinir senha na tela de Equipe (Gerente)
        const teamView = document.getElementById('view-equipe');
        if (teamView) {
            teamView.addEventListener('click', async (e) => {
                const targetButton = e.target.closest('.reset-password-btn');
                if (targetButton) {
                    const employeeId = targetButton.dataset.employeeId;
                    const employeeName = targetButton.dataset.employeeName;

                    const confirmation = await showCustomConfirm(
                        'Redefinir Senha?',
                        `Tem certeza que deseja redefinir a senha de <strong>${employeeName}</strong> para o padrão "1234"?`,
                        {
                            okButtonText: "Confirmar Redefinição",
                            okButtonClass: "bg-blue-600 hover:bg-blue-700",
                        }
                    );

                    if (confirmation && confirmation.confirmed) {
                        try {
                            const employeeDocRef = doc(db, `employees/${employeeId}`);
                            await updateDoc(employeeDocRef, {
                                password: '1234'
                            });
                            showToast(`Senha de ${employeeName} redefinida com sucesso!`, 'success');

                            // Marca a notificação de reset de senha como lida
                            try {
                                const notificationsRef = collection(db, 'notifications');
                                const q = query(notificationsRef, 
                                    where("type", "==", "password_reset_request"), 
                                    where("employeeId", "==", employeeId), 
                                    where("read", "==", false)
                                );
                                const querySnapshot = await getDocs(q);
                                querySnapshot.forEach(async (notificationDoc) => {
                                    await updateDoc(notificationDoc.ref, { read: true });
                                    console.log(`Notificação ${notificationDoc.id} marcada como lida.`);
                                });
                            } catch (error) {
                                console.error("Erro ao marcar notificação como lida:", error);
                            }
                        } catch (error) {
                            console.error("Erro ao redefinir a senha:", error);
                            showToast('Falha ao redefinir a senha.', 'error');
                        }
                    }
                }
            });
        }

        // NOVO: Listener para o botão de acesso gerencial rápido no PDV
        const managerAccessBtn = document.getElementById('manager-access-btn');
        if (managerAccessBtn) {
            managerAccessBtn.addEventListener('click', async () => {
                console.log("Botão de acesso gerencial rápido clicado.");
                // Usa o modal de confirmação para pedir as credenciais
                const confirmation = await showCustomConfirm(
                    "Acesso Gerencial",
                    "Digite as credenciais da gerência para continuar.",
                    {
                        okButtonText: "Entrar",
                        okButtonClass: "bg-orange-500 hover:bg-orange-600",
                        showInput: 'user-pass' // Sinaliza para mostrar os campos de usuário e senha
                    }
                );

                // Se o usuário confirmar e as credenciais estiverem corretas
                if (confirmation && confirmation.confirmed) {
                    // CORREÇÃO: Converte ambas as senhas para String antes de comparar.
                    // Isso evita problemas se a senha no banco de dados for um número (ex: 1234)
                    // e a senha digitada for uma string (ex: "1234").
                    if (confirmation.user === managerCredentials.user && String(confirmation.pass) === String(managerCredentials.pass)) {
                        showToast("Acesso autorizado. Carregando painel...", "success");
                        if (currentUser && currentUser.role === 'funcionario') {
                            await logUserActivity(currentUser.name, 'logout');
                        }
                        await startApp('gerente', { name: 'Gerência', role: 'gerente' });
                    } else {
                        showToast("Usuário ou senha incorretos.", "error");
                    }
                }
            });
        }

        // NOVO: Listener para o botão "Voltar ao Painel" no PDV
        const returnToManagerBtn = document.getElementById('return-to-manager-btn');
        if (returnToManagerBtn) {
            returnToManagerBtn.addEventListener('click', async () => {
                console.log("Botão 'Voltar ao Painel' clicado.");
                // Verifica se o usuário atual é um gerente ou mestra que foi para o PDV
                if (currentUser && (currentUser.role === 'gerente' || currentUser.role === 'mestra')) {
                    showToast("Retornando ao painel gerencial...", "info");
                    // Não é necessário fazer logout, apenas reinicia a aplicação na visão de gerente
                    // usando os dados do usuário atual que já estão carregados.
                    await startApp(currentUser.role, currentUser);
                } else {
                    // Este caso não deve acontecer em uso normal, mas é uma salvaguarda.
                    console.error("Tentativa de retorno ao painel por um usuário não autorizado:", currentUser);
                    showToast("Ação não permitida.", "error");
                }
            });
        }

    } catch (e) {
        document.body.innerHTML = `<div class="p-8 bg-red-100 text-red-800"><h1>Erro Crítico</h1><p>Ocorreu um erro que impediu o carregamento do sistema.</p><pre class="mt-4 p-4 bg-red-200 rounded">${e.stack}</pre></div>`;
        console.error("ERRO CRÍTICO:", e);
    }
}
// Chama a função main APENAS quando o DOM estiver completamente carregado
document.addEventListener('DOMContentLoaded', main);
