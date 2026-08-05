import {
  resolveSections,
  type AgreementValues,
  type Block,
  type Line,
  type TemplateSection,
} from './agreement-template.util';

export interface ServiceAgreementProps {
  sections: TemplateSection[];
  values: AgreementValues;
}

const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];

const S = {
  page: {
    fontFamily: 'Arial, sans-serif',
    color: '#000',
    fontSize: '11pt',
    lineHeight: 1.5,
    // Inline rather than in the print stylesheet: html2pdf reads computed
    // styles from the live screen document, where an @media print rule is
    // invisible. Without this the PDF starts the agreement mid-page.
    pageBreakBefore: 'always' as const,
    breakBefore: 'page' as const,
  },
  title: { fontSize: '14pt', fontWeight: 'bold' as const, textAlign: 'center' as const, marginBottom: '14pt' },
  heading: { fontWeight: 'bold' as const, fontSize: '11.5pt', marginTop: '12pt', marginBottom: '4pt' },
  para: { marginBottom: '8pt', textAlign: 'justify' as const },
  list: { margin: '4pt 0 8pt 18pt' },
  columns: { display: 'grid', gap: '24pt', marginTop: '8pt' },
};

function InlineRun({ line }: { line: Line }) {
  return (
    <>
      {line.map((piece, i) =>
        piece.bold ? <strong key={i}>{piece.text}</strong> : <span key={i}>{piece.text}</span>,
      )}
    </>
  );
}

function BlockView({ block }: { block: Block }) {
  if (block.kind === 'paragraph') {
    return (
      <p style={S.para}>
        {block.lines.map((line, i) => (
          <span key={i}>
            {i > 0 && <br />}
            <InlineRun line={line} />
          </span>
        ))}
      </p>
    );
  }

  if (block.kind === 'list') {
    return (
      <div style={S.list}>
        {block.items.map((text, i) => (
          <div key={i}>
            {ROMAN[i] ?? i + 1}. {text}
          </div>
        ))}
      </div>
    );
  }

  // Column count comes from the widest row, so a short row simply leaves a gap.
  const columnCount = Math.max(...block.rows.map((r) => r.length));
  return (
    <div style={{ ...S.columns, gridTemplateColumns: `repeat(${columnCount}, 1fr)` }}>
      {block.rows.map((row, r) =>
        Array.from({ length: columnCount }, (_, c) => (
          <div key={`${r}-${c}`}>{row[c] ? <InlineRun line={row[c]} /> : null}</div>
        )),
      )}
    </div>
  );
}

/**
 * The Service Level Agreement pages appended to a printed job order.
 * Purely presentational — every decision lives in resolveSections.
 */
export function ServiceAgreement({ sections, values }: ServiceAgreementProps) {
  const resolved = resolveSections(sections, values);

  return (
    <div className="agreement-page" style={S.page}>
      <div style={S.title}>SERVICE LEVEL AGREEMENT</div>
      {resolved.sections.map((section, i) => (
        <div key={i}>
          {section.heading && <div style={S.heading}>{section.heading}</div>}
          {section.blocks.map((block, b) => (
            <BlockView key={b} block={block} />
          ))}
        </div>
      ))}
    </div>
  );
}
