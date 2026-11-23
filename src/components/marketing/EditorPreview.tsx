"use client";

import { BookOpen, FolderOpen, LayoutGrid, Search, Wrench } from "lucide-react";
import { useI18n } from "@/components/providers/I18nProvider";

const THUMBS = [1, 2, 3] as const;

/**
 * Decorative, non-interactive picture of the real editor: top bar, icon rail,
 * page thumbnails and a paper page on a workbench. Text on the page is drawn as
 * bars so there is no English to localize; only the tab labels use t().
 */
export function EditorPreview() {
  const { t } = useI18n();

  return (
    <div className="mkt-preview" aria-hidden="true">
      <div className="mkt-preview-bar">
        <span className="mkt-preview-tab mkt-preview-tab-active">
          <BookOpen size={14} />
          {t("toolbar.viewer")}
        </span>
        <span className="mkt-preview-tab">
          <LayoutGrid size={14} />
          {t("toolbar.organize")}
        </span>
        <span className="mkt-preview-tab">
          <Wrench size={14} />
          {t("toolbar.tools")}
        </span>
        <span className="mkt-preview-search">
          <Search size={13} />
          <i />
        </span>
      </div>

      <div className="mkt-preview-body">
        <div className="mkt-preview-rail">
          <FolderOpen size={16} />
          <BookOpen size={16} data-active="true" />
          <LayoutGrid size={16} />
          <Wrench size={16} />
        </div>

        <div className="mkt-preview-thumbs">
          {THUMBS.map((n) => (
            <div key={n} className="mkt-preview-thumb" data-active={n === 1}>
              <span />
              <span />
              <span />
              <small>{n}</small>
            </div>
          ))}
        </div>

        <div className="mkt-preview-canvas">
          <div className="mkt-preview-page">
            <div className="mkt-line mkt-line-title" />
            <div className="mkt-line" style={{ width: "92%" }} />
            <div className="mkt-line" style={{ width: "78%" }} />
            <div className="mkt-line mkt-line-mark" style={{ width: "64%" }} />
            <div className="mkt-line" style={{ width: "88%" }} />
            <div className="mkt-line mkt-line-redact" style={{ width: "46%" }} />
            <div className="mkt-line" style={{ width: "83%" }} />
            <div className="mkt-line" style={{ width: "58%" }} />

            <div className="mkt-preview-select">
              <div className="mkt-line" style={{ width: "100%" }} />
              <div className="mkt-line" style={{ width: "72%" }} />
              <b data-corner="tl" />
              <b data-corner="tr" />
              <b data-corner="bl" />
              <b data-corner="br" />
            </div>

            <svg className="mkt-preview-sign" viewBox="0 0 120 36" fill="none">
              <path
                d="M4 26c8-18 14-22 18-16s-6 20 2 18 8-14 14-12-2 12 6 10 10-8 14-6 6 4 12 0"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      </div>

      <div className="mkt-preview-status">
        <span>1 / 3</span>
        <span>100%</span>
      </div>
    </div>
  );
}
