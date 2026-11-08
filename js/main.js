(function () {
  'use strict';

  var mapElement = document.getElementById('map');
  var status = document.getElementById('demoexplanation');
  if (!mapElement || !status) return;

  function showStatus(message, retry) {
    status.textContent = message;
    if (retry) {
      status.appendChild(document.createTextNode(' '));
      var button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Try again';
      button.addEventListener('click', retry);
      status.appendChild(button);
    }
  }

  if (!window.L || !window.lc || !window.lc.Client) {
    showStatus('The map could not be loaded. Please reload the page to try again.');
    return;
  }

  var map = L.map('map', { scrollWheelZoom: false }).setView([51.0, 4.4], 7);
  L.tileLayer('https://{s}.tile.thunderforest.com/transport/{z}/{x}/{y}.png?apikey=f2488a35b11044e4844692095875c9ce', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  var stations = {};
  var markers = {};
  var stationIds = [
    'http://irail.be/stations/NMBS/008892007', // Gent
    'http://irail.be/stations/NMBS/008891009', // Liège
    'http://irail.be/stations/NMBS/008841004', // Brugge
    'http://irail.be/stations/NMBS/008821006', // Antwerpen
    'http://irail.be/stations/NMBS/008863008', // Namur
    'http://irail.be/stations/NMBS/008844404', // Spa
    'http://irail.be/stations/NMBS/008866258', // Neufchâteau
    'http://irail.be/stations/NMBS/008866001', // Arlon
    'http://irail.be/stations/NMBS/008812005'  // Brussel-Noord
  ];
  var blueIcon = L.icon({ iconUrl: '/images/marker-icon.png', iconAnchor: [12, 41] });
  var startIcon = L.icon({ iconUrl: '/images/marker-icon-start.png', iconAnchor: [12, 41] });
  var endIcon = L.icon({ iconUrl: '/images/marker-icon-end.png', iconAnchor: [12, 41] });
  var lines = L.layerGroup().addTo(map);
  var departureStop = '';
  var arrivalStop = '';
  var queryId = 0;
  var queryTimer;

  function reset() {
    queryId += 1;
    clearTimeout(queryTimer);
    lines.clearLayers();
    departureStop = '';
    arrivalStop = '';
    Object.keys(markers).forEach(function (id) { markers[id].setIcon(blueIcon); });
    map.setView([51.0, 4.4], 7);
    showStatus('Select a departure station on the map.');
  }

  function planRoute() {
    var currentQuery = ++queryId;
    var hasResult = false;
    var finished = false;

    function failed() {
      if (currentQuery !== queryId || finished) return;
      finished = true;
      clearTimeout(queryTimer);
      showStatus('The route planning service is unavailable. Please try again later.', reset);
    }

    showStatus('Searching for a route from ' + stations[departureStop].name + ' to ' + stations[arrivalStop].name + '…');
    queryTimer = setTimeout(failed, 30000);

    try {
      var planner = new window.lc.Client({ entrypoints: ['https://staging.api.irail.be/graph'] });
      planner.query({
        departureStop: departureStop,
        arrivalStop: arrivalStop,
        departureTime: new Date()
      }, function (stream) {
        if (currentQuery !== queryId || finished) return;
        if (!stream || typeof stream.on !== 'function') return failed();

        stream.on('data', function (connection) {
          if (currentQuery !== queryId || finished) return;
          var departure = stations[connection.departureStop];
          var arrival = stations[connection.arrivalStop];
          connection.departureStop = departure || { name: connection.departureStop };
          connection.arrivalStop = arrival || { name: connection.arrivalStop };
          if (departure && arrival) {
            L.polyline([departure.point, arrival.point], { color: '#285a80', weight: 3, opacity: .45 }).addTo(lines);
          }
        });

        stream.on('result', function (path) {
          if (currentQuery !== queryId || finished || !path || !path.length) return;
          hasResult = true;
          clearTimeout(queryTimer);
          var points = [];
          path.forEach(function (connection) {
            if (connection.departureStop.point && connection.arrivalStop.point) {
              points.push(connection.departureStop.point, connection.arrivalStop.point);
            }
          });
          if (points.length) {
            var route = L.polyline(points, { color: '#285a80', weight: 5 }).addTo(lines);
            map.fitBounds(route.getBounds(), { padding: [20, 20] });
          }
          var duration = Math.round((path[path.length - 1].arrivalTime.getTime() - path[0].departureTime.getTime()) / 60000);
          showStatus('From ' + stations[departureStop].name + ' to ' + stations[arrivalStop].name + ': ' + duration + ' minutes.', reset);
        });

        stream.on('error', failed);
        stream.on('end', function () {
          if (currentQuery !== queryId || finished) return;
          finished = true;
          clearTimeout(queryTimer);
          if (!hasResult) showStatus('No route was found for these stations. Try another journey.', reset);
        });
      });
    } catch (error) {
      failed();
    }
  }

  function selectStation(id) {
    if (!departureStop) {
      departureStop = id;
      markers[id].setIcon(startIcon);
      showStatus('Departure: ' + stations[id].name + '. Select a destination station.');
    } else if (!arrivalStop && id !== departureStop) {
      arrivalStop = id;
      markers[id].setIcon(endIcon);
      planRoute();
    }
  }

  function loadStations() {
    showStatus('Loading the station map…');
    var controller = new AbortController();
    var stationTimer = setTimeout(function () { controller.abort(); }, 15000);
    fetch('https://api.irail.be/stations?format=json', { signal: controller.signal })
      .then(function (response) {
        if (!response.ok) throw new Error('Station request failed');
        return response.json();
      })
      .then(function (data) {
        if (!Array.isArray(data.station)) throw new Error('Station list unavailable');
        data.station.forEach(function (station) {
          var id = station['@id'];
          stations[id] = {
            name: station.name,
            point: L.latLng(station.locationY, station.locationX)
          };
          if (stationIds.indexOf(id) !== -1) {
            markers[id] = L.marker(stations[id].point, {
              icon: blueIcon,
              title: station.name,
              alt: station.name,
              keyboard: true
            }).addTo(map).on('click', function () { selectStation(id); });
          }
        });
        if (!Object.keys(markers).length) throw new Error('No demo stations available');
        reset();
      })
      .catch(function () {
        showStatus('The station service is unavailable. Please try again later.', loadStations);
      })
      .finally(function () { clearTimeout(stationTimer); });
  }

  loadStations();
}());
