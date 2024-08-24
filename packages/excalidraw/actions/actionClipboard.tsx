import { CODES, KEYS } from "../keys";
import { register } from "./register";
import {
  copyTextToSystemClipboard,
  copyToClipboard,
  createPasteEvent,
  probablySupportsClipboardBlob,
  probablySupportsClipboardWriteText,
  readSystemClipboard,
} from "../clipboard";
import { actionDeleteSelected } from "./actionDeleteSelected";
import { exportCanvas, prepareElementsForExport } from "../data/index";
import { getTextFromElements, isTextElement } from "../element";
import { t } from "../i18n";
import { isFirefox, MIME_TYPES } from "../constants";
import { DuplicateIcon, cutIcon, pngIcon, svgIcon } from "../components/icons";
import { StoreAction } from "../store";
import {makeAIStyleTransferImage} from "./Stylize"
import { FileId, FractionalIndex } from "../element/types";
import { DataURL } from "../types";
import { getCommonBoundingBox } from "../element/bounds";
import { arrayToMap } from "../utils";
import { nanoid } from "nanoid";

export const actionCopy = register({
  name: "copy",
  label: "labels.copy",
  icon: DuplicateIcon,
  trackEvent: { category: "element" },
  perform: async (elements, appState, event: ClipboardEvent | null, app) => {
    const elementsToCopy = app.scene.getSelectedElements({
      selectedElementIds: appState.selectedElementIds,
      includeBoundTextElement: true,
      includeElementsInFrames: true,
    });

    try {
      await copyToClipboard(elementsToCopy, app.files, event);
    } catch (error: any) {
      return {
        storeAction: StoreAction.NONE,
        appState: {
          ...appState,
          errorMessage: error.message,
        },
      };
    }

    return {
      storeAction: StoreAction.NONE,
    };
  },
  // don't supply a shortcut since we handle this conditionally via onCopy event
  keyTest: undefined,
});

export const actionPaste = register({
  name: "paste",
  label: "labels.paste",
  trackEvent: { category: "element" },
  perform: async (elements, appState, data, app) => {
    let types;
    try {
      types = await readSystemClipboard();
    } catch (error: any) {
      if (error.name === "AbortError" || error.name === "NotAllowedError") {
        // user probably aborted the action. Though not 100% sure, it's best
        // to not annoy them with an error message.
        return false;
      }

      console.error(`actionPaste ${error.name}: ${error.message}`);

      if (isFirefox) {
        return {
          storeAction: StoreAction.NONE,
          appState: {
            ...appState,
            errorMessage: t("hints.firefox_clipboard_write"),
          },
        };
      }

      return {
        storeAction: StoreAction.NONE,
        appState: {
          ...appState,
          errorMessage: t("errors.asyncPasteFailedOnRead"),
        },
      };
    }

    try {
      app.pasteFromClipboard(createPasteEvent({ types }));
    } catch (error: any) {
      console.error(error);
      return {
        storeAction: StoreAction.NONE,
        appState: {
          ...appState,
          errorMessage: t("errors.asyncPasteFailedOnParse"),
        },
      };
    }

    return {
      storeAction: StoreAction.NONE,
    };
  },
  // don't supply a shortcut since we handle this conditionally via onCopy event
  keyTest: undefined,
});

export const actionCut = register({
  name: "cut",
  label: "labels.cut",
  icon: cutIcon,
  trackEvent: { category: "element" },
  perform: (elements, appState, event: ClipboardEvent | null, app) => {
    actionCopy.perform(elements, appState, event, app);
    return actionDeleteSelected.perform(elements, appState, null, app);
  },
  keyTest: (event) => event[KEYS.CTRL_OR_CMD] && event.key === KEYS.X,
});

export const actionCopyAsSvg = register({
  name: "copyAsSvg",
  label: "labels.copyAsSvg",
  icon: svgIcon,
  trackEvent: { category: "element" },
  perform: async (elements, appState, _data, app) => {
    if (!app.canvas) {
      return {
        storeAction: StoreAction.NONE,
      };
    }

    const { exportedElements, exportingFrame } = prepareElementsForExport(
      elements,
      appState,
      true,
    );

    try {
      await exportCanvas(
        "clipboard-svg",
        exportedElements,
        appState,
        app.files,
        {
          ...appState,
          exportingFrame,
          name: app.getName(),
        },
      );
      return {
        storeAction: StoreAction.NONE,
      };
    } catch (error: any) {
      console.error(error);
      return {
        appState: {
          ...appState,
          errorMessage: error.message,
        },
        storeAction: StoreAction.NONE,
      };
    }
  },
  predicate: (elements) => {
    return probablySupportsClipboardWriteText && elements.length > 0;
  },
  keywords: ["svg", "clipboard", "copy"],
});

export const actionCopyAsPng = register({
  name: "copyAsPng",
  label: "labels.copyAsPng",
  icon: pngIcon,
  trackEvent: { category: "element" },
  perform: async (elements, appState, _data, app) => {
    if (!app.canvas) {
      return {
        storeAction: StoreAction.NONE,
      };
    }
    const selectedElements = app.scene.getSelectedElements({
      selectedElementIds: appState.selectedElementIds,
      includeBoundTextElement: true,
      includeElementsInFrames: true,
    });

    const { exportedElements, exportingFrame } = prepareElementsForExport(
      elements,
      appState,
      true,
    );
    try {
      await exportCanvas("clipboard", exportedElements, appState, app.files, {
        ...appState,
        exportingFrame,
        name: app.getName(),
      });
      return {
        appState: {
          ...appState,
          toast: {
            message: t("toast.copyToClipboardAsPng", {
              exportSelection: selectedElements.length
                ? t("toast.selection")
                : t("toast.canvas"),
              exportColorScheme: appState.exportWithDarkMode
                ? t("buttons.darkMode")
                : t("buttons.lightMode"),
            }),
          },
        },
        storeAction: StoreAction.NONE,
      };
    } catch (error: any) {
      console.error(error);
      return {
        appState: {
          ...appState,
          errorMessage: error.message,
        },
        storeAction: StoreAction.NONE,
      };
    }
  },
  predicate: (elements) => {
    return probablySupportsClipboardBlob && elements.length > 0;
  },
  keyTest: (event) => event.code === CODES.C && event.altKey && event.shiftKey,
  keywords: ["png", "clipboard", "copy"],
});

export const copyText = register({
  name: "copyText",
  label: "labels.copyText",
  trackEvent: { category: "element" },
  perform: (elements, appState, _, app) => {
    const selectedElements = app.scene.getSelectedElements({
      selectedElementIds: appState.selectedElementIds,
      includeBoundTextElement: true,
    });

    try {
      copyTextToSystemClipboard(getTextFromElements(selectedElements));
    } catch (e) {
      throw new Error(t("errors.copyToSystemClipboardFailed"));
    }
    return {
      storeAction: StoreAction.NONE,
    };
  },
  predicate: (elements, appState, _, app) => {
    return (
      probablySupportsClipboardWriteText &&
      app.scene
        .getSelectedElements({
          selectedElementIds: appState.selectedElementIds,
          includeBoundTextElement: true,
        })
        .some(isTextElement)
    );
  },
  keywords: ["text", "clipboard", "copy"],
});

export const actionStylize = register({
  name: "stylize",
  label: "labels.stylize",
  trackEvent: { category: "element" },
  perform: async (elements, appState, _, app) => {
    if (!app.canvas) {
      return {
        storeAction: StoreAction.NONE,
      };
    }

    const { exportedElements, exportingFrame } = prepareElementsForExport(
      elements,
      appState,
      true,
    );

    try {
      const blob = await exportCanvas(
        "blob",
        exportedElements,
        appState,
        app.files,
        {
          ...appState,
          exportingFrame,
          name: app.getName(),
        },
      );
      // Get the bounding box of all exported elements
      const boundingBox = getCommonBoundingBox(exportedElements);

      // Calculate the center x and y
      const centerX = boundingBox.minX + 8 //(boundingBox.width / 2);
      const centerY = boundingBox.minY + 8  //(boundingBox.height / 2);

      console.log("Center of exported elements:", { x: centerX, y: centerY });

      if (!(blob instanceof Blob)) {
        throw new Error("Exported canvas is not a Blob");
      }

      const prompt_defaulted = prompt || "artistic sword replica meuseum art best quality weapon gunblade fantasy sword"; // You can make this dynamic if needed

      const result = await makeAIStyleTransferImage(blob, prompt_defaulted);
      console.log("Style transfer result:", result);
      const url = result?.path;
      if (url) {
        const img = new Image();
        img.src = url;

        // Set crossOrigin to anonymous to avoid tainting the canvas
        img.crossOrigin = "anonymous";
        await new Promise((resolve) => {
          img.onload = resolve;
        });

        // Create a canvas element
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Could not get canvas context');
        }
      

        // Draw the image on the canvas
        ctx.drawImage(img, 0, 0);

        // Convert to data URL
        const dataURL = canvas.toDataURL('image/png');

        const imageElement = {
          type: "image",
          x: centerX,
          y: centerY,
          width: img.width,
          height: img.height,
          strokeColor: "transparent",
          backgroundColor: "transparent",
          fillStyle: "hachure",
          strokeWidth: 1,
          strokeStyle: "solid",
          roughness: 1,
          opacity: 100,
          groupIds: [],
          strokeSharpness: "sharp",
          seed: Math.floor(Math.random() * 2000),
          version: 1,
          versionNonce: Math.floor(Math.random() * 1000000),
          isDeleted: false,
          boundElements: null,
          updated: Date.now(),
          link: null,
          locked: false,
          fileId: dataURL,
          scale: [1, 1],
          status: "pending",
          id: nanoid(),
          angle: 0,
          roundness: null,
          frameId: null,
          index: elements.length.toString() as FractionalIndex,
        } as const;

        const binaryFileData = {
          mimeType: MIME_TYPES.png,
          id: dataURL as FileId,
          dataURL: dataURL as DataURL,
          created: Date.now(),
        };

        app.addFiles([binaryFileData]);

        const newElements = [...elements, imageElement];
        // const newElementsMap = arrayToMap(newElements);

        return {
          elements: newElements,
          appState: {
            ...appState,
            selectedElementIds: { [imageElement.id]: true },
          },

          storeAction: StoreAction.CAPTURE,
          commitToHistory: true,
        };
      }
    } catch (error: any) {
      console.error(error);
      return {
        appState: {
          ...appState,
          errorMessage: error.message,
        },
        storeAction: StoreAction.NONE,
      };
    }

    return {
      storeAction: StoreAction.NONE,
    };
  },
  keyTest: (event) => event.altKey && event.key === KEYS.R,
  PanelComponent: ({ elements, appState, updateData }) => (
    <button
      type="button"
      onClick={() => updateData(null)}
      className="stylize-button"
    >
      Stylize
    </button>
  ),
});

let prompt: string | null = null;

const listenForPromptUpdates = () => {
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'updatePrompt') {
      prompt = event.data.prompt;
    }
  });
};

// Initialize the listener
listenForPromptUpdates();