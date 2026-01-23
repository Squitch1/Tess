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
import {
    PtyDataPayload,
    PtyProgressUpdatedPayload,
    PtyTitleChangedPayload,
} from "@/schemas/term";

export default class TerminalManager {
    private terminals: Terminal[] = [];
    private flows: Map<string, [number, boolean]> = new Map();

    private keyPressCallback: (e: KeyboardEvent, term: Terminal) => boolean;

    constructor(
        keyPressCallback: (e: KeyboardEvent, term: Terminal) => boolean
    ) {
        this.keyPressCallback = keyPressCallback;

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
        const terminal = this.terminals.find(
            (terminal) => terminal.id === e.payload.ptyId
        );
        if (terminal) {
            terminal.title = e.payload.title;
        }
    }

    private async onTerminalProcessExited(e: Event<UUID>) {
        try {
            await invoke<void>("pty_close", { ptyId: e.payload });
        } catch (_) {
            /* empty */
        }
        const index = this.terminals.findIndex(
            (terminal) => terminal.id === e.payload
        );
        if (index > -1) {
            const terminal = this.terminals.splice(index, 1)[0];
            this.flows.delete(e.payload);
            setTimeout(
                () => terminal.dispatchEvent(new CustomEvent("close")),
                0
            );
        }
    }

    private onTerminalContentUpdated(e: Event<string>) {
        this.terminals
            .find((terminal) => terminal.id === e.payload)
            ?.askAttention();
    }

    private onTerminalProgressUpdated(e: Event<PtyProgressUpdatedPayload>) {
        const terminal = this.terminals.find(
            (terminal) => terminal.id === e.payload.ptyId
        );
        if (terminal) {
            terminal.progress = e.payload.progress;
        }
    }

    private onTerminalIncomingData(e: Event<PtyDataPayload>) {
        const terminal = this.terminals.find(
            (terminal) => terminal.id === e.payload.ptyId
        );
        if (terminal) {
            let [buffered, paused] = this.flows.get(e.payload.ptyId)!;

            if (buffered > PTY_BUFFERED_MAX && !paused) {
                invoke("pty_pause", { ptyId: e.payload.ptyId }).catch((e) =>
                    toaster.toast(
                        new PtyPropertyError(
                            e as string,
                            "Unable to use flowcontrol"
                        )
                    )
                );
                paused = true;
            }
            buffered += e.payload.data.length;
            this.flows.set(e.payload.ptyId, [buffered, paused]);

            terminal.xterm.write(e.payload.data, () => {
                let [buffered, paused] = this.flows.get(e.payload.ptyId)!;
                buffered = Math.max(buffered - e.payload.data.length, 0);

                if (buffered < PTY_BUFFERED_MIN && paused) {
                    invoke("pty_resume", { ptyId: e.payload.ptyId }).catch(
                        (e) =>
                            toaster.toast(
                                new PtyPropertyError(
                                    e as string,
                                    "Unable to use flowcontrol"
                                )
                            )
                    );
                    paused = false;
                }

                this.flows.set(e.payload.ptyId, [buffered, paused]);
            });
        }
    }

    async openNew(
        profileId: UUID,
        command?: string,
        workdir?: string,
        title?: string
    ): Promise<Terminal> {
        const profile = settings.profiles.find(
            (profile) => profile.id === profileId
        );
        if (!profile) {
            throw new UnknownProfileError(profileId);
        }

        const terminal: Terminal = new Terminal(profile, {
            leaderName: async () => {
                try {
                    return await invoke<string>("pty_get_leader_name", {
                        ptyId: terminal.id,
                    });
                } catch (e) {
                    throw new PtyPropertyError(
                        e as string,
                        "Unable to retrieve leader name"
                    );
                }
            },
            closable: async () => {
                try {
                    return await invoke<boolean>("pty_get_closable", {
                        ptyId: terminal.id,
                    });
                } catch (e) {
                    throw new PtyPropertyError(
                        e as string,
                        "Unable to detect closable status"
                    );
                }
            },
            keyPress: (e) => this.keyPressCallback(e, terminal),
            exit: async () => {
                try {
                    await invoke<void>("pty_close", {
                        ptyId: terminal.id,
                    });
                } catch (e) {
                    throw new PtyExitError(
                        e as string,
                        "Unable to dispose terminal"
                    );
                }
            },
        });
        terminal.addEventListener(
            "resize",
            (e: CustomEventInit<{ cols: number; rows: number }>) => {
                const { cols, rows } = e.detail!;
                invoke("pty_resize", {
                    ptyId: terminal.id,
                    cols,
                    rows,
                }).catch((e) => {
                    toaster.toast(
                        new PtyResizeError(
                            e as string,
                            "Unable to resize terminal"
                        )
                    );
                });
            }
        );
        terminal.addEventListener("data", (e: CustomEventInit<string>) =>
            invoke("pty_write", { data: e.detail, ptyId: terminal.id }).catch(
                (e) => {
                    toaster.toast(
                        new PtyWriteError(
                            e as string,
                            "Unable to handle data stream"
                        )
                    );
                }
            )
        );

        try {
            this.terminals.push(terminal);
            this.flows.set(terminal.id, [0, false]);
            await invoke("pty_open", {
                ptyId: terminal.id,
                profileId,
                command,
                workdir,
                title,
            });
        } catch (e) {
            this.terminals.pop();
            this.flows.delete(terminal.id);
            throw new PtyCreateError(e as string, "Unable to create terminal");
        }
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
