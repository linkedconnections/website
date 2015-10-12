$(function(){
  var map = L.map('map',{
    scrollWheelZoom : false
  }).setView([51.0, 4.4], 7);
  L.tileLayer('http://{s}.tile.thunderforest.com/transport/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  //Create our stations list on the basis of the iRail API
  var stations = {};
  var markers = {
    "8892007" : true,//Gent
    "8891009" : true,//Luik
    "8841004" : true,//Brugge
    "8821006" : true,//Antwerpen
    "8863008" : true,//Namur
//    "8844404" : true,//Spa <3
    "8812005" : true //Brussel Noord
  };
  
  $.get("http://api.irail.be/stations.php?format=json", function (stationslist) {
    stationslist.station.forEach(function (station) {
      var key = station["@id"].replace('http://irail.be/stations/NMBS/00','');
      stations[key] = {
        longitude : station.locationX,
        latitude : station.locationY,
        name : station.name,
        '@id' : station['@id'],
        point : new L.LatLng(station.locationY, station.locationX)
      };
      if (markers[key]) {
        markers[key] = L.marker([station.locationY, station.locationX]).addTo(map);
        markers[key].on("click", function () {
          handleClick(key, markers[key]);
        });
      }
    });
    
    var startIcon = L.icon({
      iconUrl : 'images/marker-icon-start.png',
      iconRetinaUrl: 'images/marker-icon-2x-start.png'
    });

    var endIcon = L.icon({
      iconUrl : 'images/marker-icon-end.png',
      iconRetinaUrl: 'images/marker-icon-2x-end.png'
    });

    L.Icon.Default.iconUrl = 'images/marker-icon.png';
    L.Icon.Default.iconRetinaUrl = 'images/marker-2x-icon.png';
    
    var planner = new window.lc.Client({"entrypoints" : ["http://belgianrail.linkedconnections.org/"]});
    var departureStop = "";
    var arrivalStop = "";
    var handleClick = function (station, marker) {
      if (departureStop === "") {
        marker.setIcon(startIcon);
        departureStop = station;
        $('#demoexplanation').html('<span class="calltoaction"><emph>Step 2:</emph> Great! Now select a destination pin</span><img src="images/arrow.png" width="50px" style="margin-bottom: 50px; -moz-transform: scaleX(-1);-webkit-transform: scaleX(-1);-o-transform: scaleX(-1);transform: scaleX(-1);-ms-filter: fliph;filter: fliph;"/>');
        return departureStop;
      } else if (arrivalStop === "") {
        arrivalStop = station;
        marker.setIcon(endIcon);
        $('#demoexplanation').html('<p class="calltoaction">Crawling the Web of data for route planning advice</p>');
        planner.query({
          "departureStop": departureStop,
          "arrivalStop": station,
          "departureTime": new Date("2015-10-01T10:00")
        }, function (stream) {
          stream.on('result', function (path) {
            $("#demoexplanation").html("<p>");
            if (path) {
              var line = [];
              path.forEach(function (connection) {
                if (connection.arrivalStop.point && connection.departureStop.point) {
                  line.push(connection.departureStop.point);
                  line.push(connection.arrivalStop.point);
                }
              });
              var polyline = new L.Polyline(line, {
                color: '#3e5a3e',
                weight: 6,
                smoothFactor: 1
              }).addTo(map);
              map.fitBounds(polyline.getBounds());
            }
            var duration = ((path[path.length-1].arrivalTime.getTime() - path[0].departureTime.getTime())/60000 );
            $('#demoexplanation').append("Going from  " + path[0].departureStop.name + " to " + path[path.length-1].arrivalStop.name + " will take you " + duration + " minutes!</p>");
            $('#demoexplanation').append('<p class="calltoaction">↓ Scroll down to know how it works ↓</p>');
          });
          stream.on('data', function (connection) {
            if (stations[connection.arrivalStop] && stations[connection.departureStop]) {
              connection.arrivalStop = stations[connection.arrivalStop];
              connection.departureStop = stations[connection.departureStop];
              var polyline = new L.Polyline([connection.departureStop.point, connection.arrivalStop.point], {
                color: '#3b6790',
                weight: 6,
                smoothFactor: 4
              }).addTo(map);
            } else {
              connection.arrivalStop = {
                name : connection.arrivalStop
              };
              connection.departureStop = {
                name : connection.arrivalStop
              };
            }
          });
          
          stream.on('error', function (error) {
            console.error(error);
          });
          stream.on('end', function () {
            console.log('end of stream');
          });
        });
      }
    };

  });  
  //Scrolling code for the navigation on top
  $('.scroll').on('click', function(event) {
    event.preventDefault();
    var target = "#" + $(this).data('target');
    var offs = $(target).offset().top;

    $('html, body').animate({
      scrollTop: offs-60
    }, 700);
  });

  $( '.scrollTop' ).on('click', function(event) {
    event.preventDefault();
    $('body').animate({
      scrollTop: $('body').offset().top
    }, 700);
  });

  var stickyNavTop = $('#nav').offset().top;

  var stickyNav = function(){
    var scrollTop = $(window).scrollTop();

    if (scrollTop > stickyNavTop) {
      $('#nav').addClass('sticky');
    } else {
      $('#nav').removeClass('sticky');
    }
  };

  stickyNav();

  $(window).scroll(function() {
    stickyNav();
  });
});
