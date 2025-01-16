import {
    terminalDataPayload,
    terminalProgressUpdatedPayload,
    terminalTitleChangedPayload,
} from "schemas/term";
import { Profile } from "schemas/option";
import { listen, Event } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api";
import Terminal from "components/view/widgets/terminal";

import {
    PtyCreateError,
    PtyExitError,
    PtyPropertyError,
    PtyResizeError,
    PtyWriteError,
    UnknownProfileError,
    UnknownTerminalError,
} from "schemas/error";
import Toaster from "./toast";

export default class TerminalManager {
    profiles: Profile[];
    terminals: Terminal[] = [];

    terminalFlows: Map<string, [number, boolean]> = new Map();

    toaster: Toaster;

    onTerminalKeyPressed: (e: KeyboardEvent, term: Terminal) => boolean;

    constructor(
        profiles: Profile[],
        toaster: Toaster,
        onTerminalKeyPressed: (e: KeyboardEvent, term: Terminal) => boolean
    ) {
        this.profiles = profiles;
        this.onTerminalKeyPressed = onTerminalKeyPressed;
        this.toaster = toaster;

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        listen<terminalDataPayload>("js_pty_incoming_data", (e) =>
            this.onTerminalIncomingData(e)
        );
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        listen<terminalTitleChangedPayload>("js_pty_title_update", (e) =>
            this.onTerminalTitleChanged(e)
        );
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        listen<string>("js_pty_closed", (e) => this.onTerminalProcessExited(e));
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        listen<string>("js_pty_display_content_update", (e) =>
            this.onTerminalContentUpdated(e)
        );
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        listen<terminalProgressUpdatedPayload>("js_pty_progress_update", (e) =>
            this.onTerminalProgressUpdated(e)
        );
    }

    private onTerminalTitleChanged(e: Event<terminalTitleChangedPayload>) {
        this.terminals
            .find((terminal) => terminal.id === e.payload.id)
            ?.onTitleUpdate(e.payload.title);
    }

    private onTerminalProcessExited(e: Event<string>) {
        const terminal = this.terminals.splice(
            this.terminals.findIndex((terminal) => terminal.id === e.payload),
            1
        )[0];
        this.terminalFlows.delete(e.payload);

        terminal.onceClosed();
    }

    private onTerminalContentUpdated(e: Event<string>) {
        this.terminals
            .find((terminal) => terminal.id === e.payload)
            ?.onHighlightRequest();
    }

    private onTerminalProgressUpdated(
        e: Event<terminalProgressUpdatedPayload>
    ) {
        this.terminals
            .find((terminal) => terminal.id === e.payload.id)
            ?.onProgressUpdated(e.payload.progress);
    }

    private onTerminalIncomingData(e: Event<terminalDataPayload>) {
        const terminal = this.terminals.find(
            (terminal) => terminal.id === e.payload.id
        );
        if (terminal) {
            let [buffered, paused] = this.terminalFlows.get(e.payload.id)!;

            if (buffered > 262144 && !paused) {
                invoke("pty_pause", { id: e.payload.id }).catch((e) =>
                    this.toaster.toast(
                        new PtyPropertyError(
                            e as string,
                            "Unable to use flowcontrol"
                        )
                    )
                );
                paused = true;
            }
            buffered += e.payload.data.length;
            this.terminalFlows.set(e.payload.id, [buffered, paused]);

            terminal.xterm.write(e.payload.data, () => {
                let [buffered, paused] = this.terminalFlows.get(e.payload.id)!;
                buffered = Math.max(buffered - e.payload.data.length, 0);

                if (buffered < 65536 && paused) {
                    invoke("pty_resume", { id: e.payload.id }).catch((e) =>
                        this.toaster.toast(
                            new PtyPropertyError(
                                e as string,
                                "Unable to use flowcontrol"
                            )
                        )
                    );
                    paused = false;
                }

                this.terminalFlows.set(e.payload.id, [buffered, paused]);
            });
        }
    }

    // eslint-disable-next-line class-methods-use-this
    private onTerminalResize(id: string, cols: number, rows: number) {
        invoke("pty_resize", {
            id,
            cols,
            rows,
        }).catch((e) => {
            this.toaster.toast(
                new PtyResizeError(e as string, "Unable to resize terminal")
            );
        });
    }

    // eslint-disable-next-line class-methods-use-this
    private async onTerminalNeedClosability(id: string): Promise<boolean> {
        return new Promise((resolve, reject) => {
            invoke<boolean>("pty_get_closable", {
                id,
            })
                .then(resolve)
                .catch((e) =>
                    reject(
                        new PtyPropertyError(
                            e as string,
                            "Unable to detect closable status"
                        )
                    )
                );
        });
    }

    // eslint-disable-next-line class-methods-use-this
    private async onTerminalNeedLeaderName(id: string): Promise<string> {
        return new Promise((resolve, reject) => {
            invoke<string>("pty_get_leader_name", {
                id,
            })
                .then(resolve)
                .catch((e) =>
                    reject(
                        new PtyPropertyError(
                            e as string,
                            "Unable to retrieve leader name"
                        )
                    )
                );
        });
    }

    // eslint-disable-next-line class-methods-use-this
    private onTerminalOutgoingData(id: string, data: string) {
        invoke("pty_write", { data, id }).catch((e) => {
            this.toaster.toast(
                new PtyWriteError(e as string, "Unable to handle data stream")
            );
        });
    }

    // eslint-disable-next-line class-methods-use-this
    private async onTerminalExit(id: string): Promise<void> {
        try {
            return await invoke<void>("pty_close", { id });
        } catch (e) {
            throw new PtyExitError(e as string, "Unable to dispose terminal");
        }
    }

    async openNew(profileId: string): Promise<Terminal> {
        const profile = this.profiles.find(
            (profile) => profile.id === profileId
        );
        if (!profile) {
            throw new UnknownProfileError(profileId);
        }

        const terminal = new Terminal(profile);
        try {
            await invoke("pty_open", {
                id: terminal.id,
                profileId,
            });
        } catch (e) {
            throw new PtyCreateError(e as string, "Unable to create terminal");
        }

        terminal.onTerminalResize = (cols, rows) =>
            this.onTerminalResize(terminal.id, cols, rows);
        terminal.onTerminalNeedClosability = async () =>
            this.onTerminalNeedClosability(terminal.id);
        terminal.onTerminalNeedLeaderName = async () =>
            this.onTerminalNeedLeaderName(terminal.id);
        terminal.onTerminalOutgoingData = (data) =>
            this.onTerminalOutgoingData(terminal.id, data);
        terminal.onTerminalExit = async () => this.onTerminalExit(terminal.id);
        terminal.onTerminalKeyPress = (e) =>
            this.onTerminalKeyPressed(e, terminal);
        this.terminals.push(terminal);
        this.terminalFlows.set(terminal.id, [0, false]);
        return terminal;
    }

    getSelection(id: string): string {
        try {
            return this.terminals
                .find((terminal) => terminal.id === id)!
                .xterm.getSelection();
        } catch {
            throw new UnknownTerminalError(
                `There is no terminal with ID ${id}.`
            );
        }
    }

    // eslint-disable-next-line class-methods-use-this
    async insertContent(id: string, data: string) {
        try {
            await invoke("pty_write", { data, id });
        } catch (e) {
            throw new PtyWriteError(
                (e as Error).message,
                "Unable to handle data stream"
            );
        }
    }
}
