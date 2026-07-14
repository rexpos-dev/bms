import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/auth';

export default function AdminLayout() {
  const { user, initializing } = useAuth();
  if (initializing) return null;
  if (!user) return <Redirect href="/login" />;

  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN_STAFF' || user.role === 'SALES_STAFF';
  if (!isAdmin) return <Redirect href="/(tabs)" />;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#4f46e5' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Stack.Screen name="clients" options={{ title: 'Clients' }} />
      <Stack.Screen name="products" options={{ title: 'Products' }} />
      <Stack.Screen name="licenses" options={{ title: 'Licenses' }} />
      <Stack.Screen name="job-orders" options={{ title: 'Job Orders' }} />
      <Stack.Screen name="job-orders/[id]" options={{ title: 'Job Order Payment' }} />
      <Stack.Screen name="jobs" options={{ title: 'All Jobs' }} />
      <Stack.Screen name="withdrawals" options={{ title: 'Withdrawals' }} />
      <Stack.Screen name="users" options={{ title: 'Users' }} />
      <Stack.Screen name="audit-logs" options={{ title: 'Audit Logs' }} />
    </Stack>
  );
}
