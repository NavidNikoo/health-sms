import "./EmptyState.css";

export function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-state-icon" />
      <h2 className="empty-state-title">No conversation selected</h2>
      <p className="empty-state-text">
        Get started by messaging or calling a phone number.
      </p>
      <button
        type="button"
        className="empty-state-button"
        onClick={() => {
          // placeholder for future \"start conversation\" action
        }}
      >
        + Start a conversation
      </button>
    </div>
  );
}

