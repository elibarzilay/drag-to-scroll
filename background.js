defaultOptions = ({ "button":    2,
                    "key_shift": false,
                    "key_ctrl":  false,
                    "key_alt":   false,
                    "key_meta":  false,
                    "scaling":   1,
                    "speed":     6000,
                    "friction":  10,
                    "notext":    false,
                    "debug":     false,
                  });

for (var k in defaultOptions)
    if (typeof localStorage[k] == "undefined")
        localStorage[k] = defaultOptions[k];

function loadOptions() {
    var o = {};
    for (var k in defaultOptions) o[k] = localStorage[k];
    return o;
}

clients = {};

chrome.extension.onConnect.addListener(port => {
    port.postMessage({ saveOptions: localStorage });
    var id = port.portId_;
    console.log("connect: "+id);
    clients[id] = port;
    port.onDisconnect.addListener(() => {
        console.log("disconnect: "+id);
        delete clients[id];
    });
});

function saveOptions(o) {
    for (var k in o)
        localStorage[k] = o[k];
    for (var id in clients)
        clients[id].postMessage({ saveOptions: localStorage });
}

// Inject content script into all existing tabs (doesn't work)
// This functionality requires
//  "permissions": ["tabs"]
// in manifest.json
/*
chrome.windows.getAll({populate:true}, wins => {
    wins.forEach(win => {
        win.tabs.forEach(tab => {
            chrome.tabs.executeScript(tab.id,{file:"content.js",allFrames:true});
        })
    })
})
*/
