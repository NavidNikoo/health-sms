import { useState } from "react";
import "./ConversationList.css";

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const diff = today - d;
  if (diff < 24 * 60 * 60 * 1000 && d.getDate() === today.getDate())
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diff < 7 * 24 * 60 * 60 * 1000) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatPhone(e164) {
  if (!e164) return "";
  const d = e164.replace(/\D/g, "");
  if (d.length === 11 && d[0] === "1") return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return e164;
}

function hasName(conv) {
  if (!conv.patientName) return false;
  const nameDigits = conv.patientName.replace(/\D/g, "");
  return nameDigits.length < 10;
}

const FILTERS = [
  { key: "open", label: "Open" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
];

export function ConversationList({ conversations = [], selectedConversationId, onSelectConversation, unreadIds = new Set() }) {
  const [statusFilter, setStatusFilter] = useState("open");

  const openCount = conversations.filter((c) => (c.status || "open") === "open").length;
  const closedCount = conversations.filter((c) => c.status === "closed").length;
  const counts = { open: openCount, closed: closedCount, all: conversations.length };

  const filtered = statusFilter === "all"
    ? conversations
    : conversations.filter((c) => (c.status || "open") === statusFilter);

  return (
    <div className="conv-list">
      <div className="conv-list-filters">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={"conv-filter-tab" + (statusFilter === f.key ? " conv-filter-tab-active" : "")}
            onClick={() => setStatusFilter(f.key)}
          >
            {f.label}
            {counts[f.key] > 0 && <span className="conv-filter-count">{counts[f.key]}</span>}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="conv-list-empty">
          {statusFilter === "closed" ? "No closed conversations" : statusFilter === "open" ? "No open conversations" : "No conversations yet"}
        </div>
      ) : (
        filtered.map((conv) => {
          const isUnread = unreadIds.has(conv.id);
          const isClosed = conv.status === "closed";
          return (
            <button
              key={conv.id}
              type="button"
              className={
                "conv-list-item" +
                (conv.id === selectedConversationId ? " conv-list-item-active" : "") +
                (isUnread ? " conv-list-item-unread" : "") +
                (isClosed ? " conv-list-item-closed" : "")
              }
              onClick={() => onSelectConversation(conv.id)}
            >
              <div className="conv-list-item-main">
                <div className="conv-list-item-title">
                  <span className={"conv-avatar" + (isUnread ? " conv-avatar-unread" : "") + (isClosed ? " conv-avatar-closed" : "")} />
                  <span className={"conv-phone" + (isUnread ? " conv-phone-unread" : "")}>
                    {hasName(conv) ? conv.patientName : formatPhone(conv.patientPhone) || "Unknown"}
                  </span>
                  {isClosed && <span className="conv-list-closed-tag">Closed</span>}
                </div>
                <span className={"conv-date" + (isUnread ? " conv-date-unread" : "")}>
                  {formatDate(conv.lastMessageAt || conv.createdAt)}
                </span>
              </div>
              <div className="conv-list-item-sub">
                <span className={"conv-preview" + (isUnread ? " conv-preview-unread" : "")}>
                  {(conv.lastMessage || "").slice(0, 40)}
                  {(conv.lastMessage || "").length > 40 ? "…" : ""}
                </span>
                {hasName(conv) && (
                  <span className="conv-inbox">{formatPhone(conv.patientPhone)}</span>
                )}
                {isUnread && <span className="conv-unread-dot" />}
              </div>
            </button>
          );
        })
      )}
    </div>
  );
}
