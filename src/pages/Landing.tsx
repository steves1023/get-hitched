import { Link } from 'react-router-dom';
import { PRICING } from '../lib/types';
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
              Tasks, budget, guests, seating and an hour-by-hour plan for the day. Then share just the right parts
              with your planner, your family and your wedding party.
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
            <Tile title="Guest list" text="RSVPs, party sizes and dietary notes. Import from a spreadsheet.">
              <GuestRow initials="SM" name="Sarah Miller" tags={[['Yes ✓', 'bs'], ['Party of 2', 'bg']]} />
              <GuestRow initials="TC" name="Tom Carlson" tags={[['Yes ✓', 'bs'], ['Vegetarian', 'bw']]} />
              <GuestRow initials="RP" name="Rita Patel" tags={[['Pending', 'bw']]} />
            </Tile>
            <Tile title="Seating chart" text="Drag tables into place and seat guests with a tap. Colors show which tables are full." wide>
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
            <p>Invite your planner, parents and wedding party. You choose what each person can see, tab by tab. Your bridesmaids never see the budget.</p>
          </div>
          <div className="lp-share">
            <Person initials="PL" name="Your planner" role="Planner"
              rows={[['Tasks', 'Edit'], ['Vendors', 'Edit'], ['Guests & seating', 'Edit'], ['Wedding day', 'Edit'], ['Budget', 'View']]} />
            <Person initials="M" name="Mom" role="Family"
              rows={[['Her tasks', 'Only hers'], ['Guest list', 'View'], ['Seating', 'View'], ['Wedding day', 'View'], ['Budget', null]]} />
            <Person initials="B" name="Bea" role="Wedding party"
              rows={[['Her tasks', 'Only hers'], ['Day-of schedule', 'Her parts'], ['Vision board', 'View'], ['Guest list', null], ['Budget', null]]} />
          </div>
        </div>
      </section>

      <section className="lp-sec">
        <div className="lp-wrap">
          <div className="lp-head"><h2>Up and running in minutes</h2></div>
          <div className="lp-steps">
            <div className="lp-step"><h3>Tell us the basics</h3><p>Your names, the date and the venue. Everything can change later.</p></div>
            <div className="lp-step"><h3>Get the Wedding Pass</h3><p>One payment unlocks every tool through your wedding date plus 90 days.</p></div>
            <div className="lp-step"><h3>Invite your people</h3><p>Send invites by email and pick what each person sees.</p></div>
          </div>
        </div>
      </section>

      <section className="lp-sec alt" id="pricing">
        <div className="lp-wrap">
          <div className="lp-head"><h2>One price for the whole engagement</h2><p>No subscription to remember to cancel.</p></div>
          <div className="lp-price">
            <div className="lp-plan">
              <h3>Wedding Pass</h3>
              <div className="amt">{PRICING.pass}<small>one time</small></div>
              <ul>
                <li>Tasks, vendors, budget, guests and files</li>
                <li>Seating chart and wedding day timeline</li>
                <li>Vision board and hashtag ideas</li>
                <li>{PRICING.includedWithPass} people besides the two of you</li>
                <li>Valid through your wedding date plus 90 days</li>
              </ul>
              <Link className="btn" to="/login">Start planning</Link>
            </div>
            <div className="lp-addon">
              <h3>Need more helpers?</h3>
              <div className="amt">{PRICING.seat} <small className="muted" style={{ fontSize: '.9rem', fontFamily: 'var(--sans)' }}>per person, one time</small></div>
              <p>Add as many extra people as you like after the first {PRICING.includedWithPass}. Your partner never counts.</p>
              <div className="lp-faq">
                <div><b>What happens after the wedding?</b><span>Everything stays saved and view-only, so you can look back any time.</span></div>
                <div><b>Who counts as a person?</b><span>Anyone you invite besides your partner: your planner, family, wedding party or vendors.</span></div>
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

function GuestRow({ initials, name, tags }: { initials: string; name: string; tags: [string, string][] }) {
  return (
    <div className="row" style={{ alignItems: 'center' }}>
      <span className="av" style={{ width: 28, height: 28, fontSize: '.72rem' }}>{initials}</span>
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
  const full = { f: '#EAF0EA', s: '#7A9E7E', t: '#4D7050' };
  const part = { f: '#F8F2E4', s: '#C9A84C', t: '#8B6F2E' };
  const empty = { f: '#FBEAE8', s: '#C8736A', t: '#8B4F48' };
  const tables: { x: number; y: number; label: string; n: string; c: typeof full }[] = [
    { x: 110, y: 120, label: 'Table 1', n: '8/8', c: full },
    { x: 280, y: 120, label: 'Table 2', n: '5/8', c: part },
    { x: 450, y: 120, label: 'Table 3', n: '3/8', c: part },
    { x: 620, y: 120, label: 'Table 4', n: '0/8', c: empty },
  ];
  return (
    <svg viewBox="0 0 730 230" style={{ width: '100%', height: 'auto', background: '#F8F4EE', borderRadius: 10 }}>
      <defs>
        <pattern id="lp-grid" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M30 0H0V30" fill="none" stroke="#EDE7DC" /></pattern>
      </defs>
      <rect width="730" height="230" fill="url(#lp-grid)" />
      <rect x="265" y="14" width="200" height="32" rx="8" fill="#FBF0EE" stroke="#9E5E54" strokeWidth="2" />
      <text x="365" y="35" textAnchor="middle" fontFamily="Playfair Display,serif" fontSize="13" fontWeight="700" fill="#9E5E54">Sweetheart Table</text>
      {tables.map((t) => (
        <g key={t.label} fontFamily="Playfair Display,serif" textAnchor="middle">
          <circle cx={t.x} cy={t.y} r="40" fill={t.c.f} stroke={t.c.s} strokeWidth="3" />
          <text x={t.x} y={t.y} fontSize="13" fontWeight="700" fill={t.c.t}>{t.label}</text>
          <text x={t.x} y={t.y + 16} fontSize="10" fontFamily="Inter" fill={t.c.s}>{t.n}</text>
        </g>
      ))}
      <rect x="160" y="178" width="240" height="40" rx="8" fill="#F8F2E4" stroke="#C9A84C" strokeWidth="3" />
      <text x="280" y="203" textAnchor="middle" fontFamily="Playfair Display,serif" fontSize="13" fontWeight="700" fill="#8B6F2E">Family Banquet · 6/12</text>
      <rect x="470" y="178" width="110" height="40" rx="8" fill="#FBEAE8" stroke="#C8736A" strokeWidth="3" />
      <text x="525" y="203" textAnchor="middle" fontFamily="Playfair Display,serif" fontSize="13" fontWeight="700" fill="#8B4F48">Kids · 0/6</text>
    </svg>
  );
}
