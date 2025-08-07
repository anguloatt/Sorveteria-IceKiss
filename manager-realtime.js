// Meu módulo para gerenciar atualizações em tempo real no painel do gerente.

import { collection, query, orderBy, onSnapshot, getDocs, where, Timestamp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { db } from './firebase-config.js';
import { formatCurrency, formatDateToBR, showToast, getProductInfoById, getSalgadosCountFromItems, getTodayDateString } from './utils.js';
import { showOrderDetailModal, populateCustomerAnalysisData } from './manager.js';
import { fetchSalesDataForDashboard, fetchAllOrders, checkForDailyDeliveries } from './firebaseService.js';
import { productsConfig } from './app.js';
import {
    createOrUpdateLineChart,
    renderCategorySalesChart,
    createSalesByCategoryChart,
    createSalesOverTimeChart,
    createProductAnalysisPieChart,
    createOrUpdateLineChartWithLabels // Importa a nova função de gráfico
} from './charts.js';
import { generateDashboardAnalysis } from './aiService.js';
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";

const managerOrdersTableBody = document.getElementById('manager-orders-table-body');
const orderRowMap = new Map();
let unsubscribeOrders = null;

// URL do som de notificação
const notificationSound = new Audio('./sounds/notification.mp3'); // Certifique-se de que o caminho está correto

// Variáveis para armazenar listeners em tempo real do dashboard
let unsubscribeDashboardData = null;

/**
 * Emite um som de notificação.
 */
function playNotificationSound() {
    notificationSound.play().catch(e => console.error("Erro ao reproduzir som de notificação:", e));
}

/**
 * Cria ou atualiza uma linha na tabela de pedidos do gerente.
 * Se a linha já existe, atualiza seus dados. Caso contrário, cria uma nova.
 * Gerencia também o mapeamento de IDs de pedido para elementos de linha.
 * @param {object} orderData Os dados do pedido.
 * @returns {HTMLTableRowElement} O elemento <tr> da linha do pedido.
 */
function createOrUpdateOrderRow(orderData) {
    const orderId = orderData.id;
    let row = orderRowMap.get(orderId); // Tenta obter a linha existente

    // Se a linha não existe, cria uma nova e a adiciona ao mapa
    if (!row) {
        row = document.createElement('tr');
        row.id = `order-row-${orderId}`;
        orderRowMap.set(orderId, row); // Mapeia o ID do pedido para a nova linha
    }

    row.className = `border-b hover:bg-gray-50 cursor-pointer`;

    const formattedDate = formatDateToBR(orderData.createdAt);
    const formattedValue = formatCurrency(orderData.total);
    const statusClass = orderData.status === 'cancelado' ? 'bg-red-200 text-red-800' : 'bg-blue-200 text-blue-800';

    row.innerHTML = `
        <td class="py-2 px-3">${orderData.orderNumber}</td>
        <td class="py-2 px-3">${formattedDate}</td>
        <td class="py-2 px-3">${orderData.customer?.name || 'N/A'}</td>
        <td class="py-2 px-3">${formattedValue}</td>
        <td class="py-2 px-3"><span class="px-2 py-1 text-xs rounded-full ${statusClass}">${orderData.status}</span></td>
        <td class="py-2 px-3">${orderData.createdBy?.name || 'N/A'}</td>
        <td class="py-2 px-3">${orderData.settledBy?.name || '---'}</td>
    `;

    // Garante que o event listener seja adicionado apenas uma vez
    if (!row.dataset.listenerAdded) {
        row.addEventListener('dblclick', () => showOrderDetailModal(orderId));
        row.dataset.listenerAdded = 'true';
    }

    return row;
}

export function setupRealtimeOrderListener() {
    if (unsubscribeOrders) {
        console.log("Listener de pedidos em tempo real já está ativo.");
        return;
    }

    const ordersRef = collection(db, 'orders');
    const q = query(ordersRef, orderBy('createdAt', 'desc'));

    console.log("Iniciando listener de pedidos em tempo real...");

    unsubscribeOrders = onSnapshot(q, (snapshot) => {
        let shouldPlaySound = false;
        snapshot.docChanges().forEach((change) => {
            const orderData = { id: change.doc.id, ...change.doc.data() };

            if (change.type === "added") {
                const newRow = createOrUpdateOrderRow(orderData);
                if (managerOrdersTableBody) managerOrdersTableBody.prepend(newRow);
                shouldPlaySound = true; // Novo pedido adicionado
            }
            if (change.type === "modified") {
                createOrUpdateOrderRow(orderData);
                shouldPlaySound = true; // Pedido modificado (status, valor, etc.)
            }
            if (change.type === "removed") {
                const rowToRemove = orderRowMap.get(orderData.id);
                if (rowToRemove) {
                    rowToRemove.remove();
                    orderRowMap.delete(orderData.id);
                }
                shouldPlaySound = true; // Pedido removido
            }
        });
        // Toca o som apenas se houver alguma mudança relevante
        if (shouldPlaySound) {
            playNotificationSound();
            // Recarrega os dados da visão geral para refletir as mudanças
            loadVisaoGeralData();
        }
    });
}

// Mantenho a variável gerencialDashboardContainer e a função createDashboardHTML
// como estavam no seu arquivo original, pois elas parecem ser usadas em outras partes
// do seu código que não são o foco atual.
const gerencialDashboardContainer = document.getElementById('gerencial-dashboard-screen');

function createDashboardHTML() {
    return `
        <div class="border-b border-gray-200 mb-6">
            <nav id="dashboard-tabs-nav" class="-mb-px flex space-x-8" aria-label="Tabs">
                <button data-content="content-visao-geral" class="dashboard-tab whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">Visão Geral</button>
                <button data-content="content-analise-financeira" class="dashboard-tab whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">Análise Financeira</button>
                <button data-content="content-analise-produtos" class="dashboard-tab whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">Análise de Produtos</button>
                <button data-content="content-analise-clientes" class="dashboard-tab whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">Análise de Clientes</button>
            </nav>
        </div>
        <div>
            <div id="content-visao-geral" class="dashboard-tab-content hidden">
                <!-- Conteúdo da Visão Geral será injetado aqui por loadVisaoGeralData -->
            </div>
            <div id="content-analise-financeira" class="dashboard-tab-content hidden">
                <div class="space-y-6">
                    <div class="bg-white p-4 rounded-xl shadow-lg flex items-center gap-4 flex-wrap">
                        <label for="gerencial-start-date" class="font-semibold">De:</label>
                        <input type="date" id="gerencial-start-date" class="p-2 border rounded-lg bg-gray-50">
                        <label for="gerencial-end-date" class="font-semibold">Até:</label>
                        <input type="date" id="gerencial-end-date" class="p-2 border rounded-lg bg-gray-50">
                        <button id="gerencial-apply-filter" class="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-semibold ml-auto">Aplicar Filtro</button>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div class="bg-white p-5 rounded-xl shadow-lg flex items-center gap-4"><i class="fas fa-dollar-sign text-3xl text-green-500 bg-green-100 p-4 rounded-full"></i><div><p class="text-sm text-gray-500">Faturamento Total</p><p id="gerencial-dash-total-revenue" class="text-2xl font-bold">Carregando...</p></div></div>
                        <div class="bg-white p-5 rounded-xl shadow-lg flex items-center gap-4"><i class="fas fa-receipt text-3xl text-blue-500 bg-blue-100 p-4 rounded-full"></i><div><p class="text-sm text-gray-500">Ticket Médio</p><p id="gerencial-dash-average-ticket" class="text-2xl font-bold">Carregando...</p></div></div>
                        <div class="bg-white p-5 rounded-xl shadow-lg flex items-center gap-4"><i class="fas fa-crown text-3xl text-yellow-500 bg-yellow-100 p-4 rounded-full"></i><div><p class="text-sm text-gray-500">Top Cliente</p><p id="gerencial-dash-top-customer-name" class="text-lg font-bold truncate" title="Carregando...">Carregando...</p></div></div>
                        <div class="bg-white p-5 rounded-xl shadow-lg flex items-center gap-4"><i class="fas fa-chart-line text-3xl text-red-500 bg-red-100 p-4 rounded-full"></i><div><p class="text-sm text-gray-500">Pico de Vendas</p><p id="gerencial-dash-sales-peak-date" class="text-lg font-bold">Carregando...</p></div></div>
                    </div>
                    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div class="lg:col-span-1 bg-white p-6 rounded-xl shadow-lg"><h3 class="text-xl font-bold mb-4">Faturamento por Categoria</h3><div class="h-80 relative"><canvas id="gerencial-dash-category-chart"></canvas></div></div>
                        <div class="lg:col-span-2 bg-white p-6 rounded-xl shadow-lg flex flex-col"><h3 class="text-xl font-bold mb-4">Desempenho de Produtos</h3><div class="overflow-y-auto h-80 flex-grow"><table class="min-w-full text-sm"><thead class="bg-gray-100 sticky top-0"><tr><th class="py-2 px-3 text-left">Produto</th><th class="py-2 px-3 text-center">Qtd.</th><th class="py-2 px-3 text-right">Faturamento</th><th class="py-2 px-3 text-right">Lucro Bruto</th></tr></thead><tbody id="gerencial-dash-products-table-body"></tbody></table></div><div class="border-t mt-4 pt-4 flex justify-between font-bold text-lg"><span>Total de Pedidos: <span id="gerencial-dash-total-orders">--</span></span><span>Lucro Bruto Total: <span id="gerencial-dash-total-profit" class="text-green-600">--</span></span></div></div>
                    </div>
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div class="bg-white p-6 rounded-xl shadow-lg"><h3 class="text-xl font-bold mb-4">Quantidade Vendida por Categoria</h3><div class="h-80 relative"><canvas id="gerencial-dash-quantity-by-category-chart"></canvas></div></div>
                        <div class="bg-white p-6 rounded-xl shadow-lg"><h3 class="text-xl font-bold mb-4">Faturamento por Hora do Dia</h3><div class="h-80 relative"><canvas id="gerencial-dash-sales-by-hour-chart"></canvas></div></div>
                    </div>
                    <div class="bg-gradient-to-r from-purple-600 to-indigo-600 p-6 rounded-xl shadow-lg text-white mt-6">
                        <div class="flex justify-between items-center mb-4"><h2 class="text-2xl font-bold">Análise Inteligente (Gemini AI)</h2><i class="fas fa-brain text-3xl opacity-70"></i></div>
                        <div id="ai-analysis-container" class="bg-white/20 p-4 rounded-lg min-h-[150px] relative">
                            <p id="ai-analysis-placeholder" class="text-center text-purple-200 italic">Gere um resumo financeiro e operacional com insights poderosos da nossa IA. Clique no botão abaixo para começar.</p>
                            <div id="ai-analysis-loader" class="hidden absolute inset-0 bg-white/30 flex-col items-center justify-center rounded-lg text-purple-700"><i class="fas fa-spinner fa-spin text-4xl"></i><p class="mt-4 font-semibold">Analisando dados...</p></div>
                            <div id="ai-analysis-result" class="prose prose-invert max-w-none"></div>
                        </div>
                        <div class="text-center mt-4"><button id="generate-ai-analysis-btn" class="bg-white text-purple-700 font-bold py-2 px-6 rounded-full hover:bg-purple-100 transition-transform transform hover:scale-105 shadow-md"><i class="fas fa-magic mr-2"></i>Gerar Análise</button></div>
                    </div>
                </div>
            </div>
            <div id="content-analise-produtos" class="dashboard-tab-content hidden">
                <!-- O conteúdo da Análise de Produtos será injetado aqui pela função renderProductAnalysisDashboard -->
            </div>
            <div id="content-analise-clientes" class="dashboard-tab-content hidden">
                 <!-- O conteúdo da Análise de Clientes será injetado aqui por populateCustomerAnalysisData -->
            </div>
        </div>
    `;
}


function createProductAnalysisDashboardHTML() {
    return `
        <div class="space-y-6">
            <!-- Filtros de Data -->
            <div class="bg-white p-4 rounded-xl shadow-lg flex items-center gap-4 flex-wrap">
                <label for="product-analysis-start-date" class="font-semibold">De:</label>
                <input type="date" id="product-analysis-start-date" class="p-2 border rounded-lg bg-gray-50">
                <label for="product-analysis-end-date" class="font-semibold">Até:</label>
                <input type="date" id="product-analysis-end-date" class="p-2 border rounded-lg bg-gray-50">
                <button id="product-analysis-apply-filter" class="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-semibold ml-auto">
                    <i class="fas fa-filter mr-2"></i>Aplicar Filtro
                </button>
            </div>

            <!-- Cartões de Indicadores (KPIs) -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                <div class="bg-white p-5 rounded-xl shadow-lg text-center"><p class="text-sm text-gray-500">Total Salgadinhos (Fritos/Assados)</p><p id="kpi-total-salgados-festa" class="text-3xl font-bold text-orange-500">...</p></div>
                <div class="bg-white p-5 rounded-xl shadow-lg text-center"><p class="text-sm text-gray-500">Total Itens Revenda</p><p id="kpi-total-revenda" class="text-3xl font-bold text-teal-500">...</p></div>
                <div class="bg-white p-5 rounded-xl shadow-lg text-center"><p class="text-sm text-gray-500">Total Fritos</p><p id="kpi-total-fritos" class="text-3xl font-bold text-amber-500">...</p></div>
                <div class="bg-white p-5 rounded-xl shadow-lg text-center"><p class="text-sm text-gray-500">Total Assados</p><p id="kpi-total-assados" class="text-3xl font-bold text-lime-600">...</p></div>
                <div class="bg-gray-800 text-white p-5 rounded-xl shadow-lg text-center"><p class="text-sm text-gray-300">Total Geral de Itens</p><p id="kpi-total-geral" class="text-3xl font-bold">...</p></div>
            </div>

            <!-- Gráficos e Tabela -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div class="lg:col-span-1 bg-white p-6 rounded-xl shadow-lg">
                    <h3 class="text-xl font-bold mb-4 text-center">Proporção de Vendas</h3>
                    <div class="h-80 relative"><canvas id="product-analysis-pie-chart"></canvas></div>
                </div>
                <div class="lg:col-span-2 bg-white p-6 rounded-xl shadow-lg flex flex-col">
                    <h3 class="text-xl font-bold mb-4">Top Produtos Mais Vendidos (Quantidade)</h3>
                    <div class="overflow-y-auto h-80 flex-grow">
                        <table class="min-w-full text-sm">
                            <thead class="bg-gray-100 sticky top-0">
                                <tr>
                                    <th class="py-2 px-3 text-left">Produto</th>
                                    <th class="py-2 px-3 text-center">Categoria</th>
                                    <th class="py-2 px-3 text-right">Quantidade Vendida</th>
                                    <th class="py-2 px-3 text-right">Faturamento Gerado</th>
                                </tr>
                            </thead>
                            <tbody id="top-products-table-body">
                                <!-- Linhas da tabela serão populadas via JavaScript -->
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// NOVA FUNÇÃO: HTML para a aba de Análise de Clientes
export function createCustomerAnalysisDashboardHTML() { // Adicionado 'export' aqui
    return `
        <div class="space-y-6">
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div class="bg-white p-5 rounded-xl shadow-lg flex items-center gap-4">
                    <div class="bg-blue-100 p-3 rounded-full"><i class="fas fa-users text-xl text-blue-600"></i></div>
                    <div><p class="text-sm text-gray-500">Total de Clientes</p><p id="kpi-total-clientes" class="text-2xl font-bold">...</p></div>
                </div>
                <div class="bg-white p-5 rounded-xl shadow-lg flex items-center gap-4">
                    <div class="bg-green-100 p-3 rounded-full"><i class="fas fa-user-plus text-xl text-green-600"></i></div>
                    <div><p class="text-sm text-gray-500">Novos (Mês)</p><p id="kpi-novos-clientes" class="text-2xl font-bold">...</p></div>
                </div>
                <div class="bg-white p-5 rounded-xl shadow-lg flex items-center gap-4">
                    <div class="bg-purple-100 p-3 rounded-full"><i class="fas fa-sync-alt text-xl text-purple-600"></i></div>
                    <div><p class="text-sm text-gray-500">Clientes Recorrentes</p><p id="kpi-clientes-recorrentes" class="text-2xl font-bold">...</p></div>
                </div>
                <div class="bg-white p-5 rounded-xl shadow-lg flex items-center gap-4">
                    <div class="bg-amber-100 p-3 rounded-full"><i class="fas fa-chart-line text-xl text-amber-600"></i></div>
                    <div><p class="text-sm text-gray-500">Taxa de Retenção</p><p id="kpi-taxa-retencao" class="text-2xl font-bold">...%</p></div>
                </div>
            </div>
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div class="lg:col-span-2 bg-white p-6 rounded-xl shadow-lg">
                    <h3 class="font-bold text-lg mb-4">Top 10 Clientes (por valor gasto)</h3>
                    <div class="overflow-x-auto">
                        <table class="min-w-full text-sm">
                            <thead class="bg-gray-50">
                                <tr class="text-left">
                                    <th class="p-2">#</th>
                                    <th class="p-2">Nome</th>
                                    <th class="p-2">Telefone</th>
                                    <th class="p-2 text-right">Total Gasto</th>
                                    <th class="p-2 text-center">Pedidos</th>
                                </tr>
                            </thead>
                            <tbody id="top-clients-table-body"></tbody>
                        </table>
                    </div>
                </div>
                <div class="space-y-8">
                    <div class="bg-white p-6 rounded-xl shadow-lg">
                        <h3 class="font-bold text-lg mb-4">Crescimento de Novos Clientes (6 Meses)</h3>
                        <div><canvas id="client-growth-chart"></canvas></div>
                    </div>
                    <div class="bg-white p-6 rounded-xl shadow-lg">
                        <h3 class="font-bold text-lg mb-4">Segmentação de Clientes</h3>
                        <div><canvas id="client-segmentation-chart"></canvas></div>
                    </div>
                </div>
            </div>
        </div>
    `;
}


function populateProductsTable(products) {
    const tableBody = document.getElementById('gerencial-dash-products-table-body');
    if (!tableBody) return;

    if (products.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="4" class="text-center py-8 text-gray-500">Nenhum produto vendido no período.</td></tr>`;
        return;
    }

    const sortedProducts = [...products].sort((a, b) => b.revenue - a.revenue);

    tableBody.innerHTML = sortedProducts.map(p => `
        <tr class="border-b hover:bg-gray-50">
            <td class="py-2 px-3 font-semibold">${p.name}</td>
            <td class="py-2 px-3 text-center">${p.category}</td>
            <td class="py-2 px-3 text-right font-bold">${p.quantity}</td>
            <td class="py-2 px-3 text-right">${formatCurrency(p.revenue)}</td>
        </tr>
    `).join('');
}

async function handleGenerateDashboardAnalysis() {
    const generateBtn = document.getElementById('generate-ai-analysis-btn');
    const loader = document.getElementById('ai-analysis-loader');
    const placeholder = document.getElementById('ai-analysis-placeholder');
    const resultContainer = document.getElementById('ai-analysis-result');
    const startDateInput = document.getElementById('gerencial-start-date');
    const endDateInput = document.getElementById('gerencial-end-date');

    generateBtn.disabled = true;
    generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Analisando...';
    placeholder.classList.add('hidden');
    resultContainer.innerHTML = '';
    loader.style.display = 'flex';

    try {
        const startDate = new Date(startDateInput.value + 'T00:00:00');
        const endDate = new Date(endDateInput.value + 'T23:59:59');
        
        const dashboardData = await fetchSalesDataForDashboard(startDate, endDate);
        const analysisText = await generateDashboardAnalysis(dashboardData);
        
        resultContainer.innerHTML = marked.parse(analysisText);

    } catch (error) {
        console.error("Erro ao gerar análise de IA:", error);
        resultContainer.innerHTML = '<p class="text-red-400">Ocorreu um erro ao tentar gerar a análise. Por favor, tente novamente.</p>';
        showToast("Erro na análise de IA.", "error");
    } finally {
        loader.style.display = 'none';
        generateBtn.disabled = false;
        generateBtn.innerHTML = '<i class="fas fa-magic mr-2"></i>Gerar Análise';
    }
}

function updateFinancialCards(data) {
    document.getElementById('gerencial-dash-total-revenue').textContent = formatCurrency(data.totalRevenue);
    document.getElementById('gerencial-dash-average-ticket').textContent = formatCurrency(data.averageTicket);
    document.getElementById('gerencial-dash-total-orders').textContent = data.totalOrders;
    document.getElementById('gerencial-dash-total-profit').textContent = formatCurrency(data.totalGrossProfit);

    const topCustomerNameEl = document.getElementById('gerencial-dash-top-customer-name');
    topCustomerNameEl.textContent = data.topCustomer.name;
    topCustomerNameEl.title = data.topCustomer.name;
    document.getElementById('gerencial-dash-top-customer-value').textContent = formatCurrency(data.topCustomer.totalSpent);

    const peakDateEl = document.getElementById('gerencial-dash-sales-peak-date');
    if (data.salesPeak.date) {
        const [year, month, day] = data.salesPeak.date.split('-');
        peakDateEl.textContent = `${day}/${month}/${year}`;
    } else {
        peakDateEl.textContent = 'N/A';
    }
    document.getElementById('gerencial-dash-sales-peak-value').textContent = formatCurrency(data.salesPeak.amount);
}

function setDashboardToLoadingState() {
    document.getElementById('gerencial-dash-total-revenue').textContent = 'Carregando...';
    document.getElementById('gerencial-dash-average-ticket').textContent = 'Carregando...';
    const topCustomerNameEl = document.getElementById('gerencial-dash-top-customer-name');
    topCustomerNameEl.textContent = 'Carregando...';
    topCustomerNameEl.title = 'Carregando...';
    document.getElementById('gerencial-dash-top-customer-value').textContent = '--';
    const peakDateEl = document.getElementById('gerencial-dash-sales-peak-date');
    peakDateEl.textContent = 'Carregando...';
    document.getElementById('gerencial-dash-sales-peak-value').textContent = '--';

    const tableBody = document.getElementById('gerencial-dash-products-table-body');
    if (tableBody) {
        tableBody.innerHTML = `<tr><td colspan="4" class="text-center py-8 text-gray-500">Carregando dados dos produtos...</td></tr>`;
    }

    document.getElementById('gerencial-dash-total-orders').textContent = '--';
    document.getElementById('gerencial-dash-total-profit').textContent = '--';
}

async function loadAndRenderDashboardData(startDate, endDate) {
    try {
        setDashboardToLoadingState(); // Adicionado para mostrar o estado de carregamento
        const data = await fetchSalesDataForDashboard(startDate, endDate);
        updateFinancialCards(data);
        populateProductsTable(data.products);
        renderCategorySalesChart('gerencial-dash-category-chart', data.revenueByCategory);
        createSalesByCategoryChart('gerencial-dash-quantity-by-category-chart', data.quantityByCategory);
        createSalesOverTimeChart('gerencial-dash-sales-by-hour-chart', data.salesByHour);
    } catch (renderError) {
        console.error("Erro ao renderizar os dados do dashboard:", renderError);
        showToast("Ocorreu um erro ao exibir os dados.", "error");
    }
}

/**
 * Verifica se um horário no formato "HH:MM" já passou no dia de hoje.
 * @param {string} timeStr - A hora a ser verificada (ex: "16:30").
 * @returns {boolean} - True se o horário já passou, false caso contrário.
 */
function isTimePassed(timeStr) {
    if (!timeStr || !/^\d{2}:\d{2}$/.test(timeStr)) return false;
    const now = new Date();
    const [hours, minutes] = timeStr.split(':').map(Number);
    const targetTime = new Date();
    targetTime.setHours(hours, minutes, 0, 0);
    return now > targetTime;
}

/**
 * Carrega e exibe os dados para a seção "Visão Geral" do Dashboard.
 * Agora com atualização em tempo real para os novos KPIs e notificações.
 */
async function loadVisaoGeralData() {
    console.log("loadVisaoGeralData: Carregando dados para a Visão Geral.");

    // Define a meta diária de faturamento (EXEMPLO: R$ 5000)
    const DAILY_REVENUE_GOAL = 5000;
    // Define a meta diária de pedidos (EXEMPLO: 50 pedidos)
    const DAILY_ORDER_GOAL = 50;


    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    // Cancelar listener anterior se existir
    if (unsubscribeDashboardData) {
        unsubscribeDashboardData();
    }

    // --- INJEÇÃO DO HTML DA VISÃO GERAL NO CONTAINER CORRETO ---
    const visaoGeralContentContainer = document.getElementById('content-visao-geral');
    if (visaoGeralContentContainer) {
        visaoGeralContentContainer.innerHTML = `
            <div class="space-y-6">
                <!-- Bloco de Métricas de Visão Geral (Novos KPIs) -->
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
                    <!-- KPI: Percentual da Meta Diária Atingida -->
                    <div class="bg-white p-5 rounded-xl shadow-md flex items-center justify-between">
                        <div class="space-y-1">
                            <p class="text-sm font-medium text-gray-500">Meta Diária Atingida</p>
                            <p id="kpi-daily-goal" class="text-3xl font-bold text-blue-600">--%</p>
                        </div>
                        <div class="bg-blue-100 rounded-full p-3">
                            <i class="fas fa-bullseye text-2xl text-blue-600"></i>
                        </div>
                    </div>
                    <!-- KPI: Faturamento por Categoria (Diário) -->
                    <div class="bg-white p-5 rounded-xl shadow-md flex items-center justify-between">
                        <div class="space-y-1">
                            <p class="text-sm font-medium text-gray-500">Faturamento Diário (Cat.)</p>
                            <p id="kpi-daily-category-revenue" class="text-3xl font-bold text-purple-600">R$ --</p>
                        </div>
                        <div class="bg-purple-100 rounded-full p-3">
                            <i class="fas fa-tags text-2xl text-purple-600"></i>
                        </div>
                    </div>
                    <!-- KPI: Tempo Médio de Preparo -->
                    <div class="bg-white p-5 rounded-xl shadow-md flex items-center justify-between">
                        <div class="space-y-1">
                            <p class="text-sm font-medium text-gray-500">Tempo Médio Preparo</p>
                            <p id="kpi-avg-prep-time" class="text-3xl font-bold text-green-600">-- min</p>
                        </div>
                        <div class="bg-green-100 rounded-full p-3">
                            <i class="fas fa-clock text-2xl text-green-600"></i>
                        </div>
                    </div>
                </div>

                <!-- Seção de Próximas Retiradas -->
                <div class="bg-white p-6 rounded-xl shadow-md mb-6">
                    <h3 class="text-lg font-semibold text-gray-700 mb-4">Próximas Retiradas</h3>
                    <div id="next-pickups-list" class="space-y-3 max-h-60 overflow-y-auto">
                        <!-- Pedidos de retirada serão carregados aqui -->
                        <p class="text-gray-500 text-center">Nenhum pedido de retirada iminente.</p>
                    </div>
                </div>

                <!-- Gráfico de Tendência (Tíquete Médio) -->
                <div class="bg-white p-6 rounded-xl shadow-md mb-6 h-80 relative"> <!-- Adicionado h-80 relative aqui -->
                    <h3 class="text-lg font-semibold text-gray-700 mb-4">Tendência do Tíquete Médio (Últimos 7 Dias)</h3>
                    <canvas id="average-ticket-chart"></canvas>
                </div>

                <!-- Seção de Filtros de Data e KPIs de Produtos (EXISTENTE - MANTIDA AQUI) -->
                <div class="bg-white p-6 rounded-xl shadow-md mb-6 flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0 md:space-x-4">
                    <div class="flex items-center space-x-2 w-full md:w-auto">
                        <label for="dashboard-date-start" class="text-gray-600 text-sm">De:</label>
                        <input type="date" id="dashboard-date-start" class="p-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 flex-grow">
                    </div>
                    <div class="flex items-center space-x-2 w-full md:w-auto">
                        <label for="dashboard-date-end" class="text-gray-600 text-sm">Até:</label>
                        <input type="date" id="dashboard-date-end" class="p-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 flex-grow">
                    </div>
                    <button id="dashboard-apply-filter-btn" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition duration-300 ease-in-out transform hover:scale-105 shadow-md w-full md:w-auto">
                        <i class="fas fa-filter mr-2"></i>Aplicar Filtro
                    </button>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div class="bg-white p-5 rounded-xl shadow-md flex items-center justify-between">
                        <div class="space-y-1">
                            <p class="text-sm font-medium text-gray-500">Produto Mais Vendido</p>
                            <p id="kpi-most-sold-product" class="text-xl font-bold text-gray-800">--</p>
                        </div>
                        <div class="bg-blue-100 rounded-full p-3">
                            <i class="fas fa-award text-2xl text-blue-600"></i>
                        </div>
                    </div>
                    <div class="bg-white p-5 rounded-xl shadow-md flex items-center justify-between">
                        <div class="space-y-1">
                            <p class="text-sm font-medium text-gray-500">Produto Menos Vendido</p>
                            <p id="kpi-least-sold-product" class="text-xl font-bold text-gray-800">--</p>
                        </div>
                        <div class="bg-red-100 rounded-full p-3">
                            <i class="fas fa-minus-circle text-2xl text-red-600"></i>
                        </div>
                    </div>
                    <div class="bg-white p-5 rounded-xl shadow-md flex items-center justify-between">
                        <div class="space-y-1">
                            <p class="text-sm font-medium text-gray-500">Maior Faturamento Produto</p>
                            <p id="kpi-highest-revenue-product" class="text-xl font-bold text-gray-800">--</p>
                        </div>
                        <div class="bg-green-100 rounded-full p-3">
                            <i class="fas fa-dollar-sign text-2xl text-green-600"></i>
                        </div>
                    </div>
                    <div class="bg-white p-5 rounded-xl shadow-md flex items-center justify-between">
                        <div class="space-y-1">
                            <p class="text-sm font-medium text-gray-500">Lucro Bruto Total</p>
                            <p id="kpi-total-gross-profit" class="text-xl font-bold text-gray-800">R$ --</p>
                        </div>
                        <div class="bg-orange-100 rounded-full p-3">
                            <i class="fas fa-money-bill-wave text-2xl text-orange-600"></i>
                        </div>
                    </div>
                </div>
                
                <!-- KPIs Visão Geral Antigos (para garantir que sejam atualizados) -->
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                    <div class="bg-white p-5 rounded-xl shadow-md flex items-center justify-between">
                        <div class="space-y-1">
                            <p class="text-sm font-medium text-gray-500">Faturamento do Dia</p>
                            <p id="vg-vendido-hoje" class="text-3xl font-bold text-green-600">R$ 0,00</p>
                        </div>
                        <div class="bg-green-100 rounded-full p-3">
                            <i class="fas fa-dollar-sign text-2xl text-green-600"></i>
                        </div>
                    </div>
                    <div class="bg-white p-5 rounded-xl shadow-md flex items-center justify-between">
                        <div class="space-y-1">
                            <p class="text-sm font-medium text-gray-500">Pedidos do Dia</p>
                            <p id="vg-pedidos-hoje" class="text-3xl font-bold text-blue-600">0</p>
                        </div>
                        <div class="bg-blue-100 rounded-full p-3">
                            <i class="fas fa-receipt text-2xl text-blue-600"></i>
                        </div>
                    </div>
                    <div class="bg-white p-5 rounded-xl shadow-md flex items-center justify-between">
                        <div class="space-y-1">
                            <p class="text-sm font-medium text-gray-500">Ticket Médio (Dia)</p>
                            <p id="vg-ticket-medio-hoje" class="text-3xl font-bold text-orange-500">R$ 0,00</p>
                        </div>
                        <div class="bg-orange-100 rounded-full p-3">
                            <i class="fas fa-ticket-alt text-2xl text-orange-500"></i>
                        </div>
                    </div>
                    <div class="bg-white p-5 rounded-xl shadow-md flex items-center justify-between">
                        <div class="space-y-1">
                            <p class="text-sm font-medium text-gray-500">A Receber Hoje</p>
                            <p id="vg-areceber-hoje" class="text-3xl font-bold text-red-600">R$ 0,00</p>
                        </div>
                        <div class="bg-red-100 rounded-full p-3">
                            <i class="fas fa-hand-holding-usd text-2xl text-red-600"></i>
                        </div>
                    </div>
                </div>

                <!-- Gráfico de Vendas Semanal (EXISTENTE) -->
                <div class="bg-white p-6 rounded-xl shadow-md mb-6 h-80 relative"> <!-- Adicionado h-80 relative aqui -->
                    <h3 class="text-lg font-semibold text-gray-700 mb-4">Vendas na Última Semana</h3>
                    <canvas id="visao-geral-semanal-chart"></canvas>
                </div>

                <!-- Seção de Entregas do Dia (EXISTENTE) -->
                <div class="bg-white p-6 rounded-xl shadow-md">
                    <h3 class="text-lg font-semibold text-gray-700 mb-4">Agenda de Entregas do Dia</h3>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div class="bg-blue-50 p-4 rounded-lg text-center"><p class="text-sm font-medium text-blue-700">Entregas Hoje</p><p id="vg-entregas-hoje" class="text-2xl font-bold text-blue-900">0</p></div>
                        <div class="bg-green-50 p-4 rounded-lg text-center"><p class="text-sm font-medium text-green-700">Entregas Pagas</p><p id="vg-entregas-pagas" class="text-2xl font-bold text-green-900">0</p></div>
                        <div class="bg-red-50 p-4 rounded-lg text-center"><p class="text-sm font-medium text-red-700">Entregas Pendentes</p><p id="vg-entregas-pendentes" class="text-2xl font-bold text-red-900">0</p></div>
                    </div>
                    <div id="vg-agenda-hoje" class="space-y-3 max-h-60 overflow-y-auto">
                        <!-- Entregas serão carregadas aqui -->
                        <p class="text-center text-gray-500 italic">Nenhuma entrega agendada para hoje.</p>
                    </div>
                </div>
            </div>
        `;
    } else {
        console.error("Container da Visão Geral (#content-visao-geral) não encontrado no DOM. O conteúdo não pode ser injetado.");
        return; // Não prosseguir se o container principal não existe
    }


    const ordersRef = collection(db, "orders");
    const q = query(ordersRef, where("createdAt", ">=", Timestamp.fromDate(sevenDaysAgo)));

    unsubscribeDashboardData = onSnapshot(q, async (snapshot) => {
        // Obtenha as referências aos elementos HTML AQUI dentro do callback do onSnapshot,
        // para garantir que eles já existam no DOM quando a atualização ocorrer.
        // Estes elementos são específicos da Visão Geral e foram injetados acima.
        const kpiDailyGoalEl = document.getElementById('kpi-daily-goal');
        const kpiDailyCategoryRevenueEl = document.getElementById('kpi-daily-category-revenue');
        const kpiAvgPrepTimeEl = document.getElementById('kpi-avg-prep-time');
        const nextPickupsListEl = document.getElementById('next-pickups-list');
        const averageTicketChartCanvas = document.getElementById('average-ticket-chart');
        const vgVendidoHojeEl = document.getElementById('vg-vendido-hoje');
        const vgAReceberHojeEl = document.getElementById('vg-areceber-hoje');
        const vgPedidosHojeEl = document.getElementById('vg-pedidos-hoje');
        const vgTicketMedioHojeEl = document.getElementById('vg-ticket-medio-hoje');
        const vgEntregasHojeEl = document.getElementById('vg-entregas-hoje');
        const vgEntregasPagasEl = document.getElementById('vg-entregas-pagas');
        const vgEntregasPendentesEl = document.getElementById('vg-entregas-pendentes');
        const agendaContainer = document.getElementById('vg-agenda-hoje');
        const visaoGeralSemanalChartCanvas = document.getElementById('visao-geral-semanal-chart');

        // Referências aos KPIs de produto (que também estão na Visão Geral)
        const kpiMostSoldEl = document.getElementById('kpi-most-sold-product');
        const kpiLeastSoldEl = document.getElementById('kpi-least-sold-product');
        const kpiHighestRevenueEl = document.getElementById('kpi-highest-revenue-product');
        const kpiTotalProfitEl = document.getElementById('kpi-total-gross-profit');
        const dashboardStartDateInput = document.getElementById('dashboard-date-start');
        const dashboardEndDateInput = document.getElementById('dashboard-date-end');
        const dashboardApplyFilterBtn = document.getElementById('dashboard-apply-filter-btn');


        let shouldPlaySoundOnDashboardUpdate = false;
        if (!snapshot.empty && snapshot.docChanges().length > 0) {
            shouldPlaySoundOnDashboardUpdate = true; // Houve uma alteração nos pedidos
        }

        // Inicializa variáveis para os KPIs financeiros
        let vendidoHoje = 0;
        let aReceberHoje = 0; // Considerando 'restante' como a receber
        let pedidosHoje = 0;
        const salesLast7Days = {};

        // Inicializa os arrays para os últimos 7 dias
        for (let i = 0; i < 7; i++) {
            const d = new Date(sevenDaysAgo);
            d.setDate(sevenDaysAgo.getDate() + i);
            const dateString = d.toISOString().split('T')[0];
            salesLast7Days[dateString] = { totalRevenue: 0, totalOrders: 0 };
        }

        let totalPrepTime = 0;
        let completedOrdersCount = 0;
        let categoryRevenueToday = {
            fritos: 0,
            assados: 0,
            revenda: 0,
            bebidas: 0, // Adicione outras categorias se houver
            // Você pode adicionar mais categorias aqui com base na sua `productsConfig`
        };

        const todayOrders = []; // Para as próximas retiradas

        snapshot.forEach(doc => {
            const order = doc.data();
            if (order.status === 'cancelado') return;

            const orderDate = order.createdAt.toDate();
            const orderDateString = orderDate.toISOString().split('T')[0];

            // Cálculo para os últimos 7 dias (faturamento e pedidos para o ticket médio)
            if (salesLast7Days.hasOwnProperty(orderDateString)) {
                salesLast7Days[orderDateString].totalRevenue += order.total;
                salesLast7Days[orderDateString].totalOrders++;
            }

            // Dados de hoje
            if (orderDate >= startOfToday) {
                vendidoHoje += order.total;
                aReceberHoje += order.restante;
                pedidosHoje++;

                // Cálculo do tempo médio de preparo
                if (order.orderReadyAt && order.createdAt) {
                    const readyTime = order.orderReadyAt.toDate().getTime();
                    const createdTime = order.createdAt.toDate().getTime();
                    const prepTime = (readyTime - createdTime) / (1000 * 60); // Tempo em minutos
                    if (prepTime > 0) { // Garante que o tempo de preparo é positivo
                        totalPrepTime += prepTime;
                        completedOrdersCount++;
                    }
                }

                // Faturamento por Categoria (Diário)
                order.items.forEach(item => {
                    // Acessar productsConfig como um objeto e converter para array para usar find
                    const productInfo = Object.values(productsConfig).find(p => p.id === item.productId);
                    
                    // Verificar se productInfo e productInfo.category existem
                    if (productInfo && productInfo.category) {
                        const category = productInfo.category.toLowerCase();
                        if (categoryRevenueToday.hasOwnProperty(category)) {
                            categoryRevenueToday[category] += item.subtotal;
                        } else {
                            // Se a categoria não estiver pré-definida, adicione a "outros"
                            categoryRevenueToday['outros'] = (categoryRevenueToday['outros'] || 0) + item.subtotal;
                        }
                    } else {
                        // Se o produto não for encontrado ou não tiver categoria, adicione a "outros"
                        categoryRevenueToday['outros'] = (categoryRevenueToday['outros'] || 0) + item.subtotal;
                    }
                });

                // Próximas Retiradas (pedidos de retirada para hoje que não foram finalizados ou cancelados)
                if (order.deliveryMethod === 'retirada' && order.status !== 'finalizado' && order.status !== 'cancelado') {
                    todayOrders.push(order);
                }
            }
        });

        // --- ATUALIZAÇÃO DOS NOVOS KPIS DA VISÃO GERAL ---

        // Percentual da Meta Diária Atingida
        const dailyRevenuePercentage = (vendidoHoje / DAILY_REVENUE_GOAL) * 100;
        if (kpiDailyGoalEl) {
            kpiDailyGoalEl.textContent = `${formatCurrency(vendidoHoje)} / ${formatCurrency(DAILY_REVENUE_GOAL)} (${dailyRevenuePercentage.toFixed(1)}%)`;
        }

        // Faturamento por Categoria (Diário)
        let formattedCategoryRevenue = '';
        for (const cat in categoryRevenueToday) {
            if (categoryRevenueToday[cat] > 0) {
                formattedCategoryRevenue += `${cat.charAt(0).toUpperCase() + cat.slice(1)}: ${formatCurrency(categoryRevenueToday[cat])}<br>`;
            }
        }
        if (kpiDailyCategoryRevenueEl) {
            kpiDailyCategoryRevenueEl.innerHTML = formattedCategoryRevenue || 'R$ --';
        }
        
        // Tempo Médio de Preparo
        const avgPrepTime = completedOrdersCount > 0 ? totalPrepTime / completedOrdersCount : 0;
        if (kpiAvgPrepTimeEl) {
            kpiAvgPrepTimeEl.textContent = avgPrepTime.toFixed(0) + ' min';
        }

        // Gráfico de Tendência (Tíquete Médio)
        const avgTicketLabels = [];
        const avgTicketData = [];
        const daysOfWeek = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']; // Nomes dos dias da semana
        for (let i = 0; i < 7; i++) {
            const d = new Date(sevenDaysAgo);
            d.setDate(sevenDaysAgo.getDate() + i);
            const dateString = d.toISOString().split('T')[0];
            const dayOfWeek = daysOfWeek[d.getDay()]; // Obtém o nome do dia da semana
            const label = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')} (${dayOfWeek})`;
            
            avgTicketLabels.push(label);
            
            const daySales = salesLast7Days[dateString];
            const dailyAverageTicket = daySales.totalOrders > 0 ? daySales.totalRevenue / daySales.totalOrders : 0;
            avgTicketData.push(dailyAverageTicket);
        }

        if (averageTicketChartCanvas) {
            createOrUpdateLineChartWithLabels('average-ticket-chart', avgTicketLabels, avgTicketData, 'Tíquete Médio (R$)', '#4f46e5');
        }

        // Próximas Retiradas (com Alerta Visual)
        if (nextPickupsListEl) {
            if (todayOrders.length === 0) {
                nextPickupsListEl.innerHTML = '<p class="text-gray-500 text-center">Nenhum pedido de retirada iminente.</p>';
            } else {
                // Ordena por horário de retirada
                const sortedPickups = todayOrders.sort((a, b) => {
                    const timeA = a.delivery?.time || '23:59';
                    const timeB = b.delivery?.time || '23:59';
                    return timeA.localeCompare(timeB);
                });

                nextPickupsListEl.innerHTML = sortedPickups.map(order => {
                    const pickupTime = order.delivery?.time || 'N/A';
                    // Verifica se está próximo (dentro dos próximos 30 minutos) ou atrasado
                    const now = new Date();
                    const pickupDateTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(pickupTime.split(':')[0]), parseInt(pickupTime.split(':')[1]));
                    
                    const isNear = pickupDateTime > now && (pickupDateTime.getTime() - now.getTime()) <= (30 * 60 * 1000); // Próximos 30 minutos
                    const isLate = pickupDateTime < now;

                    let itemClass = "border-l-4 ";
                    let statusText = "Agendado";
                    let textColor = "text-blue-800";
                    let bgColor = "bg-blue-50";
                    let borderColor = "border-blue-500";

                    if (isLate) {
                        itemClass = "border-l-4 border-red-500 bg-red-50";
                        statusText = "Atrasado";
                        textColor = "text-red-800";
                        bgColor = "bg-red-200";
                    } else if (isNear) {
                        itemClass = "border-l-4 border-orange-500 bg-orange-50";
                        statusText = "Em Breve";
                        textColor = "text-orange-800";
                        bgColor = "bg-orange-200";
                    }

                    return `
                        <div class="flex items-center gap-4 p-3 rounded-lg shadow-sm ${itemClass}">
                            <div class="flex-grow">
                                <p class="font-semibold text-gray-800">${order.customer?.name || 'Cliente Desconhecido'}</p>
                                <p class="text-sm text-gray-600">Pedido #${order.orderNumber} - Retirada: ${pickupTime}</p>
                            </div>
                            <span class="px-2 py-1 text-xs font-semibold rounded-full ${bgColor} ${textColor}">
                                ${statusText}
                            </span>
                        </div>
                    `;
                }).join('');
            }
        }


        // --- ATUALIZAÇÃO DOS KPIS EXISTENTES DA VISÃO GERAL ---
        // Verificações adicionadas para garantir que os elementos existem antes de tentar atualizar.
        if (vgVendidoHojeEl) vgVendidoHojeEl.textContent = formatCurrency(vendidoHoje);
        if (vgAReceberHojeEl) vgAReceberHojeEl.textContent = formatCurrency(aReceberHoje);
        if (vgPedidosHojeEl) vgPedidosHojeEl.textContent = pedidosHoje;
        if (vgTicketMedioHojeEl) vgTicketMedioHojeEl.textContent = formatCurrency(pedidosHoje > 0 ? vendidoHoje / pedidosHoje : 0);

        // Renderiza o gráfico de vendas semanal existente
        if (visaoGeralSemanalChartCanvas) { // Adicionado verificação aqui
            const chartLabels = Object.keys(salesLast7Days).map(dateStr => new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }));
            const chartData = Object.values(salesLast7Days).map(data => data.totalRevenue); // Use o totalRevenue para o gráfico de vendas
            createOrUpdateLineChart('visao-geral-semanal-chart', chartLabels, chartData, 'Vendas (R$)');
        }

        // --- RENDERIZA A AGENDA DO DIA (ENTREGAS) ---
        // A busca por dailyDeliveries é feita separadamente pois a coleção de orders pode não ter todos os detalhes necessários para `delivery`
        // e para garantir que `checkForDailyDeliveries` continue funcionando como esperado.
        const dailyDeliveries = await checkForDailyDeliveries(); 
        let entregasPagas = 0;
        let entregasPendentes = 0;

        dailyDeliveries.forEach(order => {
            if (order.paymentStatus === 'pago') {
                entregasPagas++;
            } else {
                entregasPendentes++;
            }
        });

        if (vgEntregasHojeEl) vgEntregasHojeEl.textContent = dailyDeliveries.length;
        if (vgEntregasPagasEl) vgEntregasPagasEl.textContent = entregasPagas;
        if (vgEntregasPendentesEl) vgEntregasPendentesEl.textContent = entregasPendentes;

        if (agendaContainer) {
            if (dailyDeliveries.length === 0) {
                agendaContainer.innerHTML = '<p class="text-center text-gray-500 italic mt-8">Nenhuma entrega agendada para hoje.</p>';
            } else {
                const sortedDeliveries = dailyDeliveries.sort((a, b) => (a.delivery?.time || '99:99').localeCompare(b.delivery?.time || '99:99'));

                agendaContainer.innerHTML = sortedDeliveries.map(order => {
                    const timePassed = isTimePassed(order.delivery?.time);
                    const deliveryStatusClass = timePassed ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800';
                    const deliveryStatusText = timePassed ? 'Entregue' : 'Pendente';
                    const paymentStatusClass = order.paymentStatus === 'pago' ? 'text-green-600' : 'text-red-500';
                    const totalSalgados = getSalgadosCountFromItems(order.items);

                    return `
                        <div class="flex items-center gap-4 p-3 rounded-lg border ${timePassed ? 'bg-gray-50 opacity-70' : 'bg-white'}">
                            <div class="text-center w-16 shrink-0"><p class="font-bold text-lg">${order.delivery?.time || 'N/A'}</p><span class="text-xs px-2 py-0.5 rounded-full font-semibold ${deliveryStatusClass}">${deliveryStatusText}</span></div>
                            <div class="flex-grow"><p class="font-semibold truncate">${order.customer?.name || 'N/A'}</p><p class="text-sm text-gray-600">Pedido #${order.orderNumber}</p></div>
                            <div class="text-center shrink-0"><p class="font-bold text-orange-500">${totalSalgados}</p><p class="text-xs text-gray-500">Salgados</p></div>
                            <div class="text-center w-20 shrink-0"><p class="font-bold ${paymentStatusClass}">${formatCurrency(order.restante)}</p><p class="text-xs text-gray-500">em Aberto</p></div>
                        </div>
                    `;
                }).join('');
            }
        }
        
        if (shouldPlaySoundOnDashboardUpdate) {
            playNotificationSound();
        }

    }, (error) => {
        console.error("Erro no listener de dados do dashboard em tempo real:", error);
        showToast("Falha na atualização em tempo real do Dashboard.", "error");
    });
}


async function renderProductAnalysisDashboard() {
    const container = document.getElementById('content-analise-produtos');
    if (!container) return;

    // Garante que o container está vazio antes de preencher
    container.innerHTML = ''; 
    container.innerHTML = createProductAnalysisDashboardHTML();

    const startDateInput = document.getElementById('product-analysis-start-date');
    const endDateInput = document.getElementById('product-analysis-end-date');
    const applyFilterBtn = document.getElementById('product-analysis-apply-filter');

    const today = new Date();
    const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);

    startDateInput.value = startOfLastMonth.toISOString().split('T')[0];
    endDateInput.value = endOfLastMonth.toISOString().split('T')[0];

    const loadData = async () => {
        applyFilterBtn.disabled = true;
        applyFilterBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Carregando...';

        const startDate = new Date(startDateInput.value + 'T00:00:00');
        const endDate = new Date(endDateInput.value + 'T23:59:59');

        try {
            const salesData = await fetchSalesDataForDashboard(startDate, endDate);

            // Transforma o array 'quantityByCategory' em um objeto 'categoryTotals' que a UI espera.
            const categoryTotals = { fritos: 0, assados: 0, revenda: 0, outros: 0 };
            if (salesData.quantityByCategory) {
                salesData.quantityByCategory.forEach(cat => {
                    if (categoryTotals.hasOwnProperty(cat.name)) {
                        categoryTotals[cat.name] = cat.value;
                    }
                });
            }

            // Calcula os totais agregados
            const salgadosFesta = (categoryTotals.fritos || 0) + (categoryTotals.assados || 0);
            const totalGeral = salgadosFesta + (categoryTotals.revenda || 0) + (categoryTotals.outros || 0);

            // Atualiza os KPIs na tela
            document.getElementById('kpi-total-salgados-festa').textContent = salgadosFesta;
            document.getElementById('kpi-total-revenda').textContent = categoryTotals.revenda;
            document.getElementById('kpi-total-fritos').textContent = categoryTotals.fritos;
            document.getElementById('kpi-total-assados').textContent = categoryTotals.assados;
            document.getElementById('kpi-total-geral').textContent = totalGeral;

            createProductAnalysisPieChart('product-analysis-pie-chart', categoryTotals);

            const tableBody = document.getElementById('top-products-table-body');
            const topProducts = [...salesData.products].sort((a, b) => b.quantity - a.quantity);
            
            if (topProducts.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-gray-500">Nenhum produto vendido neste período.</td></tr>`;
            } else {
                tableBody.innerHTML = topProducts.map(p => `
                    <tr class="border-b hover:bg-gray-50">
                        <td class="py-2 px-3 font-semibold">${p.name}</td>
                        <td class="py-2 px-3 text-center">${p.category}</td>
                        <td class="py-2 px-3 text-right font-bold">${p.quantity}</td>
                        <td class="py-2 px-3 text-right">${formatCurrency(p.revenue)}</td>
                    </tr>
                `).join('');
            }

        } catch (error) {
            console.error("Erro ao carregar dados para a análise de produtos:", error);
            showToast("Falha ao carregar os dados.", "error");
        } finally {
            applyFilterBtn.disabled = false;
            applyFilterBtn.innerHTML = '<i class="fas fa-filter mr-2"></i>Aplicar Filtro';
        }
    };

    applyFilterBtn.addEventListener('click', loadData);
    loadData();
}

function initializeDashboardTabs() {
    const tabs = document.querySelectorAll('.dashboard-tab');
    const contents = document.querySelectorAll('.dashboard-tab-content');

    const switchTab = (targetTab) => {
        const targetContentId = targetTab.dataset.content;
        console.log(`[Dashboard Tabs] 🔄 Trocando para a aba: ${targetContentId}`);

        // PASSO 1: OCULTAR TODOS os conteúdos das abas explicitamente e de forma agressiva.
        contents.forEach(content => {
            content.classList.add('hidden'); // Adiciona a classe 'hidden' do Tailwind
            content.style.display = 'none'; // Força o display para 'none' (prioridade máxima)
            content.style.position = 'absolute'; // Remove do fluxo normal do documento
            content.style.zIndex = '-1'; // Garante que fique atrás de tudo
            console.log(`[Dashboard Tabs] 🙈 Escondendo conteúdo: #${content.id} (display: none, position: absolute, z-index: -1)`);
        });

        const targetContent = document.getElementById(targetContentId);

        // PASSO 2: Atualiza o estilo visual dos botões das abas.
        tabs.forEach(tab => {
            tab.classList.remove('text-blue-600', 'border-blue-500');
            tab.classList.add('text-gray-500', 'border-transparent', 'hover:text-gray-700', 'hover:border-gray-300');
        });

        // PASSO 3: Ativa o estilo da aba selecionada.
        targetTab.classList.add('text-blue-600', 'border-blue-500');
        targetTab.classList.remove('text-gray-500', 'border-transparent', 'hover:text-gray-700', 'hover:border-gray-300');
        
        // PASSO 4: EXIBIR APENAS o conteúdo da aba selecionada, também explicitamente.
        if (targetContent) {
            targetContent.classList.remove('hidden'); // Remove a classe 'hidden'
            targetContent.style.display = 'block'; // Define o display como 'block' para garantir que ele apareça.
            targetContent.style.position = 'relative'; // Retorna ao fluxo normal, mas mantém o contexto de empilhamento
            targetContent.style.zIndex = '1'; // Garante que fique à frente
            console.log(`[Dashboard Tabs] ✅ Exibindo conteúdo: #${targetContent.id} (display: block, position: relative, z-index: 1)`);
        }

        // PASSO 5: Carrega os dados para a aba se ainda não tiverem sido carregados.
        const isLoaded = targetTab.dataset.loaded === 'true';
        if (!isLoaded) {
            if (targetContentId === 'content-visao-geral') {
                loadVisaoGeralData();
            } else if (targetContentId === 'content-analise-produtos') {
                renderProductAnalysisDashboard();
            } else if (targetContentId === 'content-analise-clientes') {
                // Chama a função para popular os dados da Análise de Clientes
                populateCustomerAnalysisData();
            }
            targetTab.dataset.loaded = 'true';
            console.log(`[Dashboard Tabs] 📊 Carregando dados para: ${targetContentId}`);
        }
    };

    // Adiciona os event listeners para o clique em cada aba
    tabs.forEach(tab => tab.addEventListener('click', (event) => {
        switchTab(event.currentTarget);
    }));

    // Ativa a primeira aba (Visão Geral) ao carregar o dashboard inicialmente.
    // Usamos um seletor mais específico para garantir que seja a aba correta.
    const initialTab = document.querySelector('.dashboard-tab[data-content="content-visao-geral"]');
    if (initialTab) {
        switchTab(initialTab);
    }
}

export function renderGerencialDashboard() {
    // Esta função é responsável por injetar o HTML principal do dashboard
    // e inicializar o sistema de abas.
    if (!gerencialDashboardContainer) return;

    // Injeta o HTML completo do dashboard no container.
    // Todas as abas de conteúdo já vêm com a classe 'hidden' por padrão no createDashboardHTML().
    gerencialDashboardContainer.innerHTML = createDashboardHTML();
    
    // Inicializa a lógica de troca de abas, que vai ativar a primeira aba
    // (Visão Geral) e garantir que as outras estão ocultas.
    initializeDashboardTabs();

    // Configuração dos filtros de data para a aba de Análise Financeira.
    const startDateInput = document.getElementById('gerencial-start-date');
    const endDateInput = document.getElementById('gerencial-end-date');
    const applyFilterBtn = document.getElementById('gerencial-apply-filter');

    if (startDateInput && endDateInput && applyFilterBtn) {
        const today = new Date();
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

        startDateInput.value = firstDayOfMonth.toISOString().split('T')[0];
        endDateInput.value = lastDayOfMonth.toISOString().split('T')[0];

        // Adiciona o event listener para o botão de aplicar filtro.
        applyFilterBtn.addEventListener('click', async () => {
            applyFilterBtn.disabled = true;
            applyFilterBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Carregando...';
            setDashboardToLoadingState();

            const startDate = new Date(startDateInput.value + 'T00:00:00');
            const endDate = new Date(endDateInput.value + 'T23:59:59');

            try {
                await loadAndRenderDashboardData(startDate, endDate);
            } finally {
                applyFilterBtn.disabled = false;
                applyFilterBtn.innerHTML = 'Aplicar Filtro';
            }
        });

        // Simula um clique no botão de filtro da Análise Financeira para carregar os dados iniciais
        // desta aba, caso ela seja a primeira a ser exibida (o que não é o caso padrão,
        // mas é uma boa prática para carregamento inicial).
        // A `initializeDashboardTabs` já chama `loadVisaoGeralData` para a primeira aba.
        // Este `click()` é mais relevante se a aba financeira fosse a inicial.
        // applyFilterBtn.click(); // Comentado para evitar carregamento duplo se Visão Geral é a inicial.
    }
}
