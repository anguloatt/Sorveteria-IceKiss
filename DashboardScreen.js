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
        // A estrutura completa de todas as abas é adicionada aqui, garantindo que nenhum conteúdo seja removido.
        dashboardScreen.innerHTML = `
            <!-- Abas de Navegação do Dashboard -->
            <div class="border-b border-gray-200 bg-white p-4 rounded-t-xl shadow-lg">
                <nav class="-mb-px flex space-x-8" aria-label="Tabs" id="dashboard-tabs-nav">
                    <button data-tab="visao-geral" data-content="content-visao-geral" class="dashboard-tab whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm text-blue-600 border-blue-500">Visão Geral</button>
                    <button data-tab="financeiro" data-content="content-analise-financeira" class="dashboard-tab whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300">Análise Financeira</button>
                    <button data-tab="produtos" data-content="content-analise-produtos" class="dashboard-tab whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300">Análise de Produtos</button>
                    <button data-tab="clientes" data-content="content-analise-clientes" class="dashboard-tab whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300">Análise de Clientes</button>
                </nav>
            </div>

            <!-- Painéis de Conteúdo das Abas -->
            <div id="dashboard-tab-content" class="p-6 space-y-6 overflow-y-auto">
                <!-- Aba: Visão Geral (CONTEÚDO DETALHADO AGORA INCLUÍDO) -->
                <div id="content-visao-geral" class="dashboard-tab-panel">
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
                    <div class="bg-white p-6 rounded-xl shadow-md mb-6">
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
                </div>
                
                <!-- Aba: Análise Financeira (CONTEÚDO ORIGINAL RESTAURADO) -->
                <div id="content-analise-financeira" class="dashboard-tab-panel hidden">
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
                            <div class="bg-white p-5 rounded-xl shadow-lg flex items-center gap-4"><i class="fas fa-crown text-3xl text-yellow-500 bg-yellow-100 p-4 rounded-full"></i><div><p class="text-sm text-gray-500">Top Cliente</p><p id="gerencial-dash-top-customer-name" class="text-lg font-bold truncate" title="Carregando...">Carregando...</p><p id="gerencial-dash-top-customer-value" class="text-sm text-gray-600">--</p></div></div>
                            <div class="bg-white p-5 rounded-xl shadow-lg flex items-center gap-4"><i class="fas fa-chart-line text-3xl text-red-500 bg-red-100 p-4 rounded-full"></i><div><p class="text-sm text-gray-500">Pico de Vendas</p><p id="gerencial-dash-sales-peak-date" class="text-lg font-bold">Carregando...</p><p id="gerencial-dash-sales-peak-value" class="text-sm text-gray-600">--</p></div></div>
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

                <!-- Aba: Análise de Produtos (CONTEÚDO ORIGINAL RESTAURADO) -->
                <div id="content-analise-produtos" class="dashboard-tab-panel hidden">
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
                </div>

                <!-- Aba: Análise de Clientes (ESTRUTURA COMPLETA RESTAURADA) -->
                <div id="content-analise-clientes" class="dashboard-tab-panel hidden space-y-6">
                    <!-- KPIs de Clientes -->
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div class="bg-white p-5 rounded-xl shadow-md flex items-center justify-between"><div class="space-y-1"><p class="text-sm font-medium text-gray-500">Total de Clientes</p><p id="kpi-total-clientes" class="text-3xl font-bold text-blue-600">--</p></div><div class="bg-blue-100 rounded-full p-3"><i class="fas fa-users text-2xl text-blue-600"></i></div></div>
                        <div class="bg-white p-5 rounded-xl shadow-md flex items-center justify-between"><div class="space-y-1"><p class="text-sm font-medium text-gray-500">Novos Clientes (Mês)</p><p id="kpi-novos-clientes" class="text-3xl font-bold text-green-600">--</p></div><div class="bg-green-100 rounded-full p-3"><i class="fas fa-user-plus text-2xl text-green-600"></i></div></div>
                        <div class="bg-white p-5 rounded-xl shadow-md flex items-center justify-between"><div class="space-y-1"><p class="text-sm font-medium text-gray-500">Clientes Recorrentes</p><p id="kpi-clientes-recorrentes" class="text-3xl font-bold text-orange-500">--</p></div><div class="bg-orange-100 rounded-full p-3"><i class="fas fa-user-tag text-2xl text-orange-500"></i></div></div>
                        <div class="bg-white p-5 rounded-xl shadow-md flex items-center justify-between"><div class="space-y-1"><p class="text-sm font-medium text-gray-500">Taxa de Retenção</p><p id="kpi-taxa-retencao" class="text-3xl font-bold text-purple-600">--%</p></div><div class="bg-purple-100 rounded-full p-3"><i class="fas fa-sync-alt text-2xl text-purple-600"></i></div></div>
                    </div>

                    <!-- Gráficos de Clientes -->
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div class="bg-white p-6 rounded-xl shadow-md">
                            <h3 class="text-lg font-semibold text-gray-700 mb-4">Crescimento de Clientes (Últimos 6 meses)</h3>
                            <canvas id="client-growth-chart"></canvas>
                        </div>
                        <div class="bg-white p-6 rounded-xl shadow-md">
                            <h3 class="text-lg font-semibold text-gray-700 mb-4">Segmentação de Clientes</h3>
                            <canvas id="client-segmentation-chart"></canvas>
                        </div>
                    </div>

                    <!-- Tabela de Top Clientes -->
                    <div class="bg-white p-6 rounded-xl shadow-md">
                        <h3 class="text-lg font-semibold text-gray-700 mb-4">Top 10 Clientes (por valor total em compras)</h3>
                        <div class="overflow-x-auto">
                            <table class="min-w-full bg-white text-sm">
                                <thead class="bg-gray-100">
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

        // Referências aos elementos de data e filtro (permanecem aqui, pois são parte da inicialização da dashboard)
        const startDateInput = document.getElementById('dashboard-date-start');
        const endDateInput = document.getElementById('dashboard-date-end');
        const applyFilterBtn = document.getElementById('dashboard-apply-filter-btn');
        
        // Referências aos KPIs de produto (movidos para a Visão Geral, mas a lógica de atualização ainda é geral)
        const kpiMostSoldEl = document.getElementById('kpi-most-sold-product');
        const kpiLeastSoldEl = document.getElementById('kpi-least-sold-product');
        const kpiHighestRevenueEl = document.getElementById('kpi-highest-revenue-product');
        const kpiTotalProfitEl = document.getElementById('kpi-total-gross-profit');

        // Esta lógica de atualização dos KPIs de produto continua aqui, pois ela é chamada por loadAndDisplayDashboardData.
        // Se no futuro a aba de "Produtos" tiver sua própria lógica de carregamento, esta função pode ser refatorada.
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

        // Lógica de atualização dos gráficos de produto (continua aqui)
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

        // Função para estado de carregamento (continua aqui)
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

        // Inicialização dos inputs de data e listener do botão de filtro (continua aqui)
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
