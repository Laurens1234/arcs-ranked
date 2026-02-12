// Dice Calculator App

// Define dice data
const SkirmishDie = {
  sides: [
    { count: { hit: 0, miss: 1, key: 0, selfhit: 0, intercept: 0, buildinghit: 0 } },
    { count: { hit: 0, miss: 1, key: 0, selfhit: 0, intercept: 0, buildinghit: 0 } },
    { count: { hit: 0, miss: 1, key: 0, selfhit: 0, intercept: 0, buildinghit: 0 } },
    { count: { hit: 1, miss: 0, key: 0, selfhit: 0, intercept: 0, buildinghit: 0 } },
    { count: { hit: 1, miss: 0, key: 0, selfhit: 0, intercept: 0, buildinghit: 0 } },
    { count: { hit: 1, miss: 0, key: 0, selfhit: 0, intercept: 0, buildinghit: 0 } },
  ]
};

const AssaultDie = {
  sides: [
    { count: { hit: 0, miss: 1, key: 0, selfhit: 0, intercept: 0, buildinghit: 0 } },
    { count: { hit: 1, miss: 0, key: 0, selfhit: 1, intercept: 0, buildinghit: 0 } },
    { count: { hit: 1, miss: 0, key: 0, selfhit: 0, intercept: 1, buildinghit: 0 } },
    { count: { hit: 2, miss: 0, key: 0, selfhit: 1, intercept: 0, buildinghit: 0 } },
    { count: { hit: 2, miss: 0, key: 0, selfhit: 0, intercept: 0, buildinghit: 0 } },
    { count: { hit: 1, miss: 0, key: 0, selfhit: 1, intercept: 0, buildinghit: 0 } },
  ]
};

const RaidDie = {
  sides: [
    { count: { hit: 0, miss: 0, key: 2, selfhit: 0, intercept: 1, buildinghit: 0 } },
    { count: { hit: 0, miss: 0, key: 1, selfhit: 1, intercept: 0, buildinghit: 0 } },
    { count: { hit: 0, miss: 0, key: 0, selfhit: 0, intercept: 1, buildinghit: 1 } },
    { count: { hit: 0, miss: 0, key: 0, selfhit: 1, intercept: 0, buildinghit: 1 } },
    { count: { hit: 0, miss: 0, key: 1, selfhit: 0, intercept: 0, buildinghit: 1 } },
    { count: { hit: 0, miss: 0, key: 0, selfhit: 1, intercept: 0, buildinghit: 1 } },
  ]
};

// Count icons from currently displayed dice faces
function countRolledIcons() {
  // Check if any dice still have letter overlays (haven't been rolled)
  const allDice = [
    ...Array.from(assaultVisual.children),
    ...Array.from(skirmishVisual.children),
    ...Array.from(raidVisual.children)
  ];
  
  const hasUnrolledDice = allDice.some(die => die.querySelector('.dice-text-overlay'));
  
  if (hasUnrolledDice) {
    // Return 0 for all icons if any dice haven't been rolled
    return {
      hit: 0,
      selfhit: 0,
      intercept: 0,
      key: 0,
      buildinghit: 0
    };
  }

  const iconCounts = {
    hit: 0,
    selfhit: 0,
    intercept: 0,
    key: 0,
    buildinghit: 0
  };

  // Count from assault dice
  Array.from(assaultVisual.children).forEach(die => {
    const faceIndex = parseInt(die.dataset.faceIndex);
    if (!isNaN(faceIndex) && AssaultDie.sides[faceIndex]) {
      const side = AssaultDie.sides[faceIndex];
      Object.keys(iconCounts).forEach(icon => {
        iconCounts[icon] += side.count[icon] || 0;
      });
    }
  });

  // Count from skirmish dice
  Array.from(skirmishVisual.children).forEach(die => {
    const faceIndex = parseInt(die.dataset.faceIndex);
    if (!isNaN(faceIndex) && SkirmishDie.sides[faceIndex]) {
      const side = SkirmishDie.sides[faceIndex];
      Object.keys(iconCounts).forEach(icon => {
        iconCounts[icon] += side.count[icon] || 0;
      });
    }
  });

  // Count from raid dice
  Array.from(raidVisual.children).forEach(die => {
    const faceIndex = parseInt(die.dataset.faceIndex);
    if (!isNaN(faceIndex) && RaidDie.sides[faceIndex]) {
      const side = RaidDie.sides[faceIndex];
      Object.keys(iconCounts).forEach(icon => {
        iconCounts[icon] += side.count[icon] || 0;
      });
    }
  });

  return iconCounts;
}

// Helper function to round numbers
function round(num, toPercent = false) {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'decimal',
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
  if (toPercent) {
    num = num * 100;
  }
  let res = formatter.format(num);
  if (toPercent && res === '100') {
    res = '99.99';
  }
  return res;
}

// Compute expected value for an icon
function computeExpectedValue(icon, assaultDiceCount, skirmishDiceCount, raidDiceCount) {
  const assault = AssaultDie.sides.map(side => side.count[icon]);
  const skirmish = SkirmishDie.sides.map(side => side.count[icon]);
  const raid = RaidDie.sides.map(side => side.count[icon]);

  let expected = 0;
  
  // Add expected value from assault dice
  for (let i = 0; i < assaultDiceCount; i++) {
    expected += assault.reduce((sum, val) => sum + val, 0) / assault.length;
  }
  
  // Add expected value from skirmish dice (only for hit)
  if (icon === 'hit') {
    for (let i = 0; i < skirmishDiceCount; i++) {
      expected += skirmish.reduce((sum, val) => sum + val, 0) / skirmish.length;
    }
  }
  
  // Add expected value from raid dice (for key, selfhit, intercept, buildinghit)
  if (icon !== 'hit') {
    for (let i = 0; i < raidDiceCount; i++) {
      expected += raid.reduce((sum, val) => sum + val, 0) / raid.length;
    }
  }
  
  return expected;
}

// Update results display automatically
function updateResults() {
  const assault = assaultVisual.children.length;
  const skirmish = skirmishVisual.children.length;
  const raid = raidVisual.children.length;
  
  // Get current threshold from existing dropdown if it exists, otherwise default to 1
  const existingThresholdSelect = document.getElementById('thresholdSelect');
  const threshold = existingThresholdSelect ? parseInt(existingThresholdSelect.value) : 1;

  // Define all icon types with their display names and image paths
  const allIcons = [
    { key: 'hit', name: 'Hit', image: './dice/images/hit.png' },
    { key: 'selfhit', name: 'Self-Hit', image: './dice/images/selfhit.png' },
    { key: 'intercept', name: 'Intercept', image: './dice/images/intercept.png' },
    { key: 'key', name: 'Key', image: './dice/images/key.png' },
    { key: 'buildinghit', name: 'Building Hit', image: './dice/images/buildinghit.png' }
  ];

  // Calculate total dice count and rolled icon counts
  const totalDice = assault + skirmish + raid;
  const rolledIcons = countRolledIcons();
  
  // Check if any dice are unrolled
  const allDice = [
    ...Array.from(assaultVisual.children),
    ...Array.from(skirmishVisual.children),
    ...Array.from(raidVisual.children)
  ];
  const hasUnrolledDice = allDice.some(die => die.querySelector('.dice-text-overlay'));

  // Generate results for all icons
  const results = allIcons.map(icon => {
    const expected = computeExpectedValue(icon.key, assault, skirmish, raid);
    const prob = computeProbabilityAtLeastN(icon.key, assault, skirmish, raid, threshold);
    const percent = round(prob, true);
    const rolledCount = rolledIcons[icon.key] || 0;

    // Compute PMF for chart
    const pmf = computePMF(icon.key, assault, skirmish, raid);
    const maxProb = Math.max(...pmf);
    const chartBars = pmf.map((p, i) => {
      const height = maxProb > 0 ? (p / maxProb) * 20 : 0; // 20px max height
      return `<div class="pmf-bar" style="height: ${height}px;" title="${i}: ${(p * 100).toFixed(1)}%"></div>`;
    }).join('');

    return `
      <div class="icon-result">
        <div class="result-ev">${round(expected)}</div>
        <img src="${icon.image}" alt="${icon.name}" class="result-icon">
        <div class="result-chance">${percent}%</div>
        <div class="result-rolled">${rolledCount}${!hasUnrolledDice ? ' <img src="' + icon.image + '" alt="' + icon.name + '" class="result-rolled-icon">' : ''}</div>
      </div>
    `;
  }).join('');

  resultEl.innerHTML = `
    <div class="results-table">
      <div class="results-header">
        <div class="header-ev">EV</div>
        <div class="header-icon">Icon</div>
        <div class="header-chance">
          Chance ≥
          <select id="thresholdSelect" class="header-select">
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">5</option>
            <option value="6">6</option>
            <option value="7">7</option>
            <option value="8">8</option>
            <option value="9">9</option>
            <option value="10">10</option>
          </select>
        </div>
        <div class="header-rolled">Rolled</div>
      </div>
      ${results}
    </div>
  `;

  // Re-attach the event listener to the newly created dropdown
  const newThresholdSelect = document.getElementById('thresholdSelect');
  newThresholdSelect.value = threshold;
  newThresholdSelect.addEventListener('change', updateResults);

  // Show/hide clear buttons based on dice count
  document.getElementById('assaultClear').style.display = assault > 0 ? 'flex' : 'none';
  document.getElementById('skirmishClear').style.display = skirmish > 0 ? 'flex' : 'none';
  document.getElementById('raidClear').style.display = raid > 0 ? 'flex' : 'none';

  // Update bell curves section
  const bellCurvesEl = document.getElementById('bellCurvesSection');
  if (totalDice > 0) {
    const bellCurves = allIcons.map(icon => {
      const pmf = computePMF(icon.key, assault, skirmish, raid);
      const maxProb = Math.max(...pmf);
      
      // Don't show chart if one outcome has 100% probability
      if (maxProb === 1) {
        return `
          <div class="bell-curve-item">
            <div class="bell-curve-header">
              <img src="${icon.image}" alt="${icon.name}" class="bell-curve-icon">
              <span>${icon.name}</span>
            </div>
            <div class="bell-curve-deterministic">100% chance of ${pmf.indexOf(1)} ${icon.name.toLowerCase()}(s)</div>
          </div>
        `;
      }
      
      // Calculate bar width based on number of bars and available space
      const numBars = pmf.length;
      const maxTotalWidth = 600; // Maximum total width for all bars in pixels
      const minBarWidth = 30; // Minimum bar width
      const maxBarWidth = 120; // Maximum bar width
      
      let barWidth;
      if (numBars * maxBarWidth <= maxTotalWidth) {
        // If all bars can fit at max width, use max width
        barWidth = maxBarWidth;
      } else if (numBars * minBarWidth <= maxTotalWidth) {
        // If bars can fit at min width, distribute space evenly
        barWidth = Math.floor(maxTotalWidth / numBars);
      } else {
        // If even min width is too much, use min width (chart will scroll)
        barWidth = minBarWidth;
      }
      
      barWidth = `${barWidth}px`;
      
      const chartBars = pmf.map((p, i) => {
        const height = maxProb > 0 ? (p / maxProb) * 120 : 0; // 120px max height
        const percent = (p * 100).toFixed(1);
        return `
          <div class="bell-curve-bar-container" style="width: ${barWidth};">
            <div class="bell-curve-bar" style="height: ${height}px;" title="${i}: ${percent}%"></div>
            <div class="bell-curve-label">${i}</div>
            <div class="bell-curve-percent">${percent}%</div>
          </div>
        `;
      }).join('');

      return `
        <div class="bell-curve-item">
          <div class="bell-curve-header">
            <img src="${icon.image}" alt="${icon.name}" class="bell-curve-icon">
            <span>${icon.name}</span>
          </div>
          <div class="bell-curve-chart">${chartBars}</div>
        </div>
      `;
    }).join('');

    bellCurvesEl.innerHTML = `
      <h3 class="bell-curves-title">Probability Distributions</h3>
      <div class="bell-curves-container">${bellCurves}</div>
    `;
  } else {
    bellCurvesEl.innerHTML = '';
  }
}

// Compute probability mass function for an icon
function computePMF(icon, assaultDiceCount, skirmishDiceCount, raidDiceCount) {
  const assault = AssaultDie.sides.map(side => side.count[icon]);
  const skirmish = SkirmishDie.sides.map(side => side.count[icon]);
  const raid = RaidDie.sides.map(side => side.count[icon]);

  const dice1Sides = assault;
  const countDice1 = assaultDiceCount;
  let dice2Sides;
  let countDice2;
  if (icon === 'hit') {
    dice2Sides = skirmish;
    countDice2 = skirmishDiceCount;
  } else {
    dice2Sides = raid;
    countDice2 = raidDiceCount;
  }

  const maxSum = Math.max(...dice1Sides) * countDice1 + Math.max(...dice2Sides) * countDice2;

  const pmf = (sides) => {
    const counts = {};
    const probabilities = {};
    const totalSides = sides.length;
    sides.forEach(side => {
      counts[side] = (counts[side] || 0) + 1;
    });
    for (const [side, count] of Object.entries(counts)) {
      probabilities[parseInt(side)] = count / totalSides;
    }
    return probabilities;
  };

  const P1 = Array(maxSum + 1).fill(0);
  const P2 = Array(maxSum + 1).fill(0);
  P1[0] = 1;
  P2[0] = 1;

  const updateProbabilities = (P, pmf, diceCount) => {
    for (let i = 1; i <= diceCount; i++) {
      const newP = Array(maxSum + 1).fill(0);
      for (let s = 0; s <= maxSum; s++) {
        for (const [side, prob] of Object.entries(pmf)) {
          const sideNum = parseInt(side);
          if (s >= sideNum) {
            newP[s] += prob * P[s - sideNum];
          }
        }
      }
      for (let s = 0; s <= maxSum; s++) {
        P[s] = newP[s];
      }
    }
  };

  updateProbabilities(P1, pmf(dice1Sides), countDice1);
  updateProbabilities(P2, pmf(dice2Sides), countDice2);

  const pmfResult = Array(maxSum + 1).fill(0);
  for (let s = 0; s <= maxSum; s++) {
    for (let x = 0; x <= s; x++) {
      pmfResult[s] += P1[x] * P2[s - x];
    }
  }

  return pmfResult;
}

// Compute probability of at least N for an icon
function computeProbabilityAtLeastN(icon, assaultDiceCount, skirmishDiceCount, raidDiceCount, desiredSum) {
  const assault = AssaultDie.sides.map(side => side.count[icon]);
  const skirmish = SkirmishDie.sides.map(side => side.count[icon]);
  const raid = RaidDie.sides.map(side => side.count[icon]);

  const dice1Sides = assault;
  const countDice1 = assaultDiceCount;
  let dice2Sides;
  let countDice2;
  if (icon === 'hit') {
    dice2Sides = skirmish;
    countDice2 = skirmishDiceCount;
  } else {
    dice2Sides = raid;
    countDice2 = raidDiceCount;
  }

  const maxSum = desiredSum - 1;

  const pmf = (sides) => {
    const counts = {};
    const probabilities = {};
    const totalSides = sides.length;
    sides.forEach(side => {
      counts[side] = (counts[side] || 0) + 1;
    });
    for (const [side, count] of Object.entries(counts)) {
      probabilities[parseInt(side)] = count / totalSides;
    }
    return probabilities;
  };

  const P1 = Array(maxSum + 1).fill(0);
  const P2 = Array(maxSum + 1).fill(0);
  P1[0] = 1;
  P2[0] = 1;

  const pmf1 = pmf(dice1Sides);
  const pmf2 = pmf(dice2Sides);

  const updateProbabilities = (P, pmf, diceCount) => {
    for (let i = 1; i <= diceCount; i++) {
      const newP = Array(maxSum + 1).fill(0);
      for (let s = 0; s <= maxSum; s++) {
        for (const [side, prob] of Object.entries(pmf)) {
          const sideNum = parseInt(side);
          if (s >= sideNum) {
            newP[s] += prob * P[s - sideNum];
          }
        }
      }
      for (let s = 0; s <= maxSum; s++) {
        P[s] = newP[s];
      }
    }
  };

  updateProbabilities(P1, pmf1, countDice1);
  updateProbabilities(P2, pmf2, countDice2);

  const PCombined = Array(maxSum + 1).fill(0);
  for (let s = 0; s <= maxSum; s++) {
    for (let x = 0; x <= s; x++) {
      PCombined[s] += P1[x] * P2[s - x];
    }
  }

  let probability = 1;
  for (let s = 0; s <= maxSum; s++) {
    probability -= PCombined[s];
  }

  if (probability < 0.0000009) {
    probability = 0;
  }

  return probability;
}

// DOM elements
const statusEl = document.getElementById('status');
const calculateBtn = document.getElementById('calculateBtn');
const resultEl = document.getElementById('result');
const rollBtn = document.getElementById('rollDiceBtn');

// Visual dice containers
const assaultVisual = document.getElementById('assaultVisual');
const skirmishVisual = document.getElementById('skirmishVisual');
const raidVisual = document.getElementById('raidVisual');

// Buttons
// const assaultPlus = document.getElementById('assaultPlus');
// const assaultMinus = document.getElementById('assaultMinus');
// const skirmishPlus = document.getElementById('skirmishPlus');
// const skirmishMinus = document.getElementById('skirmishMinus');
// const raidPlus = document.getElementById('raidPlus');
// const raidMinus = document.getElementById('raidMinus');

// Other inputs
// const iconSelectEl = document.getElementById('iconSelect'); // Removed - no longer used
// const thresholdSelectEl = document.getElementById('thresholdSelect'); // Now created dynamically in results

// Die image paths and face positions (individual face images)
const dieData = {
  assault: {
    faces: [
      { image: './dice/faces/assault-die_r1_c0.png' }, // 2 hits
      { image: './dice/faces/assault-die_r1_c1.png' }, // 2 hits + self-hit
      { image: './dice/faces/assault-die_r1_c2.png' }, // hit + intercept
      { image: './dice/faces/assault-die_r2_c0.png' }, // hit + self-hit
      { image: './dice/faces/assault-die_r2_c1.png' }, // hit + self-hit
      { image: './dice/faces/assault-die_r2_c2.png' }, // miss
    ]
  },
  skirmish: {
    faces: [
      { image: './dice/faces/skirmish-die_r1_c0.png' }, // miss
      { image: './dice/faces/skirmish-die_r1_c1.png' }, // miss
      { image: './dice/faces/skirmish-die_r1_c2.png' }, // miss
      { image: './dice/faces/skirmish-die_r2_c0.png' }, // hit
      { image: './dice/faces/skirmish-die_r2_c1.png' }, // hit
      { image: './dice/faces/skirmish-die_r2_c2.png' }, // hit
    ]
  },
  raid: {
    faces: [
      { image: './dice/faces/raid-die_r1_c0.png' }, // 2 keys + intercept
      { image: './dice/faces/raid-die_r1_c1.png' }, // key + self-hit
      { image: './dice/faces/raid-die_r1_c2.png' }, // key + building hit
      { image: './dice/faces/raid-die_r2_c0.png' }, // self-hit + building hit
      { image: './dice/faces/raid-die_r2_c1.png' }, // self-hit + building hit
      { image: './dice/faces/raid-die_r2_c2.png' }, // intercept
    ]
  }
};

// Create a visual die element showing specific face
function createDieElement(type, faceIndex = null) {
  const die = document.createElement('div');
  die.className = 'dice-icon';
  
  // Store the current face index and type on the element
  die.dataset.dieType = type;
  die.dataset.faceIndex = faceIndex;
  
  const data = dieData[type];
  if (data && faceIndex !== null && data.faces[faceIndex]) {
    // For unrolled dice, always use r0_c0 image
    const face = { image: './dice/faces/' + type + '-die_r0_c0.png' };
    die.style.backgroundImage = `url(${face.image})`;
    die.style.backgroundSize = 'contain';
    die.style.backgroundRepeat = 'no-repeat';
    die.style.backgroundPosition = 'center';
    die.title = `${type.charAt(0).toUpperCase() + type.slice(1)} Die - Unrolled`;
  } else {
    // Fallback to full image
    die.style.backgroundImage = `url(${data ? data.image : './dice/images/' + type + '-die.png'})`;
    die.title = `${type.charAt(0).toUpperCase() + type.slice(1)} Die`;
  }
  
  // Add text overlay with first letter of dice type
  const textOverlay = document.createElement('div');
  textOverlay.className = 'dice-text-overlay';
  textOverlay.textContent = type.charAt(0).toUpperCase();
  die.appendChild(textOverlay);
  
  // Add click listener to remove the die when clicked
  die.addEventListener('click', () => {
    die.remove();
    updateResults();
  });
  
  return die;
}

// Dice label button event listeners (add dice when clicked)
document.getElementById('assaultLabel').addEventListener('click', () => {
  // Check if we already have 6 assault dice
  if (assaultVisual.children.length >= 6) {
    return; // Don't add more than 6
  }

  const die = createDieElement('assault', 0); // Always spawn with face 0 (r0c0)
  assaultVisual.appendChild(die);

  updateResults();
});

document.getElementById('skirmishLabel').addEventListener('click', () => {
  // Check if we already have 6 skirmish dice
  if (skirmishVisual.children.length >= 6) {
    return; // Don't add more than 6
  }

  const die = createDieElement('skirmish', 0); // Always spawn with face 0 (r0c0)
  skirmishVisual.appendChild(die);

  updateResults();
});

document.getElementById('raidLabel').addEventListener('click', () => {
  // Check if we already have 6 raid dice
  if (raidVisual.children.length >= 6) {
    return; // Don't add more than 6
  }

  const die = createDieElement('raid', 0); // Always spawn with face 0 (r0c0)
  raidVisual.appendChild(die);

  updateResults();
});

// Clear button event listeners (clear all dice in the row)
document.getElementById('assaultClear').addEventListener('click', () => {
  assaultVisual.innerHTML = '';
  updateResults();
});

document.getElementById('skirmishClear').addEventListener('click', () => {
  skirmishVisual.innerHTML = '';
  updateResults();
});

document.getElementById('raidClear').addEventListener('click', () => {
  raidVisual.innerHTML = '';
  updateResults();
});

// Theme toggle
const themeToggle = document.getElementById('themeToggle');
const html = document.documentElement;

const savedTheme = localStorage.getItem('theme') || 'dark';
html.setAttribute('data-theme', savedTheme);

themeToggle.addEventListener('click', () => {
  const currentTheme = html.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
});

// Icon select and desired sum change listeners (removed - now showing all icons)
// iconSelectEl.addEventListener('change', updateResults);
// desiredSumEl.addEventListener('change', updateResults);

// Threshold select change listener (now handled dynamically in updateResults)

// Calculate button (removed - now automatic)
// calculateBtn.addEventListener('click', () => {
//   const assault = assaultVisual.children.length;
//   const skirmish = skirmishVisual.children.length;
//   const raid = raidVisual.children.length;
//   const icon = iconSelectEl.value;
//   const desired = parseInt(desiredSumEl.value) || 1;

//   const prob = computeProbabilityAtLeastN(icon, assault, skirmish, raid, desired);
//   const percent = round(prob, true);

//   resultEl.textContent = `Probability of at least ${desired} ${icon}(s): ${percent}%`;
// });

// Roll button
rollBtn.addEventListener('click', () => {
  // Roll all assault dice
  Array.from(assaultVisual.children).forEach(die => {
    const randomFace = Math.floor(Math.random() * 6);
    const face = dieData.assault.faces[randomFace];
    die.style.backgroundImage = `url(${face.image})`;
    die.dataset.faceIndex = randomFace; // Update stored face index
    // Remove the letter overlay after rolling
    const overlay = die.querySelector('.dice-text-overlay');
    if (overlay) {
      overlay.remove();
    }
  });

  // Roll all skirmish dice
  Array.from(skirmishVisual.children).forEach(die => {
    const randomFace = Math.floor(Math.random() * 6);
    const face = dieData.skirmish.faces[randomFace];
    die.style.backgroundImage = `url(${face.image})`;
    die.dataset.faceIndex = randomFace; // Update stored face index
    // Remove the letter overlay after rolling
    const overlay = die.querySelector('.dice-text-overlay');
    if (overlay) {
      overlay.remove();
    }
  });

  // Roll all raid dice
  Array.from(raidVisual.children).forEach(die => {
    const randomFace = Math.floor(Math.random() * 6);
    const face = dieData.raid.faces[randomFace];
    die.style.backgroundImage = `url(${face.image})`;
    die.dataset.faceIndex = randomFace; // Update stored face index
    // Remove the letter overlay after rolling
    const overlay = die.querySelector('.dice-text-overlay');
    if (overlay) {
      overlay.remove();
    }
  });

  updateResults(); // Update the results table with rolled counts
});

// Reset all
document.getElementById('resetAllBtn').addEventListener('click', () => {
  assaultVisual.innerHTML = '';
  skirmishVisual.innerHTML = '';
  raidVisual.innerHTML = '';
  resultEl.innerHTML = '';
  // desiredSumEl.value = '1'; // Removed - no longer used
  // thresholdSelectEl.value = '1'; // Now handled in updateResults
  // iconSelectEl.value = 'hit'; // Removed - no longer used
});

// Initialize
updateResults(); // Show initial results

// Hide status
statusEl.style.display = 'none';