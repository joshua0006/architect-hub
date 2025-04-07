---
Timestamp: 2025-04-07 10:36:47 UTC
Mode: technical-architect
Event: DESIGN
---

**Context:** User interaction flow for creating text annotations via the toolbar.

**Details:**
Modified the workflow to enable immediate creation and editing of text annotations directly from the toolbar. Clicking the "Add Text" button now performs the following actions:
1. Creates a new text annotation object with default text ("Text") at a fixed default position (100,100) on the current page.
2. Adds the annotation to the `useAnnotationStore`.
3. Triggers an immediate editing state for this new annotation within `AnnotationCanvas`.
4. Switches the active tool back to 'select'.

This eliminates the previous two-step process (click toolbar button, then click canvas).

Implementation involved:
- Adding `annotationToEditImmediately` state and `setAnnotationToEditImmediately` action to `useAnnotationStore`.
- Modifying the `handleClick` function in `ToolButton.tsx` for the 'text' tool to orchestrate the creation, state trigger, and tool switch.
- Adding a `useEffect` hook in `AnnotationCanvas.tsx` to listen for `annotationToEditImmediately` and activate the `TextInput` component accordingly.

**Rationale:**
This change addresses user feedback requesting a more direct way to add text annotations. It streamlines the user experience by reducing the required clicks from two to one, making the feature faster and more intuitive.

**Next Steps (Optional):**
- Consider allowing the user to configure the default position or behavior in settings.
- Evaluate if this immediate creation pattern should apply to other tools (e.g., sticky notes).

---