# ⚡ Configuração Rápida - Sincronização de Pedidos Online

## 🚀 Passo a Passo

### 1️⃣ Verifique as configurações do Firebase

Abra `firebase-config.js` e confirme que existem **DUAS** configurações:

```javascript
// PDV Principal
const firebaseConfig = { 
    projectId: "sorveteria-ice-kiss",
    // ... outras configs
};

// IceKiss Online  
const firebaseConfigIceKiss = {
    projectId: "icekiss-online",  // ← Nome do projeto online
    // ... outras configs
};
```

### 2️⃣ Configure o banco de dados IceKiss Online

No Firebase Console do projeto **icekiss-online**:

**Firestore Database → Regras:**
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Permitir leitura da coleção pedidosOnline
    match /pedidosOnline/{pedidoId} {
      allow read: if true;  // PDV precisa ler
      allow write: if true; // Cliente mobile precisa criar
    }
  }
}
```

### 3️⃣ Estrutura esperada dos pedidos online

O PDV espera pedidos no seguinte formato na coleção `pedidosOnline`:

```javascript
{
  status: "pendente",
  cliente: {
    nome: "João Silva",
    whatsapp: "11987654321"
  },
  itens: [
    {
      id: "produto_1",
      nome: "Coxinha Frita",
      preco: 2.50,
      quantidade: 10
    }
  ],
  total: 25.00,
  formaPagamento: "PIX",
  pagamento: {
    tipo: "sinal",          // ou "total"
    valorSinal: 10.00,      // se tipo for "sinal"
    sinalViaPix: "sim"      // se pagou sinal por PIX
  },
  retirada: {
    data: "2025-10-22",     // formato YYYY-MM-DD
    hora: "14:00"           // formato HH:MM
  },
  observacoes: "Sem cebola",
  numeroProvisorio: "PEND-251022-1430-5678",
  dataCriacao: Timestamp,   // Firebase Timestamp
  sincronizadoPDV: false    // Será true após sincronizar
}
```

### 4️⃣ Teste a sincronização

1. **Abra o PDV** no navegador
2. **Abra o Console** (F12)
3. **Procure a mensagem:**
   ```
   ✅ Sincronização de pedidos online iniciada com sucesso!
   ```

4. **Crie um pedido de teste no sistema mobile**

5. **Aguarde a notificação no PDV:**
   - 🔔 Som de notificação
   - 💬 Toast: "Novo pedido online recebido! Cliente: [nome]"
   - ✅ Toast: "Pedido #[num] registrado automaticamente!"

### 5️⃣ Ajustes Finos

Edite `sync-pedidos-online.js` se necessário:

```javascript
const CONFIG = {
    enabled: true,              // ← Ligar/desligar
    autoRegister: true,         // ← true = automático, false = manual
    soundNotification: true,    // ← Som ao receber pedido
    visualNotification: true,   // ← Notificação visual
    debugMode: false           // ← true = logs detalhados
};
```

## 🔍 Verificação

### ✅ Checklist de Funcionamento:

- [ ] PDV abre sem erros
- [ ] Mensagem de sincronização iniciada aparece no console
- [ ] Pedido online criado
- [ ] Som de notificação tocou
- [ ] Toast "Novo pedido online recebido" apareceu
- [ ] Toast "Pedido #XXXX registrado automaticamente" apareceu
- [ ] Pedido aparece no sistema PDV com número oficial
- [ ] Campo no Firebase `sincronizadoPDV` mudou para `true`

### ❌ Troubleshooting:

**Problema:** Sincronização não inicia
- Verifique se `dbIceKiss` está exportado no `firebase-config.js`
- Veja se há erros no console do navegador
- Confirme que `sync-pedidos-online.js` está sendo importado

**Problema:** Pedidos não são detectados
- Verifique as regras do Firestore (precisa permitir leitura)
- Confirme que o `projectId` está correto
- Veja se os pedidos têm `status: "pendente"`

**Problema:** Erro ao registrar no PDV
- Verifique se a estrutura do pedido está correta
- Veja se os produtos existem no PDV
- Confirme que `firebaseService.js` tem a função `saveOrder`

**Problema:** Pedido duplicado
- Sistema já previne isso! Verifica ID e flag `sincronizadoPDV`
- Se acontecer, ative `debugMode: true` e analise logs

## 🎯 Comandos Úteis (Console do Navegador)

```javascript
// Importar módulo
const sync = await import('./sync-pedidos-online.js');

// Ver configuração atual
sync.syncConfig;

// Ver status
sync.statusSincronizacao();

// Mudar configurações em tempo real
sync.configurarSincronizacao({ 
    autoRegister: false,  // Agora só notifica, não registra
    debugMode: true       // Ativa logs detalhados
});

// Pausar
sync.pararSincronizacaoPedidosOnline();

// Retomar
sync.iniciarSincronizacaoPedidosOnline();
```

## 📞 Suporte

Se tiver dúvidas ou problemas:
1. Ative `debugMode: true`
2. Anote os erros do console
3. Verifique a estrutura dos pedidos no Firebase
4. Consulte o `GUIA_SINCRONIZACAO_PEDIDOS_ONLINE.md` completo

---

**Pronto para receber pedidos online automaticamente! 🚀**
