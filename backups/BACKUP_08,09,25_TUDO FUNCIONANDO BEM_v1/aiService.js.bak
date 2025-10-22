import { formatCurrency } from './utils.js';

const API_KEY = "AIzaSyAPhs7wfwXLso7Yd525Cz7cj0j8H6yrYw0";
const MODEL_NAME = "gemini-1.5-flash-latest";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`;

let isPdvSuggestionPending = false; // Minha flag para evitar chamadas concorrentes.
const PDV_SUGGESTION_COOLDOWN = 5000; // Cooldown de 5 segundos.
const PDV_SUGGESTION_PENALTY_BOX_COOLDOWN = 1800000; // Cooldown de 30 minutos para erro 429.

const LS_NEXT_CALL_ALLOWED_KEY = 'gemini_next_pdv_call_allowed_timestamp';

function getNextCallAllowedTimestamp() {
    return parseInt(localStorage.getItem(LS_NEXT_CALL_ALLOWED_KEY) || '0', 10);
}

function setNextCallAllowedTimestamp(timestamp) {
    localStorage.setItem(LS_NEXT_CALL_ALLOWED_KEY, timestamp.toString());
}

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

export async function generateDashboardAnalysis(dashboardData) {
    const prompt = buildDashboardAnalysisPrompt(dashboardData);

try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

if (!response.ok) {
            let errorText;
            try {
                errorText = await response.text();
            } catch (e) {
                errorText = `<não foi possível ler o corpo do erro: ${e.message}>`;
            }
            console.error("AI Service Error Body (Dashboard Analysis):", errorText);

try {
                const lower = (errorText || '').toString().toLowerCase();
                if (lower.includes('api key expired') || lower.includes('api_key_expired') || lower.includes('api key invalid')) {
                    console.error('AI Service: A chave da API parece expirada ou inválida. Renove a chave no Google Cloud Console e atualize public/aiService.js.');
                    return `**Análise de Demonstração (chave de API expirada):**\n\n* **Faturamento Total:** ${formatCurrency(dashboardData.totalRevenue)}.\n* **Lucro Bruto Total:** ${formatCurrency(dashboardData.totalGrossProfit)}.\n* **Ticket Médio:** ${formatCurrency(dashboardData.averageTicket)}.\n\nObservação: a chave de API configurada no cliente está expirada. Para habilitar análises reais, gere/renove uma chave no Google Cloud Console e atualize a constante API_KEY em public/aiService.js, ou mova a chamada para uma Cloud Function segura.`;
                }
            } catch (e) {
            }

if (response.status === 400) {
                console.info('AI Service: Retornou 400, tentando fallback para text-bison-001:generateText');
                try {
                    const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/text-bison-001:generateText?key=${API_KEY}`;
                    const fbResp = await fetch(fallbackUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ prompt: { text: prompt } })
                    });
                    if (fbResp.ok) {
                        const fbData = await fbResp.json();
                        const fbText = fbData?.candidates?.[0]?.output || fbData?.output?.[0]?.content || fbData?.content?.[0]?.text || null;
                        if (fbText) return fbText;
                    } else {
                        let fbErr = '<no body>';
                        try { fbErr = await fbResp.text(); } catch (e) {}
                        console.warn('AI Service fallback também falhou:', fbResp.status, fbErr);
                    }
                } catch (fbErr) {
                    console.warn('AI Service: Erro no fallback para text-bison:', fbErr);
                }
            }

throw new Error(`API_STATUS_${response.status}`);
        }

const data = await response.json();
        const analysisText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
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

export async function generateFinancialAnalysis(financialData) {
    if (API_KEY === "SUA_CHAVE_DE_API_DO_GEMINI_AQUI") {
        console.error("AI Service: A chave da API do Gemini não está configurada em public/aiService.js.");
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
            try {
                const errorBody = await response.json();
                console.error("AI Service Error Body:", errorBody);
            } catch (e) {
            }
            throw new Error(`API_STATUS_${response.status}`);
        }

const data = await response.json();
        const analysisText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

if (!analysisText) {
            console.error("Resposta da API inesperada:", data);
            throw new Error("A resposta da API não continha o texto da análise.");
        }

return analysisText;

} catch (error) {
        console.error("Erro ao chamar a API do Gemini para análise financeira:", error);
        return "";
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function generatePdvSuggestion(prompt) {
    const now = Date.now();
    const nextCallAllowed = getNextCallAllowedTimestamp();

if (isPdvSuggestionPending) {
        console.log("AI Service: Chamada para sugestão do PDV ignorada, uma requisição já está em andamento.");
        return null;
    }

if (now < nextCallAllowed) {
        const remainingCooldown = Math.ceil((nextCallAllowed - now) / 1000);
        console.log(`AI Service: Chamada para sugestão do PDV ignorada devido ao cooldown. Tente novamente em ${remainingCooldown} segundos.`);
        return null;
    }

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
            if (response.status === 429) {
                const penaltyEndTime = now + PDV_SUGGESTION_PENALTY_BOX_COOLDOWN;
                setNextCallAllowedTimestamp(penaltyEndTime); // Sobrescreve o cooldown normal com a penalidade.
                console.warn(`AI Service: Rate limit (429) atingido. Bloqueando sugestões por ${PDV_SUGGESTION_PENALTY_BOX_COOLDOWN / 1000 / 60} minutos.`);
            }

try {
                const errorBody = await response.json();
                console.error("AI Service Error Body (PDV Suggestion):", errorBody);
            } catch (e) {  }
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
        return null;
    } finally {
        isPdvSuggestionPending = false;
    }
}

