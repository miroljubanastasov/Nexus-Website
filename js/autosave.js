document.addEventListener("DOMContentLoaded", () => {
  // Restore saved state
  document.querySelectorAll("input, select").forEach(el => {
    const saved = localStorage.getItem(el.id);
    if (saved !== null) {
      if (el.type === "checkbox") {
        el.checked = saved === "true";
      } else {
        el.value = saved;
      }
    }
  });

  // Save on change
  document.querySelectorAll("input, select").forEach(el => {
    el.addEventListener("change", () => {
      if (el.type === "checkbox") {
        localStorage.setItem(el.id, el.checked);
      } else {
        localStorage.setItem(el.id, el.value);
      }
    });
  });
});
