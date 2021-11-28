/*global define, brackets, $*/
define(function (require, exports, module) {
    "use strict";
    var AppInit        = brackets.getModule('utils/AppInit'),
        Dialogs        = brackets.getModule("widgets/Dialogs"),
        alerted        = "it is possible that a similar extension to this is interfering with the operation <br> Please uninstall the extensions similar to this.",
        COMMAND_ID     = "fhsdfbsdgreb.ssdg";
    function detected(){
        window.setTimeout(function(){
            // collapse plugin
            var one = $('.content .working-file-tabs-container').length; //Brackets Working File Tabs
            var two = $('#editor-holder #ext-documents').length; //Documents Toolbar
            var tre = $('.content .gt-tabs').length;  //Brackets File Tabs
            var fou = $('#status-bar .extension-toolbar').length; //Extensions Toolbar Reposition
            var oneC = "<br> Brackets Working File Tabs",
                twoC = "<br> Documents Toolbar",
                treC = "<br> Brackets File Tabs",
                fouC = "<br> Extensions Toolbar Reposition";
            var coll = function(){
                if( one && !two && !tre && !fou ){
                    return oneC;
                } else if( two && !one && !tre && !fou ){
                    return twoC;
                } else if( tre && !two && !one && !fou ){
                    return treC;
                } else if( fou && !one && !two && !tre ){
                    return fouC;
                } else if ( one && two && !tre && !fou ) {
                    return [oneC, twoC];
                } else if ( one && tre && !two && !fou ) {
                    return [oneC, treC];
                } else if ( one && fou && !two && !fou ) {
                    return [oneC, fouC];

                } else if ( two && tre && !one && !fou ) {
                    return [twoC, treC];
                } else if ( two && fou && !one && !tre) {
                    return [twoC, fouC];
                } else if ( tre && fou && !one && !two ) {
                    return [oneC, twoC];

                } else if ( one && two && tre && !fou ){
                    return [oneC, twoC, treC];
                } else if ( one && two && fou && !tre ){
                    return [oneC, twoC, fouC];
                } else if ( one && tre && fou && !two ){
                    return [oneC, treC, fouC];

                } else if ( one && two && tre && fou ) {
                    return [oneC, twoC, treC, fouC];
                }
            };
            var colls = coll();
            if( one || two || tre || fou){
                Dialogs.showModalDialog(COMMAND_ID, 'title', alerted + '<br>' + colls);
            }
        }, 3000);
    }
    AppInit.appReady(detected);
});