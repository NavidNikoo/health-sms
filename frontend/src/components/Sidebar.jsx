import { useNavigate, useLocation } from "react-router-dom";
import "./Sidebar.css";
import { useAuth } from "../context/AuthContext";

function formatPhone(e164) {
  if (!e164) return "";
  const d = e164.replace(/\D/g, "");
  if (d.length === 11 && d[0] === "1") return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return e164;
}

export function Sidebar({ inboxes = [], selectedInboxId, onSelectInbox, totalUnread = 0 }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname;

  const isDashboard = path === "/dashboard";
  const isInbox = path === "/inbox";
  const isDialer = path === "/dialer";
  const isContacts = path === "/contacts";
  const isNumbers = path === "/numbers";

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo-mark" />
        <span className="sidebar-logo-text">health-sms</span>
      </div>

      <nav className="sidebar-nav">
        {/* Dashboard */}
        <div className="sidebar-section">
          <button
            type="button"
            className={"sidebar-item" + (isDashboard ? " sidebar-item-active" : "")}
            onClick={() => navigate("/dashboard")}
          >
            <span className="sidebar-item-left">
              <span className="sidebar-nav-icon">
                <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
              </span>
              <span>Dashboard</span>
            </span>
          </button>
        </div>

        {/* All Inboxes */}
        <div className="sidebar-section">
          <button
            type="button"
            className={"sidebar-item" + (isInbox && !selectedInboxId ? " sidebar-item-active" : "")}
            onClick={() => { if (!isInbox) navigate("/inbox"); onSelectInbox(null); }}
          >
            <span className="sidebar-item-left">
              <span className="sidebar-item-dot" />
              <span>All Inboxes</span>
            </span>
            {totalUnread > 0 && (
              <span className="sidebar-badge sidebar-badge-pop">{totalUnread}</span>
            )}
          </button>
        </div>

        {/* Per-inbox list */}
        <div className="sidebar-section sidebar-section-spaced">
          <div className="sidebar-section-label">Inboxes</div>
          <div className="sidebar-inbox-list">
            {inboxes.length === 0 ? (
              <span className="sidebar-empty">No numbers yet</span>
            ) : (
              inboxes.map((inbox) => (
                <button
                  key={inbox.id}
                  type="button"
                  className={
                    "sidebar-item sidebar-inbox-item" +
                    (inbox.id === selectedInboxId ? " sidebar-inbox-item-active" : "") +
                    ((inbox.unreadCount ?? 0) > 0 ? " sidebar-inbox-item-unread" : "")
                  }
                  onClick={() => { if (!isInbox) navigate("/inbox"); onSelectInbox(inbox.id); }}
                >
                  <span className="sidebar-inbox-label">
                    {inbox.label || formatPhone(inbox.number)}
                  </span>
                  {(inbox.unreadCount ?? 0) > 0 && (
                    <span className="sidebar-badge sidebar-badge-pop">{inbox.unreadCount}</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Dialer */}
        <div className="sidebar-section">
          <button
            type="button"
            className={"sidebar-item" + (isDialer ? " sidebar-item-active" : "")}
            onClick={() => navigate("/dialer")}
          >
            <span className="sidebar-item-left">
              <span className="sidebar-nav-icon">
                <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.37 2 2 0 0 1 3.6 1.2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.9a16 16 0 0 0 6.1 6.1l.91-.91a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              </span>
              <span>Dialer</span>
            </span>
          </button>
        </div>

        {/* Contacts */}
        <div className="sidebar-section">
          <button
            className={"sidebar-item" + (isContacts ? " sidebar-item-active" : "")}
            type="button"
            onClick={() => navigate("/contacts")}
          >
            <span className="sidebar-item-left">
              <span className="sidebar-nav-icon">
                <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </span>
              <span>Contacts</span>
            </span>
          </button>
        </div>

        {/* Numbers / Manage Numbers */}
        <div className="sidebar-section">
          <button
            type="button"
            className={"sidebar-item" + (isNumbers ? " sidebar-item-active" : "")}
            onClick={() => navigate("/numbers")}
          >
            <span className="sidebar-item-left">
              <span className="sidebar-nav-icon">
                <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 2 5a2 2 0 0 1 2-2" />
                  <line x1="15" y1="2" x2="15" y2="8" />
                  <line x1="12" y1="5" x2="18" y2="5" />
                </svg>
              </span>
              <span>Numbers</span>
            </span>
          </button>
        </div>
      </nav>

      <div className="sidebar-user">
        <div className="sidebar-user-avatar">
          {(user?.email?.slice(0, 2) || "?").toUpperCase()}
        </div>
        <div className="sidebar-user-info">
          <div className="sidebar-user-org">Health SMS</div>
          <div className="sidebar-user-email">{user?.email || ""}</div>
        </div>
      </div>
    </aside>
  );
}
