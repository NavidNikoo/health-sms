import { useState, useEffect } from "react";
import { Sidebar } from "../components/Sidebar";
import { ConversationList } from "../components/ConversationList";
import { ConversationView } from "../components/ConversationView";
import { useAuth } from "../context/AuthContext";
import { getConversations, getPhoneNumbers } from "../utils/api";
import "./InboxPage.css";

export function InboxPage() {
  const { user, token, logout } = useAuth();
  const [selectedInboxId, setSelectedInboxId] = useState(null);
  const [selectedConversationId, setSelectedConversationId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [inboxes, setInboxes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [convs, nums] = await Promise.all([getConversations(token), getPhoneNumbers(token)]);
        setConversations(convs);
        setInboxes(nums);
      } catch (err) {
        setError(err.message || "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const selectedInbox = inboxes.find((i) => String(i.id) === String(selectedInboxId));
  const filteredConversations = !selectedInboxId
    ? conversations
    : selectedInbox
      ? conversations.filter((c) => c.inboxNumber === selectedInbox.number)
      : conversations.filter((c) => String(c.phoneNumberId) === String(selectedInboxId));

  return (
    <div className="inbox-layout">
      <Sidebar inboxes={inboxes} selectedInboxId={selectedInboxId} onSelectInbox={setSelectedInboxId} />

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
                onSelectConversation={setSelectedConversationId}
              />
            )}
          </div>
          <div className="inbox-conv-view">
            <ConversationView
              token={token}
              conversationId={selectedConversationId}
              conversation={conversations.find((c) => c.id === selectedConversationId)}
            />
          </div>
        </section>
      </main>
    </div>
  );
}

