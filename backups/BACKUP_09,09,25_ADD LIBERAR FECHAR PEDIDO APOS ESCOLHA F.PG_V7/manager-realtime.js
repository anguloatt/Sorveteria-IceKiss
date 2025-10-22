import { collection, query, onSnapshot, orderBy, Timestamp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { db } from './firebase-config.js';
import { formatCurrency, formatDateToBR, showToast, getProductInfoById, getSalgadosCountFromItems, getTodayDateString } from './utils.js';
import { showOrderDetailModal, populateCustomerAnalysisData } from './manager.js';
import { _standardizeOrderData, fetchSalesDataForDashboard, checkForDailyDeliveries, fetchTeamActivityOrders } from './firebaseService.js';
import { productsConfig } from './app.js';
import {
    createOrUpdateLineChart,
    renderCategorySalesChart,
    createSalesByCategoryChart,
    createSalesOverTimeChart,
    createProductAnalysisPieChart
} from './charts.js';
import { generateDashboardAnalysis } from './aiService.js';
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";

const managerOrdersTableBody = document.getElementById('manager-orders-table-body');
const orderRowMap = new Map();
let unsubscribeOrdersListener = null;
const tabContentRendered = {
    'content-visao-geral': false,
    'content-analise-financeira': false,
    'content-analise-produtos': false,
    'content-analise-clientes': false
};

function createOrUpdateOrderRow(orderData) {
    const orderId = orderData.id;
    const existingRow = orderRowMap.get(orderId);
    const row = existingRow || managerOrdersTableBody.insertRow();

row.id = `order-row-${orderId}`;
    row.className = `border-b hover:bg-gray-50 cursor-pointer`;

const formattedDate = orderData.createdAt ? formatDateToBR(orderData.createdAt) : 'N/A';
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

row.addEventListener('dblclick', () => showOrderDetailModal(orderId));

if (!existingRow) {
        orderRowMap.set(orderId, row);
    }

return row;
}

export function initializeOrdersView() {
    if (unsubscribeOrdersListener) {
        unsubscribeOrdersListener(); // Garante que listeners antigos sejam removidos.
    }

if (!managerOrdersTableBody) return;

managerOrdersTableBody.innerHTML = '<tr><td colspan="7" class="text-center p-8 text-gray-500">Carregando pedidos...</td></tr>';
    orderRowMap.clear();

const ordersRef = collection(db, "orders");
    const q = query(ordersRef, orderBy("createdAt", "desc"));

unsubscribeOrdersListener = onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            managerOrdersTableBody.innerHTML = '<tr><td colspan="7" class="text-center p-8 text-gray-500">Nenhum pedido encontrado.</td></tr>';
            return;
        }

snapshot.docChanges().forEach((change) => {
            const orderData = _standardizeOrderData(change.doc);

if (change.type === "added") {
                if (managerOrdersTableBody.querySelector('td[colspan="7"]')) {
                    managerOrdersTableBody.innerHTML = ''; // Limpa a mensagem "Carregando..."
                }
                const newRow = createOrUpdateOrderRow(orderData);
                managerOrdersTableBody.appendChild(newRow); // Usa appendChild para manter a ordem cronológica descendente.
            }
            if (change.type === "modified") {
                createOrUpdateOrderRow(orderData); // Atualiza a linha existente.
            }
            if (change.type === "removed") {
                const rowToRemove = orderRowMap.get(orderData.id);
                if (rowToRemove) {
                    rowToRemove.remove();
                    orderRowMap.delete(orderData.id);
                }
            }
        });
    }, (error) => {
        console.error("Erro no listener de pedidos em tempo real:", error);
        showToast("Falha ao receber atualizações de pedidos.", "error");
        managerOrdersTableBody.innerHTML = '<tr><td colspan="7" class="text-center p-8 text-red-500">Erro ao carregar pedidos.</td></tr>';
    });
}

export function stopOrdersListener() {
    if (unsubscribeOrdersListener) {
        unsubscribeOrdersListener();
        unsubscribeOrdersListener = null;
        console.log("Listener de pedidos em tempo real parado.");
    }
}
const gerencialDashboardContainer = document.getElementById('gerencial-dashboard-screen');

function createDashboardHTML() {
    return `
        <div class="border-b border-gray-200 mb-6">
            <nav id="dashboard-tabs-nav" class="-mb-px flex space-x-8" aria-label="Tabs">
                <button data-content="content-visao-geral" class="dashboard-tab whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm text-blue-600 border-blue-500">Visão Geral</button>
                <button data-content="content-analise-financeira" class="dashboard-tab whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300">Análise Financeira</button>
                <button data-content="content-analise-produtos" class="dashboard-tab whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300">Análise de Produtos</button>
                <button data-content="content-analise-clientes" class="dashboard-tab whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300">Análise de Clientes</button>
            </nav>
        </div>
        <div id="dashboard-content-area">
            <div id="content-visao-geral" class="dashboard-tab-content">
                <div class="space-y-6">
                    <!-- Visão Geral é estritamente diária; filtros de período não são mostrados aqui -->
                    <div class="surface-card p-4 rounded-xl shadow-lg flex items-center gap-4 flex-wrap">
                        <p class="text-sm text-color-secondary">Visão Geral (Dados do Dia)</p>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div class="surface-card p-5 rounded-xl shadow-lg flex items-center gap-4"><i class="fas fa-hand-holding-usd text-3xl text-green-500 bg-green-100 p-4 rounded-full"></i><div><p class="text-sm text-color-secondary">Vendido Hoje</p><p id="vg-vendido-hoje" class="text-2xl font-bold text-color-primary">Carregando...</p></div></div>
                        <div class="surface-card p-5 rounded-xl shadow-lg flex items-center gap-4"><i class="fas fa-hourglass-half text-3xl text-orange-500 bg-orange-100 p-4 rounded-full"></i><div><p class="text-sm text-color-secondary">A Receber Hoje</p><p id="vg-areceber-hoje" class="text-2xl font-bold text-color-primary">Carregando...</p></div></div>
                        <div class="surface-card p-5 rounded-xl shadow-lg flex items-center gap-4"><i class="fas fa-shopping-basket text-3xl text-blue-500 bg-blue-100 p-4 rounded-full"></i><div><p class="text-sm text-color-secondary">Pedidos Hoje</p><p id="vg-pedidos-hoje" class="text-2xl font-bold text-color-primary">Carregando...</p></div></div>
                        <div class="surface-card p-5 rounded-xl shadow-lg flex items-center gap-4"><i class="fas fa-file-invoice-dollar text-3xl text-purple-500 bg-purple-100 p-4 rounded-full"></i><div><p class="text-sm text-color-secondary">Ticket Médio Hoje</p><p id="vg-ticket-medio-hoje" class="text-2xl font-bold text-color-primary">Carregando...</p></div></div>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div class="surface-card p-5 rounded-xl shadow-lg flex items-center gap-4"><i class="fas fa-truck text-3xl text-cyan-500 bg-cyan-100 p-4 rounded-full"></i><div><p class="text-sm text-color-secondary">Entregas para Hoje</p><p id="vg-entregas-hoje" class="text-2xl font-bold text-color-primary">Carregando...</p></div></div>
                        <div class="surface-card p-5 rounded-xl shadow-lg flex items-center gap-4"><i class="fas fa-check-double text-3xl text-green-500 bg-green-100 p-4 rounded-full"></i><div><p class="text-sm text-color-secondary">Entregas Pagas</p><p id="vg-entregas-pagas" class="text-2xl font-bold text-color-primary">Carregando...</p></div></div>
                        <div class="surface-card p-5 rounded-xl shadow-lg flex items-center gap-4"><i class="fas fa-exclamation-triangle text-3xl text-red-500 bg-red-100 p-4 rounded-full"></i><div><p class="text-sm text-color-secondary">Pendentes de Pag.</p><p id="vg-entregas-pendentes" class="text-2xl font-bold text-color-primary">Carregando...</p></div></div>
                    </div>
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div class="surface-card p-6 rounded-xl shadow-lg h-[400px]">
                            <h3 class="text-xl font-bold mb-4">Vendas nos Últimos 7 Dias</h3>
                            <div id="vg-chart-container" class="relative h-full max-h-[320px]"><canvas id="visao-geral-semanal-chart"></canvas></div>
                        </div>
                        <div class="surface-card p-6 rounded-xl shadow-lg h-[400px] flex flex-col">
                            <h3 class="text-xl font-bold mb-4">Agenda do Dia</h3>
                            <div id="vg-agenda-hoje" class="flex-grow overflow-y-auto space-y-2 pr-2"><p class="text-center text-gray-500 italic mt-8">Carregando agenda...</p></div>
                        </div>
                    </div>
                </div>
            </div>
            <div id="content-analise-financeira" class="dashboard-tab-content hidden">
                <!-- O conteúdo será injetado aqui pela função renderFinancialAnalysisDashboard -->
            </div>
            <div id="content-analise-produtos" class="dashboard-tab-content hidden">
                <!-- O conteúdo será injetado aqui pela função renderProductAnalysisDashboard -->
            </div>
            <div id="content-analise-clientes" class="dashboard-tab-content hidden">
                <!-- O conteúdo será injetado aqui pela função populateCustomerAnalysisData -->
            </div>
        </div>
    `;
}

function createFinancialAnalysisDashboardHTML() {
    return `
        <div class="space-y-6">
            <div class="surface-card p-4 rounded-xl shadow-lg flex items-center gap-4 flex-wrap">
                <label for="gerencial-start-date" class="font-semibold">De:</label>
                <input type="date" id="gerencial-start-date" class="input-themed p-2 rounded-lg">
                <label for="gerencial-end-date" class="font-semibold">Até:</label>
                <input type="date" id="gerencial-end-date" class="input-themed p-2 rounded-lg">
                <button id="gerencial-apply-filter" class="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-semibold ml-auto">Aplicar Filtro</button>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6">
                <div class="surface-card p-5 rounded-xl shadow-lg flex items-center gap-4"><i class="fas fa-dollar-sign text-3xl text-green-500 bg-green-100 p-4 rounded-full"></i><div><p class="text-sm text-color-secondary">Faturamento Total</p><p id="gerencial-dash-total-revenue" class="text-2xl font-bold text-color-primary">Carregando...</p></div></div>
                <div class="surface-card p-5 rounded-xl shadow-lg flex items-center gap-4"><i class="fas fa-receipt text-3xl text-blue-500 bg-blue-100 p-4 rounded-full"></i><div><p class="text-sm text-color-secondary">Ticket Médio</p><p id="gerencial-dash-average-ticket" class="text-2xl font-bold text-color-primary">Carregando...</p></div></div>
                <div class="surface-card p-5 rounded-xl shadow-lg flex items-center gap-4"><i class="fas fa-crown text-3xl text-yellow-500 bg-yellow-100 p-4 rounded-full"></i><div><p class="text-sm text-color-secondary">Top Cliente</p><p id="gerencial-dash-top-customer-name" class="text-lg font-bold truncate text-color-primary" title="Carregando...">Carregando...</p><p id="gerencial-dash-top-customer-value" class="text-sm text-color-secondary">--</p></div></div>
                <div class="surface-card p-5 rounded-xl shadow-lg flex items-center gap-4"><i class="fas fa-chart-line text-3xl text-red-500 bg-red-100 p-4 rounded-full"></i><div><p class="text-sm text-color-secondary">Pico de Vendas</p><p id="gerencial-dash-sales-peak-date" class="text-lg font-bold text-color-primary">Carregando...</p><p id="gerencial-dash-sales-peak-value" class="text-sm text-color-secondary">--</p></div></div>
                <div class="surface-card p-5 rounded-xl shadow-lg flex items-center gap-4"><i class="fas fa-percentage text-3xl text-indigo-500 bg-indigo-100 p-4 rounded-full"></i><div><p class="text-sm text-color-secondary">Margem Média (ponderada)</p><p id="kpi-average-margin" class="text-2xl font-bold text-color-primary">--%</p></div></div>
                <div class="surface-card p-5 rounded-xl shadow-lg flex items-center gap-4"><i class="fas fa-coins text-3xl text-teal-500 bg-teal-100 p-4 rounded-full"></i><div><p class="text-sm text-color-secondary">Lucro Médio por Pedido</p><p id="kpi-avg-profit-per-order" class="text-2xl font-bold text-color-primary">R$ --</p></div></div>
            </div>
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div class="lg:col-span-1 surface-card p-6 rounded-xl shadow-lg"><h3 class="text-xl font-bold mb-4">Faturamento por Categoria</h3><div class="h-80 relative"><canvas id="gerencial-dash-category-chart"></canvas></div></div>
                <div class="lg:col-span-2 surface-card p-6 rounded-xl shadow-lg flex flex-col"><h3 class="text-xl font-bold mb-4">Desempenho de Produtos</h3><div class="overflow-y-auto h-80 flex-grow"><table class="min-w-full text-sm"><thead class="table-header-themed sticky top-0"><tr><th class="py-2 px-3 text-left">Produto</th><th class="py-2 px-3 text-center">Qtd.</th><th class="py-2 px-3 text-right">Faturamento</th><th class="py-2 px-3 text-right">Lucro Bruto</th><th class="py-2 px-3 text-right">Lucro %</th><th class="py-2 px-3 text-right">Lucro / Unid</th></tr></thead><tbody id="gerencial-dash-products-table-body"></tbody></table></div><div class="border-t mt-4 pt-4 flex justify-between font-bold text-lg"><span>Total de Pedidos: <span id="gerencial-dash-total-orders">--</span></span><span>Lucro Bruto Total: <span id="gerencial-dash-total-profit" class="text-green-600">--</span></span></div></div>
            </div>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div class="surface-card p-6 rounded-xl shadow-lg"><h3 class="text-xl font-bold mb-4">Quantidade Vendida por Categoria</h3><div class="h-80 relative"><canvas id="gerencial-dash-quantity-by-category-chart"></canvas></div></div>
                <div class="surface-card p-6 rounded-xl shadow-lg"><h3 class="text-xl font-bold mb-4">Faturamento por Hora do Dia</h3><div class="h-80 relative"><canvas id="gerencial-dash-sales-by-hour-chart"></canvas></div></div>
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
    `;
}

function createProductAnalysisDashboardHTML() {
    return `
        <div class="space-y-6">
            <!-- Filtros de Data -->
            <div class="surface-card p-4 rounded-xl shadow-lg flex items-center gap-4 flex-wrap">
                <label for="product-analysis-start-date" class="font-semibold">De:</label>
                <input type="date" id="product-analysis-start-date" class="input-themed p-2 rounded-lg">
                <label for="product-analysis-end-date" class="font-semibold">Até:</label>
                <input type="date" id="product-analysis-end-date" class="input-themed p-2 rounded-lg">
                <button id="product-analysis-apply-filter" class="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-semibold ml-auto">
                    <i class="fas fa-filter mr-2"></i>Aplicar Filtro
                </button>
            </div>

<!-- Cartões de Indicadores (KPIs) -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                <div class="surface-card p-5 rounded-xl shadow-lg text-center"><p class="text-sm text-color-secondary">Total Salgadinhos (Fritos/Assados)</p><p id="kpi-total-salgados-festa" class="text-3xl font-bold text-orange-500">...</p></div>
                <div class="surface-card p-5 rounded-xl shadow-lg text-center"><p class="text-sm text-color-secondary">Total Itens Revenda</p><p id="kpi-total-revenda" class="text-3xl font-bold text-teal-500">...</p></div>
                <div class="surface-card p-5 rounded-xl shadow-lg text-center"><p class="text-sm text-color-secondary">Total Fritos</p><p id="kpi-total-fritos" class="text-3xl font-bold text-amber-500">...</p></div>
                <div class="surface-card p-5 rounded-xl shadow-lg text-center"><p class="text-sm text-color-secondary">Total Assados</p><p id="kpi-total-assados" class="text-3xl font-bold text-lime-600">...</p></div>
                <div class="surface-card p-5 rounded-xl shadow-lg text-center"><p class="text-sm text-color-secondary">Total Geral de Itens</p><p id="kpi-total-geral" class="text-3xl font-bold text-color-primary">...</p></div>
            </div>

<!-- Gráficos e Tabela -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div class="lg:col-span-1 surface-card p-6 rounded-xl shadow-lg">
                    <h3 class="text-xl font-bold mb-4 text-center">Proporção de Vendas</h3>
                    <div class="h-80 relative"><canvas id="product-analysis-pie-chart"></canvas></div>
                </div>
                <div class="lg:col-span-2 surface-card p-6 rounded-xl shadow-lg flex flex-col">
                    <h3 class="text-xl font-bold mb-4">Top Produtos Mais Vendidos (Quantidade)</h3>
                    <div class="overflow-y-auto h-80 flex-grow">
                        <table class="min-w-full text-sm">
                            <thead class="table-header-themed sticky top-0">
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

function createClientAnalysisDashboardHTML() {
    return `
        <div class="surface-card p-4 rounded-xl shadow-lg flex items-center gap-4 flex-wrap mb-6">
            <label for="client-start-date" class="font-semibold">De:</label>
            <input type="date" id="client-start-date" class="input-themed p-2 rounded-lg">
            <label for="client-end-date" class="font-semibold">Até:</label>
            <input type="date" id="client-end-date" class="input-themed p-2 rounded-lg">
            <button id="client-apply-filter" class="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-semibold ml-auto">Aplicar Filtro</button>
        </div>

<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div class="surface-card p-5 rounded-xl shadow-lg flex items-center gap-4"><div class="bg-blue-100 p-3 rounded-full"><i class="fas fa-users text-xl text-blue-600"></i></div><div><p class="text-sm text-color-secondary">Total de Clientes</p><p id="kpi-total-clientes" class="text-2xl font-bold text-color-primary">...</p></div></div>
            <div class="surface-card p-5 rounded-xl shadow-lg flex items-center gap-4"><div class="bg-green-100 p-3 rounded-full"><i class="fas fa-user-plus text-xl text-green-600"></i></div><div><p class="text-sm text-color-secondary">Novos (Mês)</p><p id="kpi-novos-clientes" class="text-2xl font-bold text-color-primary">...</p></div></div>
            <div class="surface-card p-5 rounded-xl shadow-lg flex items-center gap-4"><div class="bg-purple-100 p-3 rounded-full"><i class="fas fa-sync-alt text-xl text-purple-600"></i></div><div><p class="text-sm text-color-secondary">Clientes Recorrentes</p><p id="kpi-clientes-recorrentes" class="text-2xl font-bold text-color-primary">...</p></div></div>
            <div class="surface-card p-5 rounded-xl shadow-lg flex items-center gap-4"><div class="bg-amber-100 p-3 rounded-full"><i class="fas fa-chart-line text-xl text-amber-600"></i></div><div><p class="text-sm text-color-secondary">Taxa de Retenção</p><p id="kpi-taxa-retencao" class="text-2xl font-bold text-color-primary">...%</p></div></div>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div class="lg:col-span-2 surface-card p-6 rounded-xl shadow-lg">
                <h3 class="font-bold text-lg mb-4">Top 10 Clientes (por valor gasto)</h3>
                <div class="overflow-x-auto">
                    <table class="min-w-full text-sm">
                        <thead class="table-header-themed"><tr class="text-left"><th class="p-2">#</th><th class="p-2">Nome</th><th class="p-2">Telefone</th><th class="p-2 text-right">Total Gasto</th><th class="p-2 text-center">Pedidos</th></tr></thead>
                        <tbody id="top-clients-table-body"></tbody>
                    </table>
                </div>
            </div>
            <div class="space-y-8">
                <div class="surface-card p-6 rounded-xl shadow-lg"><h3 class="font-bold text-lg mb-4">Crescimento de Novos Clientes (6 Meses)</h3><div><canvas id="client-growth-chart"></canvas></div></div>
                <div class="surface-card p-6 rounded-xl shadow-lg"><h3 class="font-bold text-lg mb-4">Segmentação de Clientes</h3><div><canvas id="client-segmentation-chart"></canvas></div></div>
            </div>
        </div>
    `;
}

function populateProductsTable(products) {
    const tableBody = document.getElementById('gerencial-dash-products-table-body');
    if (!tableBody) return;

const trackedProducts = products.filter(p => p.id && !p.id.startsWith('manual_'));

if (trackedProducts.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="4" class="text-center py-8 text-color-secondary">Nenhum produto vendido no período.</td></tr>`;
        return;
    }

const sortedProducts = [...trackedProducts].sort((a, b) => b.revenue - a.revenue);

const enriched = sortedProducts.map(p => {
        const profit = (typeof p.profit === 'number') ? p.profit : null;
        const profitPerUnit = (profit !== null && p.quantity > 0) ? (profit / p.quantity) : null;
        const profitPercent = (profit !== null && p.revenue > 0) ? (profit / p.revenue) * 100 : null;
        return {
            ...p,
            profitPerUnit,
            profitPercent
        };
    });

tableBody.innerHTML = enriched.map(p => `
        <tr class="border-b border-themed surface-hover">
            <td class="py-2 px-3">${p.name}</td>
            <td class="py-2 px-3 text-center">${p.quantity}</td>
            <td class="py-2 px-3 text-right">${formatCurrency(p.revenue)}</td>
            <td class="py-2 px-3 text-right ${p.profit === null ? 'text-gray-500' : (p.profit >= 0 ? 'text-green-600' : 'text-red-600')}">
                ${p.profit === null ? 'N/A' : formatCurrency(p.profit)}
            </td>
            <td class="py-2 px-3 text-right ${p.profitPercent === null ? 'text-gray-500' : (p.profitPercent >= 0 ? 'text-green-600' : 'text-red-600')}">
                ${p.profitPercent === null ? 'N/A' : (p.profitPercent.toFixed(1) + '%')}
            </td>
            <td class="py-2 px-3 text-right ${p.profitPerUnit === null ? 'text-gray-500' : (p.profitPerUnit >= 0 ? 'text-green-600' : 'text-red-600')}">
                ${p.profitPerUnit === null ? 'N/A' : formatCurrency(p.profitPerUnit)}
            </td>
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

try {
        const avgMarginEl = document.getElementById('kpi-average-margin');
        const avgProfitPerOrderEl = document.getElementById('kpi-avg-profit-per-order');

const totalRevenue = data.totalRevenue || 0;
        const totalGrossProfit = data.totalGrossProfit || 0;
        const totalOrders = data.totalOrders || 0;

const weightedMarginPercent = totalRevenue > 0 ? (totalGrossProfit / totalRevenue) * 100 : 0;
        const avgProfitPerOrder = totalOrders > 0 ? (totalGrossProfit / totalOrders) : 0;

if (avgMarginEl) avgMarginEl.textContent = (weightedMarginPercent).toFixed(1) + '%';
        if (avgProfitPerOrderEl) avgProfitPerOrderEl.textContent = formatCurrency(avgProfitPerOrder);
    } catch (e) {
        console.error('Erro ao atualizar KPIs adicionais:', e);
    }

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

try {
        const revEl = document.getElementById('gerencial-dash-total-revenue');
        const avgEl = document.getElementById('gerencial-dash-average-ticket');
        const topCustEl = document.getElementById('gerencial-dash-top-customer-name');
        const peakEl = document.getElementById('gerencial-dash-sales-peak-date');

if (revEl) {
            revEl.style.cursor = 'pointer';
            revEl.onclick = async () => {
                const products = data.products || [];
                const rows = products.slice().sort((a,b)=>b.revenue - a.revenue).slice(0,50).map(p => `
                    <tr class="border-b hover:bg-gray-50">
                        <td class="py-2 px-3">${p.name}</td>
                        <td class="py-2 px-3 text-center">${p.quantity}</td>
                        <td class="py-2 px-3 text-right font-bold text-green-600">${formatCurrency(p.revenue)}</td>
                    </tr>
                `).join('');
                showListModal('Produtos por Faturamento', [], rows);
            };
        }

if (avgEl) {
            avgEl.style.cursor = 'pointer';
            avgEl.onclick = () => showToast('Ticket médio exibido — clique em Faturamento para ver produtos relacionados.', 'info');
        }

if (topCustEl) {
            topCustEl.style.cursor = 'pointer';
            topCustEl.onclick = () => {
                const name = data.topCustomer?.name || 'N/A';
                const total = data.topCustomer?.totalSpent || 0;
                const rows = `<tr class="border-b hover:bg-gray-50"><td class="py-2 px-3 font-semibold">${name}</td><td class="py-2 px-3 text-right font-bold text-green-600">${formatCurrency(total)}</td><td class="py-2 px-3 text-center">--</td><td class="py-2 px-3"></td></tr>`;
                showListModal('Top Cliente', [], rows);
            };
        }

if (peakEl) {
            peakEl.style.cursor = 'pointer';
            peakEl.onclick = () => {
                const dateStr = data.salesPeak?.date || 'N/A';
                showToast(`Pico de vendas: ${dateStr}`, 'info');
            };
        }
    } catch (err) { console.warn('Erro habilitando KPIs financeiros interativos', err); }
}

function downloadCsv(filename, rows, headers) {
    const csvContent = [];
    if (headers && headers.length) csvContent.push(headers.join(','));
    rows.forEach(r => csvContent.push(r.replace(/<[^>]+>/g, '').replace(/\n/g, '').split('\t').join(',')));
    const blob = new Blob([csvContent.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function showListModal(title, headers = [], rowsHtml = '') {
    const modal = document.getElementById('client-history-modal');
    const modalTitle = document.getElementById('client-history-client-name');
    const tableBody = document.getElementById('client-history-orders-list');
    const tableHead = document.getElementById('client-history-orders-head');
    const modalFooter = document.getElementById('client-history-footer');
    if (!modal || !modalTitle || !tableBody) {
        console.warn('Modal padrão não encontrado para exibir lista.');
        return;
    }

modalTitle.textContent = title;

if (tableHead) {
        if (headers && headers.length) {
            tableHead.innerHTML = `<tr>${headers.map(h => `<th class="py-2 px-3 text-left">${h}</th>`).join('')}</tr>`;
        } else {
            tableHead.innerHTML = '';
        }
    }

const rows = rowsHtml && rowsHtml.length ? rowsHtml.split('<!--ROW-->').filter(Boolean) : [];
    const pageSize = 50;
    let currentPage = 1;
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));

function renderPage(page) {
        currentPage = Math.min(Math.max(1, page), totalPages);
        const start = (currentPage - 1) * pageSize;
        const end = start + pageSize;
        const slice = rows.slice(start, end);
        tableBody.innerHTML = slice.length ? slice.join('') : `<tr><td colspan="${Math.max(1, headers.length)}" class="text-center p-4">Nenhum dado disponível.</td></tr>`;
        if (modalFooter) {
            modalFooter.innerHTML = `<div class="flex items-center justify-between w-full"><div><button id="export-csv-btn" class="bg-green-600 text-white px-3 py-1 rounded">Exportar CSV</button></div><div class="text-sm text-gray-600">Página ${currentPage} de ${totalPages}</div><div><button id="prev-page" class="px-3 py-1 border rounded mr-2">Anterior</button><button id="next-page" class="px-3 py-1 border rounded">Próxima</button></div></div>`;
            document.getElementById('prev-page').addEventListener('click', () => renderPage(currentPage - 1));
            document.getElementById('next-page').addEventListener('click', () => renderPage(currentPage + 1));
            document.getElementById('export-csv-btn').addEventListener('click', () => {
                downloadCsv(title.replace(/\s+/g,'_') + '.csv', rows.map(r => r.replace(/<tr|<\/tr>/g, '').replace(/<td[^>]*>/g,'').replace(/<\/td>/g,'\t')), headers);
            });
        }
    }

if (rows.length === 0) {
        tableBody.innerHTML = rowsHtml && rowsHtml.length ? rowsHtml : `<tr><td colspan="${Math.max(1, headers.length)}" class="text-center p-4">Nenhum dado disponível.</td></tr>`;
        if (modalFooter) modalFooter.innerHTML = '';
    } else {
        renderPage(1);
    }

modal.classList.add('active');
    const closeBtn = document.getElementById('client-history-close-btn');
    if (closeBtn) {
        const closeFn = () => { modal.classList.remove('active'); closeBtn.removeEventListener('click', closeFn); };
        closeBtn.addEventListener('click', closeFn);
    }
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

function isTimePassed(timeStr) {
    if (!timeStr || !/^\d{2}:\d{2}$/.test(timeStr)) return false;
    const now = new Date();
    const [hours, minutes] = timeStr.split(':').map(Number);
    const targetTime = new Date();
    targetTime.setHours(hours, minutes, 0, 0);
    return now > targetTime;
}

async function loadVisaoGeralData(startDate, endDate) {
    console.log("loadVisaoGeralData: Carregando dados para a Visão Geral.");

let today = new Date();

let startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0,0,0,0);
    let endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23,59,59,999);

let fromDate = new Date(startOfToday);
    fromDate.setDate(fromDate.getDate() - 6);
    let toDate = new Date(endOfToday);

try {
    const financialOrders = await fetchTeamActivityOrders(fromDate, toDate);

let vendidoHoje = 0;
        let aReceberHoje = 0;
        let pedidosHoje = 0;
        const salesLast7Days = {};

for (let d = new Date(fromDate); d <= toDate; d.setDate(d.getDate() + 1)) {
            const dateString = d.toISOString().split('T')[0];
            salesLast7Days[dateString] = 0;
        }

financialOrders.forEach(order => {
            if (order.status === 'cancelado') return;

let orderDate = null;
            try {
                const created = order.createdAt;
                if (!created) {
                    console.warn('Pedido sem createdAt, pulando:', order.id);
                    return;
                }
                if (typeof created.toDate === 'function') {
                    orderDate = created.toDate();
                } else if (created instanceof Date) {
                    orderDate = created;
                } else {
                    orderDate = new Date(created);
                }
            } catch (err) {
                console.warn('Erro ao normalizar createdAt do pedido, pulando:', order.id, err);
                return;
            }

if (isNaN(orderDate.getTime())) {
                console.warn('createdAt inválido no pedido, pulando:', order.id);
                return;
            }

const orderDateString = orderDate.toISOString().split('T')[0];

if (salesLast7Days.hasOwnProperty(orderDateString)) {
                const totalNum = Number(order.total) || 0;
                salesLast7Days[orderDateString] += totalNum;
            }

if (orderDate >= startOfToday && orderDate <= endOfToday) {
                const totalNum = Number(order.total) || 0;
                const restanteNum = Number(order.restante) || 0;
                vendidoHoje += totalNum;
                aReceberHoje += restanteNum;
                pedidosHoje++;
            }
        });

document.getElementById('vg-vendido-hoje').textContent = formatCurrency(vendidoHoje);
        document.getElementById('vg-areceber-hoje').textContent = formatCurrency(aReceberHoje);
        document.getElementById('vg-pedidos-hoje').textContent = pedidosHoje;
        document.getElementById('vg-ticket-medio-hoje').textContent = formatCurrency(pedidosHoje > 0 ? vendidoHoje / pedidosHoje : 0);
        try {
            const ordersToday = financialOrders.filter(o => {
                if (!o.createdAt) return false;
                const od = (typeof o.createdAt.toDate === 'function') ? o.createdAt.toDate() : (o.createdAt instanceof Date ? o.createdAt : new Date(o.createdAt));
                return od >= startOfToday && od <= endOfToday;
            });
            const ordersTodayConverted = ordersToday.map(o => {
                const created = o.createdAt;
                const createdDate = (typeof created?.toDate === 'function') ? created.toDate() : (created instanceof Date ? created : new Date(created));
                return { ...o, createdAt: createdDate, total: Number(o.total) || 0, restante: Number(o.restante) || 0 };
            });

const vgVendidoEl = document.getElementById('vg-vendido-hoje');
            const vgPedidosEl = document.getElementById('vg-pedidos-hoje');
            const vgTicketEl = document.getElementById('vg-ticket-medio-hoje');

if (vgVendidoEl) {
                    vgVendidoEl.style.cursor = 'pointer';
                    vgVendidoEl.classList.add('kpi-clickable');
                vgVendidoEl.onclick = () => {
                    const rows = ordersTodayConverted && ordersTodayConverted.length ? ordersTodayConverted.map(o => `
                        <tr class="border-b hover:bg-gray-50">
                            <td class="py-2 px-3 font-mono">#${o.orderNumber}</td>
                            <td class="py-2 px-3">${formatDateToBR(o.createdAt)}</td>
                            <td class="py-2 px-3 font-semibold">${o.customer?.name || 'N/A'}</td>
                            <td class="py-2 px-3 text-right font-bold text-green-600">${formatCurrency(o.total)}</td>
                            <td class="py-2 px-3 text-center">${o.status}</td>
                        </tr>
                    `).join('') : '';
                    showListModal('Pedidos - Hoje (Vendido Hoje)', ['#','Data','Cliente','Valor','Status'], rows);
                };
            }

if (vgPedidosEl) {
                vgPedidosEl.style.cursor = 'pointer';
                vgPedidosEl.classList.add('kpi-clickable');
                vgPedidosEl.onclick = () => {
                    const rows = ordersTodayConverted && ordersTodayConverted.length ? ordersTodayConverted.map(o => `
                        <tr class="border-b hover:bg-gray-50">
                            <td class="py-2 px-3 font-mono">#${o.orderNumber}</td>
                            <td class="py-2 px-3">${formatDateToBR(o.createdAt)}</td>
                            <td class="py-2 px-3 font-semibold">${o.customer?.name || 'N/A'}</td>
                            <td class="py-2 px-3 text-right font-bold text-green-600">${formatCurrency(o.total)}</td>
                            <td class="py-2 px-3 text-center">${o.status}</td>
                        </tr>
                    `).join('') : '';
                    showListModal('Pedidos - Hoje', [], rows);
                };
            }

if (vgTicketEl) {
                vgTicketEl.style.cursor = 'pointer';
                vgTicketEl.classList.add('kpi-clickable');
                vgTicketEl.onclick = () => {
                    const top = (ordersTodayConverted || []).slice().sort((a,b)=>b.total - a.total).slice(0,20);
                    const rows = top.map(o => `
                        <tr class="border-b hover:bg-gray-50">
                            <td class="py-2 px-3 font-mono">#${o.orderNumber}</td>
                            <td class="py-2 px-3">${formatDateToBR(o.createdAt)}</td>
                            <td class="py-2 px-3 font-semibold">${o.customer?.name || 'N/A'}</td>
                            <td class="py-2 px-3 text-right font-bold text-green-600">${formatCurrency(o.total)}</td>
                        </tr>
                    `).join('');
                    showListModal('Top Pedidos por Valor - Hoje', [], rows);
                };
            }
        } catch (err) { console.warn('Erro ao habilitar interatividade VG KPIs', err); }

const chartLabels = Object.keys(salesLast7Days).map(dateStr => new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }));
        const chartData = Object.values(salesLast7Days);
        createOrUpdateLineChart('visao-geral-semanal-chart', chartLabels, chartData, 'Vendas (R$)');

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

document.getElementById('vg-entregas-hoje').textContent = dailyDeliveries.length;
        document.getElementById('vg-entregas-pagas').textContent = entregasPagas;
        document.getElementById('vg-entregas-pendentes').textContent = entregasPendentes;

try {
            const vgEntregasEl = document.getElementById('vg-entregas-hoje');
            const vgEntregasPagasEl = document.getElementById('vg-entregas-pagas');
            const vgEntregasPendEl = document.getElementById('vg-entregas-pendentes');
            const rows = dailyDeliveries.map(o => `
                <tr class="border-b hover:bg-gray-50">
                    <td class="py-2 px-3 font-mono">#${o.orderNumber}</td>
                    <td class="py-2 px-3">${formatDateToBR((typeof o.createdAt.toDate === 'function') ? o.createdAt.toDate() : (o.createdAt instanceof Date ? o.createdAt : new Date(o.createdAt)))}</td>
                    <td class="py-2 px-3 font-semibold">${o.customer?.name || 'N/A'}</td>
                    <td class="py-2 px-3 text-right font-bold text-green-600">${formatCurrency(o.restante)}</td>
                    <td class="py-2 px-3 text-center">${o.paymentStatus}</td>
                </tr>
            `).join('');
            const rowsPagas = dailyDeliveries.filter(o => o.paymentStatus === 'pago').map(o => `
                <tr class="border-b hover:bg-gray-50">
                    <td class="py-2 px-3 font-mono">#${o.orderNumber}</td>
                    <td class="py-2 px-3">${formatDateToBR((typeof o.createdAt.toDate === 'function') ? o.createdAt.toDate() : (o.createdAt instanceof Date ? o.createdAt : new Date(o.createdAt)))}</td>
                    <td class="py-2 px-3 font-semibold">${o.customer?.name || 'N/A'}</td>
                    <td class="py-2 px-3 text-right font-bold text-green-600">${formatCurrency(o.restante)}</td>
                    <td class="py-2 px-3 text-center">${o.paymentStatus}</td>
                </tr>
            `).join('');

const rowsPendentes = dailyDeliveries.filter(o => o.paymentStatus !== 'pago').map(o => `
                <tr class="border-b hover:bg-gray-50">
                    <td class="py-2 px-3 font-mono">#${o.orderNumber}</td>
                    <td class="py-2 px-3">${formatDateToBR((typeof o.createdAt.toDate === 'function') ? o.createdAt.toDate() : (o.createdAt instanceof Date ? o.createdAt : new Date(o.createdAt)))}</td>
                    <td class="py-2 px-3 font-semibold">${o.customer?.name || 'N/A'}</td>
                    <td class="py-2 px-3 text-right font-bold text-green-600">${formatCurrency(o.restante)}</td>
                    <td class="py-2 px-3 text-center">${o.paymentStatus}</td>
                </tr>
            `).join('');

if (vgEntregasEl) { vgEntregasEl.classList.add('kpi-clickable'); vgEntregasEl.onclick = () => showListModal('Entregas - Hoje', ['#','Data','Cliente','Valor','Status'], rows); }
            if (vgEntregasPagasEl) { vgEntregasPagasEl.classList.add('kpi-clickable'); vgEntregasPagasEl.onclick = () => showListModal('Entregas Pagas - Hoje', ['#','Data','Cliente','Valor','Status'], rowsPagas); }
            if (vgEntregasPendEl) { vgEntregasPendEl.classList.add('kpi-clickable'); vgEntregasPendEl.onclick = () => showListModal('Entregas Pendentes - Hoje', ['#','Data','Cliente','Valor','Status'], rowsPendentes); }
        } catch (err) { console.warn('Erro ao habilitar interatividade de entregas', err); }

const agendaContainer = document.getElementById('vg-agenda-hoje');
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
                    <div class="flex items-center gap-4 p-3 rounded-lg border border-themed ${timePassed ? 'surface-alt opacity-70' : 'surface-card'}">
                        <div class="text-center w-16 shrink-0"><p class="font-bold text-lg">${order.delivery?.time || 'N/A'}</p><span class="text-xs px-2 py-0.5 rounded-full font-semibold ${deliveryStatusClass}">${deliveryStatusText}</span></div>
                        <div class="flex-grow"><p class="font-semibold truncate">${order.customer?.name || 'N/A'}</p><p class="text-sm text-color-secondary">Pedido #${order.orderNumber}</p></div>
                        <div class="text-center shrink-0"><p class="font-bold text-orange-500">${totalSalgados}</p><p class="text-xs text-gray-500">Salgados</p></div>
                        <div class="text-center w-20 shrink-0"><p class="font-bold ${paymentStatusClass}">${formatCurrency(order.restante)}</p><p class="text-xs text-gray-500">em Aberto</p></div>
                    </div>
                `;
            }).join('');
        }

} catch (error) {
        console.error("Erro ao carregar dados da Visão Geral:", error);
        showToast("Falha ao carregar dados da Visão Geral.", "error");
    }
}

async function renderProductAnalysisDashboard() {
    const container = document.getElementById('content-analise-produtos');
    if (!container) return;

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

const categoryTotals = { fritos: 0, assados: 0, revenda: 0, outros: 0 };
            if (salesData.quantityByCategory) {
                salesData.quantityByCategory.forEach(cat => {
                    if (categoryTotals.hasOwnProperty(cat.name)) {
                        categoryTotals[cat.name] = cat.value;
                    }
                });
            }

const salgadosFesta = (categoryTotals.fritos || 0) + (categoryTotals.assados || 0);
            const totalGeral = salgadosFesta + (categoryTotals.revenda || 0) + (categoryTotals.outros || 0);

document.getElementById('kpi-total-salgados-festa').textContent = salgadosFesta;
            document.getElementById('kpi-total-revenda').textContent = categoryTotals.revenda;
            document.getElementById('kpi-total-fritos').textContent = categoryTotals.fritos;
            document.getElementById('kpi-total-assados').textContent = categoryTotals.assados;
            document.getElementById('kpi-total-geral').textContent = totalGeral;

try {
                const kSalgados = document.getElementById('kpi-total-salgados-festa');
                const kRevenda = document.getElementById('kpi-total-revenda');
                const kFritos = document.getElementById('kpi-total-fritos');
                const kAssados = document.getElementById('kpi-total-assados');
                const kGeral = document.getElementById('kpi-total-geral');

const productsList = salesData.products || [];

if (kSalgados) {
                    kSalgados.style.cursor = 'pointer';
                    kSalgados.onclick = () => {
                        const rows = productsList.filter(p => p.category === 'fritos' || p.category === 'assados').sort((a,b)=>b.quantity-a.quantity).map(p => `
                            <tr class="border-b hover:bg-gray-50">
                                <td class="py-2 px-3">${p.name}</td>
                                <td class="py-2 px-3 text-right font-bold">${p.quantity}</td>
                                <td class="py-2 px-3 text-right">${formatCurrency(p.revenue)}</td>
                            </tr>
                        `).join('');
                        showListModal('Salgadinhos (Assados/Fritos)', [], rows);
                    };
                }

if (kRevenda) {
                    kRevenda.style.cursor = 'pointer';
                    kRevenda.onclick = () => {
                        const rows = productsList.filter(p => p.category === 'revenda').map(p => `
                            <tr class="border-b hover:bg-gray-50"><td class="py-2 px-3">${p.name}</td><td class="py-2 px-3 text-right font-bold">${p.quantity}</td><td class="py-2 px-3 text-right">${formatCurrency(p.revenue)}</td></tr>
                        `).join('');
                        showListModal('Itens Revenda', [], rows);
                    };
                }

if (kFritos) { kFritos.onclick = kSalgados.onclick; }
                if (kAssados) { kAssados.onclick = kSalgados.onclick; }
                if (kGeral) {
                    kGeral.style.cursor = 'pointer';
                    kGeral.onclick = () => {
                        const rows = productsList.slice().sort((a,b)=>b.quantity-a.quantity).slice(0,100).map(p=>`<tr class="border-b hover:bg-gray-50"><td class="py-2 px-3">${p.name}</td><td class="py-2 px-3 text-right font-bold">${p.quantity}</td><td class="py-2 px-3 text-right">${formatCurrency(p.revenue)}</td></tr>`).join('');
                        showListModal('Top Produtos (Período)', [], rows);
                    };
                }
            } catch (err) { console.warn('Erro habilitando KPIs de produtos interativos', err); }

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

function renderClientAnalysisDashboard() {
    const container = document.getElementById('content-analise-clientes');
    if (!container) return;

container.innerHTML = createClientAnalysisDashboardHTML();
    const startInput = document.getElementById('client-start-date');
    const endInput = document.getElementById('client-end-date');
    const applyBtn = document.getElementById('client-apply-filter');
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    if (startInput && endInput) {
        startInput.value = firstDay.toISOString().split('T')[0];
        endInput.value = lastDay.toISOString().split('T')[0];
    }
    const loadForInputs = async () => {
        const s = startInput && startInput.value ? new Date(startInput.value + 'T00:00:00') : null;
        const e = endInput && endInput.value ? new Date(endInput.value + 'T23:59:59') : null;
        await populateCustomerAnalysisData(s, e);
    };
    if (applyBtn) applyBtn.addEventListener('click', loadForInputs);
    loadForInputs();
}

function initializeDashboardTabs() {
    const tabs = document.querySelectorAll('.dashboard-tab');
    const contentArea = document.getElementById('dashboard-content-area');

if (!contentArea) {
        console.error("Elemento '#dashboard-content-area' não encontrado.");
        return;
    }

const switchTab = async (targetTab) => {
        tabs.forEach(tab => {
            tab.classList.remove('text-blue-600', 'border-blue-500');
            tab.classList.add('text-gray-500', 'border-transparent', 'hover:text-gray-700', 'hover:border-gray-300');
        });
        targetTab.classList.add('text-blue-600', 'border-blue-500');
        targetTab.classList.remove('text-gray-500', 'border-transparent', 'hover:text-gray-700', 'hover:border-gray-300');

const targetContentId = targetTab.dataset.content;

document.querySelectorAll('.dashboard-tab-content').forEach(content => {
            if (content.id === targetContentId) {
                content.classList.remove('hidden');
            } else {
                content.classList.add('hidden');
            }
        });

if (targetContentId === 'content-visao-geral') {
            await loadVisaoGeralData();
        } else if (targetContentId === 'content-analise-financeira') {
            const contentPanel = document.getElementById(targetContentId);
            if (!tabContentRendered[targetContentId]) {
                contentPanel.innerHTML = createFinancialAnalysisDashboardHTML();

const startDateInput = document.getElementById('gerencial-start-date');
                const endDateInput = document.getElementById('gerencial-end-date');
                const applyFilterBtn = document.getElementById('gerencial-apply-filter');

if (startDateInput && endDateInput && applyFilterBtn) {
                    const today = new Date();
                    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
                    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

startDateInput.value = firstDayOfMonth.toISOString().split('T')[0];
                    endDateInput.value = lastDayOfMonth.toISOString().split('T')[0];

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
                }

document.getElementById('generate-ai-analysis-btn')?.addEventListener('click', handleGenerateDashboardAnalysis);
                tabContentRendered[targetContentId] = true; // Marca como renderizado APÓS configurar os listeners
            }

document.getElementById('gerencial-apply-filter')?.click();
        } else if (targetContentId === 'content-analise-produtos') {
            await renderProductAnalysisDashboard();
        } else if (targetContentId === 'content-analise-clientes') {
            await renderClientAnalysisDashboard();
        }
    };

tabs.forEach(tab => tab.addEventListener('click', () => switchTab(tab)));

const initialTab = document.querySelector('.dashboard-tab');
    if (initialTab) {
        switchTab(initialTab);
    }
}

export function renderGerencialDashboard() {
    if (!gerencialDashboardContainer) return;

gerencialDashboardContainer.innerHTML = createDashboardHTML();
    initializeDashboardTabs();
}

