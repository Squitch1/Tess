/* eslint-disable no-var, vars-on-top */
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Settings } from "schemas/settings";

declare global {
    var settings: Settings;
    var webviewWindow: WebviewWindow;
    var SVGNamespace: string;
}
