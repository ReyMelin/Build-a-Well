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

  // State
  let fundsUsd = INITIAL_FUNDS_USD;
  let livesSaved = 0;
  let currency = 'USD';
  let countdown = AUTO_FUND_INTERVAL_SEC;
  let digProgress = 0;
  let digInterval = null;
  let autoFundTimer = null;
  let spots = []; // {status: 'dry'|'wet'|'well'}

  // DOM (tolerant lookups for multiple possible IDs; allow missing elements)
  const fundsEl = document.getElementById('funds') || document.getElementById('fundsLabel') || null;
  const livesEl = document.getElementById('lives') || document.getElementById('livesSaved') || null;
  const wellsEl = document.getElementById('wells') || null;
  const fundraiseCountdownEl = document.getElementById('fundraiseCountdown') || document.getElementById('fundraiseStatus') || null;
  const buildBtn = document.getElementById('buildBtn') || null;
  const progressBarEl = document.getElementById('progressBar') || null;
  const villagerProgressEl = document.getElementById('villagerProgress') || document.getElementById('impactProgress') || null;
  const villagerProgressLabel = document.getElementById('villagerProgressLabel') || document.getElementById('impactProgressLabel') || null;
  const statusEl = document.getElementById('status') || null;
  const currencyToggleBtn = document.getElementById('currencyToggle') || document.getElementById('currencyToggleBtn') || null;
  const resetBtn = document.getElementById('resetBtn') || null;
  const mapEl = document.getElementById('map') || null;
  const wellCostDisplayEl = document.getElementById('wellCostDisplay') || null;

  // Helper: format currency based on selected currency
  function formatCurrency(amountUsd) {
    if (currency === 'USD') {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amountUsd);
    } else {
      const eur = amountUsd * EXCHANGE_RATE_USD_TO_EUR;
      return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(eur);
    }
  }

  // UI updates (safe checks before DOM writes)
  function updateFundsDisplay() {
    if (fundsEl) fundsEl.textContent = formatCurrency(fundsUsd);
  }
  function updateWellCostDisplay() {
    if (wellCostDisplayEl) wellCostDisplayEl.textContent = formatCurrency(WELL_COST_USD);
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
      // add simple random spawn of spots across the visible area
      for (let i = 0; i < MAP_SPOT_COUNT; i++) {
        const isDry = Math.random() < 0.9; // ~90% dry by default
        const status = isDry ? 'dry' : 'wet';
        spots.push({ status });

        const spot = document.createElement('div');
        spot.className = `spot ${status}`;
        spot.dataset.index = String(i);
        Object.assign(spot.style, {
          position: 'absolute',
          // keep spots away from exact edges (5%–90%)
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
          pointerEvents: 'auto', // enable this spot to receive pointer events
          background: 'transparent'
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

        // only dry spots can be built on
        if (status === 'dry') {
          spot.addEventListener('click', (ev) => {
            ev.stopPropagation();
            onSpotClick(parseInt(spot.dataset.index, 10), spot);
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
      if (statusEl) statusEl.textContent = `Insufficient funds — need ${formatCurrency(WELL_COST_USD)} to build.`;
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
      if (statusEl) statusEl.textContent = 'Click a dry area on the map to build a well 💧';
    }, 2000);
  }

  // Dig / Fundraise action: each click moves progress +10%; at 100% reward DIG_PROFIT_USD
  function startDigProgress() {
    // increment progress by 10% on each click
    digProgress = Math.min(digProgress + 10, 100);
    if (progressBarEl) progressBarEl.style.width = `${digProgress}%`;

    if (digProgress < 100) {
      if (statusEl) statusEl.textContent = `Digging... ${digProgress}%`;
      return;
    }

    // Completed: announce and reward
    if (statusEl) statusEl.textContent = `Fantastic! You have earned ${formatCurrency(DIG_PROFIT_USD)}`;
    fundsUsd += DIG_PROFIT_USD;
    updateFundsDisplay();

    // Reset progress after brief pause so player sees the completion message
    setTimeout(() => {
      digProgress = 0;
      if (progressBarEl) progressBarEl.style.width = '0%';
      if (statusEl) statusEl.textContent = 'Click a dry area on the map to build a well 💧';
    }, 1500);
  }

  // Auto-fund timer (guard writes)
  function startAutoFundTimer() {
    if (autoFundTimer) clearInterval(autoFundTimer);
    countdown = AUTO_FUND_INTERVAL_SEC;
    if (fundraiseCountdownEl) fundraiseCountdownEl.textContent = String(countdown);
    autoFundTimer = setInterval(() => {
      countdown -= 1;
      if (countdown <= 0) {
        fundsUsd += AUTO_FUND_AMOUNT_USD;
        updateFundsDisplay();
        if (statusEl) statusEl.textContent = `Automatic fundraising: ${formatCurrency(AUTO_FUND_AMOUNT_USD)} added.`;
        countdown = AUTO_FUND_INTERVAL_SEC;
        setTimeout(() => {
          if (statusEl) statusEl.textContent = 'Click a dry area on the map to build a well 💧';
        }, 2500);
      }
      if (fundraiseCountdownEl) fundraiseCountdownEl.textContent = String(countdown);
    }, 1000);
  }

  // Currency toggle (guard)
  function toggleCurrency() {
    currency = currency === 'USD' ? 'EUR' : 'USD';
    if (currencyToggleBtn) currencyToggleBtn.textContent = currency === 'USD' ? 'Switch to EUR' : 'Switch to USD';
    updateFundsDisplay();
    updateWellCostDisplay();
  }

  // Reset (guard)
  function resetGame() {
    fundsUsd = INITIAL_FUNDS_USD;
    livesSaved = 0;
    currency = 'USD';
    if (currencyToggleBtn) currencyToggleBtn.textContent = 'Switch to EUR';
    updateFundsDisplay();
    updateWellCostDisplay();
    updateLivesDisplay();
    resetProgressBar();
    if (statusEl) statusEl.textContent = 'Game reset. Click a dry area on the map to build a well 💧';
    renderMap();
    startAutoFundTimer();
  }

  // Wire UI (guard listeners to avoid addEventListener on null)
  if (buildBtn) buildBtn.addEventListener('click', startDigProgress);
  if (currencyToggleBtn) currencyToggleBtn.addEventListener('click', toggleCurrency);
  if (resetBtn) resetBtn.addEventListener('click', resetGame);

  // Initialize
  updateFundsDisplay();
  updateWellCostDisplay();
  updateLivesDisplay();
  renderMap();
  startAutoFundTimer();

  // Cleanup on unload
  window.addEventListener('beforeunload', () => {
    if (autoFundTimer) clearInterval(autoFundTimer);
    if (digInterval) clearInterval(digInterval);
  });
})();
