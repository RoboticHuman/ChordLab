type Handler = (e: any) => void;
type AttrValue = string | number | boolean | null | undefined | Handler;
export type Child = Node | string | number | null | undefined | false | Child[];

function append(parent: Node, children: Child[]): void {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(parent, c);
    else parent.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

function apply(el: Element, attrs: Record<string, AttrValue>): void {
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (typeof v === 'function') el.addEventListener(k.replace(/^on/, '').toLowerCase(), v);
    else if (k === 'value' || k === 'checked') (el as any)[k] = v; // properties, set after children (for <select>)
    else el.setAttribute(k, v === true ? '' : String(v));
  }
}

/** Creates an HTML element: h('button', { class: 'x', onclick: fn }, 'Label'). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, AttrValue> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  append(el, children);
  apply(el, attrs);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function s<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, AttrValue> = {},
  ...children: Child[]
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  append(el, children);
  apply(el, attrs);
  return el;
}

/** Replaces all children of `el`. */
export function render(el: Element, ...children: Child[]): void {
  el.replaceChildren();
  append(el, children);
}
