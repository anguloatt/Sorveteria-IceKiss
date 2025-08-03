// Meu arquivo para centralizar toda a lógica de criação e atualização de gráficos usando Chart.js.

import { formatCurrency } from './utils.js';
// Importo o objeto global `charts` do app.js para armazenar as instâncias dos gráficos.
// Isso me permite destruir gráficos antigos antes de criar novos, evitando problemas de memória e renderização.
import { charts } from './app.js';

/**
 * Minha função principal para renderizar o gráfico de vendas da última semana no dashboard.
 * @param {object} salesData Um objeto com os dias da semana como chaves e o total de vendas como valores.
 */
export function renderMainSalesChart(salesData) {
    const canvas = document.getElementById('salesChart');
    if (!canvas) {
        console.warn("Elemento canvas 'salesChart' não encontrado. O gráfico não será renderizado.");
        return;
    }
    const ctx = canvas.getContext('2d');

    // Se já existe um gráfico nesta tela, eu o destruo primeiro.
    if (charts.mainSalesChart) {
        charts.mainSalesChart.destroy();
    }

    // Eu ordeno os dias da semana corretamente para exibição no gráfico.
    const orderedDays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const chartData = orderedDays.map(day => salesData[day] || 0);

    // Crio a nova instância do gráfico e a armazeno na minha variável global.
    charts.mainSalesChart = new Chart(ctx, {
        type: 'line', // Tipo de gráfico: linha
        data: {
            labels: orderedDays,
            datasets: [{
                label: 'Vendas (R$)',
                data: chartData,
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 2,
                tension: 0.4, // Deixa a linha com curvas suaves
                fill: true,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) { return 'R$ ' + value; } // Formata o eixo Y com "R$"
                    }
                }
            }
        }
    });
}

/**
 * Minha função genérica para criar ou atualizar gráficos do tipo pizza (pie) ou rosca (doughnut).
 * @param {string} canvasId O ID do elemento canvas onde o gráfico será renderizado.
 * @param {Array<number>} data Os dados numéricos para o gráfico.
 * @param {Array<string>} labels Os rótulos para cada fatia do gráfico.
 * @param {Array<string>} colors As cores para cada fatia.
 */
export function createOrUpdatePieChart(canvasId, data, labels, colors) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.warn(`Elemento canvas '${canvasId}' não encontrado.`);
        return;
    }
    const ctx = canvas.getContext('2d');

    if (charts[canvasId]) {
        charts[canvasId].destroy();
    }

    charts[canvasId] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { 
                    display: true,
                    position: 'right', // Exibe a legenda à direita para gráficos de pizza
                },
                tooltip: { enabled: true }
            },
            cutout: '60%' // Cria o efeito de rosca (doughnut)
        }
    });
}

/**
 * Minha função genérica para criar ou atualizar gráficos de linha.
 * @param {string} canvasId O ID do elemento canvas.
 * @param {Array<string>} labels Os rótulos do eixo X.
 * @param {Array<number>} data Os dados do eixo Y.
 * @param {string} label O rótulo do conjunto de dados.
 * @param {object} pointColors Um objeto para colorir pontos específicos do gráfico.
 */
export function createOrUpdateLineChart(canvasId, labels, data, label, pointColors = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.warn(`Elemento canvas '${canvasId}' não encontrado.`);
        return;
    }
    const ctx = canvas.getContext('2d');

    if (charts[canvasId]) {
        charts[canvasId].destroy();
    }

    charts[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: label,
                data: data,
                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                borderColor: 'rgba(59, 130, 246, 1)',
                pointBackgroundColor: context => pointColors[context.label] || 'rgba(59, 130, 246, 1)',
                pointRadius: context => pointColors[context.label] ? 6 : 3,
                borderWidth: 2,
                tension: 0.3,
                fill: true,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

/**
 * Minha função genérica para criar ou atualizar gráficos de barras.
 * @param {string} canvasId O ID do elemento canvas.
 * @param {Array<string>} labels Os rótulos para cada barra.
 * @param {Array<number>} data Os dados para cada barra.
 * @param {string} label O rótulo do conjunto de dados.
 * @param {string} color A cor das barras.
 * @param {boolean} isHorizontal Define se o gráfico é de barras horizontais.
 * @param {boolean} isCurrency Define se o eixo de valores deve ser formatado como moeda.
 */
export function createOrUpdateBarChart(canvasId, labels, data, label, color, isHorizontal = false, isCurrency = false) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.warn(`Elemento canvas '${canvasId}' não encontrado.`);
        return;
    }
    const ctx = canvas.getContext('2d');

    if (charts[canvasId]) {
        charts[canvasId].destroy();
    }

    const axis = isHorizontal ? 'y' : 'x';
    const valueAxis = isHorizontal ? 'x' : 'y';

    charts[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: label,
                data: data,
                backgroundColor: color,
                borderColor: color,
                borderWidth: 1,
                borderRadius: 5,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: axis, // 'y' para horizontal, 'x' para vertical
            scales: {
                [valueAxis]: { // Configura o eixo de valores (x para horizontal, y para vertical)
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            if (isCurrency) {
                                return 'R$ ' + value.toFixed(2);
                            }
                            return value;
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    display: false // Legenda não é necessária para um único conjunto de dados
                }
            }
        }
    });
}

/**
 * Renderiza o gráfico de pizza para o faturamento por categoria no Dashboard Gerencial.
 * @param {string} canvasId O ID do elemento canvas.
 * @param {Array<object>} categoryData Um array de objetos, ex: [{name: 'fritos', value: 150.50}].
 */
export function renderCategorySalesChart(canvasId, categoryData = []) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.warn(`Elemento canvas '${canvasId}' não encontrado.`);
        return;
    }
    const ctx = canvas.getContext('2d');

    if (charts[canvasId]) {
        charts[canvasId].destroy();
    }

    const labels = categoryData.map(item => item.name.charAt(0).toUpperCase() + item.name.slice(1));
    const data = categoryData.map(item => item.value);

    const categoryColors = ['#34D399', '#F59E0B', '#60A5FA', '#A78BFA', '#F472B6', '#6B7280'];

    charts[canvasId] = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                label: 'Faturamento',
                data: data,
                backgroundColor: categoryColors,
                borderColor: '#FFFFFF',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' },
                tooltip: {
                    callbacks: {
                        label: (context) => `${context.label}: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(context.parsed)}`
                    }
                }
            }
        }
    });
}

/**
 * NOVO (Fase 2): Cria um gráfico de barras horizontais para a quantidade de produtos por categoria.
 * @param {string} canvasId O ID do elemento canvas.
 * @param {Array<object>} categoryData Um array de objetos, ex: [{name: 'fritos', value: 120}].
 */
export function createSalesByCategoryChart(canvasId, categoryData = []) {
    if (!categoryData || categoryData.length === 0) {
        const canvas = document.getElementById(canvasId);
        if (canvas && charts[canvasId]) {
            charts[canvasId].destroy();
        }
        return;
    }
    // Ordena os dados para que o gráfico fique mais legível
    const sortedData = [...categoryData].sort((a, b) => a.value - b.value);
    const labels = sortedData.map(item => item.name.charAt(0).toUpperCase() + item.name.slice(1));
    const data = sortedData.map(item => item.value);

    createOrUpdateBarChart(
        canvasId,
        labels,
        data,
        'Quantidade Vendida',
        '#8b5cf6', // Cor Roxo/Índigo
        true, // isHorizontal
        false // isCurrency
    );
}

/**
 * NOVO (Fase 2): Cria um gráfico de linhas para as vendas por hora do dia.
 * @param {string} canvasId O ID do elemento canvas.
 * @param {Array<object>} salesByHourData Um array de objetos, ex: [{hour: 9, value: 250.50}].
 */
export function createSalesOverTimeChart(canvasId, salesByHourData = []) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.warn(`Elemento canvas '${canvasId}' não encontrado.`);
        return;
    }
    const ctx = canvas.getContext('2d');

    if (charts[canvasId]) {
        charts[canvasId].destroy();
    }

    const dataMap = new Map(salesByHourData.map(item => [item.hour, item.value]));

    // Gera rótulos para todas as horas de operação (9h às 19h) para um eixo X consistente
    const labels = Array.from({ length: 11 }, (_, i) => `${i + 9}:00`);

    // Preenche os dados para cada hora, usando 0 se não houver vendas
    const data = labels.map(label => {
        const hour = parseInt(label.split(':')[0]);
        return dataMap.get(hour) || 0;
    });

    charts[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Faturamento por Hora',
                data: data,
                backgroundColor: 'rgba(245, 158, 11, 0.2)', // Cor Âmbar
                borderColor: 'rgba(245, 158, 11, 1)',
                borderWidth: 2,
                tension: 0.4,
                fill: true,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { callback: (value) => formatCurrency(value) }
                }
            },
            plugins: {
                tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${formatCurrency(context.parsed.y)}` } }
            }
        }
    });
}

/**
 * NOVO: Renderiza o gráfico de crescimento de novos clientes nos últimos 6 meses.
 * @param {string} canvasId O ID do elemento canvas.
 * @param {object} data - Objeto contendo { labels: [...], data: [...] }
 */
export function createClientGrowthChart(canvasId, data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.warn(`Elemento canvas '${canvasId}' não encontrado.`);
        return;
    }
    const ctx = canvas.getContext('2d');

    if (charts[canvasId]) {
        charts[canvasId].destroy();
    }

    charts[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.labels, // ex: ['Jan', 'Fev', 'Mar']
            datasets: [{
                label: 'Novos Clientes',
                data: data.data, // ex: [10, 15, 8]
                backgroundColor: 'rgba(34, 197, 94, 0.2)', // Verde
                borderColor: 'rgba(34, 197, 94, 1)',
                borderWidth: 2,
                tension: 0.4,
                fill: true,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1, // Garante que o eixo Y mostre apenas números inteiros
                        precision: 0
                    }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

/**
 * NOVO: Renderiza o gráfico de pizza para a segmentação de clientes por ranking.
 * @param {string} canvasId O ID do elemento canvas.
 * @param {object} data - Objeto contendo { labels: [...], data: [...], colors: [...] }
 */
export function createClientSegmentationChart(canvasId, data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.warn(`Elemento canvas '${canvasId}' não encontrado.`);
        return;
    }
    const ctx = canvas.getContext('2d');

    if (charts[canvasId]) {
        charts[canvasId].destroy();
    }

    charts[canvasId] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: data.labels,
            datasets: [{
                data: data.data,
                backgroundColor: data.colors,
                borderColor: '#FFFFFF',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right' },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                            return `${label}: ${value} (${percentage}%)`;
                        }
                    }
                }
            },
            cutout: '60%'
        }
    });
}

/**
 * NOVO: Renderiza o gráfico de pizza para a análise de produtos.
 * @param {string} canvasId O ID do elemento canvas.
 * @param {object} categoryTotals - Objeto com os totais por categoria (fritos, assados, revenda).
 */
export function createProductAnalysisPieChart(canvasId, categoryTotals) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.warn(`Elemento canvas '${canvasId}' não encontrado.`);
        return;
    }
    const ctx = canvas.getContext('2d');

    if (charts[canvasId]) {
        charts[canvasId].destroy();
    }

    const labels = ['Fritos', 'Assados', 'Revenda'];
    const data = [
        categoryTotals.fritos || 0,
        categoryTotals.assados || 0,
        categoryTotals.revenda || 0
    ];

    const colors = [
        '#F59E0B', // Laranja para Fritos
        '#10B981', // Verde para Assados
        '#6366F1'  // Indigo para Revenda
    ];

    charts[canvasId] = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                label: 'Quantidade Vendida',
                data: data,
                backgroundColor: colors,
                borderColor: '#FFFFFF',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                            return `${label}: ${value} unid. (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}
