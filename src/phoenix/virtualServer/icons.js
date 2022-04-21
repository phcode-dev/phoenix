/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * modified by core.ai, based on work by David Humphrey <david.humphrey@senecacolleage.ca> (@humphd)
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License along
 * with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
 *
 */

// Base64 entries for all PNG icon files.  Built using:
// `npx datauri-cli filename`.  Initial, common portion of
// data URI and first few bytes of PNG data are stripped,
// see below when reconstructed.
if(!self.icons){
    self.icons = {};
    // eslint-disable-next-line max-len
    self.icons.back = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAWBAMAAAAyb6E1AAAAElBMVEX////M//+ZmZlmZmYzMzMAAACei5rnAAAAAnRSTlP/AOW3MEoAAAABYktHRACIBR1IAAAAYElEQVQIW0XP0QnAMAhFUVew4ACFLpARUl4XKHH/VdqXRPUjHC5+GNEc4dOQvICelY4KVEWviqo2qVz1Re3HQxq33UnXP02a7xENDcn4Sshb1lv37jh5pC3Me70+ZMWYD08uJsBsi+cYAAAAVnRFWHRjb21tZW50AFRoaXMgYXJ0IGlzIGluIHRoZSBwdWJsaWMgZG9tYWluLiBLZXZpbiBIdWdoZXMsIGtldmluaEBlaXQuY29tLCBTZXB0ZW1iZXIgMTk5NXb275wAAAAASUVORK5CYII=';
    // eslint-disable-next-line max-len
    self.icons.blank = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAWAQMAAAD6jy5FAAAABlBMVEX////M//9zUa6lAAAAAnRSTlP/AOW3MEoAAAABYktHRACIBR1IAAAAD0lEQVQIHWP8z/CRkQYYAFlpKreJcPlsAAAAVnRFWHRjb21tZW50AFRoaXMgYXJ0IGlzIGluIHRoZSBwdWJsaWMgZG9tYWluLiBLZXZpbiBIdWdoZXMsIGtldmluaEBlaXQuY29tLCBTZXB0ZW1iZXIgMTk5NXb275wAAAAASUVORK5CYII=';
    // eslint-disable-next-line max-len
    self.icons.folder = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAWBAMAAAAyb6E1AAAAElBMVEX/////zJnM//+ZZjMzMzMAAADCEvqoAAAAA3RSTlP//wDXyg1BAAAAAWJLR0QAiAUdSAAAAFJJREFUCFtjUIIDBsLMUCCAMFUFgSAIzAwEMUVDQ4OUGIJBTEMgDyhqDARAnnAQRAEQGLvCmcKuVBYVhgJXBlVjCDBxZVAKcYGAEAYl1VAIcAIAfgAgxXnPTZkAAABWdEVYdGNvbW1lbnQAVGhpcyBhcnQgaXMgaW4gdGhlIHB1YmxpYyBkb21haW4uIEtldmluIEh1Z2hlcywga2V2aW5oQGVpdC5jb20sIFNlcHRlbWJlciAxOTk1dvbvnAAAAABJRU5ErkJggg==';
    // eslint-disable-next-line max-len
    self.icons.image2 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAWBAMAAAAyb6E1AAAAJFBMVEX/////MzPM///MzMyZmZlmZmZmAAAzMzMAmcwAmTMAM2YAAADMt1kEAAAAA3RSTlP//wDXyg1BAAAAAWJLR0QAiAUdSAAAAIxJREFUCFtFzjsKwkAUheEDVxjEaggIae8KtPFVp3MBrsEuxGIis4FgFRCLu4VsYTbnnUeSv/o41YFLdcyMFpoxK9GtNJHW2spA58T9zns/M4RQiE1zT6zli8KR5IDIY00iLUWenlflLRJbEXl9Eo3Ir8+ktzyGTJxdPxM0LLwspEkra0zpmpye5FDiP+BZOkuqcu7kAAAAVnRFWHRjb21tZW50AFRoaXMgYXJ0IGlzIGluIHRoZSBwdWJsaWMgZG9tYWluLiBLZXZpbiBIdWdoZXMsIGtldmluaEBlaXQuY29tLCBTZXB0ZW1iZXIgMTk5NXb275wAAAAASUVORK5CYII=';
    // eslint-disable-next-line max-len
    self.icons.movie = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAWBAMAAAAyb6E1AAAAFVBMVEX////M///MzMyZmZlmZmYzMzMAAAC3QbbwAAAAAnRSTlP/AOW3MEoAAAABYktHRACIBR1IAAAAOUlEQVQIW2NIg4JEQYYkNTBLKRXEdAECNhAzLc3Z2NiYLQ0sCmYqoTKJUMAABFAF9LUCzhQNhQJBAGWZNOmfH9xVAAAAVnRFWHRjb21tZW50AFRoaXMgYXJ0IGlzIGluIHRoZSBwdWJsaWMgZG9tYWluLiBLZXZpbiBIdWdoZXMsIGtldmluaEBlaXQuY29tLCBTZXB0ZW1iZXIgMTk5NXb275wAAAAASUVORK5CYII=';
    // eslint-disable-next-line max-len
    self.icons.text = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAWBAMAAAAyb6E1AAAAD1BMVEX////M//+ZmZkzMzMAAABVsTOVAAAAAnRSTlP/AOW3MEoAAAABYktHRACIBR1IAAAAT0lEQVQIW5XIsQ3AIAwF0VNgAa+AGABkD0Dx958pRRy55qrTw93dfZsZC6C1WnZtq2Ubq0unR0Rql5TKM2YqjPmpdCjlVuFG//XxFYYpsxfEkhYAImC9XwAAAFZ0RVh0Y29tbWVudABUaGlzIGFydCBpcyBpbiB0aGUgcHVibGljIGRvbWFpbi4gS2V2aW4gSHVnaGVzLCBrZXZpbmhAZWl0LmNvbSwgU2VwdGVtYmVyIDE5OTV29u+cAAAAAElFTkSuQmCC';
    // eslint-disable-next-line max-len
    self.icons.unknown = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAWBAMAAAAyb6E1AAAAD1BMVEX////M//+ZmZkzMzMAAABVsTOVAAAAAnRSTlP/AOW3MEoAAAABYktHRACIBR1IAAAAYklEQVQIW23O0Q2AIBAD0AZcgA0IYQAJDGCw+8/k3SFoov16FEKKaikhBOyQeP8QxZjIE17pqJR6kK014cZuJ+MBMuXxg1vUewxmst+UMi5GLGLS8mn/+Xo7WdOIjAw60EZeVZkZLhf9K5EAAABWdEVYdGNvbW1lbnQAVGhpcyBhcnQgaXMgaW4gdGhlIHB1YmxpYyBkb21haW4uIEtldmluIEh1Z2hlcywga2V2aW5oQGVpdC5jb20sIFNlcHRlbWJlciAxOTk1dvbvnAAAAABJRU5ErkJggg==';
}
