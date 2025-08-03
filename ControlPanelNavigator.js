import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

// Importo as telas que vou usar no meu painel de controle.
import SalesScreen from '../screens/SalesScreen';
import ProductsScreen from '../screens/ProductsScreen';
import ReportsScreen from '../screens/ReportsScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator();

const ControlPanelNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
 
          // Aqui eu defino qual ícone será exibido para cada aba, com um visual diferente se a aba estiver ativa (focused).
          if (route.name === 'Vendas') { 
            iconName = focused ? 'cash-register' : 'cash-register';
          } else if (route.name === 'Produtos') {
            iconName = focused ? 'package-variant-closed' : 'package-variant';
          } else if (route.name === 'Relatórios') {
            iconName = focused ? 'chart-bar' : 'chart-bar-stacked';
          } else if (route.name === 'Ajustes') {
            iconName = focused ? 'cog' : 'cog-outline';
          }
 
          return <Icon name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#007AFF', // Defino a cor para a aba ativa.
        tabBarInactiveTintColor: 'gray',   // Defino a cor para as abas inativas.
        headerShown: false, // Escondo o cabeçalho padrão de cada tela.
      })}
    >
      <Tab.Screen name="Vendas" component={SalesScreen} />
      <Tab.Screen name="Produtos" component={ProductsScreen} />
      <Tab.Screen name="Relatórios" component={ReportsScreen} />
      <Tab.Screen name="Ajustes" component={SettingsScreen} />
    </Tab.Navigator>
  );
};

export default ControlPanelNavigator;