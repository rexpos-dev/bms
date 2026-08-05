import { derivePackageLabel, groupByTier, itemLabel, type WarrantyItem } from './warranty.util';

export interface TemplateSection {
  heading: string;
  body: string;
}

export interface AgreementValues {
  /** ISO timestamp of the job order; the current date when absent. */
  date?: string | null;
  clientName?: string | null;
  clientAddress?: string | null;
  clientOwner?: string | null;
  companyName?: string | null;
  companyAddress?: string | null;
  items: WarrantyItem[];
}

export interface Inline {
  text: string;
  bold: boolean;
}

export type Line = Inline[];
export type Row = Line[];

export type Block =
  | { kind: 'paragraph'; lines: Line[] }
  | { kind: 'list'; items: string[] }
  | { kind: 'columns'; rows: Row[] };

export interface ResolvedSection {
  heading: string;
  blocks: Block[];
}

export interface UnknownToken {
  sectionIndex: number;
  heading: string;
  token: string;
}

export interface ResolveResult {
  sections: ResolvedSection[];
  unknown: UnknownToken[];
}

/** A value that could not be filled in, left as a rule to complete by hand. */
export const BLANK = '__________';

export const KNOWN_TOKENS: readonly string[] = [
  'date',
  'client_name',
  'client_address',
  'client_owner',
  'package_label',
  'main_set_items',
  'accessory_items',
  'company_name',
  'company_address',
];

const BOLD_TOKENS: readonly string[] = ['client_name', 'company_name', 'package_label'];

const TOKEN_RE = /\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g;

/** A list token alone on its line expands to a block rather than inline text. */
const LIST_LINE_RE = /^\{\{\s*(main_set_items|accessory_items)\s*\}\}$/;

const COLUMN_SEP = ' | ';

const AGREEMENT_TIME_ZONE = 'Asia/Manila';

function ordinalDate(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  // An unparseable date is a missing value: returning empty lets toLine's
  // existing rule render the blank rule, rather than throwing out of
  // Intl.formatToParts and taking the whole agreement render with it.
  if (Number.isNaN(d.getTime())) return '';
  // The agreement is dated where it is signed. Reading the browser's local
  // calendar day would misdate it by one whenever the viewer sits outside
  // UTC+8, so the Philippine date is pinned explicitly.
  const parts = new Intl.DateTimeFormat('en-PH', {
    timeZone: AGREEMENT_TIME_ZONE,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).formatToParts(d);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';

  const day = Number(part('day'));
  const tens = day % 100;
  const suffix =
    tens >= 11 && tens <= 13
      ? 'th'
      : day % 10 === 1
        ? 'st'
        : day % 10 === 2
          ? 'nd'
          : day % 10 === 3
            ? 'rd'
            : 'th';

  return `${day}${suffix} of ${part('month')} ${part('year')}`;
}

function tokenValue(token: string, values: AgreementValues): string | null | undefined {
  switch (token) {
    case 'date':
      return ordinalDate(values.date);
    case 'client_name':
      return values.clientName;
    case 'client_address':
      return values.clientAddress;
    case 'client_owner':
      return values.clientOwner;
    case 'company_name':
      return values.companyName;
    case 'company_address':
      return values.companyAddress;
    case 'package_label':
      return derivePackageLabel(values.items);
    case 'main_set_items':
      return groupByTier(values.items).mainSet.map(itemLabel).join(', ');
    case 'accessory_items':
      return groupByTier(values.items).accessory.map(itemLabel).join(', ');
    default:
      return undefined;
  }
}

interface Ctx {
  sectionIndex: number;
  heading: string;
  values: AgreementValues;
  unknown: UnknownToken[];
}

function toLine(text: string, ctx: Ctx): Line {
  const out: Line = [];
  let last = 0;
  TOKEN_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = TOKEN_RE.exec(text)) !== null) {
    if (match.index > last) out.push({ text: text.slice(last, match.index), bold: false });

    const token = match[1];
    if (!KNOWN_TOKENS.includes(token)) {
      // Rendered verbatim so the typo is visible on screen instead of silently blank.
      ctx.unknown.push({ sectionIndex: ctx.sectionIndex, heading: ctx.heading, token: match[0] });
      out.push({ text: match[0], bold: false });
    } else {
      const raw = tokenValue(token, ctx.values);
      const filled = raw && raw.trim() ? raw : BLANK;
      out.push({ text: filled, bold: BOLD_TOKENS.includes(token) && filled !== BLANK });
    }

    last = match.index + match[0].length;
  }

  if (last < text.length) out.push({ text: text.slice(last), bold: false });
  return out.length > 0 ? out : [{ text: '', bold: false }];
}

function parseBody(body: string, ctx: Ctx): Block[] {
  const blocks: Block[] = [];
  let paragraph: Line[] = [];
  let columns: Row[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', lines: paragraph });
      paragraph = [];
    }
  };
  const flushColumns = () => {
    if (columns.length > 0) {
      blocks.push({ kind: 'columns', rows: columns });
      columns = [];
    }
  };

  for (const raw of body.split('\n')) {
    const line = raw.trim();

    if (line === '') {
      flushParagraph();
      flushColumns();
      continue;
    }

    const listMatch = line.match(LIST_LINE_RE);
    if (listMatch) {
      flushParagraph();
      flushColumns();
      const groups = groupByTier(ctx.values.items);
      const group = listMatch[1] === 'main_set_items' ? groups.mainSet : groups.accessory;
      if (group.length === 0) {
        blocks.push({ kind: 'paragraph', lines: [[{ text: 'No items listed.', bold: false }]] });
      } else {
        blocks.push({ kind: 'list', items: group.map(itemLabel) });
      }
      continue;
    }

    if (line.includes(COLUMN_SEP)) {
      flushParagraph();
      columns.push(line.split(COLUMN_SEP).map((cell) => toLine(cell, ctx)));
      continue;
    }

    flushColumns();
    paragraph.push(toLine(line, ctx));
  }

  flushParagraph();
  flushColumns();
  return blocks;
}

export function resolveSections(sections: TemplateSection[], values: AgreementValues): ResolveResult {
  const unknown: UnknownToken[] = [];
  const resolved = sections.map((section, sectionIndex) => ({
    heading: section.heading,
    blocks: parseBody(section.body, { sectionIndex, heading: section.heading, values, unknown }),
  }));
  return { sections: resolved, unknown };
}

/** The Settings editor's check — the same scan without needing a job order. */
export function findUnknownTokens(sections: TemplateSection[]): UnknownToken[] {
  const unknown: UnknownToken[] = [];
  sections.forEach((section, sectionIndex) => {
    TOKEN_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = TOKEN_RE.exec(section.body)) !== null) {
      if (!KNOWN_TOKENS.includes(match[1])) {
        unknown.push({ sectionIndex, heading: section.heading, token: match[0] });
      }
    }
  });
  return unknown;
}
