"use client";

import React, { useRef, useCallback, useEffect, useState } from "react";
import { useWhiteboard } from "@/hooks/use-whiteboard";
import type {
  Point,
  WhiteboardElement,
  ResizeHandle,
} from "@/lib/whiteboard-types";
import { STICKY_COLORS } from "@/lib/whiteboard-types";
import { resolveThemeColor, useTheme } from "@/hooks/use-theme";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function generateId() {
  return Math.random().toString(36).substring(2, 15);
}

// Offscreen canvas for text measurement
let _measureCtx: CanvasRenderingContext2D | null = null;
function getMeasureCtx() {
  if (!_measureCtx) {
    const c = document.createElement("canvas");
    _measureCtx = c.getContext("2d");
  }
  return _measureCtx!;
}

function measureTextBounds(el: WhiteboardElement) {
  const ctx = getMeasureCtx();
  const fontSize = el.fontSize ?? 16;
  ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
  const lines = (el.text ?? "").split("\n");
  const lineH = fontSize * 1.4;
  let maxW = 0;
  for (const line of lines) {
    maxW = Math.max(maxW, ctx.measureText(line).width);
  }
  return {
    x: el.x,
    y: el.y,
    width: Math.max(maxW + 8, 40),
    height: Math.max(lines.length * lineH, lineH),
  };
}

export function getElementBounds(el: WhiteboardElement) {
  if (el.element_type === "pen" && el.points && el.points.length > 0) {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const p of el.points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }
  if (el.element_type === "arrow") {
    const minX = Math.min(el.x, el.endX ?? el.x);
    const minY = Math.min(el.y, el.endY ?? el.y);
    const maxX = Math.max(el.x, el.endX ?? el.x);
    const maxY = Math.max(el.y, el.endY ?? el.y);
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }
  if (el.element_type === "text") {
    return measureTextBounds(el);
  }
  return { x: el.x, y: el.y, width: el.width, height: el.height };
}

function distToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function isPointInElement(
  px: number,
  py: number,
  el: WhiteboardElement,
): boolean {
  // Pen: check distance to each line segment of the path
  if (el.element_type === "pen" && el.points && el.points.length > 1) {
    const hitDist = Math.max(el.strokeWidth * 2, 12);
    for (let i = 1; i < el.points.length; i++) {
      const p0 = el.points[i - 1];
      const p1 = el.points[i];
      if (distToSegment(px, py, p0.x, p0.y, p1.x, p1.y) < hitDist) return true;
    }
    return false;
  }

  // Arrow: check distance to the line
  if (el.element_type === "arrow") {
    const ex = el.endX ?? el.x;
    const ey = el.endY ?? el.y;
    const hitDist = Math.max(el.strokeWidth * 2, 12);
    return distToSegment(px, py, el.x, el.y, ex, ey) < hitDist;
  }

  // Text: use measured bounds
  if (el.element_type === "text") {
    const bounds = getElementBounds(el);
    const padding = 6;
    return (
      px >= bounds.x - padding &&
      px <= bounds.x + bounds.width + padding &&
      py >= bounds.y - padding &&
      py <= bounds.y + bounds.height + padding
    );
  }

  // Default bounding box test for shapes / sticky
  const bounds = getElementBounds(el);
  const padding = 4;
  return (
    px >= bounds.x - padding &&
    px <= bounds.x + bounds.width + padding &&
    py >= bounds.y - padding &&
    py <= bounds.y + bounds.height + padding
  );
}

const HANDLE_SIZE = 8;
const HANDLE_HIT_SIZE = 12;

function getHandlePositions(bounds: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const { x, y, width, height } = bounds;
  const pad = 6;
  return {
    nw: { x: x - pad, y: y - pad },
    n: { x: x + width / 2, y: y - pad },
    ne: { x: x + width + pad, y: y - pad },
    e: { x: x + width + pad, y: y + height / 2 },
    se: { x: x + width + pad, y: y + height + pad },
    s: { x: x + width / 2, y: y + height + pad },
    sw: { x: x - pad, y: y + height + pad },
    w: { x: x - pad, y: y + height / 2 },
  };
}

function hitTestHandle(
  px: number,
  py: number,
  handles: Record<ResizeHandle, Point>,
): ResizeHandle | null {
  const entries = Object.entries(handles) as [ResizeHandle, Point][];
  for (const [handle, pos] of entries) {
    if (
      Math.abs(px - pos.x) <= HANDLE_HIT_SIZE &&
      Math.abs(py - pos.y) <= HANDLE_HIT_SIZE
    ) {
      return handle;
    }
  }
  return null;
}

function getHandleCursor(handle: ResizeHandle): string {
  const cursorMap: Record<ResizeHandle, string> = {
    nw: "nwse-resize",
    n: "ns-resize",
    ne: "nesw-resize",
    e: "ew-resize",
    se: "nwse-resize",
    s: "ns-resize",
    sw: "nesw-resize",
    w: "ew-resize",
  };
  return cursorMap[handle];
}

// Get connection points for an element
export function getConnectionPoints(bounds: {
  x: number;
  y: number;
  width: number;
  height: number;
}): Record<"top" | "right" | "bottom" | "left", Point> {
  const { x, y, width, height } = bounds;
  return {
    top: { x: x + width / 2, y: y },
    right: { x: x + width, y: y + height / 2 },
    bottom: { x: x + width / 2, y: y + height },
    left: { x: x, y: y + height / 2 },
  };
}

// Check if point is near a connection handle
function hitTestConnectionPoint(
  px: number,
  py: number,
  points: Record<"top" | "right" | "bottom" | "left", Point>,
  hitRadius: number = 8,
): "top" | "right" | "bottom" | "left" | null {
  const handles: ("top" | "right" | "bottom" | "left")[] = [
    "top",
    "right",
    "bottom",
    "left",
  ];
  for (const handle of handles) {
    const point = points[handle];
    const dist = Math.hypot(px - point.x, py - point.y);
    if (dist <= hitRadius) {
      return handle;
    }
  }
  return null;
}

interface ResizeState {
  handle: ResizeHandle;
  elementId: string;
  startBounds: { x: number; y: number; width: number; height: number };
  startPoint: Point;
  startFontSize?: number;
}

export interface Connection {
  id: string;
  sourceId: string;
  targetId: string;
  sourceHandle?: "top" | "right" | "bottom" | "left";
  targetHandle?: "top" | "right" | "bottom" | "left";
}

interface ConnectionPoint {
  elementId: string;
  handle: "top" | "right" | "bottom" | "left";
  x: number;
  y: number;
}

interface CanvasProps {
  broadcastCursor?: (x: number, y: number) => void;
  roomId?: string | null;
  params: { id: string };
}

export function Canvas({ broadcastCursor, roomId, params }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const {
    state,
    dispatch,
    addElement,
    updateElement,
    setSelectedIds,
    setCamera,
    pushHistory,
    screenToCanvas,
  } = useWhiteboard();
  const router = useRouter();
  const [boardId] = useState(params.id);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [unsavedElementIds, setUnsavedElementIds] = useState<Set<string>>(
    new Set(),
  );
  const [deletedElementIds, setDeletedElementIds] = useState<Set<string>>(
    new Set(),
  );
  const [connections, setConnections] = useState<Connection[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStart, setConnectionStart] =
    useState<ConnectionPoint | null>(null);
  const [connectionPreview, setConnectionPreview] = useState<Point | null>(
    null,
  );
  const [hoveredConnectionPoint, setHoveredConnectionPoint] =
    useState<ConnectionPoint | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [currentElement, setCurrentElement] =
    useState<WhiteboardElement | null>(null);
  const [moveStart, setMoveStart] = useState<Point | null>(null);
  const [moveElementStart, setMoveElementStart] = useState<Map<string, Point>>(
    new Map(),
  );
  const [textInputPos, setTextInputPos] = useState<{
    x: number;
    y: number;
    id: string;
  } | null>(null);
  const [stickyColorIndex, setStickyColorIndex] = useState(0);
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const [hoveredHandle, setHoveredHandle] = useState<ResizeHandle | null>(null);
  const [moveElementStartData, setMoveElementStartData] = useState<
    Map<string, Point[]>
  >(new Map());
  const [moveElementStartArrow, setMoveElementStartArrow] = useState<
    Map<string, { endX: number; endY: number }>
  >(new Map());

  // Load elements from Supabase on mount
  useEffect(() => {
    async function loadBoard() {
      if (!boardId || boardId === "undefined") {
        console.error("Invalid boardId:", boardId);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const supabase = createClient();

        console.log("Loading elements for board:", boardId);

        const { data: elementData, error } = await supabase
          .from("canvas_elements")
          .select("*")
          .eq("board_id", boardId)
          .order("z_index", { ascending: true });

        if (error) {
          console.error("Error loading elements:", error);
          setIsLoading(false);
          return;
        }

        console.log("Raw data from Supabase:", elementData);

        if (elementData && elementData.length > 0) {
          // Convert database elements to WhiteboardElements
          const whiteboardElements: WhiteboardElement[] = elementData.map(
            (elem: any) => {
              let content;
              try {
                content = elem.content ? JSON.parse(elem.content) : {};
              } catch (e) {
                console.error("Error parsing content for element:", elem.id, e);
                content = {};
              }

              return {
                id: elem.id,
                element_type: elem.element_type,
                x: elem.x,
                y: elem.y,
                width: elem.width,
                height: elem.height,
                fill: elem.fill_color || "transparent",
                stroke: elem.color,
                strokeWidth: elem.stroke_width,
                opacity: content.opacity ?? 1,
                text: content.text,
                fontSize: content.fontSize,
                points: content.points,
                endX: content.endX,
                endY: content.endY,
              };
            },
          );

          console.log(
            "✅ Loaded elements from Supabase:",
            whiteboardElements.length,
            "elements",
          );
          console.log("Elements:", whiteboardElements);

          // Clear any existing elements first, then set new ones
          dispatch({ type: "SET_ELEMENTS", elements: whiteboardElements });

          // Load connections
          const { data: connectionsData, error: connectionsError } =
            await supabase
              .from("canvas_connections")
              .select("*")
              .eq("board_id", boardId);

          if (
            !connectionsError &&
            connectionsData &&
            connectionsData.length > 0
          ) {
            const loadedConnections: Connection[] = connectionsData.map(
              (conn: any) => ({
                id: conn.id,
                sourceId: conn.source_id,
                targetId: conn.target_id,
                sourceHandle: conn.source_handle as
                  | "top"
                  | "right"
                  | "bottom"
                  | "left",
                targetHandle: conn.target_handle as
                  | "top"
                  | "right"
                  | "bottom"
                  | "left",
              }),
            );
            setConnections(loadedConnections);
            console.log(
              "✅ Loaded connections from Supabase:",
              loadedConnections.length,
              "connections",
            );
          }
        } else {
          console.log("ℹ️ No elements found for board:", boardId);
          dispatch({ type: "SET_ELEMENTS", elements: [] });
        }
      } catch (err) {
        console.error("Error in loadBoard:", err);
      } finally {
        setIsLoading(false);
      }
    }

    loadBoard();
  }, [boardId, dispatch]);

  // Debug: Log when state.elements changes
  useEffect(() => {
    console.log(
      "📊 State updated - Current elements count:",
      state.elements.length,
    );
    if (state.elements.length > 0) {
      console.log("📊 Elements in state:", state.elements);
    }
  }, [state.elements]);

  // Mark element as modified (not saved yet)
  const markElementAsUnsaved = useCallback((elementId: string) => {
    setUnsavedElementIds((prev) => new Set([...prev, elementId]));
    setHasUnsavedChanges(true);
  }, []);

  // Mark element for deletion (not deleted yet)
  const markElementAsDeleted = useCallback((elementIds: string[]) => {
    setDeletedElementIds((prev) => new Set([...prev, ...elementIds]));
    setHasUnsavedChanges(true);
  }, []);

  function generateUUID() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      },
    );
  }
  // Save all unsaved changes to Supabase
  const saveAllChanges = useCallback(async () => {
    if (!boardId || boardId === "undefined") {
      console.error("Cannot save: Invalid boardId");
      return;
    }

    setIsSaving(true);
    const supabase = createClient();

    try {
      // 1. Delete removed elements
      if (deletedElementIds.size > 0) {
        const idsToDelete = Array.from(deletedElementIds);
        console.log("🗑️ Deleting elements:", idsToDelete);

        const { error: deleteError } = await supabase
          .from("canvas_elements")
          .delete()
          .in("id", idsToDelete);

        if (deleteError) {
          console.error("❌ Error deleting elements:", deleteError);
        } else {
          console.log("✅ Elements deleted successfully");
          setDeletedElementIds(new Set());
        }
      }

      // 2. Save/update modified elements
      if (unsavedElementIds.size > 0) {
        const elementsToSave = state.elements.filter((el) =>
          unsavedElementIds.has(el.id),
        );

        console.log("💾 Saving elements:", elementsToSave.length);

        const canvasElements = elementsToSave.map((element, index) => ({
          id: generateUUID(),
          board_id: boardId,
          element_type: element.element_type,
          x: element.x,
          y: element.y,
          width: element.width,
          height: element.height,
          rotation: 0,
          color: element.stroke,
          stroke_width: element.strokeWidth,
          fill_color: element.fill !== "transparent" ? element.fill : null,
          content: JSON.stringify({
            text: element.text,
            fontSize: element.fontSize,
            points: element.points,
            endX: element.endX,
            endY: element.endY,
            opacity: element.opacity,
          }),
          z_index: state.elements.findIndex((el) => el.id === element.id),
        }));

        const { error: upsertError } = await supabase
          .from("canvas_elements")
          .upsert(canvasElements, {
            onConflict: "id",
            ignoreDuplicates: false,
          });

        if (upsertError) {
          console.error("❌ Error saving elements:", upsertError);
          throw upsertError;
        } else {
          console.log("✅ All elements saved successfully!");
          setUnsavedElementIds(new Set());
        }
      }

      // 3. Save connections
      if (connections.length > 0) {
        console.log("🔗 Saving connections:", connections.length);

        // First, delete all existing connections for this board
        await supabase
          .from("canvas_connections")
          .delete()
          .eq("board_id", boardId);

        // Then insert all current connections
        const connectionsToSave = connections.map((conn) => ({
          id: generateUUID(),
          board_id: boardId,
          source_id: conn.sourceId,
          target_id: conn.targetId,
          source_handle: conn.sourceHandle,
          target_handle: conn.targetHandle,
        }));

        console.log("Connexions à sauvegarder:", connectionsToSave);

        const { error: connectionsError } = await supabase
          .from("canvas_connections")
          .insert(connectionsToSave);

        if (connectionsError) {
          console.error("❌ Error saving connections:", connectionsError);
        } else {
          console.log("✅ Connections saved successfully!");
        }
      }

      setHasUnsavedChanges(false);

      // Show success message
      alert("✅ Modifications sauvegardées avec succès !");
    } catch (error) {
      console.error("Error saving changes:", error);
      alert("❌ Erreur lors de la sauvegarde. Vérifiez la console.");
    } finally {
      setIsSaving(false);
    }
  }, [
    boardId,
    state.elements,
    unsavedElementIds,
    deletedElementIds,
    connections,
  ]);

  // Draw everything
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = canvas.offsetHeight * dpr;
    ctx.scale(dpr, dpr);

    const { camera } = state;

    // Clear
    ctx.fillStyle = resolveThemeColor("--canvas-bg");
    ctx.fillRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);

    // Grid
    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.zoom, camera.zoom);

    const gridSize = 40;
    const startX =
      Math.floor(-camera.x / camera.zoom / gridSize) * gridSize - gridSize;
    const startY =
      Math.floor(-camera.y / camera.zoom / gridSize) * gridSize - gridSize;
    const endX = startX + canvas.offsetWidth / camera.zoom + gridSize * 2;
    const endY = startY + canvas.offsetHeight / camera.zoom + gridSize * 2;

    ctx.strokeStyle = resolveThemeColor("--canvas-grid");
    ctx.lineWidth = 1 / camera.zoom;
    ctx.beginPath();
    for (let x = startX; x <= endX; x += gridSize) {
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
    }
    for (let y = startY; y <= endY; y += gridSize) {
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
    }
    ctx.stroke();

    // Draw connections first (behind elements)
    drawConnections(ctx);

    // Draw elements
    for (const el of state.elements) {
      drawElement(ctx, el, state.selectedIds.includes(el.id));
    }

    // Draw current element being created
    if (currentElement) {
      drawElement(ctx, currentElement, false);
    }

    ctx.restore();
  }, [
    state,
    currentElement,
    theme,
    connections,
    isConnecting,
    connectionStart,
    connectionPreview,
    hoveredConnectionPoint,
    isDragging,
  ]);

  function drawElement(
    ctx: CanvasRenderingContext2D,
    el: WhiteboardElement,
    isSelected: boolean,
  ) {
    ctx.save();
    ctx.globalAlpha = el.opacity;

    switch (el.element_type) {
      case "rectangle":
        if (el.fill !== "transparent") {
          ctx.fillStyle = el.fill;
          ctx.fillRect(el.x, el.y, el.width, el.height);
        }
        ctx.strokeStyle = el.stroke;
        ctx.lineWidth = el.strokeWidth;
        ctx.strokeRect(el.x, el.y, el.width, el.height);
        break;

      case "ellipse":
        ctx.beginPath();
        ctx.ellipse(
          el.x + el.width / 2,
          el.y + el.height / 2,
          Math.abs(el.width / 2),
          Math.abs(el.height / 2),
          0,
          0,
          Math.PI * 2,
        );
        if (el.fill !== "transparent") {
          ctx.fillStyle = el.fill;
          ctx.fill();
        }
        ctx.strokeStyle = el.stroke;
        ctx.lineWidth = el.strokeWidth;
        ctx.stroke();
        break;

      case "diamond": {
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        ctx.beginPath();
        ctx.moveTo(cx, el.y);
        ctx.lineTo(el.x + el.width, cy);
        ctx.lineTo(cx, el.y + el.height);
        ctx.lineTo(el.x, cy);
        ctx.closePath();
        if (el.fill !== "transparent") {
          ctx.fillStyle = el.fill;
          ctx.fill();
        }
        ctx.strokeStyle = el.stroke;
        ctx.lineWidth = el.strokeWidth;
        ctx.stroke();
        break;
      }

      case "pen":
        if (el.points && el.points.length > 1) {
          ctx.beginPath();
          ctx.strokeStyle = el.stroke;
          ctx.lineWidth = el.strokeWidth;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          //ctx.moveTo(el.points[0].x, el.points[0].y);
          for (let i = 1; i < el.points.length; i++) {
            const p0 = el.points[i - 1];
            const p1 = el.points[i];
            const midX = (p0.x + p1.x) / 2;
            const midY = (p0.y + p1.y) / 2;
            ctx.quadraticCurveTo(p0.x, p0.y, midX, midY);
          }
          ctx.stroke();
        }
        break;

      case "arrow": {
        const startX = el.x;
        const startY = el.y;
        const endX = el.endX ?? el.x;
        const endY = el.endY ?? el.y;

        ctx.beginPath();
        ctx.strokeStyle = el.stroke;
        ctx.lineWidth = el.strokeWidth;
        ctx.lineCap = "round";
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        const angle = Math.atan2(endY - startY, endX - startX);
        const headLen = 14;
        ctx.beginPath();
        ctx.fillStyle = el.stroke;
        ctx.moveTo(endX, endY);
        ctx.lineTo(
          endX - headLen * Math.cos(angle - Math.PI / 6),
          endY - headLen * Math.sin(angle - Math.PI / 6),
        );
        ctx.lineTo(
          endX - headLen * Math.cos(angle + Math.PI / 6),
          endY - headLen * Math.sin(angle + Math.PI / 6),
        );
        ctx.closePath();
        ctx.fill();
        break;
      }

      case "text":
        ctx.font = `${el.fontSize ?? 16}px Inter, system-ui, sans-serif`;
        ctx.fillStyle = el.stroke;
        ctx.textBaseline = "top";
        const textLines = (el.text ?? "").split("\n");
        const lineH = (el.fontSize ?? 16) * 1.4;
        for (let i = 0; i < textLines.length; i++) {
          ctx.fillText(textLines[i], el.x, el.y + i * lineH);
        }
        break;

      case "sticky": {
        const radius = 8;
        const sx = el.x;
        const sy = el.y;
        const sw = el.width;
        const sh = el.height;

        ctx.shadowColor = "rgba(0,0,0,0.08)";
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 4;

        ctx.beginPath();
        ctx.moveTo(sx + radius, sy);
        ctx.lineTo(sx + sw - radius, sy);
        ctx.arcTo(sx + sw, sy, sx + sw, sy + radius, radius);
        ctx.lineTo(sx + sw, sy + sh - radius);
        ctx.arcTo(sx + sw, sy + sh, sx + sw - radius, sy + sh, radius);
        ctx.lineTo(sx + radius, sy + sh);
        ctx.arcTo(sx, sy + sh, sx, sy + sh - radius, radius);
        ctx.lineTo(sx, sy + radius);
        ctx.arcTo(sx, sy, sx + radius, sy, radius);
        ctx.closePath();
        ctx.fillStyle = el.fill;
        ctx.fill();

        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;

        if (el.text) {
          ctx.font = `${el.fontSize ?? 14}px Inter, system-ui, sans-serif`;
          ctx.fillStyle = resolveThemeColor("--canvas-text");
          ctx.textBaseline = "top";
          const maxWidth = sw - 20;
          const words = el.text.split(" ");
          let line = "";
          let ly = sy + 14;
          const sLineH = (el.fontSize ?? 14) * 1.4;
          for (const word of words) {
            const testLine = line + (line ? " " : "") + word;
            if (ctx.measureText(testLine).width > maxWidth && line) {
              ctx.fillText(line, sx + 10, ly);
              line = word;
              ly += sLineH;
            } else {
              line = testLine;
            }
          }
          ctx.fillText(line, sx + 10, ly);
        }
        break;
      }
    }

    // Draw connection points on all elements (always visible like React Flow handles)
    const bounds = getElementBounds(el);
    const connPoints = getConnectionPoints(bounds);

    // Draw connection handles
    for (const [handle, point] of Object.entries(connPoints)) {
      const isHovered =
        hoveredConnectionPoint?.elementId === el.id &&
        hoveredConnectionPoint?.handle === handle;
      const isConnecting =
        connectionStart?.elementId === el.id &&
        connectionStart?.handle === handle;

      ctx.beginPath();
      ctx.arc(
        point.x,
        point.y,
        isHovered || isConnecting ? 7 : 5,
        0,
        Math.PI * 2,
      );

      if (isConnecting) {
        ctx.fillStyle = "#3b82f6";
        ctx.strokeStyle = "#2563eb";
      } else if (isHovered) {
        ctx.fillStyle = "#60a5fa";
        ctx.strokeStyle = "#3b82f6";
      } else {
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#94a3b8";
      }

      ctx.fill();
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Selection outline + resize handles
    if (isSelected) {
      const bounds = getElementBounds(el);
      ctx.strokeStyle = "#2563EB";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(
        bounds.x - 6,
        bounds.y - 6,
        bounds.width + 12,
        bounds.height + 12,
      );
      ctx.setLineDash([]);

      // 8 resize handles: corners + sides
      const handles = getHandlePositions(bounds);
      const allHandles = Object.entries(handles) as [ResizeHandle, Point][];

      for (const [key, pos] of allHandles) {
        const isCorner = ["nw", "ne", "se", "sw"].includes(key);
        const size = isCorner ? HANDLE_SIZE : HANDLE_SIZE - 2;

        ctx.fillStyle = resolveThemeColor("--card");
        ctx.strokeStyle = "#2563EB";
        ctx.lineWidth = 2;

        if (isCorner) {
          ctx.fillRect(pos.x - size / 2, pos.y - size / 2, size, size);
          ctx.strokeRect(pos.x - size / 2, pos.y - size / 2, size, size);
        } else {
          // Side handles are slightly smaller rounded rects
          const r = 2;
          const hx = pos.x - size / 2;
          const hy = pos.y - size / 2;
          ctx.beginPath();
          ctx.moveTo(hx + r, hy);
          ctx.lineTo(hx + size - r, hy);
          ctx.arcTo(hx + size, hy, hx + size, hy + r, r);
          ctx.lineTo(hx + size, hy + size - r);
          ctx.arcTo(hx + size, hy + size, hx + size - r, hy + size, r);
          ctx.lineTo(hx + r, hy + size);
          ctx.arcTo(hx, hy + size, hx, hy + size - r, r);
          ctx.lineTo(hx, hy + r);
          ctx.arcTo(hx, hy, hx + r, hy, r);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }
    }

    ctx.restore();
  }

  // Draw connections between elements
  function drawConnections(ctx: CanvasRenderingContext2D) {
    for (const conn of connections) {
      const sourceEl = state.elements.find((el) => el.id === conn.sourceId);
      const targetEl = state.elements.find((el) => el.id === conn.targetId);

      if (!sourceEl || !targetEl) continue;

      const sourceBounds = getElementBounds(sourceEl);
      const targetBounds = getElementBounds(targetEl);
      const sourcePoints = getConnectionPoints(sourceBounds);
      const targetPoints = getConnectionPoints(targetBounds);

      const start = sourcePoints[conn.sourceHandle || "right"];
      const end = targetPoints[conn.targetHandle || "left"];

      // Draw curved connection line
      ctx.beginPath();
      ctx.strokeStyle = "#64748b";
      ctx.lineWidth = 2;

      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const distance = Math.hypot(dx, dy);
      const controlOffset = Math.min(distance * 0.5, 100);

      // Determine control points based on handles
      let cp1x = start.x;
      let cp1y = start.y;
      let cp2x = end.x;
      let cp2y = end.y;

      if (conn.sourceHandle === "right") cp1x += controlOffset;
      if (conn.sourceHandle === "left") cp1x -= controlOffset;
      if (conn.sourceHandle === "top") cp1y -= controlOffset;
      if (conn.sourceHandle === "bottom") cp1y += controlOffset;

      if (conn.targetHandle === "right") cp2x += controlOffset;
      if (conn.targetHandle === "left") cp2x -= controlOffset;
      if (conn.targetHandle === "top") cp2y -= controlOffset;
      if (conn.targetHandle === "bottom") cp2y += controlOffset;

      ctx.moveTo(start.x, start.y);
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, end.x, end.y);
      ctx.stroke();

      // Draw arrow at end
      const angle = Math.atan2(end.y - cp2y, end.x - cp2x);
      const headLen = 10;
      ctx.beginPath();
      ctx.fillStyle = "#64748b";
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(
        end.x - headLen * Math.cos(angle - Math.PI / 6),
        end.y - headLen * Math.sin(angle - Math.PI / 6),
      );
      ctx.lineTo(
        end.x - headLen * Math.cos(angle + Math.PI / 6),
        end.y - headLen * Math.sin(angle + Math.PI / 6),
      );
      ctx.closePath();
      ctx.fill();
    }

    // Draw connection preview
    if (isConnecting && connectionStart) {
      const sourceEl = state.elements.find(
        (el) => el.id === connectionStart.elementId,
      );
      if (sourceEl) {
        const sourceBounds = getElementBounds(sourceEl);
        const sourcePoints = getConnectionPoints(sourceBounds);
        const start = sourcePoints[connectionStart.handle];

        // If hovering over a target point, snap to it
        const end = hoveredConnectionPoint
          ? { x: hoveredConnectionPoint.x, y: hoveredConnectionPoint.y }
          : connectionPreview || start;

        // Draw preview line with same styling as real connections
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const distance = Math.hypot(dx, dy);
        const controlOffset = Math.min(distance * 0.5, 100);

        let cp1x = start.x;
        let cp1y = start.y;
        let cp2x = end.x;
        let cp2y = end.y;

        if (connectionStart.handle === "right") cp1x += controlOffset;
        if (connectionStart.handle === "left") cp1x -= controlOffset;
        if (connectionStart.handle === "top") cp1y -= controlOffset;
        if (connectionStart.handle === "bottom") cp1y += controlOffset;

        if (hoveredConnectionPoint) {
          if (hoveredConnectionPoint.handle === "right") cp2x += controlOffset;
          if (hoveredConnectionPoint.handle === "left") cp2x -= controlOffset;
          if (hoveredConnectionPoint.handle === "top") cp2y -= controlOffset;
          if (hoveredConnectionPoint.handle === "bottom") cp2y += controlOffset;
        }

        ctx.beginPath();
        ctx.strokeStyle = hoveredConnectionPoint ? "#22c55e" : "#3b82f6";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.moveTo(start.x, start.y);
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, end.x, end.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw arrow head if we have a valid target
        if (hoveredConnectionPoint || connectionPreview) {
          const angle = Math.atan2(end.y - cp2y, end.x - cp2x);
          const headLen = 10;
          ctx.beginPath();
          ctx.fillStyle = hoveredConnectionPoint ? "#22c55e" : "#3b82f6";
          ctx.moveTo(end.x, end.y);
          ctx.lineTo(
            end.x - headLen * Math.cos(angle - Math.PI / 6),
            end.y - headLen * Math.sin(angle - Math.PI / 6),
          );
          ctx.lineTo(
            end.x - headLen * Math.cos(angle + Math.PI / 6),
            end.y - headLen * Math.sin(angle + Math.PI / 6),
          );
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }

  // Animation loop
  useEffect(() => {
    let animId: number;
    const loop = () => {
      draw();
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [draw]);

  // Resize canvas
  useEffect(() => {
    const resizeObserver = new ResizeObserver(() => draw());
    if (containerRef.current) resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [draw]);

  // Wheel event handler with passive: false
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheelEvent = (e: WheelEvent) => {
      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const delta = -e.deltaY * 0.001;
        const newZoom = Math.max(
          0.1,
          Math.min(5, state.camera.zoom * (1 + delta)),
        );
        const scale = newZoom / state.camera.zoom;

        setCamera({
          zoom: newZoom,
          x: mouseX - (mouseX - state.camera.x) * scale,
          y: mouseY - (mouseY - state.camera.y) * scale,
        });
      } else {
        setCamera({
          x: state.camera.x - e.deltaX,
          y: state.camera.y - e.deltaY,
        });
      }
    };

    canvas.addEventListener("wheel", handleWheelEvent, { passive: false });

    return () => {
      canvas.removeEventListener("wheel", handleWheelEvent);
    };
  }, [state.camera, setCamera]);

  // Mouse handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const canvasPoint = screenToCanvas(screenX, screenY);

      if (state.tool === "hand" || e.button === 1) {
        setIsPanning(true);
        setDragStart({ x: e.clientX, y: e.clientY });
        return;
      }

      if (e.altKey || e.button === 1) {
        setIsPanning(true);
        setDragStart({ x: e.clientX, y: e.clientY });
        return;
      }

      if (state.tool === "select") {
        // Check if clicking on a connection point to start connecting (no need for Shift)
        for (const el of state.elements) {
          const bounds = getElementBounds(el);
          const connPoints = getConnectionPoints(bounds);
          const handle = hitTestConnectionPoint(
            canvasPoint.x,
            canvasPoint.y,
            connPoints,
            10,
          );
          if (handle) {
            e.preventDefault();
            setIsConnecting(true);
            setConnectionStart({
              elementId: el.id,
              handle,
              x: connPoints[handle].x,
              y: connPoints[handle].y,
            });
            setConnectionPreview(canvasPoint);
            console.log("🔗 Starting connection from", el.id, handle);
            return;
          }
        }

        // First, check if clicking on a resize handle of the currently selected element
        if (state.selectedIds.length === 1) {
          const selectedEl = state.elements.find(
            (el) => el.id === state.selectedIds[0],
          );
          if (selectedEl) {
            const bounds = getElementBounds(selectedEl);
            const handles = getHandlePositions(bounds);
            const handle = hitTestHandle(canvasPoint.x, canvasPoint.y, handles);
            if (handle) {
              // Start resizing
              setResizeState({
                handle,
                elementId: selectedEl.id,
                startBounds: { ...bounds },
                startPoint: { ...canvasPoint },
                startFontSize: selectedEl.fontSize,
              });
              setIsDragging(true);
              return;
            }
          }
        }

        // Check for clicks on existing elements (reverse order for top element)
        for (let i = state.elements.length - 1; i >= 0; i--) {
          const el = state.elements[i];
          if (isPointInElement(canvasPoint.x, canvasPoint.y, el)) {
            setSelectedIds([el.id]);
            setIsDragging(true);
            setMoveStart(canvasPoint);
            const starts = new Map<string, Point>();
            starts.set(el.id, { x: el.x, y: el.y });
            setMoveElementStart(starts);

            // Store original points for pen elements
            if (el.element_type === "pen" && el.points) {
              const origPoints = el.points.map((p) => ({ ...p }));
              const dataMap = new Map<string, Point[]>();
              dataMap.set(el.id, origPoints);
              setMoveElementStartData(dataMap);
            }

            // Store original arrow endpoints for arrow elements
            if (el.element_type === "arrow") {
              const arrowMap = new Map<
                string,
                { endX: number; endY: number }
              >();
              arrowMap.set(el.id, {
                endX: el.endX ?? el.x,
                endY: el.endY ?? el.y,
              });
              setMoveElementStartArrow(arrowMap);
            }

            return;
          }
        }
        setSelectedIds([]);
        return;
      }

      if (state.tool === "eraser") {
        for (let i = state.elements.length - 1; i >= 0; i--) {
          const el = state.elements[i];
          if (isPointInElement(canvasPoint.x, canvasPoint.y, el)) {
            pushHistory();
            dispatch({ type: "DELETE_ELEMENTS", ids: [el.id] });
            markElementAsDeleted([el.id]);
            return;
          }
        }
        return;
      }

      if (state.tool === "text") {
        const id = generateUUID();
        const newEl: WhiteboardElement = {
          id,
          element_type: "text",
          x: canvasPoint.x,
          y: canvasPoint.y,
          width: 200,
          height: 30,
          fill: "transparent",
          stroke: state.strokeColor,
          strokeWidth: state.strokeWidth,
          opacity: 1,
          text: "",
          fontSize: state.fontSize,
        };
        pushHistory();
        addElement(newEl);
        setTextInputPos({ x: e.clientX, y: e.clientY, id });
        dispatch({ type: "SET_EDITING_TEXT_ID", id });
        return;
      }

      if (state.tool === "sticky") {
        const id = generateUUID();
        const colorIdx = stickyColorIndex % STICKY_COLORS.length;
        const newEl: WhiteboardElement = {
          id,
          element_type: "sticky",
          x: canvasPoint.x - 75,
          y: canvasPoint.y - 75,
          width: 150,
          height: 150,
          fill: STICKY_COLORS[colorIdx],
          stroke: resolveThemeColor("--canvas-text"),
          strokeWidth: 0,
          opacity: 1,
          text: "",
          fontSize: 14,
        };
        setStickyColorIndex(colorIdx + 1);
        pushHistory();
        addElement(newEl);
        setTextInputPos({ x: e.clientX - 75, y: e.clientY - 75, id });
        dispatch({ type: "SET_EDITING_TEXT_ID", id });
        return;
      }

      // Start drawing shapes / pen / arrow
      setIsDragging(true);
      setDragStart(canvasPoint);

      if (state.tool === "pen") {
        const newEl: WhiteboardElement = {
          id: generateUUID(),
          element_type: "pen",
          x: canvasPoint.x,
          y: canvasPoint.y,
          width: 0,
          height: 0,
          fill: "transparent",
          stroke: state.strokeColor,
          strokeWidth: state.strokeWidth,
          opacity: 1,
          points: [{ x: canvasPoint.x, y: canvasPoint.y }],
        };
        setCurrentElement(newEl);
      } else if (state.tool === "arrow") {
        const newEl: WhiteboardElement = {
          id: generateUUID(),
          element_type: "arrow",
          x: canvasPoint.x,
          y: canvasPoint.y,
          width: 0,
          height: 0,
          fill: "transparent",
          stroke: state.strokeColor,
          strokeWidth: state.strokeWidth,
          opacity: 1,
          endX: canvasPoint.x,
          endY: canvasPoint.y,
        };
        setCurrentElement(newEl);
      } else if (
        state.tool === "rectangle" ||
        state.tool === "ellipse" ||
        state.tool === "diamond"
      ) {
        const newEl: WhiteboardElement = {
          id: generateUUID(),
          element_type: state.tool as "rectangle" | "ellipse" | "diamond",
          x: canvasPoint.x,
          y: canvasPoint.y,
          width: 0,
          height: 0,
          fill: state.fillColor,
          stroke: state.strokeColor,
          strokeWidth: state.strokeWidth,
          opacity: 1,
        };
        setCurrentElement(newEl);
      }
    },
    [
      state,
      screenToCanvas,
      addElement,
      setSelectedIds,
      pushHistory,
      dispatch,
      stickyColorIndex,
    ],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const canvasPoint = screenToCanvas(screenX, screenY);

      // Broadcast cursor position for real-time collaboration
      if (roomId && broadcastCursor) {
        broadcastCursor(canvasPoint.x, canvasPoint.y);
      }

      // Update connection preview
      if (isConnecting) {
        setConnectionPreview(canvasPoint);

        // Check if hovering over a connection point (larger hit area for better UX)
        let foundHover: ConnectionPoint | null = null;
        for (const el of state.elements) {
          if (el.id === connectionStart?.elementId) continue; // Skip source element
          const bounds = getElementBounds(el);
          const connPoints = getConnectionPoints(bounds);
          const handle = hitTestConnectionPoint(
            canvasPoint.x,
            canvasPoint.y,
            connPoints,
            15,
          );
          if (handle) {
            foundHover = {
              elementId: el.id,
              handle,
              x: connPoints[handle].x,
              y: connPoints[handle].y,
            };
            break;
          }
        }
        setHoveredConnectionPoint(foundHover);
        return;
      }

      // Handle hover cursor for connection points when in select mode
      if (
        !isDragging &&
        !isPanning &&
        state.tool === "select" &&
        !isConnecting
      ) {
        let foundHover: ConnectionPoint | null = null;
        for (const el of state.elements) {
          const bounds = getElementBounds(el);
          const connPoints = getConnectionPoints(bounds);
          const handle = hitTestConnectionPoint(
            canvasPoint.x,
            canvasPoint.y,
            connPoints,
            10,
          );
          if (handle) {
            foundHover = {
              elementId: el.id,
              handle,
              x: connPoints[handle].x,
              y: connPoints[handle].y,
            };
            break;
          }
        }
        setHoveredConnectionPoint(foundHover);
      } else if (!isConnecting) {
        setHoveredConnectionPoint(null);
      }

      // Handle hover cursor for resize handles when not dragging
      if (
        !isDragging &&
        !isPanning &&
        state.tool === "select" &&
        state.selectedIds.length === 1 &&
        !isConnecting
      ) {
        const selectedEl = state.elements.find(
          (el) => el.id === state.selectedIds[0],
        );
        if (selectedEl) {
          const bounds = getElementBounds(selectedEl);
          const handles = getHandlePositions(bounds);
          const handle = hitTestHandle(canvasPoint.x, canvasPoint.y, handles);
          setHoveredHandle(handle);
        } else {
          setHoveredHandle(null);
        }
      } else if (!isDragging && !isPanning && !isConnecting) {
        setHoveredHandle(null);
      }

      if (isPanning && dragStart) {
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        setCamera({
          x: state.camera.x + dx,
          y: state.camera.y + dy,
        });
        setDragStart({ x: e.clientX, y: e.clientY });
        return;
      }

      if (!isDragging) return;

      // Handle resizing
      if (resizeState) {
        const dx = canvasPoint.x - resizeState.startPoint.x;
        const dy = canvasPoint.y - resizeState.startPoint.y;
        const { startBounds, handle, elementId } = resizeState;

        let newX = startBounds.x;
        let newY = startBounds.y;
        let newWidth = startBounds.width;
        let newHeight = startBounds.height;

        // Adjust based on handle direction
        if (handle.includes("w")) {
          newX = startBounds.x + dx;
          newWidth = startBounds.width - dx;
        }
        if (handle.includes("e")) {
          newWidth = startBounds.width + dx;
        }
        if (handle.includes("n")) {
          newY = startBounds.y + dy;
          newHeight = startBounds.height - dy;
        }
        if (handle.includes("s")) {
          newHeight = startBounds.height + dy;
        }

        // Enforce minimum size
        const minSize = 10;
        if (newWidth < minSize) {
          if (handle.includes("w")) {
            newX = startBounds.x + startBounds.width - minSize;
          }
          newWidth = minSize;
        }
        if (newHeight < minSize) {
          if (handle.includes("n")) {
            newY = startBounds.y + startBounds.height - minSize;
          }
          newHeight = minSize;
        }

        const el = state.elements.find((e) => e.id === elementId);
        if (el) {
          if (el.element_type === "pen" && el.points && el.points.length > 0) {
            // Scale pen points proportionally
            const scaleX =
              startBounds.width > 0 ? newWidth / startBounds.width : 1;
            const scaleY =
              startBounds.height > 0 ? newHeight / startBounds.height : 1;
            const newPoints = el.points.map((p) => ({
              x: newX + (p.x - startBounds.x) * scaleX,
              y: newY + (p.y - startBounds.y) * scaleY,
            }));
            updateElement(elementId, {
              x: newX,
              y: newY,
              width: newWidth,
              height: newHeight,
              points: newPoints,
            });
          } else if (el.element_type === "arrow") {
            // Scale arrow endpoints proportionally
            const scaleX =
              startBounds.width > 0 ? newWidth / startBounds.width : 1;
            const scaleY =
              startBounds.height > 0 ? newHeight / startBounds.height : 1;
            const newStartX = newX + (el.x - startBounds.x) * scaleX;
            const newStartY = newY + (el.y - startBounds.y) * scaleY;
            const newEndX = newX + ((el.endX ?? el.x) - startBounds.x) * scaleX;
            const newEndY = newY + ((el.endY ?? el.y) - startBounds.y) * scaleY;
            updateElement(elementId, {
              x: newStartX,
              y: newStartY,
              endX: newEndX,
              endY: newEndY,
              width: newWidth,
              height: newHeight,
            });
          } else if (el.element_type === "text") {
            // Scale font size proportionally based on height change from original
            const originalFontSize = resizeState.startFontSize ?? 16;
            const scaleY =
              startBounds.height > 0 ? newHeight / startBounds.height : 1;
            const newFontSize = Math.max(
              8,
              Math.round(originalFontSize * scaleY),
            );
            updateElement(elementId, {
              x: newX,
              y: newY,
              width: newWidth,
              height: newHeight,
              fontSize: newFontSize,
            });
          } else if (el.element_type === "sticky") {
            // Scale sticky font size proportionally from original
            const originalFontSize = resizeState.startFontSize ?? 14;
            const scale = Math.min(
              startBounds.width > 0 ? newWidth / startBounds.width : 1,
              startBounds.height > 0 ? newHeight / startBounds.height : 1,
            );
            const newFontSize = Math.max(
              8,
              Math.round(originalFontSize * scale),
            );
            updateElement(elementId, {
              x: newX,
              y: newY,
              width: newWidth,
              height: newHeight,
              fontSize: newFontSize,
            });
          } else {
            updateElement(elementId, {
              x: newX,
              y: newY,
              width: newWidth,
              height: newHeight,
            });
          }
        }
        return;
      }

      // Moving selected elements
      if (
        state.tool === "select" &&
        moveStart &&
        state.selectedIds.length > 0
      ) {
        const dx = canvasPoint.x - moveStart.x;
        const dy = canvasPoint.y - moveStart.y;
        for (const id of state.selectedIds) {
          const startPos = moveElementStart.get(id);
          if (!startPos) continue;

          const el = state.elements.find((e) => e.id === id);
          if (!el) continue;

          const updates: Partial<WhiteboardElement> = {
            x: startPos.x + dx,
            y: startPos.y + dy,
          };

          // Pen: translate all points by the same delta
          if (el.element_type === "pen" && el.points && el.points.length > 0) {
            const origPoints = moveElementStartData.get(id);
            if (origPoints) {
              updates.points = origPoints.map((p: Point) => ({
                x: p.x + dx,
                y: p.y + dy,
              }));
            }
          }

          // Arrow: translate endX/endY by the same delta
          if (el.element_type === "arrow") {
            const origArrow = moveElementStartArrow.get(id);
            if (origArrow) {
              updates.endX = origArrow.endX + dx;
              updates.endY = origArrow.endY + dy;
            }
          }

          updateElement(id, updates);
        }
        return;
      }

      if (!currentElement || !dragStart) return;

      if (currentElement.element_type === "pen") {
        setCurrentElement({
          ...currentElement,
          points: [
            ...(currentElement.points ?? []),
            { x: canvasPoint.x, y: canvasPoint.y },
          ],
        });
      } else if (currentElement.element_type === "arrow") {
        setCurrentElement({
          ...currentElement,
          endX: canvasPoint.x,
          endY: canvasPoint.y,
        });
      } else {
        const x = Math.min(dragStart.x, canvasPoint.x);
        const y = Math.min(dragStart.y, canvasPoint.y);
        const width = Math.abs(canvasPoint.x - dragStart.x);
        const height = Math.abs(canvasPoint.y - dragStart.y);
        setCurrentElement({ ...currentElement, x, y, width, height });
      }
    },
    [
      isPanning,
      isDragging,
      dragStart,
      currentElement,
      state,
      moveStart,
      moveElementStart,
      moveElementStartData,
      moveElementStartArrow,
      screenToCanvas,
      setCamera,
      updateElement,
      resizeState,
      broadcastCursor,
      roomId,
      isConnecting,
      connectionStart,
    ],
  );

  const handleMouseUp = useCallback(() => {
    // Finish creating connection
    if (isConnecting && connectionStart && hoveredConnectionPoint) {
      const newConnection: Connection = {
        id: generateUUID(),
        sourceId: connectionStart.elementId,
        targetId: hoveredConnectionPoint.elementId,
        sourceHandle: connectionStart.handle,
        targetHandle: hoveredConnectionPoint.handle,
      };
      setConnections((prev) => [...prev, newConnection]);
      setHasUnsavedChanges(true);
      console.log("✅ Connection created:", newConnection);
    }

    // Clean up connection state
    if (isConnecting) {
      setIsConnecting(false);
      setConnectionStart(null);
      setConnectionPreview(null);
      setHoveredConnectionPoint(null);
      return;
    }

    if (isPanning) {
      setIsPanning(false);
      setDragStart(null);
      return;
    }

    if (resizeState) {
      pushHistory();
      markElementAsUnsaved(resizeState.elementId);
      setResizeState(null);
      setIsDragging(false);
      return;
    }

    if (state.tool === "select" && isDragging && moveStart) {
      pushHistory();
      // Mark all moved elements as unsaved
      state.selectedIds.forEach((id) => markElementAsUnsaved(id));
      setIsDragging(false);
      setMoveStart(null);
      setMoveElementStart(new Map());
      setMoveElementStartData(new Map());
      setMoveElementStartArrow(new Map());
      return;
    }

    if (currentElement) {
      pushHistory();
      addElement(currentElement);
      markElementAsUnsaved(currentElement.id);
      setCurrentElement(null);
    }

    setIsDragging(false);
    setDragStart(null);
  }, [
    isPanning,
    isDragging,
    currentElement,
    state.tool,
    state.selectedIds,
    moveStart,
    pushHistory,
    addElement,
    resizeState,
    markElementAsUnsaved,
    isConnecting,
    connectionStart,
    hoveredConnectionPoint,
  ]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (state.editingTextId) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        if (state.selectedIds.length > 0) {
          e.preventDefault(); // Empêcher le comportement par défaut
          console.log("🗑️ Marking elements for deletion:", state.selectedIds);
          pushHistory();
          dispatch({ type: "DELETE_ELEMENTS", ids: state.selectedIds });
          markElementAsDeleted(state.selectedIds);
        }
        return;
      }

      // Duplicate selected elements (Ctrl+D)
      if ((e.ctrlKey || e.metaKey) && e.key === "d") {
        e.preventDefault();
        if (state.selectedIds.length > 0) {
          pushHistory();
          const newIds: string[] = [];
          for (const id of state.selectedIds) {
            const el = state.elements.find((e) => e.id === id);
            if (!el) continue;
            const newId = generateUUID();
            const offset = 20;
            const clone: WhiteboardElement = {
              ...JSON.parse(JSON.stringify(el)),
              id: newId,
              x: el.x + offset,
              y: el.y + offset,
            };
            // Shift pen points
            if (clone.element_type === "pen" && clone.points) {
              clone.points = clone.points.map((p: Point) => ({
                x: p.x + offset,
                y: p.y + offset,
              }));
            }
            // Shift arrow endpoint
            if (
              clone.element_type === "arrow" &&
              clone.endX != null &&
              clone.endY != null
            ) {
              clone.endX += offset;
              clone.endY += offset;
            }
            dispatch({ type: "ADD_ELEMENT", element: clone });
            markElementAsUnsaved(clone.id);
            newIds.push(newId);
          }
          dispatch({ type: "SET_SELECTED_IDS", ids: newIds });
        }
        return;
      }

      // Save shortcut (Ctrl+S)
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        saveAllChanges();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          dispatch({ type: "REDO" });
        } else {
          dispatch({ type: "UNDO" });
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault();
        dispatch({ type: "REDO" });
        return;
      }

      const shortcuts: Record<string, string> = {
        v: "select",
        h: "hand",
        p: "pen",
        r: "rectangle",
        o: "ellipse",
        d: "diamond",
        a: "arrow",
        t: "text",
        s: "sticky",
        e: "eraser",
      };

      if (shortcuts[e.key] && !e.ctrlKey && !e.metaKey) {
        dispatch({ type: "SET_TOOL", tool: shortcuts[e.key] as any });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    state.editingTextId,
    state.selectedIds,
    state.elements,
    pushHistory,
    dispatch,
    markElementAsDeleted,
    markElementAsUnsaved,
    saveAllChanges,
  ]);

  // Double click to edit text/sticky
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const canvasPoint = screenToCanvas(screenX, screenY);

      for (let i = state.elements.length - 1; i >= 0; i--) {
        const el = state.elements[i];
        if (
          (el.element_type === "text" || el.element_type === "sticky") &&
          isPointInElement(canvasPoint.x, canvasPoint.y, el)
        ) {
          setTextInputPos({ x: e.clientX, y: e.clientY, id: el.id });
          dispatch({ type: "SET_EDITING_TEXT_ID", id: el.id });
          return;
        }
      }
    },
    [state.elements, screenToCanvas, dispatch],
  );

  const handleTextSubmit = useCallback(
    (text: string) => {
      if (textInputPos) {
        updateElement(textInputPos.id, { text });
        markElementAsUnsaved(textInputPos.id);
        pushHistory();
      }
      setTextInputPos(null);
      dispatch({ type: "SET_EDITING_TEXT_ID", id: null });
    },
    [textInputPos, updateElement, pushHistory, dispatch, markElementAsUnsaved],
  );

  const getCursorStyle = () => {
    // Connection point cursor
    if (hoveredConnectionPoint && !isConnecting) {
      return "crosshair";
    }
    if (isConnecting) {
      return hoveredConnectionPoint ? "copy" : "crosshair";
    }
    if (hoveredHandle) {
      return getHandleCursor(hoveredHandle);
    }
    if (resizeState) {
      return getHandleCursor(resizeState.handle);
    }
    switch (state.tool) {
      case "hand":
        return isPanning ? "grabbing" : "grab";
      case "pen":
        return "crosshair";
      case "rectangle":
      case "ellipse":
      case "diamond":
      case "arrow":
        return "crosshair";
      case "text":
        return "text";
      case "eraser":
        return "pointer";
      default:
        return "default";
    }
  };

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Chargement du tableau...</p>
          </div>
        </div>
      )}

      {/* Save Button */}
      <div className="absolute justify-end top-20 right-4 z-40 flex items-center gap-2">
        {hasUnsavedChanges && !isSaving && (
          <span className="text-sm text-yellow-600 dark:text-yellow-500 font-medium flex items-center gap-1">
            <span className="w-2 h-2 bg-yellow-600 dark:bg-yellow-500 rounded-full animate-pulse"></span>
            Modifications non sauvegardées
          </span>
        )}
        <button
          onClick={saveAllChanges}
          disabled={!hasUnsavedChanges || isSaving}
          className={`
            px-4 py-2 rounded-lg font-medium shadow-lg transition-all
            flex items-center gap-2
            ${
              hasUnsavedChanges && !isSaving
                ? "bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
                : "bg-muted text-muted-foreground cursor-not-allowed opacity-60"
            }
          `}
        >
          {isSaving ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
              Sauvegarde...
            </>
          ) : (
            <>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                <polyline points="7 3 7 8 15 8"></polyline>
              </svg>
              Sauvegarder
              {hasUnsavedChanges && (
                <span className="text-xs bg-white/20 px-1.5 py-0.5 rounded">
                  {unsavedElementIds.size + deletedElementIds.size}
                </span>
              )}
            </>
          )}
        </button>
      </div>

      {/* Connection Helper */}
      {state.tool === "select" &&
        !isConnecting &&
        state.elements.length > 1 && (
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-40 bg-background/95 backdrop-blur-sm px-4 py-2 rounded-lg shadow-lg border border-border">
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              <span>
                Drag from connection points (circles) to link elements
              </span>
            </p>
          </div>
        )}

      {/* Connecting State */}
      {isConnecting && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-40 bg-blue-500/95 backdrop-blur-sm px-4 py-2 rounded-lg shadow-lg">
          <p className="text-sm text-white flex items-center gap-2">
            <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
            {hoveredConnectionPoint
              ? "Release to connect"
              : "Drag to a connection point on another element"}
          </p>
        </div>
      )}

      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ cursor: getCursorStyle() }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
      />

      {/* Inline text editing overlay */}
      {textInputPos && (
        <TextInput
          x={textInputPos.x}
          y={textInputPos.y}
          initialText={
            state.elements.find((el) => el.id === textInputPos.id)?.text ?? ""
          }
          isSticky={
            state.elements.find((el) => el.id === textInputPos.id)
              ?.element_type === "sticky"
          }
          onSubmit={handleTextSubmit}
          onCancel={() => {
            setTextInputPos(null);
            dispatch({ type: "SET_EDITING_TEXT_ID", id: null });
          }}
        />
      )}
    </div>
  );
}

function TextInput({
  x,
  y,
  initialText,
  isSticky,
  onSubmit,
  onCancel,
}: {
  x: number;
  y: number;
  initialText: string;
  isSticky: boolean;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initialText);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <div className="fixed z-50" style={{ left: x, top: y }}>
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit(text);
          }
          if (e.key === "Escape") {
            onCancel();
          }
        }}
        onBlur={() => onSubmit(text)}
        className={`resize-none outline-none border-2 border-primary rounded-md p-2 text-sm font-sans ${
          isSticky
            ? "bg-accent/20 min-w-[130px] min-h-[80px]"
            : "bg-background min-w-[120px] min-h-[32px]"
        }`}
        style={{ color: "hsl(var(--canvas-text))" }}
        rows={isSticky ? 4 : 1}
      />
    </div>
  );
}
