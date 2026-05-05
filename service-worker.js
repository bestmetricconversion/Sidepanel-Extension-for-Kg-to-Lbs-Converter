importScripts("config.js");

const INSTALL_URL = APP_CONFIG.installLandingUrl;
const UNINSTALL_FORM_URL = APP_CONFIG.uninstallFeedbackUrl;

function enableSidePanel() {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error("Side panel behavior error:", error));
}

chrome.runtime.onInstalled.addListener((details) => {
  enableSidePanel();

  chrome.runtime.setUninstallURL(UNINSTALL_FORM_URL).catch?.((error) => {
    console.error("Uninstall URL error:", error);
  });

  if (details.reason === "install") {
    chrome.tabs.create({ url: INSTALL_URL });
  }
});

chrome.runtime.onStartup.addListener(enableSidePanel);
