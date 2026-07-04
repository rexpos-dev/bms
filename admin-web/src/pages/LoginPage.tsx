import { type FormEvent, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import axios from 'axios';
import { login } from '../lib/api';
import { useAuthStore } from '../lib/auth-store';

/* ---------- inline icons (no extra deps) ---------- */
const MailIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="3" />
    <path d="m3 6 9 6 9-6" />
  </svg>
);
const LockIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);
const EyeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const EyeOffIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.7 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a13.2 13.2 0 0 1-2.2 3M6.6 6.6A13.3 13.3 0 0 0 2 12s3.5 7 10 7a10.4 10.4 0 0 0 4.3-.9" />
    <path d="m9.9 9.9a3 3 0 0 0 4.2 4.2M2 2l20 20" />
  </svg>
);
const ArrowIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
const Spinner = () => (
  <svg className="lg-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
    <path d="M12 3a9 9 0 1 0 9 9" />
  </svg>
);

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();
  const location = useLocation();
  const reduce = useReducedMotion();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const session = await login(email, password);
      setSession(session);
      navigate(from, { replace: true });
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? (err.response?.data as { message?: string } | undefined)?.message ?? 'Invalid email or password'
        : 'Something went wrong. Please try again.';
      setError(Array.isArray(message) ? message.join(', ') : message);
    } finally {
      setSubmitting(false);
    }
  };

  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.09, delayChildren: 0.15 } },
  };
  const item = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 260, damping: 24 } },
  };

  const orb = (extra: Record<string, number[]>, duration: number) =>
    reduce
      ? {}
      : { animate: { ...extra }, transition: { duration, repeat: Infinity, ease: 'easeInOut' as const } };

  return (
    <div className="lg-root">
      {/* animated aurora background */}
      <div className="lg-aurora" aria-hidden>
        <motion.span className="lg-orb lg-orb-1" {...orb({ x: [0, 40, -20, 0], y: [0, -30, 20, 0], scale: [1, 1.15, 0.95, 1] }, 20)} />
        <motion.span className="lg-orb lg-orb-2" {...orb({ x: [0, -35, 25, 0], y: [0, 25, -20, 0], scale: [1, 0.9, 1.1, 1] }, 24)} />
        <motion.span className="lg-orb lg-orb-3" {...orb({ x: [0, 30, -30, 0], y: [0, -20, 25, 0], scale: [1, 1.1, 0.92, 1] }, 28)} />
        <div className="lg-grid" />
      </div>

      <motion.form
        onSubmit={handleSubmit}
        className="lg-card"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {/* sheen sweep */}
        <span className="lg-sheen" aria-hidden />

        <motion.div className="lg-brand" variants={item}>
          <motion.div
            className="lg-logo"
            initial={{ scale: 0.6, opacity: 0, rotate: -12 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 14, delay: 0.1 }}
          >
            <svg width="30" height="30" viewBox="0 0 48 48" fill="none">
              <defs>
                <linearGradient id="lgRing" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#22d3ee" />
                  <stop offset="1" stopColor="#e879f9" />
                </linearGradient>
              </defs>
              <circle cx="24" cy="24" r="13" fill="none" stroke="#fff" strokeWidth="5" />
              <circle cx="24" cy="24" r="4.5" fill="#e879f9" />
              <g transform="rotate(-24 24 24)">
                <ellipse cx="24" cy="24" rx="21" ry="8.5" fill="none" stroke="url(#lgRing)" strokeWidth="2.6" />
                <circle cx="3" cy="24" r="2.4" fill="#22d3ee" />
                <circle cx="45" cy="24" r="2.4" fill="#e879f9" />
              </g>
            </svg>
          </motion.div>
          <h1 className="lg-title">Orbit Console</h1>
          <p className="lg-sub">Everything orbits here</p>
        </motion.div>

        <motion.div className="lg-field" variants={item}>
          <label htmlFor="email">Email</label>
          <div className="lg-input-wrap">
            <span className="lg-ico"><MailIcon /></span>
            <input
              id="email"
              type="email"
              autoComplete="username"
              placeholder="you@company.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="lg-input"
            />
          </div>
        </motion.div>

        <motion.div className="lg-field" variants={item}>
          <label htmlFor="password">Password</label>
          <div className="lg-input-wrap">
            <span className="lg-ico"><LockIcon /></span>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="********"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="lg-input"
            />
            <button
              type="button"
              className="lg-toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              tabIndex={-1}
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        </motion.div>

        <AnimatePresence>
          {error && (
            <motion.p
              className="lg-error"
              initial={{ opacity: 0, height: 0, x: 0 }}
              animate={{ opacity: 1, height: 'auto', x: [0, -8, 8, -5, 5, 0] }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ x: { duration: 0.4 } }}
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <motion.button
          type="submit"
          className="lg-btn"
          variants={item}
          disabled={submitting}
          whileHover={submitting ? undefined : { y: -2 }}
          whileTap={submitting ? undefined : { scale: 0.98 }}
        >
          <span className="lg-btn-glow" aria-hidden />
          {submitting ? (
            <><Spinner /> Signing in...</>
          ) : (
            <>Sign in <ArrowIcon /></>
          )}
        </motion.button>

        <motion.p className="lg-footer" variants={item}>
          Beulah Monitoring System
        </motion.p>
      </motion.form>
    </div>
  );
}
