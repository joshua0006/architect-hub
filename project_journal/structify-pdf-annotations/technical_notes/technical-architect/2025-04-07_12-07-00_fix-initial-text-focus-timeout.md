---
Timestamp: 2025-04-07 12:07:00 UTC
Mode: technical-architect
Event: FIX
---

**Context:** Immediate text annotation creation failing on the first attempt after initial PDF load (Attempt 3).

**Details:**
Previous attempts involving readiness checks and `requestAnimationFrame` for the editing state activation did not resolve the issue. This attempt focuses on the timing of focusing the `TextInput` component after the editing state (`isEditingText`) is set.

The `useEffect` hook in `AnnotationCanvas.tsx` (around line 121), responsible for focusing the `TextInput` via `textInputRef.current.focus()`, previously used a 50ms `setTimeout`. This timeout has been increased to 100ms.

**Rationale:**
The hypothesis is that during the complex initial rendering sequence, 50ms might not be sufficient time for the `TextInput` component to be fully rendered and ready to accept focus when the `setTimeout` callback executes. Increasing the delay to 100ms provides more buffer time, potentially resolving the focus issue and allowing the initial "Add Text" action to succeed.

---