/*!
 * Brackets Git Extension
 *
 * @author Martin Zagora
 * @license http://opensource.org/licenses/MIT
 */

define(function (require, exports, module) {

    // Brackets modules
    const _               = brackets.getModule("thirdparty/lodash"),
        AppInit         = brackets.getModule("utils/AppInit"),
        ExtensionUtils  = brackets.getModule("utils/ExtensionUtils");

    // Local modules
    require("src/SettingsDialog");
    const EventEmitter    = require("src/EventEmitter"),
        Events          = require("src/Events"),
        Main            = require("src/Main"),
        Preferences     = require("src/Preferences"),
        Git             = require("src/git/Git"),
        BracketsEvents     = require("src/BracketsEvents");

    // Load extension modules that are not included by core
    var modules = [
        "src/GutterManager",
        "src/History",
        "src/NoRepo",
        "src/ProjectTreeMarks",
        "src/Remotes"
    ];
    require(modules);

    // Load CSS
    if(Phoenix.config.environment === "dev"){
        ExtensionUtils.loadStyleSheet(module, "styles/git-styles.less");
    } else {
        ExtensionUtils.loadStyleSheet(module, "styles/git-styles-min.css");
    }

    AppInit.appReady(function () {
        Main.init().then((enabled)=>{
            if(!enabled) {
                BracketsEvents.disableAll();
            }
        });
    });

    // export API's for other extensions
    if (typeof window === "object") {
        window.phoenixGitEvents = {
            EventEmitter: EventEmitter,
            Events: Events,
            Git
        };
    }
});
