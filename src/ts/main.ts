import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

import { Settings } from "@/schemas/settings";

import App from "./app";

window.addEventListener("contextmenu", (e) => {
    e.preventDefault();
});

window.addEventListener("load", () =>
    invoke<Settings>("utils_get_settings").then(async (settings) => {
        globalThis.settings = settings;
        globalThis.webviewWindow = getCurrentWebviewWindow();
        globalThis.SVGNamespace = "http://www.w3.org/2000/svg";

        if (
            settings.background !== "opaque" &&
            !(settings.background instanceof Object)
        ) {
            document.body.style.background = "transparent";
        } else if (settings.background instanceof Object) {
            const background = document.createElement("img");
            background.src = convertFileSrc(settings.background.media.location);
            background.classList.add("background-image");
            background.style.setProperty(
                "-webkit-filter",
                `blur(${settings.background.media.blur}px)`
            );
            document.body.appendChild(background);
        }

        if (settings.appTheme !== "") {
            const stylesheet = document.createElement("link");
            stylesheet.type = "text/css";
            stylesheet.rel = "stylesheet";
            stylesheet.href = convertFileSrc(settings.appTheme);
            document.head.appendChild(stylesheet);
        }

        const app = new App(
            document.querySelector(".views")!,
            document.querySelector(".tabs")!,
            document.querySelector(".toasts")!
        );

        document.querySelector(".open")!.addEventListener("click", async () => {
            await app.openProfile(settings.defaultProfile.id, true);
        });

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        emit("loaded");
    })
);
