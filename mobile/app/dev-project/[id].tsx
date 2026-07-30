import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api } from '@/api';
import { useAuth } from '@/auth';
import { cardStyles as s } from '@/AdminList';
import {
  STATUS_COLORS,
  computeProgress,
  daysRemaining,
  formatDuration,
  formatMinutes,
  isPaused,
  isRunning,
  liveSeconds,
  progressBasis,
  statusLabel,
} from '@/dev-projects';
import type { ChecklistItem, DevProject, DevProjectReport } from '@/types';

export default function DevProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const [project, setProject] = useState<DevProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<DevProject>(`/dev-projects/${id}`);
      setProject(res.data);
    } catch {
      Alert.alert('Error', 'Could not load this project.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  // Keep the live timer ticking while the project is running.
  const running = !!project && isRunning(project);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  const act = async (action: 'start' | 'pause' | 'resume' | 'stop') => {
    if (!project) return;
    setBusy(true);
    try {
      const res = await api.post<DevProject>(`/dev-projects/${project.id}/${action}`);
      setProject(res.data);
    } catch {
      Alert.alert('Error', `Could not ${action} this project.`);
    } finally {
      setBusy(false);
    }
  };

  /** Patch one checklist item; the API returns the whole refreshed project. */
  const patchItem = async (reportId: string, index: number, body: { done?: boolean; note?: string }) => {
    setBusy(true);
    try {
      const res = await api.patch<DevProject>(`/dev-projects/reports/${reportId}/checklist`, {
        index,
        ...body,
      });
      setProject(res.data);
    } catch {
      Alert.alert('Error', 'Could not save that change.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6d28d9" />
      </View>
    );
  }
  if (!project) {
    return <View style={{ padding: 16 }}><Text>Project not found.</Text></View>;
  }

  const paused = isPaused(project);
  const percent = computeProgress(project);
  const days = daysRemaining(project);
  const canEdit = (r: DevProjectReport) => user?.role === 'SUPER_ADMIN' || r.authorId === user?.id;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      {/* Summary + timer */}
      <View style={s.card}>
        <View style={s.row}>
          <Text style={[s.title, { flex: 1 }]}>{project.name}</Text>
          <View style={[s.badge, { backgroundColor: STATUS_COLORS[project.status] }]}>
            <Text style={s.badgeText}>{paused ? 'PAUSED' : statusLabel(project.status)}</Text>
          </View>
        </View>

        <Text style={[styles.timer, { color: running ? '#16a34a' : '#6b7280' }]}>
          {formatDuration(liveSeconds(project))}
        </Text>
        <Text style={s.meta}>
          {project.targetHours
            ? `${(project.totalMinutes / 60).toFixed(1)}h / ${project.targetHours}h tracked`
            : `${formatMinutes(project.totalMinutes)} tracked`}
        </Text>

        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${percent}%` }]} />
        </View>
        <Text style={s.meta}>{percent}% complete · {progressBasis(project)}</Text>

        <View style={styles.actions}>
          {project.status !== 'COMPLETED' && !running && !paused && (
            <Action label="▶ Start" color="#16a34a" busy={busy} onPress={() => act('start')} />
          )}
          {running && (
            <>
              <Action label="⏸ Pause" color="#d97706" busy={busy} onPress={() => act('pause')} />
              <Action label="⏹ Stop" color="#dc2626" busy={busy} onPress={() => act('stop')} />
            </>
          )}
          {paused && (
            <>
              <Action label="▶ Resume" color="#16a34a" busy={busy} onPress={() => act('resume')} />
              <Action label="⏹ Stop" color="#dc2626" busy={busy} onPress={() => act('stop')} />
            </>
          )}
        </View>
      </View>

      {/* Timeframe */}
      {(project.projectStart || project.projectDeadline) && (
        <View style={s.card}>
          <Text style={s.title}>Timeframe</Text>
          <Text style={s.meta}>
            Start: {project.projectStart ? new Date(project.projectStart).toLocaleDateString() : 'Not set'}
          </Text>
          <Text style={s.meta}>
            Deadline: {project.projectDeadline ? new Date(project.projectDeadline).toLocaleDateString() : 'Not set'}
            {days !== null && (
              <Text style={{ color: days < 0 ? '#dc2626' : days <= 7 ? '#d97706' : '#16a34a', fontWeight: '700' }}>
                {days < 0 ? `  ${Math.abs(days)}d overdue` : `  ${days}d left`}
              </Text>
            )}
          </Text>
        </View>
      )}

      {project.description ? (
        <View style={s.card}>
          <Text style={s.title}>Description</Text>
          <Text style={s.meta}>{project.description}</Text>
        </View>
      ) : null}

      {/* Reports with tickable checklists */}
      <Text style={styles.heading}>Reports</Text>
      {(!project.reports || project.reports.length === 0) && (
        <Text style={styles.empty}>No reports yet. Post one from the web app.</Text>
      )}
      {project.reports?.map((report) => (
        <View key={report.id} style={s.card}>
          <View style={s.row}>
            <Text style={[s.title, { flex: 1 }]}>{report.title}</Text>
            <View style={[s.badge, { backgroundColor: report.status === 'REVIEWED' ? '#2563eb' : '#d97706' }]}>
              <Text style={s.badgeText}>{report.status}</Text>
            </View>
          </View>
          <Text style={s.meta}>
            {report.author?.fullName ?? 'Unknown'} · {new Date(report.createdAt).toLocaleDateString()}
            {report.taggedAdmin ? ` · Tagged: ${report.taggedAdmin.fullName}` : ''}
          </Text>

          {report.checklist.length > 0 && (
            <Checklist
              items={report.checklist}
              editable={canEdit(report)}
              busy={busy}
              onToggle={(index, done) => patchItem(report.id, index, { done })}
              onSaveNote={(index, note) => patchItem(report.id, index, { note })}
            />
          )}

          {report.comment ? <Text style={[s.meta, { marginTop: 6 }]}>{report.comment}</Text> : null}

          {report.feedback?.map((f) => (
            <View key={f.id} style={styles.feedback}>
              <Text style={styles.feedbackAuthor}>
                {f.author?.fullName ?? 'Admin'} · {new Date(f.createdAt).toLocaleDateString()}
              </Text>
              <Text style={s.meta}>{f.message}</Text>
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

/**
 * A posted report's checklist. The report's author (or a super admin) can tick
 * items and attach a note; the tick date and who ticked it come from the API.
 */
function Checklist({ items, editable, busy, onToggle, onSaveNote }: {
  items: ChecklistItem[];
  editable: boolean;
  busy: boolean;
  onToggle: (index: number, done: boolean) => void;
  onSaveNote: (index: number, note: string) => void;
}) {
  const [noteIndex, setNoteIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const doneCount = items.filter((i) => i.done).length;

  return (
    <View style={{ marginTop: 8, gap: 8 }}>
      <Text style={styles.checklistHeading}>Checklist — {doneCount}/{items.length} done</Text>

      {items.map((item, i) => (
        <View key={i} style={{ gap: 2 }}>
          <Pressable
            disabled={!editable || busy}
            onPress={() => onToggle(i, !item.done)}
            style={styles.itemRow}
          >
            <View style={[styles.box, item.done && styles.boxChecked, !editable && { opacity: 0.6 }]}>
              {item.done && <Text style={styles.check}>✓</Text>}
            </View>
            <Text
              style={[
                styles.itemLabel,
                item.done && { textDecorationLine: 'line-through', color: '#111827' },
              ]}
            >
              {item.label}
            </Text>
          </Pressable>

          <View style={{ paddingLeft: 30, gap: 2 }}>
            {item.done && item.doneAt ? (
              <Text style={styles.stamp}>
                ✓ {new Date(item.doneAt).toLocaleString()}
                {item.doneBy ? <Text style={styles.stampBy}> · {item.doneBy}</Text> : null}
              </Text>
            ) : null}

            {noteIndex === i ? (
              <View style={{ gap: 6, marginTop: 2 }}>
                <TextInput
                  autoFocus
                  value={draft}
                  maxLength={500}
                  onChangeText={setDraft}
                  placeholder="Note for this item…"
                  style={styles.noteInput}
                />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    disabled={busy}
                    onPress={() => { onSaveNote(i, draft); setNoteIndex(null); }}
                    style={styles.noteSave}
                  >
                    <Text style={styles.noteSaveText}>{busy ? 'Saving…' : 'Save'}</Text>
                  </Pressable>
                  <Pressable onPress={() => setNoteIndex(null)} style={{ paddingVertical: 6, paddingHorizontal: 10 }}>
                    <Text style={{ fontSize: 12, color: '#6b7280' }}>Cancel</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {item.note ? <Text style={styles.note}>“{item.note}”</Text> : null}
                {editable && (
                  <Pressable onPress={() => { setNoteIndex(i); setDraft(item.note ?? ''); }}>
                    <Text style={styles.noteAction}>{item.note ? 'Edit note' : 'Add note'}</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        </View>
      ))}
    </View>
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
  empty: { color: '#9ca3af', textAlign: 'center', marginVertical: 12 },
  heading: { fontSize: 16, fontWeight: '700', color: '#111827', marginTop: 6 },
  timer: { fontSize: 26, fontWeight: '800', marginTop: 6 },
  barTrack: { height: 6, backgroundColor: '#eef0f4', borderRadius: 3, overflow: 'hidden', marginTop: 8 },
  barFill: { height: 6, backgroundColor: '#6d28d9', borderRadius: 3 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  action: { flex: 1, borderRadius: 8, paddingVertical: 11, alignItems: 'center' },
  actionText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  checklistHeading: { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  box: {
    width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: '#cbd5e1',
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  boxChecked: { backgroundColor: '#6d28d9', borderColor: '#6d28d9' },
  check: { color: '#fff', fontSize: 13, fontWeight: '900', lineHeight: 16 },
  itemLabel: { flex: 1, fontSize: 14, color: '#6b7280' },
  stamp: { fontSize: 11, color: '#16a34a' },
  stampBy: { color: '#6b7280' },
  note: { fontSize: 12, color: '#6b7280', fontStyle: 'italic' },
  noteAction: { fontSize: 11, color: '#6d28d9', textDecorationLine: 'underline' },
  noteInput: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 8, fontSize: 13 },
  noteSave: { backgroundColor: '#6d28d9', borderRadius: 6, paddingVertical: 6, paddingHorizontal: 14 },
  noteSaveText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  feedback: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#eef0f4' },
  feedbackAuthor: { fontSize: 12, fontWeight: '700', color: '#111827' },
});
