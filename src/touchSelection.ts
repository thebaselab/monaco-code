import * as monaco from "monaco-editor";

const LONG_PRESS_DELAY_MS = 450;
const MOVE_THRESHOLD_PX = 12;
const MENU_ACTION_EVENT = "codeapp-touch-selection-menu-action";

type HandleKind = "start" | "end";
type MenuAction = "copy" | "cut" | "paste" | "selectAll";

function distanceBetween(
  first: PointerEvent,
  second: PointerEvent
): number {
  return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
}

export function installTouchSelection(
  editor: monaco.editor.IStandaloneCodeEditor
): monaco.IDisposable {
  const editorNode = editor.getDomNode();
  if (!editorNode) {
    return { dispose: () => undefined };
  }

  const abortController = new AbortController();
  const overlay = document.createElement("div");
  overlay.className = "touch-selection-overlay";

  const menu = document.createElement("div");
  menu.className = "touch-selection-menu";
  menu.hidden = true;

  const startHandle = document.createElement("button");
  startHandle.className = "touch-selection-handle";
  startHandle.type = "button";
  startHandle.setAttribute("aria-label", "Selection start");

  const endHandle = document.createElement("button");
  endHandle.className = "touch-selection-handle";
  endHandle.type = "button";
  endHandle.setAttribute("aria-label", "Selection end");

  for (const [action, label] of [
    ["copy", "Copy"],
    ["cut", "Cut"],
    ["paste", "Paste"],
    ["selectAll", "Select All"],
  ] as const) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.dataset.action = action;
    menu.appendChild(button);
  }

  overlay.append(startHandle, endHandle, menu);
  editorNode.appendChild(overlay);

  let pressStart: PointerEvent | undefined;
  let pressAnchor: monaco.IPosition | undefined;
  let pressTimer: number | undefined;
  let selectingWithPress = false;
  let draggedHandle: HandleKind | undefined;
  let handlesVisible = false;
  let nativeMenuRequested = false;
  let menuPresented = false;

  const clearPress = () => {
    if (pressTimer !== undefined) {
      window.clearTimeout(pressTimer);
      pressTimer = undefined;
    }
    pressStart = undefined;
    pressAnchor = undefined;
  };

  const positionAt = (event: PointerEvent): monaco.IPosition | undefined =>
    editor.getTargetAtClientPoint(event.clientX, event.clientY)?.position;

  const setSelection = (
    anchor: monaco.IPosition,
    position: monaco.IPosition
  ) => {
    editor.setSelection(
      {
        selectionStartLineNumber: anchor.lineNumber,
        selectionStartColumn: anchor.column,
        positionLineNumber: position.lineNumber,
        positionColumn: position.column,
      },
      "touch-selection"
    );
  };

  const selectionEndpoints = () => {
    const selection = editor.getSelection();
    if (!selection || selection.isEmpty()) return undefined;
    const range = new monaco.Range(
      selection.selectionStartLineNumber,
      selection.selectionStartColumn,
      selection.positionLineNumber,
      selection.positionColumn
    );
    return {
      start: range.getStartPosition(),
      end: range.getEndPosition(),
    };
  };

  const hideMenu = () => {
    menu.hidden = true;
    nativeMenuRequested = false;
    menuPresented = false;
  };

  const renderHandles = () => {
    const endpoints = selectionEndpoints();
    if (!handlesVisible || !endpoints) {
      overlay.hidden = true;
      hideMenu();
      return;
    }

    const startPosition = editor.getScrolledVisiblePosition(endpoints.start);
    const endPosition = editor.getScrolledVisiblePosition(endpoints.end);
    if (!startPosition || !endPosition) {
      overlay.hidden = true;
      hideMenu();
      return;
    }

    startHandle.style.left = `${startPosition.left}px`;
    startHandle.style.top = `${startPosition.top + startPosition.height}px`;
    endHandle.style.left = `${endPosition.left}px`;
    endHandle.style.top = `${endPosition.top + endPosition.height}px`;
    overlay.hidden = false;
  };

  const executeMenuAction = (action: MenuAction) => {
    const command = {
      copy: "editor.action.clipboardCopyAction",
      cut: "editor.action.clipboardCutAction",
      paste: "editor.action.clipboardPasteAction",
      selectAll: "editor.action.selectAll",
    }[action];
    editor.focus();
    editor.trigger("touch-selection-menu", command);
    hideMenu();
  };

  const showMenu = () => {
    if (menuPresented) return;

    const endpoints = selectionEndpoints();
    if (!endpoints) return;

    const endPosition = editor.getScrolledVisiblePosition(endpoints.end);
    if (!endPosition) return;

    const nativeHandler = (window as any).webkit?.messageHandlers
      ?.toggleMessageHandler;
    if (nativeHandler) {
      nativeMenuRequested = true;
      menuPresented = true;
      nativeHandler.postMessage({
        Event: "Touch Selection Menu",
        SelectedText: editor.getModel()?.getValueInRange(editor.getSelection()!),
        Selection: editor.getSelection(),
        Actions: ["copy", "cut", "paste", "selectAll"],
      });
      return;
    }

    menu.style.left = `${endPosition.left}px`;
    menu.style.top = `${Math.max(0, endPosition.top - 44)}px`;
    menu.hidden = false;
    menuPresented = true;
  };

  const selectWordAt = (position: monaco.IPosition) => {
    const model = editor.getModel();
    const word = model?.getWordAtPosition(position);
    if (!word) {
      setSelection(position, position);
      return;
    }
    setSelection(
      { lineNumber: position.lineNumber, column: word.startColumn },
      { lineNumber: position.lineNumber, column: word.endColumn }
    );
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType !== "touch" || draggedHandle) return;

    const position = positionAt(event);
    if (!position) return;

    pressStart = event;
    pressAnchor = position;
    pressTimer = window.setTimeout(() => {
      if (!pressAnchor) return;
      pressTimer = undefined;
      pressStart = undefined;
      selectingWithPress = true;
      handlesVisible = true;
      selectWordAt(pressAnchor);
      editor.focus();
      renderHandles();
      showMenu();
    }, LONG_PRESS_DELAY_MS);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerType !== "touch") return;

    if (pressStart && distanceBetween(pressStart, event) > MOVE_THRESHOLD_PX) {
      clearPress();
    }

    const position = positionAt(event);
    if (!position) return;

    if (draggedHandle) {
      const endpoints = selectionEndpoints();
      if (!endpoints) return;
      event.preventDefault();
      setSelection(
        draggedHandle === "start" ? position : endpoints.start,
        draggedHandle === "end" ? position : endpoints.end
      );
      renderHandles();
      hideMenu();
      return;
    }

    if (selectingWithPress && pressAnchor) {
      event.preventDefault();
      setSelection(pressAnchor, position);
      renderHandles();
      hideMenu();
    }
  };

  const onPointerUp = (event: PointerEvent) => {
    if (event.pointerType !== "touch") return;
    clearPress();
    selectingWithPress = false;
    if (!draggedHandle && handlesVisible) showMenu();
    draggedHandle = undefined;
  };

  const beginHandleDrag = (kind: HandleKind, event: PointerEvent) => {
    if (event.pointerType !== "touch") return;
    draggedHandle = kind;
    selectingWithPress = false;
    clearPress();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
    hideMenu();
  };

  const onMenuAction = (event: Event) => {
    const action = (event as CustomEvent<MenuAction>).detail;
    if (!nativeMenuRequested || !["copy", "cut", "paste", "selectAll"].includes(action)) {
      return;
    }
    executeMenuAction(action);
  };

  editorNode.addEventListener("pointerdown", onPointerDown, {
    signal: abortController.signal,
  });
  editorNode.addEventListener("pointermove", onPointerMove, {
    passive: false,
    signal: abortController.signal,
  });
  editorNode.addEventListener("pointerup", onPointerUp, {
    signal: abortController.signal,
  });
  editorNode.addEventListener("pointercancel", onPointerUp, {
    signal: abortController.signal,
  });
  startHandle.addEventListener(
    "pointerdown",
    (event) => beginHandleDrag("start", event),
    { signal: abortController.signal }
  );
  endHandle.addEventListener(
    "pointerdown",
    (event) => beginHandleDrag("end", event),
    { signal: abortController.signal }
  );
  menu.addEventListener(
    "pointerdown",
    (event) => {
      event.preventDefault();
      event.stopPropagation();
    },
    { signal: abortController.signal }
  );
  menu.addEventListener(
    "click",
    (event) => {
      const action = (event.target as HTMLElement).closest<HTMLButtonElement>("button")
        ?.dataset.action as MenuAction | undefined;
      if (action) executeMenuAction(action);
    },
    { signal: abortController.signal }
  );
  window.addEventListener(MENU_ACTION_EVENT, onMenuAction, {
    signal: abortController.signal,
  });

  const selectionListener = editor.onDidChangeCursorSelection(renderHandles);
  const scrollListener = editor.onDidScrollChange(renderHandles);
  const disposeListener = editor.onDidDispose(() => controller.dispose());
  const controller: monaco.IDisposable = {
    dispose: () => {
      clearPress();
      hideMenu();
      abortController.abort();
      selectionListener.dispose();
      scrollListener.dispose();
      disposeListener.dispose();
      overlay.remove();
    },
  };

  return controller;
}