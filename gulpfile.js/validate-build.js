/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2022 - present core.ai . All rights reserved.
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

/* eslint-env node */

const fs = require('fs');
const glob = require('glob');

// Size limits for development builds (in MB)
const DEV_MAX_FILE_SIZE_MB = 6;
const DEV_MAX_TOTAL_SIZE_MB = 90;
// Custom size limits for known large files (size in MB) For development builds
const LARGE_FILE_LIST_DEV = {
    'dist/thirdparty/no-minify/language-worker.js.map': 10,
    'dist/brackets-min.js': 15
};

// Size limits for production/staging builds (in MB)
const PROD_MAX_FILE_SIZE_MB = 2;
const PROD_MAX_TOTAL_SIZE_MB = 70;
// Custom size limits for known large files (size in MB) For staging/production builds
const LARGE_FILE_LIST_PROD = {
    'dist/brackets.js': 9, // this is the full minified file itself renamed in prod
    'dist/phoenix/virtualfs.js.map': 3
};

function _listFilesInDir(dir) {
    return new Promise((resolve, reject)=>{
        glob(dir + '/**/*', {
            nodir: true
        }, (err, res)=>{
            if(err){
                reject(err);
                return;
            }
            resolve(res);
        });
    });
}

function _scanDistFiles(environment, largeFileList, maxFileSizeMB, maxTotalSizeMB) {
    return new Promise((resolve, reject) => {
        const maxTotalSizeBytes = maxTotalSizeMB * 1024 * 1024;

        _listFilesInDir('dist').then((files) => {
            const oversizedFiles = [];
            let totalSize = 0;

            for (let file of files) {
                const stats = fs.statSync(file);
                totalSize += stats.size;

                // Check if file has a custom size limit
                const customLimitMB = largeFileList[file];
                const fileLimitMB = customLimitMB !== undefined ? customLimitMB : maxFileSizeMB;
                const fileLimitBytes = fileLimitMB * 1024 * 1024;

                if (stats.size > fileLimitBytes) {
                    oversizedFiles.push({
                        path: file,
                        sizeMB: (stats.size / (1024 * 1024)).toFixed(2),
                        limitMB: fileLimitMB,
                        isCustomLimit: customLimitMB !== undefined
                    });
                }
            }

            const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);

            resolve({
                oversizedFiles,
                totalSizeMB,
                totalLimitMB: maxTotalSizeMB,
                hasTotalSizeExceeded: totalSize > maxTotalSizeBytes
            });
        }).catch(reject);
    });
}

function _displayValidationResults(scanResults, environment) {
    const {
        oversizedFiles,
        totalSizeMB,
        totalLimitMB,
        hasTotalSizeExceeded
    } = scanResults;

    if (oversizedFiles.length || hasTotalSizeExceeded) {
        console.error(`\n========================================`);
        console.error(`SIZE VALIDATION FAILED (${environment})`);
        console.error(`========================================`);

        if (hasTotalSizeExceeded) {
            console.error(`\nTotal dist folder size: ${totalSizeMB} MB ` +
                `(exceeds ${totalLimitMB} MB limit for ${environment})`);
        }

        if (oversizedFiles.length) {
            // Sort by size in descending order
            oversizedFiles.sort((a, b) => b.sizeBytes - a.sizeBytes);
            console.error(`\nFound ${oversizedFiles.length} file(s) exceeding size limits for ${environment}:\n`);

            for (let file of oversizedFiles) {
                const limitInfo = file.isCustomLimit ?
                    ` [custom limit: ${file.limitMB} MB]` : ` [limit: ${file.limitMB} MB]`;
                console.error(`  ${file.path} (${file.sizeMB} MB)${limitInfo}`);
            }
        }

        console.error(`\n========================================\n`);

        const errors = [];
        if (hasTotalSizeExceeded) {
            errors.push(`Total dist size ${totalSizeMB} MB exceeds ${totalLimitMB} MB limit`);
        }
        if (oversizedFiles.length) {
            errors.push(`${oversizedFiles.length} file(s) exceed size limit`);
        }

        return {
            passed: false,
            errorMessage: `Build validation failed for ${environment}: ${errors.join('; ')}`
        };
    }

    console.log(`Size validation passed for ${environment}: Total dist size is ${totalSizeMB} MB ` +
        `(under ${totalLimitMB} MB), all files under required limits.`);
    return {
        passed: true
    };
}

function validateDistSizeRestrictions() {
    return new Promise((resolve, reject) => {
        // Read config to determine environment
        let config;
        try {
            config = JSON.parse(fs.readFileSync('dist/config.json', 'utf8'));
        } catch (err) {
            reject(`Failed to read dist/config.json for size validation: ${err.message}`);
            return;
        }

        const environment = config.config?.environment || 'production';
        const isDev = environment === 'dev';

        // Set limits based on environment
        const MAX_FILE_SIZE_MB = isDev ? DEV_MAX_FILE_SIZE_MB : PROD_MAX_FILE_SIZE_MB;
        const MAX_TOTAL_SIZE_MB = isDev ? DEV_MAX_TOTAL_SIZE_MB : PROD_MAX_TOTAL_SIZE_MB;
        const LARGE_FILE_LIST = isDev ? LARGE_FILE_LIST_DEV : LARGE_FILE_LIST_PROD;

        console.log(`Validating dist size for ${environment} environment
         (File limit: ${MAX_FILE_SIZE_MB} MB, Total limit: ${MAX_TOTAL_SIZE_MB} MB)`);

        _scanDistFiles(environment, LARGE_FILE_LIST, MAX_FILE_SIZE_MB, MAX_TOTAL_SIZE_MB)
            .then((scanResults) => {
                const result = _displayValidationResults(scanResults, environment);

                if (result.passed) {
                    resolve();
                } else {
                    reject(result.errorMessage);
                }
            })
            .catch(reject);
    });
}

module.exports = {
    validateDistSizeRestrictions
};
