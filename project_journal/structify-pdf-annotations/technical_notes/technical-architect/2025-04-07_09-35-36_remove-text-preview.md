---
Timestamp: 2025-04-07 09:35:36 UTC
Mode: technical-architect
Event: DESIGN
---

**Context:** Text annotation behavior in `src/components/AnnotationCanvas.tsx`.

**Details:**
Removed the redundant text tool preview drawing code (lines 576-613). The `handleMouseDown` function already implements the desired behavior of creating the text annotation immediately upon click and activating editing. This change aligns the visual feedback with the actual interaction flow.

**Rationale:**
The preview was unnecessary and potentially confusing since the annotation is created instantly on mouse down, not after mouse up or drag. Removing it simplifies the code and improves the user experience for text annotations.

---