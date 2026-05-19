import {App, Editor, MarkdownView, Modal, Notice, Plugin, WorkspaceLeaf} from 'obsidian';
import {DEFAULT_SETTINGS, TaggerSettings, TaggerSettingTab} from "./settings";
import {TAGGER_TAGS_VIEW_TYPE, TagsView} from "./views/TagsView";

// Remember to rename these classes and interfaces!

export default class Tagger extends Plugin {
	// TaggerSettings 型の settings フィールドを宣言
	settings: TaggerSettings;
	// activatingTagsSidebar() が実行中かどうかを管理するフィールド
	// 同時に複数のタグパネルを開くことを防ぐために使用
	private _activatingTagsSidebar = false;

	async onload() {
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		this.addRibbonIcon('dice', 'Sample', (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			new Notice('This is a notice!');
		});

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Status bar text');

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'open-modal-simple',
			name: 'Open modal (simple)',
			callback: () => {
				new TaggerModal(this.app).open();
			}
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'replace-selected',
			name: 'Replace selected content',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				editor.replaceSelection('Sample editor command');
			}
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: 'open-modal-complex',
			name: 'Open modal (complex)',
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						new TaggerModal(this.app).open();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
				return false;
			}
		});

		this.registerView(TAGGER_TAGS_VIEW_TYPE, (leaf: WorkspaceLeaf) => new TagsView(leaf));

		this.registerEvent(
			this.app.workspace.on('file-open', () => {
				this.openTagsPanelIfMarkdownNote();
			})
		);
		this.registerEvent(
			this.app.metadataCache.on('changed', (file) => {
				if (file === this.app.workspace.getActiveFile()) {
					this.refreshTagsViews();
				}
			})
		);

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new TaggerSettingTab(this.app, this));

		// サンプルの document クリックはエディタのフォーカス調査の妨げになるので削除

		// When registering intervals, this function will automatically clear the interval when this plugin is disabled.
		//this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));

	}

	onunload() {
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<TaggerSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private openTagsPanelIfMarkdownNote(): void {
		const file = this.app.workspace.getActiveFile();
		if (file?.extension !== 'md') {
			return;
		}
		// タグパネルを開く
		// openTagsPanelIfMarkdownNote は async ではないので、await が書けない
		// activateTagsSidebar() は async なので、void を付けて非同期処理を待たないようにする
		void this.activateTagsSidebar();
	}
	
	// 中で await を使用しているので await を付ける
	private async activateTagsSidebar(): Promise<void> {
		if (this._activatingTagsSidebar) {
			return;
		}
		this._activatingTagsSidebar = true;
		try {
			const ws = this.app.workspace;
			// activeLeaf は非推奨のため、復帰先は Markdown ビューの leaf を使う
			// 現在のフォーカスが Markdown ビューの leaf であれば、それを復帰先とする
			const leafToRestoreFocus =
				ws.getActiveViewOfType(MarkdownView)?.leaf ?? null;
			let leaf: WorkspaceLeaf;

			// ワークスペース全体から、タグパネルの Leaf を取得
			const existingLeaves = ws.getLeavesOfType(TAGGER_TAGS_VIEW_TYPE);
			// タグパネルの Leaf が存在する場合
			if (existingLeaves.length > 0) {
				// 最初の Leaf を取得
				leaf = existingLeaves[0]!;
			} else if (typeof ws.ensureSideLeaf === 'function') {
				// タグパネルの Leaf が存在しない場合、右サイドバーにタグパネルを作成
				leaf = await ws.ensureSideLeaf(TAGGER_TAGS_VIEW_TYPE, 'right', {
					active: false,
					reveal: false,
				});
			} else {
				// ensureSideLeaf が無い環境向けのフォールバック
				// getRightLeaf は右サイドバーの Leaf を取得, false は分割しないを意味する
				const right = ws.getRightLeaf(false);
				if (!right) {
					return;
				}
				await right.setViewState({type: TAGGER_TAGS_VIEW_TYPE, active: false});
				leaf = right;
			}

			// loadIfDeferred() はタグパネルをロードする
			if (typeof leaf.loadIfDeferred === 'function') {
				await leaf.loadIfDeferred();
			}
			this.refreshTagsViews();

			this.restoreEditorFocus(leafToRestoreFocus);
			window.setTimeout(() => {
				this.restoreEditorFocus(leafToRestoreFocus);
			}, 0);
		} finally {
			// return 時でも try の中なら finally が実行される
			this._activatingTagsSidebar = false;
		}
	}
	
	private restoreEditorFocus(leafToRestore: WorkspaceLeaf | null): void {
		if (!leafToRestore) {
			return;
		}
		const ws = this.app.workspace;
		// 復帰先の leaf にフォーカスを移す
		ws.setActiveLeaf(leafToRestore, {focus: true});
	}

	private refreshTagsViews(): void {
		// getLeavesOfType() は配列を返すので、for...of でループする
		// 実際には 1 つのタグパネルしか開いていないので、1 回のループで十分
		// ゼロの要素の配列をループするのは安全なので、forEach ではなく for...of を使用
		for (const leaf of this.app.workspace.getLeavesOfType(TAGGER_TAGS_VIEW_TYPE)) {
			const view = leaf.view;
			// 取得した view が TagsView のインスタンスであれば、refresh() を呼ぶ
			if (view instanceof TagsView) {
				view.refresh();
			}
		}
	}
}

class TaggerModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		let {contentEl} = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}
