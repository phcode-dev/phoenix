function onPageLoaded() {
    // Write your javascript code here
    console.log("page loaded");
}

document.addEventListener("DOMContentLoaded", function () {
    // Listen for clicks on elements with the class 'play-button'
    document.querySelectorAll(".play-button").forEach(function (button) {
        button.addEventListener("click", function () {
            // When a play button is clicked, simulate a click on the <a> tag within the same .video-container
            this.parentNode.querySelector("a").click();
        });
    });
});
