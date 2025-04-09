---
Timestamp: 2025-04-09 02:32:00 UTC
Mode: technical-architect
Event: INFO
---

**Context:** Performance optimization for PDF annotation tool selection in `AnnotationCanvas.tsx`.

**Details:**
Identified that changing the selected annotation tool caused an unnecessary re-render of the PDF canvas. This was traced back to a `useEffect` hook (lines 1432-1436 in `src/components/AnnotationCanvas.tsx` before the change) that cleared the `selectedAnnotations` state whenever the `currentTool` changed. This state change triggered a cascade leading to the re-render.

**Action Taken:**
Delegated the task of commenting out the problematic `useEffect` hook to the `code` mode. The `code` mode successfully applied the change on 2025-04-09.

**Rationale:**
Commenting out this hook prevents the selection state from changing merely due to tool selection, thus eliminating the unnecessary re-render and improving UI responsiveness.

**Next Steps:**
None. The issue is resolved.

---