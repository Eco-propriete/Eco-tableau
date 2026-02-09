"use client";

import { useEffect, useState } from "react";
import type { RemoteCursor, RemoteUser } from "@/hooks/use-realtime";
import type { Camera } from "@/lib/whiteboard-types";

interface CursorOverlayProps {
  cursors: Map<string, RemoteCursor>;
  camera: Camera;
}

export function CursorOverlay({ cursors, camera }: CursorOverlayProps) {
  const cursorArray = Array.from(cursors.values());

  if (cursorArray.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {cursorArray.map((cursor) => {
        // Transform canvas coords to screen coords
        const screenX = cursor.x * camera.zoom + camera.x;
        const screenY = cursor.y * camera.zoom + camera.y;

        return (
          <div
            key={cursor.id}
            className="absolute transition-transform duration-75 ease-out"
            style={{
              transform: `translate(${screenX}px, ${screenY}px)`,
            }}
          >
            {/* Cursor arrow SVG */}
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              className="drop-shadow-md"
            >
              <path
                d="M5 3L19 12L12 13.5L9 21L5 3Z"
                fill={cursor.color}
                stroke="white"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
            {/* Name label */}
            <div
              className="absolute left-4 top-4 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium shadow-sm"
              style={{
                backgroundColor: cursor.color,
                color: "white",
              }}
            >
              {cursor.name}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface UserAvatarsProps {
  users: RemoteUser[];
  userName: string;
  userColor: string;
}

export function UserAvatars({ users, userName, userColor }: UserAvatarsProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Prevent hydration mismatch by rendering a placeholder on server
  if (!mounted) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex -space-x-2">
          <div className="w-7 h-7 rounded-full bg-muted ring-2 ring-card" />
        </div>
        <span className="text-xs text-muted-foreground">Loading...</span>
      </div>
    );
  }

  const allUsers = [{ id: "self", name: userName, color: userColor }, ...users];

  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-2">
        {allUsers.slice(0, 8).map((user) => (
          <div
            key={user.id}
            className="flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium ring-2 ring-card"
            style={{ backgroundColor: user.color, color: "white" }}
            title={user.id === "self" ? `${user.name}` : user.name}
          >
            {user.name.charAt(0).toUpperCase()}
          </div>
        ))}
        {allUsers.length > 8 && (
          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-muted text-muted-foreground text-xs font-medium ring-2 ring-card">
            +{allUsers.length - 8}
          </div>
        )}
      </div>
      <span className="text-xs text-muted-foreground">
        {allUsers.length} en ligne(s)
      </span>
    </div>
  );
}
