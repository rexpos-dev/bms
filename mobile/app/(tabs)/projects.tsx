import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { api } from '@/api';
import { cardStyles as s } from '@/AdminList';
import {
  STATUS_COLORS,
  computeProgress,
  formatDuration,
  isPaused,
  isRunning,
  liveSeconds,
  statusLabel,
} from '@/dev-projects';
import type { DevProject } from '@/types';

/** Re-render every second so running timers tick without refetching. */
function useSecondTick(enabled: boolean) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [enabled]);
}

export default function ProjectsScreen() {
  const router = useRouter();
  const [projects, setProjects] = useState<DevProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await api.get<DevProject[]>('/dev-projects');
      setProjects(Array.isArray(res.data) ? res.data : []);
    } catch {
      setError('Could not load projects. Pull to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useSecondTick(projects.some(isRunning));

  const act = async (project: DevProject, action: 'start' | 'pause' | 'resume' | 'stop') => {
    setBusyId(project.id);
    try {
      await api.post(`/dev-projects/${project.id}/${action}`);
      await load();
    } catch {
      Alert.alert('Error', `Could not ${action} "${project.name}".`);
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6d28d9" />
      </View>
    );
  }

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={projects}
      keyExtractor={(p) => p.id}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load();
          }}
        />
      }
      ListEmptyComponent={<Text style={styles.empty}>{error ?? 'No projects assigned to you yet.'}</Text>}
      renderItem={({ item }) => {
        const running = isRunning(item);
        const paused = isPaused(item);
        const percent = computeProgress(item);
        const busy = busyId === item.id;

        return (
          <Pressable style={s.card} onPress={() => router.push(`/dev-project/${item.id}` as never)}>
            <View style={s.row}>
              <Text style={[s.title, { flex: 1 }]} numberOfLines={1}>{item.name}</Text>
              <View style={[s.badge, { backgroundColor: STATUS_COLORS[item.status] }]}>
                <Text style={s.badgeText}>{paused ? 'PAUSED' : statusLabel(item.status)}</Text>
              </View>
            </View>

            <Text style={[styles.timer, { color: running ? '#16a34a' : '#6b7280' }]}>
              {formatDuration(liveSeconds(item))}
              {item.targetHours ? <Text style={s.meta}>  / {item.targetHours}h target</Text> : null}
            </Text>

            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${percent}%` }]} />
            </View>
            <Text style={s.meta}>{percent}% complete</Text>

            <View style={styles.actions}>
              {item.status !== 'COMPLETED' && !running && !paused && (
                <Action label="▶ Start" color="#16a34a" busy={busy} onPress={() => act(item, 'start')} />
              )}
              {running && (
                <>
                  <Action label="⏸ Pause" color="#d97706" busy={busy} onPress={() => act(item, 'pause')} />
                  <Action label="⏹ Stop" color="#dc2626" busy={busy} onPress={() => act(item, 'stop')} />
                </>
              )}
              {paused && (
                <>
                  <Action label="▶ Resume" color="#16a34a" busy={busy} onPress={() => act(item, 'resume')} />
                  <Action label="⏹ Stop" color="#dc2626" busy={busy} onPress={() => act(item, 'stop')} />
                </>
              )}
            </View>
          </Pressable>
        );
      }}
    />
  );
}

function Action({ label, color, busy, onPress }: {
  label: string;
  color: string;
  busy: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={busy}
      onPress={onPress}
      style={[styles.action, { backgroundColor: color, opacity: busy ? 0.6 : 1 }]}
    >
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, gap: 12, flexGrow: 1 },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 48 },
  timer: { fontSize: 20, fontWeight: '800', marginTop: 4 },
  barTrack: { height: 6, backgroundColor: '#eef0f4', borderRadius: 3, overflow: 'hidden', marginTop: 6 },
  barFill: { height: 6, backgroundColor: '#6d28d9', borderRadius: 3 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  action: { flex: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  actionText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
