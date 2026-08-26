/* ---- Google Sheets content engine (no backend required) ----

SETUP
1. Create a Google Sheet with two tabs named exactly: "Announcements" and "Blog".
2. Row 1 of each tab must be headers:
     Title | Subtitle | Text | Start Date | End Date | Display Date | Image URL
   - Subtitle, Start Date, End Date, Display Date are all OPTIONAL (blank = hidden/auto).
   - Display Date overrides the date shown on the post when you want it to differ
     from the schedule (e.g. show an event date). Blank = shows Start Date.
   - EVERY filled cell to the RIGHT of Image URL becomes an additional
     carousel image for that entry — no column naming needed. Leave blank to skip.
3. Dates: M/D/YYYY or YYYY-MM-DD.
4. Share the sheet: Share -> General access -> Anyone with the link -> Viewer.
5. Copy the sheet ID from its URL (the long string between /d/ and /edit)
   and paste it into SHEET_ID below.

Image tips: direct image URLs work best. Google Drive share links are
auto-converted, but the file must be shared "Anyone with the link".
*/

const SHEET_ID = "1raUOZppH_y55gJcej8JgYojMLewQjFVmm749dDuVyDI";

window.ChurchSheet = (() => {
  function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') inQuotes = false;
        else field += c;
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field); field = "";
      } else if (c === "\n") {
        row.push(field); rows.push(row); row = []; field = "";
      } else if (c !== "\r") {
        field += c;
      }
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  function parseDate(s) {
    if (!s || !s.trim()) return null;
    s = s.trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m) {
      let y = +m[3];
      if (y < 100) y += 2000;
      return new Date(y, +m[1] - 1, +m[2]);
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  function normalizeImage(u) {
    u = u.trim();
    const dm = u.match(/drive\.google\.com\/file\/d\/([^/]+)/);
    if (dm) return "https://drive.google.com/thumbnail?id=" + dm[1] + "&sz=w1400";
    return u;
  }

  async function fetchTab(name) {
    if (!SHEET_ID || SHEET_ID.indexOf("PASTE") === 0) {
      throw new Error("SHEET_ID not configured yet (js/gsheets.js)");
    }
    const url =
      "https://docs.google.com/spreadsheets/d/" + SHEET_ID +
      "/gviz/tq?tqx=out:csv&sheet=" + encodeURIComponent(name);
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("Sheet fetch failed: HTTP " + res.status);

    const rows = parseCSV(await res.text());
    const headers = rows.length ? rows[0].map((h) => h.trim().toLowerCase().replace(/[^a-z]/g, "")) : [];
    const idx = (name) => headers.indexOf(name);
    const iTitle = idx("title"), iSub = idx("subtitle"), iText = idx("text");
    const iStart = idx("startdate"), iEnd = idx("enddate"), iDisp = idx("displaydate");
    const iImg = idx("imageurl");

    const now = new Date();
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const items = rows.slice(1)
      .map((r) => {
        const get = (i) => (i >= 0 && r[i] ? r[i].trim() : "");
        const images = [];
        if (iImg >= 0) {
          for (let i = iImg; i < r.length; i++) {
            if (r[i] && r[i].trim()) images.push(normalizeImage(r[i]));
          }
        }
        return {
          title: get(iTitle),
          subtitle: get(iSub),
          text: get(iText),
          start: parseDate(get(iStart)),
          end: parseDate(get(iEnd)),
          display: parseDate(get(iDisp)),
          images
        };
      })
      .filter((o) => (!o.start || o.start <= now) && (!o.end || o.end >= endOfToday))
      .sort((a, b) => (b.start ? b.start.getTime() : 0) - (a.start ? a.start.getTime() : 0));
    return items;
  }

  function formatDate(d) {
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function buildMedia(images) {
    const wrap = document.createElement("div");
    wrap.className = "post-media";
    if (!images.length) return wrap;
    if (images.length === 1) {
      const im = document.createElement("img");
      im.src = images[0];
      im.loading = "lazy";
      im.alt = "";
      wrap.appendChild(im);
      return wrap;
    }
    const car = document.createElement("div");
    car.className = "carousel";
    images.forEach((u) => {
      const im = document.createElement("img");
      im.src = u;
      im.loading = "lazy";
      im.alt = "";
      car.appendChild(im);
    });
    wrap.appendChild(car);
    const btn = (dir) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "car-btn " + dir;
      b.setAttribute("aria-label", dir === "prev" ? "Previous image" : "Next image");
      b.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="' + (dir === "prev" ? "M15 19l-7-7 7-7" : "M9 5l7 7-7 7") + '"/></svg>';
      b.addEventListener("click", () => {
        car.scrollBy({ left: (dir === "prev" ? -1 : 1) * car.clientWidth, behavior: "smooth" });
      });
      return b;
    };
    wrap.appendChild(btn("prev"));
    wrap.appendChild(btn("next"));
    return wrap;
  }

  function attachCarouselAutoplay(card) {
    const car = card.querySelector(".carousel");
    if (!car || car.children.length < 2) return;
    const canHover = window.matchMedia("(hover: hover)").matches;

    if (canHover) {
      /* desktop: hovering the card plays the slideshow at a calm 3s pace */
      let timer = null;
      const advance = () => {
        const idx = Math.round(car.scrollLeft / car.clientWidth);
        car.scrollTo({ left: ((idx + 1) % car.children.length) * car.clientWidth, behavior: "smooth" });
      };
      card.addEventListener("mouseenter", () => {
        if (timer) return;
        timer = setInterval(advance, 4000);
      });
      card.addEventListener("mouseleave", () => {
        clearInterval(timer);
        timer = null;
      });
      return;
    }

    /* touch: autoplay while the card is on screen; tap reveals the arrows */
    let onScreen = false;
    let timer = null;
    let hideTimer = null;

    const advance = () => {
      const idx = Math.round(car.scrollLeft / car.clientWidth);
      car.scrollTo({ left: ((idx + 1) % car.children.length) * car.clientWidth, behavior: "smooth" });
    };
    const start = () => {
      if (timer || !onScreen) return;
      timer = setInterval(advance, 4000);
    };
    const stop = () => {
      clearInterval(timer);
      timer = null;
    };
    const reveal = () => {
      card.classList.add("show-arrows");
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => card.classList.remove("show-arrows"), 2600);
    };

    new IntersectionObserver((entries) => {
      onScreen = entries[0].isIntersecting;
      onScreen ? start() : stop();
    }, { threshold: 0.5 }).observe(car);

    card.addEventListener("click", reveal);
    card.addEventListener("touchstart", stop, { passive: true });
    card.addEventListener("touchend", () => { setTimeout(start, 400); }, { passive: true });
  }

  return { fetchTab, parseDate, formatDate, esc, buildMedia, attachCarouselAutoplay };
})();
