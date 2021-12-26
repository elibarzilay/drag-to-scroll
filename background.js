"use strict";

// inject the code to all existing tabs
chrome.windows.getAll({populate: true}, wins =>
  wins.forEach(win =>
    win.tabs.forEach(tab =>
      chrome.tabs.executeScript(
        tab.id,
        {file: "main.js", allFrames: true, runAt: "document_start"}))));
