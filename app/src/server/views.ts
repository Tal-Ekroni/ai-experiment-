/** Screen renderers. All data already computed; this file only lays it out. */
import { h, raw, escape, render, type Html } from './html.ts';
import { fmt } from '../lib/money.ts';
import { CATEGORIES } from '../lib/db.ts';
import { catMeta } from '../lib/catmeta.ts';
import { coicopGroups } from '../lib/coicop.ts';

/** A tinted round icon chip for a category. */
export function catIcon(cat: string): Html {
  const m = catMeta(cat);
  return h`<span class="ic" style="--h:${String(m.h)}">${m.icon}</span>`;
}

export function heroBlock(delta: number, label: string, caveat: string): Html {
  const over = delta > 0;
  return h`<div class="hero ${over ? 'over' : 'under'}">
    <div class="cap">${over ? 'מעל הרגיל' : 'מתחת לרגיל'}</div>
    <div class="amount"><span class="glyph">${over ? '▲' : '▼'}</span>${escape(fmt(Math.abs(delta)))}</div>
    <div class="label">${label}</div>
    <div class="note">${caveat}</div>
  </div>`;
}

export function monthBars(months: { m: string; expense: number }[], partialMonth?: string): Html {
  const max = Math.max(...months.map(r => r.expense), 1);
  return h`<div class="bars">${raw(months.map((r, i) => {
    const partial = r.m === partialMonth;
    return `<div class="b${partial ? ' partial' : ''}" style="height:${Math.max(3, Math.round((r.expense / max) * 100))}%;--bi:${i}" data-v="${escape(fmt(r.expense))}${partial ? ' · חלקי' : ''}"></div>`;
  }).join(''))}</div>
  <div class="bar-labels">${raw(months.map(r =>
    `<span${r.m === partialMonth ? ' class="muted"' : ''}>${escape(r.m.slice(5))}</span>`).join(''))}</div>`;
}

export function catRows(mix: { category: string; total: number }[], max?: number): Html {
  const top = max ?? Math.max(...mix.map(c => c.total), 1);
  return raw(mix.map((c, i) => (h`<div class="cat" style="--h:${String(catMeta(c.category).h)};--i:${String(i)}">
    ${catIcon(c.category)}
    <span class="name">${c.category}</span>
    <span class="track"><span class="fill tint" style="inline-size:${Math.round((c.total / top) * 100)}%"></span></span>
    <span class="val">${fmt(c.total)}</span>
  </div>`)).join(''));
}

export function statusChips(chips: { cls: string; label: string }[]): Html {
  return h`<div class="status">${raw(chips.map(c =>
    `<span class="chip"><span class="dot ${c.cls}"></span>${escape(c.label)}</span>`).join(''))}</div>`;
}

export function categoryChips(name: string, current?: string): Html {
  return h`<div class="chips">${raw(CATEGORIES.map(c =>
    `<button name="${name}" value="${escape(c)}" ${c === current ? 'data-on' : ''}>${escape(c)}</button>`).join(''))}</div>`;
}


/** COICOP-grouped breakdown: division header + subtotal, nested leaves with their codes. */
export function coicopRows(mix: { category: string; total: number }[]): Html {
  const groups = coicopGroups(mix);
  const grand = groups.reduce((s, g) => s + g.total, 0) || 1;
  return raw(groups.map(g => render(h`<div class="cg">
    <div class="cg-head">
      <span class="cg-code">${g.division.code}</span>
      <span class="cg-name">${g.division.label}</span>
      <span class="cg-track"><span class="cg-fill" style="inline-size:${Math.round(g.total/grand*100)}%;--h:${String(g.division.h)}"></span></span>
      <span class="cg-total">${fmt(g.total)}</span>
    </div>
    ${g.leaves.map(l => h`<div class="cg-leaf">${catIcon(l.category)}<span class="cg-lname">${l.category}</span>
      <span class="cg-lcode">${l.code}</span><span class="cg-lval">${fmt(l.total)}</span></div>`)}
  </div>`)).join(''));
}
