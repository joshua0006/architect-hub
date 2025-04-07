---
Timestamp: 2025-04-07 11:55:00 UTC
Mode: technical-architect
Event: FIX
---

**Context:** Immediate text annotation creation failing on the first attempt after initial PDF load.

**Details:**
Addressed an issue where clicking "Add Text" immediately after the PDF viewer loaded would not display the text annotation, although subsequent clicks worked. The root cause was a timing issue: the `useEffect` hook in `AnnotationCanvas.tsx` responsible for activating the editing state (`annotationToEditImmediately`) was firing before the canvas was fully ready or before it received the correct `scale` prop from `PDFViewer`.

The fix involved modifying this `useEffect` hook (around line 1345) to add readiness checks:
- It now verifies that `canvasRef.current` exists.
- It now verifies that the `scale` prop is greater than 0.
- `scale` was added to the dependency array.

These checks prevent the editing activation logic from running prematurely with incomplete or incorrect state, ensuring the first attempt works reliably.

**Rationale:**
This fix improves the robustness of the immediate text annotation feature, ensuring it works consistently even immediately after the initial component rendering and state propagation.

---