import { useState, useEffect, useCallback, useRef } from "react";
import "./ConversationView.css";
import { EmptyState } from "./EmptyState";
import { TemplatePicker } from "./TemplatePicker";
import { getMessages, sendMessage, updateConversation } from "../utils/api";

const MSG_POLL_INTERVAL = 3000;

function formatPhone(e164) {
  if (!e164) return "";
  const d = e164.replace(/\D/g, "");
  if (d.length === 11 && d[0] === "1") return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return e164;
}

function hasName(conv) {
  if (!conv?.patientName) return false;
  const nameDigits = conv.patientName.replace(/\D/g, "");
  return nameDigits.length < 10;
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

export function ConversationView({ token, conversationId, conversation, onStartNew, onManageTemplates, onStatusChange }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [input, setInput] = useState("");
  const [msgSearch, setMsgSearch] = useState("");
  const [msgSearchOpen, setMsgSearchOpen] = useState(false);
  const [matchIdx, setMatchIdx] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const msgSearchRef = useRef(null);
  const bodyRef = useRef(null);
  const pollRef = useRef(null);
  const msgCountRef = useRef(0);
  const menuRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const loadMessages = useCallback(async () => {
    if (!token || !conversationId) return;
    setLoading(true);
    setError(null);
    try {
      const msgs = await getMessages(token, conversationId);
      setMessages(msgs);
      msgCountRef.current = msgs.length;
      requestAnimationFrame(scrollToBottom);
    } catch (err) {
      setError(err.message || "Failed to load messages");
    } finally {
      setLoading(false);
    }
  }, [token, conversationId, scrollToBottom]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (!token || !conversationId) return;
    pollRef.current = setInterval(() => {
      if (document.hidden) return;
      getMessages(token, conversationId)
        .then((msgs) => {
          if (msgs.length !== msgCountRef.current) {
            setMessages(msgs);
            msgCountRef.current = msgs.length;
            requestAnimationFrame(scrollToBottom);
          }
        })
        .catch(() => {});
    }, MSG_POLL_INTERVAL);
    return () => clearInterval(pollRef.current);
  }, [token, conversationId, scrollToBottom]);

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
      msgCountRef.current += 1;
      requestAnimationFrame(scrollToBottom);
    } catch (err) {
      setError(err.message || "Failed to send");
      setInput(body);
    } finally {
      setSending(false);
    }
  };

  const matchedIds = msgSearch.trim()
    ? messages.filter((m) => m.body?.toLowerCase().includes(msgSearch.toLowerCase())).map((m) => m.id)
    : [];

  const scrollToMessage = useCallback((msgId) => {
    const el = bodyRef.current?.querySelector(`[data-msg-id="${msgId}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const handleMsgSearchNav = (dir) => {
    if (matchedIds.length === 0) return;
    const next = (matchIdx + dir + matchedIds.length) % matchedIds.length;
    setMatchIdx(next);
    scrollToMessage(matchedIds[next]);
  };

  const openMsgSearch = () => {
    setMsgSearchOpen(true);
    setMsgSearch("");
    setMatchIdx(0);
    setTimeout(() => msgSearchRef.current?.focus(), 50);
  };
  const closeMsgSearch = () => {
    setMsgSearchOpen(false);
    setMsgSearch("");
    setMatchIdx(0);
  };

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    const handleKey = (e) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen]);

  const handleToggleStatus = async () => {
    if (!conversation || statusUpdating) return;
    const newStatus = conversation.status === "closed" ? "open" : "closed";
    setStatusUpdating(true);
    try {
      await updateConversation(token, conversationId, { status: newStatus });
      if (onStatusChange) onStatusChange(conversationId, newStatus);
    } catch { /* ignore */ }
    finally { setStatusUpdating(false); setMenuOpen(false); }
  };

  const isClosed = conversation?.status === "closed";

  useEffect(() => {
    if (matchedIds.length > 0) scrollToMessage(matchedIds[matchIdx]);
  }, [msgSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!conversationId) {
    return <EmptyState onStartNew={onStartNew} />;
  }

  if (!conversation) {
    return <EmptyState onStartNew={onStartNew} />;
  }

  function renderBody(text, query) {
    if (!query || !text) return text;
    const lower = text.toLowerCase();
    const qLower = query.toLowerCase();
    const parts = [];
    let last = 0;
    let idx = lower.indexOf(qLower);
    while (idx !== -1) {
      if (idx > last) parts.push(text.slice(last, idx));
      parts.push(<mark key={idx} className="msg-search-highlight">{text.slice(idx, idx + query.length)}</mark>);
      last = idx + query.length;
      idx = lower.indexOf(qLower, last);
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts.length ? parts : text;
  }

  return (
    <div className="conv-view">
      <header className="conv-view-header">
        <div className="conv-view-header-main">
          <div className="conv-avatar-large" />
          <div className="conv-view-header-text">
            <div className="conv-view-phone">
              {hasName(conversation) ? conversation.patientName : formatPhone(conversation.patientPhone) || "Unknown"}
            </div>
            {hasName(conversation) && (
              <div className="conv-view-sub">{formatPhone(conversation.patientPhone)}</div>
            )}
          </div>
        </div>
        <div className="conv-view-header-actions">
          {msgSearchOpen ? (
            <div className="msg-search-bar">
              <input
                ref={msgSearchRef}
                className="msg-search-input"
                placeholder="Search messages..."
                value={msgSearch}
                onChange={(e) => { setMsgSearch(e.target.value); setMatchIdx(0); }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") closeMsgSearch();
                  if (e.key === "Enter") handleMsgSearchNav(e.shiftKey ? -1 : 1);
                }}
              />
              {msgSearch && matchedIds.length > 0 && (
                <span className="msg-search-count">{matchIdx + 1}/{matchedIds.length}</span>
              )}
              {msgSearch && matchedIds.length === 0 && (
                <span className="msg-search-count msg-search-count-zero">0</span>
              )}
              <button type="button" className="msg-search-nav" onClick={() => handleMsgSearchNav(-1)} disabled={matchedIds.length === 0}>&#8593;</button>
              <button type="button" className="msg-search-nav" onClick={() => handleMsgSearchNav(1)} disabled={matchedIds.length === 0}>&#8595;</button>
              <button type="button" className="msg-search-close" onClick={closeMsgSearch}>&times;</button>
            </div>
          ) : (
            <>
              {isClosed && <span className="conv-status-badge conv-status-closed">Closed</span>}
              <button type="button" className="conv-view-icon-button" onClick={openMsgSearch} title="Search messages">
                🔍
              </button>
              <div className="conv-menu-wrap" ref={menuRef}>
                <button type="button" className="conv-view-icon-button" onClick={() => setMenuOpen((v) => !v)} title="More options">
                  ⋯
                </button>
                {menuOpen && (
                  <div className="conv-action-menu">
                    <button
                      type="button"
                      className={"conv-action-menu-item" + (isClosed ? " conv-action-reopen" : " conv-action-close")}
                      onClick={handleToggleStatus}
                      disabled={statusUpdating}
                    >
                      {isClosed ? (
                        <>
                          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 12l5 5L21 4" /></svg>
                          {statusUpdating ? "Reopening..." : "Reopen Conversation"}
                        </>
                      ) : (
                        <>
                          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" /></svg>
                          {statusUpdating ? "Closing..." : "Close Conversation"}
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </header>

      <div className="conv-view-body" ref={bodyRef}>
        {loading ? (
          <div className="conv-view-loading">Loading messages…</div>
        ) : error ? (
          <div className="conv-view-error">{error}</div>
        ) : messages.length === 0 ? (
          <div className="conv-view-empty">No messages yet. Say hello!</div>
        ) : (
          messages.map((msg) => {
            const isMatch = matchedIds.includes(msg.id);
            const isCurrent = matchedIds[matchIdx] === msg.id;
            return (
              <div
                key={msg.id}
                data-msg-id={msg.id}
                className={
                  "conv-view-message " +
                  (msg.direction === "outbound" ? "conv-view-message-outbound" : "conv-view-message-inbound") +
                  (isCurrent ? " conv-view-message-current" : isMatch ? " conv-view-message-match" : "")
                }
              >
                <div className="conv-view-bubble">{msgSearch ? renderBody(msg.body, msgSearch) : msg.body}</div>
                <div className="conv-view-meta">{formatMessageDate(msg.createdAt)}</div>
              </div>
            );
          })
        )}
      </div>

      {isClosed ? (
        <footer className="conv-view-footer conv-view-footer-closed">
          <div className="conv-closed-banner">
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            <span>This conversation is closed.</span>
            <button type="button" className="conv-closed-reopen" onClick={handleToggleStatus} disabled={statusUpdating}>
              {statusUpdating ? "Reopening..." : "Reopen"}
            </button>
          </div>
        </footer>
      ) : (
        <footer className="conv-view-footer">
          <TemplatePicker
            token={token}
            conversation={conversation}
            onInsert={(text) => setInput(text)}
            onManage={() => { if (onManageTemplates) onManageTemplates(); }}
          />
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
      )}
    </div>
  );
}
