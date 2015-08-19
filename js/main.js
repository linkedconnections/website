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
