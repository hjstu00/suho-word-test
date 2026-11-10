// 낱말 → 퍼즐 조각 규칙. 브라우저(app.js)와 Node(tools/check_rules.mjs)가 같이 쓴다. DOM·네트워크 없음.

// ---- 파일 이름 (tools/make_audio.py와 같은 규칙) ----
export const slug = (l, t) => l === 'ko'
  ? [...t].map(c => c.codePointAt(0).toString(16)).join('-')
  : t.toLowerCase().replaceAll(' ', '_');

// ---- 첫 글자 줄 ----
export const INDEX = { ko: [...'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ'], en: [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'] };
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const PLAIN = { 'ㄲ': 'ㄱ', 'ㄸ': 'ㄷ', 'ㅃ': 'ㅂ', 'ㅆ': 'ㅅ', 'ㅉ': 'ㅈ' };
const BELOW = 'ㅗㅛㅜㅠㅡ'; // 이 모음은 자음 아래에 놓인다

export function jamo(syl) { // '곰' → ['ㄱ','ㅗ','ㅁ'], 한글 음절이 아니면 null
  const n = syl.codePointAt(0) - 0xac00;
  if (n < 0 || n > 11171) return null;
  return [CHO[Math.floor(n / 588)], JUNG[Math.floor((n % 588) / 28)], JONG[n % 28]].filter(Boolean);
}
export function initial(l, w) {
  if (l === 'en') return w[0].toUpperCase();
  const j = jamo(w[0]);
  return j ? PLAIN[j[0]] || j[0] : w[0];
}

// ---- 영어 파닉스: 글자마다 소리 키 (sounds.json phonics의 키, 'silent'는 소리 없음) ----
const TEAMS = [ // 앞에서 긴 것부터 맞춘다. 두 글자가 같은 소리를 낸다
  ['tch', 'ch'], ['sh', 'sh'], ['ch', 'ch'], ['th', 'th'], ['ph', 'f'], ['wh', 'w'], ['ck', 'k'], ['ng', 'ng'], ['qu', 'kw'],
  ['ee', 'e-long'], ['ea', 'e-long'], ['oa', 'o-long'], ['ai', 'a-long'], ['ay', 'a-long'], ['oo', 'oo'],
  ['ou', 'ow'], ['ow', 'ow'], ['oy', 'oy'], ['oi', 'oy'], ['aw', 'aw'],
  ['ar', 'ar'], ['er', 'er'], ['ir', 'er'], ['ur', 'er'], ['or', 'or'],
];
// 규칙으로 틀리는 낱말은 글자 수만큼 직접 적는다 (사람이 검토한 값)
export const PHONICS_FIX = {
  bulldozer: 'b oo-short l l d o-long z er er',
  tiger: 't i-long g er er',
  monkey: 'm u ng k e-long e-long',
  carrot: 'k a r r uh t',
  cookie: 'k oo-short oo-short k e-long silent',
  book: 'b oo-short oo-short k',
  zebra: 'z e-long b r uh',
  robot: 'r o-long b o t',
  pizza: 'p e-long t z uh',
  baby: 'b a-long b e-long',
  banana: 'b uh n a n uh',
  tomato: 't uh m a-long t o-long',
  octopus: 'o k t uh p uh s',
  pencil: 'p e n s uh l',
  rabbit: 'r a b b uh t',
  rocket: 'r o k k uh t',
  turtle: 't er er t l silent',
  apple: 'a p p l silent',
  flower: 'f l ow ow er er',
  umbrella: 'u m b r e l l uh',
  grandma: 'g r a n d m o', // 끝 a는 /ɑ/ (octopus의 o 소리)
  grandpa: 'g r a n d p o',
  igloo: 'i g l oo oo',
  helmet: 'h e l m uh t',
  ladder: 'l a d d er er',
  hammer: 'h a m m er er',
  loader: 'l o-long o-long d er er',
  roller: 'r o-long l l er er',
  digger: 'd i g g er er',
  forklift: 'f or or k l i f t',
  puppy: 'p u p p e-long',
  yoyo: 'y o-long y o-long',
  ball: 'b aw l l',
};
const VOWELS = 'aeiou';
const isCons = c => c >= 'a' && c <= 'z' && !VOWELS.includes(c);

export function phonics(word) {
  const w = [...word.toLowerCase()].filter(c => c >= 'a' && c <= 'z').join('');
  if (PHONICS_FIX[w]) return PHONICS_FIX[w].split(' ');
  const out = Array(w.length).fill(null);
  for (let i = 0; i < w.length; i++) { // 두세 글자 소리
    if (out[i]) continue;
    const t = TEAMS.find(([s]) => w.startsWith(s, i));
    if (t) { for (let k = 0; k < t[0].length; k++) out[i + k] = t[1]; i += t[0].length - 1; }
  }
  const last = w.length - 1;
  const otherVowel = i => [...w].some((c, k) => k !== i && VOWELS.includes(c));
  for (let i = 0; i < w.length; i++) {
    if (out[i]) continue;
    const c = w[i], next = w[i + 1] || '';
    if (c === 'e' && i === last && w.length > 2 && otherVowel(i)) out[i] = 'silent';
    else if (VOWELS.includes(c)) {
      const magicE = isCons(next) && i + 2 === last && w[last] === 'e';
      if (c === 'a' && w.startsWith('ll', i + 1)) out[i] = 'aw';
      else if (magicE) out[i] = c === 'u' ? 'u-long' : `${c}-long`;
      else if (c === 'o' && i === last) out[i] = 'o-long';
      else out[i] = c;
    } else if (c === 'y') out[i] = i === 0 ? 'y' : i === last ? (otherVowel(i) ? 'e-long' : 'i-long') : 'i';
    else if (c === 'c') out[i] = next && 'eiy'.includes(next) ? 's' : 'k';
    else if (c === 'g') out[i] = next && 'eiy'.includes(next) ? 'j' : 'g';
    else if (c === 'x') out[i] = 'ks';
    else if (c === 'q') out[i] = 'kw';
    else out[i] = c;
  }
  return out;
}

// ---- 퍼즐 조각 ----
// 한글 자모 모드: 3~4단계(세 글자·받침) 낱말 중 자모가 8개 이하. 1~2단계는 음절 (사용자 선택 2026-11-09. 바꾸려면 이 함수만)
export const jamoMode = row => row[0] >= 3 && [...row[1]].reduce((n, c) => n + (jamo(c)?.length || 0), 0) <= 8;

// 결과: { mode: 'syllable'|'jamo'|'letter', tokens: [{sep}|{ch, snd, parts?, layout?}] }
// snd = { path: 'ko/...wav' | null, text: 기기 음성용 글 }. parts = 자모 조각 [{ch, role:'c'|'v'|'j', snd}]
export function units(lang, row, S) {
  const word = row[1];
  if (lang === 'en') {
    const keys = phonics(word);
    let k = 0;
    const tokens = [...word.toLowerCase()].map(c => {
      if (c < 'a' || c > 'z') return { sep: c };
      const key = keys[k++];
      return { ch: c, key, snd: key === 'silent' ? { path: null, text: '' } : { path: `en/ph-${key}.wav`, text: S.phonics[key].say } };
    });
    return { mode: 'letter', tokens };
  }
  const mode = jamoMode(row) ? 'jamo' : 'syllable';
  const tokens = [...word].map(c => {
    const j = jamo(c);
    if (!j) return { sep: c };
    const t = { ch: c, snd: { path: `ko/${slug('ko', c)}.wav`, text: c } };
    if (mode === 'jamo') {
      t.layout = BELOW.includes(j[1]) ? 'below' : 'right';
      t.parts = j.map((p, k) => ({ ch: p, role: 'cvj'[k], snd: { path: `ko/jamo-${p.codePointAt(0).toString(16)}.wav`, text: S.jamo[p] } }));
    }
    return t;
  });
  return { mode, tokens };
}
