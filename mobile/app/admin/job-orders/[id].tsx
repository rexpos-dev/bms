import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { api, fileUrl } from '@/api';
import { useAuth } from '@/auth';
import { cardStyles as s } from '@/AdminList';
import type { JobOrder, JobOrderPaymentsResponse, PaymentMethod } from '@/types';

const peso = (n: number) => `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
const METHODS: PaymentMethod[] = ['CASH', 'BANK_TRANSFER', 'GCASH', 'CHECK'];

export default function JobOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const canVoid = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN_STAFF';

  const [jobOrder, setJobOrder] = useState<JobOrder | null>(null);
  const [data, setData] = useState<JobOrderPaymentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [referenceNo, setReferenceNo] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const load = useCallback(async () => {
    try {
      const [joRes, paymentsRes] = await Promise.all([
        api.get<JobOrder>(`/job-orders/${id}`),
        api.get<JobOrderPaymentsResponse>(`/job-orders/${id}/payments`),
      ]);
      setJobOrder(joRes.data);
      setData(paymentsRes.data);
    } catch {
      Alert.alert('Error', 'Could not load this job order.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Camera access is required to attach proof.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (!result.canceled) setPhotoUri(result.assets[0].uri);
  };

  const savePayment = async () => {
    if (!amount || Number(amount) <= 0) {
      Alert.alert('Amount required', 'Enter a valid payment amount.');
      return;
    }
    setSaving(true);
    try {
      let proofPhotoUrl: string | undefined;
      if (photoUri) {
        const form = new FormData();
        form.append('files', { uri: photoUri, name: `payment-${Date.now()}.jpg`, type: 'image/jpeg' } as unknown as Blob);
        const { data: uploaded } = await api.post<{ urls: string[] }>('/uploads/images', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        proofPhotoUrl = uploaded.urls[0];
      }
      await api.post(`/job-orders/${id}/payments`, {
        amount: Number(amount),
        method,
        referenceNo: referenceNo || undefined,
        proofPhotoUrl,
        paidAt: new Date().toISOString(),
      });
      setAmount('');
      setReferenceNo('');
      setPhotoUri(null);
      setShowForm(false);
      await load();
      Alert.alert('Saved', 'Payment recorded.');
    } catch {
      Alert.alert('Error', 'Could not save the payment.');
    } finally {
      setSaving(false);
    }
  };

  const confirmVoid = async (paymentId: string) => {
    if (!voidReason.trim()) return;
    try {
      await api.post(`/payments/${paymentId}/void`, { reason: voidReason.trim() });
      setVoidingId(null);
      setVoidReason('');
      await load();
    } catch {
      Alert.alert('Error', 'Could not void the payment.');
    }
  };

  if (loading) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color="#4f46e5" /></View>;
  }
  if (!jobOrder || !data) {
    return <View style={{ padding: 16 }}><Text>Job order not found.</Text></View>;
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <View style={s.card}>
        <Text style={s.title}>{jobOrder.client?.businessName ?? 'Client'}</Text>
        <Text style={s.meta}>{jobOrder.product?.productName ?? 'Custom'} · {jobOrder.status}</Text>
      </View>

      <View style={s.card}>
        <Text style={s.meta}>Grand Total: <Text style={s.title}>{peso(data.grandTotal)}</Text></Text>
        <Text style={s.meta}>Total Paid: <Text style={s.title}>{peso(data.totalPaid)}</Text></Text>
        <Text style={s.meta}>Balance: <Text style={[s.title, { color: data.balance > 0 ? '#dc2626' : '#16a34a' }]}>{peso(data.balance)}</Text></Text>
      </View>

      <Pressable style={{ backgroundColor: '#4f46e5', borderRadius: 10, padding: 12, alignItems: 'center' }} onPress={() => setShowForm((v) => !v)}>
        <Text style={{ color: '#fff', fontWeight: '700' }}>{showForm ? 'Cancel' : 'Record Payment'}</Text>
      </Pressable>

      {showForm && (
        <View style={[s.card, { gap: 8 }]}>
          <TextInput style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 10 }} keyboardType="numeric" placeholder="Amount" value={amount} onChangeText={setAmount} />
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {METHODS.map((m) => (
              <Pressable key={m} onPress={() => setMethod(m)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: method === m ? '#4f46e5' : '#eef0f4' }}>
                <Text style={{ color: method === m ? '#fff' : '#111827', fontSize: 12 }}>{m.replace('_', ' ')}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 10 }} placeholder="Reference # (optional)" value={referenceNo} onChangeText={setReferenceNo} />
          <Pressable onPress={pickPhoto} style={{ padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center' }}>
            <Text>{photoUri ? 'Photo attached ✓' : 'Attach proof photo (optional)'}</Text>
          </Pressable>
          <Pressable disabled={saving} onPress={savePayment} style={{ backgroundColor: '#16a34a', borderRadius: 8, padding: 12, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{saving ? 'Saving…' : 'Save Payment'}</Text>
          </Pressable>
        </View>
      )}

      {data.payments.map((p) => (
        <View key={p.id} style={[s.card, { opacity: p.voidedAt ? 0.5 : 1 }]}>
          <View style={s.row}>
            <Text style={s.meta}>{new Date(p.paidAt).toLocaleDateString()} · {p.method.replace('_', ' ')}</Text>
            <Text style={s.title}>{p.voidedAt ? `~${peso(Number(p.amount))}~` : peso(Number(p.amount))}</Text>
          </View>
          {p.referenceNo && <Text style={s.meta}>Ref: {p.referenceNo}</Text>}
          {p.proofPhotoUrl && <Text style={s.meta}>Proof: {fileUrl(p.proofPhotoUrl)}</Text>}
          {p.voidedAt ? (
            <Text style={s.meta}>Voided: {p.voidReason}</Text>
          ) : canVoid ? (
            voidingId === p.id ? (
              <View style={{ gap: 6, marginTop: 4 }}>
                <TextInput
                  style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 8, fontSize: 13 }}
                  placeholder="Reason for voiding"
                  value={voidReason}
                  onChangeText={setVoidReason}
                />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    disabled={!voidReason.trim()}
                    onPress={() => confirmVoid(p.id)}
                    style={{ backgroundColor: '#dc2626', borderRadius: 6, paddingVertical: 6, paddingHorizontal: 12 }}
                  >
                    <Text style={{ color: '#fff', fontSize: 12 }}>Confirm Void</Text>
                  </Pressable>
                  <Pressable onPress={() => { setVoidingId(null); setVoidReason(''); }} style={{ paddingVertical: 6, paddingHorizontal: 12 }}>
                    <Text style={{ fontSize: 12 }}>Cancel</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable onPress={() => setVoidingId(p.id)}><Text style={{ color: '#dc2626', fontSize: 12 }}>Void</Text></Pressable>
            )
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}
