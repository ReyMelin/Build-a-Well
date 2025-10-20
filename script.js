// === Base Variables ===
let funds = 20000;
let wellsBuilt = 0;
let livesSaved = 0;
let currency = "USD";
let exchangeRate = 0.93; // USD → EUR
const WELL_COST_USD = 20000;
const LIVES_PER_WELL = 500;
const GLOBAL_TARGET = 1400000; // WHO estimate

// === Elements ===
const fundsDisplay = document.getElementById("funds");
const wellsDisplay = document.getElementById("wells");
const livesDisplay = document.getElementById("livesSaved");
const impactBar = document.getElementById("impactProgress");
const impactLabel = document.getElementById("impactProgressLabel");
const toggleCurrency = document.getElementById("toggleCurrency");
const buildBtn = document.getElementById("buildBtn");
const resetBtn = document.getElementById("resetBtn");
const statusText = document.getElementById("status");
const currencySymbol = document.getElementById("currencySymbol");
const map = document.getElementById('map');
const progressBar = document.getElementById('progressBar');
const fundraiseCountdown = document.getElementById('fundraiseCountdown');

// map/game state (some variables were moved around — ensure they exist)
let mapSpots = [];
const numSpots = 6;
let villagersSaved = 0;
let gameOver = false;

// === Currency Toggle ===
function toggleCurrencyMode() {
  if (currency === "USD") {
    currency = "EUR";
    funds = Math.round(funds * exchangeRate);
    currencySymbol.textContent = "€";
    if (toggleCurrency) toggleCurrency.textContent = "Switch to USD ($)";
    document.getElementById('fundsLabel').textContent = 'EUR';
    buildBtn.textContent = `🚜 Fund a Well (€${Math.round(WELL_COST_USD * exchangeRate).toLocaleString()})`;
  } else {
    currency = "USD";
    funds = Math.round(funds / exchangeRate);
    currencySymbol.textContent = "$";
    if (toggleCurrency) toggleCurrency.textContent = "Switch to EUR (€)";
    document.getElementById('fundsLabel').textContent = 'USD';
    buildBtn.textContent = `🚜 Fund a Well ($${WELL_COST_USD.toLocaleString()})`;
  }
  updateDisplay();
}


// Make the entire funds stat clickable to toggle currency as well
const fundsStat = document.getElementById('fundsStat');
if (fundsStat) {
  fundsStat.style.cursor = 'pointer';
}

// Small helper to trigger a brief CSS pulse/flash animation on an element
function pulseElement(el, duration = 600) {
  if (!el) return;
  el.classList.remove('pulse-anim');
  // force reflow to restart animation
  void el.offsetWidth;
  el.classList.add('pulse-anim');
  setTimeout(() => el.classList.remove('pulse-anim'), duration);
}

// Enhance the toggle to give visual feedback
const fundsLabelEl = document.getElementById('fundsLabel');
const currencySymbolEl = document.getElementById('currencySymbol');

// Wrap the existing toggle to add animation feedback
const originalToggle = toggleCurrencyMode;
toggleCurrencyMode = function () {
  originalToggle();
  // animate HUD pieces
  pulseElement(fundsStat);
  pulseElement(fundsLabelEl);
  pulseElement(currencySymbolEl);
  pulseElement(buildBtn);
};

// Attach listeners to the (now wrapped) toggle function so pulses fire
if (toggleCurrency) toggleCurrency.addEventListener('click', toggleCurrencyMode);
if (fundsStat) fundsStat.addEventListener('click', toggleCurrencyMode);

// === Build a Well ===
buildBtn.addEventListener("click", () => {
  if (funds < WELL_COST_USD && currency === "USD") {
    statusText.textContent = "Not enough funds to build a well yet!";
    return;
  }
  funds -= currency === "USD" ? WELL_COST_USD : WELL_COST_USD * exchangeRate;
  wellsBuilt++;
  livesSaved += LIVES_PER_WELL;
  updateImpact();
  updateDisplay();
  statusText.textContent = `💧 New well built! +${LIVES_PER_WELL.toLocaleString()} lives changed!`;
});


// === Update Impact ===
function updateImpact() {
  // impact is based on total lives changed (global builds + map spot builds)
  const totalSaved = (livesSaved || 0) + (villagersSaved || 0);
  const impact = Math.min(100, (totalSaved / GLOBAL_TARGET) * 100);
  impactBar.style.width = impact + "%";
  impactLabel.textContent = `${impact.toFixed(2)}% of unsafe water mortality prevented`;
}

// === Update Display ===
// Unified display updater: shows total "lives changed" (global wells + spot builds)
function updateDisplay() {
  const totalSaved = (livesSaved || 0) + (villagersSaved || 0);
  fundsDisplay.textContent = funds.toLocaleString();
  wellsDisplay.textContent = wellsBuilt;
  livesDisplay.textContent = totalSaved.toLocaleString();
  // persist both counters and other state
  localStorage.setItem("funds", funds);
  localStorage.setItem("wells", wellsBuilt);
  localStorage.setItem("livesSaved", livesSaved);
  localStorage.setItem("villagersSaved", villagersSaved);
  localStorage.setItem("currency", currency);
}


// --- Load Game ---
window.addEventListener('load', () => {
  // Load simulation state (funds, wells, lives, currency)
  const savedFunds = localStorage.getItem('funds');
  const savedWells = localStorage.getItem('wells');
  const savedLives = localStorage.getItem('livesSaved');
  const savedCurrency = localStorage.getItem('currency');
  const savedVillagers = localStorage.getItem('villagersSaved');
  const savedMap = JSON.parse(localStorage.getItem('mapSpots'));

  if (savedFunds) funds = parseInt(savedFunds, 10);
  if (savedWells) wellsBuilt = parseInt(savedWells, 10);
  if (savedLives) livesSaved = parseInt(savedLives, 10);
  if (savedVillagers) villagersSaved = parseInt(savedVillagers, 10);
  if (savedCurrency) {
    currency = savedCurrency;
    // restore currency UI
    const fundsLabel = document.getElementById('fundsLabel');
    if (fundsLabel) fundsLabel.textContent = currency;
    currencySymbol.textContent = currency === 'USD' ? '$' : '€';
    if (currency === 'USD') {
      buildBtn.textContent = `🚜 Fund a Well ($${WELL_COST_USD.toLocaleString()})`;
      if (toggleCurrency) toggleCurrency.textContent = 'Switch to EUR (€)';
    } else {
      buildBtn.textContent = `🚜 Fund a Well (€${Math.round(WELL_COST_USD * exchangeRate).toLocaleString()})`;
      if (toggleCurrency) toggleCurrency.textContent = 'Switch to USD ($)';
    }
  }

  if (savedMap) {
    mapSpots = savedMap;
  } else {
    initMap();
  }

  drawMap();
  refreshWeatherOverlay();
  updateDisplay();
});

// --- Initialize Random Map ---
function initMap() {
  mapSpots = [];
  for (let i = 0; i < numSpots; i++) {
    const decay = Math.random() < 0.5 ? 2 : 4; // some spots decay faster
    mapSpots.push({
      id: i,
      x: Math.random() * 85,
      y: Math.random() * 70,
      wet: false,
      villagers: 200,
      decayRate: decay,
      initial: 200
    });
  }
}

// --- Draw Map ---
function drawMap() {
  map.innerHTML = "";
  // Create map overlay if not already present (matches .map-overlay in CSS)
  let overlay = map.querySelector('.map-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'map-overlay';
    overlay.style.zIndex = '1';
    map.appendChild(overlay);
  }
  mapSpots.forEach((spot) => {
    // Create an invisible but clickable marker for each logical spot
    // create a visual marker using the water drop image
    const el = document.createElement('button');
    el.classList.add('spot');
    el.classList.add(spot.wet ? 'wet' : 'dry');
    el.style.left = `${spot.x}%`;
    el.style.top = `${spot.y}%`;
    el.style.zIndex = '3';
    el.setAttribute('aria-label', spot.wet ? 'wet spot' : 'dry spot');

    const img = document.createElement('img');
    // Prefer the new Clean Water Drop asset, fall back to the older PNG
    img.src = 'Clean Water Drop.png';
    img.alt = 'clean water drop';
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'contain';
    img.style.pointerEvents = 'none';

    // If the preferred asset doesn't exist, fallback to legacy name, then inline SVG
    img.onerror = function () {
      if (img.src && img.src.indexOf('Clean Water Drop.png') !== -1) {
        img.src = 'water drop.png';
        return;
      }
      // final fallback: replace image with inline SVG element
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('width', '26');
      svg.setAttribute('height', '26');
      svg.innerHTML = `
        <defs>
          <linearGradient id="g1" x1="0" x2="1">
            <stop offset="0%" stop-color="#2E9DF7" />
            <stop offset="100%" stop-color="#4FCB53" />
          </linearGradient>
        </defs>
        <path fill="url(#g1)" d="M12 2c0 0-6 5-6 9a6 6 0 0 0 12 0c0-4-6-9-6-9z" />
        <circle cx="12" cy="14" r="2" fill="rgba(255,255,255,0.2)" />
      `;
      svg.style.pointerEvents = 'none';
      el.replaceChild(svg, img);
    };

    el.appendChild(img);

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      buildWell(spot.id, el);
    });

    map.appendChild(el);
  });
}

// After drawing the map spots, update the weather overlay based on wet percentage
function refreshWeatherOverlay() {
  const overlay = map.querySelector('.map-overlay');
  if (!overlay) return;

  // create gradient stops based on spots; wet spots produce green/blue glows,
  // dry spots produce orange/red glows. Position them relative to the map.
  const stops = mapSpots.map((s) => {
    const px = s.x; // percent
    const py = s.y;
    if (s.wet) {
      return `radial-gradient(circle at ${px}% ${py}%, rgba(79,203,83,0.9) 0%, rgba(46,157,247,0.12) 20%, transparent 40%)`;
    } else {
      return `radial-gradient(circle at ${px}% ${py}%, rgba(245,64,44,0.9) 0%, rgba(255,144,42,0.14) 20%, transparent 40%)`;
    }
  });

  // combine gradients so the overlay reflects all spots
  overlay.style.background = stops.join(', ');

  // overall wetness for global weather state
  const wetCount = mapSpots.filter(s => s.wet).length;
  const percentWet = mapSpots.length ? wetCount / mapSpots.length : 0;
  updateWeather(percentWet);
}

function updateWeather(percentWet) {
  if (percentWet > 0.66) {
    map.setAttribute('data-weather', 'wet');
  } else if (percentWet > 0.33) {
    map.setAttribute('data-weather', 'medium');
  } else {
    map.setAttribute('data-weather', 'dry');
  }
}


// --- Build Well ---
function buildWell(id, el) {
  if (gameOver) return;

  const spot = mapSpots.find(s => s.id === id);
  if (spot.wet) {
    statusText.textContent = "This well already provides clean water!";
    return;
  }
  if (funds < 50) {
    statusText.textContent = "Not enough funds to build here!";
    return;
  }

  funds -= 50;
  updateDisplay();
  statusText.textContent = "Building well...";
  setTimeout(() => {
    spot.wet = true;
    const savedNow = spot.villagers;
    villagersSaved += savedNow;
    spot.villagers = 0;
    el.classList.remove('dry');
    el.classList.add('wet');
    statusText.textContent = `Well complete! Villagers changed: +${savedNow}`;
    updateDisplay();
    saveMap();
    refreshWeatherOverlay();
    checkWinLose();
  }, 1000);
}

// --- Villager Progress Bar ---
const villagerProgress = document.getElementById('villagerProgress');
const villagerProgressLabel = document.getElementById('villagerProgressLabel');
let totalVillagers = 1000;
let villagersAlive = totalVillagers;

// --- Villager Decay Loop ---
setInterval(() => {
  if (gameOver) return;

  // Random number of villagers die each tick
  const lost = Math.floor(Math.random() * 11) + 10; // 10-20
  villagersAlive -= lost;
  if (villagersAlive < 0) villagersAlive = 0;

  // Update progress bar
  const percent = Math.max(0, Math.min(1, villagersAlive / totalVillagers));
  if (villagerProgress) villagerProgress.style.width = `${percent * 100}%`;
  if (villagerProgressLabel) villagerProgressLabel.textContent = `${villagersAlive} villagers alive`;

  updateDisplay();
  checkWinLose();
}, 1000);

// --- Fundraising Countdown ---
let fundraiserSeconds = 60;
setInterval(() => {
  if (gameOver) return;
  fundraiserSeconds--;
  if (fundraiseCountdown) fundraiseCountdown.textContent = fundraiserSeconds;
  if (fundraiserSeconds <= 0) {
  funds += 50;
  updateDisplay();
  const msg = document.createElement('p');
  msg.textContent = `💛 Fundraising added +${currencySymbol.textContent}50!`;
    msg.style.fontSize = "0.9rem";
    msg.style.color = "#00a8b5";
    statusText.parentElement.insertBefore(msg, statusText.nextSibling);
    setTimeout(() => msg.remove(), 4000);
    fundraiserSeconds = 60;
    if (fundraiseCountdown) fundraiseCountdown.textContent = fundraiserSeconds;
  }
}, 1000);

// --- Digging Progress ---
let digProgress = 0;
buildBtn.addEventListener('click', () => {
  if (gameOver) return;
  digProgress += 5;
  if (digProgress > 100) digProgress = 100;
  progressBar.style.width = digProgress + '%';
  statusText.textContent = `Digging... (${digProgress}%)`;
  if (digProgress >= 100) {
  funds += 50;
  updateDisplay();
  statusText.textContent = `You found treasure! +${currencySymbol.textContent}50`;
    setTimeout(() => {
      statusText.textContent = 'Click a dry spot to build a well 💧';
    }, 2000);
    digProgress = 0;
    progressBar.style.width = '0%';
  }
});

// --- Update Display & Save ---
function updateDisplay() {
  const totalSaved = (livesSaved || 0) + (villagersSaved || 0);
  fundsDisplay.textContent = funds.toLocaleString();
  wellsDisplay.textContent = wellsBuilt;
  livesDisplay.textContent = totalSaved.toLocaleString();
  // persist both counters and other state
  localStorage.setItem('funds', funds);
  localStorage.setItem('wells', wellsBuilt);
  localStorage.setItem('livesSaved', livesSaved);
  localStorage.setItem('villagersSaved', villagersSaved);
  localStorage.setItem('currency', currency);
}

// --- Save Map ---
function saveMap() {
  localStorage.setItem('mapSpots', JSON.stringify(mapSpots));
}

// --- Check Win / Lose ---
function checkWinLose() {
  if (gameOver) return;

  const totalVillagers = mapSpots.reduce((sum, s) => sum + s.initial, 0);
  const savedVillagers = villagersSaved + mapSpots.filter(s => s.wet).reduce((sum,s)=>sum+s.initial,0);

  if (savedVillagers >= totalVillagers) {
    gameOver = true;
    statusText.textContent = "🎉 You saved everyone! The village thrives 💧👥";
  }

  const remainingVillagers = mapSpots.reduce((sum, s) => sum + s.villagers, 0);
  if (remainingVillagers + villagersSaved < totalVillagers * 0.5) {
    gameOver = true;
    statusText.textContent = "💔 Too many villagers lost… The village suffers.";
  }
}

// --- Reset Game Button ---
resetBtn.addEventListener('click', () => {
  if (!confirm("Are you sure you want to reset your progress?")) return;

  funds = 100;
  villagersSaved = 0;
  gameOver = false;
  initMap();
  drawMap();
  refreshWeatherOverlay();
  localStorage.clear();
  updateDisplay();
  statusText.textContent = "Game reset! Start building again 💧";
});
