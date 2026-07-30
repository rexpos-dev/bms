import { Redirect, withLayoutContext } from 'expo-router';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { ActivityIndicator, Text, View } from 'react-native';
import { useAuth } from '@/auth';

const { Navigator } = createMaterialTopTabNavigator();
const MaterialTopTabs = withLayoutContext(Navigator);

function TabIcon({ label, color }: { label: string; color: string }) {
  return <Text style={{ fontSize: 16, color }}>{label}</Text>;
}

export default function TabsLayout() {
  const { user, initializing } = useAuth();

  if (initializing) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#6d28d9" />
      </View>
    );
  }

  if (!user) return <Redirect href="/login" />;

  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN_STAFF';
  // Dev projects are owned by developers; super admin can see and edit them too.
  const isDeveloper = user.role === 'DEVELOPER' || user.role === 'SUPER_ADMIN';

  return (
    <MaterialTopTabs
      screenOptions={{
        tabBarActiveTintColor: '#6d28d9',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', textTransform: 'none' },
        tabBarIndicatorStyle: { backgroundColor: '#6d28d9', height: 3 },
        tabBarStyle: { backgroundColor: '#fff' },
        tabBarShowIcon: true,
        tabBarScrollEnabled: false,
      }}
    >
      {/* Everyone */}
      <MaterialTopTabs.Screen
        name="dashboard"
        options={{ title: 'Dashboard', tabBarIcon: ({ color }: { color: string }) => <TabIcon label="📊" color={color} /> }}
      />
      {/* Installer-only */}
      <MaterialTopTabs.Screen
        name="index"
        options={{ title: 'My Jobs', href: isAdmin ? null : undefined, tabBarIcon: ({ color }: { color: string }) => <TabIcon label="🧰" color={color} /> }}
      />
      <MaterialTopTabs.Screen
        name="earnings"
        options={{ title: 'Earnings', href: isAdmin ? null : undefined, tabBarIcon: ({ color }: { color: string }) => <TabIcon label="💰" color={color} /> }}
      />
      {/* Developer (and super admin) */}
      <MaterialTopTabs.Screen
        name="projects"
        options={{ title: 'Projects', href: isDeveloper ? undefined : null, tabBarIcon: ({ color }: { color: string }) => <TabIcon label="💻" color={color} /> }}
      />
      {/* Admin-only */}
      <MaterialTopTabs.Screen
        name="menu"
        options={{ title: 'Menu', href: isAdmin ? undefined : null, tabBarIcon: ({ color }: { color: string }) => <TabIcon label="🗂️" color={color} /> }}
      />
      {/* Everyone */}
      <MaterialTopTabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: ({ color }: { color: string }) => <TabIcon label="👤" color={color} /> }}
      />
    </MaterialTopTabs>
  );
}
