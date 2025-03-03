define(function (require, exports, module) {
    const DropdownButton = brackets.getModule("widgets/DropdownButton");

    function showMoreOptionsContextMenu(x, y) {
        const items = [
            "close all tabs",
            "close unmodified tabs"
        ];

        const dropdown = new DropdownButton.DropdownButton("", items);

        $(".tab-bar-more-options").append(dropdown.$button);
        dropdown.showDropdown();

        dropdown.$button.on(DropdownButton.EVENT_SELECTED, function (e, item, index) {
            console.log("Selected item:", item);
            // TODO: Add the logic here
            // check for index and then call the items
        });

        $(document).one("click", function () {
            dropdown.closeDropdown();
        });
    }

    function handleMoreOptionsClick() {
        $(document).on("click", ".tab-bar-more-options", function (event) {
            event.stopPropagation();
            showMoreOptionsContextMenu(event.pageX, event.pageY);
        });
    }

    module.exports = {
        handleMoreOptionsClick
    };
});
