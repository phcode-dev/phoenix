define(function (require) {
    const Strings = require('strings');
    const HTMLUtils = require('language/HTMLUtils');

    const strategies = [];

    const TagSelectorStrategy = {
        isMatch: (tokenType) =>
            tokenType === HTMLUtils.TAG_NAME || tokenType === HTMLUtils.CLOSING_TAG,

        resolve: (tagInfo) => ({
            selectorName: tagInfo.tagName,
            reason: null
        })
    };

    const ClassSelectorStrategy = {
        isMatch: (tokenType, attrName) =>
            (tokenType === HTMLUtils.ATTR_NAME || tokenType === HTMLUtils.ATTR_VALUE) && attrName === "class",

        resolve: (tagInfo) => {
            var attributeValue = tagInfo.attr.value;
            if (!/\S/.test(attributeValue)) {
                return { selectorName: "", reason: Strings.ERROR_CSSQUICKEDIT_CLASSNOTFOUND };
            }

            var startIndex = attributeValue.substr(0, tagInfo.position.offset).lastIndexOf(" ");
            var endIndex = attributeValue.indexOf(" ", tagInfo.position.offset);
            let selectorName = "." +
                    attributeValue.substring(
                        startIndex === -1 ? 0 : startIndex + 1,
                        endIndex === -1 ? attributeValue.length : endIndex
                    );

            if (selectorName === ".") {
                return { selectorName: "", reason: Strings.ERROR_CSSQUICKEDIT_BETWEENCLASSES };
            }
            return { selectorName, reason: null };
        }
    };
    const IdSelectorStrategy = {
        isMatch: (tokenType, attrName) =>
            (tokenType === HTMLUtils.ATTR_NAME || tokenType === HTMLUtils.ATTR_VALUE) && attrName === "id",

        resolve: (tagInfo) => {
            var trimmedVal = tagInfo.attr.value.trim();
            if (trimmedVal) {
                return { selectorName: "#" + trimmedVal, reason: null};
            }
            return { selectorName: "", reason: Strings.ERROR_CSSQUICKEDIT_IDNOTFOUND };
        }
    };

    const ErrorSelectorStrategy = {
        isMatch: () =>  true,
        resolve: () => { return { selectorName: "", reason: Strings.ERROR_CSSQUICKEDIT_UNSUPPORTEDATTR }; }
    };

    strategies.push(TagSelectorStrategy);
    strategies.push(ClassSelectorStrategy);
    strategies.push(IdSelectorStrategy);
    strategies.push(ErrorSelectorStrategy);

    function getStrategy(tagInfo) {
        const strategy = strategies.find(s => s.isMatch(tagInfo.position.tokenType, tagInfo.attr.name));
        return strategy ? strategy : null;
    }

    return getStrategy;
});
