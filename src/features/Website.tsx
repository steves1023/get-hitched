import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAccess } from '../lib/access';
import { useRows } from '../hooks/data';
import { supabase } from '../lib/supabase';
import { friendly } from '../lib/errors';
import type { Guest, PartyMember, SiteSections, WeddingSite } from '../lib/types';
import { Badge, Loading, PageHeader, useToast } from '../components/ui';

const SECTIONS: [keyof SiteSections, string][] = [
  ['schedule', 'Schedule'], ['story', 'Our story'], ['party', 'Wedding party'], ['photos', 'Photos'],
  ['travel', 'Travel & stay'], ['registry', 'Registry'], ['faq', 'FAQ'], ['rsvp', 'RSVP'],
];
const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 60);
const imgUrl = (path: string) => supabase.storage.from('site').getPublicUrl(path).data.publicUrl;

export default function Website() {
  const { wedding, isCouple } = useAccess();
  const qc = useQueryClient();
  const nav = useNavigate();
  const toast = useToast();
  const site = useQuery({
    queryKey: ['wedding_site', wedding.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('wedding_sites').select('*').eq('wedding_id', wedding.id).maybeSingle();
      if (error) throw error;
      return data as WeddingSite | null;
    },
  });
  const guests = useRows<Guest>('guests', wedding.id, 'name');
  const [v, setV] = useState<WeddingSite | null>(null);
  const [removed, setRemoved] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [newSlug, setNewSlug] = useState(slugify(`${wedding.partner1} and ${wedding.partner2}`));

  useEffect(() => { if (site.data) setV(site.data); }, [site.data]);
  if (!isCouple) return <Navigate to={`/w/${wedding.id}`} replace />;
  if (site.isLoading) return <Loading />;

  const refresh = () => qc.invalidateQueries({ queryKey: ['wedding_site', wedding.id] });
  const url = (slug: string) => `${window.location.origin}/site/${slug}`;

  if (!site.data || !v) {
    const create = async () => {
      setBusy(true); setError('');
      const { error } = await supabase.from('wedding_sites').insert({ wedding_id: wedding.id, slug: slugify(newSlug) });
      setBusy(false);
      if (error) return setError(error.code === '23505' ? 'That web address is taken. Try another.' : friendly(error));
      refresh();
    };
    return (
      <>
        <PageHeader title="Website" sub="A wedding website for your guests" />
        <div className="card" style={{ maxWidth: 620 }}>
          <h2 className="ct">Create your website</h2>
          <p style={{ marginBottom: 12 }}>Your schedule, story, travel details, registry and online RSVPs in one place. It stays private until you publish it, and it uses the design you chose under Print.</p>
          <label className="field"><span>Web address</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="small muted" style={{ whiteSpace: 'nowrap' }}>{window.location.host}/site/</span>
              <input value={newSlug} onChange={(e) => setNewSlug(slugify(e.target.value))} />
            </div>
          </label>
          <button className="btn" disabled={busy || newSlug.length < 3} onClick={create}>{busy ? 'Creating…' : 'Create website'}</button>
          {error && <p className="err">{error}</p>}
        </div>
      </>
    );
  }

  const set = (p: Partial<WeddingSite>) => setV((x) => (x ? { ...x, ...p } : x));
  const setSec = (k: keyof SiteSections, on: boolean) => set({ sections: { ...v.sections, [k]: on } });
  const upload = async (file: File) => {
    const path = `${wedding.id}/${crypto.randomUUID()}.${(file.name.split('.').pop() || 'jpg').toLowerCase()}`;
    const { error } = await supabase.storage.from('site').upload(path, file, { contentType: file.type || undefined });
    if (error) throw error;
    return path;
  };
  const forget = (path: string | null | undefined) => { if (path) setRemoved((r) => [...r, path]); };

  const save = async (extra: Partial<WeddingSite> = {}) => {
    setBusy(true); setError('');
    const row = { ...v, ...extra };
    const { error } = await supabase.from('wedding_sites').update({
      slug: slugify(row.slug), hero_path: row.hero_path, story: row.story || null, travel: row.travel || null,
      registry: row.registry.filter((r) => r.name.trim() && r.url.trim()), faq: row.faq.filter((q) => q.q.trim()),
      party: row.party.filter((p) => p.name.trim()), photos: row.photos, sections: row.sections,
      rsvp_deadline: row.rsvp_deadline || null, rsvp_note: row.rsvp_note || null,
      published: row.published, published_at: row.published && !site.data!.published ? new Date().toISOString() : row.published_at,
    }).eq('wedding_id', wedding.id);
    setBusy(false);
    if (error) { setError(error.code === '23505' ? 'That web address is taken. Try another.' : friendly(error)); return false; }
    if (removed.length) { await supabase.storage.from('site').remove(removed); setRemoved([]); }
    refresh();
    return true;
  };

  const withEmail = (guests.data ?? []).filter((g) => !g.couple_role && g.email);
  const message = `We’re getting married! Our wedding website has the schedule, travel details and registry${v.sections.rsvp ? ', and you can RSVP there' : ''}:\n\n${url(v.slug)}\n\nLove,\n${wedding.partner1} & ${wedding.partner2}`;
  const mailto = `mailto:?bcc=${encodeURIComponent(withEmail.map((g) => g.email).join(','))}&subject=${encodeURIComponent(`${wedding.partner1} & ${wedding.partner2}: our wedding website`)}&body=${encodeURIComponent(message)}`;
  const rsvpd = (guests.data ?? []).filter((g) => g.rsvp_at).length;

  return (
    <>
      <PageHeader title="Website" sub="A wedding website for your guests" action={
        <span style={{ display: 'flex', gap: 6 }}>
          <a className="btn g" href={`/site/${site.data.slug}?preview=1`} target="_blank" rel="noreferrer">Preview</a>
          <button className="btn" disabled={busy} onClick={async () => { if (await save()) toast.show('Saved'); }}>{busy ? 'Saving…' : 'Save changes'}</button>
        </span>
      } />

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 className="ct" style={{ marginBottom: 6 }}>
              {site.data.published ? 'Your website is live' : 'Your website is a draft'}{' '}
              <Badge tone={site.data.published ? 'bs' : 'bw'}>{site.data.published ? 'Published' : 'Only you can see it'}</Badge>
            </h2>
            <p className="small muted">{url(site.data.slug)}</p>
          </div>
          {site.data.published
            ? <button className="btn g" disabled={busy} onClick={async () => { if (confirm('Take the website offline? Guests with the link will see that it isn’t ready.')) { set({ published: false }); await save({ published: false }); } }}>Unpublish</button>
            : <button className="btn" disabled={busy} onClick={async () => { set({ published: true }); if (await save({ published: true })) toast.show('Your website is live'); }}>Publish</button>}
        </div>
        {site.data.published && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <b className="small">Send it to your guests</b>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
              <button className="btn g sm" onClick={() => { navigator.clipboard.writeText(url(site.data!.slug)); toast.show('Link copied'); }}>Copy link</button>
              {withEmail.length > 0 && <a className="btn sm" href={mailto}>Email {withEmail.length} guest{withEmail.length === 1 ? '' : 's'}</a>}
              {withEmail.length > 0 && <button className="btn g sm" onClick={() => { navigator.clipboard.writeText(withEmail.map((g) => g.email).join(', ')); toast.show('Email addresses copied'); }}>Copy email addresses</button>}
            </div>
            <p className="small muted">
              “Email guests” opens your own email app with everyone in BCC and a message you can edit.
              {(guests.data ?? []).filter((g) => !g.couple_role && !g.email && !g.primary_guest_id).length > 0 && ' Guests without an email address on the Guests tab aren’t included.'}
              {rsvpd > 0 && ` ${rsvpd} guest${rsvpd === 1 ? ' has' : 's have'} RSVP’d online.`}
            </p>
          </div>
        )}
        <label className="field" style={{ marginTop: 12 }}><span>Web address</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="small muted" style={{ whiteSpace: 'nowrap' }}>{window.location.host}/site/</span>
            <input value={v.slug} onChange={(e) => set({ slug: slugify(e.target.value) })} />
          </div>
        </label>
        {site.data.published && v.slug !== site.data.slug && <p className="small" style={{ color: 'var(--blush-d)' }}>Changing the address breaks links you’ve already sent.</p>}
        <p className="small muted">Fonts and colors come from your design on the <button className="btn g sm" onClick={() => nav(`/w/${wedding.id}/print`)}>Print</button> tab. Schedule items come from Wedding Day items marked for everyone.</p>
      </div>

      <div className="card">
        <h2 className="ct">Pages</h2>
        <div className="checks" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))' }}>
          {SECTIONS.map(([k, label]) => <label key={k}><input type="checkbox" checked={!!v.sections[k]} onChange={(e) => setSec(k, e.target.checked)} /><span>{label}</span></label>)}
        </div>
        <p className="small muted" style={{ marginTop: 6 }}>Pages with nothing in them stay hidden even when ticked.</p>
      </div>

      <div className="card">
        <h2 className="ct">Cover photo</h2>
        <ImagePick path={v.hero_path} wide onPick={async (f) => { try { forget(v.hero_path); set({ hero_path: await upload(f) }); } catch (e) { setError(friendly(e)); } }}
          onClear={() => { forget(v.hero_path); set({ hero_path: null }); }} />
      </div>

      {v.sections.story && (
        <div className="card"><h2 className="ct">Our story</h2>
          <textarea className="input" rows={8} value={v.story ?? ''} onChange={(e) => set({ story: e.target.value })} placeholder="How you met, the proposal, what you’re excited about. Leave a blank line between paragraphs." />
        </div>
      )}

      {v.sections.party && (
        <div className="card"><h2 className="ct">Wedding party</h2>
          {v.party.map((p, i) => {
            const upd = (patch: Partial<PartyMember>) => set({ party: v.party.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
            return (
              <div key={i} className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
                <ImagePick path={p.photo} round onPick={async (f) => { try { forget(p.photo); upd({ photo: await upload(f) }); } catch (e) { setError(friendly(e)); } }}
                  onClear={() => { forget(p.photo); upd({ photo: null }); }} />
                <div style={{ flex: 1, display: 'grid', gap: 6 }}>
                  <div className="g2" style={{ gap: 6 }}>
                    <input className="input" placeholder="Name" value={p.name} onChange={(e) => upd({ name: e.target.value })} />
                    <input className="input" placeholder="Maid of honor, best man…" value={p.role} onChange={(e) => upd({ role: e.target.value })} />
                  </div>
                  <input className="input" placeholder="A line about them (optional)" value={p.blurb} onChange={(e) => upd({ blurb: e.target.value })} />
                </div>
                <button className="x-btn" aria-label={`Remove ${p.name || 'person'}`} onClick={() => { forget(p.photo); set({ party: v.party.filter((_, j) => j !== i) }); }}>×</button>
              </div>
            );
          })}
          <button className="btn g sm" onClick={() => set({ party: [...v.party, { name: '', role: '', blurb: '', photo: null }] })}>+ Add person</button>
        </div>
      )}

      {v.sections.photos && (
        <div className="card"><h2 className="ct">Photos</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: 8 }}>
            {v.photos.map((p) => (
              <div key={p} style={{ position: 'relative' }}>
                <img src={imgUrl(p)} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 10 }} />
                <button className="x-btn" style={{ position: 'absolute', top: 4, right: 4, background: '#fff' }} aria-label="Remove photo"
                  onClick={() => { forget(p); set({ photos: v.photos.filter((x) => x !== p) }); }}>×</button>
              </div>
            ))}
            <label className="vadd" style={{ aspectRatio: '1', cursor: 'pointer' }}>
              <span style={{ fontSize: '1.6rem', opacity: 0.5 }}>＋</span>Add photos
              <input type="file" accept="image/*" multiple hidden onChange={async (e) => {
                const files = Array.from(e.target.files ?? []); e.target.value = '';
                try { const paths: string[] = []; for (const f of files) paths.push(await upload(f)); setV((x) => (x ? { ...x, photos: [...x.photos, ...paths] } : x)); }
                catch (err) { setError(friendly(err)); }
              }} />
            </label>
          </div>
        </div>
      )}

      {v.sections.travel && (
        <div className="card"><h2 className="ct">Travel &amp; stay</h2>
          <textarea className="input" rows={7} value={v.travel ?? ''} onChange={(e) => set({ travel: e.target.value })}
            placeholder={'Hotel blocks, the closest airport, parking and shuttles. Paste web links and they become clickable.\n\nExample: We have rooms at the Lakeview Inn until May 1: https://…'} />
        </div>
      )}

      {v.sections.registry && (
        <div className="card"><h2 className="ct">Registry</h2>
          {v.registry.map((r, i) => (
            <div key={i} className="row" style={{ alignItems: 'center', gap: 6 }}>
              <input className="input" style={{ flex: 1 }} placeholder="Zola" value={r.name} onChange={(e) => set({ registry: v.registry.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
              <input className="input" style={{ flex: 2 }} placeholder="https://…" value={r.url} onChange={(e) => set({ registry: v.registry.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} />
              <button className="x-btn" aria-label="Remove registry" onClick={() => set({ registry: v.registry.filter((_, j) => j !== i) })}>×</button>
            </div>
          ))}
          <button className="btn g sm" onClick={() => set({ registry: [...v.registry, { name: '', url: '' }] })}>+ Add registry</button>
        </div>
      )}

      {v.sections.faq && (
        <div className="card"><h2 className="ct">FAQ</h2>
          {v.faq.map((q, i) => (
            <div key={i} className="row" style={{ alignItems: 'flex-start', gap: 6 }}>
              <div style={{ flex: 1, display: 'grid', gap: 6 }}>
                <input className="input" placeholder="What should I wear?" value={q.q} onChange={(e) => set({ faq: v.faq.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)) })} />
                <textarea className="input" rows={2} placeholder="Cocktail attire. The ceremony is on grass, so skip the stilettos." value={q.a} onChange={(e) => set({ faq: v.faq.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) })} />
              </div>
              <button className="x-btn" aria-label="Remove question" onClick={() => set({ faq: v.faq.filter((_, j) => j !== i) })}>×</button>
            </div>
          ))}
          <button className="btn g sm" onClick={() => set({ faq: [...v.faq, { q: '', a: '' }] })}>+ Add question</button>
        </div>
      )}

      {v.sections.rsvp && (
        <div className="card"><h2 className="ct">RSVP</h2>
          <p className="small muted" style={{ marginBottom: 10 }}>Guests type their full name as it appears on the Guests tab, then answer for their whole family. Answers, dietary needs and notes go straight to your guest list.</p>
          <div className="g2">
            <label className="field"><span>Reply by</span><input type="date" value={v.rsvp_deadline ?? ''} onChange={(e) => set({ rsvp_deadline: e.target.value || null })} /></label>
          </div>
          <label className="field"><span>Note for guests (optional)</span><input value={v.rsvp_note ?? ''} onChange={(e) => set({ rsvp_note: e.target.value })} placeholder="We’ve reserved a seat for you and look forward to celebrating!" /></label>
        </div>
      )}

      {error && <p className="err">{error}</p>}
      {toast.node}
    </>
  );
}

function ImagePick({ path, onPick, onClear, round, wide }: { path: string | null; onPick: (f: File) => void; onClear: () => void; round?: boolean; wide?: boolean }) {
  const size = wide ? { width: '100%', maxWidth: 520, aspectRatio: '16/9' } : { width: 72, height: 72 };
  return (
    <div style={{ position: 'relative', ...size, flexShrink: 0 }}>
      {path
        ? <img src={imgUrl(path)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: round ? '50%' : 12 }} />
        : <label className="vadd" style={{ width: '100%', height: '100%', borderRadius: round ? '50%' : 12, cursor: 'pointer', fontSize: '.72rem' }}>
            <span style={{ fontSize: wide ? '1.6rem' : '1rem', opacity: 0.5 }}>＋</span>{wide ? 'Add a cover photo' : 'Photo'}
            <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPick(f); }} />
          </label>}
      {path && <button className="x-btn" style={{ position: 'absolute', top: 2, right: 2, background: '#fff' }} aria-label="Remove photo" onClick={onClear}>×</button>}
    </div>
  );
}
