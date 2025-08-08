// Mocka as dependências que o módulo 'utils.js' importa, mas que não são necessárias para este teste.
jest.mock('../domRefs.js', () => ({
  dom: {}, // Fornece um objeto 'dom' vazio para evitar erros.
}));

jest.mock('../app.js', () => ({
  // Fornece valores padrão para as variáveis importadas de 'app.js'.
  managerCredentials: {},
  masterCredentials: {},
  productsConfig: {},
  storeSettings: {},
  currentReminderOrders: [],
}));

jest.mock('../firebaseService.js', () => ({
  checkForTomorrowDeliveries: jest.fn(),
}));

// Mocka a biblioteca date-fns que é carregada globalmente no index.html
// No ambiente de teste do Jest (Node.js), o objeto 'window' não existe por padrão.
// A biblioteca 'date-fns' é carregada globalmente no 'window' no index.html.
// Para simular isso, definimos 'window' no objeto 'global' do Node antes de usá-lo.
global.window = {};
global.window.dateFns = {
  formatDistanceToNow: jest.fn(),
  locale: { ptBR: {} }
};

// Agora, importa as funções reais que queremos testar.
import { parseCurrency, formatCurrency, roundSinal, formatDateToBR, formatDateTimeToBR, getTodayDateString, formatClientSince } from '../utils.js';

describe('utils.js - Funções Utilitárias', () => {

  describe('parseCurrency', () => {
    it('deve converter corretamente uma string com vírgula como separador decimal', () => {
      expect(parseCurrency('1.234,56')).toBe(1234.56);
    });

    it('deve converter corretamente uma string com ponto como separador decimal', () => {
      expect(parseCurrency('1234.56')).toBe(1234.56);
    });

    it('deve converter corretamente uma string com prefixo "R$" e espaços', () => {
      expect(parseCurrency('R$ 1.234,56')).toBe(1234.56);
    });

    it('deve converter corretamente uma string simples com vírgula', () => {
      expect(parseCurrency('1,50')).toBe(1.50);
    });

    it('deve converter corretamente uma string simples com ponto', () => {
      expect(parseCurrency('1.50')).toBe(1.50);
    });

    it('deve converter corretamente uma string de inteiro', () => {
      expect(parseCurrency('1500')).toBe(1500);
    });

    it('deve retornar 0 para uma string inválida ou vazia', () => {
      expect(parseCurrency('')).toBe(0);
      expect(parseCurrency(null)).toBe(0);
      expect(parseCurrency(undefined)).toBe(0);
      expect(parseCurrency('inválido')).toBe(0);
    });

    it('deve lidar com strings com múltiplos pontos (separadores de milhar)', () => {
      expect(parseCurrency('1.000.000,50')).toBe(1000000.50);
    });
  });

  describe('formatCurrency', () => {
    it('deve formatar um número para o formato de moeda brasileira', () => {
      // \xa0 é o caractere de espaço não-separável que toLocaleString usa.
      expect(formatCurrency(1234.56)).toBe('R$\xa01.234,56');
    });

    it('deve formatar um inteiro corretamente', () => {
      expect(formatCurrency(1500)).toBe('R$\xa01.500,00');
    });

    it('deve formatar zero corretamente', () => {
      expect(formatCurrency(0)).toBe('R$\xa00,00');
    });

    it('deve retornar um formato padrão para entrada inválida', () => {
      expect(formatCurrency(null)).toBe('R$\xa00,00');
      expect(formatCurrency(undefined)).toBe('R$\xa00,00');
      expect(formatCurrency('inválido')).toBe('R$\xa00,00');
    });
  });

  describe('roundSinal', () => {
    it('deve arredondar um número para duas casas decimais corretamente', () => {
      expect(roundSinal(10.125)).toBe(10.13);
      expect(roundSinal(10.124)).toBe(10.12);
    });

    it('deve lidar com problemas de ponto flutuante (ex: 0.1 + 0.2)', () => {
      expect(roundSinal(0.1 + 0.2)).toBe(0.30);
    });

    it('deve retornar 0 para entrada inválida', () => {
      expect(roundSinal('texto')).toBe(0);
      expect(roundSinal(null)).toBe(0);
      expect(roundSinal(undefined)).toBe(0);
    });
  });

  describe('Funções de Data e Hora', () => {
    // Define uma data fixa para garantir que os testes sejam consistentes
    const fixedDate = new Date('2024-07-29T15:30:00Z'); // Usando UTC para consistência

    it('formatDateToBR deve formatar um objeto Date para DD/MM/YYYY', () => {
      // O resultado pode variar com o fuso horário, então testamos o formato.
      // new Date() no Node.js usa o fuso do sistema. Vamos criar a data com partes para ser mais robusto.
      const date = new Date(2024, 6, 29); // Mês é 0-indexed, então 6 é Julho.
      expect(formatDateToBR(date)).toBe('29/07/2024');
    });

    it('formatDateTimeToBR deve formatar um objeto Date para DD/MM/YYYY HH:MM', () => {
      const date = new Date(2024, 6, 29, 14, 45); // 29/07/2024 14:45
      expect(formatDateTimeToBR(date)).toBe('29/07/2024 14:45');
    });

    it('getTodayDateString deve retornar a data atual no formato YYYY-MM-DD', () => {
      // Usa timers falsos do Jest para controlar a data "atual"
      // CORREÇÃO: new Date('YYYY-MM-DD') cria a data à meia-noite UTC. Em fusos horários como o do Brasil (UTC-3),
      // isso se torna 21:00 do dia anterior. Usar uma string completa com horário como T12:00:00Z garante que
      // a data não mude por causa do fuso horário do ambiente de teste.
      jest.useFakeTimers().setSystemTime(new Date('2024-07-29T12:00:00Z'));
      expect(getTodayDateString()).toBe('2024-07-29');
      jest.useRealTimers(); // Restaura os timers reais
    });
  });

  describe('formatClientSince', () => {
    const MOCK_DATE = new Date('2024-07-29T12:00:00Z');
    beforeEach(() => {
      // Limpa os mocks antes de cada teste
      window.dateFns.formatDistanceToNow.mockClear();
      jest.useFakeTimers().setSystemTime(MOCK_DATE);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('deve retornar "Hoje" se a data do primeiro pedido for hoje', () => {
      const today = new Date();
      expect(formatClientSince(today)).toBe('Hoje');
    });

    it('deve chamar date-fns para calcular a distância de tempo', () => {
      const pastDate = new Date('2024-04-29');
      window.dateFns.formatDistanceToNow.mockReturnValue('há 3 meses');

      const result = formatClientSince(pastDate);

      expect(window.dateFns.formatDistanceToNow).toHaveBeenCalledWith(pastDate, {
        addSuffix: true,
        locale: window.dateFns.locale.ptBR,
      });
      expect(result).toBe('há 3 meses');
    });

    it('deve retornar "--" para uma data inválida', () => {
      expect(formatClientSince(null)).toBe('--');
      expect(formatClientSince(new Date('invalid-date'))).toBe('--');
    });
  });

});