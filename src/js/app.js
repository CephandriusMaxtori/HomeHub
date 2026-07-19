import { invoke } from '@tauri-apps/api/core';
import { check, relaunch } from '@tauri-apps/plugin-updater';

const App = {
  API_BASE: 'https://kalo-vercel.vercel.app',
  CLIENT_SECRET: 'YOUR_KALO_SECRET_HERE',

  config: {
    lat: null,
    lon: null,
    town: '',
    units: 'metric',
  },

  init() {
    this.configModal.init();
    this.settings.init();

    if (!this.configStorage.load()) {
      this.configModal.show();
    } else {
      this.weather.init();
      this.displaySchedule.init();
    }

    this.clock.init();
    this.todos.init();
    this.actions.init();
    this.monitor.init();
    this.updater.init();
  },

  /* ============================================
     Config Storage
     ============================================ */
  configStorage: {
    KEY: 'home_dashboard_config',

    load() {
      try {
        const raw = localStorage.getItem(this.KEY);
        if (!raw) return false;
        const data = JSON.parse(raw);
        if (data.lat != null && data.lon != null) {
          App.config.lat = data.lat;
          App.config.lon = data.lon;
          App.config.town = data.town || '';
          App.config.units = data.units || 'metric';
          return true;
        }
      } catch {}
      return false;
    },

    save(data) {
      App.config.lat = data.lat;
      App.config.lon = data.lon;
      App.config.town = data.town || '';
      App.config.units = data.units || 'metric';
      localStorage.setItem(this.KEY, JSON.stringify(data));
    },
  },

  /* ============================================
     Config Modal
     ============================================ */
  configModal: {
    el: null,
    selectedTown: null,

    init() {
      this.el = document.getElementById('config-modal');
      const input = document.getElementById('town-input');
      const saveBtn = document.getElementById('config-save-btn');

      input.addEventListener('click', () => {
        OSK.open(input, (val) => { input.value = val; });
      });

      input.addEventListener('focus', () => {
        OSK.open(input, (val) => { input.value = val; });
      });

      input.addEventListener('input', () => {
        this.searchTown(input.value);
      });

      saveBtn.addEventListener('click', () => this.save());

      document.getElementById('selected-town-clear').addEventListener('click', () => this.clearSelection());

      document.getElementById('manual-save-btn').addEventListener('click', () => {
        const lat = parseFloat(document.getElementById('config-lat').value);
        const lon = parseFloat(document.getElementById('config-lon').value);
        if (isNaN(lat) || isNaN(lon)) return;
        this.selectedTown = { name: 'Custom Location', lat, lon };
        this.showSelection();
      });
    },

    show() {
      this.el.classList.remove('hidden');
      this.el.classList.add('flex');
    },

    hide() {
      this.el.classList.add('hidden');
      this.el.classList.remove('flex');
    },

    async searchTown(query) {
      const resultsEl = document.getElementById('geocode-results');
      const errorEl = document.getElementById('geocode-error');

      if (query.length < 2) {
        resultsEl.classList.add('hidden');
        errorEl.classList.add('hidden');
        return;
      }

      try {
        const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en`);
        const data = await res.json();

        if (!data.results || data.results.length === 0) {
          resultsEl.classList.add('hidden');
          errorEl.textContent = `No results for "${query}"`;
          errorEl.classList.remove('hidden');
          return;
        }

        errorEl.classList.add('hidden');
        resultsEl.innerHTML = '';
        resultsEl.classList.remove('hidden');

        data.results.forEach((r) => {
          const div = document.createElement('div');
          div.className = 'geocode-result';
          div.innerHTML = `<span class="gc-name">${r.name}</span><span class="gc-country">${r.country || ''}</span>`;
          div.addEventListener('click', () => this.selectTown(r));
          resultsEl.appendChild(div);
        });
      } catch (err) {
        resultsEl.classList.add('hidden');
        errorEl.textContent = 'Search failed. Check your connection.';
        errorEl.classList.remove('hidden');
      }
    },

    selectTown(result) {
      this.selectedTown = {
        name: result.name,
        country: result.country || '',
        lat: result.latitude,
        lon: result.longitude,
      };
      document.getElementById('geocode-results').classList.add('hidden');
      document.getElementById('geocode-error').classList.add('hidden');
      document.getElementById('town-input').value = result.name;
      OSK.close();
      this.showSelection();
    },

    showSelection() {
      const el = document.getElementById('selected-town');
      const nameEl = document.getElementById('selected-town-name');
      nameEl.textContent = this.selectedTown.name + (this.selectedTown.country ? `, ${this.selectedTown.country}` : '');
      el.classList.remove('hidden');
      document.getElementById('town-input').classList.add('hidden');
      document.getElementById('config-save-btn').disabled = false;
      document.getElementById('manual-coords').classList.add('hidden');
    },

    clearSelection() {
      this.selectedTown = null;
      document.getElementById('selected-town').classList.add('hidden');
      document.getElementById('town-input').classList.remove('hidden');
      document.getElementById('town-input').value = '';
      document.getElementById('config-save-btn').disabled = true;
    },

    save() {
      const units = document.getElementById('config-units').value;
      let lat, lon, town;

      if (this.selectedTown) {
        lat = this.selectedTown.lat;
        lon = this.selectedTown.lon;
        town = this.selectedTown.name;
      } else {
        lat = parseFloat(document.getElementById('config-lat').value);
        lon = parseFloat(document.getElementById('config-lon').value);
        town = document.getElementById('town-input').value.trim() || 'Custom Location';
        if (isNaN(lat) || isNaN(lon)) return;
      }

      App.configStorage.save({ lat, lon, town, units });
      this.hide();
      App.weather.init();
      App.displaySchedule.init();
    },
  },

  /* ============================================
     On-Screen Keyboard
     ============================================ */
  osk: null,
  oskTarget: null,
  oskCallback: null,

  getOSK() {
    if (!this.osk) this.osk = new OnScreenKeyboard();
    return this.osk;
  },

  /* ============================================
     Clock
     ============================================ */
  clock: {
    init() {
      this.el = document.getElementById('clock');
      this.greetingEl = document.getElementById('greeting');
      this.dateEl = document.getElementById('date-display');
      this.tick();
      setInterval(() => this.tick(), 1000);
    },

    tick() {
      const now = new Date();
      this.el.textContent = now.toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      });
      this.dateEl.textContent = now.toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      });
      const hour = now.getHours();
      let greeting = 'Good Evening';
      if (hour >= 5 && hour < 12) greeting = 'Good Morning';
      else if (hour >= 12 && hour < 17) greeting = 'Good Afternoon';
      this.greetingEl.textContent = greeting;
    },
  },

  /* ============================================
     Weather
     ============================================ */
  weather: {
    refreshInterval: null,

    init() {
      if (!App.config.lat || !App.config.lon) return;

      document.getElementById('weather-content').classList.add('hidden');
      document.getElementById('weather-error').classList.add('hidden');
      document.getElementById('weather-loading').classList.remove('hidden');

      this.fetch();
      document.getElementById('weather-retry').addEventListener('click', () => this.fetch());

      if (this.refreshInterval) clearInterval(this.refreshInterval);
      this.refreshInterval = setInterval(() => this.fetch(), 15 * 60 * 1000);
    },

    async fetch() {
      const units = App.config.units || 'metric';
      const url = `${App.API_BASE}/api/weather?lat=${App.config.lat}&lon=${App.config.lon}&units=${units}`;

      try {
        const res = await fetch(url, {
          headers: { 'Authorization': `Bearer ${App.CLIENT_SECRET}` },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        App.setStatus('online', 'Weather OK');
        this.render(data);
      } catch (err) {
        console.error('Weather fetch error:', err);
        App.setStatus('error', 'Weather Error');
        this.showError(err.message || 'Failed to fetch weather');
      }
    },

    render(data) {
      document.getElementById('weather-loading').classList.add('hidden');
      document.getElementById('weather-error').classList.add('hidden');
      document.getElementById('weather-content').classList.remove('hidden');

      const c = data.current;
      document.getElementById('weather-temp').textContent = `${Math.round(c.temp)}°`;
      document.getElementById('weather-condition').textContent = c.condition_desc || c.condition;
      document.getElementById('weather-feels').textContent = `Feels like ${Math.round(c.feels_like)}°`;
      document.getElementById('weather-icon').textContent = this.getIcon(c.illustration_code);
      document.getElementById('weather-humidity').textContent = `${data.humidity.value}%`;
      const windUnit = App.config.units === 'imperial' ? 'mph' : 'km/h';
      document.getElementById('weather-wind').textContent = `${data.wind.speed} ${windUnit}`;

      const aqiEl = document.getElementById('weather-aqi');
      aqiEl.textContent = `${data.aqi.value}`;
      aqiEl.className = 'font-medium ' + this.aqiColor(data.aqi.value);

      const forecastEl = document.getElementById('weather-forecast');
      forecastEl.innerHTML = '';
      (data.forecast?.daily || []).slice(0, 7).forEach((day) => {
        const date = new Date(day.time * 1000);
        const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
        const el = document.createElement('div');
        el.className = 'forecast-day';
        el.innerHTML = `
          <span class="forecast-day-name">${dayName}</span>
          <span class="forecast-day-icon">${this.getIcon(day.icon || day.condition)}</span>
          <span class="forecast-day-temps">${Math.round(day.max)}° <span class="forecast-day-low">${Math.round(day.min)}°</span></span>
        `;
        forecastEl.appendChild(el);
      });
    },

    showError(msg) {
      document.getElementById('weather-loading').classList.add('hidden');
      document.getElementById('weather-content').classList.add('hidden');
      document.getElementById('weather-error').classList.remove('hidden');
      document.getElementById('weather-error-msg').textContent = msg;
    },

    getIcon(code) {
      const icons = {
        'sun': '\u2600\uFE0F', 'clear-night': '\uD83C\uDF19', 'cloud-sun': '\u26C5',
        'cloudy-night': '\u2601\uFE0F', 'cloudy': '\u2601\uFE0F', 'rain': '\uD83C\uDF27\uFE0F',
        'rain-night': '\uD83C\uDF27\uFE0F', 'snow': '\u2744\uFE0F', 'thunderstorm': '\u26C8\uFE0F',
        'Clear': '\u2600\uFE0F', 'Clouds': '\u2601\uFE0F', 'Rain': '\uD83C\uDF27\uFE0F',
        'Drizzle': '\uD83C\uDF26\uFE0F', 'Snow': '\u2744\uFE0F', 'Thunderstorm': '\u26C8\uFE0F',
        'Mist': '\uD83C\uDF2B\uFE0F', 'Fog': '\uD83C\uDF2B\uFE0F', 'Haze': '\uD83C\uDF2B\uFE0F',
        'Mainly Clear': '\u2600\uFE0F', 'Partly cloudy': '\u26C5', 'Overcast': '\u2601\uFE0F',
        'Light rain': '\uD83C\uDF26\uFE0F', 'Moderate rain': '\uD83C\uDF27\uFE0F',
        'Heavy rain': '\uD83C\uDF27\uFE0F', 'Light drizzle': '\uD83C\uDF26\uFE0F', 'Rainy': '\uD83C\uDF27\uFE0F',
      };
      return icons[code] || '\uD83C\uDF24\uFE0F';
    },

    aqiColor(v) {
      if (v <= 50) return 'text-green-400';
      if (v <= 100) return 'text-yellow-400';
      if (v <= 150) return 'text-orange-400';
      return 'text-red-400';
    },
  },

  /* ============================================
     Status Indicator
     ============================================ */
  setStatus(state, text) {
    const dot = document.getElementById('status-dot');
    const label = document.getElementById('status-text');
    dot.className = 'w-2 h-2 rounded-full animate-pulse';
    if (state === 'online') dot.classList.add('status-online');
    else if (state === 'error') dot.classList.add('status-error');
    else dot.classList.add('status-offline');
    label.textContent = text;
  },

  /* ============================================
     Display Control
     ============================================ */
  async displayOff() {
    try {
      await invoke('display_off');
    } catch (err) {
      console.error('Display off failed:', err);
    }
  },

  async displayOn() {
    try {
      await invoke('display_on');
    } catch (err) {
      console.error('Display on failed:', err);
    }
  },

  /* ============================================
     Display Schedule
     ============================================ */
  displaySchedule: {
    interval: null,
    scheduleKey: 'home_dashboard_schedule',

    init() {
      const saved = localStorage.getItem(this.scheduleKey);
      if (saved) {
        try {
          const s = JSON.parse(saved);
          document.getElementById('schedule-enabled').checked = s.enabled;
          document.getElementById('schedule-on').value = s.onTime || '07:00';
          document.getElementById('schedule-off').value = s.offTime || '22:00';
          if (s.enabled) document.getElementById('schedule-times').classList.remove('hidden');
        } catch {}
      }

      document.getElementById('schedule-enabled').addEventListener('change', (e) => {
        document.getElementById('schedule-times').classList.toggle('hidden', !e.target.checked);
        this.save();
      });

      document.getElementById('schedule-on').addEventListener('change', () => this.save());
      document.getElementById('schedule-off').addEventListener('change', () => this.save());

      if (this.interval) clearInterval(this.interval);
      this.interval = setInterval(() => this.check(), 30000);
    },

    save() {
      const data = {
        enabled: document.getElementById('schedule-enabled').checked,
        onTime: document.getElementById('schedule-on').value,
        offTime: document.getElementById('schedule-off').value,
      };
      localStorage.setItem(this.scheduleKey, JSON.stringify(data));
    },

    check() {
      if (!document.getElementById('schedule-enabled').checked) return;

      const now = new Date();
      const currentMin = now.getHours() * 60 + now.getMinutes();

      const onParts = document.getElementById('schedule-on').value.split(':');
      const offParts = document.getElementById('schedule-off').value.split(':');
      const onMin = parseInt(onParts[0]) * 60 + parseInt(onParts[1]);
      const offMin = parseInt(offParts[0]) * 60 + parseInt(offParts[1]);

      let shouldBeOn;
      if (onMin < offMin) {
        shouldBeOn = currentMin >= onMin && currentMin < offMin;
      } else {
        shouldBeOn = currentMin >= onMin || currentMin < offMin;
      }

      if (shouldBeOn) {
        App.displayOn();
      } else {
        App.displayOff();
      }
    },
  },

  /* ============================================
     Quick Actions
     ============================================ */
  actions: {
    activeStates: {},

    init() {
      const grid = document.getElementById('actions-grid');
      const saved = localStorage.getItem('home_dashboard_actions');
      if (saved) {
        try { this.activeStates = JSON.parse(saved); } catch {}
      }

      grid.querySelectorAll('.action-btn').forEach((btn) => {
        const action = btn.dataset.action;
        if (this.activeStates[action]) btn.classList.add('active');

        btn.addEventListener('click', () => {
          this.activeStates[action] = !this.activeStates[action];
          btn.classList.toggle('active');
          this.save();
        });
      });
    },

    save() {
      localStorage.setItem('home_dashboard_actions', JSON.stringify(this.activeStates));
    },
  },

  /* ============================================
     Todo List
     ============================================ */
  todos: {
    items: [],
    STORAGE_KEY: 'home_dashboard_todos',

    init() {
      this.load();
      this.render();
      document.getElementById('todo-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('todo-input');
        const text = input.value.trim();
        if (!text) return;
        this.add(text);
        input.value = '';
      });
    },

    add(text) {
      this.items.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        text,
        completed: false,
      });
      this.save();
      this.render();
    },

    toggle(id) {
      const item = this.items.find((t) => t.id === id);
      if (item) item.completed = !item.completed;
      this.save();
      this.render();
    },

    remove(id) {
      this.items = this.items.filter((t) => t.id !== id);
      this.save();
      this.render();
    },

    render() {
      const listEl = document.getElementById('todo-list');
      const emptyEl = document.getElementById('todo-empty');

      if (this.items.length === 0) {
        listEl.innerHTML = '';
        emptyEl.classList.remove('hidden');
        return;
      }

      emptyEl.classList.add('hidden');
      listEl.innerHTML = '';

      this.items.forEach((item) => {
        const li = document.createElement('li');
        li.className = 'todo-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'todo-checkbox';
        checkbox.checked = item.completed;
        checkbox.addEventListener('change', () => this.toggle(item.id));

        const span = document.createElement('span');
        span.className = 'todo-text' + (item.completed ? ' completed' : '');
        span.textContent = item.text;

        const btn = document.createElement('button');
        btn.className = 'todo-delete';
        btn.textContent = '\u2715';
        btn.addEventListener('click', () => this.remove(item.id));

        li.appendChild(checkbox);
        li.appendChild(span);
        li.appendChild(btn);
        listEl.appendChild(li);
      });
    },

    load() {
      try {
        const raw = localStorage.getItem(this.STORAGE_KEY);
        if (raw) this.items = JSON.parse(raw);
      } catch {
        this.items = [];
      }
    },

    save() {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.items));
    },
  },

  /* ============================================
     System Monitor (Simulated)
     ============================================ */
  monitor: {
    RING_CIRCUMFERENCE: 213.6,
    interval: null,

    init() {
      this.update();
      this.interval = setInterval(() => this.update(), 5000);
    },

    update() {
      this.setRing('cpu-ring', 'cpu-value', this.rand(15, 75));
      this.setRing('ram-ring', 'ram-value', this.rand(40, 85));
      this.updateNetwork();
    },

    setRing(ringId, valueId, percent) {
      const ring = document.getElementById(ringId);
      const value = document.getElementById(valueId);
      const offset = this.RING_CIRCUMFERENCE - (percent / 100) * this.RING_CIRCUMFERENCE;
      ring.classList.remove('warn', 'danger');
      if (percent > 85) ring.classList.add('danger');
      else if (percent > 65) ring.classList.add('warn');
      ring.style.strokeDashoffset = offset;
      value.textContent = `${Math.round(percent)}%`;
    },

    updateNetwork() {
      const down = this.rand(20, 180).toFixed(1);
      const up = this.rand(5, 45).toFixed(1);
      document.getElementById('net-speed').textContent = down;
      document.getElementById('net-label').textContent = `${down} / ${up} Mbps`;
    },

    rand(min, max) {
      return min + Math.random() * (max - min);
    },
  },

  /* ============================================
     WiFi
     ============================================ */
  wifi: {
    selectedSsid: null,

    async init() {
      await this.updateStatus();

      document.getElementById('wifi-scan-btn').addEventListener('click', () => this.scan());
      document.getElementById('wifi-connect-btn').addEventListener('click', () => this.connect());
      document.getElementById('wifi-cancel-btn').addEventListener('click', () => this.cancelPassword());

      const pwInput = document.getElementById('wifi-password');
      pwInput.addEventListener('focus', () => {
        App.getOSK().open(pwInput, (val) => { pwInput.value = val; });
      });
    },

    async updateStatus() {
      try {
        const result = await invoke('wifi_status');
        const statusEl = document.getElementById('wifi-status');
        const dotEl = document.getElementById('wifi-status-dot');
        if (result && result.trim()) {
          statusEl.textContent = `Connected: ${result.trim()}`;
          dotEl.className = 'w-2 h-2 rounded-full bg-green-400';
        } else {
          statusEl.textContent = 'Not connected';
          dotEl.className = 'w-2 h-2 rounded-full bg-gray-500';
        }
      } catch {
        document.getElementById('wifi-status').textContent = 'Unable to check';
        document.getElementById('wifi-status-dot').className = 'w-2 h-2 rounded-full bg-red-400';
      }
    },

    async scan() {
      const networksEl = document.getElementById('wifi-networks');
      const btn = document.getElementById('wifi-scan-btn');
      btn.textContent = 'Scanning...';
      btn.disabled = true;

      try {
        const result = await invoke('wifi_scan');
        networksEl.innerHTML = '';
        networksEl.classList.remove('hidden');

        const lines = result.split('\n').filter((l) => l.trim());
        const seen = new Set();

        lines.forEach((line) => {
          const parts = line.split(':');
          if (parts.length < 1) return;
          const ssid = parts[0].trim();
          if (!ssid || seen.has(ssid)) return;
          seen.add(ssid);

          const signal = parts[1] ? parts[1].trim() : '??';
          const security = parts[2] ? parts[2].trim() : '';

          const div = document.createElement('div');
          div.className = 'wifi-network';
          div.innerHTML = `
            <span class="wifi-ssid">${ssid}</span>
            <span class="wifi-signal">${signal}%</span>
            ${security && security !== '' ? '<span class="wifi-lock">\uD83D\uDD12</span>' : ''}
          `;
          div.addEventListener('click', () => this.selectNetwork(ssid, security));
          networksEl.appendChild(div);
        });

        if (networksEl.children.length === 0) {
          networksEl.innerHTML = '<div class="text-center text-gray-500 text-sm py-3">No networks found</div>';
        }
      } catch (err) {
        networksEl.innerHTML = `<div class="text-center text-red-400 text-sm py-3">Scan failed: ${err}</div>`;
        networksEl.classList.remove('hidden');
      } finally {
        btn.textContent = 'Scan for Networks';
        btn.disabled = false;
      }
    },

    selectNetwork(ssid, security) {
      this.selectedSsid = ssid;
      const isSecured = security && security !== '' && !security.includes('OPEN');

      if (isSecured) {
        document.getElementById('wifi-password-section').classList.remove('hidden');
        document.getElementById('wifi-password').value = '';
        document.getElementById('wifi-password').focus();
      } else {
        this.doConnect(ssid, '');
      }
    },

    async connect() {
      const pw = document.getElementById('wifi-password').value;
      App.getOSK().close();
      await this.doConnect(this.selectedSsid, pw);
    },

    async doConnect(ssid, password) {
      const statusEl = document.getElementById('wifi-status');
      statusEl.textContent = `Connecting to ${ssid}...`;

      try {
        await invoke('wifi_connect', { ssid, password });
        statusEl.textContent = `Connected: ${ssid}`;
        document.getElementById('wifi-status-dot').className = 'w-2 h-2 rounded-full bg-green-400';
        this.cancelPassword();
      } catch (err) {
        statusEl.textContent = `Failed: ${err}`;
        document.getElementById('wifi-status-dot').className = 'w-2 h-2 rounded-full bg-red-400';
      }
    },

    cancelPassword() {
      document.getElementById('wifi-password-section').classList.add('hidden');
      this.selectedSsid = null;
    },
  },

  /* ============================================
     Auto-Updater
     ============================================ */
  updater: {
    currentVersion: '1.0.0',
    checkInterval: null,

    init() {
      this.checkForUpdates();
      this.checkInterval = setInterval(() => this.checkForUpdates(), 60 * 60 * 1000);

      document.getElementById('update-dismiss').addEventListener('click', () => {
        document.getElementById('update-banner').classList.add('hidden');
      });

      document.getElementById('update-install').addEventListener('click', () => this.installUpdate());
    },

    async checkForUpdates() {
      try {
        const update = await check();
        if (update) {
          this.showUpdate(update);
        }
      } catch (err) {
        console.log('Update check failed:', err);
      }
    },

    showUpdate(update) {
      const banner = document.getElementById('update-banner');
      const status = document.getElementById('update-status');
      const detail = document.getElementById('update-detail');

      status.textContent = `Update to v${update.version}`;
      detail.textContent = update.body || 'A new version is ready to install.';
      banner.classList.remove('hidden');
    },

    async installUpdate() {
      const banner = document.getElementById('update-banner');
      const installBtn = document.getElementById('update-install');
      const progressWrap = document.getElementById('update-progress-wrap');
      const progressBar = document.getElementById('update-progress-bar');
      const progressText = document.getElementById('update-progress-text');
      const statusEl = document.getElementById('update-status');

      installBtn.disabled = true;
      installBtn.textContent = 'Downloading...';
      progressWrap.classList.remove('hidden');

      try {
        const update = await check();
        if (!update) {
          statusEl.textContent = 'No update found';
          return;
        }

        await update.downloadAndInstall((event) => {
          switch (event.event) {
            case 'Started':
              statusEl.textContent = 'Downloading update...';
              if (event.data.contentLength) {
                progressBar.style.width = '0%';
              }
              break;
            case 'Progress':
              if (event.data.total) {
                const pct = Math.round((event.data.chunk / event.data.total) * 100);
                progressBar.style.width = `${pct}%`;
                progressText.textContent = `${pct}%`;
              }
              break;
            case 'Finished':
              statusEl.textContent = 'Update ready! Restarting...';
              progressBar.style.width = '100%';
              progressText.textContent = '100%';
              break;
          }
        });

        await relaunch();
      } catch (err) {
        statusEl.textContent = `Update failed: ${err}`;
        installBtn.disabled = false;
        installBtn.textContent = 'Retry';
        console.error('Update install error:', err);
      }
    },
  },

  /* ============================================
     Settings
     ============================================ */
  settings: {
    init() {
      document.getElementById('settings-btn').addEventListener('click', () => this.open());
      document.getElementById('settings-close').addEventListener('click', () => this.close());
      document.getElementById('settings-change-location').addEventListener('click', () => {
        this.close();
        App.configModal.show();
        if (App.config.town) {
          document.getElementById('town-input').value = App.config.town;
        }
      });

      this.wifi = App.wifi;
      this.wifi.init();
    },

    open() {
      const modal = document.getElementById('settings-modal');
      modal.classList.remove('hidden');
      modal.classList.add('flex');

      if (App.config.town) {
        document.getElementById('settings-town-name').textContent = App.config.town;
        document.getElementById('settings-coords').textContent = `${App.config.lat.toFixed(4)}, ${App.config.lon.toFixed(4)}`;
      }

      this.wifi.updateStatus();
    },

    close() {
      const modal = document.getElementById('settings-modal');
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    },
  },
};

/* ============================================
   On-Screen Keyboard Class
   ============================================ */
class OnScreenKeyboard {
  constructor() {
    this.el = document.getElementById('osk');
    this.previewEl = document.getElementById('osk-input-preview');
    this.target = null;
    this.callback = null;

    this.rows = [
      ['q','w','e','r','t','y','u','i','o','p'],
      ['a','s','d','f','g','h','j','k','l'],
      ['z','x','c','v','b','n','m'],
    ];

    this.build();
  }

  build() {
    for (let r = 0; r < this.rows.length; r++) {
      const rowEl = document.getElementById(`osk-row-${r + 1}`);
      this.rows[r].forEach((key) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'osk-key';
        btn.textContent = key;
        btn.dataset.key = key;
        btn.addEventListener('click', () => this.onKeyPress(key));
        rowEl.appendChild(btn);
      });
    }

    const row4 = document.getElementById('osk-row-4');

    const backspace = document.createElement('button');
    backspace.type = 'button';
    backspace.className = 'osk-key osk-key-wide';
    backspace.textContent = '\u232B';
    backspace.addEventListener('click', () => this.onBackspace());
    row4.appendChild(backspace);

    const space = document.createElement('button');
    space.type = 'button';
    space.className = 'osk-key osk-key-space';
    space.textContent = 'Space';
    space.addEventListener('click', () => this.onKeyPress(' '));
    row4.appendChild(space);

    const enter = document.createElement('button');
    enter.type = 'button';
    enter.className = 'osk-key osk-key-wide osk-key-enter';
    enter.textContent = 'Enter';
    enter.addEventListener('click', () => this.onEnter());
    row4.appendChild(enter);
  }

  open(target, callback) {
    this.target = target;
    this.callback = callback;
    this.el.classList.remove('hidden');
    this.updatePreview();
  }

  close() {
    this.el.classList.add('hidden');
    this.target = null;
    this.callback = null;
  }

  updatePreview() {
    if (this.target) {
      this.previewEl.textContent = this.target.value || '';
    }
  }

  onKeyPress(key) {
    if (!this.target) return;
    this.target.value += key;
    this.updatePreview();
    if (this.callback) this.callback(this.target.value);
    this.triggerInput();
  }

  onBackspace() {
    if (!this.target) return;
    this.target.value = this.target.value.slice(0, -1);
    this.updatePreview();
    if (this.callback) this.callback(this.target.value);
    this.triggerInput();
  }

  onEnter() {
    this.close();
  }

  triggerInput() {
    if (this.target) {
      this.target.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
}

/* ============================================
   Boot
   ============================================ */
document.addEventListener('DOMContentLoaded', () => {
  App.init();

  document.getElementById('screen-off-btn').addEventListener('click', () => {
    App.displayOff();
  });

  document.addEventListener('click', (e) => {
    if (document.body.dataset.displayOff === 'true') {
      document.body.dataset.displayOff = 'false';
      App.displayOn();
    }
  });
});
