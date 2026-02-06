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

function getElementBounds(el: WhiteboardElement) {
  if (el.type === "pen" && el.points && el.points.length > 0) {
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
  if (el.type === "arrow") {
    const minX = Math.min(el.x, el.endX ?? el.x);
    const minY = Math.min(el.y, el.endY ?? el.y);
    const maxX = Math.max(el.x, el.endX ?? el.x);
    const maxY = Math.max(el.y, el.endY ?? el.y);
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }
  if (el.type === "text") {
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
  if (el.type === "pen" && el.points && el.points.length > 1) {
    const hitDist = Math.max(el.strokeWidth * 2, 12);
    for (let i = 1; i < el.points.length; i++) {
      const p0 = el.points[i - 1];
      const p1 = el.points[i];
      if (distToSegment(px, py, p0.x, p0.y, p1.x, p1.y) < hitDist) return true;
    }
    return false;
  }

  // Arrow: check distance to the line
  if (el.type === "arrow") {
    const ex = el.endX ?? el.x;
    const ey = el.endY ?? el.y;
    const hitDist = Math.max(el.strokeWidth * 2, 12);
    return distToSegment(px, py, el.x, el.y, ex, ey) < hitDist;
  }

  // Text: use measured bounds
  if (el.type === "text") {
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

interface ResizeState {
  handle: ResizeHandle;
  elementId: string;
  startBounds: { x: number; y: number; width: number; height: number };
  startPoint: Point;
  startFontSize?: number;
}

interface CanvasProps {
  broadcastCursor?: (x: number, y: number) => void;
  roomId?: string | null;
}

export function Canvas({ broadcastCursor, roomId }: CanvasProps) {
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

    // Draw elements
    for (const el of state.elements) {
      drawElement(ctx, el, state.selectedIds.includes(el.id));
    }

    // Draw current element being created
    if (currentElement) {
      drawElement(ctx, currentElement, false);
    }

    ctx.restore();
  }, [state, currentElement, theme]);

  function drawElement(
    ctx: CanvasRenderingContext2D,
    el: WhiteboardElement,
    isSelected: boolean,
  ) {
    ctx.save();
    ctx.globalAlpha = el.opacity;

    switch (el.type) {
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
          ctx.moveTo(el.points[0].x, el.points[0].y);
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
            if (el.type === "pen" && el.points) {
              const origPoints = el.points.map((p) => ({ ...p }));
              const dataMap = new Map<string, Point[]>();
              dataMap.set(el.id, origPoints);
              setMoveElementStartData(dataMap);
            }

            // Store original arrow endpoints for arrow elements
            if (el.type === "arrow") {
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
            return;
          }
        }
        return;
      }

      if (state.tool === "text") {
        const id = generateId();
        const newEl: WhiteboardElement = {
          id,
          type: "text",
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
        const id = generateId();
        const colorIdx = stickyColorIndex % STICKY_COLORS.length;
        const newEl: WhiteboardElement = {
          id,
          type: "sticky",
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
          id: generateId(),
          type: "pen",
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
          id: generateId(),
          type: "arrow",
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
          id: generateId(),
          type: state.tool as "rectangle" | "ellipse" | "diamond",
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

      // Handle hover cursor for resize handles when not dragging
      if (
        !isDragging &&
        !isPanning &&
        state.tool === "select" &&
        state.selectedIds.length === 1
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
      } else if (!isDragging && !isPanning) {
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
          if (el.type === "pen" && el.points && el.points.length > 0) {
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
          } else if (el.type === "arrow") {
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
          } else if (el.type === "text") {
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
          } else if (el.type === "sticky") {
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
          if (el.type === "pen" && el.points && el.points.length > 0) {
            const origPoints = moveElementStartData.get(id);
            if (origPoints) {
              updates.points = origPoints.map((p: Point) => ({
                x: p.x + dx,
                y: p.y + dy,
              }));
            }
          }

          // Arrow: translate endX/endY by the same delta
          if (el.type === "arrow") {
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

      if (currentElement.type === "pen") {
        setCurrentElement({
          ...currentElement,
          points: [
            ...(currentElement.points ?? []),
            { x: canvasPoint.x, y: canvasPoint.y },
          ],
        });
      } else if (currentElement.type === "arrow") {
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
    ],
  );

  const handleMouseUp = useCallback(() => {
    if (isPanning) {
      setIsPanning(false);
      setDragStart(null);
      return;
    }

    if (resizeState) {
      pushHistory();
      setResizeState(null);
      setIsDragging(false);
      return;
    }

    if (state.tool === "select" && isDragging && moveStart) {
      pushHistory();
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
      setCurrentElement(null);
    }

    setIsDragging(false);
    setDragStart(null);
  }, [
    isPanning,
    isDragging,
    currentElement,
    state.tool,
    moveStart,
    pushHistory,
    addElement,
    resizeState,
  ]);

  // Wheel for zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
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
    },
    [state.camera, setCamera],
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (state.editingTextId) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        if (state.selectedIds.length > 0) {
          pushHistory();
          dispatch({ type: "DELETE_ELEMENTS", ids: state.selectedIds });
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
            const newId = generateId();
            const offset = 20;
            const clone: WhiteboardElement = {
              ...JSON.parse(JSON.stringify(el)),
              id: newId,
              x: el.x + offset,
              y: el.y + offset,
            };
            // Shift pen points
            if (clone.type === "pen" && clone.points) {
              clone.points = clone.points.map((p: Point) => ({
                x: p.x + offset,
                y: p.y + offset,
              }));
            }
            // Shift arrow endpoint
            if (
              clone.type === "arrow" &&
              clone.endX != null &&
              clone.endY != null
            ) {
              clone.endX += offset;
              clone.endY += offset;
            }
            dispatch({ type: "ADD_ELEMENT", element: clone });
            newIds.push(newId);
          }
          dispatch({ type: "SET_SELECTED_IDS", ids: newIds });
        }
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
          (el.type === "text" || el.type === "sticky") &&
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
        pushHistory();
      }
      setTextInputPos(null);
      dispatch({ type: "SET_EDITING_TEXT_ID", id: null });
    },
    [textInputPos, updateElement, pushHistory, dispatch],
  );

  const getCursorStyle = () => {
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
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ cursor: getCursorStyle() }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
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
            state.elements.find((el) => el.id === textInputPos.id)?.type ===
            "sticky"
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
