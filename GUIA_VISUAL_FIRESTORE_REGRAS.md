# 🎯 Guia Visual: Como Atualizar Regras do Firestore

## 📍 Passo a Passo com Imagens

### **Passo 1: Acessar Firebase Console**

1. Abra seu navegador
2. Acesse: **https://console.firebase.google.com/**
3. Faça login com sua conta Google

---

### **Passo 2: Selecionar o Projeto Correto**

⚠️ **IMPORTANTE:** Selecione o projeto **icekiss-online** (NÃO o sorveteria-ice-kiss)

```
┌─────────────────────────────────────────┐
│  Firebase Console                       │
│                                         │
│  Meus Projetos:                         │
│                                         │
│  📁 sorveteria-ice-kiss                 │
│  📁 icekiss-online  ← CLIQUE AQUI!      │
│                                         │
└─────────────────────────────────────────┘
```

---

### **Passo 3: Abrir Firestore Database**

No menu lateral esquerdo:

```
┌─────────────────────────────────────────┐
│  Firebase Menu                          │
│                                         │
│  🏠 Visão Geral                         │
│  📊 Analytics                           │
│  🔧 Desenvolver                         │
│     ├── 🔐 Authentication               │
│     ├── 📂 Firestore Database ← AQUI!   │
│     ├── 💾 Realtime Database            │
│     └── 📦 Storage                      │
│                                         │
└─────────────────────────────────────────┘
```

---

### **Passo 4: Acessar a Aba "Regras"**

Na parte superior da tela:

```
┌─────────────────────────────────────────┐
│  Firestore Database                     │
│                                         │
│  [Dados]  [Regras]  [Índices]  [Uso]   │
│            ↑↑↑↑↑↑                        │
│         CLIQUE AQUI                     │
│                                         │
└─────────────────────────────────────────┘
```

---

### **Passo 5: Editar as Regras**

Você verá um editor de código. **SUBSTITUA TODO O CONTEÚDO** por:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Permitir PDV ler e marcar pedidos online
    match /pedidosOnline/{pedidoId} {
      allow create: if true;
      allow read: if true;
      allow update: if request.resource.data.diff(resource.data).affectedKeys()
        .hasOnly(['sincronizadoPDV', 'dataSincronizacao', 'sincronizadoEm']);
    }
    
    // Produtos (leitura pública)
    match /products/{productId} {
      allow read: if true;
      allow write: if false;
    }
    
    // Config (leitura pública)
    match /config/{configId} {
      allow read: if true;
      allow write: if false;
    }
    
    // Bloquear resto
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

---

### **Passo 6: Publicar as Regras**

1. Localize o botão **"Publicar"** (ou **"Publish"**) no canto superior direito
2. Clique nele

```
┌─────────────────────────────────────────┐
│  Regras do Firestore                    │
│                                         │
│  [Editor de código aqui...]             │
│                                         │
│              [Cancelar]  [Publicar] ← ! │
│                           ↑↑↑↑↑↑↑       │
│                        CLIQUE AQUI      │
└─────────────────────────────────────────┘
```

3. Aguarde a confirmação: ✅ **"Regras publicadas com sucesso"**

---

### **Passo 7: Verificar se Funcionou**

1. **Volte ao PDV**
2. **Recarregue a página** (F5 ou Ctrl+R)
3. **Abra o Console** do navegador (F12)
4. **Procure pela mensagem:**
   ```
   ✅ Sincronização de pedidos online iniciada com sucesso!
   ```

5. **Se ainda der erro**, aguarde 1-2 minutos e recarregue novamente

---

## 🔍 VERIFICAÇÃO FINAL

### ✅ Lista de Checagem:

- [ ] Acessei o Firebase Console
- [ ] Selecionei o projeto **icekiss-online**
- [ ] Abri Firestore Database
- [ ] Cliquei na aba **Regras**
- [ ] Copiei e colei as novas regras
- [ ] Cliquei em **Publicar**
- [ ] Vi a confirmação de sucesso
- [ ] Recarreguei o PDV
- [ ] Console mostra "Sincronização iniciada"
- [ ] Sem erros de permissão

---

## 🎯 TESTE RÁPIDO

Após publicar as regras:

1. **No console do PDV, digite:**
   ```javascript
   const sync = await import('./sync-pedidos-online.js');
   sync.statusSincronizacao();
   ```

2. **Deve retornar algo como:**
   ```javascript
   {
     ativo: true,
     configuracao: { enabled: true, autoRegister: true, ... },
     pedidosProcessados: 0
   }
   ```

3. **Se `ativo: true`**, está funcionando! ✅

---

## ⚠️ ATENÇÃO

### **Projeto Errado?**
Se você editou as regras do projeto **sorveteria-ice-kiss** por engano:
1. Volte ao Firebase Console
2. Selecione o projeto correto: **icekiss-online**
3. Repita o processo

### **Regras Antigas?**
As regras antigas provavelmente eram:
```javascript
match /{document=**} {
  allow read, write: if false;  // Bloqueia tudo
}
```

Isso explicaria o erro de permissão!

---

## 📞 AJUDA ADICIONAL

### Se mesmo após seguir todos os passos ainda houver erro:

1. **Limpe o cache do navegador:**
   - Pressione `Ctrl + Shift + Delete`
   - Marque "Imagens e arquivos em cache"
   - Clique em "Limpar dados"

2. **Tente em modo anônimo:**
   - `Ctrl + Shift + N` (Chrome)
   - Acesse o PDV
   - Veja se funciona

3. **Verifique a estrutura dos pedidos:**
   - No Firebase Console
   - Firestore Database → Dados
   - Procure a coleção `pedidosOnline`
   - Abra um documento
   - Confirme que tem os campos: `status`, `cliente`, `itens`, etc.

---

**Agora é só seguir o passo a passo e vai funcionar! 🚀**
