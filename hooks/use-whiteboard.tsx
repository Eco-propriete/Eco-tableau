"use client"

import React, { createContext, useContext, useReducer, useCallback, type ReactNode } from "react"
import type { WhiteboardState, WhiteboardAction, Camera, WhiteboardElement, Tool } from "@/lib/whiteboard-types"

const initialState: WhiteboardState = {
  elements: [],
  selectedIds: [],
  tool: "select",
  camera: { x: 0, y: 0, zoom: 1 },
  strokeColor: "#1E293B",
  fillColor: "transparent",
  strokeWidth: 2,
  fontSize: 16,
  history: [[]],
  historyIndex: 0,
  editingTextId: null,
}

function whiteboardReducer(state: WhiteboardState, action: WhiteboardAction): WhiteboardState {
  switch (action.type) {
    case "SET_TOOL":
      return { ...state, tool: action.tool, selectedIds: [], editingTextId: null }

    case "ADD_ELEMENT":
      return {
        ...state,
        elements: [...state.elements, action.element],
      }

    case "UPDATE_ELEMENT":
      return {
        ...state,
        elements: state.elements.map((el) =>
          el.id === action.id ? { ...el, ...action.updates } : el
        ),
      }

    case "DELETE_ELEMENTS":
      return {
        ...state,
        elements: state.elements.filter((el) => !action.ids.includes(el.id)),
        selectedIds: state.selectedIds.filter((id) => !action.ids.includes(id)),
      }

    case "SET_SELECTED_IDS":
      return { ...state, selectedIds: action.ids }

    case "SET_CAMERA":
      return { ...state, camera: { ...state.camera, ...action.camera } }

    case "SET_STROKE_COLOR":
      return { ...state, strokeColor: action.color }

    case "SET_FILL_COLOR":
      return { ...state, fillColor: action.color }

    case "SET_STROKE_WIDTH":
      return { ...state, strokeWidth: action.width }

    case "SET_FONT_SIZE":
      return { ...state, fontSize: action.size }

    case "PUSH_HISTORY": {
      const newHistory = state.history.slice(0, state.historyIndex + 1)
      newHistory.push(JSON.parse(JSON.stringify(state.elements)))
      return {
        ...state,
        history: newHistory,
        historyIndex: newHistory.length - 1,
      }
    }

    case "UNDO": {
      if (state.historyIndex <= 0) return state
      const newIndex = state.historyIndex - 1
      return {
        ...state,
        elements: JSON.parse(JSON.stringify(state.history[newIndex])),
        historyIndex: newIndex,
        selectedIds: [],
      }
    }

    case "REDO": {
      if (state.historyIndex >= state.history.length - 1) return state
      const newIndex = state.historyIndex + 1
      return {
        ...state,
        elements: JSON.parse(JSON.stringify(state.history[newIndex])),
        historyIndex: newIndex,
        selectedIds: [],
      }
    }

    case "SET_EDITING_TEXT_ID":
      return { ...state, editingTextId: action.id }

    case "SET_ELEMENTS":
      return { ...state, elements: action.elements }

    default:
      return state
  }
}

interface WhiteboardContextValue {
  state: WhiteboardState
  dispatch: React.Dispatch<WhiteboardAction>
  setTool: (tool: Tool) => void
  addElement: (element: WhiteboardElement) => void
  updateElement: (id: string, updates: Partial<WhiteboardElement>) => void
  deleteElements: (ids: string[]) => void
  setSelectedIds: (ids: string[]) => void
  setCamera: (camera: Partial<Camera>) => void
  pushHistory: () => void
  undo: () => void
  redo: () => void
  screenToCanvas: (screenX: number, screenY: number) => { x: number; y: number }
}

const WhiteboardContext = createContext<WhiteboardContextValue | null>(null)

export function WhiteboardProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(whiteboardReducer, initialState)

  const setTool = useCallback((tool: Tool) => dispatch({ type: "SET_TOOL", tool }), [])
  const addElement = useCallback(
    (element: WhiteboardElement) => dispatch({ type: "ADD_ELEMENT", element }),
    []
  )
  const updateElement = useCallback(
    (id: string, updates: Partial<WhiteboardElement>) =>
      dispatch({ type: "UPDATE_ELEMENT", id, updates }),
    []
  )
  const deleteElements = useCallback(
    (ids: string[]) => dispatch({ type: "DELETE_ELEMENTS", ids }),
    []
  )
  const setSelectedIds = useCallback(
    (ids: string[]) => dispatch({ type: "SET_SELECTED_IDS", ids }),
    []
  )
  const setCamera = useCallback(
    (camera: Partial<Camera>) => dispatch({ type: "SET_CAMERA", camera }),
    []
  )
  const pushHistory = useCallback(() => dispatch({ type: "PUSH_HISTORY" }), [])
  const undo = useCallback(() => dispatch({ type: "UNDO" }), [])
  const redo = useCallback(() => dispatch({ type: "REDO" }), [])

  const screenToCanvas = useCallback(
    (screenX: number, screenY: number) => {
      return {
        x: (screenX - state.camera.x) / state.camera.zoom,
        y: (screenY - state.camera.y) / state.camera.zoom,
      }
    },
    [state.camera]
  )

  return (
    <WhiteboardContext.Provider
      value={{
        state,
        dispatch,
        setTool,
        addElement,
        updateElement,
        deleteElements,
        setSelectedIds,
        setCamera,
        pushHistory,
        undo,
        redo,
        screenToCanvas,
      }}
    >
      {children}
    </WhiteboardContext.Provider>
  )
}

export function useWhiteboard() {
  const context = useContext(WhiteboardContext)
  if (!context) {
    throw new Error("useWhiteboard must be used within a WhiteboardProvider")
  }
  return context
}
