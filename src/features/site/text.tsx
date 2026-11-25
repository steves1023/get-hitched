import { Fragment } from 'react';

/** Plain text with paragraphs and clickable web links. Everything else stays text. */
export function RichText({ text, linkColor }: { text: string; linkColor?: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i} style={{ margin: '0 0 1em' }}>
          {para.split('\n').map((line, j) => (
            <Fragment key={j}>{j > 0 && <br />}{linkify(line, linkColor)}</Fragment>
          ))}
        </p>
      ))}
    </>
  );
}

function linkify(line: string, color?: string) {
  const parts = line.split(/(https?:\/\/[^\s)]+)/g);
  return parts.map((p, i) => /^https?:\/\//.test(p)
    ? <a key={i} href={p} target="_blank" rel="noopener noreferrer" style={{ color, overflowWrap: 'anywhere' }}>{p.replace(/^https?:\/\/(www\.)?/, '')}</a>
    : <Fragment key={i}>{p}</Fragment>);
}

export const safeUrl = (u: string) => (/^https?:\/\//i.test(u.trim()) ? u.trim() : `https://${u.trim()}`);
