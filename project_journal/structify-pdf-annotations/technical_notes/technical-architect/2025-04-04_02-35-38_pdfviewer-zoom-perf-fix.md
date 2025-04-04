---
Timestamp: 2025-04-04 02:35:38 UTC
Mode: technical-architect
Event: DESIGN
---

**Context:** Analysis of `src/components/PDFViewer.tsx` performance issues related to rapid zooming and annotation scaling.

**Details:**

**Identified Issues:**

1.  **Rapid Zooming Performance:**
    *   Direct `scale` state updates on every zoom event (click, wheel) trigger frequent re-renders and effect executions.
    *   Coordination between rapid scale updates, `renderPdfPage` calls, caching, and scroll adjustments (`setTimeout`) appears prone to race conditions, leading to visual glitches ("splattered" rendering, duplication).
    *   Aggressive clearing of render/cache state on scale change (lines 716-721) might hinder performance during zoom sequences.

2.  **Annotation Scaling:**
    *   Annotations are misplaced or incorrectly scaled during/after zooming.
    *   Potential causes: Synchronization issues between PDF canvas and `AnnotationCanvas` rendering, or incorrect scaling logic within `src/utils/drawingUtils.ts::drawAnnotation` (for points and text attributes).

**Proposed Solutions:**

1.  **Debounce Scale Updates:**
    *   Apply debouncing (e.g., 100-150ms) to `setScale` calls within `handleZoomIn`, `handleZoomOut`, and the `handleWheel` zoom logic in `PDFViewer.tsx`. This groups rapid inputs, reducing render churn.

2.  **Optimize Render Pipeline on Scale Change:**
    *   Remove the `useEffect` hook (lines 716-721) that clears render/cache state based *only* on scale changes. Let the cache handle scale variations.
    *   Ensure the `useEffect` hook reacting to scale (lines 2034-2057) is triggered by the *debounced* scale. Focus this hook on coordinating the PDF canvas re-render (`renderPdfPage`). Rely on React prop propagation (`scale`) for `AnnotationCanvas` updates.

3.  **Ensure Correct Annotation Scaling:**
    *   **Verify `AnnotationCanvas.tsx`:** Confirm it correctly uses its `scale` prop for rendering and passes the accurate scale to drawing functions.
    *   **Review `drawingUtils.ts::drawAnnotation`:** Critically examine this function to ensure it accurately scales all geometric points (lines, shapes, text positions) and text attributes (font size) based on the provided `scale` factor. Pay close attention to text annotations.

**Next Steps:**

*   Delegate implementation of these code changes to the `code` mode.
*   Review the changes made by the `code` mode.
*   Test the PDF viewer focusing on rapid zoom scenarios and annotation behavior at various zoom levels.
---

---
Timestamp: 2025-04-04 02:45:30 UTC
Mode: technical-architect
Event: DESIGN_UPDATE
---

**Context:** User feedback indicates that the initial debounce delay (150ms) introduced for scale updates resulted in laggy/delayed zoom behavior.

**Details:**
The 150ms debounce delay, while preventing rendering glitches, negatively impacted the perceived responsiveness of the zoom interaction.

**Proposed Adjustment:**
Reduce the debounce delay for `debouncedSetScale` in `src/components/PDFViewer.tsx` to a shorter value (e.g., 50-75ms) to improve responsiveness while still mitigating rapid re-render issues.

**Next Steps:**
*   Delegate implementation of the debounce delay adjustment to the `code` mode.
*   Test zoom responsiveness after the change.
---
---
Timestamp: 2025-04-04 02:47:55 UTC
Mode: technical-architect
Event: DESIGN_UPDATE
---

**Context:** User provided an image showing persistent "splattered" text rendering artifacts even after adjusting the debounce delay to 75ms. This indicates the root cause is likely within the rendering pipeline itself, not just the frequency of scale updates.

**Details:**
The rendering issue manifests as fragmented or duplicated text on the canvas, suggesting incomplete or overlapping render operations.

**Proposed Adjustments:**

1.  **Explicit Canvas Clearing:** Add `ctx.clearRect(0, 0, canvas.width, canvas.height)` at the beginning of the rendering logic within `renderPdfPage` (before `page.render` is called) to ensure a clean canvas for each render.
2.  **Strengthen Render Cancellation:** Review and potentially enhance the logic in `renderPdfPage` and navigation handlers (`handlePrevPage`, `handleNextPage`) that cancels the existing `renderTaskRef.current.promise`. Ensure cancellation is reliably awaited or handled to prevent overlap with new render calls. Consider adding checks around `renderTaskRef.current?.cancel()` to ensure the task exists and has a cancel method.
3.  **Simplify Quality Scaling (Diagnostic):** Temporarily comment out or disable the `qualityMultiplier` logic (lines ~436-438 and ~534-545 in the original code) within `renderPdfPage`. Render the page directly using the current `scale` state (`page.getViewport({ scale })`). This will help determine if the dynamic quality adjustment contributes to the rendering artifacts.

**Next Steps:**
*   Delegate implementation of these code changes (canvas clearing, cancellation review, temporary quality scaling removal) to the `code` mode.
*   Test zoom and rendering stability after the changes. If removing the quality multiplier fixes the issue, further investigation into refining that logic will be needed.
---
---
Timestamp: 2025-04-04 02:51:22 UTC
Mode: technical-architect
Event: DESIGN_UPDATE
---

**Context:** User feedback and image confirm that the "splattered" text rendering issue persists even with zoom buttons, canvas clearing, robust cancellation, and disabled quality scaling. The 75ms debounce on `setScale` did not resolve it.

**Details:**
The issue likely stems from a race condition or synchronization problem between `scale` state updates, the asynchronous nature of the `usePDFPage` hook providing the `page` object, and the triggering of `renderPdfPage`.

**Proposed Adjustments (Revised Debounce Strategy):**

1.  **Revert Scale Debounce:** Remove the `debouncedSetScale` usage in `PDFViewer.tsx`. Let zoom handlers update the `scale` state directly for immediate UI feedback.
2.  **Debounce Render Trigger:** Modify the `useEffect` hook in `PDFViewer.tsx` that depends on `scale` (and potentially `page`). Instead of calling `renderPdfPage` directly, wrap the call within a debounce function (e.g., 75ms delay). This will trigger the render only after the scale (and potentially the page object) has stabilized.
3.  **Maintain Fixes:** Keep the explicit `ctx.clearRect` and robust render cancellation logic from the previous iteration.
4.  **Maintain Diagnostic:** Keep the `qualityMultiplier` logic disabled for now.

**Rationale:**
This approach prioritizes immediate state updates for responsiveness but delays the potentially expensive/sensitive render operation until inputs settle, aiming to prevent race conditions during rendering.

**Next Steps:**
*   Delegate implementation of reverting scale debounce and adding debounce to the render trigger in the effect hook to the `code` mode.
*   Test zoom stability (buttons and wheel) after the changes.
---

---
Timestamp: 2025-04-04 02:56:39 UTC
Mode: technical-architect
Event: DESIGN_UPDATE
---

**Context:** The "splattered" text rendering issue persists even with the revised strategy of immediate scale updates and a debounced render trigger (75ms).

**Details:**
This indicates a likely race condition or synchronization issue deeper within the rendering pipeline, potentially related to how the asynchronous `page` object from `usePDFPage` interacts with `scale`/`currentPage` state changes and the `renderPdfPage` execution.

**Proposed Adjustments (Refined Triggering Logic):**

1.  **Stable `renderPdfPage`:** Ensure `renderPdfPage` is wrapped in `useCallback` with only its stable dependencies (refs, utility functions, `documentId`, etc.). It should read `currentPage` and `scale` state directly when executed, not have them in its `useCallback` dependency array.
2.  **Debounced Render Call:** Maintain the `debouncedRenderPdfPage` function created via `useCallback(debounce(renderPdfPage, 75), [renderPdfPage])`.
3.  **Refined `useEffect` Trigger:** The primary `useEffect` hook that calls `debouncedRenderPdfPage` *must* include `debouncedRenderPdfPage`, `page` (from `usePDFPage`), `scale`, and `currentPage` in its dependency array. This ensures the debounced render is correctly re-scheduled whenever these key inputs change.
4.  **Maintain Fixes:** Keep explicit `ctx.clearRect` and robust render cancellation logic.
5.  **Maintain Diagnostic:** Keep the `qualityMultiplier` logic disabled.

**Rationale:**
By making `renderPdfPage` stable via `useCallback` (excluding volatile state like `scale`/`currentPage` from its deps) and ensuring the `useEffect` trigger correctly depends on `page`, `scale`, and `currentPage`, we aim to guarantee that the debounced call, when it executes, uses the stable render function which reads the *latest* state values, avoiding stale data during rendering.

**Next Steps:**
*   Delegate implementation of refining the `useCallback` dependencies for `renderPdfPage` and the `useEffect` trigger dependencies to the `code` mode.
*   Test zoom stability rigorously.
---