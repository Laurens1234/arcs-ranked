(function(){
  const classes = { none: 'bg-none', stars: 'bg-stars', map: 'bg-map', beyond: 'bg-beyond', planets: 'bg-planets' };
  function applyBg(key){
    // remove any bg-* classes we know about, then add the desired one
    try {
      document.body.classList.remove(...Object.values(classes));
    } catch (e) {
      // fallback: remove common classes individually
      document.body.classList.remove('bg-none','bg-stars','bg-map','bg-beyond');
    }
    const cls = classes[key] || 'bg-none';
    document.body.classList.add(cls);
  }

  document.addEventListener('DOMContentLoaded', () => {
    // Force dark theme and remove any saved light-theme preference
    try {
      localStorage.removeItem('arcs-theme');
      localStorage.removeItem('theme');
    } catch (e) {}
    try { document.documentElement.dataset.theme = 'dark'; } catch (e) {}
    const select = document.getElementById('bgSelect');
    // Ensure new visitors default to 'planets' and persist that choice
    let saved = localStorage.getItem('site-bg');
    if (!saved) {
      saved = 'planets';
      try { localStorage.setItem('site-bg', saved); } catch (e) { /* ignore storage errors */ }
    }
    applyBg(saved);
    // if planets is the selected background ensure the renderer script is loaded
    if (saved === 'planets') {
      loadPlanetsScript();
    }
    if (select) {
      // reflect the current value in the select
      try { select.value = saved; } catch (e) { /* ignore invalid value */ }
      select.addEventListener('change', () => {
        const v = select.value;
        applyBg(v);
        try { localStorage.setItem('site-bg', v); } catch (e) { /* ignore storage errors */ }
        if (v === 'planets') loadPlanetsScript();
      });
    }
  });

  // Dynamically load planets renderer when needed
  function loadPlanetsScript(){
    if (window._planetsScriptLoaded) return;
    window._planetsScriptLoaded = true;
    const s = document.createElement('script');
    s.src = './assets/planets-bg.js';
    s.defer = true;
    document.head.appendChild(s);
  }
})();
