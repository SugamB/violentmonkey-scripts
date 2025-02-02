// ==UserScript==
// @name        NYT Crossword Navigator
// @namespace   Violentmonkey Scripts
// @match       https://www.nytimes.com/crosswords/game/mini*
// @match       https://www.nytimes.com/crosswords/game/paid/easy-mode*
// @grant       none
// @version     1.9.2
// @author      SugamB
// @description A lightweight helper to quickly select Mini puzzle dates or Easy Mode, pick a random puzzle, or jump to latest puzzle – all with a neat tabbed interface.
// ==/UserScript==

(function() {
    'use strict';

    /* ─────────────────────────────
       Helper Functions & Base Styles
    ───────────────────────────── */
    function createElement(tag, attributes, children) {
      const element = document.createElement(tag);
      Object.assign(element, attributes);
      if (children) {
        children.forEach(child => element.appendChild(child));
      }
      return element;
    }

    // Format date as YYYY/MM/DD (for URL slug)
    function formatDateForURL(date) {
      return date.getFullYear() +
        '/' +
        String(date.getMonth() + 1).padStart(2, '0') +
        '/' +
        String(date.getDate()).padStart(2, '0');
    }

    // Format date as "YYYY-MM-DD" for a date input.
    function formatDateForInput(date) {
      return date.getFullYear() +
        '-' +
        String(date.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(date.getDate()).padStart(2, '0');
    }

    // Utility: format date as "Day, Mon DD, YYYY" for display
    function formatLongDate(date) {
      return date.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    }

    // Get Eastern Time components reliably using Intl.
    function getEasternComponents() {
      const now = new Date();
      const options = {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      };
      const parts = new Intl.DateTimeFormat("en-US", options).formatToParts(now);
      const data = {};
      for (const { type, value } of parts) {
        data[type] = value;
      }
      return data;
    }

    // Compute effective "today" for Mini puzzles.
    // We assume that the puzzle for the current calendar day (in EST) is available
    // until 10 PM EST, at which point the next day's puzzle becomes available.
    function getEffectiveMiniDate() {
      const comp = getEasternComponents();
      const hour = Number(comp.hour);
      // Create a Date based on Eastern calendar parts (treating these as local values)
      const easternToday = new Date(`${comp.year}-${comp.month}-${comp.day}T00:00:00`);
      // If current EST time is 10 PM or later, the next day's puzzle is available.
      if (hour >= 22) {
        easternToday.setDate(easternToday.getDate() + 1);
      }
      return easternToday;
    }

    // For mini puzzles: parse date from URL (/mini/YYYY/MM/DD)
    // If not found, return the effective mini date.
    function getMiniDateFromURL() {
      const url = window.location.href;
      const dateMatch = url.match(/\/mini\/(\d{4}\/\d{2}\/\d{2})/);
      if (dateMatch) {
        const parts = dateMatch[1].split('/');
        return new Date(parts[0], parts[1] - 1, parts[2]);
      } else {
        return getEffectiveMiniDate();
      }
    }

    // Navigate to a mini puzzle date (always using the URL slug version)
    function navigateToMiniDate(date) {
      const urlDate = formatDateForURL(date);
      window.location.href = `https://www.nytimes.com/crosswords/game/mini/${urlDate}`;
    }

    // For Easy Mode: extract puzzle number from URL
    function getEasyModePuzzleNumber() {
      const url = window.location.href;
      let match = url.match(/\/easy-mode-puzzle-(\d+)/);
      if (match) return Number(match[1]);
      match = url.match(/\/easy-mode-(\d+)/);
      if (match) return Number(match[1]);
      return null;
    }

    // Navigate to an Easy Mode puzzle number (slug changes at 42)
    function navigateToEasyModePuzzle(num) {
      const slug = num < 42 ? `easy-mode-puzzle-${num}` : `easy-mode-${num}`;
      window.location.href = `https://www.nytimes.com/crosswords/game/paid/${slug}`;
    }

    // Draggable functionality – makes the given container draggable by a handle.
    // Persists the position to localStorage on mouseup.
    function makeDraggable(container, handle) {
      let mouseX = 0, mouseY = 0;
      let isDragging = false;
      handle.addEventListener('mousedown', dragMouseDown);
      function dragMouseDown(e) {
        isDragging = false;
        mouseX = e.clientX;
        mouseY = e.clientY;
        document.addEventListener('mousemove', elementDrag);
        document.addEventListener('mouseup', closeDragElement);
      }
      function elementDrag(e) {
        e.preventDefault();
        const dx = e.clientX - mouseX;
        const dy = e.clientY - mouseY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          isDragging = true;
        }
        mouseX = e.clientX;
        mouseY = e.clientY;
        let newTop = container.offsetTop + dy;
        let newLeft = container.offsetLeft + dx;
        const maxLeft = window.innerWidth - container.offsetWidth;
        const maxTop = window.innerHeight - container.offsetHeight;
        container.style.top = Math.min(Math.max(0, newTop), maxTop) + "px";
        container.style.left = Math.min(Math.max(0, newLeft), maxLeft) + "px";
      }
      function closeDragElement() {
        document.removeEventListener('mousemove', elementDrag);
        document.removeEventListener('mouseup', closeDragElement);
        // Save position to localStorage.
        localStorage.setItem('nytCrosswordNavPosition', JSON.stringify({
          top: container.style.top,
          left: container.style.left
        }));
      }
      container.isDragging = () => isDragging;
    }

    // Color scheme – using default darkmode/lightmode colors
    const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const colors = {
      bg: isDarkMode ? '#1a1a1a' : '#ffffff',
      text: isDarkMode ? '#ffffff' : '#333333',
      border: isDarkMode ? '#444444' : '#dddddd',
      buttonBg: isDarkMode ? '#333333' : '#f0f0f0',
      buttonHover: isDarkMode ? '#444444' : '#e0e0e0',
      primaryBg: isDarkMode ? '#4a4a4a' : '#000000',
      primaryText: '#ffffff',
      shadow: isDarkMode ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.1)'
    };

    // Define active and inactive tab colors
    const activeTabColor = isDarkMode ? "#ffffff" : "#333333";
    const inactiveTabColor = isDarkMode ? "rgba(255,255,255,0.6)" : "rgba(51,51,51,0.6)";

    // SVG logo (feel free to adjust)
    const logoSvg = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M4 5h16v2H4zM4 11h16v2H4zM4 17h16v2H4z"/>
        <path d="M2 2h4v4H2zM18 2h4v4h-4zM10 10h4v4h-4z"/>
      </svg>
    `;

/* ─────────────────────────────
   Allowed Dates & Puzzle Numbers for Easy Mode (UTC-Based)
───────────────────────────── */
const RELEASE_HOUR_UTC = 3; // 10 p.m. EST = 3:00 UTC next day

// First six puzzles (UTC dates aligned to 3:00 UTC on release day)
const firstSix = [];
const easyStartWed = new Date('2023-06-28T03:00:00Z'); // June 28, 2023, 3:00 UTC (June 27, 10 p.m. EST)
for (let i = 0; i < 6; i++) {
  const d = new Date(easyStartWed);
  d.setUTCDate(d.getUTCDate() + i * 7);
  firstSix.push({ puzzle: i + 1, date: d });
}

// Bonus puzzles from #7 onward (Fridays at 3:00 UTC)
const bonusStartFriday = new Date('2023-08-11T03:00:00Z'); // August 11, 2023, 3:00 UTC (August 10, 10 p.m. EST)

function computeMaxEasyPuzzle() {
  const now = new Date();

  // Check if current UTC time is past release hour (3:00 UTC)
  const isAfterRelease = now.getUTCHours() >= RELEASE_HOUR_UTC;

  // Find the most recent puzzle release date
  let lastReleaseDate = new Date(now);
  lastReleaseDate.setUTCHours(RELEASE_HOUR_UTC, 0, 0, 0);
  if (!isAfterRelease) {
    lastReleaseDate.setUTCDate(lastReleaseDate.getUTCDate() - 1);
  }

  // Ensure lastReleaseDate is a Friday (puzzle day)
  while (lastReleaseDate.getUTCDay() !== 5) { // 5 = Friday
    lastReleaseDate.setUTCDate(lastReleaseDate.getUTCDate() - 1);
  }

  // Calculate weeks since bonusStartFriday
  const timeDiff = lastReleaseDate - bonusStartFriday;
  const weeks = Math.floor(timeDiff / (7 * 24 * 3600 * 1000));

  return 6 + Math.max(0, weeks + 1); // +1 because puzzle 7 is week 0
}

const maxEasyPuzzle = computeMaxEasyPuzzle();

// Build the puzzle list
const easyPuzzleList = [...firstSix];
for (let num = 7; num <= maxEasyPuzzle; num++) {
  const d = new Date(bonusStartFriday);
  d.setUTCDate(d.getUTCDate() + (num - 7) * 7);
  easyPuzzleList.push({ puzzle: num, date: d });
}

    /* ─────────────────────────────
       Build a Unified Draggable Menu Container
    ───────────────────────────── */
    const menuContainer = createElement('div', {
      style: `
        position: fixed;
        top: 20px;
        right: 20px;
        width: 260px;
        z-index: 9999;
        border-radius: 12px;
        background: ${colors.bg};
        box-shadow: 0 8px 32px ${colors.shadow};
        border: 1px solid ${isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'};
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: ${colors.text};
        user-select: none;
      `
    });

    // If stored drag position exists, apply it.
    const storedPos = localStorage.getItem('nytCrosswordNavPosition');
    if (storedPos) {
      try {
        const pos = JSON.parse(storedPos);
        menuContainer.style.top = pos.top;
        menuContainer.style.left = pos.left;
      } catch(e) { /* ignore errors */ }
    }

    // Check for stored expanded state; default to minimized (false)
    let isExpanded = localStorage.getItem('nytCrosswordNavExpanded') === 'true';

    // Header (always visible, used for dragging and toggling)
    const menuHeader = createElement('div', {
      style: `
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px;
        background: ${colors.primaryBg};
        border-radius: 12px 12px 0 0;
        cursor: move;
      `
    });
    const headerLogo = createElement('div', {
      innerHTML: logoSvg,
      style: `display: flex; align-items: center; gap: 4px; color: ${colors.primaryText};`
    });
    const headerTitle = createElement('span', {
      innerText: 'Mini and Easy Mode',
      style: `color: ${colors.primaryText}; font-size: 14px;`
    });
    const headerLeft = createElement('div', { style: 'display: flex; align-items: center; gap: 4px;' }, [headerLogo, headerTitle]);

    // Right-side controls: toggle and close buttons
    const headerControls = createElement('div', { style: 'display: flex; gap: 4px; align-items: center;' });
    const toggleButton = createElement('button', {
      innerText: isExpanded ? '−' : '+',
      style: `
        background: none;
        border: none;
        color: ${colors.primaryText};
        font-size: 18px;
        cursor: pointer;
      `
    });
    const closeButton = createElement('button', {
      innerText: '×',
      style: `
        background: none;
        border: none;
        color: ${colors.primaryText};
        font-size: 18px;
        cursor: pointer;
      `
    });
    headerControls.appendChild(toggleButton);
    headerControls.appendChild(closeButton);
    menuHeader.append(headerLeft, headerControls);

    // The content area (shown/hidden based on saved state)
    const menuContent = createElement('div', {
      style: `
        display: ${isExpanded ? 'block' : 'none'};
        padding: 8px;
        overflow: hidden;
      `
    });

    /* ─────────────────────────────
       Build Tab Headers and Content Containers
    ───────────────────────────── */
    const tabHeader = createElement('div', {
      style: 'display: flex; gap: 8px; margin-bottom: 12px;'
    });
    const miniTabButton = createElement('button', {
      innerText: 'Mini',
      style: `
        flex: 1;
        padding: 8px;
        border: none;
        border-bottom: 2px solid transparent;
        background: none;
        cursor: pointer;
        font-size: 14px;
      `
    });
    const easyTabButton = createElement('button', {
      innerText: 'Easy Mode',
      style: `
        flex: 1;
        padding: 8px;
        border: none;
        border-bottom: 2px solid transparent;
        background: none;
        cursor: pointer;
        font-size: 14px;
      `
    });
    tabHeader.append(miniTabButton, easyTabButton);

    // Containers for each mode’s controls
    const miniContainer = createElement('div', { style: 'display: none; flex-direction: column; gap: 8px;' });
    const easyContainer = createElement('div', { style: 'display: none; flex-direction: column; gap: 8px;' });

    /* ─────────────────────────────
       Mini Mode Controls
    ───────────────────────────── */
    const miniCalendarNav = createElement('div', { style: 'display: flex; gap: 8px; align-items: center;' });
    const miniCalendarInput = createElement('input', {
      type: 'date',
      style: `
        flex: 1;
        padding: 8px;
        border: 1px solid ${colors.border};
        border-radius: 6px;
        font-size: 14px;
        background: ${colors.buttonBg};
        color: ${colors.text};
      `
    });
    miniCalendarInput.min = '2014-08-21';
    // Use effective EST date for the max value.
    const effectiveToday = getEffectiveMiniDate();
    miniCalendarInput.max = formatDateForInput(effectiveToday);

    // Set the calendar value: if URL includes a date, use that; otherwise use effective today.
    const currentMiniDate = getMiniDateFromURL();
    miniCalendarInput.value = formatDateForInput(currentMiniDate);

    // Previous/Next buttons for mini; disable if at boundaries.
    const prevMiniButton = createElement('button', {
      innerText: '←',
      style: `
        width: 40px;
        padding: 8px;
        border: none;
        border-radius: 6px;
        background: ${colors.buttonBg};
        color: ${colors.text};
        cursor: ${new Date(miniCalendarInput.value) <= new Date('2014-08-21') ? 'not-allowed' : 'pointer'};
        opacity: ${new Date(miniCalendarInput.value) <= new Date('2014-08-21') ? '0.5' : '1'};
        font-size: 14px;
      `
    });
    const nextMiniButton = createElement('button', {
      innerText: '→',
      style: `
        width: 40px;
        padding: 8px;
        border: none;
        border-radius: 6px;
        background: ${colors.buttonBg};
        color: ${colors.text};
        cursor: ${new Date(miniCalendarInput.value).toDateString() === effectiveToday.toDateString() ? 'not-allowed' : 'pointer'};
        opacity: ${new Date(miniCalendarInput.value).toDateString() === effectiveToday.toDateString() ? '0.5' : '1'};
        font-size: 14px;
      `
    });
    miniCalendarNav.append(prevMiniButton, miniCalendarInput, nextMiniButton);

    const miniGoGroup = createElement('div', { style: 'display: flex; gap: 8px;' });
    const goToMiniButton = createElement('button', {
      innerText: 'Go to Date',
      style: `
        flex: 1;
        padding: 8px;
        border-radius: 6px;
        background: ${colors.primaryBg};
        color: ${colors.primaryText};
        border: none;
        cursor: pointer;
        font-size: 14px;
      `
    });
    // "Today" button goes directly to /mini (letting NYT serve the correct puzzle)
    const miniTodayButton = createElement('button', {
      innerText: 'Today',
      style: `
        flex: 1;
        padding: 8px;
        border-radius: 6px;
        background: ${colors.primaryBg};
        color: ${colors.primaryText};
        border: none;
        cursor: pointer;
        font-size: 14px;
      `
    });
    miniGoGroup.append(goToMiniButton, miniTodayButton);

    const miniRandomGroup = createElement('div', { style: 'display: flex; gap: 8px;' });
    const miniRandomDayButton = createElement('button', {
      innerText: 'Random Day',
      style: `
        flex: 1;
        padding: 8px;
        border-radius: 6px;
        background: ${colors.primaryBg};
        color: ${colors.primaryText};
        border: none;
        cursor: pointer;
        font-size: 14px;
      `
    });
    const miniRandomSatButton = createElement('button', {
      innerText: 'Random Sat',
      style: `
        flex: 1;
        padding: 8px;
        border-radius: 6px;
        background: ${colors.primaryBg};
        color: ${colors.primaryText};
        border: none;
        cursor: pointer;
        font-size: 14px;
      `
    });
    miniRandomGroup.append(miniRandomDayButton, miniRandomSatButton);

    miniContainer.append(miniCalendarNav, miniGoGroup, miniRandomGroup);

    // Mini mode event handlers
    goToMiniButton.addEventListener('click', () => {
      let chosenDate = new Date(miniCalendarInput.value);
      // Prevent navigating to a future date (beyond effectiveToday).
      if (chosenDate > effectiveToday) {
        chosenDate = effectiveToday;
      }
      navigateToMiniDate(chosenDate);
    });
    // "Today" goes directly to /mini (which should show the effective puzzle)
    miniTodayButton.addEventListener('click', () => {
      window.location.href = 'https://www.nytimes.com/crosswords/game/mini';
    });
    prevMiniButton.addEventListener('click', () => {
      const current = new Date(miniCalendarInput.value);
      if (current <= new Date('2014-08-21')) return;
      current.setDate(current.getDate() - 1);
      navigateToMiniDate(current);
    });
    nextMiniButton.addEventListener('click', () => {
      const current = new Date(miniCalendarInput.value);
      if (current.toDateString() === effectiveToday.toDateString()) return;
      current.setDate(current.getDate() + 1);
      navigateToMiniDate(current);
    });
    function findRandomDate(startDate, endDate, saturdayOnly = false) {
      const randomTime = startDate.getTime() + Math.random() * (endDate.getTime() - startDate.getTime());
      let randomDate = new Date(randomTime);
      if (saturdayOnly) {
        randomDate.setDate(randomDate.getDate() + ((6 - randomDate.getDay() + 7) % 7));
        if (randomDate > endDate) randomDate.setDate(randomDate.getDate() - 7);
      }
      return randomDate;
    }
    miniRandomDayButton.addEventListener('click', () => navigateToMiniDate(findRandomDate(new Date('2014-08-21'), effectiveToday)));
    miniRandomSatButton.addEventListener('click', () => navigateToMiniDate(findRandomDate(new Date('2014-08-21'), effectiveToday, true)));

    /* ─────────────────────────────
       Easy Mode Controls – Navigation by Puzzle Number
    ───────────────────────────── */
    const easyNavRow = createElement('div', { style: 'display: flex; gap: 8px; align-items: center;' });
    const prevEasyButton = createElement('button', {
      innerText: '←',
      style: `
        width: 40px;
        padding: 8px;
        border: none;
        border-radius: 6px;
        background: ${colors.buttonBg};
        color: ${colors.text};
        cursor: pointer;
        font-size: 14px;
      `
    });
    const nextEasyButton = createElement('button', {
      innerText: '→',
      style: `
        width: 40px;
        padding: 8px;
        border: none;
        border-radius: 6px;
        background: ${colors.buttonBg};
        color: ${colors.text};
        cursor: pointer;
        font-size: 14px;
      `
    });
    const puzzleInput = createElement('input', {
      type: 'number',
      min: 1,
      max: maxEasyPuzzle,
      value: (getEasyModePuzzleNumber() || maxEasyPuzzle),
      style: `
        flex: 1;
        padding: 8px;
        border: 1px solid ${colors.border};
        border-radius: 6px;
        font-size: 14px;
        background: ${colors.buttonBg};
        color: ${colors.text};
      `
    });
    const goToEasyButton = createElement('button', {
      innerText: 'Go',
      style: `
        flex: 1;
        padding: 8px;
        border-radius: 6px;
        background: ${colors.primaryBg};
        color: ${colors.primaryText};
        border: none;
        cursor: pointer;
        font-size: 14px;
      `
    });
    easyNavRow.append(prevEasyButton, puzzleInput, nextEasyButton, goToEasyButton);

    // Build the dropdown “calendar” for allowed bonus dates (descending order)
    const easyDateSelect = createElement('select', {
      style: `
        width: 100%;
        padding: 8px;
        border: 1px solid ${colors.border};
        border-radius: 6px;
        font-size: 14px;
        background: ${colors.buttonBg};
        color: ${colors.text};
      `
    });
    const sortedEasyList = [...easyPuzzleList].sort((a, b) => b.puzzle - a.puzzle);
    sortedEasyList.forEach(entry => {
      const option = createElement('option', {
        value: entry.puzzle,
        innerText: `#${entry.puzzle} — ${formatLongDate(entry.date)}`
      });
      easyDateSelect.appendChild(option);
    });
    // Auto-select the current puzzle number (if available)
    const currentPuzzle = getEasyModePuzzleNumber();
    if (currentPuzzle) {
      easyDateSelect.value = currentPuzzle;
    }
    // Random Puzzle button
    const easyRandomButton = createElement('button', {
      innerText: 'Random Puzzle',
      style: `
        width: 100%;
        padding: 8px;
        border-radius: 6px;
        background: ${colors.primaryBg};
        color: ${colors.primaryText};
        border: none;
        cursor: pointer;
        font-size: 14px;
      `
    });
    easyContainer.append(easyNavRow, easyDateSelect, easyRandomButton);

    // Function to update Easy Mode prev/next button states based on current input value.
    function updateEasyNavButtons() {
      let num = Number(puzzleInput.value);
      if (num < 1) num = 1;
      if (num > maxEasyPuzzle) num = maxEasyPuzzle;
      puzzleInput.value = num;
      prevEasyButton.style.cursor = (num <= 1) ? 'not-allowed' : 'pointer';
      nextEasyButton.style.cursor = (num >= maxEasyPuzzle) ? 'not-allowed' : 'pointer';
      prevEasyButton.style.opacity = (num <= 1) ? '0.5' : '1';
      nextEasyButton.style.opacity = (num >= maxEasyPuzzle) ? '0.5' : '1';
    }
    updateEasyNavButtons();
    puzzleInput.addEventListener('input', updateEasyNavButtons);
    goToEasyButton.addEventListener('click', () => {
      let num = Number(puzzleInput.value);
      if (num < 1) num = 1;
      if (num > maxEasyPuzzle) num = maxEasyPuzzle;
      puzzleInput.value = num;
      navigateToEasyModePuzzle(num);
    });
    prevEasyButton.addEventListener('click', () => {
      let num = Number(puzzleInput.value);
      if (num > 1) {
        navigateToEasyModePuzzle(num - 1);
      }
    });
    nextEasyButton.addEventListener('click', () => {
      let num = Number(puzzleInput.value);
      if (num < maxEasyPuzzle) {
        navigateToEasyModePuzzle(num + 1);
      }
    });
    easyDateSelect.addEventListener('change', () => {
      const num = Number(easyDateSelect.value);
      puzzleInput.value = num;
      navigateToEasyModePuzzle(num);
    });
    easyRandomButton.addEventListener('click', () => {
      const randomPuzzle = Math.floor(Math.random() * maxEasyPuzzle) + 1;
      puzzleInput.value = randomPuzzle;
      navigateToEasyModePuzzle(randomPuzzle);
    });

    /* ─────────────────────────────
       Tab Switching Logic
    ───────────────────────────── */
    function setActiveTab(tabName) {
      if (tabName === 'mini') {
        miniTabButton.style.borderBottomColor = colors.primaryBg;
        miniTabButton.style.color = activeTabColor;
        easyTabButton.style.borderBottomColor = 'transparent';
        easyTabButton.style.color = inactiveTabColor;
        miniContainer.style.display = 'flex';
        easyContainer.style.display = 'none';
      } else if (tabName === 'easy') {
        easyTabButton.style.borderBottomColor = colors.primaryBg;
        easyTabButton.style.color = activeTabColor;
        miniTabButton.style.borderBottomColor = 'transparent';
        miniTabButton.style.color = inactiveTabColor;
        miniContainer.style.display = 'none';
        easyContainer.style.display = 'flex';
      }
    }
    miniTabButton.addEventListener('click', () => setActiveTab('mini'));
    easyTabButton.addEventListener('click', () => setActiveTab('easy'));
    if (window.location.href.includes('/mini/')) {
      setActiveTab('mini');
    } else if (window.location.href.includes('/paid/easy-mode')) {
      setActiveTab('easy');
    } else {
      setActiveTab('mini');
    }

    /* ─────────────────────────────
       Assemble the Menu Container
    ───────────────────────────── */
    menuContent.appendChild(tabHeader);
    menuContent.appendChild(miniContainer);
    menuContent.appendChild(easyContainer);

    function toggleMenu() {
      isExpanded = !isExpanded;
      menuContent.style.display = isExpanded ? 'block' : 'none';
      toggleButton.innerText = isExpanded ? '−' : '+';
      localStorage.setItem('nytCrosswordNavExpanded', isExpanded);
    }
    // Attach a dedicated listener for the toggle button.
    toggleButton.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu();
    });
    // Also allow clicking the header (if not on form elements) to toggle.
    menuHeader.addEventListener('click', (e) => {
      if (['BUTTON', 'INPUT', 'SELECT'].indexOf(e.target.tagName) === -1) {
        if (!menuContainer.isDragging || !menuContainer.isDragging()) {
          toggleMenu();
        }
      }
    });
    // Close button: remove the entire menu container from the page.
    closeButton.addEventListener('click', () => {
      menuContainer.remove();
    });

    menuContainer.appendChild(menuHeader);
    menuContainer.appendChild(menuContent);
    document.body.appendChild(menuContainer);
    makeDraggable(menuContainer, menuHeader);
  })();
  
