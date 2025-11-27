import Terminal from "@/components/view/widgets/terminal";

import { ShortcutAction } from "@/schemas/settings";

export default class ShortcutManager extends EventTarget {
    private shortcuts: [string[], ShortcutAction][];

    constructor() {
        super();

        this.shortcuts = settings.shortcuts.map((shortcut) => [
            shortcut.shortcut.toLowerCase().replaceAll(" ", "").split("+"),
            shortcut.action,
        ]);

        document.addEventListener("keydown", (e) => this.onKeyPress(e));
    }

    onKeyPress(e: KeyboardEvent, target?: Terminal): boolean {
        if (e.type !== "keydown" || e.code === "Space") {
            return true;
        }

        const key = e.key.toLowerCase() === "unidentified" ? e.code : e.key;
        const pressedShortcut: string[] = [];
        if (!e.getModifierState(e.key)) {
            pressedShortcut.push(key.toLowerCase());
        }

        if (e.ctrlKey) pressedShortcut.push("ctrl");
        if (e.altKey) pressedShortcut.push("alt");
        if (e.shiftKey) pressedShortcut.push("shift");
        if (e.metaKey) pressedShortcut.push("meta");

        const shortcut = this.shortcuts.find(
            (shortcut) =>
                shortcut[0].length === pressedShortcut.length &&
                pressedShortcut.every((m) => shortcut[0].includes(m))
        );

        if (
            !shortcut ||
            (shortcut[1] === "copy" && !target?.xterm.hasSelection())
        ) {
            return true;
        }

        e.preventDefault();
        e.stopImmediatePropagation();

        this.dispatchEvent(
            new CustomEvent("shortcut", {
                detail: {
                    shortcut: shortcut[1],
                    target: target?.id,
                },
            })
        );

        return false;
    }
}
