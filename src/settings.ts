import { App, PluginSettingTab, Setting } from "obsidian";
import type TypechoPlugin from "./main";
import { t } from "./i18n";

/**
 * Maps Typecho XML-RPC fields to user's frontmatter keys.
 * Key = XML-RPC struct field name, Value = frontmatter key name.
 * Leave value empty to skip that field.
 */
export interface FieldMapping {
  title: string;
  description: string;
  categories: string;
  mt_keywords: string;
  slug: string;
  mt_allow_comments: string;
  mt_excerpt: string;
  post_status: string;
  post_type: string;
  dateCreated: string;
}

export interface TypechoSettings {
  // Typecho connection
  xmlrpcUrl: string;
  username: string;
  password: string;

  // Field mapping
  fieldMapping: FieldMapping;
  fieldRequired: Record<string, boolean>;

  // Slug fallback
  slugDateFormat: string;

  // Wiki-link conversion
  linkConversionEnabled: boolean;
  linkUrlTemplate: string;

  // Content cutoff
  cutoffSections: string;

  // Validation
  requireMoreTag: boolean;

  // Image hosting
  useImageHost: boolean;
  imageHostType: string;

  // R2 configuration
  r2AccountId: string;
  r2AccessKeyId: string;
  r2SecretAccessKey: string;
  r2Bucket: string;
  r2PublicUrlPrefix: string;
  r2PathPrefix: string;

  // Image cache: local vault path → R2 URL
  imageCache: Record<string, string>;
}

export const DEFAULT_FIELD_MAPPING: FieldMapping = {
  title: "aliases",
  description: "",
  categories: "categories",
  mt_keywords: "tags",
  slug: "slug",
  mt_allow_comments: "allow_comments",
  mt_excerpt: "excerpt",
  post_status: "post_status",
  post_type: "post_type",
  dateCreated: "published",
};

export const DEFAULT_SETTINGS: TypechoSettings = {
  xmlrpcUrl: "",
  username: "",
  password: "",

  fieldMapping: { ...DEFAULT_FIELD_MAPPING },
  fieldRequired: { dateCreated: true },

  slugDateFormat: "YYMMDDHH",

  linkConversionEnabled: true,
  linkUrlTemplate: "",

  cutoffSections: "",

  requireMoreTag: false,

  useImageHost: false,
  imageHostType: "r2",

  r2AccountId: "",
  r2AccessKeyId: "",
  r2SecretAccessKey: "",
  r2Bucket: "",
  r2PublicUrlPrefix: "",
  r2PathPrefix: "blog-images",

  imageCache: {},
};

export class TypechoSettingTab extends PluginSettingTab {
  plugin: TypechoPlugin;

  constructor(app: App, plugin: TypechoPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // === Typecho Section ===
    new Setting(containerEl).setName(t("connection")).setHeading();

    new Setting(containerEl)
      .setName(t("xmlrpc_url"))
      .setDesc(t("xmlrpc_url_desc"))
      .addText((text) =>
        text
          .setPlaceholder(t("xmlrpc_url_placeholder"))
          .setValue(this.plugin.settings.xmlrpcUrl)
          .onChange(async (value) => {
            this.plugin.settings.xmlrpcUrl = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t("username"))
      .setDesc(t("username_desc"))
      .addText((text) =>
        text
          .setPlaceholder(t("username_placeholder"))
          .setValue(this.plugin.settings.username)
          .onChange(async (value) => {
            this.plugin.settings.username = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t("password"))
      .setDesc(t("password_desc"))
      .addText((text) => {
        text.inputEl.type = "password";
        text
          .setPlaceholder(t("password_placeholder"))
          .setValue(this.plugin.settings.password)
          .onChange(async (value) => {
            this.plugin.settings.password = value;
            await this.plugin.saveSettings();
          });
      });

    // === Field Mapping ===
    new Setting(containerEl).setName(t("field_mapping")).setHeading();
    containerEl.createEl("p", {
      text: t("field_mapping_desc"),
      cls: "setting-item-description",
    });

    const mappingFields: (keyof FieldMapping)[] = [
      "dateCreated", "title", "categories", "mt_keywords", "slug",
      "post_type", "mt_allow_comments", "mt_excerpt", "post_status",
    ];

    for (const field of mappingFields) {
      const descFrag = activeDocument.createDocumentFragment();
      t(`f_${field}_desc`).split("\n").forEach((line, i) => {
        if (i > 0) descFrag.appendChild(activeDocument.createElement("br"));
        descFrag.appendChild(activeDocument.createTextNode(line));
      });

      const locked = field === "dateCreated";

      new Setting(containerEl)
        .setName(t(`f_${field}_label`))
        .setDesc(descFrag)
        .addText((text) =>
          text
            .setPlaceholder(DEFAULT_FIELD_MAPPING[field] || "—")
            .setValue(this.plugin.settings.fieldMapping[field])
            .onChange(async (value) => {
              this.plugin.settings.fieldMapping[field] = value.trim();
              await this.plugin.saveSettings();
            })
        )
        .addToggle((toggle) => {
          toggle
            .setValue(
              locked
                ? true
                : (this.plugin.settings.fieldRequired[field] ?? false)
            )
            .setDisabled(locked)
            .setTooltip(locked ? t("always_required") : t("require_field"))
            .onChange(async (value) => {
              this.plugin.settings.fieldRequired[field] = value;
              await this.plugin.saveSettings();
            });
        });
    }

    // === Slug Fallback ===
    new Setting(containerEl).setName(t("slug_fallback")).setHeading();
    containerEl.createEl("p", {
      text: t("slug_fallback_desc"),
      cls: "setting-item-description",
    });

    new Setting(containerEl)
      .setName(t("date_format"))
      .setDesc(t("date_format_desc"))
      .addText((text) =>
        text
          .setPlaceholder("YYMMDDHH")
          .setValue(this.plugin.settings.slugDateFormat)
          .onChange(async (value) => {
            this.plugin.settings.slugDateFormat = value.trim() || "YYMMDDHH";
            await this.plugin.saveSettings();
          })
      );

    // === Wiki-Link Conversion ===
    new Setting(containerEl).setName(t("wiki_link")).setHeading();
    containerEl.createEl("p", {
      text: t("wiki_link_desc"),
      cls: "setting-item-description",
    });

    new Setting(containerEl)
      .setName(t("enable_wiki_link"))
      .setDesc(t("enable_wiki_link_desc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.linkConversionEnabled)
          .onChange(async (value) => {
            this.plugin.settings.linkConversionEnabled = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t("link_url_template"))
      .setDesc(t("link_url_template_desc"))
      .addText((text) =>
        text
          .setPlaceholder(t("link_url_template_placeholder"))
          .setValue(this.plugin.settings.linkUrlTemplate)
          .onChange(async (value) => {
            this.plugin.settings.linkUrlTemplate = value.trim();
            await this.plugin.saveSettings();
          })
      );

    // === Content Cutoff ===
    new Setting(containerEl).setName(t("cutoff")).setHeading();
    containerEl.createEl("p", {
      text: t("cutoff_desc"),
      cls: "setting-item-description",
    });

    new Setting(containerEl)
      .setName(t("cutoff_sections"))
      .setDesc(t("cutoff_sections_desc"))
      .addText((text) =>
        text
          .setPlaceholder(t("cutoff_placeholder"))
          .setValue(this.plugin.settings.cutoffSections)
          .onChange(async (value) => {
            this.plugin.settings.cutoffSections = value.trim();
            await this.plugin.saveSettings();
          })
      );

    // === Validation ===
    new Setting(containerEl).setName(t("validation")).setHeading();

    new Setting(containerEl)
      .setName(t("require_more"))
      .setDesc(t("require_more_desc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.requireMoreTag)
          .onChange(async (value) => {
            this.plugin.settings.requireMoreTag = value;
            await this.plugin.saveSettings();
          })
      );

    // === Image Hosting Section ===
    new Setting(containerEl).setName(t("image_host")).setHeading();

    new Setting(containerEl)
      .setName(t("use_image_host"))
      .setDesc(t("use_image_host_desc"))
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.useImageHost)
          .onChange(async (value) => {
            this.plugin.settings.useImageHost = value;
            extHostContainer.style.display = value ? "" : "none";
            await this.plugin.saveSettings();
          });
      });

    const extHostContainer = containerEl.createEl("div");
    extHostContainer.style.display = this.plugin.settings.useImageHost ? "" : "none";

    let r2ConfigContainer: HTMLDivElement;

    new Setting(extHostContainer)
      .setName(t("image_host_type"))
      .setDesc(t("image_host_type_desc"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("r2", t("image_host_type_r2"))
          .setValue(this.plugin.settings.imageHostType)
          .onChange(async (value) => {
            this.plugin.settings.imageHostType = value;
            if (r2ConfigContainer) r2ConfigContainer.style.display = value === "r2" ? "" : "none";
            await this.plugin.saveSettings();
          });
        // Init visibility deferred — r2ConfigContainer not created yet
      });

    r2ConfigContainer = extHostContainer.createEl("div");
    r2ConfigContainer.style.display =
      this.plugin.settings.imageHostType === "r2" ? "" : "none";

    new Setting(r2ConfigContainer)
      .setName(t("r2_account_id"))
      .setDesc(t("r2_account_id_desc"))
      .addText((text) =>
        text
          .setPlaceholder("account-id")
          .setValue(this.plugin.settings.r2AccountId)
          .onChange(async (value) => {
            this.plugin.settings.r2AccountId = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(r2ConfigContainer)
      .setName(t("r2_access_key"))
      .setDesc(t("r2_access_key_desc"))
      .addText((text) =>
        text
          .setPlaceholder("access-key-id")
          .setValue(this.plugin.settings.r2AccessKeyId)
          .onChange(async (value) => {
            this.plugin.settings.r2AccessKeyId = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(r2ConfigContainer)
      .setName(t("r2_secret_key"))
      .setDesc(t("r2_secret_key_desc"))
      .addText((text) => {
        text.inputEl.type = "password";
        text
          .setPlaceholder("secret-access-key")
          .setValue(this.plugin.settings.r2SecretAccessKey)
          .onChange(async (value) => {
            this.plugin.settings.r2SecretAccessKey = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(r2ConfigContainer)
      .setName(t("r2_bucket"))
      .setDesc(t("r2_bucket_desc"))
      .addText((text) =>
        text
          .setPlaceholder("my-bucket")
          .setValue(this.plugin.settings.r2Bucket)
          .onChange(async (value) => {
            this.plugin.settings.r2Bucket = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(r2ConfigContainer)
      .setName(t("r2_public_url"))
      .setDesc(t("r2_public_url_desc"))
      .addText((text) =>
        text
          .setPlaceholder("https://pub-xxx.r2.dev")
          .setValue(this.plugin.settings.r2PublicUrlPrefix)
          .onChange(async (value) => {
            this.plugin.settings.r2PublicUrlPrefix = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(r2ConfigContainer)
      .setName(t("r2_path_prefix"))
      .setDesc(t("r2_path_prefix_desc"))
      .addText((text) =>
        text
          .setPlaceholder("blog-images")
          .setValue(this.plugin.settings.r2PathPrefix)
          .onChange(async (value) => {
            this.plugin.settings.r2PathPrefix = value.trim() || "blog-images";
            await this.plugin.saveSettings();
          })
      );
  }
}
