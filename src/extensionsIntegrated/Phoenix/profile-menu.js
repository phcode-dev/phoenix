define(function (require, exports, module) {
    const Mustache = require("thirdparty/mustache/mustache");
    const PopUpManager = require("widgets/PopUpManager");

    // HTML templates
    const loginTemplate = require("text!./html/login-dialog.html");
    const profileTemplate = require("text!./html/profile-panel.html");

    // for the popup DOM element
    let $popup = null;

    // this is to track whether the popup is visible or not
    let isPopupVisible = false;

    // if user is logged in we show the profile menu, otherwise we show the login menu
    let isLoggedIn = false;

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
        isLoggedIn = true;
        showProfilePopup();
    }

    function _handleSignOutBtnClick() {
        console.log("User clicked sign out");
        closePopup();
        isLoggedIn = false;
        showLoginPopup();
    }

    function _handleContactSupportBtnClick() {
        Phoenix.app.openURLInDefaultBrowser(brackets.config.support_url);
    }

    function _handleAccountDetailsBtnClick() {
        console.log("User clicked account details");
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
    }

    /**
     * Toggle the profile popup based on the user's login status
     * this function is called inside the src/extensionsIntegrated/Phoenix/main.js when user clicks on the profile icon
     * @param {Object} data - Data to populate the templates (optional)
     */
    function init(data) {
        // check if the popup is already visible or not. if visible close it
        if (isPopupVisible) {
            closePopup();
            return;
        }

        if (isLoggedIn) {
            showProfilePopup(data);
        } else {
            showLoginPopup(data);
        }
    }

    exports.init = init;
});
