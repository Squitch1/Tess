import { UUID } from "crypto";

import clamp from "@/utils/clamp";

import Pane from "../pane";

export default abstract class Widget extends EventTarget {
    readonly id: UUID;
    readonly element: HTMLElement;

    #state: {
        title: string;
        progress: number;
    } = { title: "", progress: 0 };

    anchoringPane?: Pane;

    constructor() {
        super();
        this.id = crypto.randomUUID();

        this.element = document.createElement("div");
        this.element.classList.add("widget");
    }

    abstract run(): void;
    abstract getShortTitle(): Promise<string>;
    abstract getClosability(): Promise<boolean>;
    abstract close(): Promise<void>;

    focus() {
        this.element.focus();
    }

    blur() {
        this.element.blur();
    }

    get state() {
        return structuredClone(this.#state);
    }

    set title(title: string) {
        this.#state.title = title;

        this.dispatchEvent(new Event("change"));
    }

    set progress(progress: number) {
        this.#state.progress = clamp(0, progress, 100);

        this.dispatchEvent(new Event("change"));
    }

    askAttention() {
        this.dispatchEvent(new Event("attentionRequest"));
    }

    // eslint-disable-next-line class-methods-use-this
    dispose() {}
}
