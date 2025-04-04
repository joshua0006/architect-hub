---
Timestamp: 2025-04-04T03:46:00.000Z 
Mode: technical-architect
Event: DESIGN
---

**Context:** Scaling text annotation font size with PDF zoom level in `AnnotationCanvas.tsx`.

**Details:**
Requested modifications to the `drawTextAnnotation` and `drawStickyNoteAnnotation` functions within `src/components/AnnotationCanvas.tsx`. The changes involve:
1.  Calculating a `scaledFontSize` by multiplying the annotation's base font size (from `style.textOptions.fontSize` or a default) by the `scale` prop passed to the canvas.
2.  Using this `scaledFontSize` when setting the canvas context's font (`ctx.font`).
3.  Calculating the `lineHeight` based on the `scaledFontSize`.
4.  Adjusting the `fillText` calls to use the correctly scaled `lineHeight`.
5.  Ensuring text wrapping logic in `drawStickyNoteAnnotation` uses the scaled font size for measurements (achieved by setting `ctx.font` correctly beforehand).

**Rationale:**
To address user feedback and improve the user experience by making text annotations visually resize proportionally when the user zooms in or out of the PDF document, similar to how freehand drawings behave. This maintains the relative size and readability of text annotations at different zoom levels.

**Next Steps:**
Delegate the implementation of these code changes to the `code` mode via a `new_task`.