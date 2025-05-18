"use strict";

// ===== Options ==============================================================

const options = { // defaults
  lButton: false, mButton: false, rButton: true,
  shiftKey: false, ctrlKey: false, altKey: false, metaKey: false,
  sensitivity: 9, speed: 28000, friction: 5,
  notext: false,
  debug: false,
  disabledUrlPatterns: [],
};
const cOptions = {};
const setComputedOptions = () =>
  Object.assign(cOptions, { buttons: (options.lButton ? 1 : 0) +
                                     (options.rButton ? 2 : 0) +
                                     (options.mButton ? 4 : 0),
                            sensitivity2: Math.pow(options.sensitivity, 2) });
setComputedOptions();
const KEYS = Object.keys(options).filter(x => x.endsWith("Key"));
const BOOLEAN_OPTS =
  Object.keys(options).filter(x => typeof options[x] === "boolean");
const TEXT_OPTS =
  Object.keys(options).filter(x => Array.isArray(options[x]));

const setOptions = o => {
  Object.assign(options, o);
  setComputedOptions();
  debug("Options:", options);
  debug("Computed Options:", cOptions);
};
chrome.storage.onChanged.addListener(changes =>
  changes.options && setOptions(changes.options.newValue));

// Debugging
const debug = (str, ...args) => {
  if (!options.debug) return;
  console.debug(`D2S: ${str}`, ...(args.map(x =>
    (typeof x === "function" && x.length == 0) ? x() : x)));
};

// ===== Events ===============================================================

const undoDragToScroll = [() => debug("removing event handlers")];
const runUndoThunks = () => undoDragToScroll.forEach(thunk => thunk());
const addEventListener = (type, handler, useCapture = true) => {
  undoDragToScroll.push(() =>
    document.removeEventListener(type, handler, useCapture));
  document.addEventListener(type, handler, useCapture);
};

// When using "reload" for the extension, the existing instances stick around
// and new ones get generated, which can end up with a pile of handlers etc.
// Not a big problem (can't reload a non-unpacked extension), but there are
// probably other cases that can lead to that.  So use a random number and a
// custom event to get other instances to remove their handlers.  (The actual
// extensions do stick around, visible in devtools.)
{ let myId = Math.random();
  addEventListener("D2SLoadId", e => (e.detail != myId) && runUndoThunks());
  document.dispatchEvent(new CustomEvent("D2SLoadId", {detail: myId})); }

// ===== Utilities ============================================================

const rxQuote = s => s.replace(/[.*+?^${}()|\[\]\\]/g, "\\$&");

const patternToRegexp = pattern =>
  RegExp("^" + rxQuote(pattern).replace(/\\\*/g, ".*"));

// Check if current URL matches any disabled patterns
const isDisabled = () =>
  options.disabledUrlPatterns.some(pattern =>
    patternToRegexp(pattern).test(window.location.href));

// Vector math
const vadd  = (a,b) => [a[0]+b[0], a[1]+b[1]];
const vsub  = (a,b) => [a[0]-b[0], a[1]-b[1]];
const vmul  = (v,s) => [s*v[0], s*v[1]];
const vdiv  = (v,s) => [v[0]/s, v[1]/s];
const vmag2 = (v)   => v[0]*v[0] + v[1]*v[1];
const vmag  = (v)   => Math.hypot(v[0], v[1]);

const evPos = (ev) => [ev.clientX, ev.clientY];

// Completely block an event from going further
const blockEvent = ev => {
  ev.preventDefault();
  ev.stopImmediatePropagation();
};

// Test if the given point is directly over text
const testElt = document.createElement("SPAN");
const isOverText = ev => {
  const parent = ev.target;
  if (parent == null) return false;
  for (let i = 0; i < parent.childNodes.length; i++) {
    const child = parent.childNodes[i];
    if (child.nodeType !== Node.TEXT_NODE) continue;
    if (child.textContent.search(/\S/) == -1) continue;
    try {
      testElt.appendChild(parent.replaceChild(testElt, child));
      if (testElt.isSameNode(
            document.elementFromPoint(ev.clientX, ev.clientY)))
        return true;
    } finally {
      if (child.isSameNode(testElt.firstChild))
        testElt.removeChild(child);
      if (testElt.isSameNode(parent.childNodes[i]))
        parent.replaceChild(child, testElt);
    }
  }
  return false;
};

// Test if a mouse event occurred over a scrollbar by testing if the
// coordinates of the event are on the outside of a scrollable element.
// The body element is treated separately since the visible size is
// fetched differently depending on the doctype.
const isOverScrollbar = ev => {
  let t = ev.target, d = document.documentElement;
  if (t == d) t = document.scrollingElement;
  if (t != document.scrollingElement)
    return isScrollable(t) &&
           (ev.offsetX - t.scrollLeft >= t.clientWidth ||
            ev.offsetY - t.scrollTop >= t.clientHeight);
  const c =
    (d.scrollHeight == d.clientHeight && d.scrollHeight == d.offsetHeight)
    // true => guessing it's a no doctype document
      ? t : d;
  return ev.offsetX - t.scrollLeft >= c.clientWidth
      || ev.offsetY - t.scrollTop  >= c.clientHeight;
};

// Can the given element be scrolled on either axis?
// That is, is the scroll size greater than the client size
// and the CSS overflow set to scroll or auto?
const isScrollable = elt => {
  const dv = document.defaultView;
  const o = css => ["auto", "scroll", "overlay"]
    .includes(dv.getComputedStyle(elt)[css]);
  return (elt.scrollWidth  > elt.clientWidth  && o("overflow-x"))
      || (elt.scrollHeight > elt.clientHeight && o("overflow-y"));
};

// Return the first ancestor (or the element itself) that is scrollable
const findScrollables = elt => {
  const elts = [], seen = new Set();
  while (true) {
    if (elt == document.documentElement) elt = document.scrollingElement;
    if (elt == null || seen.has(elt)) break; else seen.add(elt);
    if (elt == document.scrollingElement) { elts.push(elt); break; }
    if (isScrollable(elt)) elts.push(elt);
    elt = elt.parentNode;
  }
  return elts;
};

const TIME_STEP = 10, STOP = 0, CLICK = 1, DRAG = 2, GLIDE = 3;

// ===== CoverDiv =============================================================
// Use this to change the cursor mostly, possibly also avoid events
// being grabbed unpredictably.

const CoverDiv = (()=>{
  let elt = null;
  const createCoverDiv = () => {
    elt = document.createElement("div");
    Object.assign(elt.style, {
      background: "transparent none",
      cursor: "url('"+chrome.runtime.getURL("cursor.png")+"') 16 16, auto",
      position: "fixed", display: "block", zIndex: 99999999,
      top: 0, left: 0, bottom: 0, right: 0,
      // backgroundColor: "rgba(255,128,255,0.5)",
    });
  };
  const show = () => {
    if (elt === null) createCoverDiv();
    document.body.appendChild(elt);
  };
  const hide = () => {
    if (elt !== null && elt.parentNode !== null)
      elt.parentNode.removeChild(elt);
  };
  return ({ show, hide });
})();

// ===== Motion ===============================================================

const Motion = (()=>{
  const FILTER_INTERVAL = 100;
  let position   = null;
  let velocity   = [0, 0];
  let updateTime = null;
  let impulses   = { new: null, old: null };
  // set velocity and position, ensure it is within min and max values,
  // return true if there is motion
  const clamp = () => {
    const speed2 = vmag2(velocity);
    if (speed2 < 1) { velocity = [0, 0]; return false; }
    if (speed2 > options.speed*options.speed)
      velocity = vmul(velocity, options.speed/vmag(velocity));
    return true;
  };
  const start = () => {
    if (impulses.new == impulses.old) { velocity = [0, 0]; return false; }
    position   = impulses.new.pos;
    updateTime = impulses.new.time;
    velocity = vdiv(vsub(impulses.new.pos,impulses.old.pos),
                    (impulses.new.time-impulses.old.time)/1000);
    return clamp();
  };
  // zero velocity
  const stop = () => {
    impulses = { new: null, old: null };
    velocity = [0, 0];
  };
  // impulsively move to given position and time
  const impulse = (pos, time) => {
    while (impulses.old != null && (time-impulses.old.time) > FILTER_INTERVAL)
      impulses.old = impulses.old.next;
    if (impulses.old == null)
      impulses.old = impulses.new = {pos, time, next: null};
    else
      impulses.new = (impulses.new.next = {pos, time, next: null});
  };
  // update free motion to given time, return true there is motion
  const glide = time => {
    impulses = { old: null, new: null };
    if (updateTime == null) { updateTime = time; return false; }
    const dsecs = (time - updateTime) / 1000;
    const frictionMul =
      Math.pow(Math.max(1 - (options.friction / FILTER_INTERVAL), 0),
               dsecs*FILTER_INTERVAL);
    velocity = vmul(velocity, frictionMul);
    const moving = clamp();
    position = vadd(position, vmul(velocity, dsecs));
    updateTime = time;
    return moving;
  };
  //
  const getPosition = () => position;
  //
  return { start, stop, impulse, glide, getPosition };
})();

const Scroll = (()=>{
  let elts = null, origins;
  // Start dragging
  const start = ev => {
    elts = findScrollables(ev.target);
    origins = elts.map(elt => [elt.scrollLeft, elt.scrollTop]);
  };
  // Move the currently dragged elements relative to the starting position.
  // Return the leftover movement vector (i.e., [0,0] if we scrolled, >=1 if
  // everything is scrolled with leftovers so we're at the edge).
  const move = pos => {
    if (!elts) return false;
    let [dx, dy] = pos;
    for (let i = 0; i < elts.length; i++) {
      const elt = elts[i], orig = origins[i];
      elt.scrollTo({ top: orig[1] - dy, left: orig[0] - dx,
                     behavior: "instant" });
      dx -= orig[0] - elt.scrollLeft;
      dy -= orig[1] - elt.scrollTop;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return [0, 0];
    }
    return [Math.trunc(dx), Math.trunc(dy)];
  };
  //
  return { start, move };
})();

let activity = STOP, blockContextMenu = false, mouseOrigin = null;

const Glide = (()=>{
  let href = null;
  //
  const update = () => {
    if (activity != GLIDE) return;
    if (window.location.href !== href) return stop();
    debug("glide update");
    if (Motion.glide(performance.now()) &&
        Scroll.move(vsub(Motion.getPosition(), mouseOrigin)))
      setTimeout(update, TIME_STEP);
    else stop();
  };
  //
  const start = () => {
    if (Motion.start()) {
      href = window.location.href;
      setTimeout(update, TIME_STEP);
      activity = GLIDE;
    } else {
      activity = STOP;
    }
  };
  //
  const stop = () => {
    debug("glide stop");
    activity = STOP;
    Motion.stop();
  };
  //
  return { update, start, stop };
})();

const Drag = (()=>{
  //
  const update = ev => {
    debug("drag update");
    const pos = evPos(ev);
    mouseOrigin = vadd(mouseOrigin, Scroll.move(vsub(pos, mouseOrigin)));
    Motion.impulse(pos, ev.timeStamp);
  };
  //
  const start = ev => {
    debug("drag start");
    activity = DRAG;
    Scroll.start(ev);
    update(ev);
  };
  //
  const stop = ev => {
    debug("drag stop");
    CoverDiv.hide();
    update(ev);
    Glide.start();
  };
  //
  return { update, start, stop };
})();

// ===== Event handlers =======================================================

const onMouseDown = ev => {
  blockContextMenu = false;
  switch (activity) {
  //
  case GLIDE:
    Glide.stop();
  // fall through
  //
  case STOP:
    if (!ev.target) {
      debug("target is null, ignoring");
      break;
    } else if (ev.buttons != cOptions.buttons) {
      debug("wrong buttons, ignoring; ev.buttons=%s; cOptions.buttons=%s",
            ev.buttons, cOptions.buttons);
      break;
    } else if (!KEYS.every(key => options[key] == ev[key])) {
      debug("wrong modkeys, ignoring");
      break;
    } else if (isOverScrollbar(ev)) {
      debug("detected scrollbar click, ignoring", ev);
      break;
    } else if (options.notext && isOverText(ev)) {
      debug("detected text node, ignoring");
      break;
    }
    debug("click MouseEvent=", ev);
    activity = CLICK;
    mouseOrigin = evPos(ev);
    Motion.impulse(mouseOrigin, ev.timeStamp);
    blockEvent(ev);
    if (ev.button == 2) blockContextMenu = true;
    break;
  //
  case DRAG:
    Motion.stop();
    Drag.stop(ev);
    break;
  //
  default:
    console.log("WARNING: illegal activity for mousedown:", activity);
    CoverDiv.hide();
    activity = STOP;
    return onMouseDown(ev);
  }
};

const onMouseMove = ev => {
  switch (activity) {
  //
  case STOP: case GLIDE: break;
  //
  case DRAG:
    if (ev.buttons != cOptions.buttons) break;
    Drag.update(ev);
    blockEvent(ev);
    break;
  //
  case CLICK:
    if (ev.buttons != cOptions.buttons) break;
    if (vmag2(vsub(mouseOrigin, evPos(ev))) > cOptions.sensitivity2) {
      if (options.button == 2) blockContextMenu = true;
      CoverDiv.show();
      Drag.start(ev);
    }
    blockEvent(ev);
    break;
  //
  }
};

const onMouseUp = ev => {
  switch (activity) {
  //
  case STOP: break;
  //
  case CLICK:
    debug("unclick, no drag: %o", ev.buttons);
    CoverDiv.hide();
    if (ev.button == 0) getSelection().removeAllRanges();
    if (ev.button == 2) blockContextMenu = false;
    if (document.activeElement) document.activeElement.blur();
    if (ev.target) ev.target.focus();
    activity = STOP;
    break;
  //
  case DRAG:
    if (ev.buttons != cOptions.buttons) { Drag.stop(ev); blockEvent(ev); }
    break;
  //
  }
};

const onMouseOut = ev => {
  if (activity === DRAG && ev.relatedTarget == null) Drag.stop(ev);
};

const onContextMenu = ev => {
  if (!blockContextMenu) return;
  blockContextMenu = false;
  debug("blocking context menu");
  blockEvent(ev);
};

// ===== Start, unless disabled ===============================================

chrome.storage.sync.get("options", val => {
  // need to ensure we have the current options
  if (!val?.options) return;
  setOptions(val.options);
  if (isDisabled()) return debug("disabled for this URL");
  addEventListener("mousedown", onMouseDown);
  addEventListener("mousemove", onMouseMove);
  addEventListener("mouseup", onMouseUp);
  addEventListener("mouseout", onMouseOut);
  addEventListener("contextmenu", onContextMenu);
});
