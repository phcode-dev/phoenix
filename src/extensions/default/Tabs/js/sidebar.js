/*global define, brackets, $*/
define(function (require, exports, module) {
    'use strict';
    var AppInit            = brackets.getModule('utils/AppInit'),
        Resizer            = brackets.getModule('utils/Resizer'),
        SidebarView        = brackets.getModule('project/SidebarView'),
        ExtensionUtils     = brackets.getModule("utils/ExtensionUtils"),
        $sidebar           = $("#sidebar");
    function startOp() {
        Resizer.toggle($sidebar);
    }
    var tabContainer = $( '<div>', {
        'id':    'working-file-tabs-container',
        'class': 'working-file-tabs-container end-left'
    } );
    function addButton() {
        var $newdiv1 = $( "<div>", {
            'id': 'fullScreenSidebar',
            'class': 'btn-sidebar-bks btn-alt-quiet'
        } ).click( startOp );
        //$('.avril-tabs-work').insertBefore($newdiv1);
        $newdiv1.insertBefore($('.avril-tabs-work'));
    }
    function addHTML(){
        var $sideView = $('#fullScreenSidebar');
        if(SidebarView.isVisible()){
            $sideView.html('←').attr('title', 'Hide Sidebar').css('color', '#37b1ac');
        } else {
            $sideView.html('→').attr('title', 'Show Sidebar');
        }
        $sidebar.on("panelCollapsed", function(){
            $sideView.html('→').attr('title', 'Show Sidebar');
            if($sideView.css('color')){$sideView.removeAttr('style');}
        });
        $sidebar.on("panelExpanded",  function(){
            $sideView.html('←').attr('title', 'Hide Sidebar').css('color', '#37b1ac');
        });
    }
    var panelToggle = function(){
        ExtensionUtils.loadStyleSheet(module, "style/sidebar-toolbar.css");
        addButton();
        addHTML();
    };
    AppInit.appReady(function () {
        panelToggle();
    });
});