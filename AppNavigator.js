import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';

// Importo minha tela principal do Dashboard.
import DashboardScreen from '../screens/DashboardScreen';

// Importo as outras telas que vou abrir a partir do dashboard.
import SalesScreen from '../screens/SalesScreen';
import ProductsScreen from '../screens/ProductsScreen';
import ReportsScreen from '../screens/ReportsScreen';
import SettingsScreen from '../screens/SettingsScreen';
// Deixo aqui o espaço para as futuras telas que vou criar.
// import ClientsScreen from '../screens/ClientsScreen';
// import SupportScreen from '../screens/SupportScreen';

const Stack = createStackNavigator();

const AppNavigator = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Dashboard" component={DashboardScreen} />
      <Stack.Screen name="Vendas" component={SalesScreen} />
      <Stack.Screen name="Produtos" component={ProductsScreen} />
      <Stack.Screen name="Relatórios" component={ReportsScreen} />
      <Stack.Screen name="Ajustes" component={SettingsScreen} />
      {/* Aqui vou adicionar as outras telas quando estiverem prontas. */}
      {/* <Stack.Screen name="Clientes" component={ClientsScreen} /> */}
      {/* <Stack.Screen name="Suporte" component={SupportScreen} /> */}
    </Stack.Navigator>
  );
};

export default AppNavigator;