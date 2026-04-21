// popups.js — show a random popup image from the "pop ups" folder when user scrolls to bottom
(function(){
  const FOLDER = './pop ups/'; // folder created by user (supports space)
  const POLL_INTERVAL = 200; // ms while checking scroll
  const TRIGGER_THRESHOLD = 1; // px tolerance; <=1 treated as "at end"
  const POPUP_ID = 'page-popup-image';
  let popupCreated = false;
  let popupVisible = false;
  let popupEl = null;
  let chosenPopupSrc = null; // chosen for this page load
  let chosenPickPromise = null; // in-flight pick promise to serialize
  let lastHideAt = 0;
  const SHOW_COOLDOWN_MS = 600; // small cooldown after hide to avoid thrash

  // Confetti settings
  const CONFETTI_COUNT = 36;
  const CONFETTI_COLORS = ['#ffd700','#ff6b6b','#6bffb0','#6bd0ff','#d26bff'];
  const CONFETTI_DURATION = 1600; // ms

  // Embedded manifest (generated from pop ups/popups-manifest.json)
  const EMBED_MANIFEST = [
    "Abomination.png",
    "Alchemist.png",
    "Ambassador.png",
    "Ancient Wraith.png",
    "Architect.png",
    "arcs_egg.png",
    "Artificer.png",
    "Assassin.png",
    "Augur.png",
    "Automaton.png",
    "Beggar.png",
    "Believer.png",
    "Berserker.png",
    "BLIGHT.png",
    "Blight_Token.png",
    "Bomber.png",
    "Broker.png",
    "Cartographer.png",
    "Champion.png",
    "Chief.png",
    "Chosen.png",
    "Collector.png",
    "Composer.png",
    "Conduit.png",
    "Courier.png",
    "Creator.png",
    "Crusader.png",
    "Curator.png",
    "Custodian.png",
    "Despot.png",
    "Diplomat.png",
    "Dissector.png",
    "Doppelganger.png",
    "Dreamer.png",
    "Duelist.png",
    "Egoist.png",
    "Emperor.png",
    "Enchanter.png",
    "Enforcer.png",
    "Engineer.png",
    "Envoy.png",
    "Extortioner.png",
    "Feral.png",
    "Fiend.png",
    "Firebrand.png",
    "Forager.png",
    "Gambler.png",
    "General.png",
    "Ghost.png",
    "God's Hand.png",
    "Golem.png",
    "Harbormaster.png",
    "Hierarch.png",
    "Hustler.png",
    "Hydra.png",
    "Iconoclast.png",
    "Imperator.png",
    "Insurgent.png",
    "Investor.png",
    "Kaiju.png",
    "Magician.png",
    "Manipulator.png",
    "Marauder.png",
    "Martyr.png",
    "Maw.png",
    "Mediator.png",
    "Messiah.png",
    "Musician.png",
    "Necro.png",
    "Necromancer.png",
    "Nomad.png",
    "Ozymandias.png",
    "Paragon.png",
    "Phantom.png",
    "Pig.png",
    "Poet.png",
    "Prefect.png",
    "Prophet.png",
    "Punter.png",
    "Puppeteer.png",
    "Purist.png",
    "Racketeer.png",
    "Sage.png",
    "Saint.png",
    "Salvager.png",
    "Samurai.png",
    "Samurai2.png",
    "Samurai3.png",
    "Scavenger.png",
    "Schemer.png",
    "Scourge.png",
    "Screenshot_2026-01-21_at_10.39.19_AM-Photoroom.png",
    "Seeker.png",
    "Seer.png",
    "Sentient.png",
    "Sentinel.png",
    "Seraph.png",
    "Shaman.png",
    "Shapeshifter.png",
    "Siegebreaker.png",
    "Smuggler.png",
    "Snake.png",
    "Solian.png",
    "Solicitor.png",
    "Syndic.png",
    "Tactician.png",
    "Terraformer.png",
    "Terrestrial.png",
    "Titan.png",
    "Treasurer.png",
    "Tribune.png",
    "Trickster.png",
    "Underwriter.png",
    "Viceroy.png",
    "Warmonger.png",
    "Wayfinder.png",
    "Weaver.png",
    "Witch.png",
    "zz2.png",
    "zzz.png",
    "zzzz.png",
    "zzzzz1.png"
  ];

  function getRandomInt(min, max){ return Math.floor(Math.random() * (max - min + 1)) + min; }

  function listFilesGuess(){
    // We don't have server-side listing; try common names 1..20 and pick available ones by probing
    const candidates = [];
    for(let i=1;i<=20;i++){
      candidates.push(`background_popup${i}.png`);
      candidates.push(`popup${i}.png`);
      candidates.push(`popup (${i}).png`);
      candidates.push(`popup_${i}.png`);
    }
    return candidates;
  }

  function tryFetch(src){
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(src);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  async function pickOne(){
    // Use embedded manifest first (no runtime probing)
    try{
      if(Array.isArray(EMBED_MANIFEST) && EMBED_MANIFEST.length){
        const name = EMBED_MANIFEST[Math.floor(Math.random() * EMBED_MANIFEST.length)];
        const src = FOLDER + name;
        // try fetch to ensure file serves correctly, otherwise fall through
        const ok = await tryFetch(src);
        if(ok) return ok;
      }
    }catch(e){ /* ignore and fallback */ }

    // Fallback: try to load a manifest file placed in the folder (recommended)
    try{
      const manifestUrl = FOLDER + 'popups-manifest.json';
      const res = await fetch(manifestUrl, { cache: 'no-store' });
      if(res.ok){
        const list = await res.json();
        if(Array.isArray(list) && list.length){
          const name = list[Math.floor(Math.random() * list.length)];
          const src = FOLDER + name;
          const ok = await tryFetch(src);
          if(ok) return ok;
        }
      }
    }catch(e){ /* ignore and fallback */ }

    // Final fallback: try common name patterns (least preferred)
    const candidates = listFilesGuess().map(name => FOLDER + name);
    for(const c of candidates){
      const ok = await tryFetch(c);
      if(ok) return ok;
    }
    return null;
  }

  // ensure we pick only once per page load; serialize concurrent picks
  async function ensureChosenPopup(){
    if(chosenPopupSrc) return chosenPopupSrc;
    if(chosenPickPromise) return chosenPickPromise;
    chosenPickPromise = (async ()=>{
      try{
        const src = await pickOne();
        chosenPopupSrc = src || null;
        return chosenPopupSrc;
      }finally{
        chosenPickPromise = null;
      }
    })();
    return chosenPickPromise;
  }

  function prefersReducedMotion(){
    try{ return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){ return false; }
  }

  function launchConfetti(anchorEl){
    if(prefersReducedMotion()) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'popup-confetti-canvas';
    canvas.style.position = 'fixed';
    canvas.style.left = '0';
    canvas.style.top = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '10001';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    function resize(){ canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
    resize(); window.addEventListener('resize', resize);

    // spawn particles around anchor center (or center-top if no anchor)
    let ax = canvas.width/2, ay = canvas.height/2;
    if(anchorEl){
      const r = anchorEl.getBoundingClientRect();
      ax = r.left + r.width/2; ay = r.top + r.height/2;
    } else { ay = canvas.height*0.25; }

    const now = performance.now();
    const particles = [];
    for(let i=0;i<CONFETTI_COUNT;i++){
      const angle = (Math.PI * (0.25 + Math.random() * 1.5));
      const speed = 120 + Math.random()*220;
      particles.push({
        x: ax,
        y: ay,
        vx: Math.cos(angle)*speed/1000,
        vy: -Math.abs(Math.sin(angle))*speed/1000 - 0.1,
        size: 6 + Math.random()*8,
        color: CONFETTI_COLORS[Math.floor(Math.random()*CONFETTI_COLORS.length)],
        rot: Math.random()*Math.PI*2,
        trot: (Math.random()-0.5)*0.2
      });
    }

    function draw(t){
      const elapsed = t - now;
      ctx.clearRect(0,0,canvas.width,canvas.height);
      for(const p of particles){
        const life = Math.min(1, elapsed/CONFETTI_DURATION);
        const dx = p.vx * elapsed;
        const dy = p.vy * elapsed + 0.0008 * elapsed * elapsed; // gravity
        const x = p.x + dx; const y = p.y + dy;
        ctx.save();
        ctx.translate(x,y);
        ctx.rotate(p.rot + p.trot * elapsed/1000);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
        ctx.restore();
      }
      if(elapsed < CONFETTI_DURATION) requestAnimationFrame(draw);
      else { window.removeEventListener('resize', resize); if(canvas.parentNode) canvas.parentNode.removeChild(canvas); }
    }
    requestAnimationFrame(draw);
  }

  function hidePopup(){
    if(!popupEl) return;
    if(!popupVisible) return;
    // animate back down and fade
    try{
      popupEl.style.transform = popupEl.style.transform.replace(/translateY\(-?\d+px\)/, 'translateY(0)');
    }catch(e){
      popupEl.style.transform = 'translateX(-50%) translateY(0)';
    }
    popupEl.style.opacity = '0';
    popupVisible = false;
    // remove element after transition
    setTimeout(()=>{
      if(popupEl && popupEl.parentNode) popupEl.parentNode.removeChild(popupEl);
      popupEl = null;
    }, 500);
  }

  function createPopupEl(src){
    // remove existing
    const existing = document.getElementById(POPUP_ID);
    if(existing) existing.remove();
    const img = document.createElement('img');
    img.id = POPUP_ID;
    img.src = src;
    img.alt = '';
    img.className = 'page-popup';
    // random horizontal position along bottom (10%..90%)
    const leftPct = 10 + Math.random() * 80;
    img.style.left = leftPct + '%';
    // initial inline state: not visible and no bottom yet
    img.style.transform = 'translateX(-50%) translateY(0)';
    img.style.opacity = '0';
    document.body.appendChild(img);
    popupEl = img;
    // when image loads, compute crop so bottom is tucked under viewport and animate up
    img.onload = () => {
      // compute based on rendered/displayed height so CSS scaling is considered
      requestAnimationFrame(()=>{
        try{
          const rect = img.getBoundingClientRect();
          const dispH = rect.height || (img.naturalHeight || img.height || 200);
          // desired tuck ~10% ±2%
          const desiredPct = 0.10 + (Math.random() * 0.04 - 0.02);
          const crop = Math.max(6, Math.round(dispH * desiredPct));
          img.style.bottom = `-${crop}px`;
          // small rise so a little less than the full crop remains hidden (keep ~85-95% of crop hidden)
          const smallRise = Math.max(4, Math.round(crop * 0.15));
          img.style.willChange = 'transform, opacity';
          img.style.transform = `translateX(-50%) translateY(0)`;
          // animate to the lifted position
          requestAnimationFrame(()=>{
            img.style.transform = `translateX(-50%) translateY(-${smallRise}px)`;
            img.style.opacity = '1';
            popupVisible = true;
            try{ if(/Pig/i.test(src)) launchConfetti(popupEl); }catch(e){}
          });
        }catch(e){
          // fallback: small tuck
          requestAnimationFrame(()=>{
            img.style.bottom = '-20px';
            img.style.transform = 'translateX(-50%) translateY(-10px)';
            img.style.opacity = '1';
            popupVisible = true;
            try{ if(/Pig/i.test(src)) launchConfetti(popupEl); }catch(e){}
          });
        }
      });
    };
    img.onerror = () => { setTimeout(()=>{ if(img && img.parentNode) img.parentNode.removeChild(img); }, 300); };
  }

  function init(){
    // add minimal styles to page if not present
    if(!document.getElementById('popups-style')){
      const style = document.createElement('style');
      style.id = 'popups-style';
      style.textContent = `
        .page-popup{ position:fixed; bottom:0; /* bottom will be adjusted per-image */
          width:auto; max-width:22vw; max-height:12vh; height:auto; left:50%; transform:translateX(-50%) translateY(0);
          transition: transform 420ms cubic-bezier(.22,.9,.35,1), opacity 320ms; opacity:0;
          pointer-events:none; z-index: 9999; object-fit:contain; }
        @media (max-width:600px){ .page-popup{ max-width:36vw; max-height:16vh; } }
      `;
      document.head.appendChild(style);
    }

    // check scroll to bottom (show popup) and hide when user scrolls up
    let checkTimer = null;
    function onScrollCheck(){
      const scrollTop = window.scrollY || window.pageYOffset || document.documentElement.scrollTop;
      const viewportH = window.innerHeight || document.documentElement.clientHeight;
      const docH = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
      const diff = docH - (scrollTop + viewportH);
      const atEnd = (diff <= TRIGGER_THRESHOLD);

      if(atEnd){
        // show if not visible and not in cooldown
        if(!popupVisible){
          const now = Date.now();
          if(now - lastHideAt < SHOW_COOLDOWN_MS) return; // still cooling down
          ensureChosenPopup().then(src => {
            if(src) createPopupEl(src);
          });
        }
      } else {
        // hide if visible and user scrolled up
        if(popupVisible){
          hidePopup();
          lastHideAt = Date.now();
        }
      }
    }
    window.addEventListener('scroll', onScrollCheck);
    // also poll in case no scroll occurs (user lands at bottom)
    checkTimer = setInterval(onScrollCheck, POLL_INTERVAL);
  }

  // init when DOM ready
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

})();
