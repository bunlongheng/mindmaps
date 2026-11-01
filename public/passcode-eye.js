// The lock screen eye (api/_lib/passcode-pages.ts): flips the passcode mask.
// A file, not an inline handler, so the CSP script-src 'self' allows it.
document.querySelectorAll(".eye").forEach(function (b) {
  b.addEventListener("click", function () {
    var i = b.previousElementSibling, on = i.classList.toggle("show");
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", String(on));
    b.setAttribute("aria-label", on ? "Hide passcode" : "Show passcode");
    i.focus();
  });
});
