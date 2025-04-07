---
Timestamp: 2025-04-07 12:01:09 UTC
Mode: technical-architect
Event: FIX
---

**Context:** Immediate text annotation creation failing on the first attempt after initial PDF load (Attempt 2).

**Details:**
The previous fix (adding readiness checks to the `useEffect` hook in `AnnotationCanvas.tsx`) did not resolve the issue. The first attempt to add text immediately after load still failed.

This attempt refines the `useEffect` hook (around line 1345) further:
1.  A local state variable `forceRenderKey` was added to `AnnotationCanvas`.
2.  The logic within the `useEffect` hook that activates the editing state (`setEditingAnnotation`, `setTextInputPosition`, etc.) and resets the store trigger (`setAnnotationToEditImmediately`) is now wrapped in `requestAnimationFrame`. This defers execution until the next browser paint cycle, allowing potentially pending state updates (like `scale`) to complete.
3.  The direct `render()` call was replaced with an update to the `forceRenderKey` state (`setForceRenderKey(prev => prev + 1)`), providing a more standard React mechanism to ensure a re-render occurs after the state changes are queued.

**Rationale:**
This approach aims to resolve potential race conditions during initial component load by ensuring the editing state activation happens after the browser has had a chance to process pending updates and paint the initial frame. Using a state update for re-rendering is generally more reliable than manual render calls.

---