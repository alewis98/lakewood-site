(function () {
  const list = document.getElementById("thoughtList");
  if (!list || !window.ChurchSheet) return;

  function emptyState(message) {
    const div = document.createElement("div");
    div.className = "feed-empty";
    div.innerHTML = "<p>" + ChurchSheet.esc(message) + "</p>";
    return div;
  }

  function render(items) {
    list.innerHTML = "";
    if (!items.length) {
      list.appendChild(emptyState("New reflections are on the way \u2014 check back soon!"));
      return;
    }
    items.forEach((it) => {
      const entry = document.createElement("article");
      entry.className = "thought-entry";
      if (it.images.length) entry.appendChild(ChurchSheet.buildMedia(it.images));
      const body = document.createElement("div");
      body.className = "thought-body";
      const dateSrc = it.display || it.start;
      let html = "";
      if (dateSrc) html += '<p class="post-date">' + ChurchSheet.esc(ChurchSheet.formatDate(dateSrc)) + "</p>";
      if (it.title) html += "<h3>" + ChurchSheet.esc(it.title) + "</h3>";
      if (it.subtitle) html += '<p class="post-sub">' + ChurchSheet.esc(it.subtitle) + "</p>";
      if (it.text) {
        it.text.split(/\n{2,}|\r?\n/).forEach((para) => {
          if (para.trim()) html += "<p>" + ChurchSheet.esc(para.trim()) + "</p>";
        });
      }
      body.innerHTML = html;
      entry.appendChild(body);
      list.appendChild(entry);
      ChurchSheet.attachCarouselAutoplay(entry);
    });
  }

  ChurchSheet.fetchTab("Blog")
    .then(render)
    .catch((err) => {
      console.warn("[thoughts]", err);
      list.innerHTML = "";
      list.appendChild(emptyState("New reflections are on the way \u2014 check back soon!"));
    });
})();
