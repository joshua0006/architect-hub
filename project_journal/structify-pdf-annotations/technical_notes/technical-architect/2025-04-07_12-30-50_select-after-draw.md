---
Timestamp: 2025-04-07 12:30:50 UTC
Mode: technical-architect
Event: DESIGN
---

**Context:** User interaction flow after creating drawing annotations (shapes, lines, etc.).

**Details:**
Modified the behavior in `AnnotationCanvas.tsx` for drawing tools (e.g., rectangle, circle, line, arrow, freehand). Previously, after drawing an annotation and releasing the mouse, the tool remained active. Now, upon mouse release (completing the draw):
1. The newly created annotation is added to the store (existing behavior).
2. The newly created annotation is automatically selected (`store.selectAnnotation(newAnnotation)`).
3. The active tool is switched back to 'select' mode (`store.setCurrentTool('select')`).

This change was implemented within the `handleMouseUp` function in `AnnotationCanvas.tsx`.

**Rationale:**
This change addresses user feedback requesting a more streamlined workflow. Automatically selecting the new annotation and switching to select mode allows users to immediately move, resize, or style the annotation they just created without needing to manually switch tools and re-select the object.

---