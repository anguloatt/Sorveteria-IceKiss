// alertState.js - Gerencia o estado compartilhado dos alertas de pedidos expirados

/**
 * @type {Array<Object>}
 * Armazena a lista de pedidos que estão atualmente com um alerta pendente.
 * Esta lista é preenchida no login (em app.js) e consultada por outros módulos
 * como pdv.js (para mostrar o modal) e employeeReport.js (para mostrar o ícone de alerta).
 */
export const pendingAlerts = [];

