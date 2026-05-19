import { App, PluginSettingTab, Setting } from "obsidian";
import { DEFAULT_TAGS_PROPERTY_KEY } from "./constants";
import Tagger from "./main";

export interface TaggerSettings {
	/** frontmatter でタグ一覧を読み書きするプロパティ名 */
	tagsPropertyKey: string;
}

export const DEFAULT_SETTINGS: TaggerSettings = {
	tagsPropertyKey: DEFAULT_TAGS_PROPERTY_KEY,
};

export class TaggerSettingTab extends PluginSettingTab {
	plugin: Tagger;

	constructor(app: App, plugin: Tagger) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Tags property key")
			.setDesc(
				`Frontmatter key that holds your tag list. Leave blank to use ${DEFAULT_TAGS_PROPERTY_KEY}.`,
			)
			.addText((text) =>
				text
					.setPlaceholder("")
					.setValue(this.plugin.settings.tagsPropertyKey)
					.onChange(async (value) => {
						this.plugin.settings.tagsPropertyKey = value;
						await this.plugin.saveSettings();
						this.plugin.refreshTagsViews();
					}),
			);
	}
}
