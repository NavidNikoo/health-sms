import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { Sidebar } from "../components/Sidebar";
import {
  getDMProfile, updateDMProfile,
  sendDMRequest, getIncomingRequests, getOutgoingRequests,
  acceptDMRequest, declineDMRequest, blockDMRequest, cancelDMRequest,
  getDMThreads, getDMMessages, sendDMMessage, markDMThreadRead,
  getDMBlocks, removeDMBlock,
  getPhoneNumbers, getOrgUsers,
  createOrgInvite, getOrgInvites, revokeOrgInvite,
  getMyInvites, acceptMyInvite, declineMyInvite,
  removeOrgUser,
} from "../utils/api";
import "./DirectMessagesPage.css";

export function DirectMessagesPage() {
  const { token, user, setSession } = useAuth();
  const [tab, setTab] = useState("threads"); // threads | requests | team | settings
  const [profile, setProfile] = useState(null);
  const [threads, setThreads] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [selectedThread, setSelectedThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [msgInput, setMsgInput] = useState("");
  const [newRequestInput, setNewRequestInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [threadSearch, setThreadSearch] = useState("");
  const [profileForm, setProfileForm] = useState({ handle: "", displayName: "", allowDMs: "requests" });
  const [profileSaving, setProfileSaving] = useState(false);
  const [inboxes, setInboxes] = useState([]);
  const [orgUsers, setOrgUsers] = useState([]);
  const [teamSearch, setTeamSearch] = useState("");
  const [copied, setCopied] = useState("");
  const [invites, setInvites] = useState([]);
  const [inviteForm, setInviteForm] = useState({ email: "", role: "staff" });
  const [inviteCreating, setInviteCreating] = useState(false);
  const [lastInviteLink, setLastInviteLink] = useState("");
  const [myInvites, setMyInvites] = useState([]);
  const messagesEndRef = useRef(null);
  const isAdmin = user?.role === "admin";

  const loadProfile = useCallback(async () => {
    try {
      const data = await getDMProfile(token);
      if (data.profile) {
        setProfile(data.profile);
        setProfileForm({
          handle: data.profile.handle || "",
          displayName: data.profile.display_name || "",
          allowDMs: data.profile.allow_dms || "requests",
        });
      }
    } catch { /* ignore */ }
  }, [token]);

  const loadThreads = useCallback(async () => {
    try {
      const data = await getDMThreads(token);
      setThreads(data.threads || []);
    } catch { /* ignore */ } finally {
      setThreadsLoading(false);
    }
  }, [token]);

  const loadRequests = useCallback(async () => {
    try {
      const [inc, out] = await Promise.all([getIncomingRequests(token), getOutgoingRequests(token)]);
      setIncoming(inc.requests || []);
      setOutgoing(out.requests || []);
    } catch { /* ignore */ }
  }, [token]);

  const loadBlocks = useCallback(async () => {
    try {
      const data = await getDMBlocks(token);
      setBlocks(data.blocks || []);
    } catch { /* ignore */ }
  }, [token]);

  const loadOrgUsers = useCallback(async () => {
    try {
      const data = await getOrgUsers(token);
      setOrgUsers(data.users || []);
    } catch { /* ignore */ }
  }, [token]);

  const loadInvites = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const data = await getOrgInvites(token);
      setInvites(data.invites || []);
    } catch { /* ignore */ }
  }, [token, isAdmin]);

  const loadMyInvites = useCallback(async () => {
    try {
      const data = await getMyInvites(token);
      setMyInvites(data.invites || []);
    } catch { /* ignore */ }
  }, [token]);

  useEffect(() => {
    loadProfile();
    loadThreads();
    loadRequests();
    loadBlocks();
    loadOrgUsers();
    loadInvites();
    loadMyInvites();
    getPhoneNumbers(token).then((d) => {
      setInboxes((d.phoneNumbers || []).map((p) => ({ id: p.id, number: p.e164_number, label: p.label })));
    }).catch(() => {});
  }, [token, loadProfile, loadThreads, loadRequests, loadBlocks, loadOrgUsers, loadInvites, loadMyInvites]);

  useEffect(() => {
    if (!selectedThread) return;
    let cancelled = false;
    setMessagesLoading(true);
    (async () => {
      try {
        const data = await getDMMessages(token, selectedThread.id);
        if (!cancelled) setMessages(data.messages || []);
        await markDMThreadRead(token, selectedThread.id);
        if (!cancelled) loadThreads();
      } catch { /* ignore */ } finally {
        if (!cancelled) setMessagesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedThread, token, loadThreads]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSendMessage(e) {
    e.preventDefault();
    if (!msgInput.trim() || !selectedThread || sending) return;
    setSending(true);
    setError("");
    try {
      const data = await sendDMMessage(token, selectedThread.id, msgInput.trim());
      setMessages((prev) => [...prev, data.message]);
      setMsgInput("");
      loadThreads();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  async function handleNewRequest(e) {
    e.preventDefault();
    if (!newRequestInput.trim()) return;
    setError("");
    try {
      const data = await sendDMRequest(token, newRequestInput.trim());
      setNewRequestInput("");
      await Promise.all([loadRequests(), loadThreads()]);
      if (data.threadId) {
        const refreshed = await getDMThreads(token);
        setThreads(refreshed.threads || []);
        const created = (refreshed.threads || []).find((t) => t.id === data.threadId);
        if (created) setSelectedThread(created);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleAccept(id) {
    try { await acceptDMRequest(token, id); loadRequests(); loadThreads(); } catch (err) { setError(err.message); }
  }
  async function handleDecline(id) {
    try { await declineDMRequest(token, id); loadRequests(); } catch (err) { setError(err.message); }
  }
  async function handleBlock(id) {
    try { await blockDMRequest(token, id); loadRequests(); loadBlocks(); } catch (err) { setError(err.message); }
  }
  async function handleCancelReq(id) {
    try { await cancelDMRequest(token, id); loadRequests(); } catch (err) { setError(err.message); }
  }
  async function handleUnblock(userId) {
    try { await removeDMBlock(token, userId); loadBlocks(); } catch (err) { setError(err.message); }
  }

  function copyToClipboard(text, label) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(""), 1500);
    }).catch(() => {});
  }

  async function handleCreateInvite(e) {
    e.preventDefault();
    if (!inviteForm.email.trim() || inviteCreating) return;
    setInviteCreating(true);
    setError("");
    setLastInviteLink("");
    try {
      const data = await createOrgInvite(token, {
        email: inviteForm.email.trim(),
        role: inviteForm.role,
      });
      setLastInviteLink(data.inviteLink || "");
      setInviteForm({ email: "", role: "staff" });
      loadInvites();
    } catch (err) {
      setError(err.message);
    } finally {
      setInviteCreating(false);
    }
  }

  async function handleRevokeInvite(id) {
    setError("");
    try {
      await revokeOrgInvite(token, id);
      loadInvites();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleAcceptMyInvite(invite) {
    const confirmMsg =
      `Join "${invite.org_name}" as ${invite.role}?\n\n` +
      `You will leave your current organization and lose access to its data.`;
    if (!window.confirm(confirmMsg)) return;
    setError("");
    try {
      const data = await acceptMyInvite(token, invite.id);
      setSession({ user: data.user, token: data.token });
      setMyInvites((prev) => prev.filter((i) => i.id !== invite.id));
      loadOrgUsers();
      loadInvites();
      loadThreads();
      loadRequests();
      setTab("team");
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeclineMyInvite(id) {
    setError("");
    try {
      await declineMyInvite(token, id);
      setMyInvites((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleTeamMessage(u) {
    const identifier = u.handle || u.id;
    setError("");
    try {
      const data = await sendDMRequest(token, identifier);
      await Promise.all([loadRequests(), loadThreads()]);
      if (data.threadId) {
        const refreshed = await getDMThreads(token);
        setThreads(refreshed.threads || []);
        const created = (refreshed.threads || []).find((t) => t.id === data.threadId);
        if (created) setSelectedThread(created);
      }
      setTab("threads");
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRemoveOrgUser(u) {
    const label = u.email || u.id;
    if (!window.confirm(`Remove ${label} from your organization? This will delete their account.`)) return;
    setError("");
    try {
      await removeOrgUser(token, u.id);
      loadOrgUsers();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSaveProfile(e) {
    e.preventDefault();
    setProfileSaving(true);
    setError("");
    try {
      const data = await updateDMProfile(token, {
        handle: profileForm.handle || null,
        displayName: profileForm.displayName || null,
        allowDMs: profileForm.allowDMs,
      });
      setProfile(data.profile);
    } catch (err) {
      setError(err.message);
    } finally {
      setProfileSaving(false);
    }
  }

  const totalDMUnread = threads.reduce((s, t) => s + (t.unread_count || 0), 0);
  const newRequestRef = useRef(null);

  function getTeamDisplayName(entity) {
    return (
      entity?.other_display_name ||
      entity?.display_name ||
      entity?.other_handle ||
      entity?.handle ||
      entity?.other_email?.split("@")[0] ||
      entity?.email?.split("@")[0] ||
      entity?.other_user_id?.slice(0, 8) ||
      entity?.id?.slice(0, 8) ||
      "Teammate"
    );
  }

  function getInitials(entity) {
    return getTeamDisplayName(entity).slice(0, 2).toUpperCase();
  }

  function handleComposerKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  }

  function formatRelativeTime(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "now";
    if (diffMin < 60) return `${diffMin}m`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `${diffD}d`;
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  function formatDateSeparator(dateStr) {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();
    if (isToday) return "Today";
    if (isYesterday) return "Yesterday";
    return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  }

  const filteredThreads = threads.filter((t) => {
    if (!threadSearch.trim()) return true;
    const q = threadSearch.toLowerCase();
    return (
      (t.other_display_name || "").toLowerCase().includes(q) ||
      (t.other_handle || "").toLowerCase().includes(q) ||
      (t.other_email || "").toLowerCase().includes(q) ||
      (t.other_role || "").toLowerCase().includes(q) ||
      (t.other_user_id || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="dm-layout">
      <Sidebar inboxes={inboxes} selectedInboxId={null} onSelectInbox={() => {}} totalUnread={0} />
      <div className="dm-main">
        {/* Tabs */}
        <header className="dm-header">
          <h1 className="dm-title">Team Chat</h1>
          <nav className="dm-tabs">
            <button className={`dm-tab ${tab === "threads" ? "dm-tab-active" : ""}`} onClick={() => setTab("threads")}>
              Chats {totalDMUnread > 0 && <span className="dm-tab-badge">{totalDMUnread}</span>}
            </button>
            <button className={`dm-tab ${tab === "requests" ? "dm-tab-active" : ""}`} onClick={() => setTab("requests")}>
              Invites {(incoming.length + myInvites.length) > 0 && (
                <span className="dm-tab-badge">{incoming.length + myInvites.length}</span>
              )}
            </button>
            <button className={`dm-tab ${tab === "team" ? "dm-tab-active" : ""}`} onClick={() => setTab("team")}>
              Team
            </button>
            <button className={`dm-tab ${tab === "settings" ? "dm-tab-active" : ""}`} onClick={() => setTab("settings")}>
              Settings
            </button>
          </nav>
        </header>

        {error && <div className="dm-error">{error}<button className="dm-error-close" onClick={() => setError("")}>x</button></div>}

        {/* ── THREADS TAB ────────────────────────── */}
        {tab === "threads" && (
          <div className="dm-threads-layout">
            <aside className="dm-thread-list">
              {/* New team chat form */}
              <div className="dm-sidebar-top">
                <form className="dm-new-request" onSubmit={handleNewRequest}>
                  <input
                    ref={newRequestRef}
                    className="dm-new-input"
                    placeholder="@teammate or user ID"
                    value={newRequestInput}
                    onChange={(e) => setNewRequestInput(e.target.value)}
                  />
                  <button className="dm-new-btn" type="submit" aria-label="Send request">
                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z" /></svg>
                  </button>
                </form>
                {(threads.length > 0 || threadSearch) && (
                  <input
                    className="dm-thread-search"
                    placeholder="Search team chats..."
                    value={threadSearch}
                    onChange={(e) => setThreadSearch(e.target.value)}
                  />
                )}
              </div>

              {/* Pending outgoing requests */}
              {outgoing.length > 0 && (
                <div className="dm-pending-section">
                  <div className="dm-pending-label">Pending teammate approval</div>
                  {outgoing.map((r) => (
                    <div key={r.id} className="dm-thread-item dm-thread-item-pending">
                      <div className="dm-thread-avatar dm-avatar-pending">
                        {(r.recipient_handle || r.recipient_display_name || "?").slice(0, 2).toUpperCase()}
                      </div>
                      <div className="dm-thread-info">
                        <span className="dm-thread-name">{r.recipient_display_name || r.recipient_handle || r.recipient_user_id?.slice(0, 8)}</span>
                        <span className="dm-thread-preview dm-pending-status">Waiting for approval…</span>
                      </div>
                      <button className="dm-pending-cancel" onClick={() => handleCancelReq(r.id)} aria-label="Cancel request">
                        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Thread list */}
              <div className="dm-thread-scroll">
                {threadsLoading ? (
                  <div className="dm-skeleton-list">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="dm-skeleton-row">
                        <div className="dm-skeleton-avatar" />
                        <div className="dm-skeleton-lines">
                          <div className="dm-skeleton-line dm-skeleton-w60" />
                          <div className="dm-skeleton-line dm-skeleton-w80" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : filteredThreads.length === 0 && threads.length === 0 && outgoing.length === 0 ? (
                  <div className="dm-sidebar-empty">
                    <div className="dm-sidebar-empty-icon">
                      <svg width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                    </div>
                    <div className="dm-sidebar-empty-title">No team chats yet</div>
                    <div className="dm-sidebar-empty-desc">
                      Enter a teammate handle above, or find coworkers in the
                      <button type="button" className="dm-link-btn" onClick={() => setTab("team")}> Team</button> tab.
                    </div>
                  </div>
                ) : filteredThreads.length === 0 && threadSearch ? (
                  <div className="dm-empty">No results for &ldquo;{threadSearch}&rdquo;</div>
                ) : (
                  filteredThreads.map((t) => (
                    <button
                      key={t.id}
                      className={`dm-thread-item ${selectedThread?.id === t.id ? "dm-thread-item-active" : ""} ${t.unread_count > 0 ? "dm-thread-item-unread" : ""}`}
                      onClick={() => setSelectedThread(t)}
                    >
                      <div className="dm-thread-avatar">{getInitials(t)}</div>
                      <div className="dm-thread-info">
                        <div className="dm-thread-row-top">
                          <span className="dm-thread-name">{getTeamDisplayName(t)}</span>
                          {t.last_msg_at && <span className="dm-thread-time">{formatRelativeTime(t.last_msg_at)}</span>}
                        </div>
                        {t.last_msg_preview ? (
                          <span className="dm-thread-preview">
                            {t.last_msg_is_mine && <span className="dm-thread-you">You: </span>}
                            {t.last_msg_preview}
                          </span>
                        ) : t.other_handle ? (
                          <span className="dm-thread-handle">@{t.other_handle}</span>
                        ) : null}
                      </div>
                      {t.unread_count > 0 && <span className="dm-thread-badge">{t.unread_count}</span>}
                    </button>
                  ))
                )}
              </div>
            </aside>

            <section className="dm-conversation">
              {!selectedThread ? (
                <div className="dm-conv-empty-hero">
                  <div className="dm-hero-icon">
                    <svg width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.2" viewBox="0 0 24 24">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <h2 className="dm-hero-title">Your team chats</h2>
                  <p className="dm-hero-desc">
                    Select a coworker from the sidebar, or start a new chat by entering a teammate handle or user ID.
                  </p>
                  <div className="dm-hero-actions">
                    <button className="dm-btn dm-btn-accept" onClick={() => newRequestRef.current?.focus()}>
                      New team chat
                    </button>
                    <button className="dm-btn dm-btn-decline" onClick={() => setTab("team")}>
                      Browse team
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="dm-conv-header">
                    <div className="dm-conv-avatar">{getInitials(selectedThread)}</div>
                    <div className="dm-conv-header-info">
                      <div className="dm-conv-name">{getTeamDisplayName(selectedThread)}</div>
                      <div className="dm-conv-handle">
                        {selectedThread.other_handle ? `@${selectedThread.other_handle}` : selectedThread.other_email}
                        {selectedThread.other_role && <span className={`dm-role-badge dm-role-${selectedThread.other_role}`}>{selectedThread.other_role}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="dm-messages">
                    {messagesLoading ? (
                      <div className="dm-messages-loading">Loading messages…</div>
                    ) : messages.length === 0 ? (
                      <div className="dm-messages-empty">No team messages yet. Start the handoff.</div>
                    ) : (
                      messages.map((m, i) => {
                        const showDate =
                          i === 0 ||
                          new Date(m.created_at).toDateString() !== new Date(messages[i - 1].created_at).toDateString();
                        return (
                          <div key={m.id}>
                            {showDate && (
                              <div className="dm-date-sep">
                                <span>{formatDateSeparator(m.created_at)}</span>
                              </div>
                            )}
                            <div className={`dm-msg ${m.sender_user_id === user?.id ? "dm-msg-mine" : "dm-msg-theirs"}`}>
                              <div className="dm-msg-bubble">{m.body}</div>
                              <div className="dm-msg-meta">
                                <span className="dm-msg-time">{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                                {m.sender_user_id === user?.id && m.read_at && (
                                  <span className="dm-msg-read" title={`Read ${new Date(m.read_at).toLocaleString()}`}>
                                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" /></svg>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                  <div className="dm-composer">
                    <textarea
                      className="dm-composer-input"
                      placeholder="Type a team message..."
                      value={msgInput}
                      onChange={(e) => setMsgInput(e.target.value)}
                      onKeyDown={handleComposerKeyDown}
                      rows={1}
                      onInput={(e) => {
                        e.target.style.height = "auto";
                        e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                      }}
                    />
                    <button
                      className="dm-composer-btn"
                      onClick={handleSendMessage}
                      disabled={sending || !msgInput.trim()}
                      aria-label="Send"
                    >
                      {sending ? (
                        <span className="dm-send-spinner" />
                      ) : (
                        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z" /></svg>
                      )}
                    </button>
                  </div>
                </>
              )}
            </section>
          </div>
        )}

        {/* ── REQUESTS TAB ───────────────────────── */}
        {tab === "requests" && (
          <div className="dm-requests-layout">
            {isAdmin && (
              <section className="dm-invite-section">
                <h2 className="dm-req-heading">Invite a Teammate</h2>
                <form className="dm-invite-form" onSubmit={handleCreateInvite}>
                  <input
                    className="dm-input dm-invite-email"
                    type="email"
                    placeholder="teammate@clinic.com"
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
                    required
                  />
                  <select
                    className="dm-select dm-invite-role"
                    value={inviteForm.role}
                    onChange={(e) => setInviteForm((f) => ({ ...f, role: e.target.value }))}
                  >
                    <option value="staff">Staff</option>
                    <option value="provider">Provider</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button className="dm-btn dm-btn-accept" type="submit" disabled={inviteCreating}>
                    {inviteCreating ? "Creating..." : "Create Invite"}
                  </button>
                </form>

                <p className="dm-invite-hint">
                  If this email already has a Health SMS account, the invite will show up in their
                  <strong> Invites</strong> tab. Otherwise, share the one-time link below so they can sign up.
                </p>

                {lastInviteLink && (
                  <div className="dm-invite-result">
                    <div className="dm-invite-result-label">
                      Share this link if the invitee doesn&apos;t have an account yet (shown once):
                    </div>
                    <div className="dm-invite-link-row">
                      <code className="dm-invite-link">{lastInviteLink}</code>
                      <button
                        className="dm-btn dm-btn-copy"
                        onClick={() => copyToClipboard(lastInviteLink, "invite-link")}
                      >
                        {copied === "invite-link" ? "Copied!" : "Copy"}
                      </button>
                    </div>
                  </div>
                )}

                <h3 className="dm-invite-subheading">Pending Invites</h3>
                {invites.filter((i) => !i.used_at && !i.revoked_at).length === 0 ? (
                  <div className="dm-empty">No pending invites</div>
                ) : (
                  invites
                    .filter((i) => !i.used_at && !i.revoked_at)
                    .map((inv) => (
                      <div key={inv.id} className="dm-req-card">
                        <div className="dm-req-user">
                          <div className="dm-req-avatar">{(inv.invited_email || "?").slice(0, 2).toUpperCase()}</div>
                          <div>
                            <div className="dm-req-name">{inv.invited_email}</div>
                            <div className="dm-req-handle">
                              <span className={`dm-role-badge dm-role-${inv.role}`}>{inv.role}</span>
                              {"  "}expires {new Date(inv.expires_at).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                        <div className="dm-req-actions">
                          <button className="dm-btn dm-btn-decline" onClick={() => handleRevokeInvite(inv.id)}>
                            Revoke
                          </button>
                        </div>
                      </div>
                    ))
                )}
              </section>
            )}

            {myInvites.length > 0 && (
              <section className="dm-req-section">
                <h2 className="dm-req-heading">Organization Invites</h2>
                {myInvites.map((inv) => (
                  <div key={inv.id} className="dm-req-card">
                    <div className="dm-req-user">
                      <div className="dm-req-avatar">{(inv.org_name || "?").slice(0, 2).toUpperCase()}</div>
                      <div>
                        <div className="dm-req-name">
                          Join <strong>{inv.org_name}</strong>
                          <span className={`dm-role-badge dm-role-${inv.role}`} style={{ marginLeft: 8 }}>{inv.role}</span>
                        </div>
                        <div className="dm-req-handle">
                          Invited by {inv.invited_by_email || "an admin"} · expires {new Date(inv.expires_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <div className="dm-req-actions">
                      <button className="dm-btn dm-btn-accept" onClick={() => handleAcceptMyInvite(inv)}>Accept</button>
                      <button className="dm-btn dm-btn-decline" onClick={() => handleDeclineMyInvite(inv.id)}>Decline</button>
                    </div>
                  </div>
                ))}
              </section>
            )}

            <section className="dm-req-section">
              <h2 className="dm-req-heading">Incoming Chat Requests</h2>
              {incoming.length === 0 ? (
                <div className="dm-empty">No pending requests</div>
              ) : (
                incoming.map((r) => (
                  <div key={r.id} className="dm-req-card">
                    <div className="dm-req-user">
                      <div className="dm-req-avatar">{(r.requester_handle || "?").slice(0, 2).toUpperCase()}</div>
                      <div>
                        <div className="dm-req-name">{r.requester_display_name || r.requester_handle || r.requester_user_id?.slice(0, 8)}</div>
                        {r.requester_handle && <div className="dm-req-handle">@{r.requester_handle}</div>}
                      </div>
                    </div>
                    <div className="dm-req-actions">
                      <button className="dm-btn dm-btn-accept" onClick={() => handleAccept(r.id)}>Accept</button>
                      <button className="dm-btn dm-btn-decline" onClick={() => handleDecline(r.id)}>Decline</button>
                      <button className="dm-btn dm-btn-block" onClick={() => handleBlock(r.id)}>Block</button>
                    </div>
                  </div>
                ))
              )}
            </section>

            <section className="dm-req-section">
              <h2 className="dm-req-heading">Outgoing Chat Requests</h2>
              {outgoing.length === 0 ? (
                <div className="dm-empty">No pending requests</div>
              ) : (
                outgoing.map((r) => (
                  <div key={r.id} className="dm-req-card">
                    <div className="dm-req-user">
                      <div className="dm-req-avatar">{(r.recipient_handle || "?").slice(0, 2).toUpperCase()}</div>
                      <div>
                        <div className="dm-req-name">{r.recipient_display_name || r.recipient_handle || r.recipient_user_id?.slice(0, 8)}</div>
                        {r.recipient_handle && <div className="dm-req-handle">@{r.recipient_handle}</div>}
                      </div>
                    </div>
                    <div className="dm-req-actions">
                      <button className="dm-btn dm-btn-decline" onClick={() => handleCancelReq(r.id)}>Cancel</button>
                    </div>
                  </div>
                ))
              )}
            </section>
          </div>
        )}

        {/* ── TEAM TAB ─────────────────────────── */}
        {tab === "team" && (
          <div className="dm-team-layout">
            <div className="dm-team-header">
              <h2 className="dm-req-heading">Your Organization</h2>
              <input
                className="dm-team-search"
                placeholder="Search by name, email, or handle..."
                value={teamSearch}
                onChange={(e) => setTeamSearch(e.target.value)}
              />
            </div>
            <div className="dm-team-list">
              {orgUsers
                .filter((u) => {
                  if (!teamSearch.trim()) return true;
                  const q = teamSearch.toLowerCase();
                  return (
                    (u.email || "").toLowerCase().includes(q) ||
                    (u.handle || "").toLowerCase().includes(q) ||
                    (u.display_name || "").toLowerCase().includes(q) ||
                    (u.role || "").toLowerCase().includes(q)
                  );
                })
                .map((u) => (
                  <div key={u.id} className="dm-team-card">
                    <div className="dm-team-user">
                      <div className="dm-req-avatar">
                        {(u.handle || u.display_name || u.email || "?").slice(0, 2).toUpperCase()}
                      </div>
                      <div className="dm-team-info">
                        <div className="dm-team-name">
                          {u.display_name || u.handle || u.email.split("@")[0]}
                          <span className={`dm-role-badge dm-role-${u.role}`}>{u.role}</span>
                        </div>
                        <div className="dm-team-meta">
                          {u.handle && <span className="dm-team-handle">@{u.handle}</span>}
                          <span className="dm-team-email">{u.email}</span>
                        </div>
                      </div>
                    </div>
                    <div className="dm-team-actions">
                      {u.handle && (
                        <button className="dm-btn dm-btn-copy" onClick={() => copyToClipboard(u.handle, `@${u.handle}`)}>
                          {copied === `@${u.handle}` ? "Copied!" : "Copy Handle"}
                        </button>
                      )}
                      <button className="dm-btn dm-btn-copy" onClick={() => copyToClipboard(u.id, u.id)}>
                        {copied === u.id ? "Copied!" : "Copy ID"}
                      </button>
                      {u.id !== user?.id && (
                        <button className="dm-btn dm-btn-accept" onClick={() => handleTeamMessage(u)}>
                          Chat
                        </button>
                      )}
                      {isAdmin && u.id !== user?.id && (
                        <button className="dm-btn dm-btn-decline" onClick={() => handleRemoveOrgUser(u)}>
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              {orgUsers.length === 0 && <div className="dm-empty">No users in your organization yet.</div>}
            </div>
          </div>
        )}

        {/* ── SETTINGS TAB ───────────────────────── */}
        {tab === "settings" && (
          <div className="dm-settings-layout">
            {/* Identity Card */}
            <section className="dm-identity-card">
              <h2 className="dm-req-heading">Your Team Chat Identity</h2>
              <div className="dm-identity-body">
                <div className="dm-identity-avatar">
                  {(profile?.handle || user?.email || "?").slice(0, 2).toUpperCase()}
                </div>
                <div className="dm-identity-details">
                  <div className="dm-identity-row">
                    <span className="dm-identity-label">Handle</span>
                    {profile?.handle ? (
                      <span className="dm-identity-value">
                        @{profile.handle}
                        <button className="dm-copy-btn" onClick={() => copyToClipboard(profile.handle, "handle")}>
                          {copied === "handle" ? "Copied!" : "Copy"}
                        </button>
                      </span>
                    ) : (
                      <span className="dm-identity-value dm-identity-unset">Not set — set one below</span>
                    )}
                  </div>
                  <div className="dm-identity-row">
                    <span className="dm-identity-label">User ID</span>
                    <span className="dm-identity-value">
                      <code className="dm-identity-id">{user?.id?.slice(0, 8)}...{user?.id?.slice(-4)}</code>
                      <button className="dm-copy-btn" onClick={() => copyToClipboard(user?.id || "", "userId")}>
                        {copied === "userId" ? "Copied!" : "Copy"}
                      </button>
                    </span>
                  </div>
                  <div className="dm-identity-row">
                    <span className="dm-identity-label">Role</span>
                    <span className="dm-identity-value">
                      {user?.role ? (
                        <span className={`dm-role-badge dm-role-${user.role}`}>{user.role}</span>
                      ) : (
                        <span className="dm-identity-unset">Unknown</span>
                      )}
                    </span>
                  </div>
                  <div className="dm-identity-row">
                    <span className="dm-identity-label">Display Name</span>
                    <span className="dm-identity-value">{profile?.display_name || <span className="dm-identity-unset">Not set</span>}</span>
                  </div>
                  <div className="dm-identity-row">
                    <span className="dm-identity-label">Privacy</span>
                    <span className="dm-identity-value dm-identity-privacy">
                      {profile?.allow_dms === "nobody" ? "Team chat disabled" : "Teammates can start chats"}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <section className="dm-settings-section">
              <h2 className="dm-req-heading">Edit Profile</h2>
              {!profile && <p className="dm-empty">Set up your profile to start team chat.</p>}
              <form className="dm-settings-form" onSubmit={handleSaveProfile}>
                <label className="dm-label">
                  Handle
                  <input className="dm-input" placeholder="my_handle" value={profileForm.handle} onChange={(e) => setProfileForm((f) => ({ ...f, handle: e.target.value }))} />
                </label>
                <label className="dm-label">
                  Display Name
                  <input className="dm-input" placeholder="Display Name" value={profileForm.displayName} onChange={(e) => setProfileForm((f) => ({ ...f, displayName: e.target.value }))} />
                </label>
                <label className="dm-label">
                  Who can start chats with you?
                  <select className="dm-select" value={profileForm.allowDMs} onChange={(e) => setProfileForm((f) => ({ ...f, allowDMs: e.target.value }))}>
                    <option value="requests">Teammates (default)</option>
                    <option value="anyone">Teammates with open profile</option>
                    <option value="nobody">Nobody</option>
                  </select>
                </label>
                <button className="dm-btn dm-btn-accept" type="submit" disabled={profileSaving}>
                  {profileSaving ? "Saving..." : "Save Profile"}
                </button>
              </form>
            </section>

            <section className="dm-settings-section">
              <h2 className="dm-req-heading">Blocked Users</h2>
              {blocks.length === 0 ? (
                <div className="dm-empty">No blocked users</div>
              ) : (
                blocks.map((b) => (
                  <div key={b.blocked_user_id} className="dm-req-card">
                    <div className="dm-req-user">
                      <div className="dm-req-avatar">{(b.blocked_handle || "?").slice(0, 2).toUpperCase()}</div>
                      <div>
                        <div className="dm-req-name">{b.blocked_display_name || b.blocked_handle || b.blocked_user_id?.slice(0, 8)}</div>
                      </div>
                    </div>
                    <button className="dm-btn dm-btn-decline" onClick={() => handleUnblock(b.blocked_user_id)}>Unblock</button>
                  </div>
                ))
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
