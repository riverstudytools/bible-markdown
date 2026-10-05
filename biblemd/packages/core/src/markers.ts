/** USFM marker classification shared by all formats. */

const LEVEL_DEFAULT_ONE = new Set(['q', 'qm', 's', 'ms', 'mt', 'mte', 'imt', 'imte', 'is', 'io', 'iq', 'ili', 'li', 'lim', 'pi', 'ph', 'sd']);

/** `\q` means `\q1`, `\s` means `\s1`, and so on. */
export function normalizeMarker(name: string): string {
  return LEVEL_DEFAULT_ONE.has(name) ? name + '1' : name;
}

const BLOCK_RE = /^(?:id|usfm|ide|sts|rem|h[123]?|toc[123]|toca[123]|imte?[1-4]?|is[1-4]?|ip|ipi|im|imi|ipq|imq|ipr|iq[1-4]?|ib|ili[1-4]?|iot|io[1-4]?|iex|ie|mte?[1-4]?|ms[1-4]?|mr|s[1-5]?|sr|r|d|sp|sd[1-4]?|cl|cd|cp|p|m|po|pr|cls|pmo|pm|pmc|pmr|pi[1-4]?|mi|nb|pc|ph[1-4]?|phi|b|q[1-4]?|qr|qc|qa|qm[1-4]?|qd|lh|li[1-4]?|lf|lim[1-4]?|lit|tr|periph|esb|esbe|c)$/;

export function isBlockMarker(name: string): boolean { return BLOCK_RE.test(name); }

const CELL_RE = /^(?:th|thr|tc|tcr|tcc)\d+(?:-\d+)?$/;
const NOTE_INNER_RE = /^(?:fr|fk|fq|fqa|fl|fw|fp|fv|ft|fdc|fm|xo|xk|xq|xt|xta|xop|xot|xnt|xdc)$/;
const NOTE_RE = /^(?:f|fe|x|ef|ex)$/;
/** Character markers whose content is never formatted with Bible Markdown syntax. */
const CONTAINERS = new Set(['ca', 'va', 'vp', 'fig', 'rq', 'ior', 'cat']);

export const isCell = (n: string) => CELL_RE.test(n);
export const isNoteInner = (n: string) => NOTE_INNER_RE.test(n);
export const isNote = (n: string) => NOTE_RE.test(n);
/** Markers that end at the next marker instead of having their own closer. */
export const isImplicitChar = (n: string) => CELL_RE.test(n) || NOTE_INNER_RE.test(n);
export const isContainer = (n: string) => CONTAINERS.has(n);

/** Markers with no displayed text of their own. */
const NO_TEXT = new Set(['ide', 'sts', 'rem', 'usfm', 'toc1', 'toc2', 'toc3', 'toca1', 'toca2', 'toca3', 'h', 'h1', 'h2', 'h3', 'nb', 'ie']);
export const isNoTextBlock = (n: string) => NO_TEXT.has(n) || /^sd\d?$/.test(n);

export const POETRY_RE = /^q([1-4])$/;
export const INTRO_PARA = new Set(['ip', 'ipi', 'im', 'imi', 'ipq', 'imq', 'ipr']);
export const isIntroMarker = (n: string) => /^(?:imte?\d|is\d|ip|ipi|im|imi|ipq|imq|ipr|iq\d|ib|ili\d|iot|io\d|iex|ie)$/.test(n);

/** Standard USFM book codes (used for warnings only). */
export const BOOK_CODES = new Set(('GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SNG ISA JER LAM EZK DAN HOS JOL AMO OBA JON MIC NAM HAB ZEP HAG ZEC MAL ' +
  'MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV ' +
  'TOB JDT ESG WIS SIR BAR LJE S3Y SUS BEL 1MA 2MA 3MA 4MA 1ES 2ES MAN PS2 ODA PSS EZA 5EZ 6EZ DAG PS3 2BA LBA JUB ENO 1MQ 2MQ 3MQ REP 4BA LAO FRT BAK OTH INT CNC GLO TDX NDX XXA XXB XXC XXD XXE XXF XXG').split(' '));

/** Default list of "noisy" markers dropped by the Readable fidelity level. */
export const DEFAULT_NOISY_MARKERS = ['w', 'wg', 'wh', 'wa', 'rb', 'ndx', 'k', 'ts', 'ide', 'sts'];
export const DEFAULT_NOISY_ATTRS = ['lemma', 'strong', 'srcloc', 'gloss', 'x-morph', 'x-tw'];

/** Block-level markers written in USFM as milestones (`\\zhtmlb |html="..."\\*`). Bible quotations use the standard quotation milestones `\\qt-s` / `\\qt-e` (see usfm.ts). */
export const BLOCK_MS = new Set(['zhtmlb']);
export const isQuoteMs = (m: string): boolean => m === 'qt-s' || m === 'qt-e';

/** Character markers known to USFM 3 (used to warn about unknown markers such as a stray `\\n`). */
export const KNOWN_CHAR = new Set(('add bk dc k lit nd ord pn png addpn qt sig sls tl wj em bd it bdit no sc sup rb pro w wg wh wa jmp fig ndx ' +
  'qs qac ior iqt rq ca va vp cat litl lik liv1 liv2 liv3 liv4 liv5 fr fk fq fqa fl fw fp fv ft fdc fm xo xk xq xt xta xop xot xnt xdc ' +
  'f fe x ef ex v c ts th1 th2 th3 th4 th5 thr1 thr2 thr3 thr4 thr5 tc1 tc2 tc3 tc4 tc5 tcr1 tcr2 tcr3 tcr4 tcr5 tcc1 tcc2 tcc3 tcc4 tcc5 ' +
  'efe zhtml ph esb esbe').split(' '));
export const isKnownChar = (n: string): boolean => KNOWN_CHAR.has(n) || n.startsWith('z') || /^(?:th|thr|tc|tcr|tcc|liv)\d+(?:-\d+)?$/.test(n) || isBlockMarker(n);
