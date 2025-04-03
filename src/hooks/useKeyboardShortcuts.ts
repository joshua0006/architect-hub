import { useEffect, useRef } from "react";
import { useAnnotationStore } from "../store/useAnnotationStore";
import { AnnotationType } from "../types/annotation";
import { useToast } from "../contexts/ToastContext";

interface ShortcutConfig {
  action: () => void;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
}

interface ShortcutMap {
  [key: string]: ShortcutConfig | ShortcutConfig[];
}

export const useKeyboardShortcuts = (
  documentId: string,
  currentPage: number,
  zoomInFn?: () => void,
  zoomOutFn?: () => void,
  resetZoomFn?: () => void
) => {
  const {
    setCurrentTool,
    undo,
    redo,
    deleteSelectedAnnotations,
    selectAnnotation,
    clearSelection,
    selectAnnotations,
    documents,
    copySelectedAnnotations,
    pasteAnnotations,
    bringToFront,
    sendToBack,
    clipboardAnnotations,
    selectedAnnotations
  } = useAnnotationStore();
  const { showToast } = useToast();

  const lastToolRef = useRef<string>("select");

  useEffect(() => {
    const shortcuts: ShortcutMap = {
      z: [
        {
          action: () => undo(documentId),
          ctrl: true,
        },
        {
          action: () => redo(documentId),
          ctrl: true,
          shift: true,
        },
      ],
      y: {
        action: () => redo(documentId),
        ctrl: true,
      },
      v: {
        action: () => {
          if (clipboardAnnotations.length === 0) {
            showToast("No annotations to paste");
            return;
          }

          const pastedCount = pasteAnnotations(currentPage);
          
          showToast(
            `${pastedCount} annotation${
              pastedCount > 1 ? "s" : ""
            } pasted`
          );
        },
        ctrl: true,
      },
      s: {
        action: () => setCurrentTool("select"),
      },
      d: {
        action: () => setCurrentTool("drag"),
      },
      p: {
        action: () => setCurrentTool("freehand"),
      },
      r: {
        action: () => setCurrentTool("rectangle"),
      },
      c: [
        {
          action: () => {
            const count = copySelectedAnnotations();
            if (count) {
              showToast(`${count} annotation${count > 1 ? "s" : ""} copied`);
            }
          },
          ctrl: true,
        },
        {
          action: () => setCurrentTool("circle"),
        },
      ],
      l: {
        action: () => setCurrentTool("line"),
      },
      a: [
        {
          action: () => {
            const document = documents[documentId];
            if (document) {
              selectAnnotations(
                document.annotations.filter((a) => a.pageNumber === currentPage)
              );
            }
          },
          ctrl: true,
        },
        {
          action: () => setCurrentTool("arrow"),
        },
      ],
      // t: {
      //   action: () => setCurrentTool("text"),
      // },
      h: {
        action: () => setCurrentTool("highlight"),
      },
      "1": {
        action: () => setCurrentTool("stampApproved"),
      },
      "2": {
        action: () => setCurrentTool("stampRejected"),
      },
      "3": {
        action: () => setCurrentTool("stampRevision"),
      },
      Delete: {
        action: deleteSelectedAnnotations,
      },
      Backspace: {
        action: deleteSelectedAnnotations,
      },
      Escape: {
        action: () => {
          clearSelection();
          setCurrentTool("select");
        },
      },
      x: {
        action: () => {
          const count = copySelectedAnnotations();
          if (count) {
            showToast(`${count} annotation${count > 1 ? "s" : ""} cut`);
            deleteSelectedAnnotations();
          }
        },
        ctrl: true,
      },
      "]": {
        action: () => {
          if (selectedAnnotations.length) {
            bringToFront(
              documentId,
              selectedAnnotations.map((a) => a.id)
            );
          }
        },
        ctrl: true,
      },
      "[": {
        action: () => {
          if (selectedAnnotations.length) {
            sendToBack(
              documentId,
              selectedAnnotations.map((a) => a.id)
            );
          }
        },
        ctrl: true,
      },
      "=": {
        action: () => {
          if (zoomInFn) zoomInFn();
        },
        ctrl: true,
      },
      "+": {
        action: () => {
          if (zoomInFn) zoomInFn();
        },
        ctrl: true,
      },
      "-": {
        action: () => {
          if (zoomOutFn) zoomOutFn();
        },
        ctrl: true,
      },
      "0": {
        action: () => {
          if (resetZoomFn) resetZoomFn();
        },
        ctrl: true,
      },
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      const shortcut = shortcuts[key];

      if (!shortcut) return;

      if (Array.isArray(shortcut)) {
        const matchingShortcut = shortcut.find((s) => {
          const ctrlMatch = !s.ctrl || (s.ctrl && (e.ctrlKey || e.metaKey));
          const shiftMatch = !s.shift || (s.shift && e.shiftKey);
          const altMatch = !s.alt || (s.alt && e.altKey);
          return ctrlMatch && shiftMatch && altMatch;
        });

        if (matchingShortcut) {
          e.preventDefault();
          matchingShortcut.action();
        }
      } else {
        const ctrlMatch =
          !shortcut.ctrl || (shortcut.ctrl && (e.ctrlKey || e.metaKey));
        const shiftMatch = !shortcut.shift || (shortcut.shift && e.shiftKey);
        const altMatch = !shortcut.alt || (shortcut.alt && e.altKey);

        if (ctrlMatch && shiftMatch && altMatch) {
          e.preventDefault();
          shortcut.action();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    documentId,
    currentPage,
    setCurrentTool,
    undo,
    redo,
    deleteSelectedAnnotations,
    clearSelection,
    selectAnnotations,
    documents,
    copySelectedAnnotations,
    pasteAnnotations,
    showToast,
    bringToFront,
    sendToBack,
    clipboardAnnotations,
    selectedAnnotations,
    zoomInFn,
    zoomOutFn,
    resetZoomFn
  ]);
};
