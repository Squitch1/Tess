import { invoke } from "@tauri-apps/api/core";
import { Event, listen } from "@tauri-apps/api/event";
import { UUID } from "crypto";

import Terminal from "@/components/view/widgets/terminal";

import {
    PtyCreateError,
    PtyExitError,
    PtyPropertyError,
    PtyResizeError,
    PtyWriteError,
    UnknownProfileError,
    UnknownTerminalError,
} from "@/schemas/error";
import { Profile } from "@/schemas/settings";
import {
    PtyDataPayload,
    PtyProgressUpdatedPayload,
    PtyTitleChangedPayload,
} from "@/schemas/term";

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
        listen<PtyDataPayload>("js_pty_incoming_data", (e) =>
            this.onTerminalIncomingData(e)
        );
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        listen<PtyTitleChangedPayload>("js_pty_title_update", (e) =>
            this.onTerminalTitleChanged(e)
        );
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        listen<UUID>("js_pty_closed", (e) => this.onTerminalProcessExited(e));
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        listen<UUID>("js_pty_display_content_update", (e) =>
            this.onTerminalContentUpdated(e)
        );
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        listen<PtyProgressUpdatedPayload>("js_pty_progress_update", (e) =>
            this.onTerminalProgressUpdated(e)
        );
    }

    private onTerminalTitleChanged(e: Event<PtyTitleChangedPayload>) {
        this.terminals
            .find((terminal) => terminal.id === e.payload.ptyId)
            ?.onTitleUpdate(e.payload.title);
    }

    private async onTerminalProcessExited(e: Event<UUID>) {
        try {
            await invoke<void>("pty_close", { ptyId: e.payload });
        } catch (e) {
            /* empty */
        }
        const index = this.terminals.findIndex(
            (terminal) => terminal.id === e.payload
        );
        if (index > -1) {
            const terminal = this.terminals.splice(index, 1)[0];
            this.terminalFlows.delete(e.payload);
            setTimeout(() => {
                terminal.onceClosed();
            }, 0);
        }
    }

    private onTerminalContentUpdated(e: Event<string>) {
        this.terminals
            .find((terminal) => terminal.id === e.payload)
            ?.onHighlightRequest();
    }

    private onTerminalProgressUpdated(e: Event<PtyProgressUpdatedPayload>) {
        this.terminals
            .find((terminal) => terminal.id === e.payload.ptyId)
            ?.onProgressUpdated(e.payload.progress);
    }

    private onTerminalIncomingData(e: Event<PtyDataPayload>) {
        const terminal = this.terminals.find(
            (terminal) => terminal.id === e.payload.ptyId
        );
        if (terminal) {
            let [buffered, paused] = this.terminalFlows.get(e.payload.ptyId)!;

            if (buffered > 262144 && !paused) {
                invoke("pty_pause", { ptyId: e.payload.ptyId }).catch((e) =>
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
            this.terminalFlows.set(e.payload.ptyId, [buffered, paused]);

            terminal.xterm.write(e.payload.data, () => {
                let [buffered, paused] = this.terminalFlows.get(
                    e.payload.ptyId
                )!;
                buffered = Math.max(buffered - e.payload.data.length, 0);

                if (buffered < 65536 && paused) {
                    invoke("pty_resume", { ptyId: e.payload.ptyId }).catch(
                        (e) =>
                            this.toaster.toast(
                                new PtyPropertyError(
                                    e as string,
                                    "Unable to use flowcontrol"
                                )
                            )
                    );
                    paused = false;
                }

                this.terminalFlows.set(e.payload.ptyId, [buffered, paused]);
            });
        }
    }

    // eslint-disable-next-line class-methods-use-this
    private onTerminalResize(terminalId: UUID, cols: number, rows: number) {
        invoke("pty_resize", {
            ptyId: terminalId,
            cols,
            rows,
        }).catch((e) => {
            this.toaster.toast(
                new PtyResizeError(e as string, "Unable to resize terminal")
            );
        });
    }

    // eslint-disable-next-line class-methods-use-this
    private async onTerminalNeedClosability(
        terminalId: UUID
    ): Promise<boolean> {
        return new Promise((resolve, reject) => {
            invoke<boolean>("pty_get_closable", {
                ptyId: terminalId,
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
    private async onTerminalNeedLeaderName(terminalId: UUID): Promise<string> {
        return new Promise((resolve, reject) => {
            invoke<string>("pty_get_leader_name", {
                ptyId: terminalId,
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
    private onTerminalOutgoingData(terminalId: UUID, data: string) {
        invoke("pty_write", { data, ptyId: terminalId }).catch((e) => {
            this.toaster.toast(
                new PtyWriteError(e as string, "Unable to handle data stream")
            );
        });
    }

    // eslint-disable-next-line class-methods-use-this
    private async onTerminalExit(terminalId: UUID): Promise<void> {
        try {
            return await invoke<void>("pty_close", { ptyId: terminalId });
        } catch (e) {
            throw new PtyExitError(e as string, "Unable to dispose terminal");
        }
    }

    async openNew(
        profileId: UUID,
        command?: string,
        workdir?: string,
        title?: string
    ): Promise<Terminal> {
        const profile = this.profiles.find(
            (profile) => profile.id === profileId
        );
        if (!profile) {
            throw new UnknownProfileError(profileId);
        }

        const terminal = new Terminal(profile);
        try {
            this.terminals.push(terminal);
            this.terminalFlows.set(terminal.id, [0, false]);
            await invoke("pty_open", {
                ptyId: terminal.id,
                profileId,
                command,
                workdir,
                title,
            });
        } catch (e) {
            this.terminals.pop();
            this.terminalFlows.delete(terminal.id);
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
        return terminal;
    }

    getSelection(terminalId: UUID): string {
        try {
            return this.terminals
                .find((terminal) => terminal.id === terminalId)!
                .xterm.getSelection();
        } catch {
            throw new UnknownTerminalError(
                `There is no terminal with ID ${terminalId}.`
            );
        }
    }

    insertContent(terminalId: UUID, data: string) {
        const terminal = this.terminals.find(
            (terminal) => terminal.id === terminalId
        );
        if (!terminal) {
            throw new UnknownTerminalError(
                `There is no terminal with ID ${terminalId}.`
            );
        }
        terminal.xterm.paste(data);
    }
}
