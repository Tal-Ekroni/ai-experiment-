/** Screen renderers. All data already computed; this file only lays it out. */
import { h, raw, escape, type Html } from './html.ts';
import { fmt } from '../lib/money.ts';
import { CATEGORIES } from '../lib/db.ts';

export function heroBlock(delta: number, label: string, caveat: string): Html {
  const over = delta > 0;
  return h`<div class="hero ${over ? 'over' : 'under'}">
    <div class="amount"><span class="glyph">${over ? '▲' : '▼'}</span>${raw(escape(fmt(Math.abs(delta))))}</div>
    <div class="label">${label}</div>
    <div class="sub">${caveat}</div>
  </div>`;
}

export function monthBars(months: { m: string; expense: number }[], partialMonth?: string): Html {
  const max = Math.max(...months.map(r => r.expense), 1);
  return h`<div class="bars">${raw(months.map(r => {
    const partial = r.m === partialMonth;
    return `<div class="b${partial ? ' partial' : ''}" style="height:${Math.max(3, Math.round((r.expense / max) * 100))}%" data-v="${escape(fmt(r.expense))}${partial ? ' · חלקי' : ''}"></div>`;
  }).join(''))}</div>
  <div class="bar-labels">${raw(months.map(r =>
    `<span${r.m === partialMonth ? ' class="muted"' : ''}>${escape(r.m.slice(5))}</span>`).join(''))}</div>`;
}

export function catRows(mix: { category: string; total: number }[], max?: number): Html {
  const top = max ?? Math.max(...mix.map(c => c.total), 1);
  return raw(mix.map(c => (h`<div class="cat">
    <span class="name">${c.category}</span>
    <span class="track"><span class="fill" style="inline-size:${Math.round((c.total / top) * 100)}%"></span></span>
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
