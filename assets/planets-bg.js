(function(){
  // planets overlay renderer
  const PLANET_COUNT_MIN = 7;
  const PLANET_COUNT_MAX = 14;
  const TOTAL_VARIANTS = 15; // expected planet images in folder: ../background planets/background_planet (1).png ... (15)
  // We'll attempt filename patterns to match files like:
  //   background_planet (1).png  (preferred)
  //   background_planet1.png     (fallback)
  const IMAGE_BASE = '../background planets/background_planet';
  const IMAGE_SUFFIX = '.png';
  let canvas, ctx, resizeTimer;

  function createCanvas(){
    removeCanvas();
    canvas = document.createElement('canvas');
    canvas.id = 'planets-overlay-canvas';
    canvas.style.position = 'fixed';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '0';
    document.body.appendChild(canvas);
    // ensure container content stacks above
    fitCanvas();
    ctx = canvas.getContext('2d');
  }

  function fitCanvas(){
    if(!canvas) return;
    canvas.width = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    canvas.height = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
  }

  function removeCanvas(){
    const old = document.getElementById('planets-overlay-canvas');
    if(old && old.parentNode) old.parentNode.removeChild(old);
    canvas = null; ctx = null;
  }

  function pickRandomPlanets(){
    // Weighted choice for number of planets: most likely is PLANET_COUNT_MIN,
    // then decreasing probability for larger counts (geometric decay).
    const decay = 0.5; // smaller => steeper drop (0.5 gives rare max)
    const weights = [];
    let total = 0;
    for(let k = PLANET_COUNT_MIN; k <= PLANET_COUNT_MAX; k++){
      const w = Math.pow(decay, k - PLANET_COUNT_MIN);
      weights.push(w);
      total += w;
    }
    const r = Math.random() * total;
    let acc = 0;
    let chosenCount = PLANET_COUNT_MIN;
    for(let i = 0; i < weights.length; i++){
      acc += weights[i];
      if(r <= acc){ chosenCount = PLANET_COUNT_MIN + i; break; }
    }

    const picks = new Set();
    const maxVariants = Math.max(1, TOTAL_VARIANTS);
    while(picks.size < chosenCount){
      const n = Math.floor(Math.random() * maxVariants) + 1;
      picks.add(n);
      if(picks.size >= maxVariants) break; // don't loop forever if variants fewer than count
    }
    return Array.from(picks);
  }

  function tryLoadSrc(src){
    return new Promise(resolve => {
      const img = new Image();
      let settled = false;
      img.onload = () => { if(!settled){ settled = true; resolve(img); } };
      img.onerror = () => { if(!settled){ settled = true; resolve(null); } };
      // set a short timeout in case loading hangs
      setTimeout(() => { if(!settled){ settled = true; resolve(null); } }, 3000);
      img.src = src;
    });
  }

  function loadImageForIndex(i){
    // Try common filename variants in order
    const candidates = [
      `${IMAGE_BASE} (${i})${IMAGE_SUFFIX}`,
      `${IMAGE_BASE}%20(${i})${IMAGE_SUFFIX}`,
      `${IMAGE_BASE}${i}${IMAGE_SUFFIX}`
    ];
    // try each sequentially until one loads
    return candidates.reduce((p, src) => p.then(found => found ? found : tryLoadSrc(src)), Promise.resolve(null));
  }

  function loadImages(indices){
    return Promise.all(indices.map(i => loadImageForIndex(i)));
  }

  function render(){
    if(!document.body.classList.contains('bg-planets')){
      removeCanvas();
      return;
    }
    createCanvas();
    fitCanvas();
    const picks = pickRandomPlanets();
    loadImages(picks).then(images => {
      if(!ctx) return;
      ctx.clearRect(0,0,canvas.width,canvas.height);
      // Place planets with collision avoidance and much smaller sizes
      const maxDim = Math.min(canvas.width, canvas.height);
      const placed = [];
      const margin = Math.max(8, Math.floor(maxDim * 0.01)); // small gap between planets

      const usedImages = [];
      let topPlaced = false;
      const topThreshold = canvas.height * 0.12; // top 12% of viewport

      images.forEach(img => {
        if(!img) return;
        // target diameter as fraction of the smaller canvas dimension (small planets)
        const diameter = maxDim * (0.04 + Math.random() * 0.06); // 4% - 10%
        const ratio = img.width / img.height;
        const drawH = diameter;
        const drawW = diameter * ratio;
        const radius = Math.max(drawW, drawH) / 2;

        // try to find a non-overlapping position
        let attempts = 0;
        let placedPos = null;
        while(attempts < 300 && !placedPos){
          attempts++;
          const x = Math.random() * (canvas.width - drawW);
          const y = Math.random() * (canvas.height - drawH);
          const cx = x + drawW/2;
          const cy = y + drawH/2;
          let ok = true;
          for(const p of placed){
            const dx = cx - p.cx;
            const dy = cy - p.cy;
            const dist2 = dx*dx + dy*dy;
            const minDist = radius + p.radius + margin;
            if(dist2 < (minDist * minDist)) { ok = false; break; }
          }
          if(ok){ placedPos = { x, y, cx, cy, radius }; break; }
        }

        if(placedPos){
          placed.push(placedPos);
          usedImages.push(img);
          if(placedPos.y <= topThreshold) topPlaced = true;
          ctx.save();
          // randomize brightness per planet (35% - 75% opacity)
          const alpha = 0.35 + Math.random() * 0.4;
          ctx.globalAlpha = alpha;
          ctx.drawImage(img, placedPos.x, placedPos.y, drawW, drawH);
          ctx.restore();
        }
        // if not placed after attempts, skip this planet
      });

      // Ensure at least one planet near the top
      if(!topPlaced){
        // choose an image not yet used if possible
        let candidateImg = images.find(img => img && !usedImages.includes(img));
        if(!candidateImg) candidateImg = images.find(img => img);
        if(candidateImg){
          const img = candidateImg;
          const diameter = maxDim * (0.04 + Math.random() * 0.06);
          const ratio = img.width / img.height;
          const drawH = diameter;
          const drawW = diameter * ratio;
          const radius = Math.max(drawW, drawH) / 2;

          let attempts = 0;
          let placedPos = null;
          const topMin = Math.max(8, Math.floor(canvas.height * 0.02));
          const topMax = Math.max(topMin + 1, Math.floor(canvas.height * 0.12));
          while(attempts < 500 && !placedPos){
            attempts++;
            const x = Math.random() * (canvas.width - drawW);
            const y = topMin + Math.random() * (topMax - topMin);
            const cx = x + drawW/2;
            const cy = y + drawH/2;
            let ok = true;
            for(const p of placed){
              const dx = cx - p.cx;
              const dy = cy - p.cy;
              const dist2 = dx*dx + dy*dy;
              const minDist = radius + p.radius + margin;
              if(dist2 < (minDist * minDist)) { ok = false; break; }
            }
            if(ok){ placedPos = { x, y, cx, cy, radius }; break; }
          }
          if(placedPos){
            placed.push(placedPos);
            ctx.save();
            // randomize brightness for top-placed planet as well
            const alphaTop = 0.35 + Math.random() * 0.4;
            ctx.globalAlpha = alphaTop;
            ctx.drawImage(img, placedPos.x, placedPos.y, drawW, drawH);
            ctx.restore();
          }
        }
      }
    });
  }

  function scheduleRender(){
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(render, 150);
  }

  // Watch for storage and class changes
  function onStorage(e){
    if(e.key === 'site-bg'){
      if(e.newValue === 'planets') render(); else removeCanvas();
    }
  }

  function onDom(){
    const current = (function(){ try { return localStorage.getItem('site-bg'); } catch(e){ return null; } })();
    if(current === 'planets') render();
  }

  window.addEventListener('storage', onStorage);
  window.addEventListener('resize', scheduleRender);
  document.addEventListener('DOMContentLoaded', onDom);
  // If the script is loaded after DOMContentLoaded, run init immediately
  if (document.readyState !== 'loading') {
    try { onDom(); } catch (e) { /* ignore */ }
  }

  // also observe class changes on body to react to programmatic switches
  const observer = new MutationObserver(muts => {
    for(const m of muts){
      if(m.attributeName === 'class'){
        if(document.body.classList.contains('bg-planets')) render(); else removeCanvas();
      }
    }
  });
  observer.observe(document.body, { attributes: true });

})();
