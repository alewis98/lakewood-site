const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smoothstep = (t) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

const scene = document.querySelector(".scene");
const stage = document.querySelector(".stage");
const nav = document.getElementById("nav");
const navToggle = document.getElementById("navToggle");
const navLinks = document.getElementById("navLinks");
const yearEl = document.getElementById("year");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (yearEl) yearEl.textContent = new Date().getFullYear();

/* ---- cross rise: a two-state gate with all-or-nothing rides ---- */

let heroState = "top"; /* "top" (sunken) | "risen" (afloat) */
let riding = false;
let splashed = false;

let rideId = 0;

function playRide(dir) {
  if (riding) return;
  riding = true;
  ridePlayed = true;
  const id = ++rideId;
  const duration = dir === "fwd" ? 1500 : 1500;
  const start = performance.now();
  if (dir === "rev") stage.classList.add("logo-out");
  else stage.classList.remove("logo-out");
  const step = (now) => {
    if (id !== rideId) return;
    const t = Math.min(1, (now - start) / duration);
    let q = 1 - Math.pow(1 - t, 3);
    if (dir === "rev") {
      /* logo exits first: hold the risen pose briefly, then sink */
      const tt = Math.max(0, (t - 0.2) / 0.8);
      q = 1 - Math.pow(1 - tt, 3);
    }
    const p = dir === "fwd" ? q : 1 - q;
    const rise = smoothstep((p - 0.05) / 0.786);
    stage.style.setProperty("--p", p.toFixed(3));
    stage.style.setProperty("--rise", rise.toFixed(3));
    stage.classList.toggle("afloat", rise > 0.97);
    if (dir === "fwd" && rise > 0.55 && !splashed) {
      splashed = true;
      stage.querySelector(".splash").classList.add("go");
    }
    if (t < 1) {
      requestAnimationFrame(step);
      return;
    }
    heroState = dir === "fwd" ? "risen" : "top";
    if (heroState === "top") {
      stage.querySelector(".splash").classList.remove("go");
      splashed = false;
    }
    riding = false;
  };
  requestAnimationFrame(step);
}

function resetHero() {
  rideId++;
  riding = false;
  ridePlayed = false;
  splashed = false;
  heroState = "top";
  stage.querySelector(".splash").classList.remove("go");
  stage.classList.remove("afloat");
  stage.style.setProperty("--p", "0");
  stage.style.setProperty("--rise", "0");
  window.scrollTo({ top: 0, behavior: "instant" });
}

if (scene) {
  if (reduceMotion) {
    heroState = "risen";
    stage.style.setProperty("--p", "1");
    stage.style.setProperty("--rise", "1");
    stage.classList.add("afloat");
  } else {
    let touchCaptured = false;
    let touchStartY = 0;
    let touchIsDown = false;

    const atHero = () => window.scrollY <= 2;

    window.addEventListener("touchstart", (e) => {
      touchIsDown = true;
      if (riding && atHero()) {
        /* a second touch mid-ride must not natively scroll either */
        touchCaptured = true;
        document.documentElement.style.touchAction = "none";
        document.body.style.touchAction = "none";
        return;
      }
      if (!atHero()) return;
      if (heroState === "top") {
        /* hold the page: native pan never starts, so momentum cannot exist */
        touchCaptured = true;
        touchStartY = e.touches[0].clientY;
        document.documentElement.style.touchAction = "none";
        document.body.style.touchAction = "none";
      } else {
        touchStartY = e.touches[0].clientY;
      }
    }, { passive: false });

    window.addEventListener("touchmove", (e) => {
      if (riding) {
        if (e.cancelable) e.preventDefault();
        if (window.scrollY > 2) window.scrollTo(0, 0);
        return;
      }
      if (!touchCaptured) return;
      if (e.cancelable) e.preventDefault();
      const delta = touchStartY - e.touches[0].clientY;
      if (heroState === "top" && delta > 10) {
        playRide("fwd");
      } else if (heroState === "risen" && delta < -12) {
        releaseTouch();
        playRide("rev");
      } else if (heroState === "risen" && delta > 12) {
        releaseTouch();
      }
    }, { passive: false });

    /* reverse detection when the gesture was not captured (risen state) */
    window.addEventListener("touchmove", (e) => {
      if (riding || !touchIsDown || touchCaptured || !atHero()) return;
      if (heroState === "risen" && e.touches[0].clientY - touchStartY > 12) playRide("rev");
    }, { passive: true });

    const releaseTouch = () => {
      touchIsDown = false;
      if (touchCaptured) {
        touchCaptured = false;
        document.documentElement.style.touchAction = "";
        document.body.style.touchAction = "";
      }
    };

    window.addEventListener("touchend", releaseTouch, { passive: true });
    window.addEventListener("touchcancel", releaseTouch, { passive: true });

    window.addEventListener("wheel", (e) => {
      if (riding) {
        e.preventDefault();
        return;
      }
      if (!atHero()) return;
      if (heroState === "top" && e.deltaY > 0) {
        e.preventDefault();
        playRide("fwd");
      } else if (heroState === "risen" && e.deltaY < 0) {
        e.preventDefault();
        playRide("rev");
      }
    }, { passive: false });

    window.addEventListener("keydown", (e) => {
      if (riding && ["ArrowDown", "ArrowUp", "PageDown", "PageUp", " ", "Home", "End"].includes(e.key)) {
        e.preventDefault();
      }
    }, { passive: false });

    window.addEventListener("scroll", () => {
      if (riding) {
        if (window.scrollY > 2) window.scrollTo(0, 0);
        return;
      }
      if (heroState === "top" && window.scrollY > 4) {
        window.scrollTo(0, 0);
        playRide("fwd");
      }
    }, { passive: true });

    new IntersectionObserver((entries) => {
      scene.classList.toggle("offscreen", !entries[0].isIntersecting);
    }, { threshold: 0 }).observe(scene);
  }

  /* logo resets the hero to its initial state */
  const brand = document.querySelector(".nav-brand");
  if (brand) {
    brand.addEventListener("click", (e) => {
      e.preventDefault();
      resetHero();
    });
  }
}

/* ---- nav ---- */

function onNavScroll() {
  nav.classList.toggle("scrolled", window.scrollY > 40);
}

window.addEventListener("scroll", onNavScroll, { passive: true });
onNavScroll();

navToggle.addEventListener("click", () => {
  const open = nav.classList.toggle("open");
  navToggle.setAttribute("aria-expanded", String(open));
  navToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  document.body.style.overflow = open ? "hidden" : "";
});

navLinks.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    nav.classList.remove("open");
    navToggle.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  });
});

/* ---- "keep scrolling" prompt: play the full rise automatically ---- */

(function () {
  const hint = document.getElementById("scrollHint");
  if (!hint || !scene) return;
  hint.addEventListener("click", () => playRide("fwd"));
})();

/* ---- reveal on scroll ---- */

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in");
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
);

document.querySelectorAll(".reveal").forEach((el) => revealObserver.observe(el));

/* ---- contact / prayer forms (opens the visitor's email app) ---- */

document.querySelectorAll("form[data-mailto]").forEach((form) => {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const to = form.dataset.mailto;
    const subject = encodeURIComponent(form.dataset.subject || "Website message");
    const parts = [];

    form.querySelectorAll("input, textarea").forEach((field) => {
      if (field.type === "submit" || field.type === "hidden") return;
      if (field.type === "checkbox") {
        if (field.checked) parts.push(field.name + ": " + field.value);
        return;
      }
      if (!field.value) return;
      parts.push(field.name + ": " + field.value);
    });

    window.location.href = "mailto:" + to + "?subject=" + subject + "&body=" + encodeURIComponent(parts.join("\n\n"));
  });
});

/* ---- brush divider above the footer on every page ---- */

(function () {
  const footer = document.querySelector(".footer");
  if (!footer) return;
  const NAVY = "M-40.0,97.0 L-23.1,95.2 L-6.2,93.8 L10.7,92.5 L27.6,91.3 L44.4,90.2 L61.3,89.1 L78.2,88.0 L95.1,87.0 L112.0,86.0 L128.9,85.1 L145.8,84.2 L162.7,83.3 L179.6,82.5 L196.4,81.7 L213.3,80.9 L230.2,80.2 L247.1,79.5 L264.0,78.8 L280.9,78.2 L297.8,77.6 L314.7,77.1 L331.6,76.5 L348.4,76.0 L365.3,75.6 L382.2,75.1 L399.1,74.8 L416.0,74.4 L432.9,74.1 L449.8,73.8 L466.7,73.5 L483.6,73.3 L500.4,73.1 L517.3,72.9 L534.2,72.8 L551.1,72.7 L568.0,72.6 L584.9,72.6 L601.8,72.6 L618.7,72.6 L635.6,72.7 L652.4,72.8 L669.3,72.9 L686.2,73.0 L703.1,73.2 L720.0,73.4 L736.9,73.6 L753.8,73.9 L770.7,74.2 L787.6,74.5 L804.4,74.8 L821.3,75.2 L838.2,75.6 L855.1,76.0 L872.0,76.5 L888.9,76.9 L905.8,77.4 L922.7,77.9 L939.6,78.5 L956.4,79.0 L973.3,79.6 L990.2,80.2 L1007.1,80.8 L1024.0,81.4 L1040.9,82.1 L1057.8,82.7 L1074.7,83.4 L1091.6,84.1 L1108.4,84.9 L1125.3,85.6 L1142.2,86.3 L1159.1,87.1 L1176.0,87.9 L1192.9,88.6 L1209.8,89.4 L1226.7,90.2 L1243.6,91.0 L1260.4,91.9 L1277.3,92.7 L1294.2,93.5 L1311.1,94.4 L1328.0,95.2 L1344.9,96.1 L1361.8,96.9 L1378.7,97.8 L1395.6,98.7 L1412.4,99.5 L1429.3,100.4 L1446.2,101.3 L1463.1,102.1 L1480.0,103.0 L1480,161 L-40,161 Z";
  const MAIN = "M-40.0,95.0 L-23.1,91.2 L-6.2,88.1 L10.7,85.3 L27.6,82.7 L44.4,80.2 L61.3,77.8 L78.2,75.5 L95.1,73.3 L112.0,71.1 L128.9,69.1 L145.8,67.1 L162.7,65.2 L179.6,63.4 L196.4,61.6 L213.3,59.9 L230.2,58.3 L247.1,56.8 L264.0,55.3 L280.9,53.9 L297.8,52.6 L314.7,51.3 L331.6,50.1 L348.4,49.0 L365.3,48.0 L382.2,47.0 L399.1,46.1 L416.0,45.3 L432.9,44.5 L449.8,43.8 L466.7,43.2 L483.6,42.6 L500.4,42.1 L517.3,41.7 L534.2,41.4 L551.1,41.1 L568.0,40.9 L584.9,40.7 L601.8,40.6 L618.7,40.6 L635.6,40.7 L652.4,40.8 L669.3,41.0 L686.2,41.2 L703.1,41.5 L720.0,41.8 L736.9,42.3 L753.8,42.7 L770.7,43.3 L787.6,43.9 L804.4,44.5 L821.3,45.2 L838.2,46.0 L855.1,46.8 L872.0,47.6 L888.9,48.5 L905.8,49.5 L922.7,50.5 L939.6,51.6 L956.4,52.7 L973.3,53.8 L990.2,55.0 L1007.1,56.2 L1024.0,57.5 L1040.9,58.8 L1057.8,60.1 L1074.7,61.5 L1091.6,62.9 L1108.4,64.3 L1125.3,65.8 L1142.2,67.3 L1159.1,68.8 L1176.0,70.4 L1192.9,71.9 L1209.8,73.5 L1226.7,75.2 L1243.6,76.8 L1260.4,78.5 L1277.3,80.1 L1294.2,81.8 L1311.1,83.5 L1328.0,85.2 L1344.9,87.0 L1361.8,88.7 L1378.7,90.5 L1395.6,92.2 L1412.4,94.0 L1429.3,95.7 L1446.2,97.5 L1463.1,99.2 L1480.0,101.0 L1480.0,103.0 L1463.1,102.1 L1446.2,101.3 L1429.3,100.4 L1412.4,99.5 L1395.6,98.7 L1378.7,97.8 L1361.8,96.9 L1344.9,96.1 L1328.0,95.2 L1311.1,94.4 L1294.2,93.5 L1277.3,92.7 L1260.4,91.9 L1243.6,91.0 L1226.7,90.2 L1209.8,89.4 L1192.9,88.6 L1176.0,87.9 L1159.1,87.1 L1142.2,86.3 L1125.3,85.6 L1108.4,84.9 L1091.6,84.1 L1074.7,83.4 L1057.8,82.7 L1040.9,82.1 L1024.0,81.4 L1007.1,80.8 L990.2,80.2 L973.3,79.6 L956.4,79.0 L939.6,78.5 L922.7,77.9 L905.8,77.4 L888.9,76.9 L872.0,76.5 L855.1,76.0 L838.2,75.6 L821.3,75.2 L804.4,74.8 L787.6,74.5 L770.7,74.2 L753.8,73.9 L736.9,73.6 L720.0,73.4 L703.1,73.2 L686.2,73.0 L669.3,72.9 L652.4,72.8 L635.6,72.7 L618.7,72.6 L601.8,72.6 L584.9,72.6 L568.0,72.6 L551.1,72.7 L534.2,72.8 L517.3,72.9 L500.4,73.1 L483.6,73.3 L466.7,73.5 L449.8,73.8 L432.9,74.1 L416.0,74.4 L399.1,74.8 L382.2,75.1 L365.3,75.6 L348.4,76.0 L331.6,76.5 L314.7,77.1 L297.8,77.6 L280.9,78.2 L264.0,78.8 L247.1,79.5 L230.2,80.2 L213.3,80.9 L196.4,81.7 L179.6,82.5 L162.7,83.3 L145.8,84.2 L128.9,85.1 L112.0,86.0 L95.1,87.0 L78.2,88.0 L61.3,89.1 L44.4,90.2 L27.6,91.3 L10.7,92.5 L-6.2,93.8 L-23.1,95.2 L-40.0,97.0 Z";
  const CROSS = "M1060.9,15.7 L1062.8,17.3 L1064.4,19.1 L1066.0,20.8 L1067.5,22.6 L1068.9,24.4 L1070.4,26.3 L1071.8,28.1 L1073.1,29.9 L1074.4,31.8 L1075.7,33.7 L1077.0,35.6 L1078.2,37.5 L1079.4,39.4 L1080.6,41.3 L1081.7,43.2 L1082.8,45.2 L1083.9,47.1 L1084.9,49.1 L1085.9,51.1 L1086.9,53.0 L1087.8,55.0 L1088.8,57.1 L1089.6,59.1 L1090.5,61.1 L1091.3,63.2 L1092.1,65.2 L1092.9,67.3 L1093.6,69.4 L1094.3,71.4 L1095.0,73.5 L1095.7,75.6 L1096.3,77.8 L1096.9,79.9 L1097.5,82.0 L1098.1,84.2 L1098.6,86.3 L1099.1,88.5 L1099.6,90.6 L1100.1,92.8 L1100.5,95.0 L1101.0,97.2 L1101.4,99.4 L1101.8,101.6 L1102.2,103.8 L1102.5,106.0 L1102.9,108.2 L1103.2,110.5 L1103.5,112.7 L1103.9,114.9 L1104.2,117.2 L1104.5,119.4 L1104.8,121.6 L1105.1,123.9 L1105.3,126.1 L1105.6,128.4 L1105.9,130.6 L1106.1,132.9 L1106.4,135.1 L1106.7,137.4 L1106.9,139.7 L1105.1,140.3 L1104.3,138.3 L1103.5,136.2 L1102.8,134.1 L1102.0,132.1 L1101.2,130.0 L1100.5,127.9 L1099.7,125.9 L1098.9,123.8 L1098.2,121.7 L1097.4,119.7 L1096.6,117.6 L1095.9,115.5 L1095.1,113.5 L1094.3,111.4 L1093.6,109.3 L1092.8,107.3 L1092.0,105.2 L1091.3,103.1 L1090.5,101.1 L1089.7,99.0 L1089.0,96.9 L1088.2,94.9 L1087.4,92.8 L1086.7,90.7 L1085.9,88.7 L1085.1,86.6 L1084.4,84.5 L1083.6,82.5 L1082.8,80.4 L1082.1,78.3 L1081.3,76.3 L1080.5,74.2 L1079.8,72.1 L1079.0,70.1 L1078.2,68.0 L1077.5,65.9 L1076.7,63.9 L1075.9,61.8 L1075.2,59.7 L1074.4,57.7 L1073.6,55.6 L1072.9,53.5 L1072.1,51.5 L1071.3,49.4 L1070.6,47.3 L1069.8,45.3 L1069.0,43.2 L1068.3,41.1 L1067.5,39.1 L1066.7,37.0 L1066.0,34.9 L1065.2,32.9 L1064.4,30.8 L1063.7,28.7 L1062.9,26.7 L1062.1,24.6 L1061.4,22.5 L1060.6,20.5 L1059.8,18.4 L1059.1,16.3 Z";
  const div = document.createElement("div");
  div.className = "footer-swoosh";
  div.setAttribute("aria-hidden", "true");
  div.innerHTML = `<svg viewBox="0 0 1440 160" preserveAspectRatio="none">
    <defs>
      <linearGradient id="footerSwooshGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#e65336"/>
        <stop offset=".45" stop-color="#cf3a26"/>
        <stop offset="1" stop-color="#a8281c"/>
      </linearGradient>
    </defs>
    <path fill="#05121f" d="${NAVY}"/>
    <path class="stroke" fill="url(#footerSwooshGrad)" opacity=".92" d="${CROSS}"/>
    <path class="stroke" fill="url(#footerSwooshGrad)" d="${MAIN}"/>
  </svg>`;
  footer.parentNode.insertBefore(div, footer);
})();


/* ---- next-service countdown (hero) ---- */

(function () {
  const what = document.getElementById("cdWhat");
  const time = document.getElementById("cdTime");
  if (!what || !time) return;

  const TZ = "America/New_York";
  const services = [
    { dow: 0, h: 9, m: 0, label: "Sunday School" },
    { dow: 0, h: 10, m: 15, label: "Worship Service" },
    { dow: 3, h: 10, m: 0, label: "Prayer Group" }
  ];
  const dowMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  const partFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short"
  });

  function etParts(date) {
    const p = {};
    for (const part of partFmt.formatToParts(date)) p[part.type] = part.value;
    return p;
  }

  function etOffsetMs(date) {
    const name = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" })
      .formatToParts(date).find((x) => x.type === "timeZoneName").value;
    const m = name.match(/GMT([+-])(\d{2})(?::(\d{2}))?/);
    if (!m) return 0;
    const mins = parseInt(m[2], 10) * 60 + (m[3] ? parseInt(m[3], 10) : 0);
    return (m[1] === "-" ? -mins : mins) * 60000;
  }

  function nextService() {
    const now = Date.now();
    for (let day = 0; day < 8; day++) {
      const p = etParts(new Date(now + day * 86400000));
      const y = parseInt(p.year, 10);
      const mo = parseInt(p.month, 10) - 1;
      const d = parseInt(p.day, 10);
      for (const s of services) {
        if (dowMap[p.weekday] !== s.dow) continue;
        const wall = Date.UTC(y, mo, d, s.h, s.m);
        const ts = wall - etOffsetMs(new Date(wall));
        if (ts > now + 60000) return { ts, label: s.label };
      }
    }
    return null;
  }

  function tick() {
    const next = nextService();
    if (!next) return;
    what.textContent = next.label;
    const diff = Math.max(0, next.ts - Date.now());
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    time.textContent = "in " + (d > 0 ? d + "d " : "") + h + "h " + String(m).padStart(2, "0") + "m";
  }

  tick();
  setInterval(tick, 20000);
})();
