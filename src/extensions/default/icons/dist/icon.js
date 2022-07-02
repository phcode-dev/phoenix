define(["require", "exports"], function (require, exports) {
    function getColorSet(name) {
        return 0 /* ColorLight */;
    }
    exports.getColorSet = getColorSet;
    function getIconSet(name) {
        switch (name.toLowerCase()) {
            case 'dev':
            case 'devicons':
                return 2 /* IconDev */;
            default:
                return 1 /* IconIon */;
        }
    }
    exports.getIconSet = getIconSet;
});
