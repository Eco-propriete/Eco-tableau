"use client";

import { Undo2, Redo2, Download, Trash2, Layout, Copy } from "lucide-react";
import { useWhiteboard } from "@/hooks/use-whiteboard";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCallback, useState } from "react";
import { ShareDialog } from "./share-dialog";
import { UserAvatars } from "./cursor-overlay";
import type { RemoteUser } from "@/hooks/use-realtime";
import { resolveThemeColor, useTheme } from "@/hooks/use-theme";
import { Moon, Sun } from "lucide-react";
import { Connection, getConnectionPoints, getElementBounds } from "./canvas";

interface TopBarProps {
  boardId: string | null;
  roomId: string | null;
  isConnected: boolean;
  remoteUsers: RemoteUser[];
  userName: string;
  userColor: string;
  onCreateRoom: () => void;
  onLeaveRoom: () => void;
}

export function TopBar({
  boardId,
  roomId,
  isConnected,
  remoteUsers,
  userName,
  userColor,
  onCreateRoom,
  onLeaveRoom,
}: TopBarProps) {
  const { state, undo, redo, dispatch, pushHistory, addElement } =
    useWhiteboard();
  const { theme, toggleTheme } = useTheme();
  const [connections, setConnections] = useState<Connection[]>([]);
  const canUndo = state.historyIndex > 0;
  const canRedo = state.historyIndex < state.history.length - 1;

  // Fonction d'export à ajouter dans votre composant Canvas
  // Remplacez votre fonction handleExport actuelle par celle-ci

  const handleExport = useCallback(() => {
    const exportCanvas = document.createElement("canvas");
    const ctx = exportCanvas.getContext("2d");
    if (!ctx || state.elements.length === 0) return;

    // Calculate bounds
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const el of state.elements) {
      const bounds = getElementBounds(el);
      minX = Math.min(minX, bounds.x);
      minY = Math.min(minY, bounds.y);
      maxX = Math.max(maxX, bounds.x + bounds.width);
      maxY = Math.max(maxY, bounds.y + bounds.height);
    }

    const padding = 40;
    const width = maxX - minX + padding * 2;
    const height = maxY - minY + padding * 2;

    exportCanvas.width = width * 2;
    exportCanvas.height = height * 2;
    ctx.scale(2, 2);
    ctx.fillStyle = resolveThemeColor("--canvas-bg");
    ctx.fillRect(0, 0, width, height);
    ctx.translate(-minX + padding, -minY + padding);

    // Draw connections FIRST (behind elements)
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

    // Draw elements
    for (const el of state.elements) {
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

      ctx.restore();
    }

    const link = document.createElement("a");
    link.download = `tableau-${boardId}.png`;
    link.href = exportCanvas.toDataURL("image/png");
    link.click();
  }, [state.elements, connections, boardId]);

  // N'oubliez pas d'ajouter cette fonction dans votre composant
  // et de l'appeler depuis un bouton ou menu

  const handleDuplicate = useCallback(() => {
    if (state.selectedIds.length === 0) return;
    pushHistory();
    const newIds: string[] = [];
    for (const id of state.selectedIds) {
      const el = state.elements.find((e) => e.id === id);
      if (!el) continue;
      const newId = Math.random().toString(36).substring(2, 15);
      const offset = 20;
      const clone = {
        ...JSON.parse(JSON.stringify(el)),
        id: newId,
        x: el.x + offset,
        y: el.y + offset,
      };
      if (clone.type === "pen" && clone.points) {
        clone.points = clone.points.map((p: { x: number; y: number }) => ({
          x: p.x + offset,
          y: p.y + offset,
        }));
      }
      if (clone.type === "arrow" && clone.endX != null && clone.endY != null) {
        clone.endX += offset;
        clone.endY += offset;
      }
      addElement(clone);
      newIds.push(newId);
    }
    dispatch({ type: "SET_SELECTED_IDS", ids: newIds });
  }, [state.selectedIds, state.elements, pushHistory, addElement, dispatch]);

  const handleClearAll = useCallback(() => {
    if (state.elements.length === 0) return;
    pushHistory();
    dispatch({ type: "SET_ELEMENTS", elements: [] });
    dispatch({ type: "SET_SELECTED_IDS", ids: [] });
  }, [state.elements, pushHistory, dispatch]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="absolute top-4 left-4 z-30 flex items-center gap-3">
        {/* Logo / Name */}
        <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2 shadow-lg">
          <Layout className="w-5 h-5 text-primary" />
          <span className="text-sm font-semibold text-foreground">
            Tableau de bord
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 bg-card border border-border rounded-xl px-2 py-1.5 shadow-lg">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={undo}
                disabled={!canUndo}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Undo"
              >
                <Undo2 className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Annuler (Ctrl+Z)
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={redo}
                disabled={!canRedo}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Redo"
              >
                <Redo2 className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Refaire (Ctrl+Shift+Z)
            </TooltipContent>
          </Tooltip>

          <div className="w-px h-5 bg-border mx-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleDuplicate}
                disabled={state.selectedIds.length === 0}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Duplicate"
              >
                <Copy className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Dupliquer (Ctrl+D)
            </TooltipContent>
          </Tooltip>

          <div className="w-px h-5 bg-border mx-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleExport}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
                aria-label="Export"
              >
                <Download className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Exporter en PNG
            </TooltipContent>
          </Tooltip>

          {/*<Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleClearAll}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive transition-all"
                aria-label="Clear all"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </TooltipTrigger>

           <TooltipContent side="bottom" className="text-xs">
              Supprimer tout
            </TooltipContent>
          </Tooltip>*/}
        </div>
      </div>

      {/* Right side: theme toggle + users + share */}
      <div className="absolute top-4 right-4 z-30 flex items-center gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={toggleTheme}
              className="flex items-center justify-center w-10 h-10 bg-card border border-border rounded-xl shadow-lg text-muted-foreground hover:text-foreground transition-all"
              aria-label={
                theme === "light"
                  ? "Switch to dark mode"
                  : "Switch to light mode"
              }
            >
              {theme === "light" ? (
                <Moon className="w-[18px] h-[18px]" />
              ) : (
                <Sun className="w-[18px] h-[18px]" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {theme === "light" ? "Dark mode" : "Light mode"}
          </TooltipContent>
        </Tooltip>

        <div className="bg-card border border-border rounded-xl px-3 py-2 shadow-lg">
          <UserAvatars
            users={remoteUsers}
            userName={userName}
            userColor={userColor}
          />
        </div>

        <ShareDialog
          boardId={boardId}
          roomId={roomId}
          isConnected={isConnected}
          onCreateRoom={onCreateRoom}
          onLeaveRoom={onLeaveRoom}
        />
      </div>
    </TooltipProvider>
  );
}
