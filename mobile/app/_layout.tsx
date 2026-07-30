import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '@/auth';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen
            name="(tabs)"
            options={{
              headerShown: true,
              title: 'Beulah Field',
              headerStyle: { backgroundColor: '#6d28d9' },
              headerTintColor: '#fff',
              headerTitleStyle: { fontWeight: '700' },
            }}
          />
          <Stack.Screen name="admin" />
          <Stack.Screen
            name="job/[id]"
            options={{ headerShown: true, title: 'Job Detail', presentation: 'card' }}
          />
          <Stack.Screen
            name="dev-project/[id]"
            options={{
              headerShown: true,
              title: 'Project',
              presentation: 'card',
              headerStyle: { backgroundColor: '#6d28d9' },
              headerTintColor: '#fff',
              headerTitleStyle: { fontWeight: '700' },
            }}
          />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
