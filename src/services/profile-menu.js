define(function (require, exports, module) {
    const Mustache = require("thirdparty/mustache/mustache"),
        PopUpManager = require("widgets/PopUpManager"),
        Strings      = require("strings");

    const KernalModeTrust = window.KernalModeTrust;
    if(!KernalModeTrust){
        // integrated extensions will have access to kernal mode, but not external extensions
        throw new Error("profile menu should have access to KernalModeTrust. Cannot boot without trust ring");
    }

    let $icon;

    function _createSVGIcon(initials, bgColor) {
        return `<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" fill="${bgColor}"/>
  <text x="50%" y="58%" text-anchor="middle" font-size="11" fill="#fff" font-family="Inter, sans-serif" dy=".1em">
    ${initials}</text>
        </svg>`;
    }

    function _updateProfileIcon(initials, bgColor) {
        $icon.empty()
            .append(_createSVGIcon(initials, bgColor));
    }

    function _removeProfileIcon() {
        $icon.empty();
    }

    // HTML templates
    const loginTemplate = require("text!./html/login-popup.html");
    const profileTemplate = require("text!./html/profile-popup.html");

    // for the popup DOM element
    let $popup = null;

    // this is to track whether the popup is visible or not
    let isPopupVisible = false;

    // this is to handle document click events to close popup
    let documentClickHandler = null;

    const defaultLoginData = {
        welcomeTitle: "Welcome to Phoenix Code",
        signInBtnText: "Sign in to your account",
        supportBtnText: "Contact support"
    };

    const defaultProfileData = {
        initials: "CA",
        userName: "Charly A.",
        planName: "Paid Plan",
        quotaLabel: "AI quota used",
        quotaUsed: "7,000",
        quotaTotal: "10,000",
        quotaUnit: "tokens",
        quotaPercent: 70,
        accountBtnText: "Account details",
        supportBtnText: "Contact support",
        signOutBtnText: "Sign out"
    };

    function _handleSignInBtnClick() {
        console.log("User clicked sign in button");
        closePopup(); // need to close the current popup to show the new one
        KernalModeTrust.loginService.signInToAccount();
    }

    function _handleSignOutBtnClick() {
        console.log("User clicked sign out");
        closePopup();
        showLoginPopup();
    }

    function _handleContactSupportBtnClick() {
        Phoenix.app.openURLInDefaultBrowser(brackets.config.support_url_account);
    }

    function _handleAccountDetailsBtnClick() {
        Phoenix.app.openURLInDefaultBrowser(brackets.config.account_url);
    }

    /**
     * Close the popup if it's open
     * this is called at various instances like when the user click on the profile icon even if the popup is open
     * or when user clicks somewhere else on the document
     */
    function closePopup() {
        if ($popup) {
            PopUpManager.removePopUp($popup);
            $popup = null;
            isPopupVisible = false;
        }

        // we need to remove document click handler if it already exists
        if (documentClickHandler) {
            $(document).off("mousedown", documentClickHandler);
            documentClickHandler = null;
        }
    }

    /**
     * this function is to position the popup near the profile button
     */
    function positionPopup() {
        const $profileButton = $("#user-profile-button");

        if ($profileButton.length && $popup) {
            const buttonPos = $profileButton.offset();
            const popupWidth = $popup.outerWidth();
            const windowWidth = $(window).width();

            // pos above the profile button
            let top = buttonPos.top - $popup.outerHeight() - 10;

            // If popup would go off the right edge of the window, align right edge of popup with right edge of button
            let left = Math.min(
                buttonPos.left - popupWidth + $profileButton.outerWidth(),
                windowWidth - popupWidth - 10
            );

            // never go off left edge
            left = Math.max(10, left);

            $popup.css({
                top: top + "px",
                left: left + "px"
            });
        }
    }

    /**
     * this function is responsible to set up a click handler to close the popup when clicking outside
     */
    function _setupDocumentClickHandler() {
        // remove any existing handlers
        if (documentClickHandler) {
            $(document).off("mousedown", documentClickHandler);
        }

        // add the new click handler
        documentClickHandler = function (event) {
            // if the click is outside the popup and not on the profile button (which toggles the popup)
            if ($popup && !$popup[0].contains(event.target) && !$("#user-profile-button")[0].contains(event.target)) {
                closePopup();
            }
        };

        // this is needed so we don't close the popup immediately as the profile button is clicked
        setTimeout(function() {
            $(document).on("mousedown", documentClickHandler);
        }, 100);
    }

    /**
     * Shows the sign-in popup when the user is not logged in
     * @param {Object} loginData - Data to populate the template (optional)
     */
    function showLoginPopup(loginData) {
        // If popup is already visible, just close it
        if (isPopupVisible) {
            closePopup();
            return;
        }

        // Merge provided data with defaults
        const templateData = $.extend({}, defaultLoginData, loginData || {});

        // create the popup element
        closePopup(); // close any existing popup first

        // Render template with data
        const renderedTemplate = Mustache.render(loginTemplate, templateData);
        $popup = $(renderedTemplate);

        $("body").append($popup);
        isPopupVisible = true;

        positionPopup();

        PopUpManager.addPopUp($popup, function() {
            $popup.remove();
            $popup = null;
            isPopupVisible = false;
        }, true, { closeCurrentPopups: true });

        // event handlers for buttons
        $popup.find("#phoenix-signin-btn").on("click", function () {
            _handleSignInBtnClick();
        });

        $popup.find("#phoenix-support-btn").on("click", function () {
            _handleContactSupportBtnClick();
            closePopup();
        });

        // handle window resize to reposition popup
        $(window).on("resize.profilePopup", function () {
            if (isPopupVisible) {
                positionPopup();
            }
        });

        _setupDocumentClickHandler();
    }

    /**
     * Shows the user profile popup when the user is logged in
     * @param {Object} profileData - Data to populate the template (optional)
     */
    function showProfilePopup(profileData) {
        // If popup is already visible, just close it
        if (isPopupVisible) {
            closePopup();
            return;
        }

        // Merge provided data with defaults
        const templateData = $.extend({}, defaultProfileData, profileData || {});

        closePopup();

        // Render template with data
        const renderedTemplate = Mustache.render(profileTemplate, templateData);
        $popup = $(renderedTemplate);

        $("body").append($popup);
        isPopupVisible = true;
        positionPopup();

        PopUpManager.addPopUp($popup, function() {
            $popup.remove();
            $popup = null;
            isPopupVisible = false;
        }, true, { closeCurrentPopups: true });

        $popup.find("#phoenix-account-btn").on("click", function () {
            _handleAccountDetailsBtnClick();
            closePopup();
        });

        $popup.find("#phoenix-support-btn").on("click", function () {
            _handleContactSupportBtnClick();
            closePopup();
        });

        $popup.find("#phoenix-signout-btn").on("click", function () {
            _handleSignOutBtnClick();
        });

        // handle window resize to reposition popup
        $(window).on("resize.profilePopup", function () {
            if (isPopupVisible) {
                positionPopup();
            }
        });

        _setupDocumentClickHandler();
    }

    /**
     * Toggle the profile popup based on the user's login status
     * this function is called inside the src/extensionsIntegrated/Phoenix/main.js when user clicks on the profile icon
     * @param {Object} data - Data to populate the templates (optional)
     */
    function togglePopup(data) {
        // check if the popup is already visible or not. if visible close it
        if (isPopupVisible) {
            closePopup();
            return;
        }

        if (KernalModeTrust.loginService.isLoggedIn()) {
            showProfilePopup(data);
        } else {
            showLoginPopup(data);
        }
    }

    function init() {
        const helpButtonID = "user-profile-button";
        $icon = $("<a>")
            .attr({
                id: helpButtonID,
                href: "#",
                class: "user",
                title: Strings.CMD_USER_PROFILE
            })
            .appendTo($("#main-toolbar .bottom-buttons"));
        // _updateProfileIcon("CA", "blue");
        $icon.on('click', ()=>{
            if(!Phoenix.isNativeApp){
                // in browser app, we don't currently support login
                Phoenix.app.openURLInDefaultBrowser("https://account.phcode.io");
                return;
            }
            togglePopup();
        });
    }

    function setNotLoggedIn() {
        if (isPopupVisible) {
            closePopup();
        }
        _removeProfileIcon();
    }

    function setLoggedIn(initial, color) {
        if (isPopupVisible) {
            closePopup();
        }
        _updateProfileIcon(initial, color);
    }

    exports.init = init;
    exports.setNotLoggedIn = setNotLoggedIn;
    exports.setLoggedIn = setLoggedIn;
});
