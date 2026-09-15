import * as monaco from "monaco-editor";
import { Uri as URI } from "vscode";
import {
  // @ts-ignore-error
  DiffComputer,
  IChange,
} from "@codingame/monaco-vscode-api/vscode/vs/editor/common/diff/legacyLinesDiffComputer";
import { decodeBase64 } from "./utilities";
import { CodeStorage } from "./storage";

let previousDecoration: string[] = [];

/**
 * Compute dirty diff between two models
 * From: https://github.com/microsoft/vscode/blob/c15cb13a383dc9ff2dc0828152e374a6b9ecc2b3/src/vs/editor/common/services/editorSimpleWorker.ts
 */
async function computeDirtyDiff(
  originalUrl: string,
  modifiedUrl: string,
  ignoreTrimWhitespace: boolean
): Promise<IChange[] | null> {
  const original = monaco.editor.getModel(URI.parse(originalUrl));
  const modified = monaco.editor.getModel(URI.parse(modifiedUrl));
  if (!original || !modified) {
    return null;
  }

  const originalLines = original.getLinesContent();
  const modifiedLines = modified.getLinesContent();
  const diffComputer = new DiffComputer(originalLines, modifiedLines, {
    shouldComputeCharChanges: false,
    shouldPostProcessCharChanges: false,
    shouldIgnoreTrimWhitespace: ignoreTrimWhitespace,
    shouldMakePrettyDiff: true,
    maxComputationTime: 1000,
  });
  return diffComputer.computeDiff().changes;
}

export function computeDiffForURI(uri: string) {
  computeDirtyDiff("original://" + uri, uri, true).then(
    function (changes) {
      if (!changes) return;
      let jsonChanges: monaco.editor.IModelDeltaDecoration[] = [];

      for (const change of changes) {
        var decoration = {};

        const startLineNumber = change.modifiedStartLineNumber;
        const endLineNumber = change.modifiedEndLineNumber || startLineNumber;

        switch (getChangeType(change)) {
          case "modified":
            decoration = {
              range: new monaco.Range(startLineNumber, 1, endLineNumber, 1),
              options: {
                isWholeLine: true,
                linesDecorationsClassName: "modifiedBackground",
                minimap: {
                  color: "#66afe0",
                  darkColor: "#0c7d9d",
                  position: 2,
                },
              },
              // Position: 1 - Inline, 2 - Gutter
            };
            break;
          case "added":
            decoration = {
              range: new monaco.Range(startLineNumber, 1, endLineNumber, 1),
              options: {
                isWholeLine: true,
                linesDecorationsClassName: "addedBackground",
                minimap: {
                  color: "#81b88b",
                  darkColor: "#587c0c",
                  position: 2,
                },
              },
            };
            break;
          case "deleted":
            decoration = {
              range: new monaco.Range(
                startLineNumber,
                Number.MAX_VALUE,
                endLineNumber,
                Number.MAX_VALUE
              ),
              options: {
                isWholeLine: false,
                linesDecorationsClassName: "deletedBackground",
                minimap: {
                  color: "#ca4b51",
                  darkColor: "#94151b",
                  position: 2,
                },
              },
            };
            break;
        }
        jsonChanges.push(decoration as any);
      }
      if (!CodeStorage.editor) return;

      previousDecoration = CodeStorage.editor.deltaDecorations(
        previousDecoration,
        jsonChanges
      );
    },
    function (error) {
      console.log(error);
    }
  );
}

export function provideOriginalTextForUri(uri: string, base64Content: string) {
  const decodedContent = decodeBase64(base64Content);

  const originalUri = monaco.Uri.parse("original://" + uri);
  const model = monaco.editor.getModel(originalUri);

  if (model) {
    model.setValue(decodedContent);
  } else {
    monaco.editor.createModel(decodedContent, "plaintext", originalUri);
  }

  computeDiffForURI(uri);
}

function getChangeType(change: IChange) {
  if (change.originalEndLineNumber === 0) {
    return "added"; // Add
  } else if (change.modifiedEndLineNumber === 0) {
    return "deleted"; // Delete
  } else {
    return "modified"; // Modify
  }
}

export function invalidateDecorations() {
  if (!CodeStorage.editor) return;
  previousDecoration = CodeStorage.editor.deltaDecorations(
    previousDecoration,
    []
  );
}
