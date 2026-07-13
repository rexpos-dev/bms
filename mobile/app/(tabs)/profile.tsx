import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/auth';
import { DEFAULT_LOCAL_API_URL, getApiEnv, saveApiEnv, type ApiEnv } from '@/api';

function formatRole(role: string) {
  return role.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [env, setEnv] = useState<ApiEnv>('prod');
  const [localUrl, setLocalUrl] = useState(DEFAULT_LOCAL_API_URL);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!isSuperAdmin) return;
    void getApiEnv().then((stored) => {
      setEnv(stored.env);
      setLocalUrl(stored.localUrl);
    });
  }, [isSuperAdmin]);

  const applySwitch = async () => {
    if (env === 'local' && !/^https?:\/\/.+/.test(localUrl.trim())) {
      Alert.alert('Invalid URL', 'Enter a valid Local URL, e.g. http://192.168.1.246:3001/api');
      return;
    }
    setApplying(true);
    try {
      await saveApiEnv(env, localUrl.trim());
      await signOut();
      router.replace('/login');
    } finally {
      setApplying(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{user?.fullName?.charAt(0).toUpperCase() ?? '?'}</Text>
      </View>
      <Text style={styles.name}>{user?.fullName}</Text>
      <Text style={styles.email}>{user?.email}</Text>
      <View style={styles.roleBadge}>
        <Text style={styles.roleText}>{user ? formatRole(user.role) : ''}</Text>
      </View>

      {isSuperAdmin && (
        <View style={styles.serverCard}>
          <Text style={styles.serverTitle}>Server</Text>
          <Text style={styles.serverActive}>
            Active: {env === 'local' ? localUrl : 'Production (deployed)'}
          </Text>
          <View style={styles.segment}>
            {(['local', 'prod'] as ApiEnv[]).map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[styles.segmentBtn, env === opt && styles.segmentBtnActive]}
                onPress={() => setEnv(opt)}
              >
                <Text style={[styles.segmentText, env === opt && styles.segmentTextActive]}>
                  {opt === 'local' ? 'Local' : 'Prod'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {env === 'local' && (
            <TextInput
              style={styles.input}
              placeholder={DEFAULT_LOCAL_API_URL}
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              value={localUrl}
              onChangeText={setLocalUrl}
            />
          )}

          <Text style={styles.serverWarn}>Switching signs you out — log in again on the selected backend.</Text>
          <TouchableOpacity
            style={[styles.applyBtn, applying && styles.applyBtnDisabled]}
            disabled={applying}
            onPress={() => void applySwitch()}
          >
            <Text style={styles.applyBtnText}>{applying ? 'Applying…' : 'Apply & re-login'}</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity style={styles.signOut} onPress={() => void signOut()}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', padding: 32, gap: 8 },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#4f46e5',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  avatarText: { color: '#fff', fontSize: 36, fontWeight: '800' },
  name: { fontSize: 20, fontWeight: '700', color: '#111827', marginTop: 8 },
  email: { fontSize: 14, color: '#6b7280' },
  roleBadge: { backgroundColor: '#eef2ff', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5, marginTop: 6 },
  roleText: { color: '#4f46e5', fontWeight: '700', fontSize: 13 },
  serverCard: {
    width: '100%',
    marginTop: 24,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#eef0f4',
    backgroundColor: '#fff',
    gap: 10,
  },
  serverTitle: { fontSize: 15, fontWeight: '800', color: '#111827' },
  serverActive: { fontSize: 12, color: '#6b7280' },
  segment: { flexDirection: 'row', gap: 8 },
  segmentBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  segmentBtnActive: { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
  segmentText: { fontSize: 13, fontWeight: '700', color: '#6b7280' },
  segmentTextActive: { color: '#fff' },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#f9fafb',
  },
  serverWarn: { fontSize: 11, color: '#d97706' },
  applyBtn: { backgroundColor: '#4f46e5', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  applyBtnDisabled: { opacity: 0.5 },
  applyBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  signOut: {
    marginTop: 'auto',
    borderWidth: 1,
    borderColor: '#dc2626',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 32,
    width: '100%',
    alignItems: 'center',
  },
  signOutText: { color: '#dc2626', fontWeight: '700', fontSize: 16 },
});
