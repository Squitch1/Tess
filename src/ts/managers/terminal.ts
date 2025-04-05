import {
    terminalDataPayload,
    terminalProgressUpdatedPayload,
    terminalTitleChangedPayload,
} from "schemas/term";
import { Profile } from "schemas/settings";
import { listen, Event } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
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
            .find((terminal) => terminal.uuid === e.payload.uuid)
            ?.onTitleUpdate(e.payload.title);
    }

    private async onTerminalProcessExited(e: Event<string>) {
        try {
            await invoke<void>("pty_close", { uuid: e.payload });
        } catch (e) {
            /* empty */
        }
        const index = this.terminals.findIndex(
            (terminal) => terminal.uuid === e.payload
        );
        if (index > -1) {
            const terminal = this.terminals.splice(index, 1)[0];
            this.terminalFlows.delete(e.payload);
            terminal.onceClosed();
        }
    }

    private onTerminalContentUpdated(e: Event<string>) {
        this.terminals
            .find((terminal) => terminal.uuid === e.payload)
            ?.onHighlightRequest();
    }

    private onTerminalProgressUpdated(
        e: Event<terminalProgressUpdatedPayload>
    ) {
        this.terminals
            .find((terminal) => terminal.uuid === e.payload.uuid)
            ?.onProgressUpdated(e.payload.progress);
    }

    private onTerminalIncomingData(e: Event<terminalDataPayload>) {
        const terminal = this.terminals.find(
            (terminal) => terminal.uuid === e.payload.uuid
        );
        if (terminal) {
            let [buffered, paused] = this.terminalFlows.get(e.payload.uuid)!;

            if (buffered > 262144 && !paused) {
                invoke("pty_pause", { uuid: e.payload.uuid }).catch((e) =>
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
            this.terminalFlows.set(e.payload.uuid, [buffered, paused]);

            terminal.xterm.write(e.payload.data, () => {
                let [buffered, paused] = this.terminalFlows.get(
                    e.payload.uuid
                )!;
                buffered = Math.max(buffered - e.payload.data.length, 0);

                if (buffered < 65536 && paused) {
                    invoke("pty_resume", { uuid: e.payload.uuid }).catch((e) =>
                        this.toaster.toast(
                            new PtyPropertyError(
                                e as string,
                                "Unable to use flowcontrol"
                            )
                        )
                    );
                    paused = false;
                }

                this.terminalFlows.set(e.payload.uuid, [buffered, paused]);
            });
        }
    }

    // eslint-disable-next-line class-methods-use-this
    private onTerminalResize(uuid: string, cols: number, rows: number) {
        invoke("pty_resize", {
            uuid,
            cols,
            rows,
        }).catch((e) => {
            this.toaster.toast(
                new PtyResizeError(e as string, "Unable to resize terminal")
            );
        });
    }

    // eslint-disable-next-line class-methods-use-this
    private async onTerminalNeedClosability(uuid: string): Promise<boolean> {
        return new Promise((resolve, reject) => {
            invoke<boolean>("pty_get_closable", {
                uuid,
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
    private async onTerminalNeedLeaderName(uuid: string): Promise<string> {
        return new Promise((resolve, reject) => {
            invoke<string>("pty_get_leader_name", {
                uuid,
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
    private onTerminalOutgoingData(uuid: string, data: string) {
        invoke("pty_write", { data, uuid }).catch((e) => {
            this.toaster.toast(
                new PtyWriteError(e as string, "Unable to handle data stream")
            );
        });
    }

    // eslint-disable-next-line class-methods-use-this
    private async onTerminalExit(uuid: string): Promise<void> {
        try {
            return await invoke<void>("pty_close", { uuid });
        } catch (e) {
            throw new PtyExitError(e as string, "Unable to dispose terminal");
        }
    }

    async openNew(profileUuid: string): Promise<Terminal> {
        const profile = this.profiles.find(
            (profile) => profile.uuid === profileUuid
        );
        if (!profile) {
            throw new UnknownProfileError(profileUuid);
        }

        const terminal = new Terminal(profile);
        try {
            this.terminals.push(terminal);
            this.terminalFlows.set(terminal.uuid, [0, false]);
            await invoke("pty_open", {
                uuid: terminal.uuid,
                profileUuid,
            });
        } catch (e) {
            this.terminals.pop();
            this.terminalFlows.delete(terminal.uuid);
            throw new PtyCreateError(e as string, "Unable to create terminal");
        }

        terminal.onTerminalResize = (cols, rows) =>
            this.onTerminalResize(terminal.uuid, cols, rows);
        terminal.onTerminalNeedClosability = async () =>
            this.onTerminalNeedClosability(terminal.uuid);
        terminal.onTerminalNeedLeaderName = async () =>
            this.onTerminalNeedLeaderName(terminal.uuid);
        terminal.onTerminalOutgoingData = (data) =>
            this.onTerminalOutgoingData(terminal.uuid, data);
        terminal.onTerminalExit = async () =>
            this.onTerminalExit(terminal.uuid);
        terminal.onTerminalKeyPress = (e) =>
            this.onTerminalKeyPressed(e, terminal);
        return terminal;
    }

    getSelection(uuid: string): string {
        try {
            return this.terminals
                .find((terminal) => terminal.uuid === uuid)!
                .xterm.getSelection();
        } catch {
            throw new UnknownTerminalError(
                `There is no terminal with ID ${uuid}.`
            );
        }
    }

    insertContent(uuid: string, data: string) {
        const terminal = this.terminals.find(
            (terminal) => terminal.uuid === uuid
        );
        if (!terminal) {
            throw new UnknownTerminalError(
                `There is no terminal with ID ${uuid}.`
            );
        }
        terminal.xterm.paste(data);
    }
}
