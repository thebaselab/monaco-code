/* --------------------------------------------------------------------------------------------
 * Copyright (c) 2024 TypeFox and others.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as monaco from "monaco-editor";
import { initServices } from "monaco-languageclient/vscode/services";
import getThemeServiceOverride from "@codingame/monaco-vscode-theme-service-override";
import getTextmateServiceOverride from "@codingame/monaco-vscode-textmate-service-override";
import "@codingame/monaco-vscode-theme-defaults-default-extension";
import "@codingame/monaco-vscode-all-language-default-extensions";
import getExtensionServiceOverride from "@codingame/monaco-vscode-extensions-service-override";
import getConfigurationServiceOverride from "@codingame/monaco-vscode-configuration-service-override";
import { useWorkerFactory } from "monaco-languageclient/workerFactory";
import {
  connectMonacoToLanguageServer,
  disconnectLanguageServer,
  isLanguageServiceConnected,
} from "./languageService";
import { Uri } from "vscode";
import { invalidateDecorations, provideOriginalTextForUri } from "./diff";
// @ts-ignore-error
import { EditorContributionRegistry } from "@codingame/monaco-vscode-api/vscode/vs/editor/browser/editorExtensions";
import { applyBase64AsTheme } from "./theme";
import {
  applyListeners,
  onRequestNewTextModel,
  renameModel,
  setModel,
  setValueForModel,
  switchToDiffView,
  switchToNormalView,
} from "./common";
import { CodeStorage } from "./storage";
import { toggleVimMode } from "./vim";
import { workerConfig } from "./utilities";

declare global {
  interface Window {
    monaco: typeof monaco;
    editor: monaco.editor.IStandaloneCodeEditor | undefined;

    // common features
    setModel: (base64Url: string) => void;
    onRequestNewTextModel: (base64Url: string, base64Content: string) => void;
    renameModel: (base64OldUrl: string, base64NewUrl: string) => void;
    setValueForModel: (base64Url: string, base64Content: string) => void;
    switchToDiffView: (
      base64OriginalText: string,
      base64ModifiedText: string,
      base64UrlOriginal: string,
      base64UrlModified: string
    ) => void;
    switchToNormalView: () => void;

    // language service
    connectMonacoToLanguageServer: (
      url: string,
      args: [string],
      base64PwdUrl: string,
      pwdBookmark: string,
      languageIdentifier: string
    ) => WebSocket;
    disconnectLanguageServer: () => void;
    isLanguageServiceConnected: () => boolean;

    // diff
    invalidateDecorations: () => void;
    provideOriginalTextForUri: (uri: string, base64Content: string) => void;

    // theme
    applyBase64AsTheme: (base64Theme: string) => void;

    // vim
    toggleVimMode: (enabled: boolean) => void;
  }
}

export function installInterface() {
  // Export Monaco Editor to global scope
  window.monaco = monaco;

  // Export Interface to global scope
  window.editor = CodeStorage.editor;
  window.setModel = setModel;
  window.onRequestNewTextModel = onRequestNewTextModel;
  window.renameModel = renameModel;
  window.setValueForModel = setValueForModel;
  window.switchToDiffView = switchToDiffView;
  window.switchToNormalView = switchToNormalView;

  window.connectMonacoToLanguageServer = connectMonacoToLanguageServer;
  window.disconnectLanguageServer = disconnectLanguageServer;
  window.isLanguageServiceConnected = isLanguageServiceConnected;

  window.invalidateDecorations = invalidateDecorations;
  window.provideOriginalTextForUri = provideOriginalTextForUri;

  window.applyBase64AsTheme = applyBase64AsTheme;

  window.toggleVimMode = toggleVimMode;
}

export const configureMonacoWorkers = () => {
  useWorkerFactory({
    ignoreMapping: true,
    workerLoaders: {
      editorWorkerService: () =>
        new Worker(
          new URL(
            "monaco-editor/esm/vs/editor/editor.worker.js",
            import.meta.url
          ),
          { type: "module" }
        ),
    },
  });
};

export const runClient = async () => {
  await initServices({
    serviceConfig: {
      userServices: {
        ...getThemeServiceOverride(),
        ...getTextmateServiceOverride(),
        ...getConfigurationServiceOverride(Uri.file("/workspace")),
        ...getExtensionServiceOverride(workerConfig),
      },
      debugLogging: true,
    },
  });

  // create monaco editor
  CodeStorage.editor = monaco.editor.create(
    document.getElementById("monaco-editor-root")!,
    {
      automaticLayout: true,
      theme: "vs-dark",
    }
  );

  CodeStorage.editor
    .getContribution("editor.contrib.iPadShowKeyboard")
    ?.dispose();

  installInterface();

  // const model = monaco.editor.createModel(
  //   "console.log()",
  //   undefined,
  //   monaco.Uri.parse("file:///index.html")
  // );
  // CodeStorage.editor?.setModel(model);

  applyListeners(CodeStorage.editor);

  // initWebSocketAndStartClient("ws://localhost:30001/pyright");

  // const testTheme = {
  //     colors: {
  //         'editor.background': '#db3232',
  //     },
  //     tokenColors: []
  // }
  // setTheme(btoa(unescape(encodeURIComponent(JSON.stringify(testTheme)))));
};
