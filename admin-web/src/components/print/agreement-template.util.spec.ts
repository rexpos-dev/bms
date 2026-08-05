import { describe, expect, it } from 'vitest';
import {
  BLANK,
  findUnknownTokens,
  resolveSections,
  type AgreementValues,
  type Block,
} from './agreement-template.util';
import type { WarrantyItem } from './warranty.util';

const item = (name: string, warrantyTier: WarrantyItem['warrantyTier'], quantity = 1): WarrantyItem => ({
  name,
  quantity,
  warrantyTier,
});

const values = (over: Partial<AgreementValues> = {}): AgreementValues => ({
  date: '2026-07-27T02:00:00.000Z',
  clientName: 'A & R SPORTS CLUB',
  clientAddress: 'Purok 11, Bislig City',
  clientOwner: 'Juan Dela Cruz',
  companyName: 'Beulah ITS',
  companyAddress: 'Tagum City',
  items: [item('System Unit', 'MAIN_SET'), item('Cash Drawer', 'ACCESSORY')],
  ...over,
});

const one = (body: string, over: Partial<AgreementValues> = {}): Block[] =>
  resolveSections([{ heading: 'H', body }], values(over)).sections[0].blocks;

const flat = (blocks: Block[]): string =>
  blocks
    .map((b) =>
      b.kind === 'paragraph'
        ? b.lines.map((l) => l.map((i) => i.text).join('')).join('\n')
        : b.kind === 'list'
          ? b.items.join(' / ')
          : b.rows.map((r) => r.map((c) => c.map((i) => i.text).join('')).join(' | ')).join('\n'),
    )
    .join('\n\n');

describe('scalar placeholders', () => {
  it('substitutes every known token', () => {
    const blocks = one('{{client_name}} of {{client_address}}, owner {{client_owner}}, by {{company_name}} of {{company_address}}');
    expect(flat(blocks)).toBe(
      'A & R SPORTS CLUB of Purok 11, Bislig City, owner Juan Dela Cruz, by Beulah ITS of Tagum City',
    );
  });

  it('formats the date with an ordinal day', () => {
    expect(flat(one('signed {{date}}'))).toBe('signed 27th of July 2026');
  });

  it('uses st, nd and rd suffixes', () => {
    expect(flat(one('{{date}}', { date: '2026-07-01T02:00:00.000Z' }))).toBe('1st of July 2026');
    expect(flat(one('{{date}}', { date: '2026-07-02T02:00:00.000Z' }))).toBe('2nd of July 2026');
    expect(flat(one('{{date}}', { date: '2026-07-23T02:00:00.000Z' }))).toBe('23rd of July 2026');
    expect(flat(one('{{date}}', { date: '2026-07-11T02:00:00.000Z' }))).toBe('11th of July 2026');
  });

  it('dates the agreement in Manila, not in the viewer timezone', () => {
    // Both instants are 27 July in Manila but 26 and 27 July in UTC.
    expect(flat(one('{{date}}', { date: '2026-07-26T19:00:00.000Z' }))).toBe('27th of July 2026');
    expect(flat(one('{{date}}', { date: '2026-07-27T15:00:00.000Z' }))).toBe('27th of July 2026');
  });

  it('renders the blank rule for an unparseable date instead of throwing', () => {
    expect(flat(one('{{date}}', { date: 'not-a-date' }))).toBe(BLANK);
  });

  it('derives the package label from the items', () => {
    expect(flat(one('for {{package_label}}.'))).toBe('for ONE (1) POS Complete Set with accessories.');
  });

  it('renders the blank rule when a value is missing', () => {
    expect(flat(one('at {{client_address}}', { clientAddress: null }))).toBe(`at ${BLANK}`);
  });

  it('renders the blank rule when a value is only whitespace', () => {
    expect(flat(one('at {{client_address}}', { clientAddress: '   ' }))).toBe(`at ${BLANK}`);
  });
});

describe('bold tokens', () => {
  it('bolds the client name, company name and package label', () => {
    const [block] = one('{{client_name}} and {{company_name}} for {{package_label}}');
    if (block.kind !== 'paragraph') throw new Error('expected a paragraph');
    expect(block.lines[0].filter((i) => i.bold).map((i) => i.text)).toEqual([
      'A & R SPORTS CLUB',
      'Beulah ITS',
      'ONE (1) POS Complete Set with accessories',
    ]);
  });

  it('does not bold a blank rule', () => {
    const [block] = one('{{client_name}}', { clientName: null });
    if (block.kind !== 'paragraph') throw new Error('expected a paragraph');
    expect(block.lines[0]).toEqual([{ text: BLANK, bold: false }]);
  });

  it('leaves other tokens unbolded', () => {
    const [block] = one('{{client_owner}}');
    if (block.kind !== 'paragraph') throw new Error('expected a paragraph');
    expect(block.lines[0]).toEqual([{ text: 'Juan Dela Cruz', bold: false }]);
  });
});

describe('unknown tokens', () => {
  it('renders an unknown token verbatim', () => {
    expect(flat(one('hello {{cleint_name}}'))).toBe('hello {{cleint_name}}');
  });

  it('reports an unknown token with its section', () => {
    const result = resolveSections(
      [{ heading: 'A', body: 'ok' }, { heading: 'B', body: '{{nope}} and {{alsonope}}' }],
      values(),
    );
    expect(result.unknown).toEqual([
      { sectionIndex: 1, heading: 'B', token: '{{nope}}' },
      { sectionIndex: 1, heading: 'B', token: '{{alsonope}}' },
    ]);
  });

  it('findUnknownTokens reports the same without needing values', () => {
    expect(findUnknownTokens([{ heading: 'B', body: 'x {{nope}} y' }])).toEqual([
      { sectionIndex: 0, heading: 'B', token: '{{nope}}' },
    ]);
  });

  it('findUnknownTokens returns nothing for a clean template', () => {
    expect(findUnknownTokens([{ heading: 'B', body: '{{client_name}} {{date}}' }])).toEqual([]);
  });
});

describe('paragraphs and line breaks', () => {
  it('starts a new paragraph at a blank line', () => {
    const blocks = one('first\n\nsecond');
    expect(blocks).toHaveLength(2);
    expect(blocks.every((b) => b.kind === 'paragraph')).toBe(true);
  });

  it('keeps single newlines as line breaks inside one paragraph', () => {
    const [block] = one('a) one\nb) two\nc) three');
    if (block.kind !== 'paragraph') throw new Error('expected a paragraph');
    expect(block.lines).toHaveLength(3);
  });

  it('ignores trailing and repeated blank lines', () => {
    expect(one('only\n\n\n\n')).toHaveLength(1);
  });
});

describe('item lists', () => {
  it('expands a list token alone on a line into a list block', () => {
    const blocks = one('{{main_set_items}}', {
      items: [item('System Unit', 'MAIN_SET'), item('Monitor', 'MAIN_SET', 2)],
    });
    expect(blocks).toEqual([{ kind: 'list', items: ['System Unit', 'Monitor (2)'] }]);
  });

  it('renders "No items listed." when the group is empty', () => {
    expect(flat(one('{{accessory_items}}', { items: [] }))).toBe('No items listed.');
  });

  it('renders a comma-separated run when used inline', () => {
    expect(flat(one('covering {{main_set_items}} only', {
      items: [item('System Unit', 'MAIN_SET'), item('Monitor', 'MAIN_SET')],
    }))).toBe('covering System Unit, Monitor only');
  });

  it('renders the blank rule for an empty group used inline', () => {
    expect(flat(one('covering {{main_set_items}} only', { items: [] }))).toBe(`covering ${BLANK} only`);
  });

  it('excludes NONE-tier items from the list', () => {
    const blocks = one('{{main_set_items}}', {
      items: [item('System Unit', 'MAIN_SET'), item('Thermal Paper', 'NONE')],
    });
    expect(blocks).toEqual([{ kind: 'list', items: ['System Unit'] }]);
  });
});

describe('two-column lines', () => {
  it('turns a piped line into a columns block', () => {
    const blocks = one('left | right');
    expect(blocks).toEqual([
      { kind: 'columns', rows: [[[{ text: 'left', bold: false }], [{ text: 'right', bold: false }]]] },
    ]);
  });

  it('groups consecutive piped lines into one block', () => {
    const [block] = one('a | b\nc | d');
    if (block.kind !== 'columns') throw new Error('expected columns');
    expect(block.rows).toHaveLength(2);
  });

  it('splits a piped line into more than two columns', () => {
    const [block] = one('a | b | c');
    if (block.kind !== 'columns') throw new Error('expected columns');
    expect(block.rows[0]).toHaveLength(3);
  });

  it('resolves placeholders inside a column', () => {
    expect(flat(one('Michel | {{client_owner}}'))).toBe('Michel | Juan Dela Cruz');
  });

  it('ends the columns block at a plain line', () => {
    const blocks = one('a | b\nplain');
    expect(blocks.map((b) => b.kind)).toEqual(['columns', 'paragraph']);
  });

  it('does not treat a bare pipe without spaces as a column split', () => {
    expect(flat(one('a|b'))).toBe('a|b');
  });
});

describe('resolveSections', () => {
  it('preserves the heading and the section order', () => {
    const result = resolveSections(
      [{ heading: 'I. FIRST', body: 'x' }, { heading: '', body: 'y' }],
      values(),
    );
    expect(result.sections.map((s) => s.heading)).toEqual(['I. FIRST', '']);
  });

  it('returns no blocks for an empty body', () => {
    expect(resolveSections([{ heading: 'H', body: '' }], values()).sections[0].blocks).toEqual([]);
  });
});
