---
Timestamp: 2025-04-04 05:48:00 UTC
Mode: technical-architect
Event: DESIGN_UPDATE
---

**Context:** User feedback indicates zoom buttons still cause rendering issues ("messed up the pdf") and requests the behavior exactly follow the mouse scroll zoom mechanism.

**Analysis:**
- Mouse wheel zoom (`handleWheel`) updates the `scale` state and adjusts scroll, relying on the state change to *implicitly* trigger rendering via hook dependencies (`usePDFPage`, etc.).
- Button zoom (`handleZoomIn`/`handleZoomOut`) updates the `scale` state, adjusts scroll, but also *explicitly* called `debouncedRenderPdfPage()` previously.
- This explicit render call in the button handlers differed from the wheel handler and might have caused redundant or conflicting render triggers, leading to the observed issues.

**Proposed Adjustment:**
- Remove the explicit calls to `debouncedRenderPdfPage()` from within `handleZoomIn` (line ~981) and `handleZoomOut` (line ~1028). (Implemented by `code` mode).

**Rationale:**
By removing the explicit render trigger from the button handlers, they will now rely solely on the `setScale` state update to implicitly trigger rendering via hook dependencies. This makes the rendering trigger mechanism identical to the mouse wheel zoom, which should resolve the conflicting render issues.

**Next Steps:**
- Code change completed by `code` mode.
- User to re-test the zoom button behavior after the fix is applied.

---