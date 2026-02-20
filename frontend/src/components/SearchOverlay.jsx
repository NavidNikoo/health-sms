import { useState, useEffect, useRef, useCallback } from "react";
import { getConversations, getPatients } from "../utils/api";
import "./SearchOverlay.css";

function formatPhone(e164) {
  if (!e164) return "";
  const d = e164.replace(/\D/g, "");
  if (d.length === 11 && d[0] === "1") return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return e164;
}

function getInitials(name) {
  if (!name) return "?";
  return name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

const COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ef4444", "#14b8a6"];
function avatarColor(name) {
  let h = 0;
  for (let i = 0; i < (name || "").length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return COLORS[Math.abs(h) % COLORS.length];
}

function highlightMatch(text, query) {
  if (!query || !text) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="search-highlight">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export function SearchOverlay({ token, onClose, onSelectConversation, onSelectPatient }) {
  const [query, setQuery] = useState("");
  const [conversations, setConversations] = useState([]);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    const handleKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const doSearch = useCallback(async (q) => {
    if (!q.trim()) {
      setConversations([]);
      setPatients([]);
      return;
    }
    setLoading(true);
    try {
      const [convs, pts] = await Promise.all([
        getConversations(token, q.trim()),
        getPatients(token, q.trim()),
      ]);
      setConversations(convs.slice(0, 5));
      setPatients(pts.filter((p) => !convs.some((c) => c.patientId === p.id)).slice(0, 5));
      setActiveIdx(0);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [token]);

  const handleInput = (val) => {
    setQuery(val);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(val), 200);
  };

  const allResults = [
    ...conversations.map((c) => ({ type: "conv", data: c })),
    ...patients.map((p) => ({ type: "patient", data: p })),
  ];

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, allResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && allResults.length > 0) {
      e.preventDefault();
      const item = allResults[activeIdx];
      if (item.type === "conv") onSelectConversation(item.data.id);
      else onSelectPatient(item.data);
    }
  };

  const hasQuery = query.trim().length > 0;

  return (
    <div className="search-backdrop" onClick={onClose}>
      <div className="search-panel" onClick={(e) => e.stopPropagation()}>
        <div className="search-input-row">
          <svg className="search-input-icon" width="20" height="20" fill="none" stroke="#9ca3af" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            className="search-input"
            placeholder="Search conversations, contacts, phone numbers..."
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <kbd className="search-kbd">ESC</kbd>
        </div>

        <div className="search-results">
          {!hasQuery && (
            <div className="search-hint">Type to search across all conversations and contacts</div>
          )}

          {hasQuery && loading && (
            <div className="search-hint">Searching...</div>
          )}

          {hasQuery && !loading && allResults.length === 0 && (
            <div className="search-hint">No results for &ldquo;{query}&rdquo;</div>
          )}

          {conversations.length > 0 && (
            <>
              <div className="search-section-label">Conversations</div>
              {conversations.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  className={"search-result-item" + (activeIdx === i ? " search-result-active" : "")}
                  onClick={() => onSelectConversation(c.id)}
                  onMouseEnter={() => setActiveIdx(i)}
                >
                  <div className="search-result-avatar" style={{ background: avatarColor(c.patientName) }}>
                    {getInitials(c.patientName)}
                  </div>
                  <div className="search-result-info">
                    <div className="search-result-name">{highlightMatch(c.patientName, query)}</div>
                    <div className="search-result-sub">
                      {highlightMatch(formatPhone(c.patientPhone), query)}
                    </div>
                    {c.matchedMessage && (
                      <div className="search-result-snippet">
                        {highlightMatch(
                          c.matchedMessage.length > 80 ? c.matchedMessage.slice(0, 80) + "..." : c.matchedMessage,
                          query
                        )}
                      </div>
                    )}
                    {!c.matchedMessage && c.lastMessage && (
                      <div className="search-result-sub">
                        {c.lastMessage.slice(0, 50)}{c.lastMessage.length > 50 ? "..." : ""}
                      </div>
                    )}
                  </div>
                  <span className="search-result-badge">Chat</span>
                </button>
              ))}
            </>
          )}

          {patients.length > 0 && (
            <>
              <div className="search-section-label">Contacts</div>
              {patients.map((p, pi) => {
                const idx = conversations.length + pi;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={"search-result-item" + (activeIdx === idx ? " search-result-active" : "")}
                    onClick={() => onSelectPatient(p)}
                    onMouseEnter={() => setActiveIdx(idx)}
                  >
                    <div className="search-result-avatar" style={{ background: avatarColor(p.fullName) }}>
                      {getInitials(p.fullName)}
                    </div>
                    <div className="search-result-info">
                      <div className="search-result-name">{highlightMatch(p.fullName, query)}</div>
                      <div className="search-result-sub">{highlightMatch(formatPhone(p.primaryPhone), query)}</div>
                    </div>
                    <span className="search-result-badge search-result-badge-contact">Contact</span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
