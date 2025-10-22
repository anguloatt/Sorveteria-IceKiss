import os
import io
import base64
import csv
from email.mime.text import MIMEText
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.exceptions import RefreshError
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload
import ast
import re # Importar para expressões regulares para parsing de itens
from datetime import datetime # Importar para obter a data atual

# Importações para Firebase
import firebase_admin
from firebase_admin import credentials, firestore

# Importações para Excel
import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter, column_index_from_string
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles.colors import Color
from collections import defaultdict # Para somar os salgados

# --- Configurações ---
# Escopos necessários para acessar o Google Drive e Gmail.
SCOPES = ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/gmail.send']

# Nome do arquivo de credenciais do Google Cloud (baixado do Console do Google Cloud).
GOOGLE_CREDENTIALS_FILE = 'credentials.json'

# Nome do arquivo de chave da conta de serviço do Firebase (baixado do Console do Firebase).
FIREBASE_SERVICE_ACCOUNT_KEY = 'serviceAccountKey.json'

# Nome da coleção no Firestore de onde os dados serão buscados.
FIRESTORE_COLLECTION_NAME = 'orders'

# Nome do arquivo Excel temporário que será gerado e enviado.
# Formato: backup_servidor_pedido_icekiss_DD_MM_YY.xlsx
CURRENT_DATE_STR = datetime.now().strftime("%d_%m_%y")
GENERATED_EXCEL_FILE_NAME = f'backup_servidor_pedido_icekiss_{CURRENT_DATE_STR}.xlsx'

# Senha para proteger o arquivo Excel (apenas para alteração)
EXCEL_PASSWORD = '1234'

# Endereço de e-mail do remetente (sua conta Google).
SENDER_EMAIL = 'anguloatt@gmail.com' # <-- SEU EMAIL

# Endereço de e-mail do destinatário (para teste, pode ser o seu; depois, o do cliente).
RECIPIENT_EMAIL = 'anguloatt@gmail.com'#'icekisscaucaia@gmail.com' # <-- SEU EMAIL (para teste inicial)

# Assunto do e-mail.
EMAIL_SUBJECT = f'Relatório de Pedidos Ice Kiss - Dados Detalhados ({CURRENT_DATE_STR})'

# Corpo do e-mail.
EMAIL_BODY = """
Prezado(a) Cliente,

O relatório detalhado dos pedidos do programa Ice Kiss já está disponível na nuvem.

Este arquivo Excel (.xlsx) contém informações como número do pedido, nome do cliente, data e hora da solicitação e retirada, itens pedidos, valores e dados do atendente, **com formatação aprimorada para melhor visualização**.

Você pode acessá-lo através do seguinte link: {drive_link}

Este link garante que o arquivo esteja sempre atualizado e disponível, sem a necessidade de depender do seu computador.

Por favor, sinta-se à vontade para entrar em contato caso tenha alguma dúvida ou precise de assistência para acessar o arquivo.

Atenciosamente,

[Seu Nome]
"""

# --- Configurações de Formatação Excel ---
# Cores em formato HEX
COLOR_RED_FONT_CONDITIONAL = Color('FF0000') # Para fonte "cancelado" e B4 no resumo
COLOR_BLACK_FILL_CONDITIONAL = Color('000000') # Para fundo "cancelado"

# Cores para a Planilha 'Relatório de Pedidos' (Padrão)
COLOR_WHITE_BACKGROUND_MAIN_SHEET = Color('FFFFFF') # Fundo padrão (VBA RGB: 16777215)
COLOR_WHITE_FONT_MAIN_SHEET = Color('FFFFFF') # Fonte padrão (VBA RGB: 16777215)
COLOR_BLACK_FONT_MAIN_SHEET_FOR_READABILITY = Color('000000') # Ajuste para legibilidade: texto preto em fundo cinza claro

# Cores para a Planilha 'Resumo'
COLOR_LIGHT_GRAY_BACKGROUND_SUMMARY_SHEET = Color('D3D3D3') # Fundo de dados (VBA RGB: 13882323)
COLOR_BLACK_FONT_SUMMARY_SHEET = Color('000000') # Fonte de dados (VBA RGB: 0)
COLOR_BLUE_NORMAL = Color('0000FF') # Azul normal para "Data do Relatório"

# Definição da variável COLOR_BLACK_BACKGROUND
COLOR_BLACK_BACKGROUND = Color('000000') # Para fundo preto (cabeçalho e formatação condicional)

# Estilo do Cabeçalho (Aplicado a ambas as planilhas)
HEADER_FONT = Font(name='Arial', size=10, bold=True, color=COLOR_WHITE_FONT_MAIN_SHEET)
HEADER_FILL = PatternFill(start_color=COLOR_BLACK_BACKGROUND.rgb, end_color=COLOR_BLACK_BACKGROUND.rgb, fill_type='solid') # Fundo preto para cabeçalho
HEADER_ALIGNMENT = Alignment(horizontal='center', vertical='bottom', wrap_text=False)
HEADER_ROW_HEIGHT = 15.75

# Estilo das Células de Dados - Planilha 'Relatório de Pedidos'
# Fundo CINZA CLARO, Fonte PRETA para legibilidade.
DATA_FONT_MAIN_SHEET = Font(name='Arial', size=10, bold=False, color=COLOR_BLACK_FONT_MAIN_SHEET_FOR_READABILITY)
DATA_FILL_MAIN_SHEET = PatternFill(start_color=COLOR_LIGHT_GRAY_BACKGROUND_SUMMARY_SHEET.rgb, end_color=COLOR_LIGHT_GRAY_BACKGROUND_SUMMARY_SHEET.rgb, fill_type='solid') # Fundo cinza claro
DATA_ALIGNMENT_DEFAULT = Alignment(horizontal='left', vertical='bottom', wrap_text=False) # Alinhamento padrão à esquerda
DATA_ROW_HEIGHT = 15.75

# Estilo das Células de Dados - Planilha 'Resumo'
# Ajustado para Calibri 14, negrito, preto
DATA_FONT_SUMMARY_SHEET = Font(name='Calibri', size=14, bold=True, color=COLOR_BLACK_FONT_SUMMARY_SHEET)
DATA_FILL_SUMMARY_SHEET = PatternFill(start_color=COLOR_LIGHT_GRAY_BACKGROUND_SUMMARY_SHEET.rgb, end_color=COLOR_LIGHT_GRAY_BACKGROUND_SUMMARY_SHEET.rgb, fill_type='solid')
DATA_ALIGNMENT_SUMMARY_SHEET_DEFAULT = Alignment(horizontal='general', vertical='bottom', wrap_text=False)

# Mapeamento de colunas para fórmulas e formatação condicional (NOVA ORDEM)
STATUS_COLUMN_LETTER = 'B' # status_pedido agora em B
TOTAL_CONTA_COLUMN_LETTER = 'J' # valor_total_conta agora em J
VALOR_SIGNAL_COLUMN_LETTER = 'K' # valor_sinal agora em K
VALOR_RESTANTE_COLUMN_LETTER = 'L' # valor_restante_pagar agora em L
ITENS_PEDIDOS_RESUMO_COLUMN_LETTER = 'I' # itens_pedidos_resumo agora em I

# Lista de colunas que devem ter formato de moeda e alinhamento à direita
CURRENCY_COLUMNS = [TOTAL_CONTA_COLUMN_LETTER, VALOR_SIGNAL_COLUMN_LETTER, VALOR_RESTANTE_COLUMN_LETTER]

# Lista de colunas que devem ser centralizadas na Guia Principal (A, B, C, E, F, G, H, M)
CENTER_ALIGNED_COLUMNS_MAIN_SHEET = ['A', 'B', 'C', 'E', 'F', 'G', 'H', 'M']

# --- Funções de Autenticação ---
def authenticate_google_api():
    """
    Autentica o usuário com as APIs do Google usando o arquivo credentials.json.
    Se um token de acesso válido existir (token.json), ele será usado.
    Caso contrário, o fluxo de autenticação OAuth 2.0 será iniciado,
    abrindo uma janela do navegador para o usuário conceder permissões.
    """
    creds = None
    if os.path.exists('token.json'):
        creds = Credentials.from_authorized_user_file('token.json', SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
            except RefreshError as re:
                # Token inválido/expirado sem possibilidade de refresh (invalid_grant etc.)
                print(f"RefreshError ao atualizar token: {re}. Removendo 'token.json' e reiniciando fluxo OAuth.")
                try:
                    os.remove('token.json')
                except OSError:
                    pass
                creds = None
        
        if not creds:
            if not os.path.exists(GOOGLE_CREDENTIALS_FILE):
                print(f"Erro: Arquivo '{GOOGLE_CREDENTIALS_FILE}' não encontrado. Baixe-o do Google Cloud Console.")
                return None
            flow = InstalledAppFlow.from_client_secrets_file(
                GOOGLE_CREDENTIALS_FILE, SCOPES)
            
            # Gerar o link de autorização e mostrar no terminal
            auth_url, _ = flow.authorization_url(prompt='consent')
            print("=" * 80)
            print("LINK PARA RENOVAR O TOKEN:")
            print(auth_url)
            print("=" * 80)
            print("1. Copie o link acima e abra no seu navegador")
            print("2. Faça login na sua conta Google e autorize o acesso")
            print("3. Copie o código que aparecerá na página")
            print("4. Cole o código aqui quando solicitado")
            print("=" * 80)
            
            code = input("Cole o código de autorização aqui: ")
            flow.fetch_token(code=code)
            creds = flow.credentials
        
        if creds:
            with open('token.json', 'w') as token:
                token.write(creds.to_json())
    return creds

def initialize_firebase():
    """
    Inicializa o Firebase Admin SDK usando a chave da conta de serviço.
    """
    if not os.path.exists(FIREBASE_SERVICE_ACCOUNT_KEY):
        print(f"Erro: Arquivo '{FIREBASE_SERVICE_ACCOUNT_KEY}' não encontrado. Baixe-o do Firebase Console.")
        return None
    try:
        cred = credentials.Certificate(FIREBASE_SERVICE_ACCOUNT_KEY)
        firebase_admin.initialize_app(cred)
        print("Firebase inicializado com sucesso.")
        return firestore.client()
    except Exception as e:
        print(f"Erro ao inicializar Firebase: {e}")
        return [] # Retorna lista vazia em caso de erro para evitar NoneType

# --- Funções do Firebase ---
def fetch_data_from_firestore(db, collection_name):
    """
    Busca todos os documentos de uma coleção específica no Firestore.
    Args:
        db: Objeto de cliente do Firestore.
        collection_name: Nome da coleção a ser buscada.
    Returns:
        Uma lista de dicionários, onde cada dicionário representa um documento.
    """
    print(f"Buscando dados da coleção '{collection_name}' no Firestore...")
    data = []
    try:
        docs = db.collection(collection_name).stream()
        for doc in docs:
            doc_data = doc.to_dict()
            doc_data['id'] = doc.id # Adiciona o ID do documento, se necessário
            data.append(doc_data)
        print(f"Total de {len(data)} documentos encontrados na coleção '{collection_name}'.")
        return data
    except Exception as e:
        print(f"Erro ao buscar dados do Firestore: {e}")
        return []

# --- Nova Função de Geração de Excel ---
def generate_excel_from_data(data, output_filename):
    """
    Gera um arquivo Excel a partir de uma lista de dicionários,
    processando campos aninhados e aplicando formatação.
    Args:
        data: Lista de dicionários (dados do Firestore).
        output_filename: Nome do arquivo Excel a ser criado.
    Returns:
        True se o Excel foi gerado com sucesso, False caso contrário.
    """
    if not data:
        print("Nenhum dado para gerar o Excel.")
        return False

    processed_data = []
    # Definir a ordem das colunas para o Excel, incluindo 'Ordem' e 'status_pedido' em B
    fieldnames = [
        'Ordem',                # Nova coluna A
        'status_pedido',        # Movido para B
        'numero_pedido',        # Movido para C
        'nome_cliente',         # Movido para D
        'telefone_cliente',     # Movido para E
        'data_solicitacao',     # Movido para F
        'data_retirada',        # Movido para G
        'hora_retirada',        # Movido para H
        'itens_pedidos_resumo', # Movido para I
        'valor_total_conta',    # Movido para J
        'valor_sinal',          # Movido para K
        'valor_restante_pagar', # Movido para L
        'status_pagamento',     # Movido para M
        'atendente_vendedor',   # Movido para N
        'atendente_recebedor',  # Movido para O
    ]

    # Dicionário para armazenar a contagem de cada salgado
    savory_item_counts = defaultdict(int)
    total_orders_not_canceled = 0 # Contador para pedidos não cancelados
    order_counter = 1 # Contador para a coluna 'Ordem'

    for idx, item in enumerate(data):
        new_row = {}
        
        # Lógica para a coluna 'Ordem' (A)
        if item.get('status', '') == 'cancelado':
            new_row['Ordem'] = '' # Célula vazia para pedidos cancelados
        else:
            new_row['Ordem'] = order_counter
            order_counter += 1
            total_orders_not_canceled += 1 # Contar apenas pedidos não cancelados

        # Processar 'customer'
        customer_data = {}
        if 'customer' in item and isinstance(item['customer'], str):
            try:
                customer_data = ast.literal_eval(item['customer'])
            except (ValueError, SyntaxError):
                pass
        elif 'customer' in item and isinstance(item['customer'], dict):
            customer_data = item['customer']
            
        new_row['numero_pedido'] = item.get('orderNumber', '')
        new_row['nome_cliente'] = customer_data.get('name', '')
        new_row['telefone_cliente'] = customer_data.get('phone', '')

        # Processar 'createdAt' (Data da Solicitação)
        if 'createdAt' in item and hasattr(item['createdAt'], 'toDate'):
            dt = item['createdAt'].toDate()
            new_row['data_solicitacao'] = dt.strftime('%d/%m/%Y %H:%M:%S')
        else:
            new_row['data_solicitacao'] = ''
        
        # Processar 'delivery' (Data e Hora da Retirada)
        delivery_data = {}
        if 'delivery' in item and isinstance(item['delivery'], str):
            try:
                delivery_data = ast.literal_eval(item['delivery'])
            except (ValueError, SyntaxError):
                pass
        elif 'delivery' in item and isinstance(item['delivery'], dict):
            delivery_data = item['delivery']

        new_row['data_retirada'] = delivery_data.get('date', '')
        new_row['hora_retirada'] = delivery_data.get('time', '')

        # Processar 'items' (Itens Pedidos) e contar salgados
        items_list = []
        if 'items' in item and isinstance(item['items'], str):
            try:
                items_list = ast.literal_eval(item['items'])
            except (ValueError, SyntaxError):
                pass
        elif 'items' in item and isinstance(item['items'], list):
            items_list = item['items']
        
        items_summary = []
        for product in items_list:
            name = product.get('name', 'Produto Desconhecido')
            qty = product.get('quantity', 0)
            items_summary.append(f"{qty}x {name}")

            # Contar salgados para o resumo
            # Ex: "60x Coxinhas (Fritas)" -> "Coxinhas (Fritas)"
            match = re.match(r'(\d+)x\s*(.*)', f"{qty}x {name}")
            if match:
                qty_parsed = int(match.group(1))
                item_name = match.group(2).strip()
                savory_item_counts[item_name] += qty_parsed

        new_row['itens_pedidos_resumo'] = "; ".join(items_summary)

        # Processar 'createdBy' (Vendedor/Atendente)
        created_by_data = {}
        if 'createdBy' in item and isinstance(item['createdBy'], str):
            try:
                created_by_data = ast.literal_eval(item['createdBy'])
            except (ValueError, SyntaxError):
                pass
        elif 'createdBy' in item and isinstance(item['createdBy'], dict):
            created_by_data = item['createdBy']
        
        new_row['atendente_vendedor'] = created_by_data.get('name', '')

        # Processar 'settledBy' (Recebedor)
        settled_by_data = {}
        if 'settledBy' in item and isinstance(item['settledBy'], str):
            try:
                settled_by_data = ast.literal_eval(item['settledBy'])
            except (ValueError, SyntaxError):
                pass
        elif 'settledBy' in item and isinstance(item['settledBy'], dict):
            settled_by_data = item['settledBy']
        
        new_row['atendente_recebedor'] = settled_by_data.get('name', '')

        # Valores financeiros
        new_row['valor_total_conta'] = item.get('total', 0)
        new_row['valor_sinal'] = item.get('sinal', 0)
        new_row['valor_restante_pagar'] = item.get('restante', 0)
        new_row['status_pagamento'] = item.get('paymentStatus', '')
        new_row['status_pedido'] = item.get('status', '') # Adicionado status geral do pedido

        # Adicionar quaisquer outras chaves que não foram explicitamente mapeadas
        for key, value in item.items():
            if key not in new_row and key not in ['id', 'cancelledAt', 'cancelledBy', 'paidAt', 'updatedAt', 'updatedBy', 'customer', 'createdAt', 'delivery', 'items', 'createdBy', 'settledBy', 'total', 'sinal', 'restante', 'paymentStatus', 'orderNumber', 'status']:
                new_row[key] = value

        # Garantir que a ordem das chaves no dicionário new_row corresponda a fieldnames
        ordered_row = {key: new_row.get(key, '') for key in fieldnames}
        processed_data.append(ordered_row)
    
    # Criar DataFrame com as colunas na ordem desejada
    df = pd.DataFrame(processed_data, columns=fieldnames)

    try:
        # Criar um novo workbook e sheet
        wb = Workbook()
        ws = wb.active
        ws.title = "Relatório de Pedidos"

        # Escrever os cabeçalhos na primeira linha do Excel
        ws.append(df.columns.tolist())

        # Escrever os dados a partir da segunda linha do Excel
        for r_idx, row in df.iterrows():
            ws.append(row.tolist())

        # Determinar a última linha de dados (para formatação condicional)
        last_data_row = ws.max_row

        # --- Aplicar Formatação Geral na Guia Principal ---

        # 1. Aplicar fundo CINZA CLARO a todas as células da área de dados
        for row_idx in range(1, ws.max_row + 1):
            for col_idx in range(1, len(fieldnames) + 1):
                ws.cell(row=row_idx, column=col_idx).fill = DATA_FILL_MAIN_SHEET
                ws.row_dimensions[row_idx].height = DATA_ROW_HEIGHT # Definir altura da linha

        # 2. Aplicar estilo ao cabeçalho (primeira linha) - Fundo PRETO, texto BRANCO, negrito, centralizado
        for col_idx, cell in enumerate(ws[1]):
            cell.font = HEADER_FONT
            cell.fill = HEADER_FILL
            cell.alignment = HEADER_ALIGNMENT
        ws.row_dimensions[1].height = HEADER_ROW_HEIGHT

        # 3. Aplicar fundo PRETO e fonte BRANCA para a coluna 'Ordem' (coluna A) a partir da linha 2
        for row_idx in range(2, ws.max_row + 1):
            cell_a = ws.cell(row=row_idx, column=column_index_from_string('A'))
            cell_a.fill = PatternFill(start_color=COLOR_BLACK_BACKGROUND.rgb, end_color=COLOR_BLACK_BACKGROUND.rgb, fill_type='solid')
            # Se a célula for vazia (cancelado), a fonte ainda será branca/negrito, mas o conteúdo é vazio
            if cell_a.value == '': # Se a célula 'Ordem' está vazia
                 cell_a.font = Font(name='Arial', size=10, bold=True, color=COLOR_WHITE_FONT_MAIN_SHEET) # Fonte branca, negrito
            else: # Se tem número de ordem
                 cell_a.font = Font(name='Arial', size=10, bold=True, color=COLOR_WHITE_FONT_MAIN_SHEET) # Fonte branca, negrito
            cell_a.alignment = Alignment(horizontal='center', vertical='bottom', wrap_text=False) # Centralizar

        # 4. Aplicar estilo padrão de dados (fonte PRETA para legibilidade, alinhamento padrão)
        for row_idx in range(2, last_data_row + 1):
            for col_idx, cell in enumerate(ws[row_idx]):
                cell_letter = get_column_letter(col_idx + 1)
                # Se a célula não for da coluna 'A' (já formatada), aplica o estilo padrão
                if cell_letter != 'A':
                    cell.font = DATA_FONT_MAIN_SHEET # Texto PRETO para legibilidade em fundo CINZA CLARO
                    
                    # Definir alinhamento: centralizado para colunas específicas, direita para moeda, padrão (esquerda) para outras
                    if cell_letter in CURRENCY_COLUMNS:
                        cell.number_format = 'R$ #,##0.00'
                        cell.alignment = Alignment(horizontal='right', vertical='bottom', wrap_text=False)
                    elif cell_letter in CENTER_ALIGNED_COLUMNS_MAIN_SHEET:
                        cell.alignment = Alignment(horizontal='center', vertical='bottom', wrap_text=False)
                    else:
                        cell.alignment = DATA_ALIGNMENT_DEFAULT # Alinhamento padrão à esquerda
        
        # 5. Formatar linhas 2 a 6, colunas A e B: Fonte tamanho 10, não negrito
        for row_idx in range(2, min(last_data_row + 1, 7)): # Linhas 2 a 6 (ou até o final dos dados se menos de 6)
            for col_letter in ['A', 'B']:
                cell = ws[f'{col_letter}{row_idx}']
                if col_letter == 'A': # Coluna A
                    cell.fill = PatternFill(start_color=COLOR_BLACK_BACKGROUND.rgb, end_color=COLOR_BLACK_BACKGROUND.rgb, fill_type='solid')
                    cell.font = Font(name='Arial', size=10, bold=False, color=COLOR_WHITE_FONT_MAIN_SHEET) # Tamanho 10, NÃO negrito, fonte branca
                else: # Coluna B
                    cell.fill = DATA_FILL_MAIN_SHEET # Fundo cinza claro
                    cell.font = Font(name='Arial', size=10, bold=False, color=COLOR_BLACK_FONT_MAIN_SHEET_FOR_READABILITY) # Tamanho 10, NÃO negrito, texto preto
                cell.alignment = Alignment(horizontal='center', vertical='bottom', wrap_text=False) # Centralizar

        # 6. Formatar célula B4: Texto VERMELHO
        cell_b4 = ws['B4']
        cell_b4.font = Font(name='Arial', size=10, bold=False, color=COLOR_RED_FONT_CONDITIONAL) # Fonte VERMELHA, tamanho 10, NÃO negrito
        cell_b4.fill = DATA_FILL_MAIN_SHEET # Fundo cinza claro
        cell_b4.alignment = Alignment(horizontal='center', vertical='bottom', wrap_text=False) # Centralizar


        # --- Auto-ajustar Largura das Colunas na Guia Principal ---
        # Percorre as colunas para determinar a largura máxima
        for col_idx, col_name in enumerate(fieldnames):
            max_length = 0
            # Considerar o comprimento do cabeçalho
            if len(str(col_name)) > max_length:
                max_length = len(str(col_name))

            # Considerar o comprimento dos dados
            for row_num in range(2, last_data_row + 1):
                cell_value = ws.cell(row=row_num, column=col_idx + 1).value
                if cell_value is not None:
                    # Estimar comprimento para valores monetários formatados
                    if get_column_letter(col_idx + 1) in CURRENCY_COLUMNS:
                        # Uma estimativa razoável para R$ X.YYY,ZZ
                        # Converte para string com 2 casas decimais e vírgula como separador decimal
                        str_value = f"R$ {cell_value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
                        if len(str_value) > max_length:
                            max_length = len(str_value)
                    else:
                        if len(str(cell_value)) > max_length:
                            max_length = len(str(cell_value))

            adjusted_width = (max_length + 2) # Adiciona um pouco de padding
            ws.column_dimensions[get_column_letter(col_idx + 1)].width = adjusted_width

        # --- Aplicar Formatação Condicional (APENAS para "cancelado") ---
        # A formatação condicional se aplica a todas as colunas da linha 2 até a última linha de dados.
        conditional_range = f"A2:{get_column_letter(len(fieldnames))}{last_data_row}"

        # Regra para "cancelado": Fonte Negrito, Cor VERMELHA, Fundo PRETO
        red_font_cond = Font(bold=True, color=COLOR_RED_FONT_CONDITIONAL)
        black_fill_cond = PatternFill(start_color=COLOR_BLACK_FILL_CONDITIONAL.rgb, end_color=COLOR_BLACK_FILL_CONDITIONAL.rgb, fill_type='solid')
        
        ws.conditional_formatting.add(
            conditional_range,
            FormulaRule(
                # A fórmula deve referenciar a célula da coluna de status na primeira linha do intervalo condicional
                # e usar referência relativa para a linha ($B2) para que se aplique corretamente a todas as linhas.
                formula=[f'${STATUS_COLUMN_LETTER}2="cancelado"'],
                font=red_font_cond,
                fill=black_fill_cond
            )
        )

        # --- Criar Nova Guia de Resumo ---
        summary_ws = wb.create_sheet("Resumo")
        
        # Data do Relatório no cabeçalho do resumo (Linha 1)
        summary_ws['A1'] = f"Data do Relatório: {datetime.now().strftime('%d/%m/%Y')}"
        summary_ws['A1'].font = Font(name='Arial', size=18, bold=True, color=COLOR_BLUE_NORMAL)
        summary_ws.merge_cells('A1:B1') # Mesclar A1 e B1
        summary_ws.row_dimensions[1].height = HEADER_ROW_HEIGHT * 1.5 # Aumentar um pouco a altura para caber a fonte 18

        # Cabeçalhos do resumo de valores (Linha 2)
        summary_ws['A2'] = "Tipo de Resumo"
        summary_ws['B2'] = "Valor"
        summary_ws['A2'].font = HEADER_FONT
        summary_ws['A2'].fill = HEADER_FILL # Cabeçalho do resumo também BRANCO
        summary_ws['B2'].font = HEADER_FONT
        summary_ws['B2'].fill = HEADER_FILL # Cabeçalho do resumo também BRANCO
        summary_ws.row_dimensions[2].height = HEADER_ROW_HEIGHT
        
        # Resumo dos valores (calculados diretamente aqui para a guia Resumo)
        current_summary_row = 3 # Começa na linha 3 após o novo cabeçalho e os cabeçalhos de coluna
        
        # Total Geral (Excl. Cancelados) - Linha 3
        summary_ws[f'A{current_summary_row}'] = "Total Geral (Excl. Cancelados)"
        summary_ws[f'B{current_summary_row}'] = \
            f'=SUMIF(\'{ws.title}\'!${STATUS_COLUMN_LETTER}2:${STATUS_COLUMN_LETTER}{last_data_row},"<>"&"cancelado",\'{ws.title}\'!{TOTAL_CONTA_COLUMN_LETTER}2:{TOTAL_CONTA_COLUMN_LETTER}{last_data_row})'
        summary_ws[f'B{current_summary_row}'].number_format = 'R$ #,##0.00'
        summary_ws[f'B{current_summary_row}'].alignment = Alignment(horizontal='right', vertical='bottom')
        summary_ws.cell(row=current_summary_row, column=1).fill = DATA_FILL_SUMMARY_SHEET # Fundo cinza claro
        summary_ws.cell(row=current_summary_row, column=2).fill = DATA_FILL_SUMMARY_SHEET # Fundo cinza claro
        summary_ws.cell(row=current_summary_row, column=1).font = DATA_FONT_SUMMARY_SHEET # Tamanho 14, negrito
        summary_ws.cell(row=current_summary_row, column=2).font = DATA_FONT_SUMMARY_SHEET # Tamanho 14, negrito
        summary_ws.row_dimensions[current_summary_row].height = DATA_ROW_HEIGHT
        current_summary_row += 1

        # Sinal Total (Excl. Cancelados) - Linha 4
        summary_ws[f'A{current_summary_row}'] = "Sinal Total (Excl. Cancelados)"
        summary_ws[f'B{current_summary_row}'] = \
            f'=SUMIF(\'{ws.title}\'!${STATUS_COLUMN_LETTER}2:${STATUS_COLUMN_LETTER}{last_data_row},"<>"&"cancelado",\'{ws.title}\'!{VALOR_SIGNAL_COLUMN_LETTER}2:{VALOR_SIGNAL_COLUMN_LETTER}{last_data_row})'
        summary_ws[f'B{current_summary_row}'].number_format = 'R$ #,##0.00'
        summary_ws[f'B{current_summary_row}'].alignment = Alignment(horizontal='right', vertical='bottom')
        summary_ws.cell(row=current_summary_row, column=1).fill = DATA_FILL_SUMMARY_SHEET
        summary_ws.cell(row=current_summary_row, column=2).fill = DATA_FILL_SUMMARY_SHEET
        summary_ws.cell(row=current_summary_row, column=1).font = DATA_FONT_SUMMARY_SHEET # Tamanho 14, negrito
        summary_ws.cell(row=current_summary_row, column=2).font = DATA_FONT_SUMMARY_SHEET # Tamanho 14, negrito
        summary_ws.row_dimensions[current_summary_row].height = DATA_ROW_HEIGHT
        current_summary_row += 1

        # Restante a Pagar Total (Excl. Cancelados) - Linha 5
        summary_ws[f'A{current_summary_row}'] = "Restante a Pagar Total (Excl. Cancelados)"
        summary_ws[f'B{current_summary_row}'] = \
            f'=SUMIF(\'{ws.title}\'!${STATUS_COLUMN_LETTER}2:${STATUS_COLUMN_LETTER}{last_data_row},"<>"&"cancelado",\'{ws.title}\'!{VALOR_RESTANTE_COLUMN_LETTER}2:{VALOR_RESTANTE_COLUMN_LETTER}{last_data_row})'
        summary_ws[f'B{current_summary_row}'].number_format = 'R$ #,##0.00'
        summary_ws[f'B{current_summary_row}'].alignment = Alignment(horizontal='right', vertical='bottom')
        summary_ws.cell(row=current_summary_row, column=1).fill = DATA_FILL_SUMMARY_SHEET
        summary_ws.cell(row=current_summary_row, column=2).fill = DATA_FILL_SUMMARY_SHEET
        summary_ws.cell(row=current_summary_row, column=1).font = DATA_FONT_SUMMARY_SHEET # Tamanho 14, negrito
        summary_ws.cell(row=current_summary_row, column=2).font = Font(name='Calibri', size=14, bold=True, color=COLOR_RED_FONT_CONDITIONAL) # Linha 5, Coluna B: Texto VERMELHO
        summary_ws.row_dimensions[current_summary_row].height = DATA_ROW_HEIGHT
        current_summary_row += 1
        
        # Total de Pedidos (Excl. Cancelados) - Linha 6 (Antiga Linha 5)
        summary_ws[f'A{current_summary_row}'] = "Total de Pedidos (Excl. Cancelados)"
        summary_ws[f'B{current_summary_row}'] = total_orders_not_canceled # Este valor já foi calculado em Python
        summary_ws[f'B{current_summary_row}'].number_format = '#,##0' # Formato x.xxx
        summary_ws[f'B{current_summary_row}'].alignment = Alignment(horizontal='right', vertical='bottom')
        summary_ws.cell(row=current_summary_row, column=1).fill = DATA_FILL_SUMMARY_SHEET
        summary_ws.cell(row=current_summary_row, column=2).fill = DATA_FILL_SUMMARY_SHEET
        summary_ws.cell(row=current_summary_row, column=1).font = DATA_FONT_SUMMARY_SHEET # Tamanho 14, negrito
        summary_ws.cell(row=current_summary_row, column=2).font = DATA_FONT_SUMMARY_SHEET # Tamanho 14, negrito
        summary_ws.row_dimensions[current_summary_row].height = DATA_ROW_HEIGHT
        current_summary_row += 2 # Pula uma linha para a próxima seção (Resumo de Salgados detalhado)

        # Resumo dos salgados (detalhado) - Começa na linha 9 (current_summary_row)
        summary_ws[f'A{current_summary_row}'] = "Resumo de Salgados"
        summary_ws[f'A{current_summary_row}'].font = Font(bold=True, color=COLOR_BLACK_FONT_SUMMARY_SHEET) # Fonte preta, negrito
        summary_ws[f'A{current_summary_row}'].fill = HEADER_FILL # Cabeçalho de seção BRANCO
        summary_ws[f'A{current_summary_row}'].alignment = Alignment(horizontal='center', vertical='bottom')
        summary_ws.merge_cells(f'A{current_summary_row}:B{current_summary_row}')
        summary_ws.row_dimensions[current_summary_row].height = DATA_ROW_HEIGHT
        current_summary_row += 1

        summary_ws[f'A{current_summary_row}'] = "Item"
        summary_ws['B' + str(current_summary_row)] = "Quantidade"
        summary_ws[f'A{current_summary_row}'].font = HEADER_FONT
        summary_ws[f'A{current_summary_row}'].fill = HEADER_FILL # Cabeçalho de colunas BRANCO
        summary_ws[f'B{current_summary_row}'].font = HEADER_FONT
        summary_ws[f'B{current_summary_row}'].fill = HEADER_FILL # Cabeçalho de colunas BRANCO
        summary_ws.row_dimensions[current_summary_row].height = HEADER_ROW_HEIGHT
        current_summary_row += 1

        for item_name, count in sorted(savory_item_counts.items()):
            summary_ws[f'A{current_summary_row}'] = item_name
            summary_ws[f'B{current_summary_row}'] = count
            summary_ws.cell(row=current_summary_row, column=1).fill = DATA_FILL_SUMMARY_SHEET # Fundo cinza claro
            summary_ws.cell(row=current_summary_row, column=2).fill = DATA_FILL_SUMMARY_SHEET # Fundo cinza claro
            summary_ws.cell(row=current_summary_row, column=1).font = DATA_FONT_SUMMARY_SHEET # Fonte Calibri 14, negrito, preto
            summary_ws.cell(row=current_summary_row, column=2).font = DATA_FONT_SUMMARY_SHEET # Fonte Calibri 14, negrito, preto
            summary_ws.cell(row=current_summary_row, column=2).alignment = Alignment(horizontal='right', vertical='bottom')
            summary_ws.cell(row=current_summary_row, column=2).number_format = '#,##0' # Formato x.xxx
            summary_ws.row_dimensions[current_summary_row].height = DATA_ROW_HEIGHT
            current_summary_row += 1
        
        # Auto-ajustar largura das colunas na guia Resumo
        for col_idx in range(1, 3): # Apenas para colunas A e B
            max_length = 0
            for row_num in range(1, summary_ws.max_row + 1):
                cell_value = summary_ws.cell(row=row_num, column=col_idx).value
                if cell_value is not None:
                    # Estimar comprimento para valores monetários formatados
                    if get_column_letter(col_idx) == 'B' and isinstance(cell_value, (int, float)):
                        # Verifica se é uma das células de soma de valores para aplicar o formato R$
                        if (row_num >= 3 and row_num <= 5): # Linhas 3 a 5 para somas de valores
                            str_value = f"R$ {cell_value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
                        else: # Outras linhas numéricas, como contagem de salgados e total de pedidos
                            str_value = str(cell_value)
                        if len(str_value) > max_length:
                            max_length = len(str_value)
                    else:
                        if len(str(cell_value)) > max_length:
                            max_length = len(str(cell_value))

            adjusted_width = (max_length + 2) # Adiciona um pouco de padding
            summary_ws.column_dimensions[get_column_letter(col_idx)].width = adjusted_width

        # --- Proteger as Planilhas ---
        # Proteger a planilha 'Relatório de Pedidos'
        ws.protection.sheet = True
        ws.protection.password = EXCEL_PASSWORD
        # Por padrão, todas as células são bloqueadas quando a planilha é protegida.
        # ws.protection.enable_selection = True # Descomente se quiser permitir seleção de células bloqueadas

        # Proteger a planilha 'Resumo'
        summary_ws.protection.sheet = True
        summary_ws.protection.password = EXCEL_PASSWORD
        # summary_ws.protection.enable_selection = True # Descomente se quiser permitir seleção de células bloqueadas


        wb.save(output_filename)
        print(f"Arquivo Excel '{output_filename}' gerado com sucesso e formatado.")
        return True
    except Exception as e:
        print(f"Erro ao gerar o arquivo Excel: {e}")
        return False

# --- Funções do Google Drive ---
def upload_file_to_drive(service, file_path, file_name):
    """
    Faz o upload de um arquivo para o Google Drive.
    Args:
        service: Objeto de serviço da API do Google Drive.
        file_path: Caminho completo para o arquivo a ser enviado.
        file_name: Nome do arquivo no Google Drive.
    Returns:
        ID do arquivo enviado.
    """
    try:
        file_metadata = {'name': file_name}
        # Alterado o mimetype para Excel
        media = MediaFileUpload(file_path, mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        file = service.files().create(body=file_metadata,
                                      media_body=media,
                                      fields='id').execute()
        print(f"Arquivo '{file_name}' enviado para o Google Drive. ID: {file.get('id')}")
        return file.get('id')
    except HttpError as error:
        print(f"Ocorreu um erro ao enviar o arquivo para o Drive: {error}")
        return None

def set_file_permissions(service, file_id):
    """
    Define as permissões de um arquivo no Google Drive para "qualquer pessoa com o link pode ler".
    Args:
        service: Objeto de serviço da API do Google Drive.
        file_id: ID do arquivo no Google Drive.
    """
    try:
        permission = {
            'type': 'anyone',
            'role': 'reader',
            'allowFileDiscovery': False # Não mostra o arquivo em pesquisas públicas no Drive
        }
        service.permissions().create(fileId=file_id, body=permission, fields='id').execute()
        print(f"Permissões definidas para o arquivo {file_id}: 'qualquer pessoa com o link pode ler'.")
    except HttpError as error:
        print(f"Ocorreu um erro ao definir as permissões do arquivo: {error}")

def get_shareable_link(service, file_id):
    """
    Obtém o link compartilhável de um arquivo no Google Drive.
    Args:
        service: Objeto de serviço da API do Google Drive.
        file_id: ID do arquivo no Google Drive.
    Returns:
        O link compartilhável do arquivo.
    """
    try:
        file = service.files().get(fileId=file_id, fields='webViewLink').execute()
        link = file.get('webViewLink')
        print(f"Link compartilhável do arquivo {file_id}: {link}")
        return link
    except HttpError as error:
        print(f"Ocorreu um erro ao obter o link do arquivo: {error}")
        return None

# --- Funções do Gmail ---
def create_message(sender, to, subject, message_text):
    """
    Cria uma mensagem de e-mail no formato MIME.
    Args:
        sender: Endereço de e-mail do remetente.
        to: Endereço de e-mail do destinatário.
        subject: Assunto do e-mail.
        message_text: Corpo do e-mail.
    Returns:
        Um objeto de mensagem codificado em base64.
    """
    message = MIMEText(message_text)
    message['to'] = to
    message['from'] = sender
    message['subject'] = subject
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
    return {'raw': raw}

def send_message(service, user_id, message):
    """
    Envia uma mensagem de e-mail através da API do Gmail.
    Args:
        service: Objeto de serviço da API do Gmail.
        user_id: O ID do usuário (geralmente 'me').
        message: O objeto de mensagem criado por create_message.
    Returns:
        O objeto de mensagem enviado.
    """
    try:
        message = service.users().messages().send(userId=user_id, body=message).execute()
        print(f"E-mail enviado! ID da Mensagem: {message['id']}")
        return message
    except HttpError as error:
        print(f"Ocorreu um erro ao enviar o e-mail: {error}")
        return None

# --- Lógica Principal ---
def main():
    """
    Automatiza a busca de dados no Firebase, geração de Excel formatado,
    upload para o Google Drive, definição de permissões e envio de e-mail.
    """
    # 1. Inicializar Firebase
    db = initialize_firebase()
    if not db:
        print("Não foi possível inicializar o Firebase. Encerrando.")
        return

    # 2. Buscar dados do Firestore
    firestore_data = fetch_data_from_firestore(db, FIRESTORE_COLLECTION_NAME)
    if not firestore_data:
        print("Nenhum dado encontrado no Firestore ou erro ao buscar. Encerrando.")
        return

    # 3. Gerar arquivo Excel a partir dos dados do Firestore (NOVA FUNÇÃO)
    if not generate_excel_from_data(firestore_data, GENERATED_EXCEL_FILE_NAME):
        print("Não foi possível gerar o arquivo Excel. Encerrando.")
        return

    # 4. Autenticar com as APIs do Google (Drive e Gmail)
    creds = authenticate_google_api()
    if not creds:
        print("Falha na autenticação do Google. Verifique suas credenciais e tente novamente. Encerrando.")
        # Limpa o arquivo Excel temporário se a autenticação Google falhar
        if os.path.exists(GENERATED_EXCEL_FILE_NAME):
            os.remove(GENERATED_EXCEL_FILE_NAME)
        return

    drive_service = build('drive', 'v3', credentials=creds)
    gmail_service = build('gmail', 'v1', credentials=creds)

    # 5. Fazer o upload do arquivo Excel para o Google Drive
    file_id = upload_file_to_drive(drive_service, GENERATED_EXCEL_FILE_NAME, GENERATED_EXCEL_FILE_NAME)

    if file_id:
        # 6. Definir as permissões do arquivo
        set_file_permissions(drive_service, file_id)

        # 7. Obter o link compartilhável
        drive_link = get_shareable_link(drive_service, file_id)

        if drive_link:
            # 8. Preparar e enviar o e-mail
            full_email_body = EMAIL_BODY.format(drive_link=drive_link)
            message = create_message(SENDER_EMAIL, RECIPIENT_EMAIL, EMAIL_SUBJECT, full_email_body)
            send_message(gmail_service, 'me', message)
        else:
            print("Não foi possível obter o link do Google Drive para enviar o e-mail.")
    else:
        print("Não foi possível fazer o upload do arquivo para o Google Drive.")

    # 9. Limpar o arquivo Excel temporário após o upload
    if os.path.exists(GENERATED_EXCEL_FILE_NAME):
        os.remove(GENERATED_EXCEL_FILE_NAME)
        print(f"Arquivo temporário '{GENERATED_EXCEL_FILE_NAME}' removido.")

if __name__ == '__main__':
    main()
