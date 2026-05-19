import { ItemView, WorkspaceLeaf } from "obsidian";

export const TAGGER_TAGS_VIEW_TYPE = "tagger-tags";

/** プロパティ行を必ず1行に収める（YAML の複数行文字・改行を潰す） */
function collapseForSingleLine(s: string): string {
	return s.replace(/\r?\n|\r/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeTags(raw: unknown): string[] {
	if (raw == null) {
		return [];
	}
	if (Array.isArray(raw)) {
		return raw
			.filter((x) => x != null)
			.map((x) => String(x).trim())
			.filter(Boolean);
	}
	if (typeof raw === "string") {
		return raw
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
	}
	return [];
}

function formatPropertyValue(value: unknown): string {
	if (value == null) {
		return "";
	}
	if (typeof value === "string") {
		return value;
	}
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	if (value instanceof Date) {
		return value.toISOString();
	}
	if (Array.isArray(value)) {
		return value.map((v) => formatPropertyValue(v)).join(", ");
	}
	if (typeof value === "object") {
		try {
			return JSON.stringify(value);
		} catch {
			return "[Unable to stringify]";
		}
	}
	return "[Unsupported]";
}

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
		this.contentEl.addClass("tagger-view-root");
		this.bodyEl = this.contentEl.createDiv({ cls: "tagger-tags-body" });
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

		const currentFile = this.app.workspace.getActiveFile();
		if (!currentFile || currentFile.extension !== "md") {
			this.bodyEl.createDiv({
				text: "Open a Markdown note.",
				cls: "tagger-tags-hint",
			});
			return;
		}

		this.bodyEl.createEl("h1", {
			text: currentFile.basename,
			cls: "tagger-note-name",
		});
		this.bodyEl.createEl("hr", { cls: "tagger-note-divider" });

		const fm = this.app.metadataCache.getFileCache(currentFile)?.frontmatter as
			| Record<string, unknown>
			| undefined;

		const panel = this.bodyEl.createDiv({ cls: "tagger-properties-panel" });
		panel.createDiv({
			text: "Properties",
			cls: "tagger-properties-header",
		});

		const propsWrap = panel.createDiv({ cls: "tagger-properties" });

		const keys = fm ? Object.keys(fm).filter((k) => k !== "tags") : [];
		if (fm && keys.length > 0) {
			for (const key of keys) {
				const row = propsWrap.createDiv({ cls: "tagger-prop-row" });
				row.createSpan({
					text: collapseForSingleLine(key),
					cls: "tagger-prop-name tagger-prop-key",
				});
				const rawVal = fm[key];
				row.createSpan({
					text: collapseForSingleLine(formatPropertyValue(rawVal)),
					cls: "tagger-prop-value",
				});
			}
		}

		const tags = normalizeTags(fm?.tags);
		const tagsRow = propsWrap.createDiv({
			cls: "tagger-prop-row tagger-prop-row--tags",
		});
		tagsRow.createSpan({
			text: "tags",
			cls: "tagger-prop-name tagger-prop-key",
		});
		const tagsValue = tagsRow.createSpan({
			cls: "tagger-prop-value tagger-tags-value",
		});
		for (const tag of tags) {
			tagsValue.createSpan({
				text: tag,
				cls: "tagger-tag-badge",
			});
		}
	}
}
