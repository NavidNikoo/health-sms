import { useState, useEffect, useRef } from "react";
import { getTemplates } from "../utils/api";
import "./TemplatePicker.css";

function substituteVars(body, vars) {
  return body.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return vars[key.toLowerCase()] ?? match;
  });
}

function previewBody(body) {
  const vars = body.match(/\{\{\w+\}\}/g);
  if (!vars) return null;
  return [...new Set(vars)].join(", ");
}

export function TemplatePicker({ token, conversation, onInsert, onManage }) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const panelRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getTemplates(token)
      .then(setTemplates)
      .catch(() => {})
      .finally(() => setLoading(false));
    setTimeout(() => searchRef.current?.focus(), 80);
  }, [open, token]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    const handleKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const handleSelect = (tpl) => {
    const patientName = conversation?.patientName || "";
    const firstName = patientName.split(" ")[0] || patientName;
    const today = new Date();
    const vars = {
      name: patientName,
      firstname: firstName,
      first_name: firstName,
      phone: conversation?.patientPhone || "",
      date: today.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }),
      time: today.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      today: today.toLocaleDateString([], { month: "short", day: "numeric" }),
    };
    const text = substituteVars(tpl.body, vars);
    onInsert(text);
    setOpen(false);
  };

  const filtered = search.trim()
    ? templates.filter((t) =>
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.body.toLowerCase().includes(search.toLowerCase()))
    : templates;

  return (
    <div className="tpl-picker-wrap" ref={panelRef}>
      <button
        type="button"
        className="tpl-picker-trigger"
        onClick={() => setOpen(!open)}
        title="Insert template"
      >
        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2Z" />
        </svg>
      </button>

      {open && (
        <div className="tpl-picker-panel">
          <div className="tpl-picker-header">
            <span className="tpl-picker-title">Templates</span>
            <button type="button" className="tpl-picker-manage" onClick={() => { setOpen(false); onManage(); }}>
              Manage
            </button>
          </div>

          <div className="tpl-picker-search-row">
            <input
              ref={searchRef}
              className="tpl-picker-search"
              placeholder="Search templates..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="tpl-picker-list">
            {loading && <div className="tpl-picker-empty">Loading...</div>}
            {!loading && filtered.length === 0 && (
              <div className="tpl-picker-empty">
                {templates.length === 0 ? "No templates yet" : "No matches"}
              </div>
            )}
            {filtered.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                className="tpl-picker-item"
                onClick={() => handleSelect(tpl)}
              >
                <div className="tpl-picker-item-name">{tpl.name}</div>
                <div className="tpl-picker-item-body">{tpl.body.slice(0, 80)}{tpl.body.length > 80 ? "..." : ""}</div>
                {previewBody(tpl.body) && (
                  <div className="tpl-picker-item-vars">Variables: {previewBody(tpl.body)}</div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
