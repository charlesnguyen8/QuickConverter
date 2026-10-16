ChinesePhienAmWords.txt: single-character Hán Việt readings from Quick Translator (QT2025),
copied from quick-translator-engine (GPL-3.0) for personal, non-distributed use.
Used by the reader's dictionary conversion mode as the per-character fallback.

VietPhrase.txt (phrase dictionary), Names.txt (shared proper names), Pronouns.txt and
IgnoredChinesePhrases.txt (site spam removed before conversion) come from the same QT2025
data folder, under the same personal-use terms. Loaded on demand by services/qt-dictionaries.js.

HoNguoi.txt (surnames), HauTu.txt (person suffixes) and DanhTu.txt (place/organisation
templates) come from QT2025/Resources, same terms. jieba/ holds Jieba's word dictionary
(dict.txt) and HMM tables (prob_emit.json, prob_trans.json) from the same folder, used to
segment chapters when suggesting names.
