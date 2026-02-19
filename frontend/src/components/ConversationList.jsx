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

export function ConversationList({ conversations = [], selectedConversationId, onSelectConversation }) {
  if (conversations.length === 0) {
    return (
      <div className="conv-list">
        <div className="conv-list-empty">No conversations yet</div>
      </div>
    );
  }

  return (
    <div className="conv-list">
      {conversations.map((conv) => (
        <button
          key={conv.id}
          type="button"
          className={
            "conv-list-item" +
            (conv.id === selectedConversationId ? " conv-list-item-active" : "")
          }
          onClick={() => onSelectConversation(conv.id)}
        >
          <div className="conv-list-item-main">
            <div className="conv-list-item-title">
              <span className="conv-avatar" />
              <span className="conv-phone">
                {conv.patientName || formatPhone(conv.patientPhone) || "Unknown"}
              </span>
            </div>
            <span className="conv-date">{formatDate(conv.lastMessageAt || conv.createdAt)}</span>
          </div>
          <div className="conv-list-item-sub">
            <span className="conv-preview">
              {(conv.lastMessage || "").slice(0, 40)}
              {(conv.lastMessage || "").length > 40 ? "…" : ""}
            </span>
            <span className="conv-inbox">{formatPhone(conv.patientPhone)}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
