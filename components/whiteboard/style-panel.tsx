"use client";

import { useWhiteboard } from "@/hooks/use-whiteboard";
import { STROKE_COLORS, FILL_COLORS } from "@/lib/whiteboard-types";

export function StylePanel() {
  const { state, dispatch, updateElement, pushHistory } = useWhiteboard();

  const selectedElement = state.elements.find((el) =>
    state.selectedIds.includes(el.id),
  );

  const currentStroke = selectedElement?.stroke ?? state.strokeColor;
  const currentFill = selectedElement?.fill ?? state.fillColor;
  const currentStrokeWidth = selectedElement?.strokeWidth ?? state.strokeWidth;

  const handleStrokeColor = (color: string) => {
    dispatch({ type: "SET_STROKE_COLOR", color });
    if (selectedElement) {
      pushHistory();
      updateElement(selectedElement.id, { stroke: color });
    }
  };

  const handleFillColor = (color: string) => {
    dispatch({ type: "SET_FILL_COLOR", color });
    if (selectedElement) {
      pushHistory();
      updateElement(selectedElement.id, { fill: color });
    }
  };

  const handleStrokeWidth = (width: number) => {
    dispatch({ type: "SET_STROKE_WIDTH", width });
    if (selectedElement) {
      pushHistory();
      updateElement(selectedElement.id, { strokeWidth: width });
    }
  };

  const showFill =
    state.tool === "rectangle" ||
    state.tool === "ellipse" ||
    state.tool === "diamond" ||
    (selectedElement &&
      (selectedElement.element_type === "rectangle" ||
        selectedElement.element_type === "ellipse" ||
        selectedElement.element_type === "diamond"));

  return (
    <div className="absolute top-20 left-4 z-20">
      <div className="bg-card border border-border rounded-xl shadow-lg p-3 w-[200px] space-y-4">
        {/* Stroke Color */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Couleur du trait
          </label>
          <div className="grid grid-cols-4 gap-1.5">
            {STROKE_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => handleStrokeColor(color)}
                className={`w-8 h-8 rounded-lg border-2 transition-all ${
                  currentStroke === color
                    ? "border-primary scale-110 shadow-sm"
                    : "border-border hover:border-muted-foreground"
                } ${color === "#FFFFFF" || color === "#1E293B" ? "ring-1 ring-inset ring-border" : ""}`}
                style={{ backgroundColor: color }}
                aria-label={`Stroke color ${color}`}
              />
            ))}
          </div>
        </div>

        {/* Fill Color */}
        {showFill && (
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Arrière-plan (couleur)
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {FILL_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => handleFillColor(color)}
                  className={`w-8 h-8 rounded-lg border-2 transition-all ${
                    currentFill === color
                      ? "border-primary scale-110 shadow-sm"
                      : "border-border hover:border-muted-foreground"
                  } ${color === "transparent" ? "bg-card" : ""}`}
                  style={
                    color !== "transparent"
                      ? { backgroundColor: color }
                      : {
                          backgroundImage:
                            "linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(135deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(135deg, transparent 75%, #ccc 75%)",
                          backgroundSize: "8px 8px",
                          backgroundPosition: "0 0, 4px 0, 4px -4px, 0 4px",
                        }
                  }
                  aria-label={`Fill color ${color}`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Stroke Width */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Taille du trait
          </label>
          <div className="flex items-center gap-2">
            {[1, 2, 4, 6].map((w) => (
              <button
                key={w}
                onClick={() => handleStrokeWidth(w)}
                className={`flex-1 h-8 rounded-lg border-2 flex items-center justify-center transition-all ${
                  currentStrokeWidth === w
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground"
                }`}
                aria-label={`Stroke width ${w}`}
              >
                <div
                  className="rounded-full bg-foreground"
                  style={{ width: w * 3 + 2, height: w * 3 + 2 }}
                />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
