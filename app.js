document.addEventListener('DOMContentLoaded', () => {
    const timeBlocksContainer = document.getElementById('time-blocks');
    const waterTracker = document.getElementById('water-tracker');
    const waterCountText = document.getElementById('water-count');
    const moodBtns = document.querySelectorAll('.mood-btn');
    const stars = document.querySelectorAll('.star');
    const saveBtn = document.getElementById('save-day');
    const resetBtn = document.getElementById('reset-day');
    const currentDateEl = document.getElementById('current-date');
    const themeToggle = document.getElementById('theme-toggle');
    const exportPdfBtn = document.getElementById('export-pdf');

    // Register Service Worker for PWA
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => console.log('Service Worker registered'))
                .catch(err => console.log('Service Worker registration failed', err));
        });
    }
    
    // History UI elements
    const viewHistoryBtn = document.getElementById('view-history');
    const historyModal = document.getElementById('history-modal');
    const closeHistoryBtn = document.getElementById('close-history');
    const historyList = document.getElementById('history-list');
    const returnTodayBtn = document.getElementById('return-today');

    // State Constants
    const MAX_HISTORY_DAYS = 30;
    const STORAGE_KEY = 'daTrackerHistory';
    let currentDateKey = new Date().toISOString().split('T')[0];
    let viewingDateKey = currentDateKey;

    let state = {
        morning: {},
        evening: {},
        priorities: {},
        water: 0,
        sleep: 8,
        mood: null,
        rating: 0,
        timeBlocks: {},
        notes: "",
        theme: 'dark'
    };

    // Initialize Time Blocks
    const hours = [
        "05:00 - 06:00", "06:00 - 07:00", "07:00 - 08:00", "08:00 - 09:00", 
        "09:00 - 10:00", "10:00 - 11:00", "11:00 - 12:00", "12:00 - 01:00",
        "01:00 - 02:00", "02:00 - 03:00", "03:00 - 04:00", "04:00 - 05:00",
        "05:00 - 06:00", "06:00 - 07:00", "07:00 - 08:00", "08:00 - 09:00",
        "09:00 - 10:00"
    ];

    function initTimeBlocks() {
        timeBlocksContainer.innerHTML = '';
        hours.forEach((h, i) => {
            const row = document.createElement('div');
            row.className = 'time-row';
            row.id = `time-block-${i}`;
            row.innerHTML = `
                <div class="time-label">${h}</div>
                <input type="text" class="time-input" placeholder="What will you do?" data-hour="${i}">
                <div class="productivity-toggle">
                    <input type="checkbox" data-prod="${i}" title="Productive?">
                </div>
            `;
            timeBlocksContainer.appendChild(row);
        });
        highlightCurrentTime();
    }

    function highlightCurrentTime() {
        if (viewingDateKey !== currentDateKey) return; // Only highlight on today
        
        const now = new Date();
        const hour = now.getHours();
        
        document.querySelectorAll('.time-row').forEach(row => row.classList.remove('current'));

        let index = -1;
        if (hour >= 5 && hour < 24) index = hour - 5;
        else if (hour < 5) index = 19 + hour;

        if (index >= 0 && index < hours.length) {
            const currentRow = document.getElementById(`time-block-${index}`);
            if (currentRow) {
                currentRow.classList.add('current');
            }
        }
    }
    setInterval(highlightCurrentTime, 60000);

    function updateDate() {
        const d = viewingDateKey === currentDateKey ? new Date() : new Date(viewingDateKey);
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        let text = d.toLocaleDateString('en-US', options);
        if (viewingDateKey !== currentDateKey) text = "Viewing: " + text;
        currentDateEl.textContent = text;
    }

    // Interactions
    waterTracker.addEventListener('click', (e) => {
        if (e.target.classList.contains('glass')) {
            state.water = parseInt(e.target.dataset.idx) + 1;
            updateWaterUI();
            saveToLocal();
        }
    });

    moodBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            state.mood = btn.dataset.mood;
            updateMoodUI();
            saveToLocal();
        });
    });

    stars.forEach(star => {
        star.addEventListener('click', () => {
            state.rating = parseInt(star.dataset.star);
            updateStarsUI();
            saveToLocal();
        });
    });

    // UI Updates
    function updateWaterUI() {
        const glasses = waterTracker.querySelectorAll('.glass');
        glasses.forEach((g, i) => g.classList.toggle('filled', i < state.water));
        waterCountText.textContent = `${state.water} / 8 Glasses`;
    }

    function updateMoodUI() {
        moodBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.mood === state.mood));
    }

    function updateStarsUI() {
        stars.forEach((s, i) => {
            if (i < state.rating) { s.classList.remove('far'); s.classList.add('fas'); }
            else { s.classList.remove('fas'); s.classList.add('far'); }
        });
    }

    function updateFullUI() {
        // Clear all inputs first
        document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
        document.querySelectorAll('input[type="text"]').forEach(inp => inp.value = "");
        
        Object.keys(state.morning).forEach(id => {
            const el = document.querySelector(`#morning-routine input[data-id="${id}"]`);
            if (el) el.checked = state.morning[id];
        });
        Object.keys(state.evening).forEach(id => {
            const el = document.querySelector(`#evening-routine input[data-id="${id}"]`);
            if (el) el.checked = state.evening[id];
        });
        Object.keys(state.priorities).forEach(id => {
            const el = document.querySelector(`#priorities input[data-id="${id}"]`);
            if (el) el.value = state.priorities[id] || "";
        });
        Object.keys(state.timeBlocks).forEach(hour => {
            const textEl = document.querySelector(`#time-blocks .time-input[data-hour="${hour}"]`);
            const prodEl = document.querySelector(`#time-blocks input[data-prod="${hour}"]`);
            if (textEl) textEl.value = state.timeBlocks[hour].text || "";
            if (prodEl) prodEl.checked = !!state.timeBlocks[hour].prod;
        });

        document.getElementById('sleep-input').value = state.sleep || 8;
        document.getElementById('notes-input').value = state.notes || "";
        
        updateWaterUI();
        updateMoodUI();
        updateStarsUI();
        updateDate();
        highlightCurrentTime();
    }

    // Persistence
    function loadHistory() {
        const stored = localStorage.getItem(STORAGE_KEY);
        // Also migrate old data if exists
        const oldStored = localStorage.getItem('daRoutineState');
        let historyObj = stored ? JSON.parse(stored) : {};
        if (oldStored && Object.keys(historyObj).length === 0) {
            historyObj[currentDateKey] = JSON.parse(oldStored);
            localStorage.removeItem('daRoutineState');
        }
        return historyObj;
    }

    function saveHistory(historyObj) {
        const keys = Object.keys(historyObj).sort();
        while (keys.length > MAX_HISTORY_DAYS) {
            delete historyObj[keys.shift()];
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(historyObj));
    }

    function saveToLocal() {
        document.querySelectorAll('#morning-routine input').forEach(inp => state.morning[inp.dataset.id] = inp.checked);
        document.querySelectorAll('#evening-routine input').forEach(inp => state.evening[inp.dataset.id] = inp.checked);
        document.querySelectorAll('#priorities input').forEach(inp => state.priorities[inp.dataset.id] = inp.value);
        document.querySelectorAll('#time-blocks .time-input').forEach(inp => {
            if (!state.timeBlocks[inp.dataset.hour]) state.timeBlocks[inp.dataset.hour] = {};
            state.timeBlocks[inp.dataset.hour].text = inp.value;
        });
        document.querySelectorAll('#time-blocks input[type="checkbox"]').forEach(inp => {
            if (!state.timeBlocks[inp.dataset.prod]) state.timeBlocks[inp.dataset.prod] = {};
            state.timeBlocks[inp.dataset.prod].prod = inp.checked;
        });
        
        state.sleep = document.getElementById('sleep-input').value;
        state.notes = document.getElementById('notes-input').value;

        const history = loadHistory();
        localStorage.setItem('daTrackerTheme', state.theme);
        
        history[viewingDateKey] = { ...state };
        saveHistory(history);
    }

    function loadFromLocal(dateKey = currentDateKey) {
        viewingDateKey = dateKey;
        const history = loadHistory();
        const globalTheme = localStorage.getItem('daTrackerTheme') || 'dark';
        
        if (history[dateKey]) {
            state = { ...history[dateKey], theme: globalTheme };
        } else {
            state = {
                morning: {}, evening: {}, priorities: {},
                water: 0, sleep: 8, mood: null, rating: 0,
                timeBlocks: {}, notes: "", theme: globalTheme
            };
        }
        updateFullUI();
    }

    // Listeners
    document.addEventListener('change', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            saveToLocal();
        }
    });

    saveBtn.addEventListener('click', () => {
        saveToLocal();
        alert('Progress saved successfully!');
    });

    resetBtn.addEventListener('click', () => {
        if (confirm(`Are you sure you want to reset ${viewingDateKey === currentDateKey ? 'today' : 'this day'}'s progress?`)) {
            const history = loadHistory();
            delete history[viewingDateKey];
            saveHistory(history);
            loadFromLocal(viewingDateKey);
        }
    });

    themeToggle.addEventListener('click', () => {
        state.theme = state.theme === 'dark' ? 'light' : 'dark';
        applyTheme();
        saveToLocal();
    });

    if (exportPdfBtn) exportPdfBtn.addEventListener('click', () => window.print());

    function applyTheme() {
        document.documentElement.setAttribute('data-theme', state.theme);
        const icon = themeToggle.querySelector('i');
        icon.className = state.theme === 'light' ? 'fas fa-sun' : 'fas fa-moon';
    }

    // History Modal Logic
    let calendarDate = new Date();

    function renderCalendar() {
        const grid = document.getElementById('calendar-grid');
        const monthYearEl = document.getElementById('current-month-year');
        if (!grid || !monthYearEl) return;
        
        grid.innerHTML = '';
        const year = calendarDate.getFullYear();
        const month = calendarDate.getMonth();
        
        monthYearEl.textContent = calendarDate.toLocaleString('default', { month: 'long', year: 'numeric' });

        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        // Adjust for Mon start
        let startDay = firstDay - 1;
        if (startDay === -1) startDay = 6;

        for (let i = 0; i < startDay; i++) {
            const empty = document.createElement('div');
            empty.className = 'calendar-day empty';
            grid.appendChild(empty);
        }

        const history = loadHistory();

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const dateKey = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
            
            const el = document.createElement('div');
            el.className = 'calendar-day';
            el.textContent = day;

            if (dateKey === currentDateKey) el.classList.add('today');
            if (dateKey === viewingDateKey) el.classList.add('selected');
            if (history[dateKey]) el.classList.add('has-data');

            el.addEventListener('click', () => {
                loadFromLocal(dateKey);
                historyModal.classList.add('hidden');
            });

            grid.appendChild(el);
        }
    }

    if (viewHistoryBtn) {
        viewHistoryBtn.addEventListener('click', () => {
            calendarDate = new Date(viewingDateKey);
            renderCalendar();
            historyModal.classList.remove('hidden');
        });
    }

    document.getElementById('prev-month').addEventListener('click', () => {
        calendarDate.setMonth(calendarDate.getMonth() - 1);
        renderCalendar();
    });

    document.getElementById('next-month').addEventListener('click', () => {
        calendarDate.setMonth(calendarDate.getMonth() + 1);
        renderCalendar();
    });

    if (closeHistoryBtn) closeHistoryBtn.addEventListener('click', () => historyModal.classList.add('hidden'));
    
    if (returnTodayBtn) {
        returnTodayBtn.addEventListener('click', () => {
            loadFromLocal(currentDateKey);
            historyModal.classList.add('hidden');
        });
    }

    // Init
    initTimeBlocks();
    loadFromLocal();
    applyTheme();
});
