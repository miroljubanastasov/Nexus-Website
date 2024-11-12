var parallax = document.querySelector(".parallax");

window.addEventListener('scroll', function() {
    var scrolled = window.scrollY;
    var coords = '50% ' + -(scrolled * 0.15) + 'px';
    parallax.style.backgroundPosition = coords;
  });