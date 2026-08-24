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

/* ---- scroll-driven cross scene ---- */

let target = 0;
let current = 0;
let splashed = false;
let started = false;

function measure() {
  const rect = scene.getBoundingClientRect();
  const scrollable = scene.offsetHeight - window.innerHeight;
  target = scrollable > 0 ? clamp01(-rect.top / scrollable) : 1;
}

function apply() {
  const rise = smoothstep((current - 0.12) / 0.55);
  scene.style.setProperty("--p", current.toFixed(4));
  scene.style.setProperty("--rise", rise.toFixed(4));

  if (rise > 0.55 && !splashed) {
    splashed = true;
    stage.querySelector(".splash").classList.add("go");
  }
  if (splashed && current < 0.04) {
    splashed = false;
    stage.querySelector(".splash").classList.remove("go");
  }

  stage.classList.toggle("afloat", rise > 0.97);
}

function loop() {
  measure();
  const diff = target - current;
  current += Math.abs(diff) < 0.0005 ? diff : diff * 0.09;
  apply();
  requestAnimationFrame(loop);
}

if (!reduceMotion && scene) {
  if (!started) {
    started = true;
    apply();
    requestAnimationFrame(loop);
  }
} else if (scene) {
  scene.style.setProperty("--p", "1");
  scene.style.setProperty("--rise", "1");
  stage.classList.add("afloat");
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
