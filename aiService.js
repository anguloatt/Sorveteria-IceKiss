// aiService.js - Serviço para interação com a API do Gemini

// --- Configuração ---
// IMPORTANTE: A chave de API está exposta no lado do cliente. Esta abordagem é para desenvolvimento.
// Para produção, o ideal é usar a Cloud Function que já preparamos.
const API_KEY = "AIzaSyAtSuHEDNHeaJ9FTQvm-9eREqIwO6iJyNQ";
const MODEL_NAME = "gemini-1.5-flash-latest";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`;

// --- Controle de Rate Limit (Cooldown) ---
let isPdvSuggestionPending = false; // Flag para evitar chamadas concorrentes.
let lastPdvSuggestionTimestamp = 0;
const PDV_SUGGESTION_COOLDOWN = 30000; // Cooldown padrão de 30 segundos.
// NOVO: Cooldown de 30 minutos se o erro 429 (Too Many Requests) ocorrer.
const PDV_SUGGESTION_PENALTY_BOX_COOLDOWN = 1800000; // 30 minutos em milissegundos

/**
 * Constrói o prompt para a análise financeira.
 * @param {object} financialData - Os dados financeiros.
 * @returns {string} O prompt formatado para a IA.
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
 * Gera uma análise financeira usando a IA Gemini.
 * @param {object} financialData - Um objeto contendo as métricas financeiras.
 * @returns {Promise<string>} Uma promessa que resolve para o texto da análise gerado pela IA.
 */
export async function generateFinancialAnalysis(financialData) {
    // Se a chave da API for um placeholder, retorna uma resposta de demonstração.
    if (API_KEY === "SUA_CHAVE_DE_API_DO_GEMINI_AQUI") {
        console.error("AI Service: A chave da API do Gemini não está configurada em public/aiService.js.");
        // Simula uma resposta para testar o visual.
        return new Promise(resolve => {
            setTimeout(() => {
                resolve(
                    `**Análise de Demonstração (IA Desativada):**\n\n` +
                    `* **Faturamento Mensal:** Atingiu ${financialData.faturamentoMensal}. Bom progresso em direção à meta de ${financialData.metaMensal}.\n` +
                    `* **Vendas Diárias:** O dia de hoje, com ${financialData.vendidoHoje}, parece promissor.\n` +
                    `* **Contas a Receber:** O valor de ${financialData.aReceber} em aberto requer atenção. Priorize o contato com clientes devedores.\n\n` +
                    `*Observação: Configure a chave da API do Gemini em aiService.js para obter análises reais.*`
                );
            }, 1000); // Simula um delay da API
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
            // Tenta extrair mais detalhes do corpo do erro para o console.
            try {
                const errorBody = await response.json();
                console.error("AI Service Error Body:", errorBody);
            } catch (e) {
                // Ignora se o corpo do erro não for JSON.
            }
            // Lança um erro com o status para ser tratado pelo bloco catch.
            throw new Error(`API_STATUS_${response.status}`);
        }

        const data = await response.json();
        // Adiciona "optional chaining" (?.) para evitar erros se a resposta vier malformada.
        const analysisText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!analysisText) {
            console.error("Resposta da API inesperada:", data);
            throw new Error("A resposta da API não continha o texto da análise.");
        }

        return analysisText;

    } catch (error) {
        console.error("Erro ao chamar a API do Gemini para análise financeira:", error);
        // Retorna uma string vazia em caso de erro para evitar exibir "Sugestão Indisponível"
        // e manter a interface limpa no ambiente de desenvolvimento.
        return "";
    }
}

/**
 * Função auxiliar para atrasar a execução.
 * @param {number} ms - Milissegundos para esperar.
 * @returns {Promise<void>} Uma promessa que resolve após o atraso.
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * NOVO: Gera uma sugestão de IA para o atendente do PDV.
 * Esta função agora não faz retries internas para 429, mas aplica um cooldown longo.
 * @param {string} prompt O prompt detalhado para a IA, incluindo contexto do cliente/pedido.
 * @returns {Promise<string|null>} Uma promessa que resolve para o texto da sugestão gerado pela IA, ou null em caso de falha.
 */
export async function generatePdvSuggestion(prompt) {
    const now = Date.now();

    // Se uma sugestão já estiver sendo gerada, ignora esta nova chamada.
    if (isPdvSuggestionPending) {
        console.log("AI Service: Chamada para sugestão do PDV ignorada, uma requisição já está em andamento.");
        return null;
    }

    // Se a última chamada foi feita há menos tempo que o cooldown, ignora.
    // Isso inclui o cooldown normal e o cooldown da "penalty box" de 429.
    if (now - lastPdvSuggestionTimestamp < PDV_SUGGESTION_COOLDOWN) {
        console.log("AI Service: Chamada para sugestão do PDV ignorada devido ao cooldown.");
        return null;
    }

    // Se a chave da API for um placeholder, retorna uma resposta de demonstração.
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

    // Define o timestamp e a flag de pendente ANTES da chamada à API para iniciar o cooldown imediatamente.
    lastPdvSuggestionTimestamp = now;
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
            // NOVO: Lógica de "Penalty Box" para erro 429 (Too Many Requests)
            if (response.status === 429) {
                console.warn(`AI Service: Rate limit (429) atingido. Bloqueando sugestões por ${PDV_SUGGESTION_PENALTY_BOX_COOLDOWN / 1000} segundos.`);
                // Aplica um cooldown muito maior para dar tempo para a API resetar.
                lastPdvSuggestionTimestamp = Date.now() + PDV_SUGGESTION_PENALTY_BOX_COOLDOWN;
            }

            try {
                const errorBody = await response.json();
                console.error("AI Service Error Body (PDV Suggestion):", errorBody);
            } catch (e) { /* ignore */ }
            // Lança um erro para ser pego pela camada de UI (pdv.js)
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
        // Retorna null para que a UI possa ignorar a falha silenciosamente,
        // evitando a mensagem "Sugestão indisponível" em ambientes de desenvolvimento.
        return null;
    } finally {
        // Garante que a flag seja resetada, mesmo que ocorra um erro.
        isPdvSuggestionPending = false;
    }
}
