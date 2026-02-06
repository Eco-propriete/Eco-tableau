export type Tool =
  | "select"
  | "hand"
  | "pen"
  | "rectangle"
  | "ellipse"
  | "diamond"
  | "arrow"
  | "text"
  | "sticky"
  | "eraser";

export interface Point {
  x: number;
  y: number;
}

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface WhiteboardElement {
  id: string;
  type:
    | "rectangle"
    | "ellipse"
    | "diamond"
    | "text"
    | "sticky"
    | "pen"
    | "arrow";
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  text?: string;
  points?: Point[];
  fontSize?: number;
  endX?: number;
  endY?: number;
}

export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export interface WhiteboardState {
  elements: WhiteboardElement[];
  selectedIds: string[];
  tool: Tool;
  camera: Camera;
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  fontSize: number;
  history: WhiteboardElement[][];
  historyIndex: number;
  editingTextId: string | null;
}

export type WhiteboardAction =
  | { type: "SET_TOOL"; tool: Tool }
  | { type: "ADD_ELEMENT"; element: WhiteboardElement }
  | { type: "UPDATE_ELEMENT"; id: string; updates: Partial<WhiteboardElement> }
  | { type: "DELETE_ELEMENTS"; ids: string[] }
  | { type: "SET_SELECTED_IDS"; ids: string[] }
  | { type: "SET_CAMERA"; camera: Partial<Camera> }
  | { type: "SET_STROKE_COLOR"; color: string }
  | { type: "SET_FILL_COLOR"; color: string }
  | { type: "SET_STROKE_WIDTH"; width: number }
  | { type: "SET_FONT_SIZE"; size: number }
  | { type: "PUSH_HISTORY" }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "SET_EDITING_TEXT_ID"; id: string | null }
  | { type: "SET_ELEMENTS"; elements: WhiteboardElement[] };

export const STICKY_COLORS = [
  "#FEF3C7",
  "#DBEAFE",
  "#D1FAE5",
  "#FCE7F3",
  "#EDE9FE",
  "#FED7AA",
  "#DC2626",
  "#FCF75E",
  "#E3DAC9",
];

export const STROKE_COLORS = [
  "#1E293B",
  "#FFFFFF",
  "#DC2626",
  "#2563EB",
  "#16A34A",
  "#CA8A04",
  "#9333EA",
  "#EC4899",
  "#F97316",
  "#E2E8F0",
  "#C51E3A",
  "#00B9E8",
  "#0000FF",
  "#D1FAE5",
  "#FCE7F3",
  "#FCF75E",
  "#E3DAC9",
];

/** Default stroke color per theme */
export const DEFAULT_STROKE_LIGHT = "#1E293B";
export const DEFAULT_STROKE_DARK = "#FFFFFF";

export const FILL_COLORS = [
  "transparent",
  "#1E293B",
  "#FFFFFF",
  "#FEF3C7",
  "#DBEAFE",
  "#D1FAE5",
  "#FCE7F3",
  "#EDE9FE",
  "#FED7AA",
  "#E2E8F0",
  "#C51E3A",
  "#00B9E8",
  "#0000FF",
  "#16A34A",
  "#CA8A04",
  "#FCF75E",
  "#E3DAC9",
];
