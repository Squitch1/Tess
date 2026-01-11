/* eslint-disable no-var, vars-on-top */
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

import { Settings } from "@/schemas/settings";

import PopupManager from "./managers/popup";
import Toaster from "./managers/toast";

declare global {
    var settings: Settings;
    var webviewWindow: WebviewWindow;
    var popupManager: PopupManager;
    var toaster: Toaster;

    declare module "*.png" {
        const value: string;
        export default value;
    }

    declare const MAX_SPLITS_PER_PANE: number;
    declare const TAB_DRAG_THRESHOLD: number;
    declare const PTY_BUFFERED_MIN: number;
    declare const PTY_BUFFERED_MAX: number;
    declare const SVG_NAMESPACE: string;
}
