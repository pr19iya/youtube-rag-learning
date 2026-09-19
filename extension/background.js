// =========================================
// YouTube RAG Assistant - Background
// =========================================

chrome.runtime.onInstalled.addListener(() => {

  chrome.sidePanel.setPanelBehavior({
    openPanelOnActionClick: true
  });

});


chrome.tabs.onUpdated.addListener(
  (tabId, changeInfo, tab) => {

    if (!tab.url) {
      return;
    }

    if (
      tab.url.includes("youtube.com/watch") ||
      tab.url.includes("youtu.be/")
    ) {

      console.log(
        "YouTube video detected:",
        tab.url
      );

    }

  }
);