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

      // create a small popup toggle button next to the background selector
      (function createPopupToggle(){
        try{
          let btn = document.getElementById('popupToggleBtn');
          let created = false;
          if(!btn){
            btn = document.createElement('button');
            btn.id = 'popupToggleBtn';
            created = true;
          }
          // Avoid double-initializing if the script runs multiple times
          if(btn.dataset && btn.dataset.bgInit === '1') return;
          if(btn.style && btn.style.display === 'none'){ btn.style.display = ''; }
          btn.type = 'button';
          function update(){
            let enabled = true;
            try{ enabled = (localStorage.getItem('site-popups') !== 'off'); }catch(e){}
            btn.textContent = enabled ? 'Popups: On' : 'Popups: Off';
            btn.title = enabled ? 'Click to disable page popups' : 'Click to enable page popups';
            btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
          }
          btn.addEventListener('click', ()=>{
            try{
              const cur = localStorage.getItem('site-popups');
              const next = (cur === 'off') ? 'on' : 'off';
              localStorage.setItem('site-popups', next);
            }catch(e){}
            // ask popup controller to hide immediately if present
            try{ if(window._pagePopupController && typeof window._pagePopupController.hide === 'function') window._pagePopupController.hide(); }catch(e){}
            update();
          });
          // reflect external changes
          window.addEventListener('storage', (e)=>{ if(e.key === 'site-popups') update(); });
          update();
          if(created) document.body.appendChild(btn);
          if(btn.dataset) btn.dataset.bgInit = '1';
          // ensure both controls are hidden unless the user is at bottom
          let userScrolled = false;
          function checkBottomVisibility(){
            try{
              const scrollTop = window.scrollY || window.pageYOffset || document.documentElement.scrollTop;
              const viewportH = window.innerHeight || document.documentElement.clientHeight;
              const docH = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
              const diff = docH - (scrollTop + viewportH);
              const atEnd = (diff <= 2);
              // Only reveal controls if user has interacted by scrolling (prevents initial spawn)
              const shouldShow = atEnd && (userScrolled || scrollTop > 40);
              if(shouldShow) document.body.classList.add('bottom-controls-visible'); else document.body.classList.remove('bottom-controls-visible');
            }catch(e){}
          }
          // mark that the user has scrolled; check visibility on first scroll
          window.addEventListener('scroll', function onScroll(){ userScrolled = true; checkBottomVisibility(); }, { passive: true });
          window.addEventListener('resize', checkBottomVisibility);
          // run once now to set initial visibility (stays hidden until user scrolls)
          checkBottomVisibility();
        }catch(e){ /* ignore */ }
      })();
    }
  });

  // If the script is loaded after DOMContentLoaded, ensure bottom visibility is still tracked
  if (document.readyState !== 'loading') {
    try { const ev = new Event('DOMContentLoaded'); document.dispatchEvent(ev); } catch (e) {}
  }

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
