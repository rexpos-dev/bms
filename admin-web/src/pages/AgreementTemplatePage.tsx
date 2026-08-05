import { type FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { AgreementVersion } from '../lib/types';
import { KNOWN_TOKENS, findUnknownTokens } from '../components/print/agreement-template.util';

type SectionRow = { heading: string; body: string };

const TOKEN_HELP: Record<string, string> = {
  date: 'Job order date, e.g. 27th of July 2026',
  client_name: 'Client business name (bold)',
  client_address: 'Client address',
  client_owner: 'Client owner name',
  package_label: 'e.g. ONE (1) POS Complete Set with accessories (bold)',
  main_set_items: 'Main-set items — a numbered list when alone on a line',
  accessory_items: 'Accessory items — a numbered list when alone on a line',
  company_name: 'Your business name from Company Profile (bold)',
  company_address: 'Your address from Company Profile',
};

export function AgreementTemplatePage() {
  const qc = useQueryClient();
  const [sections, setSections] = useState<SectionRow[] | null>(null);
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState('');

  const templateQuery = useQuery({
    queryKey: ['agreement-template'],
    queryFn: async () => (await api.get<AgreementVersion | null>('/agreement-template')).data,
  });

  useEffect(() => {
    if (sections || templateQuery.isLoading) return;
    if (templateQuery.data) {
      setSections(templateQuery.data.sections.map((s) => ({ heading: s.heading, body: s.body })));
    } else if (templateQuery.data === null) {
      // No version exists yet (empty agreement_versions table) — seed a single
      // empty section so the owner can author the first version.
      setSections([{ heading: '', body: '' }]);
    }
  }, [templateQuery.data, templateQuery.isLoading, sections]);

  const save = useMutation({
    mutationFn: async () =>
      (await api.post<AgreementVersion>('/agreement-template', { sections, note: note || undefined })).data,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['agreement-template'] });
      qc.invalidateQueries({ queryKey: ['agreement-versions'] });
      setSections(data.sections.map((s) => ({ heading: s.heading, body: s.body })));
      setNote('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  if (templateQuery.isLoading || !sections) {
    return <p style={{ color: 'var(--text-muted)' }}>Loading template…</p>;
  }

  const unknown = findUnknownTokens(sections);

  const update = (index: number, patch: Partial<SectionRow>) =>
    setSections(sections.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    setSections(next);
  };

  const remove = (index: number) => setSections(sections.filter((_, i) => i !== index));
  const add = () => setSections([...sections, { heading: '', body: '' }]);

  const copyToken = (token: string) => {
    navigator.clipboard
      .writeText(`{{${token}}}`)
      .then(() => {
        setCopied(token);
        setTimeout(() => setCopied(''), 1500);
      })
      .catch(() => {
        // Clipboard writes can reject (e.g. page not focused) — the chip simply
        // won't show "copied!"; there is nothing else useful to do here.
      });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  return (
    <form onSubmit={onSubmit}>
      <p style={{ color: 'var(--text-muted)', marginTop: 0, fontSize: '0.85rem' }}>
        Printed when “Include Service Agreement” is ticked on a Job Order. Saving creates a new
        version; job orders already printed keep the version they were signed under.
      </p>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <strong style={{ fontSize: '0.85rem' }}>Placeholders</strong>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>
          {KNOWN_TOKENS.map((token) => (
            <button
              key={token}
              type="button"
              onClick={() => copyToken(token)}
              title={TOKEN_HELP[token]}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '0.2rem 0.5rem',
                fontFamily: 'monospace',
                fontSize: '0.78rem',
                color: copied === token ? 'var(--success)' : 'var(--accent)',
                cursor: 'pointer',
              }}
            >
              {copied === token ? 'copied!' : `{{${token}}}`}
            </button>
          ))}
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: '0.6rem 0 0' }}>
          A blank line starts a paragraph. A list token alone on its line becomes a numbered list.
          A line containing “ | ” becomes columns — use it for the signature block.
        </p>
      </div>

      {sections.map((section, i) => (
        <div className="card" key={i} style={{ marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
            <input
              value={section.heading}
              placeholder="Heading — leave empty for the preamble or signature block"
              style={{ flex: 1, fontWeight: 600 }}
              onChange={(e) => update(i, { heading: e.target.value })}
            />
            <button type="button" className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.5rem' }} onClick={() => move(i, -1)} disabled={i === 0} title="Move up">↑</button>
            <button type="button" className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.5rem' }} onClick={() => move(i, 1)} disabled={i === sections.length - 1} title="Move down">↓</button>
            <button
              type="button"
              onClick={() => remove(i)}
              disabled={sections.length === 1}
              title={sections.length === 1 ? 'The agreement needs at least one section' : 'Remove section'}
              style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '1.1rem' }}
            >×</button>
          </div>
          <textarea
            value={section.body}
            rows={Math.min(20, Math.max(4, section.body.split('\n').length + 1))}
            style={{ width: '100%', fontFamily: 'inherit', fontSize: '0.85rem', lineHeight: 1.5 }}
            onChange={(e) => update(i, { body: e.target.value })}
          />
        </div>
      ))}

      <button type="button" className="btn btn-secondary" style={{ fontSize: '0.85rem' }} onClick={add}>
        + Add section
      </button>

      {unknown.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--danger)', marginTop: '1rem' }}>
          <strong style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>Unknown placeholders</strong>
          <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.2rem', fontSize: '0.82rem' }}>
            {unknown.map((u, i) => (
              <li key={i}>
                <code>{u.token}</code> in “{u.heading || 'untitled section'}” — it will print exactly as
                written.
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '1.25rem', flexWrap: 'wrap' }}>
        <input
          value={note}
          placeholder="What changed? (optional)"
          style={{ flex: 1, minWidth: 220 }}
          onChange={(e) => setNote(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save as new version'}
        </button>
        {saved && <span style={{ color: 'var(--success)', fontSize: '0.85rem' }}>Saved.</span>}
        {save.isError && <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>Could not save.</span>}
      </div>
    </form>
  );
}
