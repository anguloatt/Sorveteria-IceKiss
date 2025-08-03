// charts.js - Funções para criação e atualização de gráficos

import { charts, productsConfig, storeSettings } from './app.js'; // Importa variáveis globais do app.js
import { formatCurrency, getProductInfoById } from './utils.js'; // Importa funções utilitárias

// Importações do Chart.js (assumindo que já estão carregadas no index.html globalmente)
// import Chart from 'chart.js/auto'; // Não é necessário importar aqui se já está no HTML globalmente

/**
 * Cria ou atualiza um gráfico de pizza (doughnut).
 * @param {string} canvasId O ID do elemento canvas.
 * @param {Array<number>} data Os valores para o gráfico.
 * @param {Array<string>} labels Os rótulos para cada fatia do gráfico.
 * @param {Array<string>} colors As cores para cada fatia do gráfico.
 */
export function createOrUpdatePieChart(canvasId, data, labels, colors) {
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return; // Retorna se o canvas não for encontrado

    // Se o gráfico já existe, atualiza seus dados
    if (charts[canvasId]) {
        charts[canvasId].data.labels = labels;
        charts[canvasId].data.datasets[0].data = data;
        charts[canvasId].data.datasets[0].backgroundColor = colors;
        charts[canvasId].update(); // Atualiza o gráfico
    } else {
        // Se o gráfico não existe, cria um novo
        charts[canvasId] = new Chart(ctx, {
            type: 'doughnut', // Tipo de gráfico de pizza
            data: {
                labels, // Rótulos
                datasets: [{
                    data, // Dados
                    backgroundColor: colors, // Cores de fundo
                    borderWidth: 0 // Largura da borda
                }]
            },
            options: {
                responsive: true, // Torna o gráfico responsivo
                maintainAspectRatio: false, // Não mantém a proporção original do canvas
                plugins: {
                    legend: { display: false } // Esconde a legenda
                },
                cutout: '60%' // Tamanho do furo central para gráfico de anel
            }
        });
    }
}

/**
 * Renderiza o gráfico principal de vendas da semana (linha).
 * @param {Object} vendasSemana Objeto contendo as vendas por dia da semana.
 */
export async function renderMainSalesChart(vendasSemana) {
    const labels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']; // Rótulos para os dias da semana
    const data = labels.map(day => vendasSemana[day] || 0); // Mapeia os dados de vendas para os rótulos

    const hasSalesData = data.some(value => value > 0); // Verifica se há dados de vendas
    const canvasElement = document.getElementById('salesChart'); // Obtém o elemento canvas

    // Se não houver dados de vendas, destrói o gráfico existente e exibe uma mensagem
    if (!hasSalesData) {
        if (canvasElement && canvasElement.parentNode) {
            if (charts['salesChart']) {
                charts['salesChart'].destroy(); // Destrói a instância do gráfico
                delete charts['salesChart']; // Remove a referência
            }
            // Exibe uma mensagem informando que não há dados
            canvasElement.parentNode.innerHTML = '<p class="text-center text-gray-500">Nenhum dado de vendas para esta semana.</p>';
        }
        return;
    }

    // Se houver dados, cria ou atualiza o gráfico de linha
    if (canvasElement) {
        createOrUpdateLineChart('salesChart', labels, data, 'Vendas (R$)');
    } else {
        console.error("Canvas 'salesChart' não encontrado para renderizar o gráfico.");
    }
}

/**
 * Cria ou atualiza um gráfico de linha.
 * @param {string} canvasId O ID do elemento canvas.
 * @param {Array<string>} labels Os rótulos do eixo X.
 * @param {Array<number>} data Os valores do eixo Y.
 * @param {string} label O rótulo da série de dados.
 * @param {Object} [pointColors={}] Um objeto mapeando rótulos a cores de ponto específicas.
 */
export function createOrUpdateLineChart(canvasId, labels, data, label, pointColors = {}) {
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return;

    // Se o gráfico já existe, destrói-o para recriar (evita problemas de atualização complexa de linha)
    if (charts[canvasId]) charts[canvasId].destroy();

    // Define as cores dos pontos com base em `pointColors` ou uma cor padrão
    const pointBackgroundColor = labels.map(l => pointColors[l] || '#3b82f6');

    // Cria uma nova instância do gráfico de linha
    charts[canvasId] = new Chart(ctx, {
        type: 'line', // Tipo de gráfico de linha
        data: {
            labels, // Rótulos do eixo X
            datasets: [{
                label, // Rótulo da série
                data, // Dados da série
                borderColor: '#3b82f6', // Cor da linha
                tension: 0.4, // Curvatura da linha
                fill: true, // Preenche a área abaixo da linha
                backgroundColor: 'rgba(59, 130, 246, 0.1)', // Cor de fundo da área preenchida
                pointBackgroundColor: pointBackgroundColor, // Cores dos pontos
                pointRadius: 5, // Raio dos pontos
                pointHoverRadius: 7 // Raio dos pontos no hover
            }]
        },
        options: {
            responsive: true, // Torna o gráfico responsivo
            maintainAspectRatio: false, // Não mantém a proporção original do canvas
            scales: {
                y: {
                    beginAtZero: true, // Começa o eixo Y do zero
                    ticks: {
                        // Formata os rótulos do eixo Y como moeda
                        callback: function(value) { return formatCurrency(value); }
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        // Formata o tooltip para exibir o faturamento como moeda
                        label: function(context) {
                            return `Faturamento: ${formatCurrency(context.raw)}`;
                        }
                    }
                }
            }
        }
    });
}

/**
 * Cria ou atualiza um gráfico de barras.
 * @param {string} canvasId O ID do elemento canvas.
 * @param {Array<string>} labels Os rótulos do eixo.
 * @param {Array<number>} data Os valores do eixo.
 * @param {string} label O rótulo da série de dados.
 * @param {boolean} [isHorizontal=false] Define se o gráfico é horizontal.
 */
export function createOrUpdateBarChart(canvasId, labels, data, label, isHorizontal = false) {
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return;

    // Se o gráfico já existe, destrói-o para recriar
    if (charts[canvasId]) charts[canvasId].destroy();

    // Cria uma nova instância do gráfico de barras
    charts[canvasId] = new Chart(ctx, {
        type: 'bar', // Tipo de gráfico de barras
        data: {
            labels, // Rótulos
            datasets: [{
                label, // Rótulo da série
                data, // Dados
                backgroundColor: '#8b5cf6', // Cor de fundo das barras
                borderColor: '#7c3aed', // Cor da borda das barras
                borderWidth: 1, // Largura da borda
                borderRadius: 5 // Arredondamento das bordas das barras
            }]
        },
        options: {
            indexAxis: isHorizontal ? 'y' : 'x', // Define o eixo principal (horizontal ou vertical)
            responsive: true, // Torna o gráfico responsivo
            maintainAspectRatio: false, // Não mantém a proporção original do canvas
            scales: {
                x: {
                    beginAtZero: true, // Começa o eixo X do zero
                    ticks: {
                        // Formata os rótulos do eixo X (como moeda se for horizontal)
                        callback: function(value) {
                            return isHorizontal ? formatCurrency(value) : value;
                        }
                    }
                },
                y: {
                    beginAtZero: true, // Começa o eixo Y do zero
                    ticks: {
                        // Trunca rótulos longos no eixo Y
                        callback: function(value, index) {
                            const label = this.getLabelForValue(value);
                            return label.length > 20 ? label.substring(0, 20) + '...' : label;
                        }
                    }
                }
            },
            plugins: {
                legend: { display: false }, // Esconde a legenda
                tooltip: {
                    callbacks: {
                        // Formata o tooltip para exibir o valor como moeda
                        label: function(context) {
                            return formatCurrency(context.raw);
                        }
                    }
                }
            }
        }
    });
}

/**
 * Cria ou atualiza um gráfico de linha para a margem de lucro.
 * @param {string} canvasId O ID do elemento canvas.
 * @param {Array<string>} labels Os rótulos do eixo X (datas).
 * @param {Array<number>} data Os valores da margem de lucro (em porcentagem).
 * @param {string} label O rótulo da série de dados.
 */
export function createOrUpdateProfitMarginChart(canvasId, labels, data, label) {
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return;

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
                borderColor: '#10b981', // Emerald-500
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                fill: true,
                tension: 0.1,
                pointBackgroundColor: '#10b981',
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return value + '%'; // Adiciona o símbolo de porcentagem
                        }
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Margem: ${context.raw.toFixed(2)}%`;
                        }
                    }
                }
            }
        }
    });
}
