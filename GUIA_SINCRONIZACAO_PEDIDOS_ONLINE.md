# 🤖 Sincronização Automática de Pedidos Online → PDV

## 📋 O que é?

Este sistema permite que **pedidos feitos pelo cliente no sistema mobile** (IceKiss Online) sejam **automaticamente registrados no PDV local**, como se fosse um "robozinho" fazendo o pedido por você!

## 🎯 Como Funciona?

### 1️⃣ Cliente faz pedido online (Mobile)
- Cliente acessa o link de pedidos mobile
- Escolhe produtos, informa dados e forma de pagamento
- Envia o pedido

### 2️⃣ PDV detecta automaticamente
- O sistema PDV monitora constantemente novos pedidos no Firebase
- Quando um pedido online chega, é detectado em **tempo real**

### 3️⃣ Registro automático no PDV
- O pedido é **convertido** do formato online para o formato do PDV
- É **registrado automaticamente** com um número de pedido oficial
- O status é marcado como "ativo"
- Uma **notificação visual e sonora** alerta o operador

### 4️⃣ Operador pode ver e processar
- O pedido aparece normalmente no sistema PDV
- Pode ser gerenciado como qualquer outro pedido
- Contém todas as informações: cliente, itens, valor, data/hora de retirada

## 🔧 Arquivos Criados/Modificados

### ✅ Novos arquivos:
- `sync-pedidos-online.js` - Módulo principal de sincronização

### ✅ Arquivos modificados:
- `firebase-config.js` - Adicionada conexão com banco IceKiss Online
- `app.js` - Inicialização do sincronizador
- `utils.js` - Função `playNotificationSound()` adicionada

## ⚙️ Configurações

Você pode ajustar o comportamento editando o objeto `CONFIG` em `sync-pedidos-online.js`:

```javascript
const CONFIG = {
    enabled: true,              // Liga/desliga a sincronização
    autoRegister: true,         // true = registra automático / false = só notifica
    soundNotification: true,    // Tocar som quando chegar pedido
    visualNotification: true,   // Mostrar notificação na tela
    debugMode: false           // Logs detalhados no console
};
```

### 📝 Exemplos de uso:

**Apenas notificar (não registrar automaticamente):**
```javascript
const CONFIG = {
    enabled: true,
    autoRegister: false,  // ← Muda aqui
    soundNotification: true,
    visualNotification: true,
    debugMode: false
};
```

**Desativar notificações sonoras:**
```javascript
const CONFIG = {
    enabled: true,
    autoRegister: true,
    soundNotification: false,  // ← Muda aqui
    visualNotification: true,
    debugMode: false
};
```

## 🎬 Fluxo Completo

```
┌─────────────────────────────────────────────────────────┐
│  CLIENTE MOBILE                                         │
│  ↓ Faz pedido online                                    │
└─────────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────────┐
│  FIREBASE (IceKiss Online)                              │
│  • Pedido salvo na coleção "pedidosOnline"              │
│  • Status: "pendente"                                   │
└─────────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────────┐
│  PDV - SINCRONIZADOR                                    │
│  🔍 Detecta novo pedido em tempo real                   │
│  🔄 Converte formato online → formato PDV               │
│  ✅ Registra pedido no banco PDV                        │
│  🔔 Notifica operador (visual + som)                    │
│  ✓ Marca pedido como "sincronizadoPDV: true"           │
└─────────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────────┐
│  OPERADOR PDV                                           │
│  • Vê notificação: "Novo pedido online recebido!"      │
│  • Pedido aparece no sistema com número oficial        │
│  • Pode gerenciar normalmente                          │
└─────────────────────────────────────────────────────────┘
```

## 🛡️ Proteções Implementadas

### ✅ Evita duplicatas
- Mantém lista de pedidos já processados
- Verifica se pedido já tem flag `sincronizadoPDV: true`
- Usa ID único do pedido para controle

### ✅ Validação de dados
- Verifica se pedido tem dados mínimos necessários
- Valida cliente, itens e valores
- Trata erros sem travar o sistema

### ✅ Rastreabilidade
- Marca origem como "online" no pedido PDV
- Guarda ID do pedido online original
- Registra no log de atividades
- Adiciona observações identificando o pedido

## 📊 Dados Sincronizados

O que é copiado do pedido online para o PDV:

| Campo Online | → | Campo PDV |
|-------------|---|-----------|
| `cliente.nome` | → | `clientName` |
| `cliente.whatsapp` | → | `clientPhone` |
| `itens[]` | → | `items[]` |
| `total` | → | `totalAmount` |
| `pagamento.valorSinal` | → | `sinalPago` |
| `formaPagamento` | → | `paymentMethod` |
| `retirada.data` | → | `deliveryDate` |
| `retirada.hora` | → | `deliveryTime` |
| `observacoes` | → | `observations` |

**Campos adicionais criados no PDV:**
- `origin: 'online'` - Identifica origem do pedido
- `onlineOrderId` - ID do pedido online original
- `numeroProvisorio` - Número provisório que o cliente recebeu
- `createdBy: 'SYNC_AUTO'` - Identifica criação automática
- `status: 'ativo'` - Status inicial do pedido

## 🐛 Debug e Monitoramento

### Ver status no console do navegador:

```javascript
// Importar módulo
const sync = await import('./sync-pedidos-online.js');

// Ver status
sync.statusSincronizacao();

// Ativar logs detalhados
sync.configurarSincronizacao({ debugMode: true });

// Pausar sincronização
sync.pararSincronizacaoPedidosOnline();

// Retomar sincronização
sync.iniciarSincronizacaoPedidosOnline();
```

### Logs importantes:

- ✅ `Sincronização de pedidos online iniciada com sucesso!`
- 🆕 `NOVO PEDIDO ONLINE DETECTADO: [ID]`
- ✅ `Pedido online [ID] sincronizado como pedido PDV #[NUM]`
- ⏭️ `Pedido [ID] já foi processado`

## ❓ Perguntas Frequentes

### **P: E se o PDV estiver fechado quando chegar um pedido online?**
R: Quando o PDV for aberto, ele irá sincronizar automaticamente todos os pedidos pendentes das últimas 24 horas que ainda não foram processados.

### **P: Como sei que um pedido veio do sistema online?**
R: O pedido terá nas observações: `[PEDIDO ONLINE - ID: xxxxx]` e o campo `origin` será "online".

### **P: Posso desativar a sincronização temporariamente?**
R: Sim! Edite `sync-pedidos-online.js` e mude `enabled: false`, ou use `sync.pararSincronizacaoPedidosOnline()` no console.

### **P: O que acontece se houver erro ao registrar?**
R: O sistema mostra uma notificação de erro mas continua funcionando. O pedido online permanece como "pendente" e você pode tentar novamente.

### **P: Os produtos são compatíveis entre os sistemas?**
R: Sim! O sincronizador faz um "fuzzy match" por nome para encontrar os produtos correspondentes no PDV.

## 🎉 Pronto!

Agora seu PDV está equipado com um **"robozinho"** que registra automaticamente os pedidos online! 🤖✨

---

**Desenvolvido com ❤️ para IceKiss**
