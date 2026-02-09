"use client";

import React from "react";

import { useRef, useEffect, useCallback } from "react";
import { useWhiteboard } from "@/hooks/use-whiteboard";
import { resolveThemeColor, useTheme } from "@/hooks/use-theme";

export function Minimap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { state, setCamera } = useWhiteboard();
  const { theme } = useTheme();

  const MINIMAP_W = 180;
  const MINIMAP_H = 120;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = MINIMAP_W * dpr;
    canvas.height = MINIMAP_H * dpr;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = resolveThemeColor("--minimap-bg");
    ctx.fillRect(0, 0, MINIMAP_W, MINIMAP_H);

    if (state.elements.length === 0) {
      // Viewport indicator
      ctx.strokeStyle = "rgba(59, 130, 246, 0.5)";
      ctx.lineWidth = 1;
      ctx.strokeRect(
        MINIMAP_W * 0.3,
        MINIMAP_H * 0.3,
        MINIMAP_W * 0.4,
        MINIMAP_H * 0.4,
      );
      return;
    }

    // Calculate bounds of all elements
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const el of state.elements) {
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + el.width);
      maxY = Math.max(maxY, el.y + el.height);
    }

    const padding = 200;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const worldW = maxX - minX;
    const worldH = maxY - minY;
    const scaleX = MINIMAP_W / worldW;
    const scaleY = MINIMAP_H / worldH;
    const scale = Math.min(scaleX, scaleY);

    const offsetX = (MINIMAP_W - worldW * scale) / 2;
    const offsetY = (MINIMAP_H - worldH * scale) / 2;

    // Draw elements
    for (const el of state.elements) {
      const x = (el.x - minX) * scale + offsetX;
      const y = (el.y - minY) * scale + offsetY;
      const w = Math.max(el.width * scale, 2);
      const h = Math.max(el.height * scale, 2);

      if (el.element_type === "sticky") {
        ctx.fillStyle = el.fill || "#FEF3C7";
      } else if (el.element_type === "pen") {
        ctx.fillStyle = el.stroke || resolveThemeColor("--minimap-element");
      } else {
        ctx.fillStyle = resolveThemeColor("--minimap-element");
      }
      ctx.globalAlpha = 0.7;
      ctx.fillRect(x, y, w, h);
    }

    ctx.globalAlpha = 1;

    // Viewport
    const viewportX =
      (-state.camera.x / state.camera.zoom - minX) * scale + offsetX;
    const viewportY =
      (-state.camera.y / state.camera.zoom - minY) * scale + offsetY;
    const viewportW = (window.innerWidth / state.camera.zoom) * scale;
    const viewportH = (window.innerHeight / state.camera.zoom) * scale;

    ctx.strokeStyle = "#3B82F6";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(viewportX, viewportY, viewportW, viewportH);
  }, [state, theme]);

  useEffect(() => {
    let animId: number;
    const loop = () => {
      draw();
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [draw]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (state.elements.length === 0) return;

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      for (const el of state.elements) {
        minX = Math.min(minX, el.x);
        minY = Math.min(minY, el.y);
        maxX = Math.max(maxX, el.x + el.width);
        maxY = Math.max(maxY, el.y + el.height);
      }

      const padding = 200;
      minX -= padding;
      minY -= padding;
      maxX += padding;
      maxY += padding;

      const worldW = maxX - minX;
      const worldH = maxY - minY;
      const scaleX = MINIMAP_W / worldW;
      const scaleY = MINIMAP_H / worldH;
      const scale = Math.min(scaleX, scaleY);

      const offsetX = (MINIMAP_W - worldW * scale) / 2;
      const offsetY = (MINIMAP_H - worldH * scale) / 2;

      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const worldX = (mouseX - offsetX) / scale + minX;
      const worldY = (mouseY - offsetY) / scale + minY;

      setCamera({
        x: -worldX * state.camera.zoom + window.innerWidth / 2,
        y: -worldY * state.camera.zoom + window.innerHeight / 2,
      });
    },
    [state, setCamera],
  );

  return (
    <div className="absolute bottom-4 right-4 z-20">
      <div className="bg-card border border-border rounded-xl shadow-lg overflow-hidden">
        <canvas
          ref={canvasRef}
          width={MINIMAP_W}
          height={MINIMAP_H}
          className="cursor-pointer"
          style={{ width: MINIMAP_W, height: MINIMAP_H }}
          onClick={handleClick}
        />
      </div>
    </div>
  );
}
