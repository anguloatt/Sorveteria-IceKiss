// Meu arquivo para centralizar todas as referências a elementos do DOM.

export const dom = {
    // Minha tela de autenticação (Login)
    authScreen: document.getElementById('auth-screen'),
    mainContent: document.getElementById('main-content'),
    managerDashboard: document.getElementById('manager-dashboard'),
    tabFuncionario: document.getElementById('tab-funcionario'),
    tabGerencia: document.getElementById('tab-gerencia'),
    loginFuncionarioDiv: document.getElementById('login-funcionario'),
    loginGerenciaDiv: document.getElementById('login-gerencia'),
    loginBtnFuncionario: document.getElementById('login-btn-funcionario'),
    employeeUserSelect: document.getElementById('employee-user-select'),
    employeePassInput: document.getElementById('employee-pass'),
    managerUserInput: document.getElementById('manager-user'),
    forgotPasswordLink: document.getElementById('forgot-password-link'),
    managerPassInput: document.getElementById('manager-pass'),
    loginBtnGerencia: document.getElementById('login-btn-gerencia'),
    
    // Meu PDV (Ponto de Venda)
    employeeSwitcherSelect: document.getElementById('employee-switcher-select'),
    pdvEmployeeOnlineStatus: document.getElementById('pdv-employee-online-status'),
    status: document.getElementById('status-display'),
    pdvCardapioContainer: document.getElementById('pdv-cardapio-container'),
    cardapioColumns: {
        assados: document.getElementById('assados-column'),
        fritos: document.getElementById('fritos-column'),
        revenda: document.getElementById('revenda-column'),
        extra: document.getElementById('extra-products-column-content')
    },
    otherProducts: {
        manualItemsDisplay: document.getElementById('manual-items-display'),
        manualDesc: document.getElementById('manual-item-desc'),
        manualPrice: document.getElementById('manual-item-price'),
        addManualBtn: document.getElementById('add-manual-item-btn'),
    },
    customerName: document.getElementById('customer-name'),
    customerPhone: document.getElementById('customer-phone'),
    deliveryDate: document.getElementById('delivery-date'),
    deliveryDateWeekday: document.getElementById('delivery-date-weekday'),
    deliveryTime: document.getElementById('delivery-time'),
    sinal: document.getElementById('sinal-input'),
    totalValue: document.getElementById('total-value'),
    restanteValue: document.getElementById('restante-value'),
    paymentStatus: document.getElementById('payment-status-display'),
    sinalMinimoDisplay: document.getElementById('sinal-minimo-display'),
    sinalLabel: document.getElementById('sinal-label'),
    restanteLabel: document.getElementById('restante-label'),
    
    // Meus botões de ação do PDV
    btnNovo: document.getElementById('btn-novo'),
    btnFechar: document.getElementById('btn-fechar'),
    btnAtualizar: document.getElementById('btn-atualizar'),
    btnCancelar: document.getElementById('btn-cancelar'),
    btnComprovante: document.getElementById('btn-comprovante'),
    liquidarBtn: document.getElementById('liquidarBtn'),
    btnSair: document.getElementById('btn-sair'),
    
    // Minha navegação e busca de pedidos
    btnAnterior: document.getElementById('btn-anterior'),
    btnProximo: document.getElementById('btn-proximo'),
    searchInput: document.getElementById('order-search-input'),
    searchBtn: document.getElementById('search-order-btn'),

    // Meus botões de acesso e relatórios
    reportBtn: document.getElementById('report-btn'),
    managerAccessBtn: document.getElementById('manager-access-btn'),
    returnToManagerBtn: document.getElementById('return-to-manager-btn'),
    changePasswordBtn: document.getElementById('change-password-btn'),

    // Meu Toast (Notificação)
    toast: document.getElementById('toast'),

    // Meu Modal de Ticket
    ticketModal: document.getElementById('ticket-modal'),
    ticketContent: document.getElementById('ticket-content'),
    closeTicketBtn: document.getElementById('close-ticket-modal-btn'),
    ticketPrintBtn: document.getElementById('ticket-print-btn'),
    ticketWhatsappBtn: document.getElementById('ticket-whatsapp-btn'),

    // Meu Modal de Lembrete
    reminder: {
        modal: document.getElementById('reminder-modal'),
        date: document.getElementById('reminder-date'),
        summaryItems: document.getElementById('reminder-summary-items'),
        ordersList: document.getElementById('reminder-orders-list'),
        closeBtn: document.getElementById('reminder-close-btn'),
        printBtn: document.getElementById('reminder-print-btn'),
    },
    
    // Meu Modal de Confirmação Personalizado
    customConfirmModal: document.getElementById('custom-confirm-modal'),
    confirmModalTitle: document.getElementById('confirm-modal-title'),
    confirmModalMessage: document.getElementById('confirm-modal-message'),
    confirmModalOkBtn: document.getElementById('confirm-modal-ok-btn'),
    confirmModalCancelBtn: document.getElementById('confirm-modal-cancel-btn'),
    confirmModalInputContainer: document.getElementById('confirm-modal-input-container'),
    confirmModalInputUser: document.getElementById('confirm-modal-input-user'),
    confirmModalInputPass: document.getElementById('confirm-modal-input-pass'),

    // Meu Modal de Relatório do Funcionário
    employeeReport: {
        modal: document.getElementById('employee-report-modal'),
        closeBtn: document.getElementById('employee-report-close-btn'),
        printBtn: document.getElementById('employee-report-print-btn'),
        mainTitle: document.getElementById('employee-report-main-title'),
        mainTabPedidos: document.getElementById('employee-main-tab-pedidos'),
        mainTabProducao: document.getElementById('employee-main-tab-producao'),
        contentMainPedidos: document.getElementById('employee-content-main-pedidos'),
        contentMainProducao: document.getElementById('employee-content-main-producao'),
        subTabPedidosDia: document.getElementById('employee-sub-tab-pedidos-dia'),
        subTabPedidosFuturos: document.getElementById('employee-sub-tab-pedidos-futuros'),
        tableContainer: document.getElementById('employee-table-container'),
        tableBody: document.getElementById('employee-report-table-body'),
        searchInput: document.getElementById('employee-report-search-input'),
        requestDatePicker: document.getElementById('employee-report-request-date-picker'),
        deliveryDatePicker: document.getElementById('employee-report-delivery-date-picker'),
        filterDevedor: document.getElementById('employee-report-filter-devedor'),
        filterPago: document.getElementById('employee-report-filter-pago'),
        dailySummaryDate: document.getElementById('daily-summary-date'),
        dailySummaryContent: document.getElementById('daily-summary-content'),
        totalSalgadosProducao: document.getElementById('total-salgados-producao'),
    },
    
    // Meu Modal de WhatsApp
    whatsapp: {
        modal: document.getElementById('whatsapp-modal'),
        clientName: document.getElementById('whatsapp-client-name'),
        messageInput: document.getElementById('whatsapp-message-input'),
        sendBtn: document.getElementById('whatsapp-modal-send'),
        cancelBtn: document.getElementById('whatsapp-modal-cancel'),
    },

    // Meu Painel do Gerente
    manager: {
        sidebar: document.getElementById('manager-sidebar'),
        menuBtn: document.getElementById('manager-menu-btn'),
        overlay: document.getElementById('manager-overlay'),
        pageTitle: document.getElementById('page-title'),
        pageSubtitle: document.getElementById('page-subtitle'),
        goToPdvBtn: document.getElementById('go-to-pdv-btn'),
        
        // Seção: Pedidos
        filterSearchAll: document.getElementById('filter-search-all'),
        clearFiltersBtn: document.getElementById('clear-filters-btn'),
        ordersTableBody: document.getElementById('manager-orders-table-body'),
        orderDetailModal: document.getElementById('manager-order-detail-modal'),
        detailOrderNumber: document.getElementById('detail-order-number'),
        detailOrderContent: document.getElementById('detail-order-content'),
        detailCloseBtn: document.getElementById('detail-close-btn'),
        detailReactivateBtn: document.getElementById('detail-reactivate-btn'),
        detailReleaseEditBtn: document.getElementById('detail-release-edit-btn'),

        // Seção: Cardápio
        tabCardapioAssadosManager: document.getElementById('tab-cardapio-assados-manager'),
        tabCardapioFritosManager: document.getElementById('tab-cardapio-fritos-manager'),
        tabCardapioRevendaManager: document.getElementById('tab-cardapio-revenda-manager'),
        tabCardapioOutrosManager: document.getElementById('tab-cardapio-outros-manager'),
        managerProductsList: document.getElementById('manager-products-list'),
        addProductBtn: document.getElementById('manager-add-product-btn'),
        saveProductsBtn: document.getElementById('manager-save-products-btn'),
        
        // Seção: Estoque
        stockManagementTableBody: document.getElementById('stock-management-table-body'),
        tabStockRepo: document.getElementById('tab-stock-repo'),
        tabStockHistory: document.getElementById('tab-stock-history'),
        contentStockRepo: document.getElementById('content-stock-repo'),
        contentStockHistory: document.getElementById('content-stock-history'),
        stockHistoryTableBody: document.getElementById('stock-history-table-body'),
        stockHistoryFilter: document.getElementById('stock-history-filter'),

        // Seção: Clientes
        clientsTableBody: document.getElementById('manager-clients-table-body'),
        selectAllClientsCheckbox: document.getElementById('select-all-clients-checkbox'),
        whatsappGroupSender: document.getElementById('whatsapp-group-sender'),
        selectedClientsCount: document.getElementById('selected-clients-count'),
        whatsappGroupMessage: document.getElementById('whatsapp-group-message'),
        sendGroupWhatsappBtn: document.getElementById('send-group-whatsapp-btn'),
        
        // Seção: Equipe
        tabEquipeDiario: document.getElementById('tab-equipe-diario'),
        tabEquipeMensal: document.getElementById('tab-equipe-mensal'),
        contentEquipeDiario: document.getElementById('content-equipe-diario'),
        contentEquipeMensal: document.getElementById('content-equipe-mensal'),
        equipeDiarioData: document.getElementById('equipe-diario-data'),
        teamDailyStatsContainer: document.getElementById('team-daily-stats-container'),
        equipeMonthPicker: document.getElementById('equipe-month-picker'),
        teamMonthlyStatsContainer: document.getElementById('team-monthly-stats-container'),
        teamMemberDetailModal: document.getElementById('team-member-monthly-detail-modal'),
        teamMemberDetailName: document.getElementById('team-member-detail-name'),
        teamMemberDetailContent: document.getElementById('team-member-monthly-detail-modal').querySelector('.overflow-y-auto'),
        teamMemberDetailCloseBtn: document.getElementById('team-member-detail-close-btn'),
        newEmployeeNameInput: document.getElementById('new-employee-name'),
        addEmployeeBtn: document.getElementById('add-employee-btn'),
        employeeListTableBody: document.getElementById('employee-list-table-body'),
        
        // Seção: Impressão
        storeNameInput: document.getElementById('manager-store-name'),
        storePhoneInput: document.getElementById('manager-store-phone'),
        ticketTitleInput: document.getElementById('manager-ticket-title'),
        ticketSubtitleInput: document.getElementById('manager-ticket-subtitle'),
        footerMsgInput: document.getElementById('manager-footer-msg'),
        printUnitPriceCheckbox: document.getElementById('manager-print-unit-price'),
        saveTicketBtn: document.getElementById('manager-save-ticket-btn'),
        ticketPreviewContainer: document.getElementById('ticket-preview-container'),
        
        // Seção: Sistema
        monthlyGoalInput: document.getElementById('manager-monthly-goal'),
        saveGoalBtn: document.getElementById('manager-save-goal-btn'),
        changePassNew: document.getElementById('manager-change-pass-new'),
        changePassConfirm: document.getElementById('manager-change-pass-confirm'),
        saveNewPassSystemBtn: document.getElementById('manager-save-new-pass-btn'),
        firebaseAccessBtn: document.getElementById('firebase-access-btn'),
        riskZone: document.getElementById('manager-risk-zone'),
        clearDataConfirmInput: document.getElementById('clear-data-confirm-input'),
        clearDataBtn: document.getElementById('manager-clear-data-btn'),
        newManagerPassInput: document.getElementById('new-manager-pass'),
        saveNewPassBtn: document.getElementById('save-new-pass-btn'),
    },
    
    // Minhas Notificações
    notifications: {
        bellBtn: document.getElementById('notification-bell-btn'),
        countBadge: document.getElementById('notification-count'),
        dropdown: document.getElementById('notification-dropdown'),
        list: document.getElementById('notification-list'),
        markAllReadBtn: document.getElementById('mark-all-notifications-read-btn'),
        placeholder: document.getElementById('no-notifications-placeholder'),
    },

    // Minhas Sugestões da IA no PDV
    pdvAiSuggestions: {
        container: document.getElementById('pdv-ai-suggestions'),
        text: document.getElementById('pdv-ai-suggestion-text'),
        loader: document.getElementById('pdv-ai-suggestion-loader'),
    },

    // Meu Selo do Cliente
    clientSeal: {
        container: document.getElementById('client-seal-container'),
        orderCount: document.getElementById('seal-order-count'),
        paymentIcon: document.getElementById('seal-payment-icon'),
        paymentStatus: document.getElementById('seal-payment-status'),
        clientSince: document.getElementById('seal-client-since'),
    },
    clientHistoryHeading: document.getElementById('client-history-heading'),

    // Meu Modal de Alterar Senha do Funcionário
    changePasswordModal: {
        modal: document.getElementById('change-password-modal'),
        currentPassInput: document.getElementById('current-password-input'),
        newPassInput: document.getElementById('new-password-input'),
        confirmPassInput: document.getElementById('confirm-password-input'),
        saveBtn: document.getElementById('change-password-save-btn'),
        cancelBtn: document.getElementById('change-password-cancel-btn'),
    },
    // Meu Modal de Histórico de Pedidos do Cliente
    clientHistoryModal: {
        modal: document.getElementById('client-history-modal'),
        clientName: document.getElementById('client-history-client-name'),
        ordersList: document.getElementById('client-history-orders-list'),
        closeBtn: document.getElementById('client-history-close-btn'),
    },
    // Meu Modal de Histórico de Preços
    priceHistoryModal: {
        modal: document.getElementById('price-history-modal'),
        productName: document.getElementById('history-product-name'),
        tableBody: document.getElementById('price-history-table-body'),
        closeBtn: document.getElementById('price-history-close-btn'),
    },
    // Meu Modal Seletor de Horário Interativo
    interactiveTimeSelector: {
        modal: document.getElementById('interactive-time-selector-modal'),
        container: document.getElementById('time-slots-container'),
        warningMessage: document.getElementById('time-selector-warning-message'),
        selectedDateEl: document.getElementById('time-selector-selected-date'),
        dailyTotalEl: document.getElementById('time-selector-daily-total'),
        manualInput: document.getElementById('manual-time-input'),
        confirmManualBtn: document.getElementById('confirm-manual-time-btn'),
        closeBtn: document.getElementById('interactive-time-selector-close-btn'),
    },
    // Meu Modal de aviso de sobrecarga
    overloadWarningModal: {
        modal: document.getElementById('overload-warning-modal'),
        message: document.getElementById('overload-warning-message'),
        changeTimeBtn: document.getElementById('overload-change-time-btn'),
        continueAnywayBtn: document.getElementById('overload-continue-anyway-btn'),
    },
    // Minha Central de Alertas de Pedidos Expirados
    alerts: {
        openBtn: document.getElementById('open-alerts-btn'),
        badge: document.getElementById('alert-count-badge'),
        modal: document.getElementById('expired-orders-alert-modal'),
        list: document.getElementById('expired-orders-list'),
        closeBtn: document.getElementById('expired-orders-alert-close-btn'),
    },
};
