import { useState, useEffect, useRef } from "react";
import { getTemplates, createTemplate, updateTemplate, deleteTemplate } from "../utils/api";
import "./TemplateManager.css";

const VARIABLE_HINTS = [
  { var: "{{name}}", desc: "Patient full name" },
  { var: "{{firstname}}", desc: "Patient first name" },
  { var: "{{phone}}", desc: "Patient phone" },
  { var: "{{date}}", desc: "Today's date" },
  { var: "{{time}}", desc: "Current time" },
];

function TemplateForm({ initial, onSave, onCancel, saving, error }) {
  const [name, setName] = useState(initial?.name || "");
  const [body, setBody] = useState(initial?.body || "");
  const nameRef = useRef(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  const insertVar = (v) => {
    setBody((prev) => prev + v);
  };

  return (
    <div className="tmgr-form">
      {error && <div className="tmgr-error">{error}</div>}
      <label className="tmgr-field">
        <span>Template Name</span>
        <input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Appointment Reminder" />
      </label>
      <label className="tmgr-field">
        <span>Message Body</span>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Hi {{name}}, your appointment is on {{date}}..." />
      </label>
      <div className="tmgr-var-hints">
        {VARIABLE_HINTS.map((v) => (
          <button key={v.var} type="button" className="tmgr-var-chip" onClick={() => insertVar(v.var)} title={v.desc}>
            {v.var}
          </button>
        ))}
      </div>
      <div className="tmgr-form-actions">
        <button type="button" className="tmgr-btn tmgr-btn-secondary" onClick={onCancel}>Cancel</button>
        <button
          type="button"
          className="tmgr-btn tmgr-btn-primary"
          disabled={saving || !name.trim() || !body.trim()}
          onClick={() => onSave({ name: name.trim(), body: body.trim() })}
        >
          {saving ? "Saving..." : initial ? "Save Changes" : "Create Template"}
        </button>
      </div>
    </div>
  );
}

export function TemplateManager({ token, onClose }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("list");
  const [editTpl, setEditTpl] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    try {
      const data = await getTemplates(token);
      setTemplates(data);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async (data) => {
    setSaving(true);
    setFormError("");
    try {
      if (editTpl) {
        await updateTemplate(token, editTpl.id, data);
      } else {
        await createTemplate(token, data);
      }
      setView("list");
      setEditTpl(null);
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await deleteTemplate(token, deleteId);
      setDeleteId(null);
      await load();
    } catch { /* ignore */ } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="tmgr-backdrop" onClick={onClose}>
      <div className="tmgr-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tmgr-header">
          <h2>{view === "list" ? "Message Templates" : editTpl ? "Edit Template" : "New Template"}</h2>
          <button type="button" className="tmgr-close" onClick={onClose}>&times;</button>
        </div>

        {view === "list" && (
          <>
            <div className="tmgr-toolbar">
              <span className="tmgr-count">{templates.length} template{templates.length !== 1 ? "s" : ""}</span>
              <button type="button" className="tmgr-btn tmgr-btn-primary" onClick={() => { setEditTpl(null); setFormError(""); setView("form"); }}>
                + New Template
              </button>
            </div>

            <div className="tmgr-list">
              {loading && <div className="tmgr-empty">Loading...</div>}
              {!loading && templates.length === 0 && (
                <div className="tmgr-empty">No templates yet. Create one to get started.</div>
              )}
              {templates.map((tpl) => (
                <div key={tpl.id} className="tmgr-list-item">
                  <div className="tmgr-list-item-info">
                    <div className="tmgr-list-item-name">{tpl.name}</div>
                    <div className="tmgr-list-item-body">{tpl.body.slice(0, 100)}{tpl.body.length > 100 ? "..." : ""}</div>
                  </div>
                  <div className="tmgr-list-item-actions">
                    <button type="button" className="tmgr-btn tmgr-btn-sm" onClick={() => { setEditTpl(tpl); setFormError(""); setView("form"); }}>Edit</button>
                    <button type="button" className="tmgr-btn tmgr-btn-sm tmgr-btn-danger" onClick={() => setDeleteId(tpl.id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {view === "form" && (
          <TemplateForm
            initial={editTpl}
            onSave={handleSave}
            onCancel={() => { setView("list"); setEditTpl(null); }}
            saving={saving}
            error={formError}
          />
        )}

        {deleteId && (
          <div className="tmgr-delete-overlay">
            <div className="tmgr-delete-box">
              <p>Delete this template?</p>
              <div className="tmgr-form-actions">
                <button type="button" className="tmgr-btn tmgr-btn-secondary" onClick={() => setDeleteId(null)}>Cancel</button>
                <button type="button" className="tmgr-btn tmgr-btn-danger" onClick={handleDelete} disabled={deleting}>
                  {deleting ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
