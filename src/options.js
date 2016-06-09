var KEYS = ["shift","ctrl","alt","meta"];

function $(id) { return document.getElementById(id); }

function error(msg) {
    $("message").innerHTML += "<div style='color:red;'>"+msg+"</div>";
}

function clearMessage() {
    $("message").innerHTML = "";
}

function save() {
    var x;
    var o = {};

    clearMessage();

    x = $("button").selectedIndex;
    if (x < 0 || x > 2) error("Somehow, you broke the button field");
    else o.button = x;

    x = $("scaling").value-0;
    if (isNaN(x)) error("Scaling must be a number");
    else o.scaling = x / 100

    x = $("speed").value-0;
    if (isNaN(x) || x < 0) error("Top speed must be a positive number or zero");
    else o.speed = x;

    x = $("friction").value-0;
    if (isNaN(x) || x < 0) error("Friction must be a positive number");
    else o.friction = x;

    for (var i = 0; i < KEYS.length; i++) {
        o["key_"+KEYS[i]] = $("key_"+KEYS[i]).checked;
    }

    o.cursor = $("cursor").checked;
    o.notext = $("notext").checked;
    o.debug = $("debug").checked;

    chrome.extension.getBackgroundPage().saveOptions(o);
}

function load() {
    var o = chrome.extension.getBackgroundPage().loadOptions();

    $("button").selectedIndex = o.button;

    for (var i = 0; i < KEYS.length; i++) {
        $("key_"+KEYS[i]).checked = (o["key_"+KEYS[i]]+"" == "true");
    }

    $("scaling").value  = o.scaling * 100;
    $("speed").value    = o.speed;
    $("friction").value = o.friction;

    $("cursor").checked = (o.cursor == "true");
    $("notext").checked = (o.notext == "true");
    $("debug").checked = (o.debug == "true");
}

var updateTimeoutId

function onUpdate(ev) {
    if (updateTimeoutId != null) clearTimeout(updateTimeoutId);
    updateTimeoutId = setTimeout(save,200);

    $("windows_middle_warning").style.display =
        ($("button").selectedIndex == 1 &&
          navigator.userAgent.search(/Windows/) != -1 &&
          navigator.userAgent.search(/Chrome\/[012345]\./) != -1)
        ? "block" : "none";
}

document.addEventListener("DOMContentLoaded", ev => {
    load();
    ["button","cursor","notext","debug"].forEach(id =>
        $(id).addEventListener("change",onUpdate,false));

    KEYS.forEach(key => $("key_"+key).addEventListener("change",onUpdate,false));

    ["scaling","speed","friction"].forEach(id => {
        $(id).addEventListener("change",    onUpdate, true);
        $(id).addEventListener("keydown",   onUpdate, true);
        $(id).addEventListener("mousedown", onUpdate, true);
        $(id).addEventListener("blur",      onUpdate, true);
    });
}, true);

document.addEventListener("unload", save, true);
