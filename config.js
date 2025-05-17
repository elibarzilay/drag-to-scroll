"use strict";

const getElt = document.getElementById.bind(document);

const forallOptions = cb => {
  for (const k in options) {
    const inp = getElt(k);
    if (inp) cb(k, inp); // check in case of junk in settings
  }
};

const isBoolOpt = o => BOOLEAN_OPTS.includes(o);
const isTextOpt = o => TEXT_OPTS.includes(o);

const save = () => {
  forallOptions((k, inp) =>
    options[k] =
      isBoolOpt(k) ? inp.checked
      : isTextOpt(k) ? inp.value.split(/\n+/).map(s => s.trim()).filter(s => s)
      : Number(inp.value));
  chrome.storage.sync.set({options});
};

const load = () => {
  forallOptions((k, inp) => {
    if (isBoolOpt(k))      inp.checked = options[k];
    else if (isTextOpt(k)) inp.value = options[k].join("\n");
    else                   inp.value = options[k];
  });
};

let updateTimeoutId = null;

const onUpdate = ev => {
  if (updateTimeoutId != null) clearTimeout(updateTimeoutId);
  updateTimeoutId = setTimeout(save, 200);
};

const toggleBoolean = ev => {
  if (![" ", "Enter"].includes(ev.key)) return;
  ev.target.click();
  blockEvent(ev);
};

const start = () => {
  forallOptions((k, inp) => {
    inp.addEventListener("change", onUpdate, false);
    if (isBoolOpt(k)) inp.addEventListener("keyup", toggleBoolean, true); });
  const platform = (s) => navigator.platform.startsWith(s);
  getElt("metaKey").nextSibling.innerHTML =
    platform("Win") ? "&#x229E;" : platform("Mac") ? "&#x2318;" : "Meta";
  const text = ["<i>Here's a bunch of text to scroll:</i>", ""];
  let beers = 99;
  const bottles = (n, rest) =>
    `${n==0 ? "no more" : n} bottle${n==1?"":"s"} of beer${rest}`;
  while (beers > 0) {
    text.push(bottles(beers, " on the wall,"),
              bottles(beers, "!"),
              "Take one down, pass it around",
              bottles(--beers, " on the wall."),
              "");
  }
  getElt("long_footer").innerHTML = text.join("<br>");
};

const loadAndStart = ev => {
  chrome.storage.sync.get("options", val => {
    if (val && val.options) Object.assign(options, val.options);
    load();
    start(); });
};

document.addEventListener("DOMContentLoaded", loadAndStart, true);

document.addEventListener("beforeunload", e => {
  save();
  e.preventDefault();
  e.returnValue = "";
}, true);
