
// Window resizing issue, set the property --vh
function setProp(){
  let vh = window.innerHeight*0.01;
  document.documentElement.style.setProperty(`--vh`, `${vh}px`);
}

setProp();
window.addEventListener('resize', setProp);

// Parallax effect
var parallax = document.querySelector(".parallax");

window.addEventListener('scroll', function() {
    var scrolled = window.scrollY;
    var coords = '50% ' + -(scrolled * 0.15) + 'px';
    parallax.style.backgroundPosition = coords;
  });