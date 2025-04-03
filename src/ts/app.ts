import { listen, Event } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

import { ShortcutAction } from "schemas/settings";
import Toaster from "managers/toast";
import TabManager from "managers/tab";
import PopupManager from "managers/popup";
import ShortcutManager from "managers/shortcut";
import TerminalManager from "managers/terminal";
import View from "components/view/view";
import { PopupBuilder, PopupButton } from "components/interface/popup";
import {
    PaneOutOfCapacityError,
    SelectSpecificPathRejectionReason,
    UnknownMacroError,
    UnknownTerminalError,
    UnkownSplitPathError,
    ViewSelectSpecificPaneError,
} from "schemas/error";
import { openTabPayload, showToastPayload } from "schemas/common";
import * as clipboard from "@tauri-apps/plugin-clipboard-manager";

export default class App {
    private target: Element;

    private tabsManager: TabManager;

    private popupManager: PopupManager;
    private shortcutsManager: ShortcutManager;
    private terminalManager: TerminalManager;

    private views: View[] = [];
    private focusedView?: View;

    private toaster: Toaster;

    constructor(
        target: Element,
        tabsTarget: HTMLElement,
        toastTarget: Element
    ) {
        this.target = target;

        this.toaster = new Toaster(toastTarget);
        this.toaster.onToastDismissed = () => this.focusedView?.focus();
        this.popupManager = new PopupManager();
        this.popupManager.onPopupClosed = () => {
            this.focusedView?.focus();
        };

        this.tabsManager = new TabManager(tabsTarget, (uuid) =>
            this.onTabRequestClose(uuid)
        );
        this.tabsManager.onTabFocused = (uuid) => this.onTabFocused(uuid);
        this.tabsManager.onFocusedTabTitleUpdated = (title) =>
            this.onFocusedTabTitleUpdated(title);

        this.shortcutsManager = new ShortcutManager(
            settings.shortcuts,
            (action, target) => this.onShortcutExecuted(action, target)
        );

        this.terminalManager = new TerminalManager(
            settings.profiles,
            this.toaster,
            (e, term) => this.shortcutsManager.onKeyPress(e, term)
        );

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        listen("js_window_request_closing", () => this.closeViews());
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        listen<number>("js_app_request_exit", (e) => this.closeAllWindows(e));
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        listen<showToastPayload>("js_show_toast", (e) =>
            this.toaster.toast(
                e.payload.title,
                e.payload.message,
                e.payload.type
            )
        );
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        listen<openTabPayload>("js_open_tab", async (e) => {
            if (e.payload.profile) {
                await this.openProfile(e.payload.profile.uuid, true);
            }
        });
    }

    private async closeAllWindows(e: Event<number>) {
        const confirmButton = new PopupButton("confirm", "validate");
        const cancelButton = new PopupButton("cancel", "dismiss");

        const popupResult = await this.popupManager.sendPopup(
            new PopupBuilder(`Confirm close of ${e.payload} windows`)
                .withMessage(`Are you sure to close the app?`)
                .withButtons(confirmButton, cancelButton)
        );
        if (popupResult.action === "confirm") {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            invoke("utils_close_app");
        }
    }

    private onTabFocused(uuid: string) {
        const view = this.views.find((view) => view.uuid! === uuid);
        if (view) {
            this.focusedView?.blur();
            view.focus();
            this.focusedView = view;
        }
    }

    // eslint-disable-next-line class-methods-use-this
    private onFocusedTabTitleUpdated(title: string) {
        if (settings.desktopIntegration.dynamic_title) {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            invoke("window_set_title", { title });
        }
    }

    private async onTabRequestClose(uuid: string) {
        try {
            const view = this.views.find((view) => view.uuid === uuid);
            if (view) {
                await view.requestClosing();
            }
        } catch (e) {
            this.toaster.toast(e as Error);
        }
    }

    private onViewClosed(uuid: string) {
        const view = this.views.find((view) => view.uuid === uuid);
        if (view) {
            view.element!.remove();
            this.views.splice(this.views.indexOf(view), 1);
            if (this.views.length === 0) {
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                invoke("window_close");
            }
        }

        this.tabsManager.closeTab(uuid);
    }

    private async onShortcutExecuted(
        action: ShortcutAction,
        targetId?: string
    ) {
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
                                (macro) => macro.uuid === action[1]
                            );
                            if (macro) {
                                await this.terminalManager.insertContent(
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
                            await this.terminalManager.openNew(action[1])
                        );
                        break;
                    case "splitFocusedPaneAndOpenProfile":
                        await this.focusedView?.splitFocusedWidget(
                            await this.terminalManager.openNew(action[1])
                        );
                        break;
                    case "splitSpecificPaneAndOpenProfile": {
                        const path =
                            await this.focusedView!.selectSpecificPane();
                        await this.focusedView?.splitSpecificWidget(
                            await this.terminalManager.openNew(action[1]),
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
                            settings.defaultProfile.uuid,
                            true
                        );
                        break;
                    case "splitSpecificPaneAndOpenDefaultProfile": {
                        const path =
                            await this.focusedView!.selectSpecificPane();
                        await this.focusedView?.splitSpecificWidget(
                            await this.terminalManager.openNew(
                                settings.defaultProfile.uuid
                            ),
                            path
                        );
                        break;
                    }
                    case "splitFocusedPaneAndOpenDefaultProfile":
                        await this.focusedView?.splitFocusedWidget(
                            await this.terminalManager.openNew(
                                settings.defaultProfile.uuid
                            )
                        );
                        break;
                    case "splitTabAndOpenDefaultProfile":
                        await this.focusedView?.addWidget(
                            await this.terminalManager.openNew(
                                settings.defaultProfile.uuid
                            )
                        );
                        break;
                    case "closeFocusedTab":
                        this.tabsManager.requestTabClosing(
                            this.tabsManager.getSelected().uuid
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
                        await this.closeViews();
                        break;
                }
            }
        } catch (e) {
            if (
                e instanceof ViewSelectSpecificPaneError &&
                e.type !== SelectSpecificPathRejectionReason.AppAborted
            ) {
                return;
            }

            if (
                e instanceof PaneOutOfCapacityError ||
                e instanceof UnkownSplitPathError
            ) {
                await e.target.close();
            }

            this.toaster.toast(e as Error);
        }
    }

    private async closeViews() {
        try {
            if (this.views.length === 1) {
                this.tabsManager.requestTabClosing(this.views[0].uuid!);
            } else {
                const confirmButton = new PopupButton("confirm", "validate");
                const cancelButton = new PopupButton("cancel", "dismiss");

                const popupResult = await this.popupManager.sendPopup(
                    new PopupBuilder(
                        `Confirm close of ${this.views.length} tabs`
                    )
                        .withMessage(`Are you sure to close this window?`)
                        .withButtons(confirmButton, cancelButton)
                );
                if (popupResult.action === "confirm") {
                    for await (const view of this.views) {
                        await view.close();
                    }

                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
                    invoke("window_close");
                }
            }
        } catch (e) {
            this.toaster.toast(e as Error);
        }
    }

    private generateView(): View {
        const viewId = crypto.randomUUID();
        const view = new View(viewId, this.popupManager, this.toaster);

        view.onceClosed = () => this.onViewClosed(viewId);

        view.onWidgetAdded = (id) => this.onWidgetAdded(viewId, id);
        view.onWidgetFocused = (id) => this.onWidgetFocused(viewId, id);
        view.onWidgetTitleUpdated = (id, title) =>
            this.onWidgetTitleUpdated(viewId, id, title);
        view.onWidgetRequestHighlight = () =>
            this.onWidgetRequestHighlight(viewId);
        view.onWidgetProgressUpdated = (id, progress) =>
            this.onWidgetProgressUpdated(viewId, id, progress);
        view.onWidgetClosed = (id) => this.onWidgetClosed(viewId, id);

        return view;
    }

    async openProfile(profileUuid: string, focus: boolean) {
        try {
            const terminalWidget =
                await this.terminalManager.openNew(profileUuid);

            const view = this.generateView();
            this.tabsManager.openNewTab(view.uuid);
            this.target.appendChild(view.element);
            await view.addWidget(terminalWidget);
            this.views.push(view);

            if (focus) {
                this.tabsManager.select(view.uuid);
            }
        } catch (e) {
            this.toaster.toast(e as Error);
        }
    }

    private onWidgetRequestHighlight(viewId: string) {
        this.tabsManager.setHightlight(viewId, true);
    }

    private onWidgetTitleUpdated(
        viewId: string,
        paneId: string,
        title: string
    ) {
        this.tabsManager.setPaneTitle(viewId, paneId, title);
    }

    private onWidgetProgressUpdated(
        viewId: string,
        paneId: string,
        progress: number
    ) {
        this.tabsManager.setPaneProgress(viewId, paneId, progress);
    }

    private onWidgetFocused(viewId: string, paneId: string) {
        this.tabsManager.setPaneGroupLeader(viewId, paneId);
    }

    private onWidgetClosed(viewId: string, paneId: string) {
        this.tabsManager.removePane(viewId, paneId);
    }

    private onWidgetAdded(viewId: string, paneId: string) {
        this.tabsManager.addPane(viewId, paneId);
    }
}
