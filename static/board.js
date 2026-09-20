// The board's client script: drag between columns (SortableJS), the drawer,
// and the keyboard. Every move is sent to the server as the same POST the
// menu buttons use, and the server's board partial replaces the DOM, so a
// drag that fails leaves nothing pretending it succeeded.
(function () {
  const body = document.body;

  function wire() {
    if (!window.Sortable) return;
    document.querySelectorAll("[data-cards]").forEach((list) => {
      if (list.dataset.sortable) return;
      list.dataset.sortable = "1";
      new Sortable(list, {
        group: "cards",
        animation: 120,
        draggable: "[data-item-id]",
        handle: "[data-item-id]",
        filter: "a, button, input, details, summary",
        preventOnFilter: false,
        onStart() { window.boardBusy = true; },
        onEnd(evt) {
          window.boardBusy = false;
          const card = evt.item;
          const statusId = evt.to.dataset.statusId;
          const next = card.nextElementSibling;
          const beforeId = next && next.dataset.itemId ? next.dataset.itemId : "";
          const same = evt.from === evt.to && evt.oldIndex === evt.newIndex;
          if (same) return;
          const board = document.getElementById("board");
          htmx.ajax("POST", "/items/" + card.dataset.itemId + "/move", {
            target: "#board",
            swap: "outerHTML",
            values: { status_id: statusId, before_id: beforeId, return: board ? board.dataset.refresh : "" },
          });
        },
      });
    });
  }

  // Keyboard on a focused card: arrows move it, Enter opens it.
  body.addEventListener("keydown", (e) => {
    const card = e.target.closest && e.target.closest("[data-item-id]");
    if (!card || e.target !== card) return;
    const id = card.dataset.itemId;
    const board = document.getElementById("board");
    const ret = board ? board.dataset.refresh : "";
    const post = (values) => htmx.ajax("POST", "/items/" + id + "/move", { target: "#board", swap: "outerHTML", values: Object.assign({ return: ret }, values) });
    if (e.key === "Enter") {
      const link = card.querySelector("a[hx-get]");
      if (link) link.click();
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      window.boardFocus = id;
      post({ status_id: card.dataset.statusId, direction: e.key === "ArrowUp" ? "up" : "down" });
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const sections = Array.from(document.querySelectorAll("[data-columns] > section"));
      const i = sections.findIndex((s) => s.contains(card));
      const to = sections[e.key === "ArrowLeft" ? i - 1 : i + 1];
      if (!to) return;
      window.boardFocus = id;
      post({ status_id: to.dataset.statusId });
    }
  });

  body.addEventListener("board-swapped", () => {
    wire();
    if (window.boardFocus) {
      const el = document.querySelector('[data-item-id="' + window.boardFocus + '"]');
      if (el) el.focus();
      window.boardFocus = null;
    }
  });
  body.addEventListener("htmx:afterSettle", wire);

  // The drawer: Escape or the back button closes it and returns the URL to
  // the board.
  window.boardCloseDrawer = function () {
    const drawer = document.getElementById("drawer");
    if (!drawer || !drawer.firstChild) return;
    drawer.replaceChildren();
    const board = document.getElementById("board");
    if (board && board.dataset.refresh) history.pushState({}, "", board.dataset.refresh);
  };
  body.addEventListener("keydown", (e) => { if (e.key === "Escape") window.boardCloseDrawer(); });
  window.addEventListener("popstate", () => {
    const drawer = document.getElementById("drawer");
    if (drawer && drawer.firstChild && !/\/items\/\d+/.test(location.pathname)) drawer.replaceChildren();
  });

  // A toast fades on its own after a while.
  body.addEventListener("htmx:oobAfterSwap", (e) => {
    if (e.target && e.target.id === "toast") setTimeout(() => { const t = document.getElementById("toast"); if (t) t.replaceChildren(); }, 8000);
  });

  document.addEventListener("DOMContentLoaded", wire);
  if (document.readyState !== "loading") wire();
})();
