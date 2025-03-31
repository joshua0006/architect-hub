export type Point = {
  x: number;
  y: number;
};

export type AnnotationType =
  | "select"
  | "drag"
  | "hand"
  | "freehand"
  | "line"
  | "arrow"
  | "doubleArrow"
  | "rectangle"
  | "circle"
  | "triangle"
  | "star"
  | "text"
  | "stickyNote"
  | "highlight"
  | "stamp"
  | "stampApproved"
  | "stampRejected"
  | "stampRevision"
  | "door"
  | "window"
  | "fireExit"
  | "stairs"
  | "elevator"
  | "toilet"
  | "delete";

export type StampType = "approved" | "rejected" | "revision";

export interface AnnotationStyle {
  color: string;
  lineWidth: number;
  opacity: number;
  text?: string;
  stampType?: StampType;
  circleDiameterMode?: boolean;
  textOptions?: {
    fontSize?: number;
    fontFamily?: string;
    bold?: boolean;
    italic?: boolean;
    text?: string;
  };
}

export interface Annotation {
  id: string;
  type: AnnotationType;
  points: Point[];
  style: AnnotationStyle;
  pageNumber: number;
  text?: string;
  timestamp: number;
  userId: string;
  selected?: boolean;
  version?: number;
}

export interface ToolConfig {
  type: AnnotationType;
  icon: React.ReactNode;
  label: string;
  drawMode: "continuous" | "shape" | "single";
}

export const createAnnotation = (type: AnnotationType): Annotation => {
  const defaultStyles: Record<AnnotationType, AnnotationStyle> = {
    select: { color: "#000000", lineWidth: 2, opacity: 1 },
    drag: { color: "#000000", lineWidth: 2, opacity: 1 },
    hand: { color: "#000000", lineWidth: 2, opacity: 1 },
    freehand: { color: "#000000", lineWidth: 2, opacity: 1 },
    line: { color: "#000000", lineWidth: 2, opacity: 1 },
    arrow: { color: "#000000", lineWidth: 2, opacity: 1 },
    doubleArrow: { color: "#000000", lineWidth: 2, opacity: 1 },
    rectangle: { color: "#000000", lineWidth: 2, opacity: 1 },
    circle: { color: "#000000", lineWidth: 2, opacity: 1, circleDiameterMode: false },
    triangle: { color: "#000000", lineWidth: 2, opacity: 1 },
    star: { color: "#000000", lineWidth: 2, opacity: 1 },
    text: { color: "#000000", lineWidth: 2, opacity: 1 },
    stickyNote: { color: "#FFD700", lineWidth: 2, opacity: 1 },
    highlight: { color: "#FFFF00", lineWidth: 12, opacity: 0.3 },
    stamp: { color: "#000000", lineWidth: 2, opacity: 1, stampType: "approved" },
    stampApproved: { color: "#00AA00", lineWidth: 2, opacity: 1, stampType: "approved" },
    stampRejected: { color: "#FF0000", lineWidth: 2, opacity: 1, stampType: "rejected" },
    stampRevision: { color: "#0000FF", lineWidth: 2, opacity: 1, stampType: "revision" },
    door: { color: "#000000", lineWidth: 2, opacity: 1 },
    window: { color: "#0000FF", lineWidth: 2, opacity: 1 },
    fireExit: { color: "#FF0000", lineWidth: 2, opacity: 1 },
    stairs: { color: "#000000", lineWidth: 2, opacity: 1 },
    elevator: { color: "#0000FF", lineWidth: 2, opacity: 1 },
    toilet: { color: "#00FF00", lineWidth: 2, opacity: 1 },
    delete: { color: "#FF0000", lineWidth: 2, opacity: 1 }
  };

  return {
    id: Date.now().toString(),
    type,
    points: [],
    style: defaultStyles[type] || {
      color: "#000000",
      lineWidth: 2,
      opacity: 1,
    },
    pageNumber: 1,
    timestamp: Date.now(),
    userId: "current-user",
    version: 1,
  };
};
