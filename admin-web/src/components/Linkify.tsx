import React from 'react';

/** Bare URLs (http/https) and www.-prefixed hosts inside free text. */
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
/** Punctuation that usually ends the sentence rather than the URL. */
const TRAILING_PUNCTUATION = '.,;:!?)]}\'"';

function countChar(text: string, char: string) {
  let n = 0;
  for (const c of text) if (c === char) n += 1;
  return n;
}

/** Drops sentence punctuation glued to the end of a URL, but keeps a ")" that
 *  closes a "(" belonging to the link itself (e.g. wiki-style URLs). */
function trimTrailingPunctuation(url: string) {
  let out = url;
  while (out.length > 0) {
    const last = out[out.length - 1];
    if (!TRAILING_PUNCTUATION.includes(last)) break;
    if (last === ')' && countChar(out, '(') >= countChar(out, ')')) break;
    out = out.slice(0, -1);
  }
  return out;
}

/**
 * Renders plain text with any URLs in it turned into clickable links.
 * Text is still rendered as text — nothing is interpreted as HTML — and only
 * http/https targets are ever linked.
 */
export function Linkify({ text }: { text: string }) {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  URL_PATTERN.lastIndex = 0;
  while ((match = URL_PATTERN.exec(text)) !== null) {
    const url = trimTrailingPunctuation(match[0]);
    if (!url) continue;

    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    nodes.push(
      <a
        key={`${match.index}-${url}`}
        className="inline-link"
        href={url.toLowerCase().startsWith('www.') ? `https://${url}` : url}
        target="_blank"
        rel="noopener noreferrer nofollow"
      >
        {url}
      </a>,
    );
    lastIndex = match.index + url.length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return <>{nodes}</>;
}
