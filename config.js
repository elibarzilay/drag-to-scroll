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

const optionXform = (()=>{
  // each one is [saveFn, loadFn]
  return {
    sensitivity: [
      x => +getElt("sensitivity").max - x,
      x => +getElt("sensitivity").max - x],
    speed: [x => x*1000, x => x/1000],
    disabledUrlPatterns: [
      x => x.split(/\n+/).map(s => s.trim()).filter(s => s),
      x => x.join("\n")],
  };
})();

const save = () => {
  forallOptions((k, inp) => {
    const x =
      isBoolOpt(k) ? inp.checked
      : isTextOpt(k) ? inp.value
      : Number(inp.value);
    options[k] = k in optionXform ? optionXform[k][0](x) : x;
  });
  debug("Saving:", options);
  chrome.storage.sync.set({options});
};

const load = () => {
  forallOptions((k, inp) => {
    const x = k in optionXform ? optionXform[k][1](options[k]) : options[k];
    if (isBoolOpt(k)) inp.checked = x;
    else              inp.value = x;
  });
};

const onUpdate = ev => {
  clearTimeout(onUpdate.timer);
  onUpdate.timer = setTimeout(save, 200);
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
  const platform = s => navigator.userAgent.toLowerCase().includes(s);
  getElt("metaKey").nextSibling.innerHTML =
    platform("windows") ? "&#x229E;"
    : platform("macintosh") ? "&#x2318;"
    : "Super";
  getElt("long-footer").innerHTML = beers().join("<br><br>");
  getElt("nested-footer").innerHTML = graycode(3).join("<br>");
};

const beers = () => {
  let text = [], beers = 99;
  const bottles = (n, rest) =>
    `${n==0 ? "No more" : n} bottle${n==1?"":"s"} of beer${rest}`;
  const bottle = beers => [
    bottles(beers, " on the wall,"),
    bottles(beers, "!"),
    "Take one down, pass it around",
    bottles(beers-1, " on the wall."),
  ];
  while (beers > 0) text.push(bottle(beers--).join("<br>"));
  text[10] = "<details><summary>...</summary>" + text.splice(10, 80, []).join("<br><br>") + "</details>";
  return text;
};

const graycode = bits => {
  const gray = n => n ^ (n >> 1);
  const str = n =>
    n.toString(2).padStart(bits, "0").replace(/./g, b =>
      `<div class='bit${b}'></div>`);
  return Array.from({length: 1 << bits}, (_, i) => str(gray(i)));
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
}, true);
