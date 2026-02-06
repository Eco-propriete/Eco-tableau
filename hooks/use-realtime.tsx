"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { WhiteboardElement } from "@/lib/whiteboard-types";
import type { RealtimeChannel } from "@supabase/supabase-js";

const CURSOR_COLORS = [
  "#2563EB",
  "#DC2626",
  "#16A34A",
  "#CA8A04",
  "#9333EA",
  "#EC4899",
  "#F97316",
  "#0891B2",
];

const ANIMAL_NAMES = ["Vous", "Invité"];

function getRandomName() {
  return ANIMAL_NAMES[Math.floor(Math.random() * ANIMAL_NAMES.length)];
}

function getRandomColor() {
  return CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)];
}

export interface RemoteCursor {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  lastSeen: number;
}

export interface RemoteUser {
  id: string;
  name: string;
  color: string;
}

export function useRealtime(roomId: string | null) {
  const [remoteCursors, setRemoteCursors] = useState<Map<string, RemoteCursor>>(
    new Map(),
  );
  const [remoteUsers, setRemoteUsers] = useState<RemoteUser[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const userIdRef = useRef<string>(
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).substring(2)}`,
  );
  const userNameRef = useRef<string>(getRandomName());
  const userColorRef = useRef<string>(getRandomColor());
  const lastBroadcastRef = useRef<number>(0);

  // Cleanup stale cursors periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setRemoteCursors((prev) => {
        const now = Date.now();
        const next = new Map(prev);
        let changed = false;
        for (const [key, cursor] of next) {
          if (now - cursor.lastSeen > 10000) {
            next.delete(key);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!roomId) {
      setIsConnected(false);
      setRemoteCursors(new Map());
      setRemoteUsers([]);
      return;
    }

    const supabase = createClient();
    const channel = supabase.channel(`room:${roomId}`, {
      config: {
        presence: {
          key: userIdRef.current,
        },
        broadcast: {
          self: false,
        },
      },
    });

    channelRef.current = channel;

    // Presence: track users
    channel.on("presence", { event: "sync" }, () => {
      const presenceState = channel.presenceState();
      const users: RemoteUser[] = [];
      for (const [key, entries] of Object.entries(presenceState)) {
        if (key === userIdRef.current) continue;
        const entry = (entries as any[])[0];
        if (entry) {
          users.push({
            id: key,
            name: entry.name ?? "Anonymous",
            color: entry.color ?? "#94A3B8",
          });
        }
      }
      setRemoteUsers(users);
    });

    // Broadcast: cursor movement
    channel.on("broadcast", { event: "cursor" }, (payload) => {
      const data = payload.payload as {
        id: string;
        name: string;
        color: string;
        x: number;
        y: number;
      };
      if (data.id === userIdRef.current) return;
      setRemoteCursors((prev) => {
        const next = new Map(prev);
        next.set(data.id, {
          ...data,
          lastSeen: Date.now(),
        });
        return next;
      });
    });

    // Broadcast: element changes
    channel.on("broadcast", { event: "elements" }, (payload) => {
      const data = payload.payload as {
        senderId: string;
        elements: WhiteboardElement[];
      };
      if (data.senderId === userIdRef.current) return;
      // We'll use a callback pattern to sync elements
      if (onRemoteElementsRef.current) {
        onRemoteElementsRef.current(data.elements);
      }
    });

    // Broadcast: cursor leave
    channel.on("broadcast", { event: "cursor_leave" }, (payload) => {
      const data = payload.payload as { id: string };
      setRemoteCursors((prev) => {
        const next = new Map(prev);
        next.delete(data.id);
        return next;
      });
    });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        setIsConnected(true);
        await channel.track({
          name: userNameRef.current,
          color: userColorRef.current,
        });
      }
    });

    return () => {
      channel.send({
        type: "broadcast",
        event: "cursor_leave",
        payload: { id: userIdRef.current },
      });
      supabase.removeChannel(channel);
      channelRef.current = null;
      setIsConnected(false);
    };
  }, [roomId]);

  const onRemoteElementsRef = useRef<
    ((elements: WhiteboardElement[]) => void) | null
  >(null);

  const onRemoteElements = useCallback(
    (callback: (elements: WhiteboardElement[]) => void) => {
      onRemoteElementsRef.current = callback;
    },
    [],
  );

  const broadcastCursor = useCallback(
    (x: number, y: number) => {
      if (!channelRef.current || !roomId) return;
      // Throttle to ~30fps
      const now = Date.now();
      if (now - lastBroadcastRef.current < 33) return;
      lastBroadcastRef.current = now;

      channelRef.current.send({
        type: "broadcast",
        event: "cursor",
        payload: {
          id: userIdRef.current,
          name: userNameRef.current,
          color: userColorRef.current,
          x,
          y,
        },
      });
    },
    [roomId],
  );

  const broadcastElements = useCallback(
    (elements: WhiteboardElement[]) => {
      if (!channelRef.current || !roomId) return;
      channelRef.current.send({
        type: "broadcast",
        event: "elements",
        payload: {
          senderId: userIdRef.current,
          elements,
        },
      });
    },
    [roomId],
  );

  return {
    remoteCursors,
    remoteUsers,
    isConnected,
    broadcastCursor,
    broadcastElements,
    onRemoteElements,
    userId: userIdRef.current,
    userName: userNameRef.current,
    userColor: userColorRef.current,
  };
}
