import { Link } from 'react-router-dom';
import { ArrowLeft, Code2 } from 'lucide-react';
import './landing.css';

const DEVELOPERS = [
  {
    name: 'Rex Domingo',
    initials: 'RD',
    role: 'Lead Developer',
    blurb: 'Architecture, backend, and the glue that holds the console, field app, and KPI engine together.',
  },
  {
    name: 'Jhazon Enanoria',
    initials: 'JE',
    role: 'Developer',
    blurb: 'Builds and ships features across the platform — from installations to earnings.',
  },
  {
    name: 'Nelmar Jim Luna',
    initials: 'NL',
    role: 'Developer',
    blurb: 'Keeps the system dependable — from data flows to the details users never have to think about.',
  },
];

export function DevelopersPage() {
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
          <Link to="/" className="lp-btn lp-btn-ghost">
            <ArrowLeft size={16} /> Back to Home
          </Link>
        </header>

        <section className="lp-section" style={{ paddingTop: '3rem' }}>
          <div className="lp-rise lp-rise-2">
            <div className="lp-eyebrow">
              <Code2 size={13} style={{ verticalAlign: '-2px' }} /> The Team
            </div>
            <h1 className="lp-h2" style={{ fontSize: 'clamp(1.9rem, 3.6vw, 2.6rem)' }}>
              The developers behind <span className="lp-grad" style={{ background: 'linear-gradient(100deg, var(--lp-indigo) 10%, var(--lp-cyan) 90%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>Orbit Console</span>
            </h1>
            <p className="lp-sub">
              Built by <b style={{ color: 'var(--lp-cyan)' }}>Bhahoh Developer</b> — a small team
              shipping the console, the Beulah Field app, and everything in between.
            </p>
          </div>

          <div className="lp-devs-grid">
            {DEVELOPERS.map((dev, i) => (
              <div key={dev.name} className="lp-dev-card lp-rise" style={{ animationDelay: `${0.25 + i * 0.12}s` }}>
                <div className="lp-dev-avatar">{dev.initials}</div>
                <h3>{dev.name}</h3>
                <div className="lp-dev-role">{dev.role}</div>
                <p className="lp-dev-blurb">{dev.blurb}</p>
              </div>
            ))}
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
            <small>POWERED BY <b style={{ color: 'var(--lp-cyan)' }}>BHAGOH DEVELOPER</b></small>
            <Link to="/" className="lp-footer-link">HOME</Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
