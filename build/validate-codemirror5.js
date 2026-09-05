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

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const PACKAGE_METADATA_FILE_NAMES = new Set([
    "package.json",
    "package-lock.json",
    "npm-shrinkwrap.json"
]);
const PACKAGE_LOCK_FILE_NAMES = new Set([
    "package-lock.json",
    "npm-shrinkwrap.json"
]);
const PACKAGE_DEPENDENCY_SECTIONS = [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies"
];
const LOCK_DEPENDENCY_SECTIONS = [
    ...PACKAGE_DEPENDENCY_SECTIONS,
    "requires"
];
const PACKAGE_SCAN_IGNORED_DIRECTORIES = new Set([
    ".git",
    "node_modules"
]);
const WALK_IGNORED_DIRECTORIES = new Set([
    ".git",
    "node_modules"
]);
const DEFAULT_PACKAGE_METADATA_SCAN_PATHS = [
    "package.json",
    "package-lock.json",
    "npm-shrinkwrap.json",
    "src",
    "src-mdviewer",
    "src-node",
    "build",
    "gulpfile.js",
    "phoenix-builder-mcp"
];
const RELEASE_PACKAGE_METADATA_SCAN_PATHS = [
    ...DEFAULT_PACKAGE_METADATA_SCAN_PATHS,
    "dist",
    "dist-test"
];
const CODE_FILE_EXTENSIONS = new Set([
    ".cjs",
    ".css",
    ".htm",
    ".html",
    ".js",
    ".jsx",
    ".less",
    ".mjs",
    ".scss",
    ".ts",
    ".tsx"
]);
const DEFAULT_CODE_SCAN_PATHS = [
    "src",
    "src-mdviewer/src",
    "src-node",
    "build",
    "gulpfile.js",
    "phoenix-builder-mcp"
];
const RELEASE_CODE_SCAN_PATHS = [
    ...DEFAULT_CODE_SCAN_PATHS,
    "dist",
    "dist-test"
];
const DEFAULT_ARTIFACT_SCAN_PATHS = [
    "src"
];
const RELEASE_ARTIFACT_SCAN_PATHS = [
    ...DEFAULT_ARTIFACT_SCAN_PATHS,
    "dist",
    "dist-test"
];
const DEFAULT_INSTALLED_PACKAGE_SCAN_PATHS = [
    "node_modules",
    "src",
    "src-mdviewer",
    "src-node",
    "phoenix-builder-mcp"
];
const RELEASE_INSTALLED_PACKAGE_SCAN_PATHS = [
    ...DEFAULT_INSTALLED_PACKAGE_SCAN_PATHS,
    "dist",
    "dist-test"
];
const HTML_FILE_EXTENSIONS = new Set([
    ".htm",
    ".html"
]);
const LOCKED_CODEMIRROR5_PATH_PATTERN = /(?:^|\/)node_modules\/codemirror$/;
const CODEMIRROR5_ALIAS_PATTERN = /^npm:codemirror(?:@|$)/i;
const LEGACY_VENDOR_PATH_PATTERN =
    /(?:^|\/)thirdparty\/CodeMirror(?:2)?(?:\/|$)/i;
const LEGACY_LICENSE_PATH_PATTERN =
    /(?:^|\/)thirdparty\/licences\/codemirror\.markdown$/i;
const CODEMIRROR5_DERIVED_LICENSE_RELATIVE_PATH =
    "thirdparty/licences/codemirror5-derived.markdown";
const CODEMIRROR5_DERIVED_LICENSE_BANNER_REFERENCE =
    "thirdparty/licences/codemirror5-derived.markdown";
const CODEMIRROR_VIM_DERIVED_LICENSE_RELATIVE_PATH =
    "thirdparty/licences/codemirror-vim-derived.markdown";
const CODEMIRROR6_BUNDLE_RELATIVE_PATH =
    "thirdparty/CodeMirror6/codemirror6.js";
const CODEMIRROR6_LICENSE_RELATIVE_PATH =
    "thirdparty/licences/codemirror6.markdown";
const CODEMIRROR6_LICENSE_BANNER_REFERENCE =
    "Third-party license notices: thirdparty/licences/codemirror6.markdown.";
const CODEMIRROR5_DERIVED_LICENSE_REQUIRED_FILES = [
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
    "languageFold.js"
];
const CODEMIRROR5_DERIVED_SOURCE_RELATIVE_PATHS = [
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
const CODEMIRROR6_COMPATIBILITY_RUNTIME_RELATIVE_PATHS = [
    "brackets.js",
    "editor/CodeMirror6Adapter.js",
    "editor/CodeMirrorCompat.js",
    "editor/CodeMirrorLegacyAddons.js",
    "editor/CodeMirrorLegacyExtendedAddons.js",
    "editor/CodeMirrorLegacyFileSystem.js",
    "editor/CodeMirrorLegacyModeMeta.js",
    "editor/CodeMirrorLegacyModesCompat.js",
    "editor/CodeMirrorLegacyModuleLoader.js",
    "editor/CodeMirrorLegacyRSTSlimCompat.js",
    "editor/CodeMirrorLegacyText.js",
    "editor/CodeMirrorSublimeCompat.js",
    "editor/CodeMirrorTwigCompat.js",
    "editor/CodeMirrorVimCompat.js",
    "editor/Editor.js",
    "extensions/default/CodeFolding/foldhelpers/foldcode.js",
    "extensions/default/CodeFolding/foldhelpers/foldgutter.js",
    "extensions/default/CodeFolding/foldhelpers/languageFold.js",
    "main.js",
    "styles/brackets_codemirror6.less",
    "styles/brackets_codemirror6_legacy_themes.less",
    "styles/brackets_shared.less",
    "thirdparty/CodeMirror6/codemirror6.js",
    "utils/ExtensionLoader.js",
    "utils/Global.js"
];
const CODEMIRROR6_COMPATIBILITY_RUNTIME_SIGNATURES = {
    "brackets.js": [
        {
            label: "CodeMirrorCompat dependency",
            expression: /["']editor\/CodeMirrorCompat["']/
        }
    ],
    "editor/CodeMirror6Adapter.js": [
        {
            label: "CodeMirror 6 bundle dependency",
            expression: /["']thirdparty\/CodeMirror6\/codemirror6["']/
        }
    ],
    "editor/CodeMirrorCompat.js": [
        {
            label: "CodeMirror 6 bundle dependency",
            expression: /["']thirdparty\/CodeMirror6\/codemirror6["']/
        },
        {
            label: "legacy mode metadata dependency",
            expression: /["']editor\/CodeMirrorLegacyModeMeta["']/
        },
        {
            label: "legacy mode compatibility dependency",
            expression: /["']editor\/CodeMirrorLegacyModesCompat["']/
        }
    ],
    "editor/CodeMirrorLegacyExtendedAddons.js": [
        {
            label: "extended addon registry",
            expression: /["']addon\/mode\/loadmode["']/
        }
    ],
    "editor/CodeMirrorLegacyFileSystem.js": [
        {
            label: "legacy module-loader dependency",
            expression: /["']editor\/CodeMirrorLegacyModuleLoader["']/
        },
        {
            label: "legacy text compatibility dependency",
            expression: /["']text["']/
        },
        {
            label: "legacy filesystem installation marker",
            expression: /["']__phoenixCodeMirrorLegacyFileSystem["']/
        }
    ],
    "editor/CodeMirrorLegacyModesCompat.js": [
        {
            label: "RST and Slim compatibility dependency",
            expression: /["']editor\/CodeMirrorLegacyRSTSlimCompat["']/
        }
    ],
    "editor/CodeMirrorLegacyModuleLoader.js": [
        {
            label: "extended addon compatibility dependency",
            expression: /["']editor\/CodeMirrorLegacyExtendedAddons["']/
        },
        {
            label: "legacy mode metadata module mapping",
            expression: /["']mode\/meta["']/
        },
        {
            label: "extended addon module routing",
            expression: /["']extended-addon["']/
        }
    ],
    "editor/CodeMirrorLegacyText.js": [
        {
            label: "base RequireJS text-plugin dependency",
            expression: /["']text-base["']/
        }
    ],
    "editor/CodeMirrorVimCompat.js": [
        {
            label: "CodeMirror 6 bundle dependency",
            expression: /["']thirdparty\/CodeMirror6\/codemirror6["']/
        }
    ],
    "editor/Editor.js": [
        {
            label: "CodeMirror6Adapter dependency",
            expression: /["']editor\/CodeMirror6Adapter["']/
        }
    ],
    "main.js": [
        {
            label: "legacy text-plugin mapping",
            expression:
                /(?:["']text["']|\btext)\s*:\s*["']editor\/CodeMirrorLegacyText["']/
        },
        {
            label: "historical CodeMirror core mapping",
            expression:
                /["']thirdparty\/CodeMirror\/lib\/codemirror["']\s*:\s*["']editor\/CodeMirrorCompat["']/
        },
        {
            label: "historical CodeMirror2 core mapping",
            expression:
                /["']thirdparty\/CodeMirror2\/lib\/codemirror["']\s*:\s*["']editor\/CodeMirrorCompat["']/
        }
    ],
    "styles/brackets_codemirror6.less": [
        {
            label: "CodeMirror 6 compatibility root styles",
            expression: /\.CodeMirror\.phoenix-codemirror-6/
        }
    ],
    "styles/brackets_codemirror6_legacy_themes.less": [
        {
            label: "legacy theme styles scoped to the CodeMirror 6 root",
            expression:
                /\.CodeMirror\.phoenix-codemirror-6\.cm-s-[a-z0-9-]+/
        }
    ],
    "styles/brackets_shared.less": [
        {
            label: "CodeMirror 6 stylesheet import",
            expression: /brackets_codemirror6\.less/
        },
        {
            label: "legacy theme stylesheet import",
            expression: /brackets_codemirror6_legacy_themes\.less/
        }
    ],
    "thirdparty/CodeMirror6/codemirror6.js": [
        {
            label: "named CodeMirror 6 AMD module",
            expression:
                /define\s*\(\s*["']thirdparty\/CodeMirror6\/codemirror6["']/
        }
    ],
    "utils/ExtensionLoader.js": [
        {
            label: "legacy filesystem compatibility dependency",
            expression: /["']editor\/CodeMirrorLegacyFileSystem["']/
        },
        {
            label: "legacy filesystem compatibility installation",
            expression:
                /CodeMirrorLegacyFileSystem\s*\.\s*install\s*\(\s*\)/
        }
    ],
    "utils/Global.js": [
        {
            label: "legacy module-loader dependency",
            expression: /["']editor\/CodeMirrorLegacyModuleLoader["']/
        },
        {
            label: "legacy module resolution",
            expression:
                /CodeMirrorLegacyModuleLoader\s*\.\s*resolveLegacyModule\s*\(/
        }
    ]
};
const CODEMIRROR_VIM_DERIVED_LICENSE_REQUIRED_FILES = [
    "CodeMirrorVimCompat.js"
];
const CODEMIRROR5_MIT_LICENSE_TEXT = [
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
    'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR',
    "IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,",
    "FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE",
    "AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER",
    "LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,",
    "OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN",
    "THE SOFTWARE."
].join("\n");
const CODEMIRROR_VIM_MIT_LICENSE_TEXT = [
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
const HTML_ASSET_TAG_PATTERN =
    /<(?:script|link)\b[^>]*?\b(?:src|href)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>/gi;
const CODEMIRROR5_RUNTIME_VERSION_PATTERN =
    /\bCodeMirror(?:\.version|\[\s*["']version["']\s*\])\s*=\s*["']5(?:\.\d+){1,2}(?:[-+][^"']*)?["']/g;
const CODEMIRROR5_RELATIVE_CORE_PATTERN =
    /(["'])(?:\.\.\/)+(?:lib\/)?codemirror(?:\.js)?\1/g;
const CODEMIRROR5_CORE_CSS_FILE_PATTERN = /^codemirror(?:\.min)?\.css$/i;
const CODEMIRROR5_CORE_CSS_SIGNATURES = [
    ".CodeMirror-scroll",
    ".CodeMirror-sizer",
    ".CodeMirror-gutters",
    ".CodeMirror-cursor"
];
const DIRECT_PACKAGE_IMPORT_PATTERNS = [
    {
        label: "CommonJS require",
        expression: /\brequire(?:\.resolve)?\s*\(\s*(["'])codemirror(?:\/[^"']*)?\1\s*\)/g
    },
    {
        label: "dynamic import",
        expression: /\bimport\s*\(\s*(["'])codemirror(?:\/[^"']*)?\1\s*\)/g
    },
    {
        label: "static import/export",
        expression:
            /(?<!@)\b(?:import|export)\s+(?:[^;]*?\s+from\s+)?(["'])codemirror(?:\/[^"']*)?\1/g
    },
    {
        label: "AMD dependency",
        expression:
            /\b(?:define|require)\s*\(\s*\[[^\]]*(["'])(?:[\w-]+!)?codemirror(?:\/[^"']*)?\1/g
    },
    {
        label: "stylesheet import",
        expression:
            /@import\s+(?:\([^)]*\)\s*)?(?:url\(\s*)?(["'])codemirror(?:\/[^"']*)?\1\s*\)?/g
    }
];

function normalizePath(filePath) {
    return filePath.replaceAll("\\", "/");
}

function normalizeWhitespace(content) {
    return content.replace(/\s+/g, " ").trim();
}

function getTraversableStat(absolutePath) {
    if (!fs.existsSync(absolutePath)) {
        return null;
    }

    const stat = fs.lstatSync(absolutePath);
    if (!stat.isSymbolicLink()) {
        return stat;
    }

    try {
        const targetStat = fs.statSync(absolutePath);
        return targetStat.isDirectory() ? targetStat : stat;
    } catch {
        return stat;
    }
}

function markDirectoryVisited(absolutePath, visitedDirectories) {
    const realDirectoryPath = fs.realpathSync(absolutePath);
    if (visitedDirectories.has(realDirectoryPath)) {
        return false;
    }

    visitedDirectories.add(realDirectoryPath);
    return true;
}

function addReleaseScanPaths(options) {
    if (!options.requireReleaseLicenseCopies) {
        return options;
    }

    return {
        ...options,
        packageMetadataScanPaths:
            options.packageMetadataScanPaths ||
            RELEASE_PACKAGE_METADATA_SCAN_PATHS,
        codeScanPaths:
            options.codeScanPaths ||
            RELEASE_CODE_SCAN_PATHS,
        artifactScanPaths:
            options.artifactScanPaths ||
            RELEASE_ARTIFACT_SCAN_PATHS,
        installedPackageScanPaths:
            options.installedPackageScanPaths ||
            RELEASE_INSTALLED_PACKAGE_SCAN_PATHS
    };
}

function collectPackageMetadataFiles(
    repositoryRoot,
    absolutePath,
    findings,
    visitedDirectories
) {
    const stat = getTraversableStat(absolutePath);
    if (!stat) {
        return;
    }

    if (stat.isFile()) {
        if (PACKAGE_METADATA_FILE_NAMES.has(path.basename(absolutePath))) {
            findings.add(normalizePath(path.relative(repositoryRoot, absolutePath)));
        }
        return;
    }
    if (!stat.isDirectory() ||
            !markDirectoryVisited(absolutePath, visitedDirectories)) {
        return;
    }

    const entries = fs.readdirSync(absolutePath, { withFileTypes: true })
        .sort((first, second) => first.name.localeCompare(second.name));
    for (const entry of entries) {
        if (PACKAGE_SCAN_IGNORED_DIRECTORIES.has(entry.name)) {
            continue;
        }
        collectPackageMetadataFiles(
            repositoryRoot,
            path.join(absolutePath, entry.name),
            findings,
            visitedDirectories
        );
    }
}

function listPackageMetadataFilesFromFilesystem(
    repositoryRoot,
    scanPaths = DEFAULT_PACKAGE_METADATA_SCAN_PATHS
) {
    const findings = new Set();
    const visitedDirectories = new Set();

    scanPaths.forEach(relativePath => {
        collectPackageMetadataFiles(
            repositoryRoot,
            path.resolve(repositoryRoot, relativePath),
            findings,
            visitedDirectories
        );
    });

    return [...findings].sort();
}

function listTrackedPackageMetadataFiles(repositoryRoot) {
    try {
        const gitRoot = execFileSync(
            "git",
            ["rev-parse", "--show-toplevel"],
            {
                cwd: repositoryRoot,
                encoding: "utf8",
                stdio: ["ignore", "pipe", "ignore"]
            }
        ).trim();
        if (fs.realpathSync(gitRoot) !== fs.realpathSync(repositoryRoot)) {
            return [];
        }

        return execFileSync("git", ["ls-files", "-z"], {
            cwd: repositoryRoot,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"]
        })
            .split("\0")
            .filter(Boolean)
            .filter(filePath => {
                return PACKAGE_METADATA_FILE_NAMES.has(path.basename(filePath));
            })
            .sort();
    } catch {
        return [];
    }
}

function listProjectPackageMetadataFiles(options = {}) {
    const repositoryRoot = path.resolve(options.repositoryRoot || ".");
    if (options.packageMetadataFiles) {
        return [...new Set(options.packageMetadataFiles.map(normalizePath))]
            .filter(relativePath => {
                return fs.existsSync(path.join(repositoryRoot, relativePath));
            })
            .sort();
    }

    const trackedFiles = options.trackedPackageMetadataFiles ||
        listTrackedPackageMetadataFiles(repositoryRoot);
    const filesystemFiles = listPackageMetadataFilesFromFilesystem(
        repositoryRoot,
        options.packageMetadataScanPaths ||
            DEFAULT_PACKAGE_METADATA_SCAN_PATHS
    );

    return [...new Set(trackedFiles.concat(filesystemFiles).map(normalizePath))]
        .filter(relativePath => {
            return fs.existsSync(path.join(repositoryRoot, relativePath));
        })
        .sort();
}

function findDependencies(dependencyContainer, dependencySections) {
    const findings = [];

    for (const section of dependencySections) {
        for (const [dependencyName, dependencySpecifier] of
            Object.entries(dependencyContainer?.[section] || {})) {
            if (dependencyName === "codemirror" ||
                    typeof dependencySpecifier === "string" &&
                    CODEMIRROR5_ALIAS_PATTERN.test(dependencySpecifier.trim())) {
                findings.push({
                    dependencyName,
                    section
                });
            }
        }
    }

    return findings;
}

function inspectLegacyLockDependencies(dependencies, location, findings) {
    if (!dependencies || typeof dependencies !== "object") {
        return;
    }

    if (Object.prototype.hasOwnProperty.call(dependencies, "codemirror")) {
        findings.add(`${location}.codemirror`);
    }

    for (const [dependencyName, dependencyDetails] of Object.entries(dependencies)) {
        if (!dependencyDetails || typeof dependencyDetails !== "object") {
            continue;
        }

        for (const dependency of findDependencies(
            dependencyDetails,
            LOCK_DEPENDENCY_SECTIONS
        )) {
            findings.add(
                `${location}.${dependencyName}.` +
                    `${dependency.section}.${dependency.dependencyName}`
            );
        }

        inspectLegacyLockDependencies(
            dependencyDetails.dependencies,
            `${location}.${dependencyName}.dependencies`,
            findings
        );
    }
}

function inspectPackageJSON(packageJSON, relativePath, findings) {
    for (const dependency of findDependencies(
        packageJSON,
        PACKAGE_DEPENDENCY_SECTIONS
    )) {
        findings.add(
            `${relativePath} ${dependency.section}.${dependency.dependencyName}`
        );
    }

    for (const section of ["bundleDependencies", "bundledDependencies"]) {
        if (Array.isArray(packageJSON[section]) &&
                packageJSON[section].includes("codemirror")) {
            findings.add(`${relativePath} ${section}`);
        }
    }
}

function inspectPackageLock(packageLock, relativePath, findings) {
    inspectLegacyLockDependencies(
        packageLock.dependencies,
        `${relativePath} dependencies`,
        findings
    );

    for (const [packagePath, packageDetails] of
        Object.entries(packageLock.packages || {})) {
        const normalizedPackagePath = normalizePath(packagePath);
        const isInstalledPackage =
            normalizedPackagePath.startsWith("node_modules/") ||
            normalizedPackagePath.includes("/node_modules/");
        if (LOCKED_CODEMIRROR5_PATH_PATTERN.test(normalizedPackagePath) ||
                isInstalledPackage && packageDetails?.name === "codemirror") {
            findings.add(
                `${relativePath} packages[${JSON.stringify(packagePath)}]`
            );
        }

        for (const dependency of findDependencies(
            packageDetails,
            LOCK_DEPENDENCY_SECTIONS
        )) {
            findings.add(
                `${relativePath} packages[${JSON.stringify(packagePath)}].` +
                    `${dependency.section}.${dependency.dependencyName}`
            );
        }
    }
}

function findCodeMirror5DependencyViolations(options = {}) {
    const repositoryRoot = path.resolve(options.repositoryRoot || ".");
    const packageMetadataFiles = listProjectPackageMetadataFiles(options);
    const findings = new Set();

    for (const relativePath of packageMetadataFiles) {
        const absolutePath = path.join(repositoryRoot, relativePath);
        let packageMetadata;
        try {
            packageMetadata = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
        } catch (error) {
            throw new Error(
                `Unable to parse package metadata ${relativePath}: ` +
                    error.message
            );
        }

        if (PACKAGE_LOCK_FILE_NAMES.has(path.basename(relativePath))) {
            inspectPackageLock(packageMetadata, relativePath, findings);
        } else {
            inspectPackageJSON(packageMetadata, relativePath, findings);
        }
    }

    return [...findings].sort();
}

function walkPath(absolutePath, visitor, visitedDirectories) {
    const stat = getTraversableStat(absolutePath);
    if (!stat) {
        return;
    }

    const shouldDescend = visitor(absolutePath, stat);
    if (shouldDescend === false ||
            !stat.isDirectory()) {
        return;
    }
    if (!markDirectoryVisited(absolutePath, visitedDirectories)) {
        return;
    }

    const entries = fs.readdirSync(absolutePath, { withFileTypes: true })
        .sort((first, second) => first.name.localeCompare(second.name));
    for (const entry of entries) {
        if (WALK_IGNORED_DIRECTORIES.has(entry.name)) {
            if (entry.name === "node_modules") {
                const codeMirrorPackagePath = path.join(
                    absolutePath,
                    entry.name,
                    "codemirror"
                );
                const codeMirrorPackageStat =
                    getTraversableStat(codeMirrorPackagePath);
                if (codeMirrorPackageStat) {
                    visitor(
                        codeMirrorPackagePath,
                        codeMirrorPackageStat
                    );
                }
            }
            continue;
        }
        walkPath(
            path.join(absolutePath, entry.name),
            visitor,
            visitedDirectories
        );
    }
}

function findCodeMirror5ArtifactViolations(options = {}) {
    const repositoryRoot = path.resolve(options.repositoryRoot || ".");
    const artifactScanPaths = options.artifactScanPaths ||
        DEFAULT_ARTIFACT_SCAN_PATHS;
    const findings = new Set();
    const visitedDirectories = new Set();

    for (const relativeRoot of artifactScanPaths) {
        const absoluteRoot = path.resolve(repositoryRoot, relativeRoot);
        walkPath(absoluteRoot, function (absolutePath) {
            const relativePath = normalizePath(
                path.relative(repositoryRoot, absolutePath)
            );
            if (LEGACY_VENDOR_PATH_PATTERN.test(relativePath) ||
                    LEGACY_LICENSE_PATH_PATTERN.test(relativePath)) {
                findings.add(relativePath);
                return false;
            }
        }, visitedDirectories);
    }

    return [...findings].sort();
}

function findCodeMirror5LicenseNoticeViolations(options = {}) {
    const repositoryRoot = path.resolve(options.repositoryRoot || ".");
    const requiredPaths = [
        path.join("src", CODEMIRROR5_DERIVED_LICENSE_RELATIVE_PATH)
    ];
    const releaseRoots = [
        {
            directory: "dist",
            noticePath: path.join(
                "dist",
                CODEMIRROR5_DERIVED_LICENSE_RELATIVE_PATH
            )
        },
        {
            directory: "dist-test",
            noticePath: path.join(
                "dist-test",
                "src",
                CODEMIRROR5_DERIVED_LICENSE_RELATIVE_PATH
            )
        }
    ];

    if (options.requireReleaseLicenseCopies) {
        releaseRoots.forEach(function (releaseRoot) {
            requiredPaths.push(releaseRoot.noticePath);
        });
    }

    const findings = [];
    requiredPaths.forEach(function (relativePath) {
        const absolutePath = path.join(repositoryRoot, relativePath);
        if (!fs.existsSync(absolutePath)) {
            findings.push(`${normalizePath(relativePath)} (missing)`);
            return;
        }

        const content = fs.readFileSync(absolutePath, "utf8");
        const missingFileReferences =
            CODEMIRROR5_DERIVED_LICENSE_REQUIRED_FILES.filter(
                function (fileName) {
                    return !content.includes(fileName);
                }
            );
        const hasCompleteLicense = normalizeWhitespace(content).includes(
            normalizeWhitespace(CODEMIRROR5_MIT_LICENSE_TEXT)
        );
        if (missingFileReferences.length || !hasCompleteLicense) {
            findings.push(
                `${normalizePath(relativePath)} ` +
                    `(incomplete CodeMirror 5 MIT notice)`
            );
        }
    });

    const codeRoots = ["src"];
    if (options.requireReleaseLicenseCopies) {
        codeRoots.push("dist", path.join("dist-test", "src"));
    }
    codeRoots.forEach(function (codeRoot) {
        CODEMIRROR5_DERIVED_SOURCE_RELATIVE_PATHS.forEach(
            function (sourceRelativePath) {
                const relativePath = path.join(codeRoot, sourceRelativePath);
                const absolutePath = path.join(repositoryRoot, relativePath);
                if (!fs.existsSync(absolutePath)) {
                    findings.push(
                        `${normalizePath(relativePath)} ` +
                            "(missing CodeMirror 5-derived source)"
                    );
                    return;
                }

                const content = fs.readFileSync(absolutePath, "utf8");
                const hasPreservedBanner = content.includes("DONT_STRIP_MINIFY");
                const hasLicenseReference =
                    content.includes(CODEMIRROR5_DERIVED_LICENSE_BANNER_REFERENCE) ||
                    normalizeWhitespace(content).includes(
                        normalizeWhitespace(CODEMIRROR5_MIT_LICENSE_TEXT)
                    );
                if (!hasPreservedBanner || !hasLicenseReference) {
                    findings.push(
                        `${normalizePath(relativePath)} ` +
                            "(missing preserved CodeMirror 5-derived notice)"
                    );
                }
            }
        );
    });

    return findings.sort();
}

function findCodeMirrorVimLicenseNoticeViolations(options = {}) {
    const repositoryRoot = path.resolve(options.repositoryRoot || ".");
    const requiredPaths = [
        path.join("src", CODEMIRROR_VIM_DERIVED_LICENSE_RELATIVE_PATH)
    ];
    const releaseRoots = [
        path.join("dist", CODEMIRROR_VIM_DERIVED_LICENSE_RELATIVE_PATH),
        path.join(
            "dist-test",
            "src",
            CODEMIRROR_VIM_DERIVED_LICENSE_RELATIVE_PATH
        )
    ];

    if (options.requireReleaseLicenseCopies) {
        requiredPaths.push(...releaseRoots);
    }

    const findings = [];
    requiredPaths.forEach(function (relativePath) {
        const absolutePath = path.join(repositoryRoot, relativePath);
        if (!fs.existsSync(absolutePath)) {
            findings.push(`${normalizePath(relativePath)} (missing)`);
            return;
        }

        const content = fs.readFileSync(absolutePath, "utf8");
        const missingFileReferences =
            CODEMIRROR_VIM_DERIVED_LICENSE_REQUIRED_FILES.filter(
                function (fileName) {
                    return !content.includes(fileName);
                }
            );
        const hasCompleteLicense = normalizeWhitespace(content).includes(
            normalizeWhitespace(CODEMIRROR_VIM_MIT_LICENSE_TEXT)
        );
        if (missingFileReferences.length || !hasCompleteLicense) {
            findings.push(
                `${normalizePath(relativePath)} ` +
                    "(incomplete @replit CodeMirror Vim MIT notice)"
            );
        }
    });

    return findings.sort();
}

function findCodeMirror6ReleaseLicenseViolations(options = {}) {
    if (!options.requireReleaseLicenseCopies) {
        return [];
    }

    const repositoryRoot = path.resolve(options.repositoryRoot || ".");
    const sourceLicensePath = path.join(
        repositoryRoot,
        "src",
        CODEMIRROR6_LICENSE_RELATIVE_PATH
    );
    const findings = [];
    let sourceLicenseContent;

    if (!fs.existsSync(sourceLicensePath)) {
        findings.push(
            `src/${CODEMIRROR6_LICENSE_RELATIVE_PATH} (missing)`
        );
    } else {
        sourceLicenseContent = fs.readFileSync(sourceLicensePath, "utf8");
    }

    const releaseRoots = [
        "dist",
        path.join("dist-test", "src")
    ];
    releaseRoots.forEach(function (releaseRoot) {
        const bundleRelativePath = path.join(
            releaseRoot,
            CODEMIRROR6_BUNDLE_RELATIVE_PATH
        );
        const bundlePath = path.join(repositoryRoot, bundleRelativePath);
        if (!fs.existsSync(bundlePath)) {
            findings.push(`${normalizePath(bundleRelativePath)} (missing)`);
        } else if (!fs.readFileSync(bundlePath, "utf8").includes(
            CODEMIRROR6_LICENSE_BANNER_REFERENCE
        )) {
            findings.push(
                `${normalizePath(bundleRelativePath)} ` +
                    "(missing CodeMirror 6 license notice reference)"
            );
        }

        const licenseRelativePath = path.join(
            releaseRoot,
            CODEMIRROR6_LICENSE_RELATIVE_PATH
        );
        const licensePath = path.join(repositoryRoot, licenseRelativePath);
        if (!fs.existsSync(licensePath)) {
            findings.push(`${normalizePath(licenseRelativePath)} (missing)`);
        } else if (sourceLicenseContent !== undefined &&
                fs.readFileSync(licensePath, "utf8") !== sourceLicenseContent) {
            findings.push(
                `${normalizePath(licenseRelativePath)} ` +
                    "(does not match generated source notice)"
            );
        }
    });

    return findings.sort();
}

function findCodeMirror6RuntimeArtifactViolations(options = {}) {
    if (!options.requireReleaseLicenseCopies) {
        return [];
    }

    const repositoryRoot = path.resolve(options.repositoryRoot || ".");
    const releaseRoots = [
        "dist",
        path.join("dist-test", "src")
    ];
    const findings = [];

    releaseRoots.forEach(function (releaseRoot) {
        CODEMIRROR6_COMPATIBILITY_RUNTIME_RELATIVE_PATHS.forEach(
            function (runtimeRelativePath) {
                const relativePath = path.join(
                    releaseRoot,
                    runtimeRelativePath
                );
                const absolutePath = path.join(repositoryRoot, relativePath);
                if (!fs.existsSync(absolutePath) ||
                        !fs.statSync(absolutePath).isFile()) {
                    findings.push(
                        `${normalizePath(relativePath)} ` +
                            "(missing required CM6 compatibility runtime artifact)"
                    );
                    return;
                }

                const content = fs.readFileSync(absolutePath, "utf8");
                if (!content.trim()) {
                    findings.push(
                        `${normalizePath(relativePath)} ` +
                            "(empty CM6 compatibility runtime artifact)"
                    );
                    return;
                }

                const signatures =
                    CODEMIRROR6_COMPATIBILITY_RUNTIME_SIGNATURES[
                        runtimeRelativePath
                    ] || [];
                signatures.forEach(function (signature) {
                    if (!signature.expression.test(content)) {
                        findings.push(
                            `${normalizePath(relativePath)} ` +
                                `(missing ${signature.label})`
                        );
                    }
                });
            }
        );
    });

    return findings.sort();
}

function lineNumberAt(content, index) {
    return content.slice(0, index).split("\n").length;
}

function visitScannableFiles(repositoryRoot, scanPaths, visitor) {
    const visitedDirectories = new Set();

    for (const relativeRoot of scanPaths) {
        const absoluteRoot = path.resolve(repositoryRoot, relativeRoot);
        walkPath(absoluteRoot, function (absolutePath, stat) {
            if (!stat.isFile() ||
                    !CODE_FILE_EXTENSIONS.has(path.extname(absolutePath))) {
                return;
            }
            visitor(
                absolutePath,
                normalizePath(path.relative(repositoryRoot, absolutePath))
            );
        }, visitedDirectories);
    }
}

function findCodeMirror5DirectImportViolations(options = {}) {
    const repositoryRoot = path.resolve(options.repositoryRoot || ".");
    const codeScanPaths = options.codeScanPaths || DEFAULT_CODE_SCAN_PATHS;
    const findings = new Set();

    visitScannableFiles(
        repositoryRoot,
        codeScanPaths,
        function (absolutePath, relativePath) {
            const content = fs.readFileSync(absolutePath, "utf8");
            for (const pattern of DIRECT_PACKAGE_IMPORT_PATTERNS) {
                pattern.expression.lastIndex = 0;
                let match;
                while ((match = pattern.expression.exec(content))) {
                    findings.add(
                        `${relativePath}:${lineNumberAt(content, match.index)} ` +
                            pattern.label
                    );
                }
            }
        }
    );

    return [...findings].sort();
}

function normalizeAssetReference(reference) {
    let normalizedReference = String(reference || "")
        .replaceAll("\\", "/")
        .split(/[?#]/, 1)[0];
    try {
        normalizedReference = decodeURIComponent(normalizedReference);
    } catch {
        // A malformed URL is not evidence of a CodeMirror dependency.
    }
    return normalizedReference.toLowerCase();
}

function isCodeMirror5AssetReference(reference) {
    const normalizedReference = normalizeAssetReference(reference);
    return /(?:^|\/)thirdparty\/codemirror(?:2)?(?:\/|$)/.test(normalizedReference) ||
        /(?:^|\/)codemirror@5(?:\.\d+){0,2}(?:\/|$)/.test(normalizedReference) ||
        /(?:^|\/)codemirror\/5(?:\.\d+){0,2}(?:\/|$)/.test(normalizedReference) ||
        /(?:^|\/)(?:node_modules\/)?codemirror\/(?:lib|addon|mode|theme|keymap)\//.test(
            normalizedReference
        );
}

function findCodeMirror5HTMLAssetViolations(options = {}) {
    const repositoryRoot = path.resolve(options.repositoryRoot || ".");
    const codeScanPaths = options.codeScanPaths || DEFAULT_CODE_SCAN_PATHS;
    const findings = new Set();

    visitScannableFiles(
        repositoryRoot,
        codeScanPaths,
        function (absolutePath, relativePath) {
            if (!HTML_FILE_EXTENSIONS.has(path.extname(absolutePath))) {
                return;
            }

            const content = fs.readFileSync(absolutePath, "utf8");
            HTML_ASSET_TAG_PATTERN.lastIndex = 0;
            let match;
            while ((match = HTML_ASSET_TAG_PATTERN.exec(content))) {
                const assetReference = match[1] || match[2] || match[3];
                if (isCodeMirror5AssetReference(assetReference)) {
                    findings.add(
                        `${relativePath}:${lineNumberAt(content, match.index)} ` +
                            assetReference
                    );
                }
            }
        }
    );

    return [...findings].sort();
}

function findCodeMirror5ImplementationViolations(options = {}) {
    const repositoryRoot = path.resolve(options.repositoryRoot || ".");
    const codeScanPaths = options.codeScanPaths || DEFAULT_CODE_SCAN_PATHS;
    const findings = new Set();

    visitScannableFiles(
        repositoryRoot,
        codeScanPaths,
        function (absolutePath, relativePath) {
            const content = fs.readFileSync(absolutePath, "utf8");
            const signatures = [
                {
                    label: "CM5 runtime version assignment",
                    expression: CODEMIRROR5_RUNTIME_VERSION_PATTERN
                },
                {
                    label: "CM5 relative core dependency",
                    expression: CODEMIRROR5_RELATIVE_CORE_PATTERN
                }
            ];

            signatures.forEach(signature => {
                signature.expression.lastIndex = 0;
                let match;
                while ((match = signature.expression.exec(content))) {
                    findings.add(
                        `${relativePath}:${lineNumberAt(content, match.index)} ` +
                            signature.label
                    );
                }
            });

            if (CODEMIRROR5_CORE_CSS_FILE_PATTERN.test(
                path.basename(absolutePath)
            ) && CODEMIRROR5_CORE_CSS_SIGNATURES.every(signature => {
                return content.includes(signature);
            })) {
                findings.add(`${relativePath}:1 CM5 core stylesheet signature`);
            }
        }
    );

    return [...findings].sort();
}

function isCodeMirror5InstalledPackage(packageMetadata, packageDirectory) {
    if (packageMetadata?.name !== "codemirror") {
        return path.basename(packageDirectory) === "codemirror" &&
            !packageMetadata?.name;
    }

    const version = String(packageMetadata.version || "");
    const majorVersionMatch = /^v?(\d+)(?:\.|$)/.exec(version);
    return !majorVersionMatch || Number(majorVersionMatch[1]) === 5;
}

function inspectInstalledPackage(
    repositoryRoot,
    packageDirectory,
    findings,
    seenNodeModules
) {
    const packageJSONPath = path.join(packageDirectory, "package.json");
    let packageMetadata;
    if (fs.existsSync(packageJSONPath)) {
        try {
            packageMetadata = JSON.parse(fs.readFileSync(packageJSONPath, "utf8"));
        } catch (error) {
            if (path.basename(packageDirectory) === "codemirror") {
                findings.add(
                    `${normalizePath(path.relative(repositoryRoot, packageDirectory))} ` +
                        `(unreadable package.json: ${error.message})`
                );
            }
        }
    }

    if (isCodeMirror5InstalledPackage(packageMetadata, packageDirectory)) {
        const version = packageMetadata?.version || "unknown";
        findings.add(
            `${normalizePath(path.relative(repositoryRoot, packageDirectory))} ` +
                `(name=codemirror, version=${version})`
        );
    }

    inspectNodeModulesDirectory(
        repositoryRoot,
        path.join(packageDirectory, "node_modules"),
        findings,
        seenNodeModules
    );
}

function inspectNodeModulesDirectory(
    repositoryRoot,
    nodeModulesDirectory,
    findings,
    seenNodeModules
) {
    if (!fs.existsSync(nodeModulesDirectory)) {
        return;
    }

    const realNodeModulesDirectory = fs.realpathSync(nodeModulesDirectory);
    if (seenNodeModules.has(realNodeModulesDirectory)) {
        return;
    }
    seenNodeModules.add(realNodeModulesDirectory);

    for (const entry of fs.readdirSync(nodeModulesDirectory, {
        withFileTypes: true
    })) {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) {
            continue;
        }

        const packageDirectory = path.join(nodeModulesDirectory, entry.name);
        if (entry.name === ".pnpm") {
            for (const storeEntry of fs.readdirSync(packageDirectory, {
                withFileTypes: true
            })) {
                if (storeEntry.isDirectory()) {
                    inspectNodeModulesDirectory(
                        repositoryRoot,
                        path.join(
                            packageDirectory,
                            storeEntry.name,
                            "node_modules"
                        ),
                        findings,
                        seenNodeModules
                    );
                }
            }
            continue;
        }
        if (entry.name.startsWith(".")) {
            continue;
        }
        if (entry.name.startsWith("@")) {
            for (const scopedEntry of fs.readdirSync(packageDirectory, {
                withFileTypes: true
            })) {
                if (scopedEntry.isDirectory() || scopedEntry.isSymbolicLink()) {
                    inspectInstalledPackage(
                        repositoryRoot,
                        path.join(packageDirectory, scopedEntry.name),
                        findings,
                        seenNodeModules
                    );
                }
            }
            continue;
        }

        inspectInstalledPackage(
            repositoryRoot,
            packageDirectory,
            findings,
            seenNodeModules
        );
    }
}

function findNodeModulesDirectories(
    absolutePath,
    callback,
    visitedDirectories
) {
    const stat = getTraversableStat(absolutePath);
    if (!stat) {
        return;
    }

    if (!stat.isDirectory() ||
            path.basename(absolutePath) === "node_modules") {
        if (stat.isDirectory()) {
            callback(absolutePath);
        }
        return;
    }
    if (!markDirectoryVisited(absolutePath, visitedDirectories)) {
        return;
    }

    const entries = fs.readdirSync(absolutePath, { withFileTypes: true })
        .sort((first, second) => first.name.localeCompare(second.name));
    for (const entry of entries) {
        if (entry.name === ".git" ||
                !entry.isDirectory() && !entry.isSymbolicLink()) {
            continue;
        }
        findNodeModulesDirectories(
            path.join(absolutePath, entry.name),
            callback,
            visitedDirectories
        );
    }
}

function findInstalledCodeMirror5Violations(options = {}) {
    const repositoryRoot = path.resolve(options.repositoryRoot || ".");
    const installedPackageScanPaths = options.installedPackageScanPaths ||
        DEFAULT_INSTALLED_PACKAGE_SCAN_PATHS;
    const findings = new Set();
    const seenNodeModules = new Set();
    const visitedDirectories = new Set();

    installedPackageScanPaths.forEach(relativePath => {
        findNodeModulesDirectories(
            path.resolve(repositoryRoot, relativePath),
            nodeModulesDirectory => {
                inspectNodeModulesDirectory(
                    repositoryRoot,
                    nodeModulesDirectory,
                    findings,
                    seenNodeModules
                );
            },
            visitedDirectories
        );
    });

    return [...findings].sort();
}

function assertNoCodeMirror5Dependencies(options = {}) {
    const findings = findCodeMirror5DependencyViolations(options);
    if (findings.length) {
        throw new Error(
            'CodeMirror 5 dependency "codemirror" is not allowed in ' +
                "package metadata:\n" +
                findings.map(finding => `- ${finding}`).join("\n")
        );
    }
}

function assertNoCodeMirror5(options = {}) {
    const scanOptions = addReleaseScanPaths(options);
    const findings = [
        ...findCodeMirror5DependencyViolations(scanOptions).map(finding => {
            return `package metadata: ${finding}`;
        }),
        ...findInstalledCodeMirror5Violations(scanOptions).map(finding => {
            return `installed package: ${finding}`;
        }),
        ...findCodeMirror5ArtifactViolations(scanOptions).map(finding => {
            return `legacy artifact: ${finding}`;
        }),
        ...findCodeMirror5LicenseNoticeViolations(scanOptions).map(finding => {
            return `license notice: ${finding}`;
        }),
        ...findCodeMirrorVimLicenseNoticeViolations(scanOptions).map(finding => {
            return `Vim license notice: ${finding}`;
        }),
        ...findCodeMirror6ReleaseLicenseViolations(scanOptions).map(finding => {
            return `release license: ${finding}`;
        }),
        ...findCodeMirror6RuntimeArtifactViolations(scanOptions).map(finding => {
            return `CM6 release runtime: ${finding}`;
        }),
        ...findCodeMirror5DirectImportViolations(scanOptions).map(finding => {
            return `direct package import: ${finding}`;
        }),
        ...findCodeMirror5HTMLAssetViolations(scanOptions).map(finding => {
            return `legacy HTML asset: ${finding}`;
        }),
        ...findCodeMirror5ImplementationViolations(scanOptions).map(finding => {
            return `CM5 implementation signature: ${finding}`;
        })
    ];

    if (findings.length) {
        throw new Error(
            "CodeMirror 5 validation failed:\n" +
                findings.map(finding => `- ${finding}`).join("\n")
        );
    }
}

module.exports = {
    CODEMIRROR6_COMPATIBILITY_RUNTIME_RELATIVE_PATHS,
    assertNoCodeMirror5,
    assertNoCodeMirror5Dependencies,
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
    listProjectPackageMetadataFiles,
    listTrackedPackageMetadataFiles
};
