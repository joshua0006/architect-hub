---
Timestamp: 2025-04-07 12:20:12 UTC
Mode: technical-architect
Event: FIX
---

**Context:** Immediate text annotation creation failing on the first attempt after initial PDF load (Attempt 4).

**Details:**
Previous attempts focusing on timing within `AnnotationCanvas.tsx` did not resolve the issue. This attempt addresses the root cause in the parent `PDFViewer.tsx`. The `isViewerReady` state, which conditionally renders `AnnotationCanvas`, was being set to `true` as soon as the `pdf` object loaded, potentially before the initial page render completed and the `scale` prop stabilized.

The fix involved:
1.  Adding an `initialPageRendered` state variable to `PDFViewer.tsx`.
2.  Modifying the `renderPdfPage` function to set `initialPageRendered` to `true` only after the first successful render promise resolves.
3.  Changing the `useEffect` hook that sets `isViewerReady` to depend on *both* the `pdf` object being loaded *and* `initialPageRendered` being true.

**Rationale:**
This ensures `AnnotationCanvas` is only rendered and considered "ready" after the initial page rendering in `PDFViewer` is complete. This guarantees that the necessary props (like the correctly calculated `scale`) are available when `AnnotationCanvas` mounts and its effects run, preventing the timing issue that caused the first "Add Text" attempt to fail.

---