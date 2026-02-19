import { useState, useEffect, useCallback } from "react";
import "./ConversationView.css";
import { EmptyState } from "./EmptyState";
import { getMessages, sendMessage } from "../utils/api";

function formatPhone(e164) {
  if (!e164) return "";
  const d = e164.replace(/\D/g, "");
  if (d.length === 11 && d[0] === "1") return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return e164;
}

function formatMessageDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ConversationView({ token, conversationId, conversation }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [input, setInput] = useState("");

  const loadMessages = useCallback(async () => {
    if (!token || !conversationId) return;
    setLoading(true);
    setError(null);
    try {
      const msgs = await getMessages(token, conversationId);
      setMessages(msgs);
    } catch (err) {
      setError(err.message || "Failed to load messages");
    } finally {
      setLoading(false);
    }
  }, [token, conversationId]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const handleSend = async () => {
    const body = input.trim();
    if (!body || !token || !conversationId || sending) return;
    setSending(true);
    setError(null);
    setInput("");
    try {
      const newMsg = await sendMessage(token, conversationId, body);
      setMessages((prev) => [
        ...prev,
        {
          id: newMsg.id,
          direction: "outbound",
          body: body,
          createdAt: newMsg.createdAt,
        },
      ]);
    } catch (err) {
      setError(err.message || "Failed to send");
      setInput(body);
    } finally {
      setSending(false);
    }
  };

  if (!conversationId) {
    return <EmptyState />;
  }

  if (!conversation) {
    return <EmptyState />;
  }

  return (
    <div className="conv-view">
      <header className="conv-view-header">
        <div className="conv-view-header-main">
          <div className="conv-avatar-large" />
          <div className="conv-view-header-text">
            <div className="conv-view-phone">
              {conversation.patientName || formatPhone(conversation.patientPhone) || "Unknown"}
            </div>
            <div className="conv-view-sub">{formatPhone(conversation.patientPhone)}</div>
          </div>
        </div>
        <div className="conv-view-header-actions">
          <button type="button" className="conv-view-icon-button">
            🔍
          </button>
          <button type="button" className="conv-view-icon-button">
            ⋯
          </button>
        </div>
      </header>

      <div className="conv-view-body">
        {loading ? (
          <div className="conv-view-loading">Loading messages…</div>
        ) : error ? (
          <div className="conv-view-error">{error}</div>
        ) : messages.length === 0 ? (
          <div className="conv-view-empty">No messages yet. Say hello!</div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={
                "conv-view-message " +
                (msg.direction === "outbound" ? "conv-view-message-outbound" : "conv-view-message-inbound")
              }
            >
              <div className="conv-view-bubble">{msg.body}</div>
              <div className="conv-view-meta">{formatMessageDate(msg.createdAt)}</div>
            </div>
          ))
        )}
      </div>

      <footer className="conv-view-footer">
        <textarea
          className="conv-view-input"
          rows={2}
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <button
          type="button"
          className="conv-view-send"
          disabled={sending || !input.trim()}
          onClick={handleSend}
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </footer>
    </div>
  );
}
