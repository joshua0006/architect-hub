import {
  DoorOpen,
  Square,
  Flame,
  ArrowUpDown,
  StepForward,
  ShowerHead,
  MousePointer,
  Pencil,
  Highlighter,
  Circle,
  Triangle,
  Star,
  Minus,
  MoveRight,
  MoveHorizontal,
  Type,
  StickyNote,
  CheckCircle2,
  XCircle,
  History
} from "lucide-react";

export const COLORS = [
  "#FF0000", // Red
  "#FF8800", // Orange
  "#00FF00", // Green
  "#0000FF", // Blue
  "#FF00FF", // Pink
  "#00FFFF", // Light Blue
  "#FFFF00", // Yellow
  "#000000", // Black
];

export const LINE_WIDTHS = [1, 2, 3, 4, 5];
export const OPACITY_LEVELS = [0.25, 0.5, 0.75, 1];

// Define keyboard shortcuts first
export const KEYBOARD_SHORTCUTS = {
  tools: {
    select: "S",
    freehand: "P",
    rectangle: "R",
    circle: "C",
    line: "L",
    arrow: "A",
    text: "T",
    highlight: "H",
    approved: "1",
    rejected: "2",
    revision: "3",
  },
  actions: {
    undo: "Ctrl+Z",
    redo: "Ctrl+Y",
    redoAlt: "Ctrl+Shift+Z",
    delete: "Delete",
    selectAll: "Ctrl+A",
    escape: "Esc",
    copy: "Ctrl+C",
    paste: "Ctrl+V",
    cut: "Ctrl+X",
    bringToFront: "Ctrl+]",
    sendToBack: "Ctrl+[",
  },
} as const;

// Then use it in TOOLS
export const TOOLS = {
  basic: [
    {
      tool: "select",
      icon: MousePointer,
      label: "Select",
      shortcut: KEYBOARD_SHORTCUTS.tools.select,
    },
    {
      tool: "freehand",
      icon: Pencil,
      label: "Freehand",
      shortcut: KEYBOARD_SHORTCUTS.tools.freehand,
    },
    {
      tool: "highlight",
      icon: Highlighter,
      label: "Highlight",
      shortcut: KEYBOARD_SHORTCUTS.tools.highlight,
    },
  ],
  shapes: [
    {
      tool: "rectangle",
      icon: Square,
      label: "Rectangle",
      shortcut: KEYBOARD_SHORTCUTS.tools.rectangle,
    },
    {
      tool: "circle",
      icon: Circle,
      label: "Circle",
      shortcut: KEYBOARD_SHORTCUTS.tools.circle,
    },
    { tool: "triangle", icon: Triangle, label: "Triangle" },
    { tool: "star", icon: Star, label: "Star" },
  ],
  lines: [
    {
      tool: "line",
      icon: Minus,
      label: "Line",
      shortcut: KEYBOARD_SHORTCUTS.tools.line,
    },
    {
      tool: "arrow",
      icon: MoveRight,
      label: "Arrow",
      shortcut: KEYBOARD_SHORTCUTS.tools.arrow,
    },
    { tool: "doubleArrow", icon: MoveHorizontal, label: "Double Arrow" },
  ],
  text: [
    {
      tool: "text",
      icon: Type,
      label: "Text",
      shortcut: KEYBOARD_SHORTCUTS.tools.text,
    },
    { tool: "stickyNote", icon: StickyNote, label: "Sticky Note" },
  ],
  stamps: [
    {
      tool: "stampApproved",
      icon: CheckCircle2,
      label: "Approved",
      shortcut: KEYBOARD_SHORTCUTS.tools.approved,
    },
    {
      tool: "stampRejected",
      icon: XCircle,
      label: "Rejected",
      shortcut: KEYBOARD_SHORTCUTS.tools.rejected,
    },
    {
      tool: "stampRevision",
      icon: History,
      label: "Revision",
      shortcut: KEYBOARD_SHORTCUTS.tools.revision,
    },
  ],
  architectural: [
    {
      tool: "door",
      icon: DoorOpen,
      label: "Door",
      rightIcon: DoorOpen,
    },
    {
      tool: "window",
      icon: Square,
      label: "Window",
      rightIcon: Square,
    },
    {
      tool: "fireExit",
      icon: Flame,
      label: "Fire Exit",
      rightIcon: Flame,
    },
    {
      tool: "stairs",
      icon: StepForward,
      label: "Stairs",
      rightIcon: StepForward,
    },
    {
      tool: "elevator",
      icon: ArrowUpDown,
      label: "Elevator",
      rightIcon: ArrowUpDown,
    },
    {
      tool: "toilet",
      icon: ShowerHead,
      label: "Toilet",
      rightIcon: ShowerHead,
    },
  ],
} as const;
