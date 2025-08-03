const functions = require("firebase-functions");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// É uma boa prática armazenar a chave de API em variáveis de ambiente.
// Para configurar, execute no seu terminal:
// firebase functions:config:set gemini.key="SUA_CHAVE_DE_API_AQUI"
const API_KEY = functions.config().gemini.key;

// Validação de segurança: Garante que a chave da API foi configurada.
if (!API_KEY) {
  console.error("A CHAVE DA API DO GEMINI NÃO ESTÁ CONFIGURADA!");
  console.error("Execute o comando: firebase functions:config:set gemini.key=\"SUA_CHAVE_AQUI\"");
  throw new Error("Configuração da API do Gemini ausente. A função não pode ser inicializada.");
}

// Inicializa o cliente da IA
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

exports.getFinancialAnalysis = functions.https.onCall(async (data, context) => {
  // Verificação de segurança: garante que apenas usuários logados possam chamar a função.
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "A função deve ser chamada por um usuário autenticado."
    );
  }

  const financialData = data; // Os dados financeiros passados pelo seu app

  const prompt = `
        Você é um assistente de análise de negócios para uma pequena empresa de salgados chamada Ice Kiss.
        Analise os seguintes dados financeiros e operacionais e forneça um resumo conciso e acionável para o gerente.
        Seja direto, use bullet points (marcadores com *) e forneça insights práticos.
        O tom deve ser encorajador, mas realista.

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

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const analysisText = response.text();
    
    return { analysisText }; // Retorna o resultado para o seu app

  } catch (error) {
    console.error("Erro ao chamar a API do Gemini:", error);
    throw new functions.https.HttpsError(
      "internal",
      "Falha ao gerar a análise da IA."
    );
  }
});