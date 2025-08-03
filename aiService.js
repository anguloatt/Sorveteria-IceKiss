// Meu serviço para interagir com a API do Gemini.

// IMPORTANTE: Minha chave de API está exposta no lado do cliente. Sei que esta abordagem é para desenvolvimento.
// Para produção, vou usar a Cloud Function que já preparei.
import { formatCurrency } from './utils.js';

const API_KEY = "AIzaSyAtSuHEDNHeaJ9FTQvm-9eREqIwO6iJyNQ";
const MODEL_NAME = "gemini-1.5-flash-latest";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`;

let isPdvSuggestionPending = false; // Minha flag para evitar chamadas concorrentes.
const PDV_SUGGESTION_COOLDOWN = 5000; // Cooldown de 5 segundos.
const PDV_SUGGESTION_PENALTY_BOX_COOLDOWN = 1800000; // Cooldown de 30 minutos para erro 429.

// AÇÃO CORRETIVA: Renomeei a chave do localStorage para ser mais clara.
// Ela agora armazena o timestamp de QUANDO a próxima chamada será permitida.
const LS_NEXT_CALL_ALLOWED_KEY = 'gemini_next_pdv_call_allowed_timestamp';

/**
 * Pega o timestamp de quando a próxima chamada à API será permitida.
 * Isso ajuda a sincronizar o cooldown entre múltiplas abas.
 * @returns {number} O timestamp em milissegundos.
 */
function getNextCallAllowedTimestamp() {
    return parseInt(localStorage.getItem(LS_NEXT_CALL_ALLOWED_KEY) || '0', 10);
}

/**
 * Define o timestamp de quando a próxima chamada será permitida no localStorage.
 * @param {number} timestamp - O timestamp para definir.
 */
function setNextCallAllowedTimestamp(timestamp) {
    localStorage.setItem(LS_NEXT_CALL_ALLOWED_KEY, timestamp.toString());
}

/**
 * NOVO (Fase 4): Constrói o prompt para a análise do Dashboard Gerencial.
 * @param {object} dashboardData - Os dados completos do dashboard.
 * @returns {string} O prompt formatado.
 */
function buildDashboardAnalysisPrompt(dashboardData) {
    const topProductByRevenue = dashboardData.products.length > 0 ? [...dashboardData.products].sort((a, b) => b.revenue - a.revenue)[0] : null;
    const topProductByQuantity = dashboardData.products.length > 0 ? [...dashboardData.products].sort((a, b) => b.quantity - a.quantity)[0] : null;

    return `
        Você é um analista de negócios da Ice Kiss, uma empresa de salgados.
        Sua tarefa é analisar os dados de vendas de um período e gerar um resumo executivo em português para o gerente.
        Seja direto, use bullet points (marcadores com *) e forneça insights práticos e acionáveis.
        O tom deve ser profissional, mas encorajador.

        Dados para Análise:
        - Faturamento Total: ${formatCurrency(dashboardData.totalRevenue)}
        - Lucro Bruto Total: ${formatCurrency(dashboardData.totalGrossProfit)}
        - Total de Pedidos: ${dashboardData.totalOrders}
        - Ticket Médio: ${formatCurrency(dashboardData.averageTicket)}
        - Pico de Vendas: Dia ${dashboardData.salesPeak.date} com ${formatCurrency(dashboardData.salesPeak.amount)}
        - Top Cliente: ${dashboardData.topCustomer.name} gastou ${formatCurrency(dashboardData.topCustomer.totalSpent)}
        - Produto com Maior Faturamento: ${topProductByRevenue ? `${topProductByRevenue.name} (${formatCurrency(topProductByRevenue.revenue)})` : 'N/A'}
        - Produto Mais Vendido (Quantidade): ${topProductByQuantity ? `${topProductByQuantity.name} (${topProductByQuantity.quantity} un)` : 'N/A'}
        - Faturamento por Categoria: ${JSON.stringify(dashboardData.revenueByCategory)}

        Com base nesses dados, gere um resumo com os seguintes pontos:
        1.  **Visão Geral Financeira:** Como foi o desempenho de faturamento e lucro?
        2.  **Desempenho Operacional:** O que os números de pedidos e ticket médio nos dizem?
        3.  **Destaques de Produtos:** Quais produtos se destacaram e quais precisam de atenção?
        4.  **Recomendação Estratégica:** Com base em tudo, qual é a principal recomendação para a próxima semana?
    `;
}

/**
 * NOVO (Fase 4): Gera uma análise do dashboard usando a IA Gemini.
 * @param {object} dashboardData - Os dados completos do dashboard.
 * @returns {Promise<string>} Uma promessa que resolve para o texto da análise.
 */
export async function generateDashboardAnalysis(dashboardData) {
    const prompt = buildDashboardAnalysisPrompt(dashboardData);

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        if (!response.ok) {
            const errorBody = await response.json();
            console.error("AI Service Error Body (Dashboard Analysis):", errorBody);
            throw new Error(`API_STATUS_${response.status}`);
        }

        const data = await response.json();
        // Faço uma verificação mais robusta para a resposta da IA.
        const analysisText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        // Se a resposta for nula, vazia ou contiver apenas espaços em branco, eu considero um erro.
        if (!analysisText || analysisText.trim() === "") {
            console.warn("AI Service: A resposta da API foi bem-sucedida, mas não continha texto de análise válido. Verifique os filtros de segurança no Google AI Studio ou a resposta completa da API no log:", data);
            throw new Error("A resposta da API não continha o texto da análise.");
        }
        return analysisText;
    } catch (error) {
        console.error("Erro ao chamar a API do Gemini para análise do dashboard:", error);
        throw error; // Re-lança o erro para ser tratado pela UI
    }
}

/**
 * Eu construo o prompt para a análise financeira.
 * @param {object} financialData - Os dados financeiros que a IA vai analisar.
 * @returns {string} O prompt formatado, pronto para ser enviado para a IA.
 */
function buildFinancialPrompt(financialData) {
    return `
        Você é um assistente de análise de negócios para uma pequena empresa de salgados chamada Ice Kiss.
        Analise os seguintes dados financeiros e operacionais e forneça um resumo conciso e acionável para o gerente.
        Seja direto, use bullet points (marcadores com *) e forneça insights práticos.
        O tone deve ser encorajador, mas realista.

        Dados para Análise:
        - Faturamento do Mês Atual: ${financialData.faturamentoMensal}
        - Meta de Faturamento Mensal: ${financialData.metaMensal}
        - Total Vendido Hoje: ${financialData.vendidoHoje}
        - Ticket Médio de Hoje: ${financialData.ticketMedio}
        - Total de Pedidos Hoje: ${financialData.pedidosHoje}
        - Total de Dívidas (A Receber): ${financialData.aReceber}
        - Produto Mais Vendido (Geral): ${financialData.mostSoldProduct}
        - Novos Clientes no Mês: ${financialData.novosClientes}

        Com base nesses dados, gere um resumo com os seguintes pontos:
        1.  **Saúde Financeira:** Como está o faturamento em relação à meta?
        2.  **Desempenho do Dia:** O que se destaca no dia de hoje?
        3.  **Ponto de Atenção Crítico:** Qual é o maior ponto de atenção (ex: dívidas altas)?
        4.  **Oportunidade:** Com base nos dados, sugira uma ação ou oportunidade.
    `;
}

/**
 * Minha função para gerar uma análise financeira usando a IA Gemini.
 * @param {object} financialData - Um objeto com as métricas financeiras.
 * @returns {Promise<string>} Retorno uma promessa que resolve para o texto da análise gerado pela IA.
 */
export async function generateFinancialAnalysis(financialData) {
    // Se a minha chave da API for um placeholder, eu retorno uma resposta de demonstração.
    if (API_KEY === "SUA_CHAVE_DE_API_DO_GEMINI_AQUI") {
        console.error("AI Service: A chave da API do Gemini não está configurada em public/aiService.js.");
        // Simulo uma resposta para testar o visual.
        return new Promise(resolve => {
            setTimeout(() => {
                resolve(
                    `**Análise de Demonstração (IA Desativada):**\n\n` +
                    `* **Faturamento Mensal:** Atingiu ${financialData.faturamentoMensal}. Bom progresso em direção à meta de ${financialData.metaMensal}.\n` +
                    `* **Vendas Diárias:** O dia de hoje, com ${financialData.vendidoHoje}, parece promissor.\n` +
                    `* **Contas a Receber:** O valor de ${financialData.aReceber} em aberto requer atenção. Priorize o contato com clientes devedores.\n\n` +
                    `*Observação: Configure a chave da API do Gemini em aiService.js para obter análises reais.*`
                );
            }, 1000); // Simulo um delay da API.
        });
    }

    const prompt = buildFinancialPrompt(financialData);

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        if (!response.ok) {
            // Tento extrair mais detalhes do corpo do erro para o console.
            try {
                const errorBody = await response.json();
                console.error("AI Service Error Body:", errorBody);
            } catch (e) {
                // Ignoro se o corpo do erro não for JSON.
            }
            // Lanço um erro com o status para ser tratado pelo bloco catch.
            throw new Error(`API_STATUS_${response.status}`);
        }

        const data = await response.json();
        // Adiciono "optional chaining" (?.) para evitar erros se a resposta vier malformada.
        const analysisText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!analysisText) {
            console.error("Resposta da API inesperada:", data);
            throw new Error("A resposta da API não continha o texto da análise.");
        }

        return analysisText;

    } catch (error) {
        console.error("Erro ao chamar a API do Gemini para análise financeira:", error);
        // Retorno uma string vazia em caso de erro para evitar exibir "Sugestão Indisponível"
        // e manter a interface limpa no meu ambiente de desenvolvimento.
        return "";
    }
}

/**
 * Minha função auxiliar para atrasar a execução.
 * @param {number} ms - Milissegundos que vou esperar.
 * @returns {Promise<void>} Retorno uma promessa que resolve após o atraso.
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * NOVO: Minha função para gerar uma sugestão de IA para o atendente do PDV.
 * Agora ela não faz retries internas para 429, mas aplica um cooldown longo.
 * @param {string} prompt O prompt detalhado que envio para a IA, incluindo o contexto do cliente/pedido.
 * @returns {Promise<string|null>} Retorno uma promessa que resolve para o texto da sugestão, ou null em caso de falha.
 */
export async function generatePdvSuggestion(prompt) {
    const now = Date.now();
    const nextCallAllowed = getNextCallAllowedTimestamp();

    // Se uma sugestão já estiver sendo gerada, ignora esta nova chamada.
    if (isPdvSuggestionPending) {
        console.log("AI Service: Chamada para sugestão do PDV ignorada, uma requisição já está em andamento.");
        return null;
    }

    // AÇÃO CORRETIVA: Lógica de cooldown simplificada e mais clara.
    // Se o tempo atual for ANTES do tempo permitido para a próxima chamada, bloqueia.
    if (now < nextCallAllowed) {
        const remainingCooldown = Math.ceil((nextCallAllowed - now) / 1000);
        console.log(`AI Service: Chamada para sugestão do PDV ignorada devido ao cooldown. Tente novamente em ${remainingCooldown} segundos.`);
        return null;
    }

    // Se a minha chave da API for um placeholder, eu retorno uma resposta de demonstração.
    if (API_KEY === "SUA_CHAVE_DE_API_DO_GEMINI_AQUI") {
        console.error("AI Service: A chave da API do Gemini não está configurada em public/aiService.js.");
        return new Promise(resolve => {
            setTimeout(() => {
                resolve(
                    `*Sugestão de Demonstração (IA Desativada):*\n\n` +
                    `Olá! Parece que você está em um novo pedido. Que tal oferecer um de nossos salgados mais populares hoje?`
                );
            }, 500);
        });
    }

    // Define o cooldown normal de 5 segundos para a próxima chamada.
    setNextCallAllowedTimestamp(now + PDV_SUGGESTION_COOLDOWN);
    isPdvSuggestionPending = true;

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        if (!response.ok) {
            // NOVO: Minha lógica de "Penalty Box" para o erro 429 (Too Many Requests).
            if (response.status === 429) {
                const penaltyEndTime = now + PDV_SUGGESTION_PENALTY_BOX_COOLDOWN;
                setNextCallAllowedTimestamp(penaltyEndTime); // Sobrescreve o cooldown normal com a penalidade.
                console.warn(`AI Service: Rate limit (429) atingido. Bloqueando sugestões por ${PDV_SUGGESTION_PENALTY_BOX_COOLDOWN / 1000 / 60} minutos.`);
            }

            try {
                const errorBody = await response.json();
                console.error("AI Service Error Body (PDV Suggestion):", errorBody);
            } catch (e) { /* ignore */ }
            // Lanço um erro para ser pego pela camada da UI (pdv.js).
            throw new Error(`Falha na API com status ${response.status}`);
        }

        const data = await response.json();
        const suggestionText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!suggestionText) {
            console.error("Resposta da API inesperada (PDV Suggestion):", data);
            throw new Error("A resposta da API não continha o texto da sugestão.");
        }

        return suggestionText;

    } catch (error) {
        console.error("Erro ao chamar a API do Gemini para sugestão do PDV (ignorado em dev):", error);
        // Retorno null para que a UI possa ignorar a falha silenciosamente,
        // evitando a mensagem "Sugestão indisponível" no meu ambiente de desenvolvimento.
        return null;
    } finally {
        // Garanto que a flag seja resetada, mesmo que ocorra um erro.
        isPdvSuggestionPending = false;
    }
}
