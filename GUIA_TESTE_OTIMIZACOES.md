# 🧪 GUIA DE TESTE - Otimizações Firebase

## ✅ Checklist de Testes

### 1️⃣ Teste de Navegação (NOVO BOTÃO)

**Objetivo:** Verificar se o botão laranja (escudo) está funcionando

#### Passos:
1. Abra o PDV no navegador
2. Faça login como gerente
3. Procure o botão **laranja com ícone de escudo** 🛡️ no header
4. Clique no botão
5. **Resultado Esperado:** 
   - ✅ Deve ir para o Painel Gerencial SEM erros no console
   - ✅ Não deve aparecer: "Elementos de navegação para PDV não encontrados"

---

### 2️⃣ Teste de Reativação de Pedido (OTIMIZAÇÃO PRINCIPAL)

**Objetivo:** Verificar redução de chamadas ao Firestore

#### Preparação:
1. Abra o console do navegador (F12)
2. Vá para a aba "Console"
3. Limpe o console (ícone 🚫 ou Ctrl+L)

#### Passos:
1. No Painel Gerencial, encontre um pedido CANCELADO
   - Se não tiver, cancele um pedido ativo primeiro
2. Clique em "Reativar" no pedido cancelado
3. **OBSERVE O CONSOLE:**

#### ❌ ANTES (Versão Antiga):
```
Você veria MUITOS erros assim:
[Firestore] RestConnection RPC 'BatchGetDocuments' failed... (10-15x)
updateProductStock: Erro transacional... (5-10x)
reactivateOrder: Erro ao reativar pedido...
```

#### ✅ DEPOIS (Versão Otimizada):
```
Você deve ver:
reactivateOrder: Iniciando reativação do pedido XXX
showOrderDetailModal: Exibindo detalhes do pedido: XXX
✅ Pedido reativado com sucesso!

Sem (ou muito poucos) erros de "BatchGetDocuments"
```

---

### 3️⃣ Comparação Visual

#### CONSOLE - ANTES:
```
❌ hook.js:608 [2025-10-20T23:23:12.983Z] RestConnection RPC 'BatchGetDocuments' failed
❌ hook.js:608 [2025-10-20T23:23:12.986Z] RestConnection RPC 'BatchGetDocuments' failed
❌ hook.js:608 [2025-10-20T23:23:14.124Z] RestConnection RPC 'BatchGetDocuments' failed
❌ hook.js:608 [2025-10-20T23:23:14.125Z] RestConnection RPC 'BatchGetDocuments' failed
❌ hook.js:608 updateProductStock: Erro transacional ao atualizar estoque
❌ hook.js:608 reactivateOrder: Erro ao reativar pedido: FirebaseError: Quota exceeded.
```

#### CONSOLE - DEPOIS:
```
✅ reactivateOrder: Iniciando reativação do pedido LMDc7t92fQDMEJ5fv9jw
✅ Pedido reativado com sucesso!
✅ showOrderDetailModal: Exibindo detalhes do pedido
(Fim - sem erros de quota)
```

---

### 4️⃣ Verificar Estoque

**Objetivo:** Garantir que o estoque está sendo atualizado corretamente

#### Passos:
1. Antes de reativar, anote o estoque atual do produto
   - Ex: "Coxinha" tem 20 unidades
2. Reative um pedido com 5 coxinhas
3. Verifique o estoque novamente
4. **Resultado Esperado:**
   - ✅ Estoque deve diminuir em 5 unidades (20 → 15)
   - ✅ Sem erros no console

---

### 5️⃣ Teste de Quota Excedida (SE AINDA OCORRER)

**Se você ainda ver erro de quota:**

#### Mensagem Esperada (NOVA):
```
🚫 Limite de requisições do Firebase excedido. 
   Tente novamente em alguns minutos.
```

#### O que fazer:
1. **Opção 1 - Aguardar:** Quota reseta às 00:00 PST (04:00 BRT)
2. **Opção 2 - Upgrade:** Firebase Console → Upgrade para Blaze
3. **Opção 3 - Otimizar mais:** Implementar cache (veja OTIMIZACOES_FIREBASE.md)

---

## 📊 Monitoramento no Firebase Console

### Como Verificar Uso:
1. Acesse: https://console.firebase.google.com/
2. Selecione: `sorveteria-ice-kiss`
3. Menu: **⚙️ Configurações** → **Uso e faturamento**
4. Veja gráficos de:
   - 📖 Leituras
   - ✍️ Escritas
   - 🗑️ Exclusões

### Limites do Plano Spark (Gratuito):
| Operação | Limite Diário |
|----------|---------------|
| 📖 Leituras | 50.000 |
| ✍️ Escritas | 20.000 |
| 🗑️ Exclusões | 20.000 |

### Sinais de Alerta:
- 🔴 Uso acima de 80% da quota
- 🔴 Erros `resource-exhausted` frequentes
- 🔴 Operações lentas

---

## 🎯 Resultados Esperados

### ✅ Sucesso Total:
- Navegação funcionando sem erros
- Reativação de pedidos RÁPIDA
- Console limpo (sem erros de quota)
- Estoque atualizado corretamente
- Menos de 5 chamadas ao Firestore por operação

### ⚠️ Sucesso Parcial:
- Navegação OK, mas ainda alguns erros de quota
- **Ação:** Implementar mais otimizações (cache, paginação)

### ❌ Falha:
- Ainda muitos erros de quota
- **Ação:** 
  1. Verificar se o código foi atualizado corretamente
  2. Limpar cache do navegador (Ctrl+Shift+Del)
  3. Considerar upgrade para Plano Blaze

---

## 📝 Registro de Testes

**Preencha após testar:**

### Teste 1 - Navegação:
- [ ] Botão laranja aparece no header
- [ ] Clique funciona sem erros
- [ ] Vai para Painel Gerencial

### Teste 2 - Reativação:
- [ ] Pedido cancelado encontrado
- [ ] Reativação executada
- [ ] Console sem muitos erros
- [ ] Estoque atualizado

### Teste 3 - Performance:
- [ ] Operação mais rápida que antes
- [ ] Menos de 5 chamadas ao Firestore
- [ ] Sem travamentos

---

## 🆘 Solução de Problemas

### Problema: Botão laranja não aparece
**Solução:** 
- Limpar cache: Ctrl+Shift+Del → Limpar tudo
- Atualizar página: Ctrl+F5

### Problema: Ainda muitos erros de quota
**Solução:**
- Verificar se realmente está usando a versão otimizada
- Checar backup: `BACKUP_20_10_25_2032_OTIMIZADO_FIREBASE`
- Aguardar reset de quota (04:00 BRT)

### Problema: Estoque não atualiza
**Solução:**
- Verificar permissões do Firestore
- Checar regras de segurança
- Ver console para erros específicos

---

**Data:** 20/10/2025  
**Versão:** v12 - Otimizado  
**Status:** Pronto para Teste ✅
