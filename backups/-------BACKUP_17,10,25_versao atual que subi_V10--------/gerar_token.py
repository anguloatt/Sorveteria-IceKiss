#!/usr/bin/env python3
"""
Script simples para gerar link de autenticação do Google OAuth
"""
import os
from google_auth_oauthlib.flow import InstalledAppFlow

# Escopos necessários (mesmo do script principal)
SCOPES = ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/gmail.send']
GOOGLE_CREDENTIALS_FILE = 'credentials.json'

def gerar_link_autenticacao():
    """Gera o link de autenticação OAuth do Google"""
    
    if not os.path.exists(GOOGLE_CREDENTIALS_FILE):
        print(f"ERRO: Arquivo '{GOOGLE_CREDENTIALS_FILE}' não encontrado!")
        return
    
    try:
        # Criar fluxo OAuth
        flow = InstalledAppFlow.from_client_secrets_file(GOOGLE_CREDENTIALS_FILE, SCOPES)
        
        # Configurar redirect_uri manualmente para aplicações instaladas
        flow.redirect_uri = 'urn:ietf:wg:oauth:2.0:oob'
        
        # Gerar URL de autorização
        auth_url, _ = flow.authorization_url(prompt='consent', access_type='offline')
        
        print("=" * 100)
        print("🔗 LINK PARA RENOVAR O TOKEN DO GOOGLE:")
        print("=" * 100)
        print(auth_url)
        print("=" * 100)
        print("📋 INSTRUÇÕES:")
        print("1. Copie o link acima")
        print("2. Abra no seu navegador")
        print("3. Faça login na sua conta Google")
        print("4. Autorize o acesso ao Drive e Gmail")
        print("5. Copie o código que aparecerá na página")
        print("6. Execute: python gerar_token.py --codigo SEU_CODIGO")
        print("=" * 100)
        
        return auth_url, flow
        
    except Exception as e:
        print(f"ERRO ao gerar link: {e}")
        return None, None

def salvar_token_com_codigo(codigo, flow):
    """Salva o token usando o código de autorização"""
    try:
        flow.fetch_token(code=codigo)
        creds = flow.credentials
        
        with open('token.json', 'w') as token_file:
            token_file.write(creds.to_json())
            
        print("✅ Token salvo com sucesso em 'token.json'!")
        print("🚀 Agora você pode executar: python automacao_nuvem.py")
        
    except Exception as e:
        print(f"❌ ERRO ao salvar token: {e}")

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "--codigo":
        if len(sys.argv) > 2:
            codigo = sys.argv[2]
            # Recriar o flow para usar o código
            flow = InstalledAppFlow.from_client_secrets_file(GOOGLE_CREDENTIALS_FILE, SCOPES)
            flow.redirect_uri = 'urn:ietf:wg:oauth:2.0:oob'
            salvar_token_com_codigo(codigo, flow)
        else:
            print("❌ ERRO: Forneça o código de autorização")
            print("Uso: python gerar_token.py --codigo SEU_CODIGO")
    else:
        gerar_link_autenticacao()