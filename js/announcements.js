(function () {
  const list = document.getElementById("announcementList");
  if (!list || !window.ChurchSheet) return;

  const bellIcon = '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>';

  function emptyState(message) {
    const div = document.createElement("div");
    div.className = "feed-empty";
    div.innerHTML = bellIcon + "<p>" + ChurchSheet.esc(message) + "</p>";
    return div;
  }

  function render(items) {
    list.innerHTML = "";
    if (!items.length) {
      list.appendChild(emptyState("No announcements right now \u2014 check back soon!"));
      return;
    }
    items.forEach((it) => {
      const card = document.createElement("article");
      card.className = "post-card";
      if (it.images.length) card.appendChild(ChurchSheet.buildMedia(it.images));
      const body = document.createElement("div");
      body.className = "post-body";
      const dateSrc = it.display || it.start;
      let html = "";
      if (dateSrc) html += '<p class="post-date">' + ChurchSheet.esc(ChurchSheet.formatDate(dateSrc)) + "</p>";
      if (it.title) html += "<h3>" + ChurchSheet.esc(it.title) + "</h3>";
      if (it.subtitle) html += '<p class="post-sub">' + ChurchSheet.esc(it.subtitle) + "</p>";
      if (it.text) html += "<p>" + ChurchSheet.esc(it.text) + "</p>";
      body.innerHTML = html;
      card.appendChild(body);
      list.appendChild(card);
      ChurchSheet.attachCarouselAutoplay(card);
    });
  }

  ChurchSheet.fetchTab("Announcements")
    .then(render)
    .catch((err) => {
      console.warn("[announcements]", err);
      list.innerHTML = "";
      list.appendChild(emptyState("No announcements right now \u2014 check back soon!"));
    });
})();
