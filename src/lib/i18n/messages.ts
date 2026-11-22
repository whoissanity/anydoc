import en from "@/locales/en.json";
import es from "@/locales/es.json";
import fr from "@/locales/fr.json";
import de from "@/locales/de.json";
import pt from "@/locales/pt.json";
import it from "@/locales/it.json";
import nl from "@/locales/nl.json";
import pl from "@/locales/pl.json";
import ru from "@/locales/ru.json";
import uk from "@/locales/uk.json";
import tr from "@/locales/tr.json";
import zhCN from "@/locales/zh-CN.json";
import zhTW from "@/locales/zh-TW.json";
import ja from "@/locales/ja.json";
import ko from "@/locales/ko.json";
import vi from "@/locales/vi.json";
import id from "@/locales/id.json";
import th from "@/locales/th.json";
import hi from "@/locales/hi.json";
import bn from "@/locales/bn.json";
import ar from "@/locales/ar.json";
import fa from "@/locales/fa.json";
import ur from "@/locales/ur.json";
import type { Locale } from "./config";

/** The English dictionary is the schema; every locale must provide the same keys. */
export type MessageKey = keyof typeof en;

export const MESSAGES: Record<Locale, Record<MessageKey, string>> = {
  en,
  es,
  fr,
  de,
  pt,
  it,
  nl,
  pl,
  ru,
  uk,
  tr,
  "zh-CN": zhCN,
  "zh-TW": zhTW,
  ja,
  ko,
  vi,
  id,
  th,
  hi,
  bn,
  ar,
  fa,
  ur,
};
