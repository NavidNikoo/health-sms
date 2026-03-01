import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Sidebar } from "../components/Sidebar";
import { ConversationList } from "../components/ConversationList";
import { ConversationView } from "../components/ConversationView";
import { NewConversationModal } from "../components/NewConversationModal";
import { NewInboxModal } from "../components/NewInboxModal";
import { SearchOverlay } from "../components/SearchOverlay";
import { TemplateManager } from "../components/TemplateManager";
import { useAuth } from "../context/AuthContext";
import { getConversations, getPhoneNumbers } from "../utils/api";
import "./InboxPage.css";

const CONV_POLL_INTERVAL = 5000;
const READ_STATE_KEY = "health-sms-read-state";

function loadReadState() {
  try {
    return JSON.parse(localStorage.getItem(READ_STATE_KEY) || "{}");
  } catch { return {}; }
}

function saveReadState(state) {
  localStorage.setItem(READ_STATE_KEY, JSON.stringify(state));
}

function getUnreadSet(conversations, readState) {
  const unread = new Set();
  for (const c of conversations) {
    if (c.lastMessageDirection !== "inbound") continue;
    const readAt = readState[c.id];
    if (!readAt || new Date(c.lastMessageAt) > new Date(readAt)) {
      unread.add(c.id);
    }
  }
  return unread;
}

export function InboxPage() {
  const { user, token, logout } = useAuth();
  const [selectedInboxId, setSelectedInboxId] = useState(null);
  const [selectedConversationId, setSelectedConversationId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [inboxes, setInboxes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [showNewInbox, setShowNewInbox] = useState(false);
  const [readState, setReadState] = useState(loadReadState);
  const [prefillPhone, setPrefillPhone] = useState("");
  const [prefillName, setPrefillName] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const pollRef = useRef(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const handleKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowSearch((v) => !v);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const markAsRead = useCallback((convId) => {
    setReadState((prev) => {
      const next = { ...prev, [convId]: new Date().toISOString() };
      saveReadState(next);
      return next;
    });
  }, []);

  const handleSelectConversation = useCallback((convId) => {
    setSelectedConversationId(convId);
    if (convId) markAsRead(convId);
  }, [markAsRead]);

  const loadData = useCallback(async () => {
    if (!token) return;
    try {
      const [convs, nums] = await Promise.all([getConversations(token), getPhoneNumbers(token)]);
      setConversations(convs);
      setInboxes(nums);
    } catch (err) {
      setError(err.message || "Failed to load");
    }
  }, [token]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  useEffect(() => {
    const convParam = searchParams.get("conversation");
    const newToParam = searchParams.get("newTo");
    const nameParam = searchParams.get("name");

    if (convParam) {
      setSelectedConversationId(convParam);
      markAsRead(convParam);
      setSearchParams({}, { replace: true });
    } else if (newToParam) {
      setPrefillPhone(newToParam);
      setPrefillName(nameParam || "");
      setShowNewConversation(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, markAsRead]);

  useEffect(() => {
    if (!token) return;
    pollRef.current = setInterval(() => {
      if (!document.hidden) {
        getConversations(token)
          .then((convs) => setConversations(convs))
          .catch(() => {});
      }
    }, CONV_POLL_INTERVAL);
    return () => clearInterval(pollRef.current);
  }, [token]);

  const handleConversationCreated = async (conversationId) => {
    setShowNewConversation(false);
    await loadData();
    setSelectedConversationId(conversationId);
    markAsRead(conversationId);
  };

  const handleStatusChange = useCallback((convId, newStatus) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === convId ? { ...c, status: newStatus } : c))
    );
  }, []);

  const unreadIds = getUnreadSet(conversations, readState);

  const inboxUnreadCounts = {};
  for (const c of conversations) {
    if (!unreadIds.has(c.id)) continue;
    const key = c.inboxNumber || c.phoneNumberId;
    inboxUnreadCounts[key] = (inboxUnreadCounts[key] || 0) + 1;
  }

  const inboxesWithUnread = inboxes.map((inbox) => ({
    ...inbox,
    unreadCount: inboxUnreadCounts[inbox.number] || inboxUnreadCounts[inbox.id] || 0,
  }));
  const totalUnread = unreadIds.size;

  const selectedInbox = inboxes.find((i) => String(i.id) === String(selectedInboxId));
  const filteredConversations = !selectedInboxId
    ? conversations
    : selectedInbox
      ? conversations.filter((c) => c.inboxNumber === selectedInbox.number)
      : conversations.filter((c) => String(c.phoneNumberId) === String(selectedInboxId));

  return (
    <div className="inbox-layout">
      <Sidebar inboxes={inboxesWithUnread} selectedInboxId={selectedInboxId} onSelectInbox={setSelectedInboxId} totalUnread={totalUnread} onAddInbox={() => setShowNewInbox(true)} />

      <main className="inbox-main">
        <header className="inbox-header">
          <div className="inbox-header-left">
            <h1 className="inbox-title">Unified Inbox</h1>
            <span className="inbox-subtitle">
              Signed in as {user?.email ?? "Unknown user"}
            </span>
          </div>
          <div className="inbox-header-right">
            <button
              type="button"
              className="inbox-icon-button"
              aria-label="Search"
              onClick={() => setShowSearch(true)}
              title="Search (⌘K)"
            >
              🔍
            </button>
            <button
              type="button"
              className="inbox-icon-button"
              aria-label="Filter"
            >
              ⚙️
            </button>
            <button
              type="button"
              className="inbox-primary-button"
              aria-label="New conversation"
              onClick={() => setShowNewConversation(true)}
            >
              + New
            </button>
            <button
              type="button"
              className="inbox-secondary-button"
              onClick={logout}
            >
              Log out
            </button>
          </div>
        </header>

        <section className="inbox-content">
          <div className="inbox-conv-list">
            {loading ? (
              <div className="inbox-loading">Loading...</div>
            ) : error ? (
              <div className="inbox-error">{error}</div>
            ) : (
              <ConversationList
                conversations={filteredConversations}
                selectedConversationId={selectedConversationId}
                onSelectConversation={handleSelectConversation}
                unreadIds={unreadIds}
              />
            )}
          </div>
          <div className="inbox-conv-view">
            <ConversationView
              token={token}
              conversationId={selectedConversationId}
              conversation={conversations.find((c) => c.id === selectedConversationId)}
              onStartNew={() => setShowNewConversation(true)}
              onManageTemplates={() => setShowTemplateManager(true)}
              onStatusChange={handleStatusChange}
            />
          </div>
        </section>
      </main>

      {showNewConversation && (
        <NewConversationModal
          token={token}
          inboxes={inboxes}
          onClose={() => { setShowNewConversation(false); setPrefillPhone(""); setPrefillName(""); }}
          onCreated={handleConversationCreated}
          initialPhone={prefillPhone}
          initialName={prefillName}
        />
      )}

      {showTemplateManager && (
        <TemplateManager token={token} onClose={() => setShowTemplateManager(false)} />
      )}

      {showSearch && (
        <SearchOverlay
          token={token}
          onClose={() => setShowSearch(false)}
          onSelectConversation={(id) => {
            setShowSearch(false);
            handleSelectConversation(id);
          }}
          onSelectPatient={(patient) => {
            setShowSearch(false);
            if (patient.conversationId) {
              handleSelectConversation(patient.conversationId);
            } else {
              navigate(`/contacts`);
            }
          }}
        />
      )}

      {showNewInbox && (
        <NewInboxModal
          token={token}
          onClose={() => setShowNewInbox(false)}
          onCreated={() => { setShowNewInbox(false); loadData(); }}
        />
      )}
    </div>
  );
}

