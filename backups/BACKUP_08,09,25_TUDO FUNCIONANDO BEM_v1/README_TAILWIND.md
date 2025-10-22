Breve instruções para gerar o CSS do Tailwind localmente

Requisitos:
- Node.js e npm instalados localmente.

Passos (PowerShell):

1) Instalar dependências (no diretório `public`):

   npm install

2) Gerar o CSS de produção (gera `dist/tailwind.css`):

   npm run build:css

3) Durante desenvolvimento, para ver mudanças de CSS automaticamente:

   npm run watch:css

Observações:
- O arquivo `src/input.css` inclui as diretivas do Tailwind e importa o `style.css` existente para manter regras customizadas.
- O `index.html` já foi atualizado para referenciar `dist/tailwind.css` em vez do CDN.
- Se preferir não instalar dependências no ambiente remoto, mantenha o CDN (com o aviso) ou gere `dist/tailwind.css` em sua máquina e versioná-lo.
