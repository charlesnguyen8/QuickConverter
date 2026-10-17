ChinesePhienAmWords.txt: single-character Hán Việt readings from Quick Translator (QT2025),
copied from quick-translator-engine (GPL-3.0) for personal, non-distributed use.
Used by the reader's dictionary conversion mode as the per-character fallback.

VietPhrase.txt (phrase dictionary), Names.txt (shared proper names), Pronouns.txt and
IgnoredChinesePhrases.txt (site spam removed before conversion) come from the same QT2025
data folder, under the same personal-use terms. Loaded on demand by services/qt-dictionaries.js.

TraditionalToSimplified.txt maps traditional to simplified characters (hex code points), the
table Windows StrConv uses and QT2025 relies on, copied from quick-translator-engine's
strconv_t2s.tsv under the same terms. The converter simplifies input with it before matching.

LacViet.txt is QT2025's Lạc Việt Chinese-Vietnamese dictionary (pinyin, Hán Việt and numbered
definitions; `\n`/`\t` stored as literal text), same source and terms. It is not used for
conversion: the reader loads it the first time you tap a phrase and shows the definitions in
the phrase panel.

HoNguoi.txt (surnames), HauTu.txt (person suffixes) and DanhTu.txt (place/organisation
templates) come from QT2025/Resources, same terms. jieba/ holds Jieba's word dictionary
(dict.txt) and HMM tables (prob_emit.json, prob_trans.json) from the same folder, used to
segment chapters when suggesting names.
