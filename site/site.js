// ccOverhead Website Interactivity

// 1. Copy-to-clipboard buttons
document.querySelectorAll(".copy-btn").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.classList.contains("copied")) return;

    const textToCopy = button.getAttribute("data-copy");
    if (!textToCopy) return;

    const label = button.querySelector("span") || button;
    const originalText = label.textContent;

    const onSuccess = () => {
      button.classList.add("copied");
      label.textContent = "Copied!";
      setTimeout(() => {
        button.classList.remove("copied");
        label.textContent = originalText;
      }, 2000);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textToCopy).then(onSuccess).catch(() => {});
    } else {
      const ta = document.createElement("textarea");
      ta.value = textToCopy;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        if (document.execCommand("copy")) onSuccess();
      } catch (_) {}
      document.body.removeChild(ta);
    }
  });
});

// 2. Surface Switcher (Desktop vs Terminal)
const previewImg = document.getElementById("preview-img");
const surfaceTabs = document.querySelectorAll(".surface-tab");

surfaceTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    surfaceTabs.forEach((t) => {
      t.classList.remove("active");
      t.setAttribute("aria-selected", "false");
    });
    tab.classList.add("active");
    tab.setAttribute("aria-selected", "true");

    const surface = tab.getAttribute("data-surface");
    if (surface === "terminal") {
      previewImg.src = "assets/screenshots/terminal.png";
      previewImg.alt = "ccOverhead band in terminal session";
    } else {
      previewImg.src = "assets/screenshots/desktop.png";
      previewImg.alt = "ccOverhead band in Claude desktop app";
    }
  });
});

// 3. Design Rationale Diagram Language Switcher
const sheetLayout = document.getElementById("sheet-layout");
const sheetStates = document.getElementById("sheet-states");
const langButtons = document.querySelectorAll(".lang-btn");

langButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    langButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    const lang = btn.getAttribute("data-lang");
    if (lang === "zh-cn") {
      sheetLayout.src = "assets/screenshots/design-layout-zh-cn.png";
      sheetStates.src = "assets/screenshots/design-states-zh-cn.png";
    } else {
      sheetLayout.src = "assets/screenshots/design-layout-en.png";
      sheetStates.src = "assets/screenshots/design-states-en.png";
    }
  });
});
