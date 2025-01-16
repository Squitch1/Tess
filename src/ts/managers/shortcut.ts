import { Shortcut, ShortcutAction } from "schemas/option";
import Terminal from "components/view/widgets/terminal";

export default class ShortcutManager {
    shortcuts: [string[], ShortcutAction][] = [];

    onShortcutExecutedCallback: (
        shortcut: ShortcutAction,
        targetId?: string
    ) => void;

    constructor(
        shortcuts: Shortcut[],
        onShortcutExecuted: (
            shortcut: ShortcutAction,
            targetId?: string
        ) => void
    ) {
        shortcuts.forEach((shortcut) =>
            this.shortcuts.push([
                shortcut.shortcut.toLowerCase().replaceAll(" ", "").split("+"),
                shortcut.action,
            ])
        );

        this.onShortcutExecutedCallback = onShortcutExecuted;

        document.addEventListener("keydown", (e) => this.onKeyPress(e));
    }

    onKeyPress(e: KeyboardEvent, target?: Terminal): boolean {
        if (e.type === "keydown" && e.code !== "Space") {
            const key = e.key.toLowerCase() === "unidentified" ? e.code : e.key;
            const pressedShortcut = [key.toLowerCase()];

            if (e.ctrlKey) pressedShortcut.push("ctrl");
            if (e.altKey) pressedShortcut.push("alt");
            if (e.shiftKey) pressedShortcut.push("maj");

            const correspondingShortcut = this.shortcuts.find(
                (shortcut) =>
                    pressedShortcut.every((tmp) => shortcut[0].includes(tmp)) &&
                    shortcut[0].every((tmp) => pressedShortcut.includes(tmp))
            );

            if (correspondingShortcut) {
                if (target) {
                    if (
                        (correspondingShortcut[1] === "copy" &&
                            target.xterm.hasSelection()) ||
                        correspondingShortcut[1] !== "copy"
                    ) {
                        this.onShortcutExecutedCallback(
                            correspondingShortcut[1],
                            target.id
                        );

                        e.preventDefault();
                        e.stopImmediatePropagation();

                        return false;
                    }
                } else {
                    this.onShortcutExecutedCallback(correspondingShortcut[1]);

                    e.preventDefault();
                    e.stopImmediatePropagation();

                    return false;
                }
            } else {
                return true;
            }
        }

        return true;
    }
}
