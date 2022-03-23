/*$(function() {
  $('.side-nav-content').perfectScrollbar();
});
*/
$(function() {
	$(".header-nav-item-select").click(function(){
	  $(this).parents('.header-nav').toggleClass("is-collapse");
	  $(this).parents().children('.content').toggleClass("is-collapse");
	   $(this).parents().children('.side-nav').toggleClass("nav-menu-collapse");
	});
	
});

$(function() {
	$(".close-menu").click(function(){
	  $(this).parents('.header-nav').removeClass("is-collapse");
	  $(this).parents().children('.content').removeClass("is-collapse");
	   $(this).parents().children('.side-nav').removeClass("nav-menu-collapse");
	});
	
});