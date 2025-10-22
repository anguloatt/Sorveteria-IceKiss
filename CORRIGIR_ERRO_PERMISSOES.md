# 🔧 CORRIGIR ERRO: Missing or insufficient permissions

## ❌ Erro Atual:
```
FirebaseError: Missing or insufficient permissions.
```

Isso significa que o PDV não tem permissão para ler a coleção `pedidosOnline` no Firebase.

---

## ✅ SOLUÇÃO 1: Atualizar Regras do Firestore (Recomendado)

### Passo 1: Acessar o Firebase Console

1. Abra: https://console.firebase.google.com/
2. Selecione o projeto: **icekiss-online**
3. Menu lateral → **Firestore Database**
4. Aba **Regras** (Rules)

### Passo 2: Atualizar as Regras

Substitua as regras atuais por:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Permitir que PDV leia e atualize pedidos online
    match /pedidosOnline/{pedidoId} {
      // Permitir criar novos pedidos (para clientes mobile)
      allow create: if true;
      
      // Permitir ler pedidos (para PDV sincronizar)
      allow read: if true;
      
      // Permitir atualizar apenas campo sincronizadoPDV
      allow update: if request.resource.data.diff(resource.data).affectedKeys()
        .hasOnly(['sincronizadoPDV', 'dataSincronizacao', 'sincronizadoEm']);
    }
    
    // Outras coleções (se existirem)
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

### Passo 3: Publicar as Regras

1. Clique em **Publicar** (Publish)
2. Aguarde confirmação

### Passo 4: Testar

1. Recarregue o PDV (F5)
2. Verifique o console - deve aparecer:
   ```
   ✅ Sincronização de pedidos online iniciada com sucesso!
   ```

---

## ✅ SOLUÇÃO 2: Regras Temporárias (Para Testes)

**⚠️ ATENÇÃO: Use apenas para testes! Não recomendado para produção!**

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;  // ⚠️ Permite tudo - só para teste!
    }
  }
}
```

Depois de confirmar que funciona, volte para a **Solução 1** (mais segura).

---

## ✅ SOLUÇÃO 3: Criar Índice Composto (Se necessário)

Se após corrigir as permissões aparecer erro de **índice faltando**, faça:

### Passo 1: O console mostrará um link de erro
Exemplo:
```
The query requires an index. You can create it here: https://...
```

### Passo 2: Clique no link
O Firebase abrirá a página de criação automática do índice.

### Passo 3: Criar o índice
1. Clique em **Criar índice** (Create index)
2. Aguarde 2-5 minutos (processo automático)
3. Recarregue o PDV

### Passo 4: OU criar manualmente

No Firebase Console → **Firestore Database** → **Índices**:

```
Coleção: pedidosOnline
Campos:
  - status (Ascending)
  - dataCriacao (Descending)
Estado da consulta: Habilitada
```

---

## 🔍 VERIFICAÇÃO

### ✅ Checklist Pós-Correção:

- [ ] Regras do Firestore atualizadas e publicadas
- [ ] PDV recarregado (F5)
- [ ] Console mostra: "Sincronização de pedidos online iniciada"
- [ ] Sem erros de permissão no console
- [ ] Índice criado (se solicitado)

### 🧪 Teste Completo:

1. **Criar pedido de teste no mobile**
2. **Verificar no console do PDV:**
   ```
   🆕 NOVO PEDIDO ONLINE DETECTADO: [ID]
   ✅ Pedido online [ID] sincronizado como pedido PDV #[NUM]
   ```
3. **Verificar notificação:**
   - Som tocou
   - Toast apareceu
4. **Verificar no Firebase:**
   - Campo `sincronizadoPDV` mudou para `true`

---

## 🐛 TROUBLESHOOTING

### Problema: Ainda dá erro de permissão após atualizar regras

**Solução:**
1. Limpe o cache do navegador (Ctrl + Shift + Delete)
2. Recarregue a página (Ctrl + F5)
3. Aguarde 1-2 minutos (propagação das regras)
4. Verifique se está editando o projeto correto (icekiss-online)

### Problema: Erro "query requires an index"

**Solução:**
1. Clique no link do erro no console
2. Crie o índice automaticamente
3. OU remova o filtro `where('dataCriacao', '>=', dataLimite)` temporariamente

### Problema: "Cannot read property 'data' of undefined"

**Solução:**
1. Verifique se a coleção `pedidosOnline` existe
2. Verifique se há ao menos 1 documento de teste
3. Confirme a estrutura dos documentos

### Problema: Regras não surtem efeito

**Solução:**
1. Verifique se clicou em **Publicar** após editar
2. Aguarde 30-60 segundos
3. Certifique-se de estar no projeto correto
4. Verifique na aba "Regras" se as mudanças aparecem

---

## 📋 ESTRUTURA MÍNIMA DO PEDIDO ONLINE

Para a sincronização funcionar, cada documento em `pedidosOnline` deve ter:

```javascript
{
  status: "pendente",           // ✅ Obrigatório
  cliente: {                    // ✅ Obrigatório
    nome: "João Silva",
    whatsapp: "11987654321"
  },
  itens: [                      // ✅ Obrigatório (array não vazio)
    {
      id: "produto_1",
      nome: "Coxinha",
      preco: 2.50,
      quantidade: 10
    }
  ],
  total: 25.00,                 // ✅ Obrigatório
  formaPagamento: "PIX",        // ✅ Obrigatório
  retirada: {                   // ✅ Obrigatório
    data: "2025-10-22",         // formato YYYY-MM-DD
    hora: "14:00"               // formato HH:MM
  },
  dataCriacao: Timestamp,       // ✅ Obrigatório (Firebase Timestamp)
  sincronizadoPDV: false,       // ✅ Obrigatório (booleano)
  observacoes: "",              // ⭕ Opcional
  numeroProvisorio: "",         // ⭕ Opcional
  pagamento: {}                 // ⭕ Opcional
}
```

---

## 🎯 EXEMPLO DE REGRAS COMPLETAS (Produção)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // ============================================
    // PEDIDOS ONLINE (Sistema Mobile + PDV)
    // ============================================
    match /pedidosOnline/{pedidoId} {
      // Clientes mobile podem criar pedidos
      allow create: if request.resource.data.keys().hasAll([
        'status', 'cliente', 'itens', 'total', 
        'formaPagamento', 'retirada', 'dataCriacao'
      ]) && request.resource.data.status == 'pendente';
      
      // PDV pode ler todos os pedidos pendentes
      allow read: if true;
      
      // PDV pode marcar como sincronizado
      allow update: if request.resource.data.diff(resource.data).affectedKeys()
        .hasOnly(['sincronizadoPDV', 'dataSincronizacao', 'sincronizadoEm'])
        && request.resource.data.sincronizadoPDV == true;
    }
    
    // ============================================
    // PRODUTOS (Sistema Mobile - leitura)
    // ============================================
    match /products/{productId} {
      allow read: if true;
      allow write: if false;
    }
    
    // ============================================
    // CONFIGURAÇÕES (Sistema Mobile - leitura)
    // ============================================
    match /config/{configId} {
      allow read: if true;
      allow write: if false;
    }
    
    // ============================================
    // BLOQUEAR TODO O RESTO
    // ============================================
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

---

## 📞 AINDA COM PROBLEMAS?

1. **Ative o modo debug:**
   ```javascript
   // No console do navegador
   const sync = await import('./sync-pedidos-online.js');
   sync.configurarSincronizacao({ debugMode: true });
   ```

2. **Copie os erros do console** e analise

3. **Verifique:**
   - Projeto correto no Firebase Console
   - Coleção existe e tem documentos
   - Regras foram publicadas
   - Índices criados (se necessário)

---

**Depois de corrigir, teste novamente e deve funcionar! 🚀**
