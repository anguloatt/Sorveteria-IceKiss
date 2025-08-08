// Mocka as dependências locais para isolar o teste.
// Mocka as dependências problemáticas que são importadas indiretamente através de 'utils.js'.
// Isso evita o erro "document is not defined" e quebra a dependência circular com 'app.js'.
jest.mock('domRefs.js', () => ({
  dom: {}, // Fornece um objeto 'dom' vazio para evitar erros.
}));

jest.mock('app.js', () => ({
  // Fornece valores padrão para as variáveis importadas de 'app.js'.
  managerCredentials: {},
  masterCredentials: {},
  productsConfig: {},
  storeSettings: {},
  currentReminderOrders: [],
}));

import { _standardizeOrderData } from 'firebaseService.js';

describe('firebaseService Data Standardization', () => {

  describe('_standardizeOrderData', () => {

    it('should convert string numbers to Number and Timestamps to Date', () => {
      // 1. Mock (Simulação) de dados "sujos" como viriam do Firestore
      const mockFirestoreDoc = {
        id: 'order123',
        data: () => ({
          orderNumber: "1050",
          total: "250.75",
          sinal: "100",
          restante: "150.75",
          createdAt: { 
            toDate: () => new Date('2024-01-10T15:00:00Z') 
          },
          items: [
            { name: 'Coxinha', quantity: "50", subtotal: "35.00" },
            { name: 'Bolinha de Queijo', quantity: 50, subtotal: 35 }
          ]
        })
      };

      // 2. Executa a função que está sendo testada
      const result = _standardizeOrderData(mockFirestoreDoc);

      // 3. Assert (Verificação) - Garante que a saída está correta
      // Verifica se os valores foram convertidos para Number
      expect(result.total).toBe(250.75);
      expect(typeof result.total).toBe('number');
      
      expect(result.sinal).toBe(100);
      expect(typeof result.sinal).toBe('number');

      expect(result.orderNumber).toBe(1050);
      expect(typeof result.orderNumber).toBe('number');

      // Verifica se o Timestamp foi convertido para um objeto Date
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.createdAt.getFullYear()).toBe(2024);

      // Verifica se a conversão também funciona em objetos aninhados (items)
      expect(result.items[0].quantity).toBe(50);
      expect(typeof result.items[0].quantity).toBe('number');
      expect(result.items[0].subtotal).toBe(35.00);
      expect(typeof result.items[0].subtotal).toBe('number');
    });

  });

});