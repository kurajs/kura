// @kurajs/ctrlk — a headless, zero-dependency ⌘K command palette with a built-in default
// renderer. Use `createCtrlk` for the headless state machine and `mountCtrlk` for the
// batteries-included DOM, or drive the controller from your own renderer.
export { createCtrlk, defaultFilter } from "./core.ts";
export { mountCtrlk, platformHotkeyLabel } from "./dom.ts";
export type { MountHandle, MountLabels, MountOptions } from "./dom.ts";
export { highlight } from "./highlight.ts";
export type { HighlightSegment } from "./highlight.ts";
export { CSS as ctrlkCss, STYLE_ID, injectStyles } from "./styles.ts";
export type {
  Ctrlk,
  CtrlkGroup,
  CtrlkItem,
  CtrlkOptions,
  CtrlkSelectEvent,
  CtrlkState,
} from "./types.ts";
