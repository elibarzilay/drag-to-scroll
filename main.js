"use strict";

// ===== Options =====

let options = ({ // defaults
  button: 2, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false,
  speed: 20000, friction: 5,
  notext: false,
  debug: false
});
const KEYS = Object.keys(options).filter(x => x.endsWith("Key"));
const BOOLEAN_OPTS =
  Object.keys(options).filter(x => (typeof options[x]) === "boolean")

function setOptions(o) {
  if (o) { Object.assign(options, o); debug("Options: %o", options); }
}
chrome.storage.onChanged.addListener((changes, _) =>
  setOptions(changes.options && changes.options.newValue));
chrome.storage.sync.get("options", val => setOptions(val && val.options));

// ===== Utilities =====

// Debugging
function debug(str, ...args) {
  if (!options.debug) return;
  console.debug(`D2S: ${str}`, ...args);
}

// Vector math
let vadd  = (a,b) => [a[0]+b[0], a[1]+b[1]];
let vsub  = (a,b) => [a[0]-b[0], a[1]-b[1]];
let vmul  = (v,s) => [s*v[0], s*v[1]];
let vdiv  = (v,s) => [v[0]/s, v[1]/s];
let vmag2 = (v)   => v[0]*v[0] + v[1]*v[1];
let vmag  = (v)   => Math.hypot(v[0], v[1]);

let evPos = (ev) => [ev.clientX, ev.clientY];

// Completely block an event from going further
function blockEvent(ev) {
  ev.preventDefault();
  ev.stopImmediatePropagation();
}

// Test if the given point is directly over text
let testElt = document.createElement("SPAN");
function isOverText(ev) {
  let parent = ev.target;
  if (parent == null) return false;
  for (let i = 0; i < parent.childNodes.length; i++) {
    let child = parent.childNodes[i];
    if (child.nodeType !== Node.TEXT_NODE) continue;
    if (child.textContent.search(/\S/) == -1) continue;
    // debug("TEXT_NODE: \"%s\"", child.textContent);
    try {
      testElt.appendChild(parent.replaceChild(testElt, child));
      if (testElt.isSameNode(document.elementFromPoint(ev.clientX, ev.clientY)))
        return true;
    } finally {
      if (child.isSameNode(testElt.firstChild)) testElt.removeChild(child);
      if (testElt.isSameNode(parent.childNodes[i])) parent.replaceChild(child, testElt);
    }
  }
  return false;
}

// Test if a mouse event occurred over a scrollbar by testing if the
// coordinates of the event are on the outside of a scrollable element.
// The body element is treated separately since the visible size is
// fetched differently depending on the doctype.
function isOverScrollbar(ev) {
  let t = ev.target == document.documentElement ? document.body : ev.target;
  if (t == document.body) {
    let d = document.documentElement, cW, cH;
    if (d.scrollHeight == d.clientHeight && d.scrollHeight == d.offsetHeight) {
      // Guessing it's a no doctype document
      cW = t.clientWidth; cH = t.clientHeight;
    } else {
      cW = d.clientWidth; cH = d.clientHeight;
    }
    return (ev.offsetX - t.scrollLeft >= cW || ev.offsetY - t.scrollTop >= cH);
  } else return isScrollable(t) &&
                (ev.offsetX - t.scrollLeft >= t.clientWidth ||
                 ev.offsetY - t.scrollTop >= t.clientHeight);
}

// Can the given element be scrolled on either axis?
// That is, is the scroll size greater than the client size
// and the CSS overflow set to scroll or auto?
function isScrollable(elt) {
  let dv = document.defaultView;
  let o = css => ["auto", "scroll"].indexOf(dv.getComputedStyle(elt)[css]) >= 0;
  return (elt.scrollWidth  > elt.clientWidth  && o("overflow-x"))
      || (elt.scrollHeight > elt.clientHeight && o("overflow-y"));
}

// Return the first ancestor (or the element itself) that is scrollable
function findScrollables(elt) {
  let elts = [];
  while (true) {
    if (elt == document.documentElement) elt = document.body;
    if (elt == null) break;
    if (elt == document.body) { elts.push(elt); break; }
    if (isScrollable(elt)) elts.push(elt);
    elt = elt.parentNode;
  }
  return elts;
}

const TIME_STEP = 10, STOP = 0, CLICK = 1, DRAG = 2, GLIDE = 3;

// ===== CoverDiv =====
// Use this to change the cursor mostly, possibly also avoid events
// being grabbed unpredictably.

let CoverDiv = (() => {
  let elt = null;
  function createCoverDiv() {
    elt = document.createElement("div");
    Object.assign(elt.style, {
      background: "transparent none",
      cursor: "url('"+chrome.extension.getURL("cursor.png")+"') 16 16, auto",
      position: "fixed", display: "block", zIndex: 99999999,
      top: 0, left: 0, bottom: 0, right: 0,
      // backgroundColor: "rgba(255,128,255,0.5)",
    });
  }
  function show() {
    if (elt === null) createCoverDiv();
    document.body.appendChild(elt);
  }
  function hide() {
    if (elt !== null && elt.parentNode !== null)
      elt.parentNode.removeChild(elt);
  }
  return ({ show, hide })
})();

// ===== Motion =====

let Motion = (() => {
  const FILTER_INTERVAL = 100;
  let position = null;
  let velocity = [0, 0];
  let updateTime = null;
  let impulses = {new: null, old: null};
  // set velocity and position, ensure it is within min and max values,
  // return true if there is motion
  function clamp() {
    let speed2 = vmag2(velocity);
    if (speed2 < 1) { velocity = [0, 0]; return false; }
    if (speed2 > options.speed*options.speed)
      velocity = vmul(velocity, options.speed/vmag(velocity));
    return true;
  }
  function start() {
    if (impulses.new == impulses.old) { velocity = [0, 0]; return false; }
    position = impulses.new.pos;
    updateTime = impulses.new.time;
    velocity = vdiv(vsub(impulses.new.pos,impulses.old.pos),
                    (impulses.new.time-impulses.old.time)/1000);
    return clamp();
  }
  // zero velocity
  function stop() {
    impulses = {new: null, old: null};
    velocity = [0, 0];
  }
  // impulsively move to given position and time
  function impulse(pos, time) {
    while (impulses.old != null && (time-impulses.old.time) > FILTER_INTERVAL)
      impulses.old = impulses.old.next;
    if (impulses.old == null)
      impulses.old = impulses.new = {pos, time, next: null};
    else
      impulses.new = (impulses.new.next = {pos, time, next: null});
  }
  // update free motion to given time, return true there is motion
  function glide(time) {
    impulses = {old: null, new: null};
    if (updateTime == null) { updateTime = time; return false; }
    let dsecs = (time-updateTime)/1000;
    let frictionMul = Math.max(1-(options.friction/FILTER_INTERVAL), 0);
    frictionMul = Math.pow(frictionMul, dsecs*FILTER_INTERVAL);
    velocity = vmul(velocity, frictionMul);
    let moving = clamp();
    position = vadd(position, vmul(velocity, dsecs));
    updateTime = time;
    return moving;
  }
  //
  let getPosition = () => position;
  //
  return ({ start, stop, impulse, glide, getPosition });
})();

let Scroll = (() => {
  let elts = null, origins;
  // Start dragging
  function start(ev) {
    elts = findScrollables(ev.target);
    origins = elts.map(elt => [elt.scrollLeft, elt.scrollTop]);
  }
  // Move the currently dragged elements relative to the starting position.
  // Return true the leftover movement vector (i.e., [0,0] if we scrolled,
  // >=1 if everything is scrolled with leftovers so we're at the edge).
  function move(pos) {
    if (!elts) return false;
    let [dx,dy] = pos;
    for (let i = 0; i < elts.length; i++) {
      let elt = elts[i], orig = origins[i];
      elt.scrollLeft = orig[0] - dx;
      elt.scrollTop  = orig[1] - dy;
      dx -= orig[0]-elt.scrollLeft;
      dy -= orig[1]-elt.scrollTop;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return [0, 0];
    }
    return [Math.trunc(dx), Math.trunc(dy)];
  }
  //
  return ({ start, move });
})();

let activity = STOP;
let blockContextMenu = false;
let mouseOrigin = null;

function updateGlide() {
  if (activity != GLIDE) return;
  debug("glide update");
  if (Motion.glide(performance.now()) &&
      Scroll.move(vsub(Motion.getPosition(),mouseOrigin)))
    setTimeout(updateGlide, TIME_STEP);
  else stopGlide();
}

function stopGlide() {
  debug("glide stop");
  activity = STOP;
  Motion.stop();
}

function updateDrag(ev) {
  debug("drag update");
  let pos = evPos(ev);
  mouseOrigin = vadd(mouseOrigin, Scroll.move(vsub(pos,mouseOrigin)));
  Motion.impulse(pos, ev.timeStamp);
}

function startDrag(ev) {
  debug("drag start");
  activity = DRAG;
  Scroll.start(ev);
  updateDrag(ev);
}

function stopDrag(ev) {
  debug("drag stop");
  CoverDiv.hide();
  updateDrag(ev);
  if (Motion.start()) {
    window.setTimeout(updateGlide, TIME_STEP);
    activity = GLIDE;
  } else {
    activity = STOP;
  }
}

// ===== Event handlers =====

function onMouseDown(ev) {
  blockContextMenu = false;
  switch (activity) {
  //
  case GLIDE:
    stopGlide(ev);
  // fall through
  //
  case STOP:
    if (!ev.target) {
      debug("target is null, ignoring");
      break; }
    if (ev.button != options.button) {
      debug("wrong button, ignoring; ev.button=%s; options.button=%s",
            ev.button, options.button);
      break; }
    if (!KEYS.every(key => options[key] == ev[key])) {
      debug("wrong modkeys, ignoring");
      break; }
    if (isOverScrollbar(ev)) {
      debug("detected scrollbar click, ignoring", ev);
      break; }
    if (options.notext && isOverText(ev)) {
      debug("detected text node, ignoring");
      break; }
    debug("click MouseEvent=", ev);
    activity = CLICK;
    mouseOrigin = evPos(ev);
    Motion.impulse(mouseOrigin, ev.timeStamp);
    blockEvent(ev);
    if (ev.button == 2) blockContextMenu = true;
    break;
  //
  default:
    console.log("WARNING: illegal activity for mousedown:", activity);
    CoverDiv.hide();
    activity = STOP;
    return onMouseDown(ev);
  }
}
addEventListener("mouseup", onMouseUp, true);

function onMouseMove(ev) {
  switch (activity) {
  //
  case STOP: case GLIDE: break;
  //
  case DRAG:
    if (ev.button != options.button) break;
    updateDrag(ev);
    blockEvent(ev);
    break;
  //
  case CLICK:
    if (ev.button != options.button) break;
    if (vmag2(vsub(mouseOrigin,evPos(ev))) > 9) {
      if (options.button == 2) blockContextMenu = true;
      CoverDiv.show();
      startDrag(ev);
    }
    blockEvent(ev);
    break;
  //
  }
}
addEventListener("mousemove", onMouseMove, true);

function onMouseUp(ev) {
  switch (activity) {
  //
  case STOP: break;
  //
  case CLICK:
    debug("unclick, no drag");
    CoverDiv.hide();
    if (ev.button == 0) getSelection().removeAllRanges();
    if (document.activeElement) document.activeElement.blur();
    if (ev.target) ev.target.focus();
    if (ev.button == options.button) activity = STOP;
    break;
  //
  case DRAG:
    if (ev.button == options.button) { stopDrag(ev); blockEvent(ev); }
    break;
  //
  case GLIDE:
    stopGlide(ev);
    break;
  //
  }
}
addEventListener("mousedown", onMouseDown, true);

function onMouseOut(ev) {
  if (activity === DRAG && ev.toElement == null) stopDrag(ev);
}
addEventListener("mouseout", onMouseOut, true);

function onContextMenu(ev) {
  if (!blockContextMenu) return;
  blockContextMenu = false;
  debug("blocking context menu");
  blockEvent(ev);
}
addEventListener("contextmenu", onContextMenu, true);
