"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { WhiteboardProvider, useWhiteboard } from "@/hooks/use-whiteboard";
import { useTheme } from "@/hooks/use-theme";
import {
  DEFAULT_STROKE_LIGHT,
  DEFAULT_STROKE_DARK,
} from "@/lib/whiteboard-types";
import { useRealtime } from "@/hooks/use-realtime";

import { Suspense } from "react";
import { TopBar } from "@/components/whiteboard/top-bar";
import { Toolbar } from "@/components/whiteboard/toolbar";
import { StylePanel } from "@/components/whiteboard/style-panel";
import { Canvas } from "@/components/whiteboard/canvas";
import { Minimap } from "@/components/whiteboard/minimap";
import { ZoomControls } from "@/components/whiteboard/zoom-controls";
import { CursorOverlay } from "@/components/whiteboard/cursor-overlay";

function generateRoomId() {
  return Math.random().toString(36).substring(2, 10);
}

function WhiteboardApp() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [roomId, setRoomId] = useState<string | null>(searchParams.get("room"));

  const {
    remoteCursors,
    remoteUsers,
    isConnected,
    broadcastCursor,
    broadcastElements,
    onRemoteElements,
    userName,
    userColor,
  } = useRealtime(roomId);

  const handleCreateRoom = useCallback(() => {
    const newRoomId = generateRoomId();
    setRoomId(newRoomId);
    const url = new URL(window.location.href);
    url.searchParams.set("room", newRoomId);
    router.replace(url.pathname + url.search);
  }, [router]);

  const handleLeaveRoom = useCallback(() => {
    setRoomId(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("room");
    router.replace(url.pathname);
  }, [router]);

  return (
    <WhiteboardProvider>
      <ThemeStrokeSync />
      <WhiteboardSync
        roomId={roomId}
        broadcastCursor={broadcastCursor}
        broadcastElements={broadcastElements}
        onRemoteElements={onRemoteElements}
      />
      <main className="h-screen w-screen overflow-hidden bg-background relative">
        <TopBar
          roomId={roomId}
          isConnected={isConnected}
          remoteUsers={remoteUsers}
          userName={userName}
          userColor={userColor}
          onCreateRoom={handleCreateRoom}
          onLeaveRoom={handleLeaveRoom}
        />
        <Toolbar />
        <StylePanel />
        <div className="relative w-full h-full">
          <Canvas broadcastCursor={broadcastCursor} roomId={roomId} />
          <CursorOverlayWrapper remoteCursors={remoteCursors} />
        </div>
        <Minimap />
        <ZoomControls />
      </main>
    </WhiteboardProvider>
  );
}

/** Syncs the default stroke color with the active theme */
function ThemeStrokeSync() {
  const { theme } = useTheme();
  const { state, dispatch } = useWhiteboard();

  useEffect(() => {
    const isDefault =
      state.strokeColor === DEFAULT_STROKE_LIGHT ||
      state.strokeColor === DEFAULT_STROKE_DARK;
    if (isDefault) {
      dispatch({
        type: "SET_STROKE_COLOR",
        color: theme === "dark" ? DEFAULT_STROKE_DARK : DEFAULT_STROKE_LIGHT,
      });
    }
  }, [theme]); // only react to theme changes

  return null;
}

/** Wrapper that reads the camera from context for cursor overlay */
function CursorOverlayWrapper({
  remoteCursors,
}: {
  remoteCursors: Map<string, import("@/hooks/use-realtime").RemoteCursor>;
}) {
  const { state } = useWhiteboard();
  return <CursorOverlay cursors={remoteCursors} camera={state.camera} />;
}

/** Syncs whiteboard elements with realtime broadcast */
function WhiteboardSync({
  roomId,
  broadcastCursor,
  broadcastElements,
  onRemoteElements,
}: {
  roomId: string | null;
  broadcastCursor: (x: number, y: number) => void;
  broadcastElements: (
    elements: import("@/lib/whiteboard-types").WhiteboardElement[],
  ) => void;
  onRemoteElements: (
    callback: (
      elements: import("@/lib/whiteboard-types").WhiteboardElement[],
    ) => void,
  ) => void;
}) {
  const { state, dispatch } = useWhiteboard();
  const prevElementsRef = useRef<string>("");
  const isRemoteUpdateRef = useRef(false);

  // Broadcast element changes when local state changes
  useEffect(() => {
    if (!roomId) return;
    const serialized = JSON.stringify(state.elements);
    if (serialized !== prevElementsRef.current && !isRemoteUpdateRef.current) {
      prevElementsRef.current = serialized;
      broadcastElements(state.elements);
    }
    isRemoteUpdateRef.current = false;
  }, [state.elements, roomId, broadcastElements]);

  // Listen for remote element changes
  useEffect(() => {
    onRemoteElements((elements) => {
      isRemoteUpdateRef.current = true;
      prevElementsRef.current = JSON.stringify(elements);
      dispatch({ type: "SET_ELEMENTS", elements });
    });
  }, [onRemoteElements, dispatch]);

  return null;
}

export default function Home() {
  return (
    <Suspense>
      <WhiteboardApp />
    </Suspense>
  );
}
