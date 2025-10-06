// --- Base Variables ---
let coins = 100;
let villagersSaved = 0;
let mapSpots = [];
const numSpots = 6; // number of spots/wells
let gameOver = false;

// --- Elements ---
const coinsDisplay = document.getElementById('coins');
const villagersDisplay = document.getElementById('villagers');
const statusText = document.getElementById('status');
const map = document.getElementById('map');
const resetBtn = document.getElementById('resetBtn');
const buildBtn = document.getElementById('buildBtn');
const progressBar = document.getElementById('progressBar');
const fundraiseCountdown = document.getElementById('fundraiseCountdown');

// --- Load Game ---
window.addEventListener('load', () => {
  const savedCoins = localStorage.getItem('coins');
  const savedVillagers = localStorage.getItem('villagers');
  const savedMap = JSON.parse(localStorage.getItem('mapSpots'));

  if (savedCoins) coins = parseInt(savedCoins);
  if (savedVillagers) villagersSaved = parseInt(savedVillagers);

  if (savedMap) {
    mapSpots = savedMap;
  } else {
    initMap();
  }

  drawMap();
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
  mapSpots.forEach((spot) => {
    const el = document.createElement('div');
    el.classList.add('spot');
    el.classList.add(spot.wet ? 'wet' : 'dry');
    el.style.left = `${spot.x}%`;
    el.style.top = `${spot.y}%`;

    el.addEventListener('click', () => buildWell(spot.id, el));
    map.appendChild(el);
  });
}

// --- Build Well ---
function buildWell(id, el) {
  if (gameOver) return;

  const spot = mapSpots.find(s => s.id === id);
  if (spot.wet) {
    statusText.textContent = "This well already provides clean water!";
    return;
  }
  if (coins < 50) {
    statusText.textContent = "Not enough coins to build here!";
    return;
  }

  coins -= 50;
  updateDisplay();
  statusText.textContent = "Building well...";
  setTimeout(() => {
    spot.wet = true;
    villagersSaved += spot.villagers;
    spot.villagers = 0;
    el.classList.remove('dry');
    el.classList.add('wet');
    statusText.textContent = `Well complete! Villagers saved: +${spot.villagers}`;
    updateDisplay();
    saveMap();
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
  villagerProgress.style.width = `${percent * 100}%`;
  villagerProgressLabel.textContent = `${villagersAlive} villagers alive`;

  updateDisplay();
  checkWinLose();
}, 1000);

// --- Fundraising Countdown ---
let fundraiserSeconds = 60;
setInterval(() => {
  if (gameOver) return;
  fundraiserSeconds--;
  fundraiseCountdown.textContent = fundraiserSeconds;
  if (fundraiserSeconds <= 0) {
    coins += 50;
    updateDisplay();
    const msg = document.createElement('p');
    msg.textContent = "💛 Fundraising added +50 coins!";
    msg.style.fontSize = "0.9rem";
    msg.style.color = "#00a8b5";
    statusText.parentElement.insertBefore(msg, statusText.nextSibling);
    setTimeout(() => msg.remove(), 4000);
    fundraiserSeconds = 60;
    fundraiseCountdown.textContent = fundraiserSeconds;
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
    coins += 50;
    updateDisplay();
    statusText.textContent = 'You found treasure! +50 coins';
    setTimeout(() => {
      statusText.textContent = 'Click a dry spot to build a well 💧';
    }, 2000);
    digProgress = 0;
    progressBar.style.width = '0%';
  }
});

// --- Update Display & Save ---
function updateDisplay() {
  coinsDisplay.textContent = coins;
  villagersDisplay.textContent = villagersSaved;
  localStorage.setItem('coins', coins);
  localStorage.setItem('villagers', villagersSaved);
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

  coins = 100;
  villagersSaved = 0;
  gameOver = false;
  initMap();
  drawMap();
  localStorage.clear();
  updateDisplay();
  statusText.textContent = "Game reset! Start building again 💧";
});
