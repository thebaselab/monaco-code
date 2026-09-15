import * as monaco from "monaco-editor";
import { decodeBase64 } from "./utilities";
import { changeEditorThemeForColorScheme } from "./theme";
import { computeDiffForURI } from "./diff";
import { CodeStorage } from "./storage";

let states: { [key: string]: monaco.editor.ICodeEditorViewState } = {};

export function setModel(base64Url: string) {
  if (!CodeStorage.editor) return;
  const model = monaco.editor.getModel(
    monaco.Uri.parse(decodeBase64(base64Url))
  );
  if (!model) return;
  CodeStorage.editor.setModel(model);
}

export function onRequestNewTextModel(
  base64Url: string,
  base64Content: string
) {
  if (!CodeStorage.editor) return;

  const existingModelUri = CodeStorage.editor.getModel()?.uri.toString();
  const state = CodeStorage.editor.saveViewState();
  if (existingModelUri && state) {
    states[existingModelUri] = state;
  }

  const newModelUri = monaco.Uri.parse(decodeBase64(base64Url));
  const existingModel = monaco.editor.getModel(newModelUri);
  const newModelContent = decodeBase64(base64Content);

  if (existingModel) {
    if (existingModel.getValue() !== newModelContent) {
      existingModel.setValue(newModelContent);
    }
    if (CodeStorage.editor.getModel() !== existingModel) {
      CodeStorage.editor.setModel(existingModel);
    }
  } else {
    const newModel = monaco.editor.createModel(
      newModelContent,
      undefined,
      newModelUri
    );
    CodeStorage.editor.setModel(newModel);
  }
}

export function renameModel(base64OldUrl: string, base64NewUrl: string) {
  const oldURL = decodeBase64(base64OldUrl);
  const newURL = decodeBase64(base64NewUrl);

  const model1 = monaco.editor.getModel(monaco.Uri.parse(oldURL));
  if (!model1) return;
  const model2 = monaco.editor.createModel(
    model1.getValue(),
    undefined,
    monaco.Uri.parse(newURL)
  );

  const cm2 = (model2 as any)._commandManager;
  const cm1 = (model1 as any)._commandManager;

  cm2.currentOpenStackElement = cm1.currentOpenStackElement;
  cm2.past = cm1.past;
  cm2.future = cm1.future;
  model1.dispose();
}

export function setValueForModel(base64Url: string, base64Content: string) {
  const url = decodeBase64(base64Url);
  const model = monaco.editor.getModel(monaco.Uri.parse(url));
  if (!model || !CodeStorage.editor) return;

  if (CodeStorage.editor.getModel() === model) {
    CodeStorage.editor.executeEdits("code.app.native", [
      {
        range: model.getFullModelRange(),
        text: decodeBase64(base64Content),
        forceMoveMarkers: true,
      },
    ]);
  } else {
    model.setValue(decodeBase64(base64Content));
  }
}

export function switchToDiffView(
  base64OriginalText: string,
  base64ModifiedText: string,
  base64UrlOriginal: string,
  base64UrlModified: string
) {
  if (!CodeStorage.editor) return;

  const originalText = decodeBase64(base64OriginalText);
  const modifiedText = decodeBase64(base64ModifiedText);
  const originalUrl = decodeBase64(base64UrlOriginal);
  const modifiedUrl = decodeBase64(base64UrlModified);

  const originalUri = monaco.Uri.parse(originalUrl);
  const modifiedUri = monaco.Uri.parse(modifiedUrl);

  monaco.editor.getModel(originalUri)?.dispose();
  monaco.editor.getModel(modifiedUri)?.dispose();

  const originalModel = monaco.editor.createModel(
    originalText,
    undefined,
    originalUri
  );

  const modifiedModel = monaco.editor.createModel(
    modifiedText,
    undefined,
    modifiedUri
  );

  CodeStorage.editor.dispose();
  CodeStorage.editor = undefined;

  CodeStorage.diffEditor = monaco.editor.createDiffEditor(
    document.getElementById("monaco-editor-root")!,
    {
      enableSplitViewResizing: false,
      automaticLayout: true,
      renderSideBySide: true,
    }
  );
  CodeStorage.diffEditor.setModel({
    original: originalModel,
    modified: modifiedModel,
  });
  applyListeners(CodeStorage.diffEditor.getOriginalEditor());
  applyListeners(CodeStorage.diffEditor.getModifiedEditor());
}

export function switchToNormalView() {
  CodeStorage.diffEditor?.dispose();
  CodeStorage.diffEditor = undefined;
  CodeStorage.editor = monaco.editor.create(
    document.getElementById("monaco-editor-root")!,
    {
      theme: "vs-dark",
      automaticLayout: true,
      unicodeHighlight: {
        ambiguousCharacters: false,
      },
    }
  );
  CodeStorage.editor.getModel()?.dispose();
  applyListeners(CodeStorage.editor);
}

export function applyListeners(instance: monaco.editor.IStandaloneCodeEditor) {
  changeEditorThemeForColorScheme();

  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", (_e) => {
      changeEditorThemeForColorScheme();
    });

  (window as any).webkit?.messageHandlers?.toggleMessageHandler?.postMessage({
    Event: "Editor Initialising",
  });

  instance.onDidChangeModel((event) => {
    if (!event.newModelUrl || !CodeStorage.editor) return;
    const newModel = (event.newModelUrl as any)._formatted;

    if (newModel in states) {
      CodeStorage.editor.restoreViewState(states[newModel]);
    }

    (window as any).webkit.messageHandlers.toggleMessageHandler.postMessage({
      Event: "Request Diff Update",
      URI: newModel,
    });

    const position = instance.getPosition();
    if (!position) return;

    (window as any).webkit.messageHandlers.toggleMessageHandler.postMessage({
      Event: "Crusor Position changed",
      Column: position.column,
      lineNumber: position.lineNumber,
    });

    const inputareaElement = document.getElementsByClassName("inputarea")[0];
    inputareaElement?.addEventListener("focus", (_event) => {
      (window as any).webkit.messageHandlers.toggleMessageHandler.postMessage({
        Event: "focus",
      });
    });
  });

  instance.onDidChangeCursorPosition((_event) => {
    const position = instance.getPosition();
    if (!position) return;
    (window as any).webkit.messageHandlers.toggleMessageHandler.postMessage({
      Event: "Crusor Position changed",
      Column: position.column,
      lineNumber: position.lineNumber,
    });
  });

  instance.onDidChangeModelContent((event) => {
    const currentModel = instance.getModel();
    if (!currentModel) return;

    const modelPath = (currentModel as any)._associatedResource._formatted;
    const originalUri = monaco.Uri.parse("original://" + modelPath);
    if (monaco.editor.getModel(originalUri)) {
      computeDiffForURI(modelPath);
    }

    if (event.isFlush) {
      return;
    }

    const versionID = currentModel.getAlternativeVersionId();
    const content = instance.getValue();

    let startLineNumber = Number.NEGATIVE_INFINITY;
    let endLineNumber = Number.POSITIVE_INFINITY;
    event.changes.forEach((change) => {
      if (change.range.startLineNumber > startLineNumber) {
        startLineNumber = change.range.startLineNumber;
      }
      if (change.range.endLineNumber < endLineNumber) {
        endLineNumber = change.range.endLineNumber;
      }
    });
    const startOffset = currentModel.getOffsetAt({
      column: 0,
      lineNumber: startLineNumber,
    });

    const numberOfLines = currentModel.getLineCount();

    const endOffset =
      numberOfLines < endLineNumber
        ? startOffset
        : currentModel.getOffsetAt({
            column: currentModel.getLineLength(endLineNumber),
            lineNumber: endLineNumber,
          });

    (window as any).webkit.messageHandlers.toggleMessageHandler.postMessage({
      Event: "Content changed",
      VersionID: versionID,
      URI: modelPath,
      currentContent: content,
      startOffset: startOffset,
      endOffset: endOffset,
    });
  });

  monaco.editor.onDidChangeMarkers((_markers) => {
    (window as any).webkit.messageHandlers.toggleMessageHandler.postMessage({
      Event: "Markers updated",
      Markers: monaco.editor.getModelMarkers({}),
    });
  });

  monaco.editor.onWillDisposeModel((model) => {
    monaco.editor.setModelMarkers(model, "code.app.native", []);
  });

  (
    instance.getContribution("editor.linkDetector") as any
  ).openerService._defaultExternalOpener.openExternal = (url: string) => {
    (window as any).webkit.messageHandlers.toggleMessageHandler.postMessage({
      Event: "Open URL",
      url: url,
    });
  };
}
