import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { FONT_PAIRS, colors, normalizeTheme } from '../features/print/theme';
import type { PartyMember, SiteSections } from '../lib/types';
import { RichText, safeUrl } from '../features/site/text';
import '../features/site/fonts';
import './site.css';

interface Data {
  status: 'ok' | 'draft' | 'closed' | 'missing'; preview?: boolean;
  wedding?: { partner1: string; partner2: string; last_names: string | null; wedding_date: string | null; venue: string | null; theme: unknown };
  site?: { hero_path: string | null; story: string | null; travel: string | null; registry: { name: string; url: string }[]; faq: { q: string; a: string }[];
    party: PartyMember[]; photos: string[]; sections: SiteSections; rsvp_deadline: string | null; rsvp_note: string | null; rsvp_open: boolean };
  schedule?: { start_time: string; title: string; location: string | null; duration_min: number | null; phase: string }[];
}

const PHASES: Record<string, string> = { morning_prep: 'Morning', getting_ready: 'Getting ready', ceremony: 'Ceremony', reception: 'Reception' };
const img = (path: string) => supabase.storage.from('site').getPublicUrl(path).data.publicUrl;
const time12 = (t: string) => { const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };
const longDate = (d: string) => { const [y, m, day] = d.split('-').map(Number); return new Date(y, m - 1, day).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }); };

export default function PublicSite() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    // Keep wedding sites out of search engines.
    const meta = document.createElement('meta'); meta.name = 'robots'; meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    supabase.rpc('get_public_site', { p_slug: slug, p_preview: params.get('preview') === '1' })
      .then(({ data, error }) => setData(error ? { status: 'missing' } : (data as Data)));
    return () => { meta.remove(); };
  }, [slug, params]);

  useEffect(() => {
    if (data?.wedding) document.title = `${data.wedding.partner1} & ${data.wedding.partner2}`;
  }, [data]);

  if (!data) return <div className="ws-blank">Loading…</div>;
  if (data.status !== 'ok') {
    return (
      <div className="ws-blank">
        <h1>{data.status === 'missing' ? 'We couldn’t find that wedding' : data.status === 'closed' ? 'This website has closed' : 'This website isn’t ready yet'}</h1>
        <p>{data.status === 'draft' ? 'The couple is still putting it together. Check back soon.' : 'Double-check the link you were sent.'}</p>
      </div>
    );
  }
  return <Site data={data} slug={slug} />;
}

function Site({ data, slug }: { data: Data; slug: string }) {
  const w = data.wedding!, s = data.site!;
  const theme = normalizeTheme(w.theme);
  const c = colors(theme); const f = FONT_PAIRS[theme.fonts];
  const show = (k: keyof SiteSections) => s.sections?.[k];
  const has = {
    schedule: show('schedule') && (data.schedule?.length ?? 0) > 0,
    story: show('story') && !!s.story?.trim(),
    party: show('party') && s.party.length > 0,
    photos: show('photos') && s.photos.length > 0,
    travel: show('travel') && !!s.travel?.trim(),
    registry: show('registry') && s.registry.length > 0,
    faq: show('faq') && s.faq.length > 0,
    rsvp: show('rsvp'),
  };
  const nav: [keyof typeof has, string][] = [['schedule', 'Schedule'], ['story', 'Our story'], ['party', 'Wedding party'], ['photos', 'Photos'], ['travel', 'Travel'], ['registry', 'Registry'], ['faq', 'FAQ'], ['rsvp', 'RSVP']];
  const days = useMemo(() => {
    if (!w.wedding_date) return null;
    const [y, m, d] = w.wedding_date.split('-').map(Number);
    return Math.ceil((new Date(y, m - 1, d).getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
  }, [w.wedding_date]);
  const vars = { '--ws-bg': c.bg, '--ws-ink': c.ink, '--ws-accent': c.accent, '--ws-soft': c.soft, '--ws-muted': c.muted,
    '--ws-head': `'${f.heading}', Georgia, serif`, '--ws-body': `'${f.body}', Georgia, serif`,
    '--ws-head-weight': f.headingWeight, '--ws-head-case': f.caps ? 'uppercase' : 'none', '--ws-head-track': f.caps ? '.08em' : '0' } as React.CSSProperties;
  const H = ({ id, children }: { id: string; children: React.ReactNode }) => <h2 className={`ws-h2${f.script ? ' script' : ''}`} id={id}>{children}</h2>;

  return (
    <div className="ws" style={vars}>
      {data.preview && <div className="ws-preview">Preview: only you can see this until you publish it.</div>}
      <nav className="ws-nav">
        <a href="#top" className="ws-mono">{w.partner1[0]} &amp; {w.partner2[0]}</a>
        <div>{nav.filter(([k]) => has[k]).map(([k, label]) => <a key={k} href={`#${k}`}>{label}</a>)}</div>
      </nav>

      <header id="top" className={`ws-hero${s.hero_path ? ' photo' : ''}`} style={s.hero_path ? { backgroundImage: `linear-gradient(rgba(0,0,0,.25),rgba(0,0,0,.45)), url("${img(s.hero_path)}")` } : undefined}>
        <h1 className={f.script ? 'script' : ''}>{w.partner1} <span>&amp;</span> {w.partner2}</h1>
        <p className="ws-when">{[w.wedding_date ? longDate(w.wedding_date) : null, w.venue].filter(Boolean).join('  ·  ')}</p>
        {days !== null && days > 0 && <p className="ws-count"><b>{days}</b> {days === 1 ? 'day' : 'days'} to go</p>}
        {has.rsvp && s.rsvp_open && <a className="ws-btn" href="#rsvp">RSVP</a>}
      </header>

      <main>
        {has.schedule && (
          <section className="ws-sec">
            <H id="schedule">Schedule</H>
            {Object.keys(PHASES).filter((p) => data.schedule!.some((d) => d.phase === p)).map((p) => (
              <div key={p} className="ws-phase">
                <h3>{PHASES[p]}</h3>
                {data.schedule!.filter((d) => d.phase === p).map((d, i) => (
                  <div key={i} className="ws-event">
                    <span className="ws-time">{time12(d.start_time)}</span>
                    <div><b>{d.title}</b>{(d.location || d.duration_min) && <div className="ws-muted">{[d.location, d.duration_min ? `${d.duration_min} min` : null].filter(Boolean).join(' · ')}</div>}</div>
                  </div>
                ))}
              </div>
            ))}
          </section>
        )}
        {has.story && <section className="ws-sec narrow"><H id="story">Our story</H><RichText text={s.story!} linkColor={c.accent} /></section>}
        {has.party && (
          <section className="ws-sec">
            <H id="party">Wedding party</H>
            <div className="ws-party">
              {s.party.map((p, i) => (
                <div key={i} className="ws-person">
                  {p.photo ? <img src={img(p.photo)} alt={p.name} loading="lazy" /> : <div className="ws-avatar">{p.name.split(' ').map((x) => x[0]).slice(0, 2).join('')}</div>}
                  <b>{p.name}</b><span className="ws-role">{p.role}</span>{p.blurb && <p>{p.blurb}</p>}
                </div>
              ))}
            </div>
          </section>
        )}
        {has.photos && (
          <section className="ws-sec">
            <H id="photos">Photos</H>
            <div className="ws-photos">{s.photos.map((p) => <a key={p} href={img(p)} target="_blank" rel="noreferrer"><img src={img(p)} alt="" loading="lazy" /></a>)}</div>
          </section>
        )}
        {has.travel && <section className="ws-sec narrow"><H id="travel">Travel &amp; stay</H><RichText text={s.travel!} linkColor={c.accent} /></section>}
        {has.registry && (
          <section className="ws-sec narrow">
            <H id="registry">Registry</H>
            <div className="ws-registry">{s.registry.map((r, i) => <a key={i} className="ws-btn outline" href={safeUrl(r.url)} target="_blank" rel="noopener noreferrer">{r.name}</a>)}</div>
          </section>
        )}
        {has.faq && (
          <section className="ws-sec narrow">
            <H id="faq">Questions</H>
            {s.faq.map((q, i) => <details key={i} className="ws-faq"><summary>{q.q}</summary><RichText text={q.a} linkColor={c.accent} /></details>)}
          </section>
        )}
        {has.rsvp && <section className="ws-sec narrow"><H id="rsvp">RSVP</H><Rsvp slug={slug} site={s} /></section>}
      </main>
      <footer className="ws-foot">{w.partner1} &amp; {w.partner2} · Made with Get Hitched</footer>
    </div>
  );
}

type Person = { id: string; name: string; rsvp: 'yes' | 'no' | 'pending'; dietary: string | null; plus_one: boolean; is_head: boolean };
type Household = { head_id: string; city: string | null; people: Person[] };
const RSVP_ERRORS: Record<string, string> = {
  RSVP_CLOSED: 'RSVPs are closed. Please contact the couple directly.',
  RSVP_FULL_NAME: 'Please enter your first and last name, as on your invitation.',
  RSVP_BUSY: 'Lots of people are replying right now. Please try again in a minute.',
  RSVP_NOT_ALLOWED: 'Something didn’t match. Please search for your name again.',
};

function Rsvp({ slug, site }: { slug: string; site: NonNullable<Data['site']> }) {
  const [name, setName] = useState('');
  const [found, setFound] = useState<Household[] | null>(null);
  const [house, setHouse] = useState<Household | null>(null);
  const [answers, setAnswers] = useState<Record<string, { rsvp: 'yes' | 'no' | null; dietary: string }>>({});
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fail = (e: { message?: string } | null) => setError(Object.entries(RSVP_ERRORS).find(([k]) => e?.message?.includes(k))?.[1] ?? 'Something went wrong. Please try again.');

  if (!site.rsvp_open) return <p>RSVPs are closed{site.rsvp_deadline ? ` as of ${longDate(site.rsvp_deadline)}` : ''}. Please reach out to the couple directly.</p>;
  if (done) return <div className="ws-card"><h3>Thank you!</h3><p>Your RSVP has been sent to the couple. You can come back and change it any time before the deadline.</p></div>;

  const choose = (h: Household) => {
    setHouse(h);
    setAnswers(Object.fromEntries(h.people.map((p) => [p.id, { rsvp: p.rsvp === 'pending' ? null : p.rsvp, dietary: p.dietary ?? '' }])));
  };
  const find = async () => {
    setBusy(true); setError(''); setFound(null); setHouse(null);
    const { data, error } = await supabase.rpc('rsvp_find', { p_slug: slug, p_name: name });
    setBusy(false);
    if (error) return fail(error);
    const list = (data as { households: Household[] }).households;
    setFound(list);
    if (list.length === 1) choose(list[0]);
  };
  const submit = async () => {
    if (!house) return;
    if (house.people.some((p) => !answers[p.id]?.rsvp)) return setError('Please answer for everyone listed.');
    setBusy(true); setError('');
    const { error } = await supabase.rpc('rsvp_submit', {
      p_slug: slug, p_head: house.head_id, p_name: name,
      p_answers: house.people.map((p) => ({ id: p.id, rsvp: answers[p.id].rsvp, dietary: answers[p.id].dietary })), p_message: message,
    });
    setBusy(false);
    if (error) return fail(error);
    setDone(true);
  };

  return (
    <div className="ws-card">
      {site.rsvp_note && <p>{site.rsvp_note}</p>}
      {site.rsvp_deadline && <p className="ws-muted">Please reply by {longDate(site.rsvp_deadline)}.</p>}
      {!house && (
        <>
          <label className="ws-label" htmlFor="rsvp-name">Your full name</label>
          <div className="ws-find">
            <input id="rsvp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="First and last name" autoComplete="name"
              onKeyDown={(e) => e.key === 'Enter' && name.trim() && find()} />
            <button className="ws-btn" disabled={busy || !name.trim()} onClick={find}>{busy ? 'Looking…' : 'Find my invitation'}</button>
          </div>
          {found && found.length === 0 && <p className="ws-muted">We couldn’t find that name. Try it exactly as it appears on your invitation, or contact the couple.</p>}
          {found && found.length > 1 && (
            <div style={{ marginTop: 12 }}>
              <p>We found more than one. Which is you?</p>
              {found.map((h) => (
                <button key={h.head_id} className="ws-btn outline" style={{ margin: '0 8px 8px 0' }} onClick={() => choose(h)}>
                  {h.people.map((p) => p.name.split(' ')[0]).join(', ')}{h.city ? ` · ${h.city}` : ''}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {house && (
        <>
          {house.people.map((p) => (
            <div key={p.id} className="ws-guest">
              <b>{p.name}{p.plus_one ? ' (and guest)' : ''}</b>
              <div className="ws-choice" role="group" aria-label={`Will ${p.name} attend?`}>
                {(['yes', 'no'] as const).map((v) => (
                  <button key={v} type="button" aria-pressed={answers[p.id]?.rsvp === v} className={answers[p.id]?.rsvp === v ? 'on' : ''}
                    onClick={() => setAnswers((a) => ({ ...a, [p.id]: { ...a[p.id], rsvp: v } }))}>
                    {v === 'yes' ? 'Joyfully accepts' : 'Regretfully declines'}
                  </button>
                ))}
              </div>
              {answers[p.id]?.rsvp === 'yes' && (
                <input className="ws-input" placeholder="Dietary needs (optional)" value={answers[p.id].dietary}
                  onChange={(e) => setAnswers((a) => ({ ...a, [p.id]: { ...a[p.id], dietary: e.target.value } }))} />
              )}
            </div>
          ))}
          <label className="ws-label" htmlFor="rsvp-msg">A note for the couple (optional)</label>
          <textarea id="rsvp-msg" className="ws-input" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} />
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button className="ws-btn" disabled={busy} onClick={submit}>{busy ? 'Sending…' : 'Send RSVP'}</button>
            <button className="ws-btn outline" onClick={() => { setHouse(null); setFound(null); }}>Not you?</button>
          </div>
        </>
      )}
      {error && <p className="ws-error" role="alert">{error}</p>}
    </div>
  );
}
