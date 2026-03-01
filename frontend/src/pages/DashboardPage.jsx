import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { useAuth } from "../context/AuthContext";
import { getConversations, getPhoneNumbers } from "../utils/api";
import "./DashboardPage.css";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function DashboardPage() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ open: 0, unread: 0, inboxes: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    Promise.all([getConversations(token), getPhoneNumbers(token)])
      .then(([convs, nums]) => {
        const open = convs.filter((c) => c.status === "open").length;
        const unread = convs.filter(
          (c) =>
            c.lastMessageDirection === "inbound" &&
            c.lastMessageAt &&
            Date.now() - new Date(c.lastMessageAt).getTime() < 7 * 24 * 60 * 60 * 1000
        ).length;
        setStats({ open, unread, inboxes: nums.length });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <AppShell>
      <div className="dash-page">
        <header className="dash-header">
          <div className="dash-header-left">
            <h1 className="dash-title">
              {greeting()}, {user?.email?.split("@")[0] ?? "there"}
            </h1>
            <p className="dash-subtitle">Here's what's happening today.</p>
          </div>
          <button type="button" className="dash-logout" onClick={logout}>
            Log out
          </button>
        </header>

        <section className="dash-stats">
          <div className="dash-stat-card">
            <div className="dash-stat-icon dash-icon-msg">
              <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div className="dash-stat-body">
              <div className="dash-stat-value">{loading ? "—" : stats.open}</div>
              <div className="dash-stat-label">Open Conversations</div>
            </div>
          </div>

          <div className="dash-stat-card">
            <div className="dash-stat-icon dash-icon-unread">
              <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </div>
            <div className="dash-stat-body">
              <div className="dash-stat-value">{loading ? "—" : stats.unread}</div>
              <div className="dash-stat-label">Recent Inbound</div>
            </div>
          </div>

          <div className="dash-stat-card">
            <div className="dash-stat-icon dash-icon-inbox">
              <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                <path d="M12 18h.01" />
              </svg>
            </div>
            <div className="dash-stat-body">
              <div className="dash-stat-value">{loading ? "—" : stats.inboxes}</div>
              <div className="dash-stat-label">Active Numbers</div>
            </div>
          </div>
        </section>

        <section className="dash-actions">
          <h2 className="dash-section-title">Quick Actions</h2>
          <div className="dash-action-grid">
            <button
              type="button"
              className="dash-action-card"
              onClick={() => navigate("/inbox")}
            >
              <div className="dash-action-icon dash-action-msg">
                <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <div className="dash-action-label">Messages</div>
              <div className="dash-action-desc">View and send SMS conversations</div>
            </button>

            <button
              type="button"
              className="dash-action-card"
              onClick={() => navigate("/dialer")}
            >
              <div className="dash-action-icon dash-action-call">
                <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.37 2 2 0 0 1 3.6 1.2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.9a16 16 0 0 0 6.1 6.1l.91-.91a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              </div>
              <div className="dash-action-label">Dialer</div>
              <div className="dash-action-desc">Make outbound calls to patients</div>
            </button>

            <button
              type="button"
              className="dash-action-card"
              onClick={() => navigate("/contacts")}
            >
              <div className="dash-action-icon dash-action-contacts">
                <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <div className="dash-action-label">Contacts</div>
              <div className="dash-action-desc">Manage your patient contacts</div>
            </button>

            <button
              type="button"
              className="dash-action-card"
              onClick={() => navigate("/numbers")}
            >
              <div className="dash-action-icon dash-action-numbers">
                <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                  <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 2 5a2 2 0 0 1 2-2" />
                  <line x1="15" y1="2" x2="15" y2="8" />
                  <line x1="12" y1="5" x2="18" y2="5" />
                </svg>
              </div>
              <div className="dash-action-label">Manage Numbers</div>
              <div className="dash-action-desc">Add, port, and configure phone numbers</div>
            </button>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
