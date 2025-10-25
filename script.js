(() => {
  // Constants
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
  // contamination timing
  const CONTAM_MIN_SEC = 20;              // earliest contamination after start (seconds)
  const CONTAM_MAX_SEC = 90;              // latest contamination delay (seconds)
  const CONTAM_WARNING_MS = 500;         // show warning duration (ms)

  // State
  let fundsUsd = INITIAL_FUNDS_USD;
  let livesSaved = 0;
  let currency = 'USD';
  let countdown = AUTO_FUND_INTERVAL_SEC;
  let digProgress = 0;
  let digInterval = null;
  let autoFundTimer = null;
  let fundraiseLocked = false; // prevent double-award while at 100%
  let confettiLaunched = false; // ensure one celebration per goal
  let firstWellBuilt = false; // prevents any prebuilt (visible) wells until player digs first well
  let spots = []; // {status: 'dry'|'wet'|'well'}
  let contaminationTimeout = null;
  let activeWarningEl = null;

  // DOM (tolerant lookups for multiple possible IDs; allow missing elements)
  const fundsEl = document.getElementById('funds') || document.getElementById('fundsLabel') || null;
  const livesEl = document.getElementById('lives') || document.getElementById('livesSaved') || null;
  const wellsEl = document.getElementById('wells') || null;
  const fundraiseCountdownEl = document.getElementById('fundraiseCountdown') || null;
  const buildBtn = document.getElementById('buildBtn') || null;
  const digBtn = document.getElementById('digBtn') || null;
  const progressBarEl = document.getElementById('progressBar') || null;
  const villagerProgressEl = document.getElementById('villagerProgress') || document.getElementById('impactProgress') || null;
  const villagerProgressLabel = document.getElementById('villagerProgressLabel') || document.getElementById('impactProgressLabel') || null;
  const statusEl = document.getElementById('status') || null;
  const currencyToggleBtn = document.getElementById('currencyToggle') || document.getElementById('currencyToggleBtn') || null;
  const resetBtn = document.getElementById('resetBtn') || null;
  const mapEl = document.getElementById('map') || null;
  const wellCostDisplayEl = document.getElementById('wellCostDisplay') || null;
  // new: explicit currency UI pieces
  const currencySymbolEl = document.getElementById('currencySymbol') || null;
  const fundsLabelEl = document.getElementById('fundsLabel') || null;
  const currencyEmojiEl = document.getElementById('currencyEmoji') || null;
  const fundsStatEl = document.getElementById('fundsStat') || null;

  // Helper: format currency based on selected currency
  // full formatted string including symbol (use in messages)
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

  // UI updates (safe checks before DOM writes)
  function updateFundsDisplay() {
    if (fundsEl) fundsEl.textContent = formatCurrencyNumber(fundsUsd);
    if (currencySymbolEl) currencySymbolEl.textContent = currency === 'USD' ? '$' : '€';
    if (fundsLabelEl) fundsLabelEl.textContent = currency === 'USD' ? 'USD' : 'EUR';
    if (currencyEmojiEl) currencyEmojiEl.textContent = currency === 'USD' ? '💵' : '💶';
    // Flash the funds HUD when depleted
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

  // helper: trigger a brief funds HUD flash (used when an action is blocked for lack of funds)
  let _flashTimeout = null;
  function flashFunds() {
    const hudTarget = fundsStatEl || fundsEl;
    if (!hudTarget) return;
    hudTarget.classList.add('flash-red');
    if (_flashTimeout) clearTimeout(_flashTimeout);
    _flashTimeout = setTimeout(() => {
      hudTarget.classList.remove('flash-red');
      _flashTimeout = null;
    }, 1100);
  }

  function updateWellCostDisplay() {
    if (wellCostDisplayEl) {
      // show symbol + number or localized full string depending on layout preference
      if (currencySymbolEl) {
        currencySymbolEl.textContent = currency === 'USD' ? '$' : '€';
      }
      if (currencyEmojiEl) currencyEmojiEl.textContent = currency === 'USD' ? '💵' : '💶';
      wellCostDisplayEl.textContent = formatCurrencyNumber(WELL_COST_USD);
    }
  }
  function updateLivesDisplay() {
    if (livesEl) livesEl.textContent = String(livesSaved);
    if (wellsEl) wellsEl.textContent = String(Math.floor(livesSaved / LIVES_PER_WELL));
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

  // stop timers/intervals used by the simulation
  function stopAll() {
    if (autoFundTimer) { clearInterval(autoFundTimer); autoFundTimer = null; }
    if (digInterval) { clearInterval(digInterval); digInterval = null; }
    if (contaminationTimeout) { clearTimeout(contaminationTimeout); contaminationTimeout = null; }
  }

  // end the game: stop background activity, fire confetti and overlay victory message
  function endGame() {
    stopAll();
    launchConfetti();

    // overlay on top of the map
    if (!mapEl) return;
    // avoid duplicate overlay
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
    // place overlay inside the map so it covers the map area
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

    // remove after animation
    setTimeout(() => {
      if (container && container.parentElement) container.parentElement.removeChild(container);
    }, 3000);
  }

  // Map + weather rendering (simplified: remove color aura; place spots randomly)
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

  // Spot click: build a well on a revealed dirt spot or clean a toxic well
  function onSpotClick(index, spotEl) {
    const spot = spots[index];
    if (!spot) return;
    // Prevent building on dry spots that haven't been revealed by digging
    if (spot.status === 'dry' && spotEl && !spotEl.hasAttribute('data-revealed')) {
      if (statusEl) statusEl.textContent = 'This spot is still buried — dig to reveal it first.';
      return;
    }

    // If toxic, allow cleaning for CLEAN_COST_USD
    if (spot.status === 'toxic') {
      if (fundsUsd < CLEAN_COST_USD) {
        if (statusEl) statusEl.textContent = `Not enough funds to clean — need ${formatCurrencyFull(CLEAN_COST_USD)}.`;
        flashFunds();
        return;
      }
      fundsUsd -= CLEAN_COST_USD;
      spot.status = 'well';
      // restore DOM: swap to clean water, remove toxic visuals
      if (spotEl) {
        const img = spotEl.querySelector('img');
        if (img) {
          img.src = 'Clean clear drop.png';
          img.alt = 'well';
          img.style.filter = '';
        }
        spotEl.classList.remove('toxic');
        // remove small hazard markers if present
        Array.from(spotEl.querySelectorAll('span')).forEach(s => {
          if (s.textContent && /[☣☠]/.test(s.textContent)) s.remove();
        });
        spotEl.style.background = '#6cc66c';
        spotEl.title = 'Well cleaned';
      }
      // restore lives protected by this well
      livesSaved = Math.min(TOTAL_LIVES_AT_RISK, livesSaved + LIVES_PER_WELL);
      updateFundsDisplay();
      updateLivesDisplay();
      if (statusEl) statusEl.textContent = `Cleaned toxic well — ${formatCurrencyFull(CLEAN_COST_USD)} spent. ${LIVES_PER_WELL} lives protected again.`;
      setTimeout(() => {
        if (statusEl) statusEl.textContent = 'Tap the dirt spots to build more wells!';
      }, 2500);
      return;
    }

    // Otherwise, build a well on a dry revealed spot
    if (spot.status !== 'dry') {
      if (statusEl) statusEl.textContent = 'You can only build on dry areas.';
      return;
    }
    if (fundsUsd < WELL_COST_USD) {
      if (statusEl) statusEl.textContent = `Not enough funds. Please fundraise before building a well!`;
      flashFunds();
      return;
    }
    fundsUsd -= WELL_COST_USD;
    spot.status = 'well';
    // mark that the first well has been built so future map renders may include visible/wet spots
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
    livesSaved += LIVES_PER_WELL;
    updateFundsDisplay();
    updateLivesDisplay();
    if (statusEl) statusEl.textContent = `Built a well — ${LIVES_PER_WELL} lives helped.`;
    setTimeout(() => {
      if (statusEl) statusEl.textContent = 'Tap the dirt spots to build more wells!';
    }, 2000);
  }

  let digClicks = 0;
  function revealSpots() {
    if (!mapEl) return;
    digClicks++;
    if (digClicks < 3) {
      if (statusEl) statusEl.textContent = `Digging... ${Math.round((digClicks / 3) * 100)}%`;
      return;
    }
    digClicks = 0;
    if (!mapEl.classList.contains('spots-visible')) mapEl.classList.add('spots-visible');
    const allSpots = mapEl.querySelectorAll('.spot.dry');
    const hiddenSpots = Array.from(allSpots).filter(
      spot => !spot.hasAttribute('data-revealed')
    );
    if (hiddenSpots.length === 0) {
      if (statusEl) statusEl.textContent = 'No more diggable spots!';
      return;
    }
    const revealSpot = hiddenSpots[Math.floor(Math.random() * hiddenSpots.length)];
    revealSpot.style.visibility = 'visible';
    revealSpot.setAttribute('data-revealed', 'true');
    if (statusEl) statusEl.textContent = 'Build a well!';
  }

  function startFundraiseProgress() {
    // ignore clicks while the previous award is being shown
    if (fundraiseLocked) return;

    // increment
    digProgress = Math.min(digProgress + 10, 100);
    if (progressBarEl) progressBarEl.style.width = `${digProgress}%`;

    if (digProgress < 100) {
      if (statusEl) statusEl.textContent = `Fundraising... ${digProgress}%`;
      return;
    }

    // reached 100% — award once and lock until reset
    fundraiseLocked = true;
    if (statusEl) statusEl.textContent = `Fantastic! You have raised ${formatCurrencyFull(DIG_PROFIT_USD)}!`;
    fundsUsd += DIG_PROFIT_USD;
    updateFundsDisplay();

    // Keep the completed message briefly, then reset progress and unlock.
    setTimeout(() => {
      digProgress = 0;
      if (progressBarEl) progressBarEl.style.width = '0%';
      fundraiseLocked = false; // next click will start at first increment
      if (statusEl) statusEl.textContent = 'Dig to open the ground.';
    }, 1500);
  }

  function resetGame() {
    fundsUsd = INITIAL_FUNDS_USD;
    livesSaved = 0;
    currency = 'USD';
    firstWellBuilt = false;
    if (currencyToggleBtn) currencyToggleBtn.textContent = 'Switch to EUR';
    updateFundsDisplay();
    updateWellCostDisplay();
    updateLivesDisplay();
    resetProgressBar();
    if (statusEl) statusEl.textContent = 'Game reset. Dig to open the ground.';
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

  // schedule next contamination event at a random delay
  function scheduleContamination() {
    if (!mapEl) return;
    if (contaminationTimeout) clearTimeout(contaminationTimeout);
    const delay = Math.floor((Math.random() * (CONTAM_MAX_SEC - CONTAM_MIN_SEC) + CONTAM_MIN_SEC) * 1000);
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
      } else {
        // fallback: change background
        spotEl.style.background = 'rgba(200,40,40,0.12)';
      }
    }

    // make lives at risk go up by effectively losing the well's saved lives
    livesSaved = Math.max(0, livesSaved - LIVES_PER_WELL);
    updateLivesDisplay();

    // show warning and reschedule next contamination
    showContaminationWarning('Water is contaminated! A well has turned toxic.');
    scheduleContamination();
  }

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
  function startAutoFundTimer() {
    if (autoFundTimer) clearInterval(autoFundTimer);
    countdown = AUTO_FUND_INTERVAL_SEC;
    if (fundraiseCountdownEl) fundraiseCountdownEl.textContent = String(countdown);
    autoFundTimer = setInterval(() => {
      countdown -= 1;
      if (countdown <= 0) {
        fundsUsd += AUTO_FUND_AMOUNT_USD;
        updateFundsDisplay();
        if (statusEl) statusEl.textContent = `Automatic fundraising: ${formatCurrencyFull(AUTO_FUND_AMOUNT_USD)} added.`;
        countdown = AUTO_FUND_INTERVAL_SEC;
        setTimeout(() => {
          if (statusEl) statusEl.textContent = 'Build a well 💧';
        }, 2500);
      }
      if (fundraiseCountdownEl) fundraiseCountdownEl.textContent = String(countdown);
    }, 1000);
  }

  // Currency toggle (guard) — ensure all HUD pieces update immediately
  function toggleCurrency() {
    currency = currency === 'USD' ? 'EUR' : 'USD';
    // update any explicit toggle button text if present
    if (currencyToggleBtn) currencyToggleBtn.textContent = currency === 'USD' ? 'Switch to EUR' : 'Switch to USD';
    // update label/symbol/emoji and HUD numeric immediately
    if (fundsLabelEl) fundsLabelEl.textContent = currency === 'USD' ? 'USD' : 'EUR';
    if (currencySymbolEl) currencySymbolEl.textContent = currency === 'USD' ? '$' : '€';
    if (currencyEmojiEl) currencyEmojiEl.textContent = currency === 'USD' ? '💵' : '💶';
    // refresh displays that depend on currency
    updateFundsDisplay();
    updateWellCostDisplay();
    // optional status hint
    if (statusEl) statusEl.textContent = `Prices shown in ${currency}.`;
  }

  // Initialize
  updateFundsDisplay();
  updateWellCostDisplay();
  updateLivesDisplay();
  renderMap();
  startAutoFundTimer();
  scheduleContamination();

  // Cleanup on unload
  window.addEventListener('beforeunload', () => {
    if (autoFundTimer) clearInterval(autoFundTimer);
    if (digInterval) clearInterval(digInterval);
    if (contaminationTimeout) clearTimeout(contaminationTimeout);
  });
})();
