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
  const isContacts = location.pathname === "/contacts";
  const isInbox = location.pathname === "/inbox";

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo-mark" />
        <span className="sidebar-logo-text">health-sms</span>
      </div>

      <nav className="sidebar-nav">
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
                  onClick={() => onSelectInbox(inbox.id)}
                >
                  <span className="sidebar-inbox-label">{formatPhone(inbox.number)}</span>
                  {(inbox.unreadCount ?? 0) > 0 && (
                    <span className="sidebar-badge sidebar-badge-pop">{inbox.unreadCount}</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        <div className="sidebar-section">
          <button
            className={"sidebar-item" + (isContacts ? " sidebar-item-active" : "")}
            type="button"
            onClick={() => navigate("/contacts")}
          >
            <span className="sidebar-item-left">
              <span className="sidebar-icon-circle" />
              <span>Contacts</span>
            </span>
          </button>
        </div>

        <div className="sidebar-section">
          <button className="sidebar-add-inbox" type="button">
            + Add New Inbox
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
