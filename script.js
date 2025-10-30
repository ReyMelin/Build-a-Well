(() => {
  // =======================================================
  // Build-a-Well — main game script
  // Sections:
  //  - Constants
  //  - Runtime config & presets
  //  - State
  //  - DOM references
  //  - Helper formatters
  //  - UI update helpers
  //  - Map rendering & spot handling
  //  - Fundraising / digging
  //  - Contamination scheduling
  //  - Wiring & initialization
  // =======================================================
  // Constants (keep as base values for presets)
  const INITIAL_FUNDS_USD = 80000;         // start with $80,000
  const WELL_COST_USD = 20000;             // one well costs $20,000
  const LIVES_PER_WELL = 500;              // one well saves 500 lives
  const AUTO_FUND_AMOUNT_USD = 15000;      // automatic fundraising amount
  const AUTO_FUND_INTERVAL_SEC = 60;       // every 60 seconds
  const DIG_PROFIT_USD = 20000;            // dig completion reward
  const CLEAN_COST_USD = 10000;           // cost to clean a toxic well
  const EXCHANGE_RATE_USD_TO_EUR = 0.92;   // USD→EUR rate (adjust if needed)
  const TOTAL_LIVES_AT_RISK = 10000;      // goal: save 10,000 people
  const MAP_SPOT_COUNT = 24;               // number of map spots
  const CONTAM_MIN_SEC = 20;              // earliest contamination after start (seconds)
  const CONTAM_MAX_SEC = 90;              // latest contamination delay (seconds)
  const CONTAM_WARNING_MS = 500;         // show warning duration (ms)

  // runtime-config (will be set based on difficulty)
  // --- SECTION: Runtime configuration (defaults, overridable by difficulty) ---
  let runtime = {
    startFunds: INITIAL_FUNDS_USD,
    wellCost: WELL_COST_USD,
    livesPerWell: LIVES_PER_WELL,
    autoFundAmount: AUTO_FUND_AMOUNT_USD,
    autoFundInterval: AUTO_FUND_INTERVAL_SEC,
    digProfit: DIG_PROFIT_USD,
    cleanCost: CLEAN_COST_USD,
    contamMin: CONTAM_MIN_SEC,
    contamMax: CONTAM_MAX_SEC
  };

  // Difficulty presets (tweak multipliers / values per difficulty)
  // --- SECTION: Difficulty presets ---
  const DIFFICULTY_PRESETS = {
    Easy: {
      startFunds: Math.round(INITIAL_FUNDS_USD * 1.5),
      wellCost: Math.round(WELL_COST_USD * 0.9),
      livesPerWell: LIVES_PER_WELL,
      autoFundAmount: Math.round(AUTO_FUND_AMOUNT_USD * 1.25),
      autoFundInterval: AUTO_FUND_INTERVAL_SEC,
      digProfit: Math.round(DIG_PROFIT_USD * 1.1),
      cleanCost: Math.round(CLEAN_COST_USD * 0.8),
      contamMin: Math.round(CONTAM_MIN_SEC * 1.6),
      contamMax: Math.round(CONTAM_MAX_SEC * 1.6)
    },
    Hard: {
      // base/default
      startFunds: INITIAL_FUNDS_USD,
      wellCost: WELL_COST_USD,
      livesPerWell: LIVES_PER_WELL,
      autoFundAmount: AUTO_FUND_AMOUNT_USD,
      autoFundInterval: AUTO_FUND_INTERVAL_SEC,
      digProfit: DIG_PROFIT_USD,
      cleanCost: CLEAN_COST_USD,
      contamMin: CONTAM_MIN_SEC,
      contamMax: CONTAM_MAX_SEC
    },
    Difficult: {
      startFunds: Math.round(INITIAL_FUNDS_USD * 0.6),
      wellCost: Math.round(WELL_COST_USD * 1.2),
      livesPerWell: LIVES_PER_WELL,
      autoFundAmount: Math.round(AUTO_FUND_AMOUNT_USD * 0.6),
      autoFundInterval: AUTO_FUND_INTERVAL_SEC,
      digProfit: Math.round(DIG_PROFIT_USD * 0.8),
      cleanCost: Math.round(CLEAN_COST_USD * 1.3),
      contamMin: Math.round(CONTAM_MIN_SEC * 0.6),
      contamMax: Math.round(CONTAM_MAX_SEC * 0.6)
    }
  };

  // --- SECTION: Mutable game state ---
  // State (defer funds initialization until difficulty chosen)
  let fundsUsd = null;
  let livesSaved = 0;
  let currency = 'USD';
  let countdown = AUTO_FUND_INTERVAL_SEC;
  let digProgress = 0;
  let autoFundTimer = null;
  let fundraiseLocked = false;
  let confettiLaunched = false;
  let firstWellBuilt = false;
  let spots = [];
  let contaminationTimeout = null;
  let statusTimeout = null; // used by setStatus to auto-clear status messages
  let activeWarningEl = null;

  // --- SECTION: DOM references ---
  // Tolerant lookups for multiple possible IDs; allow missing elements so script is resilient
  const fundsEl = document.getElementById('funds') || document.getElementById('fundsLabel') || null;
  const livesEl = document.getElementById('lives') || document.getElementById('livesSaved') || null;
  const wellsEl = document.getElementById('wells') || null;
  const buildBtn = document.getElementById('buildBtn') || null;
  const digBtn = document.getElementById('digBtn') || null;
  const progressBarEl = document.getElementById('progressBar') || null;
  const villagerProgressEl = document.getElementById('villagerProgress') || document.getElementById('impactProgress') || null;
  const villagerProgressLabel = document.getElementById('villagerProgressLabel') || document.getElementById('impactProgressLabel') || null;
  const statusEl = document.getElementById('status') || null;
  const resetBtn = document.getElementById('resetBtn') || null;
  const mapEl = document.getElementById('map') || null;
  // explicit currency UI pieces
  const currencySymbolEl = document.getElementById('currencySymbol') || null;
  const fundsLabelEl = document.getElementById('fundsLabel') || null;
  const currencyEmojiEl = document.getElementById('currencyEmoji') || null;
  const fundsStatEl = document.getElementById('fundsStat') || null;
  const difficultyModal = document.getElementById('difficultyModal') || null;
  const easyBtn = document.getElementById('easyBtn') || null;
  const hardBtn = document.getElementById('hardBtn') || null;
  const difficultBtn = document.getElementById('difficultBtn') || null;

  // Helper: format currency based on selected currency
  // full formatted string including symbol (use in messages)
  // --- SECTION: Helper formatters ---
  function formatCurrencyFull(amountUsd) {
    if (currency === 'USD') {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amountUsd);
    } else {
      const eur = amountUsd * EXCHANGE_RATE_USD_TO_EUR;
      return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(eur);
    }
  }
  // numeric part only (no symbol) used for HUD numeric element + separate symbol element
  function formatCurrencyNumber(amountUsd) {
    if (currency === 'USD') {
      return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(amountUsd);
    } else {
      const eur = amountUsd * EXCHANGE_RATE_USD_TO_EUR;
      return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(eur);
    }
  }

  // UI updates (use runtime values where needed)
  // --- SECTION: UI update helpers ---
  // Unified status helper: shows a message for a consistent duration.
  // Pass durationMs = 0 to keep the message until explicitly changed.
  function setStatus(message, durationMs = 2500) {
    if (!statusEl) return;
    statusEl.textContent = message;
    if (statusTimeout) { clearTimeout(statusTimeout); statusTimeout = null; }
    if (durationMs > 0) {
      statusTimeout = setTimeout(() => { if (statusEl) statusEl.textContent = ''; statusTimeout = null; }, durationMs);
    }
  }
  function updateFundsDisplay() {
    if (fundsEl) fundsEl.textContent = formatCurrencyNumber(fundsUsd);
    if (currencySymbolEl) currencySymbolEl.textContent = currency === 'USD' ? '$' : '€';
    if (fundsLabelEl) fundsLabelEl.textContent = currency === 'USD' ? 'USD' : 'EUR';
    if (currencyEmojiEl) currencyEmojiEl.textContent = currency === 'USD' ? '💵' : '💶';
    const hudTarget = fundsStatEl || fundsEl;
    if (hudTarget) {
      if (Number(fundsUsd) <= 0) {
        hudTarget.classList.add('flash-red');
        // remove class after animation completes to allow future flashes
        setTimeout(() => { hudTarget.classList.remove('flash-red'); }, 1100);
      } else {
        hudTarget.classList.remove('flash-red');
      }
    }
  }

  function updateWellCostDisplay() {
    // update currency symbol/emoji only; there is no wellCostDisplay element in markup
    if (currencySymbolEl) currencySymbolEl.textContent = currency === 'USD' ? '$' : '€';
    if (currencyEmojiEl) currencyEmojiEl.textContent = currency === 'USD' ? '💵' : '💶';
  }
  function updateLivesDisplay() {
    if (livesEl) livesEl.textContent = String(livesSaved);
    if (wellsEl) wellsEl.textContent = String(Math.floor(livesSaved / runtime.livesPerWell));
    if (villagerProgressEl) {
      const progressRatio = Math.min(livesSaved / TOTAL_LIVES_AT_RISK, 1);
      villagerProgressEl.style.width = `${progressRatio * 100}%`;
    }
    if (villagerProgressLabel) {
      const still = Math.max(TOTAL_LIVES_AT_RISK - livesSaved, 0);
      villagerProgressLabel.textContent = `${still} lives still at risk`;
      // celebrate when no one remains at risk
      if (still === 0 && !confettiLaunched) {
        confettiLaunched = true;
        endGame();
      } else if (still > 0) {
        // allow re-trigger on future completion after reset/growth
        confettiLaunched = false;
      }
    }
  }
  // --- SECTION: Lifecycle helpers (timers/cleanup) ---
  // stop timers/intervals used by the simulation
  function stopAll() {
    if (autoFundTimer) { clearInterval(autoFundTimer); autoFundTimer = null; }
    if (contaminationTimeout) { clearTimeout(contaminationTimeout); contaminationTimeout = null; }
  }

  // end the game: stop background activity, fire confetti and overlay victory message
  function endGame() {
    stopAll();
    launchConfetti();

    if (!mapEl) return;
    if (mapEl.querySelector('.victory-overlay')) return;

    const overlay = document.createElement('div');
    overlay.className = 'victory-overlay';

    const message = document.createElement('div');
    message.className = 'victory-message';
    message.innerHTML = `<h1 class="disco-text">You Saved ${TOTAL_LIVES_AT_RISK.toLocaleString()} Lives!!!</h1>
                         <p class="victory-sub">Thank you — your efforts made a life-saving difference.</p>`;

    const restart = document.createElement('button');
    restart.className = 'victory-restart';
    restart.textContent = 'Restart Simulation';
    restart.addEventListener('click', () => {
      // remove overlay then reset game
      if (overlay && overlay.parentElement) overlay.parentElement.removeChild(overlay);
      confettiLaunched = false;
      resetGame();
    });

    message.appendChild(restart);
    overlay.appendChild(message);
    mapEl.appendChild(overlay);
  }

  function resetProgressBar() {
    digProgress = 0;
    if (progressBarEl) progressBarEl.style.width = '0%';
  }

  // create and launch confetti pieces from bottom of the viewport
  function launchConfetti() {
    const colors = ['#FFC907', '#2E9DF7', '#4FCB53', '#FF902A', '#F5402C', '#8BD1CB'];
    const container = document.createElement('div');
    container.className = 'confetti-container';
    document.body.appendChild(container);

    const pieces = 40;
    for (let i = 0; i < pieces; i++) {
      const piece = document.createElement('span');
      piece.className = 'confetti-piece';
      const left = Math.random() * 100;
      const size = 6 + Math.random() * 12;
      const color = colors[Math.floor(Math.random() * colors.length)];
      const duration = 1200 + Math.random() * 1200; // ms
      const delay = Math.random() * 300; // ms
      Object.assign(piece.style, {
        left: `${left}%`,
        width: `${size}px`,
        height: `${Math.max(6, size * 1.2)}px`,
        background: color,
        transform: `rotate(${Math.floor(Math.random() * 360)}deg)`,
        animationDuration: `${duration}ms`,
        animationDelay: `${delay}ms`
      });
      container.appendChild(piece);
    }

    setTimeout(() => {
      if (container && container.parentElement) container.parentElement.removeChild(container);
    }, 3000);
  }
  // --- SECTION: Map rendering & spot placement ---
  // Map rendering (creates map image, spots wrapper and positions clickable spots)
  function renderMap() {
    // clear and prepare container
    if (!mapEl) return;
    mapEl.innerHTML = '';
    mapEl.style.position = 'relative';
    mapEl.style.overflow = 'hidden';
    mapEl.classList.remove('spots-visible'); // hide spots by default

    // create map image element
    const img = document.createElement('img');
    img.id = 'mapImg';
    img.src = 'Timbuktu map.png';
    img.alt = 'Timbuktu map';
    img.crossOrigin = 'anonymous';
    // let the CSS rule handle sizing; keep the image positioned to fully cover the container
    img.style.display = 'block';
    img.style.position = 'absolute';
    img.style.inset = '0';
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';
    img.style.zIndex = '1';
    mapEl.appendChild(img);
    
    // create a wrapper that sits above the image so spots are visible and clickable
    const spotsWrapper = document.createElement('div');
    Object.assign(spotsWrapper.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      zIndex: '6',
      pointerEvents: 'none' // enable per-spot pointer events
    });
    mapEl.appendChild(spotsWrapper);

    // when image has measured size, place spots using percent positions
    img.onload = () => {
      // place spots with minimum spacing so they don't overlap and remain clickable
      spots = [];
      const placed = [];
      const MIN_DIST = 0.08; // normalized (0..1) minimum distance between spots (~8% of map)
      const MAX_ATTEMPTS = 60;
      for (let i = 0; i < MAP_SPOT_COUNT; i++) {
        // before the first well is built, force all spots to be dry (hidden) so no prebuilt wells appear
        const isDry = firstWellBuilt ? (Math.random() < 0.9) : true;
        const status = isDry ? 'dry' : 'wet';
        spots.push({ status });

        // find a position not too close to existing spots
        let x, y, ok = false, attempts = 0;
        while (!ok && attempts < MAX_ATTEMPTS) {
          x = 0.05 + Math.random() * 0.9; // avoid extreme edges
          y = 0.05 + Math.random() * 0.9;
          ok = true;
          for (const p of placed) {
            const dx = x - p.x, dy = y - p.y;
            if ((dx * dx + dy * dy) < (MIN_DIST * MIN_DIST)) {
              ok = false;
              break;
            }
          }
          attempts++;
        }
        // if can't find spaced position, accept the last random one
        placed.push({ x, y });

        const spot = document.createElement('div');
        spot.className = `spot ${status}`;
        spot.dataset.index = String(i);
        Object.assign(spot.style, {
          position: 'absolute',
          left: `${Math.round(x * 100)}%`,
          top: `${Math.round(y * 100)}%`,
          width: '48px',
          height: '48px',
          transform: 'translate(-50%, -50%)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '6px',
          boxSizing: 'border-box',
          cursor: status === 'dry' ? 'pointer' : 'default',
          border: 'none',
          userSelect: 'none',
          pointerEvents: 'auto',
          background: 'transparent',
          visibility: status === 'dry' ? 'hidden' : 'visible'
        });

        spot.title = status === 'dry' ? 'Dry area — click to build a well' : 'Wet area';
        const icon = document.createElement('img');
        icon.alt = status === 'dry' ? 'dirt' : 'water';
        icon.src = status === 'dry' ? 'Dirt Icon.png' : 'Clean clear drop.png';
        Object.assign(icon.style, { width: '36px', height: '36px', display: 'block', pointerEvents: 'none' });
        spot.appendChild(icon);

        if (status === 'dry') {
          spot.style.visibility = 'hidden';
          spot.removeAttribute('data-revealed');
          spot.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (spot.hasAttribute('data-revealed')) {
              onSpotClick(parseInt(spot.dataset.index, 10), spot);
            }
          });
        }
        spotsWrapper.appendChild(spot);
      }
    };

    // if image already cached/complete, trigger onload logic immediately
    if (img.complete) {
      img.onload && img.onload();
    }
  }

  // Spot click handler: use runtime values for costs and lives
  // --- SECTION: Spot interaction handler ---
  // Handles clicks on spots (build well / clean toxic wells)
  function onSpotClick(index, spotEl) {
    const spot = spots[index];
    if (!spot) return;
    if (spot.status === 'dry' && spotEl && !spotEl.hasAttribute('data-revealed')) {
        setStatus('This spot is still buried — dig to reveal it first.', 2500);
      return;
    }

    if (spot.status === 'toxic') {
      if (fundsUsd < runtime.cleanCost) {
  setStatus(`Not enough funds to clean — need ${formatCurrencyFull(runtime.cleanCost)}.`, 3000);
        flashFunds();
        return;
      }
      fundsUsd -= runtime.cleanCost;
      spot.status = 'well';
      if (spotEl) {
        const img = spotEl.querySelector('img');
        if (img) {
          img.src = 'Clean clear drop.png';
          img.alt = 'well';
          img.style.filter = '';
        }
        spotEl.classList.remove('toxic');
          Array.from(spotEl.querySelectorAll('span')).forEach(s => {
            if (s.textContent && /[☣☠]/.test(s.textContent)) s.remove();
          });
  spotEl.title = 'Well cleaned';
  // ensure cursor returns to default after cleaning so hover doesn't show pointer
  spotEl.style.cursor = 'default';
      }
      livesSaved = Math.min(TOTAL_LIVES_AT_RISK, livesSaved + runtime.livesPerWell);
      updateFundsDisplay();
      updateLivesDisplay();
      setStatus(`Cleaned toxic well — ${formatCurrencyFull(runtime.cleanCost)} spent. ${runtime.livesPerWell} lives protected again.`, 3000);
      setTimeout(() => { setStatus('Tap the dirt spots to build more wells!', 2500); }, 3000);
      return;
    }

    if (spot.status !== 'dry') {
  setStatus('You can only build on dry areas.', 2500);
      return;
    }
    if (fundsUsd < runtime.wellCost) {
  setStatus(`Not enough funds. Please fundraise before building a well!`, 3000);
      flashFunds();
      return;
    }
    fundsUsd -= runtime.wellCost;
    spot.status = 'well';
    if (!firstWellBuilt) firstWellBuilt = true;
    if (spotEl) {
      spotEl.innerHTML = '';
      const wellImg = document.createElement('img');
      wellImg.src = 'Clean clear drop.png';
      wellImg.alt = 'well';
      Object.assign(wellImg.style, {
        width: '36px',
        height: '36px',
        display: 'block',
        pointerEvents: 'none'
      });
      spotEl.appendChild(wellImg);
      spotEl.title = 'Well built';
      spotEl.style.cursor = 'default';
    }
    livesSaved += runtime.livesPerWell;
    updateFundsDisplay();
    updateLivesDisplay();
    setStatus(`Built a well — ${runtime.livesPerWell} lives helped.`, 3000);
    setTimeout(() => { setStatus('Tap the dirt spots to build more wells!', 2500); }, 3000);
  }

  let digClicks = 0;
  // --- SECTION: Digging / revealing spots ---
  function revealSpots() {
    if (!mapEl) return;
    digClicks++;
    if (digClicks < 3) {
  setStatus(`Digging... ${Math.round((digClicks / 3) * 100)}%`, 0);
      return;
    }
    digClicks = 0;
    if (!mapEl.classList.contains('spots-visible')) mapEl.classList.add('spots-visible');
    const allSpots = mapEl.querySelectorAll('.spot.dry');
    const hiddenSpots = Array.from(allSpots).filter(
      spot => !spot.hasAttribute('data-revealed')
    );
    if (hiddenSpots.length === 0) {
  setStatus('No more diggable spots!', 2500);
      return;
    }
    const revealSpot = hiddenSpots[Math.floor(Math.random() * hiddenSpots.length)];
    revealSpot.style.visibility = 'visible';
    revealSpot.setAttribute('data-revealed', 'true');
  setStatus('Build a well!', 2500);
  }

  // --- SECTION: Fundraising progress (buildBtn action) ---
  function startFundraiseProgress() {
    if (fundraiseLocked) return;
    digProgress = Math.min(digProgress + 10, 100);
    if (progressBarEl) progressBarEl.style.width = `${digProgress}%`;
    if (digProgress < 100) {
  setStatus(`Fundraising... ${digProgress}%`, 0);
      return;
    }
    fundraiseLocked = true;
  setStatus(`Fantastic! You have raised ${formatCurrencyFull(runtime.digProfit)}!`, 3000);
    fundsUsd += runtime.digProfit;
    updateFundsDisplay();
    setTimeout(() => {
      digProgress = 0;
      if (progressBarEl) progressBarEl.style.width = '0%';
      fundraiseLocked = false;
  setStatus('Dig to open the ground.', 0);
    }, 1500);
  }

  function resetGame() {
    fundsUsd = runtime.startFunds;
    livesSaved = 0;
    currency = 'USD';
    firstWellBuilt = false;
    // currency toggle element removed from markup; HUD will update via updateFundsDisplay()
    updateFundsDisplay();
    updateWellCostDisplay();
    updateLivesDisplay();
    resetProgressBar();
  setStatus('Game reset. Dig to open the ground.', 0);
    // remove victory overlay if present
    if (mapEl) {
      const ov = mapEl.querySelector('.victory-overlay');
      if (ov && ov.parentElement) ov.parentElement.removeChild(ov);
    }
    confettiLaunched = false;
    // clear contamination state
    if (contaminationTimeout) { clearTimeout(contaminationTimeout); contaminationTimeout = null; }
    if (activeWarningEl && activeWarningEl.parentElement) activeWarningEl.parentElement.removeChild(activeWarningEl);
    activeWarningEl = null;
    renderMap();
    startAutoFundTimer();
    scheduleContamination();
  }
  // --- SECTION: Contamination scheduling & warnings ---

  function scheduleContamination() {
    if (!mapEl) return;
    if (contaminationTimeout) clearTimeout(contaminationTimeout);
    const delay = Math.floor((Math.random() * (runtime.contamMax - runtime.contamMin) + runtime.contamMin) * 1000);
    contaminationTimeout = setTimeout(() => {
      triggerContamination();
    }, delay);
  }

  // show a temporary warning banner
  function showContaminationWarning(text) {
    if (!mapEl) return;
    // remove existing
    if (activeWarningEl && activeWarningEl.parentElement) activeWarningEl.parentElement.removeChild(activeWarningEl);
    const el = document.createElement('div');
    el.className = 'contamination-warning';
    el.textContent = text || 'Water is contaminated!';
    mapEl.appendChild(el);
    activeWarningEl = el;
    setTimeout(() => {
      if (activeWarningEl && activeWarningEl.parentElement) activeWarningEl.parentElement.removeChild(activeWarningEl);
      activeWarningEl = null;
    }, CONTAM_WARNING_MS);
  }

  // pick a built well and make it toxic, adjust lives at risk
  function triggerContamination() {
    // find built wells
    const builtIndices = [];
    for (let i = 0; i < spots.length; i++) {
      if (spots[i] && spots[i].status === 'well') builtIndices.push(i);
    }
    if (builtIndices.length === 0) {
      // no wells yet — try again later
      scheduleContamination();
      return;
    }

    // choose a random built well
    const chosen = builtIndices[Math.floor(Math.random() * builtIndices.length)];
    spots[chosen].status = 'toxic';

    // find its DOM element
    let spotEl = null;
    // try both data-index and wrapper search
    if (mapEl) spotEl = mapEl.querySelector(`[data-index="${chosen}"]`);

    if (spotEl) {
      spotEl.classList.add('toxic');
      // If this was a built well, replace the clean water icon with a toxic icon.
      const img = spotEl.querySelector('img');
      const wasWell = spots[chosen] && spots[chosen].status === 'toxic' || spotEl.classList.contains('toxic');
      if (img) {
        // Prefer swapping the image file to a toxic variant if available
        try {
          img.src = 'Toxic water.png';
          img.alt = 'toxic water';
        } catch (e) {
          // if swapping fails, fall back to tint + marker
          img.style.filter = 'hue-rotate(-30deg) saturate(0.4) brightness(0.9)';
        }
        // overlay a small hazard mark to make contamination obvious
        const mark = document.createElement('span');
        mark.textContent = '☣';
        Object.assign(mark.style, {
          position: 'absolute', right: '-6px', top: '-6px', color: '#ff4d4d', fontSize: '14px', pointerEvents: 'none'
        });
        spotEl.appendChild(mark);
        // make toxic wells clickable/interactive like other spots
        spotEl.title = 'Toxic well — click to clean';
        spotEl.style.cursor = 'pointer';
      } else {
        // fallback: change background
        spotEl.style.background = 'rgba(200,40,40,0.12)';
        spotEl.title = 'Toxic well';
        spotEl.style.cursor = 'pointer';
      }
    }

    // make lives at risk go up by effectively losing the well's saved lives
    livesSaved = Math.max(0, livesSaved - runtime.livesPerWell);
    updateLivesDisplay();

    // show warning and reschedule next contamination
    showContaminationWarning('Water is contaminated! A well has turned toxic.');
    scheduleContamination();
  }

  // --- SECTION: Wiring & initialization ---

  // Wire UI (robust: delegated handlers, ensure button is enabled)
  // ensure the build button behaves like a control (avoid accidental form-submit)
  if (buildBtn) {
    try { buildBtn.type = 'button'; } catch (e) { /* ignore */ }
    buildBtn.disabled = false;
  }
  if (digBtn) {
    try { digBtn.type = 'button'; } catch (e) { /* ignore */ }
    digBtn.disabled = false;
  }

  // clicking the HUD funds stat toggles currency as requested
  if (fundsStatEl) {
    fundsStatEl.style.cursor = 'pointer';
    fundsStatEl.addEventListener('click', (ev) => {
      ev.preventDefault();
      toggleCurrency();
    });
  }

  // Delegated click handler: reliable even if elements are re-rendered/replaced
  document.addEventListener('click', (ev) => {
    // Quick spot delegation: handle clicks on any spot (dry/well/toxic)
    const spotEl = ev.target && ev.target.closest ? ev.target.closest('.spot') : null;
    if (spotEl) {
      ev.preventDefault();
      const idx = parseInt(spotEl.dataset.index, 10);
      // guard: only call if index is a number
      if (!Number.isNaN(idx)) onSpotClick(idx, spotEl);
      return;
    }
    const fundBtn = ev.target.closest && ev.target.closest('#buildBtn');
    if (fundBtn) {
      ev.preventDefault();
      startFundraiseProgress();
      return;
    }
    const digBtnEl = ev.target.closest && ev.target.closest('#digBtn');
    if (digBtnEl) {
      ev.preventDefault();
      revealSpots();
      return;
    }
    const reset = ev.target.closest && ev.target.closest('#resetBtn');
    if (reset) {
      ev.preventDefault();
      resetGame();
      return;
    }
    const currencyBtn = ev.target.closest && (ev.target.closest('#currencyToggle') || ev.target.closest('#currencyToggleBtn'));
    if (currencyBtn) {
      ev.preventDefault();
      toggleCurrency();
      return;
    }
  });

  // Add startAutoFundTimer function
  // --- SECTION: Timers (auto-funding) ---
  function startAutoFundTimer() {
    if (autoFundTimer) clearInterval(autoFundTimer);
    countdown = runtime.autoFundInterval;
    autoFundTimer = setInterval(() => {
      countdown -= 1;
      if (countdown <= 0) {
        fundsUsd += runtime.autoFundAmount;
        updateFundsDisplay();
        setStatus(`Automatic fundraising: ${formatCurrencyFull(runtime.autoFundAmount)} added.`, 3000);
        countdown = runtime.autoFundInterval;
        setTimeout(() => { setStatus('Build a well 💧', 2500); }, 3000);
      }
    }, 1000);
  }

  // Currency toggle (guard) — ensure all HUD pieces update immediately
  // --- SECTION: Currency toggle/helper ---
  // Switch displayed currency and update HUD pieces
  function toggleCurrency() {
    currency = currency === 'USD' ? 'EUR' : 'USD';
    // update any explicit toggle button text if present
    // update label/symbol/emoji and HUD numeric immediately
    if (fundsLabelEl) fundsLabelEl.textContent = currency === 'USD' ? 'USD' : 'EUR';
    if (currencySymbolEl) currencySymbolEl.textContent = currency === 'USD' ? '$' : '€';
    if (currencyEmojiEl) currencyEmojiEl.textContent = currency === 'USD' ? '💵' : '💶';
    // refresh displays that depend on currency
    updateFundsDisplay();
    updateWellCostDisplay();
  // optional status hint
  setStatus(`Prices shown in ${currency}.`, 2000);
  }

  // Initialize the game after difficulty selection
  // --- SECTION: Initialization / difficulty handling ---
  // Apply a difficulty preset and start or update game subsystems
  function applyDifficulty(name) {
    const preset = DIFFICULTY_PRESETS[name] || DIFFICULTY_PRESETS.Hard;
    runtime = Object.assign({}, runtime, preset);
    // set starting funds and update UI
    fundsUsd = runtime.startFunds;
    updateFundsDisplay();
    updateWellCostDisplay();
    updateLivesDisplay();
    resetProgressBar();
    renderMap();
    startAutoFundTimer();
    scheduleContamination();
  setStatus(`Difficulty: ${name}. Good luck!`, 3000);
  }

  // Modal wiring: choose difficulty then hide modal and start game
  function closeModal() {
    if (!difficultyModal) return;
    difficultyModal.style.display = 'none';
  }
  if (easyBtn) easyBtn.addEventListener('click', () => { applyDifficulty('Easy'); closeModal(); });
  if (hardBtn) hardBtn.addEventListener('click', () => { applyDifficulty('Hard'); closeModal(); });
  if (difficultBtn) difficultBtn.addEventListener('click', () => { applyDifficulty('Difficult'); closeModal(); });

  // If modal is not present (fallback), start with default Hard preset immediately
  if (!difficultyModal) {
    applyDifficulty('Hard');
  } else {
    // ensure modal is visible; defer initialization until user picks a difficulty
    if (difficultyModal.style) difficultyModal.style.display = 'flex';
  }

  // Cleanup on unload
  window.addEventListener('beforeunload', () => {
    if (autoFundTimer) clearInterval(autoFundTimer);
    if (contaminationTimeout) clearTimeout(contaminationTimeout);
  });
})();
