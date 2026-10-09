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
        // Pointer-driven rather than the browser's own drag, so a drag can
        // start on the title link and a drop never also opens the card.
        forceFallback: true,
        fallbackTolerance: 4,
        // On a phone a swipe across a card scrolls the board; press and hold to drag.
        delay: 250,
        delayOnTouchOnly: true,
        filter: "button, input, details, summary",
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

  // A click anywhere on a card opens it, as its title does; its menu and
  // anything else interactive inside it keep their own click.
  const openCard = (card) => {
    const link = card.querySelector("a[hx-get]");
    if (link) link.click();
  };
  body.addEventListener("click", (e) => {
    const card = e.target.closest && e.target.closest("[data-item-id]");
    if (card && !e.target.closest("a, button, details, input, select, textarea, label")) openCard(card);
  });

  // Keyboard on a focused card: arrows move it, Enter opens it.
  body.addEventListener("keydown", (e) => {
    const card = e.target.closest && e.target.closest("[data-item-id]");
    if (!card || e.target !== card) return;
    const id = card.dataset.itemId;
    const board = document.getElementById("board");
    const ret = board ? board.dataset.refresh : "";
    const post = (values) => htmx.ajax("POST", "/items/" + id + "/move", { target: "#board", swap: "outerHTML", values: Object.assign({ return: ret }, values) });
    if (e.key === "Enter") {
      openCard(card);
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

  // The composer under a column: opening it puts the cursor in it, Escape
  // closes it, and after a card is added it opens again in the same column
  // for the next one.
  body.addEventListener("toggle", (e) => {
    if (e.target.matches("[data-composer]") && e.target.open) e.target.querySelector("input[name=title]").focus();
  }, true);
  body.addEventListener("keydown", (e) => {
    const open = e.key === "Escape" && e.target.closest && e.target.closest("[data-composer][open]");
    if (!open) return;
    e.stopPropagation();
    open.open = false;
    open.querySelector("summary").focus();
  }, true);
  body.addEventListener("htmx:beforeRequest", (e) => {
    const c = e.target.closest && e.target.closest("[data-composer]");
    if (c) window.boardCompose = c.dataset.composer;
  });

  body.addEventListener("board-swapped", () => {
    wire();
    if (window.boardFocus) {
      const el = document.querySelector('[data-item-id="' + window.boardFocus + '"]');
      if (el) el.focus();
      window.boardFocus = null;
    }
  });
  // Each column scrolls on its own, and a re-rendered board keeps every
  // column where it was (a new filter is a new list, and starts at the top).
  // After an add, the composer opens again and its column shows the new
  // card at its foot.
  let scrolled = null;
  body.addEventListener("htmx:beforeSwap", (e) => {
    if (e.detail.target.id === "board" && !e.target.closest("form[method=get]")) scrolled = new Map(Array.from(document.querySelectorAll("[data-cards]"), (l) => [l.dataset.statusId, l.scrollTop]));
  });
  body.addEventListener("htmx:afterSettle", () => {
    wire();
    if (!scrolled) return;
    document.querySelectorAll("[data-cards]").forEach((l) => { l.scrollTop = scrolled.get(l.dataset.statusId) || 0; });
    scrolled = null;
    const c = window.boardCompose && document.querySelector('[data-composer="' + window.boardCompose + '"]');
    window.boardCompose = null;
    if (!c) return;
    c.open = true;
    const list = c.parentElement.querySelector("[data-cards]");
    list.scrollTop = list.scrollHeight;
  });

  // The drawer: Escape or the back button closes it and returns the URL to
  // the board. Its fields save when they change, which for a text field is
  // when focus leaves it, so closing takes the focus away first: that is the
  // save of whatever was being typed.
  const emptyDrawer = (drawer) => {
    if (drawer.contains(document.activeElement)) document.activeElement.blur();
    drawer.replaceChildren();
  };
  window.boardCloseDrawer = function () {
    const drawer = document.getElementById("drawer");
    if (!drawer || !drawer.firstChild) return;
    emptyDrawer(drawer);
    const board = document.getElementById("board");
    if (board && board.dataset.refresh) history.pushState({}, "", board.dataset.refresh);
  };
  body.addEventListener("keydown", (e) => {
    // Escape in the photo viewer closes only the viewer.
    if (e.key === "Escape" && !e.target.closest("dialog")) window.boardCloseDrawer();
    // Ctrl or Command and Enter in a text box saves or posts it.
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && e.target.form && e.target.matches("textarea")) {
      e.preventDefault();
      e.target.form.requestSubmit();
    }
  });
  // A change saved from the drawer refreshes the board behind it once the
  // save answers. It hangs on the request itself: by then the drawer may
  // have closed or moved to another card, and an event fired on a form that
  // is gone reaches nothing.
  body.addEventListener("htmx:beforeRequest", (e) => {
    const xhr = e.detail.xhr;
    if (e.detail.requestConfig.verb !== "post" || !e.target.closest("#drawer")) return;
    xhr.addEventListener("load", () => { if (xhr.status < 300) htmx.trigger(body, "board-changed"); });
  });
  window.addEventListener("popstate", () => {
    const drawer = document.getElementById("drawer");
    if (drawer && drawer.firstChild && !/\/items\/\d+/.test(location.pathname)) emptyDrawer(drawer);
  });

  // Photos and files onto the open card: picked, dropped on it or pasted.
  // A photo is drawn smaller before it goes up (2048 pixels on its long
  // side), which also leaves its location data behind, and sends a 640 pixel
  // preview for the card's cover as a `thumb` part named for its place in
  // the list. A photo this browser cannot draw goes up as it is, and so does
  // every other file; the server holds each to its size limit.
  const PHOTO = /^image\/(jpeg|png|webp|heic|heif)$/;
  async function shrink(file, edge, type, quality) {
    const img = await createImageBitmap(file);
    const scale = Math.min(1, edge / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d");
    if (type === "image/jpeg") { ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    img.close();
    return new Promise((done) => canvas.toBlob(done, type, quality));
  }
  async function upload(form, picked) {
    form.classList.add("htmx-request"); // "Uploading" shows while photos are drawn, too
    const files = new DataTransfer();
    const thumbs = new DataTransfer();
    for (const [i, file] of Array.from(picked).entries()) {
      let sent = file;
      if (PHOTO.test(file.type)) {
        try {
          const type = file.type === "image/png" ? "image/png" : "image/jpeg";
          const big = await shrink(file, 2048, type, 0.85);
          if (big.size < file.size) sent = new File([big], type === file.type ? file.name : file.name.replace(/\.[^.]*$/, "") + ".jpg", { type });
          thumbs.items.add(new File([await shrink(file, 640, "image/jpeg", 0.8)], String(i), { type: "image/jpeg" }));
        } catch (e) { /* sent as it is */ }
      }
      files.items.add(sent);
    }
    form.querySelector("input[name=file]").files = files.files;
    form.querySelector("input[name=thumb]").files = thumbs.files;
    form.querySelector("[role=alert]").textContent = "";
    form.requestSubmit();
  }
  const uploader = () => document.querySelector("[data-upload]");
  body.addEventListener("change", (e) => {
    if (e.target.matches("[data-upload] input[name=file]") && e.target.files.length) upload(e.target.form, e.target.files);
  });
  body.addEventListener("dragover", (e) => {
    if (uploader() && e.target.closest("#item") && e.dataTransfer.types.includes("Files")) e.preventDefault();
  });
  body.addEventListener("drop", (e) => {
    const form = uploader();
    if (!form || !e.target.closest("#item") || !e.dataTransfer.files.length) return;
    e.preventDefault();
    upload(form, e.dataTransfer.files);
  });
  body.addEventListener("paste", (e) => {
    const form = uploader();
    if (!form || !e.clipboardData.files.length) return;
    e.preventDefault();
    upload(form, e.clipboardData.files);
  });

  // A photo opens over the page; a click anywhere or Escape closes it. A
  // modified click still opens it in a new tab.
  body.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest("a[data-photo]");
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    const viewer = document.getElementById("viewer");
    const img = viewer.querySelector("img");
    img.src = a.href;
    img.alt = a.dataset.photo;
    viewer.showModal();
  });

  // A toast fades on its own after a while.
  body.addEventListener("htmx:oobAfterSwap", (e) => {
    if (e.target && e.target.id === "toast") setTimeout(() => { const t = document.getElementById("toast"); if (t) t.replaceChildren(); }, 8000);
  });

  document.addEventListener("DOMContentLoaded", wire);
  if (document.readyState !== "loading") wire();
})();
