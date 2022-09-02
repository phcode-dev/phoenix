/*global YT*/
$(document).ready(function () {
    var pos = 0,
        slides = $(".slide"),
        numOfSlides = slides.length;

    function nextSlide() {
        // `[]` returns a vanilla DOM object from a jQuery object/collection
        slides[pos].video.stopVideo();
        slides.eq(pos).animate({ left: "-100%" }, 500);
        pos = pos >= numOfSlides - 1 ? 0 : ++pos;
        slides.eq(pos).css({ left: "100%" }).animate({ left: 0 }, 500);
    }

    function previousSlide() {
        slides[pos].video.stopVideo();
        slides.eq(pos).animate({ left: "100%" }, 500);
        pos = pos === 0 ? numOfSlides - 1 : --pos;
        slides.eq(pos).css({ left: "-100%" }).animate({ left: 0 }, 500);
    }

    $(".left").click(previousSlide);
    $(".right").click(nextSlide);
});

function onYouTubeIframeAPIReady() {
    $(".slide").each(function (index, slide) {
        // Get the `.video` element inside each `.slide`
        var iframe = $(slide).find(".video")[0];
        // Create a new YT.Player from the iFrame, and store it on the `.slide` DOM object
        slide.video = new YT.Player(iframe);
    });
}
