/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2013 - 2021 Adobe Systems Incorporated. All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License
 * for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
 *
 */

/*jslint evil: true, regexp: true */
/*global describe, beforeEach, afterEach, it, expect, spyOn, jasmine */
/*unittests: HTML Instrumentation*/

define(function (require, exports, module) {


    // Load dependent modules
    var HTMLInstrumentation = require("LiveDevelopment/MultiBrowserImpl/language/HTMLInstrumentation"),
        HTMLSimpleDOM       = require("language/HTMLSimpleDOM"),
        RemoteFunctions     = require("text!LiveDevelopment/BrowserScripts/RemoteFunctions.js"),
        SpecRunnerUtils     = require("spec/SpecRunnerUtils"),
        WellFormedDoc       = require("text!spec/HTMLInstrumentation-test-files/wellformed.html"),
        NotWellFormedDoc    = require("text!spec/HTMLInstrumentation-test-files/omitEndTags.html"),
        InvalidHTMLDoc      = require("text!spec/HTMLInstrumentation-test-files/invalidHTML.html");

    RemoteFunctions = eval(`(()=>{${RemoteFunctions.trim()}\nreturn RemoteFunctions();})()`);

    var editor,
        instrumentedHTML,
        elementCount,
        elementIds = {};

    function createBlankDOM() {
        // This creates a DOM for a blank document that we can clone when we want to simulate
        // starting from an empty document (which, in the browser, includes implied html/head/body
        // tags). We have to also strip the tagIDs from this DOM since they won't appear in the
        // browser in this case.
        var dom = HTMLSimpleDOM.build("<html><head></head><body></body></html>", true);
        Object.keys(dom.nodeMap).forEach(function (key) {
            var node = dom.nodeMap[key];
            delete node.tagID;
        });
        dom.nodeMap = {};
        return dom;
    }

    function removeDescendentsFromNodeMap(nodeMap, node) {
        delete nodeMap[node.tagID];
        if (node.children) {
            node.children.forEach(function (child) {
                removeDescendentsFromNodeMap(nodeMap, child);
            });
        }
    }

    var entityParsingNode = window.document.createElement("div");

    /**
     * domFeatures is a prototype object that augments a SimpleDOM object to have more of the
     * features of a real DOM object. It specifically adds the features required for
     * the RemoteFunctions code that applies patches and is not a general DOM implementation.
     *
     * Standard DOM methods below are not documented, but the ones unique to this test harness
     * are.
     */
    var domFeatures = Object.create(new HTMLSimpleDOM.SimpleNode(), {
        firstChild: {
            get: function () {
                return this.children[0];
            }
        },
        lastChild: {
            get: function () {
                return this.children[this.children.length - 1];
            }
        },
        siblings: {
            get: function () {
                return this.parent.children;
            }
        },
        nextSibling: {
            get: function () {
                var siblings = this.siblings;
                var index = siblings.indexOf(this);
                return siblings[index + 1];
            }
        },
        previousSibling: {
            get: function () {
                var siblings = this.siblings;
                var index = siblings.indexOf(this);
                return siblings[index - 1];
            }
        },
        nodeType: {
            get: function () {
                if (this.children) {
                    return Node.ELEMENT_NODE;
                } else if (this.content) {
                    return Node.TEXT_NODE;
                }
            }
        },
        childNodes: {
            get: function () {
                var children = this.children;
                if (!children.item) {
                    children.item = function (index) {
                        return children[index];
                    };
                }
                return children;
            }
        },

        // At this time, innerHTML and textContent are used for entity parsing
        // only. If that changes, we'll have bigger issues to deal with.
        innerHTML: {
            set: function (text) {
                entityParsingNode.innerHTML = text;
            },
            get: function () {
                return entityParsingNode.innerHTML;
            }
        },
        textContent: {
            set: function (text) {
                entityParsingNode.textContent = text;
            },
            get: function () {
                return entityParsingNode.textContent;
            }
        }
    });

    $.extend(domFeatures, {
        insertBefore: function (newElement, referenceElement) {
            if (newElement.parent && newElement.parent !== this) {
                newElement.remove();
            }
            var index = this.children.indexOf(referenceElement);
            if (index === -1) {
                console.error("Unexpected attempt to reference a non-existent element:", referenceElement);
                console.log(this.children);
            }
            this.children.splice(index, 0, newElement);
            newElement.parent = this;
            newElement.addToNodeMap();
        },
        appendChild: function (newElement) {
            if (newElement.parent && newElement.parent !== this) {
                newElement.remove();
            }
            this.children.push(newElement);
            newElement.parent = this;
            newElement.addToNodeMap();
        },

        /**
         * The nodeMap keeps track of the Brackets-assigned tag ID to node object mapping.
         * This method adds this element to the nodeMap if it has a data-brackets-id
         * attribute set (something that the client-side applyEdits code will do).
         */
        addToNodeMap: function () {
            if (this.attributes && this.attributes["data-brackets-id"]) {
                var nodeMap = this.getNodeMap();
                if (nodeMap) {
                    nodeMap[this.attributes["data-brackets-id"]] = this;
                } else {
                    console.error("Unable to get nodeMap from", this);
                }
            }
        },
        remove: function () {
            if (this.tagID) {
                var nodeMap = this.getNodeMap();
                if (nodeMap) {
                    removeDescendentsFromNodeMap(nodeMap, this);
                }
            }
            var siblings = this.siblings;
            var index = siblings.indexOf(this);
            if (index > -1) {
                siblings.splice(index, 1);
                this.parent = null;
            } else {
                console.error("Unexpected attempt to remove (not in siblings)", this);
            }
        },

        /**
         * Search node by node up the tree until a nodeMap is found. Returns undefined
         * if no nodeMap is found.
         */
        getNodeMap: function () {
            var elem = this,
                nodeMap;
            while (elem) {
                nodeMap = elem.nodeMap;
                if (nodeMap) {
                    break;
                }
                elem = elem.parent;
            }
            return nodeMap;
        },
        setAttribute: function (key, value) {
            if (key === "data-brackets-id") {
                this.tagID = value;
                var nodeMap = this.getNodeMap();
                if (nodeMap) {
                    nodeMap[key] = this;
                } else {
                    console.error("no nodemap found for ", this);
                }

            }
            this.attributes[key] = value;
        },
        removeAttribute: function (key) {
            delete this.attributes[key];
        },

        returnFailure: function (other) {
            console.log("TEST FAILURE AT TAG ID ", this.tagID, this, other);
            console.log("Patched: ", HTMLSimpleDOM._dumpDOM(this.parent || this));
            console.log("DOM generated from revised text: ", HTMLSimpleDOM._dumpDOM(other.parent || other));
            return false;
        },

        /**
         * Compares two SimpleDOMs with the expectation that they are exactly the same.
         */
        compare: function (other) {
            if (this.children) {
                if (this.tag !== other.tag) {
                    expect("Tag " + this.tag + " for tagID " + this.tagID).toEqual(other.tag);
                    return this.returnFailure(other);
                }

                if (this.tagID !== other.tagID) {
                    expect("tagID " + this.tagID).toEqual(other.tagID);
                    return this.returnFailure(other);
                }

                delete this.attributes["data-brackets-id"];
                expect(this.attributes).toEqual(other.attributes);

                // Skip implied tags in this (fake browser) DOM. (The editor's DOM
                // should never have implied tags.)
                var myChildren = [];
                this.children.forEach(function (child) {
                    var isImplied = (child.tag === "html" || child.tag === "head" || child.tag === "body") && child.tagID === undefined;
                    if (!isImplied) {
                        myChildren.push(child);
                    }
                });

                if (myChildren.length !== other.children.length) {
                    expect("tagID " + this.tagID + " has " + myChildren.length + " unimplied children").toEqual(other.children.length);
                    return this.returnFailure(other);
                }
                var i;
                for (i = 0; i < myChildren.length; i++) {
                    if (!myChildren[i].compare(other.children[i])) {
                        return false;
                    }
                }
            } else {
                if (this.content !== other.content) {
                    expect(this.content).toEqual(other.content);
                    return this.returnFailure(other);
                }
            }
            return true;
        }
    });

    /**
     * Creates a deep clone of a SimpleDOM tree, adding the domFeatures as it goes
     * along.
     *
     * @param {Object} root root node of the SimpleDOM to clone
     * @return {Object} cloned SimpleDOM with domFeatures applied
     */
    function cloneDOM(root) {
        var nodeMap = {};

        // If there's no DOM to clone, then we must be starting from an empty document,
        // so start with a document that already has implied <html>/<head>/<body>, since
        // that's what the browser does.
        if (!root) {
            root = createBlankDOM();
        }

        function doClone(parent, node) {
            var newNode = Object.create(domFeatures);
            newNode.parent = parent;
            if (node.tagID) {
                nodeMap[node.tagID] = newNode;
                newNode.tagID = node.tagID;
            }
            newNode.content = node.content;
            if (node.children) {
                newNode.tag = node.tag;
                newNode.attributes = $.extend({}, node.attributes);
                newNode.children = node.children.map(function (child) {
                    return doClone(newNode, child);
                });
            } else {
                newNode.content = node.content;
            }
            return newNode;
        }

        var newRoot = doClone(null, root);
        newRoot.nodeMap = nodeMap;
        return newRoot;
    }

    /**
     * The RemoteFunctions code that applies edits to the DOM expects only a few things to
     * be present on the document object. This FakeDocument bridges the gap between a
     * SimpleDOM and real DOM for the purposes of applying edits.
     *
     * @param {Object} dom The DOM we're wrapping with this document.
     */
    var FakeDocument = function (dom) {
        var self = this;
        this.dom = dom;
        this.nodeMap = dom.nodeMap;

        // Walk the DOM looking for html/head/body tags. We can't use the nodeMap for this
        // because it might be nulled out in the cases where we're simulating the browser
        // creating implicit html/head/body tags.
        function walk(node) {
            if (node.tag === "html") {
                self.documentElement = node;
            } else if (node.tag === "head" || node.tag === "body") {
                self[node.tag] = node;
            }

            if (node.children) {
                node.children.forEach(walk);
            }
        }

        walk(dom);
    };

    // The DOM edit code only performs this kind of query
    var bracketsIdQuery = /\[data-brackets-id='(\d+)'\]/;

    FakeDocument.prototype = {
        createTextNode: function (content) {
            var text = Object.create(domFeatures);
            text.content = content;
            return text;
        },
        createElement: function (tag) {
            var el = Object.create(domFeatures);
            el.tag = tag;
            el.attributes = {};
            el.children = [];
            el.nodeMap = this.nodeMap;
            return el;
        },
        querySelectorAll: function (query) {
            var match = bracketsIdQuery.exec(query);
            expect(match).toBeTruthy();
            if (!match) {
                return [];
            }
            var id = match[1];

            function walk(node) {
                if (String(node.tagID) === id) {
                    return node;
                }
                if (node.children) {
                    var i, result;
                    for (i = 0; i < node.children.length; i++) {
                        result = walk(node.children[i]);
                        if (result) {
                            return result;
                        }
                    }
                }
            }

            var element = walk(this.dom);

            if (element) {
                return [element];
            }
        }
    };

    describe("HTML Instrumentation", function () {

        function getIdToTagMap(instrumentedHTML, map) {
            var count = 0;

            var elementIdRegEx = /<(\w+?)\s+(?:[^<]*?\s)*?data-brackets-id='(\S+?)'/gi,
                match,
                tagID,
                tagName;

            do {
                match = elementIdRegEx.exec(instrumentedHTML);
                if (match) {
                    tagID = match[2];
                    tagName = match[1];

                    // Verify that the newly found ID is unique.
                    expect(map[tagID]).toBeUndefined();

                    map[tagID] = tagName.toLowerCase();
                    count++;
                }
            } while (match);

            return count;
        }

        function checkTagIdAtPos(pos, expectedTag) {
            var tagID = HTMLInstrumentation._getTagIDAtDocumentPos(editor, pos);
            if (!expectedTag) {
                expect(tagID).toBe(-1);
            } else {
                expect(elementIds[tagID]).toBe(expectedTag);
            }
        }

        function verifyMarksCreated() {
            var cm    = editor._codeMirror,
                marks = cm.getAllMarks();

            expect(marks.length).toBeGreaterThan(0);
        }

        describe("HTML Instrumentation in wellformed HTML", function () {

            beforeEach(function () {
                editor = SpecRunnerUtils.createMockEditor(WellFormedDoc, "html").editor;
                expect(editor).toBeTruthy();

                spyOn(editor.document, "getText").and.callThrough();
                instrumentedHTML = HTMLInstrumentation.generateInstrumentedHTML(editor);
                elementCount = getIdToTagMap(instrumentedHTML, elementIds);

                if (elementCount) {
                    HTMLInstrumentation._markText(editor);
                    verifyMarksCreated();
                }
            });

            afterEach(function () {
                SpecRunnerUtils.destroyMockEditor(editor.document);
                editor = null;
                instrumentedHTML = "";
                elementCount = 0;
                elementIds = {};
            });

            it("should instrument all start tags except some empty tags", function () {
                expect(elementCount).toEqual(15);
            });

            it("should have created cache and never call document.getText() again", function () {
                // scanDocument call here is to test the cache.
                // HTMLInstrumentation.generateInstrumentedHTML call in "beforeEach"
                // in turn calls scanDocument. Each function calls document.getText once
                // and hence we've already had 2 calls from "beforeEach", but the following
                // call should not call it again.
                HTMLInstrumentation.scanDocument(editor.document);
                expect(editor.document.getText.calls.count()).toBe(2);
            });

            it("should have recreated cache when document timestamp is different", function () {
                // update document timestamp with current time.
                editor.document.diskTimestamp = new Date();

                // This is an intentional repeat call to recreate the cache.
                HTMLInstrumentation.scanDocument(editor.document);

                // 2 calls from generateInstrumentedHTML call and one call
                // from above scanDocument call. so total is 3.
                expect(editor.document.getText.calls.count()).toBe(3);
            });

            it("should get 'img' tag for cursor positions inside img tag.", function () {
                checkTagIdAtPos({ line: 37, ch: 4 }, "img");     // before <img
                checkTagIdAtPos({ line: 37, ch: 95 }, "img");    // after />
                checkTagIdAtPos({ line: 37, ch: 65 }, "img");    // inside src attribute value
            });

            it("should get the parent 'a' tag for cursor positions between 'img' and its parent 'a' tag.", function () {
                checkTagIdAtPos({ line: 37, ch: 1 }, "a");    // before "   <img"
                checkTagIdAtPos({ line: 38, ch: 0 }, "a");    // before </a>
            });

            it("No tag at cursor positions outside of the 'html' tag", function () {
                checkTagIdAtPos({ line: 0, ch: 4 }, "");    // inside 'doctype' tag
                checkTagIdAtPos({ line: 41, ch: 0 }, "");  // after </html>
            });

            it("Should get parent tag (body) for all cursor positions inside an html comment", function () {
                checkTagIdAtPos({ line: 15, ch: 1 }, "body");  // cursor between < and ! in the comment start
                checkTagIdAtPos({ line: 16, ch: 15 }, "body");
                checkTagIdAtPos({ line: 17, ch: 3 }, "body");  // cursor after -->
            });

            it("should get 'meta/link' tag for cursor positions in meta/link tags, not 'head' tag", function () {
                checkTagIdAtPos({ line: 5, ch: 64 }, "meta");
                checkTagIdAtPos({ line: 8, ch: 12 }, "link");
            });

            it("Should get 'title' tag at cursor positions (either in the content or begin/end tag)", function () {
                checkTagIdAtPos({ line: 6, ch: 11 }, "title"); // inside the begin tag
                checkTagIdAtPos({ line: 6, ch: 30 }, "title"); // in the content
                checkTagIdAtPos({ line: 6, ch: 50 }, "title"); // inside the end tag
            });

            it("Should get 'h2' tag at cursor positions (either in the content or begin or end tag)", function () {
                checkTagIdAtPos({ line: 13, ch: 1 }, "h2"); // inside the begin tag
                checkTagIdAtPos({ line: 13, ch: 20 }, "h2"); // in the content
                checkTagIdAtPos({ line: 13, ch: 27 }, "h2"); // inside the end tag
            });
        });

        describe("HTML Instrumentation in valid but not wellformed HTML", function () {

            beforeEach(function () {
                editor = SpecRunnerUtils.createMockEditor(NotWellFormedDoc, "html").editor;
                expect(editor).toBeTruthy();

                instrumentedHTML = HTMLInstrumentation.generateInstrumentedHTML(editor);
                elementCount = getIdToTagMap(instrumentedHTML, elementIds);

                if (elementCount) {
                    HTMLInstrumentation._markText(editor);
                    verifyMarksCreated();
                }
            });

            afterEach(function () {
                SpecRunnerUtils.destroyMockEditor(editor.document);
                editor = null;
                instrumentedHTML = "";
                elementCount = 0;
                elementIds = {};
            });

            it("should instrument all start tags except some empty tags", function () {
                expect(elementCount).toEqual(43);
            });

            it("should get 'p' tag for cursor positions before the succeding start tag of an unclosed 'p' tag", function () {
                checkTagIdAtPos({ line: 8, ch: 36 }, "p");   // at the end of the line that has p start tag
                checkTagIdAtPos({ line: 8, ch: 2 }, "p");    // at the beginning of the <p>
                checkTagIdAtPos({ line: 8, ch: 4 }, "p");    // inside <p> tag
                checkTagIdAtPos({ line: 8, ch: 5 }, "p");    // after <p> tag
                checkTagIdAtPos({ line: 9, ch: 0 }, "p");    // before <h1> tag, but considered to be the end of 'p' tag
            });

            it("should get 'h1' tag for cursor positions inside 'h1' that is following an unclosed 'p' tag.", function () {
                checkTagIdAtPos({ line: 9, ch: 20 }, "h1");  // inside text content of h1 tag
                checkTagIdAtPos({ line: 9, ch: 52 }, "h1");  // inside </h1>
            });

            it("should get 'wbr' tag for cursor positions inside <wbr>, not its parent 'h1' tag.", function () {
                checkTagIdAtPos({ line: 9, ch: 10 }, "wbr");  // inside <wbr> that is in h1 content
            });

            it("should get 'li' tag for cursor positions inside the content of an unclosed 'li' tag", function () {
                checkTagIdAtPos({ line: 12, ch: 12 }, "li");   // inside first list item
                checkTagIdAtPos({ line: 14, ch: 12 }, "li");   // inside third list item
                checkTagIdAtPos({ line: 15, ch: 0 }, "li");    // before </ul> tag that follows an unclosed 'li'
            });

            it("should get 'br' tag for cursor positions inside <br>, not its parent 'li' tag", function () {
                checkTagIdAtPos({ line: 13, ch: 22 }, "br");   // inside the <br> tag of the second list item
            });

            it("should get 'ul' tag for cursor positions within 'ul' but outside of any unclosed 'li'.", function () {
                checkTagIdAtPos({ line: 12, ch: 0 }, "ul");  // before first '<li>' tag
                checkTagIdAtPos({ line: 15, ch: 8 }, "ul");  // inside </ul>
            });

            it("should get 'table' tag for cursor positions that are not in any unclosed child tags", function () {
                checkTagIdAtPos({ line: 17, ch: 17 }, "table");   // inside an attribute of table tag
                checkTagIdAtPos({ line: 32, ch: 6 }, "table");    // inside </table> tag
            });

            it("should get 'tr' tag for cursor positions between child tags", function () {
                checkTagIdAtPos({ line: 21, ch: 0 }, "tr");    // after a 'th' but before the start tag of another one
            });

            it("should get 'input' tag for cursor positions inside one of the 'input' tags.", function () {
                checkTagIdAtPos({ line: 34, ch: 61 }, "input");   // at the end of first input tag
                checkTagIdAtPos({ line: 35, ch: 4 }, "input");    // at the first position of the 2nd input tag
            });
            it("should get 'option' tag for cursor positions in any unclosed 'option' tag.", function () {
                checkTagIdAtPos({ line: 40, ch: 0 }, "option");   // before second '<option>' tag
                checkTagIdAtPos({ line: 41, ch: 28 }, "option");  // after third option tag that is unclosed
            });

            it("should NOT get 'option' tag for cursor positions in the parent tags of an unclosed 'option'.", function () {
                checkTagIdAtPos({ line: 42, ch: 5 }, "select");   // inside '</select>' tag
                checkTagIdAtPos({ line: 43, ch: 5 }, "form");     // inside '</form>' tag
            });

            it("should get 'label' tag for cursor positions in the 'label' tag or its content.", function () {
                checkTagIdAtPos({ line: 37, ch: 17 }, "label");   // in the attribute of 'label' tag
                checkTagIdAtPos({ line: 37, ch: 49 }, "label");   // in the text content
                checkTagIdAtPos({ line: 37, ch: 55 }, "label");   // in the end 'label' tag
            });

            it("should get 'form' tag for cursor positions NOT in any form element.", function () {
                checkTagIdAtPos({ line: 35, ch: 0 }, "form");    // between two input tags
                checkTagIdAtPos({ line: 43, ch: 2 }, "form");    // before </form> tag
            });

            it("should get 'hr' tag for cursor positions in <hr> tag, not its parent <form> tag.", function () {
                checkTagIdAtPos({ line: 36, ch: 6 }, "hr");    // inside <hr>
            });

            it("should get 'script' tag for cursor positions anywhere inside the tag including CDATA.", function () {
                checkTagIdAtPos({ line: 46, ch: 6 }, "script");   // before '<' of CDATA
                checkTagIdAtPos({ line: 48, ch: 7 }, "script");   // right before '>' of CDATA
                checkTagIdAtPos({ line: 45, ch: 18 }, "script");  // inside an attribute value of 'script' tag
                checkTagIdAtPos({ line: 47, ch: 20 }, "script");  // before '<' of a literal string
                checkTagIdAtPos({ line: 49, ch: 9 }, "script");   // inside 'script' end tag
            });

            it("should get 'footer' tag that is explicitly using all uppercase tag names.", function () {
                checkTagIdAtPos({ line: 50, ch: 3 }, "footer");    // in <FOOTER>
                checkTagIdAtPos({ line: 50, ch: 20 }, "footer");   // in the text content
                checkTagIdAtPos({ line: 50, ch: 30 }, "footer");   // in </FOOTER>
            });

            it("should get 'body' for text after an h1 that closed a previous uncleosd paragraph", function () {
                checkTagIdAtPos({ line: 53, ch: 2 }, "body"); // in the text content after the h1
            });
        });

        describe("HTML Instrumentation in an HTML page with some invalid markups", function () {

            beforeEach(function () {
                editor = SpecRunnerUtils.createMockEditor(InvalidHTMLDoc, "html").editor;
                expect(editor).toBeTruthy();

                instrumentedHTML = HTMLInstrumentation.generateInstrumentedHTML(editor);
                elementCount = getIdToTagMap(instrumentedHTML, elementIds);

                if (elementCount) {
                    HTMLInstrumentation._markText(editor);
                    verifyMarksCreated();
                }
            });

            afterEach(function () {
                SpecRunnerUtils.destroyMockEditor(editor.document);
                editor = null;
                instrumentedHTML = "";
                elementCount = 0;
                elementIds = {};
            });

            it("should instrument all start tags except some empty tags", function () {
                expect(elementCount).toEqual(39);
            });

            it("should get 'script' tag for cursor positions anywhere inside the tag including CDATA.", function () {
                checkTagIdAtPos({ line: 6, ch: 11 }, "script");   // before '<' of CDATA
                checkTagIdAtPos({ line: 8, ch: 12 }, "script");   // right before '>' of CDATA
                checkTagIdAtPos({ line: 5, ch: 33 }, "script");   // inside an attribute value of 'script' tag
                checkTagIdAtPos({ line: 7, ch: 25 }, "script");   // after '<' of a literal string
                checkTagIdAtPos({ line: 9, ch: 9 }, "script");    // inside 'script' end tag
            });

            it("should get 'style' tag for cursor positions anywhere inside the tag including CDATA.", function () {
                checkTagIdAtPos({ line: 11, ch: 11 }, "style");   // before '<' of CDATA
                checkTagIdAtPos({ line: 13, ch: 12 }, "style");   // right before '>' of CDATA
                checkTagIdAtPos({ line: 10, ch: 26 }, "style");   // before '>' of the 'style' tag
                checkTagIdAtPos({ line: 12, ch: 33 }, "style");   // inside a property value
                checkTagIdAtPos({ line: 14, ch: 9 }, "style");    // inside 'style' end tag
            });

            it("should get 'i' tag for cursor position before </b>.", function () {
                checkTagIdAtPos({ line: 18, ch: 20 }, "i");   // after <i> and before </b>
                checkTagIdAtPos({ line: 18, ch: 28 }, "i");   // immediately before </b>
            });

            it("should get 'p' tag after </b> because the </b> closed the overlapping <i>.", function () {
                checkTagIdAtPos({ line: 18, ch: 34 }, "p");   // between </b> and </i>
            });

            it("should get 'body' tag in a paragraph that has missing <p> tag, but has </p>", function () {
                checkTagIdAtPos({ line: 19, ch: 15 }, "body");   // before </p>
                checkTagIdAtPos({ line: 19, ch: 38 }, "body");   // inside </p>
            });

            it("should get 'hr' tag for cursor positions in any forms of <hr> tag", function () {
                checkTagIdAtPos({ line: 48, ch: 7 }, "hr");    // inside <hr>
                checkTagIdAtPos({ line: 50, ch: 9 }, "hr");    // inside <hr />
            });

            it("should get 'h2' tag for cursor positions between <wbr> and its invalide end tag.", function () {
                checkTagIdAtPos({ line: 20, ch: 35 }, "h2");   // in the text between <wbr> and </wbr>
            });

            it("should get 'wbr' tag for cursor positions inside <wbr>, not its parent <h2> tag.", function () {
                checkTagIdAtPos({ line: 20, ch: 30 }, "wbr");   // inside <wbr>
            });

            it("should get 'h2' tag for cursor positions inside invalid </wbr> tag.", function () {
                checkTagIdAtPos({ line: 20, ch: 40 }, "h2");   // inside </wbr>
            });

            it("should get 'name' tag for cursor positions before <name> and </name>.", function () {
                checkTagIdAtPos({ line: 21, ch: 8 }, "name");    // inside <name>
                checkTagIdAtPos({ line: 21, ch: 12 }, "name");   // inside content of 'mame' tag
                checkTagIdAtPos({ line: 21, ch: 22 }, "name");   // inside </name>
            });

            it("should get 'th' tag for cursor positions in any 'th' and their text contents.", function () {
                checkTagIdAtPos({ line: 24, ch: 16 }, "th");    // inside first th content
                checkTagIdAtPos({ line: 25, ch: 21 }, "th");    // inside second </th>
                checkTagIdAtPos({ line: 26, ch: 17 }, "th");    // at the end of third th content
                checkTagIdAtPos({ line: 27, ch: 0 }, "th");     // before the next <tr>
            });

            it("should get 'input' tag for cursor positions in any input tag.", function () {
                checkTagIdAtPos({ line: 39, ch: 57 }, "input");   // inside value attribute that has <
                checkTagIdAtPos({ line: 39, ch: 64 }, "input");   // between / and > of input tag
                checkTagIdAtPos({ line: 40, ch: 61 }, "input");   // inside value attribute that has >
                checkTagIdAtPos({ line: 40, ch: 63 }, "input");   // right before the invalid </input>
            });

            it("should get 'form' tag for cursor positions in any invalid end tag inside the form.", function () {
                checkTagIdAtPos({ line: 40, ch: 65 }, "form");    // inside </input>
            });

            it("should get 'p' tag for cursor positions inside an unclosed paragraph nested in a link.", function () {
                checkTagIdAtPos({ line: 49, ch: 71 }, "p");    // before </a> but after <p> tag
            });

            it("should get 'a' tag for cursor positions not in the unclosed 'p' child tag.", function () {
                checkTagIdAtPos({ line: 49, ch: 32 }, "a");    // inside </a>
                checkTagIdAtPos({ line: 49, ch: 72 }, "a");    // inside </a>
            });
        });

        // Log useful information when debugging a test.
        function debuggingDump(result, previousDOM) {
            console.log("Old DOM", HTMLSimpleDOM._dumpDOM(previousDOM));
            console.log("New DOM", HTMLSimpleDOM._dumpDOM(result.dom));
            console.log("Edits", JSON.stringify(result.edits, null, 2));
        }
        // Workaround for JSHint to not complain about the unused function
        void(debuggingDump);

        describe("HTML Instrumentation in dirty files", function () {
            var changeList, offsets;

            function setupEditor(docText, useOffsets) {
                if (useOffsets) {
                    var result = SpecRunnerUtils.parseOffsetsFromText(docText);
                    docText = result.text;
                    offsets = result.offsets;
                }
                editor = SpecRunnerUtils.createMockEditor(docText, "html").editor;
                expect(editor).toBeTruthy();

                editor.on("change.instrtest", function (event, editor, change) {
                    changeList = change;
                });

                instrumentedHTML = HTMLInstrumentation.generateInstrumentedHTML(editor);
                elementCount = getIdToTagMap(instrumentedHTML, elementIds);
            }

            function checkMarkSanity() {
                // Ensure that we don't have multiple marks for the same tagID.
                var marks = editor._codeMirror.getAllMarks(),
                    foundMarks = {};
                marks.forEach(function (mark) {
                    if (mark.hasOwnProperty("tagID")) {
                        if (foundMarks[mark.tagID]) {
                            expect("mark with ID " + mark.tagID).toBe("unique");
                        }
                        foundMarks[mark.tagID] = true;
                    }
                });
            }

            afterEach(function () {
                SpecRunnerUtils.destroyMockEditor(editor.document);
                editor = null;
                instrumentedHTML = "";
                elementCount = 0;
                elementIds = {};
                changeList = null;
                offsets = null;
            });

            function doEditTest(origText, editFn, expectationFn, incremental, noRefresh) {
                // We need to fully reset the editor/mark state between the full and incremental tests
                // because if new DOM nodes are added by the edit, those marks will be present after the
                // full test, messing up the incremental test.
                if (!noRefresh) {
                    editor.document.refreshText(origText);
                }

                var previousDOM = HTMLSimpleDOM.build(editor.document.getText()),
                    result;

                var clonedDOM = cloneDOM(previousDOM);

                HTMLInstrumentation._markTextFromDOM(editor, previousDOM);
                editFn(editor, previousDOM);

                // Note that even if we pass a change list, `_updateDOM` will still choose to do a
                // full reparse and diff if the change includes a structural character.
                result = HTMLInstrumentation._updateDOM(previousDOM, editor, (incremental ? changeList : null));

                checkMarkSanity();

                var doc = new FakeDocument(clonedDOM);
                var editHandler = new RemoteFunctions.DOMEditHandler(doc);
                editHandler.apply(result.edits);
                clonedDOM.compare(result.dom);
                expectationFn(result, previousDOM, incremental);
            }

            function doFullAndIncrementalEditTest(editFn, expectationFn) {
                var origText = editor.document.getText();
                doEditTest(origText, editFn, expectationFn, false);
                changeList = null;

                if (HTMLInstrumentation._allowIncremental) {
                    doEditTest(origText, editFn, expectationFn, true);
                }
            }

            // Common functionality between typeAndExpect() and deleteAndExpect().
            function doOperationAndExpect(editor, curDOM, pos, edits, wasInvalid, numIterations, operationFn, posUpdateFn) {
                var i, result, clonedDOM;
                for (i = 0; i < numIterations; i++) {
                    clonedDOM = cloneDOM(curDOM);

                    operationFn(i, pos);
                    result = HTMLInstrumentation._updateDOM(curDOM, editor, wasInvalid ? null : changeList);
                    if (!edits) {
                        expect(Array.isArray(result.errors)).toBe(true);
                        wasInvalid = true;
                    } else {
                        var expectedEdit = edits[i];
                        if (typeof expectedEdit === "function") {
                            // This lets the caller access the most recent updated DOM values when
                            // specifying the expected edit.
                            expectedEdit = expectedEdit(result.dom);
                        }
                        expect(result.edits).toEqual(expectedEdit);
                        wasInvalid = false;

                        var doc = new FakeDocument(clonedDOM);
                        var editHandler = new RemoteFunctions.DOMEditHandler(doc);
                        editHandler.apply(result.edits);
                        clonedDOM.compare(result.dom);

                        checkMarkSanity();

                        curDOM = result.dom;
                    }
                    posUpdateFn(pos);
                }

                return {finalDOM: curDOM, finalPos: pos, finalInvalid: wasInvalid};
            }

            /*
             * Simulates typing the given string character by character. If edits is specified, then
             * each successive character is expected to generate the edits at that position in the array.
             * If edits is unspecified, then the document is expected to be in an invalid state at each
             * step, so no edits should be generated.
             * Returns the final DOM after all the edits, or the original DOM if the document is in an invalid state.
             */
            function typeAndExpect(editor, curDOM, pos, str, edits, wasInvalid) {
                return doOperationAndExpect(editor, curDOM, pos, edits, wasInvalid,
                    str.length,
                    function (i, pos) {
                        editor.document.replaceRange(str.charAt(i), pos);
                    },
                    function (pos) {
                        pos.ch++;
                    });
            }

            /*
             * Simulates deleting the specified number of characters one at a time. If edits is specified, then
             * each successive character is expected to generate the edits at that position in the array.
             * If edits is unspecified, then the document is expected to be in an invalid state at each
             * step, so no edits should be generated.
             * Returns the final DOM after all the edits, or the original DOM if the document is in an invalid state.
             */
            function deleteAndExpect(editor, curDOM, pos, numToDelete, edits, wasInvalid) {
                return doOperationAndExpect(editor, curDOM, pos, edits, wasInvalid,
                    numToDelete,
                    function (i, pos) {
                        editor.document.replaceRange("", {line: pos.line, ch: pos.ch - 1}, pos);
                    },
                    function (pos) {
                        pos.ch--;
                    });
            }

            it("should mark editor text based on the simple DOM", function () {
                setupEditor(WellFormedDoc);
                var dom = HTMLSimpleDOM.build(editor.document.getText());
                HTMLInstrumentation._markTextFromDOM(editor, dom);
                expect(editor._codeMirror.getAllMarks().length).toEqual(15);
            });



            it("should handle two incremental text edits in a row", function () {
                // Short-circuit this test if we're running without incremental updates
                if (!HTMLInstrumentation._allowIncremental) {
                    return;
                }

                setupEditor(WellFormedDoc);
                var previousDOM = HTMLSimpleDOM.build(editor.document.getText()),
                    tagID = previousDOM.children[3].children[1].tagID,
                    result,
                    origParent = previousDOM.children[3];
                HTMLInstrumentation._markTextFromDOM(editor, previousDOM);

                editor.document.replaceRange("AWESOMER", {line: 12, ch: 12}, {line: 12, ch: 19});

                result = HTMLInstrumentation._updateDOM(previousDOM, editor, changeList);

                // TODO: how to test that only an appropriate subtree was reparsed/diffed?
                expect(result.edits.length).toEqual(1);
                expect(result.dom.children[3].children[1].tag).toEqual("h1");
                expect(result.dom.children[3].children[1].tagID).toEqual(tagID);
                expect(result.edits[0]).toEqual({
                    type: "textReplace",
                    parentID: tagID,
                    content: "GETTING AWESOMER WITH BRACKETS"
                });
                // this should have been an incremental edit since it was just typing
                expect(result._wasIncremental).toBe(true);
                // make sure the parent of the change is still the same node as in the old tree
                expect(result.dom.nodeMap[tagID].parent).toBe(origParent);

                editor.document.replaceRange("MOAR AWESOME", {line: 12, ch: 12}, {line: 12, ch: 20});

                result = HTMLInstrumentation._updateDOM(previousDOM, editor, changeList);

                // TODO: how to test that only an appropriate subtree was reparsed/diffed?
                expect(result.edits.length).toEqual(1);
                expect(result.dom.children[3].children[1].tag).toEqual("h1");
                expect(result.dom.children[3].children[1].tagID).toEqual(tagID);
                expect(result.edits[0]).toEqual({
                    type: "textReplace",
                    parentID: tagID,
                    content: "GETTING MOAR AWESOME WITH BRACKETS"
                });

                // this should have been an incremental edit since it was just typing
                expect(result._wasIncremental).toBe(true);
                // make sure the parent of the change is still the same node as in the old tree
                expect(result.dom.nodeMap[tagID].parent).toBe(origParent);
            });

            it("should handle deleting of an empty tag character-by-character", function () {
                setupEditor("<p><img>{{0}}</p>", true);
                var previousDOM = HTMLSimpleDOM.build(editor.document.getText()),
                    imgTagID = previousDOM.children[0].tagID,
                    result;

                HTMLInstrumentation._markTextFromDOM(editor, previousDOM);

                // First four deletions should keep it in an invalid state.
                result = deleteAndExpect(editor, previousDOM, offsets[0], 4);
                expect(result.finalInvalid).toBe(true);

                // We're exiting an invalid state, so we pass "true" for the final argument
                // here, which forces a full reparse (the same as getUnappliedEdits() does).
                deleteAndExpect(editor, result.finalDOM, result.finalPos, 1, [
                    [{type: "elementDelete", tagID: imgTagID}]
                ], true);
            });

            it("should handle deleting of a non-empty tag character-by-character", function () {
                setupEditor("<div><b>deleteme</b>{{0}}</div>", true);
                var previousDOM = HTMLSimpleDOM.build(editor.document.getText()),
                    pTagID = previousDOM.children[0].tagID,
                    result;

                HTMLInstrumentation._markTextFromDOM(editor, previousDOM);

                // All the deletions until we get to the "<" should leave the document in an invalid state.
                result = deleteAndExpect(editor, previousDOM, offsets[0], 14);
                expect(result.finalInvalid).toBe(true);

                // We're exiting an invalid state, so we pass "true" for the final argument
                // here, which forces a full reparse (the same as getUnappliedEdits() does).
                deleteAndExpect(editor, result.finalDOM, result.finalPos, 1, [
                    [{type: "elementDelete", tagID: pTagID}]
                ], true);
            });

            it("should handle wrapping a tag around some text character by character", function () {
                setupEditor("<p>{{0}}some text{{1}}</p>", true);
                var previousDOM = HTMLSimpleDOM.build(editor.document.getText()),
                    result;

                HTMLInstrumentation._markTextFromDOM(editor, previousDOM);

                // Type the opening tag--should be invalid all the way
                result = typeAndExpect(editor, previousDOM, offsets[0], "<span>");
                expect(result.finalInvalid).toBe(true);

                // Type the end tag--should be invalid until we type the closing character
                // The offset is 6 characters later than the original position of offset 1 since we
                // inserted the opening tag.
                result = typeAndExpect(editor, result.finalDOM, {line: offsets[1].line, ch: offsets[1].ch + 6}, "</span", null, true);
                expect(result.finalInvalid).toBe(true);

                // Finally become valid by closing the end tag.
                typeAndExpect(editor, result.finalDOM, result.finalPos, ">", [
                    function (dom) { // check for tagIDs relative to the DOM after typing
                        return [
                            {
                                type: "textDelete",
                                parentID: dom.tagID
                            },
                            {
                                type: "elementInsert",
                                tag: "span",
                                attributes: {},
                                tagID: dom.children[0].tagID,
                                parentID: dom.tagID,
                                lastChild: true
                            },
                            {
                                type: "textInsert",
                                parentID: dom.children[0].tagID,
                                content: "some text",
                                lastChild: true
                            }
                        ];
                    }
                ], true); // because we were invalid before this operation
            });

            it("should handle adding a <head> tag into a document", function () {
                setupEditor("<html>{{0}}</html>", true);
                var previousDOM = HTMLSimpleDOM.build(editor.document.getText()),
                    result;

                HTMLInstrumentation._markTextFromDOM(editor, previousDOM);

                // Type the opening tag--should be invalid all the way
                result = typeAndExpect(editor, previousDOM, offsets[0], "<head></head");
                expect(result.finalInvalid).toBe(true);

                // Finally become valid by closing the end tag. Note that this elementInsert
                // should be treated specially by RemoteFunctions not to actually insert the
                // element, but just copy its ID to the autocreated HTML element.
                result = typeAndExpect(editor, result.finalDOM, result.finalPos, ">", [
                    function (dom) { // check for tagIDs relative to the DOM after typing
                        return [
                            {
                                type: "elementInsert",
                                tag: "head",
                                attributes: {},
                                tagID: dom.children[0].tagID,
                                parentID: dom.tagID,
                                lastChild: true
                            }
                        ];
                    }
                ], true); // because we were invalid before this operation
            });

            it("should handle reordering of children in one step as a delete/insert", function () {
                setupEditor("<p>{{0}}<img><br>{{1}}</p>", true);
                var oldImgID, oldBrID;
                doFullAndIncrementalEditTest(
                    function (editor, previousDOM) {
                        oldImgID = previousDOM.children[0].tagID;
                        oldBrID = previousDOM.children[1].tagID;
                        editor.document.replaceRange("<br><img>", offsets[0], offsets[1]);
                    },
                    function (result, previousDOM, incremental) {
                        var newBrElement = result.dom.children[0],
                            newImgElement = result.dom.children[1];

                        expect(result.edits.length).toEqual(4);
                        expect(result.edits[0]).toEqual({
                            type: "elementDelete",
                            tagID: oldImgID
                        });
                        expect(result.edits[1]).toEqual({
                            type: "elementDelete",
                            tagID: oldBrID
                        });
                        expect(result.edits[2]).toEqual({
                            type: "elementInsert",
                            tag: "br",
                            attributes: {},
                            tagID: newBrElement.tagID,
                            parentID: result.dom.tagID,
                            lastChild: true
                        });
                        expect(result.edits[3]).toEqual({
                            type: "elementInsert",
                            tag: "img",
                            attributes: {},
                            tagID: newImgElement.tagID,
                            parentID: result.dom.tagID,
                            lastChild: true
                        });

                        if (incremental) {
                            // this should not have been an incremental edit since it changed the DOM structure
                            expect(result._wasIncremental).toBe(false);
                        }
                    }
                );
            });

            it("should handle multiple inserted tags and text", function () {
                setupEditor("<h1><strong>Emphasized</strong> Hello </h1>");
                var h1,
                    strong;
                doFullAndIncrementalEditTest(
                    function (editor, previousDOM) {
                        h1 = previousDOM;
                        strong = previousDOM.children[0];
                        editor.document.replaceRange("<em>Foo</em> bar <strong>Baz!</strong>", {line: 0, ch: 4}, {line: 0, ch: 31});
                    },
                    function (result, previousDOM, incremental) {
                        var em = result.dom.children[0],
                            strong2 = result.dom.children[2];

                        expect(result.edits.length).toBe(8);
                        expect(result.edits[0]).toEqual({
                            type: "elementDelete",
                            tagID: strong.tagID
                        });
                        expect(result.edits[1]).toEqual({
                            type: "textDelete",
                            parentID: h1.tagID
                        });
                        expect(result.edits[2]).toEqual({
                            type: "elementInsert",
                            tag: "em",
                            tagID: em.tagID,
                            parentID: h1.tagID,
                            attributes: {},
                            lastChild: true
                        });
                        expect(result.edits[3]).toEqual({
                            type: "textInsert",
                            parentID: h1.tagID,
                            lastChild: true,
                            content: " bar "
                        });
                        expect(result.edits[4]).toEqual({
                            type: "elementInsert",
                            tag: "strong",
                            tagID: strong2.tagID,
                            parentID: h1.tagID,
                            lastChild: true,
                            attributes: {}
                        });
                        expect(result.edits[5]).toEqual({
                            type: "textInsert",
                            parentID: h1.tagID,
                            lastChild: true,
                            content: " Hello "
                        });

                        expect(result.edits[6]).toEqual({
                            type: "textInsert",
                            parentID: strong2.tagID,
                            content: "Baz!",
                            lastChild: true
                        });
                        expect(result.edits[7]).toEqual({
                            type: "textInsert",
                            parentID: em.tagID,
                            content: "Foo",
                            lastChild: true
                        });
                    }
                );
            });
        });
    });
});
