import { App, PluginSettingTab, Setting, type SettingDefinitionRender } from "obsidian";
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

type SettingRow = Omit<SettingDefinitionRender, "render"> & {
  render: (setting: Setting) => void;
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

    for (const definition of this.getSettingDefinitions()) {
      const visible = definition.visible;
      if (typeof visible === "function" ? !visible() : visible === false) continue;
      const setting = new Setting(containerEl).setName(definition.name);
      if (definition.desc) setting.setDesc(definition.desc);
      definition.render(setting);
    }
  }

  // Share row renderers between Obsidian 1.12 and the searchable settings API.
  getSettingDefinitions(): SettingRow[] {
    const definitions: SettingRow[] = [];
    const row = (
      name: string,
      desc: string | DocumentFragment | undefined,
      render: (setting: Setting) => void,
      visible?: () => boolean,
    ) => definitions.push({ name, desc, render, visible });
    const heading = (name: string, desc?: string) =>
      row(name, desc, (setting) => {
        setting.setHeading();
      });
    const usesExternalHost = () => this.plugin.settings.useImageHost;
    const usesR2 = () => usesExternalHost() && this.plugin.settings.imageHostType === "r2";

    // === Typecho Section ===
    heading(t("connection"));

    row(t("xmlrpc_url"), t("xmlrpc_url_desc"), (setting) => {
      setting
        .addText((text) =>
          text
            .setPlaceholder(t("xmlrpc_url_placeholder"))
            .setValue(this.plugin.settings.xmlrpcUrl)
            .onChange(async (value) => {
              this.plugin.settings.xmlrpcUrl = value.trim();
              await this.plugin.saveSettings();
            })
        );
    });

    row(t("username"), t("username_desc"), (setting) => {
      setting
        .addText((text) =>
          text
            .setPlaceholder(t("username_placeholder"))
            .setValue(this.plugin.settings.username)
            .onChange(async (value) => {
              this.plugin.settings.username = value.trim();
              await this.plugin.saveSettings();
            })
        );
    });

    row(t("password"), t("password_desc"), (setting) => {
      setting
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
    });

    // === Field Mapping ===
    heading(t("field_mapping"), t("field_mapping_desc"));

    const mappingFields: (keyof FieldMapping)[] = [
      "dateCreated", "title", "categories", "mt_keywords", "slug",
      "post_type", "mt_allow_comments", "mt_excerpt", "post_status",
    ];

    for (const field of mappingFields) {
      const descFrag = activeDocument.createDocumentFragment();
      t(`f_${field}_desc`).split("\n").forEach((line, i) => {
        if (i > 0) descFrag.appendChild(createEl("br"));
        descFrag.appendChild(activeDocument.createTextNode(line));
      });

      const locked = field === "dateCreated";

      row(t(`f_${field}_label`), descFrag, (setting) => {
        setting
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
      });
    }

    // === Slug Fallback ===
    heading(t("slug_fallback"), t("slug_fallback_desc"));

    row(t("date_format"), t("date_format_desc"), (setting) => {
      setting
        .addText((text) =>
          text
            .setPlaceholder("YYMMDDHH")
            .setValue(this.plugin.settings.slugDateFormat)
            .onChange(async (value) => {
              this.plugin.settings.slugDateFormat = value.trim() || "YYMMDDHH";
              await this.plugin.saveSettings();
            })
        );
    });

    // === Wiki-Link Conversion ===
    heading(t("wiki_link"), t("wiki_link_desc"));

    row(t("enable_wiki_link"), t("enable_wiki_link_desc"), (setting) => {
      setting
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.linkConversionEnabled)
            .onChange(async (value) => {
              this.plugin.settings.linkConversionEnabled = value;
              await this.plugin.saveSettings();
            })
        );
    });

    row(t("link_url_template"), t("link_url_template_desc"), (setting) => {
      setting
        .addText((text) =>
          text
            .setPlaceholder(t("link_url_template_placeholder"))
            .setValue(this.plugin.settings.linkUrlTemplate)
            .onChange(async (value) => {
              this.plugin.settings.linkUrlTemplate = value.trim();
              await this.plugin.saveSettings();
            })
        );
    });

    // === Content Cutoff ===
    heading(t("cutoff"), t("cutoff_desc"));

    row(t("cutoff_sections"), t("cutoff_sections_desc"), (setting) => {
      setting
        .addText((text) =>
          text
            .setPlaceholder(t("cutoff_placeholder"))
            .setValue(this.plugin.settings.cutoffSections)
            .onChange(async (value) => {
              this.plugin.settings.cutoffSections = value.trim();
              await this.plugin.saveSettings();
            })
        );
    });

    // === Validation ===
    heading(t("validation"));

    row(t("require_more"), t("require_more_desc"), (setting) => {
      setting
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.requireMoreTag)
            .onChange(async (value) => {
              this.plugin.settings.requireMoreTag = value;
              await this.plugin.saveSettings();
            })
        );
    });

    // === Image Hosting Section ===
    heading(t("image_host"));

    row(t("use_image_host"), t("use_image_host_desc"), (setting) => {
      setting
        .addToggle((toggle) => {
          toggle
            .setValue(this.plugin.settings.useImageHost)
            .onChange(async (value) => {
              this.plugin.settings.useImageHost = value;
              await this.plugin.saveSettings();
              this.refreshVisibility();
            });
        });
    });

    row(t("image_host_type"), t("image_host_type_desc"), (setting) => {
      setting
        .addDropdown((dropdown) => {
          dropdown
            .addOption("r2", t("image_host_type_r2"))
            .setValue(this.plugin.settings.imageHostType)
            .onChange(async (value) => {
              this.plugin.settings.imageHostType = value;
              await this.plugin.saveSettings();
              this.refreshVisibility();
            });
        });
    }, usesExternalHost);

    row(t("r2_account_id"), t("r2_account_id_desc"), (setting) => {
      setting
        .addText((text) =>
          text
            .setPlaceholder("account-id")
            .setValue(this.plugin.settings.r2AccountId)
            .onChange(async (value) => {
              this.plugin.settings.r2AccountId = value.trim();
              await this.plugin.saveSettings();
            })
        );
    }, usesR2);

    row(t("r2_access_key"), t("r2_access_key_desc"), (setting) => {
      setting
        .addText((text) =>
          text
            .setPlaceholder("access-key-id")
            .setValue(this.plugin.settings.r2AccessKeyId)
            .onChange(async (value) => {
              this.plugin.settings.r2AccessKeyId = value.trim();
              await this.plugin.saveSettings();
            })
        );
    }, usesR2);

    row(t("r2_secret_key"), t("r2_secret_key_desc"), (setting) => {
      setting
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
    }, usesR2);

    row(t("r2_bucket"), t("r2_bucket_desc"), (setting) => {
      setting
        .addText((text) =>
          text
            .setPlaceholder("my-bucket")
            .setValue(this.plugin.settings.r2Bucket)
            .onChange(async (value) => {
              this.plugin.settings.r2Bucket = value.trim();
              await this.plugin.saveSettings();
            })
        );
    }, usesR2);

    row(t("r2_public_url"), t("r2_public_url_desc"), (setting) => {
      setting
        .addText((text) =>
          text
            .setPlaceholder("https://pub-xxx.r2.dev")
            .setValue(this.plugin.settings.r2PublicUrlPrefix)
            .onChange(async (value) => {
              this.plugin.settings.r2PublicUrlPrefix = value.trim();
              await this.plugin.saveSettings();
            })
        );
    }, usesR2);

    row(t("r2_path_prefix"), t("r2_path_prefix_desc"), (setting) => {
      setting
        .addText((text) =>
          text
            .setPlaceholder("blog-images")
            .setValue(this.plugin.settings.r2PathPrefix)
            .onChange(async (value) => {
              this.plugin.settings.r2PathPrefix = value.trim() || "blog-images";
              await this.plugin.saveSettings();
            })
        );
    }, usesR2);
    return definitions;
  }

  private refreshVisibility(): void {
    if (typeof this.update === "function") this.update();
    else this.display();
  }
}
