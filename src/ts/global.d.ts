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
    // eslint-disable-next-line @typescript-eslint/naming-convention
    var SVGNamespace: string;

    declare module "*.png" {
        const value: string;
        export default value;
    }
}
