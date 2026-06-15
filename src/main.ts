import { Plugin, TFile, Notice } from "obsidian";
import {
  TypechoSettingTab,
  type TypechoSettings,
  DEFAULT_SETTINGS,
} from "./settings";
import { PublishService } from "./publish-service";
import { t } from "./i18n";

export default class TypechoPlugin extends Plugin {
  settings!: TypechoSettings;
  private publishService!: PublishService;

  async onload() {
    await this.loadSettings();

    this.publishService = new PublishService(
      this.app,
      this.app.vault,
      this.app.metadataCache,
      () => this.settings,
      async () => { await this.saveSettings(); },
      async (file, fn) => {
        try {
          await this.app.fileManager.processFrontMatter(file, fn);
        } catch (e) {
          console.error("[TypechoPlugin] processFrontMatter failed:", e);
          throw e;
        }
      }
    );

    this.addSettingTab(new TypechoSettingTab(this.app, this));

    // Command: Publish current file
    this.addCommand({
      id: "publish-to-typecho",
      name: "Publish to Typecho",
      editorCallback: (_editor, view) => {
        if (view.file instanceof TFile && view.file.extension === "md") {
          this.publishCurrentFile(view.file);
        } else {
          new Notice(t("no_md_file"));
        }
      },
    });

    // File menu: Publish selected file
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (file instanceof TFile && file.extension === "md") {
          menu.addItem((item) => {
            item
              .setTitle("Publish to Typecho")
              .setIcon("send")
              .onClick(() => this.publishCurrentFile(file));
          });
        }
      })
    );

    // Editor menu: Publish from editor context menu
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor, view) => {
        if (view.file instanceof TFile && view.file.extension === "md") {
          menu.addItem((item) => {
            item
              .setTitle("Publish to Typecho")
              .setIcon("send")
              .onClick(() => this.publishCurrentFile(view.file!));
          });
        }
      })
    );
  }

  onunload() {
    // Resources registered via registerEvent are auto-cleaned
  }

  async loadSettings() {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      await this.loadData()
    );
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async publishCurrentFile(file: TFile) {
    await this.publishService.publish(file);
  }
}
