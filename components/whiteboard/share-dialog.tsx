"use client";

import { useState, useCallback } from "react";
import { Copy, Check, Share2, Link2, Wifi, WifiOff } from "lucide-react";

interface ShareDialogProps {
  boardId: string | null;
  roomId: string | null;
  isConnected: boolean;
  onCreateRoom: () => void;
  onLeaveRoom: () => void;
}

export function ShareDialog({
  boardId,
  roomId,
  isConnected,
  onCreateRoom,
  onLeaveRoom,
}: ShareDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareUrl =
    boardId && roomId
      ? typeof window !== "undefined"
        ? `${window.location.origin}/board/${boardId}`
        : ""
      : "";

  const handleCopy = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const input = document.createElement("input");
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [shareUrl]);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all shadow-lg border ${
          boardId
            ? "bg-primary text-primary-foreground border-primary hover:opacity-90"
            : "bg-card text-foreground border-border hover:bg-muted"
        }`}
        aria-label="Share whiteboard"
      >
        <Share2 className="w-4 h-4" />
        <span>{boardId ? "Partage" : "Partager"}</span>
        {boardId && (
          <span className="flex items-center gap-1">
            {isConnected ? (
              <Wifi className="w-3.5 h-3.5" />
            ) : (
              <WifiOff className="w-3.5 h-3.5 opacity-60" />
            )}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute right-0 top-12 z-50 w-80 bg-card border border-border rounded-xl shadow-xl p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">
                Collaboration en temps réel
              </h3>
            </div>

            {!roomId ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Démarrez une session en direct et invitez d'autres personnes
                  en partageant le lien. Chacun peut dessiner, ajouter des
                  formes et voir les curseurs des autres en temps réel.
                </p>
                <button
                  onClick={() => {
                    onCreateRoom();
                    // Don't close dialog so user can copy link
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-all"
                >
                  <Share2 className="w-4 h-4" />
                  Démarrer une session en direct
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {isConnected ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      Connecté à la salle
                    </>
                  ) : (
                    <>
                      <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                      Connexion...
                    </>
                  )}
                </div>

                {/* Copy link */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-muted rounded-lg px-3 py-2 text-xs text-muted-foreground truncate font-mono">
                    {shareUrl}
                  </div>
                  <button
                    onClick={handleCopy}
                    className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-all shrink-0"
                    aria-label="Copy link"
                  >
                    {copied ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>

                <p className="text-xs text-muted-foreground">
                  Partagez ce lien avec d'autres personnes pour collaborer en
                  temps réel.
                </p>

                {/* Leave button */}
                <button
                  onClick={() => {
                    onLeaveRoom();
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-destructive/10 text-destructive rounded-lg text-sm font-medium hover:bg-destructive/20 transition-all"
                >
                  <WifiOff className="w-4 h-4" />
                  Fin de la session
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
