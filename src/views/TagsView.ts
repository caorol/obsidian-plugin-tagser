import { ItemView, WorkspaceLeaf } from "obsidian";

export const TAGGER_TAGS_VIEW_TYPE = "tagger-tags";

export class TagsView extends ItemView {
    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewType(): string {
        return TAGGER_TAGS_VIEW_TYPE;
    }

    getDisplayText(): string {
        return "Tagger";
    }

    private bodyEl: HTMLElement | null = null;
    async onOpen(): Promise<void> {
        this.contentEl.empty();
        this.bodyEl = this.contentEl.createDiv({ cls: 'tagger-tags-body' });
        this.refresh();
    }

    async onClose(): Promise<void> {
        this.bodyEl = null;
        this.contentEl.empty();
    }

    refresh(): void {
        if (!this.bodyEl) {
            return;
        }
        this.bodyEl.empty();

        // 現在のノートを取得
        const currentFile = this.app.workspace.getActiveFile();
        if (!currentFile || currentFile.extension !== "md") {
            this.bodyEl.createDiv({ text: 'Open a Markdown note to see tags', cls: 'tagger-tags-hint' });
            return;
        }

        // divに現在のノート名をセット
        this.bodyEl.createDiv({ text: currentFile.basename, cls: 'tagger-note-name' });
    }
}
