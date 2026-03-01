import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Sidebar } from "../components/Sidebar";
import { NewInboxModal } from "../components/NewInboxModal";
import { useAuth } from "../context/AuthContext";
import {
  getPatients,
  getPhoneNumbers,
  createPatient,
  updatePatient,
  deletePatient,
} from "../utils/api";
import "./ContactsPage.css";

function formatPhone(e164) {
  if (!e164) return "";
  const d = e164.replace(/\D/g, "");
  if (d.length === 11 && d[0] === "1")
    return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  if (d.length === 10)
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return e164;
}

function getInitials(name) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const COLORS = [
  "#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6",
  "#8b5cf6", "#ef4444", "#14b8a6", "#f97316", "#06b6d4",
];
function avatarColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || "").length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function ContactModal({ contact, onSave, onClose, saving, error }) {
  const [fullName, setFullName] = useState(contact?.fullName || "");
  const [phone, setPhone] = useState(contact?.primaryPhone || "");
  const [notes, setNotes] = useState(contact?.notes || "");
  const nameRef = useRef(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({ fullName: fullName.trim(), primaryPhone: phone.trim(), notes: notes.trim() });
  };

  return (
    <div className="ct-modal-backdrop" onClick={onClose}>
      <div className="ct-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ct-modal-header">
          <h2>{contact ? "Edit Contact" : "New Contact"}</h2>
          <button type="button" className="ct-modal-close" onClick={onClose}>&times;</button>
        </div>
        {error && <div className="ct-modal-error">{error}</div>}
        <form onSubmit={handleSubmit} className="ct-modal-form">
          <label className="ct-field">
            <span>Full Name</span>
            <input ref={nameRef} value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="Jane Doe" />
          </label>
          <label className="ct-field">
            <span>Phone Number</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} required placeholder="(555) 123-4567" />
          </label>
          <label className="ct-field">
            <span>Notes</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Allergies, preferences, etc." />
          </label>
          <div className="ct-modal-actions">
            <button type="button" className="ct-btn ct-btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="ct-btn ct-btn-primary" disabled={saving || !fullName.trim() || !phone.trim()}>
              {saving ? "Saving..." : contact ? "Save Changes" : "Add Contact"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteConfirm({ contact, onConfirm, onClose, deleting }) {
  return (
    <div className="ct-modal-backdrop" onClick={onClose}>
      <div className="ct-modal ct-modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="ct-modal-header">
          <h2>Delete Contact</h2>
          <button type="button" className="ct-modal-close" onClick={onClose}>&times;</button>
        </div>
        <p className="ct-delete-msg">
          Are you sure you want to delete <strong>{contact.fullName}</strong>? This will also remove their conversations.
        </p>
        <div className="ct-modal-actions">
          <button type="button" className="ct-btn ct-btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="ct-btn ct-btn-danger" onClick={onConfirm} disabled={deleting}>
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ContactsPage() {
  const { token, logout } = useAuth();
  const navigate = useNavigate();
  const [patients, setPatients] = useState([]);
  const [inboxes, setInboxes] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [showNewInbox, setShowNewInbox] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editContact, setEditContact] = useState(null);
  const [showDelete, setShowDelete] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [modalError, setModalError] = useState("");
  const searchTimer = useRef(null);

  const load = useCallback(async (q) => {
    if (!token) return;
    try {
      const [pts, nums] = await Promise.all([getPatients(token, q), getPhoneNumbers(token)]);
      setPatients(pts);
      setInboxes(nums);
    } catch { /* ignore */ }
  }, [token]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const handleSearch = (val) => {
    setSearch(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => load(val), 300);
  };

  const openNew = () => { setEditContact(null); setModalError(""); setShowModal(true); };
  const openEdit = (c) => { setEditContact(c); setModalError(""); setShowModal(true); };
  const closeModal = () => { setShowModal(false); setEditContact(null); setModalError(""); };

  const handleSave = async (data) => {
    setSaving(true);
    setModalError("");
    try {
      if (editContact) {
        await updatePatient(token, editContact.id, data);
      } else {
        await createPatient(token, data);
      }
      closeModal();
      await load(search);
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!showDelete) return;
    setDeleting(true);
    try {
      await deletePatient(token, showDelete.id);
      setShowDelete(null);
      if (selected?.id === showDelete.id) setSelected(null);
      await load(search);
    } catch { /* ignore */ } finally {
      setDeleting(false);
    }
  };

  const goToConversation = (convId) => {
    navigate(`/inbox?conversation=${convId}`);
  };

  const startConversation = (patient) => {
    navigate(`/inbox?newTo=${encodeURIComponent(patient.primaryPhone)}&name=${encodeURIComponent(patient.fullName)}`);
  };

  return (
    <div className="ct-layout">
      <Sidebar inboxes={inboxes} selectedInboxId={null} onSelectInbox={() => navigate("/inbox")} onAddInbox={() => setShowNewInbox(true)} />

      <main className="ct-main">
        <header className="ct-header">
          <div className="ct-header-left">
            <h1 className="ct-title">Contacts</h1>
            <span className="ct-subtitle">{patients.length} contact{patients.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="ct-header-right">
            <div className="ct-search-wrap">
              <span className="ct-search-icon">
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              </span>
              <input
                className="ct-search"
                placeholder="Search contacts..."
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
              />
              {search && (
                <button type="button" className="ct-search-clear" onClick={() => handleSearch("")}>&times;</button>
              )}
            </div>
            <button type="button" className="ct-btn ct-btn-primary" onClick={openNew}>+ Add Contact</button>
            <button type="button" className="ct-btn ct-btn-secondary" onClick={logout}>Log out</button>
          </div>
        </header>

        <section className="ct-body">
          <div className="ct-list-pane">
            {loading ? (
              <div className="ct-list-status">Loading...</div>
            ) : patients.length === 0 ? (
              <div className="ct-list-status">
                {search ? "No contacts match your search" : "No contacts yet"}
              </div>
            ) : (
              <div className="ct-list">
                {patients.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={"ct-list-item" + (selected?.id === p.id ? " ct-list-item-active" : "")}
                    onClick={() => setSelected(p)}
                  >
                    <div className="ct-avatar" style={{ background: avatarColor(p.fullName) }}>
                      {getInitials(p.fullName)}
                    </div>
                    <div className="ct-list-item-info">
                      <div className="ct-list-item-name">{p.fullName}</div>
                      <div className="ct-list-item-phone">{formatPhone(p.primaryPhone)}</div>
                    </div>
                    {p.lastMessage && (
                      <div className="ct-list-item-preview">
                        {p.lastMessage.slice(0, 25)}{p.lastMessage.length > 25 ? "..." : ""}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="ct-detail-pane">
            {selected ? (
              <div className="ct-detail">
                <div className="ct-detail-top">
                  <div className="ct-detail-avatar" style={{ background: avatarColor(selected.fullName) }}>
                    {getInitials(selected.fullName)}
                  </div>
                  <h2 className="ct-detail-name">{selected.fullName}</h2>
                  <div className="ct-detail-phone">{formatPhone(selected.primaryPhone)}</div>
                  {selected.notes && <div className="ct-detail-notes">{selected.notes}</div>}
                  <div className="ct-detail-date">Added {formatDate(selected.createdAt)}</div>
                </div>

                <div className="ct-detail-actions">
                  {selected.conversationId ? (
                    <button type="button" className="ct-btn ct-btn-accent" onClick={() => goToConversation(selected.conversationId)}>
                      View Conversation
                    </button>
                  ) : (
                    <button type="button" className="ct-btn ct-btn-accent" onClick={() => startConversation(selected)}>
                      Start Conversation
                    </button>
                  )}
                  <button type="button" className="ct-btn ct-btn-secondary" onClick={() => openEdit(selected)}>Edit</button>
                  <button type="button" className="ct-btn ct-btn-danger-outline" onClick={() => setShowDelete(selected)}>Delete</button>
                </div>
              </div>
            ) : (
              <div className="ct-detail-empty">
                <div className="ct-detail-empty-icon">
                  <svg width="48" height="48" fill="none" stroke="#9ca3af" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"/>
                  </svg>
                </div>
                <p className="ct-detail-empty-text">Select a contact to view details</p>
                <button type="button" className="ct-btn ct-btn-primary" onClick={openNew}>+ Add Contact</button>
              </div>
            )}
          </div>
        </section>
      </main>

      {showModal && (
        <ContactModal contact={editContact} onSave={handleSave} onClose={closeModal} saving={saving} error={modalError} />
      )}
      {showDelete && (
        <DeleteConfirm contact={showDelete} onConfirm={handleDelete} onClose={() => setShowDelete(null)} deleting={deleting} />
      )}
      {showNewInbox && (
        <NewInboxModal
          token={token}
          onClose={() => setShowNewInbox(false)}
          onCreated={() => { setShowNewInbox(false); load(); }}
        />
      )}
    </div>
  );
}
