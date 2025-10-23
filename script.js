(() => {
  // Constants
  const INITIAL_FUNDS_USD = 80000;         // start with $80,000
  const WELL_COST_USD = 20000;             // one well costs $20,000
  const LIVES_PER_WELL = 500;              // one well saves 500 lives
  const AUTO_FUND_AMOUNT_USD = 15000;      // automatic fundraising amount
  const AUTO_FUND_INTERVAL_SEC = 60;       // every 60 seconds
  const DIG_PROFIT_USD = 20000;            // dig completion reward
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
  let spots = []; // {status: 'dry'|'wet'|'well'}
  let contaminationTimeout = null;
  let activeWarningEl = null;

  // DOM (tolerant lookups for multiple possible IDs; allow missing elements)
  const fundsEl = document.getElementById('funds') || document.getElementById('fundsLabel') || null;
  const livesEl = document.getElementById('lives') || document.getElementById('livesSaved') || null;
  const wellsEl = document.getElementById('wells') || null;
  const fundraiseCountdownEl = document.getElementById('fundraiseCountdown') || document.getElementById('fundraiseStatus') || null;
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
    }
  }
  function resetProgressBar() {
    digProgress = 0;
    if (progressBarEl) progressBarEl.style.width = '0%';
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
    img.style.display = 'block';
    img.style.width = '100%';
    img.style.height = 'auto';
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
      spots = [];
      for (let i = 0; i < MAP_SPOT_COUNT; i++) {
        const isDry = Math.random() < 0.9;
        const status = isDry ? 'dry' : 'wet';
        spots.push({ status });

        const spot = document.createElement('div');
        spot.className = `spot ${status}`;
        spot.dataset.index = String(i);
        Object.assign(spot.style, {
          position: 'absolute',
          left: `${5 + Math.random() * 90}%`,
          top: `${5 + Math.random() * 90}%`,
          width: '48px',
          height: '48px',
          transform: 'translate(-50%, -50%)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '6px',
          boxSizing: 'border-box',
          cursor: status === 'dry' ? 'pointer' : 'default',
          border: '2px solid rgba(0,0,0,0.08)',
          userSelect: 'none',
          pointerEvents: 'auto',
          background: 'transparent',
          // Hide dry spots by default, will be revealed by dig action
          visibility: status === 'dry' ? 'hidden' : 'visible'
        });

        spot.title = status === 'dry' ? 'Dry area — click to build a well' : 'Wet area';

        // show icon depending on status
        const icon = document.createElement('img');
        icon.alt = status === 'dry' ? 'dirt' : 'water';
        icon.src = status === 'dry' ? 'Dirt Icon.png' : 'Clean Water Drop.png';
        Object.assign(icon.style, {
          width: '36px',
          height: '36px',
          display: 'block',
          pointerEvents: 'none'
        });
        spot.appendChild(icon);

        if (status === 'dry') {
          // Not revealed by default
          spot.style.visibility = 'hidden';
          spot.removeAttribute('data-revealed');
          spot.addEventListener('click', (ev) => {
            ev.stopPropagation();
            // Only allow clicking if revealed
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

  // Spot click: attempt to build well on that spot
  function onSpotClick(index, spotEl) {
    const spot = spots[index];
    if (!spot) return;
    if (spot.status === 'well') {
      if (statusEl) statusEl.textContent = 'There is already a well here.';
      return;
    }
    if (spot.status !== 'dry') {
      if (statusEl) statusEl.textContent = 'You can only build on dry areas.';
      return;
    }
    // Attempt to build using funds
    if (fundsUsd < WELL_COST_USD) {
      if (statusEl) statusEl.textContent = `Not enough funds. Please fundraise before building a well!`;
      return;
    }
    // Deduct cost, mark spot as well
    fundsUsd -= WELL_COST_USD;
    spot.status = 'well';
    // replace inner content with the clean water icon
    if (spotEl) {
      spotEl.innerHTML = '';
      const wellImg = document.createElement('img');
      wellImg.src = 'Clean Water Drop.png';
      wellImg.alt = 'well';
      Object.assign(wellImg.style, {
        width: '36px',
        height: '36px',
        display: 'block',
        pointerEvents: 'none'
      });
      spotEl.appendChild(wellImg);
      spotEl.style.background = '#6cc66c'; // green to indicate well
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
    digProgress = Math.min(digProgress + 10, 100);
    if (progressBarEl) progressBarEl.style.width = `${digProgress}%`;
    if (digProgress < 100) {
      if (statusEl) statusEl.textContent = `Fundraising... ${digProgress}%`;
      return;
    }
    if (statusEl) statusEl.textContent = `Fantastic! You have raised ${formatCurrencyFull(DIG_PROFIT_USD)}!`;
    fundsUsd += DIG_PROFIT_USD;
    updateFundsDisplay();
    setTimeout(() => {
      digProgress = 0;
      if (progressBarEl) progressBarEl.style.width = '0%';
      if (statusEl) statusEl.textContent = 'Dig to open the ground.';
    }, 1500);
  }

  function resetGame() {
    fundsUsd = INITIAL_FUNDS_USD;
    livesSaved = 0;
    currency = 'USD';
    if (currencyToggleBtn) currencyToggleBtn.textContent = 'Switch to EUR';
    updateFundsDisplay();
    updateWellCostDisplay();
    updateLivesDisplay();
    resetProgressBar();
    if (statusEl) statusEl.textContent = 'Game reset. Dig to open the ground.';
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
