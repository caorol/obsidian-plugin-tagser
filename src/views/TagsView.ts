import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import { DEFAULT_TAGS_PROPERTY_KEY } from "../constants";

export const TAGSER_TAGS_VIEW_TYPE = "tagser-tags";

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

/** 表示・編集インデックス整合のため、タグを昇順にそろえる（数値っぽい部分も考慮） */
function sortTagsAscending(tags: string[]): string[] {
	return [...tags].sort((a, b) =>
		a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
	);
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
	constructor(
		leaf: WorkspaceLeaf,
		private readonly getTagsPropertyKey: () => string,
	) {
		super(leaf);
	}

	/** 設定値をトリムし、空なら既定キー（{@link DEFAULT_TAGS_PROPERTY_KEY}） */
	private resolvedTagsKey(): string {
		const k = this.getTagsPropertyKey().trim();
		return k === "" ? DEFAULT_TAGS_PROPERTY_KEY : k;
	}

	getViewType(): string {
		return TAGSER_TAGS_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Tagser";
	}

	private bodyEl: HTMLElement | null = null;

	/** `refresh` で表示中のノート（タグ編集の保存先） */
	private displayedFile: TFile | null = null;

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass("tagser-view-root");
		this.bodyEl = this.contentEl.createDiv({ cls: "tagser-tags-body" });

		this.registerDomEvent(this.bodyEl, "click", (e: MouseEvent) => {
			void this.onTagsValueClick(e);
		});
		this.registerDomEvent(this.bodyEl, "keydown", (e: KeyboardEvent) => {
			this.onTagEditKeydown(e);
		});
		this.registerDomEvent(this.bodyEl, "focusout", (e: FocusEvent) => {
			void this.onTagEditFocusOut(e);
		});

		this.refresh();
	}

	async onClose(): Promise<void> {
		this.bodyEl = null;
		this.displayedFile = null;
		this.contentEl.empty();
	}

	refresh(): void {
		if (!this.bodyEl) {
			return;
		}
		this.bodyEl.empty();
		this.displayedFile = null;

		const currentFile = this.app.workspace.getActiveFile();
		if (!currentFile || currentFile.extension !== "md") {
			this.bodyEl.createDiv({
				text: "Open a Markdown note.",
				cls: "tagser-tags-hint",
			});
			return;
		}

		this.displayedFile = currentFile;

		this.bodyEl.createEl("h1", {
			text: currentFile.basename,
			cls: "tagser-note-name",
		});
		this.bodyEl.createEl("hr", { cls: "tagser-note-divider" });

		const fm = this.app.metadataCache.getFileCache(currentFile)?.frontmatter as
			| Record<string, unknown>
			| undefined;

		const panel = this.bodyEl.createDiv({ cls: "tagser-properties-panel" });
		panel.createDiv({
			text: "Properties",
			cls: "tagser-properties-header",
		});

		const propsWrap = panel.createDiv({ cls: "tagser-properties" });

		const tagsKey = this.resolvedTagsKey();

		const keys = fm
			? Object.keys(fm).filter((k) => k !== tagsKey)
			: [];
		if (fm && keys.length > 0) {
			for (const key of keys) {
				const row = propsWrap.createDiv({ cls: "tagser-prop-row" });
				row.createSpan({
					text: collapseForSingleLine(key),
					cls: "tagser-prop-name tagser-prop-key",
				});
				const rawVal = fm[key];
				row.createSpan({
					text: collapseForSingleLine(formatPropertyValue(rawVal)),
					cls: "tagser-prop-value",
				});
			}
		}

		const tags = sortTagsAscending(normalizeTags(fm?.[tagsKey]));
		const tagsRow = propsWrap.createDiv({
			cls: "tagser-prop-row tagser-prop-row--tags",
		});
		tagsRow.createSpan({
			text: tagsKey,
			cls: "tagser-prop-name tagser-prop-key",
		});
		const tagsValue = tagsRow.createSpan({
			cls: "tagser-prop-value tagser-tags-value",
		});
		for (let i = 0; i < tags.length; i++) {
			const tag = tags[i];
			const badge = tagsValue.createSpan({ cls: "tagser-tag-badge" });
			badge.dataset.tagIndex = String(i);
			badge.createSpan({
				text: tag,
				cls: "tagser-tag-badge-label",
			});
			badge.createEl("button", {
				type: "button",
				cls: "tagser-tag-badge-remove",
				text: "×",
				attr: {
					type: "button",
					"aria-label": "Remove tag",
				},
			});
		}
		tagsValue.createSpan({
			cls: "tagser-tags-value-tail",
			attr: {
				"aria-label": "Add tag",
			},
		});
	}

	private onTagEditKeydown(e: KeyboardEvent): void {
		const el = e.target;
		if (!(el instanceof HTMLInputElement) || !el.matches(".tagser-tag-edit-input")) {
			return;
		}

		if (el.matches(".tagser-tag-add-input")) {
			if (e.key === "Enter") {
				e.preventDefault();
				void this.commitNewTag(el);
			} else if (e.key === "Escape") {
				e.preventDefault();
				this.cancelNewTag(el);
			}
			return;
		}

		if (e.key === "Enter") {
			e.preventDefault();
			void this.commitTagEdit(el);
		} else if (e.key === "Escape") {
			e.preventDefault();
			this.cancelTagEdit();
		}
	}

	/** 編集・追加の入力からフォーカスが外れたら確定（× などのクリックを先に処理するよう 1 ティック遅延） */
	private onTagEditFocusOut(e: FocusEvent): void {
		const el = e.target;
		if (!(el instanceof HTMLInputElement) || !el.matches(".tagser-tag-edit-input")) {
			return;
		}

		window.setTimeout(() => {
			if (!document.contains(el)) {
				return;
			}
			if (document.activeElement === el) {
				return;
			}
			if (el.matches(".tagser-tag-add-input")) {
				void this.commitNewTag(el);
			} else {
				void this.commitTagEdit(el);
			}
		}, 0);
	}

	private async onTagsValueClick(e: MouseEvent): Promise<void> {
		const rawTarget = e.target;
		const target: HTMLElement | null =
			rawTarget instanceof HTMLElement
				? rawTarget
				: rawTarget instanceof Node
					? rawTarget.parentElement
					: null;
		if (!target) {
			return;
		}

		const removeBtn = target.closest(".tagser-tag-badge-remove");
		if (removeBtn) {
			e.preventDefault();
			e.stopPropagation();
			const badge = removeBtn.closest(".tagser-tag-badge");
			const idx = Number.parseInt(badge?.getAttribute("data-tag-index") ?? "", 10);
			if (Number.isFinite(idx)) {
				await this.removeTagAt(idx);
			}
			return;
		}

		const label = target.closest(".tagser-tag-badge-label");
		if (label) {
			const badgeEl = label.closest(".tagser-tag-badge");
			if (!(badgeEl instanceof HTMLElement)) {
				return;
			}
			const idx = Number.parseInt(badgeEl.dataset.tagIndex ?? "", 10);
			if (!Number.isFinite(idx)) {
				return;
			}

			const text = label.textContent ?? "";
			this.beginTagEdit(badgeEl, idx, text);
			return;
		}

		// tail が空だと幅 0 になり、クリックが親の値エリアに落ちる。バッジ外の値エリアクリックでも追加を開く
		const tagsValueEl = target.closest(
			".tagser-prop-row--tags .tagser-prop-value",
		);
		if (tagsValueEl instanceof HTMLElement && !target.closest(".tagser-tag-badge")) {
			const tailEl = tagsValueEl.querySelector(
				":scope > .tagser-tags-value-tail",
			);
			if (
				tailEl instanceof HTMLElement &&
				!tailEl.querySelector(".tagser-tag-edit-input")
			) {
				this.beginAddTag(tailEl);
			}
		}
	}

	private beginAddTag(tail: HTMLElement): void {
		if (this.bodyEl?.querySelector(".tagser-tag-edit-input")) {
			return;
		}

		tail.empty();
		const input = tail.createEl("input", {
			type: "text",
			cls: "tagser-tag-edit-input tagser-tag-add-input",
		});
		if (!(input instanceof HTMLInputElement)) {
			return;
		}
		input.size = 5;

		requestAnimationFrame(() => {
			input.focus();
		});
	}

	private cancelNewTag(input: HTMLInputElement): void {
		const tail = input.closest(".tagser-tags-value-tail");
		tail?.empty();
	}

	private async commitNewTag(input: HTMLInputElement): Promise<void> {
		const file = this.displayedFile;
		if (!file) {
			return;
		}

		const newVal = input.value.trim();
		if (newVal === "") {
			this.cancelNewTag(input);
			return;
		}

		try {
			const tagsKey = this.resolvedTagsKey();
			await this.app.fileManager.processFrontMatter(file, (fm) => {
				const fmRec = fm as Record<string, unknown>;
				fmRec[tagsKey] = sortTagsAscending([
					...normalizeTags(fmRec[tagsKey]),
					newVal,
				]);
			});
			this.refresh();
		} catch (err) {
			console.error("[Tagser] Failed to add tag", err);
		}
	}

	private beginTagEdit(badge: HTMLElement, index: number, tagText: string): void {
		if (this.bodyEl?.querySelector(".tagser-tag-edit-input")) {
			return;
		}

		badge.empty();
		badge.dataset.tagIndex = String(index);
		const input = badge.createEl("input", {
			type: "text",
			cls: "tagser-tag-edit-input",
		});
		if (!(input instanceof HTMLInputElement)) {
			return;
		}
		input.value = tagText;
		input.size = Math.max(3, Math.min(tagText.length + 2, 48));

		requestAnimationFrame(() => {
			input.focus();
			input.select();
		});
	}

	private cancelTagEdit(): void {
		this.refresh();
	}

	private async commitTagEdit(input: HTMLInputElement): Promise<void> {
		const badgeEl = input.closest(".tagser-tag-badge");
		const file = this.displayedFile;
		if (!(badgeEl instanceof HTMLElement) || !file) {
			return;
		}

		const index = Number.parseInt(badgeEl.dataset.tagIndex ?? "", 10);
		if (!Number.isFinite(index)) {
			return;
		}

		const newVal = input.value.trim();

		try {
			const tagsKey = this.resolvedTagsKey();
			await this.app.fileManager.processFrontMatter(file, (fm) => {
				const fmRec = fm as Record<string, unknown>;
				const t = sortTagsAscending([...normalizeTags(fmRec[tagsKey])]);
				if (index < 0 || index >= t.length) {
					return;
				}
				if (newVal === "") {
					t.splice(index, 1);
				} else {
					t[index] = newVal;
				}
				fmRec[tagsKey] = sortTagsAscending(t);
			});
			this.refresh();
		} catch (err) {
			console.error("[Tagser] Failed to update tags", err);
		}
	}

	private async removeTagAt(index: number): Promise<void> {
		const file = this.displayedFile;
		if (!file) {
			return;
		}

		try {
			const tagsKey = this.resolvedTagsKey();
			await this.app.fileManager.processFrontMatter(file, (fm) => {
				const fmRec = fm as Record<string, unknown>;
				const t = sortTagsAscending([...normalizeTags(fmRec[tagsKey])]);
				if (index < 0 || index >= t.length) {
					return;
				}
				t.splice(index, 1);
				fmRec[tagsKey] = sortTagsAscending(t);
			});
			this.refresh();
		} catch (err) {
			console.error("[Tagser] Failed to remove tag", err);
		}
	}
}
