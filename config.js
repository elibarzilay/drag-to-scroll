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
    speed: [x => x*1000, x => x/1000],
    disabledUrls: [
      x => x.split(/\n+/).map(s => s.trim()).filter(s => s),
      x => x.join("\n")],
  };
})();

const save = () => {
  forallOptions((k, inp) => {
    const x =
      isBoolOpt(k) ? inp.classList.contains("on")
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
    if (isBoolOpt(k)) inp.classList.toggle("on", x);
    else              inp.value = x;
  });
};

const onUpdate = () => {
  clearTimeout(onUpdate.timer);
  onUpdate.timer = setTimeout(save, 200);
};

const mkClickHandler = group => ({ target, shiftKey, ctrlKey }) => {
  // toggle if not part of a group, if shift/ctrl held, or if a selection is
  // not required and exactly this one is on...
  if (!group || shiftKey || ctrlKey
      || (!group.one && group.every(b =>
                          b.classList.contains("on") === (target === b))))
    target.classList.toggle("on");
  else // ...otherwise select just this one
    group.forEach(b => b.classList.toggle("on", target === b));
  onUpdate();
};

const start = () => {
  const groups = {}, reqOne = ["Button"];
  forallOptions((k, inp) => {
    switch (inp.tagName.toLowerCase()) {
    case "button":
      const g = inp.id.match(/^.*([A-Z][a-z]*)$/)?.[1];
      if (g)
        (groups[g] ??= Object.assign([], { one: reqOne.includes(g) })).push(inp);
      inp.addEventListener("click", mkClickHandler(groups[g]));
      break;
    case "input": case "textarea":
      inp.addEventListener("change", onUpdate, false);
      break;
    default:
      console.error("unexpected option tagName:", inp.tagName);
    }
  });
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
