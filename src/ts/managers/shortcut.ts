import { UUID } from "crypto";

import Terminal from "@/components/view/widgets/terminal";

import { Shortcut, ShortcutAction } from "@/schemas/settings";

export default class ShortcutManager {
    shortcuts: [string[], ShortcutAction][];

    onShortcutExecutedCallback: (
        shortcut: ShortcutAction,
        targetId?: UUID
    ) => void;

    constructor(
        shortcuts: Shortcut[],
        onShortcutExecuted: (shortcut: ShortcutAction, targetId?: UUID) => void
    ) {
        this.shortcuts = shortcuts.map((shortcut) => [
            shortcut.shortcut.toLowerCase().replaceAll(" ", "").split("+"),
            shortcut.action,
        ]);

        this.onShortcutExecutedCallback = onShortcutExecuted;

        document.addEventListener("keydown", (e) => this.onKeyPress(e));
    }

    onKeyPress(e: KeyboardEvent, target?: Terminal): boolean {
        if (e.type === "keydown" && e.code !== "Space") {
            const key = e.key.toLowerCase() === "unidentified" ? e.code : e.key;
            const pressedShortcut: string[] = [];
            if (!e.getModifierState(e.key)) {
                pressedShortcut.push(key.toLowerCase());
            }

            if (e.ctrlKey) pressedShortcut.push("ctrl");
            if (e.altKey) pressedShortcut.push("alt");
            if (e.shiftKey) pressedShortcut.push("shift");
            if (e.metaKey) pressedShortcut.push("meta");

            const correspondingShortcut = this.shortcuts.find(
                (shortcut) =>
                    shortcut[0].length === pressedShortcut.length &&
                    pressedShortcut.every((m) => shortcut[0].includes(m))
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
