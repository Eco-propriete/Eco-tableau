"use client";

import { Plus, Minus, Maximize2 } from "lucide-react";
import { useWhiteboard } from "@/hooks/use-whiteboard";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function ZoomControls() {
  const { state, setCamera } = useWhiteboard();

  const zoomIn = () => {
    const newZoom = Math.min(5, state.camera.zoom * 1.25);
    const scale = newZoom / state.camera.zoom;
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    setCamera({
      zoom: newZoom,
      x: cx - (cx - state.camera.x) * scale,
      y: cy - (cy - state.camera.y) * scale,
    });
  };

  const zoomOut = () => {
    const newZoom = Math.max(0.1, state.camera.zoom / 1.25);
    const scale = newZoom / state.camera.zoom;
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    setCamera({
      zoom: newZoom,
      x: cx - (cx - state.camera.x) * scale,
      y: cy - (cy - state.camera.y) * scale,
    });
  };

  const resetZoom = () => {
    setCamera({ zoom: 1, x: 0, y: 0 });
  };

  const zoomPercent = Math.round(state.camera.zoom * 100);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="absolute bottom-4 left-4 z-20">
        <div className="flex items-center gap-1 bg-card border border-border rounded-xl px-2 py-1.5 shadow-lg">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={zoomOut}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
                aria-label="Zoom out"
              >
                <Minus className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Zoom arrière
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={resetZoom}
                className="flex items-center justify-center min-w-[48px] h-8 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
                aria-label="Reset zoom"
              >
                {zoomPercent}%
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Réinitialiser à 100%
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={zoomIn}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
                aria-label="Zoom in"
              >
                <Plus className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Zoom avant
            </TooltipContent>
          </Tooltip>

          <div className="w-px h-5 bg-border mx-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={resetZoom}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
                aria-label="Fit to screen"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Ajuster à l'écran
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}
