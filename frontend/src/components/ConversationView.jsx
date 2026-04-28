import { useState, useEffect, useCallback, useRef } from "react";
import "./ConversationView.css";
import { EmptyState } from "./EmptyState";
import { TemplatePicker } from "./TemplatePicker";
import {
  createInternalNote,
  getInternalNotes,
  getMessages,
  getOrgUsers,
  sendMessage,
  updateConversation,
} from "../utils/api";

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

export function ConversationView({
  token,
  conversationId,
  conversation,
  onStartNew,
  onManageTemplates,
  onStatusChange,
  onConversationUpdate,
}) {
  const [messages, setMessages] = useState([]);
  const [internalNotes, setInternalNotes] = useState([]);
  const [teamUsers, setTeamUsers] = useState([]);
  const [pendingOutgoing, setPendingOutgoing] = useState([]);
  const [loading, setLoading] = useState(false);
  const [notesLoading, setNotesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState(null);
  const [notesError, setNotesError] = useState(null);
  const [input, setInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [activeTab, setActiveTab] = useState("messages"); // messages | notes | details
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

  const assignedToUserId = conversation?.assignedToUserId || "";

  const dedupeMessages = useCallback((list) => {
    const seen = new Set();
    const next = [];
    for (const msg of list) {
      if (!msg?.id || seen.has(msg.id)) continue;
      seen.add(msg.id);
      next.push(msg);
    }
    return next;
  }, []);

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
      setMessages(dedupeMessages(msgs));
      msgCountRef.current = msgs.length;
      requestAnimationFrame(scrollToBottom);
    } catch (err) {
      setError(err.message || "Failed to load messages");
    } finally {
      setLoading(false);
    }
  }, [token, conversationId, scrollToBottom, dedupeMessages]);

  useEffect(() => {
    setPendingOutgoing([]);
    loadMessages();
  }, [loadMessages]);

  const loadInternalNotes = useCallback(async () => {
    if (!token || !conversationId) return;
    setNotesLoading(true);
    setNotesError(null);
    try {
      const notes = await getInternalNotes(token, conversationId);
      setInternalNotes(notes);
    } catch (err) {
      setNotesError(err.message || "Failed to load internal notes");
    } finally {
      setNotesLoading(false);
    }
  }, [token, conversationId]);

  useEffect(() => {
    setInternalNotes([]);
    setNoteInput("");
    setActiveTab("messages");
    loadInternalNotes();
  }, [loadInternalNotes]);

  useEffect(() => {
    if (!token) return;
    getOrgUsers(token)
      .then((data) => setTeamUsers(data.users || []))
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token || !conversationId) return;
    pollRef.current = setInterval(() => {
      if (document.hidden) return;
      getMessages(token, conversationId)
        .then((msgs) => {
          if (msgs.length !== msgCountRef.current) {
            setMessages(dedupeMessages(msgs));
            msgCountRef.current = msgs.length;
            requestAnimationFrame(scrollToBottom);
          }
        })
        .catch(() => {});
    }, MSG_POLL_INTERVAL);
    return () => clearInterval(pollRef.current);
  }, [token, conversationId, scrollToBottom, dedupeMessages]);

  const sendOutgoing = async (body, tempId = `tmp-${Date.now()}`) => {
    if (!body || !token || !conversationId || sending) return;
    setSending(true);
    setError(null);
    setPendingOutgoing((prev) => [
      ...prev.filter((m) => m.id !== tempId),
      {
        id: tempId,
        direction: "outbound",
        body,
        createdAt: new Date().toISOString(),
        status: "sending",
        pending: true,
      },
    ]);

    try {
      const newMsg = await sendMessage(token, conversationId, body);
      setPendingOutgoing((prev) => prev.filter((m) => m.id !== tempId));
      setMessages((prev) => [
        ...dedupeMessages(prev),
        {
          id: newMsg.id,
          direction: "outbound",
          body,
          status: newMsg.status || "sent",
          createdAt: newMsg.createdAt,
        },
      ]);
      msgCountRef.current += 1;
      requestAnimationFrame(scrollToBottom);
    } catch (err) {
      setPendingOutgoing((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? {
                ...m,
                status: "failed",
                error: err.message || "Failed to send",
              }
            : m
        )
      );
    } finally {
      setSending(false);
    }
  };

  const handleSend = async () => {
    const body = input.trim();
    if (!body) return;
    setInput("");
    await sendOutgoing(body);
  };

  const handleRetryMessage = async (msg) => {
    if (!msg || msg.status !== "failed") return;
    await sendOutgoing(msg.body, msg.id);
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

  const handleAssign = async (nextAssigneeId) => {
    if (!conversationId || assigning) return;
    setAssigning(true);
    setNotesError(null);
    try {
      const updated = await updateConversation(token, conversationId, {
        assignedToUserId: nextAssigneeId || null,
      });
      if (onConversationUpdate) onConversationUpdate(conversationId, updated);
    } catch (err) {
      setNotesError(err.message || "Failed to assign conversation");
    } finally {
      setAssigning(false);
    }
  };

  const handleCreateNote = async () => {
    const body = noteInput.trim();
    if (!body || savingNote) return;
    setSavingNote(true);
    setNotesError(null);
    try {
      const note = await createInternalNote(token, conversationId, body);
      setInternalNotes((prev) => [...prev, note]);
      setNoteInput("");
    } catch (err) {
      setNotesError(err.message || "Failed to create internal note");
    } finally {
      setSavingNote(false);
    }
  };

  const isClosed = conversation?.status === "closed";
  const displayMessages = dedupeMessages([...messages, ...pendingOutgoing]);
  const mentionCount = internalNotes.filter((note) => note.mentionsMe).length;

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

  function formatNoteAuthor(note) {
    return (
      note.createdBy?.displayName ||
      note.createdBy?.handle ||
      note.createdBy?.email?.split("@")[0] ||
      "Team member"
    );
  }

  function formatTeamUser(user) {
    return user.display_name || user.handle || user.email || user.id;
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

      <div className="conv-tabs">
        <button
          type="button"
          className={"conv-tab" + (activeTab === "messages" ? " conv-tab-active" : "")}
          onClick={() => setActiveTab("messages")}
        >
          Patient Messages
        </button>
        <button
          type="button"
          className={"conv-tab" + (activeTab === "notes" ? " conv-tab-active" : "")}
          onClick={() => setActiveTab("notes")}
        >
          Team Notes {mentionCount > 0 && <span className="conv-tab-badge">{mentionCount}</span>}
        </button>
        <button
          type="button"
          className={"conv-tab" + (activeTab === "details" ? " conv-tab-active" : "")}
          onClick={() => setActiveTab("details")}
        >
          Details
        </button>
      </div>

      {activeTab === "messages" && (
        <>
          <div className="conv-view-body" ref={bodyRef}>
            {loading ? (
              <div className="conv-view-loading">Loading messages…</div>
            ) : error ? (
              <div className="conv-view-error">{error}</div>
            ) : displayMessages.length === 0 ? (
              <div className="conv-view-empty">No messages yet. Say hello!</div>
            ) : (
              displayMessages.map((msg) => {
                const isMatch = matchedIds.includes(msg.id);
                const isCurrent = matchedIds[matchIdx] === msg.id;
                return (
                  <div
                    key={msg.id}
                    data-msg-id={msg.id}
                    className={
                      "conv-view-message " +
                      (msg.direction === "outbound" ? "conv-view-message-outbound" : "conv-view-message-inbound") +
                      (msg.status === "failed" ? " conv-view-message-failed" : "") +
                      (msg.status === "sending" ? " conv-view-message-sending" : "") +
                      (isCurrent ? " conv-view-message-current" : isMatch ? " conv-view-message-match" : "")
                    }
                  >
                    <div className="conv-view-bubble">{msgSearch ? renderBody(msg.body, msgSearch) : msg.body}</div>
                    <div className="conv-view-meta-row">
                      <div className="conv-view-meta">{formatMessageDate(msg.createdAt)}</div>
                      {msg.direction === "outbound" && msg.status === "sending" && (
                        <span className="conv-view-msg-status conv-view-msg-status-sending">Sending...</span>
                      )}
                      {msg.direction === "outbound" && msg.status === "failed" && (
                        <>
                          <span className="conv-view-msg-status conv-view-msg-status-failed">
                            Not sent
                          </span>
                          <button
                            type="button"
                            className="conv-view-retry-btn"
                            onClick={() => handleRetryMessage(msg)}
                            disabled={sending}
                          >
                            Retry
                          </button>
                        </>
                      )}
                    </div>
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
        </>
      )}

      {activeTab === "notes" && (
        <div className="conv-tab-panel">
          <div className="conv-tab-panel-header">
            <h3 className="conv-panel-heading">Internal Notes</h3>
            <div className="conv-panel-hint">Clinic-only. Notes are encrypted and never sent to the patient.</div>
          </div>

          <div className="conv-notes-list conv-notes-list-tab">
            {notesLoading ? (
              <div className="conv-notes-empty">Loading notes...</div>
            ) : notesError ? (
              <div className="conv-notes-error">{notesError}</div>
            ) : internalNotes.length === 0 ? (
              <div className="conv-notes-empty">No internal notes yet.</div>
            ) : (
              internalNotes.map((note) => (
                <div key={note.id} className={"conv-note-card" + (note.mentionsMe ? " conv-note-mentioned" : "")}>
                  <div className="conv-note-meta">
                    <span className="conv-note-author">{formatNoteAuthor(note)}</span>
                    <span>{formatMessageDate(note.createdAt)}</span>
                    {note.mentionsMe && <span className="conv-note-mention-pill">Mentioned you</span>}
                  </div>
                  <div className="conv-note-body">{note.body}</div>
                </div>
              ))
            )}
          </div>

          <div className="conv-note-composer conv-note-composer-tab">
            <textarea
              className="conv-note-input"
              rows={3}
              placeholder="Add clinic-only note. Mention teammates with @handle."
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleCreateNote();
                }
              }}
            />
            <button
              type="button"
              className="conv-note-send"
              onClick={handleCreateNote}
              disabled={savingNote || !noteInput.trim()}
            >
              {savingNote ? "Saving..." : "Add Note"}
            </button>
          </div>
        </div>
      )}

      {activeTab === "details" && (
        <div className="conv-tab-panel">
          <div className="conv-details-grid">
            <div className="conv-panel-section">
              <div className="conv-panel-heading-row">
                <h3 className="conv-panel-heading">Assignment</h3>
                {assigning && <span className="conv-panel-saving">Saving...</span>}
              </div>
              <select
                className="conv-assignee-select"
                value={assignedToUserId}
                onChange={(e) => handleAssign(e.target.value)}
                disabled={assigning}
              >
                <option value="">Unassigned</option>
                {teamUsers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {formatTeamUser(member)} ({member.role})
                  </option>
                ))}
              </select>
              <p className="conv-panel-hint">
                Assign ownership so one teammate is accountable for follow-up.
              </p>
            </div>

            <div className="conv-panel-section">
              <div className="conv-panel-heading-row">
                <h3 className="conv-panel-heading">Conversation</h3>
              </div>
              <div className="conv-details-row">
                <span className="conv-details-label">Status</span>
                <span className="conv-details-value">{conversation?.status || "open"}</span>
              </div>
              <div className="conv-details-row">
                <span className="conv-details-label">Patient</span>
                <span className="conv-details-value">
                  {hasName(conversation) ? conversation.patientName : formatPhone(conversation.patientPhone) || "Unknown"}
                </span>
              </div>
              {hasName(conversation) && (
                <div className="conv-details-row">
                  <span className="conv-details-label">Phone</span>
                  <span className="conv-details-value">{formatPhone(conversation.patientPhone)}</span>
                </div>
              )}
              <div className="conv-details-row">
                <span className="conv-details-label">Inbox</span>
                <span className="conv-details-value">{formatPhone(conversation.inboxNumber)}</span>
              </div>
              <div className="conv-details-actions">
                <button
                  type="button"
                  className="conv-details-btn"
                  onClick={handleToggleStatus}
                  disabled={statusUpdating}
                >
                  {statusUpdating ? "Updating..." : (isClosed ? "Reopen Conversation" : "Close Conversation")}
                </button>
              </div>
              {notesError && <div className="conv-notes-error" style={{ marginTop: 10 }}>{notesError}</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
