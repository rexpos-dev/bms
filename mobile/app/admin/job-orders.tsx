import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { AdminList, cardStyles as s } from '@/AdminList';
import type { JobOrder } from '@/types';

const peso = (n: number) => `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

const STATUS_COLOR: Record<string, string> = {
  DRAFT: '#6b7280', FINALIZED: '#2563eb', ON_GOING: '#d97706', COMPLETED: '#16a34a', CANCELLED: '#dc2626',
};

export default function JobOrdersScreen() {
  return (
    <AdminList<JobOrder>
      url="/job-orders"
      keyExtractor={(j) => j.id}
      emptyText="No job orders yet."
      renderItem={(j) => (
        <Pressable onPress={() => router.push(`/admin/job-orders/${j.id}`)}>
          <View style={s.card}>
            <View style={s.row}>
              <Text style={s.title} numberOfLines={1}>{j.client?.businessName ?? 'Client'}</Text>
              <View style={[s.badge, { backgroundColor: STATUS_COLOR[j.status] ?? '#6b7280' }]}>
                <Text style={s.badgeText}>{j.status}</Text>
              </View>
            </View>
            <Text style={s.meta}>{j.type} · {j.product?.productName ?? 'Custom'}</Text>
            <View style={s.row}>
              <Text style={s.meta}>{new Date(j.createdAt).toLocaleDateString()}</Text>
              <Text style={[s.title, { color: '#4f46e5' }]}>{peso(Number(j.salePrice))}</Text>
            </View>
          </View>
        </Pressable>
      )}
    />
  );
}
