import {MarkdownView, Plugin, WorkspaceLeaf} from 'obsidian';
import {DEFAULT_SETTINGS, TagserSettings, TagserSettingTab} from "./settings";
import {TAGSER_TAGS_VIEW_TYPE, TagsView} from "./views/TagsView";

// Remember to rename these classes and interfaces!

export default class Tagser extends Plugin {
	// TagserSettings 型の settings フィールドを宣言
	settings: TagserSettings;
	// activatingTagsSidebar() が実行中かどうかを管理するフィールド
	// 同時に複数のタグパネルを開くことを防ぐために使用
	private _activatingTagsSidebar = false;

	async onload() {
		await this.loadSettings();

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Status bar text');

		this.registerView(
			TAGSER_TAGS_VIEW_TYPE,
			(leaf: WorkspaceLeaf) =>
				new TagsView(leaf, () => this.settings.tagsPropertyKey),
		);

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
		this.addSettingTab(new TagserSettingTab(this.app, this));

		// サンプルの document クリックはエディタのフォーカス調査の妨げになるので削除

		// When registering intervals, this function will automatically clear the interval when this plugin is disabled.
		//this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));

	}

	onunload() {
	}

	async loadSettings() {
		// loadData() はデータが無いと null を返すことがあるため、常にオブジェクトに正規化する
		const raw = ((await this.loadData()) ?? {}) as Partial<TagserSettings> & {
			mySetting?: string;
		};
		this.settings = Object.assign({}, DEFAULT_SETTINGS, raw);
		// 旧キー mySetting からの移行
		if (
			raw.tagsPropertyKey === undefined &&
			typeof raw.mySetting === "string" &&
			raw.mySetting.trim() !== ""
		) {
			this.settings.tagsPropertyKey = raw.mySetting.trim();
		}
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
			const existingLeaves = ws.getLeavesOfType(TAGSER_TAGS_VIEW_TYPE);
			// タグパネルの Leaf が存在する場合
			if (existingLeaves.length > 0) {
				// 最初の Leaf を取得
				leaf = existingLeaves[0]!;
			} else if (typeof ws.ensureSideLeaf === 'function') {
				// タグパネルの Leaf が存在しない場合、右サイドバーにタグパネルを作成
				leaf = await ws.ensureSideLeaf(TAGSER_TAGS_VIEW_TYPE, 'right', {
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
				await right.setViewState({type: TAGSER_TAGS_VIEW_TYPE, active: false});
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

	/** 設定変更後など、開いているタグパネルを再描画する */
	refreshTagsViews(): void {
		// getLeavesOfType() は配列を返すので、for...of でループする
		// 実際には 1 つのタグパネルしか開いていないので、1 回のループで十分
		// ゼロの要素の配列をループするのは安全なので、forEach ではなく for...of を使用
		for (const leaf of this.app.workspace.getLeavesOfType(TAGSER_TAGS_VIEW_TYPE)) {
			const view = leaf.view;
			// 取得した view が TagsView のインスタンスであれば、refresh() を呼ぶ
			if (view instanceof TagsView) {
				view.refresh();
			}
		}
	}
}
