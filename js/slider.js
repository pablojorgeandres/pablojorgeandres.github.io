/**
 * Place home carousel (reads data/{place}/slider.json).
 * Expects #homeSlider root in the DOM.
 */
const PlaceSlider = (function () {
  let root = null;
  let track = null;
  let dotsEl = null;
  let slides = [];
  let index = 0;
  let timer = null;
  let touchX = null;
  let onNavigateCategory = null;

  function ensureEls() {
    root = document.getElementById('homeSlider');
    if (!root) return false;
    track = root.querySelector('.place-slider-track');
    dotsEl = root.querySelector('.place-slider-dots');
    return !!(track && dotsEl);
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function start() {
    stop();
    if (slides.length < 2) return;
    timer = setInterval(() => goTo(index + 1), 5000);
  }

  function slideUrl(slide) {
    const src = slide && slide.src ? String(slide.src) : '';
    if (!src) return '';
    const resolved =
      typeof resolveRepoAssetUrl === 'function' ? resolveRepoAssetUrl(src) : src;
    return typeof withCacheBust === 'function'
      ? withCacheBust(resolved, slide.v)
      : resolved + (slide.v != null ? `?v=${encodeURIComponent(slide.v)}` : '');
  }

  function goTo(next) {
    if (!slides.length || !track) return;
    index = ((next % slides.length) + slides.length) % slides.length;
    track.style.transform = `translateX(-${index * 100}%)`;
    if (dotsEl) {
      Array.from(dotsEl.children).forEach((btn, i) => {
        btn.classList.toggle('is-active', i === index);
        btn.setAttribute('aria-current', i === index ? 'true' : 'false');
      });
    }
  }

  function handleSlideClick(slide) {
    const link = slide && slide.link ? slide.link : { type: 'none' };
    const type = String(link.type || 'none').toLowerCase();
    if (type === 'external' && link.url) {
      window.open(String(link.url), '_blank', 'noopener,noreferrer');
      return;
    }
    if (type === 'category' && link.category && typeof onNavigateCategory === 'function') {
      onNavigateCategory(String(link.category));
    }
  }

  function render() {
    if (!ensureEls()) return;
    stop();
    track.innerHTML = '';
    dotsEl.innerHTML = '';

    if (!slides.length) {
      root.hidden = true;
      root.classList.add('is-hidden');
      return;
    }

    root.hidden = false;
    root.classList.remove('is-hidden');

    slides.forEach((slide, i) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'place-slider-slide';
      const linkType = slide.link && slide.link.type ? slide.link.type : 'none';
      item.classList.toggle('is-clickable', linkType === 'category' || linkType === 'external');
      item.setAttribute('aria-label', `Slide ${i + 1}`);
      const img = document.createElement('img');
      img.src = slideUrl(slide);
      img.alt = '';
      img.loading = i === 0 ? 'eager' : 'lazy';
      img.decoding = 'async';
      item.appendChild(img);
      item.addEventListener('click', () => handleSlideClick(slide));
      track.appendChild(item);

      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'place-slider-dot';
      dot.setAttribute('aria-label', `Ir al slide ${i + 1}`);
      dot.addEventListener('click', () => {
        goTo(i);
        start();
      });
      dotsEl.appendChild(dot);
    });

    goTo(0);
    start();
  }

  function wireControls() {
    if (!ensureEls() || root.dataset.wired === '1') return;
    root.dataset.wired = '1';

    const prev = root.querySelector('[data-slider-prev]');
    const next = root.querySelector('[data-slider-next]');
    if (prev) {
      prev.addEventListener('click', () => {
        goTo(index - 1);
        start();
      });
    }
    if (next) {
      next.addEventListener('click', () => {
        goTo(index + 1);
        start();
      });
    }

    const viewport = root.querySelector('.place-slider-viewport');
    if (viewport) {
      viewport.addEventListener(
        'touchstart',
        (e) => {
          touchX = e.changedTouches[0].clientX;
          stop();
        },
        { passive: true }
      );
      viewport.addEventListener(
        'touchend',
        (e) => {
          if (touchX == null) return;
          const dx = e.changedTouches[0].clientX - touchX;
          touchX = null;
          if (Math.abs(dx) > 40) goTo(index + (dx < 0 ? 1 : -1));
          start();
        },
        { passive: true }
      );
      viewport.addEventListener('mouseenter', stop);
      viewport.addEventListener('mouseleave', start);
    }
  }

  async function load(placeId, navigateCategoryFn) {
    onNavigateCategory = navigateCategoryFn || null;
    wireControls();
    if (!placeId) {
      slides = [];
      render();
      return;
    }
    const data = await fetchSliderData(placeId);
    slides = (data.slides || [])
      .filter((s) => s && s.src && s.i >= 1 && s.i <= 7)
      .sort((a, b) => a.i - b.i);
    render();
  }

  function hide() {
    stop();
    slides = [];
    if (ensureEls()) {
      root.hidden = true;
      root.classList.add('is-hidden');
      track.innerHTML = '';
      dotsEl.innerHTML = '';
    }
  }

  return { load, hide };
})();
