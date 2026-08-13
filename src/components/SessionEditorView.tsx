import { useStore } from "../store/useStore";
import { MeetingEditor } from "./MeetingEditor";

/**
 * Full-viewport session writing surface — replaces the app chrome when a
 * session route is active (`/person/:id/sessions/:sessionId`, etc.).
 */
export function SessionEditorView() {
  const sessionId = useStore((s) => s.sessionId);
  const closeSession = useStore((s) => s.closeSession);

  if (!sessionId) return null;

  return (
    <div className="session-editor-view">
      <MeetingEditor sessionId={sessionId} onClose={closeSession} />
    </div>
  );
}
