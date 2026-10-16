(function (global) {
  'use strict';

  const BASE = '../dict/jieba/';
  const MIN_FLOAT = -3.14e100;
  const PROB_START = { B: -0.26268660809250016, E: -3.14e100, M: -3.14e100, S: -1.4652633398537678 };
  const PREV_STATUS = { B: ['E', 'S'], M: ['M', 'B'], S: ['S', 'E'], E: ['B', 'M'] };
  const STATES = ['B', 'M', 'E', 'S'];
  const RE_HAN = /([㐀-䶿一-鿕豈-﫿a-zA-Z0-9+#&._%-]+)/;
  const RE_HAN_START = /^[㐀-䶿一-鿕豈-﫿a-zA-Z0-9+#&._%-]/;
  const RE_SKIP = /(\r\n|\s)/;
  const RE_SKIP_FULL = /^(\r\n|\s)$/;
  const RE_HMM_HAN = /([一-鿕]+)/;
  const RE_HMM_HAN_START = /^[一-鿕]/;
  const RE_HMM_SKIP = /([a-zA-Z0-9]+(?:\.\d+)?%?)/;
  let loading = null;

  const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

  function create({ dictText, probEmit, probTrans }) {
    const freq = new Map();
    let total = 0;
    String(dictText || '').replace(/^﻿/, '').split(/\r?\n/).forEach((line) => {
      const parts = line.trim().split(' ');
      if (parts.length < 2) return;
      const word = parts[0];
      const count = Number(parts[1]);
      if (!word || !Number.isFinite(count)) return;
      freq.set(word, count);
      total += count;
      const chars = Array.from(word);
      let fragment = '';
      for (let i = 0; i < chars.length - 1; i++) {
        fragment += chars[i];
        if (!freq.has(fragment)) freq.set(fragment, 0);
      }
    });
    const logTotal = Math.log(total || 1);
    const emit = probEmit || {};
    const trans = probTrans || {};

    function dag(chars) {
      const graph = [];
      for (let k = 0; k < chars.length; k++) {
        const ends = [];
        let i = k;
        let fragment = chars[k];
        while (i < chars.length && freq.has(fragment)) {
          if (freq.get(fragment) > 0) ends.push(i);
          i++;
          fragment += chars[i] === undefined ? '' : chars[i];
          if (i >= chars.length) break;
        }
        graph.push(ends.length > 0 ? ends : [k]);
      }
      return graph;
    }

    function route(chars, graph) {
      const n = chars.length;
      const best = new Array(n + 1);
      best[n] = [0, 0];
      for (let idx = n - 1; idx >= 0; idx--) {
        let bestProb = -Infinity;
        let bestEnd = idx;
        let word = '';
        let wordEnd = idx - 1;
        for (const x of graph[idx]) {
          while (wordEnd < x) word += chars[++wordEnd];
          const f = freq.get(word);
          const prob = Math.log(f || 1) - logTotal + best[x + 1][0];
          if (prob > bestProb || (prob === bestProb && x > bestEnd)) {
            bestProb = prob;
            bestEnd = x;
          }
        }
        best[idx] = [bestProb, bestEnd];
      }
      return best;
    }

    function emitProb(state, ch) {
      const table = emit[state];
      return table && has(table, ch) ? table[ch] : MIN_FLOAT;
    }

    function transProb(from, to) {
      const table = trans[from];
      return table && has(table, to) ? table[to] : -Infinity;
    }

    function viterbi(chars) {
      let probs = {};
      let paths = {};
      for (const y of STATES) {
        probs[y] = PROB_START[y] + emitProb(y, chars[0]);
        paths[y] = [y];
      }
      for (let t = 1; t < chars.length; t++) {
        const nextProbs = {};
        const nextPaths = {};
        for (const y of STATES) {
          const em = emitProb(y, chars[t]);
          let bestProb = -Infinity;
          let bestState = null;
          for (const y0 of PREV_STATUS[y]) {
            const prob = probs[y0] + transProb(y0, y) + em;
            if (bestState === null || prob > bestProb || (prob === bestProb && y0 > bestState)) {
              bestProb = prob;
              bestState = y0;
            }
          }
          nextProbs[y] = bestProb;
          nextPaths[y] = paths[bestState].concat(y);
        }
        probs = nextProbs;
        paths = nextPaths;
      }
      let last = 'E';
      if (probs.S > probs.E || (probs.S === probs.E && 'S' > 'E')) last = 'S';
      return paths[last];
    }

    function hmmCutHan(text) {
      const chars = Array.from(text);
      const states = viterbi(chars);
      const out = [];
      let begin = 0;
      let next = 0;
      chars.forEach((ch, i) => {
        const state = states[i];
        if (state === 'B') begin = i;
        else if (state === 'E') {
          out.push(chars.slice(begin, i + 1).join(''));
          next = i + 1;
        } else if (state === 'S') {
          out.push(ch);
          next = i + 1;
        }
      });
      if (next < chars.length) out.push(chars.slice(next).join(''));
      return out;
    }

    function hmmCut(text) {
      const out = [];
      text.split(RE_HMM_HAN).forEach((block) => {
        if (!block) return;
        if (RE_HMM_HAN_START.test(block)) hmmCutHan(block).forEach((word) => out.push(word));
        else block.split(RE_HMM_SKIP).forEach((piece) => { if (piece) out.push(piece); });
      });
      return out;
    }

    function cutBlock(block) {
      const chars = Array.from(block);
      const graph = dag(chars);
      const best = route(chars, graph);
      const out = [];
      let buffer = '';
      const flush = () => {
        if (!buffer) return;
        if (Array.from(buffer).length === 1) out.push(buffer);
        else if (!freq.get(buffer)) hmmCut(buffer).forEach((word) => out.push(word));
        else Array.from(buffer).forEach((ch) => out.push(ch));
        buffer = '';
      };
      let x = 0;
      while (x < chars.length) {
        const y = best[x][1] + 1;
        const word = chars.slice(x, y).join('');
        if (y - x === 1) {
          buffer += word;
        } else {
          flush();
          out.push(word);
        }
        x = y;
      }
      flush();
      return out;
    }

    function cut(text) {
      const source = String(text || '');
      const tokens = [];
      let offset = 0;
      const push = (word) => {
        tokens.push({ word, start: offset });
        offset += word.length;
      };
      source.split(RE_HAN).forEach((block) => {
        if (!block) return;
        if (RE_HAN_START.test(block)) {
          cutBlock(block).forEach(push);
          return;
        }
        block.split(RE_SKIP).forEach((piece) => {
          if (!piece) return;
          if (RE_SKIP_FULL.test(piece)) push(piece);
          else Array.from(piece).forEach(push);
        });
      });
      return tokens;
    }

    return {
      cut,
      hasWord: (word) => (freq.get(word) || 0) > 0
    };
  }

  function load(base) {
    if (!loading) {
      const root = base || BASE;
      const fetchText = (file) => fetch(root + file).then((resp) => {
        if (!resp.ok) throw new Error(`Could not load ${file} (HTTP ${resp.status})`);
        return resp.text();
      });
      loading = Promise.all([fetchText('dict.txt'), fetchText('prob_emit.json'), fetchText('prob_trans.json')])
        .then(([dictText, emitText, transText]) => create({ dictText, probEmit: JSON.parse(emitText), probTrans: JSON.parse(transText) }))
        .catch((err) => {
          loading = null;
          throw err;
        });
    }
    return loading;
  }

  const Jieba = { create, load };

  if (typeof window !== 'undefined') window.Jieba = Jieba;
  if (typeof self !== 'undefined') self.Jieba = Jieba;
  if (typeof global !== 'undefined') global.Jieba = Jieba;
  if (typeof globalThis !== 'undefined') globalThis.Jieba = Jieba;
  if (typeof module !== 'undefined' && module.exports) module.exports = Jieba;
})(typeof globalThis !== 'undefined' ? globalThis : this);
