$(function(){
  var map = L.map('map',{
    scrollWheelZoom : false
  }).setView([51.1, 4.4], 8);
  L.tileLayer('http://{s}.tile.thunderforest.com/transport/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  //Add 4 stations on the map that kan be pressed
  var gentspmarker = L.marker([51.035896, 3.710675]).addTo(map);
  var brusselcmarker = L.marker([50.845658, 4.356801]).addTo(map);
  var brugesmarker = L.marker([51.197226, 3.216726]).addTo(map);
  var antwerpencmarker = L.marker([51.2172, 4.421101]).addTo(map);
  
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
      return departureStop;
    } else if (arrivalStop === "") {
      arrivalStop = station;
      marker.setIcon(endIcon);
      $('#demoexplanation').html('Loading...');
      planner.query({
        "departureStop": departureStop,
        "arrivalStop": station,
        "departureTime": new Date()
      }, function (stream) {
        stream.on('data', function (path) {
          
          $("#demoexplanation").html("");
          if (path) {$('#demoexplanation')
            path.forEach(function (connection) {
              $('#demoexplanation').append(connection.departureTime.toISOString() + " at " + connection.departureStop + " To arrive in " + connection.arrivalStop + " at " +  connection.arrivalTime.toISOString());
              if (connection["gtfs:trip"]) {
                $('#demoexplanation').append(" with trip id " + JSON.stringify(connection["gtfs:trip"]));
              }
              if (connection["gtfs:headsign"]) {
                $('#demoexplanation').append(" with headsign " + JSON.stringify(connection["gtfs:headsign"]));
              }
              if (connection["gtfs:route"]) {
                $('#demoexplanation').append(" with route " + JSON.stringify(connection["gtfs:route"]));
              }
              $('#demoexplanation').append("<br/>");
            });
          }
          var duration = ((path[path.length-1].arrivalTime.getTime() - path[0].departureTime.getTime())/60000 );
          $('#demoexplanation').append("Duration of the journey is: " + duration + " minutes");
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

  gentspmarker.on("click", function () {handleClick("8892007", gentspmarker)});
  brusselcmarker.on("click", function () {handleClick("8813003", brusselcmarker)});
  brugesmarker.on("click", function () {handleClick("8891009", brugesmarker)});
  antwerpencmarker.on("click", function () {handleClick("8821006", antwerpencmarker)});
  
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
