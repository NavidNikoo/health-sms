import "./Sidebar.css";
import { useAuth } from "../context/AuthContext";

function formatPhone(e164) {
  if (!e164) return "";
  const d = e164.replace(/\D/g, "");
  if (d.length === 11 && d[0] === "1") return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return e164;
}

export function Sidebar({ inboxes = [], selectedInboxId, onSelectInbox }) {
  const { user } = useAuth();
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
            className={"sidebar-item" + (!selectedInboxId ? " sidebar-item-active" : "")}
            onClick={() => onSelectInbox(null)}
          >
            <span className="sidebar-item-dot" />
            <span>All Inboxes</span>
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
                    (inbox.id === selectedInboxId ? " sidebar-inbox-item-active" : "")
                  }
                  onClick={() => onSelectInbox(inbox.id)}
                >
                  <span>{formatPhone(inbox.number)}</span>
                  {(inbox.unreadCount ?? 0) > 0 && (
                    <span className="sidebar-badge">{inbox.unreadCount}</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        <div className="sidebar-section">
          <button className="sidebar-item" type="button">
            <span className="sidebar-icon-circle" />
            <span>Contacts</span>
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
