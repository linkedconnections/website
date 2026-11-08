import { PlannerClient, createPlannerWorker } from '@irail/planner/browser';
import { demoStations, demoDeparture, durationLabel } from './planner-data.js';
import { createProfileLayer } from './profile-layer.js';

const dataUrl = 'https://irail.github.io/iRail-cdn/manifest.jsonld';
const el = id => document.getElementById(id);
const root = el('route-demo');
const status = el('planner-status');
const progress = el('planner-progress');
const retry = el('planner-retry');
const reset = el('planner-reset');
const results = el('planner-results');
const profileKey = el('planner-profile-key');
const tabs = [el('tab-lc2'), el('tab-lc1')];
const scripts = new Map();
let client, sources, map, routes, pins, journeyBounds, profile;
let from, to, busy = false, ready = false, initializing;
let revision = 0;
let legacyLoading;
let timeZone = 'Europe/Brussels';

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function setStatus(message) { status.textContent = message; }
function setBusy(value) {
  busy = value;
  progress.hidden = !value;
  reset.disabled = value;
  results.setAttribute('aria-busy', String(value));
}

function loadScript(src) {
  if (!scripts.has(src)) scripts.set(src, new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => { scripts.delete(src); script.remove(); reject(new Error('Script could not load')); };
    document.body.appendChild(script);
  }));
  return scripts.get(src);
}

async function request(type, payload, onProgress) {
  let timer;
  try {
    return await Promise.race([
      client.request(type, payload, onProgress),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('The data request timed out')), 60000); })
    ]);
  } finally { clearTimeout(timer); }
}

function markerIcon(label = '') {
  return L.divIcon({
    className: `lc-station-pin${label ? ' lc-station-selected' : ''}`,
    html: label,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
}

function clearJourney() {
  map?.closePopup();
  from = to = undefined;
  journeyBounds = undefined;
  profile?.clear();
  profileKey.hidden = true;
  routes?.clearLayers();
  results.replaceChildren();
  results.hidden = true;
  reset.hidden = true;
  for (const { marker } of pins || []) marker.setIcon(markerIcon());
  if (pins?.length) map.fitBounds(pins.map(pin => [pin.lat, pin.lon]), { padding: [30, 30], animate: false });
  setStatus('Select a departure station on the map, then a destination.');
}

async function initialize() {
  if (ready) return;
  if (initializing) return initializing;
  initializing = (async () => {
    const current = ++revision;
    retry.hidden = true;
    setBusy(true);
    setStatus('Loading the LC 2.0-alpha station map…');
    try {
      if (!window.L) await loadScript('/js/leaflet.js');
      if (!map) {
        map = L.map('planner-map', { scrollWheelZoom: false, zoomAnimation: false }).setView([50.7, 4.5], 7);
        L.tileLayer('https://{s}.tile.thunderforest.com/transport/{z}/{x}/{y}.png?apikey=f2488a35b11044e4844692095875c9ce', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 18
        }).addTo(map);
        profile = createProfileLayer(map, L);
        routes = L.layerGroup().addTo(map);
        map.on('resize', () => {
          if (!el('planner-map').clientWidth || !pins?.length) return;
          map.fitBounds(journeyBounds || pins.map(pin => [pin.lat, pin.lon]), { padding: [35, 35], maxZoom: 10, animate: false });
        });
      }
      client?.close();
      client = new PlannerClient(createPlannerWorker());
      sources = await request('init', { dataUrl });
      if (current !== revision) return;
      const stations = demoStations(sources);
      if (stations.length < 2) throw new Error('Not enough demo stations in the timetable');
      timeZone = sources[0].manifest.timeZone || 'Europe/Brussels';
      for (const pin of pins || []) map.removeLayer(pin.marker);
      pins = stations.map(station => {
        const marker = L.marker([station.lat, station.lon], {
          icon: markerIcon(), title: station.name, alt: station.name, keyboard: true
        }).addTo(map);
        // Leaflet 0.7's div markers are focusable but have no button semantics.
        marker._icon.setAttribute('role', 'button');
        marker._icon.setAttribute('aria-label', station.name);
        marker._icon.addEventListener('keydown', event => {
          if (event.key === ' ') { event.preventDefault(); marker.fire('click'); }
        });
        marker.on('click', () => selectStation(station, marker));
        return { ...station, marker };
      });
      ready = true;
      clearJourney();
    } catch (error) {
      client?.close();
      ready = false;
      setStatus('The LC 2.0-alpha timetable could not be loaded. Please try again.');
      retry.hidden = false;
    } finally {
      setBusy(false);
      initializing = undefined;
    }
  })();
  return initializing;
}

function sameStation(a, b) {
  return a?.sourceId === b?.sourceId && a?.stopIdx === b?.stopIdx;
}

function chooseEndpoint(station, marker) {
  const content = node('div', undefined, 'station-choice');
  content.appendChild(node('p', station.name));
  const actions = node('div', undefined, 'station-choice-actions');
  for (const [endpoint, label] of [['from', 'From this station'], ['to', 'To this station']]) {
    const button = node('button', label);
    button.type = 'button';
    button.disabled = sameStation(station, endpoint === 'from' ? to : from);
    button.addEventListener('click', () => {
      if (busy || !ready) return;
      if (endpoint === 'from') from = station; else to = station;
      map.closePopup();
      for (const pin of pins) pin.marker.setIcon(markerIcon(sameStation(pin, from) ? 'A' : sameStation(pin, to) ? 'B' : ''));
      plan();
    });
    actions.appendChild(button);
  }
  content.appendChild(actions);
  content.addEventListener('keydown', event => {
    if (event.key === 'Escape') { map.closePopup(); marker._icon.focus({ preventScroll: true }); }
  });
  L.popup({ offset: [0, -12] }).setLatLng([station.lat, station.lon]).setContent(content).openOn(map);
  actions.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
}

function selectStation(station, marker) {
  if (busy || !ready) return;
  if (to) { chooseEndpoint(station, marker); return; }
  if (!from) {
    from = station;
    marker.setIcon(markerIcon('A'));
    reset.hidden = false;
    setStatus(`Departure: ${station.name}. Select a destination station.`);
  } else if (from.sourceId !== station.sourceId || from.stopIdx !== station.stopIdx) {
    to = station;
    marker.setIcon(markerIcon('B'));
    map.closePopup();
    plan();
  }
}

function stopPoint(sourceId, stopIdx) {
  const source = sources.find(source => source.id === sourceId);
  if (!source) return null;
  const lat = source.stops.lat[stopIdx], lon = source.stops.lon[stopIdx];
  return Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : null;
}

function showJourney(journey, button) {
  routes.clearLayers();
  results.querySelectorAll('button').forEach(element => element.setAttribute('aria-pressed', String(element === button)));
  const points = [];
  for (const leg of journey.legs) {
    if (leg.kind !== 'ride') continue;
    const a = stopPoint(leg.sourceId, leg.boardStop), b = stopPoint(leg.sourceId, leg.alightStop);
    if (a && b) points.push(a, b);
  }
  if (points.length > 1) {
    const line = L.polyline(points, { color: '#285a80', weight: 5, opacity: .85 }).addTo(routes);
    journeyBounds = line.getBounds();
    map.fitBounds(journeyBounds, { padding: [35, 35], maxZoom: 10, animate: false });
  }
}

function renderJourneys(options) {
  results.replaceChildren();
  results.hidden = !options.length;
  const time = seconds => new Intl.DateTimeFormat('en-GB', {
    timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).format(new Date(seconds * 1000));
  for (const [index, journey] of options.slice(0, 3).entries()) {
    const button = node('button', undefined, 'journey-option');
    button.type = 'button';
    button.setAttribute('aria-pressed', String(index === 0));
    button.appendChild(node('strong', `${time(journey.departure)} → ${time(journey.arrival)}`));
    button.appendChild(node('span', `${durationLabel(journey.arrival - journey.departure)} · ${journey.transfers ? `${journey.transfers} transfer${journey.transfers === 1 ? '' : 's'}` : 'Direct'}`));
    button.addEventListener('click', () => showJourney(journey, button));
    results.appendChild(button);
    if (index === 0) showJourney(journey, button);
  }
}

async function plan() {
  const current = ++revision;
  const departure = demoDeparture(sources);
  const date = new Intl.DateTimeFormat('en-GB', {
    timeZone, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).format(new Date(departure * 1000));
  setBusy(true);
  routes.clearLayers();
  journeyBounds = undefined;
  results.replaceChildren();
  results.hidden = true;
  profile.clear();
  profileKey.hidden = true;
  setStatus(`Calculating ${from.name} → ${to.name} for ${date}…`);
  try {
    const result = await request('plan', {
      origin: { sourceId: from.sourceId, stopIdx: from.stopIdx },
      destination: { sourceId: to.sourceId, stopIdx: to.stopIdx },
      departureAfter: departure,
      maxWalkMeters: 0,
      windowMode: 'adaptive'
    }, ({ phase, edges }) => {
      if (current !== revision) return;
      if (edges?.length) profileKey.hidden = profile.add(edges) === 0;
      const action = phase === 'loading' ? 'Downloading connection pages' : 'Calculating journeys in your browser';
      setStatus(`${action}: ${from.name} → ${to.name}…`);
    });
    if (current !== revision) return;
    const options = result.options || [];
    renderJourneys(options);
    setStatus(options.length
      ? `${from.name} → ${to.name}. Departing from ${date}. Choose a journey below, or click another station to change the route.`
      : `No journey found from ${from.name} to ${to.name} for ${date}. Try another pair of stations.`);
  } catch (error) {
    if (current !== revision) return;
    profile.clear();
    profileKey.hidden = true;
    client?.close();
    ready = false;
    setStatus('The journey could not be calculated. Please try again.');
    retry.hidden = false;
  } finally {
    if (current === revision) setBusy(false);
  }
}

async function activateTab(index) {
  tabs.forEach((tab, i) => {
    tab.setAttribute('aria-selected', String(i === index));
    tab.tabIndex = i === index ? 0 : -1;
    el(tab.getAttribute('aria-controls')).hidden = i !== index;
  });
  if (index === 0) {
    map?.invalidateSize();
    await initialize();
  } else {
    if (!legacyLoading) legacyLoading = (async () => {
      el('demoexplanation').textContent = 'Loading the original LC 1.0 demo…';
      if (!window.L) await loadScript('/js/leaflet.js');
      await loadScript('/js/lc-client.js');
      await loadScript('/js/main.js');
    })().catch(() => {
      legacyLoading = undefined;
      el('demoexplanation').replaceChildren(node('span', 'The original demo could not be loaded. '));
      const button = node('button', 'Try again');
      button.type = 'button';
      button.addEventListener('click', () => activateTab(1));
      el('demoexplanation').appendChild(button);
    });
    await legacyLoading;
    window.dispatchEvent(new Event('resize'));
  }
}

tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => activateTab(index));
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index;
    tabs[next].focus();
    activateTab(next);
  });
});
retry.addEventListener('click', initialize);
reset.addEventListener('click', () => { if (ready) { revision++; clearJourney(); } else initialize(); });
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) {
      observer.disconnect();
      if (tabs[0].getAttribute('aria-selected') === 'true') initialize();
    }
  }, { rootMargin: '200px' });
  observer.observe(root);
} else initialize();
