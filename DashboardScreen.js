// Arquivo: DashboardScreen.js
// Responsável por controlar a lógica da nova tela de Dashboard Gerencial.

import { fetchSalesDataForDashboard } from './firebaseService.js';
import { createOrUpdateBarChart } from './charts.js'; // Importa a função de gráfico de barras atualizada.
import { formatCurrency, showToast, getTodayDateString } from './utils.js';

/**
 * Inicializa a tela do Dashboard Gerencial.
 * Esta função é chamada pela navegação no manager.js.
 */
export function initDashboardScreen() {
    const dashboardScreen = document.getElementById('gerencial-dashboard-screen');

    if (dashboardScreen) {
        // CORREÇÃO: A estrutura agora é adicionada diretamente aqui, garantindo que seja a correta.
        dashboardScreen.innerHTML = `
            <!-- Abas de Navegação do Dashboard -->
            <div class="border-b border-themed surface-card p-4 rounded-t-xl shadow-lg">
                <nav class="-mb-px flex space-x-8" aria-label="Tabs" id="dashboard-tabs-nav">
                    <button data-tab="visao-geral" class="dashboard-tab whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm text-blue-600 border-blue-500">Visão Geral</button>
                    <button data-tab="financeiro" class="dashboard-tab whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300">Análise Financeira</button>
                    <button data-tab="produtos" class="dashboard-tab whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300">Análise de Produtos</button>
                    <button data-tab="clientes" class="dashboard-tab whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300">Análise de Clientes</button>
                </nav>
            </div>

            <!-- Painéis de Conteúdo das Abas -->
            <div id="dashboard-tab-content" class="p-6 space-y-6 overflow-y-auto text-color-primary">
                <!-- Aba: Visão Geral (será preenchida por manager-realtime.js) -->
                <div id="tab-content-visao-geral" class="dashboard-tab-panel">
                    <!-- O conteúdo da Visão Geral será carregado aqui dinamicamente. -->
                </div>
                
                <!-- Aba: Análise Financeira (Placeholder) -->
                <div id="tab-content-financeiro" class="dashboard-tab-panel hidden">
                     <div class="flex flex-col items-center justify-center h-64 surface-alt rounded-lg">
                        <i class="fas fa-chart-line text-4xl text-gray-400 mb-4"></i>
                        <p class="text-color-secondary">O novo relatório de <strong>Análise Financeira</strong> será construído aqui em uma fase futura.</p>
                    </div>
                </div>

                <!-- Aba: Análise de Produtos (Placeholder) -->
                <div id="tab-content-produtos" class="dashboard-tab-panel hidden">
                     <div class="flex flex-col items-center justify-center h-64 surface-alt rounded-lg">
                        <i class="fas fa-tags text-4xl text-gray-400 mb-4"></i>
                        <p class="text-color-secondary">O novo relatório de <strong>Análise de Produtos</strong> será construído aqui em uma fase futura.</p>
                    </div>
                </div>

                <!-- Aba: Análise de Clientes (ESTRUTURA COMPLETA) -->
                <div id="tab-content-clientes" class="dashboard-tab-panel hidden space-y-6">
                    <!-- KPIs de Clientes -->
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div class="surface-card p-5 rounded-xl shadow-md flex items-center justify-between"><div class="space-y-1"><p class="text-sm font-medium text-color-secondary">Total de Clientes</p><p id="kpi-total-clientes" class="text-3xl font-bold text-blue-600">--</p></div><div class="bg-blue-100 rounded-full p-3"><i class="fas fa-users text-2xl text-blue-600"></i></div></div>
                        <div class="surface-card p-5 rounded-xl shadow-md flex items-center justify-between"><div class="space-y-1"><p class="text-sm font-medium text-color-secondary">Novos Clientes (Mês)</p><p id="kpi-novos-clientes" class="text-3xl font-bold text-green-600">--</p></div><div class="bg-green-100 rounded-full p-3"><i class="fas fa-user-plus text-2xl text-green-600"></i></div></div>
                        <div class="surface-card p-5 rounded-xl shadow-md flex items-center justify-between"><div class="space-y-1"><p class="text-sm font-medium text-color-secondary">Clientes Recorrentes</p><p id="kpi-clientes-recorrentes" class="text-3xl font-bold text-orange-500">--</p></div><div class="bg-orange-100 rounded-full p-3"><i class="fas fa-user-tag text-2xl text-orange-500"></i></div></div>
                        <div class="surface-card p-5 rounded-xl shadow-md flex items-center justify-between"><div class="space-y-1"><p class="text-sm font-medium text-color-secondary">Taxa de Retenção</p><p id="kpi-taxa-retencao" class="text-3xl font-bold text-purple-600">--%</p></div><div class="bg-purple-100 rounded-full p-3"><i class="fas fa-sync-alt text-2xl text-purple-600"></i></div></div>
                    </div>

                    <!-- Gráficos de Clientes -->
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div class="surface-card p-6 rounded-xl shadow-md">
                            <h3 class="text-lg font-semibold text-color-primary mb-4">Crescimento de Clientes (Últimos 6 meses)</h3>
                            <canvas id="client-growth-chart"></canvas>
                        </div>
                        <div class="surface-card p-6 rounded-xl shadow-md">
                            <h3 class="text-lg font-semibold text-color-primary mb-4">Segmentação de Clientes</h3>
                            <canvas id="client-segmentation-chart"></canvas>
                        </div>
                    </div>

                    <!-- Tabela de Top Clientes -->
                    <div class="surface-card p-6 rounded-xl shadow-md">
                        <h3 class="text-lg font-semibold text-color-primary mb-4">Top 10 Clientes (por valor total em compras)</h3>
                        <div class="overflow-x-auto">
                            <table class="min-w-full text-sm">
                                <thead class="table-header-themed">
                                    <tr>
                                        <th class="py-2 px-3 text-left">Ranking</th>
                                        <th class="py-2 px-3 text-left">Cliente</th>
                                        <th class="py-2 px-3 text-left">Telefone</th>
                                        <th class="py-2 px-3 text-right">Total Gasto</th>
                                        <th class="py-2 px-3 text-center">Total de Pedidos</th>
                                    </tr>
                                </thead>
                                <tbody id="top-clients-table-body">
                                    <!-- Linhas da tabela serão populadas via JavaScript -->
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
        console.log("initDashboardScreen: Layout do Dashboard Gerencial renderizado.");

        // O restante do seu código original para os filtros e KPIs da visão geral
        const startDateInput = document.getElementById('dashboard-date-start');
        const endDateInput = document.getElementById('dashboard-date-end');
        const applyFilterBtn = document.getElementById('dashboard-apply-filter-btn');
        
        // Se os elementos abaixo não forem da "Visão Geral", eles podem ser removidos daqui
        // e colocados em suas respectivas funções de carregamento de aba.
        // Por enquanto, vou mantê-los assumindo que fazem parte da lógica inicial.
        const kpiMostSoldEl = document.getElementById('kpi-most-sold-product');
        const kpiLeastSoldEl = document.getElementById('kpi-least-sold-product');
        const kpiHighestRevenueEl = document.getElementById('kpi-highest-revenue-product');
        const kpiTotalProfitEl = document.getElementById('kpi-total-gross-profit');

        // Esta lógica parece pertencer à aba "Análise de Produtos", não à "Visão Geral".
        // O ideal seria mover esta lógica para uma função que é chamada quando a aba "Produtos" é clicada.
        function updateKpiCards(products, totalProfit) {
            if (kpiMostSoldEl && products && products.length > 0) {
                const sortedByQuantity = [...products].sort((a, b) => b.quantity - a.quantity);
                const mostSold = sortedByQuantity[0];
                const leastSold = sortedByQuantity[sortedByQuantity.length - 1];
                const sortedByRevenue = [...products].sort((a, b) => b.revenue - a.revenue);
                const highestRevenue = sortedByRevenue[0];

                kpiMostSoldEl.textContent = `${mostSold.name} (${mostSold.quantity} un)`;
                kpiLeastSoldEl.textContent = `${leastSold.name} (${leastSold.quantity} un)`;
                kpiHighestRevenueEl.textContent = `${highestRevenue.name} (${formatCurrency(highestRevenue.revenue)})`;
            } else if (kpiMostSoldEl) {
                kpiMostSoldEl.textContent = 'N/A';
                kpiLeastSoldEl.textContent = 'N/A';
                kpiHighestRevenueEl.textContent = 'N/A';
            }
            if (kpiTotalProfitEl) {
                kpiTotalProfitEl.textContent = formatCurrency(totalProfit);
            }
        }

        function updateProductCharts(products) {
             if (!products || products.length === 0) {
                // Limpa os gráficos se não houver dados
                createOrUpdateBarChart('chart-top-products-revenue', [], [], 'Faturamento', '#22c55e', true, true);
                createOrUpdateBarChart('chart-top-products-quantity', [], [], 'Quantidade', '#8b5cf6', true, false);
                return;
            };

            // Gráfico 1: Top 5 por Faturamento (horizontal)
            const top5ByRevenue = [...products].sort((a, b) => b.revenue - a.revenue).slice(0, 5).reverse();
            const revenueLabels = top5ByRevenue.map(p => p.name);
            const revenueData = top5ByRevenue.map(p => p.revenue);
            createOrUpdateBarChart('chart-top-products-revenue', revenueLabels, revenueData, 'Faturamento', '#22c55e', true, true);

            // Gráfico 2: Top 5 por Quantidade (horizontal)
            const top5ByQuantity = [...products].sort((a, b) => b.quantity - a.quantity).slice(0, 5).reverse();
            const quantityLabels = top5ByQuantity.map(p => p.name);
            const quantityData = top5ByQuantity.map(p => p.quantity);
            createOrUpdateBarChart('chart-top-products-quantity', quantityLabels, quantityData, 'Quantidade', '#8b5cf6', true, false);
        }

        function setLoadingState(isLoading) {
            const loadingText = 'Calculando...';
            if (isLoading) {
                if (kpiMostSoldEl) kpiMostSoldEl.textContent = loadingText;
                if (kpiLeastSoldEl) kpiLeastSoldEl.textContent = loadingText;
                if (kpiHighestRevenueEl) kpiHighestRevenueEl.textContent = loadingText;
                if (kpiTotalProfitEl) kpiTotalProfitEl.textContent = loadingText;
                if (applyFilterBtn) {
                    applyFilterBtn.disabled = true;
                    applyFilterBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Aplicando...';
                }
            } else {
                if (applyFilterBtn) {
                    applyFilterBtn.disabled = false;
                    applyFilterBtn.innerHTML = '<i class="fas fa-filter mr-2"></i>Aplicar';
                }
            }
        }

        async function loadAndDisplayDashboardData() {
            if (!startDateInput || !endDateInput) return; // Garante que os inputs de data existam
            setLoadingState(true);
            const startDate = new Date(startDateInput.value + 'T00:00:00');
            const endDate = new Date(endDateInput.value + 'T23:59:59');

            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                showToast("Datas inválidas selecionadas.", "error");
                setLoadingState(false);
                return;
            }

            const salesData = await fetchSalesDataForDashboard(startDate, endDate);
            // Filtra os produtos para não incluir itens manuais nos KPIs e gráficos
            const trackedProducts = salesData.products.filter(p => !p.id.startsWith('manual_'));

            updateKpiCards(trackedProducts, salesData.totalGrossProfit);
            updateProductCharts(trackedProducts);
            setLoadingState(false);
        }

        if (startDateInput && endDateInput) {
            const today = new Date();
            const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            
            startDateInput.value = getTodayDateString('yyyy-mm-dd', startOfMonth);
            endDateInput.value = getTodayDateString('yyyy-mm-dd', today);

            if (applyFilterBtn) {
                applyFilterBtn.addEventListener('click', loadAndDisplayDashboardData);
            }
            // A chamada inicial para carregar os dados da visão geral será feita pelo manager.js
            // loadAndDisplayDashboardData(); 
        }

    } else {
        console.error('Erro Crítico: O elemento contêiner #gerencial-dashboard-screen não foi encontrado no DOM.');
    }
}

/**
 * Inicializa o dashboard, limpando o container principal e inserindo a nova estrutura gerada.
 * Esta função garante que o dashboard seja sempre construído a partir desta fonte única.
 */
export function initializeDashboardScreen() {
    const mainContent = document.getElementById('manager-main-content');
    if (mainContent) {
        const dashboardScreen = document.createElement('div');
        dashboardScreen.id = 'gerencial-dashboard-screen-wrapper'; // Wrapper para evitar conflitos de ID
        mainContent.innerHTML = ''; 
        mainContent.appendChild(dashboardScreen);
        initDashboardScreen(); // Chama a função que constrói o HTML
    } else {
        console.error("Container principal do gerente ('manager-main-content') não foi encontrado. O dashboard não pode ser inicializado.");
    }
}
