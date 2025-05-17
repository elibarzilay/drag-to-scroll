"use strict";

// inject the code to all existing tabs
chrome.windows.getAll({populate: true}, wins => {
  if (chrome.runtime.lastError)
    return console.error("Failed to get windows:", chrome.runtime.lastError);
  wins.forEach(win =>
    win.tabs.forEach(tab =>
      // Skip chrome://, edge://, and unloaded tabs
      !/^(chrome|edge):\/\//.test(tab.url) && tab.status !== "unloaded"
      && chrome.scripting.executeScript({
           target: { tabId: tab.id, allFrames: true },
           files: ["main.js"],
         }).catch(e =>
           console.error(`Failed to inject into tab ${tab.id} ${tab.url}:\n  ${e}\n`, tab))));
});
