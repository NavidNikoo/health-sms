# Demo Scenarios

## Pre-demo checklist

- Backend API is running and reachable from the frontend.
- Frontend app is running and you are logged into the correct account.
- At least one inbox number is connected on the `Numbers` page.
- For call demos, a forwarding number is set and saved in `Dialer` call settings.
- Twilio Console `Messaging Logs` is open in another tab for quick verification.
- If 10DLC is still pending/rejected, use the fallback script in Scenario 3.

## Scenario 1: New number -> first outbound send -> inbound reply

Goal: show the core messaging workflow from setup to conversation.

1. Open `Numbers` and click `+ Add Number`.
2. Choose either:
   - `I need a new number`, or
   - `Connect a Twilio number`.
3. Confirm the number appears under `Your Numbers`.
4. Go to `Inbox`, select the new inbox, and click `+ New`.
5. Create a conversation with a test recipient number.
6. Send a first message.
7. Show message status in the thread:
   - `Sending...` while request is in flight.
   - `Not sent` + `Retry` if it fails.
8. Reply from the external phone and show inbound delivery in the same thread.

Demo note:
- If outbound to US is blocked by 10DLC, explain that inbound still works and show Scenario 3.

## Scenario 2: Two inboxes (US + CA) and context switching

Goal: show multi-number workflow for a clinic with multiple lines.

1. Open `Numbers` and verify two connected numbers (for example, `Main Inbox` + `Canada Office`).
2. Open `Inbox`.
3. Click inbox A in the sidebar and show only its conversations.
4. Click inbox B and show context switch to its separate conversations.
5. Start a new conversation from inbox B and show that it stays scoped to that inbox.
6. Return to inbox A and confirm history remains independent.

Demo note:
- Mention that staff can segment lines by office, team, or workflow.

## Scenario 3: Failed send path and troubleshooting UX

Goal: show reliability and transparent error handling when carrier/compliance blocks sending.

1. In `Inbox`, open a conversation and send an outbound message expected to fail.
2. Show the failed bubble state:
   - `Not sent` status
   - `Retry` button
3. Click `Retry` and show the app attempting delivery again.
4. Use the `Debug Info` panel (Inbox/Numbers) to show:
   - Selected E.164 number
   - Provider SID
   - Twilio credential/base URL state
5. Open Twilio `Messaging Logs` and match the error code (example: `30034`).
6. Explain user-facing fallback:
   - Inbound can still arrive.
   - Outbound US SMS requires approved 10DLC.

## Optional call demo add-on

1. Open `Dialer`.
2. Select inbox number and verify forwarding target in `Call Settings`.
3. Dial a test number and click call.
4. Show state transition:
   - `Calling your forwarding phone...`
   - Ringing/bridge state
5. If misconfigured, show friendly error copy and immediate fix in settings.
