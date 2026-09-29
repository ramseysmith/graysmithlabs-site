/* Graysmith Labs. Small progressive enhancements shared by every page. */
(function () {
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var head = document.querySelector(".site-head");

  // Header: shadow once scrolled, plus a thin reading progress bar
  if (head) {
    var bar = document.createElement("div");
    bar.className = "progress";
    bar.setAttribute("aria-hidden", "true");
    head.appendChild(bar);
    var ticking = false;
    var onScroll = function () {
      ticking = false;
      var max = document.documentElement.scrollHeight - innerHeight;
      head.classList.toggle("scrolled", scrollY > 8);
      bar.style.setProperty("--p", max > 0 ? Math.min(scrollY / max, 1) : 0);
    };
    addEventListener("scroll", function () {
      if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
    }, { passive: true });
    onScroll();
  }

  // Mobile menu
  var menuBtn = document.querySelector(".menu-btn");
  if (menuBtn && head) {
    var setOpen = function (open) {
      head.classList.toggle("open", open);
      menuBtn.setAttribute("aria-expanded", open);
      menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    };
    menuBtn.addEventListener("click", function () { setOpen(!head.classList.contains("open")); });
    head.querySelectorAll(".nav a").forEach(function (a) {
      a.addEventListener("click", function () { setOpen(false); });
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") setOpen(false); });
  }

  // Scroll reveal, staggered among siblings. Anything already on screen is left alone.
  var targets = document.querySelectorAll(
    ".sec-head, .service, .app-card, .step, .feature, .engage, .audit, .about > div, .faq > div, " +
    ".contact-card, .checks li, .gallery figure, .pager, .ai-note > *, .facts-bar > div, .split > div"
  );
  if ("IntersectionObserver" in window && !reduced) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    targets.forEach(function (el) {
      if (el.closest(".reveal") || el.getBoundingClientRect().top < innerHeight) return;
      var sibs = Array.prototype.filter.call(el.parentNode.children, function (c) { return c.matches(el.tagName); });
      el.style.setProperty("--delay", Math.min(sibs.indexOf(el), 5) * 0.08 + "s");
      el.classList.add("reveal");
      io.observe(el);
    });
  }

  // Count up stats when they come into view
  var counters = document.querySelectorAll("[data-count]");
  if (counters.length && "IntersectionObserver" in window && !reduced) {
    var co = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        co.unobserve(e.target);
        var el = e.target, raw = el.getAttribute("data-count");
        var end = parseFloat(raw), dec = (raw.split(".")[1] || "").length, t0 = null;
        var step = function (t) {
          if (!t0) t0 = t;
          var k = Math.min((t - t0) / 1200, 1), eased = 1 - Math.pow(1 - k, 3);
          el.textContent = (end * eased).toFixed(dec);
          if (k < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    }, { threshold: 0.6 });
    counters.forEach(function (c) { co.observe(c); });
  }

  // Hero art: gentle pointer parallax
  var art = document.querySelector(".hero-art");
  if (art && !reduced && matchMedia("(pointer: fine)").matches) {
    addEventListener("pointermove", function (e) {
      var x = (e.clientX / innerWidth - 0.5) * 18, y = (e.clientY / innerHeight - 0.5) * 14;
      art.style.setProperty("--tx", x.toFixed(1) + "px");
      art.style.setProperty("--ty", y.toFixed(1) + "px");
    }, { passive: true });
  }

  // Engagement buttons preselect the matching option in the inquiry form
  var typeSelect = document.getElementById("f-type");
  document.querySelectorAll("[data-engage]").forEach(function (a) {
    a.addEventListener("click", function () {
      if (typeSelect) typeSelect.value = a.getAttribute("data-engage");
    });
  });

  // Inquiry form: compose a tidy email in the visitor's own mail app
  var form = document.getElementById("inquiry");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var v = function (id) { return (document.getElementById(id).value || "").trim(); };
      var name = v("f-name"), company = v("f-company"), type = v("f-type");
      var subject = type + " inquiry" + (company ? " from " + company : name ? " from " + name : "");
      var body = [
        "Name: " + name,
        company ? "Company: " + company : "",
        "Looking for: " + type,
        "Budget: " + v("f-budget"),
        "",
        v("f-msg")
      ].filter(function (l, i) { return l !== "" || i === 4; }).join("\n");
      location.href = "mailto:ramsey@graysmithlabs.com?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
    });
  }

  // Copy email button next to the address in every contact card
  document.querySelectorAll(".contact-card .email").forEach(function (a) {
    if (!navigator.clipboard) return;
    var b = document.createElement("button");
    b.type = "button";
    b.className = "copy-btn";
    b.textContent = "Copy";
    b.addEventListener("click", function () {
      navigator.clipboard.writeText("ramsey@graysmithlabs.com").then(function () {
        b.textContent = "Copied";
        setTimeout(function () { b.textContent = "Copy"; }, 1800);
      });
    });
    a.insertAdjacentElement("afterend", b);
  });

  // Keep the copyright year current
  document.querySelectorAll("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();
