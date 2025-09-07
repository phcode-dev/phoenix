define(function (require, exports, module) {
    const Mustache = require("thirdparty/mustache/mustache"),
        PopUpManager = require("widgets/PopUpManager"),
        ThemeManager = require("view/ThemeManager"),
        Strings      = require("strings"),
        LoginService = require("./login-service");

    const KernalModeTrust = window.KernalModeTrust;
    if(!KernalModeTrust){
        // integrated extensions will have access to kernal mode, but not external extensions
        throw new Error("profile menu should have access to KernalModeTrust. Cannot boot without trust ring");
    }

    let $icon;

    function _createSVGIcon(initials, bgColor) {
        return `<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" fill="${bgColor}"/>
            <text x="12" y="12" text-anchor="middle" dominant-baseline="central" font-size="10" fill="#fff" font-family="Inter, sans-serif">
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

    // Track if we're doing a background refresh to avoid closing user-opened popups
    let isBackgroundRefresh = false;

    // this is to handle document click events to close popup
    let documentClickHandler = null;

    function _handleSignInBtnClick() {
        closePopup(); // need to close the current popup to show the new one
        KernalModeTrust.loginService.signInToAccount();
    }

    function _handleSignOutBtnClick() {
        closePopup();
        KernalModeTrust.loginService.signOutAccount();
    }

    function _handleContactSupportBtnClick() {
        Phoenix.app.openURLInDefaultBrowser(brackets.config.support_url);
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
     */
    function showLoginPopup() {
        // If popup is already visible, just close it
        if (isPopupVisible) {
            closePopup();
            return;
        }

        // create the popup element
        closePopup(); // close any existing popup first

        // Render template with data
        const renderedTemplate = Mustache.render(loginTemplate, {Strings});
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
     * Update main navigation branding based on entitlements
     */
    function _updateBranding(entitlements) {
        const $brandingLink = $("#phcode-io-main-nav");
        if (!entitlements) {
            // Phoenix.pro is only for display purposes and should not be used to gate features.
            // Use kernal mode apis for trusted check of pro features.
            Phoenix.pro.plan = {
                paidSubscriber: false,
                name: "Community Edition"
            };
        }

        if (entitlements && entitlements.plan){
            Phoenix.pro.plan = {
                paidSubscriber: entitlements.plan.paidSubscriber,
                name: entitlements.plan.name,
                validTill: entitlements.plan.validTill
            };
        }
        if (entitlements && entitlements.plan && entitlements.plan.paidSubscriber) {
            // Paid subscriber: show plan name with feather icon
            const planName = entitlements.plan.name || "Phoenix Pro";
            $brandingLink
                .attr("href", "https://account.phcode.dev")
                .addClass("phoenix-pro")
                .html(`${planName}<i class="fa-solid fa-feather orange-gold" style="margin-left: 3px;"></i>`);
        } else {
            // Free user: show phcode.io branding
            $brandingLink
                .attr("href", "https://phcode.io")
                .removeClass("phoenix-pro")
                .text("phcode.io");
        }
    }

    let userEmail="";
    class SecureEmail extends HTMLElement {
        constructor() {
            super();
            // Create closed shadow root - this is for security that extensions wont be able to read email from DOM
            const shadow = this.attachShadow({ mode: 'closed' });
            // Create the email display with some obfuscation techniques
            shadow.innerHTML = `<span>${userEmail}</span>`;
        }
    }
    // Register the custom element
    /* eslint-disable-next-line*/
    customElements.define ('secure-email', SecureEmail); // space is must in define ( to prevent build fail

    let userName="";
    class SecureName extends HTMLElement {
        constructor() {
            super();
            // Create closed shadow root - this is for security that extensions wont be able to read name from DOM
            const shadow = this.attachShadow({ mode: 'closed' });
            // Create the email display with some obfuscation techniques
            shadow.innerHTML = `<span>${userName}</span>`;
        }
    }
    // Register the custom element

    /* eslint-disable-next-line*/
    customElements.define ('secure-name', SecureName); // space is must in define ( to prevent build fail

    /**
     * Load user details iframe with secure user information
     */
    function _loadUserDetailsIframe() {
        if (!Phoenix.isNativeApp && $popup) {
            const $iframe = $popup.find("#user-details-frame");
            const $secureName = $popup.find(".user-name secure-name");
            const $secureEmail = $popup.find(".user-email secure-email");

            if ($iframe.length) {
                // Get account base URL for iframe using login service
                const accountBaseURL = KernalModeTrust.loginService.getAccountBaseURL();
                const currentTheme = ThemeManager.getCurrentTheme();
                const nameColor = (currentTheme && currentTheme.dark) ? "FFFFFF" : "000000";

                // Configure iframe URL with styling parameters
                const iframeURL = `${accountBaseURL}/getUserDetailFrame?` +
                    `includeName=true&` +
                    `nameFontSize=14px&` +
                    `emailFontSize=12px&` +
                    `nameColor=%23${nameColor}&` +
                    `emailColor=%23666666&` +
                    `backgroundColor=transparent`;

                // Listen for iframe load events
                const messageHandler = function(event) {
                    // Only accept messages from trusted account domain
                    // Handle proxy case where accountBaseURL is '/proxy/accounts'
                    let trustedOrigin;
                    if (accountBaseURL.startsWith('/proxy/accounts')) {
                        // For localhost with proxy, accept messages from current origin
                        trustedOrigin = window.location.origin;
                    } else {
                        // For production, get origin from account URL
                        trustedOrigin = new URL(accountBaseURL).origin;
                    }

                    if (event.origin !== trustedOrigin) {
                        return;
                    }

                    if (event.data && event.data.loaded) {
                        // Hide secure DOM elements and show iframe
                        $secureName.hide();
                        $secureEmail.hide();
                        $iframe.show();

                        // Adjust iframe height based on content
                        $iframe.css('height', '36px'); // Approximate height for name + email

                        // Remove event listener
                        window.removeEventListener('message', messageHandler);
                    }
                };

                // Add message listener
                window.addEventListener('message', messageHandler);

                // Set iframe source to load user details
                $iframe.attr('src', iframeURL);

                // Fallback timeout - if iframe doesn't load in 5 seconds, keep secure elements
                setTimeout(() => {
                    if ($iframe.is(':hidden')) {
                        console.log('User details iframe failed to load, keeping secure elements');
                        window.removeEventListener('message', messageHandler);
                    }
                }, 5000);
            }
        }
    }

    /**
     * Update popup content with entitlements data
     */
    function _updatePopupWithEntitlements(entitlements) {
        if (!$popup || !entitlements) {
            return;
        }

        // Update plan information
        if (entitlements.plan) {
            const $planName = $popup.find('.user-plan-name');
            $planName.text(entitlements.plan.name);

            // Update plan class based on paid subscriber status
            $planName.removeClass('user-plan-free user-plan-paid');
            const planClass = entitlements.plan.paidSubscriber ? 'user-plan-paid' : 'user-plan-free';
            $planName.addClass(planClass);
        }

        // Update quota section if available
        if (entitlements.profileview && entitlements.profileview.quota) {
            const $quotaSection = $popup.find('.quota-section');
            const quota = entitlements.profileview.quota;

            // Remove forced-hidden and show quota section
            $quotaSection.removeClass('forced-hidden');

            // Update quota content
            $quotaSection.find('.titleText').text(quota.titleText);
            $quotaSection.find('.usageText').text(quota.usageText);
            $quotaSection.find('.progress-fill').css('width', quota.usedPercent + '%');
        }

        // Update HTML message if available
        if (entitlements.profileview && entitlements.profileview.htmlMessage) {
            const $htmlMessageSection = $popup.find('.html-message');
            $htmlMessageSection.removeClass('forced-hidden');
            $htmlMessageSection.html(entitlements.profileview.htmlMessage);
        }

        // Reposition popup after content changes
        positionPopup();
    }

    /**
     * Shows the user profile popup when the user is logged in
     */
    function showProfilePopup() {
        // If popup is already visible, just close it
        if (isPopupVisible) {
            closePopup();
            return;
        }
        const profileData = KernalModeTrust.loginService.getProfile();
        userEmail = profileData.email;
        userName = profileData.firstName + " " + profileData.lastName;

        // Default template data (fallback) - start with cached plan info if available
        const templateData = {
            initials: profileData.profileIcon.initials,
            avatarColor: profileData.profileIcon.color,
            planClass: "user-plan-free",
            planName: "Free Plan",
            titleText: "Ai Quota Used",
            usageText: "100 / 200 credits",
            usedPercent: 0,
            Strings: Strings
        };

        // Note: We don't await here to keep popup display instant
        // Cached entitlements will be applied asynchronously after popup is shown

        // Render template with data immediately
        const renderedTemplate = Mustache.render(profileTemplate, templateData);
        $popup = $(renderedTemplate);

        $("body").append($popup);
        isPopupVisible = true;

        positionPopup();

        // Apply cached entitlements immediately if available (including quota/messages)
        KernalModeTrust.loginService.getEntitlements(false).then(cachedEntitlements => {
            if (cachedEntitlements && isPopupVisible) {
                _updatePopupWithEntitlements(cachedEntitlements);
            }
        }).catch(error => {
            console.error('Failed to apply cached entitlements to popup:', error);
        });

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

        // Load user details iframe for browser apps (after popup is created)
        _loadUserDetailsIframe();

        // Refresh entitlements in background and update popup if still visible
        _refreshEntitlementsInBackground();
    }

    /**
     * Refresh entitlements in background and update popup if still visible
     */
    async function _refreshEntitlementsInBackground() {
        try {
            // Fetch fresh entitlements from API
            const freshEntitlements = await KernalModeTrust.loginService.getEntitlements(true); // Force refresh to get latest data

            // Only update popup if it's still visible
            if (isPopupVisible && $popup && freshEntitlements) {
                _updatePopupWithEntitlements(freshEntitlements);
            }
        } catch (error) {
            console.error('Failed to refresh entitlements in background:', error);
        }
    }

    /**
     * Toggle the profile popup based on the user's login status
     */
    function togglePopup() {
        // check if the popup is already visible or not. if visible close it
        if (isPopupVisible) {
            closePopup();
            return;
        }

        // Show popup immediately with cached status for instant response
        if (KernalModeTrust.loginService.isLoggedIn()) {
            showProfilePopup();
        } else {
            showLoginPopup();
        }

        // Schedule background verification to update the popup if status changed
        // Store the current login state before verification
        const wasLoggedInBefore = KernalModeTrust.loginService.isLoggedIn();

        // Set flag to indicate this is a background refresh
        isBackgroundRefresh = true;

        KernalModeTrust.loginService.verifyLoginStatus().then(() => {
            // Clear the background refresh flag
            isBackgroundRefresh = false;

            // If the login status changed while popup is open, update it
            if (isPopupVisible) {
                const isLoggedInNow = KernalModeTrust.loginService.isLoggedIn();

                if (wasLoggedInBefore !== isLoggedInNow) {
                    // Status changed, close current popup and show correct one
                    closePopup();
                    if (isLoggedInNow) {
                        showProfilePopup();
                    } else {
                        showLoginPopup();
                    }
                }
                // If status didn't change, don't do anything to avoid closing popup
            }
        }).catch(error => {
            // Clear the background refresh flag even on error
            isBackgroundRefresh = false;
            console.error("Background login status verification failed:", error);
        });
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
        $icon.on('click', ()=>{
            togglePopup();
        });
    }

    function setNotLoggedIn() {
        // Only close popup if it's not a background refresh
        if (isPopupVisible && !isBackgroundRefresh) {
            closePopup();
        }
        _removeProfileIcon();

        // Clear cached entitlements when user logs out
        KernalModeTrust.loginService.clearEntitlements();

        // Reset branding to free mode
        _updateBranding(null);
    }

    function setLoggedIn(initial, color) {
        // Only close popup if it's not a background refresh
        if (isPopupVisible && !isBackgroundRefresh) {
            closePopup();
        }
        _updateProfileIcon(initial, color);

        // Preload entitlements when user logs in
        KernalModeTrust.loginService.getEntitlements()
            .then(_updateBranding)
            .catch(error => {
                console.error('Failed to preload entitlements on login:', error);
            });
    }

    exports.init = init;
    exports.setNotLoggedIn = setNotLoggedIn;
    exports.setLoggedIn = setLoggedIn;

    // dont public exports things that extensions can use to get/put credentials and entitlements, display mods is fine
});
