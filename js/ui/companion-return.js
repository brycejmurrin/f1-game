// Companion previews open separately so a running session stays in the game tab.
(function () {
  "use strict";
  const link = document.getElementById("companion-appearance-return");
  if (!link || !new URLSearchParams(location.search).has("arrange")) return;
  link.hidden = false;
  link.addEventListener("click", event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    window.close();
    // A browser can refuse close on a shared/bookmarked or installed page.
    setTimeout(() => { if (!window.closed) location.assign(link.href); }, 0);
  });
})();
