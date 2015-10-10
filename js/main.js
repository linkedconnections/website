$(function(){
  var map = L.map('map',{
    scrollWheelZoom : false
  }).setView([51.1, 4.4], 8);
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
      iconUrl : 'http://opentripplanner.nl/images/marker-flag-start-shadowed.png',
      iconSize: [48, 49],
      iconAnchor: [48, 49]
    });

    var endIcon = L.icon({
      iconUrl : 'http://opentripplanner.nl/images/marker-flag-end-shadowed.png',
      iconSize: [48, 49],
      iconAnchor: [47, 49]
    });

    var defaultIcon = L.icon({
      iconUrl : 'bower_components/leaflet/dist/images/marker-icon.png'
    });
    
    
    var planner = new window.lc.Client({"entrypoints" : ["http://belgianrail.linkedconnections.org/"]});
    var departureStop = "";
    var arrivalStop = "";
    var handleClick = function (station, marker) {
      if (departureStop === "") {
        marker.setIcon(startIcon);
        departureStop = station;
        $('#demoexplanation').html('<p class="calltoaction"><emph>Step 2:</emph> Great! Now select a destination pin</p>');
        return departureStop;
      } else if (arrivalStop === "") {
        arrivalStop = station;
        marker.setIcon(endIcon);
        $('#demoexplanation').html('<p class="calltoaction">Your browser is calculating the earliest arrival time by following links on the Web!</p>');
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
                line.push(connection.departureStop.point);
                line.push(connection.arrivalStop.point);
              });
              new L.Polyline(line, {
                color: 'red',
                weight: 5,
                smoothFactor: 1
              }).addTo(map);
              
            }
            var duration = ((path[path.length-1].arrivalTime.getTime() - path[0].departureTime.getTime())/60000 );
            $('#demoexplanation').append("Duration of the journey is: " + duration + " minutes</p>");
            $('#demoexplanation').append('<p class="calltoaction">Want to know <a href="javascript:location(\"#how-it-works\")">how it works</a>?</p>');
          });
          stream.on('data', function (connection) {
            connection.arrivalStop = stations[connection.arrivalStop];
            connection.departureStop = stations[connection.departureStop];
            var polyline = new L.Polyline([connection.departureStop.point, connection.arrivalStop.point], {
              color: '#3b6790',
              weight: 8,
              smoothFactor: 4
            }).addTo(map);
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
