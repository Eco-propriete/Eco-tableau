"use client";

import React from "react";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Trash2,
  ZoomIn,
  ZoomOut,
  Download,
  Share2,
  ArrowDownLeft as ArrowPointer,
  Square,
  Circle,
  Type,
  PencilIcon,
  LogOut,
} from "lucide-react";
import { useRouter } from "next/navigation";

interface CanvasElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  color: string;
  stroke_width: number;
  fill_color: string | null;
  content: string | null;
  z_index: number;
}

export default function CanvasBoard({ params }: { params: { id: string } }) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [boardId] = useState(params.id);
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [selectedTool, setSelectedTool] = useState<
    "pointer" | "pencil" | "rectangle" | "circle" | "text"
  >("pencil");
  const [color, setColor] = useState("#000000");
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [drawing, setDrawing] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  const canvasWidth = 10000;
  const canvasHeight = 10000;

  // Load board data
  useEffect(() => {
    async function loadBoard() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/auth/login");
        return;
      }

      setUser(user);

      const { data: elementData, error } = await supabase
        .from("canvas_elements")
        .select("*")
        .eq("board_id", boardId)
        .order("z_index", { ascending: true });

      if (!error && elementData) {
        setElements(elementData);
      }

      setLoading(false);
    }

    loadBoard();
  }, [boardId, router]);

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Draw background
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Draw grid
    ctx.strokeStyle = "#f0f0f0";
    ctx.lineWidth = 0.5;
    const gridSize = 20;
    for (let x = panX % gridSize; x < rect.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, rect.height);
      ctx.stroke();
    }
    for (let y = panY % gridSize; y < rect.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(rect.width, y);
      ctx.stroke();
    }

    // Draw elements
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);

    elements.forEach((elem) => {
      ctx.fillStyle = elem.fill_color || "transparent";
      ctx.strokeStyle = elem.color;
      ctx.lineWidth = elem.stroke_width;

      switch (elem.type) {
        case "rectangle":
          ctx.fillRect(elem.x, elem.y, elem.width, elem.height);
          ctx.strokeRect(elem.x, elem.y, elem.width, elem.height);
          break;
        case "circle":
          ctx.beginPath();
          ctx.arc(
            elem.x + elem.width / 2,
            elem.y + elem.height / 2,
            elem.width / 2,
            0,
            Math.PI * 2,
          );
          ctx.fill();
          ctx.stroke();
          break;
        case "text":
          ctx.fillStyle = elem.color;
          ctx.font = `16px sans-serif`;
          ctx.fillText(elem.content || "", elem.x, elem.y);
          break;
        case "pencil":
          if (elem.content) {
            const points = JSON.parse(elem.content);
            if (points.length > 0) {
              ctx.beginPath();
              ctx.moveTo(points[0].x, points[0].y);
              points.forEach((point: any) => {
                ctx.lineTo(point.x, point.y);
              });
              ctx.stroke();
            }
          }
          break;
      }
    });

    ctx.restore();
  }, [elements, zoom, panX, panY]);

  const getCanvasCoords = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };

      const rect = canvas.getBoundingClientRect();
      const x = (clientX - rect.left - panX) / zoom;
      const y = (clientY - rect.top - panY) / zoom;
      return { x, y };
    },
    [panX, panY, zoom],
  );

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasCoords(e.clientX, e.clientY);
    setStartX(x);
    setStartY(y);
    setDrawing(true);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing || !user) return;

    const { x, y } = getCanvasCoords(e.clientX, e.clientY);

    if (selectedTool === "pencil") {
      // Pencil is drawn in real-time via canvas
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(startX * zoom + panX, startY * zoom + panY);
      ctx.lineTo(x * zoom + panX, y * zoom + panY);
      ctx.stroke();
    }
  };

  const handleMouseUp = async (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing || !user) {
      setDrawing(false);
      return;
    }

    const { x, y } = getCanvasCoords(e.clientX, e.clientY);
    setDrawing(false);

    const supabase = createClient();
    const newElement: Partial<CanvasElement> = {
      type: selectedTool,
      x: Math.min(startX, x),
      y: Math.min(startY, y),
      width: Math.abs(x - startX) || 5,
      height: Math.abs(y - startY) || 5,
      color,
      stroke_width: 2,
      z_index: elements.length,
    };

    const { data, error } = await supabase
      .from("canvas_elements")
      .insert({
        ...newElement,
        board_id: boardId,
      })
      .select();

    if (!error && data) {
      setElements([...elements, data[0]]);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((prev) => Math.max(0.1, Math.min(5, prev * delta)));
  };

  const handleClearCanvas = async () => {
    if (!confirm("Clear all elements?")) return;

    const supabase = createClient();
    await supabase.from("canvas_elements").delete().eq("board_id", boardId);
    setElements([]);
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  };

  if (loading) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">
            Chargement du tableau de bord...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen flex flex-col bg-background">
      <header className="border-b border-border bg-card">
        <div className="px-4 py-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            Tableau de bord
          </h2>
          <Button
            variant="outline"
            onClick={handleLogout}
            size="sm"
            className="gap-2 bg-transparent"
          >
            <LogOut className="w-4 h-4" />
            Se déconnecter
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="border-r border-border bg-card p-3 flex flex-col gap-3 w-20">
          <div className="space-y-2">
            <Button
              variant={selectedTool === "pointer" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedTool("pointer")}
              title="Pointer"
              className="w-full"
            >
              <ArrowPointer className="w-4 h-4" />
            </Button>
            <Button
              variant={selectedTool === "pencil" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedTool("pencil")}
              title="Pencil"
              className="w-full"
            >
              <PencilIcon className="w-4 h-4" />
            </Button>
            <Button
              variant={selectedTool === "rectangle" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedTool("rectangle")}
              title="Rectangle"
              className="w-full"
            >
              <Square className="w-4 h-4" />
            </Button>
            <Button
              variant={selectedTool === "circle" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedTool("circle")}
              title="Circle"
              className="w-full"
            >
              <Circle className="w-4 h-4" />
            </Button>
            <Button
              variant={selectedTool === "text" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedTool("text")}
              title="Text"
              className="w-full"
            >
              <Type className="w-4 h-4" />
            </Button>
          </div>

          <div className="border-t border-border pt-3">
            <label className="text-xs font-medium text-muted-foreground block mb-2">
              Couleur
            </label>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-full h-8 cursor-pointer rounded"
            />
          </div>

          <div className="border-t border-border pt-3 space-y-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setZoom((z) => Math.min(5, z + 0.2))}
              className="w-full"
            >
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setZoom((z) => Math.max(0.1, z - 0.2))}
              className="w-full"
            >
              <ZoomOut className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setZoom(1);
                setPanX(0);
                setPanY(0);
              }}
              className="w-full text-xs"
            >
              Réinitialiser
            </Button>
          </div>

          <div className="border-t border-border pt-3">
            <Button
              variant="destructive"
              size="sm"
              onClick={handleClearCanvas}
              className="w-full"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <canvas
          ref={canvasRef}
          className="flex-1 cursor-crosshair bg-white"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
        />
      </div>
    </div>
  );
}
