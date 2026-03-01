import { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { useAuth } from "../context/AuthContext";
import { getPhoneNumbers } from "../utils/api";

export function AppShell({ children }) {
  const { token } = useAuth();
  const [inboxes, setInboxes] = useState([]);

  const loadInboxes = () => {
    if (token) getPhoneNumbers(token).then(setInboxes).catch(() => {});
  };

  useEffect(loadInboxes, [token]);

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <Sidebar
        inboxes={inboxes}
        selectedInboxId={null}
        onSelectInbox={() => {}}
        totalUnread={0}
      />
      <main style={{ flex: 1, overflow: "auto" }}>
        {children}
      </main>
    </div>
  );
}
