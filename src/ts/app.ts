import { invoke } from "@tauri-apps/api/core";
import { Event } from "@tauri-apps/api/event";
import * as clipboard from "@tauri-apps/plugin-clipboard-manager";
import { UUID } from "crypto";

import { PopupBuilder, PopupButton } from "@/components/interface/popup";
import View from "@/components/view/view";
import Widget from "@/components/view/widgets/base";

import ShortcutManager from "@/managers/shortcut";
import TabManager from "@/managers/tab";
import TerminalManager from "@/managers/terminal";

import { OpenTabPayload, ShowToastPayload } from "@/schemas/common";
import {
    PaneOutOfCapacityError,
    SelectSpecificPathRejectionReason,
    UnknownMacroError,
    UnknownTerminalError,
    UnkownSplitPathError,
    ViewSelectSpecificPaneError,
} from "@/schemas/error";
import { ShortcutAction } from "@/schemas/settings";

export default class App {
    private target: Element;

    private tabsManager: TabManager;
    private shortcutsManager: ShortcutManager;
    private terminalManager: TerminalManager;

    private views: View[] = [];
    private focusedView?: View;

    constructor(target: Element, tabsTarget: HTMLElement) {
        this.target = target;

        toaster.onToastDismissed = () => this.focusedView?.focus();
        popupManager.onPopupClosed = () => {
            this.focusedView?.focus();
        };

        this.tabsManager = new TabManager(tabsTarget);
        this.tabsManager.addEventListener("tabCloseRequest", async (e) => {
            await this.onTabRequestClose((e as CustomEvent).detail);
        });
        this.tabsManager.addEventListener("tabFocus", (e) => {
            this.onTabFocused((e as CustomEvent).detail);
        });
        this.tabsManager.addEventListener("tabTitleChange", (e) => {
            App.refreshWindowTitle((e as CustomEvent).detail);
        });
        this.tabsManager.addEventListener("widgetFocusRequest", (e) => {
            const { tabId, widgetId } = (e as CustomEvent).detail;
            this.views.find((view) => view.id === tabId)?.focusWidget(widgetId);
        });
        this.tabsManager.addEventListener("widgetCloseRequest", async (e) => {
            const { tabId, widgetId } = (e as CustomEvent).detail;

            await this.views
                .find((view) => view.id === tabId)
                ?.closeWidget(widgetId);
        });

        this.shortcutsManager = new ShortcutManager(
            settings.shortcuts,
            (action, target) => this.onShortcutExecuted(action, target)
        );

        this.terminalManager = new TerminalManager(
            settings.profiles,
            (e, term) => this.shortcutsManager.onKeyPress(e, term)
        );

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        webviewWindow.listen("js_window_request_closing", () =>
            this.closeWindow()
        );
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        webviewWindow.listen<number>("js_app_request_exit", (e) =>
            App.closeApp(e)
        );
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        webviewWindow.listen<ShowToastPayload>("js_show_toast", (e) =>
            toaster.toast(e.payload.title, e.payload.message, e.payload.type)
        );
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        webviewWindow.listen<OpenTabPayload>("js_open_tab", async (e) => {
            if (settings.appBehavior.focusMode === "requestAttention") {
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                invoke("window_request_attention");
            }
            if (settings.appBehavior.focusMode === "focus") {
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                invoke("window_focus");
            }

            if (e.payload.profile) {
                await this.openProfile(
                    e.payload.profile.id ?? settings.defaultProfile.id,
                    true,
                    e.payload.profile.command,
                    e.payload.profile.workdir,
                    e.payload.profile.title
                );
            }
        });
    }

    private onTabFocused(tabId: UUID) {
        const view = this.views.find((view) => view.id === tabId);
        if (view) {
            this.focusedView?.blur();
            view.focus();
            this.focusedView = view;
        }
    }

    private async onTabRequestClose(tabId: UUID) {
        try {
            const view = this.views.find((view) => view.id === tabId);
            if (view) {
                await view.requestClosing();
            }
        } catch (e) {
            toaster.toast(e as Error);
        }
    }

    private onViewClosed(viewId: UUID) {
        const view = this.views.find((view) => view.id === viewId);
        if (view) {
            view.element.remove();
            this.views.splice(this.views.indexOf(view), 1);
            if (this.views.length === 0) {
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                invoke("window_close");
            }
        }

        this.tabsManager.closeTab(viewId);
    }

    private async onShortcutExecuted(action: ShortcutAction, targetId?: UUID) {
        try {
            if (Array.isArray(action)) {
                switch (action[0]) {
                    case "focusTab":
                        this.tabsManager.select(action[1]);
                        break;
                    case "openProfile":
                        await this.openProfile(action[1], true);
                        break;
                    case "executeMacro":
                        if (targetId) {
                            const macro = settings.macros.find(
                                (macro) => macro.id === action[1]
                            );
                            if (macro) {
                                this.terminalManager.insertContent(
                                    targetId,
                                    macro.content
                                );
                            } else {
                                throw new UnknownMacroError(action[1]);
                            }
                        } else {
                            throw new UnknownTerminalError();
                        }

                        break;
                    case "splitTabAndOpenProfile":
                        await this.focusedView?.addWidget(
                            this.connectWidget(
                                this.focusedView.id,
                                await this.terminalManager.openNew(action[1])
                            )
                        );
                        break;
                    case "splitFocusedPaneAndOpenProfile":
                        await this.focusedView?.splitFocusedWidget(
                            this.connectWidget(
                                this.focusedView.id,
                                await this.terminalManager.openNew(action[1])
                            )
                        );
                        break;
                    case "splitSpecificPaneAndOpenProfile": {
                        const path =
                            await this.focusedView!.selectSpecificPane();
                        await this.focusedView?.splitSpecificWidget(
                            this.connectWidget(
                                this.focusedView.id,
                                await this.terminalManager.openNew(action[1])
                            ),
                            path
                        );
                        break;
                    }
                }
            } else {
                switch (action) {
                    case "copy":
                        if (targetId) {
                            await clipboard.writeText(
                                this.terminalManager.getSelection(targetId)
                            );
                        }
                        break;
                    case "paste":
                        if (targetId) {
                            let clipboardContent;
                            try {
                                clipboardContent = await clipboard.readText();
                            } catch (e) {
                                /* empty */
                            }
                            if (clipboardContent) {
                                this.terminalManager.insertContent(
                                    targetId,
                                    clipboardContent
                                );
                            }
                        }
                        break;
                    case "openDefaultProfile":
                        await this.openProfile(
                            settings.defaultProfile.id,
                            true
                        );
                        break;
                    case "splitSpecificPaneAndOpenDefaultProfile": {
                        const path =
                            await this.focusedView!.selectSpecificPane();
                        await this.focusedView?.splitSpecificWidget(
                            this.connectWidget(
                                this.focusedView.id,
                                await this.terminalManager.openNew(
                                    settings.defaultProfile.id
                                )
                            ),
                            path
                        );
                        break;
                    }
                    case "splitFocusedPaneAndOpenDefaultProfile":
                        await this.focusedView?.splitFocusedWidget(
                            this.connectWidget(
                                this.focusedView.id,
                                await this.terminalManager.openNew(
                                    settings.defaultProfile.id
                                )
                            )
                        );
                        break;
                    case "splitTabAndOpenDefaultProfile":
                        await this.focusedView?.addWidget(
                            this.connectWidget(
                                this.focusedView.id,
                                await this.terminalManager.openNew(
                                    settings.defaultProfile.id
                                )
                            )
                        );
                        break;
                    case "closeFocusedTab":
                        await this.onTabRequestClose(
                            this.tabsManager.getSelected().id
                        );
                        break;
                    case "closeFocusedPane":
                        await this.focusedView!.requestClosingFocused();
                        break;
                    case "closeSpecificPane": {
                        const path =
                            await this.focusedView!.selectSpecificPane();
                        await this.focusedView?.requestClosingSpecific(path);
                        break;
                    }
                    case "focusNextTab":
                        this.tabsManager.selectNext();
                        break;
                    case "focusPrevTab":
                        this.tabsManager.selectPrevious();
                        break;
                    case "focusFirstTab":
                        this.tabsManager.selectFirst();
                        break;
                    case "focusLastTab":
                        this.tabsManager.selectLast();
                        break;
                    case "closeWindow":
                        await this.closeWindow();
                        break;
                }
            }
        } catch (e) {
            if (
                e instanceof ViewSelectSpecificPaneError &&
                e.type !== SelectSpecificPathRejectionReason.appAborted
            ) {
                return;
            }

            if (
                e instanceof PaneOutOfCapacityError ||
                e instanceof UnkownSplitPathError
            ) {
                await e.target.close();
            }

            toaster.toast(e as Error);
        }
    }

    private async closeWindow() {
        try {
            if (this.views.length === 1) {
                await this.onTabRequestClose(this.views[0].id);
            } else {
                const confirmButton = new PopupButton("confirm", "validate");
                const cancelButton = new PopupButton("cancel", "dismiss");

                if (
                    !settings.closeConfirmation.window ||
                    (
                        await popupManager.sendPopup(
                            new PopupBuilder(
                                `Confirm close of ${this.views.length} tabs`
                            )
                                .withMessage(
                                    `Are you sure to close this window?`
                                )
                                .withButtons(confirmButton, cancelButton)
                        )
                    ).action === "confirm"
                ) {
                    await Promise.all(this.views.map((view) => view.close()));

                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
                    invoke("window_close");
                }
            }
        } catch (e) {
            toaster.toast(e as Error);
        }
    }

    private generateView(): View {
        const viewId = crypto.randomUUID();
        const view = new View(viewId);

        view.addEventListener("close", () => this.onViewClosed(viewId), {
            once: true,
        });
        view.addEventListener("focusChange", (e: CustomEventInit<UUID>) => {
            this.onWidgetFocused(viewId, e.detail!);
        });

        return view;
    }

    private connectWidget(viewId: UUID, widget: Widget): Widget {
        widget.addEventListener("change", () => {
            this.tabsManager.setWidgetState(viewId, widget.id, widget.state);
        });
        widget.addEventListener("attentionRequest", () => {
            this.tabsManager.setWidgetAttention(viewId, widget.id, true);
        });
        widget.addEventListener(
            "close",
            () => this.onWidgetClosed(viewId, widget.id),
            { once: true }
        );
        setTimeout(() => {
            this.tabsManager.addWidget(viewId, widget.id, widget.state);
        }, 0);
        return widget;
    }

    async openProfile(
        profileId: UUID,
        focus: boolean,
        command?: string,
        workdir?: string,
        title?: string
    ) {
        try {
            const terminalWidget = await this.terminalManager.openNew(
                profileId,
                command,
                workdir,
                title
            );

            const view = this.generateView();
            this.tabsManager.openTab(view.id);
            this.target.appendChild(view.element);

            await view.addWidget(this.connectWidget(view.id, terminalWidget));
            this.views.push(view);

            if (focus) {
                this.tabsManager.select(view.id);
            }
        } catch (e) {
            toaster.toast(e as Error);
        }
    }

    private onWidgetFocused(viewId: UUID, widgetId: UUID) {
        this.tabsManager.setWidgetGroupLeader(viewId, widgetId);
    }

    private onWidgetClosed(viewId: UUID, widgetId: UUID) {
        this.tabsManager.removeWidget(viewId, widgetId);
    }

    private static async closeApp(e: Event<number>) {
        const confirmButton = new PopupButton("confirm", "validate");
        const cancelButton = new PopupButton("cancel", "dismiss");

        if (
            !settings.closeConfirmation.app ||
            (
                await popupManager.sendPopup(
                    new PopupBuilder(`Confirm close of ${e.payload} windows`)
                        .withMessage(`Are you sure to close the app?`)
                        .withButtons(confirmButton, cancelButton)
                )
            ).action === "confirm"
        ) {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            invoke("utils_close_app");
        }
    }

    private static refreshWindowTitle(title: string) {
        if (settings.desktopIntegration.dynamicTitle) {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            invoke("window_set_title", { title });
        }
    }
}
