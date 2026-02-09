"use client";

import { Undo2, Redo2, Download, Trash2, Layout, Copy } from "lucide-react";
import { useWhiteboard } from "@/hooks/use-whiteboard";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCallback } from "react";
import { ShareDialog } from "./share-dialog";
import { UserAvatars } from "./cursor-overlay";
import type { RemoteUser } from "@/hooks/use-realtime";
import { resolveThemeColor, useTheme } from "@/hooks/use-theme";
import { Moon, Sun } from "lucide-react";

interface TopBarProps {
  roomId: string | null;
  isConnected: boolean;
  remoteUsers: RemoteUser[];
  userName: string;
  userColor: string;
  onCreateRoom: () => void;
  onLeaveRoom: () => void;
}

export function TopBar({
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

  const canUndo = state.historyIndex > 0;
  const canRedo = state.historyIndex < state.history.length - 1;

  const handleExport = useCallback(() => {
    const exportCanvas = document.createElement("canvas");
    const ctx = exportCanvas.getContext("2d");
    if (!ctx || state.elements.length === 0) return;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const el of state.elements) {
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + (el.width || 200));
      maxY = Math.max(maxY, el.y + (el.height || 40));
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
              ctx.lineTo(el.points[i].x, el.points[i].y);
            }
            ctx.stroke();
          }
          break;
        case "arrow": {
          ctx.beginPath();
          ctx.strokeStyle = el.stroke;
          ctx.lineWidth = el.strokeWidth;
          ctx.lineCap = "round";
          ctx.moveTo(el.x, el.y);
          ctx.lineTo(el.endX ?? el.x, el.endY ?? el.y);
          ctx.stroke();
          const angle = Math.atan2(
            (el.endY ?? el.y) - el.y,
            (el.endX ?? el.x) - el.x,
          );
          const headLen = 14;
          ctx.beginPath();
          ctx.fillStyle = el.stroke;
          ctx.moveTo(el.endX ?? el.x, el.endY ?? el.y);
          ctx.lineTo(
            (el.endX ?? el.x) - headLen * Math.cos(angle - Math.PI / 6),
            (el.endY ?? el.y) - headLen * Math.sin(angle - Math.PI / 6),
          );
          ctx.lineTo(
            (el.endX ?? el.x) - headLen * Math.cos(angle + Math.PI / 6),
            (el.endY ?? el.y) - headLen * Math.sin(angle + Math.PI / 6),
          );
          ctx.closePath();
          ctx.fill();
          break;
        }
        case "text":
          ctx.font = `${el.fontSize ?? 16}px Inter, system-ui, sans-serif`;
          ctx.fillStyle = el.stroke;
          ctx.textBaseline = "top";
          ctx.fillText(el.text ?? "", el.x, el.y);
          break;
        case "sticky": {
          const radius = 8;
          ctx.shadowColor = "rgba(0,0,0,0.08)";
          ctx.shadowBlur = 12;
          ctx.shadowOffsetY = 4;
          ctx.beginPath();
          ctx.moveTo(el.x + radius, el.y);
          ctx.lineTo(el.x + el.width - radius, el.y);
          ctx.arcTo(
            el.x + el.width,
            el.y,
            el.x + el.width,
            el.y + radius,
            radius,
          );
          ctx.lineTo(el.x + el.width, el.y + el.height - radius);
          ctx.arcTo(
            el.x + el.width,
            el.y + el.height,
            el.x + el.width - radius,
            el.y + el.height,
            radius,
          );
          ctx.lineTo(el.x + radius, el.y + el.height);
          ctx.arcTo(
            el.x,
            el.y + el.height,
            el.x,
            el.y + el.height - radius,
            radius,
          );
          ctx.lineTo(el.x, el.y + radius);
          ctx.arcTo(el.x, el.y, el.x + radius, el.y, radius);
          ctx.closePath();
          ctx.fillStyle = el.fill;
          ctx.fill();
          ctx.shadowColor = "transparent";
          if (el.text) {
            ctx.font = `${el.fontSize ?? 14}px Inter, system-ui, sans-serif`;
            ctx.fillStyle = resolveThemeColor("--canvas-text");
            ctx.textBaseline = "top";
            ctx.fillText(el.text, el.x + 10, el.y + 14);
          }
          break;
        }
      }
      ctx.restore();
    }

    const link = document.createElement("a");
    link.download = "whiteboard.png";
    link.href = exportCanvas.toDataURL("image/png");
    link.click();
  }, [state.elements]);

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
          roomId={roomId}
          isConnected={isConnected}
          onCreateRoom={onCreateRoom}
          onLeaveRoom={onLeaveRoom}
        />
      </div>
    </TooltipProvider>
  );
}
