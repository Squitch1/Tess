import { invoke, convertFileSrc } from "@tauri-apps/api/tauri";
import { Option } from "schemas/option";
import { emit } from "@tauri-apps/api/event";
import App from "./app";

window.addEventListener("contextmenu", (e) => {
    e.preventDefault();
});

window.addEventListener("load", () =>
    invoke<Option>("utils_get_configuration").then(async (config) => {
        globalThis.config = config;

        if (
            config.background !== "opaque" &&
            !(config.background instanceof Object)
        ) {
            document.body.style.background = "transparent";
        } else if (config.background instanceof Object) {
            const background = document.createElement("img");
            background.src = convertFileSrc(config.background.media.location);
            background.classList.add("background-image");
            background.style.setProperty(
                "-webkit-filter",
                `blur(${config.background.media.blur}px)`
            );
            document.body.appendChild(background);
        }

        if (config.appTheme !== "") {
            const stylesheet = document.createElement("link");
            stylesheet.type = "text/css";
            stylesheet.rel = "stylesheet";
            stylesheet.href = convertFileSrc(config.appTheme);
            document.head.appendChild(stylesheet);
        }

        const app = new App(
            document.querySelector(".views")!,
            document.querySelector(".tabs")!,
            document.querySelector(".toasts")!
        );
        await app.openProfile(config.defaultProfile.id, true);

        document.querySelector(".open")!.addEventListener("click", async () => {
            await app.openProfile(config.defaultProfile.id, true);
        });

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        emit("loaded");
    })
);
