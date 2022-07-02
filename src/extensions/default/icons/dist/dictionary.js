define(["require", "exports"], function (require, exports) {
    function findInDictionary(dictionary, fileName, secondMatch, compare) {
        fileName = fileName.toLowerCase();
        var match = dictionary.findFullFileName(fileName);
        if (match !== undefined) {
            return [match];
        }

        var matches = [];
        // Start with the longest extension so we match `.foo.bar` before `.bar`.
        var index = fileName.indexOf('.');
        while (index !== -1) {
            var extension = fileName.substring(index + 1);
            match = dictionary.findExtension(extension);
            if (!match) {
                index = fileName.indexOf('.', index + 1);
                continue;
            }
            matches = [match];
            if (index !== 0) {
                var prefix = fileName.substring(0, index);
                match = dictionary.findFileName(prefix, extension);
                if (match) {
                    matches.push(match);
                }
            }
            break;
        }
        if (secondMatch) {
            if (matches.length === 2) {
                return matches;
            }
        } else {
            if (matches.length === 1) {
                return matches;
            } else if (matches.length === 2) {
                return [matches[1]];
            }
        }
        if (matches.length === 0) {
            matches.push(dictionary.getEmptyItem(fileName));
            index = fileName.lastIndexOf('.');
        }
        var primaryIndex = index;
        index = fileName.indexOf('.');
        while (index !== -1 && index < primaryIndex) {
            var prefix = fileName.substring(index + 1, primaryIndex);
            match = dictionary.findExtensionPrefix(prefix)
                || dictionary.findExtension(prefix);
            if (match) {
                if (!compare(matches[0], match)) {
                    matches.push(match);
                }
                break;
            }
            index = fileName.indexOf('.', index + 1);
        }
        return matches;
    }

    exports.findInDictionary = findInDictionary;
});
