import { Link } from 'react-router-dom';
import { PRICING } from '../lib/types';
import '@fontsource/great-vibes/400.css';
import { seatOffsets } from '../features/seating/geometry';
import './landing.css';

/** Public home page for signed-out visitors. Every visual is the real app UI with sample data. */
export default function Landing() {
  return (
    <div className="lp">
      <header className="lp-top">
        <div className="lp-wrap">
          <span className="lp-brand">✦ Get Hitched</span>
          <nav aria-label="Account">
            <a className="hbtn hide-sm" href="#pricing">Pricing</a>
            <Link className="hbtn" to="/login">Sign in</Link>
          </nav>
        </div>
      </header>

      <section className="lp-hero">
        <div className="lp-wrap">
          <div>
            <h1>Plan your wedding together, in one place.</h1>
            <p className="lede">
              Guests, budget, seating, gifts and an hour-by-hour plan for the day, plus printables that match your
              style. Then share just the right parts with your planner, your family and your wedding party.
            </p>
            <div className="lp-cta">
              <Link className="btn" to="/login">Start planning</Link>
              <a className="btn g" href="#features">See what’s inside</a>
              <small>{PRICING.pass} one time · no subscription</small>
            </div>
          </div>
          <HeroStage />
        </div>
      </section>

      <section className="lp-sec" id="features">
        <div className="lp-wrap">
          <div className="lp-head">
            <h2>Everything you’re juggling, finally in one place</h2>
            <p>Each part of the planning has its own space, and they all talk to each other. Pay a vendor’s deposit and your budget updates. RSVP a guest and the seating chart knows.</p>
          </div>
          <div className="lp-grid">
            <Tile title="Tasks" text="Every to-do with a due date and an owner. Late ones stand out.">
              <TaskRow name="Book florist" tags={[['Flowers', 'bb'], ['Emma', 'bs'], ['Nov 10 (12d late)', 'br']]} />
              <TaskRow name="Order wedding cake" tags={[['Catering', 'bb'], ['James', 'bs'], ['Dec 20 (28d)', 'bg']]} />
              <TaskRow name="Book photographer" done tags={[['Photography', 'bb']]} />
            </Tile>
            <Tile title="Budget" text="Set a total, log deposits and invoices, and see what’s left.">
              <div className="lp-kpis">
                <div><b>$32k</b><small>Budget</small></div>
                <div><b>$12.2k</b><small>Spent</small></div>
                <div><b style={{ color: 'var(--sage-d)' }}>$19.9k</b><small>Left</small></div>
              </div>
              <div className="bar"><i style={{ width: '38%' }} /></div>
              <small className="muted">38% of budget used</small>
            </Tile>
            <Tile title="Guest list" text="Families share one address, everyone keeps their own RSVP. Search, filter, or import a spreadsheet.">
              <MiniSheet />
            </Tile>
            <Tile title="Seating chart" text="Your room to scale, walls and all. Real table sizes, and a + on every chair to seat someone. Pull the room size from your venue’s website." wide>
              <SeatingMini />
            </Tile>
            <Tile title="Vendors" text="Contacts, contracts and what you’ve paid, all on one card.">
              <div className="lp-vendor">
                <span className="badge bg">Deposit Paid</span>
                <b>Lumen Photography</b>
                <small>Dana Ruiz · hello@lumenphoto.com</small>
                <small>$3,200 total · $1,000 paid</small>
              </div>
            </Tile>
            <Tile title="The wedding day" text="An hour-by-hour plan. Each person sees just the parts they’re in." wide>
              <div className="tl"><span className="tm">8:00 AM</span><div><b>Hair stylist arrives</b><div className="small muted">Bride’s suite · 30 min</div></div></div>
              <div className="tl"><span className="tm">1:30 PM</span><div><b>First look photos</b><div className="small muted">Both partners + photographer</div></div></div>
              <div className="tl"><span className="tm">3:45 PM</span><div><b>Ceremony</b><div className="small muted">Garden pavilion · everyone</div></div></div>
            </Tile>
            <Tile title="Gifts & thank-yous" text="Log who gave what, even when it’s a couple. Then draft each thank-you note in one tap.">
              <div className="row" style={{ alignItems: 'center' }}>
                <div style={{ flex: 1 }}><div className="nm">Honeymoon fund</div><div className="small muted">From Sarah &amp; Tom Miller</div></div>
                <span className="badge bg">Drafted</span>
              </div>
              <div className="lp-note">
                Dear Sarah and Tom, thank you for your generous gift toward our honeymoon. We’re putting it toward a cooking class in Florence…
              </div>
              <span className="small" style={{ color: 'var(--blush-d)', fontWeight: 600 }}>✨ Write it for me</span>
            </Tile>
            <Tile title="Print & PDFs" text="Your schedule, table cards, place cards and thank-you notes, designed once to match your theme. Download and print." wide>
              <PrintMini />
            </Tile>
            <Tile title="Vision board" text="Collect the looks you love, sorted by flowers, decor, attire and more.">
              <div className="lp-swatches">
                <div style={{ background: 'linear-gradient(135deg,#F5D5CF,#E8A598)' }}><span>Peonies</span></div>
                <div style={{ background: 'linear-gradient(135deg,#CBDDC9,#8FAF8E)' }}><span>Greenery</span></div>
                <div style={{ background: 'linear-gradient(135deg,#F4E8C8,#C4A35A)' }}><span>Candlelight</span></div>
                <div style={{ background: 'linear-gradient(135deg,#FDF6EE,#D8CCBE)' }}><span>Lace gown</span></div>
                <div style={{ background: 'linear-gradient(135deg,#E8DDD4,#A89880)' }}><span>Naked cake</span></div>
                <div style={{ background: 'linear-gradient(135deg,#EEF5EE,#4D7050)' }}><span>Sage</span></div>
              </div>
            </Tile>
            <Tile title="Hashtags" text="Pick a vibe, from sappy to spicy, and get a dozen ideas in seconds." wide>
              <div>
                <span className="chip s">#CarterReedGardenRomance ★</span>
                <span className="chip">#ForeverCarterReed</span>
                <span className="chip">#WillowEstateVows</span>
                <span className="chip">#JamesFoundHisEmma</span>
                <span className="chip">#ReedyToWed</span>
                <span className="chip">#GardenOfCarterReed</span>
              </div>
              <div className="filters" style={{ margin: 0 }}>
                <span className="f on">💕 Sappy</span><span className="f">😂 Funny</span><span className="f">🥂 Classy</span><span className="f">🔥 Spicy</span>
              </div>
            </Tile>
            <Tile title="Files" text="Contracts, quotes and photos, kept with the wedding they belong to.">
              <FileRow icon="📄" name="Willow-Estate-Contract.pdf" size="1.2 MB" />
              <FileRow icon="📊" name="Catering-Quote.xlsx" size="84 KB" />
            </Tile>
          </div>
        </div>
      </section>

      <section className="lp-sec alt">
        <div className="lp-wrap">
          <div className="lp-head">
            <h2>Share the right parts with the right people</h2>
            <p>Parents and planners get full planning access, minus any tab you hide. Your wedding party sees just the day’s schedule: their moments and anything you assign them.</p>
          </div>
          <div className="lp-share">
            <Person initials="PL" name="Your planner" role={PRICING.fullName}
              rows={[['Tasks', 'Edit'], ['Vendors', 'Edit'], ['Guests & seating', 'Edit'], ['Wedding day', 'Edit'], ['Budget', 'View']]} />
            <Person initials="M" name="Mom" role={PRICING.fullName}
              rows={[['Tasks', 'Edit'], ['Guest list', 'Edit'], ['Seating', 'Edit'], ['Wedding day', 'Edit'], ['Budget', null]]} />
            <Person initials="B" name="Bea" role={PRICING.partyName}
              rows={[['Day-of schedule', 'Her parts'], ['Tasks', null], ['Guest list', null], ['Vision board', null], ['Budget', null]]} />
          </div>
        </div>
      </section>

      <section className="lp-sec">
        <div className="lp-wrap">
          <div className="lp-head"><h2>Up and running in minutes</h2></div>
          <div className="lp-steps">
            <div className="lp-step"><h3>Tell us the basics</h3><p>Your names, the date and the venue. Everything can change later.</p></div>
            <div className="lp-step"><h3>Activate for {PRICING.pass}</h3><p>One payment for the two of you unlocks every tool through your wedding date plus 90 days.</p></div>
            <div className="lp-step"><h3>Invite your people</h3><p>Parents and planners for {PRICING.full} each; your wedding party is free.</p></div>
          </div>
        </div>
      </section>

      <section className="lp-sec alt" id="pricing">
        <div className="lp-wrap">
          <div className="lp-head"><h2>Simple, one-time pricing</h2><p>No subscription to remember to cancel. Pay once for the two of you, then add people as you need them.</p></div>
          <div className="lp-price">
            <div className="lp-plan">
              <h3>{PRICING.passName}</h3>
              <div className="amt">{PRICING.pass}<small>one time, for the two of you</small></div>
              <ul>
                <li>Tasks, vendors, budget, guests and files</li>
                <li>Seating chart and wedding day timeline</li>
                <li>Vision board and hashtag ideas</li>
                <li>Valid through your wedding date plus 90 days, then saved to look back on</li>
              </ul>
              <Link className="btn" to="/login">Start planning</Link>
            </div>
            <div className="lp-addon">
              <h3>Bring your people in</h3>
              <div>
                <div className="amt">{PRICING.full} <small className="muted" style={{ fontSize: '.9rem', fontFamily: 'var(--sans)' }}>per person</small></div>
                <b>{PRICING.fullName}</b>
                <p>Full access to planning, like the two of you. Hide any tab per person.</p>
              </div>
              <div>
                <div className="amt">{PRICING.party}</div>
                <b>{PRICING.partyName}</b>
                <p>The wedding day schedule: party moments and anything you assign to them. Invite your whole wedding party at no cost.</p>
              </div>
              <div className="lp-faq">
                <div><b>Does the person I’m marrying cost extra?</b><span>No. {PRICING.passName} covers both of you, each with your own login.</span></div>
                <div><b>Can I change what a parent or planner sees?</b><span>Yes. Hide any tab for any person, any time.</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-close">
        <div className="lp-wrap">
          <h2>Let’s get you to “I do.”</h2>
          <p>Set up your wedding in about two minutes.</p>
          <div className="lp-cta"><Link className="btn" to="/login">Start planning</Link></div>
        </div>
      </section>
      <footer className="lp-foot">
        <div className="lp-wrap"><span>✦ Get Hitched</span><span>© {new Date().getFullYear()} Get Hitched</span></div>
      </footer>
    </div>
  );
}

function HeroStage() {
  return (
    <div className="lp-stage" aria-hidden="true">
      <div className="lp-float rsvp"><div className="sn">52</div><div className="sl">RSVP yes</div></div>
      <div className="lp-app">
        <div className="bar-top"><i /><i /><i /><span>✦ Get Hitched</span></div>
        <div className="cd"><b>210</b><small>Days until your wedding</small></div>
        <div className="body">
          <div className="ct" style={{ fontSize: '.95rem', marginBottom: 10 }}>Upcoming tasks</div>
          <TaskRow name="Book florist" tags={[['Flowers', 'bb'], ['12d late', 'br']]} />
          <TaskRow name="Order wedding cake" tags={[['Catering', 'bb'], ['Dec 20 (28d)', 'bg']]} />
          <TaskRow name="Send invitations" tags={[['Invitations', 'bb'], ['Both', 'bs']]} />
          <TaskRow name="Book photographer" done tags={[['Photography', 'bb']]} />
        </div>
      </div>
      <div className="lp-float budget">
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Spent</span><b style={{ color: 'var(--blush-d)' }}>$12,150</b></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Remaining</span><b style={{ color: 'var(--sage-d)' }}>$19,850</b></div>
        <div className="bar"><i style={{ width: '38%' }} /></div>
      </div>
    </div>
  );
}

function Tile({ title, text, wide, children }: { title: string; text: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <article className={`lp-tile${wide ? ' wide' : ''}`}>
      <h3>{title}</h3>
      <p>{text}</p>
      <div className="demo" aria-hidden="true">{children}</div>
    </article>
  );
}

function TaskRow({ name, tags, done }: { name: string; tags: [string, string][]; done?: boolean }) {
  return (
    <div className={`row${done ? ' done' : ''}`}>
      <span className={`chk${done ? ' on' : ''}`}>{done ? '✓' : ''}</span>
      <div><div className="nm">{name}</div><div className="chips">{tags.map(([t, c]) => <span key={t} className={`badge ${c}`}>{t}</span>)}</div></div>
    </div>
  );
}


function FileRow({ icon, name, size }: { icon: string; name: string; size: string }) {
  return (
    <div className="fi" style={{ margin: 0, background: '#fff' }}>
      <span className="th" style={{ width: 34, height: 34, fontSize: '1rem' }}>{icon}</span>
      <b className="small" style={{ flex: 1, overflowWrap: 'anywhere' }}>{name}</b>
      <span className="small muted">{size}</span>
    </div>
  );
}

function Person({ initials, name, role, rows }: { initials: string; name: string; role: string; rows: [string, string | null][] }) {
  return (
    <article className="lp-person">
      <header><span className="av">{initials}</span><div><b>{name}</b><small>{role}</small></div></header>
      <ul>
        {rows.map(([tab, level]) => (
          <li key={tab} className={level ? '' : 'off'}>
            <span>{tab}</span>
            {level ? <span className={`badge ${level === 'Edit' ? 'bs' : level === 'View' ? 'bw' : 'bb'}`}>{level}</span> : <span className="small">Hidden</span>}
          </li>
        ))}
      </ul>
    </article>
  );
}

function SeatingMini() {
  // A 52 x 30 ft room drawn in feet, like the real seating chart.
  const W = 52, L = 30;
  const tables: { x: number; y: number; label: string; who: (string | null)[] }[] = [
    { x: 7, y: 8, label: 'Table 1', who: ['SM', '+1', 'TC', null, 'AL', null, null, 'CD'] },
    { x: 20, y: 8, label: 'Table 2', who: ['RP', '+1', null, null, null, null, null, null] },
    { x: 7, y: 22, label: 'Table 3', who: [null, null, null, null, null, null, null, null] },
    { x: 20, y: 22, label: 'Table 4', who: ['JW', null, 'BO', '+1', null, null, null, null] },
  ];
  const offs = seatOffsets('round60', 8, 0);
  return (
    <svg viewBox={`-1.5 -1.5 ${W + 3} ${L + 3}`} style={{ width: '100%', height: 'auto', background: '#F8F4EE', borderRadius: 10 }} role="img" aria-label="Seating chart drawn to scale">
      <rect x={0} y={0} width={W} height={L} fill="#FDFAF5" stroke="#6B5E4E" strokeWidth={0.3} />
      {Array.from({ length: 10 }, (_, i) => (i + 1) * 5).map((x) => <line key={x} x1={x} x2={x} y1={0} y2={L} stroke="#EDE7DC" strokeWidth={0.06} />)}
      {[5, 10, 15, 20, 25].map((y) => <line key={y} x1={0} x2={W} y1={y} y2={y} stroke="#EDE7DC" strokeWidth={0.06} />)}
      <line x1={28} y1={0} x2={28} y2={10.5} stroke="#4A4036" strokeWidth={0.5} />
      <line x1={28} y1={19.5} x2={28} y2={30} stroke="#4A4036" strokeWidth={0.5} />
      <rect x={29.1} y={11} width={2.4} height={8} rx={0.3} fill="#F3EEE6" stroke="#A89880" strokeWidth={0.1} strokeDasharray="0.5 0.3" />
      <text x={30.3} y={15} transform="rotate(-90 30.3 15)" textAnchor="middle" fontSize={0.85} fill="#6B5E4E" fontFamily="Inter" fontWeight={600}>Bar</text>
      <rect x={35.5} y={10} width={13} height={13} fill="#EFE2C2" stroke="#C4A35A" strokeWidth={0.13} />
      <text x={42} y={16.8} textAnchor="middle" fontSize={1.05} fill="#6B5E4E" fontFamily="Inter" fontWeight={600}>Dance floor</text>
      <rect x={39} y={3.4} width={6} height={2.4} rx={0.3} fill="#FFFDF8" stroke="#7A9E7E" strokeWidth={0.12} />
      <text x={42} y={4.95} textAnchor="middle" fontSize={0.7} fill="#3B3226" fontFamily="'Playfair Display', serif" fontWeight={700}>Sweetheart</text>
      {[[40.2, 'E', '#F5D5CF'], [43.8, 'J', '#CFE0CE']].map(([x, t, f]) => (
        <g key={String(t)}><circle cx={Number(x)} cy={1.9} r={0.75} fill={String(f)} stroke="#fff" strokeWidth={0.1} />
          <text x={Number(x)} y={2.12} textAnchor="middle" fontSize={0.6} fontWeight={700} fill="#3B3226" fontFamily="Inter">{t}</text></g>
      ))}
      {tables.map((t) => {
        const n = t.who.filter(Boolean).length;
        const ring = n >= 8 ? '#7A9E7E' : n > 0 ? '#C9A84C' : '#C8736A';
        return (
          <g key={t.label}>
            <circle cx={t.x} cy={t.y} r={2.5} fill="#FFFDF8" stroke={ring} strokeWidth={0.14} />
            <text x={t.x} y={t.y + 0.25} textAnchor="middle" fontSize={0.75} fontWeight={700} fill="#3B3226" fontFamily="'Playfair Display', serif">{t.label}</text>
            {offs.map((o, i) => {
              const w = t.who[i]; const cx = t.x + o.x, cy = t.y + o.y;
              return w ? (
                <g key={i}><circle cx={cx} cy={cy} r={0.75} fill={i % 3 ? '#CFE0CE' : '#F5D5CF'} stroke="#fff" strokeWidth={0.1} />
                  <text x={cx} y={cy + 0.21} textAnchor="middle" fontSize={0.52} fontWeight={700} fill="#3B3226" fontFamily="Inter">{w}</text></g>
              ) : (
                <g key={i}><circle cx={cx} cy={cy} r={0.75} fill="#fff" stroke="#C9B89A" strokeWidth={0.08} strokeDasharray="0.25 0.18" />
                  <line x1={cx - 0.28} x2={cx + 0.28} y1={cy} y2={cy} stroke="#9E5E54" strokeWidth={0.12} />
                  <line x1={cx} x2={cx} y1={cy - 0.28} y2={cy + 0.28} stroke="#9E5E54" strokeWidth={0.12} /></g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

function MiniSheet() {
  const rows: { name: string; fam?: string; rsvp: [string, string]; city: string; open?: boolean }[] = [
    { name: 'Sarah Miller', fam: 'Family · 4', rsvp: ['Yes', 'bs'], city: 'Ann Arbor', open: true },
    { name: 'Rita Patel', rsvp: ['Pending', 'bw'], city: 'Milwaukee' },
  ];
  return (
    <div className="lp-sheet">
      <div className="lp-sheet-h"><span>Name</span><span>RSVP</span><span>City</span></div>
      {rows.map((r) => (
        <div key={r.name}>
          <div className="lp-sheet-r">
            <span><b>{r.name}</b>{r.fam && <span className="fam-badge">{r.fam}</span>}</span>
            <span><span className={`badge ${r.rsvp[1]}`}>{r.rsvp[0]}</span></span>
            <span className="muted">{r.city}</span>
          </div>
          {r.open && ['Tom Miller', 'Lily Miller', 'Max Miller'].map((m, i) => (
            <div key={m} className="lp-sheet-r member"><span>{m}</span><span><span className={`badge ${i ? 'bw' : 'bs'}`}>{i ? 'Pending' : 'Yes'}</span></span><span className="muted">↳ shared</span></div>
          ))}
        </div>
      ))}
    </div>
  );
}

function PrintMini() {
  return (
    <div className="lp-print">
      <div className="lp-paper" style={{ width: 96, height: 124, background: '#FDFAF5', border: '1px solid #E8D6CF' }}>
        <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 10, textAlign: 'center', marginTop: 12 }}>Emma &amp; James</div>
        <div style={{ color: '#9E5E54', textAlign: 'center', fontSize: 7 }}>✦</div>
        {[0, 1, 2, 3, 4].map((i) => <div key={i} style={{ display: 'flex', gap: 4, margin: '4px 10px' }}><i style={{ width: 14, height: 3, background: '#E8A598' }} /><i style={{ flex: 1, height: 3, background: '#E5DED4' }} /></div>)}
        <small>Schedule</small>
      </div>
      <div className="lp-paper" style={{ width: 80, height: 112, background: '#FFFFFF', border: '1px solid #D9C38A', outline: '1px solid #D9C38A', outlineOffset: -5 }}>
        <div style={{ fontSize: 6, letterSpacing: 2, color: '#8B7B66', textAlign: 'center', marginTop: 24 }}>TABLE</div>
        <div style={{ fontFamily: "'Great Vibes', cursive", fontSize: 44, color: '#B08D3C', textAlign: 'center', lineHeight: 1 }}>1</div>
        <small>Table card</small>
      </div>
      <div className="lp-paper" style={{ width: 104, height: 60, background: '#F3E9DA', border: '1px solid #C9A87A', alignSelf: 'center' }}>
        <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 10, textAlign: 'center', marginTop: 16 }}>Sarah Miller</div>
        <div style={{ fontSize: 6, letterSpacing: 2, color: '#8A5A2B', textAlign: 'center', marginTop: 3, fontWeight: 700 }}>TABLE 1</div>
        <small>Place card</small>
      </div>
      <div className="lp-paper" style={{ width: 104, height: 80, background: '#F7FAFC', border: '1px solid #9CC3D5', alignSelf: 'center' }}>
        <div style={{ margin: '12px 10px 0', fontSize: 6.5, lineHeight: 1.5, color: '#14263A' }}>Dear Rita,<br />The serving bowl is already the centerpiece of our table…</div>
        <small>Thank-you</small>
      </div>
    </div>
  );
}
