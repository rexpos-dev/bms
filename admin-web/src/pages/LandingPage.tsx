import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  CalendarClock,
  Camera,
  Check,
  CheckCircle2,
  ClipboardList,
  Download,
  Globe,
  Key,
  KeyRound,
  MapPin,
  Monitor,
  Moon,
  Move,
  PhilippinePeso,
  PictureInPicture2,
  Scaling,
  ShieldCheck,
  Smartphone,
  Sun,
  Timer,
  Trophy,
  UserCheck,
  Wallet,
  Wrench,
  XCircle,
} from 'lucide-react';
import { api, fileUrl } from '../lib/api';
import './landing.css';

// Chromium-only; absent from the TS DOM lib.
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const APK_URL = '/downloads/beulah-field.apk';
// Canonical copy on the office-PC funnel. Used when the current origin doesn't
// host the APK: Railway's filesystem is ephemeral (downloads/ is empty there)
// and the Vite dev server answers this path with the SPA's index.html.
const APK_FALLBACK_URL = 'https://0rex-server.tail7dcc9b.ts.net/downloads/beulah-field.apk';
const LEAD_KEY = 'lp-lead-done';

const FEATURES = [
  {
    icon: Key,
    title: 'License Management',
    body: 'Issue, activate, and track software license keys per client — hardware-fingerprinted and auditable.',
  },
  {
    icon: Wrench,
    title: 'Installation Jobs',
    body: 'Schedule field installations, assign installers, and track every job from start to completion.',
  },
  {
    icon: MapPin,
    title: 'Proof of Service',
    body: 'Installers submit photos, client signature, and GPS location straight from the field via the mobile app.',
  },
  {
    icon: Trophy,
    title: 'KPI & Incentives',
    body: 'Role-based KPIs with automatic incentive generation — performance pays out, literally.',
  },
  {
    icon: PhilippinePeso,
    title: 'Earnings in ₱',
    body: 'Installation and activation earnings tracked per person, approved and paid in pesos.',
  },
  {
    icon: Wallet,
    title: 'Withdrawals',
    body: 'Request payouts with release proof attached — GCash, bank, or cash, fully logged.',
  },
  {
    icon: Timer,
    title: 'Dev Project Timer',
    body: 'A floating, pop-out task timer tracks development hours across every page — even outside the browser.',
  },
  {
    icon: Moon,
    title: 'Dark & Light Mode',
    body: 'The whole console switches themes in one click — easy on the eyes on long shifts. Try it on the preview above.',
  },
  {
    icon: BarChart3,
    title: 'Analytics & Audit',
    body: 'Revenue trends, team analytics, and a tamper-evident audit log behind role-based access.',
  },
];

const CHART_BARS = [34, 52, 41, 66, 58, 79, 64, 88, 72, 95, 84, 100];

/** The Beulah Field walkthrough shown inside the phone mockup, on loop. */
const PHONE_STEPS = ['Login', 'Dashboard', 'KPI Points', 'Start Task', 'Earnings', 'Withdraw', 'Approved', 'Orbit Console'];

function useScrollReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('.lp-reveal');
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('lp-in');
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

function PhoneScreen({ step }: { step: number }) {
  switch (step) {
    case 0: // Login
      return (
        <div className="lp-flip" key={step}>
          <div className="lp-scr-label">Sign In</div>
          <div className="lp-phone-logo" style={{ flex: 'none', margin: '1.2rem 0 1rem' }}>
            <img src="/favicon.svg" alt="" />
            <div className="lp-app-title" style={{ marginBottom: 0 }}>
              BEULAH <em>FIELD</em>
            </div>
          </div>
          <div className="lp-input">installer@beulah.ph</div>
          <div className="lp-input">••••••••</div>
          <div className="lp-app-btn lp-pulse">Sign In</div>
        </div>
      );
    case 1: // Dashboard
      return (
        <div className="lp-flip" key={step}>
          <div className="lp-app-title">
            BEULAH <em>FIELD</em>
          </div>
          <div className="lp-scr-label">Dashboard</div>
          <div className="lp-job">
            <b>Good morning, Installer!</b>
            <span>3 jobs today · 340 KPI pts</span>
          </div>
          <div className="lp-job">
            <b>Sunrise Mart — POS install</b>
            <span>Brgy. Poblacion · 9:00 AM</span>
          </div>
          <div className="lp-job">
            <b>Harbor Café — Activation</b>
            <span>Downtown · 1:30 PM</span>
          </div>
        </div>
      );
    case 2: // KPI points
      return (
        <div className="lp-flip lp-center" key={step}>
          <div className="lp-scr-label">KPI Points</div>
          <div style={{ margin: '2rem 0 0.4rem' }}>
            <Trophy size={26} style={{ color: 'var(--lp-cyan)' }} />
          </div>
          <div className="lp-big-num">340 pts</div>
          <div className="lp-job" style={{ textAlign: 'left', marginTop: '1rem' }}>
            <b>Installations target</b>
            <span>12 / 12 — incentive unlocked 🏆</span>
          </div>
        </div>
      );
    case 3: // Start task
      return (
        <div className="lp-flip" key={step}>
          <div className="lp-scr-label">My Jobs</div>
          <div className="lp-job">
            <b>Sunrise Mart — POS install</b>
            <span>Brgy. Poblacion · 9:00 AM</span>
            <div className="lp-app-btn lp-pulse">Start Job</div>
          </div>
          <div className="lp-job">
            <b>Proof of installation</b>
            <span>Photos · Signature · GPS lock</span>
          </div>
        </div>
      );
    case 4: // Earnings
      return (
        <div className="lp-flip" key={step}>
          <div className="lp-scr-label">Earnings</div>
          <div className="lp-earn-row">
            <span>Installation — Sunrise Mart</span>
            <b>+₱800</b>
          </div>
          <div className="lp-earn-row">
            <span>Activation — Harbor Café</span>
            <b>+₱500</b>
          </div>
          <div className="lp-earn-row">
            <span>July incentive</span>
            <b>+₱2,500</b>
          </div>
          <div className="lp-earn-row" style={{ borderColor: 'rgba(34,211,238,0.4)' }}>
            <span>Available balance</span>
            <b style={{ color: 'var(--lp-cyan)' }}>₱9,300</b>
          </div>
        </div>
      );
    case 5: // Withdraw
      return (
        <div className="lp-flip" key={step}>
          <div className="lp-scr-label">Withdraw</div>
          <div className="lp-input">Amount: ₱5,000</div>
          <div className="lp-input">GCash · 09•• ••• ••21</div>
          <div className="lp-app-btn lp-pulse">Request Withdrawal</div>
          <div className="lp-job" style={{ marginTop: '0.6rem' }}>
            <span>Requests are reviewed and released by the office with proof attached.</span>
          </div>
        </div>
      );
    case 6: // Approved
      return (
        <div className="lp-flip lp-center" key={step}>
          <div className="lp-scr-label">Withdrawal Status</div>
          <div style={{ marginTop: '1.6rem' }}>
            <div className="lp-check">
              <Check size={22} />
            </div>
            <b style={{ fontSize: '0.8rem' }}>₱5,000 APPROVED</b>
            <div className="lp-job" style={{ textAlign: 'left', marginTop: '0.9rem' }}>
              <span>Released via GCash · proof attached · 2:14 PM</span>
            </div>
          </div>
        </div>
      );
    default: // Orbit Console logo splash
      return (
        <div className="lp-flip lp-phone-logo" key={step}>
          <img src="/favicon.svg" alt="" />
          <div className="lp-app-title" style={{ marginBottom: 0 }}>
            ORBIT <em>CONSOLE</em>
          </div>
          <div className="lp-scr-label" style={{ marginBottom: 0 }}>One system · office + field</div>
        </div>
      );
  }
}

export function LandingPage() {
  useScrollReveal();
  const installEvent = useRef<BeforeInstallPromptEvent | null>(null);
  const [canPrompt, setCanPrompt] = useState(false);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [snapLight, setSnapLight] = useState(false);
  const [phoneStep, setPhoneStep] = useState(0);
  const [timerSec, setTimerSec] = useState(2129); // demo timer starts at 00:35:29

  useEffect(() => {
    const t = setInterval(() => setTimerSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const pad = (n: number) => String(n).padStart(2, '0');
  const timerClock = `${pad(Math.floor(timerSec / 3600))}:${pad(Math.floor((timerSec % 3600) / 60))}:${pad(timerSec % 60)}`;

  // Lead-capture gate: company details + email OTP required before any download/install.
  const [leadFor, setLeadFor] = useState<'apk' | 'desktop' | null>(null);
  const [lead, setLead] = useState({ companyName: '', contactPerson: '', contactNo: '', email: '' });
  const [leadBusy, setLeadBusy] = useState(false);
  const [leadError, setLeadError] = useState<string | null>(null);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [leadSuccess, setLeadSuccess] = useState<'apk' | 'desktop' | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      installEvent.current = e as BeforeInstallPromptEvent;
      setCanPrompt(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  // Cycle the Beulah Field walkthrough screens.
  useEffect(() => {
    const t = setInterval(() => setPhoneStep((s) => (s + 1) % PHONE_STEPS.length), 2400);
    return () => clearInterval(t);
  }, []);

  const installDesktop = async () => {
    if (installEvent.current) {
      await installEvent.current.prompt();
      const choice = await installEvent.current.userChoice;
      if (choice.outcome === 'accepted') {
        installEvent.current = null;
        setCanPrompt(false);
      }
    } else {
      setShowInstallHelp(true);
    }
  };

  // Resolve where the APK actually lives: prefer the current origin (or the dev
  // API), fall back to the funnel when this deployment doesn't host the file.
  const [apkUrl, setApkUrl] = useState(() => fileUrl(APK_URL));
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(fileUrl(APK_URL), { method: 'HEAD' });
        const type = res.headers.get('content-type') ?? '';
        if (res.ok && !type.includes('text/html')) return; // real APK is here
      } catch {
        // origin unreachable / CORS — use the fallback
      }
      if (!cancelled) setApkUrl(APK_FALLBACK_URL);
    })();
    return () => { cancelled = true; };
  }, []);

  const triggerApkDownload = () => {
    const a = document.createElement('a');
    a.href = apkUrl;
    a.download = 'beulah-field.apk';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const proceed = (target: 'apk' | 'desktop') => {
    if (target === 'apk') {
      triggerApkDownload();
    } else {
      void installDesktop();
    }
  };

  const closeLeadModal = () => {
    setLeadFor(null);
    setLeadSuccess(null);
  };

  const requestDownload = (target: 'apk' | 'desktop') => {
    if (localStorage.getItem(LEAD_KEY) === '1') {
      proceed(target);
    } else {
      setLeadError(null);
      setLeadFor(target);
    }
  };

  const apiError = (err: unknown): string => {
    const m = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
    return (Array.isArray(m) ? m[0] : m) ?? 'Something went wrong — please try again.';
  };

  const resendCode = async () => {
    setLeadBusy(true);
    setLeadError(null);
    try {
      const { data } = await api.post<{ sent: boolean }>('/download-leads/send-code', { email: lead.email });
      if (data.sent) {
        setCodeSent(true);
        setCooldown(60);
      } else {
        setLeadError('Could not send a code right now — submit again to continue without verification.');
        setCodeSent(false);
      }
    } catch (err) {
      setLeadError(apiError(err));
    } finally {
      setLeadBusy(false);
    }
  };

  const createLead = async (withCode: boolean) => {
    if (!leadFor) return;
    await api.post('/download-leads', {
      companyName: lead.companyName,
      contactPerson: lead.contactPerson,
      contactNo: lead.contactNo,
      email: lead.email,
      code: withCode ? code : undefined,
      platform: leadFor === 'apk' ? 'ANDROID_APK' : 'DESKTOP_PWA',
    });
    localStorage.setItem(LEAD_KEY, '1');
    // Browsers treat downloads fired after an async call as "automatic" and may
    // block them — show a success step whose button click is a real gesture.
    if (leadFor === 'apk') triggerApkDownload();
    setLeadSuccess(leadFor);
  };

  const submitLead = async (e: FormEvent) => {
    e.preventDefault();
    if (!leadFor) return;
    setLeadBusy(true);
    setLeadError(null);
    try {
      if (!codeSent) {
        // First submit tries to email a verification code. When delivery is
        // unavailable, fall back to accepting the lead unverified.
        const { data } = await api.post<{ sent: boolean }>('/download-leads/send-code', { email: lead.email });
        if (data.sent) {
          setCodeSent(true);
          setCooldown(60);
          return;
        }
        await createLead(false);
        return;
      }
      await createLead(true);
    } catch (err) {
      setLeadError(apiError(err));
    } finally {
      setLeadBusy(false);
    }
  };

  return (
    <div className="lp">
      <div className="lp-wrap">
        <header className="lp-topbar lp-rise lp-rise-1">
          <div className="lp-brand">
            <img src="/favicon.svg" alt="Orbit Console logo" />
            <span className="lp-brand-name">
              ORBIT <em>CONSOLE</em>
            </span>
          </div>
          <Link to="/login" className="lp-btn lp-btn-ghost">
            Sign In
          </Link>
        </header>

        {/* ── Hero ── */}
        <section className="lp-hero">
          <div>
            <div className="lp-eyebrow lp-rise lp-rise-2">Field Ops · Licensing · KPI</div>
            <h1 className="lp-rise lp-rise-2">
              Mission control for your <span className="lp-grad">software business</span>
            </h1>
            <p className="lp-rise lp-rise-3">
              Orbit Console runs the whole operation in one place — POS licenses, field installations
              with GPS-stamped proof, peso earnings, and KPI-driven incentives — synced live between
              the office console and the installer app.
            </p>
            <div className="lp-hero-ctas lp-rise lp-rise-4">
              <button type="button" className="lp-btn lp-btn-primary" onClick={() => requestDownload('apk')}>
                <Download size={17} /> Download APK
              </button>
              <button type="button" className="lp-btn lp-btn-cyan" onClick={() => requestDownload('desktop')}>
                <Monitor size={17} /> Install on Desktop
              </button>
              <Link to="/login" className="lp-btn lp-btn-ghost">
                <Globe size={17} /> Open Web App
              </Link>
            </div>
            <div className="lp-hero-note lp-rise lp-rise-4">
              PRE-CONNECTED TO THE BEULAH SERVER — INSTALL, SIGN IN, GO.
            </div>
          </div>

          {/* Mock of the real console dashboard — sample data only */}
          <div className="lp-shot lp-rise lp-rise-5">
            <div className="lp-orbit lp-orbit-1">
              <i />
            </div>
            <div className="lp-orbit lp-orbit-2">
              <i />
            </div>
            <div className={`lp-window${snapLight ? ' lp-light' : ''}`}>
              <div className="lp-window-bar">
                <i />
                <i />
                <i />
                <span>ORBIT CONSOLE · DASHBOARD</span>
                <button
                  type="button"
                  className="lp-theme-toggle"
                  title={snapLight ? 'Switch preview to dark mode' : 'Switch preview to light mode'}
                  onClick={() => setSnapLight((v) => !v)}
                >
                  {snapLight ? <Moon size={13} /> : <Sun size={13} />}
                </button>
              </div>
              <div className="lp-window-body" aria-hidden="true">
                <div className="lp-mini-nav">
                  <i className="lp-on" />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <div className="lp-mini-main">
                  <div className="lp-stats">
                    <div className="lp-stat">
                      <b className="lp-green">₱128,400</b>
                      <span>Total Revenue</span>
                    </div>
                    <div className="lp-stat">
                      <b className="lp-green">+12.4%</b>
                      <span>Monthly Growth</span>
                    </div>
                    <div className="lp-stat">
                      <b>24</b>
                      <span>Active Clients</span>
                    </div>
                    <div className="lp-stat">
                      <b>38</b>
                      <span>Activated Licenses</span>
                    </div>
                    <div className="lp-stat">
                      <b>5</b>
                      <span>Open Install Jobs</span>
                    </div>
                    <div className="lp-stat">
                      <b>2</b>
                      <span>Pending Withdrawals</span>
                    </div>
                  </div>
                  <div className="lp-charts">
                    <div className="lp-panel">
                      <div className="lp-panel-title">Licenses by Status</div>
                      <div className="lp-pie-row">
                        <div className="lp-pie" />
                        <div className="lp-legend">
                          <span>
                            <i style={{ background: 'var(--lp-indigo)' }} />
                            Activated
                          </span>
                          <span>
                            <i style={{ background: 'var(--lp-cyan)' }} />
                            Pending
                          </span>
                          <span>
                            <i style={{ background: 'rgba(148,163,184,0.5)' }} />
                            Expired
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="lp-panel">
                      <div className="lp-panel-title">Revenue Trend</div>
                      <div className="lp-chart">
                        {CHART_BARS.map((h, i) => (
                          <i key={i} style={{ height: `${h}%`, animationDelay: `${0.5 + i * 0.05}s` }} />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Features ── */}
        <section className="lp-section">
          <div className="lp-reveal">
            <div className="lp-kicker">Everything on board</div>
            <h2 className="lp-h2">One system, the whole operation</h2>
            <p className="lp-sub">
              From the first job order to the last peso paid out — every module talks to the same
              live data, guarded by role-based access for admins, installers, developers, and sales.
            </p>
          </div>
          <div className="lp-grid">
            {FEATURES.map((f, i) => (
              <div key={f.title} className="lp-card lp-reveal" style={{ transitionDelay: `${(i % 3) * 70}ms` }}>
                <div className="lp-card-ic">
                  <f.icon size={19} />
                </div>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── KPI spotlight ── */}
        <section className="lp-section">
          <div className="lp-kpi lp-reveal">
            <div>
              <div className="lp-kicker">KPI Engine</div>
              <h2 className="lp-h2">Performance that pays itself out</h2>
              <ul>
                <li>
                  <BadgeCheck size={17} />
                  Per-role KPI definitions — installers, developers, designers, and sales each
                  measured on what actually matters for them.
                </li>
                <li>
                  <Activity size={17} />
                  Live team scoreboard by month, with designer points synced automatically from
                  project work.
                </li>
                <li>
                  <PhilippinePeso size={17} />
                  Hit the target and the system generates the incentive — straight into earnings,
                  ready for withdrawal.
                </li>
              </ul>
            </div>
            <div className="lp-kpi-visual" aria-hidden="true">
              <div className="lp-meter">
                <div className="lp-meter-top">
                  <span>Installations target</span>
                  <b>12 / 12</b>
                </div>
                <div className="lp-meter-bar">
                  <i style={{ width: '100%' }} />
                </div>
              </div>
              <div className="lp-meter">
                <div className="lp-meter-top">
                  <span>Activation turnaround</span>
                  <b>92%</b>
                </div>
                <div className="lp-meter-bar">
                  <i style={{ width: '92%', animationDelay: '0.15s' }} />
                </div>
              </div>
              <div className="lp-meter">
                <div className="lp-meter-top">
                  <span>Designer points</span>
                  <b>340 pts</b>
                </div>
                <div className="lp-meter-bar">
                  <i style={{ width: '78%', animationDelay: '0.3s' }} />
                </div>
              </div>
              <div className="lp-incentive">
                <Trophy size={16} /> +₱2,500 INCENTIVE UNLOCKED — JULY
              </div>
            </div>
          </div>
        </section>

        {/* ── Dev Project Timer spotlight ── */}
        <section className="lp-section">
          <div className="lp-mobile">
            <div className="lp-reveal">
              <div className="lp-kicker">Dev Project Timer</div>
              <h2 className="lp-h2">Every dev hour, on the record</h2>
              <p className="lp-sub" style={{ marginBottom: '1.4rem' }}>
                Start a project timer and it follows you everywhere — a floating widget that stays on
                every page of the console while you work. Starting a new task auto-stops the previous
                one, so tracked hours are always honest. It even pops out of the browser entirely and
                floats on top of VS Code, Excel, or anything else on your screen.
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                <li style={{ display: 'flex', gap: '0.6rem', color: 'var(--lp-muted)', fontSize: '0.9rem' }}>
                  <Move size={16} style={{ color: 'var(--lp-cyan)', flexShrink: 0, marginTop: 2 }} />
                  Drag it anywhere, resize it from 60% to 200% — it remembers where you left it.
                </li>
                <li style={{ display: 'flex', gap: '0.6rem', color: 'var(--lp-muted)', fontSize: '0.9rem' }}>
                  <PictureInPicture2 size={16} style={{ color: 'var(--lp-cyan)', flexShrink: 0, marginTop: 2 }} />
                  Pop-out mode: a real always-on-top window, visible outside the browser.
                </li>
                <li style={{ display: 'flex', gap: '0.6rem', color: 'var(--lp-muted)', fontSize: '0.9rem' }}>
                  <Activity size={16} style={{ color: 'var(--lp-cyan)', flexShrink: 0, marginTop: 2 }} />
                  Pause, resume, stop — every session banks into the project&apos;s total tracked time.
                </li>
              </ul>
            </div>
            <div className="lp-timer-zone lp-reveal" aria-hidden="true">
              <div className="lp-timer-widget">
                <div className="lp-timer-head">
                  <span className="lp-grip">⠿</span>
                  <span className="lp-live-dot" />
                  <strong>BEULAH KPI</strong>
                  <span className="lp-min">–</span>
                </div>
                <div className="lp-timer-clock">{timerClock}</div>
                <div className="lp-timer-total">417h 37m total tracked</div>
                <div className="lp-timer-btns">
                  <i className="lp-t-pause">Pause</i>
                  <i className="lp-t-stop">Stop</i>
                </div>
                <span className="lp-t-grip2">◢</span>
              </div>
              <div className="lp-timer-tags">
                <span className="lp-tag"><Move size={10} style={{ verticalAlign: '-1px' }} /> DRAGGABLE</span>
                <span className="lp-tag"><Scaling size={10} style={{ verticalAlign: '-1px' }} /> RESIZABLE</span>
                <span className="lp-tag"><PictureInPicture2 size={10} style={{ verticalAlign: '-1px' }} /> POP-OUT</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── Mobile app ── */}
        <section className="lp-section">
          <div className="lp-mobile">
            <div className="lp-phone-zone lp-reveal">
              <div className="lp-phone" aria-hidden="true">
                <div className="lp-screen">
                  <div className="lp-notch">
                    <i />
                  </div>
                  <PhoneScreen step={phoneStep} />
                </div>
              </div>
              <div className="lp-step-label">
                {String(phoneStep + 1).padStart(2, '0')} · <b>{PHONE_STEPS[phoneStep]}</b>
              </div>
              <div className="lp-dots" aria-hidden="true">
                {PHONE_STEPS.map((s, i) => (
                  <i key={s} className={i === phoneStep ? 'lp-dot-on' : undefined} />
                ))}
              </div>
            </div>
            <div className="lp-reveal">
              <div className="lp-kicker">Beulah Field · Android</div>
              <h2 className="lp-h2">The office, in the installer&apos;s pocket</h2>
              <p className="lp-sub" style={{ marginBottom: '1.6rem' }}>
                Watch the whole flow: sign in, check the dashboard, view KPI points, start a task
                on-site, track peso earnings, request a withdrawal, and see it approved — all from
                one lightweight app that comes pre-wired to your Beulah server. No setup screens:
                install, sign in, work.
              </p>
              <button type="button" className="lp-btn lp-btn-primary" onClick={() => requestDownload('apk')}>
                <Smartphone size={17} /> Download Beulah Field APK
              </button>
            </div>
          </div>
        </section>

        {/* ── Before / After: proof of the installation flow ── */}
        <section className="lp-section">
          <div className="lp-reveal">
            <div className="lp-kicker">Proof of Service</div>
            <h2 className="lp-h2">Installations, before and after Orbit Console</h2>
            <p className="lp-sub">
              The difference isn&apos;t just software — it&apos;s a paper trail for every install, from
              schedule to peso payout.
            </p>
          </div>

          <div className="lp-ba-grid">
            <div className="lp-ba lp-ba-before lp-reveal">
              <h3>Before</h3>
              <ul>
                <li><XCircle size={16} /> Installations tracked in group chats and paper logbooks — jobs slip through.</li>
                <li><XCircle size={16} /> No proof the installer actually went on-site or finished the job.</li>
                <li><XCircle size={16} /> License keys in spreadsheets; activations delayed for days.</li>
                <li><XCircle size={16} /> Installer pay computed manually at month-end — disputes every payday.</li>
              </ul>
            </div>
            <div className="lp-ba lp-ba-after lp-reveal" style={{ transitionDelay: '90ms' }}>
              <h3>With Orbit Console</h3>
              <ul>
                <li><CheckCircle2 size={16} /> Every job scheduled, assigned, and visible on one live board.</li>
                <li><CheckCircle2 size={16} /> Photo + client signature + GPS lock submitted from the field — undeniable proof.</li>
                <li><CheckCircle2 size={16} /> Proof triggers license activation the same day.</li>
                <li><CheckCircle2 size={16} /> Earnings post automatically per completed job — payday is just a withdrawal away.</li>
              </ul>
            </div>
          </div>

          <div className="lp-flow lp-reveal" aria-label="System flow">
            <div className="lp-flow-step">
              <span className="lp-flow-num">01</span>
              <CalendarClock size={20} />
              <b>Schedule</b>
              <span>Office books the installation job</span>
            </div>
            <div className="lp-flow-arrow"><ArrowRight size={16} /></div>
            <div className="lp-flow-step">
              <span className="lp-flow-num">02</span>
              <UserCheck size={20} />
              <b>Assign</b>
              <span>Installer gets it instantly on mobile</span>
            </div>
            <div className="lp-flow-arrow"><ArrowRight size={16} /></div>
            <div className="lp-flow-step">
              <span className="lp-flow-num">03</span>
              <Camera size={20} />
              <b>Install + Proof</b>
              <span>Photos, signature, GPS from the site</span>
            </div>
            <div className="lp-flow-arrow"><ArrowRight size={16} /></div>
            <div className="lp-flow-step">
              <span className="lp-flow-num">04</span>
              <KeyRound size={20} />
              <b>Activate</b>
              <span>License goes live against the proof</span>
            </div>
            <div className="lp-flow-arrow"><ArrowRight size={16} /></div>
            <div className="lp-flow-step">
              <span className="lp-flow-num">05</span>
              <PhilippinePeso size={20} />
              <b>Earn</b>
              <span>Pay posts automatically, withdraw anytime</span>
            </div>
          </div>

          <div className="lp-cta-row lp-reveal">
            <button type="button" className="lp-btn lp-btn-primary" onClick={() => requestDownload('apk')}>
              <Download size={17} /> Start with the Field App
            </button>
            <Link to="/login" className="lp-btn lp-btn-cyan">
              <Globe size={17} /> See it Live — Sign In
            </Link>
          </div>
        </section>

        {/* ── Downloads ── */}
        <section className="lp-section" id="download">
          <div className="lp-reveal">
            <div className="lp-kicker">Get Orbit Console</div>
            <h2 className="lp-h2">Three ways in — all pre-connected</h2>
            <p className="lp-sub">
              Every install points at the Beulah server out of the box. Nothing to configure.
            </p>
          </div>
          <div className="lp-dl-grid">
            <div className="lp-dl lp-reveal">
              <Smartphone className="lp-dl-ic" size={26} />
              <h3>Android APK</h3>
              <p>
                For installers in the field. Download the Beulah Field app, install, and sign in
                with your account.
              </p>
              <button type="button" className="lp-btn lp-btn-primary" onClick={() => requestDownload('apk')}>
                <Download size={16} /> Download APK
              </button>
              <span className="lp-dl-note">ANDROID 8.0+ · ARM64 · ~30 MB</span>
            </div>
            <div className="lp-dl lp-reveal" style={{ transitionDelay: '80ms' }}>
              <Monitor className="lp-dl-ic" size={26} />
              <h3>Desktop App</h3>
              <p>
                Install the console as a desktop app — its own window, its own icon, no browser
                tabs. Powered by your browser, always up to date.
              </p>
              <button type="button" className="lp-btn lp-btn-cyan" onClick={() => requestDownload('desktop')}>
                <Download size={16} /> Install on Desktop
              </button>
              {showInstallHelp && !canPrompt && (
                <div className="lp-install-help">
                  In Chrome or Edge: open the ⋮ menu → <b>Cast, save and share</b> →{' '}
                  <b>Install Orbit Console</b>. (Already installed? It&apos;s in your Start menu.)
                </div>
              )}
              <span className="lp-dl-note">CHROME / EDGE · WINDOWS · MAC</span>
            </div>
            <div className="lp-dl lp-reveal" style={{ transitionDelay: '160ms' }}>
              <Globe className="lp-dl-ic" size={26} />
              <h3>Web App</h3>
              <p>
                No install at all — the full console runs right here in the browser, on any device.
              </p>
              <Link to="/login" className="lp-btn lp-btn-ghost">
                <ShieldCheck size={16} /> Sign In Now
              </Link>
              <span className="lp-dl-note">ANY MODERN BROWSER</span>
            </div>
          </div>
        </section>

        <footer className="lp-footer">
          <div className="lp-footer-top">
            <div className="lp-brand">
              <img src="/favicon.svg" alt="" />
              <span className="lp-brand-name" style={{ fontSize: '0.85rem' }}>
                ORBIT <em>CONSOLE</em>
              </span>
            </div>
            <div className="lp-devs">
              <Link to="/developers" className="lp-footer-link">DEVELOPERS</Link>
            </div>
            <Link to="/login" className="lp-btn lp-btn-ghost" style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}>
              Sign In
            </Link>
          </div>
          <small>
            <ClipboardList size={11} style={{ verticalAlign: '-1px', marginRight: 4 }} />
            ORBIT CONSOLE · POWERED BY <b style={{ color: 'var(--lp-cyan)' }}>BHAGOH DEVELOPER</b> —
            DASHBOARD PREVIEW USES SAMPLE DATA
          </small>
        </footer>
      </div>

      {/* ── Lead-capture modal (before any download/install) ── */}
      {leadFor && (
        <div className="lp-modal-overlay" onClick={() => !leadBusy && closeLeadModal()}>
          <div className="lp-modal" onClick={(e) => e.stopPropagation()}>
            {leadSuccess ? (
              <div className="lp-center">
                <div className="lp-check">
                  <Check size={22} />
                </div>
                <h3>You&apos;re all set!</h3>
                {leadSuccess === 'apk' ? (
                  <>
                    <p className="lp-modal-sub">
                      Your download should have started. If it didn&apos;t, tap the button below.
                    </p>
                    <a href={apkUrl} download className="lp-btn lp-btn-primary">
                      <Download size={16} /> Download APK
                    </a>
                  </>
                ) : (
                  <>
                    <p className="lp-modal-sub">Click below to install Orbit Console on this computer.</p>
                    <button type="button" className="lp-btn lp-btn-cyan" onClick={installDesktop}>
                      <Monitor size={16} /> Install on Desktop
                    </button>
                    {showInstallHelp && !canPrompt && (
                      <div className="lp-install-help" style={{ textAlign: 'left' }}>
                        In Chrome or Edge: open the ⋮ menu → <b>Cast, save and share</b> →{' '}
                        <b>Install Orbit Console</b>.
                      </div>
                    )}
                  </>
                )}
                <div className="lp-modal-actions">
                  <button type="button" className="lp-btn lp-btn-ghost" onClick={closeLeadModal}>
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <>
            <h3>Before you download…</h3>
            <p className="lp-modal-sub">
              Tell us a bit about your company so we can serve you better. One time only — then your
              {leadFor === 'apk' ? ' APK download' : ' desktop install'} starts right away.
            </p>
            <form onSubmit={submitLead}>
              <div className="lp-field">
                <label htmlFor="lp-company">Company / Business Name</label>
                <input
                  id="lp-company"
                  required
                  minLength={2}
                  maxLength={160}
                  value={lead.companyName}
                  onChange={(e) => setLead({ ...lead, companyName: e.target.value })}
                />
              </div>
              <div className="lp-field">
                <label htmlFor="lp-person">Contact Person</label>
                <input
                  id="lp-person"
                  required
                  minLength={2}
                  maxLength={120}
                  value={lead.contactPerson}
                  onChange={(e) => setLead({ ...lead, contactPerson: e.target.value })}
                />
              </div>
              <div className="lp-field">
                <label htmlFor="lp-contact">Contact Number</label>
                <input
                  id="lp-contact"
                  required
                  minLength={7}
                  maxLength={40}
                  value={lead.contactNo}
                  onChange={(e) => setLead({ ...lead, contactNo: e.target.value })}
                />
              </div>
              <div className="lp-field">
                <label htmlFor="lp-email">Email</label>
                <input
                  id="lp-email"
                  type="email"
                  required
                  value={lead.email}
                  onChange={(e) => {
                    setLead({ ...lead, email: e.target.value });
                    // Changing the address invalidates the code that was sent.
                    setCodeSent(false);
                    setCode('');
                  }}
                />
              </div>
              {codeSent && (
                <div className="lp-field">
                  <label htmlFor="lp-code">Verification Code</label>
                  <input
                    id="lp-code"
                    required
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    minLength={6}
                    maxLength={6}
                    placeholder="6-digit code"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  />
                  <p className="lp-modal-sub" style={{ margin: '0.45rem 0 0', fontSize: '0.74rem' }}>
                    We emailed a code to <b style={{ color: 'var(--lp-cyan)' }}>{lead.email}</b> — check
                    the inbox (and spam folder).{' '}
                    <button
                      type="button"
                      disabled={cooldown > 0 || leadBusy}
                      onClick={resendCode}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        color: cooldown > 0 ? 'var(--lp-muted)' : 'var(--lp-cyan)',
                        cursor: cooldown > 0 ? 'default' : 'pointer',
                        font: 'inherit',
                        textDecoration: 'underline',
                      }}
                    >
                      {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                    </button>
                  </p>
                </div>
              )}
              {leadError && <p className="lp-modal-error">{leadError}</p>}
              <div className="lp-modal-actions">
                <button type="submit" className="lp-btn lp-btn-primary" disabled={leadBusy}>
                  {leadBusy
                    ? 'Working…'
                    : !codeSent
                      ? 'Send Verification Code'
                      : leadFor === 'apk'
                        ? 'Verify & Download'
                        : 'Verify & Install'}
                </button>
                <button type="button" className="lp-btn lp-btn-ghost" disabled={leadBusy} onClick={closeLeadModal}>
                  Cancel
                </button>
              </div>
            </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
