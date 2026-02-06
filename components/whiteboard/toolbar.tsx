"use client";

import React from "react";

import {
  MousePointer2,
  Hand,
  Pencil,
  Square,
  Circle,
  Diamond,
  ArrowUpRight,
  Type,
  StickyNote,
  Eraser,
} from "lucide-react";
import { useWhiteboard } from "@/hooks/use-whiteboard";
import type { Tool } from "@/lib/whiteboard-types";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const tools: {
  tool: Tool;
  icon: React.ElementType;
  label: string;
  shortcut: string;
}[] = [
  { tool: "select", icon: MousePointer2, label: "Selectionner", shortcut: "V" },
  { tool: "hand", icon: Hand, label: "Main", shortcut: "H" },
  { tool: "pen", icon: Pencil, label: "Stylo", shortcut: "P" },
  { tool: "rectangle", icon: Square, label: "Rectangle", shortcut: "R" },
  { tool: "ellipse", icon: Circle, label: "Ellipse", shortcut: "O" },
  { tool: "diamond", icon: Diamond, label: "Diamant", shortcut: "D" },
  { tool: "arrow", icon: ArrowUpRight, label: "Flèche", shortcut: "A" },
  { tool: "text", icon: Type, label: "Texte", shortcut: "T" },
  { tool: "sticky", icon: StickyNote, label: "Note", shortcut: "N" },
  { tool: "eraser", icon: Eraser, label: "Gomme", shortcut: "E" },
];

export function Toolbar() {
  const { state, setTool } = useWhiteboard();

  return (
    <TooltipProvider delayDuration={200}>
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30">
        <div className="flex items-center gap-1 bg-card border border-border rounded-xl px-2 py-1.5 shadow-lg">
          {tools.map(({ tool, icon: Icon, label, shortcut }) => (
            <Tooltip key={tool}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setTool(tool)}
                  className={`flex items-center justify-center w-9 h-9 rounded-lg transition-all dark:bg-red-500 ${
                    state.tool === tool
                      ? "bg-gray-400 text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                  aria-label={label}
                >
                  <Icon className="w-[18px] h-[18px]" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                <span>{label}</span>
                <span className="ml-2 text-muted-foreground opacity-70">
                  {shortcut}
                </span>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}
