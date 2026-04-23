import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./LandingPage.css";

const FEATURES = [
  {
    icon: (
      <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
    title: "Unified Inbox",
    desc: "Every patient conversation across all your clinic numbers in one real-time feed.",
  },
  {
    icon: (
      <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
    title: "HIPAA-Aligned Security",
    desc: "End-to-end encrypted message storage, audit logging, and role-based access control.",
  },
  {
    icon: (
      <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
      </svg>
    ),
    title: "Built-in Dialer",
    desc: "One-click outbound calls with automatic caller-ID masking and call forwarding.",
  },
  {
    icon: (
      <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    title: "Patient Contacts",
    desc: "Searchable patient directory with conversation history linked to every contact.",
  },
  {
    icon: (
      <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <rect x="5" y="2" width="14" height="20" rx="2" />
        <path d="M12 18h.01" />
      </svg>
    ),
    title: "Number Management",
    desc: "Provision, port, and manage multiple clinic numbers from a single dashboard.",
  },
  {
    icon: (
      <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path d="M9 12l2 2 4-4" />
        <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
      </svg>
    ),
    title: "SMS Compliance",
    desc: "Built-in 10DLC and toll-free verification flows so you stay carrier-approved.",
  },
];

const TESTIMONIALS = [
  {
    quote: "Health SMS replaced three different tools we were juggling. Our front desk staff can finally manage patient texts without switching apps.",
    name: "Dr. Sarah Chen",
    role: "Family Medicine, Riverside Health",
  },
  {
    quote: "The audit logging and encryption gave our compliance officer peace of mind. Setup took less than a day.",
    name: "James Morales",
    role: "IT Director, Pacific Dental Group",
  },
  {
    quote: "Patients love getting appointment reminders via text. Our no-show rate dropped 40% in the first month.",
    name: "Maria Santos",
    role: "Office Manager, Bay Area Pediatrics",
  },
];

export function LandingPage() {
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    const prev = document.documentElement.style.backgroundColor;
    document.documentElement.style.backgroundColor = "#050505";
    return () => { document.documentElement.style.backgroundColor = prev; };
  }, []);

  return (
    <div className="lp">
      {/* ── Navbar ───────────────────────────────────────────────── */}
      <nav className="lp-nav">
        <div className="lp-nav-inner">
          <Link to="/" className="lp-nav-brand">
            <div className="lp-nav-logo">
              <svg width="20" height="20" fill="none" stroke="#fff" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <span>Health SMS</span>
          </Link>

          <div className="lp-nav-links">
            <a href="#features">Features</a>
            <a href="#showcase">Product</a>
            <a href="#testimonials">Testimonials</a>
            <a href="#cta">Pricing</a>
          </div>

          <div className="lp-nav-actions">
            {isAuthenticated ? (
              <Link to="/inbox" className="lp-btn lp-btn-primary lp-btn-sm">
                Go to Inbox
              </Link>
            ) : (
              <>
                <Link to="/login" className="lp-nav-login">Log in</Link>
                <Link to="/signup" className="lp-btn lp-btn-primary lp-btn-sm">
                  Start for free
                </Link>
              </>
            )}
          </div>

          {/* Mobile menu toggle */}
          <button className="lp-nav-hamburger" aria-label="Menu" onClick={(e) => {
            e.currentTarget.closest(".lp-nav-inner").classList.toggle("lp-nav-open");
          }}>
            <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="lp-hero">
        <div className="lp-hero-glow" aria-hidden="true" />
        <div className="lp-container">
          <p className="lp-hero-tag">Secure patient messaging for modern clinics</p>
          <h1 className="lp-hero-headline">
            Communicate with patients,<br />
            <span className="lp-hero-gradient">faster and safer.</span>
          </h1>
          <p className="lp-hero-sub">
            Health SMS gives your practice a unified, HIPAA-aligned messaging
            hub — text, call, and manage every patient conversation from one
            place.
          </p>
          <div className="lp-hero-actions">
            <Link to="/signup" className="lp-btn lp-btn-primary lp-btn-lg">
              Start for free
            </Link>
            <a href="#features" className="lp-btn lp-btn-ghost lp-btn-lg">
              See features
            </a>
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────── */}
      <section className="lp-section" id="features">
        <div className="lp-container">
          <h2 className="lp-section-title">Everything your clinic needs</h2>
          <p className="lp-section-sub">
            One platform for messaging, calling, compliance, and patient management.
          </p>
          <div className="lp-features-grid">
            {FEATURES.map((f) => (
              <div key={f.title} className="lp-feature-card">
                <div className="lp-feature-icon">{f.icon}</div>
                <h3 className="lp-feature-title">{f.title}</h3>
                <p className="lp-feature-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Showcase ─────────────────────────────────────────────── */}
      <section className="lp-section lp-showcase-section" id="showcase">
        <div className="lp-container">
          <h2 className="lp-section-title">Built for healthcare teams</h2>
          <p className="lp-section-sub">
            A clean, focused interface your staff will actually enjoy using.
          </p>
          <div className="lp-showcase">
            <div className="lp-showcase-window">
              <div className="lp-showcase-bar">
                <span /><span /><span />
              </div>
              <div className="lp-showcase-body">
                <div className="lp-showcase-sidebar">
                  <div className="lp-showcase-sidebar-item lp-showcase-sidebar-active" />
                  <div className="lp-showcase-sidebar-item" />
                  <div className="lp-showcase-sidebar-item" />
                  <div className="lp-showcase-sidebar-item" />
                </div>
                <div className="lp-showcase-main">
                  <div className="lp-showcase-msg lp-showcase-msg-in" />
                  <div className="lp-showcase-msg lp-showcase-msg-out" />
                  <div className="lp-showcase-msg lp-showcase-msg-in lp-showcase-msg-short" />
                  <div className="lp-showcase-msg lp-showcase-msg-out lp-showcase-msg-short" />
                  <div className="lp-showcase-input" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Testimonials ─────────────────────────────────────────── */}
      <section className="lp-section" id="testimonials">
        <div className="lp-container">
          <h2 className="lp-section-title">Trusted by healthcare teams</h2>
          <p className="lp-section-sub">
            See why practices are switching to Health SMS.
          </p>
          <div className="lp-testimonials-grid">
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="lp-testimonial-card">
                <p className="lp-testimonial-quote">&ldquo;{t.quote}&rdquo;</p>
                <div className="lp-testimonial-author">
                  <div className="lp-testimonial-avatar">
                    {t.name.split(" ").map((w) => w[0]).join("")}
                  </div>
                  <div>
                    <div className="lp-testimonial-name">{t.name}</div>
                    <div className="lp-testimonial-role">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────── */}
      <section className="lp-cta-section" id="cta">
        <div className="lp-cta-glow" aria-hidden="true" />
        <div className="lp-container">
          <h2 className="lp-cta-headline">
            Ready to modernize your<br />patient communication?
          </h2>
          <p className="lp-cta-sub">
            Free to start. No credit card required. Set up in minutes.
          </p>
          <div className="lp-hero-actions">
            <Link to="/signup" className="lp-btn lp-btn-primary lp-btn-lg">
              Get started free
            </Link>
            <Link to="/login" className="lp-btn lp-btn-ghost lp-btn-lg">
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer className="lp-footer">
        <div className="lp-container lp-footer-inner">
          <div className="lp-footer-brand">
            <div className="lp-nav-logo">
              <svg width="16" height="16" fill="none" stroke="#fff" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <span>Health SMS</span>
          </div>
          <div className="lp-footer-links">
            <a href="#features">Features</a>
            <a href="#showcase">Product</a>
            <a href="#testimonials">Testimonials</a>
            <Link to="/login">Log in</Link>
          </div>
          <p className="lp-footer-copy">&copy; {new Date().getFullYear()} Health SMS. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
