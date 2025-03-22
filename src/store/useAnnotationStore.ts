import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  Annotation,
  AnnotationType,
  AnnotationStyle,
} from "../types/annotation";
import { compressData, decompressData, getStorageSize } from "../utils/storageUtils";

interface DocumentState {
  annotations: Annotation[];
  history: Annotation[][];
  currentIndex: number;
}

interface AnnotationState {
  currentDocumentId: string | null;
  documents: Record<string, DocumentState>;
  currentTool: AnnotationType;
  currentStyle: AnnotationStyle;
  currentDrawMode: "continuous" | "shape" | "single";
  selectedAnnotation: Annotation | null;
  selectedAnnotations: Annotation[];
  clipboardAnnotations: Annotation[];
  setCurrentDocument: (documentId: string) => void;
  addAnnotation: (documentId: string, annotation: Annotation) => void;
  updateAnnotation: (documentId: string, annotation: Annotation) => void;
  deleteAnnotation: (documentId: string, annotationId: string) => void;
  importAnnotations: (
    documentId: string,
    annotations: Annotation[],
    mode?: "merge" | "replace"
  ) => void;
  clearAnnotations: (documentId: string) => void;
  setCurrentTool: (tool: AnnotationType) => void;
  setCurrentStyle: (style: Partial<AnnotationStyle>) => void;
  undo: (documentId: string) => void;
  redo: (documentId: string) => void;
  deleteSelectedAnnotation: () => void;
  selectAnnotation: (
    annotation: Annotation | null,
    addToSelection?: boolean
  ) => void;
  clearSelection: () => void;
  deleteSelectedAnnotations: () => void;
  selectAnnotations: (annotations: Annotation[]) => void;
  copySelectedAnnotations: () => number;
  pasteAnnotations: (pageNumber: number) => number;
  bringToFront: (documentId: string, annotationIds: string[]) => void;
  sendToBack: (documentId: string, annotationIds: string[]) => void;
}

export const initialDocumentState = () => ({
  annotations: [],
  history: [[]],
  currentIndex: 0,
});

export const useAnnotationStore = create<AnnotationState>()(
  persist(
    (set, get) => ({
      currentDocumentId: null,
      documents: {},
      currentTool: "select",
      currentStyle: {
        color: "#000000",
        lineWidth: 2,
        opacity: 1,
        circleDiameterMode: false,
      },
      currentDrawMode: "single",
      selectedAnnotation: null,
      selectedAnnotations: [],
      clipboardAnnotations: [],

      setCurrentDocument: (documentId) => {
        set((state) => ({
          currentDocumentId: documentId,
          documents: {
            ...state.documents,
            [documentId]: state.documents[documentId] || initialDocumentState(),
          },
        }));
      },

      addAnnotation: (documentId, annotation) => {
        set((state) => {
          const document = state.documents[documentId] || initialDocumentState();
          const newAnnotations = [...document.annotations, annotation];
          const newHistory = document.history.slice(0, document.currentIndex + 1);
          newHistory.push(newAnnotations);

          // Ensure we save to storage
          const newState = {
            documents: {
              ...state.documents,
              [documentId]: {
                annotations: newAnnotations,
                history: newHistory,
                currentIndex: document.currentIndex + 1,
                timestamp: Date.now(), // Add timestamp for storage management
              },
            },
          };

          // Force storage update
          localStorage.setItem(
            "annotation-storage",
            JSON.stringify({
              state: newState,
              version: 1,
            })
          );

          return newState;
        });
      },

      updateAnnotation: (documentId, annotation) => {
        set((state) => {
          const document =
            state.documents[documentId] || initialDocumentState();
          const newAnnotations = document.annotations.map((a) =>
            a.id === annotation.id ? annotation : a
          );
          const newHistory = document.history.slice(
            0,
            document.currentIndex + 1
          );
          newHistory.push(newAnnotations);

          return {
            documents: {
              ...state.documents,
              [documentId]: {
                annotations: newAnnotations,
                history: newHistory,
                currentIndex: document.currentIndex + 1,
              },
            },
          };
        });
      },

      deleteAnnotation: (documentId, annotationId) => {
        set((state) => {
          const document =
            state.documents[documentId] || initialDocumentState();
          const newAnnotations = document.annotations.filter(
            (a) => a.id !== annotationId
          );
          const newHistory = document.history.slice(
            0,
            document.currentIndex + 1
          );
          newHistory.push(newAnnotations);

          return {
            documents: {
              ...state.documents,
              [documentId]: {
                annotations: newAnnotations,
                history: newHistory,
                currentIndex: document.currentIndex + 1,
              },
            },
          };
        });
      },

      importAnnotations: (documentId, annotations, mode = "merge") =>
        set((state) => {
          const document =
            state.documents[documentId] || initialDocumentState();
          const currentAnnotations = document.annotations;
          const newAnnotations =
            mode === "merge"
              ? [...currentAnnotations, ...annotations]
              : annotations;

          // Create new history entry
          const newHistory = document.history.slice(
            0,
            document.currentIndex + 1
          );
          newHistory.push(newAnnotations);

          return {
            documents: {
              ...state.documents,
              [documentId]: {
                annotations: newAnnotations,
                history: newHistory,
                currentIndex: document.currentIndex + 1,
              },
            },
          };
        }),

      clearAnnotations: (documentId) => {
        set((state) => ({
          documents: {
            ...state.documents,
            [documentId]: initialDocumentState(),
          },
        }));
      },

      setCurrentTool: (tool) => set({ currentTool: tool }),
      setCurrentStyle: (style) =>
        set((state) => ({
          currentStyle: { ...state.currentStyle, ...style },
        })),

      undo: (documentId) => {
        set((state) => {
          const document = state.documents[documentId];
          if (!document || document.currentIndex <= 0) return state;

          return {
            documents: {
              ...state.documents,
              [documentId]: {
                ...document,
                currentIndex: document.currentIndex - 1,
                annotations: document.history[document.currentIndex - 1],
              },
            },
          };
        });
      },
      redo: (documentId) => {
        set((state) => {
          const document = state.documents[documentId];
          if (!document || document.currentIndex >= document.history.length - 1)
            return state;

          return {
            documents: {
              ...state.documents,
              [documentId]: {
                ...document,
                currentIndex: document.currentIndex + 1,
                annotations: document.history[document.currentIndex + 1],
              },
            },
          };
        });
      },

      deleteSelectedAnnotation: () => {
        const { selectedAnnotation, currentDocument } = get();
        if (!selectedAnnotation || !currentDocument) return;

        set((state) => {
          const document = state.documents[currentDocument];
          const newAnnotations = document.annotations.filter(
            (a) => a.id !== selectedAnnotation.id
          );
          const newHistory = document.history.slice(
            0,
            document.currentIndex + 1
          );
          newHistory.push(newAnnotations);

          return {
            selectedAnnotation: null,
            documents: {
              ...state.documents,
              [currentDocument]: {
                annotations: newAnnotations,
                history: newHistory,
                currentIndex: document.currentIndex + 1,
              },
            },
          };
        });
      },

      selectAnnotation: (annotation, addToSelection = false) =>
        set((state) => {
          if (!annotation) {
            return { selectedAnnotations: [] };
          }

          if (addToSelection) {
            const isAlreadySelected = state.selectedAnnotations.some(
              (a) => a.id === annotation.id
            );
            return {
              selectedAnnotations: isAlreadySelected
                ? state.selectedAnnotations.filter(
                    (a) => a.id !== annotation.id
                  )
                : [...state.selectedAnnotations, annotation],
            };
          }

          return { selectedAnnotations: [annotation] };
        }),

      clearSelection: () => set({ selectedAnnotations: [] }),

      deleteSelectedAnnotations: () => {
        const { selectedAnnotations, currentDocument } = get();
        if (!selectedAnnotations.length || !currentDocument) return;

        set((state) => {
          const document = state.documents[currentDocument];
          const newAnnotations = document.annotations.filter(
            (a) => !selectedAnnotations.some((selected) => selected.id === a.id)
          );
          const newHistory = document.history.slice(
            0,
            document.currentIndex + 1
          );
          newHistory.push(newAnnotations);

          return {
            selectedAnnotations: [],
            documents: {
              ...state.documents,
              [currentDocument]: {
                annotations: newAnnotations,
                history: newHistory,
                currentIndex: document.currentIndex + 1,
              },
            },
          };
        });
      },

      selectAnnotations: (annotations: Annotation[]) =>
        set({ selectedAnnotations: annotations }),

      copySelectedAnnotations: () => {
        const { selectedAnnotations } = get();
        if (!selectedAnnotations.length) return 0;

        const copiedAnnotations = selectedAnnotations.map((annotation) => ({
          ...annotation,
          id: `${annotation.id}-copy`,
        }));

        set({ clipboardAnnotations: copiedAnnotations });
        return selectedAnnotations.length;
      },

      pasteAnnotations: (pageNumber: number) => {
        const { clipboardAnnotations, currentDocument } = get();
        if (!clipboardAnnotations.length || !currentDocument) return 0;

        // Create new copies with unique IDs and updated page number
        const newAnnotations = clipboardAnnotations.map((annotation) => ({
          ...annotation,
          id: Date.now() + Math.random().toString(),
          pageNumber,
          timestamp: Date.now(),
          points: annotation.points.map((p) => ({
            x: p.x + 20, // Offset pasted annotations slightly
            y: p.y + 20,
          })),
        }));

        set((state) => {
          const document = state.documents[currentDocument];
          const updatedAnnotations = [
            ...document.annotations,
            ...newAnnotations,
          ];
          const newHistory = document.history.slice(
            0,
            document.currentIndex + 1
          );
          newHistory.push(updatedAnnotations);

          return {
            documents: {
              ...state.documents,
              [currentDocument]: {
                annotations: updatedAnnotations,
                history: newHistory,
                currentIndex: document.currentIndex + 1,
              },
            },
          };
        });

        return clipboardAnnotations.length;
      },

      bringToFront: (documentId, annotationIds) => {
        set((state) => {
          const document = state.documents[documentId];
          if (!document) return state;

          // Filter out the selected annotations and add them to the end
          const otherAnnotations = document.annotations.filter(
            (a) => !annotationIds.includes(a.id)
          );
          const selectedAnnotations = document.annotations.filter((a) =>
            annotationIds.includes(a.id)
          );
          const newAnnotations = [...otherAnnotations, ...selectedAnnotations];

          const newHistory = document.history.slice(0, document.currentIndex + 1);
          newHistory.push(newAnnotations);

          return {
            documents: {
              ...state.documents,
              [documentId]: {
                ...document,
                annotations: newAnnotations,
                history: newHistory,
                currentIndex: document.currentIndex + 1,
              },
            },
          };
        });
      },

      sendToBack: (documentId, annotationIds) => {
        set((state) => {
          const document = state.documents[documentId];
          if (!document) return state;

          // Filter out the selected annotations and add them to the beginning
          const otherAnnotations = document.annotations.filter(
            (a) => !annotationIds.includes(a.id)
          );
          const selectedAnnotations = document.annotations.filter((a) =>
            annotationIds.includes(a.id)
          );
          const newAnnotations = [...selectedAnnotations, ...otherAnnotations];

          const newHistory = document.history.slice(0, document.currentIndex + 1);
          newHistory.push(newAnnotations);

          return {
            documents: {
              ...state.documents,
              [documentId]: {
                ...document,
                annotations: newAnnotations,
                history: newHistory,
                currentIndex: document.currentIndex + 1,
              },
            },
          };
        });
      },
    }),
    {
      name: "annotation-storage",
      storage: createJSONStorage(() => ({
        getItem: (name) => {
          const item = localStorage.getItem(name);
          if (!item) return null;
          
          try {
            const data = JSON.parse(item);
            return decompressData(data);
          } catch (error) {
            console.error('Error loading annotations:', error);
            return null;
          }
        },
        setItem: (name, value) => {
          try {
            const compressed = compressData(value);
            localStorage.setItem(name, JSON.stringify(compressed));
          } catch (error) {
            console.error('Error saving annotations:', error);
          }
        },
        removeItem: (name) => localStorage.removeItem(name),
      })),
      partialize: (state) => ({
        documents: state.documents,
        currentDrawMode: state.currentDrawMode,
      }),
    }
  )
);
