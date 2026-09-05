/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2026 - present core.ai . All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
 */

/* eslint-env node */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
    CODEMIRROR6_COMPATIBILITY_RUNTIME_RELATIVE_PATHS,
    assertNoCodeMirror5,
    findCodeMirror5ArtifactViolations,
    findCodeMirror5DependencyViolations,
    findCodeMirror5DirectImportViolations,
    findCodeMirror5HTMLAssetViolations,
    findCodeMirror5ImplementationViolations,
    findCodeMirror5LicenseNoticeViolations,
    findCodeMirrorVimLicenseNoticeViolations,
    findCodeMirror6ReleaseLicenseViolations,
    findCodeMirror6RuntimeArtifactViolations,
    findInstalledCodeMirror5Violations,
    listProjectPackageMetadataFiles
} = require("../validate-codemirror5");

const CODEMIRROR5_DERIVED_LICENSE_NOTICE = [
    "# CodeMirror 5-derived compatibility code",
    "CodeMirrorCompat.js",
    "CodeMirrorLegacyAddons.js",
    "CodeMirrorLegacyExtendedAddons.js",
    "CodeMirrorLegacyModeMeta.js",
    "CodeMirrorLegacyModesCompat.js",
    "CodeMirrorLegacyRSTSlimCompat.js",
    "CodeMirrorSublimeCompat.js",
    "CodeMirrorTwigCompat.js",
    "brackets_codemirror6_legacy_themes.less",
    "foldcode.js",
    "foldgutter.js",
    "languageFold.js",
    "Copyright (C) 2017 by Marijn Haverbeke <marijn@haverbeke.berlin> and others",
    "",
    "Permission is hereby granted, free of charge, to any person obtaining a copy",
    'of this software and associated documentation files (the "Software"), to deal',
    "in the Software without restriction, including without limitation the rights",
    "to use, copy, modify, merge, publish, distribute, sublicense, and/or sell",
    "copies of the Software, and to permit persons to whom the Software is",
    "furnished to do so, subject to the following conditions:",
    "",
    "The above copyright notice and this permission notice shall be included in",
    "all copies or substantial portions of the Software.",
    "",
    'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,',
    "EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF",
    "MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.",
    "IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,",
    "DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR",
    "OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE",
    "USE OR OTHER DEALINGS IN THE SOFTWARE."
].join("\n\n");
const CODEMIRROR_VIM_DERIVED_LICENSE_NOTICE = [
    "# @replit CodeMirror Vim-derived compatibility code",
    "CodeMirrorVimCompat.js",
    "Copyright (C) 2018-2021 by Marijn Haverbeke <marijnh@gmail.com> and others",
    "",
    "Permission is hereby granted, free of charge, to any person obtaining a copy",
    'of this software and associated documentation files (the "Software"), to deal',
    "in the Software without restriction, including without limitation the rights",
    "to use, copy, modify, merge, publish, distribute, sublicense, and/or sell",
    "copies of the Software, and to permit persons to whom the Software is",
    "furnished to do so, subject to the following conditions:",
    "",
    "The above copyright notice and this permission notice shall be included in",
    "all copies or substantial portions of the Software.",
    "",
    'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR',
    "IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,",
    "FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE",
    "AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER",
    "LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,",
    "OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN",
    "THE SOFTWARE."
].join("\n");
const CODEMIRROR6_LICENSE_NOTICE = [
    "# CodeMirror 6 bundle licenses",
    "",
    "## @codemirror/state 6.7.1",
    "",
    "MIT License"
].join("\n");
const CODEMIRROR6_LICENSE_BANNER =
    "/*! DONT_STRIP_MINIFY: Third-party license notices: " +
    "thirdparty/licences/codemirror6.markdown. */";
const CODEMIRROR5_DERIVED_SOURCE_PATHS = [
    "editor/CodeMirrorCompat.js",
    "editor/CodeMirrorLegacyAddons.js",
    "editor/CodeMirrorLegacyExtendedAddons.js",
    "editor/CodeMirrorLegacyModeMeta.js",
    "editor/CodeMirrorLegacyModesCompat.js",
    "editor/CodeMirrorLegacyRSTSlimCompat.js",
    "editor/CodeMirrorSublimeCompat.js",
    "editor/CodeMirrorTwigCompat.js",
    "styles/brackets_codemirror6_legacy_themes.less",
    "extensions/default/CodeFolding/foldhelpers/foldcode.js",
    "extensions/default/CodeFolding/foldhelpers/foldgutter.js",
    "extensions/default/CodeFolding/foldhelpers/languageFold.js"
];
const CODEMIRROR5_DERIVED_SOURCE_BANNER =
    "/*! DONT_STRIP_MINIFY: CodeMirror 5-derived compatibility implementation. " +
    "See thirdparty/licences/codemirror5-derived.markdown. */";

function createRepository() {
    const repositoryRoot = fs.mkdtempSync(
        path.join(os.tmpdir(), "phoenix-cm5-validation-")
    );
    fs.mkdirSync(path.join(repositoryRoot, "src"), { recursive: true });
    fs.writeFileSync(
        path.join(repositoryRoot, "package.json"),
        JSON.stringify({
            dependencies: {
                "@codemirror/view": "^6.43.9"
            }
        })
    );
    writeFile(
        repositoryRoot,
        "src/thirdparty/licences/codemirror5-derived.markdown",
        CODEMIRROR5_DERIVED_LICENSE_NOTICE
    );
    writeFile(
        repositoryRoot,
        "src/thirdparty/licences/codemirror-vim-derived.markdown",
        CODEMIRROR_VIM_DERIVED_LICENSE_NOTICE
    );
    ["src", "dist", path.join("dist-test", "src")].forEach(codeRoot => {
        CODEMIRROR5_DERIVED_SOURCE_PATHS.forEach(sourcePath => {
            writeFile(
                repositoryRoot,
                path.join(codeRoot, sourcePath),
                CODEMIRROR5_DERIVED_SOURCE_BANNER
            );
        });
    });
    return repositoryRoot;
}

function writeFile(repositoryRoot, relativePath, content) {
    const absolutePath = path.join(repositoryRoot, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content);
}

function getCodeMirror6RuntimeArtifactContent(relativePath, minified) {
    const contents = {
        "brackets.js": [
            "define(function (require) {",
            'const CodeMirror = require("editor/CodeMirrorCompat");',
            "return CodeMirror;",
            "});"
        ],
        "editor/CodeMirror6Adapter.js": [
            "define(function (require) {",
            'const CM6 = require("thirdparty/CodeMirror6/codemirror6");',
            "return CM6;",
            "});"
        ],
        "editor/CodeMirrorCompat.js": [
            "define(function (require) {",
            'require("thirdparty/CodeMirror6/codemirror6");',
            'require("editor/CodeMirrorLegacyModeMeta");',
            'require("editor/CodeMirrorLegacyModesCompat");',
            "});"
        ],
        "editor/CodeMirrorLegacyExtendedAddons.js": [
            "define(function () {",
            'return "addon/mode/loadmode";',
            "});"
        ],
        "editor/CodeMirrorLegacyFileSystem.js": [
            "define(function (require) {",
            'require("editor/CodeMirrorLegacyModuleLoader");',
            'require("text");',
            'return "__phoenixCodeMirrorLegacyFileSystem";',
            "});"
        ],
        "editor/CodeMirrorLegacyModesCompat.js": [
            "define(function (require) {",
            'return require("editor/CodeMirrorLegacyRSTSlimCompat");',
            "});"
        ],
        "editor/CodeMirrorLegacyModuleLoader.js": [
            "define(function (require) {",
            'require("editor/CodeMirrorLegacyExtendedAddons");',
            'const modeMeta = "mode/meta";',
            'return modeMeta ? "extended-addon" : null;',
            "});"
        ],
        "editor/CodeMirrorLegacyText.js": [
            'define(["text-base"], function (BaseText) {',
            "return BaseText;",
            "});"
        ],
        "editor/CodeMirrorVimCompat.js": [
            "define(function (require) {",
            'return require("thirdparty/CodeMirror6/codemirror6");',
            "});"
        ],
        "editor/Editor.js": [
            "define(function (require) {",
            'return require("editor/CodeMirror6Adapter");',
            "});"
        ],
        "main.js": [
            "require.config({",
            "paths: {",
            'text: "editor/CodeMirrorLegacyText"',
            "},",
            "map: {",
            '"*": {',
            '"thirdparty/CodeMirror/lib/codemirror": "editor/CodeMirrorCompat",',
            '"thirdparty/CodeMirror2/lib/codemirror": "editor/CodeMirrorCompat"',
            "}",
            "}",
            "});"
        ],
        "styles/brackets_codemirror6.less": [
            ".CodeMirror.phoenix-codemirror-6 {",
            "position: relative;",
            "}"
        ],
        "styles/brackets_codemirror6_legacy_themes.less": [
            ".CodeMirror.phoenix-codemirror-6.cm-s-test {",
            "color: inherit;",
            "}"
        ],
        "styles/brackets_shared.less": [
            '@import url("brackets_codemirror6.less");',
            '@import (inline) "brackets_codemirror6_legacy_themes.less";'
        ],
        "thirdparty/CodeMirror6/codemirror6.js": [
            CODEMIRROR6_LICENSE_BANNER,
            "define('thirdparty/CodeMirror6/codemirror6', ['exports'], " +
                "function (exports) {});"
        ],
        "utils/ExtensionLoader.js": [
            "define(function (require) {",
            "const CodeMirrorLegacyFileSystem =",
            'require("editor/CodeMirrorLegacyFileSystem");',
            "CodeMirrorLegacyFileSystem.install();",
            "});"
        ],
        "utils/Global.js": [
            "define(function (require) {",
            "const CodeMirrorLegacyModuleLoader =",
            'require("editor/CodeMirrorLegacyModuleLoader");',
            "return CodeMirrorLegacyModuleLoader.resolveLegacyModule(",
            '"thirdparty/CodeMirror"',
            ");",
            "});"
        ]
    };
    const lines = contents[relativePath] || [
        "define(function () {",
        "return {};",
        "});"
    ];
    const licenseBanner = CODEMIRROR5_DERIVED_SOURCE_PATHS.includes(relativePath) ?
        `${CODEMIRROR5_DERIVED_SOURCE_BANNER}\n` :
        "";
    return licenseBanner + lines.join(minified ? "" : "\n");
}

function writeCodeMirror6RuntimeArtifacts(
    repositoryRoot,
    releaseRoot,
    minified
) {
    CODEMIRROR6_COMPATIBILITY_RUNTIME_RELATIVE_PATHS.forEach(
        function (relativePath) {
            writeFile(
                repositoryRoot,
                path.join(releaseRoot, relativePath),
                getCodeMirror6RuntimeArtifactContent(relativePath, minified)
            );
        }
    );
}

function writeReleaseLicenseFiles(repositoryRoot) {
    writeFile(
        repositoryRoot,
        "src/thirdparty/licences/codemirror6.markdown",
        CODEMIRROR6_LICENSE_NOTICE
    );
    ["dist", "dist-test/src"].forEach(function (releaseRoot) {
        writeFile(
            repositoryRoot,
            `${releaseRoot}/thirdparty/licences/codemirror5-derived.markdown`,
            CODEMIRROR5_DERIVED_LICENSE_NOTICE
        );
        writeFile(
            repositoryRoot,
            `${releaseRoot}/thirdparty/licences/codemirror-vim-derived.markdown`,
            CODEMIRROR_VIM_DERIVED_LICENSE_NOTICE
        );
        writeFile(
            repositoryRoot,
            `${releaseRoot}/thirdparty/licences/codemirror6.markdown`,
            CODEMIRROR6_LICENSE_NOTICE
        );
    });
}

function createDirectorySymlink(targetPath, linkPath) {
    fs.mkdirSync(path.dirname(linkPath), { recursive: true });
    fs.symlinkSync(path.resolve(targetPath), linkPath, "junction");
}

function validationOptions(repositoryRoot) {
    return {
        repositoryRoot,
        packageMetadataFiles: ["package.json"],
        artifactScanPaths: ["src", "dist", "dist-test"],
        codeScanPaths: ["src", "dist", "dist-test"],
        installedPackageScanPaths: ["node_modules", "src", "dist", "dist-test"]
    };
}

test("allows CM6 packages, compatibility identifiers, CSS classes, and attribution", (t) => {
    const repositoryRoot = createRepository();
    t.after(() => fs.rmSync(repositoryRoot, { recursive: true, force: true }));

    writeFile(
        repositoryRoot,
        "src/editor.js",
        [
            'const CodeMirror = require("editor/CodeMirrorCompat");',
            'const legacyId = "thirdparty/CodeMirror/lib/codemirror";',
            'element.classList.add("CodeMirror-selected");',
            "// Adapted from CodeMirror 5 under the MIT license.",
            "module.exports = { CodeMirror, legacyId };"
        ].join("\n")
    );
    writeFile(
        repositoryRoot,
        "deno.lock",
        '{"specifier":"npm:codemirror@5.65.16"}'
    );
    writeFile(
        repositoryRoot,
        "src/thirdparty/licences/codemirror-compat.markdown",
        "Retained attribution for CM5-derived compatibility algorithms."
    );

    assert.doesNotThrow(() => assertNoCodeMirror5(
        validationOptions(repositoryRoot)
    ));
});

test("unions tracked and filesystem manifests including Phoenix Pro and dist", (t) => {
    const repositoryRoot = createRepository();
    t.after(() => fs.rmSync(repositoryRoot, { recursive: true, force: true }));

    writeFile(
        repositoryRoot,
        "src/extensionsIntegrated/phoenix-pro/package.json",
        JSON.stringify({
            dependencies: {
                codemirror: "^5.65.16"
            }
        })
    );
    writeFile(
        repositoryRoot,
        "dist/package-lock.json",
        JSON.stringify({
            lockfileVersion: 3,
            packages: {
                "node_modules/codemirror": {
                    version: "5.65.16"
                }
            }
        })
    );

    const options = {
        repositoryRoot,
        trackedPackageMetadataFiles: ["package.json"],
        packageMetadataScanPaths: ["src", "dist"]
    };
    const metadataFiles = listProjectPackageMetadataFiles(options);
    assert(metadataFiles.includes("package.json"));
    assert(metadataFiles.includes(
        "src/extensionsIntegrated/phoenix-pro/package.json"
    ));
    assert(metadataFiles.includes("dist/package-lock.json"));

    const findings = findCodeMirror5DependencyViolations(options);
    assert(findings.some(finding => finding.includes("phoenix-pro/package.json")));
    assert(findings.some(finding => finding.includes("dist/package-lock.json")));
});

test("scans a symlinked Phoenix Pro checkout for every CM5 violation class", (t) => {
    const repositoryRoot = createRepository();
    const phoenixProRoot = fs.mkdtempSync(
        path.join(os.tmpdir(), "phoenix-pro-cm5-validation-")
    );
    t.after(() => fs.rmSync(repositoryRoot, { recursive: true, force: true }));
    t.after(() => fs.rmSync(phoenixProRoot, { recursive: true, force: true }));

    const packageName = "code" + "mirror";
    writeFile(
        phoenixProRoot,
        "package.json",
        JSON.stringify({
            dependencies: {
                [packageName]: "^5.65.16"
            }
        })
    );
    writeFile(
        phoenixProRoot,
        "src/legacy-import.js",
        `const legacyEditor = require("${packageName}");`
    );
    writeFile(
        phoenixProRoot,
        "thirdparty/CodeMirror/lib/codemirror.js",
        "legacy editor"
    );
    writeFile(
        phoenixProRoot,
        "node_modules/codemirror/package.json",
        JSON.stringify({
            name: packageName,
            version: "5.65.16"
        })
    );
    createDirectorySymlink(
        phoenixProRoot,
        path.join(
            repositoryRoot,
            "src/extensionsIntegrated/phoenix-pro"
        )
    );

    const options = {
        repositoryRoot,
        trackedPackageMetadataFiles: ["package.json"],
        packageMetadataScanPaths: ["src"],
        artifactScanPaths: ["src"],
        codeScanPaths: ["src"],
        installedPackageScanPaths: ["src"]
    };

    assert(listProjectPackageMetadataFiles(options).includes(
        "src/extensionsIntegrated/phoenix-pro/package.json"
    ));
    assert(findCodeMirror5DependencyViolations(options).some(finding => {
        return finding.includes(
            "src/extensionsIntegrated/phoenix-pro/package.json"
        );
    }));
    assert(findCodeMirror5DirectImportViolations(options).some(finding => {
        return finding.includes(
            "src/extensionsIntegrated/phoenix-pro/src/legacy-import.js"
        );
    }));
    assert(findCodeMirror5ArtifactViolations(options).some(finding => {
        return finding.includes(
            "src/extensionsIntegrated/phoenix-pro/thirdparty/CodeMirror"
        );
    }));
    assert(findInstalledCodeMirror5Violations(options).some(finding => {
        return finding.includes(
            "src/extensionsIntegrated/phoenix-pro/node_modules/codemirror"
        );
    }));
});

test("guards symlink cycles and scans duplicate directory targets once", (t) => {
    const repositoryRoot = createRepository();
    const phoenixProRoot = fs.mkdtempSync(
        path.join(os.tmpdir(), "phoenix-pro-cm5-cycle-validation-")
    );
    t.after(() => fs.rmSync(repositoryRoot, { recursive: true, force: true }));
    t.after(() => fs.rmSync(phoenixProRoot, { recursive: true, force: true }));

    const packageName = "code" + "mirror";
    writeFile(
        phoenixProRoot,
        "package.json",
        JSON.stringify({
            dependencies: {
                [packageName]: "^5.65.16"
            }
        })
    );
    writeFile(
        phoenixProRoot,
        "src/legacy-import.js",
        `const legacyEditor = require("${packageName}");`
    );
    writeFile(
        phoenixProRoot,
        "node_modules/codemirror/package.json",
        JSON.stringify({
            name: packageName,
            version: "5.65.16"
        })
    );
    createDirectorySymlink(
        phoenixProRoot,
        path.join(phoenixProRoot, "src/cycle")
    );
    const extensionsRoot = path.join(repositoryRoot, "src/extensionsIntegrated");
    createDirectorySymlink(
        phoenixProRoot,
        path.join(extensionsRoot, "phoenix-pro")
    );
    createDirectorySymlink(
        phoenixProRoot,
        path.join(extensionsRoot, "phoenix-pro-duplicate")
    );

    const options = {
        repositoryRoot,
        trackedPackageMetadataFiles: [],
        packageMetadataScanPaths: ["src"],
        codeScanPaths: ["src"],
        installedPackageScanPaths: ["src"]
    };

    const metadataFiles = listProjectPackageMetadataFiles(options);
    assert.equal(metadataFiles.length, 1);
    assert.equal(
        findCodeMirror5DependencyViolations(options).length,
        1
    );
    assert.equal(
        findCodeMirror5DirectImportViolations(options).length,
        1
    );
    assert.equal(
        findInstalledCodeMirror5Violations(options).length,
        1
    );
});

test("rejects CodeMirror package declarations and lock entries", (t) => {
    const repositoryRoot = createRepository();
    t.after(() => fs.rmSync(repositoryRoot, { recursive: true, force: true }));

    writeFile(
        repositoryRoot,
        "package.json",
        JSON.stringify({
            dependencies: {
                codemirror: "^5.65.16"
            }
        })
    );
    writeFile(
        repositoryRoot,
        "package-lock.json",
        JSON.stringify({
            lockfileVersion: 3,
            packages: {
                "": {
                    dependencies: {
                        codemirror: "^5.65.16"
                    }
                },
                "node_modules/codemirror": {
                    version: "5.65.16"
                }
            }
        })
    );

    const findings = findCodeMirror5DependencyViolations({
        repositoryRoot,
        packageMetadataFiles: ["package.json", "package-lock.json"]
    });
    assert(findings.some(finding => finding.includes("dependencies.codemirror")));
    assert(findings.some(finding => finding.includes("node_modules/codemirror")));
});

test("rejects legacy vendor trees, licenses, and installed packages", (t) => {
    const repositoryRoot = createRepository();
    t.after(() => fs.rmSync(repositoryRoot, { recursive: true, force: true }));

    writeFile(
        repositoryRoot,
        "src/thirdparty/CodeMirror/lib/codemirror.js",
        "legacy editor"
    );
    writeFile(
        repositoryRoot,
        "dist/thirdparty/CODEMIRROR2/theme/legacy.css",
        "legacy theme"
    );
    writeFile(
        repositoryRoot,
        "dist-test/src/thirdparty/licences/codemirror.markdown",
        "legacy license"
    );
    writeFile(
        repositoryRoot,
        "node_modules/codemirror/package.json",
        '{"version":"5.65.16"}'
    );
    writeFile(
        repositoryRoot,
        "dist/node_modules/codemirror/package.json",
        '{"version":"5.65.16"}'
    );
    writeFile(
        repositoryRoot,
        "node_modules/cm5-alias/package.json",
        '{"name":"codemirror","version":"5.65.16"}'
    );
    writeFile(
        repositoryRoot,
        "node_modules/cm6-alias/package.json",
        '{"name":"codemirror","version":"6.0.1"}'
    );

    const options = validationOptions(repositoryRoot);
    assert(findCodeMirror5ArtifactViolations(options).some(finding => {
        return finding.includes("src/thirdparty/CodeMirror");
    }));
    assert(findCodeMirror5ArtifactViolations(options).some(finding => {
        return finding.includes("dist/thirdparty/CODEMIRROR2");
    }));
    assert(findCodeMirror5ArtifactViolations(options).some(finding => {
        return finding.endsWith("codemirror.markdown");
    }));
    const installedFindings = findInstalledCodeMirror5Violations(options);
    assert(installedFindings.some(finding => {
        return finding.includes("node_modules/codemirror");
    }));
    assert(installedFindings.some(finding => {
        return finding.includes("node_modules/cm5-alias");
    }));
    assert(installedFindings.some(finding => {
        return finding.includes("dist/node_modules/codemirror");
    }));
    assert(!installedFindings.some(finding => {
        return finding.includes("node_modules/cm6-alias");
    }));
});

test("requires the complete CM5-derived notice in source and release roots", (t) => {
    const repositoryRoot = createRepository();
    t.after(() => fs.rmSync(repositoryRoot, { recursive: true, force: true }));

    assert.deepEqual(
        findCodeMirror5LicenseNoticeViolations({repositoryRoot}),
        []
    );

    assert.deepEqual(
        findCodeMirror5LicenseNoticeViolations({
            repositoryRoot,
            requireReleaseLicenseCopies: true
        }),
        [
            "dist-test/src/thirdparty/licences/" +
                "codemirror5-derived.markdown (missing)",
            "dist/thirdparty/licences/codemirror5-derived.markdown (missing)"
        ]
    );
    writeFile(
        repositoryRoot,
        "dist/thirdparty/licences/codemirror5-derived.markdown",
        CODEMIRROR5_DERIVED_LICENSE_NOTICE
    );

    assert.deepEqual(
        findCodeMirror5LicenseNoticeViolations({
            repositoryRoot,
            requireReleaseLicenseCopies: true
        }),
        [
            "dist-test/src/thirdparty/licences/" +
                "codemirror5-derived.markdown (missing)"
        ]
    );
    writeFile(
        repositoryRoot,
        "dist-test/src/thirdparty/licences/codemirror5-derived.markdown",
        CODEMIRROR5_DERIVED_LICENSE_NOTICE.replace(
            "to use, copy, modify, merge, publish, distribute, sublicense, and/or sell",
            ""
        )
    );
    assert.deepEqual(
        findCodeMirror5LicenseNoticeViolations({
            repositoryRoot,
            requireReleaseLicenseCopies: true
        }),
        [
            "dist-test/src/thirdparty/licences/" +
                "codemirror5-derived.markdown " +
                "(incomplete CodeMirror 5 MIT notice)"
        ]
    );

    writeFile(
        repositoryRoot,
        "src/editor/CodeMirrorCompat.js",
        "/* compatibility implementation without a preserved notice */"
    );
    assert.deepEqual(
        findCodeMirror5LicenseNoticeViolations({repositoryRoot}),
        [
            "src/editor/CodeMirrorCompat.js " +
                "(missing preserved CodeMirror 5-derived notice)"
        ]
    );
});

test("requires the exact @replit Vim-derived notice in source and release roots", (t) => {
    const repositoryRoot = createRepository();
    t.after(() => fs.rmSync(repositoryRoot, { recursive: true, force: true }));

    assert.deepEqual(
        findCodeMirrorVimLicenseNoticeViolations({repositoryRoot}),
        []
    );

    assert.deepEqual(
        findCodeMirrorVimLicenseNoticeViolations({
            repositoryRoot,
            requireReleaseLicenseCopies: true
        }),
        [
            "dist-test/src/thirdparty/licences/" +
                "codemirror-vim-derived.markdown (missing)",
            "dist/thirdparty/licences/codemirror-vim-derived.markdown (missing)"
        ]
    );

    writeFile(
        repositoryRoot,
        "dist/thirdparty/licences/codemirror-vim-derived.markdown",
        CODEMIRROR_VIM_DERIVED_LICENSE_NOTICE
    );
    writeFile(
        repositoryRoot,
        "dist-test/src/thirdparty/licences/codemirror-vim-derived.markdown",
        CODEMIRROR_VIM_DERIVED_LICENSE_NOTICE.replace(
            "Copyright (C) 2018-2021 by Marijn Haverbeke <marijnh@gmail.com> and others",
            "Copyright (C) 2018 by somebody else"
        )
    );

    assert.deepEqual(
        findCodeMirrorVimLicenseNoticeViolations({
            repositoryRoot,
            requireReleaseLicenseCopies: true
        }),
        [
            "dist-test/src/thirdparty/licences/" +
                "codemirror-vim-derived.markdown " +
                "(incomplete @replit CodeMirror Vim MIT notice)"
        ]
    );
});

test("keeps source validation independent of stale release trees", (t) => {
    const repositoryRoot = createRepository();
    t.after(() => fs.rmSync(repositoryRoot, { recursive: true, force: true }));
    const codeMirrorVersionAssignment =
        `${"Code" + "Mirror"}.version = "${["5", "65", "16"].join(".")}";`;

    writeFile(
        repositoryRoot,
        "dist/thirdparty/codemirror/lib/codemirror.js",
        codeMirrorVersionAssignment
    );
    writeFile(
        repositoryRoot,
        "dist-test/src/thirdparty/CodeMirror2/lib/codemirror.js",
        codeMirrorVersionAssignment
    );

    assert.doesNotThrow(() => assertNoCodeMirror5({repositoryRoot}));
    assert.throws(
        () => assertNoCodeMirror5({
            repositoryRoot,
            requireReleaseLicenseCopies: true
        }),
        /CodeMirror 5 validation failed/
    );
});

test("requires CM6 bundles and their generated license in release roots", (t) => {
    const repositoryRoot = createRepository();
    t.after(() => fs.rmSync(repositoryRoot, { recursive: true, force: true }));
    const options = {
        repositoryRoot,
        requireReleaseLicenseCopies: true
    };

    writeFile(
        repositoryRoot,
        "src/thirdparty/licences/codemirror6.markdown",
        CODEMIRROR6_LICENSE_NOTICE
    );

    let findings = findCodeMirror6ReleaseLicenseViolations(options);
    assert.equal(findings.length, 4);
    assert(findings.includes(
        "dist/thirdparty/CodeMirror6/codemirror6.js (missing)"
    ));
    assert(findings.includes(
        "dist/thirdparty/licences/codemirror6.markdown (missing)"
    ));
    assert(findings.includes(
        "dist-test/src/thirdparty/CodeMirror6/codemirror6.js (missing)"
    ));
    assert(findings.includes(
        "dist-test/src/thirdparty/licences/codemirror6.markdown (missing)"
    ));

    [
        "dist",
        "dist-test/src"
    ].forEach(function (releaseRoot) {
        writeFile(
            repositoryRoot,
            `${releaseRoot}/thirdparty/CodeMirror6/codemirror6.js`,
            `${CODEMIRROR6_LICENSE_BANNER}\ndefine(function () {});`
        );
        writeFile(
            repositoryRoot,
            `${releaseRoot}/thirdparty/licences/codemirror6.markdown`,
            CODEMIRROR6_LICENSE_NOTICE
        );
    });
    assert.deepEqual(
        findCodeMirror6ReleaseLicenseViolations(options),
        []
    );

    writeFile(
        repositoryRoot,
        "dist-test/src/thirdparty/CodeMirror6/codemirror6.js",
        "define(function () {});"
    );
    writeFile(
        repositoryRoot,
        "dist/thirdparty/licences/codemirror6.markdown",
        `${CODEMIRROR6_LICENSE_NOTICE}\ntruncated`
    );
    findings = findCodeMirror6ReleaseLicenseViolations(options);
    assert(findings.includes(
        "dist-test/src/thirdparty/CodeMirror6/codemirror6.js " +
            "(missing CodeMirror 6 license notice reference)"
    ));
    assert(findings.includes(
        "dist/thirdparty/licences/codemirror6.markdown " +
            "(does not match generated source notice)"
    ));
});

test("requires every CM6 compatibility runtime artifact in release roots", (t) => {
    const repositoryRoot = createRepository();
    t.after(() => fs.rmSync(repositoryRoot, { recursive: true, force: true }));
    const options = {
        repositoryRoot,
        requireReleaseLicenseCopies: true
    };

    writeCodeMirror6RuntimeArtifacts(repositoryRoot, "dist", false);
    writeCodeMirror6RuntimeArtifacts(repositoryRoot, "dist-test/src", true);
    assert.deepEqual(
        findCodeMirror6RuntimeArtifactViolations(options),
        []
    );

    fs.rmSync(path.join(
        repositoryRoot,
        "dist/editor/CodeMirrorLegacyFileSystem.js"
    ));
    writeFile(
        repositoryRoot,
        "dist-test/src/editor/CodeMirrorLegacyText.js",
        " \n"
    );

    assert.deepEqual(
        findCodeMirror6RuntimeArtifactViolations(options),
        [
            "dist-test/src/editor/CodeMirrorLegacyText.js " +
                "(empty CM6 compatibility runtime artifact)",
            "dist/editor/CodeMirrorLegacyFileSystem.js " +
                "(missing required CM6 compatibility runtime artifact)"
        ]
    );
});

test("validates minified and unminified CM6 compatibility wiring", (t) => {
    const repositoryRoot = createRepository();
    t.after(() => fs.rmSync(repositoryRoot, { recursive: true, force: true }));
    const options = {
        repositoryRoot,
        requireReleaseLicenseCopies: true
    };

    writeCodeMirror6RuntimeArtifacts(repositoryRoot, "dist", false);
    writeCodeMirror6RuntimeArtifacts(repositoryRoot, "dist-test/src", true);
    writeReleaseLicenseFiles(repositoryRoot);
    assert.doesNotThrow(() => assertNoCodeMirror5(options));

    writeFile(
        repositoryRoot,
        "dist/utils/ExtensionLoader.js",
        'define(function(require){return require("editor/' +
            'CodeMirrorLegacyFileSystem")})'
    );
    writeFile(
        repositoryRoot,
        "dist/editor/CodeMirrorLegacyModuleLoader.js",
        'define(function(require){require("editor/' +
            'CodeMirrorLegacyExtendedAddons");return "extended-addon"})'
    );
    writeFile(
        repositoryRoot,
        "dist-test/src/editor/CodeMirrorLegacyModuleLoader.js",
        'define(function(){return "mode/meta extended-addon"})'
    );

    const findings = findCodeMirror6RuntimeArtifactViolations(options);
    assert(findings.includes(
        "dist/utils/ExtensionLoader.js " +
            "(missing legacy filesystem compatibility installation)"
    ));
    assert(findings.includes(
        "dist/editor/CodeMirrorLegacyModuleLoader.js " +
            "(missing legacy mode metadata module mapping)"
    ));
    assert(findings.includes(
        "dist-test/src/editor/CodeMirrorLegacyModuleLoader.js " +
            "(missing extended addon compatibility dependency)"
    ));
    assert.throws(
        () => assertNoCodeMirror5(options),
        /CM6 release runtime:/
    );
});

test("rejects direct script and stylesheet package imports", (t) => {
    const repositoryRoot = createRepository();
    t.after(() => fs.rmSync(repositoryRoot, { recursive: true, force: true }));

    const packageName = "code" + "mirror";
    writeFile(
        repositoryRoot,
        "src/imports.js",
        [
            `const first = require("${packageName}");`,
            `const second = require.resolve("${packageName}/lib/codemirror");`,
            `import("${packageName}");`,
            `import Editor from "${packageName}";`,
            `define(["${packageName}"], function (CodeMirror) {});`,
            `require(["text!${packageName}/lib/codemirror.css"], function () {});`
        ].join("\n")
    );
    writeFile(
        repositoryRoot,
        "src/imports.less",
        `@import "${packageName}/lib/codemirror.css";`
    );

    const findings = findCodeMirror5DirectImportViolations(
        validationOptions(repositoryRoot)
    );
    assert.equal(findings.length, 7);
    assert(findings.some(finding => finding.includes("CommonJS require")));
    assert(findings.some(finding => finding.includes("dynamic import")));
    assert(findings.some(finding => finding.includes("static import/export")));
    assert(findings.some(finding => finding.includes("AMD dependency")));
    assert(findings.some(finding => finding.includes("stylesheet import")));
    assert.throws(
        () => assertNoCodeMirror5(validationOptions(repositoryRoot)),
        /CodeMirror 5 validation failed/
    );
});

test("rejects legacy CodeMirror script and stylesheet loads in HTML", (t) => {
    const repositoryRoot = createRepository();
    t.after(() => fs.rmSync(repositoryRoot, { recursive: true, force: true }));

    writeFile(
        repositoryRoot,
        "src/index.html",
        [
            '<div class="CodeMirror CodeMirror-focused"></div>',
            '<script src="thirdparty/CodeMirror6/codemirror6.js"></script>',
            '<script>window.legacyId = "thirdparty/CodeMirror/lib/codemirror";</script>'
        ].join("\n")
    );
    writeFile(
        repositoryRoot,
        "src/legacy.htm",
        [
            '<script src="thirdparty/CodeMirror/lib/codemirror.js"></script>',
            '<link rel="stylesheet" href="../node_modules/codemirror/lib/codemirror.css">',
            '<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.js"></script>'
        ].join("\n")
    );

    const findings = findCodeMirror5HTMLAssetViolations(
        validationOptions(repositoryRoot)
    );
    assert.equal(findings.length, 3);
    assert(findings.every(finding => finding.includes("src/legacy.htm")));
});

test("rejects high-confidence CM5 implementation signatures only", (t) => {
    const repositoryRoot = createRepository();
    t.after(() => fs.rmSync(repositoryRoot, { recursive: true, force: true }));

    writeFile(
        repositoryRoot,
        "src/fold-compat.js",
        [
            "// CodeMirror, copyright (c) by Marijn Haverbeke and others",
            "// Adapted for the Phoenix CodeMirror 6 compatibility layer.",
            'const CodeMirror = require("editor/CodeMirrorCompat");',
            'CodeMirror.defineExtension("foldCode", function () {});'
        ].join("\n")
    );
    const codeMirrorName = "Code" + "Mirror";
    writeFile(
        repositoryRoot,
        "src/vendor/editor-core.js",
        `${codeMirrorName}.version = "5.65.16";`
    );
    const relativeCore = ["..", "..", "lib", "codemirror"].join("/");
    writeFile(
        repositoryRoot,
        "src/vendor/fold-addon.js",
        `define(["${relativeCore}"], function (${codeMirrorName}) {});`
    );
    writeFile(
        repositoryRoot,
        "src/vendor/codemirror.css",
        [
            ".CodeMirror-scroll {}",
            ".CodeMirror-sizer {}",
            ".CodeMirror-gutters {}",
            ".CodeMirror-cursor {}"
        ].join("\n")
    );
    writeFile(
        repositoryRoot,
        "src/thirdparty/licences/codemirror-compat.markdown",
        "CodeMirror 5 MIT attribution retained for adapted algorithms."
    );

    const options = validationOptions(repositoryRoot);
    const findings = findCodeMirror5ImplementationViolations(options);
    assert.equal(findings.length, 3);
    assert(findings.some(finding => {
        return finding.includes("CM5 runtime version assignment");
    }));
    assert(findings.some(finding => {
        return finding.includes("CM5 relative core dependency");
    }));
    assert(findings.some(finding => {
        return finding.includes("CM5 core stylesheet signature");
    }));
    assert.deepEqual(findCodeMirror5ArtifactViolations(options), []);
});
