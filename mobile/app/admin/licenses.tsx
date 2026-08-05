import { Text, View } from 'react-native';
import { AdminList, cardStyles as s } from '@/AdminList';
import { licenseDates, type Tone } from '@/license-dates';
import type { License } from '@/types';

const STATUS_COLOR: Record<string, string> = {
  ACTIVATED: '#16a34a', PENDING: '#d97706', EXPIRED: '#dc2626', SUSPENDED: '#6b7280',
};

const TONE_COLOR: Record<Tone, string> = {
  normal: '#111827', muted: '#6b7280', danger: '#dc2626',
};

function LicenseDateLines({ license }: { license: License }) {
  const d = licenseDates(license);
  return (
    <>
      <Text style={[s.meta, { color: TONE_COLOR[d.installedTone] }]}>Installed: {d.installed}</Text>
      <Text style={[s.meta, { color: TONE_COLOR[d.expiresTone] }]}>
        Expires: {d.expires}
        {d.expiresNote ? (
          <Text style={{ color: TONE_COLOR[d.expiresNoteTone] }}> · {d.expiresNote}</Text>
        ) : null}
      </Text>
    </>
  );
}

export default function LicensesScreen() {
  return (
    <AdminList<License>
      url="/licenses"
      keyExtractor={(l) => l.id}
      emptyText="No licenses yet."
      renderItem={(l) => (
        <View style={s.card}>
          <View style={s.row}>
            <Text style={s.title} numberOfLines={1}>{l.client?.businessName ?? 'Client'}</Text>
            <View style={[s.badge, { backgroundColor: STATUS_COLOR[l.status] ?? '#6b7280' }]}>
              <Text style={s.badgeText}>{l.status}</Text>
            </View>
          </View>
          <Text style={s.meta}>{l.product?.productName ?? '—'}</Text>
          <Text style={[s.meta, { fontFamily: 'monospace' }]} numberOfLines={1}>{l.licenseKey}</Text>
          <LicenseDateLines license={l} />
        </View>
      )}
    />
  );
}
