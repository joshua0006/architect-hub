---
Timestamp: 2025-04-07 12:24:50 UTC
Mode: technical-architect
Event: DESIGN
---

**Context:** Interaction design for applying styles from the toolbar.

**Details:**
Modified the behavior of the style controls (color, line width, opacity) in `Toolbar.tsx`. Previously, these controls only set the style for *future* annotations. Now, they also apply the selected style directly to any currently selected annotation(s) on the canvas.

The `onClick` handlers for each style control were updated to:
1. Check if `selectedAnnotations.length > 0`.
2. If annotations are selected, iterate through them and call `store.updateAnnotation` for each, merging the new style property (e.g., `{ color: newColor }`) into the annotation's existing `style` object.
3. Continue to call `store.setCurrentStyle` to maintain the behavior of setting the default style for subsequent annotations.

**Rationale:**
This change addresses user feedback requesting a more intuitive way to modify the style of existing annotations. It aligns the toolbar's behavior with common expectations from drawing/editing applications, where style palettes typically affect the current selection.

---