---
Timestamp: 2025-04-07 11:06:55 UTC
Mode: technical-architect
Event: FIX
---

**Context:** Text annotation font size consistency between display and editing modes.

**Details:**
Addressed an issue where the font size of text annotations appeared smaller during editing in the `TextInput` component compared to when displayed on the `AnnotationCanvas`. The root cause was that `AnnotationCanvas` scaled the font size based on the current zoom level (`scale`), while `TextInput` used the base font size without scaling.

The fix involved modifying the inline styles within `TextInput.tsx` to multiply the `fontSize` and `lineHeight` by the `scale` prop, aligning its rendering with the canvas.

**Rationale:**
Ensuring visual consistency between display and editing modes improves the user experience and predictability of the text annotation tool, especially at different zoom levels.

---